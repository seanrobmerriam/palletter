/**
 * Build palettes from colors the user has chosen (their own, plus suggestions they kept) without
 * asking the agent again. Each color gets a scale built around it, following the same rules the
 * agent follows in `skills/palletter/scales.md`, with the chosen color itself at its nearest step.
 */
import type { Oklch } from 'culori';
import { formatOklch, parseOklch } from '../color/convert';
import { isInSrgb } from '../color/gamut';
import { normalizeHue } from '../color/scheme';
import type { ModelColor, ModelPalette, Step } from '../prompt/schema';

/** Target lightness for each step (scales.md). */
export const STEP_LIGHTNESS: Record<Step, number> = {
  '50': 0.97,
  '100': 0.94,
  '200': 0.88,
  '300': 0.81,
  '400': 0.71,
  '500': 0.63,
  '600': 0.55,
  '700': 0.48,
  '800': 0.42,
  '900': 0.37,
  '950': 0.27,
};

/** Share of the peak chroma at each step: low at the ends, highest in the middle (scales.md). */
export const CHROMA_CURVE: Record<Step, number> = {
  '50': 0.12,
  '100': 0.2,
  '200': 0.35,
  '300': 0.6,
  '400': 0.85,
  '500': 1,
  '600': 0.95,
  '700': 0.85,
  '800': 0.72,
  '900': 0.6,
  '950': 0.45,
};

/** Yellows, ambers, and limes need more lightness in the middle of the scale to stay recognisable. */
const YELLOW_LIFT: Partial<Record<Step, number>> = { '300': 0.03, '400': 0.06, '500': 0.08, '600': 0.06, '700': 0.03 };
const isYellowish = (hue: number) => {
  const h = normalizeHue(hue);
  return h >= 60 && h < 135;
};

/** A chosen color only takes a step if it's within this much lightness of the step's target. */
export const PIN_TOLERANCE = 0.08;
/** Below this chroma, a color is quiet: a background, surface, or text tone. */
export const QUIET_CHROMA = 0.04;
/** The highest peak chroma a scale may have. */
const MAX_PEAK = 0.37;

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
  // Leave a little room, so rounding to the printed precision can't push it back out.
  return { ...color, c: Math.max(0, low - 0.001) };
}

function targetLightness(step: Step, hue: number): number {
  return STEP_LIGHTNESS[step] + (isYellowish(hue) ? (YELLOW_LIFT[step] ?? 0) : 0);
}

/** The step whose target lightness is nearest the color's, if it's close enough to take it. */
export function pinStep(color: Oklch, steps: readonly Step[]): Step | undefined {
  const hue = color.h ?? 0;
  let best: Step | undefined;
  let distance = Infinity;
  for (const step of steps) {
    const d = Math.abs(targetLightness(step, hue) - color.l);
    if (d < distance) {
      distance = d;
      best = step;
    }
  }
  return distance <= PIN_TOLERANCE ? best : undefined;
}

/**
 * A scale for `value` (an oklch string), with exactly `steps`. The color itself sits unchanged at
 * its nearest step; the steps around it follow its lightness offset, fading out over three steps,
 * so the scale stays evenly spaced. Every step keeps the color's hue; hue drift is added when the
 * palette is balanced.
 */
export function buildScale(value: string, steps: readonly Step[]): Partial<Record<Step, string>> {
  const color = parseOklch(value);
  if (!color) throw new Error(`Invalid oklch color "${value}"`);
  const hue = color.h ?? 0;
  const pinned = pinStep(color, steps);
  const allSteps = Object.keys(STEP_LIGHTNESS) as Step[];
  const index = (step: Step) => allSteps.indexOf(step);

  // The peak chroma that puts this color's chroma at its step on the curve.
  const anchor: Step = pinned ?? (allSteps.reduce((a, b) =>
    Math.abs(targetLightness(b, hue) - color.l) < Math.abs(targetLightness(a, hue) - color.l) ? b : a,
  ));
  // A quiet color, such as a background or text tone, stays quiet across its scale rather than
  // growing a saturated middle.
  const quietCap = color.c < QUIET_CHROMA ? Math.max(color.c * 2, 0.02) : MAX_PEAK;
  const peak = Math.min(MAX_PEAK, quietCap, color.c / CHROMA_CURVE[anchor]);
  const offset = pinned ? color.l - targetLightness(pinned, hue) : 0;

  return Object.fromEntries(
    steps.map((step) => {
      if (step === pinned) return [step, value];
      const fade = pinned ? Math.max(0, 1 - Math.abs(index(step) - index(pinned)) / 3) : 0;
      const l = Math.min(0.99, Math.max(0.05, targetLightness(step, hue) + offset * fade));
      const c = color.c < 0.005 ? color.c : peak * CHROMA_CURVE[step];
      return [step, formatOklch(fitSrgb({ mode: 'oklch', l, c, h: hue }))];
    }),
  );
}

/** A color the user chose for their palette. */
export type ChosenColor = { name: string; role?: string; value: string };

/** A palette from the user's chosen colors, ready to balance and resolve. */
export function buildPalette(colors: ChosenColor[], steps: readonly Step[], rationale = ''): ModelPalette {
  return {
    scheme: 'suggested',
    rationale,
    colors: colors.map(
      (color): ModelColor => ({
        name: color.name,
        ...(color.role ? { role: color.role } : {}),
        steps: buildScale(color.value, steps),
      }),
    ),
  };
}
