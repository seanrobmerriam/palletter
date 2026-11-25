/**
 * Runs one ACP agent as a child process and talks to it over stdio.
 *
 * Palletter advertises no file system or terminal capabilities and denies every permission request,
 * so the agent can only think and reply.
 */
import { client, methods, ndJsonStream, RequestError, type ClientConnection } from '@agentclientprotocol/sdk';
import type * as acp from '@agentclientprotocol/sdk';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import type { AgentProfile } from './agents';
import { AgentError } from './errors';

export type PromptProgress =
  | { kind: 'thinking' }
  | { kind: 'writing'; characters: number }
  | { kind: 'tool'; title: string };

export type PromptOptions = {
  signal?: AbortSignal;
  timeoutMs: number;
  onProgress?: (progress: PromptProgress) => void;
};

/** A model the agent offers. `value` is what Palletter sends to choose it. */
export type ModelChoice = { value: string; name: string; description?: string };

/** The agent's model option: what a new session uses, and what else it offers. */
export type ModelOptions = { current: string; choices: ModelChoice[] };

/**
 * Find the model option among a session's config options (ACP `configOptions`): the select
 * option in the `model` category. Grouped choices are flattened.
 */
export function modelOptionFrom(configOptions: acp.SessionConfigOption[] | null | undefined): ModelOptions | undefined {
  const option = configOptions?.find((o) => o.category === 'model' && o.type === 'select');
  if (!option || option.type !== 'select') return undefined;
  const choices = option.options.flatMap((entry) => ('group' in entry ? entry.options : [entry]));
  return {
    current: option.currentValue,
    choices: choices.map((c) => ({ value: c.value, name: c.name, ...(c.description ? { description: c.description } : {}) })),
  };
}

export type SessionOptions = {
  /** A model from the agent's model option. Omit to use the agent's default. */
  model?: string;
};

/** A conversation with the agent. Follow-up prompts (repairs) keep the context. */
export type AgentSession = {
  prompt(text: string, options: PromptOptions): Promise<string>;
  close(): void;
};

const STDERR_LIMIT = 4000;

/** Spawn `command` with node_modules/.bin on PATH, so a locally installed adapter is found. */
function spawnAgent(profile: AgentProfile): ChildProcess {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  for (const [key, value] of Object.entries(profile.env)) {
    if (value === null) delete env[key];
    else env[key] = value;
  }
  env.PATH = [join(process.cwd(), 'node_modules', '.bin'), env.PATH].filter(Boolean).join(delimiter);
  return spawn(profile.command, profile.args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Turn an error from the agent or the connection into something the user can act on. */
function toAgentError(error: unknown, profile: AgentProfile, stderr: string): AgentError {
  if (error instanceof AgentError) return error;
  if (error instanceof RequestError && error.code === RequestError.authRequired().code) {
    return new AgentError(
      'auth_required',
      profile.id === 'claude'
        ? 'Claude Code is not signed in. Run `claude` and sign in, or set ANTHROPIC_API_KEY, then try again.'
        : `${profile.label} needs you to sign in before it can be used.`,
      error.message,
    );
  }
  const detail = [messageOf(error), stderr.trim()].filter(Boolean).join('\n\n');
  if (/auth|api key|401|403|unauthori[sz]ed|forbidden|log ?in/i.test(detail)) {
    return new AgentError('auth_required', `${profile.label} could not sign in. Check its API key or login.`, detail);
  }
  return new AgentError('agent_error', `${profile.label} reported an error: ${messageOf(error)}`, detail);
}

export class AgentProcess {
  private child?: ChildProcess;
  private connection?: ClientConnection;
  private ready?: Promise<acp.InitializeResponse>;
  private stderr = '';
  private exitError?: AgentError;
  /** Resolves when the child process exits or fails to start. */
  private exited: Promise<void> = Promise.resolve();
  /** A directory with nothing in it, so the agent has no project to read. */
  private readonly cwd = mkdtempSync(join(tmpdir(), 'palletter-agent-'));

  constructor(readonly profile: AgentProfile) {}

  get running(): boolean {
    return this.child !== undefined && this.exitError === undefined;
  }

  /** Start the agent if it isn't running, and wait for `initialize`. */
  start(): Promise<acp.InitializeResponse> {
    if (this.ready && this.running) return this.ready;
    this.ready = this.launch();
    return this.ready;
  }

  private launch(): Promise<acp.InitializeResponse> {
    const { profile } = this;
    if (!profile.available) {
      return Promise.reject(new AgentError('not_configured', profile.unavailableReason ?? `${profile.label} is not set up.`));
    }

    this.stderr = '';
    this.exitError = undefined;
    const child = spawnAgent(profile);
    this.child = child;
    this.exited = new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.once('error', () => resolve());
    });

    const failed = new Promise<never>((_, reject) => {
      child.once('error', (error: NodeJS.ErrnoException) => {
        this.exitError =
          error.code === 'ENOENT'
            ? new AgentError(
                'not_installed',
                `Could not find \`${profile.command}\`. ${
                  profile.command === 'claude-agent-acp'
                    ? 'Run `bun install` to install the Claude Code ACP adapter.'
                    : 'Check PALLETTER_AGENT_COMMAND.'
                }`,
                error.message,
              )
            : new AgentError('crashed', `${profile.label} could not start: ${error.message}`, error.message);
        this.connection?.close(this.exitError);
        reject(this.exitError);
      });
      child.once('exit', (code, signal) => {
        this.exitError ??= new AgentError(
          'crashed',
          `${profile.label} stopped unexpectedly (${signal ?? `exit code ${code}`}).`,
          this.stderr.trim() || undefined,
        );
        this.connection?.close(this.exitError);
        reject(this.exitError);
      });
    });
    failed.catch(() => {});

    child.stderr!.setEncoding('utf8');
    child.stderr!.on('data', (chunk: string) => {
      this.stderr = (this.stderr + chunk).slice(-STDERR_LIMIT);
    });

    const stream = ndJsonStream(
      Writable.toWeb(child.stdin!) as unknown as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout!) as unknown as ReadableStream<Uint8Array>,
    );

    const app = client({ name: 'palletter' }).onRequest(methods.client.session.requestPermission, () => ({
      outcome: { outcome: 'cancelled' },
    }));
    this.connection = app.connect(stream);

    const initialize = this.connection.agent.request(methods.agent.initialize, {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: 'palletter', title: 'Palletter', version: '0.1.0' },
    });

    return Promise.race([initialize, failed]).catch(async (error) => {
      // The connection often closes just before the exit event, which has the better message.
      await this.settleExit();
      const agentError = toAgentError(this.exitError ?? error, profile, this.stderr);
      this.stop();
      throw agentError;
    });
  }

  private modelCache?: Promise<ModelOptions | undefined>;

  /**
   * The models the agent offers, read from a throwaway session, or `undefined` if it has no model
   * option. Cached for the life of the process.
   */
  models(): Promise<ModelOptions | undefined> {
    this.modelCache ??= this.openSession()
      .then((session) => {
        const models = modelOptionFrom(session.newSessionResponse.configOptions);
        this.closeSession(session);
        return models;
      })
      .catch((error) => {
        this.modelCache = undefined;
        throw error;
      });
    return this.modelCache;
  }

  private async openSession(): Promise<acp.ActiveSession> {
    await this.start();
    const { profile } = this;
    return this.connection!.agent
      .buildSession({ cwd: this.cwd, mcpServers: [], ...(profile.sessionMeta ? { _meta: profile.sessionMeta } : {}) })
      .start()
      .catch((error) => {
        throw toAgentError(this.exitError ?? error, profile, this.stderr);
      });
  }

  private closeSession(session: acp.ActiveSession) {
    session.dispose();
    this.connection?.agent.request(methods.agent.session.close, { sessionId: session.sessionId }).catch(() => {});
  }

  /** Switch a new session to `model`, checking that the agent offers it. */
  private async chooseModel(session: acp.ActiveSession, model: string): Promise<void> {
    const { profile } = this;
    const options = modelOptionFrom(session.newSessionResponse.configOptions);
    if (!options) {
      throw new AgentError('model_unavailable', `${profile.label} doesn't let Palletter choose a model.`);
    }
    if (!options.choices.some((c) => c.value === model)) {
      throw new AgentError(
        'model_unavailable',
        `${profile.label} doesn't offer the model "${model}".`,
        `Available: ${options.choices.map((c) => c.value).join(', ')}`,
      );
    }
    if (options.current === model) return;
    await this.connection!.agent
      .request(methods.agent.session.setConfigOption, { sessionId: session.sessionId, configId: 'model', value: model })
      .catch((error) => {
        const agentError = toAgentError(this.exitError ?? error, profile, this.stderr);
        if (agentError.code !== 'agent_error') throw agentError;
        throw new AgentError('model_unavailable', `${profile.label} couldn't switch to the model "${model}".`, agentError.detail);
      });
  }

  /** Open a new session. Each palette request gets its own. */
  async newSession(options: SessionOptions = {}): Promise<AgentSession> {
    const session = await this.openSession();
    if (options.model) {
      try {
        await this.chooseModel(session, options.model);
      } catch (error) {
        this.closeSession(session);
        throw error;
      }
    }
    return {
      prompt: (text, options) => this.runPrompt(session, text, options),
      close: () => this.closeSession(session),
    };
  }

  private async runPrompt(
    session: acp.ActiveSession,
    text: string,
    { signal, timeoutMs, onProgress }: PromptOptions,
  ): Promise<string> {
    const connection = this.connection!;
    const { profile } = this;
    if (signal?.aborted) throw new AgentError('cancelled', 'Cancelled.');

    let reply = '';
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cancel = () => {
      if (!stopped) connection.agent.notify(methods.agent.session.cancel, { sessionId: session.sessionId }).catch(() => {});
    };

    const interrupted = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        cancel();
        reject(new AgentError('timeout', `${profile.label} took longer than ${Math.round(timeoutMs / 1000)} seconds.`));
      }, timeoutMs);
      signal?.addEventListener(
        'abort',
        () => {
          cancel();
          reject(new AgentError('cancelled', 'Cancelled.'));
        },
        { once: true },
      );
      connection.closed.then(async () => {
        await this.settleExit();
        reject(this.exitError ?? new AgentError('crashed', `${profile.label} disconnected.`));
      });
    });
    interrupted.catch(() => {});

    const read = (async () => {
      // `prompt()` rejects on errors such as auth_required, and then no stop message ever arrives.
      const failure = session.prompt(text).then(
        () => new Promise<never>(() => {}),
        (error) => Promise.reject(error),
      );
      failure.catch(() => {});
      for (;;) {
        const message = await Promise.race([session.nextUpdate(), failure]);
        if (message.kind === 'stop') {
          stopped = true;
          if (message.stopReason === 'cancelled') throw new AgentError('cancelled', 'Cancelled.');
          if (message.stopReason === 'refusal') {
            throw new AgentError('agent_error', `${profile.label} refused to answer.`, reply || undefined);
          }
          return reply;
        }
        const update = message.update;
        if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
          reply += update.content.text;
          onProgress?.({ kind: 'writing', characters: reply.length });
        } else if (update.sessionUpdate === 'agent_thought_chunk') {
          onProgress?.({ kind: 'thinking' });
        } else if (update.sessionUpdate === 'tool_call') {
          onProgress?.({ kind: 'tool', title: update.title });
        }
      }
    })();
    read.catch(() => {});

    try {
      return await Promise.race([read, interrupted]);
    } catch (error) {
      if (!(error instanceof AgentError) && connection.signal.aborted) await this.settleExit();
      throw toAgentError(this.exitError ?? error, profile, this.stderr);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Wait up to half a second for the process to exit, so its exit code can be reported. */
  private settleExit(): Promise<void> {
    return Promise.race([this.exited, new Promise<void>((resolve) => setTimeout(resolve, 500))]);
  }

  stop(): void {
    this.connection?.close();
    if (this.child && this.child.exitCode === null) this.child.kill();
    this.child = undefined;
    this.connection = undefined;
    this.ready = undefined;
  }
}
