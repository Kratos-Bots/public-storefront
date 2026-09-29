import { expect, type Locator, type Page } from '@playwright/test';
import type { Layout, MockHandle } from './mocks.ts';

/** The fixture's serverTime — freezing Date here keeps the cutoff countdown stable in screenshots. */
export const FIXED_NOW = new Date('2026-08-24T09:00:00.000Z');

/** Both shells keep the phone and desktop variants of a control in the DOM and
 *  let CSS choose — so every shared-name query resolves through visibility. */
export function onlyVisible(locator: Locator): Locator {
  return locator.filter({ visible: true }).first();
}

const sheets = (layout: Layout) => layout !== 'storefront';

/** What opens a product: a card link in the storefront grid, a row button in the menu list. */
export function productOpener(page: Page, layout: Layout, name: string): Locator {
  return sheets(layout)
    ? page.getByRole('button', { name, exact: true })
    : page.getByRole('link', { name, exact: true });
}

export async function openProduct(page: Page, layout: Layout, name: string): Promise<void> {
  await productOpener(page, layout, name).click();
  if (sheets(layout)) await expect(page.getByRole('dialog', { name })).toBeVisible();
  else await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

/** The cart, wherever this viewport keeps it: a page on a phone, a drawer on a desktop. */
export async function openCart(page: Page, viewport: 'mobile' | 'desktop'): Promise<Locator> {
  await onlyVisible(page.getByRole('link', { name: /^Cart, / })).click();
  if (viewport === 'desktop') {
    const drawer = page.getByRole('dialog', { name: 'Your cart' });
    await expect(drawer).toBeVisible();
    return drawer;
  }
  await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();
  return page.locator('body');
}

/** Contact → Address → Shipping → Payment (crypto) → Review, stopping on Review. */
export async function fillCheckout(
  page: Page,
  advance: () => Promise<void> = () => page.getByRole('button', { name: 'Continue' }).click(),
): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
  await page.getByRole('textbox', { name: 'First name' }).fill('Ada');
  await page.getByRole('textbox', { name: 'Surname' }).fill('Sterling');
  await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.invalid');
  await advance();

  await expect(page.getByRole('heading', { name: 'Delivery address' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Address line 1' }).fill('14 Kirkgate');
  await page.getByRole('textbox', { name: 'City' }).fill('Leeds');
  await page.getByRole('textbox', { name: 'ZIP / Postcode' }).fill('LS1 6BY');
  // Pre-seeded from the shop's `defaultPhoneCountry`; the quote is keyed on it.
  await expect(page.getByRole('combobox', { name: 'Country' })).toHaveValue('GB');
  await advance();

  await expect(page.getByRole('heading', { name: 'Delivery and discounts' })).toBeVisible();
  // The options only exist once the backend has priced the order.
  await expect(page.getByText('Tracked 24')).toBeVisible();
  await page.getByText('Tracked 24').click();
  await advance();

  await expect(page.getByRole('heading', { name: /How you.ll pay/ })).toBeVisible();
  await page.locator('label').filter({ hasText: 'Crypto' }).first().click();
  await page.locator('label').filter({ hasText: 'USDT' }).first().click();
  await advance();

  await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
  await expect(page.getByText('ada@example.invalid')).toBeVisible();
  await expect(page.getByText('USDT · Polygon')).toBeVisible();
}

/** Add the open product once and wait until the line is on the server and the button has settled. */
export async function addFirstToCart(page: Page, layout: Layout, mocks: MockHandle): Promise<void> {
  await page.getByRole('button', { name: /^Add · / }).first().click();
  await expect.poll(() => mocks.state.cart.itemCount).toBe(1);
  if (sheets(layout)) {
    await page.getByRole('button', { name: 'Close' }).first().click();
    await expect(page.getByRole('dialog')).toBeHidden();
  } else {
    await expect(page.getByRole('button', { name: /^Add another/ }).first()).toBeVisible();
  }
}
