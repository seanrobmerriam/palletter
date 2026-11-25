<script lang="ts">
  import '../lib/client/icons';
  import { Button, Icon, Popover } from 'sv5ui';
  import { contrastLevel, contrastRatio } from '../lib/color/contrast';
  import { formatOklch } from '../lib/color/convert';
  import { tokenNameFor } from '../lib/format/naming';
  import type { ResolvedColor, ResolvedSwatch } from '../lib/palette/resolve';
  import type { ColorSystem, TokenFormat } from '../lib/prompt/schema';

  type Props = {
    color: ResolvedColor;
    swatch: ResolvedSwatch;
    system: ColorSystem;
    format: TokenFormat;
    namingPattern: string;
  };

  let { color, swatch, system, format, namingPattern }: Props = $props();

  const LEVEL_LABELS = { AAA: 'AAA', AA: 'AA', 'AA-large': 'AA large', fail: 'fails' } as const;
  const WHITE = { mode: 'rgb' as const, r: 1, g: 1, b: 1 };
  const BLACK = { mode: 'rgb' as const, r: 0, g: 0, b: 0 };

  const name = $derived(`${color.label} ${swatch.step}`);
  const token = $derived(tokenNameFor(format, namingPattern, { name: color.name, role: color.role, step: swatch.step }));
  const onWhite = $derived(contrastRatio(swatch.srgb, WHITE));
  const onBlack = $derived(contrastRatio(swatch.srgb, BLACK));

  let copied = $state<'value' | 'token' | null>(null);
  let copyFailed = $state(false);

  async function copy(text: string, what: 'value' | 'token') {
    try {
      await navigator.clipboard.writeText(text);
      copied = what;
      copyFailed = false;
      setTimeout(() => {
        if (copied === what) copied = null;
      }, 1500);
    } catch {
      copyFailed = true;
    }
  }
</script>

<li class="swatch" style:background={swatch.hex} style:color={swatch.text.text === 'white' ? '#fff' : '#000'}>
  <span class="step">
    {swatch.step}{#if swatch.gamutMapped}<span title="Adjusted to fit sRGB" aria-hidden="true">*</span>{/if}
  </span>
  <span class="actions">
    <Popover>
      {#snippet children({ open })}
        <button type="button" class="icon-button" aria-label="Details for {name}" aria-haspopup="dialog" aria-expanded={open}>
          <Icon name="lucide:info" size={14} />
        </button>
      {/snippet}
      {#snippet content()}
        <div class="grid w-64 gap-3 p-3 text-sm" role="group" aria-label="{name} details">
          <div class="flex items-center gap-2">
            <span class="size-5 shrink-0 rounded border border-outline-variant" style:background={swatch.hex}></span>
            <span class="font-semibold">{name}</span>
          </div>
          <dl class="details">
            <dt>{system}</dt>
            <dd>{swatch.display}</dd>
            {#if token}
              <dt>Token</dt>
              <dd>{token}</dd>
            {/if}
            {#if system !== 'hex'}
              <dt>hex</dt>
              <dd>{swatch.hex}</dd>
            {/if}
            {#if system !== 'oklch'}
              <dt>oklch</dt>
              <dd>{formatOklch(swatch.oklch)}</dd>
            {/if}
            <dt>White text</dt>
            <dd>{onWhite.toFixed(2)}:1 {LEVEL_LABELS[contrastLevel(onWhite)]}</dd>
            <dt>Black text</dt>
            <dd>{onBlack.toFixed(2)}:1 {LEVEL_LABELS[contrastLevel(onBlack)]}</dd>
          </dl>
          {#if swatch.gamutMapped}
            <p class="text-on-surface-variant">Adjusted to fit the sRGB colors most screens can show.</p>
          {/if}
          {#if token}
            <Button
              label={copied === 'token' ? 'Copied' : 'Copy token name'}
              leadingIcon="lucide:copy"
              onclick={() => copy(token!, 'token')}
            />
          {/if}
        </div>
      {/snippet}
    </Popover>
    <button
      type="button"
      class="icon-button"
      aria-label={copied === 'value' ? `Copied ${name}` : `Copy ${name} value`}
      title={copyFailed ? "Couldn't copy" : `Copy ${swatch.display}`}
      onclick={() => copy(swatch.display, 'value')}
    >
      <Icon name={copied === 'value' ? 'lucide:check' : 'lucide:copy'} size={14} />
    </button>
  </span>
</li>

<style>
  .swatch {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 5.5rem;
    padding: 0.5rem;
    font-size: 0.75rem;
  }

  .step {
    font-weight: 600;
  }

  .actions {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.125rem;
  }

  .icon-button {
    display: inline-grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    margin-left: -0.25rem;
    padding: 0;
    border: none;
    border-radius: 0.25rem;
    background: transparent;
    color: inherit;
    cursor: pointer;
    opacity: 0.75;
  }

  .icon-button:hover,
  .icon-button:focus-visible {
    opacity: 1;
    background: color-mix(in srgb, currentColor 15%, transparent);
  }

  .icon-button:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: -2px;
  }

  .details {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.25rem 0.75rem;
    margin: 0;
  }

  .details dt {
    color: var(--color-on-surface-variant);
  }

  .details dd {
    margin: 0;
    font-family: ui-monospace, monospace;
    font-size: 0.75rem;
    overflow-wrap: anywhere;
  }
</style>
