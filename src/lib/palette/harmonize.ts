/**
 * Make a palette from the model look balanced, with rules Palletter applies itself instead of
 * trusting the model to follow them:
 *
 * 1. **Chroma hierarchy.** One color leads at full chroma. Supporting colors are capped at a
 *    share of the lead's peak chroma, so they don't compete with it. Accents and neutrals are
 *    left alone: accents are meant to be loud in small doses, and neutrals are already quiet.
 * 2. **Hue drift.** Each scale shifts hue a little with lightness: dark steps toward blue-violet
 *    (or toward brown, for yellows and ambers) and light steps the other way, as real pigments
 *    do. The model keeps each scale's hue steady, and Palletter adds the drift.
 *
 * Exact colors the user gave are never changed, and a color that holds one isn't capped.
 * Steps that were in sRGB stay in sRGB.
 */
import type { Oklch } from 'culori';
import { anyToOklch, formatOklch, parseOklch } from '../color/convert';
import { isInSrgb } from '../color/gamut';
import { hueDistance, normalizeHue } from '../color/scheme';
import type { ModelColor, ModelPalette, PaletteRequest, Step } from '../prompt/schema';

/** Supporting colors peak at no more than this share of the lead color's peak chroma. */
export const SUPPORT_CHROMA_RATIO = 0.7;

/** A color whose peak chroma is below this reads as a neutral. */
export const NEUTRAL_PEAK_CHROMA = 0.04;

/** Hue drift, in degrees, at the darkest and lightest ends of a scale. */
export const DARK_DRIFT = 7;
export const LIGHT_DRIFT = 5;

/** The lightness the drift reaches its full amount at, at each end. */
const DARKEST = 0.25;
const LIGHTEST = 0.97;

const LEAD_ROLE = /\b(primary|brand|main|lead)\b/i;
const ACCENT_ROLE = /\b(accent|highlight|pop|cta)\b/i;
const NEUTRAL_ROLE = /\b(neutral|gr[ae]y|surface|background)\b/i;

export type ColorKind = 'lead' | 'support' | 'accent' | 'neutral';

type Parsed = { color: ModelColor; steps: [Step, Oklch][]; peak: number; pinned?: Step };

/** The user's exact colors, in the order they gave them. */
function exactColors(request: PaletteRequest): Oklch[] {
  return request.hues.flatMap((hue) => {
    const oklch = hue.value ? anyToOklch(hue.value) : undefined;
    return oklch ? [oklch] : [];
  });
}

/** Whether a step is one of the user's exact colors, allowing for rounding in the prompt. */
function sameColor(a: Oklch, b: Oklch): boolean {
  if (Math.abs(a.l - b.l) > 0.006 || Math.abs(a.c - b.c) > 0.006) return false;
  return Math.max(a.c, b.c) < 0.03 || hueDistance(a.h ?? 0, b.h ?? 0) <= 2;
}

/** Which colors lead, support, accent, or are neutral. Exactly one color leads, if any is colorful. */
export function classifyColors(
  colors: { role?: string; peak: number; holdsFirstExact?: boolean }[],
): ColorKind[] {
  const kinds: ColorKind[] = colors.map((c) =>
    c.peak < NEUTRAL_PEAK_CHROMA || (c.role && NEUTRAL_ROLE.test(c.role)) ? 'neutral' : 'support',
  );
  const candidates = colors.map((_, i) => i).filter((i) => kinds[i] !== 'neutral');
  const lead =
    candidates.find((i) => LEAD_ROLE.test(colors[i]!.role ?? '')) ??
    candidates.find((i) => colors[i]!.holdsFirstExact) ??
    candidates.find((i) => !ACCENT_ROLE.test(colors[i]!.role ?? '')) ??
    candidates[0];
  for (const i of candidates) {
    if (i === lead) kinds[i] = 'lead';
    else if (ACCENT_ROLE.test(colors[i]!.role ?? '')) kinds[i] = 'accent';
  }
  return kinds;
}

/**
 * Which way a hue drifts as it gets darker: +1 toward higher hues, −1 toward lower. Dark steps
 * head toward blue-violet, except yellows and ambers, which head toward orange and brown rather
 * than olive.
 */
export function darkDirection(hue: number): 1 | -1 {
  const h = normalizeHue(hue);
  if (h >= 60 && h < 115) return -1;
  if (h >= 115 && h < 265) return 1;
  return -1;
}

/** The hue shift, in degrees, for a step at lightness `l` in a scale anchored at `anchor`. */
export function hueDrift(hue: number, l: number, anchor: number): number {
  const direction = darkDirection(hue);
  if (l < anchor) {
    const t = Math.min(1, (anchor - l) / Math.max(anchor - DARKEST, 0.05));
    return direction * DARK_DRIFT * t;
  }
  const t = Math.min(1, (l - anchor) / Math.max(LIGHTEST - anchor, 0.05));
  return -direction * LIGHT_DRIFT * t;
}

/** Chroma within this of the peak counts as a tie when choosing a scale's anchor. */
const CHROMA_TIE = 0.002;
const MID_LIGHTNESS = 0.6;

/** The most colorful color; of near-ties, the one nearest mid lightness. */
export function mostColorful(colors: Oklch[]): Oklch | undefined {
  const peak = Math.max(...colors.map((c) => c.c));
  return colors
    .filter((c) => c.c >= peak - CHROMA_TIE)
    .reduce<Oklch | undefined>(
      (best, c) => (!best || Math.abs(c.l - MID_LIGHTNESS) < Math.abs(best.l - MID_LIGHTNESS) ? c : best),
      undefined,
    );
}

/** Lower chroma until the color fits in sRGB. */
function fitSrgb(color: Oklch): Oklch {
  if (isInSrgb(color)) return color;
  let low = 0;
  let high = color.c;
  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2;
    if (isInSrgb({ ...color, c: mid })) low = mid;
    else high = mid;
  }
  return { ...color, c: low };
}

export type HarmonizeOptions = {
  /** Cap supporting colors' chroma. Off for `pure` saturation, which asks for every hue at its limit. */
  chromaHierarchy?: boolean;
  /** Add hue drift along each scale. */
  hueDrift?: boolean;
};

export function harmonizePalette(
  palette: ModelPalette,
  request: PaletteRequest,
  options: HarmonizeOptions = {},
): ModelPalette {
  const { chromaHierarchy = request.saturation !== 'pure', hueDrift: drift = true } = options;
  const exact = exactColors(request);

  const parsed: Parsed[] = palette.colors.map((color) => {
    const steps = Object.entries(color.steps).flatMap(([step, value]): [Step, Oklch][] => {
      const oklch = value === undefined ? undefined : parseOklch(value);
      return oklch ? [[step as Step, oklch]] : [];
    });
    const pinned = steps.find(([, oklch]) => exact.some((e) => sameColor(e, oklch)))?.[0];
    const peak = Math.max(0, ...steps.map(([, oklch]) => oklch.c));
    return { color, steps, peak, ...(pinned ? { pinned } : {}) };
  });

  const first = exact[0];
  const kinds = classifyColors(
    parsed.map((p) => ({
      ...(p.color.role ? { role: p.color.role } : {}),
      peak: p.peak,
      holdsFirstExact: first !== undefined && p.steps.some(([, oklch]) => sameColor(first, oklch)),
    })),
  );
  const leadPeak = parsed[kinds.indexOf('lead')]?.peak;

  const colors = parsed.map((p, i): ModelColor => {
    const cap =
      chromaHierarchy && kinds[i] === 'support' && !p.pinned && leadPeak !== undefined
        ? SUPPORT_CHROMA_RATIO * leadPeak
        : Infinity;
    const scale = p.peak > cap ? cap / p.peak : 1;

    // Drift is measured from the step that defines the color: the user's exact color, or the
    // most colorful step (the one nearest the middle of the scale, if several tie).
    const anchor = p.pinned ? p.steps.find(([step]) => step === p.pinned)?.[1] : mostColorful(p.steps.map(([, c]) => c));

    const steps = Object.fromEntries(
      p.steps.map(([step, original]) => {
        if (step === p.pinned || !anchor) return [step, p.color.steps[step]!];
        let next: Oklch = { ...original, c: original.c * scale };
        if (drift && original.c > 0) {
          next.h = normalizeHue((anchor.h ?? 0) + hueDrift(anchor.h ?? 0, original.l, anchor.l));
        }
        if (isInSrgb(original)) next = fitSrgb(next);
        const formatted = formatOklch(next);
        // Keep the model's text when nothing visible changed.
        return [step, formatted === formatOklch(original) ? p.color.steps[step]! : formatted];
      }),
    );
    return { ...p.color, steps };
  });

  return { ...palette, colors };
}
