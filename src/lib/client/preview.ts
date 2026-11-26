/**
 * Colors for the sample UI that previews a palette in light and dark. Each part of the UI uses the
 * palette color whose role fits it (a background color for the page, a text color for text, a
 * call-to-action color for buttons), falling back to the first and second colors when there are
 * no roles. Each takes the step whose lightness is closest to a target. Text that wouldn't be
 * readable falls back to black or white, and the fallback is reported so the UI can say so.
 */
import { contrastRatio } from '../color/contrast';
import type { ResolvedColor, ResolvedPalette, ResolvedSwatch } from '../palette/resolve';

export type PreviewRole =
  | 'background'
  | 'surface'
  | 'border'
  | 'text'
  | 'muted'
  | 'link'
  | 'primary'
  | 'onPrimary'
  | 'accent'
  | 'onAccent'
  | 'accentSoft'
  | 'onAccentSoft';

export type PreviewTheme = { colors: Record<PreviewRole, string>; fallbacks: PreviewRole[] };

/** Which palette color the preview uses for each part, by label. */
export type PreviewUses = { neutral: string; text: string; action: string; accent: string };

/** Roles for the page itself. These win over surface roles, e.g. "background" over "surface tint". */
const PAGE_ROLE = /\b(background|canvas|page|paper)\b/i;
const BACKGROUND_ROLE = /\b(background|surface|canvas|page|paper|neutral|base)\b/i;
const TEXT_ROLE = /\b(text|ink|body|heading|foreground)\b/i;
const ACTION_ROLE = /\b(primary|call to action|cta|button|action|brand|link)\b/i;
const ACCENT_ROLE = /\b(accent|highlight|pop|badge)\b/i;
/** Used for the accent only when no color's role says accent. */
const SUPPORT_ROLE = /\b(secondary|tertiary|support)\b/i;

/** The palette colors to use for each part of the preview. */
export function previewColors(palette: ResolvedPalette): Record<keyof PreviewUses, ResolvedColor> {
  const colors = palette.colors;
  const withRole = (re: RegExp, skip: ResolvedColor[] = []) => colors.find((c) => c.role && re.test(c.role) && !skip.includes(c));
  const neutral = withRole(PAGE_ROLE) ?? withRole(BACKGROUND_ROLE) ?? colors[0]!;
  const text = withRole(TEXT_ROLE, [neutral]) ?? neutral;
  const special = [neutral, text].filter((c) => c.role && (BACKGROUND_ROLE.test(c.role) || TEXT_ROLE.test(c.role)));
  // A color named as the accent stays the accent, so settle it before the buttons' fallback.
  const namedAccent = withRole(ACCENT_ROLE, special);
  const action =
    withRole(ACTION_ROLE, special) ??
    colors.find((c) => !special.includes(c) && c !== namedAccent) ??
    namedAccent ??
    colors[0]!;
  const accent =
    namedAccent ??
    withRole(SUPPORT_ROLE, [...special, action]) ??
    colors.find((c) => !special.includes(c) && c !== action) ??
    action;
  return { neutral, text, action, accent };
}

/** The swatch whose lightness is closest to `lightness` (0–1). */
export function nearestStep(color: ResolvedColor, lightness: number): ResolvedSwatch {
  return color.swatches.reduce((best, s) =>
    Math.abs(s.oklch.l - lightness) < Math.abs(best.oklch.l - lightness) ? s : best,
  );
}

/**
 * The step closest to `lightness`, but at least one step lighter than `below` when the closest
 * would be the same color. Layers stacked on a dark page (a card, an alert) stay visible even when
 * the scale has no step dark enough for each of them.
 */
function layeredStep(color: ResolvedColor, lightness: number, below: string): string {
  const swatch = nearestStep(color, lightness);
  if (swatch.hex !== below) return swatch.hex;
  const index = color.swatches.indexOf(swatch);
  return (color.swatches[index - 1] ?? swatch).hex;
}

const WHITE = '#ffffff';
const BLACK = '#000000';

const textOn = (background: string) => (contrastRatio(WHITE, background) >= contrastRatio(BLACK, background) ? WHITE : BLACK);

type Spec = {
  background: [number];
  surface: [number] | 'white';
  border: [number];
  text: [number];
  muted: [number];
  link: [number];
  primary: [number];
  accent: [number];
  accentSoft: [number];
  onAccentSoft: [number];
};

const LIGHT: Spec = {
  background: [0.97],
  surface: 'white',
  border: [0.88],
  text: [0.25],
  muted: [0.45],
  link: [0.5],
  primary: [0.55],
  accent: [0.6],
  accentSoft: [0.94],
  onAccentSoft: [0.4],
};

const DARK: Spec = {
  background: [0.2],
  surface: [0.27],
  border: [0.37],
  text: [0.96],
  muted: [0.8],
  link: [0.78],
  primary: [0.7],
  accent: [0.72],
  accentSoft: [0.3],
  onAccentSoft: [0.88],
};

function theme(palette: ResolvedPalette, spec: Spec): PreviewTheme {
  const { neutral, text, action, accent } = previewColors(palette);
  const fallbacks: PreviewRole[] = [];
  const pick = (color: ResolvedColor, [l]: [number]) => nearestStep(color, l).hex;

  /** Use the step if it's readable on the background (4.5:1), otherwise black or white. */
  const readable = (role: PreviewRole, color: ResolvedColor, target: [number], background: string, min = 4.5) => {
    const hex = pick(color, target);
    if (contrastRatio(hex, background) >= min) return hex;
    fallbacks.push(role);
    return textOn(background);
  };

  const background = pick(neutral, spec.background);
  const surface = spec.surface === 'white' ? WHITE : layeredStep(neutral, spec.surface[0], background);
  const primaryFill = pick(action, spec.primary);
  const accentFill = pick(accent, spec.accent);
  // The alert is a quiet neutral box with an accent stripe. A whole box tinted with the accent
  // turns warm accents beige in light mode and brown in dark mode.
  const accentSoft = spec.surface === 'white' ? pick(neutral, spec.accentSoft) : layeredStep(neutral, spec.accentSoft[0], surface);

  return {
    colors: {
      background,
      surface,
      border: spec.surface === 'white' ? pick(neutral, spec.border) : layeredStep(neutral, spec.border[0], surface),
      text: readable('text', text, spec.text, surface),
      muted: readable('muted', text, spec.muted, surface),
      link: readable('link', action, spec.link, surface),
      primary: primaryFill,
      onPrimary: textOn(primaryFill),
      accent: accentFill,
      onAccent: textOn(accentFill),
      accentSoft,
      onAccentSoft: readable('onAccentSoft', text, spec.text, accentSoft),
    },
    fallbacks,
  };
}

export function previewThemes(palette: ResolvedPalette): { light: PreviewTheme; dark: PreviewTheme; uses: PreviewUses } {
  const colors = previewColors(palette);
  return {
    light: theme(palette, LIGHT),
    dark: theme(palette, DARK),
    uses: { neutral: colors.neutral.label, text: colors.text.label, action: colors.action.label, accent: colors.accent.label },
  };
}

/** CSS custom properties for a theme, for a `style` attribute. */
export function themeStyle({ colors }: PreviewTheme): string {
  return Object.entries(colors)
    .map(([role, value]) => `--p-${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value}`)
    .join('; ');
}
