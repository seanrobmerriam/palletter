/** Server-sent event responses for the palette endpoints. */
import type { GenerateEvent } from '../palette/generate';

/** How often to send a keep-alive comment while the agent works. */
export const KEEP_ALIVE_MS = 5000;

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/**
 * Stream the events `run` emits. The run is cancelled (through `signal`) when the client
 * disconnects. Agents can think in silence for a long time, so a comment line every few seconds
 * keeps servers and proxies from closing the connection as idle; event readers ignore it.
 */
export function eventStreamResponse(
  request: Request,
  run: (emit: (event: GenerateEvent) => void, signal: AbortSignal) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  request.signal.addEventListener('abort', () => abort.abort(), { once: true });
  let keepAlive: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // The client went away.
        }
      };
      keepAlive = setInterval(() => send(': keep-alive\n\n'), KEEP_ALIVE_MS);
      await run((event) => {
        if (!abort.signal.aborted || event.type === 'error') send(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }, abort.signal);
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
}
