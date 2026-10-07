import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { installMocks, type Layout } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import { presetTheme } from './template-theme.ts';
import type { Catalog } from '../web/src/types/catalog.ts';

/**
 * A Markdown product description on the page and in the sheet: screenshots for a visual review, plus a check
 * that a wide table never makes the page scroll sideways. Only runs when asked, and writes outside the repo:
 * `DESC_SHOTS=<output dir> TZ=UTC npx playwright test -c e2e/playwright.config.ts e2e/product-description-visual.spec.ts`
 * Synthetic data only.
 */
const OUT = process.env.DESC_SHOTS ?? '';
test.skip(!OUT, 'set DESC_SHOTS to an output directory to capture the description screenshots');

const P = 101;
const TEMPLATES = ['modern', 'dark-luxury', 'cyber-brutalism'] as const;
const SCHEMES = ['light', 'dark'] as const;
const LAYOUTS: Layout[] = ['storefront', 'menu'];
const WIDTHS = [360, 390, 1280] as const;

const SAMPLE = `This pen holds several doses.

## How to use

1. Find your dose in the table below.
2. Twist the dial until the window shows that number of units.
3. Inject as directed.

## Conversion reference

1 mg = 8.57 units

| Dose (mg) | Dial setting (units) |
|-----------|----------------------|
| 1         | 9                    |
| 2         | 17                   |
| 3         | 26                   |

| Strength | Vial size | Reconstitute with | Concentration | Units per 0.1 ml | Storage | Notes |
|---|---|---|---|---|---|---|
| 5 mg | 3 ml | 1 ml bacteriostatic water | 5 mg/ml | 10 | Refrigerate | Use within 30 days of mixing |

> Keep out of reach of children. See the [guide](https://example.com/guide) and \`code\`.
`;

interface CatalogJson { templates: Array<{ id: string; presets: Array<{ id: string; scheme: 'dark' | 'light' }> }> }

function catalog(): Catalog {
  const c = JSON.parse(readFileSync(new URL('./fixtures/catalog.json', import.meta.url), 'utf8')) as Catalog;
  c.products.find((p) => p.id === P)!.description = SAMPLE;
  return c;
}

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

          const table = page.locator('table').first();
          await expect(table).toBeVisible();
          await expect(page.getByRole('heading', { name: 'How to use' })).toBeVisible();
          await page.evaluate(() => document.fonts.ready);

          const o = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
          expect(o.scroll, 'horizontal overflow').toBeLessThanOrEqual(o.inner);

          mkdirSync(OUT, { recursive: true });
          const name = `${template}-${preset!.id}-${scheme}-${layout}-${width}.png`;
          await page.screenshot({ path: resolve(OUT, name), fullPage: layout === 'storefront', animations: 'disabled', caret: 'hide' });
        });
      }
    }
  }
}
