/**
 * Design Tokens Community Group format (https://www.designtokens.org/tr/drafts/format/).
 * Colors use the structured color value from the DTCG color module.
 */
import { converter } from 'culori';
import type { ResolvedPalette, ResolvedSwatch } from '../palette/resolve';
import type { ColorSystem } from '../prompt/schema';

const toHsl = converter('hsl');

export type DtcgColorValue = {
  colorSpace: 'oklch' | 'srgb' | 'hsl';
  components: [number, number, number];
  alpha?: number;
  hex: string;
};

export type DtcgToken = {
  $value: DtcgColorValue;
  $extensions?: Record<string, unknown>;
};

/** Extension namespace for data the DTCG format has no field for. */
export const EXTENSION_KEY = 'dev.palletter';

const round = (v: number, decimals: number) => {
  const r = Number(v.toFixed(decimals));
  return Object.is(r, -0) ? 0 : r;
};

export function dtcgColorValue(swatch: ResolvedSwatch, system: ColorSystem): DtcgColorValue {
  const alpha = swatch.oklch.alpha;
  const withAlpha = alpha !== undefined && alpha < 1 ? { alpha: round(alpha, 3) } : {};

  if (system === 'oklch') {
    const { l, c, h } = swatch.oklch;
    const hue = c < 0.0005 ? 0 : (h ?? 0);
    return { colorSpace: 'oklch', components: [round(l, 4), round(c, 4), round(hue, 2)], ...withAlpha, hex: swatch.hex };
  }

  if (system === 'hsl') {
    const hsl = toHsl(swatch.srgb);
    const hue = hsl.s > 0.0005 ? (hsl.h ?? 0) : 0;
    return {
      colorSpace: 'hsl',
      components: [round(hue, 2), round(hsl.s * 100, 2), round(hsl.l * 100, 2)],
      ...withAlpha,
      hex: swatch.hex,
    };
  }

  const { r, g, b } = swatch.srgb;
  return { colorSpace: 'srgb', components: [round(r, 4), round(g, 4), round(b, 4)], ...withAlpha, hex: swatch.hex };
}

/** A DTCG JSON document, with one group per color and one token per step. */
export function formatDtcg(palette: ResolvedPalette): string {
  const doc: Record<string, unknown> = {};
  if (palette.rationale) doc.$description = palette.rationale;

  for (const color of palette.colors) {
    const group: Record<string, unknown> = { $type: 'color' };
    if (color.role) group.$description = color.role;
    for (const swatch of color.swatches) {
      const token: DtcgToken = { $value: dtcgColorValue(swatch, palette.colorSystem) };
      const extension: Record<string, unknown> = {};
      if (palette.colorSystem === 'cmyk') extension.cmyk = swatch.display;
      if (swatch.gamutMapped) extension.gamutMapped = true;
      if (Object.keys(extension).length > 0) token.$extensions = { [EXTENSION_KEY]: extension };
      group[swatch.step] = token;
    }
    doc[color.name] = group;
  }

  return `${JSON.stringify(doc, null, 2)}\n`;
}
