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
