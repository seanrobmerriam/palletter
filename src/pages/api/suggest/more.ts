/**
 * POST a follow-up in the session a suggestion kept open:
 *
 * - `{ sessionId, kind: "directions", count }` streams `count` more `direction` events.
 * - `{ sessionId, kind: "like", color, direction }` streams one `alternatives` event with colors
 *   like `color`, from the direction named `direction`.
 *
 * Responds 404 with `code: "session_expired"` when the session has closed, and 409 while it's busy.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { agentTimeoutMs } from '../../../lib/acp/agents';
import { serverEnv } from '../../../lib/acp/registry';
import { suggestSessions } from '../../../lib/acp/sessions';
import { eventStreamResponse, jsonResponse } from '../../../lib/server/stream';
import { moreDirections, moreLike, type SuggestEvent } from '../../../lib/suggest/run';
import { MAX_DIRECTIONS, YourColorSchema } from '../../../lib/suggest/schema';

export const prerender = false;

const BodySchema = z.discriminatedUnion('kind', [
  z.object({ sessionId: z.string().min(1), kind: z.literal('directions'), count: z.number().int().min(1).max(MAX_DIRECTIONS) }),
  z.object({ sessionId: z.string().min(1), kind: z.literal('like'), color: YourColorSchema, direction: z.string().trim().min(1).max(60) }),
]);

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
      error: 'The follow-up request is not valid.',
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const follow = parsed.data;
  const stored = suggestSessions.get(follow.sessionId);
  if (!stored) return jsonResponse(404, { code: 'session_expired', error: 'The agent session for these suggestions has closed.' });
  if (stored.busy) return jsonResponse(409, { code: 'busy', error: 'The agent is still working on these suggestions.' });

  stored.busy = true;
  return eventStreamResponse<SuggestEvent>(request, async (emit, signal) => {
    let failed: string | undefined;
    const options = {
      timeoutMs: agentTimeoutMs(serverEnv()),
      signal,
      emit: (event: SuggestEvent) => {
        if (event.type === 'error') failed = event.code;
        emit(event);
      },
    };
    try {
      if (follow.kind === 'directions') await moreDirections(stored.session, stored.request, follow.count, options);
      else await moreLike(stored.session, stored.request, follow.color, follow.direction, options);
    } finally {
      stored.busy = false;
      suggestSessions.touch(follow.sessionId);
      if (failed && FATAL.has(failed)) suggestSessions.remove(follow.sessionId);
    }
  });
};
