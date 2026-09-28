import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Catalog } from '../web/src/types/catalog.ts';
import { installMocks } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';

/**
 * Modern's pixels for the image-less catalogue path: when no visible product has an image,
 * ProductGrid renders ProductRow rows (`.rows`) instead of the card grid. The shared fixture gives
 * every product an imageProductId (so templates-baseline.spec.ts covers the grid); this variant
 * drops them. The PNGs were captured at ca08cf3 — before the template engine touched any CSS — so
 * this spec running unchanged at HEAD proves the rows path is still pixel-identical.
 */
const VIEWPORTS = { mobile: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } } as const;

function imagelessCatalog(): Catalog {
  const catalog = JSON.parse(readFileSync(new URL('./fixtures/catalog.json', import.meta.url), 'utf8')) as Catalog;
  return { ...catalog, products: catalog.products.map((p) => ({ ...p, imageProductId: null })) };
}

for (const size of ['mobile', 'desktop'] as const) {
  test.describe(`modern baseline · storefront · ${size} · image-less catalogue`, () => {
    test.use({ viewport: VIEWPORTS[size] });

    test('catalog renders as rows', async ({ page }) => {
      await page.clock.setFixedTime(FIXED_NOW);
      await installMocks(page, { layout: 'storefront', session: true, catalog: imagelessCatalog() });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Alpine Extract 10ml', exact: true })).toBeVisible(); // a row opener, not a card link
      await expect(page).toHaveScreenshot(`storefront-${size}-catalog-imageless.png`, { fullPage: true });
    });
  });
}
