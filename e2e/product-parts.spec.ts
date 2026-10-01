import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { installMocks, type InstallMocksOptions, type Layout } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import { catalogDefaultSet } from './page-sets.ts';
import { presetTheme } from './template-theme.ts';
import {
  brokenTileSet, gridArrangedSet, legacyProductSet, listNoIntroSet, menuSheetSet, productPartsSet, productWithoutAddSet,
  rowDesignSet, tileDesignSet,
} from './page-sets.ts';
import type { PageSet } from '../web/src/builder/types.ts';

/**
 * Product parts and card designs, as a shopper meets them (spec 2026-09-30-product-parts §13):
 * rearranged product page, the menu sheet, the grid and list arrangements, compiled card designs
 * and their fallbacks, v0.7.0 documents, and wholesale ignoring an arrangement. Every case runs
 * against the mocked catalogue; product 101 has a photo, tiers, provenance and a curated upsell.
 */
const P = 101;
const NAME = 'Alpine Extract 10ml';

async function open(page: Page, layout: Layout, set: PageSet, path: string, tweakSettings?: InstallMocksOptions['tweakSettings'], width = 1280) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.clock.setFixedTime(FIXED_NOW);
  const mocks = await installMocks(page, { layout, session: true, pages: { [layout]: set }, tweakSettings });
  await page.goto(path);
  return mocks;
}

/** `a` precedes `b` in document order. */
async function precedes(a: Locator, b: Locator): Promise<boolean> {
  const bh = await b.elementHandle();
  return a.evaluate((el, other) => !!(el.compareDocumentPosition(other as Node) & Node.DOCUMENT_POSITION_FOLLOWING), bh);
}

const top = async (l: Locator) => (await l.boundingBox())!.y;

test.describe('product parts · product page', () => {
  test('a rearranged page: description above the price, a RichText after the add button, no upsells', async ({ page }) => {
    await open(page, 'storefront', productPartsSet('storefront'), `/p/${P}`);
    await expect(page.getByRole('heading', { name: NAME, level: 1 })).toBeVisible();
    const description = page.locator('[class*="description"]').first();
    const price = page.locator('[data-sf-part="price"]').first();
    await expect(description).toBeVisible();
    expect(await top(description)).toBeLessThan(await top(price));
    const note = page.getByText('Packed to order at Northbound Supply.');
    await expect(note).toBeVisible();
    expect(await precedes(page.getByRole('button', { name: /^Add · / }).first(), note)).toBe(true);
    expect(await precedes(note, page.locator('#bulk-heading'))).toBe(true);
    await expect(page.locator('#upsells-heading')).toHaveCount(0);
  });

  test('a document without the add button renders the default page', async ({ page }) => {
    await open(page, 'storefront', productWithoutAddSet(), `/p/${P}`);
    await expect(page.getByRole('heading', { name: NAME, level: 1 })).toBeVisible();
    await expect(page.locator('#upsells-heading')).toBeVisible();
    await expect(page.getByText('Packed to order at Northbound Supply.')).toHaveCount(0);
  });

  test('a v0.7.0 document (gallery and upsells off) has no media column and no upsells', async ({ page }) => {
    await open(page, 'storefront', legacyProductSet(), `/p/${P}`);
    await expect(page.getByRole('heading', { name: NAME, level: 1 })).toBeVisible();
    await expect(page.locator('[class*="layoutNoImage"]')).toHaveCount(1);
    await expect(page.locator('#upsells-heading')).toHaveCount(0);
  });
});

test.describe('product parts · menu sheet', () => {
  test('bulk pricing sits above the title and the pinned footer still adds to the cart', async ({ page }) => {
    const mocks = await open(page, 'menu', menuSheetSet('menu'), `/?p=${P}`);
    const sheet = page.locator('[data-sf-part="sheet"]');
    await expect(sheet).toBeVisible();
    const title = sheet.locator('[data-sf-part="sheet-title"]');
    await expect(title).toBeVisible();
    const bulk = sheet.getByRole('heading', { name: 'Buy more, pay less' });
    await expect(bulk).toBeVisible();
    expect(await precedes(bulk, title)).toBe(true);
    await sheet.getByRole('button', { name: /^Add · / }).first().click();
    await expect.poll(() => mocks.state.cart.itemCount).toBe(1);
  });
});

test.describe('product parts · catalogue arrangement', () => {
  test('a grid with search in the main column and no rail drops the nav column', async ({ page }) => {
    await open(page, 'storefront', gridArrangedSet(), '/');
    const layout = page.locator('[data-sf-part="product-grid"]').locator('xpath=ancestor::*[contains(@class,"layout")][1]');
    await expect(layout).toHaveAttribute('class', /noNav/);
    await expect(page.getByRole('textbox', { name: 'Search products' }).first()).toBeVisible();
    await expect(page.locator('[class*="layout"][class*="noNav"] nav')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Concentrates/ })).toHaveCount(0);
  });

  test('a list without the intro has no hero and still groups products', async ({ page }) => {
    await open(page, 'menu', listNoIntroSet('menu'), '/');
    await expect(page.getByRole('button', { name: NAME, exact: true })).toBeVisible();
    await expect(page.locator('[data-sf-slot="CatalogHero"]')).toHaveCount(0);
  });

  test('wholesale ignores the arrangement and shows the trade list', async ({ page }) => {
    await open(page, 'storefront', gridArrangedSet(), '/', (s) => { s.features.wholesale = true; });
    await expect(page.getByRole('heading', { name: 'Trade list', level: 1 })).toBeVisible();
    await expect(page.locator('[data-sf-part="product-grid"]')).toHaveCount(0);
  });
});

test.describe('product parts · card designs', () => {
  test('a tile design puts the price above the name in the grid, on a custom page and in page upsells', async ({ page }) => {
    const set = tileDesignSet('storefront');
    await open(page, 'storefront', set, '/');
    const grid = page.locator('[data-sf-part="product-grid"]');
    const card = grid.locator('[data-sf-part="product-card"]').first();
    await expect(card).toBeVisible();
    expect(await precedes(card.locator('[data-sf-part="price"]'), card.getByRole('link').last())).toBe(true);
    await expect(card.locator('[class*="flags"]')).toHaveCount(0);

    await page.goto('/pages/featured');
    const featured = page.locator('[data-sf-part="product-card"]').first();
    await expect(featured).toBeVisible();
    expect(await precedes(featured.locator('[data-sf-part="price"]'), featured.getByRole('link').last())).toBe(true);

    await page.goto(`/p/${P}`);
    const upsell = page.locator('#upsells-heading').locator('xpath=ancestor::section[1]').locator('[data-sf-part="product-card"]').first();
    await expect(upsell).toBeVisible();
    expect(await precedes(upsell.locator('[data-sf-part="price"]'), upsell.getByRole('link').last())).toBe(true);
  });

  test('a row design puts the price first in the list rows and in the sheet upsells', async ({ page }) => {
    await open(page, 'menu', rowDesignSet('menu'), '/');
    const row = page.locator('[data-sf-part="product-row"]').first();
    await expect(row).toBeVisible();
    expect(await precedes(row.locator('[data-sf-part="price"]'), row.getByRole('button').first())).toBe(true);

    await page.goto(`/?p=${P}`);
    const sheet = page.locator('[data-sf-part="sheet"]');
    const upsell = sheet.locator('[data-sf-part="product-row"]').first();
    await expect(upsell).toBeVisible();
    expect(await precedes(upsell.locator('[data-sf-part="price"]'), upsell.getByRole('button').first())).toBe(true);
  });

  test('a tile with an add button but no price falls back to the built-in card', async ({ page }) => {
    await open(page, 'storefront', brokenTileSet('storefront'), '/');
    const card = page.locator('[data-sf-part="product-card"]').first();
    await expect(card).toBeVisible();
    expect(await precedes(card.getByRole('link').last(), card.locator('[data-sf-part="price"]'))).toBe(true);
  });
});

// ---- the default catalogue document, published, through every catalogue state ------------------

type CatalogState = 'loading' | 'error' | 'empty' | 'imageless' | 'loaded';

/** Ids React and Mantine derive from render order, and CSS-module hashes, reduced to what is stable. */
const normalise = (html: string) => html
  .replace(/\b(id|for|aria-[a-z]+)="([^"]*)"/g, (_m, a: string, v: string) => `${a}="${v.replace(/(mantine-)[a-z0-9]{5,}/gi, '$1ID').replace(/«r[0-9a-z]+»|:r[0-9a-z]+:|_r_[0-9a-z]+_/g, 'RID')}"`)
  .replace(/(_[A-Za-z][\w-]*?)_[a-z0-9]{5}_\d+(?![\w-])/g, '$1_H')
  .replace(/></g, '>\n<');

async function catalogueDom(page: Page, layout: Layout, state: CatalogState, published: boolean): Promise<string> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.setFixedTime(FIXED_NOW);
  const base = readFileSync(new URL('./fixtures/catalog.json', import.meta.url), 'utf8');
  const catalog = JSON.parse(base) as { products: Array<Record<string, unknown>>; categories: unknown[] };
  if (state === 'empty') catalog.products = [];
  if (state === 'imageless') catalog.products = catalog.products.map((p) => ({ ...p, imageProductId: null }));
  const set = published ? catalogDefaultSet(layout) : null;
  await installMocks(page, { layout, session: true, catalog: catalog as never, pages: { [layout]: set } });
  if (state === 'loading') await page.route(/\/api\/(storefront\/)?catalog$/, () => new Promise(() => {}));
  if (state === 'error') await page.route(/\/api\/(storefront\/)?catalog$/, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, data: null, error: 'BOOM' }) }));
  await page.goto('/');
  if (state === 'loading') {
    await expect(page.getByRole('status', { name: 'Loading' }).first()).toBeVisible();
  } else {
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('status', { name: 'Loading' })).toHaveCount(0);
  }
  await page.waitForTimeout(600);
  return normalise(await page.evaluate(() => {
    const main = (document.querySelector('main') ?? document.body).cloneNode(true) as HTMLElement;
    main.querySelectorAll('script, style').forEach((el) => el.remove());
    return main.innerHTML;
  }));
}

test.describe('product parts · the published default catalogue document equals the built-in page', () => {
  for (const layout of ['storefront', 'menu'] as const) {
    for (const state of ['loading', 'error', 'empty', 'imageless', 'loaded'] as const) {
      test(`${layout} · ${state}`, async ({ page, browser }) => {
        const built = await catalogueDom(page, layout, state, false);
        const other = await browser.newPage();
        try {
          const published = await catalogueDom(other, layout, state, true);
          expect(published.length).toBeGreaterThan(200);
          expect(published).toBe(built);
        } finally {
          await other.close();
        }
      });
    }
  }
});

// ---- no overflow at 360 px under every built-in template -------------------------------------

const TEMPLATES = [
  { template: 'modern', preset: 'default' },
  { template: 'dark-luxury', preset: 'gold' },
  { template: 'cyber-brutalism', preset: 'acid-dark' },
  { template: 'bento', preset: 'tech-dark' },
];

test('every template in the catalog is covered by the overflow matrix', async ({ page }) => {
  const res = await page.request.get('/templates.json');
  const ids = ((await res.json()) as { templates: Array<{ id: string }> }).templates.map((t) => t.id);
  expect(ids.filter((id) => !TEMPLATES.some((t) => t.template === id))).toEqual([]);
});

for (const t of TEMPLATES) {
  const scenarios: Array<{ name: string; layout: Layout; set: () => PageSet; path: string }> = [
    { name: 'rearranged product page', layout: 'storefront', set: () => productPartsSet('storefront'), path: `/p/${P}` },
    { name: 'menu sheet', layout: 'menu', set: () => menuSheetSet('menu'), path: `/?p=${P}` },
    { name: 'arranged grid', layout: 'storefront', set: () => gridArrangedSet(), path: '/' },
    { name: 'tile design', layout: 'storefront', set: () => tileDesignSet('storefront'), path: '/' },
    { name: 'tile design on the product page', layout: 'storefront', set: () => tileDesignSet('storefront'), path: `/p/${P}` },
    { name: 'row design', layout: 'menu', set: () => rowDesignSet('menu'), path: '/' },
  ];
  for (const s of scenarios) {
    test(`${t.template}/${t.preset} · ${s.name} · 360px has no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.clock.setFixedTime(FIXED_NOW);
      await installMocks(page, { layout: s.layout, session: true, pages: { [s.layout]: s.set() }, tweakSettings: await presetTheme(page, t.template, t.preset) });
      await page.goto(s.path);
      await expect(page.locator('html')).toHaveAttribute('data-sf-template', t.template);
      await expect(page.locator('[data-sf-part="sheet"], [data-sf-part="product-card"], [data-sf-part="product-row"], #bulk-heading, h1').first()).toBeVisible();
      await page.waitForTimeout(400);
      const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
      expect(o.sw, `overflow: ${s.name}`).toBeLessThanOrEqual(360);
    });
  }
}
