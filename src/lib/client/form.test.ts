import { describe, expect, it } from 'vitest';
import { errorFor, hueToInput, initialFormState, summaries, toPickerHex, toRequestInput, validate, type FormState } from './form';

const state = (overrides: Partial<FormState> = {}): FormState => ({ ...initialFormState(), ...overrides });

describe('hues', () => {
  it('treats text that parses as a color as a value', () => {
    expect(hueToInput({ text: ' #e2725b ', picker: '#000000' })).toEqual({ value: '#e2725b' });
    expect(hueToInput({ text: 'oklch(70% 0.1 200)', picker: '#000000' })).toEqual({ value: 'oklch(70% 0.1 200)' });
    expect(hueToInput({ text: 'rebeccapurple', picker: '#000000' })).toEqual({ value: 'rebeccapurple' });
  });

  it('treats anything else as a name', () => {
    expect(hueToInput({ text: 'terracotta', picker: '#000000' })).toEqual({ name: 'terracotta' });
  });

  it('uses the picker when the text is empty', () => {
    expect(hueToInput({ text: '  ', picker: '#123456' })).toEqual({ value: '#123456' });
  });

  it('gives the picker a hex for colors, and nothing for names', () => {
    expect(toPickerHex('rgb(255 0 0)')).toBe('#ff0000');
    expect(toPickerHex('terracotta')).toBeUndefined();
  });
});

describe('toRequestInput', () => {
  it('sends only what the form needs by default', () => {
    expect(toRequestInput(initialFormState())).toEqual({
      hues: [{ value: '#2563eb' }],
      tokenFormat: 'css',
      namingPattern: '--color-[name]-[step]',
      colorSystem: 'oklch',
      schemes: ['monochromatic'],
      scale: { kind: 'full' },
    });
  });

  it('includes every option that is set', () => {
    const input = toRequestInput(
      state({
        mood: ' calm ',
        tokenFormat: 'tailwind',
        scaleKind: 'range',
        from: '100',
        to: '300',
        saturation: 'custom',
        customSaturation: 'dusty',
        roles: [
          { role: 'primary', temperature: 'warm' },
          { role: ' ', temperature: '' },
          { role: 'accent', temperature: '' },
        ],
      }),
    );
    expect(input).toMatchObject({
      mood: 'calm',
      tokenFormat: 'tailwind',
      scale: { kind: 'range', from: '100', to: '300' },
      saturation: { custom: 'dusty' },
      roles: [{ role: 'primary', temperature: 'warm' }, { role: 'accent' }],
    });
    expect(input).not.toHaveProperty('namingPattern');
  });

  it('sends a count scale', () => {
    expect(toRequestInput(state({ scaleKind: 'count', count: 3 })).scale).toEqual({ kind: 'count', count: 3 });
  });
});

describe('validate', () => {
  it('passes the default form', () => {
    expect(validate(initialFormState()).ok).toBe(true);
  });

  it('reports errors by field', () => {
    const result = validate(state({ schemes: [], scaleKind: 'range', from: '700', to: '100', namingPattern: 'color' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(['namingPattern', 'scale.to', 'schemes']);
  });

  it('finds nested errors for a field', () => {
    expect(errorFor({ 'hues.0.value': 'Bad' }, 'hues')).toBe('Bad');
    expect(errorFor({ 'hues.0.value': 'Bad' }, 'hues.0')).toBe('Bad');
    expect(errorFor({ 'hues.0.value': 'Bad' }, 'schemes')).toBeUndefined();
  });
});

describe('summaries', () => {
  it('describes the defaults', () => {
    expect(summaries(initialFormState())).toEqual({
      format: 'CSS custom properties, --color-[name]-[step]',
      scale: 'Full scale, 50–950 (11 steps)',
      saturation: 'Let the agent decide',
      system: 'oklch',
      roles: 'Let the agent decide',
      schemes: 'Monochromatic',
    });
  });

  it('describes choices', () => {
    const s = summaries(
      state({
        tokenFormat: 'dtcg',
        scaleKind: 'range',
        from: '100',
        to: '300',
        saturation: 'muted',
        roles: [{ role: 'primary', temperature: 'warm' }],
        schemes: ['analogous', 'triadic'],
      }),
    );
    expect(s).toMatchObject({
      format: 'Design Tokens JSON',
      scale: '100, 200, 300',
      saturation: 'Muted',
      roles: 'primary (warm)',
      schemes: 'Analogous, Triadic',
    });
  });
});
