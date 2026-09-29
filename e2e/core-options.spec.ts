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

/** v0.6.0 display options: a pinned, non-dismissible notice rides the sticky header, and the
 *  sticky category rules come to rest under it rather than behind it. */
test('menu, phone: a pinned notice stays on screen and the category rule rests below it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 520 });
  await page.clock.setFixedTime(FIXED_NOW);
  await installMocks(page, {
    layout: 'menu',
    tweakSettings: (s) => {
      s.notices = [
        ...s.notices,
        { id: 'pinned-holiday', style: 'warning', title: null, body: 'Closed Monday for the bank holiday.', startsAt: null, endsAt: null, active: true, pinned: true, dismissible: false },
      ];
    },
  });
  await page.goto('/');
  const pinned = page.locator('[data-sf-part="pinned-notices"]');
  await expect(pinned).toBeVisible();
  await expect(pinned.getByRole('button', { name: /Dismiss/ })).toHaveCount(0);
  // The ordinary notice still sits under the header and scrolls away.
  await expect(page.getByRole('complementary', { name: 'Store notices', exact: true })).toBeVisible();

  await page.mouse.wheel(0, 2000);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  const box = await pinned.boundingBox();
  expect(box!.y).toBeLessThanOrEqual(1);
  const headerBottom = await page.locator('[data-sf-part="header"]').evaluate((el) => el.getBoundingClientRect().bottom);
  const stuck = await page.locator('[data-sf-part="group-title"]').evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().top).filter((top) => top >= 0 && top < 400),
  );
  expect(Math.min(...stuck)).toBeGreaterThanOrEqual(headerBottom - 1);
  if (process.env.SF_SHOT_DIR) await page.screenshot({ path: `${process.env.SF_SHOT_DIR}/pinned-scrolled.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('menu, phone: product codes, category picker, account icon and cut-off countdown off; cart icon desktop-only', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(FIXED_NOW);
  await installMocks(page, {
    layout: 'menu',
    tweakSettings: (s) => {
      s.theme = {
        ...s.theme,
        options: {
          showSku: false, showCategoryPicker: false, headerAccountIcon: 'none', headerCartIcon: 'desktop',
          cutoffMessage: 'Order before {time} and it leaves {dispatch}', showCutoffCountdown: false,
        },
      };
    },
  });
  await page.goto('/');
  await expect(page.locator('[data-sf-part="product-row"]').first()).toBeVisible();
  await expect(page.getByText('ALP-10')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Categories/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Your account|Sign in/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Cart,/ })).toBeHidden();
  const cutoff = page.locator('[data-sf-part="cutoff"]');
  await expect(cutoff).toContainText(/Order before \d\d:\d\d and it leaves/);
  await expect(cutoff).not.toContainText('left');

  await page.setViewportSize({ width: 1280, height: 844 });
  await expect(page.getByRole('link', { name: /^Cart,/ })).toBeVisible();
});
