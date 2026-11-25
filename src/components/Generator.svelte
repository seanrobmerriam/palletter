<script lang="ts">
  import '../lib/client/icons';
  import { onMount, tick } from 'svelte';
  import {
    Accordion,
    Alert,
    Button,
    Card,
    CheckboxGroup,
    Collapsible,
    FormField,
    Input,
    InputNumber,
    RadioGroup,
    Switch,
    Select,
  } from 'sv5ui';
  import {
    errorFor,
    initialFormState,
    SCHEME_DESCRIPTIONS,
    SCHEME_LABELS,
    STEPS,
    summaries,
    toBuildSettings,
    toPickerHex,
    validateSuggest,
    type FieldErrors,
    type FormState,
  } from '../lib/client/form';
  import { postForEvents } from '../lib/client/api';
  import { buildChosenPalette, type ChosenPalette } from '../lib/palette/chosen';
  import { COLOR_SYSTEMS, SCHEMES, type Scheme } from '../lib/prompt/schema';
  import type { SuggestEvent } from '../lib/suggest/run';
  import { MAX_DIRECTIONS, type Direction, type SuggestRequestInput } from '../lib/suggest/schema';
  import DirectionCard, { type DirectionView, type Suggestion } from './DirectionCard.svelte';
  import PaletteResult from './PaletteResult.svelte';

  type Agent = { id: string; label: string; available: boolean; unavailableReason?: string };
  type Failure = { code: string; message: string; detail?: string };
  type SentRequest = SuggestRequestInput & { agent?: string; model?: string };
  type ModelChoice = { value: string; name: string; description?: string };
  type ModelOptions = { current: string; choices: ModelChoice[] };

  const id = $props.id();

  let form = $state<FormState>(initialFormState());
  let errors = $state<FieldErrors>({});
  /** Whether the Advanced options are open, and which of their sections. */
  let advancedOpen = $state(false);
  let openSections = $state<string[]>([]);

  let agents = $state<Agent[]>([]);
  let agentId = $state('');
  /** The models the chosen agent offers, if it lets the user pick one. */
  let models = $state<ModelOptions | null>(null);
  let modelId = $state('');
  let agentStatus = $state<{ state: 'loading' | 'checking' | 'ready' | 'error'; message?: string }>({ state: 'loading' });

  /** A request to the agent is running: the first suggestions, or more directions. */
  let running = $state(false);
  let status = $state('');
  let warnings = $state<string[]>([]);
  let failure = $state<Failure | null>(null);
  let directions = $state<DirectionView[]>([]);
  /** The agent session behind the suggestions on screen, for follow-ups. */
  let sessionId: string | null = null;
  /** The request behind the suggestions on screen. */
  let lastRequest: SentRequest | null = null;
  let hydrated = $state(false);
  let controller: AbortController | undefined;
  let nextId = 0;
  const newId = () => `s${nextId++}`;

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
  const SCHEME_ITEMS = SCHEMES.filter((scheme) => scheme !== 'suggested').map((scheme) => ({
    value: scheme,
    label: SCHEME_LABELS[scheme],
    description: SCHEME_DESCRIPTIONS[scheme],
  }));

  type Section = 'directions' | 'saturation' | 'roles' | 'schemes' | 'scale' | 'format' | 'system';
  const SECTIONS: { value: Section; label: string }[] = [
    { value: 'directions', label: 'Directions' },
    { value: 'saturation', label: 'Saturation' },
    { value: 'roles', label: 'Roles' },
    { value: 'schemes', label: 'Relationships' },
    { value: 'scale', label: 'Scale' },
    { value: 'format', label: 'Token format' },
    { value: 'system', label: 'Color system' },
  ];

  const PATTERN_PRESETS = ['--color-[name]-[step]', '--brand-[color]-[step]', '--color-[role]-[step]'];

  const modelItems = $derived(
    (models?.choices ?? []).map((m) => ({ value: m.value, label: m.name, ...(m.description ? { description: m.description } : {}) })),
  );
  /** A short name for the chosen model, e.g. "Sonnet 5.5", or "Opus 5.5" for the default. */
  function modelName(value: string | undefined): string | undefined {
    const choice = models?.choices.find((m) => m.value === value);
    if (!choice) return undefined;
    return choice.value === 'default' && choice.description ? choice.description : choice.name;
  }

  const agentItems = $derived(
    agents.map((a) => ({ value: a.id, label: a.label, disabled: !a.available, ...(a.unavailableReason ? { description: a.unavailableReason } : {}) })),
  );

  // ── The palette, built in the browser from the colors the user kept ──────────

  const kept = $derived(directions.flatMap((d) => d.suggestions.filter((s) => s.kept).map((s) => ({ direction: d, suggestion: s }))));

  /** The user's own colors, as named in the first direction they kept a color from. */
  const yours = $derived((kept[0]?.direction ?? directions[0])?.yours ?? []);

  const built = $derived.by((): ChosenPalette | null => {
    if (kept.length === 0) return null;
    const settings = toBuildSettings(form);
    const from = [...new Set(kept.map((k) => k.direction.name))];
    const rationale = `Your ${yours.length === 1 ? 'color' : 'colors'}, with ${kept.length} ${kept.length === 1 ? 'suggestion' : 'suggestions'} from ${from.map((n) => `"${n}"`).join(' and ')}.`;
    try {
      return buildChosenPalette(
        [...yours.map((c) => ({ name: c.name, role: c.role, value: c.value })), ...kept.map((k) => ({ ...k.suggestion.color }))],
        { scale: settings.scale, balance: settings.balance, ...(settings.saturation ? { saturation: settings.saturation } : {}), rationale },
      );
    } catch {
      return null;
    }
  });
  const buildSettings = $derived(toBuildSettings(form));

  // ── Agents ───────────────────────────────────────────────────────────────────

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
    models = null;
    modelId = '';
    try {
      const response = await fetch(`/api/agent?check=${encodeURIComponent(checking)}`);
      const body = (await response.json()) as { check: { ok: boolean; message?: string; models?: ModelOptions } };
      if (checking !== agentId) return;
      agentStatus = body.check.ok ? { state: 'ready', message: 'Ready' } : { state: 'error', message: body.check.message };
      if (body.check.models?.choices.length) {
        models = body.check.models;
        modelId = body.check.models.current;
      }
    } catch {
      if (checking === agentId) agentStatus = { state: 'error', message: 'Could not reach the Palletter server.' };
    }
  }

  // ── Form ─────────────────────────────────────────────────────────────────────

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

  /** Which Advanced section a field error belongs to. */
  function sectionFor(path: string): Section | undefined {
    if (path.startsWith('namingPattern') || path.startsWith('tokenFormat')) return 'format';
    if (path.startsWith('scale')) return 'scale';
    if (path.startsWith('saturation')) return 'saturation';
    if (path.startsWith('colorSystem')) return 'system';
    if (path.startsWith('roles')) return 'roles';
    if (path.startsWith('schemes')) return 'schemes';
    if (path.startsWith('directions')) return 'directions';
    return undefined;
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (running) return;
    const result = validateSuggest(form);
    if (!result.ok) {
      errors = result.errors;
      for (const path of Object.keys(errors)) {
        const section = sectionFor(path);
        if (!section) continue;
        advancedOpen = true;
        if (!openSections.includes(section)) openSections = [...openSections, section];
      }
      await tick();
      // Sections animate open; wait a frame so their controls can take focus.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      document.querySelector<HTMLElement>(`#${CSS.escape(id)}-form [aria-invalid="true"]`)?.focus();
      return;
    }
    errors = {};
    // Only send a model the user changed, so the agent's own default stays the default.
    const model = models && modelId && modelId !== models.current ? modelId : undefined;
    await suggest({ ...result.input, ...(agentId ? { agent: agentId } : {}), ...(model ? { model } : {}) });
  }

  // ── Suggestions ──────────────────────────────────────────────────────────────

  function toView(direction: Direction): DirectionView {
    return {
      id: newId(),
      name: direction.name,
      summary: direction.summary,
      yours: direction.yours,
      suggestions: direction.colors.map((color) => ({ id: newId(), color, kept: false })),
    };
  }

  const describe = (count: number, model?: string) => {
    const name = modelName(model ?? models?.current);
    return `${count} ${count === 1 ? 'direction' : 'directions'}${name ? ` from ${name}` : ''}. Keep the colors you like.`;
  };

  /** Run one request to the agent that streams directions. */
  async function stream(url: string, body: unknown, onDone: (added: number) => void): Promise<Failure | null> {
    controller = new AbortController();
    running = true;
    failure = null;
    let added = 0;
    try {
      const result = await postForEvents<SuggestEvent>(url, body, controller.signal, (event) => {
        if (event.type === 'status') status = event.message;
        else if (event.type === 'warning') warnings.push(event.message);
        else if (event.type === 'direction') {
          directions.push(toView(event.direction));
          added++;
        } else if (event.type === 'session') sessionId = event.id;
        else if (event.type === 'done') onDone(added);
        else if (event.type === 'error') {
          failure = { code: event.code, message: event.message, detail: event.detail };
          status = '';
        }
      });
      if (!result.ok) return { code: result.code ?? 'invalid_request', message: result.message, detail: result.detail };
    } catch (error) {
      if (controller?.signal.aborted) status = 'Cancelled.';
      else return { code: 'network', message: 'Lost the connection to the Palletter server.', detail: String(error) };
    } finally {
      running = false;
      controller = undefined;
    }
    return null;
  }

  async function suggest(body: SentRequest) {
    directions = [];
    warnings = [];
    sessionId = null;
    lastRequest = body;
    status = 'Starting…';
    const problem = await stream('/api/suggest', body, () => (status = describe(directions.length, body.model)));
    if (problem) {
      failure = problem;
      status = '';
    }
  }

  async function moreDirections() {
    if (running || !lastRequest) return;
    const count = form.directions;
    const before = directions.length;
    const onDone = (added: number) => (status = `Added ${added} more ${added === 1 ? 'direction' : 'directions'}.`);
    status = 'Asking for more directions…';
    let problem = sessionId
      ? await stream('/api/suggest/more', { sessionId, kind: 'directions', count }, onDone)
      : ({ code: 'session_expired', message: '' } as Failure);
    if (problem?.code === 'session_expired') {
      // The session closed: start a new one for the extra directions, keeping what's on screen.
      status = 'The earlier session closed. Starting a new one…';
      problem = await stream('/api/suggest', { ...lastRequest, directions: count }, onDone);
    }
    if (problem) {
      failure = problem;
      status = '';
    } else if (directions.length > before) {
      tick().then(() => document.getElementById(`${id}-dir-${directions[before]!.id}`)?.scrollIntoView({ block: 'nearest' }));
    }
  }

  function cancel() {
    controller?.abort();
  }

  function toggle(suggestion: Suggestion, value: boolean) {
    suggestion.kept = value;
  }

  async function moreLike(direction: DirectionView, suggestion: Suggestion) {
    if (running || direction.busyId) return;
    direction.error = undefined;
    if (!sessionId) {
      direction.error = { message: 'The agent session for these suggestions has closed. Press Suggest colors to start again.' };
      return;
    }
    direction.busyId = suggestion.id;
    const added: Suggestion[] = [];
    try {
      const result = await postForEvents<SuggestEvent>(
        '/api/suggest/more',
        {
          sessionId,
          kind: 'like',
          color: { name: suggestion.color.name, role: suggestion.color.role, value: suggestion.color.value },
          direction: direction.name,
        },
        new AbortController().signal,
        (event) => {
          if (event.type === 'alternatives') {
            for (const color of event.colors) added.push({ id: newId(), color, kept: false, variantOf: suggestion.color.name });
          } else if (event.type === 'warning') warnings.push(event.message);
          else if (event.type === 'error') direction.error = { message: event.message, detail: event.detail };
        },
      );
      if (!result.ok) {
        direction.error = {
          message:
            result.code === 'session_expired'
              ? 'The agent session for these suggestions has closed. Press Suggest colors to start again.'
              : result.message,
          detail: result.detail,
        };
      }
    } catch (error) {
      direction.error = { message: 'Lost the connection to the Palletter server.', detail: String(error) };
    } finally {
      // Put the alternatives right after the color they're like, and after any earlier ones.
      const at = direction.suggestions.findIndex((s) => s.id === suggestion.id);
      let insert = at + 1;
      while (direction.suggestions[insert]?.variantOf === suggestion.color.name) insert++;
      direction.suggestions.splice(insert, 0, ...added);
      direction.busyId = undefined;
    }
  }
</script>
<div class="grid gap-6 lg:grid-cols-[minmax(24rem,2fr)_3fr] lg:items-start" data-hydrated={hydrated}>
  <Card class="min-w-0 lg:sticky lg:top-4">
    <form id="{id}-form" class="grid gap-5" aria-labelledby="{id}-inputs-heading" onsubmit={submit} novalidate>
      <div class="grid gap-3">
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 id="{id}-inputs-heading" class="text-lg font-semibold">Your colors</h2>
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
        <div class="grid gap-2 sm:grid-cols-2">
          <Select
            items={agentItems}
            bind:value={agentId}
            aria-label="Agent"
            disabled={running || agents.length === 0}
            placeholder="Loading agents…"
          />
          {#if models}
            <Select items={modelItems} bind:value={modelId} aria-label="Model" disabled={running} />
          {/if}
        </div>
      </div>

      <fieldset class="grid gap-3">
        <legend class="mb-1 font-semibold">Colors you like</legend>
        <p class="text-sm text-on-surface-variant">
          A color value (hex, rgb, oklch…) or a name like "terracotta". The agent suggests colors to go with them.
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

        <FormField label="What's it for?" hint="Optional" error={errors.mood} ariaId="{id}-mood">
          <Input bind:value={form.mood} placeholder="e.g. a bakery website, warm and a little playful" />
        </FormField>
      </fieldset>

      <Collapsible bind:open={advancedOpen}>
        {#snippet trigger({ open, props })}
          <button {...props} type="button" class="advanced-trigger flex w-full items-center justify-between gap-2 text-left font-semibold">
            <span>Advanced options</span>
            <span class="text-sm font-normal text-on-surface-variant">{open ? 'Hide' : 'Hints for the agent, scale, and export'}</span>
          </button>
        {/snippet}
        {#snippet content()}
          <!-- Let the label fill the row, so a long summary truncates instead of widening the button. -->
          <Accordion type="multiple" items={SECTIONS} bind:value={openSections} ui={{ label: 'min-w-0 flex-1' }}>
            {#snippet label({ item })}
              {@const section = SECTIONS.find((s) => s.value === item.value)!}
              <span class="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span class="shrink-0 font-semibold">{section.label}</span>
                <span class="w-0 flex-1 truncate text-sm font-normal text-on-surface-variant">{summary[section.value]}</span>
              </span>
            {/snippet}
            {#snippet body({ item })}
              <div class="grid gap-3 pb-4">
            {#if item.value === 'directions'}
              <FormField
                label="Directions at a time"
                ariaId="{id}-directions"
                error={errors.directions}
                description="How many different takes the agent suggests when you press Suggest colors or More directions."
              >
                <InputNumber bind:value={form.directions} min={1} max={MAX_DIRECTIONS} />
              </FormField>
            {:else if item.value === 'format'}
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
              <Switch
                id="{id}-balance"
                bind:checked={form.balance}
                label="Balance the palette"
                description="Tie the scales together with a gentle hue shift from light to dark. The colors you chose never change. You can compare with the unbalanced palette."
              />
            {:else if item.value === 'system'}
              <RadioGroup items={SYSTEM_ITEMS} bind:value={form.colorSystem} orientation="horizontal" aria-label="Color system" />
              {#if form.colorSystem === 'cmyk'}
                <p class="text-sm text-on-surface-variant">Browsers can't use CMYK, so tokens use hex with the CMYK value in a comment.</p>
              {/if}
            {:else if item.value === 'roles'}
              <p class="text-sm text-on-surface-variant">Optional. Jobs you need colors for, such as "background" or "call to action", each with an optional temperature.</p>
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
              </div>
            {:else if item.value === 'schemes'}
              <FormField ariaId="{id}-schemes" error={errors.schemes} description="Optional. Color-wheel relationships for the agent to lean on. It treats them as a hint, not a rule.">
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
        {/snippet}
      </Collapsible>

      <div class="flex justify-end">
        {#if running}
          <Button label="Cancel" onclick={cancel} />
        {:else}
          <Button
            type="submit"
            label="Suggest colors"
            leadingIcon="lucide:sparkles"
            disabled={selectedAgent ? !selectedAgent.available : false}
          />
        {/if}
      </div>
    </form>
  </Card>

  <Card class="min-w-0">
    <section class="grid min-w-0 gap-4" aria-labelledby="{id}-results-heading">
      <h2 id="{id}-results-heading" class="text-lg font-semibold">Suggestions</h2>

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

      {#each directions as direction (direction.id)}
        <div id="{id}-dir-{direction.id}">
          <DirectionCard
            {direction}
            disabled={running}
            onToggle={toggle}
            onKeepAll={() => direction.suggestions.forEach((s) => (s.kept = true))}
            onMoreLike={(suggestion) => moreLike(direction, suggestion)}
          />
        </div>
      {:else}
        {#if !running && !failure}
          <p class="empty text-on-surface-variant">
            Add colors you like and press Suggest colors. The agent suggests new colors that work with yours, in a few different directions.
          </p>
        {/if}
      {/each}

      {#if directions.length}
        <div class="flex flex-wrap justify-end gap-2">
          <Button
            label={running ? 'Working…' : 'More directions'}
            leadingIcon="lucide:plus"
            disabled={running}
            onclick={moreDirections}
          />
        </div>

        <section class="grid min-w-0 gap-4 border-t border-outline-variant pt-4" aria-labelledby="{id}-palette-heading">
          <h2 id="{id}-palette-heading" class="text-lg font-semibold">Your palette</h2>
          {#if built}
            <div class="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Display options">
              <span id="{id}-view-format-label">Show tokens as</span>
              <div class="w-56"><Select items={VIEW_FORMAT_ITEMS} bind:value={form.tokenFormat} aria-labelledby="{id}-view-format-label" /></div>
              <span id="{id}-view-system-label">in</span>
              <div class="w-32"><Select items={SYSTEM_ITEMS} bind:value={form.colorSystem} aria-labelledby="{id}-view-system-label" /></div>
            </div>
            <PaletteResult
              source={built.source}
              original={built.original}
              notes={built.notes}
              format={buildSettings.tokenFormat}
              system={buildSettings.colorSystem}
              namingPattern={buildSettings.namingPattern}
            />
          {:else}
            <p class="text-on-surface-variant">
              Keep the suggestions you like, from any direction, and your palette builds here: your colors and the ones you kept, as scales and tokens.
            </p>
          {/if}
        </section>
      {/if}
    </section>
  </Card>
</div>

<style>
  .advanced-trigger {
    padding: 0.5rem 0;
    border-top: 1px solid var(--color-outline-variant);
    cursor: pointer;
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
