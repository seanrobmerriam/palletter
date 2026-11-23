// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import bun from '@igloczek/astro-bun-adapter';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // ACP agents run as local processes, so Palletter needs a server to spawn and talk to them.
  output: 'server',
  // Generation streams for longer than Bun's default 10-second idle timeout; the API also sends keep-alives.
  adapter: bun({ mode: 'standalone', idleTimeout: 60 }),
  integrations: [svelte()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        // SV5UI is built for SvelteKit; a few of its components read `$app/state`.
        '$app/state': fileURLToPath(new URL('./src/lib/shims/app-state.ts', import.meta.url)),
      },
    },
    ssr: {
      // Let Vite compile SV5UI's Svelte components for server rendering.
      noExternal: ['sv5ui', 'bits-ui', 'mode-watcher', 'svelte-sonner', 'vaul-svelte'],
    },
  },
});
