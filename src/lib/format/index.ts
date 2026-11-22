import type { ResolvedPalette } from '../palette/resolve';
import { DEFAULT_NAMING_PATTERN, type TokenFormat } from '../prompt/schema';
import { formatCss } from './css';
import { formatDtcg } from './dtcg';
import { formatTailwind } from './tailwind';

export { FormatError } from './naming';

export type FormatOptions = {
  format: TokenFormat;
  /** Used by the css format only. */
  namingPattern?: string;
};

/** File extension for downloads. */
export const FORMAT_EXTENSIONS: Record<TokenFormat, string> = { css: 'css', tailwind: 'css', dtcg: 'tokens.json' };

/** Render a palette as copy-ready tokens. Throws `FormatError` if the naming pattern makes clashing names. */
export function formatPalette(palette: ResolvedPalette, { format, namingPattern }: FormatOptions): string {
  switch (format) {
    case 'css':
      return formatCss(palette, namingPattern ?? DEFAULT_NAMING_PATTERN);
    case 'tailwind':
      return formatTailwind(palette);
    case 'dtcg':
      return formatDtcg(palette);
  }
}
