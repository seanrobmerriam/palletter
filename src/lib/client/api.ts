/** Calls to the palette endpoints from the browser. */
import type { GenerateEvent } from '../palette/generate';
import { readEvents } from './sse';

export type StreamResult =
  | { ok: true }
  | { ok: false; status: number; code?: string; message: string; detail?: string };

/**
 * POST JSON to an event-stream endpoint and hand each event to `onEvent`. Resolves when the
 * stream ends. A non-2xx response resolves with its error instead of streaming.
 */
export async function postForEvents<E = GenerateEvent>(
  url: string,
  body: unknown,
  signal: AbortSignal,
  onEvent: (event: E) => void,
): Promise<StreamResult> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) {
    const error = (await response.json().catch(() => ({}))) as {
      code?: string;
      error?: string;
      issues?: { path: string; message: string }[];
    };
    return {
      ok: false,
      status: response.status,
      code: error.code,
      message: error.error ?? `The server said no (${response.status}).`,
      detail: error.issues?.map((i) => `${i.path}: ${i.message}`).join('\n'),
    };
  }
  for await (const message of readEvents(response.body)) onEvent(JSON.parse(message.data) as E);
  return { ok: true };
}
