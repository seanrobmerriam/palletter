import type { ResolvedPalette } from '../palette/resolve';
import { DEFAULT_NAMING_PATTERN } from '../prompt/schema';
import { block, buildTokens } from './tokens';

/** CSS custom properties on `:root`. */
export function formatCss(palette: ResolvedPalette, pattern: string = DEFAULT_NAMING_PATTERN): string {
  return block(':root', buildTokens(palette, pattern));
}
