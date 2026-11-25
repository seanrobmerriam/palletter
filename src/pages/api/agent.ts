/**
 * GET the configured agents. With `?check=<id>`, also start that agent and report whether it
 * answers `initialize`, so the UI can show a connection indicator. When the agent lets the user
 * choose a model, the check also lists its models (`models: { current, choices }`).
 */
import type { APIRoute } from 'astro';
import { AgentError } from '../../lib/acp/errors';
import { getAgentProcess, listProfiles, serverEnv } from '../../lib/acp/registry';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const env = serverEnv();
  const { profiles, defaultId } = listProfiles(env);
  const agents = profiles.map(({ id, label, available, unavailableReason }) => ({
    id,
    label,
    available,
    ...(unavailableReason ? { unavailableReason } : {}),
  }));

  const checkId = url.searchParams.get('check');
  let check: Record<string, unknown> | undefined;
  if (checkId) {
    const profile = profiles.find((p) => p.id === checkId);
    if (!profile) {
      check = { id: checkId, ok: false, code: 'not_configured', message: `There is no agent called "${checkId}".` };
    } else {
      try {
        const agent = getAgentProcess(profile);
        const init = await agent.start();
        // A model list is a nice-to-have: if reading it fails, the agent still works.
        const models = profile.chooseModel ? await agent.models().catch(() => undefined) : undefined;
        check = { id: profile.id, ok: true, agentInfo: init.agentInfo ?? null, ...(models ? { models } : {}) };
      } catch (error) {
        const agentError =
          error instanceof AgentError ? error : new AgentError('agent_error', `${profile.label} could not start.`);
        check = { id: profile.id, ok: false, code: agentError.code, message: agentError.message };
      }
    }
  }

  return new Response(JSON.stringify({ defaultAgent: defaultId, agents, ...(check ? { check } : {}) }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
