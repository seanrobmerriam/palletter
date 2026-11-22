import { describe, expect, it } from 'vitest';
import { bestTextColor, contrastLevel, contrastPairs, contrastRatio } from './contrast';

describe('contrast', () => {
  it('is 21:1 for black on white and 1:1 for a color on itself', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#2563eb', '#2563eb')).toBeCloseTo(1, 5);
  });

  it('matches a known pair', () => {
    // #767676 on white is the classic lightest grey that passes AA.
    expect(contrastRatio('#767676', '#fff')).toBeCloseTo(4.54, 2);
  });

  it('maps ratios to WCAG levels at the boundaries', () => {
    expect(contrastLevel(7)).toBe('AAA');
    expect(contrastLevel(6.99)).toBe('AA');
    expect(contrastLevel(4.5)).toBe('AA');
    expect(contrastLevel(4.49)).toBe('AA-large');
    expect(contrastLevel(3)).toBe('AA-large');
    expect(contrastLevel(2.99)).toBe('fail');
  });

  it('picks the text color with more contrast', () => {
    expect(bestTextColor('#1e3a8a').text).toBe('white');
    expect(bestTextColor('#dbeafe').text).toBe('black');
    expect(bestTextColor('#000').ratio).toBeCloseTo(21, 5);
  });

  it('compares out-of-gamut colors as they would be shown in sRGB', () => {
    const wide = { mode: 'oklch' as const, l: 0.7, c: 0.35, h: 145 };
    expect(Number.isFinite(contrastRatio(wide, '#fff'))).toBe(true);
    expect(contrastRatio(wide, '#fff')).toBeGreaterThan(1);
  });

  it('returns every unordered pair once', () => {
    const swatches = ['#fff', '#888', '#000'].map((hex, i) => ({ color: 'gray', step: String(i), value: hex }));
    const pairs = contrastPairs(swatches);
    expect(pairs).toHaveLength(3);
    expect(pairs[1]).toMatchObject({ a: { step: '0' }, b: { step: '2' }, level: 'AAA' });
  });
});

describe('contrastRatio input', () => {
  it('throws on a string that is not a color', () => {
    expect(() => contrastRatio('nope', '#fff')).toThrow(TypeError);
  });
});
