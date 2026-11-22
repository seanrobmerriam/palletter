/**
 * POST a PaletteRequest (plus an optional `agent`). Responds with server-sent events:
 * `status`, `warning`, `palette` (one per scheme), then `done` or `error`.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { agentTimeoutMs } from '../../lib/acp/agents';
import { getAgentProcess, getProfile, serverEnv } from '../../lib/acp/registry';
import { generatePalettes, type GenerateEvent } from '../../lib/palette/generate';
import { PaletteRequestSchema } from '../../lib/prompt/schema';

export const prerender = false;

/** How often to send a keep-alive comment while the agent works. */
const KEEP_ALIVE_MS = 5000;

const BodySchema = PaletteRequestSchema.extend({
  agent: z.enum(['claude', 'minimax', 'custom']).optional(),
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'The request body must be JSON.' });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return json(400, {
      error: 'The palette request is not valid.',
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const { agent, ...paletteRequest } = parsed.data;
  const env = serverEnv();
  const profile = getProfile(agent, env);
  const encoder = new TextEncoder();
  const abort = new AbortController();
  request.signal.addEventListener('abort', () => abort.abort(), { once: true });

  let keepAlive: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Agents can think in silence for a long time. A comment line every few seconds keeps
      // servers and proxies from closing the connection as idle; EventSource readers ignore it.
      keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
        } catch {
          clearInterval(keepAlive);
        }
      }, KEEP_ALIVE_MS);

      const emit = (event: GenerateEvent) => {
        if (abort.signal.aborted && event.type !== 'error') return;
        try {
          controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
        } catch {
          // The client went away.
        }
      };
      await generatePalettes(paletteRequest, {
        openSession: () => getAgentProcess(profile).newSession(),
        timeoutMs: agentTimeoutMs(env),
        signal: abort.signal,
        emit,
      });
      clearInterval(keepAlive);
      try {
        controller.close();
      } catch {
        // Already closed.
      }
    },
    cancel() {
      clearInterval(keepAlive);
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  });
};
