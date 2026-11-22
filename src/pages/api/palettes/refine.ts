/**
 * POST `{ sessionId, scheme, note? }` to refine one palette in the session a generation kept
 * open. Without a note, the agent makes a different version. Streams the same events as
 * `/api/palettes`, with a single `palette` event.
 *
 * Responds 404 with `code: "session_expired"` when the session has closed, so the client can
 * start a new generation instead, and 409 while the session is busy.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { agentTimeoutMs } from '../../../lib/acp/agents';
import { serverEnv } from '../../../lib/acp/registry';
import { sessions } from '../../../lib/acp/sessions';
import { refinePalette } from '../../../lib/palette/generate';
import { SchemeSchema } from '../../../lib/prompt/schema';
import { eventStreamResponse, jsonResponse } from '../../../lib/server/stream';

export const prerender = false;

const BodySchema = z.object({
  sessionId: z.string().min(1),
  scheme: SchemeSchema,
  note: z.string().trim().max(500, 'Keep the note under 500 characters').optional(),
});

/** Errors after which the session can't be used again. */
const FATAL = new Set(['crashed', 'not_installed', 'not_configured', 'auth_required']);

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
      error: 'The refine request is not valid.',
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const { sessionId, scheme, note } = parsed.data;
  const stored = sessions.get(sessionId);
  if (!stored) {
    return jsonResponse(404, { code: 'session_expired', error: 'This palette’s agent session has closed.' });
  }
  if (stored.busy) {
    return jsonResponse(409, { code: 'busy', error: 'The agent is still working on this session.' });
  }
  if (!stored.request.schemes.includes(scheme)) {
    return jsonResponse(400, { error: `This session has no ${scheme} palette.` });
  }

  stored.busy = true;
  return eventStreamResponse(request, async (emit, signal) => {
    let failed: string | undefined;
    try {
      await refinePalette(stored.session, stored.request, scheme, note || undefined, {
        timeoutMs: agentTimeoutMs(serverEnv()),
        signal,
        emit: (event) => {
          if (event.type === 'error') failed = event.code;
          emit(event);
        },
      });
    } finally {
      stored.busy = false;
      sessions.touch(sessionId);
      if (failed && FATAL.has(failed)) sessions.remove(sessionId);
    }
  });
};
