import type { TextKeyPattern } from '@/text/registry.ts';

/**
 * Keys of system mounts that belong to no block (spec §7.3): cart drawer, login modal, the phone cart bar
 * safety net, Telegram chrome, the not-found page and error fallbacks. The editor's Text panel shows them
 * as the "Site-wide" group. Provisional until Task 15 (which finalises the prefixes).
 */
export const SITE_WIDE_TEXT: readonly TextKeyPattern[] = [
  'cart.drawer.*', 'cart.bar.*', 'auth.modal.*', 'webapp.*', 'shell.notFound.*', 'shell.webapp.*', 'errors.*', 'common.*',
];
