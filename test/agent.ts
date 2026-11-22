import { agentProfiles, type AgentProfile } from '../src/lib/acp/agents';

/** The command that runs the fake ACP agent. */
export const FAKE_AGENT_COMMAND = 'bun test/fake-agent.ts';

export function fakeAgentProfile(command = FAKE_AGENT_COMMAND): AgentProfile {
  return agentProfiles({ PALLETTER_AGENT_COMMAND: command }).find((p) => p.id === 'custom')!;
}
