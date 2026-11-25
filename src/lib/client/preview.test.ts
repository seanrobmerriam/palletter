import { describe, expect, it } from 'vitest';
import { analogous } from '../../../test/fixtures/palettes';
import { contrastRatio } from '../color/contrast';
import { resolvePalette } from '../palette/resolve';
import type { ModelPalette } from '../prompt/schema';
import { nearestStep, previewThemes, themeStyle } from './preview';

const full: ModelPalette = {
  scheme: 'complementary',
  rationale: '',
  colors: [
    {
      name: 'brand',
      steps: {
        '50': 'oklch(97% 0.014 255)',
        '100': 'oklch(94% 0.03 256)',
        '200': 'oklch(88% 0.059 257)',
        '300': 'oklch(81% 0.1 258)',
        '400': 'oklch(71% 0.15 259)',
        '500': 'oklch(63% 0.17 260)',
        '600': 'oklch(55% 0.18 261)',
        '700': 'oklch(48% 0.16 263)',
        '800': 'oklch(42% 0.14 264)',
        '900': 'oklch(37% 0.12 265)',
        '950': 'oklch(27% 0.08 266)',
      },
    },
    {
      name: 'sun',
      steps: { '100': 'oklch(95% 0.04 85)', '500': 'oklch(78% 0.13 80)', '900': 'oklch(40% 0.07 70)' },
    },
  ],
};

describe('nearestStep', () => {
  it('picks the step closest in lightness', () => {
    const brand = resolvePalette(full, 'hex').colors[0]!;
    expect(nearestStep(brand, 0.56).step).toBe('600');
    expect(nearestStep(brand, 1).step).toBe('50');
    expect(nearestStep(brand, 0).step).toBe('950');
  });
});

describe('previewThemes', () => {
  it('builds readable light and dark themes from a full scale', () => {
    const { light, dark } = previewThemes(resolvePalette(full, 'hex'));
    expect(light.fallbacks).toEqual([]);
    expect(dark.fallbacks).toEqual([]);
    for (const theme of [light, dark]) {
      expect(contrastRatio(theme.colors.text, theme.colors.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.colors.onPrimary, theme.colors.primary)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(theme.colors.onAccentSoft, theme.colors.accentSoft)).toBeGreaterThanOrEqual(4.5);
    }
    expect(light.colors.surface).toBe('#ffffff');
  });

  it('uses the second color as the accent', () => {
    const { light } = previewThemes(resolvePalette(full, 'hex'));
    const sun = resolvePalette(full, 'hex').colors[1]!;
    expect(sun.swatches.map((s) => s.hex)).toContain(light.colors.accent);
  });

  it('falls back to black or white when no step is readable, and says so', () => {
    const lightOnly: ModelPalette = {
      ...full,
      colors: [{ name: 'brand', steps: { '100': 'oklch(94% 0.03 256)', '200': 'oklch(88% 0.059 257)' } }],
    };
    const { light } = previewThemes(resolvePalette(lightOnly, 'hex'));
    expect(light.fallbacks).toContain('text');
    expect(light.colors.text).toBe('#000000');
  });

  it('works with a palette that has one color and few steps', () => {
    const { light, dark } = previewThemes(resolvePalette(analogous, 'oklch'));
    expect(Object.values(light.colors).every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
    expect(Object.values(dark.colors).every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
  });
});

describe('themeStyle', () => {
  it('turns roles into custom properties', () => {
    const style = themeStyle(previewThemes(resolvePalette(full, 'hex')).light);
    expect(style).toMatch(/^--p-background: #[0-9a-f]{6}; --p-surface: #ffffff;/);
    expect(style).toContain('--p-on-accent-soft: #');
  });
});

describe('previewThemes with roles', () => {
  const scale = (hue: number, chroma: number) =>
    Object.fromEntries(
      (['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const).map((step, i) => [
        step,
        `oklch(${[97, 94, 88, 81, 71, 63, 55, 48, 42, 37, 27][i]}% ${chroma} ${hue})`,
      ]),
    );
  // Listed in an order where the first and second colors are not the page and accent colors.
  const roles: ModelPalette = {
    scheme: 'suggested',
    rationale: '',
    colors: [
      { name: 'mint', role: 'primary', steps: scale(152, 0.12) },
      { name: 'aqua', role: 'secondary', steps: scale(200, 0.09) },
      { name: 'bronze', role: 'accent', steps: scale(67, 0.1) },
      { name: 'sand', role: 'background', steps: scale(80, 0.012) },
      { name: 'ink', role: 'text', steps: scale(255, 0.04) },
    ],
  };
  const resolved = resolvePalette(roles, 'hex');
  const hexes = (name: string) => resolved.colors.find((c) => c.name === name)!.swatches.map((s) => s.hex);
  const { light, dark, uses } = previewThemes(resolved);

  it('uses each color for the part its role describes', () => {
    expect(uses).toEqual({ neutral: 'sand', text: 'ink', action: 'mint', accent: 'bronze' });
    expect(hexes('sand')).toContain(light.colors.background);
    expect(hexes('ink')).toContain(light.colors.text);
    expect(hexes('mint')).toContain(light.colors.primary);
    expect(hexes('bronze')).toContain(light.colors.accent);
  });

  it('fills the alert with the neutral, not a tint of the accent', () => {
    expect(hexes('sand')).toContain(light.colors.accentSoft);
    expect(hexes('sand')).toContain(dark.colors.accentSoft);
    expect(hexes('bronze')).not.toContain(light.colors.accentSoft);
  });

  it('keeps the dark page, card, and border distinct', () => {
    expect(new Set([dark.colors.background, dark.colors.surface, dark.colors.border]).size).toBe(3);
  });
});

describe('previewColors with an explicit accent and no action role', () => {
  const steps = (hue: number, chroma: number) => ({ '100': `oklch(94% ${chroma / 4} ${hue})`, '500': `oklch(63% ${chroma} ${hue})`, '900': `oklch(37% ${chroma / 2} ${hue})` });
  const palette: ModelPalette = {
    scheme: 'suggested',
    rationale: '',
    colors: [
      { name: 'coral', role: 'accent', steps: steps(35, 0.15) },
      { name: 'aqua', role: 'secondary', steps: steps(200, 0.09) },
      { name: 'sand', role: 'background', steps: steps(80, 0.012) },
      { name: 'ink', role: 'text', steps: steps(255, 0.04) },
    ],
  };

  it('keeps the explicit accent as the accent, and uses another color for buttons', () => {
    expect(previewThemes(resolvePalette(palette, 'hex')).uses).toMatchObject({ accent: 'coral', action: 'aqua' });
  });
});
