/**
 * Turn a palette request into the prompt sent to the model.
 *
 * The model only chooses colors. Token format and color system aren't mentioned, because
 * Palletter converts and formats the model's oklch colors itself.
 */
import { anyToOklch, formatOklch } from '../color/convert';
import { ACHROMATIC_CHROMA, SCHEME_OFFSETS, schemeHues } from '../color/scheme';
import { DEFAULT_NAMING_PATTERN, resolveSteps, type PaletteRequest, type Saturation, type Scheme } from './schema';
import { SKILL_FILES, type SkillFile } from './skills';

/** Quote text the user typed, so it reads as data rather than as part of the instructions. */
const quote = (text: string) => JSON.stringify(text);

const deg = (value: number) => `${Number(value.toFixed(1))}°`;

const signed = (offset: number) => (offset === 0 ? '0°' : offset > 0 ? `+${offset}°` : `−${-offset}°`);

/** The hue to build schemes around: the first hue the user gave as a colorful value. */
export function baseHue(request: PaletteRequest): number | undefined {
  for (const hue of request.hues) {
    if (!hue.value) continue;
    const oklch = anyToOklch(hue.value);
    if (oklch && oklch.c >= ACHROMATIC_CHROMA) return oklch.h;
  }
  return undefined;
}

function describeHue(hue: PaletteRequest['hues'][number]): string {
  const oklch = hue.value ? anyToOklch(hue.value) : undefined;
  const value = hue.value && oklch ? `${hue.value} (${formatOklch(oklch)})` : undefined;
  if (hue.name && value) return `${quote(hue.name)}: ${value}. An exact color (see SKILL.md, step 4).`;
  if (value) return `${value}. An exact color (see SKILL.md, step 4).`;
  return `${quote(hue.name!)}. The user named this color; choose a value that matches the name.`;
}

function describeScheme(scheme: Scheme, base: number | undefined): string {
  const offsets = SCHEME_OFFSETS[scheme].map(signed).join(', ');
  if (scheme === 'monochromatic') {
    return base === undefined ? '- monochromatic: one hue, which you choose.' : `- monochromatic: hue ${deg(base)}.`;
  }
  if (base === undefined) return `- ${scheme}: offsets ${offsets} from the base hue you choose.`;
  const hues = schemeHues(base, scheme).map(deg).join(', ');
  return `- ${scheme}: reference hues ${hues} (offsets ${offsets} from ${deg(base)}).`;
}

function describeSaturation(saturation: Saturation): string {
  return typeof saturation === 'string'
    ? `${saturation} (see saturation-and-mood.md)`
    : `${quote(saturation.custom)}, in the user's own words`;
}

/** What kind of names to give colors, based on the token naming pattern. */
export function namingGuidance(request: PaletteRequest): string {
  if (request.tokenFormat !== 'css') {
    return 'Name each color after what it is, such as "brand", "accent", "sand", or "ocean".';
  }
  const pattern = request.namingPattern;
  if (pattern.includes('[color]')) {
    return `Name each color after its hue in plain words, such as "blue", "coral", or "sage". Tokens will be named like \`${pattern}\`.`;
  }
  if (pattern.includes('[mood]')) {
    return `Name each color after the mood or feeling it conveys, such as "calm", "bold", or "warm". Tokens will be named like \`${pattern}\`.`;
  }
  if (pattern.includes('[role]') && !pattern.includes('[name]')) {
    return `Set a different \`role\` on every color, such as "primary", "secondary", and "accent", because tokens are named from roles, like \`${pattern}\`. Still give each color a name.`;
  }
  return pattern === DEFAULT_NAMING_PATTERN
    ? 'Name each color after what it is, such as "brand", "accent", "sand", or "ocean".'
    : `Name each color so it reads well in tokens named like \`${pattern}\`.`;
}

function skillSection(file: SkillFile): string {
  return `<skill path="${file.path}">\n${file.content.trim()}\n</skill>`;
}

export function buildPrompt(request: PaletteRequest, skills: SkillFile[] = SKILL_FILES): string {
  const base = baseHue(request);
  const steps = resolveSteps(request.scale);
  const decide: string[] = [];

  const lines: string[] = [];
  lines.push('## Hues', '', ...request.hues.map((hue) => `- ${describeHue(hue)}`), '');

  if (request.mood) lines.push('## Mood', '', quote(request.mood), '');
  else decide.push('the mood');

  lines.push(
    '## Schemes',
    '',
    `Make one palette for each of these schemes, in this order.${
      base === undefined ? '' : ` The base hue is ${deg(base)}, from the first hue.`
    }`,
    '',
    ...request.schemes.map((scheme) => describeScheme(scheme, base)),
    '',
  );

  lines.push('## Steps', '', `Every color must have exactly these steps: ${steps.join(', ')}.`, '');

  if (request.saturation) lines.push('## Saturation', '', describeSaturation(request.saturation), '');
  else decide.push('the saturation');

  if (request.roles?.length) {
    lines.push(
      '## Roles',
      '',
      'Make one color for each role, and set its `role` to the name below.',
      '',
      ...request.roles.map(
        (r) => `- ${quote(r.role)}${r.temperature ? `: ${r.temperature} (see saturation-and-mood.md)` : ''}`,
      ),
      '',
    );
  } else {
    decide.push('how many colors each palette has (see SKILL.md, step 2)');
  }

  lines.push('## Names', '', namingGuidance(request), '');

  if (request.note) {
    lines.push('## Note from the user', '', `${quote(request.note)}. Follow it where it doesn't conflict with the rest of the request.`, '');
  }

  if (decide.length) {
    lines.push(
      '## Decide yourself',
      '',
      `The user left these to you: ${decide.join(', ')}. Choose what makes the best palette, and mention your choices in the rationale.`,
      '',
    );
  }

  return [
    'Follow the Palletter skill below to create color palettes for this request.',
    '',
    ...skills.map(skillSection).flatMap((s) => [s, '']),
    '# Palette request',
    '',
    ...lines,
    'Reply with a single ```json code block in the response format from SKILL.md, and nothing else.',
    '',
  ].join('\n');
}
