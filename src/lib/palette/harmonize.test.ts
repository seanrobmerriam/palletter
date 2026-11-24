import { describe, expect, it } from 'vitest';
import { formatOklch, parseOklch } from '../color/convert';
import { isInSrgb } from '../color/gamut';
import { hueDistance } from '../color/scheme';
import { PaletteRequestSchema, type ModelColor, type ModelPalette, type PaletteRequestInput } from '../prompt/schema';
import {
  classifyColors,
  darkDirection,
  DARK_DRIFT,
  harmonizePalette,
  mostColorful,
  hueDrift,
  LIGHT_DRIFT,
  SUPPORT_CHROMA_RATIO,
} from './harmonize';

const LIGHTNESS = { '100': 94, '300': 81, '500': 63, '700': 48, '900': 37 } as const;
const CHROMA_SHAPE = { '100': 0.2, '300': 0.6, '500': 1, '700': 0.8, '900': 0.6 } as const;

/** A scale with a steady hue, peaking at step 500. */
function scale(name: string, hue: number, peak: number, role?: string): ModelColor {
  const steps = Object.fromEntries(
    Object.entries(LIGHTNESS).map(([step, l]) => [
      step,
      formatOklch({ mode: 'oklch', l: l / 100, c: peak * CHROMA_SHAPE[step as keyof typeof CHROMA_SHAPE], h: hue }),
    ]),
  );
  return { name, ...(role ? { role } : {}), steps };
}

const palette = (...colors: ModelColor[]): ModelPalette => ({ scheme: 'triadic', rationale: '', colors });
const request = (input: Partial<PaletteRequestInput> = {}) =>
  PaletteRequestSchema.parse({ hues: [{ name: 'blue' }], ...input });

const peak = (color: ModelColor) => Math.max(...Object.values(color.steps).map((v) => parseOklch(v!)!.c));
const hueAt = (color: ModelColor, step: keyof typeof LIGHTNESS) => parseOklch(color.steps[step]!)!.h!;

describe('classifyColors', () => {
  it('leads with the primary role, wherever it is', () => {
    expect(
      classifyColors([
        { role: 'secondary', peak: 0.15 },
        { role: 'primary', peak: 0.15 },
        { role: 'accent', peak: 0.2 },
        { role: 'neutral', peak: 0.01 },
      ]),
    ).toEqual(['support', 'lead', 'accent', 'neutral']);
  });

  it('leads with the color holding the first exact color when no role says primary', () => {
    expect(classifyColors([{ peak: 0.15 }, { peak: 0.15, holdsFirstExact: true }])).toEqual(['support', 'lead']);
  });

  it('otherwise leads with the first colorful color that is not an accent', () => {
    expect(classifyColors([{ peak: 0.01 }, { role: 'accent', peak: 0.2 }, { peak: 0.1 }])).toEqual([
      'neutral',
      'accent',
      'lead',
    ]);
  });

  it('treats low-chroma colors as neutral, whatever their role', () => {
    expect(classifyColors([{ role: 'primary', peak: 0.02 }, { peak: 0.12 }])).toEqual(['neutral', 'lead']);
  });
});

describe('hue drift', () => {
  it('sends dark steps toward blue-violet, and yellows toward brown', () => {
    expect(darkDirection(250)).toBe(1); // blue → indigo
    expect(darkDirection(150)).toBe(1); // green → teal
    expect(darkDirection(95)).toBe(-1); // yellow → orange
    expect(darkDirection(25)).toBe(-1); // red → crimson
    expect(darkDirection(305)).toBe(-1); // violet → indigo
  });

  it('is zero at the anchor and full at the ends', () => {
    expect(hueDrift(250, 0.63, 0.63)).toBeCloseTo(0);
    expect(hueDrift(250, 0.2, 0.63)).toBe(DARK_DRIFT);
    expect(hueDrift(250, 0.99, 0.63)).toBe(-LIGHT_DRIFT);
  });
});

describe('mostColorful', () => {
  it('breaks near-ties toward the middle of the scale', () => {
    const at = (l: number, c: number) => ({ mode: 'oklch' as const, l, c, h: 250 });
    expect(mostColorful([at(0.88, 0.05), at(0.63, 0.05), at(0.37, 0.05)])?.l).toBe(0.63);
    expect(mostColorful([at(0.88, 0.05), at(0.63, 0.04)])?.l).toBe(0.88);
  });
});

describe('harmonizePalette', () => {
  const loud = palette(scale('brand', 250, 0.17, 'primary'), scale('leaf', 145, 0.17, 'secondary'), scale('pop', 25, 0.17, 'accent'), scale('stone', 250, 0.015, 'neutral'));

  it('caps supporting colors below the lead, and leaves the lead, accent, and neutral alone', () => {
    const result = harmonizePalette(loud, request());
    const [brand, leaf, pop, stone] = result.colors.map(peak);
    expect(brand).toBeCloseTo(0.17, 3);
    expect(leaf).toBeCloseTo(SUPPORT_CHROMA_RATIO * 0.17, 2);
    expect(pop).toBeCloseTo(0.17, 3);
    expect(stone).toBeCloseTo(0.015, 3);
  });

  it('keeps the chroma curve when capping', () => {
    const leaf = harmonizePalette(loud, request()).colors[1]!;
    expect(parseOklch(leaf.steps['100']!)!.c / peak(leaf)).toBeCloseTo(0.2, 1);
  });

  it('does not cap with pure saturation', () => {
    const result = harmonizePalette(loud, request({ saturation: 'pure' }));
    expect(peak(result.colors[1]!)).toBeCloseTo(0.17, 3);
  });

  it('leaves supporting colors that are already quieter than the cap', () => {
    const quiet = palette(scale('brand', 250, 0.17, 'primary'), scale('leaf', 145, 0.08, 'secondary'));
    expect(peak(harmonizePalette(quiet, request()).colors[1]!)).toBeCloseTo(0.08, 3);
  });

  it('drifts hue along each scale, anchored at the most colorful step', () => {
    const brand = harmonizePalette(loud, request()).colors[0]!;
    expect(hueAt(brand, '500')).toBeCloseTo(250, 1);
    expect(hueAt(brand, '900')).toBeGreaterThan(250); // toward indigo
    expect(hueAt(brand, '100')).toBeLessThan(250); // toward cyan
    expect(hueDistance(hueAt(brand, '900'), hueAt(brand, '100'))).toBeLessThanOrEqual(DARK_DRIFT + LIGHT_DRIFT);
  });

  it('replaces the model’s own drift instead of adding to it', () => {
    const drifted = scale('brand', 250, 0.15, 'primary');
    drifted.steps['900'] = formatOklch({ ...parseOklch(drifted.steps['900']!)!, h: 270 });
    const once = harmonizePalette(palette(drifted), request()).colors[0]!;
    const steady = harmonizePalette(palette(scale('brand', 250, 0.15, 'primary')), request()).colors[0]!;
    expect(once.steps['900']).toBe(steady.steps['900']);
  });

  it('never changes the user’s exact color, and does not cap the color holding it', () => {
    const exact = 'oklch(63% 0.17 145)';
    const leaf = scale('leaf', 145, 0.17, 'secondary');
    leaf.steps['500'] = exact;
    const result = harmonizePalette(palette(scale('brand', 250, 0.17, 'primary'), leaf), request({ hues: [{ name: 'blue' }, { value: exact }] }));
    const out = result.colors[1]!;
    expect(out.steps['500']).toBe(exact);
    expect(peak(out)).toBeCloseTo(0.17, 3);
    // Drift is measured from the exact color.
    expect(hueAt(out, '900')).toBeGreaterThan(145);
  });

  it('keeps steps that were in sRGB inside sRGB', () => {
    const result = harmonizePalette(palette(scale('brand', 210, 0.105, 'primary')), request());
    for (const value of Object.values(result.colors[0]!.steps)) {
      const before = parseOklch(value!)!;
      expect(isInSrgb(before)).toBe(true);
    }
  });

  it('keeps greys grey', () => {
    const grey = scale('grey', 0, 0, 'neutral');
    expect(harmonizePalette(palette(scale('brand', 250, 0.15, 'primary'), grey), request()).colors[1]).toEqual(grey);
  });
});
