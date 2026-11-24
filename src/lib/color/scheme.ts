/**
 * Color-wheel relationships for each scheme. These are reference angles: the prompt gives them to
 * the model as a starting point, and Palletter warns when a result strays far from them.
 */
import type { Oklch } from 'culori';
import { isCharacterScheme, type CharacterScheme, type Scheme } from '../prompt/schema';

export type AngleScheme = Exclude<Scheme, CharacterScheme>;

/**
 * Hue offsets in degrees from the base hue. Tetradic uses the rectangle form. Character schemes
 * (neutral + accent, functional, sourced) have no reference angles.
 */
export const SCHEME_OFFSETS: Record<AngleScheme, readonly number[]> = {
  monochromatic: [0],
  analogous: [-30, 0, 30],
  complementary: [0, 180],
  'split-complementary': [0, 150, 210],
  triadic: [0, 120, 240],
  tetradic: [0, 60, 180, 240],
  tonal: [-15, 0, 15],
};

/** The scheme's reference offsets, or `undefined` for a character scheme. */
export function schemeOffsets(scheme: Scheme): readonly number[] | undefined {
  return isCharacterScheme(scheme) ? undefined : SCHEME_OFFSETS[scheme];
}

export const normalizeHue = (h: number) => ((h % 360) + 360) % 360;

/** The shortest distance between two hues, 0–180. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(normalizeHue(a) - normalizeHue(b));
  return d > 180 ? 360 - d : d;
}

/** The reference hues of a scheme for a base hue. A character scheme has only the base hue. */
export function schemeHues(baseHue: number, scheme: Scheme): number[] {
  return (schemeOffsets(scheme) ?? [0]).map((offset) => normalizeHue(baseHue + offset));
}

/** Below this chroma a color reads as grey, so its hue doesn't count. */
export const ACHROMATIC_CHROMA = 0.03;

/** The hue of the most saturated step, or `undefined` if every step is grey. */
export function representativeHue(steps: Oklch[]): number | undefined {
  const vivid = steps.filter((s) => s.c >= ACHROMATIC_CHROMA);
  if (vivid.length === 0) return undefined;
  const best = vivid.reduce((a, b) => (b.c > a.c ? b : a));
  return normalizeHue(best.h ?? 0);
}

/**
 * How far a set of hues is from the scheme: the largest distance, in degrees, between any hue and
 * its nearest reference hue, using whichever base hue fits best. 0 is a perfect fit.
 * Returns 0 when there are no hues (an all-grey palette fits any scheme), and for a character
 * scheme, which has no reference angles.
 */
export function schemeDeviation(hues: number[], scheme: Scheme): number {
  const offsets = schemeOffsets(scheme);
  if (hues.length === 0 || !offsets) return 0;
  const worstFor = (base: number) => {
    const targets = schemeHues(base, scheme);
    return Math.max(...hues.map((h) => Math.min(...targets.map((t) => hueDistance(h, t)))));
  };

  // Candidate base hues: each actual hue placed exactly on each reference angle, plus every
  // whole degree, so the best fit is found to within half a degree.
  const candidates = [
    ...hues.flatMap((h) => offsets.map((offset) => h - offset)),
    ...Array.from({ length: 360 }, (_, degree) => degree),
  ];
  return Math.min(...candidates.map(worstFor));
}

/** How far the model may nudge a hue from its reference angle (`color-theory.md`). */
export const MODEL_HUE_LEEWAY = 35;

/** The most the common cast pulls a hue toward the lead's (`palette/harmonize.ts`). */
export const CAST_MAX = 12;

/**
 * Deviation above which Palletter warns that a palette doesn't look like the requested scheme:
 * the model's leeway plus Palletter's own pull, so balancing never sets off the warning.
 */
export const SCHEME_WARNING_DEGREES = MODEL_HUE_LEEWAY + CAST_MAX;

export type SchemeCheck = { deviation: number; matches: boolean };

/** Check a palette, given each color's steps, against its scheme. */
export function checkScheme(colors: Oklch[][], scheme: Scheme): SchemeCheck {
  const hues = colors.map(representativeHue).filter((h): h is number => h !== undefined);
  const deviation = schemeDeviation(hues, scheme);
  return { deviation, matches: deviation <= SCHEME_WARNING_DEGREES };
}
