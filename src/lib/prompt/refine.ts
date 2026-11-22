/**
 * Follow-up prompts for an existing session: refine one palette with a note, or regenerate it.
 * The agent still has the original request and skills from the first prompt.
 */
import { resolveSteps, type PaletteRequest, type Scheme } from './schema';

export function buildRefinePrompt(request: PaletteRequest, scheme: Scheme, note?: string): string {
  const steps = resolveSteps(request.scale).join(', ');
  const ask = note?.trim()
    ? `The user wants changes to the ${scheme} palette: ${JSON.stringify(note.trim())}`
    : `The user wants a different take on the ${scheme} palette. Make clearly different choices of hue, chroma, or names, while still following the request and the skill.`;
  return [
    ask,
    '',
    `Keep everything else from the original request: the same roles, and exactly these steps for every color: ${steps}.`,
    `Reply with a single \`\`\`json code block in the response format from SKILL.md, containing only the revised ${scheme} palette, with every color and every step, and nothing else.`,
    '',
  ].join('\n');
}
