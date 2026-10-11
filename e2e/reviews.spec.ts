import { expect, test, type Locator, type Page } from '@playwright/test';
import { installMocks, SESSION_CUSTOMER, type InstallMocksOptions, type Layout, type MockHandle } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import type { PublicReview, ReviewableOrder } from '../web/src/types/reviews.ts';
import type { UnpaidOrder } from '../web/src/types/orders.ts';

/**
 * Customer reviews as a signed-in shopper meets them: the form on the account order page (and the `?review=1` link a
 * notification opens), the "How was your order?" reminder that never shares a page load with the unpaid-order pop-up,
 * and the public /reviews page. Everything runs against the mocked backend. Synthetic data only.
 */

const REF = 'K4M2QP';
const REMINDER = 'How was your order?';
const UNPAID = 'You have an unpaid order';
const STORAGE_KEY = 'sf-review-reminder-v1';
const HOUR = 3_600_000;

const reviewable = (reference = REF): ReviewableOrder => ({
  reference,
  eligibleSince: new Date(FIXED_NOW.getTime() - 2 * 24 * HOUR).toISOString(),
  remindUntil: new Date(FIXED_NOW.getTime() + 5 * 24 * HOUR).toISOString(),
});
const unpaidRow = (): UnpaidOrder => ({
  reference: 'OWED01', createdAt: '2026-08-24T08:30:00.000Z', totalAmount: 46.03, outstandingBalance: 46.03, payBy: null, canCancel: true, cancelBlockedBy: null,
});
const review = (id: number, rating: number, comment: string | null): PublicReview => ({ id, rating, comment, createdAt: '2026-08-2' + (id % 9) + 'T09:00:00.000Z' });

interface OpenOptions extends InstallMocksOptions {
  width?: number;
  layout?: Layout;
  path?: string;
}

async function open(page: Page, o: OpenOptions = {}): Promise<MockHandle> {
  const { width = 1280, layout = 'storefront', path = '/', session = true, ...rest } = o;
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.clock.setFixedTime(FIXED_NOW);
  const mocks = await installMocks(page, { layout, session, ...rest });
  await page.goto(path);
  return mocks;
}

const reminder = (page: Page): Locator => page.getByRole('dialog', { name: REMINDER });
const unpaid = (page: Page): Locator => page.getByRole('dialog', { name: UNPAID });
const asks = (mocks: MockHandle, what: string): number => mocks.requests().filter((r) => r === what).length;
const stored = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, Record<string, string>>, STORAGE_KEY);

/** A server cart with one line, so /checkout stays on the checkout instead of sending the shopper back. */
function seedCart(mocks: MockHandle): void {
  mocks.state.cart = {
    items: [{
      productId: 101, name: 'Alpine Extract 10ml', quantity: 1, unitPrice: 42.5, lineTotal: 42.5, imageUrl: null, isPreorder: false,
      outOfStock: false, priceChanged: false, inactive: false, belowMin: false, aboveMax: false, minOrderQuantity: null, maxOrderQuantity: null,
    }],
    subtotal: 42.5, itemCount: 1,
  };
}

test.describe('reviews · the form on the order page', () => {
  test('rate with the keyboard, comment, send: the form becomes the review awaiting approval', async ({ page }) => {
    const mocks = await open(page, { path: `/account/orders/${REF}`, reviews: {} });
    const group = page.getByRole('radiogroup', { name: 'Your rating' });
    await expect(group).toBeVisible();
    const send = page.getByRole('button', { name: 'Send review' });
    await expect(send).toBeDisabled();

    await group.getByRole('radio').first().focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByLabel('4 stars')).toBeChecked();
    await expect(send).toBeEnabled();

    await page.getByLabel(/Your comments/).fill('Well packed and quick');
    await expect(page.getByText('21 of 500')).toBeVisible();
    await send.click();

    await expect(page.getByText(/Thank you for your review/)).toBeVisible();
    await expect(page.getByText(/awaiting approval/)).toBeVisible();
    await expect(page.getByRole('img', { name: '4 stars out of 5' })).toBeVisible();
    await expect(page.getByText('Well packed and quick')).toBeVisible();
    expect(mocks.state.reviewPosts).toEqual([{ rating: 4, comment: 'Well packed and quick' }]);
    // Reloaded, the order carries the review: read-only, no form.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your review' })).toBeVisible();
    await expect(page.getByRole('radiogroup')).toHaveCount(0);
  });

  test('a server refusal is shown inline and the typed comment is kept', async ({ page }) => {
    await open(page, { path: `/account/orders/${REF}`, reviews: { submit: 422, submitError: 'Reviews open 7 days after delivery.' } });
    await page.getByLabel('5 stars').check();
    await page.getByLabel(/Your comments/).fill('Keep me');
    await page.getByRole('button', { name: 'Send review' }).click();
    await expect(page.getByRole('alert')).toHaveText('Reviews open 7 days after delivery.');
    await expect(page.getByLabel(/Your comments/)).toHaveValue('Keep me');
    await expect(page.getByLabel('5 stars')).toBeChecked();
  });

  test('a review already on the order is read-only; a rejected one is just "Submitted"', async ({ page }) => {
    await open(page, {
      path: `/account/orders/${REF}`,
      reviews: { existing: { rating: 3, comment: 'Fine', status: 'rejected', createdAt: '2026-08-20T10:00:00.000Z' } },
    });
    await expect(page.getByRole('heading', { name: 'Your review' })).toBeVisible();
    await expect(page.getByText('Submitted', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send review' })).toHaveCount(0);
  });

  test('reviews off: no form on the order page', async ({ page }) => {
    await open(page, { path: `/account/orders/${REF}` });
    await expect(page.getByRole('heading', { level: 1, name: REF })).toBeVisible();
    await expect(page.getByRole('radiogroup')).toHaveCount(0);
    await expect(page.getByText('Rate your order')).toHaveCount(0);
  });

  test('?review=1 brings the form into focus and leaves the address clean', async ({ page }) => {
    await open(page, { path: `/account/orders/${REF}?review=1`, reviews: {} });
    await expect(page.getByRole('radiogroup', { name: 'Your rating' })).toBeVisible();
    await expect(page.getByLabel('1 star')).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`/account/orders/${REF}$`));
  });
});

test.describe('reviews · the reminder', () => {
  test('shows once for a reviewable order, never after a reload within 24 hours, again after 25', async ({ page }) => {
    const mocks = await open(page, { width: 390, reviews: { reviewable: [reviewable()] } });
    const dialog = reminder(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`Order ${REF} has arrived.`, { exact: false })).toBeVisible();
    expect(Object.keys((await stored(page))[String(SESSION_CUSTOMER.id)] ?? {})).toEqual([REF]);
    expect(asks(mocks, 'GET storefront/orders/reviewable')).toBe(1);

    await dialog.getByRole('button', { name: 'Not now' }).click();
    await expect(dialog).toHaveCount(0);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-sf-part="product-card"]').first()).toBeVisible();
    await expect(reminder(page)).toHaveCount(0);

    await page.evaluate(([key, ref, at, id]) => localStorage.setItem(key!, JSON.stringify({ [id!]: { [ref!]: at } })), [STORAGE_KEY, REF, new Date(FIXED_NOW.getTime() - 25 * HOUR).toISOString(), String(SESSION_CUSTOMER.id)]);
    await page.reload();
    await expect(reminder(page)).toBeVisible();
  });

  test('Leave a review opens the order page at the form', async ({ page }) => {
    await open(page, { reviews: { reviewable: [reviewable()] } });
    await reminder(page).getByRole('button', { name: 'Leave a review' }).click();
    await expect(page).toHaveURL(new RegExp(`/account/orders/${REF}$`));
    await expect(page.getByLabel('1 star')).toBeFocused();
    await expect(reminder(page)).toHaveCount(0);
  });

  test('Escape closes it', async ({ page }) => {
    await open(page, { reviews: { reviewable: [reviewable()] } });
    await expect(reminder(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(reminder(page)).toHaveCount(0);
  });

  test('with the unpaid-order pop-up also due, only that shows, and dismissing it does not bring the reminder in that load', async ({ page }) => {
    const mocks = await open(page, { unpaidOrders: [unpaidRow()], reviews: { reviewable: [reviewable()] } });
    await expect(unpaid(page)).toBeVisible();
    await expect(reminder(page)).toHaveCount(0);
    await unpaid(page).getByRole('button', { name: 'Not now' }).click();
    await expect(unpaid(page)).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    await expect(reminder(page)).toHaveCount(0);
    expect(asks(mocks, 'GET storefront/orders/reviewable')).toBe(0);
    expect(await stored(page)).toEqual({});
  });

  test('not on checkout', async ({ page }) => {
    const mocks = await installMocks(page, { layout: 'storefront', session: true, reviews: { reviewable: [reviewable()] } });
    seedCart(mocks);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.clock.setFixedTime(FIXED_NOW);
    await page.goto('/checkout');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(reminder(page)).toHaveCount(0);
    expect(asks(mocks, 'GET storefront/orders/reviewable')).toBe(0);
  });

  test('an older backend (404 on the list) is silently no reminder', async ({ page }) => {
    await open(page, { reviews: { reviewable: 404 } });
    await expect(page.locator('[data-sf-part="product-card"]').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(reminder(page)).toHaveCount(0);
  });

  test('reviews off asks nothing and shows nothing', async ({ page }) => {
    const mocks = await open(page, { unpaidOrders: [] });
    await expect(page.locator('[data-sf-part="product-card"]').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(reminder(page)).toHaveCount(0);
    expect(asks(mocks, 'GET storefront/orders/reviewable')).toBe(0);
  });

  test('in the web app layout at phone width it sits above the action bar', async ({ page }) => {
    await open(page, { width: 390, layout: 'webapp', reviews: { reviewable: [reviewable()] } });
    const dialog = reminder(page);
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await expect(dialog.getByRole('button', { name: 'Leave a review' })).toBeVisible();
  });
});

test.describe('reviews · the public page', () => {
  const many = Array.from({ length: 12 }, (_, i) => review(12 - i, 5 - (i % 3), i % 4 === 3 ? null : `Comment number ${12 - i}`));

  test('lists approved reviews with the average, loads more, and is linked from the footer', async ({ page }) => {
    await open(page, { reviews: { list: many }, session: false });
    await page.getByRole('link', { name: 'Customer reviews' }).click();
    await expect(page).toHaveURL(/\/reviews$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Customer reviews' })).toBeVisible();
    await expect(page.getByText('12 reviews')).toBeVisible();
    await expect(page.locator('li:has(time)')).toHaveCount(10);
    await page.getByRole('button', { name: 'Load more reviews' }).click();
    await expect(page.locator('li:has(time)')).toHaveCount(12);
    await expect(page.getByRole('button', { name: 'Load more reviews' })).toHaveCount(0);
  });

  test('with none yet it says so', async ({ page }) => {
    await open(page, { path: '/reviews', reviews: { list: [] }, session: false });
    await expect(page.getByText('No reviews yet')).toBeVisible();
  });

  test('reviews off: the page is not found and no link is shown', async ({ page }) => {
    await open(page, { path: '/reviews', session: false });
    await expect(page.getByRole('heading', { name: 'Customer reviews' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Customer reviews' })).toHaveCount(0);
  });
});
