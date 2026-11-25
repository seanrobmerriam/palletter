import { afterAll, describe, expect, it } from 'vitest';
import { fakeAgentProfile } from '../../../test/agent';
import { AgentProcess, type AgentSession } from '../acp/process';
import { anyToOklch, formatOklch } from '../color/convert';
import { extractJsonCandidates } from '../prompt/parse';
import { SUGGEST_SKILL_FILES } from '../prompt/skills';
import { parseAlternatives, parseDirections } from './parse';
import { buildMoreDirectionsPrompt, buildMoreLikePrompt, buildSuggestPrompt } from './prompt';
import { moreDirections, moreLike, suggestColors, type SuggestEvent } from './run';
import { SuggestRequestSchema, SuggestResponseSchema, type SuggestRequestInput } from './schema';

const request = (input: Partial<SuggestRequestInput> = {}) =>
  SuggestRequestSchema.parse({ hues: [{ value: '#84f5a6' }, { name: 'bronze' }], ...input });

const reply = (data: unknown) => `\`\`\`json\n${JSON.stringify(data)}\n\`\`\``;

const direction = (name: string, overrides: Record<string, unknown> = {}) => ({
  name,
  summary: 'Why.',
  yours: [
    { name: 'mint', role: 'primary', value: 'oklch(90% 0.14 151)' },
    { name: 'bronze', role: 'accent', value: 'oklch(65% 0.1 67)' },
  ],
  colors: [
    { name: 'sand', role: 'background', value: 'oklch(97% 0.014 80)', reason: 'Warm.' },
    { name: 'ink', role: 'text', value: 'oklch(26% 0.045 255)', reason: 'Dark.' },
  ],
  ...overrides,
});

describe('suggest.md', () => {
  const skill = SUGGEST_SKILL_FILES[0]!.content;

  it('has an example response that matches the schema', () => {
    const [example] = extractJsonCandidates(skill);
    expect(SuggestResponseSchema.safeParse(JSON.parse(example!)).success).toBe(true);
  });
});

describe('prompts', () => {
  it('lists the colors in order, marks exact ones, and asks for the directions', () => {
    const prompt = buildSuggestPrompt(request({ purpose: 'a bakery website', directions: 3 }), []);
    expect(prompt).toContain('1. #84f5a6 = oklch(');
    expect(prompt).toContain('An exact color: use this value unchanged.');
    expect(prompt).toContain('2. "bronze". The user named this color');
    expect(prompt).toContain('"a bakery website"');
    expect(prompt).toContain('Make exactly 3 directions, each with 3 to 5 new colors.');
    expect(prompt).not.toContain('## Hints from the user');
  });

  it('includes hints from the advanced options', () => {
    const prompt = buildSuggestPrompt(request({ saturation: 'muted', roles: [{ role: 'background' }], schemes: ['analogous'] }), []);
    expect(prompt).toContain('- Saturation: muted');
    expect(prompt).toContain('- Roles the user needs filled: "background".');
    expect(prompt).toContain('- Color relationships to lean on: analogous');
  });

  it('asks for more directions and for alternatives', () => {
    expect(buildMoreDirectionsPrompt(2)).toContain('Suggest 2 more directions');
    expect(buildMoreLikePrompt({ name: 'coral', role: 'accent', value: 'oklch(68% 0.15 35)' }, 'Reef')).toContain(
      'The user likes "coral" (oklch(68% 0.15 35), used as "accent") from the "Reef" direction',
    );
  });
});

describe('parseDirections', () => {
  it('accepts a good reply and keeps the user’s exact color exactly', () => {
    const result = parseDirections(reply({ directions: [direction('A'), direction('B')] }), request(), 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    // #84f5a6 exactly, not the agent's rounded value.
    expect(result.value[0]!.yours[0]!.value).toBe(formatOklch(anyToOklch('#84f5a6')!));
    expect(result.value[0]!.yours[0]!.value).not.toBe('oklch(90% 0.14 151)');
  });

  it('reports too few directions and drops extras with a warning', () => {
    expect(parseDirections(reply({ directions: [direction('A')] }), request(), 2)).toEqual({
      ok: false,
      problems: ['There is 1 direction. Make exactly 2.'],
    });
    const extra = parseDirections(reply({ directions: [direction('A'), direction('B'), direction('C')] }), request(), 2);
    expect(extra).toMatchObject({ ok: true, warnings: ['Ignored 1 extra direction.'] });
  });

  it('needs one entry in yours for each of the user’s colors', () => {
    const short = direction('A', { yours: [{ name: 'mint', role: 'primary', value: 'oklch(90% 0.14 151)' }] });
    const result = parseDirections(reply({ directions: [short] }), request(), 1);
    expect(result).toMatchObject({
      ok: false,
      problems: expect.arrayContaining([expect.stringContaining("Give exactly one for each of the user's 2 colors")]),
    });
  });

  it('drops suggestions that repeat the user’s colors', () => {
    const twin = direction('A', {
      colors: [
        { name: 'sand', role: 'background', value: 'oklch(97% 0.014 80)', reason: 'Warm.' },
        { name: 'mint again', role: 'accent', value: 'oklch(89.5% 0.142 151)', reason: 'Same.' },
      ],
    });
    const result = parseDirections(reply({ directions: [twin] }), request(), 1);
    expect(result).toMatchObject({ ok: true, warnings: [expect.stringContaining('Dropped "mint again"')] });
    if (result.ok) expect(result.value[0]!.colors.map((c) => c.name)).toEqual(['sand']);
  });

  it('reports names used twice in a direction', () => {
    const clash = direction('A', {
      colors: [
        { name: 'Mint', role: 'background', value: 'oklch(97% 0.014 80)', reason: 'Warm.' },
        { name: 'ink', role: 'text', value: 'oklch(26% 0.045 255)', reason: 'Dark.' },
      ],
    });
    expect(parseDirections(reply({ directions: [clash] }), request(), 1)).toMatchObject({
      ok: false,
      problems: [expect.stringContaining('more than one color is named "Mint"')],
    });
  });

  it('reports a reply with no JSON', () => {
    expect(parseDirections('No colors today.', request(), 1)).toMatchObject({ ok: false });
  });
});

describe('parseAlternatives', () => {
  it('accepts alternatives', () => {
    const colors = [
      { name: 'coral 1', role: 'accent', value: 'oklch(60% 0.15 35)', reason: 'Darker.' },
      { name: 'coral 2', role: 'accent', value: 'oklch(75% 0.12 45)', reason: 'Lighter.' },
    ];
    expect(parseAlternatives(reply({ colors }), request())).toMatchObject({ ok: true, value: colors });
  });
});

describe('suggestColors with the fake agent', () => {
  const agent = new AgentProcess(fakeAgentProfile());
  afterAll(() => agent.stop());

  async function run(input: Partial<SuggestRequestInput>, keep?: (session: AgentSession) => void) {
    const events: SuggestEvent[] = [];
    await suggestColors(request(input), {
      openSession: () => agent.newSession(),
      ...(keep ? { retainSession: (session: AgentSession) => (keep(session), 'kept') } : {}),
      timeoutMs: 10_000,
      emit: (e) => events.push(e),
    });
    return events;
  }

  it('streams one event per direction, then done', async () => {
    const events = await run({ directions: 2 });
    const directions = events.filter((e) => e.type === 'direction');
    expect(directions.map((e) => e.direction.name)).toEqual(['Direction 1', 'Direction 2']);
    expect(directions[0]!.direction.yours).toHaveLength(2);
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  it('repairs a bad reply once', async () => {
    const events = await run({ directions: 1, purpose: 'fake:bad-then-good' });
    expect(events.map((e) => (e.type === 'status' ? e.stage : e.type))).toContain('repairing');
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  it('suggests more directions and alternatives in the same session', async () => {
    let session: AgentSession | undefined;
    const req = request({ directions: 1 });
    await run({ directions: 1 }, (s) => (session = s));
    const events: SuggestEvent[] = [];
    const options = { timeoutMs: 10_000, emit: (e: SuggestEvent) => events.push(e) };

    await moreDirections(session!, req, 2, options);
    expect(events.filter((e) => e.type === 'direction').map((e) => e.direction.name)).toEqual(['Direction 2', 'Direction 3']);

    await moreLike(session!, req, { name: 'accent 2', role: 'accent', value: 'oklch(65% 0.15 40)' }, 'Direction 2', options);
    const alternatives = events.find((e) => e.type === 'alternatives');
    expect(alternatives?.colors.map((c) => c.name)).toEqual(['accent 2 1', 'accent 2 2', 'accent 2 3']);
    session!.close();
  });
});
