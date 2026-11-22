/**
 * The Palletter skills, bundled into the server at build time.
 * Edit the Markdown files in `skills/palletter/`, not this module.
 */
import accessibility from '../../../skills/palletter/accessibility.md?raw';
import colorTheory from '../../../skills/palletter/color-theory.md?raw';
import saturationAndMood from '../../../skills/palletter/saturation-and-mood.md?raw';
import scales from '../../../skills/palletter/scales.md?raw';
import skill from '../../../skills/palletter/SKILL.md?raw';

export type SkillFile = { path: string; content: string };

/** The entry point first, then the guides in the order SKILL.md lists them. */
export const SKILL_FILES: SkillFile[] = [
  { path: 'SKILL.md', content: skill },
  { path: 'color-theory.md', content: colorTheory },
  { path: 'scales.md', content: scales },
  { path: 'saturation-and-mood.md', content: saturationAndMood },
  { path: 'accessibility.md', content: accessibility },
];
