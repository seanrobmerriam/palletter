/**
 * Read the model's reply: find the JSON, validate it against the schema, and check that it
 * answers the request. Anything wrong becomes a problem the repair prompt can send back.
 */
import type { z } from 'zod';
import {
  ModelResponseSchema,
  resolveSteps,
  STEPS,
  type ModelPalette,
  type ModelResponse,
  type PaletteRequest,
  type Step,
} from './schema';

export type ParseResult =
  | { ok: true; response: ModelResponse; warnings: string[] }
  | { ok: false; problems: string[] };

/**
 * Candidate JSON texts in the reply, best first: fenced code blocks (last first, since models
 * tend to put the final answer last), then everything from the first `{` to the last `}`.
 */
export function extractJsonCandidates(text: string): string[] {
  const fenced = [...text.matchAll(/```[a-zA-Z]*[ \t]*\r?\n([\s\S]*?)```/g)].map((m) => m[1]!.trim()).reverse();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const braces = start !== -1 && end > start ? [text.slice(start, end + 1)] : [];
  return [...new Set([...fenced, ...braces])];
}

/** `palettes.0.colors.1.steps.500` → `palettes[0].colors[1].steps["500"]` */
function formatPath(path: PropertyKey[]): string {
  return path
    .map((key, i) => {
      if (typeof key === 'number') return `[${key}]`;
      const k = String(key);
      return /^[a-z_$][\w$]*$/i.test(k) ? `${i === 0 ? '' : '.'}${k}` : `["${k}"]`;
    })
    .join('');
}

function schemaProblems(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = formatPath(issue.path);
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

const sortSteps = (steps: string[]) => [...steps].sort((a, b) => STEPS.indexOf(a as Step) - STEPS.indexOf(b as Step));

/** Check a schema-valid response against the request, and trim what wasn't asked for. */
function checkAgainstRequest(
  response: ModelResponse,
  request: PaletteRequest,
): { problems: string[]; warnings: string[]; response: ModelResponse } {
  const problems: string[] = [];
  const warnings: string[] = [];
  const expectedSteps = resolveSteps(request.scale);
  const expectedRoles = (request.roles ?? []).map((r) => r.role.toLowerCase());

  const byScheme = new Map<string, ModelPalette[]>();
  for (const palette of response.palettes) {
    byScheme.set(palette.scheme, [...(byScheme.get(palette.scheme) ?? []), palette]);
  }

  for (const scheme of byScheme.keys()) {
    if (!(request.schemes as string[]).includes(scheme)) warnings.push(`Ignored a ${scheme} palette that wasn't requested.`);
  }

  const palettes: ModelPalette[] = [];
  for (const scheme of request.schemes) {
    const found = byScheme.get(scheme) ?? [];
    if (found.length === 0) {
      problems.push(`There is no ${scheme} palette. Include one palette for each requested scheme.`);
      continue;
    }
    if (found.length > 1) {
      problems.push(`There are ${found.length} ${scheme} palettes. Include exactly one for each scheme.`);
      continue;
    }
    const palette = found[0]!;

    const colors = palette.colors.map((color) => {
      const keys = Object.keys(color.steps);
      const missing = expectedSteps.filter((step) => !keys.includes(step));
      const extra = sortSteps(keys.filter((key) => !(expectedSteps as string[]).includes(key)));
      if (missing.length) {
        problems.push(`In the ${scheme} palette, "${color.name}" is missing steps ${missing.join(', ')}.`);
      }
      if (extra.length) {
        warnings.push(`Ignored extra steps ${extra.join(', ')} on "${color.name}" in the ${scheme} palette.`);
      }
      const steps = Object.fromEntries(expectedSteps.flatMap((s) => (color.steps[s] ? [[s, color.steps[s]]] : [])));
      return { ...color, steps };
    });

    const roles = new Set(colors.map((c) => c.role?.toLowerCase()).filter(Boolean));
    const missingRoles = (request.roles ?? []).filter((_, i) => !roles.has(expectedRoles[i]));
    if (missingRoles.length) {
      problems.push(
        `In the ${scheme} palette, no color has the role ${missingRoles.map((r) => `"${r.role}"`).join(', ')}. Make one color for each role.`,
      );
    }

    palettes.push({ ...palette, colors });
  }

  return { problems, warnings, response: { palettes } };
}

export function parseModelResponse(text: string, request: PaletteRequest): ParseResult {
  const candidates = extractJsonCandidates(text);
  if (candidates.length === 0) {
    return { ok: false, problems: ['The reply has no JSON. Reply with a single ```json code block.'] };
  }

  // Use the first candidate that parses as JSON and looks like a response; report on the best one.
  let firstJsonError: string | undefined;
  let best: { problems: string[] } | undefined;
  for (const candidate of candidates) {
    let data: unknown;
    try {
      data = JSON.parse(candidate);
    } catch (error) {
      firstJsonError ??= `The JSON is not valid: ${(error as Error).message}.`;
      continue;
    }

    const parsed = ModelResponseSchema.safeParse(data);
    if (!parsed.success) {
      const looksLikeResponse = typeof data === 'object' && data !== null && 'palettes' in data;
      if (looksLikeResponse || !best) best = { problems: schemaProblems(parsed.error) };
      if (looksLikeResponse) break;
      continue;
    }

    const checked = checkAgainstRequest(parsed.data, request);
    if (checked.problems.length) return { ok: false, problems: checked.problems };
    return { ok: true, response: checked.response, warnings: checked.warnings };
  }

  return { ok: false, problems: best?.problems ?? [firstJsonError ?? 'The reply has no valid JSON.'] };
}
