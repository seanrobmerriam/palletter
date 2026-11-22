import { describe, expect, it } from 'vitest';
import { isInSrgb } from '../color/gamut';
import { extractJsonCandidates } from './parse';
import { ModelResponseSchema } from './schema';
import { SKILL_FILES } from './skills';

describe('skills', () => {
  const skill = SKILL_FILES.find((f) => f.path === 'SKILL.md')!.content;

  it('has an example response that matches the schema', () => {
    const [example] = extractJsonCandidates(skill);
    expect(ModelResponseSchema.safeParse(JSON.parse(example!)).success).toBe(true);
  });

  it('bundles every guide that SKILL.md links to', () => {
    const linked = [...skill.matchAll(/\]\(([\w-]+\.md)\)/g)].map((m) => m[1]);
    expect(new Set(linked)).toEqual(new Set(SKILL_FILES.map((f) => f.path).filter((p) => p !== 'SKILL.md')));
  });

  it('has no empty files', () => {
    for (const file of SKILL_FILES) expect(file.content.trim().length, file.path).toBeGreaterThan(200);
  });
});

describe('scales.md gamut table', () => {
  const scales = SKILL_FILES.find((f) => f.path === 'scales.md')!.content;
  const lightness = Object.fromEntries(
    [...scales.matchAll(/^\| (\d+) \| (\d+)% \|$/gm)].map((m) => [m[1]!, Number(m[2]) / 100]),
  );
  const table = scales.slice(scales.indexOf('## Gamut'));
  const hues = [...table.matchAll(/ (\d+)° \|/g)].map((m) => Number(m[1]));
  const rows = [...table.matchAll(/^\| (\d+) \| ([\d. |]+) \|$/gm)].map((m) => ({
    step: m[1]!,
    limits: m[2]!.split('|').map((v) => Number(v.trim())),
  }));

  /** The highest chroma in sRGB at this lightness and hue. */
  const maxChroma = (l: number, h: number) => {
    let lo = 0;
    let hi = 0.5;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (isInSrgb({ mode: 'oklch', l, c: mid, h })) lo = mid;
      else hi = mid;
    }
    return lo;
  };

  it('has a row for every step and a column for every hue', () => {
    expect(rows.map((r) => r.step)).toEqual(Object.keys(lightness));
    expect(rows.every((r) => r.limits.length === hues.length)).toBe(true);
  });

  it('matches the real sRGB limits at each step lightness', () => {
    for (const { step, limits } of rows) {
      limits.forEach((limit, i) => {
        const actual = maxChroma(lightness[step]!, hues[i]!);
        expect(limit, `step ${step}, hue ${hues[i]}`).toBeLessThanOrEqual(actual + 0.0005);
        expect(limit, `step ${step}, hue ${hues[i]}`).toBeGreaterThan(actual - 0.002);
      });
    }
  });
});
