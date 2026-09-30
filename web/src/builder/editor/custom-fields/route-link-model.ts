import { isSafeHref } from '@/builder/define.ts';

/** Pages a link can point at without parameters (spec §6 routeLink). */
export const LINKABLE_ROUTES: ReadonlyArray<{ path: string; label: string }> = [
  { path: '/', label: 'Catalogue' },
  { path: '/cart', label: 'Cart' },
  { path: '/checkout', label: 'Checkout' },
  { path: '/login', label: 'Sign in' },
  { path: '/account/orders', label: 'Account — orders' },
  { path: '/account/loyalty', label: 'Account — loyalty' },
  { path: '/account/referrals', label: 'Account — referrals' },
  { path: '/account/profile', label: 'Account — profile' },
  { path: '/verify', label: 'Verify a product' },
  { path: '/tracking', label: 'Track an order' },
];

export type LinkMode = 'route' | 'page' | 'url';

export const pagePath = (slug: string): string => `/pages/${slug}`;

export function linkModeOf(value: string): LinkMode {
  if (value.startsWith('/pages/')) return 'page';
  if (/^(?:https:|mailto:|tel:)/i.test(value)) return 'url';
  return 'route';
}

/** Mirrors the backend's rule for *Href props: https:, mailto:, tel: (site paths come from the pickers). */
export function isAllowedExternal(value: string): boolean {
  // `new URL` resolves nothing relative here, so `//host`, `/\host`, `#top` and `/cart#top` all throw.
  try {
    const u = new URL(value);
    if (u.protocol === 'https:') return u.hostname.length > 0;
    return (u.protocol === 'mailto:' || u.protocol === 'tel:') && u.pathname.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * What the Address box stores: the trimmed value, with a phone number's spaces removed. Returns
 * null unless the result is an allowed external address that Plan 2's `isSafeHref` (the rule the
 * guard and backend apply) also accepts — so the field can never emit a link that is later dropped.
 */
export function normalizeExternal(input: string): string | null {
  let v = input.trim();
  if (/^tel:/i.test(v)) v = v.replace(/\s+/g, '');
  return isAllowedExternal(v) && isSafeHref(v) ? v : null;
}

/**
 * The last gate before any routeLink value leaves the field: '' (no link), a site path with no
 * `#anchor`, or an allowed external address — each also passing Plan 2's `isSafeHref`.
 */
export function isEmittableLink(v: string): boolean {
  if (v === '') return true;
  if (!isSafeHref(v)) return false;
  return v.startsWith('/') ? !v.includes('#') : isAllowedExternal(v);
}
