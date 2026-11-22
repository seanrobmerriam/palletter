import { describe, expect, it } from 'vitest';
import { analogous } from '../../../test/fixtures/palettes';
import { paletteContrast, resolvePalette } from './resolve';

describe('resolvePalette', () => {
  const palette = resolvePalette(analogous, 'hex');

  it('slugs names and keeps labels and roles', () => {
    expect(palette.colors.map((c) => [c.name, c.label, c.role])).toEqual([
      ['brand', 'Brand', 'primary'],
      ['sea-glass', 'Sea Glass', 'secondary'],
    ]);
  });

  it('orders swatches lightest first', () => {
    expect(palette.colors[0]!.swatches.map((s) => s.step)).toEqual(['100', '500', '900']);
  });

  it('flags the wide-gamut color', () => {
    const flagged = palette.colors.flatMap((c) => c.swatches.filter((s) => s.gamutMapped).map((s) => `${c.name}-${s.step}`));
    expect(flagged).toEqual(['sea-glass-500']);
  });

  it('picks a text color for each swatch', () => {
    const brand = palette.colors[0]!.swatches;
    expect(brand[0]!.text.text).toBe('black');
    expect(brand[2]!.text.text).toBe('white');
  });

  it('checks the scheme', () => {
    expect(palette.schemeCheck.matches).toBe(true);
  });

  it('computes contrast for every pair', () => {
    // 6 swatches → 15 pairs.
    expect(paletteContrast(palette)).toHaveLength(15);
  });
});
