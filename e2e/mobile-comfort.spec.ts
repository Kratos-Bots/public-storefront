import { expect, test, type Locator, type Page } from '@playwright/test';
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

  // The keyboard is only closed on a touch screen (a coarse pointer); a desktop keeps its focus.
  test.describe('on a touch screen', () => {
    test.use({ hasTouch: true, isMobile: true });
    test('with nothing left to fill the field loses focus, so the keyboard closes', async ({ page }) => {
    await openGuest(page, 'storefront', '/checkout');
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
    await page.getByRole('textbox', { name: 'First name' }).click();
    await systemFill(page, { ...CONTACT, Phone: '7700900123' });
    await expect.poll(() => focusedLabel(page)).toBe('BODY');
    });
  });

  test('on a desktop the field keeps focus when nothing is left to fill', async ({ page }) => {
    await openGuest(page, 'storefront', '/checkout');
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
    await page.getByRole('textbox', { name: 'First name' }).click();
    await systemFill(page, { ...CONTACT, Phone: '7700900123' });
    await page.waitForTimeout(300);
    expect(await focusedLabel(page)).toBe('First name');
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

/** Contact step filled by hand, on to the address step: its last fields sit at the foot of a phone screen. */
async function toAddressStep(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
  await page.getByRole('textbox', { name: 'First name' }).fill('Ada');
  await page.getByRole('textbox', { name: 'Surname' }).fill('Sterling');
  await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.invalid');
  await page.getByRole('textbox', { name: 'Phone' }).fill('7700900123');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Delivery address' })).toBeVisible();
}

const box = async (loc: Locator) => (await loc.boundingBox())!;

test.describe('a focused field stays clear of the bottom bar', () => {
  test('storefront layout: the last address field is above the checkout Continue band', async ({ page }) => {
    await openGuest(page, 'storefront', '/checkout');
    // A shorter phone (an SE, or a browser with its toolbars out), so the last field really is below the fold.
    await page.setViewportSize({ width: 390, height: 680 });
    await toAddressStep(page);
    const postcode = page.getByRole('textbox', { name: 'Postcode' });
    await postcode.focus();
    const band = page.getByRole('button', { name: 'Continue' });
    await expect(band).toBeVisible();
    const field = await box(postcode);
    const bar = await box(band);
    // The Continue button is inside the sticky band, which has its own padding above it.
    expect(field.y + field.height).toBeLessThanOrEqual(bar.y);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom)).not.toBe('0px');
  });

  test('webapp layout in a browser: the last address field is above the checkout Continue band', async ({ page }) => {
    // The checkout carries its own Continue band here, so the shell's action bar stands down on this page.
    await openGuest(page, 'webapp', '/checkout');
    await toAddressStep(page);
    const postcode = page.getByRole('textbox', { name: 'Postcode' });
    await postcode.focus();
    await expect(page.locator('[data-sf-part="primary-bar"]')).toHaveCount(0);
    const field = await box(postcode);
    expect(field.y + field.height).toBeLessThanOrEqual((await box(page.getByRole('button', { name: 'Continue' }))).y);
  });

  test('webapp layout in a browser: the shell reserves the running-tab bar as the bottom inset of the page', async ({ page }) => {
    await openGuest(page, 'webapp', '/');
    // Browsing, the running tab (not the single-button primary bar) is the web app's foot.
    const bar = page.locator('[data-sf-part="cart-bar"]');
    await expect(bar).toBeVisible();
    await expect(page.locator('[data-sf-part="primary-bar"]')).toHaveCount(0);
    const barHeight = (await box(bar)).height;
    const inset = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom));
    expect(inset).toBeGreaterThanOrEqual(barHeight);
  });

  test('webapp layout in a browser: the cart page keeps the single-button bar and reserves it too', async ({ page }) => {
    await openGuest(page, 'webapp', '/cart');
    const bar = page.locator('[data-sf-part="primary-bar"]');
    await expect(bar).toBeVisible();
    await expect(page.locator('[data-sf-part="cart-bar"]')).toHaveCount(0);
    const barHeight = (await box(bar)).height;
    const inset = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom));
    expect(inset).toBeGreaterThanOrEqual(barHeight);
  });

  test('the step card lands below the sticky header after Continue', async ({ page }) => {
    await openGuest(page, 'storefront', '/checkout');
    await toAddressStep(page);
    // The scroll to the card settles over a few frames.
    await expect.poll(async () => {
      const header = await box(page.locator('header').first());
      const card = await box(page.locator('[data-sf-part="card"]').first());
      return card.y - (header.y + header.height);
    }).toBeGreaterThanOrEqual(-1);
  });
});

test.describe('the opt-in autofill diagnostic', () => {
  test('?sfdiag=autofill shows a value-free trace panel that Close removes', async ({ page }) => {
    await openGuest(page, 'storefront', '/checkout?sfdiag=autofill');
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
    const panel = page.locator('[data-sf-diag="autofill"]');
    await expect(panel).toBeVisible();

    await page.getByRole('textbox', { name: 'First name' }).click();
    await page.keyboard.type('Q');
    const line = panel.getByText(/ input InputEvent .* insertText .* d=1 /);
    await expect(line).toBeVisible();
    // Lengths and tokens only: the typed character is not in the line (the token is given-name).
    expect(await line.textContent()).not.toContain('Q');

    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(panel).toHaveCount(0);
  });

  test('without the parameter there is no panel', async ({ page }) => {
    await openGuest(page, 'storefront', '/checkout');
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
    await page.getByRole('textbox', { name: 'First name' }).click();
    await page.keyboard.type('Q');
    await expect(page.locator('[data-sf-diag]')).toHaveCount(0);
  });
});
