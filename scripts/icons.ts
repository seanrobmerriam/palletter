/**
 * Copy the Lucide icons Palletter uses into src/lib/client/icons.json, so they work offline.
 * SV5UI draws icons with Iconify, which would otherwise fetch each one from api.iconify.design.
 *
 *   bun run icons
 *
 * Add an icon name to ICONS when you use a new one. A unit test fails if a `lucide:` icon is
 * referenced in src/ but missing from the JSON.
 */
import lucide from '@iconify-json/lucide/icons.json' with { type: 'json' };

export const ICONS = [
  // Used by SV5UI components Palletter uses.
  'check',
  'chevron-down',
  'chevron-up',
  'chevrons-up-down',
  'loader-circle',
  'minus',
  'plus',
  'x',
  'sun',
  'moon',
  'pipette',
  // Used by Palletter.
  'copy',
  'download',
  'refresh-cw',
  'wand-sparkles',
  'circle-alert',
  'triangle-alert',
  'info',
  'palette',
  'trash-2',
];

const all = lucide.icons as Record<string, unknown>;
const allAliases = (lucide as { aliases?: Record<string, { parent: string }> }).aliases ?? {};
const icons: Record<string, unknown> = {};
const aliases: Record<string, { parent: string }> = {};
for (const name of ICONS) {
  if (all[name]) {
    icons[name] = all[name];
  } else if (allAliases[name]) {
    // Some names are aliases of another icon; keep both.
    const parent = allAliases[name].parent;
    icons[parent] = all[parent];
    aliases[name] = { parent };
  } else {
    throw new Error(`Lucide has no icon called "${name}"`);
  }
}

const subset = { prefix: lucide.prefix, width: lucide.width, height: lucide.height, icons, aliases };
await Bun.write('src/lib/client/icons.json', `${JSON.stringify(subset)}\n`);
console.log(`Wrote ${ICONS.length} icons to src/lib/client/icons.json`);
