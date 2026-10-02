import { expect, test, type Page } from '@playwright/test';
import { FIXED_NOW } from './flows.ts';
import { installMocks, PASSWORD_ACCOUNT } from './mocks.ts';

const PRODUCT = 'Alpine Extract 10ml';
const MESSAGE = 'Members only.';
const BUTTON_URL = 'https://t.me/example';
const REGISTRATION_CLOSED = 'New accounts aren’t being opened right now.';
const restricted = {
  storefront: 'restricted' as const,
  denied: true,
  deniedMessage: MESSAGE,
  deniedButtons: [{ label: 'Message us', url: BUTTON_URL }],
};

test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(FIXED_NOW); });

const signIn = async (page: Page) => {
  await page.getByRole('textbox', { name: 'Email address' }).fill(PASSWORD_ACCOUNT.email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD_ACCOUNT.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
};

test.describe('shop access', () => {
  test('login required: a signed-out visitor is sent to sign in and never asks for the catalogue', async ({ page }) => {
    const mocks = await installMocks(page, { access: { storefront: 'login' }, passwordLogin: true });
    await page.goto('/');
    await expect(page).toHaveURL(/\/login\?returnTo=%2F$/);
    await expect(page.getByRole('heading', { name: 'Email or phone' })).toBeVisible();
    await expect(page.getByText('Sign in to view the shop.')).toBeVisible();
    // Plain login-required mode shows no owner message and no buttons.
    await expect(page.getByText('This shop is private.')).toHaveCount(0);
    // A bare frame: no shop header, footer or cart.
    await expect(page.getByRole('banner')).toHaveCount(0);
    await expect(page.getByRole('contentinfo')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Cart/ })).toHaveCount(0);
    expect(mocks.state.anonymousCatalogHits).toBe(0);
  });

  test('a deep link survives sign-in', async ({ page }) => {
    const mocks = await installMocks(page, { access: { storefront: 'login' }, passwordLogin: true });
    await page.goto('/c/capsules');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fc%2Fcapsules$/);
    await signIn(page);
    await expect(page).toHaveURL(/\/c\/capsules$/);
    await expect(page.getByRole('heading', { name: 'Capsules', level: 1 })).toBeVisible();
    expect(mocks.state.anonymousCatalogHits).toBe(0);
  });

  test('restricted, signed in, not allowed: the lockout screen, orders still reachable', async ({ page }) => {
    await installMocks(page, { session: true, access: restricted });
    await page.goto('/');
    await expect(page.getByText(MESSAGE)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Message us' })).toHaveAttribute('href', BUTTON_URL);
    await expect(page.getByText(PRODUCT)).toHaveCount(0);

    await page.getByRole('link', { name: 'My orders' }).click();
    await expect(page).toHaveURL(/\/account\/orders$/);
    await expect(page.getByText(MESSAGE)).toHaveCount(0);
    // The orders page itself rendered (a fixture order), not just an absent lockout.
    await expect(page.getByText(/K4M2QP/).first()).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/localhost:5199\/$/);
    await expect(page.getByText(MESSAGE)).toBeVisible();
    await expect(page.getByText(PRODUCT)).toHaveCount(0);
  });

  test('check again lets the customer in once access is granted, without signing out', async ({ page }) => {
    const mocks = await installMocks(page, { session: true, access: restricted });
    await page.goto('/');
    await expect(page.getByText(MESSAGE)).toBeVisible();

    // Still refused: the probe says so and the lockout stays.
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect(page.getByRole('button', { name: 'Check again' })).toBeEnabled();
    await expect(page.getByText(MESSAGE)).toBeVisible();

    mocks.state.denied = false;
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect(page.getByText(PRODUCT)).toBeVisible();
    await expect(page.getByText(MESSAGE)).toHaveCount(0);
  });

  test('registration closed: no sign-up, the owner’s words, and no guest checkout', async ({ page }) => {
    const mocks = await installMocks(page, {
      passwordLogin: true,
      access: { registration: false, deniedMessage: 'By invitation only.' },
      // The shop asks for guest checkout; closed registration must switch it off.
      tweakSettings: (s) => { s.features.guestCheckout = true; },
    });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Email or phone' })).toBeVisible();
    await expect(page.getByText(REGISTRATION_CLOSED)).toBeVisible();
    await expect(page.getByText('By invitation only.')).toBeVisible();
    await expect(page.getByRole('button', { name: /create (an )?account|sign up/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /create (an )?account|sign up/i })).toHaveCount(0);

    // A guest with items in a local cart is not offered a guest checkout.
    await page.addInitScript(() => {
      window.localStorage.setItem('sf-cart-v1', JSON.stringify({ state: { lines: [{ productId: 101, quantity: 1 }] }, version: 0 }));
    });
    await page.goto('/checkout');
    // Sent to sign in, not offered a guest checkout: the redirect must have happened before the negatives mean anything.
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fcheckout$/);
    await expect(page.getByRole('heading', { name: 'Guest checkout', level: 1 })).toHaveCount(0);
    expect(mocks.state.guestQuotes).toHaveLength(0);
  });

  test('a public shop is unchanged: catalogue, no redirect, no notice on /login', async ({ page }) => {
    await installMocks(page, { passwordLogin: true });
    await page.goto('/');
    await expect(page.getByText(PRODUCT)).toBeVisible();
    await expect(page).toHaveURL(/localhost:5199\/$/);
    // Positive control for the bare-frame test: here the header, footer and cart are present.
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
    await expect(page.getByRole('link', { name: /^Cart/ }).first()).toBeVisible();
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Email or phone' })).toBeVisible();
    await expect(page.getByText('Sign in to view the shop.')).toHaveCount(0);
    await expect(page.getByText(REGISTRATION_CLOSED)).toHaveCount(0);
    await expect(page.getByText('This shop is private.')).toHaveCount(0);
  });

  test.describe('phone width', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('the lockout message and button fit and the button is a comfortable target', async ({ page }) => {
      await installMocks(page, { session: true, access: restricted });
      await page.goto('/');
      await expect(page.getByText(MESSAGE)).toBeVisible();
      const button = page.getByRole('link', { name: 'Message us' });
      await expect(button).toBeVisible();
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
});
