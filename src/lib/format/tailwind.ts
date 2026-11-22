import type { ResolvedPalette } from '../palette/resolve';
import { block, buildTokens } from './tokens';

/**
 * Tailwind only makes color utilities from `--color-*` variables, so this naming is fixed:
 * `--color-brand-500` becomes `bg-brand-500`, `text-brand-500`, and so on.
 */
export const TAILWIND_PATTERN = '--color-[name]-[step]';

/** A Tailwind CSS v4 `@theme` block. */
export function formatTailwind(palette: ResolvedPalette): string {
  return block('@theme', buildTokens(palette, TAILWIND_PATTERN));
}
