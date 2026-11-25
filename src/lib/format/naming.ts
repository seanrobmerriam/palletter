/**
 * Token naming. A naming pattern such as `--brand-[color]-[step]` becomes `--brand-blue-500`.
 */

/** Turn a free-text name into something safe for a CSS custom property: "Sky Blue!" → "sky-blue". */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export type TokenNameParts = { name: string; role?: string; step: string };

export class FormatError extends Error {
  override name = 'FormatError';
}

const CUSTOM_PROPERTY = /^--[a-z0-9_-]+$/i;

/**
 * Fill in a naming pattern. `[name]`, `[color]`, and `[mood]` become the color's name, `[role]`
 * becomes its role (or its name, if it has no role), and `[step]` becomes the step.
 */
export function tokenName(pattern: string, parts: TokenNameParts): string {
  const name = slugify(parts.name);
  const role = (parts.role && slugify(parts.role)) || name;
  const token = pattern
    .replace(/\[(name|color|mood)\]/g, name)
    .replace(/\[role\]/g, role)
    .replace(/\[step\]/g, parts.step)
    // An empty placeholder can leave doubled or trailing hyphens behind.
    .replace(/(?<=.{2})-{2,}/g, '-')
    .replace(/-+$/, '');

  if (!CUSTOM_PROPERTY.test(token)) {
    throw new FormatError(`"${pattern}" makes "${token}", which isn't a valid custom property name.`);
  }
  return token;
}

/** The token name a swatch gets in a format, or undefined if the pattern can't name it. */
export function tokenNameFor(
  format: 'css' | 'tailwind' | 'dtcg',
  pattern: string,
  parts: TokenNameParts,
): string | undefined {
  try {
    if (format === 'dtcg') return `${slugify(parts.name)}.${parts.step}`;
    // Same as TAILWIND_PATTERN in tailwind.ts, which can't be imported here without an import cycle.
    return tokenName(format === 'tailwind' ? '--color-[name]-[step]' : pattern, parts);
  } catch (error) {
    if (error instanceof FormatError) return undefined;
    throw error;
  }
}
