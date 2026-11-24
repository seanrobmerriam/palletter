import { afterAll, describe, expect, it } from 'vitest';
import { fakeAgentProfile } from '../../../test/agent';
import { AgentProcess } from '../acp/process';
import { PaletteRequestSchema, type PaletteRequestInput } from '../prompt/schema';
import { generatePalettes, refinePalette, type GenerateEvent } from './generate';
import type { AgentSession } from '../acp/process';

const agent = new AgentProcess(fakeAgentProfile());
afterAll(() => agent.stop());

async function run(input: PaletteRequestInput, signal?: AbortSignal) {
  const events: GenerateEvent[] = [];
  await generatePalettes(PaletteRequestSchema.parse(input), {
    openSession: () => agent.newSession(),
    timeoutMs: 10_000,
    signal,
    emit: (e) => events.push(e),
  });
  return events;
}

const types = (events: GenerateEvent[]) => events.map((e) => (e.type === 'status' ? `status:${e.stage}` : e.type));

describe('generatePalettes', () => {
  it('streams progress, one palette per scheme, then done', async () => {
    const events = await run({
      hues: [{ value: '#2563eb' }],
      schemes: ['monochromatic', 'triadic'],
      scale: { kind: 'range', from: '100', to: '300' },
      tokenFormat: 'tailwind',
      colorSystem: 'hex',
    });
    expect(types(events)).toEqual([
      'status:starting',
      'status:thinking',
      'status:writing',
      'status:checking',
      'palette',
      'palette',
      'done',
    ]);
    const palettes = events.filter((e) => e.type === 'palette');
    expect(palettes.map((p) => p.palette.scheme)).toEqual(['monochromatic', 'triadic']);
    expect(palettes[1]!.palette.colors).toHaveLength(3);
    expect(palettes[0]!.tokens).toMatch(/^@theme \{\n {2}--color-color-1-100: #[0-9a-f]{6};/);
  });

  it('sends the original palette and notes when balancing changed it', async () => {
    const events = await run({ hues: [{ value: '#2563eb' }], schemes: ['triadic'] });
    const palette = events.find((e) => e.type === 'palette');
    expect(palette?.original).toBeDefined();
    expect(palette?.original).not.toEqual(palette?.source);
    expect(palette?.notes.length).toBeGreaterThan(0);
  });

  it('leaves the palette alone when balance is off', async () => {
    const events = await run({ hues: [{ value: '#2563eb' }], schemes: ['triadic'], balance: false });
    const palette = events.find((e) => e.type === 'palette');
    expect(palette).not.toHaveProperty('original');
    expect(palette?.notes).toEqual([]);
  });

  it('uses roles from the request', async () => {
    const events = await run({ hues: [{ name: 'blue' }], roles: [{ role: 'primary' }, { role: 'accent' }] });
    const palette = events.find((e) => e.type === 'palette');
    expect(palette?.palette.colors.map((c) => c.role)).toEqual(['primary', 'accent']);
  });

  it('repairs a bad reply once', async () => {
    const events = await run({ hues: [{ name: 'blue' }], mood: 'fake:bad-then-good' });
    expect(types(events)).toEqual(['status:starting', 'status:thinking', 'status:writing', 'status:checking', 'status:repairing', 'status:checking', 'palette', 'done']);
  });

  it('gives up after one repair', async () => {
    const events = await run({ hues: [{ name: 'blue' }], mood: 'fake:bad' });
    const last = events.at(-1);
    expect(last).toMatchObject({ type: 'error', code: 'invalid_response' });
    expect(last?.type === 'error' && last.detail).toContain('is missing steps 50');
  });

  it('repairs a reply with no JSON', async () => {
    const events = await run({ hues: [{ name: 'blue' }], mood: 'fake:no-json' });
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'invalid_response' });
    expect(types(events)).toContain('status:repairing');
  });

  it('reports a naming clash as a format error', async () => {
    const events = await run({ hues: [{ name: 'blue' }], schemes: ['triadic'], namingPattern: '--color-[step]' });
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'format' });
  });

  it('reports agent errors', async () => {
    const events = await run({ hues: [{ name: 'blue' }], mood: 'fake:auth' });
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'auth_required' });
  });

  it('reports a failure to open a session', async () => {
    const events: GenerateEvent[] = [];
    await generatePalettes(PaletteRequestSchema.parse({ hues: [{ name: 'blue' }] }), {
      openSession: () => Promise.reject(new Error('boom')),
      timeoutMs: 1000,
      emit: (e) => events.push(e),
    });
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'internal' });
  });

  it('stops when cancelled', async () => {
    const abort = new AbortController();
    setTimeout(() => abort.abort(), 100);
    const events = await run({ hues: [{ name: 'blue' }], mood: 'fake:slow' }, abort.signal);
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'cancelled' });
  });
});

describe('refinePalette', () => {
  async function generateAndKeep(input: PaletteRequestInput) {
    const request = PaletteRequestSchema.parse(input);
    let kept: AgentSession | undefined;
    const events: GenerateEvent[] = [];
    await generatePalettes(request, {
      openSession: () => agent.newSession(),
      retainSession: (session) => {
        kept = session;
        return 'session-1';
      },
      timeoutMs: 10_000,
      emit: (e) => events.push(e),
    });
    return { request, session: kept!, events };
  }

  it('keeps the session when asked, and says so before done', async () => {
    const { events, session } = await generateAndKeep({ hues: [{ name: 'blue' }] });
    expect(events.slice(-2)).toEqual([{ type: 'session', id: 'session-1' }, { type: 'done' }]);
    expect(events.find((e) => e.type === 'palette')).toHaveProperty('source.scheme', 'monochromatic');
    session.close();
  });

  it('refines one palette in the same session', async () => {
    const { request, session } = await generateAndKeep({ hues: [{ name: 'blue' }], schemes: ['analogous', 'triadic'] });
    const events: GenerateEvent[] = [];
    await refinePalette(session, request, 'triadic', 'warmer please', { timeoutMs: 10_000, emit: (e) => events.push(e) });
    const palettes = events.filter((e) => e.type === 'palette');
    expect(palettes).toHaveLength(1);
    expect(palettes[0]!.source).toMatchObject({ scheme: 'triadic', rationale: 'Refined: warmer please' });
    expect(events.at(-1)).toEqual({ type: 'done' });
    session.close();
  });

  it('regenerates without a note', async () => {
    const { request, session } = await generateAndKeep({ hues: [{ name: 'blue' }] });
    const events: GenerateEvent[] = [];
    await refinePalette(session, request, 'monochromatic', undefined, { timeoutMs: 10_000, emit: (e) => events.push(e) });
    expect(events.find((e) => e.type === 'palette')).toHaveProperty('source.rationale', 'A different take.');
    session.close();
  });
});
