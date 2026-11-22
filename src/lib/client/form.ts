/**
 * The generator form's state, and how it becomes a PaletteRequest.
 * Kept separate from the Svelte component so it can be unit tested.
 */
import { formatHex, parse } from 'culori';
import type { z } from 'zod';
import { STEPS, DEFAULT_NAMING_PATTERN, PaletteRequestSchema, resolveSteps } from '../prompt/schema';
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
    colorSystem: 'oklch',
    roles: [],
    schemes: ['monochromatic'],
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
  const roles = state.roles.filter((r) => r.role.trim());
  if (roles.length) {
    input.roles = roles.map((r) => ({ role: r.role.trim(), ...(r.temperature ? { temperature: r.temperature } : {}) }));
  }
  return input;
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
};

export function summaries(state: FormState): Record<'format' | 'scale' | 'saturation' | 'system' | 'roles' | 'schemes', string> {
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
    format: state.tokenFormat === 'css' ? `${FORMAT_LABELS.css}, ${state.namingPattern}` : FORMAT_LABELS[state.tokenFormat],
    scale: state.scaleKind === 'full' ? `Full scale, ${steps}` : steps,
    saturation:
      state.saturation === ''
        ? 'Let the agent decide'
        : state.saturation === 'custom'
          ? state.customSaturation.trim() || 'Custom'
          : state.saturation[0]!.toUpperCase() + state.saturation.slice(1),
    system: state.colorSystem,
    roles: roles.length
      ? roles.map((r) => (r.temperature ? `${r.role.trim()} (${r.temperature})` : r.role.trim())).join(', ')
      : 'Let the agent decide',
    schemes: state.schemes.length ? state.schemes.map((s) => SCHEME_LABELS[s]).join(', ') : 'None chosen',
  };
}

export { STEPS };
