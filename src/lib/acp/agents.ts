/**
 * Agent profiles: which ACP agent to start, and how.
 *
 * - `claude`: Claude Code through the Claude Agent ACP adapter. Uses your Claude login or ANTHROPIC_API_KEY.
 * - `minimax`: the same adapter, pointed at MiniMax's Anthropic-compatible API. Needs MINIMAX_API_KEY.
 * - `custom`: any ACP agent, from PALLETTER_AGENT_COMMAND.
 */

export type AgentId = 'claude' | 'minimax' | 'custom';

export type AgentProfile = {
  id: AgentId;
  label: string;
  /** Can be started with the current configuration. */
  available: boolean;
  /** Why it isn't available, written for the user. */
  unavailableReason?: string;
  command: string;
  args: string[];
  /** Added to the agent's environment. `null` removes a variable. */
  env: Record<string, string | null>;
  /** Extra `session/new` metadata for this agent. */
  sessionMeta?: Record<string, unknown>;
};

export type Env = Record<string, string | undefined>;

export const MINIMAX_DEFAULT_BASE_URL = 'https://api.minimax.io/anthropic';
export const MINIMAX_DEFAULT_MODEL = 'MiniMax-M3.1-Flash';

/**
 * Claude Code options for palette sessions: no built-in tools, and none of the user's or project's
 * Claude settings, CLAUDE.md files, or hooks. The agent only needs to think and answer.
 */
export const CLAUDE_SESSION_META = {
  claudeCode: {
    options: { tools: [], settingSources: [], promptSuggestions: false },
  },
};

/** Split a command line into words, honouring single and double quotes. */
export function splitCommand(command: string): string[] {
  const words: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  let inWord = false;
  for (const char of command.trim()) {
    if (quote) {
      if (char === quote) quote = undefined;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      inWord = true;
    } else if (/\s/.test(char)) {
      if (inWord) words.push(current);
      current = '';
      inWord = false;
    } else {
      current += char;
      inWord = true;
    }
  }
  if (quote) throw new Error(`Unclosed ${quote} in agent command: ${command}`);
  if (inWord) words.push(current);
  return words;
}

const claudeAdapter = { command: 'claude-agent-acp', args: [] as string[] };

export function agentProfiles(env: Env): AgentProfile[] {
  const minimaxKey = env.MINIMAX_API_KEY?.trim();
  const minimaxModel = env.PALLETTER_MINIMAX_MODEL?.trim() || MINIMAX_DEFAULT_MODEL;
  const customCommand = env.PALLETTER_AGENT_COMMAND?.trim();
  const customWords = customCommand ? splitCommand(customCommand) : [];

  return [
    {
      id: 'claude',
      label: 'Claude Code',
      available: true,
      ...claudeAdapter,
      env: {},
      sessionMeta: CLAUDE_SESSION_META,
    },
    {
      id: 'minimax',
      label: `MiniMax (${minimaxModel})`,
      available: Boolean(minimaxKey),
      ...(minimaxKey ? {} : { unavailableReason: 'Set MINIMAX_API_KEY in .env to use MiniMax.' }),
      ...claudeAdapter,
      env: {
        ANTHROPIC_BASE_URL: env.PALLETTER_MINIMAX_BASE_URL?.trim() || MINIMAX_DEFAULT_BASE_URL,
        ANTHROPIC_AUTH_TOKEN: minimaxKey ?? null,
        // An Anthropic key would be sent to MiniMax instead of the MiniMax key.
        ANTHROPIC_API_KEY: null,
        ANTHROPIC_MODEL: minimaxModel,
        ANTHROPIC_DEFAULT_OPUS_MODEL: minimaxModel,
        ANTHROPIC_DEFAULT_SONNET_MODEL: minimaxModel,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: minimaxModel,
      },
      sessionMeta: CLAUDE_SESSION_META,
    },
    {
      id: 'custom',
      label: customWords.length ? `Custom (${customWords[0]})` : 'Custom',
      available: customWords.length > 0,
      ...(customWords.length ? {} : { unavailableReason: 'Set PALLETTER_AGENT_COMMAND in .env to use a custom agent.' }),
      command: customWords[0] ?? '',
      args: customWords.slice(1),
      env: {},
    },
  ];
}

/** The agent to use when a request doesn't name one. */
export function defaultAgentId(env: Env): AgentId {
  const chosen = env.PALLETTER_AGENT?.trim();
  if (chosen === 'claude' || chosen === 'minimax' || chosen === 'custom') return chosen;
  if (env.PALLETTER_AGENT_COMMAND?.trim()) return 'custom';
  return 'claude';
}

export const DEFAULT_TIMEOUT_MS = 180_000;

export function agentTimeoutMs(env: Env): number {
  const value = Number(env.PALLETTER_AGENT_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}
