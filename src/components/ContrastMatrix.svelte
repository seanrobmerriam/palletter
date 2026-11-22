<script lang="ts">
  import { contrastLevel, contrastRatio } from '../lib/color/contrast';
  import type { ResolvedPalette } from '../lib/palette/resolve';

  let { palette, id }: { palette: ResolvedPalette; id: string } = $props();

  let textName = $state('');
  let backgroundName = $state('');

  $effect(() => {
    if (!palette.colors.some((c) => c.name === textName)) textName = palette.colors[0]?.name ?? '';
    if (!palette.colors.some((c) => c.name === backgroundName)) backgroundName = palette.colors[0]?.name ?? '';
  });

  const text = $derived(palette.colors.find((c) => c.name === textName) ?? palette.colors[0]!);
  const background = $derived(palette.colors.find((c) => c.name === backgroundName) ?? palette.colors[0]!);

  const LEVEL_LABELS = { AAA: 'AAA', AA: 'AA', 'AA-large': 'AA large', fail: 'Fails' } as const;
</script>

<div class="controls">
  <label for="{id}-text">Text</label>
  <select id="{id}-text" bind:value={textName}>
    {#each palette.colors as color (color.name)}<option value={color.name}>{color.label}</option>{/each}
  </select>
  <label for="{id}-bg">on background</label>
  <select id="{id}-bg" bind:value={backgroundName}>
    {#each palette.colors as color (color.name)}<option value={color.name}>{color.label}</option>{/each}
  </select>
</div>

<div class="scroll">
  <table>
    <caption class="visually-hidden">
      Contrast of {text.label} text (columns) on {background.label} backgrounds (rows)
    </caption>
    <thead>
      <tr>
        <th scope="col"><span class="visually-hidden">Background step</span></th>
        {#each text.swatches as fg (fg.step)}<th scope="col">{fg.step}</th>{/each}
      </tr>
    </thead>
    <tbody>
      {#each background.swatches as bg (bg.step)}
        <tr>
          <th scope="row">{bg.step}</th>
          {#each text.swatches as fg (fg.step)}
            {@const ratio = contrastRatio(fg.srgb, bg.srgb)}
            {@const level = contrastLevel(ratio)}
            <td style:background={bg.hex} style:color={fg.hex} data-level={level} title="{text.label} {fg.step} on {background.label} {bg.step}: {ratio.toFixed(2)}:1, {LEVEL_LABELS[level]}">
              <span class="sample">Aa</span>
              <span class="ratio">{ratio.toFixed(1)}</span>
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
<p class="legend">
  Each cell is {text.label} text on a {background.label} background. Normal text needs 4.5:1 (AA), large text and
  icons 3:1. Faded cells fail both.
</p>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.875rem;
    margin-bottom: var(--space-3);
  }

  .controls select {
    width: auto;
  }

  .scroll {
    overflow-x: auto;
  }

  table {
    border-collapse: collapse;
    font-size: 0.6875rem;
  }

  th {
    font-weight: 600;
    color: var(--color-text-muted);
    padding: var(--space-1);
    text-align: center;
  }

  td {
    min-width: 2.75rem;
    height: 2.75rem;
    padding: 2px;
    text-align: center;
    vertical-align: middle;
    border: 1px solid var(--color-surface);
  }

  td[data-level='fail'] .sample,
  td[data-level='fail'] .ratio {
    opacity: 0.45;
  }

  .sample {
    display: block;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .ratio {
    font-family: var(--font-mono);
  }

  .legend {
    margin-top: var(--space-2);
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }
</style>
