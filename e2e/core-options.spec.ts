import { expect, test, type Page } from '@playwright/test';
import { installMocks } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';

/** The core template options (define.ts CORE_OPTIONS) hide the page title and the catalogue intro;
 *  the h1 must stay in the accessibility tree. The web app shell at phone width is where the
 *  space matters most. */
async function openWebapp(page: Page, wholesale: boolean) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(FIXED_NOW);
  await installMocks(page, {
    layout: 'webapp',
    tweakSettings: (s) => {
      s.features.wholesale = wholesale;
      s.theme = { ...s.theme, options: { showPageTitle: false, showCatalogIntro: false } };
    },
  });
  await page.goto('/');
  await expect(page.locator('[data-sf-layout="webapp"]')).toBeVisible();
}

for (const [wholesale, title, rowPart] of [[true, 'Trade list', 'tr'], [false, 'All products', '[data-sf-part="product-row"]']] as const) {
  test(`web app, wholesale ${wholesale ? 'on' : 'off'}: page title and intro hidden, heading still announced`, async ({ page }) => {
    await openWebapp(page, wholesale);
    await expect(page.locator(rowPart).first()).toBeVisible();
    const h1 = page.getByRole('heading', { name: title, level: 1 });
    await expect(h1).toHaveCount(1);
    // Visually hidden, not display:none — Playwright counts a 1×1 clipped box as "visible", so the
    // check is the box itself: nothing a shopper can see, still an h1 for screen readers.
    const box = await h1.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(1);
    expect(box!.height).toBeLessThanOrEqual(1);
    expect(await h1.evaluate((el) => getComputedStyle(el).clipPath)).toBe('inset(50%)');
    await expect(page.getByText("Today's list. Tap a line for the detail.")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
