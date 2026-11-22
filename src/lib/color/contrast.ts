/**
 * WCAG 2 contrast checks. All colors are compared in sRGB, after gamut mapping, because that's
 * what most screens will show.
 */
import { parse, wcagContrast, type Color } from 'culori';
import { toSrgbGamut } from './gamut';

export type ContrastLevel = 'AAA' | 'AA' | 'AA-large' | 'fail';

/** A culori color object, or any CSS color string. */
export type ColorInput = Color | string;

function toColor(input: ColorInput): Color {
  if (typeof input !== 'string') return input;
  const color = parse(input);
  if (!color) throw new TypeError(`Not a color: "${input}"`);
  return color;
}

/** Contrast ratio from 1 to 21. */
export function contrastRatio(a: ColorInput, b: ColorInput): number {
  return wcagContrast(toSrgbGamut(toColor(a)), toSrgbGamut(toColor(b)));
}

/**
 * - AAA: 7:1, enhanced contrast for text.
 * - AA: 4.5:1, normal text.
 * - AA-large: 3:1, large text (24px, or 18.66px bold) and UI components.
 */
export function contrastLevel(ratio: number): ContrastLevel {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA-large';
  return 'fail';
}

const WHITE: Color = { mode: 'rgb', r: 1, g: 1, b: 1 };
const BLACK: Color = { mode: 'rgb', r: 0, g: 0, b: 0 };

export type TextColor = { text: 'white' | 'black'; ratio: number; level: ContrastLevel };

/** Whether white or black text reads better on this background. */
export function bestTextColor(background: ColorInput): TextColor {
  const onWhite = contrastRatio(background, WHITE);
  const onBlack = contrastRatio(background, BLACK);
  const [text, ratio] = onWhite >= onBlack ? (['white', onWhite] as const) : (['black', onBlack] as const);
  return { text, ratio, level: contrastLevel(ratio) };
}

export type SwatchRef = { color: string; step: string };
export type ContrastPair = { a: SwatchRef; b: SwatchRef; ratio: number; level: ContrastLevel };

/**
 * Contrast for every pair of swatches in a palette. Pairs from the same color are included,
 * since text in one step on a background in another step of the same color is common.
 */
export function contrastPairs(swatches: Array<SwatchRef & { value: ColorInput }>): ContrastPair[] {
  const pairs: ContrastPair[] = [];
  for (let i = 0; i < swatches.length; i++) {
    for (let j = i + 1; j < swatches.length; j++) {
      const a = swatches[i]!;
      const b = swatches[j]!;
      const ratio = contrastRatio(a.value, b.value);
      pairs.push({
        a: { color: a.color, step: a.step },
        b: { color: b.color, step: b.step },
        ratio,
        level: contrastLevel(ratio),
      });
    }
  }
  return pairs;
}
