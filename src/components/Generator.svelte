<script lang="ts">
  import { onMount, tick } from 'svelte';
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
  import { readEvents } from '../lib/client/sse';
  import type { GenerateEvent } from '../lib/palette/generate';
  import { COLOR_SYSTEMS, SCHEMES } from '../lib/prompt/schema';
  import PaletteResult from './PaletteResult.svelte';

  type Agent = { id: string; label: string; available: boolean; unavailableReason?: string };
  type PaletteEvent = Extract<GenerateEvent, { type: 'palette' }>;
  type Failure = { code: string; message: string; detail?: string };

  const id = $props.id();

  let form = $state<FormState>(initialFormState());
  let errors = $state<FieldErrors>({});
  let open = $state({ format: false, scale: false, saturation: false, system: false, roles: false, schemes: false });

  let agents = $state<Agent[]>([]);
  let agentId = $state('');
  let agentStatus = $state<{ state: 'loading' | 'checking' | 'ready' | 'error'; message?: string }>({ state: 'loading' });

  let running = $state(false);
  let status = $state('');
  let warnings = $state<string[]>([]);
  let palettes = $state<PaletteEvent[]>([]);
  let failure = $state<Failure | null>(null);
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

  const PATTERN_PRESETS = ['--color-[name]-[step]', '--brand-[color]-[step]', '--color-[mood]-[step]', '--color-[role]-[step]'];

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
  function sectionFor(path: string): keyof typeof open | undefined {
    if (path.startsWith('namingPattern') || path.startsWith('tokenFormat')) return 'format';
    if (path.startsWith('scale')) return 'scale';
    if (path.startsWith('saturation')) return 'saturation';
    if (path.startsWith('colorSystem')) return 'system';
    if (path.startsWith('roles')) return 'roles';
    if (path.startsWith('schemes')) return 'schemes';
    return undefined;
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (running) return;
    const result = validate(form);
    if (!result.ok) {
      errors = result.errors;
      for (const path of Object.keys(errors)) {
        const section = sectionFor(path);
        if (section) open[section] = true;
      }
      await tick();
      document.querySelector<HTMLElement>(`#${CSS.escape(id)}-form [aria-invalid="true"]`)?.focus();
      return;
    }
    errors = {};
    await generate({ ...result.input, ...(agentId ? { agent: agentId } : {}) });
  }

  async function generate(body: unknown) {
    controller = new AbortController();
    running = true;
    palettes = [];
    warnings = [];
    failure = null;
    status = 'Starting…';

    try {
      const response = await fetch('/api/palettes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const error = (await response.json().catch(() => ({}))) as { error?: string; issues?: { path: string; message: string }[] };
        failure = {
          code: 'invalid_request',
          message: error.error ?? `The server said no (${response.status}).`,
          detail: error.issues?.map((i) => `${i.path}: ${i.message}`).join('\n'),
        };
        status = '';
        return;
      }

      for await (const message of readEvents(response.body)) {
        const event = JSON.parse(message.data) as GenerateEvent;
        if (event.type === 'status') status = event.message;
        else if (event.type === 'warning') warnings.push(event.message);
        else if (event.type === 'palette') palettes.push(event);
        else if (event.type === 'done') status = `Created ${palettes.length} ${palettes.length === 1 ? 'palette' : 'palettes'}.`;
        else if (event.type === 'error') {
          failure = { code: event.code, message: event.message, detail: event.detail };
          status = '';
        }
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
</script>

<div class="generator" data-hydrated={hydrated}>
  <form id="{id}-form" class="panel" aria-labelledby="{id}-inputs-heading" onsubmit={submit} novalidate>
    <div class="panel-heading">
      <h2 id="{id}-inputs-heading">Describe your palette</h2>
      <div class="agent">
        <label for="{id}-agent" class="visually-hidden">Agent</label>
        <select id="{id}-agent" bind:value={agentId} onchange={checkAgent} disabled={running || agents.length === 0}>
          {#each agents as agent (agent.id)}
            <option value={agent.id} disabled={!agent.available} title={agent.unavailableReason}>{agent.label}</option>
          {/each}
        </select>
        <span class="agent-status" data-state={agentStatus.state} role="status">
          <span class="dot" aria-hidden="true"></span>
          {agentStatus.state === 'loading' ? 'Loading agents…' : agentStatus.message}
        </span>
      </div>
    </div>

    <!-- 1. Hues -->
    <fieldset class="step">
      <legend><span class="num">1</span> Hues</legend>
      <p class="hint">A color value (hex, rgb, oklch…) or a name like "terracotta". Add more than one if you like.</p>
      {#each form.hues as hue, i (i)}
        <div class="hue-row">
          <input
            type="color"
            class:named={hue.text.trim() !== '' && !toPickerHex(hue.text)}
            aria-label="Hue {i + 1} picker"
            title={hue.text.trim() !== '' && !toPickerHex(hue.text) ? 'A named color: the agent chooses the value' : 'Pick a color'}
            value={hue.picker}
            oninput={(e) => {
              hue.picker = e.currentTarget.value;
              hue.text = hue.picker;
            }}
          />
          <label for="{id}-hue-{i}" class="visually-hidden">Hue {i + 1}: color value or name</label>
          <input
            id="{id}-hue-{i}"
            type="text"
            autocomplete="off"
            spellcheck="false"
            value={hue.text}
            aria-invalid={errorFor(errors, `hues.${i}`) ? 'true' : undefined}
            aria-describedby={errorFor(errors, `hues.${i}`) ? `${id}-hue-${i}-error` : undefined}
            oninput={(e) => {
              hue.text = e.currentTarget.value;
              const hex = toPickerHex(hue.text);
              if (hex) hue.picker = hex;
            }}
          />
          <button type="button" class="secondary icon" onclick={() => removeHue(i)} disabled={form.hues.length === 1} aria-label="Remove hue {i + 1}">✕</button>
        </div>
        {#if errorFor(errors, `hues.${i}`)}<p class="field-error" id="{id}-hue-{i}-error">{errorFor(errors, `hues.${i}`)}</p>{/if}
      {/each}
      {#if errors.hues}<p class="field-error">{errors.hues}</p>{/if}
      <button type="button" class="secondary small" onclick={addHue} disabled={form.hues.length >= 8}>Add a hue</button>

      <label for="{id}-mood" class="label">Mood <span class="optional">optional</span></label>
      <input
        id="{id}-mood"
        type="text"
        placeholder="e.g. calm, trustworthy, a little playful"
        bind:value={form.mood}
        aria-invalid={errors.mood ? 'true' : undefined}
      />
      {#if errors.mood}<p class="field-error">{errors.mood}</p>{/if}
    </fieldset>

    <!-- 2. Token format -->
    <details class="step" bind:open={open.format}>
      <summary><span class="num">2</span> <span class="title">Token format</span> <span class="summary">{summary.format}</span></summary>
      <fieldset class="options">
        <legend class="visually-hidden">Token format</legend>
        <label><input type="radio" bind:group={form.tokenFormat} value="css" /> CSS custom properties</label>
        <label><input type="radio" bind:group={form.tokenFormat} value="tailwind" /> Tailwind CSS v4 <code>@theme</code></label>
        <label><input type="radio" bind:group={form.tokenFormat} value="dtcg" /> Design Tokens JSON</label>
      </fieldset>
      {#if form.tokenFormat === 'css'}
        <label for="{id}-pattern" class="label">Naming pattern</label>
        <input
          id="{id}-pattern"
          type="text"
          list="{id}-patterns"
          spellcheck="false"
          bind:value={form.namingPattern}
          aria-invalid={errors.namingPattern ? 'true' : undefined}
          aria-describedby="{id}-pattern-hint"
        />
        <datalist id="{id}-patterns">
          {#each PATTERN_PRESETS as preset}<option value={preset}></option>{/each}
        </datalist>
        <p class="hint" id="{id}-pattern-hint">Use <code>[name]</code>, <code>[color]</code>, <code>[mood]</code>, <code>[role]</code>, and <code>[step]</code>.</p>
        {#if errors.namingPattern}<p class="field-error">{errors.namingPattern}</p>{/if}
      {:else if form.tokenFormat === 'tailwind'}
        <p class="hint">Tailwind needs names like <code>--color-[name]-[step]</code>, so colors become utilities such as <code>bg-brand-500</code>.</p>
      {/if}
    </details>

    <!-- 3. Scale -->
    <details class="step" bind:open={open.scale}>
      <summary><span class="num">3</span> <span class="title">Scale</span> <span class="summary">{summary.scale}</span></summary>
      <fieldset class="options">
        <legend class="visually-hidden">Scale</legend>
        <label><input type="radio" bind:group={form.scaleKind} value="full" /> Full scale, 50–950</label>
        <label><input type="radio" bind:group={form.scaleKind} value="range" /> A range of steps</label>
        <label><input type="radio" bind:group={form.scaleKind} value="count" /> A number of steps</label>
      </fieldset>
      {#if form.scaleKind === 'range'}
        <div class="inline">
          <label for="{id}-from">From</label>
          <select id="{id}-from" bind:value={form.from}>
            {#each STEPS as step}<option value={step}>{step}</option>{/each}
          </select>
          <label for="{id}-to">to</label>
          <select id="{id}-to" bind:value={form.to} aria-invalid={errors['scale.to'] ? 'true' : undefined}>
            {#each STEPS as step}<option value={step}>{step}</option>{/each}
          </select>
        </div>
      {:else if form.scaleKind === 'count'}
        <div class="inline">
          <label for="{id}-count">Steps</label>
          <input id="{id}-count" type="number" min="1" max={STEPS.length} bind:value={form.count} aria-invalid={errorFor(errors, 'scale') ? 'true' : undefined} />
        </div>
      {/if}
      {#if errorFor(errors, 'scale')}<p class="field-error">{errorFor(errors, 'scale')}</p>{/if}
    </details>

    <!-- 4. Saturation -->
    <details class="step" bind:open={open.saturation}>
      <summary><span class="num">4</span> <span class="title">Saturation</span> <span class="summary">{summary.saturation}</span></summary>
      <label for="{id}-saturation" class="visually-hidden">Saturation</label>
      <select id="{id}-saturation" bind:value={form.saturation}>
        {#each SATURATION_OPTIONS as [value, label]}<option {value}>{label}</option>{/each}
      </select>
      {#if form.saturation === 'custom'}
        <label for="{id}-custom-saturation" class="label">Describe it</label>
        <input
          id="{id}-custom-saturation"
          type="text"
          placeholder="e.g. dusty, like faded fabric"
          bind:value={form.customSaturation}
          aria-invalid={errorFor(errors, 'saturation') ? 'true' : undefined}
        />
      {/if}
      {#if errorFor(errors, 'saturation')}<p class="field-error">{errorFor(errors, 'saturation')}</p>{/if}
    </details>

    <!-- 5. Color system -->
    <details class="step" bind:open={open.system}>
      <summary><span class="num">5</span> <span class="title">Color system</span> <span class="summary">{summary.system}</span></summary>
      <fieldset class="options row">
        <legend class="visually-hidden">Color system</legend>
        {#each COLOR_SYSTEMS as system}
          <label><input type="radio" bind:group={form.colorSystem} value={system} /> {system}</label>
        {/each}
      </fieldset>
      {#if form.colorSystem === 'cmyk'}
        <p class="hint">Browsers can't use CMYK, so tokens use hex with the CMYK value in a comment.</p>
      {/if}
    </details>

    <!-- 6. Roles -->
    <details class="step" bind:open={open.roles}>
      <summary><span class="num">6</span> <span class="title">Roles</span> <span class="summary">{summary.roles}</span></summary>
      <p class="hint">One color per role, each with an optional temperature.</p>
      {#each form.roles as role, i (i)}
        <div class="role-row">
          <label for="{id}-role-{i}" class="visually-hidden">Role {i + 1}</label>
          <input id="{id}-role-{i}" type="text" placeholder="e.g. primary" bind:value={role.role} aria-invalid={errorFor(errors, `roles.${i}`) ? 'true' : undefined} />
          <label for="{id}-temp-{i}" class="visually-hidden">Role {i + 1} temperature</label>
          <select id="{id}-temp-{i}" bind:value={role.temperature}>
            <option value="">Any temperature</option>
            <option value="warm">Warm</option>
            <option value="cool">Cool</option>
            <option value="neutral">Neutral</option>
          </select>
          <button type="button" class="secondary icon" onclick={() => form.roles.splice(i, 1)} aria-label="Remove role {i + 1}">✕</button>
        </div>
      {/each}
      {#if errorFor(errors, 'roles')}<p class="field-error">{errorFor(errors, 'roles')}</p>{/if}
      <div class="inline">
        <button type="button" class="secondary small" onclick={() => addRole()} disabled={form.roles.length >= 6}>Add a role</button>
        {#if form.roles.length === 0}
          <button type="button" class="secondary small" onclick={useStandardRoles}>Primary, secondary, tertiary</button>
        {/if}
      </div>
    </details>

    <!-- 7. Schemes -->
    <details class="step" bind:open={open.schemes}>
      <summary><span class="num">7</span> <span class="title">Schemes</span> <span class="summary">{summary.schemes}</span></summary>
      <fieldset class="options grid" aria-invalid={errors.schemes ? 'true' : undefined}>
        <legend class="visually-hidden">Schemes</legend>
        {#each SCHEMES as scheme}
          <label><input type="checkbox" bind:group={form.schemes} value={scheme} aria-invalid={errors.schemes ? 'true' : undefined} /> {SCHEME_LABELS[scheme]}</label>
        {/each}
      </fieldset>
      <p class="hint">Each scheme makes its own palette.</p>
      {#if errors.schemes}<p class="field-error">{errors.schemes}</p>{/if}
    </details>

    <!-- 8. Create -->
    <div class="actions">
      {#if running}
        <button type="button" class="secondary" onclick={cancel}>Cancel</button>
      {:else}
        <button type="submit" disabled={selectedAgent ? !selectedAgent.available : false}>Create</button>
      {/if}
    </div>
  </form>

  <section class="panel results" aria-labelledby="{id}-results-heading">
    <h2 id="{id}-results-heading">Palettes</h2>

    <p class="status" role="status" aria-live="polite">
      {#if running}<span class="spinner" aria-hidden="true"></span>{/if}
      {status}
    </p>

    {#if failure}
      <div class="failure" role="alert">
        <p>{failure.message}</p>
        {#if failure.detail}
          <details>
            <summary>Details</summary>
            <pre>{failure.detail}</pre>
          </details>
        {/if}
      </div>
    {/if}

    {#if warnings.length}
      <ul class="warnings">
        {#each warnings as warning}<li>{warning}</li>{/each}
      </ul>
    {/if}

    {#each palettes as result (result.palette.scheme)}
      <PaletteResult palette={result.palette} tokens={result.tokens} />
    {:else}
      {#if !running && !failure}
        <p class="empty">Describe a palette and press Create. Only the hue is required.</p>
      {/if}
    {/each}
  </section>
</div>

<style>
  .generator {
    display: grid;
    gap: var(--space-6);
  }

  @media (min-width: 64rem) {
    .generator {
      grid-template-columns: minmax(24rem, 2fr) 3fr;
      align-items: start;
    }

    form {
      position: sticky;
      top: var(--space-4);
    }
  }

  .panel {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-6);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    min-width: 0;
  }

  @media (max-width: 40rem) {
    .panel {
      padding: var(--space-4);
    }
  }

  .panel-heading {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-4);
    justify-content: space-between;
    align-items: center;
  }

  .agent {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.8125rem;
  }

  .agent select {
    width: auto;
    min-height: 1.875rem;
    font-size: 0.8125rem;
  }

  .agent-status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--color-text-muted);
  }

  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--color-text-muted);
  }

  [data-state='ready'] .dot {
    background: var(--color-success);
  }

  [data-state='error'] {
    color: var(--color-danger);
  }

  [data-state='error'] .dot {
    background: var(--color-danger);
  }

  [data-state='checking'] .dot {
    animation: pulse 1s ease-in-out infinite;
  }

  .step {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-2);
    padding: var(--space-3) 0 0;
    border: none;
    border-top: 1px solid var(--color-border);
    margin: 0;
    min-width: 0;
  }

  fieldset.step {
    padding-top: var(--space-3);
  }

  legend,
  summary {
    font-weight: 600;
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    padding: 0;
    float: left;
    width: 100%;
  }

  legend + * {
    clear: left;
  }

  summary {
    float: none;
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary::after {
    content: '▸';
    flex-shrink: 0;
    color: var(--color-text-muted);
  }

  details[open] > summary::after {
    content: '▾';
  }

  details[open] > summary {
    margin-bottom: var(--space-2);
  }

  .num {
    display: inline-grid;
    place-items: center;
    width: 1.375rem;
    height: 1.375rem;
    border-radius: 50%;
    border: 1px solid var(--color-border);
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  .title {
    white-space: nowrap;
    flex-shrink: 0;
  }

  .step > button,
  .step > .inline {
    justify-self: start;
  }

  .summary {
    flex: 1 1 0;
    font-weight: 400;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .label {
    font-weight: 500;
    font-size: 0.875rem;
    margin-top: var(--space-2);
  }

  .optional {
    font-weight: 400;
    color: var(--color-text-muted);
  }

  input.named {
    opacity: 0.35;
  }

  .hue-row,
  .role-row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--space-2);
    align-items: center;
  }

  .role-row {
    grid-template-columns: 1fr auto auto;
  }

  .role-row select {
    width: auto;
  }

  .options {
    display: grid;
    gap: var(--space-2);
    border: none;
    padding: 0;
    margin: 0;
  }

  .options.row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-4);
  }

  .options.grid {
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  }

  .options label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .inline {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  .inline select,
  .inline input {
    width: auto;
  }

  .inline input[type='number'] {
    width: 5rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border);
  }

  .actions button {
    min-width: 8rem;
  }

  code {
    font-size: 0.85em;
  }

  .results {
    align-content: start;
  }

  .status {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-text-muted);
    min-height: 1.5rem;
  }

  .spinner {
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .failure {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius);
    background: var(--color-danger-bg);
    color: var(--color-danger);
  }

  .failure pre {
    white-space: pre-wrap;
    font-size: 0.75rem;
    max-height: 16rem;
    overflow: auto;
    color: var(--color-text);
  }

  .warnings {
    padding: var(--space-3) var(--space-4) var(--space-3) var(--space-8);
    border-radius: var(--radius);
    background: var(--color-warning-bg);
    color: var(--color-warning);
    font-size: 0.875rem;
  }

  .empty {
    color: var(--color-text-muted);
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }
</style>
