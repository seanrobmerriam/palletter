import { describe, expect, it } from 'vitest';
import { analogous, neutral } from '../../../test/fixtures/palettes';
import { resolvePalette } from '../palette/resolve';
import { COLOR_SYSTEMS, TOKEN_FORMATS } from '../prompt/schema';
import { formatPalette, FormatError } from './index';

describe('formatPalette', () => {
  for (const format of TOKEN_FORMATS) {
    for (const system of COLOR_SYSTEMS) {
      it(`${format} in ${system}`, () => {
        expect(formatPalette(resolvePalette(analogous, system), { format })).toMatchSnapshot();
      });
    }
  }

  it('produces valid JSON for dtcg', () => {
    const json = JSON.parse(formatPalette(resolvePalette(analogous, 'oklch'), { format: 'dtcg' }));
    expect(json.brand.$type).toBe('color');
    expect(json.brand['500'].$value).toMatchObject({ colorSpace: 'oklch', components: [0.628, 0.177, 259.8] });
    expect(json['sea-glass']['500'].$value.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('marks gamut-mapped colors in dtcg', () => {
    const json = JSON.parse(formatPalette(resolvePalette(analogous, 'hex'), { format: 'dtcg' }));
    expect(json['sea-glass']['500'].$extensions).toEqual({ 'dev.palletter': { gamutMapped: true } });
    expect(json.brand['500'].$extensions).toBeUndefined();
  });

  it('uses the naming pattern for css', () => {
    const css = formatPalette(resolvePalette(analogous, 'hex'), { format: 'css', namingPattern: '--[role]-[step]' });
    expect(css).toContain('--primary-500: ');
    expect(css).toContain('--secondary-900: ');
  });

  it('ignores the naming pattern for tailwind, which needs --color-*', () => {
    const css = formatPalette(resolvePalette(analogous, 'hex'), { format: 'tailwind', namingPattern: '--[role]-[step]' });
    expect(css).toContain('--color-brand-500: ');
  });

  it('formats greys', () => {
    expect(formatPalette(resolvePalette(neutral, 'oklch'), { format: 'css' })).toBe(
      ':root {\n  --color-gray-50: oklch(98.5% 0 0);\n  --color-gray-950: oklch(14.5% 0 0);\n}\n',
    );
  });

  it('throws when the pattern gives two tokens the same name', () => {
    const palette = resolvePalette(analogous, 'hex');
    expect(() => formatPalette(palette, { format: 'css', namingPattern: '--color-[name]' })).toThrow(FormatError);
    expect(() => formatPalette(palette, { format: 'css', namingPattern: '--color-[step]' })).toThrow(
      /Brand 100 and Sea Glass 100 would both be named --color-100/,
    );
  });
});
