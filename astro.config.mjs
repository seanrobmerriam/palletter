// @ts-check
import { defineConfig } from 'astro/config';
import bun from '@igloczek/astro-bun-adapter';
import svelte from '@astrojs/svelte';

// https://astro.build/config
export default defineConfig({
  // ACP agents run as local processes, so Palletter needs a server to spawn and talk to them.
  output: 'server',
  // Generation streams for longer than Bun's default 10-second idle timeout; the API also sends keep-alives.
  adapter: bun({ mode: 'standalone', idleTimeout: 60 }),
  integrations: [svelte()],
});
