import { expect, test } from '@playwright/test';
import { FIXED_NOW } from './flows.ts';
import { installMocks, PASSWORD_ACCOUNT, RESET_TOKENS, VERIFY_TOKENS, type Layout } from './mocks.ts';

const LAYOUTS: Layout[] = ['storefront', 'menu', 'webapp'];
const MOBILE = { width: 390, height: 844 };

test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(FIXED_NOW); });

const fillSignIn = async (page: import('@playwright/test').Page, email: string, password: string) => {
  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
};

test.describe('sign in', () => {
  test.use({ viewport: MOBILE });

  for (const layout of LAYOUTS) {
  test(`sign in with email and password · ${layout}`, async ({ page }) => {
    const mocks = await installMocks(page, { layout, passwordLogin: true });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Email or phone' })).toBeVisible();
    // A pasted address with stray spaces and capitals; the password is sent exactly as typed.
    await fillSignIn(page, ` ${PASSWORD_ACCOUNT.email.toUpperCase()} `, PASSWORD_ACCOUNT.password);
    await expect(page).toHaveURL(/\/account\/orders$/);
    const call = mocks.state.passwordCalls.find((c) => c.route === 'POST storefront/auth/password/login')!;
    expect(call.body).toEqual({ email: PASSWORD_ACCOUNT.email, password: PASSWORD_ACCOUNT.password });
  });
  }
});

test.describe('sign-in details', () => {
  test.use({ viewport: MOBILE });

  test('a phone typed with spaces and a trunk zero signs in; the country hint travels with it', async ({ page }) => {
    const mocks = await installMocks(page, { passwordLogin: true });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Phone', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Phone country code' })).toHaveValue('GB');
    await page.getByRole('textbox', { name: 'Phone', exact: true }).fill('07700 900123');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD_ACCOUNT.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/account\/orders$/);
    const call = mocks.state.passwordCalls.find((c) => c.route === 'POST storefront/auth/password/login')!;
    expect(call.body).toEqual({ phone: '+4407700900123', phoneCountry: 'GB', password: PASSWORD_ACCOUNT.password });
  });

  test('a wrong password is one sentence and the form stays usable', async ({ page }) => {
    await installMocks(page, { passwordLogin: true });
    await page.goto('/login');
    await fillSignIn(page, PASSWORD_ACCOUNT.email, 'not the password');
    await expect(page.getByRole('alert')).toHaveText('Email/phone or password is incorrect');
    await expect(page.getByRole('textbox', { name: 'Email address' })).toHaveValue(PASSWORD_ACCOUNT.email);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('a throttled identifier shows the rate-limit sentence', async ({ page }) => {
    await installMocks(page, { passwordLogin: { throttled: true } });
    await page.goto('/login');
    await fillSignIn(page, PASSWORD_ACCOUNT.email, PASSWORD_ACCOUNT.password);
    await expect(page.getByRole('alert')).toHaveText('Too many attempts — please wait a moment and try again');
  });

  test('the old "coming soon" card is gone', async ({ page }) => {
    await installMocks(page, { passwordLogin: true });
    await page.goto('/login');
    await expect(page.getByText('Coming soon')).toHaveCount(0);
  });
});

test.describe('create an account', () => {
  test.use({ viewport: MOBILE });

  test('signs up with a Turnstile token, lands on the account, and a taken address is refused with the generic sentence', async ({ page }) => {
    const mocks = await installMocks(page, { passwordLogin: true });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Create an account' }).click();

    await page.getByRole('textbox', { name: 'Email address' }).fill(PASSWORD_ACCOUNT.email);
    await page.getByLabel('Create a password', { exact: true }).fill('a brand new password');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('That email or phone can’t be used to create an account. Try signing in or resetting your password.');

    await page.getByRole('textbox', { name: 'Email address' }).fill('new.shopper@example.invalid');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page).toHaveURL(/\/account\/orders$/);

    const signups = mocks.state.passwordCalls.filter((c) => c.route === 'POST storefront/auth/password/signup');
    expect(signups).toHaveLength(2);
    expect(signups[1]!.body).toMatchObject({ email: 'new.shopper@example.invalid', password: 'a brand new password' });
    expect(new Set(signups.map((s) => s.body.turnstileToken)).size).toBe(2); // a fresh token per submit
  });
});

test.describe('forgot password', () => {
  test.use({ viewport: MOBILE });

  test('by phone, with WhatsApp reset on, links out to the shop with the fixed keyword', async ({ page }) => {
    await installMocks(page, { passwordLogin: { resetByWhatsapp: true } });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Forgot your password?' }).click();
    await page.getByRole('button', { name: 'Phone', exact: true }).click();
    const link = page.getByRole('link', { name: 'Message us on WhatsApp' });
    await expect(link).toHaveAttribute('href', 'https://wa.me/447700900123?text=RESET%20PASSWORD');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(page.getByRole('button', { name: 'Send reset link' })).toHaveCount(0);
  });

  test('by email, with email delivery on, shows the neutral sentence', async ({ page }) => {
    const mocks = await installMocks(page, { passwordLogin: { resetByEmail: true } });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Forgot your password?' }).click();
    await page.getByRole('textbox', { name: 'Email address' }).fill('nobody@example.invalid');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toHaveText('If an account exists for that address, a link is on its way.');
    expect(mocks.state.passwordCalls.some((c) => c.route === 'POST storefront/auth/password/forgot')).toBe(true);
  });

  test('with no way to send a link the card says so and offers no form', async ({ page }) => {
    await installMocks(page, { passwordLogin: true });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Forgot your password?' }).click();
    await expect(page.getByText(/Password reset isn’t available online yet/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send reset link' })).toHaveCount(0);
  });
});

test.describe('reset by link', () => {
  test.use({ viewport: MOBILE });

  for (const layout of LAYOUTS) {
    test(`a good link sets the password and signs in · ${layout}`, async ({ page }) => {
      const mocks = await installMocks(page, { layout });
      await page.goto(`/reset-password?token=${RESET_TOKENS.reset}`);
      await expect(page.getByRole('heading', { name: 'Choose a new password', level: 1 })).toBeVisible();
      await page.getByLabel('New password', { exact: true }).fill('a new password!');
      await page.getByRole('button', { name: 'Save password' }).click();
      await expect(page).toHaveURL(/\/account\/orders$/);
      const call = mocks.state.passwordCalls.find((c) => c.route === 'POST storefront/auth/password/reset')!;
      expect(call.body).toEqual({ token: RESET_TOKENS.reset, password: 'a new password!' });
    });
  }

  test('a customer with no password yet is asked to choose one', async ({ page }) => {
    await installMocks(page);
    await page.goto(`/reset-password?token=${RESET_TOKENS.set}`);
    await expect(page.getByRole('heading', { name: 'Choose a password', level: 1 })).toBeVisible();
  });

  test('an unknown or used link says it has expired and goes back to sign-in', async ({ page }) => {
    const mocks = await installMocks(page);
    await page.goto(`/reset-password?token=${RESET_TOKENS.used}`);
    await expect(page.getByRole('heading', { name: 'This link has expired', level: 1 })).toBeVisible();
    await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Back to sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(mocks.state.passwordCalls.some((c) => c.route === 'POST storefront/auth/password/reset')).toBe(false);
  });

  test('a closed shop cannot reset', async ({ page }) => {
    await installMocks(page, { tweakSettings: (s) => { s.enabled = false; } });
    await page.goto(`/reset-password?token=${RESET_TOKENS.reset}`);
    await expect(page.getByText("We're closed while we restock.")).toBeVisible();
    await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
  });
});

test.describe('the profile Password section', () => {
  test.use({ viewport: MOBILE });

  test('sets a first password, then a wrong current password is a field error and the shopper stays signed in', async ({ page }) => {
    const mocks = await installMocks(page, { passwordLogin: true, session: true });
    await page.goto('/account/profile');
    await expect(page.getByRole('region', { name: 'Password' })).toBeVisible();
    await expect(page.getByText('No password yet. Set one to sign in with your email or phone.')).toBeVisible();
    await page.getByRole('button', { name: 'Set a password' }).click();
    await expect(page.getByRole('textbox', { name: 'Email address' })).toHaveCount(0); // the account has a WhatsApp number
    await page.getByLabel('New password', { exact: true }).fill('a new password');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page.getByText('Password saved.')).toBeVisible();
    const put = mocks.state.passwordCalls.find((c) => c.route === 'PUT storefront/account/password')!;
    expect(put.body).toEqual({ newPassword: 'a new password' });
    expect(put.authorization).toBe('Bearer e2e-session-token');

    // The profile is now "password set": changing it needs the current one.
    await page.reload();
    await page.getByRole('button', { name: 'Change password' }).click();
    await page.getByLabel('Current password', { exact: true }).fill('a typo');
    await page.getByLabel('New password', { exact: true }).fill('another new password');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page.getByText('Your current password is incorrect')).toBeVisible();
    await expect(page).toHaveURL(/\/account\/profile$/); // not sent to /login: the 422 never clears the session
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  test('a Telegram-only account is asked which email it signs in with', async ({ page }) => {
    const mocks = await installMocks(page, {
      passwordLogin: true, session: true,
      tweakProfile: (p) => { p.identities = { telegram: true, whatsapp: false, email: false }; },
    });
    await page.goto('/account/profile');
    await page.getByRole('button', { name: 'Set a password' }).click();
    await page.getByRole('textbox', { name: 'Email address' }).fill('tg.shopper@example.invalid');
    await page.getByLabel('New password', { exact: true }).fill('a new password');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page.getByText('Password saved.')).toBeVisible();
    const put = mocks.state.passwordCalls.find((c) => c.route === 'PUT storefront/account/password')!;
    expect(put.body).toEqual({ newPassword: 'a new password', email: 'tg.shopper@example.invalid' });
  });

  test('the section is absent while password sign-in is off', async ({ page }) => {
    await installMocks(page, { session: true });
    await page.goto('/account/profile');
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Password' })).toHaveCount(0);
  });
});

test.describe('confirming an email', () => {
  test.use({ viewport: MOBILE });

  test('a signed-out visitor is sent to sign in and comes back to the same link, which then confirms exactly once', async ({ page }) => {
    const mocks = await installMocks(page, { passwordLogin: true });
    await page.goto(`/verify-email?token=${VERIFY_TOKENS.ok}`);
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fverify-email%3Ftoken%3DVERIFY-OK$/);
    await fillSignIn(page, PASSWORD_ACCOUNT.email, PASSWORD_ACCOUNT.password);
    await expect(page).toHaveURL(`/verify-email?token=${VERIFY_TOKENS.ok}`);
    await expect(page.getByText('Email confirmed')).toBeVisible();
    expect(mocks.state.passwordCalls.filter((c) => c.route === 'POST storefront/auth/email/verify')).toHaveLength(1);
  });

  test("another account's link says so", async ({ page }) => {
    await installMocks(page, { session: true });
    await page.goto(`/verify-email?token=${VERIFY_TOKENS.other}`);
    await expect(page.getByText('This link is for a different account')).toBeVisible();
  });

  test('an expired link says so', async ({ page }) => {
    await installMocks(page, { session: true });
    await page.goto('/verify-email?token=SOMETHING-OLD');
    await expect(page.getByText('This link has expired')).toBeVisible();
  });
});
