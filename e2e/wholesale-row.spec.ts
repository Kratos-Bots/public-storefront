import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Catalog } from '../web/src/types/catalog.ts';
import { installMocks } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';

const box = async (l: Locator) => {
  const b = await l.boundingBox();
  if (!b) throw new Error('not rendered');
  return b;
};

/**
 * The trade list on a phone: the name shares its line with the stepper (no SKU
 * above it pushing it down), and the stock status sits on a line under the name
 * rather than beside it.
 */
test.describe('wholesale row · 390px', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(FIXED_NOW);
    await installMocks(page, {
      layout: 'webapp',
      session: true,
      tweakSettings: (s) => { s.features.layout = 'webapp'; s.features.wholesale = true; },
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Trade list', level: 1 })).toBeVisible();
  });

  test('the name and the stepper share the top line', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Fennec Tincture 30ml' });
    const name = await box(row.getByText('Fennec Tincture 30ml', { exact: true }));
    const stepper = await box(row.getByRole('button', { name: 'One more Fennec Tincture 30ml' }));
    // Vertical overlap: each starts before the other ends.
    expect(name.y).toBeLessThan(stepper.y + stepper.height);
    expect(stepper.y).toBeLessThan(name.y + name.height);
  });

  test('stock status sits below the name, not beside it', async ({ page }) => {
    for (const [product, label] of [['Fennec Tincture 30ml', 'Low Stock'], ['Echo Balm 12ml', 'Out of Stock']] as const) {
      const row = page.getByRole('row').filter({ hasText: product });
      const name = await box(row.getByText(product, { exact: true }));
      const chip = await box(row.getByText(label, { exact: true }));
      expect(chip.y, `${label} under ${product}`).toBeGreaterThanOrEqual(name.y + name.height);
    }
  });

  test('a line with no status and nothing on order adds no third line', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Borealis Drops 25ml' });
    // Cells: code, product, unit, bulk, line total, qty.
    const total = await box(row.getByRole('cell').nth(4));
    expect(total.height).toBe(0);
  });
});

/**
 * The meta line under stress on the narrowest phone: a long code, a five-figure
 * price and a bulk chip. The code gives way; nothing slides under the stepper.
 */
test.describe('wholesale row · 360px, crowded meta line', () => {
  const NAME = 'Alpine Extract 10ml';

  test.beforeEach(async ({ page }) => {
    const catalog = JSON.parse(readFileSync(new URL('./fixtures/catalog.json', import.meta.url), 'utf8')) as Catalog;
    const alp = catalog.products.find((p) => p.sku === 'ALP-10')!;
    alp.sku = 'WHOLESALE-ALPINE-XL-10';
    alp.price = 12345;
    alp.pricingTiers = [
      { id: 9001, minQuantity: 3, price: 11000 },
      { id: 9002, minQuantity: 6, price: 10500 },
    ];
    await page.setViewportSize({ width: 360, height: 780 });
    await page.clock.setFixedTime(FIXED_NOW);
    await installMocks(page, {
      layout: 'webapp',
      catalog,
      session: true,
      tweakSettings: (s) => { s.features.layout = 'webapp'; s.features.wholesale = true; },
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Trade list', level: 1 })).toBeVisible();
  });

  const expectClearOfStepper = async (page: Page, where: string) => {
    const row = page.getByRole('row').filter({ hasText: NAME });
    const stepper = await box(row.getByRole('button', { name: `One fewer ${NAME}` }));
    const chip = await box(row.getByRole('button', { name: new RegExp(`price breaks for ${NAME}`) }));
    expect(chip.x + chip.width, `bulk chip clear of the stepper (${where})`).toBeLessThanOrEqual(stepper.x);
    // Code, unit price and bulk cells: the whole meta line.
    for (const i of [0, 2, 3]) {
      const cell = await box(row.getByRole('cell').nth(i));
      expect(cell.x + cell.width, `meta cell ${i} clear of the stepper (${where})`).toBeLessThanOrEqual(stepper.x);
    }
    await expect(row.getByRole('cell').first()).toHaveAttribute('title', 'WHOLESALE-ALPINE-XL-10');
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
    expect(o.sw, `horizontal overflow (${where})`).toBeLessThanOrEqual(o.w);
  };

  test('the code gives way before the price or the chip reaches the stepper', async ({ page }) => {
    await expectClearOfStepper(page, 'empty');
    // At a price break the chip turns into the (wider) discount it won.
    const input = page.getByRole('textbox', { name: `${NAME} quantity` });
    await input.fill('3');
    await input.press('Enter');
    await expect(page.getByRole('button', { name: new RegExp(`Bulk price applied.*${NAME}`) })).toBeVisible();
    await expectClearOfStepper(page, 'at a price break');
  });
});
