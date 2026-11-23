/**
 * Register Palletter's icons with Iconify, so SV5UI draws them without fetching anything.
 * Import this module before rendering any component that shows an icon.
 *
 * Iconify would otherwise ask api.iconify.design for icons, which sends requests from the user's
 * browser to a third party and fails offline. Every icon Palletter uses is bundled (a unit test
 * checks this), so the API is switched off.
 */
import { _api, addCollection } from '@iconify/svelte';
import icons from './icons.json';

addCollection(icons);
const offline = () => Promise.reject(new Error('Palletter bundles its icons; the Iconify API is off.'));
_api.setFetch(offline as unknown as typeof fetch);
