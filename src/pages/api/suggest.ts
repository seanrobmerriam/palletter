/**
 * POST a SuggestRequest (plus an optional `agent` and `model`). Responds with server-sent events:
 * `status`, `warning`, `direction` (one per direction), `session` (an id for follow-ups), then
 * `done` or `error`.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { agentTimeoutMs } from '../../lib/acp/agents';
import { getAgentProcess, getProfile, serverEnv } from '../../lib/acp/registry';
import { suggestSessions } from '../../lib/acp/sessions';
import { eventStreamResponse, jsonResponse } from '../../lib/server/stream';
import { suggestColors, type SuggestEvent } from '../../lib/suggest/run';
import { SuggestRequestSchema } from '../../lib/suggest/schema';

export const prerender = false;

const BodySchema = SuggestRequestSchema.extend({
  agent: z.enum(['claude', 'minimax', 'custom']).optional(),
  model: z.string().trim().min(1).max(100).optional(),
});

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'The request body must be JSON.' });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(400, {
      error: 'The suggestion request is not valid.',
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const { agent, model, ...suggestRequest } = parsed.data;
  const env = serverEnv();
  const profile = getProfile(agent, env);
  if (model && !profile.chooseModel) {
    return jsonResponse(400, {
      error: 'The suggestion request is not valid.',
      issues: [{ path: 'model', message: `${profile.label} doesn't let you choose a model.` }],
    });
  }

  return eventStreamResponse<SuggestEvent>(request, (emit, signal) =>
    suggestColors(suggestRequest, {
      openSession: () => getAgentProcess(profile).newSession(model ? { model } : {}),
      retainSession: (session, req) => suggestSessions.add(session, req),
      timeoutMs: agentTimeoutMs(env),
      signal,
      emit,
    }),
  );
};
