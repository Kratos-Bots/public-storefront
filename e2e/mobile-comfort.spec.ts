import { expect, test, type Page } from '@playwright/test';
import { installMocks, type Layout, type MockHandle } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';

/**
 * Mobile comfort, in a real Chromium at phone size, against the mocked backend. Playwright cannot trigger the
 * operating system's own autofill and never opens an on-screen keyboard, so these tests dispatch the same event
 * shape the app listens for and assert what the page does with it; the real thing needs a phone.
 */

const LINE = {
  productId: 101, displayName: 'Alpine Extract 10ml', sku: 'ALP-10', unitPrice: 42.5, basePrice: 42.5, pricingTiers: [], quantity: 1,
  isPreorder: false, excludedFromFreeShipping: false, imageProductId: null,
};

/** A guest with one line in the local cart, on `path`, at a phone's size. */
async function openGuest(page: Page, layout: Layout, path: string): Promise<MockHandle> {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(FIXED_NOW);
  const mocks = await installMocks(page, {
    layout,
    session: false,
    tweakSettings: (s) => { s.features.guestCheckout = true; },
  });
  await page.addInitScript((line) => {
    window.localStorage.setItem('sf-cart-v1', JSON.stringify({ state: { lines: [line] }, version: 0 }));
  }, LINE);
  await page.goto(path);
  return mocks;
}

/**
 * What a browser does when it fills a group: every field gets the native value setter and an input event in one
 * task, so the page sees one fill, not several. (React reads the input event.)
 */
async function systemFill(page: Page, values: Record<string, string>, then?: string): Promise<void> {
  await page.evaluate(({ entries, after }) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    for (const [label, value] of Object.entries(entries)) {
      const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      set.call(input, value);
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
    }
    if (after) document.querySelector<HTMLInputElement>(`input[aria-label="${after}"]`)!.focus();
  }, { entries: values, after: then });
}

const focusedLabel = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName ?? null);

const CONTACT = { 'First name': 'Ada', Surname: 'Sterling', Email: 'ada@example.invalid' };

test.describe('after the system fills a field', () => {
  test('focus moves to the next empty required field, and typing does not move it', async ({ page }) => {
    await openGuest(page, 'storefront', '/checkout');
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();

    // Ordinary typing: no hop.
    const first = page.getByRole('textbox', { name: 'First name' });
    await first.click();
    await page.keyboard.type('Ad');
    await page.waitForTimeout(250);
    expect(await focusedLabel(page)).toBe('First name');
    await first.fill('');

    // The system filling the group while the cursor is in First name.
    await first.click();
    await systemFill(page, CONTACT);
    await expect.poll(() => focusedLabel(page)).toBe('Phone');
    await expect(page.getByRole('textbox', { name: 'Surname' })).toHaveValue('Sterling');

    // The form state saw every value: Continue is not stopped by an empty name.
    await page.getByRole('textbox', { name: 'Phone' }).fill('7700900123');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Delivery address' })).toBeVisible();
  });

  test('with nothing left to fill the field loses focus, so the keyboard closes', async ({ page }) => {
    await openGuest(page, 'storefront', '/checkout');
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
    await page.getByRole('textbox', { name: 'First name' }).click();
    await systemFill(page, { ...CONTACT, Phone: '7700900123' });
    await expect.poll(() => focusedLabel(page)).toBe('BODY');
  });

  test('a field the shopper tapped meanwhile keeps focus', async ({ page }) => {
    await openGuest(page, 'storefront', '/checkout');
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
    await page.getByRole('textbox', { name: 'First name' }).click();
    await systemFill(page, { 'First name': 'Ada' }, 'Email');
    await page.waitForTimeout(300);
    expect(await focusedLabel(page)).toBe('Email');
  });
});
