import { converter } from 'culori';
import { describe, expect, it } from 'vitest';
import { anyToOklch } from './convert';
import { isInP3, isInSrgb, toSrgbGamut } from './gamut';

const toOklch = converter('oklch');

describe('gamut', () => {
  it('counts sRGB colors as in sRGB, including round-trip edge cases', () => {
    for (const hex of ['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#808080']) {
      expect(isInSrgb(anyToOklch(hex)!), hex).toBe(true);
    }
  });

  it('detects a P3 color that sRGB cannot show', () => {
    const p3Green = toOklch({ mode: 'p3', r: 0, g: 1, b: 0 });
    expect(isInSrgb(p3Green)).toBe(false);
    expect(isInP3(p3Green)).toBe(true);
  });

  it('detects a color outside P3 too', () => {
    const extreme = { mode: 'oklch' as const, l: 0.7, c: 0.4, h: 145 };
    expect(isInP3(extreme)).toBe(false);
  });

  it('leaves in-gamut colors unchanged', () => {
    const mapped = toSrgbGamut({ mode: 'rgb', r: 0.2, g: 0.4, b: 0.6 });
    expect(mapped.r).toBeCloseTo(0.2, 10);
    expect(mapped.g).toBeCloseTo(0.4, 10);
    expect(mapped.b).toBeCloseTo(0.6, 10);
  });

  it('maps by reducing chroma, keeping lightness and hue close', () => {
    const wide = { mode: 'oklch' as const, l: 0.7, c: 0.35, h: 145 };
    const mapped = toOklch(toSrgbGamut(wide));
    expect(mapped.l).toBeCloseTo(0.7, 1);
    expect(mapped.h!).toBeCloseTo(145, -1);
    expect(mapped.c).toBeLessThan(wide.c);
  });

  it('clamps very light and very dark colors to white and black', () => {
    expect(toSrgbGamut({ mode: 'oklch', l: 1, c: 0.2, h: 30 })).toMatchObject({ r: 1, g: 1, b: 1 });
    expect(toSrgbGamut({ mode: 'oklch', l: 0, c: 0.2, h: 30 })).toMatchObject({ r: 0, g: 0, b: 0 });
  });
});
