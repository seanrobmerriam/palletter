/**
 * A tiny ACP agent for tests. Run with `bun test/fake-agent.ts`.
 *
 * It reads the Palletter prompt, and answers with a valid palette for the requested schemes, steps,
 * and roles. Put `fake:<mode>` anywhere in the prompt (e.g. in the mood) to change its behaviour:
 *
 * - good (default): a valid reply, streamed in chunks after a thought.
 * - bad-then-good: a reply missing a step, then a valid one after the repair prompt.
 * - bad: always missing a step.
 * - no-json: a reply with no JSON.
 * - slow: never answers until cancelled.
 * - pause: says nothing for 11 seconds, then answers.
 * - permission: asks for permission first, and reports the outcome in the rationale.
 * - crash: exits in the middle of the prompt.
 * - auth: fails with auth_required.
 */
import { agent, methods, ndJsonStream, RequestError } from '@agentclientprotocol/sdk';
import { Readable, Writable } from 'node:stream';

const STEP_LIGHTNESS: Record<string, number> = {
  '50': 97, '100': 94, '200': 88, '300': 81, '400': 71, '500': 63, '600': 55, '700': 48, '800': 42, '900': 37, '950': 27,
};
const SCHEME_HUES: Record<string, number[]> = {
  monochromatic: [0],
  analogous: [-30, 0, 30],
  complementary: [0, 180],
  'split-complementary': [0, 150, 210],
  triadic: [0, 120, 240],
  tetradic: [0, 60, 180, 240],
  tonal: [-15, 0, 15],
  'neutral-accent': [0, 180],
  functional: [0, 0, 140, 80, 25, 230],
  sourced: [0, 40, 200],
};

type Mode = 'good' | 'bad-then-good' | 'bad' | 'no-json' | 'slow' | 'pause' | 'permission' | 'crash' | 'auth';

function palettesFor(
  prompt: string,
  { dropStep = false, rationale = 'A fake palette.', only, hueShift = 0 }: { dropStep?: boolean; rationale?: string; only?: string; hueShift?: number } = {},
) {
  const requestPart = prompt.slice(prompt.indexOf('# Palette request'));
  const schemes = [...requestPart.matchAll(new RegExp(`^- (${Object.keys(SCHEME_HUES).join('|')}):`, 'gm'))].map((m) => m[1]!);
  const steps = (/Every color must have exactly these steps: ([\d, ]+)\./.exec(requestPart)?.[1] ?? '500').split(', ');
  const rolesSection = /## Roles\n([\s\S]*?)\n## /.exec(requestPart)?.[1] ?? '';
  const requestRoles = [...rolesSection.matchAll(/^- "([^"]+)"/gm)].map((m) => m[1]!);

  return {
    palettes: schemes.filter((scheme) => !only || scheme === only).map((scheme) => {
      const offsets = SCHEME_HUES[scheme]!;
      const roles = scheme === 'functional' ? [...(requestRoles.length ? requestRoles : ['primary', 'neutral']), 'success', 'warning', 'danger', 'info'] : requestRoles;
      const count = roles.length || offsets.length;
      return {
        scheme,
        rationale,
        colors: Array.from({ length: count }, (_, i) => {
          const hue = (((260 + hueShift + (offsets[i % offsets.length] ?? 0)) % 360) + 360) % 360;
          const kept = dropStep && i === 0 ? steps.slice(1) : steps;
          return {
            name: roles[i] ? `${roles[i]} color` : `color ${i + 1}`,
            ...(roles[i] ? { role: roles[i] } : {}),
            steps: Object.fromEntries(
              kept.map((step) => {
                const l = STEP_LIGHTNESS[step]!;
                const c = l > 90 || l < 30 ? 0.012 : 0.05;
                return [step, `oklch(${l}% ${c} ${hue})`];
              }),
            ),
          };
        }),
      };
    }),
  };
}

const promptsPerSession = new Map<string, number>();
let nextSession = 1;

/** The fake agent's models, offered as an ACP `model` config option like Claude Code's adapter. */
const FAKE_MODELS = [
  { value: 'default', name: 'Default (recommended)', description: 'Fake Large' },
  { value: 'fake-large', name: 'Fake Large', description: 'Slow and careful' },
  { value: 'fake-small', name: 'Fake Small', description: 'Quick' },
];
const modelPerSession = new Map<string, string>();
const modelOption = (current: string) => ({
  id: 'model',
  name: 'Model',
  category: 'model' as const,
  type: 'select' as const,
  currentValue: current,
  options: FAKE_MODELS,
});

const app = agent({ name: 'fake-agent' })
  .onRequest(methods.agent.initialize, () => ({
    protocolVersion: 1,
    agentCapabilities: {},
    agentInfo: { name: 'fake-agent', version: '0.0.0' },
    authMethods: [],
  }))
  .onRequest(methods.agent.session.new, () => ({ sessionId: `fake-${nextSession++}`, configOptions: [modelOption('default')] }))
  .onRequest(methods.agent.session.setConfigOption, ({ params }) => {
    if (params.configId !== 'model' || !FAKE_MODELS.some((m) => m.value === params.value)) {
      throw RequestError.invalidParams({ configId: params.configId }, 'Unknown config option or value.');
    }
    modelPerSession.set(params.sessionId, String(params.value));
    return { configOptions: [modelOption(String(params.value))] };
  })
  .onRequest(methods.agent.session.close, () => ({}))
  .onNotification(methods.agent.session.cancel, () => {})
  .onRequest(methods.agent.session.prompt, async ({ params, client, signal }) => {
    const text = params.prompt.map((block) => (block.type === 'text' ? block.text : '')).join('\n');
    const turn = (promptsPerSession.get(params.sessionId) ?? 0) + 1;
    promptsPerSession.set(params.sessionId, turn);
    // The mode lives in the first prompt; repair prompts don't repeat it.
    const first = turn === 1 ? text : (firstPrompts.get(params.sessionId) ?? '');
    if (turn === 1) firstPrompts.set(params.sessionId, text);
    const mode = (/fake:([a-z-]+)/.exec(first)?.[1] ?? process.env.FAKE_AGENT_MODE ?? 'good') as Mode;

    const say = (chunk: string) =>
      client.notify(methods.client.session.update, {
        sessionId: params.sessionId,
        update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: chunk } },
      });
    const think = () =>
      client.notify(methods.client.session.update, {
        sessionId: params.sessionId,
        update: { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Thinking about hues.' } },
      });

    if (mode === 'auth') throw RequestError.authRequired();
    if (mode === 'crash') process.exit(3);
    if (mode === 'slow') {
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
      return { stopReason: 'cancelled' as const };
    }

    if (mode === 'pause') await new Promise((resolve) => setTimeout(resolve, 11_000));
    await think();
    if (mode === 'no-json') {
      await say("Sorry, I can't make palettes.");
      return { stopReason: 'end_turn' as const };
    }

    const model = modelPerSession.get(params.sessionId);
    let rationale = model && model !== 'default' ? `A fake palette from ${model}.` : 'A fake palette.';
    if (mode === 'permission') {
      const answer = await client.request(methods.client.session.requestPermission, {
        sessionId: params.sessionId,
        toolCall: { toolCallId: 'tool-1', title: 'Write a file', kind: 'edit', status: 'pending' },
        options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }],
      });
      rationale = `Permission outcome: ${answer.outcome.outcome}.`;
    }

    // A refine or regenerate prompt asks for one scheme again.
    const refine = /changes to the ([a-z-]+) palette: (".*")|different take on the ([a-z-]+) palette/.exec(text);
    if (refine) {
      const scheme = refine[1] ?? refine[3]!;
      const note = refine[2] ? JSON.parse(refine[2]) : undefined;
      rationale = note ? `Refined: ${note}` : 'A different take.';
      const json = JSON.stringify(palettesFor(first, { rationale, only: scheme, hueShift: 20 * turn }), null, 2);
      await say(`\`\`\`json\n${json}\n\`\`\``);
      return { stopReason: 'end_turn' as const };
    }

    const dropStep = mode === 'bad' || (mode === 'bad-then-good' && turn === 1);
    const json = JSON.stringify(palettesFor(first, { dropStep, rationale }), null, 2);
    const reply = `Here you go.\n\n\`\`\`json\n${json}\n\`\`\`\n`;
    const third = Math.ceil(reply.length / 3);
    for (let i = 0; i < reply.length; i += third) await say(reply.slice(i, i + third));
    return { stopReason: 'end_turn' as const };
  });

const firstPrompts = new Map<string, string>();

const connection = app.connect(
  ndJsonStream(
    Writable.toWeb(process.stdout) as unknown as WritableStream<Uint8Array>,
    Readable.toWeb(process.stdin) as unknown as ReadableStream<Uint8Array>,
  ),
);
await connection.closed;
