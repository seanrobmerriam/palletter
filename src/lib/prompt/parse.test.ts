import { describe, expect, it } from 'vitest';
import { extractJsonCandidates, parseModelResponse } from './parse';
import { PaletteRequestSchema, type PaletteRequestInput } from './schema';

const request = (input: Partial<PaletteRequestInput> = {}) =>
  PaletteRequestSchema.parse({
    hues: [{ value: '#2563eb' }],
    scale: { kind: 'range', from: '100', to: '300' },
    schemes: ['monochromatic'],
    ...input,
  });

const color = (name: string, steps = ['100', '200', '300'], role?: string) => ({
  name,
  ...(role ? { role } : {}),
  steps: Object.fromEntries(steps.map((s, i) => [s, `oklch(${90 - i * 6}% 0.05 260)`])),
});

const palette = (scheme: string, colors = [color('brand')]) => ({ scheme, rationale: 'Why.', colors });

const reply = (data: unknown, before = '', after = '') => `${before}\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`${after}`;

describe('extractJsonCandidates', () => {
  it('prefers the last fenced block', () => {
    expect(extractJsonCandidates('```json\n{"a":1}\n```\ntext\n```json\n{"b":2}\n```')[0]).toBe('{"b":2}');
  });

  it('accepts fences without a language', () => {
    expect(extractJsonCandidates('```\n{"a":1}\n```')[0]).toBe('{"a":1}');
  });

  it('falls back to the outermost braces', () => {
    expect(extractJsonCandidates('Here you go: {"a": {"b": 1}} Thanks!')).toEqual(['{"a": {"b": 1}}']);
  });

  it('finds nothing in plain text', () => {
    expect(extractJsonCandidates('Sorry, I cannot help with that.')).toEqual([]);
  });
});

describe('parseModelResponse', () => {
  it('accepts a good reply', () => {
    const result = parseModelResponse(reply({ palettes: [palette('monochromatic')] }), request());
    expect(result).toMatchObject({ ok: true, warnings: [] });
  });

  it('accepts a reply with text around the JSON', () => {
    const result = parseModelResponse(
      reply({ palettes: [palette('monochromatic')] }, 'Here is your palette:\n\n', '\n\nLet me know!'),
      request(),
    );
    expect(result.ok).toBe(true);
  });

  it('accepts bare JSON with no fence', () => {
    expect(parseModelResponse(JSON.stringify({ palettes: [palette('monochromatic')] }), request()).ok).toBe(true);
  });

  it('orders palettes as requested and drops unrequested ones with a warning', () => {
    const result = parseModelResponse(
      reply({ palettes: [palette('triadic'), palette('tetradic'), palette('analogous')] }),
      request({ schemes: ['analogous', 'triadic'] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.palettes.map((p) => p.scheme)).toEqual(['analogous', 'triadic']);
    expect(result.warnings).toEqual(["Ignored a tetradic palette that wasn't requested."]);
  });

  it('drops extra steps with a warning', () => {
    const result = parseModelResponse(
      reply({ palettes: [palette('monochromatic', [color('brand', ['50', '100', '200', '300', '400'])])] }),
      request(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.response.palettes[0]!.colors[0]!.steps)).toEqual(['100', '200', '300']);
    expect(result.warnings).toEqual(['Ignored extra steps 50, 400 on "brand" in the monochromatic palette.']);
  });

  it('reports a reply with no JSON', () => {
    expect(parseModelResponse('I made you a lovely blue palette.', request())).toEqual({
      ok: false,
      problems: ['The reply has no JSON. Reply with a single ```json code block.'],
    });
  });

  it('reports invalid JSON', () => {
    const result = parseModelResponse('```json\n{"palettes": [\n```', request());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0]).toMatch(/^The JSON is not valid: /);
  });

  it('reports truncated output', () => {
    const full = reply({ palettes: [palette('monochromatic')] });
    const result = parseModelResponse(full.slice(0, full.length / 2), request());
    expect(result.ok).toBe(false);
  });

  it('reports schema problems with readable paths', () => {
    const bad = palette('monochromatic', [{ name: 'brand', steps: { '100': '#dbeafe', '200': 'oklch(88% 0.05 260)', '300': 'oklch(81% 0.08 260)' } }]);
    const result = parseModelResponse(reply({ palettes: [bad] }), request());
    expect(result).toEqual({
      ok: false,
      problems: ['palettes[0].colors[0].steps["100"]: Must be an oklch() color, e.g. oklch(62.8% 0.177 259.8)'],
    });
  });

  it('reports the wrong shape', () => {
    const result = parseModelResponse(reply({ palette: palette('monochromatic') }), request());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0]).toMatch(/^palettes: /);
  });

  it('reports a missing scheme', () => {
    const result = parseModelResponse(reply({ palettes: [palette('analogous')] }), request({ schemes: ['analogous', 'triadic'] }));
    expect(result).toEqual({
      ok: false,
      problems: ['There is no triadic palette. Include one palette for each requested scheme.'],
    });
  });

  it('reports a scheme given twice', () => {
    const result = parseModelResponse(reply({ palettes: [palette('analogous'), palette('analogous')] }), request({ schemes: ['analogous'] }));
    expect(result.ok).toBe(false);
  });

  it('reports missing steps', () => {
    const result = parseModelResponse(reply({ palettes: [palette('monochromatic', [color('brand', ['100'])])] }), request());
    expect(result).toEqual({
      ok: false,
      problems: ['In the monochromatic palette, "brand" is missing steps 200, 300.'],
    });
  });

  it('reports missing roles, ignoring case', () => {
    const roles = [{ role: 'Primary' }, { role: 'accent' }];
    const result = parseModelResponse(
      reply({ palettes: [palette('monochromatic', [color('brand', undefined, 'primary'), color('sky')])] }),
      request({ roles }),
    );
    expect(result).toEqual({
      ok: false,
      problems: ['In the monochromatic palette, no color has the role "accent". Make one color for each role.'],
    });
  });

  it('requires every semantic role in a functional palette', () => {
    const colors = ['primary', 'neutral', 'success', 'danger'].map((role) => color(role, undefined, role));
    expect(parseModelResponse(reply({ palettes: [palette('functional', colors)] }), request({ schemes: ['functional'] }))).toEqual({
      ok: false,
      problems: [
        'In the functional palette, no color has the role "warning", "info". A functional palette needs a color for each of success, warning, danger, info.',
      ],
    });
  });

  it('accepts a functional palette with every semantic role, on top of the requested roles', () => {
    const roles = ['brand', 'neutral', 'Success', 'warning', 'danger', 'info'];
    const colors = roles.map((role) => color(role.toLowerCase(), undefined, role));
    const result = parseModelResponse(
      reply({ palettes: [palette('functional', colors)] }),
      request({ schemes: ['functional'], roles: [{ role: 'brand' }, { role: 'neutral' }] }),
    );
    expect(result.ok).toBe(true);
  });

  it('skips an unrelated JSON block and uses the response', () => {
    const text = `${reply({ palettes: [palette('monochromatic')] })}\n\nSettings I used:\n\`\`\`json\n{"temperature": 0.5}\n\`\`\``;
    expect(parseModelResponse(text, request()).ok).toBe(true);
  });
});
