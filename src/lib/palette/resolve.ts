/**
 * Turn a validated palette from the model into everything the UI and formatters need: converted
 * values, gamut flags, text contrast, and a scheme check.
 */
import { convertColor, parseOklch, type ConvertedColor } from '../color/convert';
import { bestTextColor, contrastPairs, type ContrastPair, type TextColor } from '../color/contrast';
import { checkScheme, type SchemeCheck } from '../color/scheme';
import { slugify } from '../format/naming';
import { STEPS, type ColorSystem, type ModelPalette, type Scheme, type Step } from '../prompt/schema';

export type ResolvedSwatch = ConvertedColor & {
  step: Step;
  /** Whether white or black text reads better on this swatch. */
  text: TextColor;
};

export type ResolvedColor = {
  /** Slug used in token names, e.g. "sky-blue". */
  name: string;
  /** The name as the model wrote it, e.g. "Sky Blue". */
  label: string;
  role?: string;
  /** Lightest first. */
  swatches: ResolvedSwatch[];
};

export type ResolvedPalette = {
  scheme: Scheme;
  rationale: string;
  colorSystem: ColorSystem;
  colors: ResolvedColor[];
  schemeCheck: SchemeCheck;
};

export function resolvePalette(palette: ModelPalette, colorSystem: ColorSystem): ResolvedPalette {
  const colors = palette.colors.map((color): ResolvedColor => {
    const swatches = STEPS.flatMap((step): ResolvedSwatch[] => {
      const raw = color.steps[step];
      if (raw === undefined) return [];
      const oklch = parseOklch(raw);
      // The schema has already checked this, so a failure here is a bug.
      if (!oklch) throw new Error(`Invalid oklch color "${raw}" for ${color.name} ${step}`);
      const converted = convertColor(oklch, colorSystem);
      return [{ ...converted, step, text: bestTextColor(converted.srgb) }];
    });
    return {
      name: slugify(color.name),
      label: color.name,
      ...(color.role ? { role: color.role } : {}),
      swatches,
    };
  });

  return {
    scheme: palette.scheme,
    rationale: palette.rationale,
    colorSystem,
    colors,
    schemeCheck: checkScheme(
      colors.map((c) => c.swatches.map((s) => s.oklch)),
      palette.scheme,
    ),
  };
}

/** Contrast for every pair of swatches in a resolved palette. */
export function paletteContrast(palette: ResolvedPalette): ContrastPair[] {
  return contrastPairs(
    palette.colors.flatMap((c) => c.swatches.map((s) => ({ color: c.name, step: s.step, value: s.srgb }))),
  );
}
