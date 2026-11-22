import { describe, expect, it } from 'vitest';
import {
  agentProfiles,
  agentTimeoutMs,
  CLAUDE_SESSION_META,
  DEFAULT_TIMEOUT_MS,
  defaultAgentId,
  MINIMAX_DEFAULT_BASE_URL,
  MINIMAX_DEFAULT_MODEL,
  splitCommand,
} from './agents';

const profile = (env: Record<string, string>, id: string) => agentProfiles(env).find((p) => p.id === id)!;

describe('splitCommand', () => {
  it.each([
    ['claude-agent-acp', ['claude-agent-acp']],
    ['  bun  test/fake-agent.ts ', ['bun', 'test/fake-agent.ts']],
    [`gemini --experimental-acp --model "gemini 3"`, ['gemini', '--experimental-acp', '--model', 'gemini 3']],
    [`node '/path with spaces/agent.js' ''`, ['node', '/path with spaces/agent.js', '']],
  ])('%s', (command, words) => {
    expect(splitCommand(command)).toEqual(words);
  });

  it('rejects an unclosed quote', () => {
    expect(() => splitCommand('agent "oops')).toThrow(/Unclosed/);
  });
});

describe('agentProfiles', () => {
  it('always offers Claude Code through the ACP adapter, with tools and settings switched off', () => {
    expect(profile({}, 'claude')).toMatchObject({
      available: true,
      command: 'claude-agent-acp',
      args: [],
      sessionMeta: CLAUDE_SESSION_META,
    });
    expect(CLAUDE_SESSION_META.claudeCode.options).toMatchObject({ tools: [], settingSources: [] });
  });

  it('offers MiniMax only with an API key', () => {
    expect(profile({}, 'minimax')).toMatchObject({ available: false, unavailableReason: expect.stringContaining('MINIMAX_API_KEY') });
    expect(profile({ MINIMAX_API_KEY: 'mm-key' }, 'minimax').available).toBe(true);
  });

  it('points the Claude adapter at MiniMax', () => {
    const minimax = profile({ MINIMAX_API_KEY: 'mm-key' }, 'minimax');
    expect(minimax.command).toBe('claude-agent-acp');
    expect(minimax.env).toEqual({
      ANTHROPIC_BASE_URL: MINIMAX_DEFAULT_BASE_URL,
      ANTHROPIC_AUTH_TOKEN: 'mm-key',
      ANTHROPIC_API_KEY: null,
      ANTHROPIC_MODEL: MINIMAX_DEFAULT_MODEL,
      ANTHROPIC_DEFAULT_OPUS_MODEL: MINIMAX_DEFAULT_MODEL,
      ANTHROPIC_DEFAULT_SONNET_MODEL: MINIMAX_DEFAULT_MODEL,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: MINIMAX_DEFAULT_MODEL,
    });
  });

  it('lets you change the MiniMax model and base URL', () => {
    const minimax = profile(
      { MINIMAX_API_KEY: 'k', PALLETTER_MINIMAX_MODEL: 'MiniMax-M3', PALLETTER_MINIMAX_BASE_URL: 'https://api.minimax.cn/anthropic' },
      'minimax',
    );
    expect(minimax.label).toBe('MiniMax (MiniMax-M3)');
    expect(minimax.env).toMatchObject({ ANTHROPIC_MODEL: 'MiniMax-M3', ANTHROPIC_BASE_URL: 'https://api.minimax.cn/anthropic' });
  });

  it('runs a custom command', () => {
    expect(profile({ PALLETTER_AGENT_COMMAND: 'gemini --experimental-acp' }, 'custom')).toMatchObject({
      available: true,
      label: 'Custom (gemini)',
      command: 'gemini',
      args: ['--experimental-acp'],
    });
    expect(profile({}, 'custom').available).toBe(false);
  });
});

describe('defaultAgentId', () => {
  it('uses PALLETTER_AGENT', () => {
    expect(defaultAgentId({ PALLETTER_AGENT: 'minimax' })).toBe('minimax');
  });

  it('prefers a custom command over Claude Code', () => {
    expect(defaultAgentId({ PALLETTER_AGENT_COMMAND: 'x' })).toBe('custom');
  });

  it('falls back to Claude Code', () => {
    expect(defaultAgentId({})).toBe('claude');
    expect(defaultAgentId({ PALLETTER_AGENT: 'nonsense' })).toBe('claude');
  });
});

describe('agentTimeoutMs', () => {
  it('reads PALLETTER_AGENT_TIMEOUT_MS, or uses the default', () => {
    expect(agentTimeoutMs({ PALLETTER_AGENT_TIMEOUT_MS: '5000' })).toBe(5000);
    expect(agentTimeoutMs({ PALLETTER_AGENT_TIMEOUT_MS: 'soon' })).toBe(DEFAULT_TIMEOUT_MS);
    expect(agentTimeoutMs({})).toBe(DEFAULT_TIMEOUT_MS);
  });
});
