import { expect, test, type Locator } from '@playwright/test';
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
});
