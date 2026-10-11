import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { installMocks, type InstallMocksOptions, type Layout } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';

/**
 * Screenshots for a visual review of the paused-warehouse price, the warehouse chooser cards and the checkout's last-order
 * offer, at 390px and desktop. Only runs when asked, and writes outside the repo:
 * `UX_SHOTS=<output dir> TZ=UTC npx playwright test -c e2e/playwright.config.ts e2e/catalog-chooser-checkout-visual.spec.ts`
 * Synthetic data only.
 */
const OUT = process.env.UX_SHOTS ?? '';
test.skip(!OUT, 'set UX_SHOTS');
const LIST = [
  { id: 1, name: 'Main Warehouse', country: 'GB', isDefault: true },
  { id: 2, name: 'Test EU Warehouse', country: 'DE', isDefault: false },
];
const PAUSED: NonNullable<InstallMocksOptions['warehouses']> = {
  carries: { 2: [102, 104] },
  list: [LIST[0]!, { ...LIST[1]!, orderingEnabled: false, orderingMessage: 'Back Monday' }],
};
const OPEN: NonNullable<InstallMocksOptions['warehouses']> = { carries: { 2: [102, 104] }, list: LIST };
const TAG = 'shot';
for (const layout of ['menu', 'webapp', 'storefront'] as Layout[]) {
  for (const [w, h, label] of [[390, 800, 'm'], [1280, 800, 'd']] as const) {
    for (const [state, wh] of [['paused', PAUSED], ['live', OPEN]] as const) {
      test(`${TAG}-${layout}-${label}-${state}`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h });
        await page.clock.setFixedTime(FIXED_NOW);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await installMocks(page, { layout, warehouses: wh });
        await page.goto('/');
        await expect(page.locator('[data-warehouse-picker]')).toBeVisible();
        await page.locator('[data-warehouse-picker] select').selectOption('2');
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(400);
        const first = page.locator('[data-sf-part="product-card"], [data-sf-part="product-row"]').first();
        if (await first.count()) { await first.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -120)); await page.waitForTimeout(200); }
        mkdirSync(OUT, { recursive: true });
        await page.screenshot({ path: resolve(OUT, `${TAG}-${layout}-${label}-${state}.png`), animations: 'disabled', caret: 'hide', fullPage: true });
      });
    }
  }
}

// The choose-a-warehouse page: cards with and without a description side by side (one paused, one at the 160-character cap).
const LONG = 'Our partner site in the Rhine valley: parcels leave the same working day when ordered before noon, with a tracked and insured service across the EU and a named contact if anything goes astray.';
const CHOOSER: NonNullable<InstallMocksOptions['warehouses']> = {
  carries: { 2: [102, 104] },
  prompt: true,
  list: [
    { id: 1, name: 'Main Warehouse', country: 'GB', isDefault: true },
    { id: 2, name: 'Test EU Warehouse', country: 'DE', isDefault: false, description: 'Ships from Berlin in 2 to 4 working days. Tracked and insured.' },
    { id: 3, name: 'Test Rhine Warehouse', country: 'DE', isDefault: false, description: LONG.slice(0, 160).replace(/\s+\S*$/, ''), orderingEnabled: false, orderingMessage: 'Back Monday' },
  ],
};
for (const [w, h, label] of [[390, 844, 'm'], [1280, 800, 'd']] as const) {
  test(`${TAG}-chooser-${label}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.clock.setFixedTime(FIXED_NOW);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installMocks(page, { layout: 'storefront', warehouses: CHOOSER });
    await page.goto('/');
    await expect(page.locator('[data-warehouse-prompt]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: resolve(OUT, `${TAG}-chooser-${label}.png`), animations: 'disabled', caret: 'hide', fullPage: true });
  });
}

// The checkout's first step: with the route absent (an older backend) this is the "before"; with details it is the offer.
for (const [w, h, label] of [[390, 844, 'm'], [1280, 900, 'd']] as const) {
  test(`${TAG}-checkout-${label}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.clock.setFixedTime(FIXED_NOW);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const mocks = await installMocks(page, { layout: 'storefront', session: true,
      lastDetails: { orderReference: 'E2E0', placedAt: '2026-08-01T10:00:00.000Z', firstName: 'Alex', surname: 'Rowan', addressLine1: '14 Test Lane', addressLine2: 'Flat 2', addressLine3: null, city: 'Leeds', county: null, zip: 'LS1 4AB', country: 'GB', email: 'alex@example.invalid', phone: '+447700900123', servicePoint: null } });
    mocks.state.cart = { items: [{ productId: 101, name: 'Alpine Extract 10ml', quantity: 1, unitPrice: 42.5, lineTotal: 42.5, imageUrl: null, isPreorder: false, outOfStock: false, priceChanged: false, inactive: false, belowMin: false, aboveMax: false, minOrderQuantity: null, maxOrderQuantity: null }], subtotal: 42.5, itemCount: 1 };
    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: resolve(OUT, `${TAG}-checkout-${label}.png`), animations: 'disabled', caret: 'hide' });
  });
}
