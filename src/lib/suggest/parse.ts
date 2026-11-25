/**
 * Read the agent's suggestions: find the JSON, validate it, and check it against the request.
 * Anything wrong becomes a problem the repair prompt can send back.
 */
import { converter, type Oklch } from 'culori';
import type { z } from 'zod';
import { anyToOklch, formatOklch, parseOklch } from '../color/convert';
import { slugify } from '../format/naming';
import { extractJsonCandidates } from '../prompt/parse';
import {
  AlternativesResponseSchema,
  SuggestResponseSchema,
  type Direction,
  type SuggestedColor,
  type SuggestRequest,
} from './schema';

export type Parsed<T> = { ok: true; value: T; warnings: string[] } | { ok: false; problems: string[] };

const toOklab = converter('oklab');

/** Perceptual distance between two colors in OKLab. About 0.02 is a just-noticeable difference. */
export function colorDistance(a: Oklch, b: Oklch): number {
  const x = toOklab(a);
  const y = toOklab(b);
  return Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b);
}

/** Below this distance, a suggestion is too close to one of the user's colors to be worth suggesting. */
export const DUPLICATE_DISTANCE = 0.04;

function issuesToProblems(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map((k) => (typeof k === 'number' ? `[${k}]` : `.${String(k)}`)).join('').replace(/^\./, '');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

/** The first JSON block in `text` that matches `schema`, or the problems with the best attempt. */
function firstMatching<S extends z.ZodType>(text: string, schema: S, key: string): Parsed<z.output<S>> {
  const candidates = extractJsonCandidates(text);
  if (candidates.length === 0) return { ok: false, problems: ['The reply has no JSON. Reply with a single ```json code block.'] };
  let problems: string[] | undefined;
  for (const candidate of candidates) {
    let data: unknown;
    try {
      data = JSON.parse(candidate);
    } catch (error) {
      problems ??= [`The JSON is not valid: ${(error as Error).message}.`];
      continue;
    }
    const parsed = schema.safeParse(data);
    if (parsed.success) return { ok: true, value: parsed.data, warnings: [] };
    const looksRight = typeof data === 'object' && data !== null && key in data;
    if (looksRight || !problems) problems = issuesToProblems(parsed.error);
    if (looksRight) break;
  }
  return { ok: false, problems: problems ?? ['The reply has no valid JSON.'] };
}

/** The user's colors that are exact values, by position, as oklch. */
function exactColors(request: SuggestRequest): (Oklch | undefined)[] {
  return request.hues.map((hue) => (hue.value ? anyToOklch(hue.value) : undefined));
}

/**
 * Drop suggestions that repeat one of `against`, with a warning. Returns the colors kept.
 */
function dropDuplicates(colors: SuggestedColor[], against: Oklch[], where: string, warnings: string[]): SuggestedColor[] {
  return colors.filter((color) => {
    const value = parseOklch(color.value)!;
    const twin = against.some((other) => colorDistance(value, other) < DUPLICATE_DISTANCE);
    if (twin) warnings.push(`Dropped "${color.name}" from ${where}: it was almost the same as one of your colors.`);
    return !twin;
  });
}

/** Problems with names that repeat within a direction. */
function nameClashes(names: string[], where: string): string[] {
  const seen = new Set<string>();
  const clashes = new Set<string>();
  for (const name of names) {
    const slug = slugify(name);
    if (seen.has(slug)) clashes.add(name);
    seen.add(slug);
  }
  return [...clashes].map((name) => `In ${where}, more than one color is named "${name}". Give every color in a direction its own name.`);
}

/**
 * Parse a reply with directions. `expected` is how many directions were asked for: fewer is a
 * problem, and extra ones are dropped with a warning.
 */
export function parseDirections(text: string, request: SuggestRequest, expected: number): Parsed<Direction[]> {
  const result = firstMatching(text, SuggestResponseSchema, 'directions');
  if (!result.ok) return result;

  const problems: string[] = [];
  const warnings: string[] = [];
  let directions = result.value.directions;
  if (directions.length < expected) {
    problems.push(`There ${directions.length === 1 ? 'is 1 direction' : `are ${directions.length} directions`}. Make exactly ${expected}.`);
  } else if (directions.length > expected) {
    warnings.push(`Ignored ${directions.length - expected} extra ${directions.length - expected === 1 ? 'direction' : 'directions'}.`);
    directions = directions.slice(0, expected);
  }

  const exact = exactColors(request);
  const checked = directions.map((direction): Direction => {
    const where = `the "${direction.name}" direction`;
    if (direction.yours.length !== request.hues.length) {
      problems.push(
        `In ${where}, "yours" has ${direction.yours.length} ${direction.yours.length === 1 ? 'entry' : 'entries'}. Give exactly one for each of the user's ${request.hues.length} colors, in order.`,
      );
    }
    // Exact colors are the user's, whatever the agent wrote.
    const yours = direction.yours.map((color, i) => {
      const value = exact[i];
      return value ? { ...color, value: formatOklch(value) } : color;
    });
    const against = yours.map((c) => parseOklch(c.value)!);
    const colors = dropDuplicates(direction.colors, against, where, warnings);
    if (colors.length === 0) problems.push(`In ${where}, every new color repeats one of the user's colors. Suggest new ones.`);
    problems.push(...nameClashes([...yours, ...colors].map((c) => c.name), where));
    return { ...direction, yours, colors };
  });

  if (problems.length) return { ok: false, problems };
  return { ok: true, value: checked, warnings };
}

/** Parse a reply with alternatives to one color. */
export function parseAlternatives(text: string, request: SuggestRequest): Parsed<SuggestedColor[]> {
  const result = firstMatching(text, AlternativesResponseSchema, 'colors');
  if (!result.ok) return result;
  const warnings: string[] = [];
  const against = exactColors(request).filter((c): c is Oklch => c !== undefined);
  const colors = dropDuplicates(result.value.colors, against, 'the alternatives', warnings);
  if (colors.length === 0) return { ok: false, problems: ["Every alternative repeats one of the user's colors. Suggest new ones."] };
  const clashes = nameClashes(colors.map((c) => c.name), 'the alternatives');
  if (clashes.length) return { ok: false, problems: clashes };
  return { ok: true, value: colors, warnings };
}
