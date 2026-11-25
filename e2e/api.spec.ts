import { expect, test } from '@playwright/test';

type Event = { type: string; [key: string]: unknown };

/** Parse a server-sent events body into its `data` payloads. */
function events(body: string): Event[] {
  return body
    .split('\n\n')
    .map((block) => block.split('\n').find((line) => line.startsWith('data: ')))
    .filter((line): line is string => Boolean(line))
    .map((line) => JSON.parse(line.slice(6)) as Event);
}

test.describe('GET /api/agent', () => {
  test('lists the agents and the default', async ({ request }) => {
    const response = await request.get('/api/agent');
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.defaultAgent).toBe('custom');
    expect(body.agents.map((a: { id: string }) => a.id)).toEqual(['claude', 'minimax', 'custom']);
    expect(body.agents[1]).toMatchObject({ available: false, unavailableReason: expect.stringContaining('MINIMAX_API_KEY') });
  });

  test('checks that an agent starts', async ({ request }) => {
    const body = await (await request.get('/api/agent?check=custom')).json();
    expect(body.check).toMatchObject({ id: 'custom', ok: true, agentInfo: { name: 'fake-agent' } });
  });

  test('lists the models of an agent that offers them', async ({ request }) => {
    const body = await (await request.get('/api/agent?check=custom')).json();
    expect(body.check.models).toEqual({
      current: 'default',
      choices: [
        { value: 'default', name: 'Default (recommended)', description: 'Fake Large' },
        { value: 'fake-large', name: 'Fake Large', description: 'Slow and careful' },
        { value: 'fake-small', name: 'Fake Small', description: 'Quick' },
      ],
    });
  });

  test('reports an agent that is not set up', async ({ request }) => {
    const body = await (await request.get('/api/agent?check=minimax')).json();
    expect(body.check).toMatchObject({ ok: false, code: 'not_configured' });
  });
});

test.describe('POST /api/palettes', () => {
  test('streams palettes from the agent', async ({ request }) => {
    const response = await request.post('/api/palettes', {
      data: { hues: [{ value: '#2563eb' }], schemes: ['analogous', 'complementary'], colorSystem: 'hex' },
    });
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('text/event-stream');

    const received = events(await response.text());
    expect(received[0]).toMatchObject({ type: 'status', stage: 'starting' });
    const palettes = received.filter((e) => e.type === 'palette') as Array<Event & { palette: { scheme: string }; tokens: string }>;
    expect(palettes.map((p) => p.palette.scheme)).toEqual(['analogous', 'complementary']);
    expect(palettes[0]!.tokens).toMatch(/^:root \{\n {2}--color-color-1-50: #[0-9a-f]{6};/);
    expect(received.at(-1)).toEqual({ type: 'done' });
  });

  test('uses the chosen model', async ({ request }) => {
    const response = await request.post('/api/palettes', { data: { hues: [{ value: '#2563eb' }], model: 'fake-small' } });
    const palette = events(await response.text()).find((e) => e.type === 'palette') as Event & { palette: { rationale: string } };
    expect(palette.palette.rationale).toBe('A fake palette from fake-small.');
  });

  test('reports a model the agent does not offer', async ({ request }) => {
    const response = await request.post('/api/palettes', { data: { hues: [{ value: '#2563eb' }], model: 'gpt-nope' } });
    const received = events(await response.text());
    expect(received.at(-1)).toMatchObject({ type: 'error', code: 'model_unavailable', message: expect.stringContaining('"gpt-nope"') });
  });

  test('streams the character schemes', async ({ request }) => {
    const response = await request.post('/api/palettes', {
      data: { hues: [{ value: '#2563eb' }], schemes: ['tonal', 'neutral-accent', 'functional', 'sourced'] },
    });
    const received = events(await response.text());
    type Palette = { scheme: string; colors: Array<{ role?: string }>; schemeCheck: { matches: boolean } };
    const palettes = received.filter((e) => e.type === 'palette').map((e) => (e as Event & { palette: Palette }).palette);
    expect(palettes.map((p) => p.scheme)).toEqual(['tonal', 'neutral-accent', 'functional', 'sourced']);
    expect(palettes[2]!.colors.map((c) => c.role)).toEqual(['primary', 'neutral', 'success', 'warning', 'danger', 'info']);
    expect(palettes.every((p) => p.schemeCheck.matches)).toBe(true);
    expect(received.at(-1)).toEqual({ type: 'done' });
  });

  test('rejects an invalid request with the problems', async ({ request }) => {
    const response = await request.post('/api/palettes', { data: { hues: [], schemes: ['pentadic'] } });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.issues.map((i: { path: string }) => i.path)).toEqual(expect.arrayContaining(['hues', 'schemes.0']));
  });

  test('rejects a body that is not JSON', async ({ request }) => {
    const response = await request.post('/api/palettes', { data: 'nope', headers: { 'content-type': 'text/plain' } });
    expect(response.status()).toBe(400);
  });

  test('streams an error for an agent that is not set up', async ({ request }) => {
    const response = await request.post('/api/palettes', { data: { hues: [{ name: 'blue' }], agent: 'minimax' } });
    expect(events(await response.text()).at(-1)).toMatchObject({ type: 'error', code: 'not_configured' });
  });
});

test.describe('POST /api/palettes/refine', () => {
  test('refines a palette in the session a generation kept', async ({ request }) => {
    const first = events(await (await request.post('/api/palettes', { data: { hues: [{ name: 'blue' }] } })).text());
    const session = first.find((e) => e.type === 'session') as Event & { id: string };
    expect(session.id).toMatch(/^[0-9a-f-]{36}$/);

    const response = await request.post('/api/palettes/refine', {
      data: { sessionId: session.id, scheme: 'from-my-colors', note: 'warmer' },
    });
    const received = events(await response.text());
    const palette = received.find((e) => e.type === 'palette') as Event & { source: { rationale: string } };
    expect(palette.source.rationale).toBe('Refined: warmer');
    expect(received.at(-1)).toEqual({ type: 'done' });
  });

  test('reports a session that has closed', async ({ request }) => {
    const response = await request.post('/api/palettes/refine', { data: { sessionId: 'gone', scheme: 'triadic' } });
    expect(response.status()).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'session_expired' });
  });

  test('rejects a scheme the session did not make', async ({ request }) => {
    const first = events(await (await request.post('/api/palettes', { data: { hues: [{ name: 'blue' }] } })).text());
    const session = first.find((e) => e.type === 'session') as Event & { id: string };
    const response = await request.post('/api/palettes/refine', { data: { sessionId: session.id, scheme: 'triadic' } });
    expect(response.status()).toBe(400);
  });
});

test('keeps the stream open while the agent is silent for longer than the idle timeout', async ({ request }) => {
  test.slow();
  const response = await request.post('/api/palettes', {
    data: { hues: [{ name: 'blue' }], mood: 'fake:pause' },
    timeout: 60_000,
  });
  const body = await response.text();
  expect(body).toContain(': keep-alive');
  expect(events(body).at(-1)).toEqual({ type: 'done' });
});
