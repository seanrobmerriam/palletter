/**
 * Turn the colors a user chose (their own, plus suggestions they kept) into a balanced palette,
 * in the browser, without the agent. Every chosen color is treated as exact: balancing never
 * changes it, and only shapes the steps around it.
 */
import { PaletteRequestSchema, resolveSteps, type ModelPalette, type PaletteRequest, type Saturation, type Scale } from '../prompt/schema';
import { harmonizeWithNotes } from './harmonize';
import { buildPalette, type ChosenColor } from './scale';

export type ChosenPalette = {
  /** The balanced palette, or the plain one when balancing is off. */
  source: ModelPalette;
  /** The palette before balancing, when balancing changed it. */
  original?: ModelPalette;
  notes: string[];
};

export type ChosenOptions = {
  scale: Scale;
  balance: boolean;
  saturation?: Saturation;
  rationale?: string;
};

export function buildChosenPalette(colors: ChosenColor[], options: ChosenOptions): ChosenPalette {
  const plain = buildPalette(colors, resolveSteps(options.scale), options.rationale);
  if (!options.balance) return { source: plain, notes: [] };

  // Balancing reads exact colors and saturation from a request. The chosen colors can outnumber
  // the hues a request allows, so they're set after parsing.
  const base = PaletteRequestSchema.parse({ hues: [{ name: 'chosen' }], ...(options.saturation ? { saturation: options.saturation } : {}) });
  const request: PaletteRequest = { ...base, hues: colors.map((c) => ({ value: c.value })) };
  const { palette, notes } = harmonizeWithNotes(plain, request);
  const changed = JSON.stringify(palette) !== JSON.stringify(plain);
  return { source: palette, ...(changed ? { original: plain } : {}), notes };
}
