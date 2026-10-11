import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { installMocks, installTelegramStub, type Layout } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import { presetTheme } from './template-theme.ts';
import type { PublicReview } from '../web/src/types/reviews.ts';

/**
 * The phone bottom navigation for a visual review: the catalogue (empty cart and with items), the wholesale catalogue
 * with items, the cart, the reviews page and the support page, in the three layouts under cyber-brutalism and one light
 * template, at 390 and 1280. Written outside the repo, and only when asked:
 * `NAV_SHOTS=<output dir> TZ=UTC npx playwright test -c e2e/playwright.config.ts e2e/bottom-nav-visual.spec.ts`
 * Synthetic data only.
 */
const OUT = process.env.NAV_SHOTS ?? '';
test.skip(!OUT, 'set NAV_SHOTS to an output directory to capture the bottom navigation screenshots');

const LINE = {
  productId: 101, displayName: 'Alpine Extract 10ml', sku: 'ALP-10', unitPrice: 42.5, basePrice: 42.5, pricingTiers: [], quantity: 2,
  isPreorder: false, excludedFromFreeShipping: false, imageProductId: null,
};
const THEMES: Array<[string, string]> = [['cyber-brutalism', 'acid-dark'], ['modern', 'default'], ['bento', 'tech-light']];
const LAYOUTS: Layout[] = ['storefront', 'menu', 'webapp'];
const LIST: PublicReview[] = [5, 4, 5, 3, 5, 4].map((rating, i) => ({
  id: 100 - i, rating, comment: i % 2 ? null : 'Arrived in two days, well packed and exactly as described.', createdAt: `2026-08-${String(20 - i).padStart(2, '0')}T09:00:00.000Z`,
}));

const shot = (page: Page, name: string) => page.screenshot({ path: resolve(OUT, `${name}.png`), animations: 'disabled', caret: 'hide' });

for (const [template, preset] of THEMES) {
  for (const layout of LAYOUTS) {
    for (const width of [390, 1280] as const) {
      const base = `${template}-${layout}-${width}`;
      const start = async (page: Page, cart: boolean, wholesale = false, navOff = false) => {
        mkdirSync(OUT, { recursive: true });
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
        await page.clock.setFixedTime(FIXED_NOW);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        if (cart) await page.addInitScript((line) => window.localStorage.setItem('sf-cart-v1', JSON.stringify({ state: { lines: [line] }, version: 0 })), LINE);
        const theme = await presetTheme(page, template, preset);
        await installMocks(page, {
          layout, session: false, reviews: { list: LIST },
          tweakSettings: (s) => {
            theme(s);
            s.features.wholesale = wholesale;
            if (navOff) s.theme = { ...s.theme, options: { ...s.theme.options, showMobileBottomNav: false } };
          },
        });
      };

      test(`${base} catalogue, empty cart`, async ({ page }) => {
        await start(page, false);
        await page.goto('/');
        await expect(page.locator('[data-sf-part="product-row"], [data-sf-part="product-card"]').first()).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await shot(page, `${base}-catalogue-empty`);
      });

      test(`${base} catalogue, with items`, async ({ page }) => {
        await start(page, true);
        await page.goto('/');
        await expect(page.locator('[data-sf-part="product-row"], [data-sf-part="product-card"]').first()).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await shot(page, `${base}-catalogue-items`);
      });

      test(`${base} wholesale catalogue, with items`, async ({ page }) => {
        await start(page, true, true);
        await page.goto('/');
        await expect(page.locator('tr, [data-sf-part="product-row"]').first()).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await shot(page, `${base}-wholesale-items`);
      });

      test(`${base} cart`, async ({ page }) => {
        await start(page, true);
        await page.goto('/cart');
        await expect(page.getByText('Alpine Extract 10ml').first()).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await shot(page, `${base}-cart`);
      });

      test(`${base} reviews`, async ({ page }) => {
        await start(page, false);
        await page.goto('/reviews');
        await expect(page.getByText('Arrived in two days').first()).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await shot(page, `${base}-reviews`);
      });

      test(`${base} bar off, Reviews in the header`, async ({ page }) => {
        await start(page, false, false, true);
        await page.goto('/');
        await expect(page.locator('[data-sf-part="header"]').getByRole('link', { name: 'Reviews' })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await shot(page, `${base}-header-reviews`);
      });

      test(`${base} support`, async ({ page }) => {
        await start(page, false);
        await page.goto('/support');
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await shot(page, `${base}-support`);
      });
    }
  }
}

// The owner's own case: wholesale, inside the Telegram Mini App, on a phone with a 34px home indicator.
for (const [template, preset] of [['cyber-brutalism', 'acid-dark'], ['bento', 'tech-light']] as const) {
  test(`${template} inside Telegram, wholesale, items in the cart, 390`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(FIXED_NOW);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installTelegramStub(page);
    await page.addInitScript(() => { (window as unknown as { Telegram: { WebApp: { safeAreaInset: { bottom: number } } } }).Telegram.WebApp.safeAreaInset.bottom = 34; });
    await page.addInitScript((line) => window.localStorage.setItem('sf-cart-v1', JSON.stringify({ state: { lines: [line] }, version: 0 })), LINE);
    const theme = await presetTheme(page, template, preset);
    const mocks = await installMocks(page, { layout: 'menu', session: false, reviews: { list: LIST }, tweakSettings: (s) => { theme(s); s.features.wholesale = true; } });
    // Inside Telegram the cart is the server's, not the browser's.
    mocks.state.cart = {
      items: [{
        productId: 101, name: 'Alpine Extract 10ml', quantity: 2, unitPrice: 42.5, lineTotal: 85, imageUrl: null, isPreorder: false,
        outOfStock: false, priceChanged: false, inactive: false, belowMin: false, aboveMax: false, minOrderQuantity: null, maxOrderQuantity: null,
      }],
      subtotal: 85, itemCount: 2,
    };
    await page.goto('/');
    await expect(page.locator('[data-sf-part="bottom-nav"]')).toBeVisible();
    // Inside Telegram the cart's way in is the native main button, outside the page: the bottom bar is all that is at the foot.
    await expect(page.locator('tr').nth(2)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await shot(page, `telegram-${template}-390-wholesale-items`);
  });
}
