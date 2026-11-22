/**
 * Colors for the sample UI that previews a palette in light and dark. Each role takes the step
 * whose lightness is closest to a target. Text that wouldn't be readable falls back to black or
 * white, and the fallback is reported so the UI can say so.
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

/** The swatch whose lightness is closest to `lightness` (0–1). */
export function nearestStep(color: ResolvedColor, lightness: number): ResolvedSwatch {
  return color.swatches.reduce((best, s) =>
    Math.abs(s.oklch.l - lightness) < Math.abs(best.oklch.l - lightness) ? s : best,
  );
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
  const primary = palette.colors[0]!;
  const accent = palette.colors[1] ?? primary;
  const fallbacks: PreviewRole[] = [];
  const pick = (color: ResolvedColor, [l]: [number]) => nearestStep(color, l).hex;

  /** Use the step if it's readable on the background (4.5:1), otherwise black or white. */
  const readable = (role: PreviewRole, color: ResolvedColor, target: [number], background: string, min = 4.5) => {
    const hex = pick(color, target);
    if (contrastRatio(hex, background) >= min) return hex;
    fallbacks.push(role);
    return textOn(background);
  };

  const background = pick(primary, spec.background);
  const surface = spec.surface === 'white' ? WHITE : pick(primary, spec.surface);
  const primaryFill = pick(primary, spec.primary);
  const accentFill = pick(accent, spec.accent);
  const accentSoft = pick(accent, spec.accentSoft);

  return {
    colors: {
      background,
      surface,
      border: pick(primary, spec.border),
      text: readable('text', primary, spec.text, surface),
      muted: readable('muted', primary, spec.muted, surface),
      link: readable('link', primary, spec.link, surface),
      primary: primaryFill,
      onPrimary: textOn(primaryFill),
      accent: accentFill,
      onAccent: textOn(accentFill),
      accentSoft,
      onAccentSoft: readable('onAccentSoft', accent, spec.onAccentSoft, accentSoft),
    },
    fallbacks,
  };
}

export function previewThemes(palette: ResolvedPalette): { light: PreviewTheme; dark: PreviewTheme } {
  return { light: theme(palette, LIGHT), dark: theme(palette, DARK) };
}

/** CSS custom properties for a theme, for a `style` attribute. */
export function themeStyle({ colors }: PreviewTheme): string {
  return Object.entries(colors)
    .map(([role, value]) => `--p-${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value}`)
    .join('; ');
}
