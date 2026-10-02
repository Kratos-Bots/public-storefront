import { customPageKeys, type DocMap } from '@/builder/editor/page-set.ts';
import { isCardKey, type CardKey, type DocKey, type FixedRouteKey, type LayoutKind } from '@/builder/types.ts';

export const LAYOUT_LABELS: Record<LayoutKind, string> = { storefront: 'Storefront', menu: 'Menu', webapp: 'Telegram web app' };

export const DOC_LABELS: Record<'shell' | FixedRouteKey, string> = {
  shell: 'Header & footer (every page)',
  catalog: 'Catalogue',
  product: 'Product page',
  cart: 'Cart',
  checkout: 'Checkout',
  login: 'Sign in',
  'account.orders': 'Account — orders',
  'account.order': 'Account — order detail',
  'account.loyalty': 'Account — loyalty',
  'account.referrals': 'Account — referrals',
  'account.profile': 'Account — profile',
  'order-status': 'Order status link',
  'payment-success': 'Payment received',
  'payment-cancel': 'Payment cancelled',
  'order-placed': 'Order placed',
  verify: 'Verify a product',
  tracking: 'Track an order',
  'reset-password': 'Reset password',
  'verify-email': 'Verify your email',
};

const GROUPS: Array<{ label: string; keys: Array<'shell' | FixedRouteKey> }> = [
  { label: 'Every page', keys: ['shell'] },
  { label: 'Browse', keys: ['catalog', 'product'] },
  { label: 'Buy', keys: ['cart', 'checkout', 'login', 'reset-password'] },
  { label: 'Account', keys: ['account.orders', 'account.order', 'account.loyalty', 'account.referrals', 'account.profile', 'verify-email'] },
  { label: 'After the order', keys: ['order-status', 'payment-success', 'payment-cancel', 'order-placed'] },
  { label: 'Tools', keys: ['verify', 'tracking'] },
];

const CARD_LABELS: Record<CardKey, string> = { 'card:tile': 'Product card', 'card:row': 'Product row' };
const CARD_KEYS: readonly CardKey[] = ['card:tile', 'card:row'];

/** `layout` names the product document: the storefront's page, the menu/webapp sheet (spec §11). */
export function docLabel(docKey: DocKey, docs: DocMap, layout: LayoutKind = 'storefront'): string {
  if (docKey.startsWith('page:')) {
    const title = docs[docKey]?.root.props.title;
    return `${title || docKey.slice(5)} (/pages/${docKey.slice(5)})`;
  }
  if (isCardKey(docKey)) return CARD_LABELS[docKey];
  if (docKey === 'product' && layout !== 'storefront') return 'Product sheet';
  return DOC_LABELS[docKey as 'shell' | FixedRouteKey];
}

export function pageOptions(docs: DocMap, layout: LayoutKind): Array<{ label: string; options: Array<{ docKey: DocKey; label: string }> }> {
  const edited = (key: DocKey) => (key !== 'shell' && docs[key] ? ' · edited' : '');
  const groups: Array<{ label: string; options: Array<{ docKey: DocKey; label: string }> }> = GROUPS.map((g) => ({
    label: g.label,
    // Every layout has the product document: the storefront's page, the menu/webapp sheet (spec §7.2).
    options: g.keys.map((k) => ({ docKey: k as DocKey, label: `${docLabel(k, docs, layout)}${edited(k)}` })),
  }));
  groups.push({ label: 'Product cards', options: CARD_KEYS.map((k) => ({ docKey: k, label: `${CARD_LABELS[k]}${edited(k)}` })) });
  const custom = customPageKeys(docs).sort();
  if (custom.length) groups.push({ label: 'Custom pages', options: custom.map((k) => ({ docKey: k, label: docLabel(k, docs) })) });
  return groups;
}
