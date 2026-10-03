import { expect, test } from '@playwright/test';
import { FIXED_NOW } from './flows.ts';
import { installMocks } from './mocks.ts';

const MOBILE = { width: 390, height: 844 };
const BINDING = /^[A-Za-z0-9_-]{43}$/;

test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(FIXED_NOW); });
test.use({ viewport: MOBILE });

test.describe('Telegram sign-in over OpenID Connect', () => {
  test('the button starts the sign-in, follows the assigned URL, and the callback signs the shopper in', async ({ page }) => {
    const mocks = await installMocks(page, { telegramOidc: true });
    await page.goto('/login');
    // A real button, not Telegram's widget.
    await expect(page.locator('script[src*="telegram-widget"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Continue with Telegram' }).click();

    await expect(page).toHaveURL(/\/account\/orders$/);
    const [start, complete] = mocks.state.oidcCalls;
    expect(start.route).toBe('start');
    expect(String(start.body.binding)).toMatch(BINDING);
    expect(complete.route).toBe('complete');
    expect(complete.body).toEqual({ code: 'e2e-code', state: 'e2e-state', binding: start.body.binding });
    // One attempt, one completion, and the binding does not outlive it.
    expect(mocks.state.oidcCalls).toHaveLength(2);
    expect(await page.evaluate(() => sessionStorage.getItem('sf-tg-oidc-binding'))).toBeNull();
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem('sf-session-v1') ?? '{}'));
    expect(session.state.token).toBeTruthy();
  });

  test('returns to the page the shopper came from', async ({ page }) => {
    const mocks = await installMocks(page, { telegramOidc: true });
    await page.goto('/login?returnTo=%2Fcart');
    await page.getByRole('button', { name: 'Continue with Telegram' }).click();
    await expect(page).toHaveURL(/\/cart$/);
    expect(mocks.state.oidcCalls[0].body.returnTo).toBe('/cart');
  });

  test('a private shop shows the return page to a signed-out visitor', async ({ page }) => {
    const mocks = await installMocks(page, { telegramOidc: true, access: { storefront: 'login' } });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with Telegram' }).click();
    await expect(page).toHaveURL(/\/account\/orders$/);
    expect(mocks.state.oidcCalls).toHaveLength(2);
  });

  test('an expired sign-in is one sentence with a way back', async ({ page }) => {
    await installMocks(page, { telegramOidc: { completeFails: { status: 400, error: 'TELEGRAM_LOGIN_EXPIRED' } } });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with Telegram' }).click();
    await expect(page.getByRole('alert')).toContainText('started in another browser or tab');
    await page.getByRole('link', { name: 'Back to sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Continue with Telegram' })).toBeVisible();
  });

  test('a callback opened in a browser that never started the sign-in is refused without calling the backend', async ({ page }) => {
    const mocks = await installMocks(page, { telegramOidc: true });
    await page.goto('/auth/telegram/callback?code=c&state=s');
    await expect(page.getByRole('alert')).toContainText('started in another browser or tab');
    expect(mocks.state.oidcCalls).toEqual([]);
  });

  test('a shop without OpenID Connect still shows Telegram’s widget and no drawn button', async ({ page }) => {
    await installMocks(page, { tweakSettings: (s) => { s.login.telegram = { available: true, botUsername: 'northbound_bot' }; } });
    await page.goto('/login');
    await expect(page.locator('script[src*="telegram-widget"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Continue with Telegram' })).toHaveCount(0);
  });
});
