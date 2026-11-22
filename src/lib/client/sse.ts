/** Read server-sent events from a fetch response body. */

export type ServerEvent = { event: string; data: string };

/** Split a buffer into complete events, returning them and whatever is left over. */
export function parseEvents(buffer: string): { events: ServerEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');
  const rest = blocks.pop() ?? '';
  const events = blocks.flatMap((block): ServerEvent[] => {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    return data.length ? [{ event, data: data.join('\n') }] : [];
  });
  return { events, rest };
}

export async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ServerEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseEvents(buffer);
      buffer = rest;
      yield* events;
    }
    const { events } = parseEvents(`${buffer + decoder.decode()}\n\n`);
    yield* events;
  } finally {
    reader.releaseLock();
  }
}
