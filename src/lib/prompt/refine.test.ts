import { describe, expect, it } from 'vitest';
import { buildRefinePrompt } from './refine';
import { PaletteRequestSchema } from './schema';

const request = PaletteRequestSchema.parse({ hues: [{ name: 'blue' }], scale: { kind: 'range', from: '100', to: '300' } });

describe('buildRefinePrompt', () => {
  it('quotes the note and asks for only that scheme', () => {
    const prompt = buildRefinePrompt(request, 'triadic', 'make the "secondary" warmer');
    expect(prompt).toContain('The user wants changes to the triadic palette: "make the \\"secondary\\" warmer"');
    expect(prompt).toContain('exactly these steps for every color: 100, 200, 300.');
    expect(prompt).toContain('containing only the revised triadic palette');
  });

  it('asks for a different take without a note', () => {
    expect(buildRefinePrompt(request, 'analogous')).toContain('a different take on the analogous palette');
    expect(buildRefinePrompt(request, 'analogous', '   ')).toContain('a different take');
  });
});
