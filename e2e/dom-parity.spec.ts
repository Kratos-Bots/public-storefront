// e2e/dom-parity.spec.ts
import { expect, test, type Page } from '@playwright/test';
import { installMocks, ORDER_PATH, type Layout } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import type { StorefrontSettings } from '../web/src/types/settings.ts';

/**
 * v0.6.0's DOM for every route, captured BEFORE the page builder touched any source.
 * With no published page set, the builder's default documents must reproduce it
 * (spec §13 A1). A difference is a regression unless justified per snapshot in the
 * commit that regenerates it (`--update-snapshots -g "<test name>"`).
 */
interface RouteCase {
  name: string;
  path: string;
  layouts: Layout[];
  session: boolean;
  tweak?: (s: StorefrontSettings) => void;
}

const ALL: Layout[] = ['storefront', 'menu', 'webapp'];

const CASES: RouteCase[] = [
  { name: 'catalog', path: '/', layouts: ALL, session: true },
  { name: 'category', path: '/c/concentrates', layouts: ALL, session: true },
  { name: 'product', path: '/p/101', layouts: ['storefront'], session: true },
  { name: 'product-sheet', path: '/?p=101', layouts: ['menu', 'webapp'], session: true },
  { name: 'wholesale', path: '/', layouts: ALL, session: true, tweak: (s) => { s.features.wholesale = true; } },
  { name: 'cart', path: '/cart', layouts: ALL, session: true },
  { name: 'checkout', path: '/checkout', layouts: ALL, session: true },
  { name: 'login', path: '/login', layouts: ALL, session: false },
  { name: 'account-orders', path: '/account/orders', layouts: ALL, session: true },
  { name: 'account-order', path: '/account/orders/K4M2QP', layouts: ALL, session: true },
  { name: 'account-loyalty', path: '/account/loyalty', layouts: ALL, session: true },
  { name: 'account-referrals', path: '/account/referrals', layouts: ALL, session: true },
  { name: 'account-profile', path: '/account/profile', layouts: ALL, session: true },
  { name: 'order-status', path: ORDER_PATH, layouts: ALL, session: false },
  { name: 'payment-success', path: '/payment/success?order=E2E9', layouts: ALL, session: false },
  { name: 'payment-cancel', path: '/payment/cancel', layouts: ALL, session: false },
  { name: 'order-placed', path: '/order-placed', layouts: ALL, session: false },
  { name: 'tracking', path: '/tracking', layouts: ALL, session: false },
  { name: 'tracking-ref', path: '/tracking/E2E1', layouts: ALL, session: false },
  { name: 'verify', path: '/verify', layouts: ALL, session: false },
];

const WIDTHS = [390, 1280] as const;

/**
 * Ids that React/Mantine derive from render order (attribute values only), CSS-module
 * class names reduced to their local name (`_name_<filehash>_<cssline>` -> `_name_H`),
 * and one tag per line so a diff reads.
 */
export function normalizeDom(html: string): string {
  return html
    .replace(/\b(id|for|aria-[a-z]+)="([^"]*)"/g, (_m, attr: string, val: string) =>
      `${attr}="${val
        .replace(/(mantine-)[a-z0-9]{5,}/gi, '$1ID')
        .replace(/«r[0-9a-z]+»|:r[0-9a-z]+:|_r_[0-9a-z]+_/g, 'RID')}"`)
    .replace(/(_[A-Za-z][\w-]*?)_[a-z0-9]{5}_\d+(?![\w-])/g, '$1_H')
    .replace(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+/g, 'http://ORIGIN')
    .replace(/></g, '>\n<');
}

async function snapshotOnce(page: Page): Promise<string> {
  return page.evaluate(() => {
    const body = document.body.cloneNode(true) as HTMLElement;
    body.querySelectorAll('script, style').forEach((s) => s.remove());
    return `title: ${document.title}\n${body.innerHTML}`;
  });
}

/** Settled DOM: no loading skeleton, no network, and two reads 300 ms apart agree (drawer/sheet transitions done). */
async function capture(page: Page): Promise<string> {
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('status', { name: 'Loading' })).toHaveCount(0);
  let prev = await snapshotOnce(page);
  for (let i = 0; i < 10; i += 1) {
    await page.waitForTimeout(300);
    const next = await snapshotOnce(page);
    if (next === prev) return normalizeDom(next);
    prev = next;
  }
  return normalizeDom(prev);
}

for (const c of CASES) {
  for (const layout of c.layouts) {
    for (const width of WIDTHS) {
      test(`dom · ${c.name} · ${layout} · ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
        await page.clock.setFixedTime(FIXED_NOW);
        await installMocks(page, { layout, session: c.session, tweakSettings: c.tweak });
        await page.goto(c.path);
        expect(await capture(page)).toMatchSnapshot(`dom-${c.name}-${layout}-${width}.txt`);
      });
    }
  }
}
