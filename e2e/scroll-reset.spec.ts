import { expect, test, type Page } from '@playwright/test';
import { installMocks, type Layout } from './mocks.ts';
import { FIXED_NOW, onlyVisible, openProduct, productOpener } from './flows.ts';

/**
 * Scroll position across navigation. The window is what scrolls in every layout, and `<ScrollRestoration />`
 * (mounted in routes.tsx) resets it on a new page and restores it on Back. The product sheet of the list
 * layouts is the exception: it opens over the list through `?p=` and must leave the list where it was.
 * The mocked catalogue is short, so each test pads the page to make it scroll.
 */

test.use({ viewport: { width: 390, height: 844 } });

const FIRST = 'Alpine Extract 10ml';
const SCROLLED = 600;

async function open(page: Page, layout: Layout, path = '/'): Promise<void> {
  await page.clock.setFixedTime(FIXED_NOW);
  await installMocks(page, { layout });
  await page.goto(path);
  await expect(productOpener(page, layout, FIRST)).toBeVisible();
  // Outside React's tree, so it survives every client-side navigation.
  await page.evaluate(() => { document.body.style.paddingBottom = '3000px'; });
}

const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));

async function scrollTo(page: Page, y: number): Promise<void> {
  await page.evaluate((to) => window.scrollTo(0, to), y);
  await expect.poll(() => scrollY(page)).toBeGreaterThan(y - 5);
}

test.describe('scroll · storefront layout', () => {
  test('a product page starts at the top, and Back returns to the catalogue position', async ({ page }) => {
    await open(page, 'storefront');
    // The card has to be on screen to be clicked, so scroll just enough to keep it there.
    const card = productOpener(page, 'storefront', FIRST);
    await card.scrollIntoViewIfNeeded();
    const before = await scrollY(page);
    await scrollTo(page, before + 40);
    const y = await scrollY(page);
    expect(y).toBeGreaterThan(0);

    await openProduct(page, 'storefront', FIRST);
    await expect.poll(() => scrollY(page)).toBe(0);

    await page.goBack();
    await expect(productOpener(page, 'storefront', FIRST)).toBeVisible();
    await expect.poll(() => scrollY(page)).toBeGreaterThan(y - 20);
    expect(await scrollY(page)).toBeLessThan(y + 20);
  });

  test('a header link from a scrolled page lands at the top of the next page', async ({ page }) => {
    await open(page, 'storefront');
    await scrollTo(page, SCROLLED);
    await onlyVisible(page.getByRole('link', { name: 'Sign in' })).click();
    await expect(page).toHaveURL(/\/login/);
    await expect.poll(() => scrollY(page)).toBe(0);
  });

  test('a footer link from a scrolled page lands at the top of the next page', async ({ page }) => {
    await open(page, 'storefront');
    const links = page.getByRole('contentinfo').getByRole('link');
    test.skip((await links.count()) === 0, 'the fixture shell has no footer links');
    await links.first().scrollIntoViewIfNeeded();
    expect(await scrollY(page)).toBeGreaterThan(0);
    const from = page.url();
    await links.first().click();
    // A footer link may leave the app (mailto:, https:); only an in-app one is a navigation to judge.
    if (page.url() !== from && page.url().startsWith(new URL(from).origin)) {
      await expect.poll(() => scrollY(page)).toBe(0);
    }
  });
});

for (const layout of ['menu', 'webapp'] as const) {
  test.describe(`scroll · ${layout} layout`, () => {
    test('opening and closing the product sheet leaves the list where it was', async ({ page }) => {
      await open(page, layout);
      const row = productOpener(page, layout, FIRST);
      await row.scrollIntoViewIfNeeded();
      const before = await scrollY(page);
      await scrollTo(page, before + 40);
      const y = await scrollY(page);
      expect(y).toBeGreaterThan(0);

      await openProduct(page, layout, FIRST);
      await expect(page).toHaveURL(/[?&]p=/);
      expect(Math.abs((await scrollY(page)) - y)).toBeLessThan(5);

      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: FIRST })).toBeHidden();
      await expect(page).not.toHaveURL(/[?&]p=/);
      expect(Math.abs((await scrollY(page)) - y)).toBeLessThan(5);
    });

    test('Back from the open sheet also leaves the list where it was', async ({ page }) => {
      await open(page, layout);
      await productOpener(page, layout, FIRST).scrollIntoViewIfNeeded();
      const y = await scrollY(page);
      await openProduct(page, layout, FIRST);
      await page.goBack();
      await expect(page.getByRole('dialog', { name: FIRST })).toBeHidden();
      await expect.poll(async () => Math.abs((await scrollY(page)) - y)).toBeLessThan(5);
    });

    test('a header link from a scrolled list lands at the top of the next page', async ({ page }) => {
      await open(page, layout);
      await scrollTo(page, SCROLLED);
      await onlyVisible(page.getByRole('link', { name: /^(Sign in|Your account)$/ })).click();
      await expect(page).toHaveURL(/\/(login|account)/);
      await expect.poll(() => scrollY(page)).toBe(0);
    });
  });
}
