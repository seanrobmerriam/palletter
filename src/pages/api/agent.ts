/**
 * GET the configured agents. With `?check=<id>`, also start that agent and report whether it
 * answers `initialize`, so the UI can show a connection indicator.
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
        const init = await getAgentProcess(profile).start();
        check = { id: profile.id, ok: true, agentInfo: init.agentInfo ?? null };
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
