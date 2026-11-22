/**
 * Try the prompt with any chat model, without the app.
 *
 *   bun run prompt [request]            Print the prompt for a request.
 *   bun run prompt <request> <reply>    Check a model's reply, and print the tokens or the repair prompt.
 *
 * <request> is a JSON file or inline JSON, e.g. '{"hues":[{"value":"#2563eb"}]}'. It defaults to a single blue hue.
 * <reply> is a text file with the model's whole reply.
 */
import { plugin } from 'bun';
import { dirname, resolve } from 'node:path';

// The app imports the skills with Vite's `?raw`. Teach Bun to do the same.
plugin({
  name: 'raw',
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: resolve(dirname(args.importer), args.path.replace(/\?raw$/, '')),
      namespace: 'raw',
    }));
    build.onLoad({ filter: /.*/, namespace: 'raw' }, async (args) => ({
      contents: `export default ${JSON.stringify(await Bun.file(args.path).text())};`,
      loader: 'js',
    }));
  },
});

const { buildPrompt } = await import('../src/lib/prompt/build');
const { parseModelResponse } = await import('../src/lib/prompt/parse');
const { buildRepairPrompt } = await import('../src/lib/prompt/repair');
const { PaletteRequestSchema } = await import('../src/lib/prompt/schema');
const { resolvePalette } = await import('../src/lib/palette/resolve');
const { formatPalette } = await import('../src/lib/format/index');

const [requestArg, replyPath] = process.argv.slice(2);
const requestJson = !requestArg
  ? '{"hues":[{"value":"#2563eb"}]}'
  : requestArg.trim().startsWith('{')
    ? requestArg
    : await Bun.file(requestArg).text();

const parsedRequest = PaletteRequestSchema.safeParse(JSON.parse(requestJson));
if (!parsedRequest.success) {
  console.error('The request is not valid:\n');
  for (const issue of parsedRequest.error.issues) console.error(`- ${issue.path.join('.') || '(request)'}: ${issue.message}`);
  process.exit(1);
}
const request = parsedRequest.data;

if (!replyPath) {
  process.stdout.write(buildPrompt(request));
  process.exit(0);
}

const result = parseModelResponse(await Bun.file(replyPath).text(), request);
if (!result.ok) {
  console.error('The reply has problems. Send this repair prompt to the model:\n');
  process.stdout.write(buildRepairPrompt(result.problems));
  process.exit(1);
}

for (const warning of result.warnings) console.error(`Warning: ${warning}`);
for (const palette of result.response.palettes) {
  const resolved = resolvePalette(palette, request.colorSystem);
  console.log(`/* ${palette.scheme}: ${palette.rationale} */`);
  if (!resolved.schemeCheck.matches) {
    console.log(`/* Warning: ${Math.round(resolved.schemeCheck.deviation)}° from a ${palette.scheme} scheme. */`);
  }
  const mapped = resolved.colors.flatMap((c) => c.swatches.filter((s) => s.gamutMapped).map((s) => `${c.name} ${s.step}`));
  if (mapped.length) console.log(`/* Adjusted to fit sRGB: ${mapped.join(', ')} */`);
  console.log(formatPalette(resolved, { format: request.tokenFormat, namingPattern: request.namingPattern }));
}
