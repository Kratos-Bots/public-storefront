import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { installMocks, installTelegramStub, type Layout } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import { presetTheme } from './template-theme.ts';

/**
 * The web app's running-tab bar for a visual review, against the mobile storefront's own bar: the catalogue and a
 * product with two items in the cart, (a) inside Telegram with a 34px home indicator, (b) the web app layout in a
 * browser tab, (c) the mobile storefront for comparison. Screenshots plus the bar's measurements as JSON, written
 * outside the repo, and only when asked:
 * `CARTBAR_SHOTS=<output dir> TZ=UTC npx playwright test -c e2e/playwright.config.ts e2e/webapp-cart-bar-visual.spec.ts`
 * Synthetic data only.
 */
const OUT = process.env.CARTBAR_SHOTS ?? '';
test.skip(!OUT, 'set CARTBAR_SHOTS to an output directory to capture the cart bar screenshots');

const LINE = {
  productId: 101, displayName: 'Alpine Extract 10ml', sku: 'ALP-10', unitPrice: 42.5, basePrice: 42.5, pricingTiers: [], quantity: 2,
  isPreorder: false, excludedFromFreeShipping: false, imageProductId: null,
};

type Mode = 'telegram' | 'browser-webapp' | 'mobile-web';
const MODES: Mode[] = ['telegram', 'browser-webapp', 'mobile-web'];
const THEMES: Array<[string, string]> = [['bento', 'tech-light'], ['bento', 'tech-dark'], ['modern', '']];

interface CatalogJson { templates: Array<{ id: string; presets: Array<{ id: string; scheme: 'dark' | 'light' }> }> }

async function barMetrics(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('[data-sf-part="cart-bar"]');
    if (!bar) return null;
    const r = bar.getBoundingClientRect();
    const cs = getComputedStyle(bar);
    const checkout = bar.querySelector<HTMLElement>('[data-sf-cta="main"]')!.getBoundingClientRect();
    return {
      top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), paddingBottom: cs.paddingBottom,
      checkout: { left: Math.round(checkout.left), width: Math.round(checkout.width), height: Math.round(checkout.height) },
      shellPaddingBottom: document.querySelector('[data-sf-layout]') ? getComputedStyle(document.querySelector('[data-sf-layout]')!).paddingBottom : null,
      scrollPaddingBottom: getComputedStyle(document.documentElement).scrollPaddingBottom,
    };
  });
}

for (const [template, presetWanted] of THEMES) {
  for (const mode of MODES) {
    test(`${template}${presetWanted ? `/${presetWanted}` : ''} · ${mode}`, async ({ page }) => {
      const res = await page.request.get('/templates.json');
      const presets = ((await res.json()) as CatalogJson).templates.find((t) => t.id === template)?.presets ?? [];
      const preset = presetWanted || presets.find((p) => p.scheme === 'light')?.id || presets[0]!.id;
      expect(presets.some((p) => p.id === preset)).toBe(true);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.clock.setFixedTime(FIXED_NOW);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      if (mode === 'telegram') {
        await installTelegramStub(page);
        await page.addInitScript(() => { (window as unknown as { Telegram: { WebApp: { safeAreaInset: { bottom: number } } } }).Telegram.WebApp.safeAreaInset.bottom = 34; });
      }
      await page.addInitScript((line) => {
        window.localStorage.setItem('sf-cart-v1', JSON.stringify({ state: { lines: [line] }, version: 0 }));
      }, LINE);
      const layout: Layout = mode === 'mobile-web' ? 'storefront' : mode === 'telegram' ? 'storefront' : 'webapp';
      const tweakSettings = await presetTheme(page, template, preset, { showSku: false });
      await installMocks(page, { layout, session: false, tweakSettings });

      mkdirSync(OUT, { recursive: true });
      const base = `${template}-${preset}-${mode}`;
      const metrics: Record<string, unknown> = {};

      await page.goto('/');
      await expect(page.locator('[data-sf-part="cart-bar"]')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      metrics.catalogue = await barMetrics(page);
      await page.screenshot({ path: resolve(OUT, `${base}-catalogue.png`), animations: 'disabled', caret: 'hide' });

      if (mode === 'mobile-web') await page.goto('/p/101');
      else await page.goto('/?p=101');
      if (mode === 'mobile-web') {
        await expect(page.getByRole('heading', { name: 'Alpine Extract 10ml', level: 1 })).toBeVisible();
        await expect(page.locator('[data-sf-part="cart-bar"]')).toBeVisible();
      } else {
        // The product opens as a sheet with its own Add to cart; the running tab steps aside under it.
        await expect(page.locator('[data-sf-part="sheet-title"]')).toBeVisible();
        await expect(page.locator('[data-sf-part="cart-bar"]')).toHaveCount(0);
      }
      await page.evaluate(() => document.fonts.ready);
      metrics.product = await barMetrics(page);
      await page.screenshot({ path: resolve(OUT, `${base}-product.png`), animations: 'disabled', caret: 'hide' });

      if (mode !== 'mobile-web') {
        await page.getByRole('button', { name: 'Close' }).first().click();
        await expect(page.locator('[data-sf-part="cart-bar"]')).toBeVisible();
        metrics.afterSheet = await barMetrics(page);
        await page.screenshot({ path: resolve(OUT, `${base}-after-sheet.png`), animations: 'disabled', caret: 'hide' });
      }
      writeFileSync(resolve(OUT, `${base}.json`), JSON.stringify(metrics, null, 2));
      console.log(`MEASURE ${base} ${JSON.stringify(metrics)}`);
    });
  }
}
