/** A follow-up prompt asking the model to fix a reply that couldn't be used. */
export function buildRepairPrompt(problems: string[]): string {
  return [
    'Palletter could not use your reply because of these problems:',
    '',
    ...problems.map((p) => `- ${p}`),
    '',
    'Fix them and reply again with the complete palettes, not just the changes, in a single ```json code block in the response format from SKILL.md, and nothing else.',
    '',
  ].join('\n');
}
