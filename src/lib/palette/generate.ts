/**
 * The whole generation flow: prompt → agent → parse (with one repair) → resolve → format.
 * Progress and results are reported as events, which the API streams to the browser.
 */
import { AgentError } from '../acp/errors';
import type { AgentSession } from '../acp/process';
import { formatPalette, FormatError } from '../format/index';
import { buildPrompt } from '../prompt/build';
import { parseModelResponse } from '../prompt/parse';
import { buildRepairPrompt } from '../prompt/repair';
import type { PaletteRequest } from '../prompt/schema';
import { resolvePalette, type ResolvedPalette } from './resolve';

export type GenerateStage = 'starting' | 'thinking' | 'writing' | 'checking' | 'repairing';

export type GenerateEvent =
  | { type: 'status'; stage: GenerateStage; message: string }
  | { type: 'warning'; message: string }
  | { type: 'palette'; palette: ResolvedPalette; tokens: string }
  | { type: 'done' }
  | { type: 'error'; code: string; message: string; detail?: string };

export type GenerateOptions = {
  /** Opens a session on the agent. */
  openSession: () => Promise<AgentSession>;
  timeoutMs: number;
  signal?: AbortSignal;
  emit: (event: GenerateEvent) => void;
};

const STAGE_MESSAGES: Record<GenerateStage, string> = {
  starting: 'Starting the agent…',
  thinking: 'The agent is thinking…',
  writing: 'The agent is writing the palettes…',
  checking: 'Checking the palettes…',
  repairing: 'Asking the agent to fix its reply…',
};

/** Runs one request to completion. Always ends with exactly one `done` or `error` event. */
export async function generatePalettes(request: PaletteRequest, options: GenerateOptions): Promise<void> {
  const { emit, signal, timeoutMs } = options;
  let stage: GenerateStage | undefined;
  const setStage = (next: GenerateStage) => {
    if (stage === next) return;
    stage = next;
    emit({ type: 'status', stage: next, message: STAGE_MESSAGES[next] });
  };

  let session: AgentSession | undefined;
  try {
    setStage('starting');
    session = await options.openSession();
    // The agent is working from here, even if it doesn't stream its thoughts.
    setStage('thinking');

    const promptOptions = {
      signal,
      timeoutMs,
      onProgress: (progress: { kind: string }) => {
        if (progress.kind === 'thinking') setStage(stage === 'repairing' ? 'repairing' : 'thinking');
        else if (progress.kind === 'writing' && stage !== 'repairing') setStage('writing');
      },
    };

    let reply = await session.prompt(buildPrompt(request), promptOptions);
    setStage('checking');
    let result = parseModelResponse(reply, request);

    if (!result.ok) {
      setStage('repairing');
      reply = await session.prompt(buildRepairPrompt(result.problems), promptOptions);
      setStage('checking');
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

    for (const palette of result.response.palettes) {
      const resolved = resolvePalette(palette, request.colorSystem);
      const tokens = formatPalette(resolved, { format: request.tokenFormat, namingPattern: request.namingPattern });
      emit({ type: 'palette', palette: resolved, tokens });
    }
    emit({ type: 'done' });
  } catch (error) {
    emit(toErrorEvent(error));
  } finally {
    session?.close();
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
