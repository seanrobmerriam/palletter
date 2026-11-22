import { afterEach, describe, expect, it } from 'vitest';
import { fakeAgentProfile } from '../../../test/agent';
import { agentProfiles } from './agents';
import { AgentError } from './errors';
import { AgentProcess, type PromptProgress } from './process';

const processes: AgentProcess[] = [];
const start = (profile = fakeAgentProfile()) => {
  const p = new AgentProcess(profile);
  processes.push(p);
  return p;
};
afterEach(() => {
  for (const p of processes.splice(0)) p.stop();
});

const PROMPT = '# Palette request\n\n- monochromatic: hue 260°.\n\nEvery color must have exactly these steps: 100, 500.\n';
const opts = { timeoutMs: 10_000 };

async function rejection(promise: Promise<unknown>): Promise<AgentError> {
  const error = await promise.then(
    () => {
      throw new Error('Expected a rejection');
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AgentError);
  return error as AgentError;
}

describe('AgentProcess', () => {
  it('initializes the agent', async () => {
    const init = await start().start();
    expect(init.agentInfo?.name).toBe('fake-agent');
  });

  it('collects the streamed reply and reports progress', async () => {
    const session = await start().newSession();
    const progress: PromptProgress[] = [];
    const reply = await session.prompt(PROMPT, { ...opts, onProgress: (p) => progress.push(p) });
    expect(reply).toContain('```json');
    expect(JSON.parse(reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)).palettes).toHaveLength(1);
    expect(progress[0]).toEqual({ kind: 'thinking' });
    expect(progress.filter((p) => p.kind === 'writing').length).toBeGreaterThan(1);
  });

  it('keeps one process for many sessions', async () => {
    const agent = start();
    const [a, b] = await Promise.all([agent.newSession(), agent.newSession()]);
    const [ra, rb] = await Promise.all([a.prompt(PROMPT, opts), b.prompt(PROMPT, opts)]);
    expect(ra).toBe(rb);
  });

  it('denies permission requests', async () => {
    const session = await start().newSession();
    expect(await session.prompt(`${PROMPT} fake:permission`, opts)).toContain('Permission outcome: cancelled.');
  });

  it('times out', async () => {
    const session = await start().newSession();
    const error = await rejection(session.prompt(`${PROMPT} fake:slow`, { timeoutMs: 300 }));
    expect(error.code).toBe('timeout');
  });

  it('can be cancelled', async () => {
    const session = await start().newSession();
    const abort = new AbortController();
    const pending = session.prompt(`${PROMPT} fake:slow`, { ...opts, signal: abort.signal });
    setTimeout(() => abort.abort(), 100);
    expect((await rejection(pending)).code).toBe('cancelled');
  });

  it('reports auth_required as a sign-in problem', async () => {
    const session = await start().newSession();
    const error = await rejection(session.prompt(`${PROMPT} fake:auth`, opts));
    expect(error.code).toBe('auth_required');
  });

  it('reports a crash, then starts again on the next session', async () => {
    const agent = start();
    const session = await agent.newSession();
    const error = await rejection(session.prompt(`${PROMPT} fake:crash`, opts));
    expect(error.code).toBe('crashed');
    expect(error.message).toContain('exit code 3');
    const again = await agent.newSession();
    expect(await again.prompt(PROMPT, opts)).toContain('```json');
  });

  it('reports a command that does not exist', async () => {
    const error = await rejection(start(fakeAgentProfile('palletter-no-such-agent --acp')).start());
    expect(error.code).toBe('not_installed');
    expect(error.message).toContain('palletter-no-such-agent');
  });

  it('reports an agent that is not set up', async () => {
    const minimax = agentProfiles({}).find((p) => p.id === 'minimax')!;
    const error = await rejection(start(minimax).start());
    expect(error.code).toBe('not_configured');
    expect(error.message).toContain('MINIMAX_API_KEY');
  });

  it('reports a process that exits before initializing', async () => {
    const error = await rejection(start(fakeAgentProfile('bun -e "process.exit(2)"')).start());
    expect(error.code).toBe('crashed');
  });
});
