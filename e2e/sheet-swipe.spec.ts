import { expect, test, type Page } from '@playwright/test';
import { installMocks } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';

/**
 * Swipe down to close the menu layout's bottom sheet, with real touch input (CDP `Input.dispatchTouchEvent`)
 * in Chromium at a phone's size. Real iOS Safari, Android WebViews and Telegram's webview are not covered.
 */

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

const LINE = {
  productId: 101, displayName: 'Alpine Extract 10ml', sku: 'ALP-10', unitPrice: 42.5, basePrice: 42.5, pricingTiers: [], quantity: 1,
  isPreorder: false, excludedFromFreeShipping: false, imageProductId: null,
};

async function open(page: Page, path: string, withCart = false): Promise<void> {
  await page.clock.setFixedTime(FIXED_NOW);
  await installMocks(page, { layout: 'menu', session: true });
  if (withCart) {
    await page.addInitScript((line) => {
      window.localStorage.setItem('sf-cart-v1', JSON.stringify({ state: { lines: [line] }, version: 0 }));
    }, LINE);
  }
  await page.goto(path);
}

/** One finger from (x, y0) to (x, y1), in steps, released at the end. */
async function swipe(page: Page, x: number, y0: number, y1: number, steps = 8): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / steps }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

const productSheet = (page: Page) => page.getByRole('dialog', { name: 'Alpine Extract 10ml' });

test.describe('product sheet · swipe down', () => {
  test('a long pull on the handle closes it', async ({ page }) => {
    await open(page, '/?p=101');
    const sheet = productSheet(page);
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(500); // the open transition has settled
    const box = (await sheet.boundingBox())!;
    await swipe(page, box.x + box.width / 2, box.y + 8, box.y + 320);
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]p=/);
  });

  test('a long pull on the pinned header closes it', async ({ page }) => {
    await open(page, '/?p=101');
    const sheet = productSheet(page);
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(500);
    const box = (await sheet.boundingBox())!;
    await swipe(page, box.x + 120, box.y + 40, box.y + 360);
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]p=/);
  });

  test('a short pull springs back and the sheet stays open', async ({ page }) => {
    await open(page, '/?p=101');
    const sheet = productSheet(page);
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(500);
    const before = (await sheet.boundingBox())!;
    await swipe(page, before.x + before.width / 2, before.y + 8, before.y + 60, 10);
    await page.waitForTimeout(500);
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(/[?&]p=101/);
    const after = (await sheet.boundingBox())!;
    expect(Math.abs(after.y - before.y)).toBeLessThan(1);
    expect(await sheet.evaluate((el) => (el as HTMLElement).style.translate)).toBe('');
  });

  test('a pull from the top of the body closes it; a pull after scrolling does not', async ({ page }) => {
    await open(page, '/?p=101');
    const sheet = productSheet(page);
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(500);
    const box = (await sheet.boundingBox())!;
    const body = sheet.locator('[class*="body"]').first();
    // Make the body scrollable, scroll it, then pull down from its middle: it must scroll back, not close.
    await body.evaluate((el) => { const pad = document.createElement('div'); pad.style.height = '2000px'; el.appendChild(pad); el.scrollTop = 300; });
    await swipe(page, box.x + box.width / 2, box.y + 300, box.y + 520);
    await page.waitForTimeout(400);
    await expect(sheet).toBeVisible();
    expect(await body.evaluate((el) => el.scrollTop)).toBeLessThan(300);
    // Back at the very top, the same pull closes the sheet.
    await body.evaluate((el) => { el.scrollTop = 0; });
    await swipe(page, box.x + box.width / 2, box.y + 200, box.y + 520);
    await expect(sheet).toBeHidden();
  });
});

// The cart drawer shares this Sheet, but a phone gets the cart as a page and the drawer only exists from
// 62em, where the sheet is a side panel with no gesture; the categories sheet is the other bottom sheet.
test.describe('categories sheet · swipe down', () => {
  test('a long pull on the handle closes it', async ({ page }) => {
    await open(page, '/');
    await page.getByRole('button', { name: 'Categories', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Categories' });
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(500);
    const box = (await sheet.boundingBox())!;
    await swipe(page, box.x + box.width / 2, box.y + 8, box.y + 320);
    await expect(sheet).toBeHidden();
  });
});

test.describe('side panel · no swipe', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test('a downward pull on the desktop cart drawer does not close it', async ({ page }) => {
    await open(page, '/', true);
    await page.goto('/cart');
    const drawer = page.getByRole('dialog', { name: 'Your cart' });
    await expect(drawer).toBeVisible();
    await page.waitForTimeout(500);
    const box = (await drawer.boundingBox())!;
    await swipe(page, box.x + box.width / 2, box.y + 30, box.y + 400);
    await page.waitForTimeout(400);
    await expect(drawer).toBeVisible();
  });
});
