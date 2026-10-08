import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { installMocks, type Layout } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import { presetTheme } from './template-theme.ts';
import type { Catalog, ProductCoa } from '../web/src/types/catalog.ts';

/**
 * The product page and sheet for a visual review of the call-to-action buttons, the name-to-price gap and the
 * lab report's place: screenshots plus a measurement of the Add to cart and View report buttons and of the
 * name-to-price gap, written next to them as JSON. Only runs when asked, and writes outside the repo:
 * `POLISH_SHOTS=<output dir> TZ=UTC npx playwright test -c e2e/playwright.config.ts e2e/product-polish-visual.spec.ts`
 * Synthetic data only.
 */
const OUT = process.env.POLISH_SHOTS ?? '';
test.skip(!OUT, 'set POLISH_SHOTS to an output directory to capture the product polish screenshots');

const P = 101;
const COA: ProductCoa = { id: 1, lab: 'Example Labs', sampleName: 'Alpine Extract', mgAmount: 10, purity: 99.957, batch: 'B-2409', testDate: '12 March 2026', reportUrl: 'https://example.com/report/1', fileKey: null };

interface Case { template: string; preset: string; layout: Layout; width: number; height: number; surface: 'page' | 'sheet' }
const BENTO = { template: 'bento', preset: 'tech-light' };
const OTHERS: Array<[string, string]> = [['modern', ''], ['dark-luxury', ''], ['cyber-brutalism', '']];
const CASES: Case[] = [
  { ...BENTO, layout: 'storefront', width: 390, height: 844, surface: 'page' },
  { ...BENTO, layout: 'storefront', width: 1366, height: 768, surface: 'page' },
  { ...BENTO, layout: 'storefront', width: 1920, height: 1080, surface: 'page' },
  { ...BENTO, layout: 'menu', width: 390, height: 844, surface: 'sheet' },
  { ...BENTO, layout: 'menu', width: 1366, height: 768, surface: 'sheet' },
  { ...BENTO, layout: 'webapp', width: 390, height: 844, surface: 'sheet' },
  ...OTHERS.flatMap(([template, preset]) => [390, 1366].map((width): Case => ({ template, preset, layout: 'storefront', width, height: width === 390 ? 844 : 768, surface: 'page' }))),
];

interface CatalogJson { templates: Array<{ id: string; presets: Array<{ id: string; scheme: 'dark' | 'light' }> }> }

function catalog(): Catalog {
  const c = JSON.parse(readFileSync(new URL('./fixtures/catalog.json', import.meta.url), 'utf8')) as Catalog;
  const p = c.products.find((x) => x.id === P)!;
  p.coas = [COA];
  p.description = 'A cold-pressed alpine extract, bottled in amber glass.\n\n**Keep cool** and out of direct light.';
  return c;
}

/** The two buttons' type, the name-to-price gap and where the report sits, read from the live page. */
async function measure(page: Page, surface: 'page' | 'sheet') {
  return page.evaluate((s) => {
    const root = (s === 'sheet' ? document.querySelector('[role="dialog"]') : document.querySelector('article')) ?? document.body;
    const buttonByText = (re: RegExp) =>
      [...root.querySelectorAll<HTMLElement>('[data-sf-part="button"]')].find((e) => re.test(e.textContent ?? '') || re.test(e.getAttribute('aria-label') ?? ''));
    const type = (e: HTMLElement | undefined) => {
      if (!e) return null;
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return { family: cs.fontFamily.split(',')[0], size: cs.fontSize, weight: cs.fontWeight, tracking: cs.letterSpacing, transform: cs.textTransform, height: Math.round(r.height * 10) / 10, top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY) };
    };
    const name = root.querySelector<HTMLElement>('[data-sf-part="page-title"], [data-sf-part="sheet-title"]');
    const price = root.querySelector<HTMLElement>('[data-sf-part="price"]');
    const stock = price?.nextElementSibling as HTMLElement | null;
    const add = buttonByText(/add|in cart|^group/i);
    const report = buttonByText(/report|example labs/i);
    const gap = (a: Element | null | undefined, b: Element | null | undefined) =>
      a && b ? Math.round((b.getBoundingClientRect().top - a.getBoundingClientRect().bottom) * 10) / 10 : null;
    const img = root.querySelector<HTMLElement>('img');
    const card = root.querySelector<HTMLElement>('#coa-heading')?.parentElement ?? null;
    const rect = (e: Element | null | undefined) => (e ? { top: Math.round(e.getBoundingClientRect().top), bottom: Math.round(e.getBoundingClientRect().bottom), left: Math.round(e.getBoundingClientRect().left), width: Math.round(e.getBoundingClientRect().width) } : null);
    return {
      add: type(add), report: type(report), nameToPrice: gap(name, price), priceToStock: gap(price, stock), priceToButton: gap(price, add),
      img: rect(img), coaCard: rect(card), viewport: { w: innerWidth, h: innerHeight },
      ids: document.querySelectorAll('#coa-heading').length,
      reportInView: report ? report.getBoundingClientRect().bottom <= innerHeight : null,
    };
  }, surface);
}

for (const c of CASES) {
  test(`${c.template} · ${c.layout} · ${c.width}x${c.height} · ${c.surface}`, async ({ page }) => {
    const res = await page.request.get('/templates.json');
    const presets = ((await res.json()) as CatalogJson).templates.find((t) => t.id === c.template)?.presets ?? [];
    const preset = c.preset || presets.find((p) => p.scheme === 'light')?.id || presets[0]!.id;
    expect(presets.some((p) => p.id === preset)).toBe(true);

    await page.setViewportSize({ width: c.width, height: c.height });
    await page.clock.setFixedTime(FIXED_NOW);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const tweakSettings = await presetTheme(page, c.template, preset, { showSku: false });
    await installMocks(page, { layout: c.layout, session: true, tweakSettings, catalog: catalog() });
    await page.goto(c.layout === 'storefront' ? `/p/${P}` : `/?p=${P}`);

    await expect(page.getByRole('heading', { name: 'Certificate of analysis' })).toBeVisible();
    if (c.surface === 'sheet') await expect(page.locator('[data-sf-part="sheet-title"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const m = { ...(await measure(page, c.surface)), stepper: null as unknown };
    if (c.surface === 'page') expect(m.ids, 'one coa heading').toBe(1);

    mkdirSync(OUT, { recursive: true });
    const name = `${c.template}-${preset}-${c.layout}-${c.width}x${c.height}-${c.surface}`;
    await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: false, animations: 'disabled', caret: 'hide' });
    if (c.surface === 'page') await page.screenshot({ path: resolve(OUT, `${name}-full.png`), fullPage: true, animations: 'disabled', caret: 'hide' });
    // Once the product is in the cart the same control becomes the stepper: its type and height are measured too.
    await page.evaluate((s) => {
      const root = (s === 'sheet' ? document.querySelector('[role="dialog"]') : document.querySelector('article')) ?? document.body;
      [...root.querySelectorAll<HTMLElement>('[data-sf-part="button"]')].find((e) => /^add/i.test(e.textContent ?? ''))?.click();
    }, c.surface);
    await expect(page.getByText(/in cart/i).first()).toBeVisible();
    m.stepper = (await measure(page, c.surface)).add;
    await page.mouse.move(0, 0);
    writeFileSync(resolve(OUT, `${name}.json`), JSON.stringify(m, null, 2));
    console.log(`MEASURE ${name} ${JSON.stringify(m)}`);
  });
}
