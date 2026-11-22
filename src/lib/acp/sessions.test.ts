import { describe, expect, it, vi } from 'vitest';
import { PaletteRequestSchema } from '../prompt/schema';
import { SessionStore } from './sessions';

const request = PaletteRequestSchema.parse({ hues: [{ name: 'blue' }] });
const fakeSession = () => ({ prompt: vi.fn(), close: vi.fn() });

describe('SessionStore', () => {
  it('stores and finds sessions', () => {
    const store = new SessionStore();
    const session = fakeSession();
    const id = store.add(session, request);
    expect(store.get(id)).toMatchObject({ id, session, request, busy: false });
    expect(store.get('nope')).toBeUndefined();
  });

  it('closes sessions that have not been used within the TTL', () => {
    let now = 0;
    const store = new SessionStore(1000, 10, () => now);
    const session = fakeSession();
    const id = store.add(session, request);
    now = 900;
    store.touch(id);
    now = 1800;
    expect(store.get(id)).toBeDefined();
    now = 2000;
    expect(store.get(id)).toBeUndefined();
    expect(session.close).toHaveBeenCalledOnce();
  });

  it('keeps busy sessions past the TTL', () => {
    let now = 0;
    const store = new SessionStore(1000, 10, () => now);
    const id = store.add(fakeSession(), request);
    store.get(id)!.busy = true;
    now = 5000;
    expect(store.get(id)).toBeDefined();
  });

  it('closes the least recently used session when full', () => {
    let now = 0;
    const store = new SessionStore(60_000, 2, () => now);
    const first = fakeSession();
    const a = store.add(first, request);
    now = 1;
    const b = store.add(fakeSession(), request);
    now = 2;
    store.touch(a);
    now = 3;
    store.add(fakeSession(), request);
    expect(store.size).toBe(2);
    expect(store.get(b)).toBeUndefined();
    expect(store.get(a)).toBeDefined();
    expect(first.close).not.toHaveBeenCalled();
  });

  it('closes a removed session', () => {
    const store = new SessionStore();
    const session = fakeSession();
    const id = store.add(session, request);
    store.remove(id);
    expect(session.close).toHaveBeenCalledOnce();
    expect(store.size).toBe(0);
  });
});
