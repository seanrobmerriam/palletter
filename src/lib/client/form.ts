/**
 * The generator form's state, and how it becomes a SuggestRequest (for the agent) and the
 * settings for building and exporting the palette (in the browser).
 * Kept separate from the Svelte component so it can be unit tested.
 */
import { formatHex, parse } from 'culori';
import type { z } from 'zod';
import { STEPS, DEFAULT_NAMING_PATTERN, PaletteRequestSchema, resolveSteps, type Saturation, type Scale } from '../prompt/schema';
import { DEFAULT_DIRECTIONS, SuggestRequestSchema, type SuggestRequestInput } from '../suggest/schema';
import type { ColorSystem, PaletteRequestInput, Scheme, Step, TokenFormat } from '../prompt/schema';

export type HueRow = { text: string; picker: string };
export type RoleRow = { role: string; temperature: '' | 'warm' | 'cool' | 'neutral' };
export type SaturationChoice = '' | 'vivid' | 'pure' | 'muted' | 'pastel' | 'earthy' | 'custom';

export type FormState = {
  hues: HueRow[];
  mood: string;
  tokenFormat: TokenFormat;
  namingPattern: string;
  scaleKind: 'full' | 'range' | 'count';
  from: Step;
  to: Step;
  count: number;
  saturation: SaturationChoice;
  customSaturation: string;
  /** Let Palletter balance the palette. */
  balance: boolean;
  /** How many directions to ask the agent for at a time. */
  directions: number;
  colorSystem: ColorSystem;
  roles: RoleRow[];
  schemes: Scheme[];
};

export function initialFormState(): FormState {
  return {
    hues: [{ text: '#2563eb', picker: '#2563eb' }],
    mood: '',
    tokenFormat: 'css',
    namingPattern: DEFAULT_NAMING_PATTERN,
    scaleKind: 'full',
    from: '100',
    to: '900',
    count: 5,
    saturation: '',
    customSaturation: '',
    balance: true,
    directions: DEFAULT_DIRECTIONS,
    colorSystem: 'oklch',
    roles: [],
    schemes: [],
  };
}

/** `#rrggbb` for any color Palletter can read, or undefined for a name like "terracotta". */
export function toPickerHex(text: string): string | undefined {
  const color = parse(text.trim());
  return color ? formatHex(color) : undefined;
}

/** A hue row is a color value if its text parses as a color, and a color name otherwise. */
export function hueToInput(row: HueRow): { value?: string; name?: string } {
  const text = row.text.trim();
  if (!text) return { value: row.picker };
  return parse(text) ? { value: text } : { name: text };
}

export function toRequestInput(state: FormState): PaletteRequestInput {
  const input: PaletteRequestInput = {
    hues: state.hues.map(hueToInput),
    tokenFormat: state.tokenFormat,
    colorSystem: state.colorSystem,
    schemes: state.schemes,
    scale:
      state.scaleKind === 'full'
        ? { kind: 'full' }
        : state.scaleKind === 'range'
          ? { kind: 'range', from: state.from, to: state.to }
          : { kind: 'count', count: state.count },
  };
  if (state.mood.trim()) input.mood = state.mood.trim();
  if (state.tokenFormat === 'css') input.namingPattern = state.namingPattern.trim();
  if (state.saturation === 'custom') {
    input.saturation = { custom: state.customSaturation.trim() };
  } else if (state.saturation) {
    input.saturation = state.saturation;
  }
  if (!state.balance) input.balance = false;
  const roles = state.roles.filter((r) => r.role.trim());
  if (roles.length) {
    input.roles = roles.map((r) => ({ role: r.role.trim(), ...(r.temperature ? { temperature: r.temperature } : {}) }));
  }
  return input;
}

function scaleOf(state: FormState): Scale {
  return state.scaleKind === 'full'
    ? { kind: 'full' }
    : state.scaleKind === 'range'
      ? { kind: 'range', from: state.from, to: state.to }
      : { kind: 'count', count: state.count };
}

function saturationOf(state: FormState): Saturation | undefined {
  if (state.saturation === 'custom') return { custom: state.customSaturation.trim() };
  return state.saturation || undefined;
}

/** What the agent needs to suggest colors: the colors, what they're for, and any hints. */
export function toSuggestInput(state: FormState): SuggestRequestInput {
  const input: SuggestRequestInput = { hues: state.hues.map(hueToInput), directions: state.directions };
  if (state.mood.trim()) input.purpose = state.mood.trim();
  const saturation = saturationOf(state);
  if (saturation) input.saturation = saturation;
  const roles = state.roles.filter((r) => r.role.trim());
  if (roles.length) {
    input.roles = roles.map((r) => ({ role: r.role.trim(), ...(r.temperature ? { temperature: r.temperature } : {}) }));
  }
  const schemes = state.schemes.filter((s) => s !== 'suggested');
  if (schemes.length) input.schemes = schemes;
  return input;
}

/** How a palette is built and exported from the chosen colors. */
export type BuildSettings = {
  scale: Scale;
  balance: boolean;
  saturation?: Saturation;
  tokenFormat: TokenFormat;
  namingPattern: string;
  colorSystem: ColorSystem;
};

export function toBuildSettings(state: FormState): BuildSettings {
  const saturation = saturationOf(state);
  return {
    scale: scaleOf(state),
    balance: state.balance,
    ...(saturation ? { saturation } : {}),
    tokenFormat: state.tokenFormat,
    namingPattern: state.tokenFormat === 'css' ? state.namingPattern.trim() : DEFAULT_NAMING_PATTERN,
    colorSystem: state.colorSystem,
  };
}

/**
 * Check the whole form: the suggestion request, and the build and export settings (naming
 * pattern, scale). Errors are keyed by the form's field paths, with `mood` for the purpose.
 */
export function validateSuggest(state: FormState): { ok: true; input: SuggestRequestInput } | { ok: false; errors: FieldErrors } {
  const input = toSuggestInput(state);
  const errors: FieldErrors = {};
  const suggest = SuggestRequestSchema.safeParse(input);
  if (!suggest.success) {
    for (const [key, message] of Object.entries(issuesToErrors(suggest.error.issues))) errors[key === 'purpose' ? 'mood' : key] ??= message;
  }
  // The export settings are checked with the palette request, which knows the naming and scale rules.
  const exportCheck = PaletteRequestSchema.safeParse({ ...toRequestInput(state), schemes: ['suggested'] });
  if (!exportCheck.success) {
    for (const [key, message] of Object.entries(issuesToErrors(exportCheck.error.issues))) errors[key] ??= message;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, input };
}

/** Validation problems keyed by field path, e.g. `hues.0.value` or `scale.to`. */
export type FieldErrors = Record<string, string>;

export function validate(state: FormState): { ok: true; input: PaletteRequestInput } | { ok: false; errors: FieldErrors } {
  const input = toRequestInput(state);
  const result = PaletteRequestSchema.safeParse(input);
  if (result.success) return { ok: true, input };
  return { ok: false, errors: issuesToErrors(result.error.issues) };
}

export function issuesToErrors(issues: z.core.$ZodIssue[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join('.');
    errors[key] ??= issue.message;
  }
  return errors;
}

/** The first error for a field or anything inside it. */
export function errorFor(errors: FieldErrors, path: string): string | undefined {
  if (errors[path]) return errors[path];
  const nested = Object.keys(errors).find((key) => key.startsWith(`${path}.`));
  return nested ? errors[nested] : undefined;
}

// ── Summaries shown on collapsed sections ──────────────────────────────────

const FORMAT_LABELS: Record<TokenFormat, string> = {
  css: 'CSS custom properties',
  tailwind: 'Tailwind CSS v4',
  dtcg: 'Design Tokens JSON',
};

export const SCHEME_LABELS: Record<Scheme, string> = {
  monochromatic: 'Monochromatic',
  analogous: 'Analogous',
  complementary: 'Complementary',
  'split-complementary': 'Split-complementary',
  triadic: 'Triadic',
  tetradic: 'Tetradic',
  tonal: 'Tonal',
  'neutral-accent': 'Neutral + accent',
  functional: 'Functional UI',
  sourced: 'Sourced',
  suggested: 'Scales and tokens',
};

/** One line under each scheme in the form. */
export const SCHEME_DESCRIPTIONS: Record<Scheme, string> = {
  monochromatic: 'One hue in many steps.',
  analogous: 'Three neighboring hues.',
  complementary: 'Two opposite hues.',
  'split-complementary': 'A hue and the two beside its opposite.',
  triadic: 'Three evenly spaced hues.',
  tetradic: 'Two pairs of opposites.',
  tonal: 'Close hues, varied in depth and softness.',
  'neutral-accent': 'One brand color, tinted greys, and an optional accent.',
  functional: 'Brand, neutral, and success, warning, danger, and info colors.',
  sourced: 'Drawn from a real scene, material, or style.',
  suggested: 'Your colors and the suggestions you kept.',
};

export function summaries(state: FormState): Record<'directions' | 'format' | 'scale' | 'saturation' | 'system' | 'roles' | 'schemes', string> {
  const steps = (() => {
    try {
      const scale =
        state.scaleKind === 'full'
          ? ({ kind: 'full' } as const)
          : state.scaleKind === 'range'
            ? ({ kind: 'range', from: state.from, to: state.to } as const)
            : ({ kind: 'count', count: state.count } as const);
      const list = resolveSteps(scale);
      return list.length > 4 ? `${list[0]}–${list.at(-1)} (${list.length} steps)` : list.join(', ');
    } catch {
      return 'Check the steps';
    }
  })();
  const roles = state.roles.filter((r) => r.role.trim());
  return {
    directions: `${state.directions} at a time`,
    format: state.tokenFormat === 'css' ? `${FORMAT_LABELS.css}, ${state.namingPattern}` : FORMAT_LABELS[state.tokenFormat],
    scale: state.scaleKind === 'full' ? `Full scale, ${steps}` : steps,
    saturation:
      (state.saturation === ''
        ? 'Let the agent decide'
        : state.saturation === 'custom'
          ? state.customSaturation.trim() || 'Custom'
          : state.saturation[0]!.toUpperCase() + state.saturation.slice(1)) + (state.balance ? '' : ', not balanced'),
    system: state.colorSystem,
    roles: roles.length
      ? roles.map((r) => (r.temperature ? `${r.role.trim()} (${r.temperature})` : r.role.trim())).join(', ')
      : 'Let the agent decide',
    schemes: state.schemes.length ? state.schemes.map((s) => SCHEME_LABELS[s]).join(', ') : 'Let the agent decide',
  };
}

export { STEPS };
