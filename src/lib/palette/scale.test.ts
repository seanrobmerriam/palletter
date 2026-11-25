import { describe, expect, it } from 'vitest';
import { anyToOklch, formatOklch, parseOklch } from '../color/convert';
import { isInSrgb } from '../color/gamut';
import { STEPS } from '../prompt/schema';
import { buildChosenPalette } from './chosen';
import { buildPalette, buildScale, pinStep } from './scale';

const hex = (value: string) => formatOklch(anyToOklch(value)!);
const lightness = (scale: Partial<Record<string, string>>) => STEPS.flatMap((s) => (scale[s] ? [parseOklch(scale[s]!)!.l] : []));

describe('buildScale', () => {
  it('puts the color unchanged at its nearest step', () => {
    const mint = hex('#84f5a6');
    const scale = buildScale(mint, STEPS);
    expect(Object.values(scale)).toContain(mint);
    expect(scale[pinStep(parseOklch(mint)!, STEPS)!]).toBe(mint);
  });

  it('keeps lightness falling from 50 to 950, with every step in sRGB', () => {
    for (const value of ['#84f5a6', '#bf8645', '#1f2a44', '#fbf7f0', '#f2c14e', '#0f4c4a']) {
      const scale = buildScale(hex(value), STEPS);
      const ls = lightness(scale);
      for (let i = 1; i < ls.length; i++) expect(ls[i], `${value} step ${STEPS[i]}`).toBeLessThan(ls[i - 1]!);
      for (const step of STEPS) expect(isInSrgb(parseOklch(scale[step]!)!), `${value} ${step}`).toBe(true);
    }
  });

  it('puts a background near the top and dark text near the bottom', () => {
    expect(pinStep(parseOklch(hex('#fbf7f0'))!, STEPS)).toBe('50');
    expect(pinStep(parseOklch(hex('#1f2a44'))!, STEPS)).toBe('950');
  });

  it('builds only the requested steps', () => {
    expect(Object.keys(buildScale(hex('#2563eb'), ['100', '500', '900']))).toEqual(['100', '500', '900']);
  });

  it('keeps greys grey', () => {
    const scale = buildScale('oklch(60% 0 0)', STEPS);
    for (const step of STEPS) expect(parseOklch(scale[step]!)!.c).toBe(0);
  });
});

describe('buildChosenPalette', () => {
  const colors = [
    { name: 'mint', role: 'primary', value: hex('#84f5a6') },
    { name: 'sand', role: 'background', value: 'oklch(96.8% 0.014 80.2)' },
    { name: 'coral', role: 'call to action', value: 'oklch(68% 0.15 35)' },
  ];

  it('makes one scale per color, in order, with roles', () => {
    const { source } = buildChosenPalette(colors, { scale: { kind: 'full' }, balance: false });
    expect(source.scheme).toBe('suggested');
    expect(source.colors.map((c) => [c.name, c.role])).toEqual([
      ['mint', 'primary'],
      ['sand', 'background'],
      ['coral', 'call to action'],
    ]);
    expect(Object.keys(source.colors[0]!.steps)).toHaveLength(11);
  });

  it('never changes a chosen color when balancing', () => {
    const { source, notes } = buildChosenPalette(colors, { scale: { kind: 'full' }, balance: true });
    for (const [i, color] of colors.entries()) expect(Object.values(source.colors[i]!.steps)).toContain(color.value);
    expect(notes.every((n) => !n.startsWith('Softened'))).toBe(true);
  });

  it('keeps the unbalanced palette as the original when balancing changed it', () => {
    const result = buildChosenPalette(colors, { scale: { kind: 'full' }, balance: true });
    if (result.original) expect(result.original).toEqual(buildPalette(colors, STEPS));
  });
});

describe('quiet colors', () => {
  it('keep a quiet scale, rather than growing a saturated middle', () => {
    const sand = buildScale('oklch(96.8% 0.014 80.2)', STEPS);
    for (const step of STEPS) expect(parseOklch(sand[step]!)!.c, step).toBeLessThanOrEqual(0.028);
  });
});
