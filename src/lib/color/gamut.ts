/**
 * Gamut detection and mapping. Models can return oklch colors that no sRGB screen can show.
 */
import { converter, toGamut, type Color, type Rgb } from 'culori';

const toRgb = converter('rgb');
const toP3 = converter('p3');
const mapToSrgb = toGamut('rgb', 'oklch');

/**
 * How far outside 0–1 a channel may be and still count as in gamut. Half of one 8-bit step,
 * so round-trip float error (e.g. white → oklch → rgb) isn't reported as out of gamut.
 */
const EPSILON = 0.5 / 255;

const inUnitRange = (...channels: number[]) => channels.every((v) => v >= -EPSILON && v <= 1 + EPSILON);

export function isInSrgb(color: Color): boolean {
  const { r, g, b } = toRgb(color);
  return inUnitRange(r, g, b);
}

export function isInP3(color: Color): boolean {
  const { r, g, b } = toP3(color);
  return inUnitRange(r, g, b);
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Map a color into sRGB using the CSS Color 4 algorithm: reduce chroma in oklch, keeping
 * lightness and hue, until the color fits. Colors already in sRGB come back unchanged.
 */
export function toSrgbGamut(color: Color): Rgb {
  const mapped = isInSrgb(color) ? toRgb(color) : mapToSrgb(color);
  return { mode: 'rgb', r: clamp(mapped.r), g: clamp(mapped.g), b: clamp(mapped.b), alpha: mapped.alpha };
}
