<script lang="ts">
  import { tick } from 'svelte';
  import { SCHEME_LABELS } from '../lib/client/form';
  import { FORMAT_EXTENSIONS, formatPalette, FormatError } from '../lib/format/index';
  import { resolvePalette } from '../lib/palette/resolve';
  import type { ColorSystem, ModelPalette, TokenFormat } from '../lib/prompt/schema';
  import ContrastMatrix from './ContrastMatrix.svelte';
  import PalettePreview from './PalettePreview.svelte';

  type Props = {
    source: ModelPalette;
    format: TokenFormat;
    system: ColorSystem;
    namingPattern: string;
    busy: boolean;
    status: string;
    error?: { message: string; detail?: string };
    onRegenerate: () => void;
    onRefine: (note: string) => void;
    onCancel: () => void;
  };

  let { source, format, system, namingPattern, busy, status, error, onRegenerate, onRefine, onCancel }: Props = $props();

  const id = $props.id();
  const palette = $derived(resolvePalette(source, system));
  const formatted = $derived.by(() => {
    try {
      return { tokens: formatPalette(palette, { format, namingPattern }) };
    } catch (e) {
      if (e instanceof FormatError) return { error: e.message };
      throw e;
    }
  });
  const adjusted = $derived(palette.colors.some((c) => c.swatches.some((s) => s.gamutMapped)));

  type Tab = 'tokens' | 'preview' | 'contrast';
  const TABS: [Tab, string][] = [
    ['tokens', 'Tokens'],
    ['preview', 'Preview'],
    ['contrast', 'Contrast'],
  ];
  let tab = $state<Tab>('tokens');

  let copied = $state<string | null>(null);
  let copyFailed = $state(false);
  let refining = $state(false);
  let note = $state('');

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = key;
      copyFailed = false;
      setTimeout(() => {
        if (copied === key) copied = null;
      }, 1500);
    } catch {
      copyFailed = true;
    }
  }

  function download() {
    if (!formatted.tokens) return;
    const type = format === 'dtcg' ? 'application/json' : 'text/css';
    const url = URL.createObjectURL(new Blob([formatted.tokens], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `palette-${palette.scheme}.${FORMAT_EXTENSIONS[format]}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function selectTab(next: Tab, focus = false) {
    tab = next;
    if (focus) tick().then(() => document.getElementById(`${id}-tab-${next}`)?.focus());
  }

  function tabKeydown(event: KeyboardEvent) {
    const index = TABS.findIndex(([t]) => t === tab);
    const move = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!move) return;
    event.preventDefault();
    selectTab(TABS[(index + move + TABS.length) % TABS.length]![0], true);
  }

  async function startRefine() {
    refining = true;
    await tick();
    document.getElementById(`${id}-note`)?.focus();
  }

  function submitRefine(event: SubmitEvent) {
    event.preventDefault();
    if (!note.trim()) return;
    onRefine(note.trim());
    refining = false;
    note = '';
  }

  const LEVEL_LABELS = { AAA: 'AAA', AA: 'AA', 'AA-large': 'AA large', fail: 'low' } as const;

  /** "oklch(54.6% 0.215 262.9)" → "54.6% 0.215 262.9", which wraps to fit a narrow swatch. */
  const compact = (value: string) => value.replace(/^[a-z]+\(|\)$/g, '');
</script>

<article class="palette" class:busy aria-labelledby="{id}-title" aria-busy={busy}>
  <header>
    <div class="title-row">
      <h3 id="{id}-title">{SCHEME_LABELS[palette.scheme]}</h3>
      <div class="actions">
        {#if busy}
          <button type="button" class="secondary small" onclick={onCancel}>Cancel</button>
        {:else}
          <button type="button" class="secondary small" onclick={onRegenerate}>Regenerate</button>
          <button type="button" class="secondary small" onclick={startRefine} aria-expanded={refining}>Refine…</button>
        {/if}
      </div>
    </div>
    {#if busy}<p class="status" role="status"><span class="spinner" aria-hidden="true"></span>{status}</p>{/if}
    {#if error}
      <div class="failure" role="alert">
        <p>{error.message}</p>
        {#if error.detail}<details><summary>Details</summary><pre>{error.detail}</pre></details>{/if}
      </div>
    {/if}
    {#if refining && !busy}
      <form class="refine" onsubmit={submitRefine}>
        <label for="{id}-note" class="visually-hidden">What should change?</label>
        <input id="{id}-note" type="text" placeholder="e.g. make the secondary warmer" bind:value={note} maxlength="500" />
        <button type="submit" class="small" disabled={!note.trim()}>Refine</button>
        <button type="button" class="secondary small" onclick={() => (refining = false)}>Close</button>
      </form>
    {/if}
    {#if palette.rationale}<p class="rationale">{palette.rationale}</p>{/if}
    {#if !palette.schemeCheck.matches}
      <p class="note warning">
        These hues are about {Math.round(palette.schemeCheck.deviation)}° away from a {palette.scheme} scheme.
      </p>
    {/if}
  </header>

  {#each palette.colors as color (color.name)}
    <section class="color" aria-label={color.label}>
      <h4>{color.label}{#if color.role}<span class="role">{color.role}</span>{/if}</h4>
      <ul class="swatches">
        {#each color.swatches as swatch (swatch.step)}
          {@const key = `${color.name}-${swatch.step}`}
          <li>
            <button
              type="button"
              class="swatch"
              style:background={swatch.hex}
              style:color={swatch.text.text === 'white' ? '#fff' : '#000'}
              onclick={() => copy(swatch.display, key)}
              aria-label="{color.label} {swatch.step}: {swatch.display}{swatch.gamutMapped ? ', adjusted to fit sRGB' : ''}. {swatch.text.text === 'white' ? 'White' : 'Black'} text {swatch.text.ratio.toFixed(1)} to 1, {LEVEL_LABELS[swatch.text.level]}. Copy value."
            >
              <span class="step">{swatch.step}{#if swatch.gamutMapped}<span aria-hidden="true">*</span>{/if}</span>
              <span class="value">{copied === key ? 'Copied' : compact(swatch.display)}</span>
              <span class="badge" data-level={swatch.text.level} aria-hidden="true">
                {swatch.text.ratio.toFixed(1)} {LEVEL_LABELS[swatch.text.level]}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/each}

  <p class="note">
    Click a swatch to copy its value. Badges show contrast with the text color on it.
    {#if adjusted}* Adjusted to fit the sRGB colors most screens can show.{/if}
  </p>

  <div class="tabs" role="tablist" aria-label="{SCHEME_LABELS[palette.scheme]} details">
    {#each TABS as [value, label]}
      <button
        type="button"
        role="tab"
        id="{id}-tab-{value}"
        aria-selected={tab === value}
        aria-controls="{id}-panel"
        tabindex={tab === value ? 0 : -1}
        onclick={() => selectTab(value)}
        onkeydown={tabKeydown}>{label}</button
      >
    {/each}
  </div>

  <div class="panel" id="{id}-panel" role="tabpanel" aria-labelledby="{id}-tab-{tab}">
    {#if tab === 'tokens'}
      {#if formatted.error}
        <p class="failure" role="alert">{formatted.error}</p>
      {:else}
        <div class="tokens">
          <div class="tokens-bar">
            <button type="button" class="secondary small" onclick={() => copy(formatted.tokens!, 'all')}>
              {copied === 'all' ? 'Copied' : 'Copy'}
            </button>
            <button type="button" class="secondary small" onclick={download}>Download .{FORMAT_EXTENSIONS[format]}</button>
          </div>
          <pre><code>{formatted.tokens}</code></pre>
        </div>
      {/if}
      {#if copyFailed}<p class="note warning" role="status">Couldn't copy. Select the text and copy it by hand.</p>{/if}
    {:else if tab === 'preview'}
      <PalettePreview {palette} />
    {:else}
      <ContrastMatrix {palette} id="{id}-contrast" />
    {/if}
  </div>
</article>

<style>
  .palette {
    display: grid;
    gap: var(--space-4);
    padding-block: var(--space-4);
    border-top: 1px solid var(--color-border);
    min-width: 0;
  }

  /* Let long token lines scroll inside their box instead of widening the card. */
  .palette > * {
    min-width: 0;
  }

  .palette.busy .color,
  .palette.busy .tabs,
  .palette.busy .panel {
    opacity: 0.5;
  }

  header {
    display: grid;
    gap: var(--space-2);
  }

  .title-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
  }

  .actions {
    display: flex;
    gap: var(--space-2);
  }

  h3 {
    font-size: 1.0625rem;
  }

  h4 {
    font-size: 0.875rem;
    font-weight: 600;
    display: flex;
    gap: var(--space-2);
    align-items: baseline;
    margin-bottom: var(--space-2);
  }

  .role {
    font-weight: 400;
    color: var(--color-text-muted);
  }

  .rationale {
    color: var(--color-text-muted);
  }

  .refine {
    display: flex;
    gap: var(--space-2);
  }

  .status {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-text-muted);
    font-size: 0.875rem;
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
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius);
    background: var(--color-danger-bg);
    color: var(--color-danger);
    font-size: 0.875rem;
  }

  .failure pre {
    white-space: pre-wrap;
    font-size: 0.75rem;
    color: var(--color-text);
  }

  .color {
    container-type: inline-size;
  }

  .swatches {
    list-style: none;
    padding: 0;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    border-radius: var(--radius);
    overflow: hidden;
  }

  @container (width < 40rem) {
    .swatches {
      grid-auto-flow: row;
      grid-template-columns: repeat(auto-fill, minmax(5rem, 1fr));
    }
  }

  .swatch {
    display: grid;
    align-content: space-between;
    justify-items: start;
    gap: var(--space-2);
    width: 100%;
    height: 100%;
    min-height: 5.5rem;
    padding: var(--space-2);
    border: none;
    border-radius: 0;
    font-size: 0.75rem;
    font-weight: 400;
    text-align: left;
    overflow: hidden;
  }

  .swatch:hover {
    filter: none;
    box-shadow: inset 0 0 0 2px currentColor;
  }

  .swatch:focus-visible {
    outline-offset: -4px;
  }

  .step {
    font-weight: 600;
  }

  .value {
    font-family: var(--font-mono);
    font-size: 0.625rem;
    overflow-wrap: break-word;
    opacity: 0.85;
  }

  .badge {
    font-size: 0.625rem;
    font-weight: 600;
    padding: 0 0.3em;
    border-radius: 3px;
    border: 1px solid currentColor;
    white-space: nowrap;
  }

  .badge[data-level='fail'],
  .badge[data-level='AA-large'] {
    border-style: dashed;
    opacity: 0.8;
  }

  .note {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  .note.warning {
    color: var(--color-warning);
  }

  .tabs {
    display: flex;
    gap: var(--space-1);
    border-bottom: 1px solid var(--color-border);
  }

  [role='tab'] {
    background: transparent;
    color: var(--color-text-muted);
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    padding: var(--space-2) var(--space-3);
    font-weight: 500;
  }

  [role='tab'][aria-selected='true'] {
    color: var(--color-text);
    border-bottom-color: var(--color-accent);
  }

  .tokens {
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .tokens-bar {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }

  pre {
    margin: 0;
    padding: var(--space-3);
    overflow-x: auto;
    font-size: 0.8125rem;
    line-height: 1.6;
    max-height: 24rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
