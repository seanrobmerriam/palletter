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
