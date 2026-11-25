<script lang="ts">
  import '../lib/client/icons';
  import { Alert, Badge, Button, Checkbox } from 'sv5ui';
  import { convertColor, parseOklch } from '../lib/color/convert';
  import type { SuggestedColor, YourColor } from '../lib/suggest/schema';

  export type Suggestion = {
    id: string;
    color: SuggestedColor;
    kept: boolean;
    /** The name of the suggestion this is an alternative to, from "More like this". */
    variantOf?: string;
  };

  export type DirectionView = {
    id: string;
    name: string;
    summary: string;
    yours: YourColor[];
    suggestions: Suggestion[];
    /** The suggestion "More like this" is working on. */
    busyId?: string;
    error?: { message: string; detail?: string };
  };

  type Props = {
    direction: DirectionView;
    /** Another request is running, so follow-ups are paused. */
    disabled: boolean;
    onToggle: (suggestion: Suggestion, kept: boolean) => void;
    onKeepAll: () => void;
    onMoreLike: (suggestion: Suggestion) => void;
  };

  let { direction, disabled, onToggle, onKeepAll, onMoreLike }: Props = $props();
  const id = $props.id();

  const hexOf = (value: string) => {
    const oklch = parseOklch(value);
    return oklch ? convertColor(oklch, 'hex').hex : '#888888';
  };
  const allKept = $derived(direction.suggestions.every((s) => s.kept));
</script>

<article class="direction grid min-w-0 gap-3 border-t border-outline-variant pt-4" aria-labelledby="{id}-name">
  <header class="grid gap-1">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 id="{id}-name" class="text-base font-semibold">{direction.name}</h3>
      <Button label={allKept ? 'All kept' : 'Keep all'} leadingIcon="lucide:check-check" disabled={allKept} onclick={onKeepAll} />
    </div>
    {#if direction.summary}<p class="text-on-surface-variant">{direction.summary}</p>{/if}
  </header>

  <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm" aria-label="Your colors in {direction.name}" role="group">
    <span class="text-on-surface-variant">Your colors:</span>
    {#each direction.yours as color}
      <span class="flex items-center gap-1.5">
        <span class="chip" style:background={hexOf(color.value)} aria-hidden="true"></span>
        {color.name}
        <span class="text-on-surface-variant">({color.role})</span>
      </span>
    {/each}
  </div>

  <ul class="grid gap-2" aria-label="Suggested colors">
    {#each direction.suggestions as suggestion (suggestion.id)}
      {@const hex = hexOf(suggestion.color.value)}
      <li class="suggestion grid min-w-0 gap-3" class:kept={suggestion.kept} class:variant={suggestion.variantOf}>
        <span class="suggestion-swatch" style:background={hex} aria-hidden="true"></span>
        <div class="grid min-w-0 gap-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-semibold">{suggestion.color.name}</span>
            <Badge label={suggestion.color.role} />
            <code class="text-xs text-on-surface-variant">{hex}</code>
          </div>
          <p class="text-sm text-on-surface-variant">
            {#if suggestion.variantOf}<span class="italic">Like {suggestion.variantOf}.</span>{/if}
            {suggestion.color.reason}
          </p>
          <div class="flex flex-wrap items-center gap-3">
            <Checkbox
              checked={suggestion.kept}
              onCheckedChange={(kept) => onToggle(suggestion, kept)}
              label="Keep"
              aria-label="Keep {suggestion.color.name}"
            />
            <Button
              label={direction.busyId === suggestion.id ? 'Finding more…' : 'More like this'}
              leadingIcon="lucide:sparkles"
              aria-label="More like {suggestion.color.name}"
              disabled={disabled || direction.busyId !== undefined}
              onclick={() => onMoreLike(suggestion)}
            />
          </div>
        </div>
      </li>
    {/each}
  </ul>

  {#if direction.error}
    <Alert color="error" icon="lucide:circle-alert" title={direction.error.message} role="alert">
      {#snippet descriptionSlot()}
        {#if direction.error?.detail}
          <details>
            <summary class="cursor-pointer">Details</summary>
            <pre class="mt-2 text-xs whitespace-pre-wrap text-on-surface">{direction.error.detail}</pre>
          </details>
        {/if}
      {/snippet}
    </Alert>
  {/if}
</article>

<style>
  .chip {
    width: 0.875rem;
    height: 0.875rem;
    border-radius: 9999px;
    border: 1px solid var(--color-outline-variant);
  }

  .suggestion {
    grid-template-columns: 4rem minmax(0, 1fr);
    align-items: start;
    padding: 0.5rem;
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-md, 0.5rem);
  }

  .suggestion.kept {
    border-color: var(--color-primary);
    box-shadow: inset 0 0 0 1px var(--color-primary);
  }

  .suggestion.variant {
    margin-left: 1.5rem;
  }

  .suggestion-swatch {
    width: 4rem;
    height: 4rem;
    border-radius: var(--radius-sm, 0.25rem);
    border: 1px solid var(--color-outline-variant);
  }
</style>
