import { describe, expect, it } from 'vitest';
import { analogous } from '../../../test/fixtures/palettes';
import {
  DEFAULT_NAMING_PATTERN,
  ModelPaletteSchema,
  ModelResponseSchema,
  NamingPatternSchema,
  PaletteRequestSchema,
  resolveSteps,
  STEPS,
} from './schema';

describe('PaletteRequestSchema', () => {
  it('fills in defaults when only a hue is given', () => {
    const request = PaletteRequestSchema.parse({ hues: [{ value: '#2563eb' }] });
    expect(request).toEqual({
      hues: [{ value: '#2563eb' }],
      tokenFormat: 'css',
      namingPattern: DEFAULT_NAMING_PATTERN,
      scale: { kind: 'full' },
      colorSystem: 'oklch',
      schemes: ['monochromatic'],
    });
  });

  it('accepts a hue given only by name', () => {
    expect(PaletteRequestSchema.safeParse({ hues: [{ name: 'terracotta' }] }).success).toBe(true);
  });

  it('accepts any CSS color syntax for a hue value', () => {
    for (const value of ['#fff', 'rgb(10 20 30)', 'hsl(200 50% 50%)', 'oklch(70% 0.1 200)', 'rebeccapurple']) {
      expect(PaletteRequestSchema.safeParse({ hues: [{ value }] }).success, value).toBe(true);
    }
  });

  it('rejects a request with no hues', () => {
    expect(PaletteRequestSchema.safeParse({ hues: [] }).success).toBe(false);
  });

  it('rejects a hue with neither a value nor a name', () => {
    expect(PaletteRequestSchema.safeParse({ hues: [{}] }).success).toBe(false);
  });

  it('rejects a hue value that is not a color', () => {
    expect(PaletteRequestSchema.safeParse({ hues: [{ value: 'not-a-color' }] }).success).toBe(false);
  });

  it('rejects a range that runs dark to light', () => {
    const result = PaletteRequestSchema.safeParse({
      hues: [{ name: 'blue' }],
      scale: { kind: 'range', from: '700', to: '300' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a count outside 1–11', () => {
    for (const count of [0, 12, 2.5]) {
      const result = PaletteRequestSchema.safeParse({ hues: [{ name: 'blue' }], scale: { kind: 'count', count } });
      expect(result.success, String(count)).toBe(false);
    }
  });

  it('rejects the same scheme twice', () => {
    const result = PaletteRequestSchema.safeParse({ hues: [{ name: 'blue' }], schemes: ['triadic', 'triadic'] });
    expect(result.success).toBe(false);
  });

  it('accepts a custom saturation', () => {
    const result = PaletteRequestSchema.safeParse({ hues: [{ name: 'blue' }], saturation: { custom: 'dusty' } });
    expect(result.success).toBe(true);
  });
});

describe('NamingPatternSchema', () => {
  it.each(['--color-[name]-[step]', '--brand-[color]-[step]', '--color-[mood]-[step]', '--[role]-[step]', '--accent'])(
    'accepts %s',
    (pattern) => {
      expect(NamingPatternSchema.safeParse(pattern).success).toBe(true);
    },
  );

  it.each(['color-[name]', '--color [name]', '--color-[hue]-[step]', '--color-[name]-[step];'])('rejects %s', (pattern) => {
    expect(NamingPatternSchema.safeParse(pattern).success).toBe(false);
  });
});

describe('resolveSteps', () => {
  it('returns every step for a full scale', () => {
    expect(resolveSteps({ kind: 'full' })).toEqual([...STEPS]);
  });

  it('returns an inclusive range', () => {
    expect(resolveSteps({ kind: 'range', from: '100', to: '300' })).toEqual(['100', '200', '300']);
  });

  it('returns a single step when the range starts and ends on it', () => {
    expect(resolveSteps({ kind: 'range', from: '500', to: '500' })).toEqual(['500']);
  });

  it('returns the middle step for a count of 1', () => {
    expect(resolveSteps({ kind: 'count', count: 1 })).toEqual(['500']);
  });

  it('spreads a count evenly and includes both ends', () => {
    expect(resolveSteps({ kind: 'count', count: 2 })).toEqual(['50', '950']);
    expect(resolveSteps({ kind: 'count', count: 3 })).toEqual(['50', '500', '950']);
    expect(resolveSteps({ kind: 'count', count: 5 })).toEqual(['50', '300', '500', '700', '950']);
  });

  it('returns exactly the count asked for, every time', () => {
    for (let count = 1; count <= STEPS.length; count++) {
      expect(resolveSteps({ kind: 'count', count })).toHaveLength(count);
    }
  });
});

describe('ModelResponseSchema', () => {
  it('accepts a valid palette', () => {
    expect(ModelResponseSchema.safeParse({ palettes: [analogous] }).success).toBe(true);
  });

  it('defaults a missing rationale to an empty string', () => {
    const { rationale: _, ...rest } = analogous;
    expect(ModelPaletteSchema.parse(rest).rationale).toBe('');
  });

  it('rejects colors that are not oklch', () => {
    const palette = { ...analogous, colors: [{ name: 'brand', steps: { '500': '#2563eb' } }] };
    expect(ModelPaletteSchema.safeParse(palette).success).toBe(false);
  });

  it('rejects lightness above 100%', () => {
    const palette = { ...analogous, colors: [{ name: 'brand', steps: { '500': 'oklch(120% 0.1 200)' } }] };
    expect(ModelPaletteSchema.safeParse(palette).success).toBe(false);
  });

  it('rejects unknown steps', () => {
    const palette = { ...analogous, colors: [{ name: 'brand', steps: { '550': 'oklch(50% 0.1 200)' } }] };
    expect(ModelPaletteSchema.safeParse(palette).success).toBe(false);
  });

  it('rejects a color with no steps', () => {
    const palette = { ...analogous, colors: [{ name: 'brand', steps: {} }] };
    expect(ModelPaletteSchema.safeParse(palette).success).toBe(false);
  });

  it('rejects two colors whose names make the same token name', () => {
    const steps = { '500': 'oklch(50% 0.1 200)' };
    const palette = { ...analogous, colors: [{ name: 'Sky Blue', steps }, { name: 'sky-blue', steps }] };
    expect(ModelPaletteSchema.safeParse(palette).success).toBe(false);
  });

  it('rejects a color name with no letters or numbers', () => {
    const palette = { ...analogous, colors: [{ name: '!!!', steps: { '500': 'oklch(50% 0.1 200)' } }] };
    expect(ModelPaletteSchema.safeParse(palette).success).toBe(false);
  });

  it('rejects an unknown scheme', () => {
    expect(ModelPaletteSchema.safeParse({ ...analogous, scheme: 'pentadic' }).success).toBe(false);
  });
});
