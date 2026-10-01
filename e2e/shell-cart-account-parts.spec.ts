import { expect, test, type Locator, type Page } from '@playwright/test';
import { installMocks, type InstallMocksOptions, type Layout, type MockHandle } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import { presetTheme } from './template-theme.ts';
import {
  arrangedAccountSet, arrangedCart, arrangedEverythingSet, arrangedFlowsSet, arrangedShell, brandlessShellSet, cartWithoutCheckoutSet,
  defaultShellSet, v070CartOutsideSummary, v070Shell,
} from './page-sets.ts';
import type { PageSet } from '../web/src/builder/types.ts';

/**
 * Shell, cart and account parts, as a shopper meets them (spec 2026-09-30-shell-cart-account-parts
 * §13): the rearranged header, cart (page and drawer), account pages and flow pages, v0.7.0
 * documents, and no horizontal overflow at 360 px under every template. Everything runs against
 * the mocked backend; the page sets are Northbound Supply documents from page-sets.ts.
 */

const NAME = 'Alpine Extract 10ml';

interface OpenOptions {
  width?: number;
  session?: boolean;
  tweakSettings?: InstallMocksOptions['tweakSettings'];
  cart?: 'none' | 'one' | 'flagged';
  height?: number;
}

/** A server cart line for product 101; `flagged` puts it below an order minimum (checkout is held). */
function seedCart(mocks: MockHandle, kind: 'one' | 'flagged'): void {
  const flagged = kind === 'flagged';
  mocks.state.cart = {
    items: [{
      productId: 101, name: NAME, quantity: 2, unitPrice: 42.5, lineTotal: 85, imageUrl: null, isPreorder: false, outOfStock: false,
      priceChanged: false, inactive: false, belowMin: flagged, aboveMax: false, minOrderQuantity: flagged ? 5 : null, maxOrderQuantity: null,
    }],
    subtotal: 85, itemCount: 2,
  };
}

async function open(page: Page, layout: Layout, set: PageSet | null, path: string, o: OpenOptions = {}): Promise<MockHandle> {
  const width = o.width ?? 1280;
  await page.setViewportSize({ width, height: o.height ?? (width < 768 ? 844 : 900) });
  await page.clock.setFixedTime(FIXED_NOW);
  const mocks = await installMocks(page, { layout, session: o.session ?? true, pages: { [layout]: set }, tweakSettings: o.tweakSettings });
  if (o.cart === 'one' || o.cart === 'flagged') seedCart(mocks, o.cart);
  await page.goto(path);
  return mocks;
}

/** `a` precedes `b` in document order. */
async function precedes(a: Locator, b: Locator): Promise<boolean> {
  const bh = await b.elementHandle();
  return a.evaluate((el, other) => !!(el.compareDocumentPosition(other as Node) & Node.DOCUMENT_POSITION_FOLLOWING), bh);
}
const box = async (l: Locator) => (await l.boundingBox())!;
const header = (page: Page) => page.locator('[data-sf-part="header"]');
const brandLink = (page: Page) => header(page).getByRole('link', { name: /— home$/ });
const cartLink = (page: Page) => header(page).getByRole('link', { name: /^Cart, / });

const PINNED: NonNullable<InstallMocksOptions['tweakSettings']> = (s) => {
  s.notices = [
    ...s.notices,
    { id: 'pinned-holiday', style: 'warning', title: null, body: 'Closed Monday for the bank holiday.', startsAt: null, endsAt: null, active: true, pinned: true, dismissible: false },
  ];
};

// ---- header -------------------------------------------------------------------------------------

test.describe('shell parts · header', () => {
  test('cart moved to start, search removed, a NavLinks between the brand and the account', async ({ page }) => {
    await open(page, 'storefront', arrangedShell('storefront'), '/', { session: false });
    await expect(brandLink(page)).toBeVisible();
    await expect(header(page).getByRole('textbox', { name: 'Search products' })).toHaveCount(0);
    const cart = await box(cartLink(page));
    const brand = await box(brandLink(page));
    const nav = await box(header(page).getByRole('link', { name: 'Our story' }));
    const account = await box(header(page).getByRole('link', { name: 'Sign in' }));
    expect(cart.x).toBeLessThan(brand.x);
    expect(brand.x).toBeLessThan(nav.x);
    expect(nav.x).toBeLessThan(account.x);
  });

  test('still sticky after scrolling (top 0) with the pinned notice in it; sticky off scrolls away', async ({ page }) => {
    await open(page, 'storefront', arrangedShell('storefront'), '/', { tweakSettings: PINNED, height: 500 });
    await expect(header(page).locator('[data-sf-part="pinned-notices"]')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    expect((await box(header(page))).y).toBeLessThanOrEqual(1);
    const pinned = await box(header(page).locator('[data-sf-part="pinned-notices"]'));
    expect(pinned.y).toBeGreaterThanOrEqual(-1);
    expect(pinned.y).toBeLessThan(120);

    const second = await page.context().newPage();
    try {
      await second.setViewportSize({ width: 1280, height: 500 });
      await second.clock.setFixedTime(FIXED_NOW);
      await installMocks(second, { layout: 'storefront', session: true, pages: { storefront: arrangedShell('storefront', { sticky: false }) }, tweakSettings: PINNED });
      await second.goto('/');
      await expect(brandLink(second)).toBeVisible();
      await second.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect.poll(() => second.evaluate(() => window.scrollY)).toBeGreaterThan(100);
      expect((await box(header(second))).y).toBeLessThan(-20);
    } finally {
      await second.close();
    }
  });

  test('the menu variant keeps its filter button, which opens the category sheet', async ({ page }) => {
    await open(page, 'menu', arrangedShell('menu'), '/', { width: 390 });
    const filter = header(page).getByRole('button', { name: 'Categories' });
    await expect(filter).toBeVisible();
    await filter.click();
    await expect(page.getByRole('dialog', { name: 'Categories' })).toBeVisible();
  });

  test('the web app header has its back button off the catalogue (outside Telegram)', async ({ page }) => {
    await open(page, 'webapp', arrangedShell('webapp'), '/tracking', { width: 390, session: false });
    await expect(header(page).getByRole('button', { name: 'Back' })).toBeVisible();
    await page.goto('/');
    await expect(header(page).getByRole('link', { name: /— home$/ })).toBeVisible();
    await expect(header(page).getByRole('button', { name: 'Back' })).toHaveCount(0);
  });

  test('a document without HeaderBrand renders the default shell, and says so once', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && m.text().includes('[builder] "shell"')) errors.push(m.text()); });
    await open(page, 'storefront', brandlessShellSet('storefront'), '/', { session: false });
    await expect(brandLink(page)).toBeVisible();
    await expect(header(page).getByRole('textbox', { name: 'Search products' })).toBeVisible();
    await expect(cartLink(page)).toBeVisible();
    await expect(header(page).getByRole('link', { name: 'Sign in' })).toBeVisible();
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(new Set(errors).size).toBe(1);
  });

  for (const layout of ['storefront', 'menu'] as const) {
    test(`${layout} · a v0.7.0 header (search: false, cartIcon: hide) renders no search and no cart icon`, async ({ page }) => {
      await open(page, layout, v070Shell(layout), '/', { session: false });
      await expect(brandLink(page)).toBeVisible();
      await expect(header(page).getByRole('link', { name: /^Cart, / })).toHaveCount(0);
      await expect(header(page).getByRole('textbox')).toHaveCount(0);
      await expect(header(page).getByRole('link', { name: 'Sign in' })).toHaveCount(1);
    });
  }

  test('the cart icon hidden through its part; a foreground set on the header brand does not reach the footer brand', async ({ page }) => {
    const set = arrangedShell('storefront');
    const hdr = set.shell.content[0]!;
    const start = hdr.props.start as Array<{ type: string; props: Record<string, unknown> }>;
    start.find((c) => c.type === 'HeaderCart')!.props.icon = 'hide';
    start.find((c) => c.type === 'HeaderBrand')!.props.blockStyle = { fg: 'primary' };
    await open(page, 'storefront', set, '/', { session: false });
    await expect(brandLink(page)).toBeVisible();
    await expect(cartLink(page)).toHaveCount(0);
    const footerBrand = page.locator('footer [class*="_wordmark_"]').first();
    const headBrand = brandLink(page).locator('[class*="_wordmark_"]');
    const footBrandColour = await footerBrand.evaluate((el) => getComputedStyle(el).color);
    const headBrandColour = await headBrand.evaluate((el) => getComputedStyle(el).color);
    // The owner's header foreground reaches the brand in the header and no other brand on the page.
    const plain = await page.context().newPage();
    try {
      await plain.setViewportSize({ width: 1280, height: 900 });
      await plain.clock.setFixedTime(FIXED_NOW);
      await installMocks(plain, { layout: 'storefront', session: false, pages: { storefront: defaultShellSet('storefront') } });
      await plain.goto('/');
      const plainFoot = await plain.locator('footer [class*="_wordmark_"]').first().evaluate((el) => getComputedStyle(el).color);
      expect(footBrandColour).toBe(plainFoot);
      const plainHead = await brandLink(plain).locator('[class*="_wordmark_"]').evaluate((el) => getComputedStyle(el).color);
      expect(headBrandColour).not.toBe(plainHead);
    } finally {
      await plain.close();
    }
  });
});

// ---- cart ---------------------------------------------------------------------------------------

test.describe('cart parts · the page (phone)', () => {
  test('the summary above the lines and a RichText between the lines and the foot', async ({ page }) => {
    await open(page, 'storefront', arrangedCart(), '/cart', { width: 390, cart: 'one' });
    const line = page.getByText(NAME, { exact: true }).first();
    await expect(line).toBeVisible();
    const subtotal = page.locator('[class*="_ledger_"]');
    const note = page.getByText('Packed in recycled paper.');
    await expect(note).toBeVisible();
    expect(await precedes(subtotal, line)).toBe(true);
    expect(await precedes(line, note)).toBe(true);
    await expect(page.getByRole('link', { name: 'Checkout' })).toBeVisible();
  });

  test('a document without CartSummaryCheckout renders the default cart', async ({ page }) => {
    await open(page, 'storefront', cartWithoutCheckoutSet(), '/cart', { width: 390, cart: 'one' });
    await expect(page.getByRole('link', { name: 'Checkout' })).toBeVisible();
    await expect(page.getByText('Continue shopping')).toBeVisible();
  });

  test('the empty cart shows CartEmpty and no summary', async ({ page }) => {
    await open(page, 'storefront', arrangedCart('storefront', false), '/cart', { width: 390 });
    await expect(page.getByText('Nothing on the order yet')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse the catalogue' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Checkout' })).toHaveCount(0);
  });

  test('the web app cart shows the held note when a line blocks checkout', async ({ page }) => {
    await open(page, 'webapp', arrangedCart('webapp'), '/cart', { width: 390, cart: 'flagged' });
    await expect(page.getByText('Resolve the flagged items to continue.')).toBeVisible();
    // The web app's own primary action is the checkout there; the summary draws no second one.
    await expect(page.locator('main').getByRole('link', { name: 'Checkout' })).toHaveCount(0);
    await expect(page.locator('main').getByRole('button', { name: 'Checkout' })).toHaveCount(0);
  });
});

test.describe('cart parts · the drawer (desktop)', () => {
  test('the same arrangement in the drawer, the summary pinned in the footer, checkout completes', async ({ page }) => {
    const mocks = await open(page, 'storefront', arrangedCart(), '/', { cart: 'one' });
    await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
    await cartLink(page).click();
    const drawer = page.getByRole('dialog', { name: 'Your cart' });
    await expect(drawer).toBeVisible();
    const line = drawer.getByText(NAME, { exact: true }).first();
    await expect(line).toBeVisible();
    const note = drawer.getByText('Packed in recycled paper.');
    await expect(note).toBeVisible();
    expect(await precedes(line, note)).toBe(true);
    const checkout = drawer.getByRole('link', { name: 'Checkout' });
    await expect(checkout).toBeVisible();
    // Pinned: the checkout sits below the body's last block and at the drawer's bottom edge.
    const d = await box(drawer);
    const c = await box(checkout);
    expect(c.y).toBeGreaterThan((await box(note)).y);
    expect(c.y + c.height).toBeGreaterThan(d.y + d.height - 160);
    await checkout.click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
    expect(mocks.requests()).toContain('GET storefront/cart');
  });

  test('the empty cart shows CartEmpty in the drawer', async ({ page }) => {
    await open(page, 'storefront', arrangedCart('storefront', false), '/');
    await cartLink(page).click();
    const drawer = page.getByRole('dialog', { name: 'Your cart' });
    await expect(drawer.getByText('Nothing on the order yet')).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'Checkout' })).toHaveCount(0);
  });

  test('a v0.7.0 cart document with CartSummary outside CartContents renders it in the drawer footer', async ({ page }) => {
    await open(page, 'storefront', v070CartOutsideSummary(), '/', { cart: 'one' });
    await cartLink(page).click();
    const drawer = page.getByRole('dialog', { name: 'Your cart' });
    await expect(drawer.getByText(NAME, { exact: true }).first()).toBeVisible();
    const checkout = drawer.getByRole('link', { name: 'Checkout' });
    await expect(checkout).toBeVisible();
    const d = await box(drawer);
    const c = await box(checkout);
    expect(c.y + c.height).toBeGreaterThan(d.y + d.height - 160);
    await expect(drawer.locator('[class*="_ledger_"]')).toHaveCount(1);
  });

  test('a cold load then opening the drawer never blanks or skeletons the page behind it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.clock.setFixedTime(FIXED_NOW);
    const mocks = await installMocks(page, { layout: 'storefront', session: true });
    seedCart(mocks, 'one');
    // The drawer's panel is a dynamic import: hold it so the click can come first.
    await page.route(/\/src\/features\/cart\/CartDrawerPanel\.tsx/, async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
    await page.evaluate(() => {
      const w = window as unknown as { __flash: string[] };
      w.__flash = [];
      // /cart redirects to the catalogue, which remounts for a frame or two (v0.7.0 does the same);
      // what must never happen is a skeleton, or a page that stays blank while the panel loads.
      let blankSince: number | null = null;
      const check = () => {
        if (document.querySelector('[role="status"][aria-label="Loading"]')) w.__flash.push('skeleton');
        const blank = !document.querySelector('main h1');
        if (blank && blankSince === null) blankSince = performance.now();
        if (!blank && blankSince !== null) {
          if (performance.now() - blankSince > 150) w.__flash.push(`blank ${Math.round(performance.now() - blankSince)}ms`);
          blankSince = null;
        }
      };
      new MutationObserver(check).observe(document.body, { subtree: true, childList: true });
      window.setInterval(check, 50);
    });
    await cartLink(page).click();
    const drawer = page.getByRole('dialog', { name: 'Your cart' });
    await expect(drawer).toBeVisible({ timeout: 20_000 });
    await expect(drawer.getByText(NAME, { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => (window as unknown as { __flash: string[] }).__flash)).toEqual([]);
    await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
  });
});

// ---- account ------------------------------------------------------------------------------------

test.describe('account parts', () => {
  test('tabs above the greeting', async ({ page }) => {
    await open(page, 'storefront', arrangedAccountSet(), '/account/orders', { width: 1280 });
    const greeting = page.getByRole('heading', { name: 'Ada', level: 1 });
    await expect(greeting).toBeVisible();
    expect(await precedes(page.getByRole('link', { name: 'Loyalty', exact: true }), greeting)).toBe(true);
    await expect(page.getByRole('link', { name: /^E2E1/ })).toBeVisible();
  });

  test('order detail with the parcels before the items', async ({ page }) => {
    await open(page, 'storefront', arrangedAccountSet(), '/account/orders/K4M2QP');
    const parcels = page.getByRole('heading', { name: 'Parcels' });
    const items = page.getByRole('heading', { name: 'Items' });
    await expect(items).toBeVisible();
    await expect(parcels).toBeVisible();
    expect(await precedes(parcels, items)).toBe(true);
  });

  test('loyalty redeem still confirms through the modal', async ({ page }) => {
    const mocks = await open(page, 'storefront', arrangedAccountSet(), '/account/loyalty');
    await expect(page.getByText('1,240')).toBeVisible();
    await page.getByRole('button', { name: 'Redeem' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Confirm redemption' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Redeem' }).click();
    await expect.poll(() => mocks.requests()).toContain('POST storefront/profile/redeem');
  });

  test('a profile without the channels section still signs out', async ({ page }) => {
    const mocks = await open(page, 'storefront', arrangedAccountSet(), '/account/profile');
    await expect(page.getByText('WhatsApp linked')).toHaveCount(0);
    const out = page.getByRole('button', { name: 'Sign out' });
    await expect(out).toBeVisible();
    await out.click();
    await expect.poll(() => mocks.requests()).toContain('POST storefront/auth/logout');
  });

  test('signed out, /account/orders still redirects to /login?returnTo=', async ({ page }) => {
    await open(page, 'storefront', arrangedAccountSet(), '/account/orders', { session: false });
    await expect(page).toHaveURL(/\/login\?returnTo=%2Faccount%2Forders$/);
  });
});

// ---- flows --------------------------------------------------------------------------------------

test.describe('flow parts', () => {
  test('sign-in: the heading below the ways in', async ({ page }) => {
    await open(page, 'storefront', arrangedFlowsSet(), '/login', { session: false });
    const heading = page.getByRole('heading', { name: 'Sign in to Northbound Supply' });
    await expect(heading).toBeVisible();
    expect(await precedes(page.getByRole('button', { name: 'Continue with WhatsApp' }), heading)).toBe(true);
  });

  test('payment success without the contact links; the default page has them', async ({ page }) => {
    const mocks = await open(page, 'storefront', null, '/payment/success?order=E2E9', { session: false });
    await expect(page.getByRole('heading', { name: /Thanks/ })).toBeVisible();
    const contact = page.locator('[class*="_contact_"]');
    await expect(contact).toHaveCount(1);
    mocks.state.pages = { storefront: arrangedFlowsSet() };
    await page.goto('/payment/success?order=E2E9');
    await expect(page.getByRole('heading', { name: /Thanks/ })).toBeVisible();
    await expect(page.getByText('E2E9').first()).toBeVisible();
    await expect(contact).toHaveCount(0);
  });

  test('payment cancel with a back link added', async ({ page }) => {
    const mocks = await open(page, 'storefront', null, '/payment/cancel?order=E2E9', { session: false });
    await expect(page.getByRole('heading', { name: 'No charge taken' })).toBeVisible();
    await expect(page.getByRole('link', { name: '← Back to shop' })).toHaveCount(0);
    mocks.state.pages = { storefront: arrangedFlowsSet() };
    await page.goto('/payment/cancel?order=E2E9');
    await expect(page.getByRole('link', { name: '← Back to shop' })).toBeVisible();
  });

  test('order placed with the reference above the headline', async ({ page }) => {
    await open(page, 'storefront', arrangedFlowsSet(), '/order-placed?order=E2E7', { session: false });
    const headline = page.getByRole('heading', { name: 'Order placed' });
    await expect(headline).toBeVisible();
    expect(await precedes(page.getByText('E2E7').first(), headline)).toBe(true);
  });

  test('tracking: the refresh button removed and a RichText above the parcels', async ({ page }) => {
    const mocks = await open(page, 'storefront', null, '/tracking/E2E1', { session: false });
    await expect(page.getByRole('heading', { name: 'In transit' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Refresh/ })).toHaveCount(1);
    mocks.state.pages = { storefront: arrangedFlowsSet() };
    await page.goto('/tracking/E2E1');
    await expect(page.getByRole('heading', { name: 'In transit' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Refresh/ })).toHaveCount(0);
    const note = page.getByText('Parcels leave the Northbound Supply bench daily.');
    await expect(note).toBeVisible();
    expect(await precedes(note, page.getByText('AB123456789GB').first())).toBe(true);
  });

  test('verify with the back link above the form, which still verifies', async ({ page }) => {
    const mocks = await open(page, 'storefront', arrangedFlowsSet(), '/verify', { session: false });
    const back = page.getByRole('link', { name: '← Back to shop' });
    const field = page.getByRole('textbox', { name: 'Verification code' });
    await expect(field).toBeVisible();
    expect(await precedes(back, field)).toBe(true);
    await field.fill('AB3D-SKU12');
    await page.getByRole('textbox', { name: 'Authentication code' }).fill('123456');
    await page.getByRole('button', { name: 'Verify product' }).click();
    await expect(page.getByText('Authentic Product')).toBeVisible();
    expect(mocks.requests()).toContain('GET verify/AB3D-SKU12/123456');
  });
});

// ---- no overflow at 360 px under every template ---------------------------------------------------

const TEMPLATES = [
  { template: 'modern', preset: 'default' },
  { template: 'dark-luxury', preset: 'gold' },
  { template: 'cyber-brutalism', preset: 'acid-dark' },
  { template: 'cyber-brutalism', preset: 'purple-light' },
  { template: 'bento', preset: 'tech-dark' },
  { template: 'bento', preset: 'fashion-light' },
];

test('every template in the catalog is covered by the overflow matrix', async ({ page }) => {
  const res = await page.request.get('/templates.json');
  const ids = ((await res.json()) as { templates: Array<{ id: string }> }).templates.map((t) => t.id);
  expect(ids.filter((id) => !TEMPLATES.some((t) => t.template === id))).toEqual([]);
});

const SIGNED_IN: Array<{ name: string; path: string; ready: (page: Page) => Locator }> = [
  { name: 'catalogue (header)', path: '/', ready: (p) => p.getByRole('heading', { level: 1 }).first() },
  { name: 'cart', path: '/cart', ready: (p) => p.getByText(NAME, { exact: true }).first() },
  { name: 'account orders', path: '/account/orders', ready: (p) => p.getByRole('heading', { name: 'Ada', level: 1 }) },
  { name: 'account order', path: '/account/orders/K4M2QP', ready: (p) => p.getByRole('heading', { name: 'Items' }) },
  { name: 'account loyalty', path: '/account/loyalty', ready: (p) => p.getByText('1,240') },
  { name: 'account profile', path: '/account/profile', ready: (p) => p.getByRole('button', { name: 'Sign out' }) },
];
const SIGNED_OUT: typeof SIGNED_IN = [
  { name: 'sign in', path: '/login', ready: (p) => p.getByRole('heading', { name: 'Sign in to Northbound Supply' }) },
  { name: 'payment success', path: '/payment/success?order=E2E9', ready: (p) => p.getByRole('heading', { name: /Thanks/ }) },
  { name: 'payment cancel', path: '/payment/cancel?order=E2E9', ready: (p) => p.getByRole('heading', { name: 'No charge taken' }) },
  { name: 'order placed', path: '/order-placed?order=E2E7', ready: (p) => p.getByRole('heading', { name: 'Order placed' }) },
  { name: 'tracking', path: '/tracking/E2E1', ready: (p) => p.getByRole('heading', { name: 'In transit' }) },
  { name: 'verify', path: '/verify', ready: (p) => p.getByRole('textbox', { name: 'Verification code' }) },
];

async function sweep(page: Page, layout: Layout, template: string, preset: string, session: boolean, pages: typeof SIGNED_IN): Promise<string[]> {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.clock.setFixedTime(FIXED_NOW);
  const mocks = await installMocks(page, {
    layout, session, pages: { [layout]: arrangedEverythingSet(layout) }, tweakSettings: await presetTheme(page, template, preset),
  });
  seedCart(mocks, 'one');
  const failures: string[] = [];
  for (const s of pages) {
    await page.goto(s.path);
    await expect(page.locator('html')).toHaveAttribute('data-sf-template', template);
    await expect(s.ready(page), s.name).toBeVisible();
    await page.waitForTimeout(300);
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
    if (o.sw > o.w) failures.push(`${layout} ${s.name}: scrollWidth ${o.sw} > ${o.w}`);
  }
  return failures;
}

for (const t of TEMPLATES) {
  for (const layout of ['storefront', 'menu'] as const) {
    test(`${t.template}/${t.preset} · ${layout} · every arranged page at 360px has no horizontal overflow`, async ({ page, browser }) => {
      const failures = await sweep(page, layout, t.template, t.preset, true, SIGNED_IN);
      // A fresh context: the signed-in session lives in this one's storage.
      const fresh = await browser.newContext();
      try {
        failures.push(...await sweep(await fresh.newPage(), layout, t.template, t.preset, false, SIGNED_OUT));
      } finally {
        await fresh.close();
      }
      expect(failures).toEqual([]);
    });
  }
}
