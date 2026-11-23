import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import icons from './icons.json';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(svelte|ts|astro)$/.test(name) ? [path] : [];
  });
}

describe('bundled icons', () => {
  it('include every lucide icon used in src', () => {
    const used = new Set(files('src').flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/lucide:([a-z0-9-]+)/g)].map((m) => m[1]!)));
    const available = new Set([...Object.keys(icons.icons), ...Object.keys(icons.aliases ?? {})]);
    expect([...used].filter((name) => !available.has(name))).toEqual([]);
  });

  it('include the icons SV5UI uses for the components Palletter shows', () => {
    // Defaults from SV5UI's config: loading spinners, close buttons, select and accordion chevrons,
    // checkbox ticks, the theme toggle, and number steppers.
    for (const name of ['loader-circle', 'x', 'chevron-down', 'check', 'sun', 'moon', 'plus', 'minus']) {
      expect(icons.icons, name).toHaveProperty(name);
    }
  });
});
