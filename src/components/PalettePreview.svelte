<script lang="ts">
  import type { ResolvedPalette } from '../lib/palette/resolve';
  import { previewThemes, themeStyle } from '../lib/client/preview';

  let { palette }: { palette: ResolvedPalette } = $props();

  const themes = $derived(previewThemes(palette));
  const primaryName = $derived(palette.colors[0]?.label ?? '');
  const accentName = $derived(palette.colors[1]?.label ?? primaryName);
  const fallbacks = $derived([...new Set([...themes.light.fallbacks, ...themes.dark.fallbacks])]);
</script>

<div class="previews">
  {#each [['Light', themes.light], ['Dark', themes.dark]] as const as [label, theme]}
    <section class="preview" style={themeStyle(theme)} aria-label="{label} preview">
      <div class="card">
        <p class="eyebrow">{label}</p>
        <h4>Ship your next idea</h4>
        <p class="body">
          Plan, build, and launch with your team. <a href="#preview" onclick={(e) => e.preventDefault()}>Read the guide</a>
          to get started.
        </p>
        <div class="alert">New: {accentName} is your accent color.</div>
        <div class="buttons">
          <span class="button primary">Get started</span>
          <span class="button outline">Learn more</span>
          <span class="badge">Beta</span>
        </div>
      </div>
    </section>
  {/each}
</div>
<p class="note">
  {primaryName} drives the page, buttons, and text{#if palette.colors.length > 1}; {accentName} is the accent{/if}.
  {#if fallbacks.length}
    No step was readable for {fallbacks.join(', ')}, so the preview uses black or white there.
  {/if}
</p>

<style>
  .previews {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: 0.75rem;
  }

  .preview {
    padding: 1rem;
    border-radius: var(--radius-md, 0.375rem);
    background: var(--p-background);
  }

  .card {
    display: grid;
    gap: 0.75rem;
    padding: 1rem;
    border-radius: var(--radius-md, 0.375rem);
    background: var(--p-surface);
    border: 1px solid var(--p-border);
    color: var(--p-text);
  }

  .eyebrow {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--p-muted);
  }

  h4 {
    font-size: 1.125rem;
  }

  .body {
    color: var(--p-muted);
    font-size: 0.875rem;
  }

  a {
    color: var(--p-link);
  }

  .alert {
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius-md, 0.375rem);
    background: var(--p-accent-soft);
    color: var(--p-on-accent-soft);
    font-size: 0.8125rem;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }

  .button {
    padding: 0.25rem 0.75rem;
    border-radius: var(--radius-md, 0.375rem);
    font-size: 0.8125rem;
    font-weight: 600;
  }

  .primary {
    background: var(--p-primary);
    color: var(--p-on-primary);
  }

  .outline {
    border: 1px solid var(--p-primary);
    color: var(--p-link);
  }

  .badge {
    padding: 0 0.5rem;
    border-radius: 999px;
    background: var(--p-accent);
    color: var(--p-on-accent);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .note {
    margin-top: 0.5rem;
    font-size: 0.8125rem;
    color: var(--color-on-surface-variant);
  }
</style>
