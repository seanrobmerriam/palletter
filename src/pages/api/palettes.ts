/**
 * POST a PaletteRequest (plus an optional `agent`). Responds with server-sent events:
 * `status`, `warning`, `palette` (one per scheme), `session` (an id for refinements), then
 * `done` or `error`.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { agentTimeoutMs } from '../../lib/acp/agents';
import { getAgentProcess, getProfile, serverEnv } from '../../lib/acp/registry';
import { sessions } from '../../lib/acp/sessions';
import { generatePalettes } from '../../lib/palette/generate';
import { PaletteRequestSchema } from '../../lib/prompt/schema';
import { eventStreamResponse, jsonResponse } from '../../lib/server/stream';

export const prerender = false;

const BodySchema = PaletteRequestSchema.extend({
  agent: z.enum(['claude', 'minimax', 'custom']).optional(),
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
      error: 'The palette request is not valid.',
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const { agent, ...paletteRequest } = parsed.data;
  const env = serverEnv();
  const profile = getProfile(agent, env);

  return eventStreamResponse(request, (emit, signal) =>
    generatePalettes(paletteRequest, {
      openSession: () => getAgentProcess(profile).newSession(),
      retainSession: (session, req) => sessions.add(session, req),
      timeoutMs: agentTimeoutMs(env),
      signal,
      emit,
    }),
  );
};
