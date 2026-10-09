import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { installMocks, type Layout } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import { presetTheme } from './template-theme.ts';

/**
 * The catalogue top with the warehouse picker (closed), for a visual review: layouts storefront, menu and webapp,
 * templates bento, modern, cyber-brutalism and a dark preset, at phone and desktop widths. Only runs when asked,
 * and writes outside the repo:
 * `WAREHOUSE_SHOTS=<output dir> TZ=UTC npx playwright test -c e2e/playwright.config.ts e2e/warehouse-visual.spec.ts`
 * Synthetic data only.
 */
const OUT = process.env.WAREHOUSE_SHOTS ?? '';
test.skip(!OUT, 'set WAREHOUSE_SHOTS to an output directory to capture the warehouse picker screenshots');

const WAREHOUSES = {
  list: [
    { id: 1, name: 'Main Warehouse', country: 'GB', isDefault: true },
    { id: 2, name: 'Test EU Warehouse', country: 'DE', isDefault: false },
  ],
  carries: { 2: [102, 104] },
};

interface Case { template: string; scheme: 'light' | 'dark'; layout: Layout; width: number; height: number }
const WIDTHS: Array<[number, number]> = [[360, 740], [390, 844], [1366, 768]];
const CASES: Case[] = [
  ...(['storefront', 'menu', 'webapp'] as Layout[]).flatMap((layout) => WIDTHS.map(([width, height]): Case => ({ template: 'bento', scheme: 'light', layout, width, height }))),
  ...(['modern', 'cyber-brutalism'] as const).flatMap((template) => WIDTHS.map(([width, height]): Case => ({ template, scheme: 'light', layout: 'storefront', width, height }))),
  ...(['bento', 'dark-luxury'] as const).flatMap((template) => WIDTHS.map(([width, height]): Case => ({ template, scheme: 'dark', layout: 'storefront', width, height }))),
  ...WIDTHS.map(([width, height]): Case => ({ template: 'cyber-brutalism', scheme: 'dark', layout: 'menu', width, height })),
];

for (const c of CASES) {
  test(`${c.template} ${c.scheme} · ${c.layout} · ${c.width}`, async ({ page }) => {
    const res = await page.request.get('/templates.json');
    const presets = ((await res.json()) as { templates: Array<{ id: string; presets: Array<{ id: string; scheme: 'dark' | 'light' }> }> }).templates.find((t) => t.id === c.template)?.presets ?? [];
    const preset = presets.find((p) => p.scheme === c.scheme)?.id ?? presets[0]!.id;
    await page.setViewportSize({ width: c.width, height: c.height });
    await page.clock.setFixedTime(FIXED_NOW);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const tweakSettings = await presetTheme(page, c.template, preset);
    await installMocks(page, { layout: c.layout, warehouses: WAREHOUSES, tweakSettings });
    await page.goto('/');
    await expect(page.locator('[data-warehouse-picker]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: resolve(OUT, `${c.template}-${preset}-${c.layout}-${c.width}.png`), animations: 'disabled', caret: 'hide' });
  });
}
