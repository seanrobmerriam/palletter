/**
 * A stand-in for SvelteKit's `$app/state`. SV5UI's Link, Header, Sidebar, and NavigationMenu read
 * `page.url` to highlight the current page. Palletter runs on Astro, not SvelteKit, so this gives
 * them the browser's URL (or a placeholder during server rendering).
 */
export const page = {
  get url(): URL {
    return typeof window === 'undefined' ? new URL('http://localhost/') : new URL(window.location.href);
  },
};
