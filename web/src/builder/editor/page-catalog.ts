import { customPageKeys, type DocMap } from '@/builder/editor/page-set.ts';
import type { DocKey, FixedRouteKey, LayoutKind } from '@/builder/types.ts';

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
};

const GROUPS: Array<{ label: string; keys: Array<'shell' | FixedRouteKey> }> = [
  { label: 'Every page', keys: ['shell'] },
  { label: 'Browse', keys: ['catalog', 'product'] },
  { label: 'Buy', keys: ['cart', 'checkout', 'login'] },
  { label: 'Account', keys: ['account.orders', 'account.order', 'account.loyalty', 'account.referrals', 'account.profile'] },
  { label: 'After the order', keys: ['order-status', 'payment-success', 'payment-cancel', 'order-placed'] },
  { label: 'Tools', keys: ['verify', 'tracking'] },
];

export function docLabel(docKey: DocKey, docs: DocMap): string {
  if (docKey.startsWith('page:')) {
    const title = docs[docKey]?.root.props.title;
    return `${title || docKey.slice(5)} (/pages/${docKey.slice(5)})`;
  }
  return DOC_LABELS[docKey as 'shell' | FixedRouteKey];
}

export function pageOptions(docs: DocMap, layout: LayoutKind): Array<{ label: string; options: Array<{ docKey: DocKey; label: string }> }> {
  const edited = (key: DocKey) => (key !== 'shell' && docs[key] ? ' · edited' : '');
  const groups = GROUPS.map((g) => ({
    label: g.label,
    // The product page exists only in the storefront layout; menu/webapp open a sheet (spec §3).
    options: g.keys.filter((k) => k !== 'product' || layout === 'storefront').map((k) => ({ docKey: k as DocKey, label: `${DOC_LABELS[k]}${edited(k)}` })),
  }));
  const custom = customPageKeys(docs).sort();
  if (custom.length) groups.push({ label: 'Custom pages', options: custom.map((k) => ({ docKey: k, label: docLabel(k, docs) })) });
  return groups;
}
