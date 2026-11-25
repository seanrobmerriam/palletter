<script lang="ts">
  import '../lib/client/icons';
  import { tick } from 'svelte';
  import { Alert, Badge, Button, Input, Tabs } from 'sv5ui';
  import { SCHEME_LABELS } from '../lib/client/form';
  import { FORMAT_EXTENSIONS, formatPalette, FormatError } from '../lib/format/index';
  import { resolvePalette } from '../lib/palette/resolve';
  import type { ColorSystem, ModelPalette, TokenFormat } from '../lib/prompt/schema';
  import ContrastMatrix from './ContrastMatrix.svelte';
  import PalettePreview from './PalettePreview.svelte';
  import Swatch from './Swatch.svelte';

  type Props = {
    source: ModelPalette;
    /** The agent's palette before balancing, when balancing changed it. */
    original?: ModelPalette;
    /** What balancing changed. */
    notes?: string[];
    format: TokenFormat;
    system: ColorSystem;
    namingPattern: string;
    busy?: boolean;
    status?: string;
    error?: { message: string; detail?: string };
    /** Agent actions. Without them, the card shows no Regenerate or Refine buttons. */
    onRegenerate?: () => void;
    onRefine?: (note: string) => void;
    onCancel?: () => void;
  };

  let { source, original, notes = [], format, system, namingPattern, busy = false, status = '', error, onRegenerate, onRefine, onCancel }: Props = $props();

  const id = $props.id();
  /** Show the palette before balancing instead of the balanced one. Resets when the palette changes. */
  let showOriginal = $state(false);
  $effect(() => {
    void source;
    showOriginal = false;
  });
  const shown = $derived(showOriginal && original ? original : source);
  const palette = $derived(resolvePalette(shown, system));
  const formatted = $derived.by(() => {
    try {
      return { tokens: formatPalette(palette, { format, namingPattern }) };
    } catch (e) {
      if (e instanceof FormatError) return { error: e.message };
      throw e;
    }
  });
  const adjusted = $derived(palette.colors.some((c) => c.swatches.some((s) => s.gamutMapped)));

  const TABS = [
    { value: 'tokens', label: 'Tokens' },
    { value: 'preview', label: 'Preview' },
    { value: 'contrast', label: 'Contrast' },
  ];

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

  async function startRefine() {
    refining = true;
    await tick();
    document.getElementById(`${id}-note`)?.focus();
  }

  function submitRefine(event: SubmitEvent) {
    event.preventDefault();
    if (!note.trim()) return;
    onRefine?.(note.trim());
    refining = false;
    note = '';
  }


</script>
<article class="palette grid min-w-0 gap-4 border-t border-outline-variant pt-4" class:busy aria-labelledby="{id}-title" aria-busy={busy}>
  <header class="grid min-w-0 gap-2">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 id="{id}-title" class="text-base font-semibold">{SCHEME_LABELS[palette.scheme]}</h3>
      <div class="flex gap-2">
        {#if busy}
          <Button label="Cancel" onclick={onCancel} />
        {:else if onRegenerate && onRefine}
          <Button label="Regenerate" leadingIcon="lucide:refresh-cw" onclick={onRegenerate} />
          <Button
            label="Refine…"
            leadingIcon="lucide:wand-sparkles"
            onclick={startRefine}
            aria-expanded={refining}
          />
        {/if}
      </div>
    </div>
    {#if busy}
      <p class="flex items-center gap-2 text-sm text-on-surface-variant" role="status">
        <span class="spinner" aria-hidden="true"></span>{status}
      </p>
    {/if}
    {#if error}
      <Alert color="error" icon="lucide:circle-alert" title={error.message} role="alert">
        {#snippet descriptionSlot()}
          {#if error?.detail}
            <details>
              <summary class="cursor-pointer">Details</summary>
              <pre class="mt-2 text-xs whitespace-pre-wrap text-on-surface">{error.detail}</pre>
            </details>
          {/if}
        {/snippet}
      </Alert>
    {/if}
    {#if refining && !busy}
      <form class="flex gap-2" onsubmit={submitRefine}>
        <Input
          id="{id}-note"
          bind:value={note}
          placeholder="e.g. make the secondary warmer"
          aria-label="What should change?"
          maxlength={500}
        />
        <Button type="submit" label="Refine" disabled={!note.trim()} />
        <Button label="Close" onclick={() => (refining = false)} />
      </form>
    {/if}
    {#if palette.rationale}<p class="rationale text-on-surface-variant">{palette.rationale}</p>{/if}
    {#if original}
      <div class="balance flex flex-col items-start gap-2 text-sm text-on-surface-variant sm:flex-row sm:items-center sm:gap-3">
        <p class="min-w-0 sm:flex-1" aria-live="polite">
          {#if showOriginal}
            Showing the palette before Palletter balanced it.
          {:else}
            <span class="font-medium text-on-surface">Balanced.</span>
            {notes.length ? notes.join(' ') : 'Palletter made small adjustments.'}
          {/if}
        </p>
        <Button
          label={showOriginal ? 'Show balanced' : 'Show before balancing'}
          aria-pressed={showOriginal}
          onclick={() => (showOriginal = !showOriginal)}
        />
      </div>
    {/if}
    {#if !palette.schemeCheck.matches}
      <p class="text-sm text-warning">
        These hues are about {Math.round(palette.schemeCheck.deviation)}° away from a {palette.scheme} scheme.
      </p>
    {/if}
  </header>

  {#each palette.colors as color (color.name)}
    <section class="color min-w-0" aria-label={color.label}>
      <h4 class="mb-2 flex items-center gap-2 text-sm font-semibold">
        {color.label}{#if color.role}<Badge label={color.role} />{/if}
      </h4>
      <ul class="swatches">
        {#each color.swatches as swatch (swatch.step)}
          <Swatch {color} {swatch} {system} {format} {namingPattern} />
        {/each}
      </ul>
    </section>
  {/each}

  <p class="text-sm text-on-surface-variant">
    Use <span class="sr-only">the details button</span><span aria-hidden="true">ⓘ</span> for a swatch's values and contrast, and the copy button to copy its value.
    {#if adjusted}* Adjusted to fit the sRGB colors most screens can show.{/if}
  </p>

  <Tabs items={TABS} defaultValue="tokens" aria-label="{SCHEME_LABELS[palette.scheme]} details" >
    {#snippet body({ item })}
      {#if item.value === 'tokens'}
        {#if formatted.error}
          <Alert color="error" icon="lucide:circle-alert" title={formatted.error} role="alert" />
        {:else}
          <div class="tokens overflow-hidden rounded-md border border-outline-variant">
            <div class="flex justify-end gap-2 border-b border-outline-variant px-3 py-2">
              <Button
                label={copied === 'all' ? 'Copied' : 'Copy'}
                leadingIcon="lucide:copy"
                onclick={() => copy(formatted.tokens!, 'all')}
              />
              <Button
                label="Download .{FORMAT_EXTENSIONS[format]}"
                leadingIcon="lucide:download"
                onclick={download}
              />
            </div>
            <pre class="m-0 max-h-96 overflow-x-auto p-3 text-[0.8125rem] leading-relaxed"><code>{formatted.tokens}</code></pre>
          </div>
        {/if}
        {#if copyFailed}<p class="mt-2 text-sm text-warning" role="status">Couldn't copy. Select the text and copy it by hand.</p>{/if}
      {:else if item.value === 'preview'}
        <PalettePreview {palette} />
      {:else}
        <ContrastMatrix {palette} id="{id}-contrast" />
      {/if}
    {/snippet}
  </Tabs>
</article>

<style>
  /* Let long token lines scroll inside their box instead of widening the card. */
  .palette > :global(*) {
    min-width: 0;
  }

  .palette.busy .color {
    opacity: 0.5;
  }

  .color {
    container-type: inline-size;
  }

  .swatches {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    border-radius: var(--radius-md, 0.375rem);
    overflow: hidden;
  }

  @container (width < 40rem) {
    .swatches {
      grid-auto-flow: row;
      grid-template-columns: repeat(auto-fill, minmax(5rem, 1fr));
    }
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
