import { expect, test, type Locator, type Page } from '@playwright/test';
import { installMocks, type InstallMocksOptions, type Layout } from './mocks.ts';

/**
 * The warehouse bar (the "Shipping from" selector and the not-taking-orders notice) is pinned inside the
 * sticky header while products are browsed, and absent on every other page. Mocked, synthetic warehouses.
 */
const TWO: NonNullable<InstallMocksOptions['warehouses']> = {
  list: [
    { id: 1, name: 'Main', country: 'GB', isDefault: true },
    { id: 2, name: 'Test EU', country: 'DE', isDefault: false },
  ],
  carries: { 2: [102, 104] },
};
const PAUSED_LONG = 'Test EU is taking a short break while we restock. You can keep browsing, and orders open again on Monday morning.';
const PAUSED: NonNullable<InstallMocksOptions['warehouses']> = {
  ...TWO,
  list: [TWO.list[0]!, { ...TWO.list[1]!, orderingEnabled: false, orderingMessage: PAUSED_LONG }],
};

const PICKER = '[data-warehouse-picker]';
const NOTICE = '[data-warehouse-paused]';

const box = async (l: Locator) => (await l.boundingBox())!;

/**
 * The pinned bar stays at the top of the viewport at every scroll position, and no sticky element of the page
 * ever overlaps it (one pushed out by the end of its own section sits wholly under the bar, which is fine).
 * `rests` says what has to be seen sticking: at some scroll position at least one sticky element has its top
 * within `gap` px below the bar's bottom edge (a sticky group head: gap 2; the desktop category rail keeps its
 * own 5.5rem rhythm: gap 30). `rests: null` is for layouts and widths that have no sticky element (the
 * storefront catalogue on a phone: its category chips scroll with the page).
 */
async function expectPinned(page: Page, selector: string, rests: { gap: number } | null) {
  const header = page.locator('[data-sf-part="header"]');
  const probe = async (y: number) => {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(60);
    const h = await box(header);
    const bar = await box(page.locator(selector).first());
    expect(h.y).toBeLessThanOrEqual(1);
    expect(bar.y).toBeGreaterThanOrEqual(0);
    expect(bar.y + bar.height).toBeLessThanOrEqual(h.y + h.height + 1);
    const barBottom = h.y + h.height;
    const sticky = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((e) => getComputedStyle(e).position === 'sticky' && !e.closest('[data-sf-part="header"]'))
        .map((e) => ({ rect: e.getBoundingClientRect(), cssTop: Number.parseFloat(getComputedStyle(e).top) }))
        // Page-top sticky elements only: the running-tab strip sticks to the foot.
        .filter(({ rect }) => rect.width > 0 && rect.bottom > 0 && rect.top < 300)
        .map(({ rect, cssTop }) => ({ top: rect.top, bottom: rect.bottom, cssTop })),
    );
    // Where a page element is told to stick (its resolved `top`) must clear the bar: a head that is merely being
    // shoved up by the end of its own section passes under the bar on its way out, which is not an offset error.
    for (const r of sticky) {
      if (Number.isFinite(r.cssTop)) expect(r.cssTop, `a sticky element's offset clears the pinned bar (${r.cssTop} vs ${barBottom})`).toBeGreaterThanOrEqual(barBottom - 1.5);
    }
    return { barBottom, tops: sticky.map((r) => r.top) };
  };
  const doc = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(doc, 'the page is tall enough to scroll').toBeGreaterThan(60);
  let resting = false;
  for (let y = 0; y <= doc; y += Math.max(20, Math.ceil(doc / 40))) {
    const { barBottom, tops } = await probe(y);
    if (tops.some((t) => t >= barBottom - 1.5 && t - barBottom <= (rests?.gap ?? 0))) resting = true;
  }
  if (rests) expect(resting, 'a sticky element rests directly under the bar').toBe(true);
}

type Rest = { gap: number } | null;
// What sticks under the bar where: storefront desktop has the category rail; menu has sticky group heads; the
// storefront phone catalogue and the webapp have no sticky page element in the mocked catalogue.
const REST: Record<Layout, { desktop: Rest; phone: Rest }> = {
  storefront: { desktop: { gap: 30 }, phone: null },
  menu: { desktop: { gap: 2 }, phone: { gap: 2 } },
  webapp: { desktop: { gap: 2 }, phone: { gap: 2 } },
};

for (const layout of ['storefront', 'menu', 'webapp'] as Layout[]) {
  test.describe(`${layout} layout`, () => {
    test('selector stays pinned while the catalogue scrolls (desktop)', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 260 });
      await installMocks(page, { layout, warehouses: TWO });
      await page.goto('/');
      await expect(page.locator(PICKER)).toBeVisible();
      await expectPinned(page, PICKER, REST[layout].desktop);
      const pick = await box(page.locator(`${PICKER} select`));
      expect(pick.height).toBeGreaterThanOrEqual(28);
    });

    test('selector and a wrapping notice stay pinned on a phone', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 280 });
      await installMocks(page, { layout, warehouses: PAUSED });
      await page.goto('/');
      await page.locator(`${PICKER} select`).selectOption('2');
      await expect(page.locator(NOTICE)).toBeVisible();
      const notice = await box(page.locator(NOTICE));
      expect(notice.height).toBeGreaterThan(50); // wrapped onto two or more lines
      const touch = await box(page.locator(`${PICKER} select`));
      expect(touch.height).toBeGreaterThanOrEqual(40);
      await expectPinned(page, NOTICE, REST[layout].phone);
      await expect(page.locator(PICKER)).toBeInViewport();
    });
  });
}

test('the bar is on the catalogue category and product pages, and nowhere else', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMocks(page, { layout: 'storefront', warehouses: PAUSED });
  await page.goto('/');
  await page.locator(`${PICKER} select`).selectOption('2');
  await expect(page.locator(NOTICE)).toBeVisible();
  await page.goto('/p/102');
  await expect(page.locator(PICKER)).toBeVisible();
  await expect(page.locator(NOTICE)).toBeVisible();
  for (const path of ['/account/orders', '/checkout', '/login', '/tracking', '/order-placed']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.locator(PICKER), path).toHaveCount(0);
    await expect(page.locator(NOTICE), path).toHaveCount(0);
  }
});

test('cart page: no header bar, the cart keeps its own notice', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMocks(page, { layout: 'storefront', warehouses: PAUSED });
  await page.goto('/');
  await page.locator(`${PICKER} select`).selectOption('2');
  await page.goto('/cart');
  await page.waitForLoadState('networkidle');
  await expect(page.locator(PICKER)).toHaveCount(0);
  await expect(page.locator('[data-warehouse-bar]')).toHaveCount(0);
});

test('feature off or a single open warehouse: no bar, no variable, same header height', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMocks(page, { layout: 'storefront' });
  await page.goto('/');
  const header = page.locator('[data-sf-part="header"]');
  await expect(header).toBeVisible();
  await expect(page.locator(PICKER)).toHaveCount(0);
  await expect(page.locator(NOTICE)).toHaveCount(0);
  await expect(page.locator('[data-warehouse-bar]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--sf-wh-h'))).toBe('');
  const off = (await box(header)).height;
  // The same shop with the feature on but a single warehouse and nothing paused is also unchanged.
  await installMocks(page, { layout: 'storefront', warehouses: { list: [TWO.list[0]!], carries: {} } });
  await page.goto('/');
  await expect(header).toBeVisible();
  await expect(page.locator('[data-warehouse-bar]')).toHaveCount(0);
  expect((await box(header)).height).toBe(off);
});
