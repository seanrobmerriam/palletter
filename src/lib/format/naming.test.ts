import { describe, expect, it } from 'vitest';
import { FormatError, slugify, tokenName } from './naming';

describe('slugify', () => {
  it.each([
    ['Brand', 'brand'],
    ['Sky Blue', 'sky-blue'],
    ['  Café au lait! ', 'cafe-au-lait'],
    ['sea_glass--2', 'sea-glass-2'],
    ['!!!', ''],
  ])('%s → %s', (input, output) => {
    expect(slugify(input)).toBe(output);
  });
});

describe('tokenName', () => {
  const parts = { name: 'Sky Blue', role: 'primary', step: '500' };

  it('fills in every placeholder', () => {
    expect(tokenName('--color-[name]-[step]', parts)).toBe('--color-sky-blue-500');
    expect(tokenName('--brand-[color]-[step]', parts)).toBe('--brand-sky-blue-500');
    expect(tokenName('--color-[mood]-[step]', parts)).toBe('--color-sky-blue-500');
    expect(tokenName('--[role]-[step]', parts)).toBe('--primary-500');
  });

  it('falls back to the name when there is no role', () => {
    expect(tokenName('--[role]-[step]', { name: 'accent', step: '100' })).toBe('--accent-100');
  });

  it('cleans up hyphens left behind', () => {
    expect(tokenName('--color-[name]--[step]-', parts)).toBe('--color-sky-blue-500');
  });

  it('throws when the result is not a custom property name', () => {
    expect(() => tokenName('--[name]', { name: '!!!', step: '500' })).toThrow(FormatError);
  });
});
