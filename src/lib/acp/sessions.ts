/**
 * Agent sessions kept open after a generation, so a palette can be refined in the same
 * conversation. Sessions close after a period without use, and the oldest close first when
 * there are too many.
 */
import { randomUUID } from 'node:crypto';
import type { PaletteRequest } from '../prompt/schema';
import type { AgentSession } from './process';

export type StoredSession = {
  id: string;
  session: AgentSession;
  request: PaletteRequest;
  lastUsed: number;
  busy: boolean;
};

export const SESSION_TTL_MS = 30 * 60_000;
export const MAX_SESSIONS = 20;

export class SessionStore {
  private readonly sessions = new Map<string, StoredSession>();

  constructor(
    private readonly ttlMs = SESSION_TTL_MS,
    private readonly max = MAX_SESSIONS,
    private readonly now: () => number = Date.now,
  ) {}

  add(session: AgentSession, request: PaletteRequest): string {
    this.sweep();
    while (this.sessions.size >= this.max) {
      const oldest = [...this.sessions.values()].filter((s) => !s.busy).sort((a, b) => a.lastUsed - b.lastUsed)[0];
      if (!oldest) break;
      this.remove(oldest.id);
    }
    const id = randomUUID();
    this.sessions.set(id, { id, session, request, lastUsed: this.now(), busy: false });
    return id;
  }

  get(id: string): StoredSession | undefined {
    this.sweep();
    return this.sessions.get(id);
  }

  touch(id: string): void {
    const stored = this.sessions.get(id);
    if (stored) stored.lastUsed = this.now();
  }

  remove(id: string): void {
    const stored = this.sessions.get(id);
    if (!stored) return;
    this.sessions.delete(id);
    stored.session.close();
  }

  get size(): number {
    return this.sessions.size;
  }

  /** Close sessions that haven't been used within the TTL. */
  sweep(): void {
    const cutoff = this.now() - this.ttlMs;
    for (const stored of [...this.sessions.values()]) {
      if (!stored.busy && stored.lastUsed < cutoff) this.remove(stored.id);
    }
  }
}

/** The server's session store. */
export const sessions = new SessionStore();
