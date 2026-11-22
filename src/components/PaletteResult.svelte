<script lang="ts">
  import type { ResolvedPalette } from '../lib/palette/resolve';
  import { SCHEME_LABELS } from '../lib/client/form';

  let { palette, tokens }: { palette: ResolvedPalette; tokens: string } = $props();

  let copied = $state(false);
  let copyFailed = $state(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(tokens);
      copied = true;
      copyFailed = false;
      setTimeout(() => (copied = false), 2000);
    } catch {
      copyFailed = true;
    }
  }

  const adjusted = $derived(palette.colors.some((c) => c.swatches.some((s) => s.gamutMapped)));
</script>

<article class="palette" aria-labelledby="palette-{palette.scheme}">
  <header>
    <h3 id="palette-{palette.scheme}">{SCHEME_LABELS[palette.scheme]}</h3>
    {#if palette.rationale}<p class="rationale">{palette.rationale}</p>{/if}
    {#if !palette.schemeCheck.matches}
      <p class="note warning">
        These hues are about {Math.round(palette.schemeCheck.deviation)}° away from a {palette.scheme} scheme.
      </p>
    {/if}
  </header>

  {#each palette.colors as color (color.name)}
    <section class="color" aria-label={color.label}>
      <h4>
        {color.label}{#if color.role}<span class="role">{color.role}</span>{/if}
      </h4>
      <ol class="swatches">
        {#each color.swatches as swatch (swatch.step)}
          <li
            class="swatch"
            style:background={swatch.hex}
            style:color={swatch.text.text === 'white' ? '#fff' : '#000'}
            title="{swatch.display}{swatch.gamutMapped ? ' (adjusted to fit sRGB)' : ''}"
          >
            <span class="step">{swatch.step}{#if swatch.gamutMapped}<span aria-label="adjusted to fit sRGB">*</span>{/if}</span>
            <span class="value">{swatch.display}</span>
          </li>
        {/each}
      </ol>
    </section>
  {/each}

  {#if adjusted}
    <p class="note">* Adjusted to fit the sRGB colors most screens can show.</p>
  {/if}

  <div class="tokens">
    <div class="tokens-bar">
      <span>Tokens</span>
      <button type="button" class="secondary" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
    </div>
    {#if copyFailed}<p class="note warning" role="status">Couldn't copy. Select the tokens and copy them by hand.</p>{/if}
    <pre><code>{tokens}</code></pre>
  </div>
</article>

<style>
  .palette {
    display: grid;
    gap: var(--space-4);
    padding-block: var(--space-4);
    border-top: 1px solid var(--color-border);
  }

  .palette:first-of-type {
    border-top: none;
    padding-top: 0;
  }

  header {
    display: grid;
    gap: var(--space-1);
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

  /* Too narrow for one row: wrap into even rows instead. */
  @container (width < 40rem) {
    .swatches {
      grid-auto-flow: row;
      grid-template-columns: repeat(auto-fill, minmax(5rem, 1fr));
    }
  }

  .swatch {
    display: grid;
    align-content: space-between;
    gap: var(--space-2);
    min-height: 4.5rem;
    padding: var(--space-2);
    font-size: 0.75rem;
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

  .note {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  .note.warning {
    color: var(--color-warning);
  }

  .tokens {
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .tokens-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-border);
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  pre {
    margin: 0;
    padding: var(--space-3);
    overflow-x: auto;
    font-size: 0.8125rem;
    line-height: 1.6;
    max-height: 24rem;
  }
</style>
