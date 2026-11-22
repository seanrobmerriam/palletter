import { describe, expect, it } from 'vitest';
import {
  anyToOklch,
  convertColor,
  formatCmyk,
  formatHsl,
  formatOklch,
  formatRgb,
  parseOklch,
  rgbToCmyk,
  type Oklch,
} from './convert';

const rgb = (r: number, g: number, b: number) => ({ mode: 'rgb' as const, r: r / 255, g: g / 255, b: b / 255 });
const blue = anyToOklch('#2563eb')!;

describe('parseOklch', () => {
  it('reads percentage and number lightness', () => {
    expect(parseOklch('oklch(62.8% 0.177 259.8)')).toMatchObject({ l: 0.628, c: 0.177, h: 259.8 });
    expect(parseOklch('oklch(0.628 0.177 259.8)')).toMatchObject({ l: 0.628, c: 0.177, h: 259.8 });
  });

  it('treats a missing hue as 0', () => {
    expect(parseOklch('oklch(50% 0 none)')).toMatchObject({ l: 0.5, c: 0, h: 0 });
  });

  it('keeps alpha', () => {
    expect(parseOklch('oklch(50% 0.1 200 / 50%)')?.alpha).toBe(0.5);
  });

  it.each(['#2563eb', 'rgb(0 0 0)', 'oklab(50% 0.1 0.1)', 'oklch(120% 0.1 200)', 'oklch(50% -0.1 200)', 'oklch(', ''])(
    'rejects %s',
    (value) => {
      expect(parseOklch(value)).toBeUndefined();
    },
  );
});

describe('formatters', () => {
  it('formats oklch with trimmed precision', () => {
    expect(formatOklch({ mode: 'oklch', l: 0.628, c: 0.177, h: 259.8 })).toBe('oklch(62.8% 0.177 259.8)');
    expect(formatOklch({ mode: 'oklch', l: 0.5, c: 0.03, h: 120 })).toBe('oklch(50% 0.03 120)');
  });

  it('prints hue 0 for greys instead of noise', () => {
    expect(formatOklch({ mode: 'oklch', l: 0.5, c: 0.0001, h: 87.3 })).toBe('oklch(50% 0 0)');
  });

  it('includes alpha only when it is below 1', () => {
    expect(formatOklch({ mode: 'oklch', l: 0.5, c: 0.1, h: 200, alpha: 0.5 })).toBe('oklch(50% 0.1 200 / 50%)');
    expect(formatOklch({ mode: 'oklch', l: 0.5, c: 0.1, h: 200, alpha: 1 })).toBe('oklch(50% 0.1 200)');
  });

  it('formats rgb in modern syntax', () => {
    expect(formatRgb(rgb(37, 99, 235))).toBe('rgb(37 99 235)');
  });

  it('formats hsl in modern syntax', () => {
    expect(formatHsl(rgb(37, 99, 235))).toBe('hsl(221 83% 53%)');
    expect(formatHsl(rgb(128, 128, 128))).toBe('hsl(0 0% 50%)');
  });

  it('converts to cmyk', () => {
    expect(formatCmyk(rgb(37, 99, 235))).toBe('cmyk(84% 58% 0% 8%)');
    expect(formatCmyk(rgb(0, 0, 0))).toBe('cmyk(0% 0% 0% 100%)');
    expect(formatCmyk(rgb(255, 255, 255))).toBe('cmyk(0% 0% 0% 0%)');
    expect(rgbToCmyk(rgb(255, 0, 0))).toEqual({ c: 0, m: 1, y: 1, k: 0 });
  });
});

describe('convertColor', () => {
  it('round-trips an sRGB color through every system', () => {
    expect(convertColor(blue, 'hex')).toMatchObject({ value: '#2563eb', display: '#2563eb', gamutMapped: false });
    expect(convertColor(blue, 'rgb').value).toBe('rgb(37 99 235)');
    expect(convertColor(blue, 'hsl').value).toBe('hsl(221 83% 53%)');
    expect(convertColor(blue, 'oklch').value).toMatch(/^oklch\(54\.\d% 0\.2\d* 26\d(\.\d)?\)$/);
  });

  it('uses hex as the CSS value for cmyk and shows cmyk to the user', () => {
    expect(convertColor(blue, 'cmyk')).toMatchObject({ value: '#2563eb', display: 'cmyk(84% 58% 0% 8%)' });
  });

  it('does not flag white or black as out of gamut', () => {
    for (const hex of ['#ffffff', '#000000']) {
      const color = anyToOklch(hex)!;
      expect(convertColor(color, 'hex')).toMatchObject({ value: hex, outOfSrgb: false, gamutMapped: false });
    }
  });

  describe('a color outside sRGB', () => {
    const wide: Oklch = { mode: 'oklch', l: 0.7, c: 0.35, h: 145 };

    it('keeps the original value in oklch', () => {
      expect(convertColor(wide, 'oklch')).toMatchObject({
        value: 'oklch(70% 0.35 145)',
        outOfSrgb: true,
        gamutMapped: false,
      });
    });

    it.each(['rgb', 'hex', 'hsl', 'cmyk'] as const)('is mapped into gamut for %s', (system) => {
      const result = convertColor(wide, system);
      expect(result.outOfSrgb).toBe(true);
      expect(result.gamutMapped).toBe(true);
      for (const channel of [result.srgb.r, result.srgb.g, result.srgb.b]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    });
  });
});
