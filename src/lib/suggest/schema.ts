/**
 * The contract for suggestions: the user's colors go in, and the agent suggests new colors that
 * work with them, grouped into a few distinct directions.
 */
import { z } from 'zod';
import { slugify } from '../format/naming';
import { HueSchema, OklchStringSchema, RoleSchema, SaturationSchema, SchemeSchema } from '../prompt/schema';

export const DEFAULT_DIRECTIONS = 2;
export const MAX_DIRECTIONS = 5;
/** How many new colors each direction suggests. */
export const MIN_SUGGESTIONS = 3;
export const MAX_SUGGESTIONS = 5;
/** How many alternatives "more like this" asks for. */
export const ALTERNATIVES = 3;

// ── Request ────────────────────────────────────────────────────────────────

export const SuggestRequestSchema = z.object({
  hues: z.array(HueSchema).min(1, 'Add at least one color').max(8, 'Use at most 8 colors'),
  /** What the palette is for, and its mood, in the user's words. */
  purpose: z.string().trim().min(1).max(200, 'Keep this under 200 characters').optional(),
  directions: z
    .number({ message: 'Enter a number of directions' })
    .int('Use a whole number')
    .min(1, 'Ask for at least 1 direction')
    .max(MAX_DIRECTIONS, `Ask for at most ${MAX_DIRECTIONS} directions`)
    .default(DEFAULT_DIRECTIONS),
  // Optional hints from the Advanced options.
  saturation: SaturationSchema.optional(),
  roles: z.array(RoleSchema).max(6, 'Use at most 6 roles').optional(),
  schemes: z.array(SchemeSchema).optional(),
});

export type SuggestRequest = z.output<typeof SuggestRequestSchema>;
export type SuggestRequestInput = z.input<typeof SuggestRequestSchema>;

// ── Response ───────────────────────────────────────────────────────────────

const ColorName = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine((n) => slugify(n) !== '', 'A color name needs at least one letter or number');

/** One of the user's colors, as the agent names it and uses it in a direction. */
export const YourColorSchema = z.object({
  name: ColorName,
  role: z.string().trim().min(1).max(30),
  value: OklchStringSchema,
});
export type YourColor = z.infer<typeof YourColorSchema>;

/** A color the agent suggests, and why it works with the user's colors. */
export const SuggestedColorSchema = YourColorSchema.extend({
  reason: z.string().trim().min(1).max(300),
});
export type SuggestedColor = z.infer<typeof SuggestedColorSchema>;

export const DirectionSchema = z.object({
  name: z.string().trim().min(1).max(60),
  summary: z.string().trim().max(400).default(''),
  yours: z.array(YourColorSchema).min(1).max(8),
  colors: z.array(SuggestedColorSchema).min(1).max(MAX_SUGGESTIONS + 1),
});
export type Direction = z.infer<typeof DirectionSchema>;

export const SuggestResponseSchema = z.object({ directions: z.array(DirectionSchema).min(1) });
export type SuggestResponse = z.infer<typeof SuggestResponseSchema>;

export const AlternativesResponseSchema = z.object({ colors: z.array(SuggestedColorSchema).min(1).max(ALTERNATIVES + 2) });
export type AlternativesResponse = z.infer<typeof AlternativesResponseSchema>;
