import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { installMocks, type Layout } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import type { Catalog, ProductCoa } from '../web/src/types/catalog.ts';

/**
 * A product's lab report (COA) as a shopper meets it: on the product page (storefront layout) and in the
 * product sheet (menu layout), with and without earlier reports. The base catalogue fixture carries no `coas`
 * (the DOM baselines depend on that), so each test hands the product its reports here. Invented data only.
 */
const P = 101;
const KEY = '00ff00ff00ff00ff00ff00ff00ff00ff';
const LATEST: ProductCoa = {
  id: 1, lab: 'Example Labs', sampleName: 'Example Extract', mgAmount: 10, purity: 99.957, batch: 'B-100', testDate: '12 March 2026',
  reportUrl: 'https://example.com/report/1', fileKey: null,
};
const EARLIER: ProductCoa = {
  id: 2, lab: 'Second Labs', sampleName: 'Example Extract', mgAmount: 10, purity: 98.5, batch: 'B-90', testDate: '1 January 2026',
  reportUrl: null, fileKey: KEY,
};

function catalogWith(coas: ProductCoa[] | undefined): Catalog {
  const catalog = JSON.parse(readFileSync(new URL('./fixtures/catalog.json', import.meta.url), 'utf8')) as Catalog;
  if (coas) catalog.products.find((p) => p.id === P)!.coas = coas;
  return catalog;
}

async function open(page: Page, layout: Layout, coas: ProductCoa[] | undefined, width = 1280) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.clock.setFixedTime(FIXED_NOW);
  await installMocks(page, { layout, session: true, catalog: catalogWith(coas) });
  await page.goto(layout === 'storefront' ? `/p/${P}` : `/?p=${P}`);
}

const SURFACES = [
  { name: 'page', layout: 'storefront', scope: (p: Page) => p.locator('article') },
  { name: 'sheet', layout: 'menu', scope: (p: Page) => p.locator('[data-sf-part="sheet"]') },
] as const;

for (const surface of SURFACES) {
  test.describe(`product COA · ${surface.name}`, () => {
    test('the latest report: one compact card with the figures, the facts and a clear link, no history', async ({ page }) => {
      await open(page, surface.layout, [LATEST]);
      const scope = surface.scope(page);
      await expect(scope.getByRole('heading', { name: 'Certificate of analysis' })).toBeVisible();
      for (const [label, value] of [['Lab', 'Example Labs'], ['Amount', '10 mg'], ['Purity', '99.957%'], ['Batch', 'B-100'], ['Tested', '12 March 2026']]) {
        await expect(scope.getByText(label, { exact: true })).toBeVisible();
        await expect(scope.getByText(value, { exact: true })).toBeVisible();
      }
      const link = scope.getByRole('link', { name: /View report/ });
      await expect(link).toHaveAttribute('href', 'https://example.com/report/1');
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(scope.getByText(/Previous reports/)).toHaveCount(0);
      // One card, and a compact one: the whole latest report fits well inside what six rows used to take.
      const card = scope.locator('[data-sf-part="card"]');
      await expect(card).toHaveCount(1);
      await expect(card.getByRole('link', { name: /View report/ })).toBeVisible();
      expect((await card.boundingBox())!.height).toBeLessThan(140);
    });

    test('a sparse report (only a purity) is a deliberate card with no empty slots', async ({ page }) => {
      await open(page, surface.layout, [{ ...LATEST, lab: null, sampleName: null, mgAmount: null, batch: null, testDate: null, reportUrl: null, purity: 99.4 }]);
      const card = surface.scope(page).locator('[data-sf-part="card"]');
      await expect(card.getByText('99.4%')).toBeVisible();
      await expect(card.getByRole('link')).toHaveCount(0);
      expect((await card.boundingBox())!.height).toBeLessThan(110);
    });

    test('earlier reports sit in a closed disclosure, each with its own link to the uploaded file', async ({ page }) => {
      await open(page, surface.layout, [LATEST, EARLIER]);
      const scope = surface.scope(page);
      const summary = scope.getByText('Previous reports (1)');
      await expect(summary).toBeVisible();
      expect((await scope.locator('summary').boundingBox())!.height).toBeGreaterThanOrEqual(44);
      const row = scope.getByRole('listitem').filter({ hasText: '1 January 2026' });
      await expect(row).toBeHidden();
      await summary.click();
      await expect(row).toBeVisible();
      await expect(row).toContainText('Second Labs');
      await expect(row).toContainText('Purity 98.5%');
      await expect(row).toContainText('Batch B-90');
      const link = row.getByRole('link');
      await expect(link).toHaveAttribute('href', `/media/coas/2/${KEY}`);
      const [popup] = await Promise.all([page.waitForEvent('popup'), link.click()]);
      expect(popup.url()).toContain(`/media/coas/2/${KEY}`);
    });

    test('a product with no reports shows no section', async ({ page }) => {
      await open(page, surface.layout, undefined);
      await expect(page.getByRole('heading', { name: 'Alpine Extract 10ml' }).first()).toBeVisible();
      await expect(page.getByText('Certificate of analysis')).toHaveCount(0);
    });

    test('an empty list shows no section either', async ({ page }) => {
      await open(page, surface.layout, []);
      await expect(page.getByRole('heading', { name: 'Alpine Extract 10ml' }).first()).toBeVisible();
      await expect(page.getByText('Certificate of analysis')).toHaveCount(0);
    });

    test('nothing overflows sideways at 360px', async ({ page }) => {
      await open(page, surface.layout, [{ ...LATEST, sampleName: 'A very long sample name for a very small phone screen', batch: 'BATCH-WITH-A-LONG-CODE-2026-03-12' }, EARLIER], 360);
      const scope = surface.scope(page);
      await scope.getByText('Previous reports (1)').click();
      await expect(scope.getByRole('link', { name: /View report: 1 January 2026/ })).toBeVisible();
      const o = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
      expect(o.scroll).toBeLessThanOrEqual(o.inner);
    });
  });
}
