import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { installMocks, type Layout } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import { presetTheme } from './template-theme.ts';
import type { Catalog, ProductCoa } from '../web/src/types/catalog.ts';
import { readFileSync } from 'node:fs';

/**
 * Screenshots of the product lab report for a visual review: every template, one light and one dark preset
 * of each (where it has them), the three layouts, at 390 and 1280. The report is opened with its history so
 * the whole section shows. Only runs when asked, and writes outside the repo:
 * `COA_SHOTS=<output dir> TZ=UTC npx playwright test -c e2e/playwright.config.ts e2e/product-coa-visual.spec.ts`
 * Synthetic data only.
 */
const OUT = process.env.COA_SHOTS ?? '';
test.skip(!OUT, 'set COA_SHOTS to an output directory to capture the lab report screenshots');

const P = 101;
const TEMPLATES = ['modern', 'bento', 'cyber-brutalism', 'dark-luxury'] as const;
const SCHEMES = ['light', 'dark'] as const;
const LAYOUTS: Layout[] = ['storefront', 'menu', 'webapp'];
const WIDTHS = [390, 1280] as const;

const COAS: ProductCoa[] = [
  { id: 1, lab: 'Example Labs', sampleName: 'Alpine Extract', mgAmount: 10, purity: 99.957, batch: 'B-2409', testDate: '12 March 2026', reportUrl: 'https://example.com/report/1', fileKey: null },
  { id: 2, lab: 'Second Labs', sampleName: 'Alpine Extract', mgAmount: 10, purity: 98.5, batch: 'B-2311', testDate: '1 January 2026', reportUrl: null, fileKey: '00ff00ff00ff00ff00ff00ff00ff00ff' },
  { id: 3, lab: null, sampleName: null, mgAmount: 5, purity: 99.1, batch: null, testDate: '3 October 2025', reportUrl: 'https://example.com/report/3', fileKey: null },
];

interface CatalogJson { templates: Array<{ id: string; presets: Array<{ id: string; scheme: 'dark' | 'light' }> }> }

function catalog(): Catalog {
  const c = JSON.parse(readFileSync(new URL('./fixtures/catalog.json', import.meta.url), 'utf8')) as Catalog;
  c.products.find((p) => p.id === P)!.coas = COAS;
  return c;
}

const shot = (page: Page, name: string, fullPage: boolean) => {
  mkdirSync(OUT, { recursive: true });
  return page.screenshot({ path: resolve(OUT, name), fullPage, animations: 'disabled', caret: 'hide' });
};

for (const template of TEMPLATES) {
  for (const scheme of SCHEMES) {
    for (const layout of LAYOUTS) {
      for (const width of WIDTHS) {
        test(`${template} · ${scheme} · ${layout} · ${width}`, async ({ page }) => {
          const res = await page.request.get('/templates.json');
          const presets = ((await res.json()) as CatalogJson).templates.find((t) => t.id === template)?.presets ?? [];
          const preset = presets.find((p) => p.scheme === scheme);
          test.skip(!preset, `${template} has no ${scheme} preset`);

          await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
          await page.clock.setFixedTime(FIXED_NOW);
          await page.emulateMedia({ reducedMotion: 'reduce' });
          const tweakSettings = await presetTheme(page, template, preset!.id);
          await installMocks(page, { layout, session: true, tweakSettings, catalog: catalog() });
          await page.goto(layout === 'storefront' ? `/p/${P}` : `/?p=${P}`);

          const heading = page.getByRole('heading', { name: 'Certificate of analysis' });
          await expect(heading).toBeVisible();
          await page.locator('summary').click();
          await expect(page.getByRole('listitem').filter({ hasText: '1 January 2026' })).toBeVisible();
          await page.evaluate(() => document.fonts.ready);

          const o = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
          expect(o.scroll, 'horizontal overflow').toBeLessThanOrEqual(o.inner);

          const name = `${template}-${preset!.id}-${layout}-${width}.png`;
          if (layout === 'storefront') {
            await shot(page, name, true);
          } else {
            await heading.scrollIntoViewIfNeeded();
            await shot(page, name, false);
          }
        });
      }
    }
  }
}
