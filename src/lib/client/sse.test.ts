import { describe, expect, it } from 'vitest';
import { parseEvents, readEvents } from './sse';

describe('parseEvents', () => {
  it('parses complete events and keeps the rest', () => {
    const { events, rest } = parseEvents('event: status\ndata: {"a":1}\n\nevent: done\ndata: {}\n\nevent: pal');
    expect(events).toEqual([
      { event: 'status', data: '{"a":1}' },
      { event: 'done', data: '{}' },
    ]);
    expect(rest).toBe('event: pal');
  });

  it('joins multi-line data and handles CRLF', () => {
    expect(parseEvents('data: a\r\ndata: b\r\n\r\n').events).toEqual([{ event: 'message', data: 'a\nb' }]);
  });
});

describe('readEvents', () => {
  it('reads events split across chunks', async () => {
    const encoder = new TextEncoder();
    const chunks = ['event: status\nda', 'ta: 1\n\nevent: done\n', 'data: 2'];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    const events = [];
    for await (const event of readEvents(body)) events.push(event);
    expect(events).toEqual([
      { event: 'status', data: '1' },
      { event: 'done', data: '2' },
    ]);
  });
});
