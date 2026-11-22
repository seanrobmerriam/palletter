import { describe, expect, it } from 'vitest';
import { buildRepairPrompt } from './repair';

describe('buildRepairPrompt', () => {
  it('lists every problem and asks for the complete response', () => {
    const prompt = buildRepairPrompt(['There is no triadic palette.', 'Bad color.']);
    expect(prompt).toContain('- There is no triadic palette.\n- Bad color.');
    expect(prompt).toContain('complete palettes');
    expect(prompt).toContain('```json');
  });
});
