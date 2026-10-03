import { expect, test, type Page } from '@playwright/test';
import { FIXED_NOW } from './flows.ts';
import { installMocks, PASSWORD_ACCOUNT } from './mocks.ts';

const MOBILE = { width: 390, height: 844 };
const TOKEN = /^e2e-turnstile-token-\d+$/;

// A running clock that starts at the fixed moment, so the resend countdown can be fast-forwarded.
test.beforeEach(async ({ page }) => { await page.clock.install({ time: FIXED_NOW }); });
test.use({ viewport: MOBILE });

const codeBox = (page: Page) => page.getByRole('textbox', { name: '6-digit code' });
const calls = (mocks: Awaited<ReturnType<typeof installMocks>>, route: string) => mocks.state.codeCalls.filter((c) => c.route === route);
// Request counts are read with a retry: a click returns before the request has necessarily reached the mock.
const callCount = (mocks: Awaited<ReturnType<typeof installMocks>>, route: string) => expect.poll(() => calls(mocks, route).length);

test.describe('the opening choice', () => {
  test('three big buttons, a line for newcomers, and none of the old pieces', async ({ page }) => {
    await installMocks(page, { codeLogin: {}, passwordLogin: true });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in to Northbound Supply', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with phone number' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with email' })).toBeVisible();
    await expect(page.getByText('New here? You’ll create your account as you sign in.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with WhatsApp' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create an account' })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Use your email or your phone' })).toHaveCount(0);
  });

  test('a closed shop drops the newcomer line', async ({ page }) => {
    await installMocks(page, { codeLogin: {}, access: { registration: false } });
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Continue with phone number' })).toBeVisible();
    await expect(page.getByText(/New here\?/)).toHaveCount(0);
  });

  test('an older backend (no login.phone or login.email) keeps today’s sign-in', async ({ page }) => {
    await installMocks(page, {});
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Continue with WhatsApp' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with phone number' })).toHaveCount(0);
  });
});

test.describe('phone', () => {
  test('WhatsApp, then switch to text message, then the code signs in', async ({ page }) => {
    const mocks = await installMocks(page, { codeLogin: {} });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with phone number' }).click();
    await expect(page.getByLabel('Country')).toHaveValue('GB');
    await page.getByRole('textbox', { name: 'Phone number' }).fill('07700 900123');
    await page.getByRole('button', { name: 'Send code by WhatsApp' }).click();

    await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
    await expect(page.getByText(/by WhatsApp\.$/)).toBeVisible();
    await callCount(mocks, 'phone').toBe(1);
    const first = calls(mocks, 'phone')[0]!.body;
    expect(first).toMatchObject({ phone: '+4407700900123', channel: 'whatsapp' });
    expect(String(first.turnstileToken)).toMatch(TOKEN);

    await page.getByRole('button', { name: 'Didn’t get it? Send by text message instead' }).click();
    await expect(page.getByText(/by text message\.$/)).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'We sent a new code.' })).toBeVisible();
    await callCount(mocks, 'resend').toBe(1);
    const resend = calls(mocks, 'resend')[0]!.body;
    expect(resend).toMatchObject({ attemptId: 'code-attempt-1', channel: 'sms' });
    expect(String(resend.turnstileToken)).toMatch(TOKEN);
    expect(resend.turnstileToken).not.toBe(first.turnstileToken);

    await codeBox(page).fill('123456');
    await expect(page).toHaveURL(/\/account\/orders$/);
    await callCount(mocks, 'verify').toBe(1);
    expect(calls(mocks, 'verify')[0]!.body).toEqual({ attemptId: 'code-attempt-1', code: '123456' });
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem('sf-session-v1') ?? '{}'));
    expect(session.state.token).toBeTruthy();
  });

  test('every send carries the page language', async ({ page }) => {
    const mocks = await installMocks(page, { codeLogin: {} });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with phone number' }).click();
    await page.getByRole('textbox', { name: 'Phone number' }).fill('07700 900123');
    await page.getByRole('button', { name: 'Send code by WhatsApp' }).click();
    await callCount(mocks, 'phone').toBe(1);
    expect(calls(mocks, 'phone')[0]!.body.language).toEqual(expect.any(String));
  });

  test('Enter sends by the first channel, which is the filled button', async ({ page }) => {
    const mocks = await installMocks(page, { codeLogin: {} });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with phone number' }).click();
    const number = page.getByRole('textbox', { name: 'Phone number' });
    await expect(number).toBeFocused();
    await expect(page.getByRole('button', { name: 'Send code by WhatsApp' })).toHaveAttribute('data-variant', 'filled');
    await number.fill('07700 900123');
    await number.press('Enter');
    await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
    await callCount(mocks, 'phone').toBe(1);
    expect(calls(mocks, 'phone')[0]!.body).toMatchObject({ channel: 'whatsapp' });
    await expect(codeBox(page)).toBeFocused();
  });

  test('a wrong code clears the box and counts down the tries; the right one then signs in', async ({ page }) => {
    await installMocks(page, { codeLogin: {} });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with phone number' }).click();
    await page.getByRole('textbox', { name: 'Phone number' }).fill('07700 900123');
    await page.getByRole('button', { name: 'Send code by text message' }).click();
    await codeBox(page).fill('000000');
    await expect(page.getByRole('alert')).toHaveText('That code isn’t right. 3 tries left.');
    await expect(codeBox(page)).toHaveValue('');
    await codeBox(page).fill('111111');
    await expect(page.getByRole('alert')).toHaveText('That code isn’t right. 2 tries left.');
    await codeBox(page).fill('123456');
    await expect(page).toHaveURL(/\/account\/orders$/);
  });

  test('a pasted code with spaces is accepted', async ({ page }) => {
    await installMocks(page, { codeLogin: {} });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with phone number' }).click();
    await page.getByRole('textbox', { name: 'Phone number' }).fill('07700 900123');
    await page.getByRole('button', { name: 'Send code by WhatsApp' }).click();
    await codeBox(page).focus();
    await page.evaluate(() => {
      const input = document.querySelector('input[autocomplete="one-time-code"]')!;
      const data = new DataTransfer();
      data.setData('text', '123 456');
      input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect(page).toHaveURL(/\/account\/orders$/);
  });

  test('the resend link counts down for a minute, then sends again', async ({ page }) => {
    const mocks = await installMocks(page, { codeLogin: {} });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with phone number' }).click();
    await page.getByRole('textbox', { name: 'Phone number' }).fill('07700 900123');
    await page.getByRole('button', { name: 'Send code by WhatsApp' }).click();
    const waiting = page.getByRole('button', { name: /^Resend code in (1:00|0:5\d)$/ });
    await expect(waiting).toBeVisible();
    await expect(waiting).toBeDisabled();
    await page.clock.fastForward('01:02');
    const live = page.getByRole('button', { name: 'Resend code', exact: true });
    await expect(live).toBeEnabled();
    await live.click();
    await expect(page.getByRole('status').filter({ hasText: 'We sent a new code.' })).toBeVisible();
    await callCount(mocks, 'resend').toBe(1);
    expect(calls(mocks, 'resend')[0]!.body).not.toHaveProperty('channel');
  });

  test('a number WhatsApp cannot reach is told so and can use a text message instead', async ({ page }) => {
    await installMocks(page, { codeLogin: { unavailableChannels: ['whatsapp'] } });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with phone number' }).click();
    await page.getByRole('textbox', { name: 'Phone number' }).fill('07700 900123');
    await page.getByRole('button', { name: 'Send code by WhatsApp' }).click();
    await expect(page.getByRole('alert')).toHaveText('We couldn’t send a WhatsApp message to that number. Try a text message instead');
    await expect(page.getByRole('textbox', { name: 'Phone number' })).toHaveValue('07700 900123');
    await page.getByRole('button', { name: 'Send code by text message' }).click();
    await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  });

  test('a number typed with no country is refused before anything is sent', async ({ page }) => {
    const mocks = await installMocks(page, { codeLogin: {}, tweakSettings: (s) => { s.contactModes.defaultPhoneCountry = null; } });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with phone number' }).click();
    await page.getByRole('textbox', { name: 'Phone number' }).fill('7700900123');
    await page.getByRole('button', { name: 'Send code by WhatsApp' }).click();
    // The refusal is client-side, so once it is on screen nothing can still be on its way.
    await expect(page.getByText('Choose your country')).toBeVisible();
    expect(calls(mocks, 'phone')).toHaveLength(0);
  });

  test('"Use a different number" goes back to the form', async ({ page }) => {
    await installMocks(page, { codeLogin: {} });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with phone number' }).click();
    await page.getByRole('textbox', { name: 'Phone number' }).fill('07700 900123');
    await page.getByRole('button', { name: 'Send code by WhatsApp' }).click();
    await page.getByRole('button', { name: 'Use a different number' }).click();
    await expect(page.getByRole('textbox', { name: 'Phone number' })).toBeVisible();
  });

  test('verify mode with no channels listed still offers a text message button', async ({ page }) => {
    // Set through the settings fixture: `codeLogin` always lists both channels. Nothing is sent, so no code route is needed.
    await installMocks(page, { tweakSettings: (s) => {
      s.login.phone = { available: true, mode: 'verify', channels: [] };
      s.login.email = { available: true, mode: 'verify' };
    } });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with phone number' }).click();
    await expect(page.getByRole('button', { name: 'Send code by text message' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send code by WhatsApp' })).toHaveCount(0);
  });

  test('fallback mode: today’s WhatsApp flow, no code route touched', async ({ page }) => {
    const mocks = await installMocks(page, { codeLogin: { phone: 'whatsapp' } });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with phone number' }).click();
    await expect(page.getByLabel('Country')).toHaveCount(0);
    await page.getByRole('button', { name: 'Continue with WhatsApp' }).click();
    await expect(page.getByText('NB-4417')).toBeVisible();
    await expect(page).toHaveURL(/\/account\/orders$/, { timeout: 30_000 });
    expect(mocks.state.codeCalls).toHaveLength(0);
  });
});

test.describe('email', () => {
  test('a new address: the code is sent at once, and the account is created by the code', async ({ page }) => {
    const mocks = await installMocks(page, { codeLogin: {} });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with email' }).click();
    await page.getByRole('textbox', { name: 'Email address' }).fill(' New.Shopper@Example.invalid ');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByText(/by email\.$/)).toBeVisible();
    await callCount(mocks, 'email').toBe(1);
    expect(calls(mocks, 'email')[0]!.body).toMatchObject({ email: 'new.shopper@example.invalid' });
    await codeBox(page).fill('123456');
    await expect(page).toHaveURL(/\/account\/orders$/);
  });

  test('a password account: password first, then "Email me a code instead"', async ({ page }) => {
    const mocks = await installMocks(page, { codeLogin: {}, passwordLogin: true });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with email' }).click();
    await page.getByRole('textbox', { name: 'Email address' }).fill(PASSWORD_ACCOUNT.email);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByText(`Enter the password for ${PASSWORD_ACCOUNT.email}.`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Forgot your password?' })).toBeVisible();
    // The password screen is on show, so the lookup has been answered; nothing was sent by email.
    expect(calls(mocks, 'email/send')).toHaveLength(0);
    await page.getByRole('button', { name: 'Email me a code instead' }).click();
    await expect(page.getByText(/by email\.$/)).toBeVisible();
    await callCount(mocks, 'email/send').toBe(1);
    expect(calls(mocks, 'email/send')[0]!.body).toMatchObject({ email: PASSWORD_ACCOUNT.email });
    await codeBox(page).fill('123456');
    await expect(page).toHaveURL(/\/account\/orders$/);
  });

  test('a password account can still just type the password', async ({ page }) => {
    const mocks = await installMocks(page, { codeLogin: {}, passwordLogin: true });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with email' }).click();
    await page.getByRole('textbox', { name: 'Email address' }).fill(PASSWORD_ACCOUNT.email);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Password', { exact: true }).fill('not the password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Email/phone or password is incorrect');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD_ACCOUNT.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/account\/orders$/);
    await expect.poll(() => mocks.state.passwordCalls.filter((c) => c.route === 'POST storefront/auth/password/login').length).toBe(2);
  });

  test('forgot password sends a reset link when the shop can, and stays on the same screen', async ({ page }) => {
    const mocks = await installMocks(page, { codeLogin: {}, passwordLogin: { resetByEmail: true } });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with email' }).click();
    await page.getByRole('textbox', { name: 'Email address' }).fill(PASSWORD_ACCOUNT.email);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Forgot your password?' }).click();
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toHaveText('If an account exists for that address, a link is on its way.');
    await expect.poll(() => mocks.state.passwordCalls.some((c) => c.route === 'POST storefront/auth/password/forgot')).toBe(true);
  });

  test('email fallback mode behaves the same to the shopper', async ({ page }) => {
    await installMocks(page, { codeLogin: { phone: 'off', email: 'email' } });
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Continue with phone number' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Continue with email' }).click();
    await page.getByRole('textbox', { name: 'Email address' }).fill('new.shopper@example.invalid');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await codeBox(page).fill('123456');
    await expect(page).toHaveURL(/\/account\/orders$/);
  });
});

test.describe('errors', () => {
  test('sign-in by code being down is one sentence pointing at another way', async ({ page }) => {
    await installMocks(page, { codeLogin: { down: true } });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with email' }).click();
    await page.getByRole('textbox', { name: 'Email address' }).fill('new.shopper@example.invalid');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Sign-in by code isn’t working right now. Please try another way');
  });

  test('an expired code offers a new one, which repeats the original send', async ({ page }) => {
    const mocks = await installMocks(page, { codeLogin: { expired: true } });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with phone number' }).click();
    await page.getByRole('textbox', { name: 'Phone number' }).fill('07700 900123');
    await page.getByRole('button', { name: 'Send code by WhatsApp' }).click();
    await codeBox(page).fill('123456');
    await expect(page.getByRole('alert')).toHaveText('That code has expired. We can send a new one');
    // Expired takes the resend and channel links away and puts focus on the one way forward.
    await expect(page.getByRole('button', { name: 'Send a new code' })).toBeFocused();
    await expect(page.getByRole('button', { name: /^Resend code/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Send a new code' }).click();
    await callCount(mocks, 'phone').toBe(2);
    expect(calls(mocks, 'resend')).toHaveLength(0);
  });

  test('a new customer at a shop that has closed registration is refused with the shop’s sentence', async ({ page }) => {
    await installMocks(page, { codeLogin: {}, access: { registration: false } });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with email' }).click();
    await page.getByRole('textbox', { name: 'Email address' }).fill('new.shopper@example.invalid');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await codeBox(page).fill('123456');
    await expect(page.getByRole('alert')).toHaveText('This shop isn’t taking new customers right now.');
    await expect(page).toHaveURL(/\/login$/);
  });
});
