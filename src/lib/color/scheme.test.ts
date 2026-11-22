import { describe, expect, it } from 'vitest';
import { checkScheme, hueDistance, representativeHue, schemeDeviation, schemeHues } from './scheme';

const swatch = (h: number, c = 0.15) => ({ mode: 'oklch' as const, l: 0.6, c, h });

describe('hues', () => {
  it('measures the short way around the wheel', () => {
    expect(hueDistance(10, 350)).toBe(20);
    expect(hueDistance(0, 180)).toBe(180);
    expect(hueDistance(-30, 30)).toBe(60);
  });

  it('places scheme hues around a base hue', () => {
    expect(schemeHues(30, 'complementary')).toEqual([30, 210]);
    expect(schemeHues(10, 'analogous')).toEqual([340, 10, 40]);
    expect(schemeHues(0, 'triadic')).toEqual([0, 120, 240]);
  });

  it('uses the most saturated step as the representative hue', () => {
    expect(representativeHue([swatch(200, 0.05), swatch(220, 0.2)])).toBe(220);
  });

  it('has no representative hue for a grey', () => {
    expect(representativeHue([swatch(200, 0.01)])).toBeUndefined();
  });
});

describe('schemeDeviation', () => {
  it('is 0 for an exact fit, wherever the base hue is', () => {
    expect(schemeDeviation([40, 220], 'complementary')).toBeCloseTo(0);
    expect(schemeDeviation([300, 60, 180], 'triadic')).toBeCloseTo(0);
    expect(schemeDeviation([350, 20, 50], 'analogous')).toBeCloseTo(0);
  });

  it('measures the worst hue', () => {
    // The best base is 350°, which puts both hues 10° off.
    expect(schemeDeviation([0, 160], 'complementary')).toBeCloseTo(10, 0);
  });

  it('is large when the hues do not match the scheme', () => {
    expect(schemeDeviation([0, 90], 'monochromatic')).toBeGreaterThan(35);
  });

  it('is 0 with no hues', () => {
    expect(schemeDeviation([], 'tetradic')).toBe(0);
  });
});

describe('checkScheme', () => {
  it('ignores grey colors', () => {
    const result = checkScheme([[swatch(250)], [swatch(80, 0.01)]], 'monochromatic');
    expect(result).toEqual({ deviation: 0, matches: true });
  });

  it('flags a palette that does not match', () => {
    expect(checkScheme([[swatch(0)], [swatch(90)]], 'complementary').matches).toBe(false);
  });
});
