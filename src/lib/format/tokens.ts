import type { ResolvedPalette, ResolvedSwatch } from '../palette/resolve';
import { FormatError, tokenName } from './naming';

export type Token = { name: string; color: string; swatch: ResolvedSwatch };

/** Every token in a palette, grouped by color in palette order. Throws if two tokens share a name. */
export function buildTokens(palette: ResolvedPalette, pattern: string): Token[][] {
  const seen = new Map<string, string>();
  return palette.colors.map((color) =>
    color.swatches.map((swatch) => {
      const name = tokenName(pattern, { name: color.name, role: color.role, step: swatch.step });
      const where = `${color.label} ${swatch.step}`;
      const clash = seen.get(name);
      if (clash) {
        throw new FormatError(
          `${clash} and ${where} would both be named ${name}. Add [name] or [step] to the naming pattern.`,
        );
      }
      seen.set(name, where);
      return { name, color: color.name, swatch };
    }),
  );
}

/** A CSS declaration. CMYK isn't valid CSS, so it goes in a comment next to the hex fallback. */
export function declaration(token: Token): string {
  const comment = token.swatch.display !== token.swatch.value ? ` /* ${token.swatch.display} */` : '';
  return `  ${token.name}: ${token.swatch.value};${comment}`;
}

/** Declarations inside a block, with a blank line between colors. */
export function block(selector: string, groups: Token[][]): string {
  const body = groups.map((group) => group.map(declaration).join('\n')).join('\n\n');
  return `${selector} {\n${body}\n}\n`;
}
