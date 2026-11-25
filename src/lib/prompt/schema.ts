/**
 * The contract between the UI, the prompt builder, and the response parser.
 *
 * `PaletteRequest` is what the user asks for. `ModelResponse` is what the model must return.
 */
import { parse } from 'culori';
import { z } from 'zod';
import { parseOklch } from '../color/convert';
import { slugify } from '../format/naming';

// ── Scale steps ────────────────────────────────────────────────────────────

export const STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const;
export type Step = (typeof STEPS)[number];
export const StepSchema = z.enum(STEPS);

export const ScaleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('full') }),
  z
    .object({ kind: z.literal('range'), from: StepSchema, to: StepSchema })
    .refine((s) => STEPS.indexOf(s.from) <= STEPS.indexOf(s.to), {
      message: '"from" must be the same as or lighter than "to"',
      path: ['to'],
    }),
  z.object({
    kind: z.literal('count'),
    count: z
      .number({ message: 'Enter a number of steps' })
      .int('Use a whole number of steps')
      .min(1, 'Use at least 1 step')
      .max(STEPS.length, `Use at most ${STEPS.length} steps`),
  }),
]);
export type Scale = z.infer<typeof ScaleSchema>;

/** The steps a scale asks for, lightest first. */
export function resolveSteps(scale: Scale): Step[] {
  switch (scale.kind) {
    case 'full':
      return [...STEPS];
    case 'range':
      return STEPS.slice(STEPS.indexOf(scale.from), STEPS.indexOf(scale.to) + 1);
    case 'count': {
      if (scale.count === 1) return ['500'];
      // Spread the steps evenly across the full scale, always including both ends. The second
      // half mirrors the first, so 5 steps are 50, 300, 500, 700, 950 rather than leaning dark.
      const last = STEPS.length - 1;
      const n = scale.count - 1;
      return Array.from({ length: scale.count }, (_, i) => {
        const index = i <= n / 2 ? Math.round((i * last) / n) : last - Math.round(((n - i) * last) / n);
        return STEPS[index]!;
      });
    }
  }
}

// ── Enumerations ───────────────────────────────────────────────────────────

export const SCHEMES = [
  'from-my-colors',
  'monochromatic',
  'analogous',
  'complementary',
  'split-complementary',
  'triadic',
  'tetradic',
  'tonal',
  'neutral-accent',
  'functional',
  'sourced',
] as const;
export const SchemeSchema = z.enum(SCHEMES);
export type Scheme = z.infer<typeof SchemeSchema>;

/**
 * Schemes defined by what each color does rather than by angles on the color wheel. Palletter
 * doesn't check their hues against reference angles.
 */
export const CHARACTER_SCHEMES = ['from-my-colors', 'neutral-accent', 'functional', 'sourced'] as const satisfies readonly Scheme[];
export type CharacterScheme = (typeof CHARACTER_SCHEMES)[number];
export const isCharacterScheme = (scheme: Scheme): scheme is CharacterScheme =>
  (CHARACTER_SCHEMES as readonly Scheme[]).includes(scheme);

/** The semantic roles every functional palette includes, besides its primary and neutral. */
export const SEMANTIC_ROLES = ['success', 'warning', 'danger', 'info'] as const;

export const COLOR_SYSTEMS = ['oklch', 'rgb', 'hex', 'hsl', 'cmyk'] as const;
export const ColorSystemSchema = z.enum(COLOR_SYSTEMS);
export type ColorSystem = z.infer<typeof ColorSystemSchema>;

export const TOKEN_FORMATS = ['css', 'tailwind', 'dtcg'] as const;
export const TokenFormatSchema = z.enum(TOKEN_FORMATS);
export type TokenFormat = z.infer<typeof TokenFormatSchema>;

export const SATURATIONS = ['vivid', 'pure', 'muted', 'pastel', 'earthy'] as const;
export const SaturationSchema = z.union([
  z.enum(SATURATIONS),
  z.object({ custom: z.string().trim().min(1, 'Describe the saturation you want').max(200, 'Keep it under 200 characters') }),
]);
export type Saturation = z.infer<typeof SaturationSchema>;

export const TEMPERATURES = ['warm', 'cool', 'neutral'] as const;

// ── Naming patterns ────────────────────────────────────────────────────────

/**
 * Placeholders allowed in a naming pattern. `[color]` and `[mood]` are aliases of `[name]`,
 * so patterns like `--brand-[color]-[step]` and `--color-[mood]-[step]` read naturally.
 */
export const PLACEHOLDERS = ['name', 'color', 'mood', 'role', 'step'] as const;
export const DEFAULT_NAMING_PATTERN = '--color-[name]-[step]';

export const NamingPatternSchema = z
  .string()
  .trim()
  .regex(/^--[a-z0-9_\-[\]]+$/i, 'Use a custom property name such as --color-[name]-[step]')
  .refine(
    (p) => [...p.matchAll(/\[([^\]]*)\]/g)].every((m) => (PLACEHOLDERS as readonly string[]).includes(m[1]!)),
    { message: `Placeholders must be one of ${PLACEHOLDERS.map((p) => `[${p}]`).join(', ')}` },
  );

// ── Palette request ────────────────────────────────────────────────────────

export const HueSchema = z
  .object({
    value: z
      .string()
      .trim()
      .min(1)
      .refine((v) => parse(v) !== undefined, 'Not a color value Palletter can read')
      .optional(),
    name: z.string().trim().min(1).max(40, 'Keep color names under 40 characters').optional(),
  })
  .refine((h) => h.value !== undefined || h.name !== undefined, 'Enter a color value, a color name, or both');

export const RoleSchema = z.object({
  role: z.string().trim().min(1, 'Enter a role name').max(30, 'Keep role names under 30 characters'),
  temperature: z.enum(TEMPERATURES).optional(),
});

export const PaletteRequestSchema = z.object({
  hues: z.array(HueSchema).min(1, 'Add at least one hue').max(8, 'Use at most 8 hues'),
  mood: z.string().trim().min(1).max(200, 'Keep the mood under 200 characters').optional(),
  /** Extra instructions, e.g. a refinement carried into a new session. */
  note: z.string().trim().min(1).max(500, 'Keep the note under 500 characters').optional(),
  tokenFormat: TokenFormatSchema.default('css'),
  namingPattern: NamingPatternSchema.default(DEFAULT_NAMING_PATTERN),
  scale: ScaleSchema.default({ kind: 'full' }),
  saturation: SaturationSchema.optional(),
  colorSystem: ColorSystemSchema.default('oklch'),
  /** Let Palletter balance the model's palette (see `palette/harmonize.ts`). */
  balance: z.boolean().default(true),
  roles: z.array(RoleSchema).max(6, 'Use at most 6 roles').optional(),
  schemes: z
    .array(SchemeSchema)
    .min(1, 'Choose at least one scheme')
    .refine((s) => new Set(s).size === s.length, 'Each scheme can only be chosen once')
    .default(['from-my-colors']),
});

/** A validated request, with defaults filled in. */
export type PaletteRequest = z.output<typeof PaletteRequestSchema>;
/** What a caller may send. Everything with a default is optional. */
export type PaletteRequestInput = z.input<typeof PaletteRequestSchema>;

// ── Model response ─────────────────────────────────────────────────────────

/** An `oklch()` color with lightness in 0–100% and non-negative chroma. */
export const OklchStringSchema = z
  .string()
  .trim()
  .refine((v) => parseOklch(v) !== undefined, 'Must be an oklch() color, e.g. oklch(62.8% 0.177 259.8)');

export const ModelColorSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .refine((n) => slugify(n) !== '', 'A color name needs at least one letter or number'),
  role: z.string().trim().min(1).max(30).optional(),
  steps: z
    .partialRecord(StepSchema, OklchStringSchema)
    .refine((s) => Object.keys(s).length > 0, 'A color needs at least one step'),
});
export type ModelColor = z.infer<typeof ModelColorSchema>;

export const ModelPaletteSchema = z.object({
  scheme: SchemeSchema,
  rationale: z.string().trim().max(600).default(''),
  colors: z
    .array(ModelColorSchema)
    .min(1)
    // Up to 6 requested roles, plus the neutral and 4 semantic colors of a functional palette.
    .max(12)
    .refine((colors) => new Set(colors.map((c) => slugify(c.name))).size === colors.length, {
      message: 'Each color in a palette needs a different name',
    }),
});
export type ModelPalette = z.infer<typeof ModelPaletteSchema>;

export const ModelResponseSchema = z.object({
  palettes: z.array(ModelPaletteSchema).min(1),
});
export type ModelResponse = z.infer<typeof ModelResponseSchema>;
