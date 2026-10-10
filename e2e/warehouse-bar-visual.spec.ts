import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { installMocks, type InstallMocksOptions, type Layout } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';

/**
 * The pinned warehouse bar after a scroll, for a visual review. Only runs when asked, and writes outside the repo:
 * `WAREHOUSE_BAR_SHOTS=<output dir> TZ=UTC npx playwright test -c e2e/playwright.config.ts e2e/warehouse-bar-visual.spec.ts`
 * Synthetic data only.
 */
const OUT = process.env.WAREHOUSE_BAR_SHOTS ?? '';
test.skip(!OUT, 'set WAREHOUSE_BAR_SHOTS to an output directory to capture the pinned warehouse bar');

const LIST = [
  { id: 1, name: 'Main Warehouse', country: 'GB', isDefault: true },
  { id: 2, name: 'Test EU Warehouse', country: 'DE', isDefault: false },
];
const OPEN: NonNullable<InstallMocksOptions['warehouses']> = { list: LIST, carries: { 2: [102, 104] } };
const PAUSED: NonNullable<InstallMocksOptions['warehouses']> = {
  ...OPEN,
  list: [LIST[0]!, { ...LIST[1]!, orderingEnabled: false, orderingMessage: 'Test EU Warehouse is taking a short break while we restock. You can keep browsing, and orders open again on Monday morning.' }],
};

interface Case { name: string; layout: Layout; width: number; height: number; warehouses: NonNullable<InstallMocksOptions['warehouses']>; paused: boolean; path: string }
const CASES: Case[] = [
  { name: 'storefront-desktop-selector', layout: 'storefront', width: 1280, height: 520, warehouses: OPEN, paused: false, path: '/' },
  { name: 'storefront-phone-selector', layout: 'storefront', width: 390, height: 640, warehouses: OPEN, paused: false, path: '/' },
  { name: 'storefront-desktop-paused', layout: 'storefront', width: 1280, height: 520, warehouses: PAUSED, paused: true, path: '/' },
  { name: 'storefront-phone-paused', layout: 'storefront', width: 390, height: 640, warehouses: PAUSED, paused: true, path: '/' },
  { name: 'storefront-product-paused', layout: 'storefront', width: 1280, height: 640, warehouses: PAUSED, paused: true, path: '/p/102' },
  { name: 'menu-phone-paused', layout: 'menu', width: 390, height: 640, warehouses: PAUSED, paused: true, path: '/' },
  { name: 'webapp-phone-selector', layout: 'webapp', width: 390, height: 640, warehouses: OPEN, paused: false, path: '/' },
];

for (const c of CASES) {
  test(c.name, async ({ page }) => {
    await page.setViewportSize({ width: c.width, height: c.height });
    await page.clock.setFixedTime(FIXED_NOW);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installMocks(page, { layout: c.layout, warehouses: c.warehouses });
    await page.goto('/');
    await expect(page.locator('[data-warehouse-picker]')).toBeVisible();
    if (c.paused) {
      await page.locator('[data-warehouse-picker] select').selectOption('2');
      await expect(page.locator('[data-warehouse-paused]')).toBeVisible();
    }
    if (c.path !== '/') {
      await page.goto(c.path);
      await expect(page.locator('[data-warehouse-picker]')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, Math.floor((document.documentElement.scrollHeight - window.innerHeight) / 2)));
    await page.waitForTimeout(200);
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: resolve(OUT, `${c.name}.png`), animations: 'disabled', caret: 'hide' });
  });
}
