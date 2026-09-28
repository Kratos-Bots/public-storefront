import { expect, test } from '@playwright/test';
import { installMocks, type Layout } from './mocks.ts';
import { addFirstToCart, FIXED_NOW, onlyVisible, openCart, openProduct } from './flows.ts';

/**
 * Modern's pixels, captured BEFORE the template engine touched any CSS. Every later
 * task must leave these passing unchanged — that is how "modern is pixel-identical"
 * is proven rather than asserted.
 */
const VIEWPORTS = { mobile: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } } as const;
const LAYOUTS: Layout[] = ['storefront', 'menu'];

for (const layout of LAYOUTS) {
  for (const size of ['mobile', 'desktop'] as const) {
    test.describe(`modern baseline · ${layout} · ${size}`, () => {
      test.use({ viewport: VIEWPORTS[size] });

      test('catalog → detail → cart → checkout', async ({ page }) => {
        await page.clock.setFixedTime(FIXED_NOW);
        const mocks = await installMocks(page, { layout, session: true });
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
        await expect(page).toHaveScreenshot(`${layout}-${size}-catalog.png`, { fullPage: true });

        await openProduct(page, layout, 'Alpine Extract 10ml');
        await expect(page).toHaveScreenshot(`${layout}-${size}-detail.png`);

        await addFirstToCart(page, layout, mocks);
        await openCart(page, size);
        await expect(page).toHaveScreenshot(`${layout}-${size}-cart.png`);

        await onlyVisible(page.getByRole('link', { name: 'Checkout' })).click();
        await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
        await expect(page).toHaveScreenshot(`${layout}-${size}-checkout.png`);
      });
    });
  }
}
