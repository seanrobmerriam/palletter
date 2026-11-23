<script lang="ts">
  import '../lib/client/icons';
  import { onMount, tick } from 'svelte';
  import {
    Accordion,
    Alert,
    Badge,
    Button,
    Card,
    CheckboxGroup,
    FormField,
    Input,
    InputNumber,
    RadioGroup,
    Select,
  } from 'sv5ui';
  import {
    errorFor,
    initialFormState,
    SCHEME_LABELS,
    STEPS,
    summaries,
    toPickerHex,
    validate,
    type FieldErrors,
    type FormState,
  } from '../lib/client/form';
  import { postForEvents } from '../lib/client/api';
  import type { GenerateEvent } from '../lib/palette/generate';
  import {
    COLOR_SYSTEMS,
    DEFAULT_NAMING_PATTERN,
    SCHEMES,
    type ColorSystem,
    type ModelPalette,
    type PaletteRequestInput,
    type Scheme,
    type TokenFormat,
  } from '../lib/prompt/schema';
  import PaletteResult from './PaletteResult.svelte';

  type Agent = { id: string; label: string; available: boolean; unavailableReason?: string };
  type Failure = { code: string; message: string; detail?: string };
  /** One palette on screen. Each keeps the agent session that made it, for refinements. */
  type Result = {
    scheme: Scheme;
    source: ModelPalette;
    sessionId: string | null;
    busy: boolean;
    status: string;
    error?: Failure;
    controller?: AbortController;
  };
  type SentRequest = PaletteRequestInput & { agent?: string };

  const id = $props.id();

  let form = $state<FormState>(initialFormState());
  let errors = $state<FieldErrors>({});
  /** Which collapsed steps are open. */
  let openSections = $state<string[]>([]);

  let agents = $state<Agent[]>([]);
  let agentId = $state('');
  let agentStatus = $state<{ state: 'loading' | 'checking' | 'ready' | 'error'; message?: string }>({ state: 'loading' });

  let running = $state(false);
  let status = $state('');
  let warnings = $state<string[]>([]);
  let results = $state<Result[]>([]);
  let failure = $state<Failure | null>(null);
  /** The request behind the results on screen. */
  let lastRequest: SentRequest | null = null;
  /** How results are shown. Changing these re-formats in the browser, without the agent. */
  let view = $state<{ format: TokenFormat; system: ColorSystem; namingPattern: string }>({
    format: 'css',
    system: 'oklch',
    namingPattern: DEFAULT_NAMING_PATTERN,
  });
  let hydrated = $state(false);
  let controller: AbortController | undefined;

  const summary = $derived(summaries(form));
  const selectedAgent = $derived(agents.find((a) => a.id === agentId));

  const SATURATION_OPTIONS = [
    ['', 'Let the agent decide'],
    ['vivid', 'Vivid: bold and energetic'],
    ['pure', 'Pure: as saturated as screens allow'],
    ['muted', 'Muted: calm and sophisticated'],
    ['pastel', 'Pastel: soft and light'],
    ['earthy', 'Earthy: natural and warm'],
    ['custom', 'Something else…'],
  ] as const;

  const SATURATION_ITEMS = SATURATION_OPTIONS.map(([value, label]) => ({ value: value || 'auto', label }));
  const TEMPERATURE_ITEMS = [
    { value: 'any', label: 'Any temperature' },
    { value: 'warm', label: 'Warm' },
    { value: 'cool', label: 'Cool' },
    { value: 'neutral', label: 'Neutral' },
  ];
  const STEP_ITEMS = STEPS.map((step) => ({ value: step, label: step }));
  const FORMAT_ITEMS = [
    { value: 'css', label: 'CSS custom properties' },
    { value: 'tailwind', label: 'Tailwind CSS v4 @theme' },
    { value: 'dtcg', label: 'Design Tokens JSON' },
  ];
  const VIEW_FORMAT_ITEMS = [
    { value: 'css', label: 'CSS custom properties' },
    { value: 'tailwind', label: 'Tailwind CSS v4' },
    { value: 'dtcg', label: 'Design Tokens JSON' },
  ];
  const SCALE_ITEMS = [
    { value: 'full', label: 'Full scale, 50–950' },
    { value: 'range', label: 'A range of steps' },
    { value: 'count', label: 'A number of steps' },
  ];
  const SYSTEM_ITEMS = COLOR_SYSTEMS.map((system) => ({ value: system, label: system }));
  const SCHEME_ITEMS = SCHEMES.map((scheme) => ({ value: scheme, label: SCHEME_LABELS[scheme] }));

  type Section = 'format' | 'scale' | 'saturation' | 'system' | 'roles' | 'schemes';
  const SECTIONS: { value: Section; label: string; number: number }[] = [
    { value: 'format', label: 'Token format', number: 2 },
    { value: 'scale', label: 'Scale', number: 3 },
    { value: 'saturation', label: 'Saturation', number: 4 },
    { value: 'system', label: 'Color system', number: 5 },
    { value: 'roles', label: 'Roles', number: 6 },
    { value: 'schemes', label: 'Schemes', number: 7 },
  ];

  const PATTERN_PRESETS = ['--color-[name]-[step]', '--brand-[color]-[step]', '--color-[mood]-[step]', '--color-[role]-[step]'];

  const agentItems = $derived(
    agents.map((a) => ({ value: a.id, label: a.label, disabled: !a.available, ...(a.unavailableReason ? { description: a.unavailableReason } : {}) })),
  );

  // Check the agent whenever a different one is chosen.
  let checkedAgent = '';
  $effect(() => {
    if (agentId && checkedAgent && agentId !== checkedAgent) {
      checkedAgent = agentId;
      checkAgent();
    }
  });

  onMount(() => {
    hydrated = true;
    loadAgents();
  });

  async function loadAgents() {
    try {
      const response = await fetch('/api/agent');
      const body = (await response.json()) as { defaultAgent: string; agents: Agent[] };
      agents = body.agents;
      agentId = body.defaultAgent;
      checkedAgent = agentId;
      await checkAgent();
    } catch {
      agentStatus = { state: 'error', message: 'Could not reach the Palletter server.' };
    }
  }

  async function checkAgent() {
    const checking = agentId;
    agentStatus = { state: 'checking', message: 'Connecting…' };
    try {
      const response = await fetch(`/api/agent?check=${encodeURIComponent(checking)}`);
      const body = (await response.json()) as { check: { ok: boolean; message?: string } };
      if (checking !== agentId) return;
      agentStatus = body.check.ok ? { state: 'ready', message: 'Ready' } : { state: 'error', message: body.check.message };
    } catch {
      if (checking === agentId) agentStatus = { state: 'error', message: 'Could not reach the Palletter server.' };
    }
  }

  function addHue() {
    form.hues.push({ text: '', picker: '#888888' });
    tick().then(() => document.getElementById(`${id}-hue-${form.hues.length - 1}`)?.focus());
  }

  function removeHue(index: number) {
    form.hues.splice(index, 1);
    tick().then(() => document.getElementById(`${id}-hue-${Math.max(0, index - 1)}`)?.focus());
  }

  function addRole(role = '') {
    form.roles.push({ role, temperature: '' });
    tick().then(() => document.getElementById(`${id}-role-${form.roles.length - 1}`)?.focus());
  }

  function useStandardRoles() {
    form.roles = [
      { role: 'primary', temperature: '' },
      { role: 'secondary', temperature: '' },
      { role: 'tertiary', temperature: '' },
    ];
  }

  /** Which collapsible section a field error belongs to. */
  function sectionFor(path: string): Section | undefined {
    if (path.startsWith('namingPattern') || path.startsWith('tokenFormat')) return 'format';
    if (path.startsWith('scale')) return 'scale';
    if (path.startsWith('saturation')) return 'saturation';
    if (path.startsWith('colorSystem')) return 'system';
    if (path.startsWith('roles')) return 'roles';
    if (path.startsWith('schemes')) return 'schemes';
    return undefined;
  }

  /**
   * SV5UI's CheckboxGroup doesn't pass FormField's error state to its checkboxes, as Input does.
   * Mark each scheme checkbox invalid and point it at the error, so the error is announced and the
   * first checkbox can take focus.
   */
  function markSchemes(error: string | undefined) {
    const errorId = `${id}-schemes-error`;
    for (const box of document.querySelectorAll<HTMLElement>(`#${CSS.escape(id)}-schemes-group [role="checkbox"]`)) {
      const describedBy = (box.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((t) => t && t !== errorId);
      if (error) {
        box.setAttribute('aria-invalid', 'true');
        describedBy.push(errorId);
      } else {
        box.removeAttribute('aria-invalid');
      }
      if (describedBy.length) box.setAttribute('aria-describedby', describedBy.join(' '));
      else box.removeAttribute('aria-describedby');
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (running) return;
    const result = validate(form);
    if (!result.ok) {
      errors = result.errors;
      for (const path of Object.keys(errors)) {
        const section = sectionFor(path);
        if (section && !openSections.includes(section)) openSections = [...openSections, section];
      }
      await tick();
      // Sections animate open; wait a frame so their controls can take focus.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      markSchemes(errors.schemes);
      document.querySelector<HTMLElement>(`#${CSS.escape(id)}-form [aria-invalid="true"]`)?.focus();
      return;
    }
    errors = {};
    markSchemes(undefined);
    await generate({ ...result.input, ...(agentId ? { agent: agentId } : {}) });
  }

  /** Apply one stream event to the results. `scheme` limits palette events to one card. */
  function applyEvent(event: GenerateEvent, onStatus: (message: string) => void, scheme?: Scheme) {
    if (event.type === 'status') onStatus(event.message);
    else if (event.type === 'warning') warnings.push(event.message);
    else if (event.type === 'palette') {
      if (scheme && event.source.scheme !== scheme) return;
      const existing = results.find((r) => r.scheme === event.source.scheme);
      if (existing) {
        existing.source = event.source;
        existing.error = undefined;
      } else {
        results.push({ scheme: event.source.scheme, source: event.source, sessionId: null, busy: false, status: '' });
      }
    } else if (event.type === 'session') {
      for (const r of results) if (!scheme || r.scheme === scheme) r.sessionId = event.id;
    }
  }

  /** Bumped on every new generation, so late events from older refinements are ignored. */
  let generation = 0;

  async function generate(body: SentRequest) {
    generation++;
    for (const r of results) r.controller?.abort();
    controller = new AbortController();
    running = true;
    results = [];
    warnings = [];
    failure = null;
    status = 'Starting…';
    lastRequest = body;
    view = {
      format: body.tokenFormat ?? 'css',
      system: body.colorSystem ?? 'oklch',
      namingPattern: body.namingPattern ?? DEFAULT_NAMING_PATTERN,
    };

    try {
      const result = await postForEvents('/api/palettes', body, controller.signal, (event) => {
        applyEvent(event, (message) => (status = message));
        if (event.type === 'done') status = `Created ${results.length} ${results.length === 1 ? 'palette' : 'palettes'}.`;
        else if (event.type === 'error') {
          failure = { code: event.code, message: event.message, detail: event.detail };
          status = '';
        }
      });
      if (!result.ok) {
        failure = { code: result.code ?? 'invalid_request', message: result.message, detail: result.detail };
        status = '';
      }
    } catch (error) {
      if (controller?.signal.aborted) {
        status = 'Cancelled.';
      } else {
        failure = { code: 'network', message: 'Lost the connection to the Palletter server.', detail: String(error) };
        status = '';
      }
    } finally {
      running = false;
      controller = undefined;
    }
  }

  function cancel() {
    controller?.abort();
  }

  /**
   * Refine one palette with a note, or regenerate it without one, in the session that made it.
   * If that session has closed, generate the scheme again from the original request instead.
   */
  async function refine(item: Result, note?: string) {
    if (item.busy || !lastRequest) return;
    item.busy = true;
    item.error = undefined;
    item.status = note ? 'Refining…' : 'Regenerating…';
    item.controller = new AbortController();
    const signal = item.controller.signal;
    const started = generation;
    const onEvent = (event: GenerateEvent) => {
      // A new generation replaced these results; this refinement no longer applies.
      if (started !== generation) return;
      applyEvent(event, (message) => (item.status = message), item.scheme);
      if (event.type === 'error') item.error = { code: event.code, message: event.message, detail: event.detail };
    };

    try {
      let result = item.sessionId
        ? await postForEvents('/api/palettes/refine', { sessionId: item.sessionId, scheme: item.scheme, note }, signal, onEvent)
        : ({ ok: false, status: 404, code: 'session_expired', message: '' } as const);

      if (!result.ok && result.code === 'session_expired') {
        // Start again for this scheme, carrying the note into the new session's request.
        item.status = 'The earlier session closed. Starting a new one…';
        const body: SentRequest = { ...lastRequest, schemes: [item.scheme], ...(note ? { note } : {}) };
        result = await postForEvents('/api/palettes', body, signal, onEvent);
      }
      if (!result.ok) item.error = { code: result.code ?? 'error', message: result.message, detail: result.detail };
    } catch (error) {
      if (!signal.aborted) item.error = { code: 'network', message: 'Lost the connection to the Palletter server.', detail: String(error) };
    } finally {
      item.busy = false;
      item.status = '';
      item.controller = undefined;
    }
  }
</script>
<div class="grid gap-6 lg:grid-cols-[minmax(24rem,2fr)_3fr] lg:items-start" data-hydrated={hydrated}>
  <Card class="min-w-0 lg:sticky lg:top-4">
    <form id="{id}-form" class="grid gap-5" aria-labelledby="{id}-inputs-heading" onsubmit={submit} novalidate>
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="{id}-inputs-heading" class="text-lg font-semibold">Describe your palette</h2>
        <div class="flex items-center gap-2">
          <Select
            items={agentItems}
            bind:value={agentId}
            aria-label="Agent"
            disabled={running || agents.length === 0}
            placeholder="Loading agents…"
          />
          <span class="agent-status flex items-center gap-1.5 text-sm" data-state={agentStatus.state} role="status">
            <span
              class="size-2 rounded-full {agentStatus.state === 'ready'
                ? 'bg-success'
                : agentStatus.state === 'error'
                  ? 'bg-error'
                  : 'animate-pulse bg-on-surface-variant'}"
              aria-hidden="true"
            ></span>
            <span class={agentStatus.state === 'error' ? 'text-error' : 'text-on-surface-variant'}>
              {agentStatus.state === 'loading' ? 'Loading agents…' : agentStatus.message}
            </span>
          </span>
        </div>
      </div>

      <!-- 1. Hues -->
      <fieldset class="grid gap-3">
        <legend class="mb-1 flex items-center gap-2 font-semibold">
          <span class="step-number">1</span> Hues
        </legend>
        <p class="text-sm text-on-surface-variant">
          A color value (hex, rgb, oklch…) or a name like "terracotta". Add more than one if you like.
        </p>
        {#each form.hues as hue, i (i)}
          {@const named = hue.text.trim() !== '' && !toPickerHex(hue.text)}
          <div class="flex items-center gap-2">
            <FormField ariaId="{id}-hue-{i}" error={errorFor(errors, `hues.${i}`)} class="flex-1">
              <!-- SV5UI's leading slot ignores clicks by default, which would block the color picker, so it's re-enabled here. -->
              <Input
                id="{id}-hue-{i}"
                value={hue.text}
                aria-label="Hue {i + 1}: color value or name"
                autocomplete="off"
                spellcheck="false"
                ui={{ leading: 'pointer-events-auto ps-2', base: 'ps-10' }}
                oninput={(e: Event) => {
                  hue.text = (e.currentTarget as HTMLInputElement).value;
                  const hex = toPickerHex(hue.text);
                  if (hex) hue.picker = hex;
                }}
              >
                {#snippet leadingSlot()}
                  <input
                    type="color"
                    class="hue-picker"
                    class:named
                    aria-label="Hue {i + 1} picker"
                    title={named ? 'A named color: the agent chooses the value' : 'Pick a color'}
                    bind:value={hue.picker}
                    oninput={(e) => {
                      // Read the event, not the binding, so this doesn't depend on handler order.
                      hue.picker = e.currentTarget.value;
                      hue.text = e.currentTarget.value;
                    }}
                  />
                {/snippet}
              </Input>
            </FormField>
            <Button
              icon="lucide:x"
              aria-label="Remove hue {i + 1}"
              disabled={form.hues.length === 1}
              onclick={() => removeHue(i)}
            />
          </div>
        {/each}
        {#if errors.hues}<p class="text-sm text-error">{errors.hues}</p>{/if}
        <div>
          <Button label="Add a hue" leadingIcon="lucide:plus" onclick={addHue} disabled={form.hues.length >= 8} />
        </div>

        <FormField label="Mood" hint="Optional" error={errors.mood} ariaId="{id}-mood">
          <Input bind:value={form.mood} placeholder="e.g. calm, trustworthy, a little playful" />
        </FormField>
      </fieldset>

      <!-- 2–7. Optional steps -->
      <Accordion
        type="multiple"
        items={SECTIONS}
        bind:value={openSections}
      >
        {#snippet label({ item })}
          {@const section = SECTIONS.find((s) => s.value === item.value)!}
          <span class="flex min-w-0 flex-1 items-center gap-2 text-left">
            <span class="step-number">{section.number}</span>
            <span class="shrink-0 font-semibold">{section.label}</span>
            <span class="truncate text-sm font-normal text-on-surface-variant">{summary[section.value]}</span>
          </span>
        {/snippet}
        {#snippet body({ item })}
          <div class="grid gap-3 pb-4">
            {#if item.value === 'format'}
              <RadioGroup items={FORMAT_ITEMS} bind:value={form.tokenFormat} aria-label="Token format" />
              {#if form.tokenFormat === 'css'}
                <FormField
                  label="Naming pattern"
                  ariaId="{id}-pattern"
                  error={errors.namingPattern}
                  description="Use [name], [color], [mood], [role], and [step]."
                >
                  <Input bind:value={form.namingPattern} spellcheck="false" />
                </FormField>
                <div class="flex flex-wrap gap-1.5" role="group" aria-label="Naming pattern presets">
                  {#each PATTERN_PRESETS as preset}
                    <Button label={preset} onclick={() => (form.namingPattern = preset)} />
                  {/each}
                </div>
              {:else if form.tokenFormat === 'tailwind'}
                <p class="text-sm text-on-surface-variant">
                  Tailwind needs names like <code>--color-[name]-[step]</code>, so colors become utilities such as
                  <code>bg-brand-500</code>.
                </p>
              {/if}
            {:else if item.value === 'scale'}
              <RadioGroup items={SCALE_ITEMS} bind:value={form.scaleKind} aria-label="Scale" />
              {#if form.scaleKind === 'range'}
                <div class="flex flex-wrap items-end gap-2">
                  <FormField label="From" ariaId="{id}-from">
                    <Select items={STEP_ITEMS} bind:value={form.from} />
                  </FormField>
                  <FormField label="To" ariaId="{id}-to" error={errors['scale.to']}>
                    <Select items={STEP_ITEMS} bind:value={form.to} />
                  </FormField>
                </div>
              {:else if form.scaleKind === 'count'}
                <FormField label="Steps" ariaId="{id}-count" error={errorFor(errors, 'scale')}>
                  <InputNumber bind:value={form.count} min={1} max={STEPS.length} />
                </FormField>
              {/if}
            {:else if item.value === 'saturation'}
              <FormField label="Saturation" ariaId="{id}-saturation">
                <Select
                  items={SATURATION_ITEMS}
                  bind:value={() => form.saturation || 'auto', (v) => (form.saturation = (v === 'auto' ? '' : v) as typeof form.saturation)}
                  class="w-full"
                />
              </FormField>
              {#if form.saturation === 'custom'}
                <FormField label="Describe it" ariaId="{id}-custom-saturation" error={errorFor(errors, 'saturation')}>
                  <Input bind:value={form.customSaturation} placeholder="e.g. dusty, like faded fabric" />
                </FormField>
              {/if}
            {:else if item.value === 'system'}
              <RadioGroup items={SYSTEM_ITEMS} bind:value={form.colorSystem} orientation="horizontal" aria-label="Color system" />
              {#if form.colorSystem === 'cmyk'}
                <p class="text-sm text-on-surface-variant">Browsers can't use CMYK, so tokens use hex with the CMYK value in a comment.</p>
              {/if}
            {:else if item.value === 'roles'}
              <p class="text-sm text-on-surface-variant">One color per role, each with an optional temperature.</p>
              {#each form.roles as role, i (i)}
                <div class="flex items-start gap-2">
                  <FormField ariaId="{id}-role-{i}" error={errorFor(errors, `roles.${i}`)} class="flex-1">
                    <Input id="{id}-role-{i}" bind:value={role.role} placeholder="e.g. primary" aria-label="Role {i + 1}" />
                  </FormField>
                  <div class="w-44 shrink-0">
                    <Select
                      items={TEMPERATURE_ITEMS}
                      bind:value={() => role.temperature || 'any', (v) => (role.temperature = (v === 'any' ? '' : v) as typeof role.temperature)}
                      aria-label="Role {i + 1} temperature"
                    />
                  </div>
                  <Button icon="lucide:x" aria-label="Remove role {i + 1}" onclick={() => form.roles.splice(i, 1)} />
                </div>
              {/each}
              {#if errorFor(errors, 'roles')}<p class="text-sm text-error">{errorFor(errors, 'roles')}</p>{/if}
              <div class="flex flex-wrap gap-2">
                <Button label="Add a role" leadingIcon="lucide:plus" onclick={() => addRole()} disabled={form.roles.length >= 6} />
                {#if form.roles.length === 0}
                  <Button label="Primary, secondary, tertiary" onclick={useStandardRoles} />
                {/if}
              </div>
            {:else if item.value === 'schemes'}
              <FormField ariaId="{id}-schemes" error={errors.schemes} description="Each scheme makes its own palette.">
                <CheckboxGroup
                  id="{id}-schemes-group"
                  items={SCHEME_ITEMS}
                  bind:value={() => form.schemes, (v) => (form.schemes = v as Scheme[])}
                  aria-label="Schemes"
                />
              </FormField>
            {/if}
          </div>
        {/snippet}
      </Accordion>

      <!-- 8. Create -->
      <div class="flex justify-end">
        {#if running}
          <Button label="Cancel" onclick={cancel} />
        {:else}
          <Button
            type="submit"
            label="Create"
            disabled={selectedAgent ? !selectedAgent.available : false}
          />
        {/if}
      </div>
    </form>
  </Card>

  <Card class="min-w-0">
    <section class="grid min-w-0 gap-4" aria-labelledby="{id}-results-heading">
      <h2 id="{id}-results-heading" class="text-lg font-semibold">Palettes</h2>

      <p class="status flex min-h-6 items-center gap-2 text-on-surface-variant" role="status" aria-live="polite">
        {#if running}<span class="spinner" aria-hidden="true"></span>{/if}
        {status}
      </p>

      {#if failure}
        <Alert color="error" icon="lucide:circle-alert" title={failure.message} role="alert">
          {#snippet descriptionSlot()}
            {#if failure?.detail}
              <details class="mt-1">
                <summary class="cursor-pointer">Details</summary>
                <pre class="mt-2 max-h-64 overflow-auto text-xs whitespace-pre-wrap text-on-surface">{failure.detail}</pre>
              </details>
            {/if}
          {/snippet}
        </Alert>
      {/if}

      {#if warnings.length}
        <Alert color="warning" icon="lucide:triangle-alert">
          {#snippet descriptionSlot()}
            <ul class="warnings list-disc pl-4">
              {#each warnings as warning}<li>{warning}</li>{/each}
            </ul>
          {/snippet}
        </Alert>
      {/if}

      {#if results.length}
        <div class="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Display options">
          <span id="{id}-view-format-label">Show tokens as</span>
          <div class="w-56"><Select items={VIEW_FORMAT_ITEMS} bind:value={view.format} aria-labelledby="{id}-view-format-label" /></div>
          <span id="{id}-view-system-label">in</span>
          <div class="w-32"><Select items={SYSTEM_ITEMS} bind:value={view.system} aria-labelledby="{id}-view-system-label" /></div>
        </div>
      {/if}

      {#each results as item (item.scheme)}
        <PaletteResult
          source={item.source}
          format={view.format}
          system={view.system}
          namingPattern={view.namingPattern}
          busy={item.busy}
          status={item.status}
          error={item.error}
          onRegenerate={() => refine(item)}
          onRefine={(note) => refine(item, note)}
          onCancel={() => item.controller?.abort()}
        />
      {:else}
        {#if !running && !failure}
          <p class="empty text-on-surface-variant">Describe a palette and press Create. Only the hue is required.</p>
        {/if}
      {/each}
    </section>
  </Card>
</div>

<style>
  .step-number {
    display: inline-grid;
    place-items: center;
    width: 1.375rem;
    height: 1.375rem;
    flex-shrink: 0;
    border-radius: 9999px;
    border: 1px solid var(--color-outline-variant);
    font-size: 0.75rem;
    font-weight: 500;
  }

  .hue-picker {
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm, 0.25rem);
    background: transparent;
    cursor: pointer;
  }

  .hue-picker::-webkit-color-swatch-wrapper {
    padding: 0;
  }

  .hue-picker::-webkit-color-swatch {
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-sm, 0.25rem);
  }

  .hue-picker.named {
    opacity: 0.35;
  }

  .spinner {
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid var(--color-outline-variant);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
