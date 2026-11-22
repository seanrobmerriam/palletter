<script lang="ts">
  // The generator island. Phase 4 builds the form; phase 5 builds the results.
  let hydrated = $state(false);

  $effect(() => {
    hydrated = true;
  });
</script>

<div class="generator" data-hydrated={hydrated}>
  <section class="panel" aria-labelledby="inputs-heading">
    <h2 id="inputs-heading">Describe your palette</h2>
    <p class="muted">The palette form goes here.</p>
  </section>

  <section class="panel" aria-labelledby="results-heading" aria-live="polite">
    <h2 id="results-heading">Palettes</h2>
    <p class="muted">Your palettes will appear here.</p>
  </section>
</div>

<style>
  .generator {
    display: grid;
    gap: var(--space-6);
  }

  @media (min-width: 60rem) {
    .generator {
      grid-template-columns: minmax(20rem, 1fr) 2fr;
      align-items: start;
    }
  }

  .panel {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-6);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
  }

  .muted {
    color: var(--color-text-muted);
  }
</style>
