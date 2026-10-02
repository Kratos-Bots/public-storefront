import type { TextKeyPattern } from '@/text/registry.ts';

/**
 * Keys of system mounts that belong to no block (spec §7.3): the cart drawer (with the lines and
 * summary it shows) and the cart-sync toasts, the login modal (with the sign-in options it shows), the
 * phone cart bar safety net, Telegram chrome, the not-found page and error fallbacks — plus `common.*`,
 * whose wording every area shares. The editor's Text panel shows them as the "Site-wide" group.
 * Blocks list their own keys in `BlockDef.text`; a key may appear in both.
 */
export const SITE_WIDE_TEXT: readonly TextKeyPattern[] = [
  'cart.drawer.*', 'cart.empty.*', 'cart.page.eyebrow', 'cart.line.*', 'cart.summary.*', 'cart.sync.*', 'cart.bar.*',
  'auth.modal.*', 'auth.login.*', 'auth.options.*', 'auth.password.*', 'auth.telegram.*', 'auth.whatsapp.*',
  'webapp.*', 'shell.webapp.*', 'shell.notFound.*', 'errors.*', 'common.*',
];
