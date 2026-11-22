/**
 * Color conversion. The model returns every color in oklch. Everything else is derived here,
 * so values are exact and consistent across color systems.
 */
import { converter, formatHex, parse, type Oklch, type Rgb } from 'culori';
import type { ColorSystem } from '../prompt/schema';
import { isInSrgb, toSrgbGamut } from './gamut';

export type { Oklch, Rgb };

const toOklch = converter('oklch');
const toHsl = converter('hsl');

/**
 * Parse a CSS `oklch()` string. Returns `undefined` for anything else, including other color
 * syntaxes, lightness outside 0–100%, and negative chroma.
 */
export function parseOklch(value: string): Oklch | undefined {
  const match = /^\s*oklch\(\s*([^\s/)]+)\s+([^\s/)]+)/i.exec(value);
  if (!match) return undefined;
  // culori clamps lightness and chroma, so check the raw numbers first.
  const lightness = parseComponent(match[1]!, 1);
  const chroma = parseComponent(match[2]!, 0.4);
  if (lightness === undefined || chroma === undefined) return undefined;
  if (lightness < 0 || lightness > 1 || chroma < 0) return undefined;

  const color = parse(value);
  if (!color || color.mode !== 'oklch') return undefined;
  return { mode: 'oklch', l: color.l, c: color.c, h: Number.isFinite(color.h) ? color.h : 0, alpha: color.alpha };
}

/** A number or percentage, where 100% equals `percentScale`. `none` is 0. */
function parseComponent(token: string, percentScale: number): number | undefined {
  if (token.toLowerCase() === 'none') return 0;
  const percent = token.endsWith('%');
  const n = Number(percent ? token.slice(0, -1) : token);
  if (!Number.isFinite(n)) return undefined;
  return percent ? (n / 100) * percentScale : n;
}

/** Convert any CSS color Palletter can read (hex, rgb, a name, …) to oklch. */
export function anyToOklch(value: string): Oklch | undefined {
  const color = parse(value);
  if (!color) return undefined;
  const oklch = toOklch(color);
  return { ...oklch, h: Number.isFinite(oklch.h) ? oklch.h : 0 };
}

/** Round, then drop trailing zeros: 0.0300 → "0.03". */
function num(value: number, decimals: number): string {
  const rounded = Number(value.toFixed(decimals));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function alphaSuffix(alpha: number | undefined): string {
  return alpha !== undefined && alpha < 1 ? ` / ${num(alpha * 100, 1)}%` : '';
}

export function formatOklch(color: Oklch): string {
  // Hue is meaningless without chroma; print 0 rather than noise.
  const hue = color.c < 0.0005 || !Number.isFinite(color.h) ? 0 : color.h!;
  return `oklch(${num(color.l * 100, 1)}% ${num(color.c, 3)} ${num(hue, 1)}${alphaSuffix(color.alpha)})`;
}

const channel = (v: number) => Math.round(v * 255);

export function formatRgb(color: Rgb): string {
  return `rgb(${channel(color.r)} ${channel(color.g)} ${channel(color.b)}${alphaSuffix(color.alpha)})`;
}

export function formatHsl(color: Rgb): string {
  const hsl = toHsl(color);
  const hue = Number.isFinite(hsl.h) && hsl.s > 0.0005 ? hsl.h! : 0;
  return `hsl(${num(hue, 0)} ${num(hsl.s * 100, 0)}% ${num(hsl.l * 100, 0)}%${alphaSuffix(color.alpha)})`;
}

export type Cmyk = { c: number; m: number; y: number; k: number };

/**
 * A naive sRGB → CMYK conversion, for reference only. Accurate print values need an ICC profile.
 */
export function rgbToCmyk(color: Rgb): Cmyk {
  const k = 1 - Math.max(color.r, color.g, color.b);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 1 };
  return {
    c: (1 - color.r - k) / (1 - k),
    m: (1 - color.g - k) / (1 - k),
    y: (1 - color.b - k) / (1 - k),
    k,
  };
}

export function formatCmyk(color: Rgb): string {
  const { c, m, y, k } = rgbToCmyk(color);
  const pct = (v: number) => `${num(v * 100, 0)}%`;
  return `cmyk(${pct(c)} ${pct(m)} ${pct(y)} ${pct(k)})`;
}

export function formatHexColor(color: Rgb): string {
  return formatHex(color).toLowerCase();
}

export type ConvertedColor = {
  /** The original color from the model. */
  oklch: Oklch;
  /** The color mapped into sRGB, for sRGB-based systems, contrast, and previews. */
  srgb: Rgb;
  /** `#rrggbb`, always in sRGB. */
  hex: string;
  /** A value you can use in CSS. For cmyk this is the hex fallback. */
  value: string;
  /** What to show the user in the chosen system. Same as `value` except for cmyk. */
  display: string;
  /** The original color is outside sRGB. */
  outOfSrgb: boolean;
  /** The value shown was changed to fit sRGB. Never true for oklch, which keeps the original. */
  gamutMapped: boolean;
};

/** Convert an oklch color to the chosen system. */
export function convertColor(oklch: Oklch, system: ColorSystem): ConvertedColor {
  const srgb = toSrgbGamut(oklch);
  const hex = formatHexColor(srgb);
  const outOfSrgb = !isInSrgb(oklch);
  const base = { oklch, srgb, hex, outOfSrgb, gamutMapped: outOfSrgb && system !== 'oklch' };

  switch (system) {
    case 'oklch': {
      const value = formatOklch(oklch);
      return { ...base, value, display: value };
    }
    case 'rgb': {
      const value = formatRgb(srgb);
      return { ...base, value, display: value };
    }
    case 'hex':
      return { ...base, value: hex, display: hex };
    case 'hsl': {
      const value = formatHsl(srgb);
      return { ...base, value, display: value };
    }
    case 'cmyk':
      return { ...base, value: hex, display: formatCmyk(srgb) };
  }
}
