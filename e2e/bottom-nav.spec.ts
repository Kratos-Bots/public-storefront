import { expect, test, type Page } from '@playwright/test';
import { installMocks, installTelegramStub, type InstallMocksOptions, type Layout } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import { presetTheme } from './template-theme.ts';

/**
 * The phone's bottom navigation (core option `showMobileBottomNav`): where it shows, and that everything else at the
 * foot of the screen stacks directly on it. Synthetic data only.
 */
const LINE = {
  productId: 101, displayName: 'Alpine Extract 10ml', sku: 'ALP-10', unitPrice: 42.5, basePrice: 42.5, pricingTiers: [], quantity: 2,
  isPreorder: false, excludedFromFreeShipping: false, imageProductId: null,
};

interface Setup {
  width?: number; height?: number; layout?: Layout; session?: boolean; cart?: boolean; wholesale?: boolean; navOption?: boolean; menuOption?: boolean;
  template?: [string, string]; telegram?: boolean; noReviews?: boolean; reviews?: InstallMocksOptions['reviews']; faq?: InstallMocksOptions['faq'];
  tweak?: InstallMocksOptions['tweakSettings'];
}

async function setup(page: Page, o: Setup = {}) {
  await page.setViewportSize({ width: o.width ?? 390, height: o.height ?? 844 });
  await page.clock.setFixedTime(FIXED_NOW);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (o.telegram) {
    await installTelegramStub(page);
    await page.addInitScript(() => { (window as unknown as { Telegram: { WebApp: { safeAreaInset: { bottom: number } } } }).Telegram.WebApp.safeAreaInset.bottom = 34; });
  }
  if (o.cart) await page.addInitScript((line) => window.localStorage.setItem('sf-cart-v1', JSON.stringify({ state: { lines: [line] }, version: 0 })), LINE);
  // The header menu is on by default; the star tests below switch it off to see the star's own rules.
  const options = { ...(o.navOption === false ? { showMobileBottomNav: false } : {}), ...(o.menuOption === false ? { showHeaderMenu: false } : {}) };
  const theme = o.template ? await presetTheme(page, o.template[0], o.template[1], options) : null;
  return installMocks(page, {
    layout: o.layout ?? 'storefront',
    session: o.session ?? false,
    reviews: o.noReviews ? undefined : (o.reviews ?? {}),
    faq: o.faq,
    tweakSettings: (s) => {
      theme?.(s);
      if (!theme && Object.keys(options).length > 0) s.theme = { ...s.theme, options: { ...s.theme.options, ...options } };
      s.features.wholesale = o.wholesale ?? false;
      o.tweak?.(s);
    },
  });
}

const navOf = (page: Page) => page.locator('[data-sf-part="bottom-nav"]');
const rect = (page: Page, selector: string) => page.evaluate((sel) => {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, height: r.height };
}, selector);

test.describe('where the bar shows', () => {
  for (const path of ['/', '/p/101', '/cart', '/account/profile', '/reviews', '/support', '/faq']) {
    test(`390x844: on ${path}`, async ({ page }) => {
      await setup(page, { session: true, cart: path === '/cart' });
      await page.goto(path);
      await expect(navOf(page)).toBeVisible();
      await expect(navOf(page).getByRole('link')).toHaveCount(5);
      const box = (await navOf(page).boundingBox())!;
      expect(Math.round(box.y + box.height)).toBe(844);
      for (const link of await navOf(page).getByRole('link').all()) {
        const b = (await link.boundingBox())!;
        expect(b.width, 'tap target width').toBeGreaterThanOrEqual(44);
        expect(b.height, 'tap target height').toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sf-nav-h'))).toBe(`${box.height}px`);
    });
  }

  test('1280 wide: absent, and the root variable is 0', async ({ page }) => {
    await setup(page, { width: 1280, height: 900 });
    await page.goto('/');
    await expect(page.locator('[data-sf-part="product-row"], [data-sf-part="product-card"]').first()).toBeVisible();
    await expect(navOf(page)).toHaveCount(0);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sf-nav-h'))).toBe('');
  });

  for (const path of ['/checkout', '/login']) {
    test(`absent on ${path}`, async ({ page }) => {
      await setup(page, { session: path === '/checkout', cart: true });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(navOf(page)).toHaveCount(0);
    });
  }

  test('absent when the shop switches it off', async ({ page }) => {
    await setup(page, { navOption: false });
    await page.goto('/');
    await expect(page.locator('[data-sf-part="product-row"], [data-sf-part="product-card"]').first()).toBeVisible();
    await expect(navOf(page)).toHaveCount(0);
  });

  test('follows the shop\'s switches: no accounts, no ordering, no reviews', async ({ page }) => {
    await setup(page, { tweak: (s) => { s.features.accounts = false; s.features.ordering = false; } , noReviews: true });
    await page.goto('/');
    await expect(navOf(page)).toBeVisible();
    expect(await navOf(page).getByRole('link').allTextContents()).toEqual(['Catalog', 'FAQ']);
  });

  test('marks the current page, and the cart count follows the cart', async ({ page }) => {
    await setup(page, { cart: true, reviews: { list: [] } });
    await page.goto('/reviews');
    await expect(navOf(page).locator('[aria-current="page"]')).toHaveText('Reviews');
    await expect(navOf(page).getByRole('link', { name: 'Cart, 2 items' })).toBeVisible();
  });
});

test.describe('what stacks on the bar', () => {
  test('the phone cart bar sits directly on the bar, no overlap and no gap, and the page clears both', async ({ page }) => {
    await setup(page, { cart: true });
    await page.goto('/');
    await expect(page.locator('[data-sf-part="cart-bar"]')).toBeVisible();
    const nav = (await rect(page, '[data-sf-part="bottom-nav"]'))!;
    const bar = (await rect(page, '[data-sf-part="cart-bar"]'))!;
    expect(Math.abs(bar.bottom - nav.top)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-sf-part="cart-bar"]')!).paddingBottom)).toBe('0px');
    // The page reserves both, so the last thing on it is not under either.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const tail = await page.evaluate(() => {
      const last = Array.from(document.querySelectorAll('main, footer')).pop()!;
      return last.getBoundingClientRect().bottom;
    });
    expect(tail).toBeLessThanOrEqual(bar.top + 1);
  });

  test('with no cart bar the page still clears the bar at the end of a long page', async ({ page }) => {
    await setup(page);
    await page.goto('/');
    await expect(page.locator('[data-sf-part="product-row"], [data-sf-part="product-card"]').first()).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const nav = (await rect(page, '[data-sf-part="bottom-nav"]'))!;
    const tail = await page.evaluate(() => (Array.from(document.querySelectorAll('main, footer')).pop()!).getBoundingClientRect().bottom);
    expect(tail).toBeLessThanOrEqual(nav.top + 1);
  });

  for (const layout of ['menu', 'storefront'] as const) {
    test(`${layout} layout, wholesale: the wholesale bar rests directly on the bar`, async ({ page }) => {
      await setup(page, { layout, cart: true, wholesale: true, template: ['cyber-brutalism', 'acid-dark'] });
      await page.goto('/');
      const wholesale = page.locator('a[href="/cart"]:not([data-sf-nav])').filter({ hasText: /basket/i });
      await expect(wholesale).toBeVisible();
      const nav = (await rect(page, '[data-sf-part="bottom-nav"]'))!;
      const wb = (await wholesale.evaluate((el) => { const r = el.parentElement!.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }));
      expect(Math.abs(wb.bottom - nav.top)).toBeLessThanOrEqual(1);
      expect(wb.top).toBeLessThan(nav.top);
    });
  }

  test('360x640: five 44px targets, nothing overflows, the cart bar sits on the bar and the end of the page clears both', async ({ page }) => {
    await setup(page, { width: 360, height: 640, cart: true });
    await page.goto('/');
    await expect(page.locator('[data-sf-part="cart-bar"]')).toBeVisible();
    for (const link of await navOf(page).getByRole('link').all()) {
      const b = (await link.boundingBox())!;
      expect(b.width, 'tap target width').toBeGreaterThanOrEqual(44);
      expect(b.height, 'tap target height').toBeGreaterThanOrEqual(44);
    }
    // No label is cut off by its cell.
    expect(await navOf(page).locator('span:last-child').evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const nav = (await rect(page, '[data-sf-part="bottom-nav"]'))!;
    const bar = (await rect(page, '[data-sf-part="cart-bar"]'))!;
    expect(Math.abs(bar.bottom - nav.top)).toBeLessThanOrEqual(1);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const tail = await page.evaluate(() => (Array.from(document.querySelectorAll('main, footer')).pop()!).getBoundingClientRect().bottom);
    expect(tail).toBeLessThanOrEqual(bar.top + 1);
  });

  test('the menu layout\'s contact strip rests directly on the bar', async ({ page }) => {
    await setup(page, { layout: 'menu' });
    await page.goto('/');
    const strip = page.locator('a[href*="wa.me"], a[href*="t.me"]').first();
    await expect(strip).toBeVisible();
    const nav = (await rect(page, '[data-sf-part="bottom-nav"]'))!;
    const sb = await strip.evaluate((el) => { const r = el.parentElement!.parentElement!.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
    expect(Math.abs(sb.bottom - nav.top)).toBeLessThanOrEqual(1);
  });

  test('the web app layout in a browser tab: the running-tab bar rests on the bar', async ({ page }) => {
    await setup(page, { layout: 'webapp', cart: true });
    await page.goto('/');
    await expect(page.locator('[data-sf-part="cart-bar"]')).toBeVisible();
    const nav = (await rect(page, '[data-sf-part="bottom-nav"]'))!;
    const bar = (await rect(page, '[data-sf-part="cart-bar"]'))!;
    expect(Math.abs(bar.bottom - nav.top)).toBeLessThanOrEqual(1);
  });

  test('the web app layout in a browser tab: the stand-in for the Telegram main button rests on the bar and adds no inset', async ({ page }) => {
    const mocks = await setup(page, { layout: 'webapp', session: true });
    mocks.state.cart = {
      items: [{
        productId: 101, name: 'Alpine Extract 10ml', quantity: 1, unitPrice: 42.5, lineTotal: 42.5, imageUrl: null, isPreorder: false,
        outOfStock: false, priceChanged: false, inactive: false, belowMin: false, aboveMax: false, minOrderQuantity: null, maxOrderQuantity: null,
      }],
      subtotal: 42.5, itemCount: 1,
    };
    await page.goto('/cart');
    await expect(page.locator('[data-sf-part="primary-bar"]')).toBeVisible();
    const nav = (await rect(page, '[data-sf-part="bottom-nav"]'))!;
    const bar = (await rect(page, '[data-sf-part="primary-bar"]'))!;
    expect(Math.abs(bar.bottom - nav.top)).toBeLessThanOrEqual(1);
    expect(await page.locator('[data-sf-part="primary-bar"]').evaluate((el) => getComputedStyle(el).paddingBottom)).toBe('0px');
  });

  test('inside Telegram the bar takes the 34px inset alone, and what stacks on it adds none', async ({ page }) => {
    await setup(page, { layout: 'menu', cart: true, telegram: true });
    await page.goto('/');
    await expect(page.locator('[data-sf-part="cart-bar"]')).toBeVisible();
    expect(await navOf(page).evaluate((el) => getComputedStyle(el).paddingBottom)).toBe('34px');
    expect(await page.locator('[data-sf-part="cart-bar"]').evaluate((el) => getComputedStyle(el).paddingBottom)).toBe('0px');
    const nav = (await rect(page, '[data-sf-part="bottom-nav"]'))!;
    expect(Math.round(nav.bottom)).toBe(844);
    const bar = (await rect(page, '[data-sf-part="cart-bar"]'))!;
    expect(Math.abs(bar.bottom - nav.top)).toBeLessThanOrEqual(1);
  });

  test('a focused field near the end of a page is kept clear of the bar', async ({ page }) => {
    await setup(page, { session: true });
    await page.goto('/account/orders/K4M2QP');
    const field = page.getByLabel(/Your comments/);
    await expect(field).toBeVisible();
    await field.focus();
    await page.waitForTimeout(700);
    const nav = (await rect(page, '[data-sf-part="bottom-nav"]'))!;
    const box = (await field.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(nav.top + 1);
  });
});

test.describe('the support page', () => {
  for (const layout of ['storefront', 'menu', 'webapp'] as const) {
    test(`${layout}: opens from the bar, shows the heading and the coming-soon line`, async ({ page }) => {
      // A shop with no FAQ keeps Support in the bar (with one, FAQ takes its place and Support lives in the header menu).
      await setup(page, { layout, faq: { available: false } });
      await page.goto('/');
      await expect(navOf(page)).toBeVisible();
      await navOf(page).getByRole('link', { name: 'Support' }).click();
      await expect(page).toHaveURL(/\/support$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Support' })).toBeVisible();
      await expect(page.getByText(/coming soon/i)).toBeVisible();
      await expect(navOf(page).locator('[aria-current="page"]')).toHaveText('Support');
    });
  }
});

test.describe('the header Reviews link (with the header menu off: with it on, the phone star gives way to the menu)', () => {
  const headerHeight = (page: Page) => page.evaluate(() => document.querySelector('[data-sf-part="header"]')!.getBoundingClientRect().height);
  const cases: Array<[Layout, number, boolean]> = [
    ['storefront', 1280, true], ['menu', 1280, true], ['webapp', 1280, true],
    ['storefront', 390, false], ['menu', 390, false], ['webapp', 390, false],
  ];
  for (const [layout, width, navOption] of cases) {
    test(`${layout} at ${width}${navOption ? '' : ' with the bar off'}: shown, and the header is as tall as without it`, async ({ page }) => {
      await setup(page, { layout, width, height: width < 768 ? 844 : 900, navOption, menuOption: false, reviews: {} });
      await page.goto('/');
      const link = page.locator('[data-sf-part="header"]').getByRole('link', { name: 'Reviews' });
      await expect(link).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const withLink = await headerHeight(page);
      const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      expect(noOverflow, 'no horizontal overflow').toBe(true);
      await link.evaluate((el) => { (el as HTMLElement).style.display = 'none'; });
      expect(withLink).toBe(await headerHeight(page));
    });
  }

  for (const [layout, width, height] of [['menu', 390, 844], ['webapp', 390, 844], ['menu', 360, 640], ['webapp', 360, 640]] as const) {
    test(`${layout} at ${width} with the bar off: the search field keeps room for its placeholder, the star overlaps no neighbour and nothing overflows`, async ({ page }) => {
      await setup(page, { layout, width, height, navOption: false, menuOption: false, reviews: {} });
      await page.goto('/');
      const star = page.locator('[data-sf-part="header"]').getByRole('link', { name: 'Reviews' });
      await expect(star).toBeVisible();
      const field = page.locator('[data-sf-part="header"]').getByRole('textbox', { name: 'Search products' });
      await expect(field).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      // The placeholder, the icon and a little air: measured by drawing the placeholder text in the field's own font.
      const need = await field.evaluate((el) => {
        const cs = getComputedStyle(el);
        const c = document.createElement('canvas').getContext('2d')!;
        c.font = `${cs.fontSize} ${cs.fontFamily}`;
        return c.measureText((el as HTMLInputElement).placeholder).width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      });
      const box = (await field.boundingBox())!;
      // Either the placeholder fits, or the field has gone icon-only (placeholder transparent): never a clipped word.
      const hidden = await field.evaluate((el) => getComputedStyle(el, '::placeholder').color === 'rgba(0, 0, 0, 0)');
      if (width <= 388) expect(hidden, 'icon-only field on the narrowest phones').toBe(true);
      else expect(hidden).toBe(false);
      if (!hidden) expect(box.width, 'search field wide enough for its placeholder').toBeGreaterThanOrEqual(need + 4);
      const s = (await star.boundingBox())!;
      expect(s.width).toBeGreaterThanOrEqual(44);
      expect(s.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      // The star's 44px box lies over the gaps either side of it, never over another control's box.
      const others = await page.evaluate(() => {
        const header = document.querySelector('[data-sf-part="header"]')!;
        const star = Array.from(header.querySelectorAll('a')).find((a) => a.getAttribute('aria-label') === 'Reviews')!;
        return Array.from(header.querySelectorAll('a, button, input'))
          .filter((el) => el !== star && !star.contains(el) && el.getBoundingClientRect().width > 0)
          .map((el) => { const r = el.getBoundingClientRect(); return { name: el.getAttribute('aria-label') ?? el.tagName, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
      });
      expect(others.length).toBeGreaterThanOrEqual(4);
      for (const o of others) {
        const apart = o.right <= s.x || o.left >= s.x + s.width || o.bottom <= s.y || o.top >= s.y + s.height;
        expect(apart, `star overlaps ${o.name}`).toBe(true);
      }
    });
  }

  test('with the bar on, the header does not carry it on a phone, and the bar does', async ({ page }) => {
    await setup(page, { menuOption: false, reviews: {} });
    await page.goto('/');
    await expect(navOf(page).getByRole('link', { name: 'Reviews' })).toBeVisible();
    await expect(page.locator('[data-sf-part="header"]').getByRole('link', { name: 'Reviews' })).toBeHidden();
  });

  test('no reviews, no link', async ({ page }) => {
    await setup(page, { width: 1280, height: 900, noReviews: true });
    await page.goto('/');
    await expect(page.locator('[data-sf-part="product-row"], [data-sf-part="product-card"]').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Reviews', exact: true })).toHaveCount(0);
  });
});
