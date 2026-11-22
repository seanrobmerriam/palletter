import type { ModelPalette } from '../../src/lib/prompt/schema';

/** A two-color analogous palette with a range of steps, including one wide-gamut color. */
export const analogous: ModelPalette = {
  scheme: 'analogous',
  rationale: 'A calm blue brand color with a teal accent.',
  colors: [
    {
      name: 'Brand',
      role: 'primary',
      steps: {
        '100': 'oklch(93.2% 0.032 255.6)',
        '500': 'oklch(62.8% 0.177 259.8)',
        '900': 'oklch(37.9% 0.138 265.5)',
      },
    },
    {
      name: 'Sea Glass',
      role: 'secondary',
      steps: {
        '100': 'oklch(95% 0.05 195)',
        // Outside sRGB: too much chroma for a teal this light.
        '500': 'oklch(75% 0.2 225)',
        '900': 'oklch(38% 0.05 220)',
      },
    },
  ],
};

/** One grey color. */
export const neutral: ModelPalette = {
  scheme: 'monochromatic',
  rationale: '',
  colors: [{ name: 'gray', steps: { '50': 'oklch(98.5% 0 0)', '950': 'oklch(14.5% 0 0)' } }],
};
