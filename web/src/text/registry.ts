import type { ReactNode } from 'react';
import type { EntryParams, TextEntry } from '@/text/define.ts';
import common from '@/text/keys/common.ts';
import shell from '@/text/keys/shell.ts';
import catalog from '@/text/keys/catalog.ts';
import product from '@/text/keys/product.ts';
import cart from '@/text/keys/cart.ts';
import checkout from '@/text/keys/checkout.ts';
import auth from '@/text/keys/auth.ts';
import account from '@/text/keys/account.ts';
import order from '@/text/keys/order.ts';
import payment from '@/text/keys/payment.ts';
import tracking from '@/text/keys/tracking.ts';
import verify from '@/text/keys/verify.ts';
import wholesale from '@/text/keys/wholesale.ts';
import webapp from '@/text/keys/webapp.ts';
import notices from '@/text/keys/notices.ts';
import errors from '@/text/keys/errors.ts';
import templates from '@/text/keys/templates.ts';
import closed from '@/text/keys/closed.ts';
import boot from '@/text/keys/boot.ts';

/** Every key of this release. The running release's registry decides which stored keys exist. */
export const TEXT = {
  ...common.entries, ...shell.entries, ...catalog.entries, ...product.entries, ...cart.entries, ...checkout.entries,
  ...auth.entries, ...account.entries, ...order.entries, ...payment.entries, ...tracking.entries, ...verify.entries,
  ...wholesale.entries, ...webapp.entries, ...notices.entries, ...errors.entries, ...templates.entries,
  ...closed.entries, ...boot.entries,
};
export const TEXT_ENTRIES: Readonly<Record<string, TextEntry>> = TEXT;
/** Areas in Text-panel order. */
export const TEXT_AREAS = [common, shell, catalog, product, cart, checkout, auth, account, order, payment, tracking,
  verify, wholesale, webapp, notices, errors, templates, closed, boot].map((a) => a.area);

type Registry = typeof TEXT;
export type TextKey = keyof Registry & string;
export type StringKey = { [K in TextKey]: Registry[K]['en'] extends string ? K : never }[TextKey];
export type PluralKey = Exclude<TextKey, StringKey>;
export type ParamName<K extends TextKey> = EntryParams<Registry[K]>;
/** Params are required exactly when the key has placeholders (minus `Omit`, e.g. tp's 'count'). */
export type ParamArgs<K extends TextKey, Omit extends string = never> = [Exclude<ParamName<K>, Omit>] extends [never]
  ? []
  : [params: { [N in Exclude<ParamName<K>, Omit>]: string | number }];
export type NodeParams<K extends TextKey> = { [N in Exclude<ParamName<K>, K extends PluralKey ? 'count' : never>]: ReactNode };
/** An exact key or an `area.part.*` prefix (BlockDef.text, SITE_WIDE_TEXT). */
export type TextKeyPattern = TextKey | `${string}.*`;

export function isTextKey(k: string): k is TextKey { return Object.hasOwn(TEXT, k); }
export function isStringKey(k: string): k is StringKey { return isTextKey(k) && typeof TEXT_ENTRIES[k]!.en === 'string'; }
export function isPluralKey(k: string): k is PluralKey { return isTextKey(k) && typeof TEXT_ENTRIES[k]!.en !== 'string'; }
/** The English default — for compatibility exports that existing tests read (playbook rule 8). */
export function defaultText(key: StringKey): string { return TEXT_ENTRIES[key]!.en as string; }
export function matchesTextPattern(key: string, pattern: string): boolean {
  return pattern.endsWith('.*') ? key.startsWith(pattern.slice(0, -1)) : key === pattern;
}
