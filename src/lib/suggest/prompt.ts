/**
 * Prompts for suggestions: the first request, and follow-ups in the same session for more
 * directions or for alternatives to one color.
 */
import { anyToOklch, formatOklch } from '../color/convert';
import type { PaletteRequest, Saturation } from '../prompt/schema';
import { SUGGEST_SKILL_FILES, type SkillFile } from '../prompt/skills';
import { ALTERNATIVES, MAX_SUGGESTIONS, MIN_SUGGESTIONS, type SuggestRequest, type YourColor } from './schema';

/** Quote text the user typed, so it reads as data rather than as part of the instructions. */
const quote = (text: string) => JSON.stringify(text);

function describeColor(hue: PaletteRequest['hues'][number], index: number): string {
  const oklch = hue.value ? anyToOklch(hue.value) : undefined;
  const label = hue.name ? `${quote(hue.name)}: ` : '';
  if (hue.value && oklch) {
    return `${index + 1}. ${label}${hue.value} = ${formatOklch(oklch)}. An exact color: use this value unchanged.`;
  }
  return `${index + 1}. ${quote(hue.name!)}. The user named this color; choose a value that matches the name.`;
}

function describeSaturation(saturation: Saturation): string {
  return typeof saturation === 'string'
    ? `${saturation} (see saturation-and-mood.md)`
    : `${quote(saturation.custom)}, in the user's own words`;
}

const jsonReply = (what: string) => `Reply with a single \`\`\`json code block containing ${what}, and nothing else.`;

export function buildSuggestPrompt(request: SuggestRequest, skills: SkillFile[] = SUGGEST_SKILL_FILES): string {
  const lines: string[] = [];
  lines.push('## Your colors', '', 'The colors the user picked, in their order:', '', ...request.hues.map(describeColor), '');

  if (request.purpose) {
    lines.push("## What it's for", '', quote(request.purpose), '');
  } else {
    lines.push("## What it's for", '', "The user didn't say. Choose what suits their colors, and mention it in each summary.", '');
  }

  lines.push(
    '## Directions',
    '',
    `Make exactly ${request.directions} ${request.directions === 1 ? 'direction' : 'directions'}, each with ${MIN_SUGGESTIONS} to ${MAX_SUGGESTIONS} new colors.`,
    '',
  );

  const hints: string[] = [];
  if (request.saturation) hints.push(`- Saturation: ${describeSaturation(request.saturation)}.`);
  if (request.roles?.length) {
    hints.push(
      `- Roles the user needs filled: ${request.roles.map((r) => (r.temperature ? `${quote(r.role)} (${r.temperature})` : quote(r.role))).join(', ')}.`,
    );
  }
  if (request.schemes?.length) {
    hints.push(`- Color relationships to lean on: ${request.schemes.join(', ')} (see color-theory.md). Treat these as a direction, not a rule.`);
  }
  if (hints.length) lines.push('## Hints from the user', '', ...hints, '');

  return [
    'Follow the Palletter suggestion skill below to suggest colors for this request.',
    '',
    ...skills.map((file) => `<skill path="${file.path}">\n${file.content.trim()}\n</skill>`).flatMap((s) => [s, '']),
    '# Suggestion request',
    '',
    ...lines,
    jsonReply('the directions, in the response format from suggest.md'),
    '',
  ].join('\n');
}

export function buildMoreDirectionsPrompt(count: number): string {
  return [
    `Suggest ${count} more ${count === 1 ? 'direction' : 'directions'} for the same colors.`,
    '',
    'Each must be clearly different from every direction you have suggested so far in this conversation: a different idea, not the same colors nudged. Follow suggest.md as before.',
    '',
    jsonReply(`only the new ${count === 1 ? 'direction' : 'directions'}, in the response format from suggest.md`),
    '',
  ].join('\n');
}

export function buildMoreLikePrompt(color: YourColor, directionName: string): string {
  return [
    `The user likes ${quote(color.name)} (${color.value}, used as ${quote(color.role)}) from the ${quote(directionName)} direction, and wants more like it.`,
    '',
    `Suggest ${ALTERNATIVES} alternatives that could do the same job: variations on it, lighter or darker, warmer or cooler, softer or bolder, but recognizably related. Each must still work with the user's colors, and be clearly different from ${quote(color.name)} and from each other. Give each a new name, the same role or a close one, and a reason.`,
    '',
    jsonReply('`{ "colors": [ … ] }`, where each color has `name`, `role`, `value`, and `reason` as in suggest.md'),
    '',
  ].join('\n');
}

/** A follow-up prompt asking the model to fix a reply that couldn't be used. */
export function buildSuggestRepairPrompt(problems: string[]): string {
  return [
    'Palletter could not use your reply because of these problems:',
    '',
    ...problems.map((p) => `- ${p}`),
    '',
    'Fix them and reply again with everything, not just the changes, in a single ```json code block, and nothing else.',
    '',
  ].join('\n');
}
