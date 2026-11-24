/**
 * The generation flow: prompt → agent → parse (with one repair) → resolve → format.
 * Progress and results are reported as events, which the API streams to the browser.
 */
import { AgentError } from '../acp/errors';
import type { AgentSession, PromptOptions } from '../acp/process';
import { formatPalette, FormatError } from '../format/index';
import { buildPrompt } from '../prompt/build';
import { parseModelResponse } from '../prompt/parse';
import { buildRefinePrompt } from '../prompt/refine';
import { buildRepairPrompt } from '../prompt/repair';
import type { ModelPalette, PaletteRequest, Scheme } from '../prompt/schema';
import { harmonizePalette } from './harmonize';
import { resolvePalette, type ResolvedPalette } from './resolve';

export type GenerateStage = 'starting' | 'thinking' | 'writing' | 'checking' | 'repairing';

export type GenerateEvent =
  | { type: 'status'; stage: GenerateStage; message: string }
  | { type: 'warning'; message: string }
  /**
   * One palette. `source` is the model's palette (oklch) after Palletter has balanced it, so
   * clients can convert and format it again without asking the model.
   */
  | { type: 'palette'; palette: ResolvedPalette; tokens: string; source: ModelPalette }
  /** The agent session is kept open for refinements, under this id. */
  | { type: 'session'; id: string }
  | { type: 'done' }
  | { type: 'error'; code: string; message: string; detail?: string };

type Emit = (event: GenerateEvent) => void;

export type GenerateOptions = {
  /** Opens a session on the agent. */
  openSession: () => Promise<AgentSession>;
  /** Keep the session for refinements; returns its id. Without it, the session is closed. */
  retainSession?: (session: AgentSession, request: PaletteRequest) => string;
  timeoutMs: number;
  signal?: AbortSignal;
  emit: Emit;
};

const STAGE_MESSAGES: Record<GenerateStage, string> = {
  starting: 'Starting the agent…',
  thinking: 'The agent is thinking…',
  writing: 'The agent is writing the palettes…',
  checking: 'Checking the palettes…',
  repairing: 'Asking the agent to fix its reply…',
};

function stageTracker(emit: Emit) {
  let stage: GenerateStage | undefined;
  const set = (next: GenerateStage) => {
    if (stage === next) return;
    stage = next;
    emit({ type: 'status', stage: next, message: STAGE_MESSAGES[next] });
  };
  return {
    set,
    onProgress: (progress: { kind: string }) => {
      if (stage === 'repairing') return;
      if (progress.kind === 'thinking') set('thinking');
      else if (progress.kind === 'writing') set('writing');
    },
  };
}

/**
 * One turn with the agent: send the prompt, parse the reply (with one repair attempt), and
 * emit a palette event for each scheme in `request.schemes`.
 */
async function runTurn(
  session: AgentSession,
  prompt: string,
  request: PaletteRequest,
  { emit, signal, timeoutMs }: Pick<GenerateOptions, 'emit' | 'signal' | 'timeoutMs'>,
  stage: ReturnType<typeof stageTracker>,
): Promise<void> {
  const promptOptions: PromptOptions = { signal, timeoutMs, onProgress: stage.onProgress };

  let reply = await session.prompt(prompt, promptOptions);
  stage.set('checking');
  let result = parseModelResponse(reply, request);

  if (!result.ok) {
    stage.set('repairing');
    reply = await session.prompt(buildRepairPrompt(result.problems), promptOptions);
    stage.set('checking');
    result = parseModelResponse(reply, request);
    if (!result.ok) {
      throw new AgentError(
        'invalid_response',
        'The agent’s reply still had problems after one repair attempt.',
        [...result.problems, '', 'Reply:', reply].join('\n'),
      );
    }
  }

  for (const warning of result.warnings) emit({ type: 'warning', message: warning });

  for (const reply of result.response.palettes) {
    const source = harmonizePalette(reply, request);
    const palette = resolvePalette(source, request.colorSystem);
    const tokens = formatPalette(palette, { format: request.tokenFormat, namingPattern: request.namingPattern });
    emit({ type: 'palette', palette, tokens, source });
  }
}

/** Runs one request to completion. Always ends with exactly one `done` or `error` event. */
export async function generatePalettes(request: PaletteRequest, options: GenerateOptions): Promise<void> {
  const { emit } = options;
  const stage = stageTracker(emit);
  let session: AgentSession | undefined;
  let retained = false;
  try {
    stage.set('starting');
    session = await options.openSession();
    // The agent is working from here, even if it doesn't stream its thoughts.
    stage.set('thinking');
    await runTurn(session, buildPrompt(request), request, options, stage);
    if (options.retainSession) {
      emit({ type: 'session', id: options.retainSession(session, request) });
      retained = true;
    }
    emit({ type: 'done' });
  } catch (error) {
    emit(toErrorEvent(error));
  } finally {
    if (!retained) session?.close();
  }
}

export type RefineOptions = Pick<GenerateOptions, 'emit' | 'signal' | 'timeoutMs'>;

/**
 * Refine one palette in an existing session, with a note from the user, or regenerate it
 * without one. Emits a single palette event for that scheme, then `done` or `error`.
 */
export async function refinePalette(
  session: AgentSession,
  request: PaletteRequest,
  scheme: Scheme,
  note: string | undefined,
  options: RefineOptions,
): Promise<void> {
  const stage = stageTracker(options.emit);
  try {
    stage.set('thinking');
    await runTurn(session, buildRefinePrompt(request, scheme, note), { ...request, schemes: [scheme] }, options, stage);
    options.emit({ type: 'done' });
  } catch (error) {
    options.emit(toErrorEvent(error));
  }
}

export function toErrorEvent(error: unknown): Extract<GenerateEvent, { type: 'error' }> {
  if (error instanceof AgentError) {
    return { type: 'error', code: error.code, message: error.message, ...(error.detail ? { detail: error.detail } : {}) };
  }
  if (error instanceof FormatError) return { type: 'error', code: 'format', message: error.message };
  return {
    type: 'error',
    code: 'internal',
    message: 'Something went wrong in Palletter.',
    detail: error instanceof Error ? (error.stack ?? error.message) : String(error),
  };
}
