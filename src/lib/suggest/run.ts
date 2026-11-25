/**
 * The suggestion flow: prompt → agent → parse (with one repair) → events. The session is kept
 * open so the user can ask for more directions, or for more colors like one they liked.
 */
import { AgentError } from '../acp/errors';
import type { AgentSession, PromptOptions } from '../acp/process';
import { toErrorEvent } from '../palette/generate';
import { parseAlternatives, parseDirections, type Parsed } from './parse';
import { buildMoreDirectionsPrompt, buildMoreLikePrompt, buildSuggestPrompt, buildSuggestRepairPrompt } from './prompt';
import type { Direction, SuggestedColor, SuggestRequest, YourColor } from './schema';

export type SuggestStage = 'starting' | 'thinking' | 'writing' | 'checking' | 'repairing';

export type SuggestEvent =
  | { type: 'status'; stage: SuggestStage; message: string }
  | { type: 'warning'; message: string }
  /** One direction: new colors that work with the user's, and the roles of the user's colors. */
  | { type: 'direction'; direction: Direction }
  /** Alternatives to one suggested color. */
  | { type: 'alternatives'; colors: SuggestedColor[] }
  /** The agent session is kept open for follow-ups, under this id. */
  | { type: 'session'; id: string }
  | { type: 'done' }
  | { type: 'error'; code: string; message: string; detail?: string };

type Emit = (event: SuggestEvent) => void;

export type SuggestOptions = {
  emit: Emit;
  signal?: AbortSignal;
  timeoutMs: number;
};

const STAGE_MESSAGES: Record<SuggestStage, string> = {
  starting: 'Starting the agent…',
  thinking: 'The agent is looking at your colors…',
  writing: 'The agent is writing its suggestions…',
  checking: 'Checking the suggestions…',
  repairing: 'Asking the agent to fix its reply…',
};

function stageTracker(emit: Emit) {
  let stage: SuggestStage | undefined;
  const set = (next: SuggestStage) => {
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

/** One turn: send the prompt, parse the reply, and ask for one repair if it has problems. */
async function turn<T>(
  session: AgentSession,
  prompt: string,
  parse: (reply: string) => Parsed<T>,
  { emit, signal, timeoutMs }: SuggestOptions,
  stage: ReturnType<typeof stageTracker>,
): Promise<T> {
  const promptOptions: PromptOptions = { signal, timeoutMs, onProgress: stage.onProgress };
  let reply = await session.prompt(prompt, promptOptions);
  stage.set('checking');
  let result = parse(reply);
  if (!result.ok) {
    stage.set('repairing');
    reply = await session.prompt(buildSuggestRepairPrompt(result.problems), promptOptions);
    stage.set('checking');
    result = parse(reply);
    if (!result.ok) {
      throw new AgentError(
        'invalid_response',
        'The agent’s reply still had problems after one repair attempt.',
        [...result.problems, '', 'Reply:', reply].join('\n'),
      );
    }
  }
  for (const message of result.warnings) emit({ type: 'warning', message });
  return result.value;
}

export type StartOptions = SuggestOptions & {
  openSession: () => Promise<AgentSession>;
  /** Keep the session for follow-ups; returns its id. Without it, the session is closed. */
  retainSession?: (session: AgentSession, request: SuggestRequest) => string;
};

/** Suggest colors for a request. Always ends with exactly one `done` or `error` event. */
export async function suggestColors(request: SuggestRequest, options: StartOptions): Promise<void> {
  const { emit } = options;
  const stage = stageTracker(emit);
  let session: AgentSession | undefined;
  let retained = false;
  try {
    stage.set('starting');
    session = await options.openSession();
    stage.set('thinking');
    const directions = await turn(
      session,
      buildSuggestPrompt(request),
      (reply) => parseDirections(reply, request, request.directions),
      options,
      stage,
    );
    for (const direction of directions) emit({ type: 'direction', direction });
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

/** Ask for `count` more directions in an existing session. */
export async function moreDirections(session: AgentSession, request: SuggestRequest, count: number, options: SuggestOptions): Promise<void> {
  const stage = stageTracker(options.emit);
  try {
    stage.set('thinking');
    const directions = await turn(
      session,
      buildMoreDirectionsPrompt(count),
      (reply) => parseDirections(reply, request, count),
      options,
      stage,
    );
    for (const direction of directions) options.emit({ type: 'direction', direction });
    options.emit({ type: 'done' });
  } catch (error) {
    options.emit(toErrorEvent(error));
  }
}

/** Ask for alternatives to one suggested color in an existing session. */
export async function moreLike(
  session: AgentSession,
  request: SuggestRequest,
  color: YourColor,
  directionName: string,
  options: SuggestOptions,
): Promise<void> {
  const stage = stageTracker(options.emit);
  try {
    stage.set('thinking');
    const colors = await turn(
      session,
      buildMoreLikePrompt(color, directionName),
      (reply) => parseAlternatives(reply, request),
      options,
      stage,
    );
    options.emit({ type: 'alternatives', colors });
    options.emit({ type: 'done' });
  } catch (error) {
    options.emit(toErrorEvent(error));
  }
}
