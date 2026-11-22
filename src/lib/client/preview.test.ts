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
