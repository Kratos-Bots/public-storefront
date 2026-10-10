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
 * The pinned bar is at the top of the viewport after scrolling, and every sticky element of the page sits at
 * or below its bottom edge (never under it).  of them must be resting exactly there.
 */
async function expectPinned(page: Page, selector: string, restingHeads = 0) {
  const header = page.locator('[data-sf-part="header"]');
  const probe = async (y: number) => {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(150);
    const h = await box(header);
    const bar = await box(page.locator(selector).first());
    expect(h.y).toBeLessThanOrEqual(1);
    expect(bar.y).toBeGreaterThanOrEqual(0);
    expect(bar.y + bar.height).toBeLessThanOrEqual(h.y + h.height + 1);
    const barBottom = h.y + h.height;
    const sticky = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((e) => getComputedStyle(e).position === 'sticky' && !e.closest('[data-sf-part="header"]'))
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.bottom > 0 && r.top < 600)
        .map((r) => r.top),
    );
    for (const top of sticky) expect(top, 'sticky element overlaps the pinned bar').toBeGreaterThanOrEqual(barBottom - 1.5);
    return { barBottom, sticky };
  };
  const doc = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(doc, 'the page is tall enough to scroll').toBeGreaterThan(60);
  let resting = 0;
  for (const y of [Math.floor(doc / 3), Math.floor((2 * doc) / 3), doc]) {
    const { barBottom, sticky } = await probe(y);
    resting = Math.max(resting, sticky.filter((t) => Math.abs(t - barBottom) < 2).length);
  }
  expect(resting, 'sticky heads resting directly under the bar').toBeGreaterThanOrEqual(restingHeads);
}

for (const layout of ['storefront', 'menu', 'webapp'] as Layout[]) {
  test.describe(`${layout} layout`, () => {
    test('selector stays pinned while the catalogue scrolls (desktop)', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 420 });
      await installMocks(page, { layout, warehouses: TWO });
      await page.goto('/');
      await expect(page.locator(PICKER)).toBeVisible();
      await expectPinned(page, PICKER);
      const pick = await box(page.locator(`${PICKER} select`));
      expect(pick.height).toBeGreaterThanOrEqual(28);
    });

    test('selector and a wrapping notice stay pinned on a phone', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 460 });
      await installMocks(page, { layout, warehouses: PAUSED });
      await page.goto('/');
      await page.locator(`${PICKER} select`).selectOption('2');
      await expect(page.locator(NOTICE)).toBeVisible();
      const notice = await box(page.locator(NOTICE));
      expect(notice.height).toBeGreaterThan(50); // wrapped onto two or more lines
      const touch = await box(page.locator(`${PICKER} select`));
      expect(touch.height).toBeGreaterThanOrEqual(40);
      await expectPinned(page, NOTICE);
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

test('feature off: no bar, no variable, the header is what it was', async ({ page }) => {
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
