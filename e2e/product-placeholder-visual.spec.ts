import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { installMocks } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import { presetTheme } from './template-theme.ts';
import type { Catalog, ProductCoa } from '../web/src/types/catalog.ts';

/**
 * The product page for a product without a photo: the no-photo plate in every template, phone to wide desktop,
 * with a lab report so the report-under-the-plate placement is visible. Only runs when asked, and writes outside
 * the repo:
 * `PLACEHOLDER_SHOTS=<output dir> TZ=UTC npx playwright test -c e2e/playwright.config.ts e2e/product-placeholder-visual.spec.ts`
 * Synthetic data only.
 */
const OUT = process.env.PLACEHOLDER_SHOTS ?? '';
test.skip(!OUT, 'set PLACEHOLDER_SHOTS to an output directory to capture the no-photo plate screenshots');

const P = 101;
const COA: ProductCoa = { id: 1, lab: 'Example Labs', sampleName: 'Alpine Extract', mgAmount: 10, purity: 99.957, batch: 'B-2409', testDate: '12 March 2026', reportUrl: 'https://example.com/report/1', fileKey: null };
const SIZES: Array<[number, number]> = [[390, 844], [1366, 768], [1920, 1080]];
const TEMPLATES: Array<[string, string]> = [['modern', ''], ['bento', 'tech-light'], ['cyber-brutalism', ''], ['dark-luxury', '']];

interface CatalogJson { templates: Array<{ id: string; presets: Array<{ id: string; scheme: 'dark' | 'light' }> }> }

function catalog(): Catalog {
  const c = JSON.parse(readFileSync(new URL('./fixtures/catalog.json', import.meta.url), 'utf8')) as Catalog;
  const p = c.products.find((x) => x.id === P)!;
  p.imageProductId = null;
  p.coas = [COA];
  p.description = 'A cold-pressed alpine extract, bottled in amber glass.\n\n**Keep cool** and out of direct light.';
  return c;
}

for (const [template, wanted] of TEMPLATES) {
  for (const [width, height] of SIZES) {
    test(`${template} · ${width}x${height}`, async ({ page }) => {
      const res = await page.request.get('/templates.json');
      const presets = ((await res.json()) as CatalogJson).templates.find((t) => t.id === template)?.presets ?? [];
      const preset = wanted || presets.find((p) => p.scheme === 'light')?.id || presets[0]!.id;

      await page.setViewportSize({ width, height });
      await page.clock.setFixedTime(FIXED_NOW);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const tweakSettings = await presetTheme(page, template, preset, { showSku: false });
      await installMocks(page, { layout: 'storefront', session: true, tweakSettings, catalog: catalog() });
      await page.goto(`/p/${P}`);

      await expect(page.getByRole('heading', { name: 'Certificate of analysis' })).toBeVisible();
      await expect(page.locator('article [class*="plate"]')).toHaveCount(1);
      await page.evaluate(() => document.fonts.ready);
      mkdirSync(OUT, { recursive: true });
      const name = `${template}-${preset}-${width}x${height}`;
      await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: false, animations: 'disabled', caret: 'hide' });
      await page.screenshot({ path: resolve(OUT, `${name}-full.png`), fullPage: true, animations: 'disabled', caret: 'hide' });
    });
  }
}
