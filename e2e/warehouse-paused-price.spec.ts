import { expect, test, type Page } from '@playwright/test';
import { installMocks, type InstallMocksOptions, type Layout } from './mocks.ts';

/**
 * Ordering paused at the selected warehouse, at phone width: the price takes the slot the picker has with ordering on,
 * instead of sitting beneath the name. Each case compares the paused card with the same card at an open warehouse.
 * Synthetic warehouses: "Test EU" (id 2) stocks Borealis Drops and Dune Starter Kit.
 */
test.use({ viewport: { width: 390, height: 844 } });

const LIST = [
  { id: 1, name: 'Main', country: 'GB', isDefault: true },
  { id: 2, name: 'Test EU', country: 'DE', isDefault: false },
];
const OPEN: NonNullable<InstallMocksOptions['warehouses']> = { list: LIST, carries: { 2: [102, 104] } };
const PAUSED: NonNullable<InstallMocksOptions['warehouses']> = {
  list: [LIST[0]!, { ...LIST[1]!, orderingEnabled: false, orderingMessage: 'Back Monday' }],
  carries: { 2: [102, 104] },
};

async function open(page: Page, layout: Layout, warehouses: NonNullable<InstallMocksOptions['warehouses']>) {
  await installMocks(page, { layout, warehouses });
  await page.goto('/');
  await page.locator('[data-warehouse-picker] select').selectOption('2');
  const part = layout === 'storefront' ? 'product-card' : 'product-row';
  const card = page.locator(`[data-sf-part="${part}"]`).filter({ hasText: 'Borealis Drops' });
  await expect(card).toBeVisible();
  return card;
}

const box = async (loc: ReturnType<Page['locator']>) => (await loc.boundingBox())!;
/** A box relative to its card, so a taller header on the paused page (the notice) does not skew the comparison. */
const within = async (card: ReturnType<Page['locator']>, loc: ReturnType<Page['locator']>) => {
  const c = await box(card);
  const b = await box(loc);
  return { x: b.x - c.x, y: b.y - c.y, width: b.width, height: b.height };
};

for (const layout of ['menu', 'webapp'] as const) {
  test(`${layout} row: the price stands in the picker's slot, not in its own column`, async ({ page, context }) => {
    const paused = await open(page, layout, PAUSED);
    const live = await open(await context.newPage(), layout, OPEN);

    await expect(paused.locator('[data-sf-part="price"]')).toHaveCount(1);
    // It sits in the gutter, the same box that holds the Add button with an open warehouse.
    await expect(paused.locator('[class*="gutter"] [data-sf-part="price"]')).toHaveCount(1);
    await expect(live.locator('[class*="gutter"] button')).toHaveCount(1);
    const liveRow = await box(live);
    const row = await box(paused);
    const liveSlot = await within(live, live.locator('button').last());
    const price = await within(paused, paused.locator('[data-sf-part="price"]'));

    // Same height as the row with the picker, and the price right-aligned to the picker's right edge.
    expect(Math.abs(row.height - liveRow.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(price.x + price.width - (liveSlot.x + liveSlot.width))).toBeLessThanOrEqual(1);
    // Centred on the picker's axis, i.e. on the row, not hanging under the name.
    const h3 = await within(paused, paused.locator('h3'));
    const nameBottom = h3.y + h3.height;
    expect(Math.abs(price.y + price.height / 2 - (liveSlot.y + liveSlot.height / 2))).toBeLessThanOrEqual(2);
    expect(price.y).toBeLessThan(nameBottom);
    // Nothing else on the row repeats it.
    await expect(paused.locator('button').filter({ hasText: /^$/ })).toHaveCount(0);
  });
}

test('storefront tile: the price takes the Add button\'s place in the foot, and the tile keeps its height', async ({ page, context }) => {
  const paused = await open(page, 'storefront', PAUSED);
  const live = await open(await context.newPage(), 'storefront', OPEN);

  await expect(paused.locator('[data-sf-part="price"]')).toHaveCount(1);
  const tile = await box(paused);
  const liveTile = await box(live);
  const liveAdd = await within(live, live.getByRole('button', { name: /add/i }));
  const price = await within(paused, paused.locator('[data-sf-part="price"]'));

  expect(Math.abs(tile.height - liveTile.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(price.x + price.width - (liveAdd.x + liveAdd.width))).toBeLessThanOrEqual(1);
  expect(Math.abs(price.y + price.height / 2 - (liveAdd.y + liveAdd.height / 2))).toBeLessThanOrEqual(2);
  // No empty box left behind where the button was.
  const emptyBoxes = await paused.locator('div').evaluateAll((els) => els.filter((e) => e.children.length === 0 && !(e.textContent ?? '').trim() && e.getBoundingClientRect().height > 0 && !e.hasAttribute('aria-hidden')).length);
  expect(emptyBoxes).toBe(0);
});

/**
 * A long price in a currency with a long symbol: 1,299.99 in CHF, with a bulk rung under it on the tile. In the row the
 * 116px gutter must hold it (or grow to it) without clipping, overflowing the row or running into the name; on the tile
 * the foot must hold it inside the card.
 */
import { readFileSync } from 'node:fs';
import type { Catalog } from '../web/src/types/catalog.ts';

function longPriceCatalog(): Catalog {
  const catalog = JSON.parse(readFileSync(new URL('./fixtures/catalog.json', import.meta.url), 'utf8')) as Catalog;
  const p = catalog.products.find((x) => x.id === 102)!;
  p.price = 12999.99;
  p.pricingTiers = [{ minQuantity: 5, price: 11999.99 }] as typeof p.pricingTiers;
  return catalog;
}

async function openLong(page: Page, layout: Layout) {
  await installMocks(page, {
    layout, warehouses: PAUSED, catalog: longPriceCatalog(),
    tweakSettings: (s) => { s.currency = 'CHF'; },
  });
  await page.goto('/');
  await page.locator('[data-warehouse-picker] select').selectOption('2');
  const part = layout === 'storefront' ? 'product-card' : 'product-row';
  const card = page.locator(`[data-sf-part="${part}"]`).filter({ hasText: 'Borealis' });
  await expect(card).toBeVisible();
  return card;
}

for (const layout of ['menu', 'webapp', 'storefront'] as const) {
  test(`${layout}: a long price (CHF 12,999.99) in the paused slot is not clipped, does not overflow and leaves the name alone`, async ({ page }) => {
    const card = await openLong(page, layout);
    const price = card.locator('[data-sf-part="price"]');
    await expect(price).toHaveText(/12,999\.99/);
    const c = await box(card);
    const p = await box(price);
    // Inside the card, on its right.
    expect(p.x + p.width).toBeLessThanOrEqual(c.x + c.width + 0.5);
    expect(p.x).toBeGreaterThanOrEqual(c.x);
    // Not clipped by its own box.
    const clipped = await price.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(clipped).toBe(false);
    // A row's price stays inside the gutter that carries it (the slot grows to a long price rather than spill).
    if (layout !== 'storefront') {
      const g = await box(card.locator('[class*="gutter"]'));
      expect(p.x).toBeGreaterThanOrEqual(g.x - 0.5);
      expect(p.x + p.width).toBeLessThanOrEqual(g.x + g.width + 0.5);
    }
    // The name ends before the price begins (they may share the row but never overlap).
    const name = card.locator('h3').first();
    const n = await box(name);
    const sameLine = p.y < n.y + n.height && p.y + p.height > n.y;
    if (sameLine && layout !== 'storefront') expect(n.x + n.width).toBeLessThanOrEqual(p.x + 0.5);
    // The page does not scroll sideways.
    const o = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(o.scroll).toBeLessThanOrEqual(o.inner);
    const dir = process.env.REVIEWS_SHOTS_DIR;
    if (dir) await card.screenshot({ path: `${dir.replaceAll('\\', '/').replace(/\/?$/, '/')}paused-long-price-${layout}-390.png` });
  });
}

/**
 * An owner card design whose Add part is hidden on one viewport by its block style: with ordering paused there must be
 * exactly one VISIBLE price at 390px and at 1280px (never none, never two), in the row and in the tile.
 */
import { pausedPriceDesignSet } from './page-sets.ts';

const CASES: Array<{ hide: 'mobile' | 'desktop' | undefined; label: string }> = [
  { hide: undefined, label: 'Add part never hidden' },
  { hide: 'mobile', label: 'Add part hidden on phones' },
  { hide: 'desktop', label: 'Add part hidden on desktops' },
];

for (const layout of ['menu', 'storefront'] as const) {
  for (const { hide, label } of CASES) {
    for (const width of [390, 1280] as const) {
      test(`${layout} ${label}, ${width}px: one visible price while ordering is paused`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await installMocks(page, { layout, warehouses: PAUSED, pages: { [layout]: pausedPriceDesignSet(layout, hide) } });
        await page.goto('/');
        await page.locator('[data-warehouse-picker] select').selectOption('2');
        const part = layout === 'storefront' ? 'product-card' : 'product-row';
        const card = page.locator(`[data-sf-part="${part}"]`).filter({ hasText: 'Borealis' });
        await expect(card).toBeVisible();
        const visible = await card.locator('[data-sf-part="price"]').evaluateAll((els) => els.filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]');
        }).length);
        expect(visible).toBe(1);
        // The design is the one that was published: the Add part carries the price only when it is never hidden.
        const inSlot = await card.locator('[data-sf-part="price"]').evaluate((el) => !!el.closest('[class*="gutter"], [class*="addPrice"]'));
        expect(inSlot).toBe(hide === undefined);
        const total = await card.locator('[data-sf-part="price"]').count();
        expect(total).toBe(1);
      });
    }
  }
}

test('menu 320px: a long price (CHF 12,999.99) in the paused slot wraps or fits, never overflows the row or the name', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await installMocks(page, { layout: 'menu', warehouses: PAUSED, catalog: longPriceCatalog(), tweakSettings: (s) => { s.currency = 'CHF'; } });
  await page.goto('/');
  await page.locator('[data-warehouse-picker] select').selectOption('2');
  const card = page.locator('[data-sf-part="product-row"]').filter({ hasText: 'Borealis' });
  await expect(card).toBeVisible();
  const price = card.locator('[data-sf-part="price"]');
  const c = await box(card);
  const p = await box(price);
  const g = await box(card.locator('[class*="gutter"]'));
  const n = await box(card.locator('h3').first());
  expect(p.x).toBeGreaterThanOrEqual(g.x - 0.5);
  expect(p.x + p.width).toBeLessThanOrEqual(g.x + g.width + 0.5);
  expect(g.x + g.width).toBeLessThanOrEqual(c.x + c.width + 0.5);
  expect(n.x + n.width).toBeLessThanOrEqual(g.x + 0.5);
  const o = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(o.scroll).toBeLessThanOrEqual(o.inner);
  const dir = process.env.REVIEWS_SHOTS_DIR;
  if (dir) await card.screenshot({ path: `${dir.replaceAll('\\', '/').replace(/\/?$/, '/')}paused-long-price-menu-320.png` });
});
