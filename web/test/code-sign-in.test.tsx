import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { forwardRef, useImperativeHandle } from 'react';
import { ApiError } from '@/lib/errors.ts';
import { codeSettings, type CodeSettingsOpts } from './helpers/code-settings.ts';

const h = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  onLogin: vi.fn(),
  codeEmail: vi.fn(), codeEmailSend: vi.fn(), codePhone: vi.fn(), codeResend: vi.fn(), codeVerify: vi.fn(),
  passwordLogin: vi.fn(), passwordForgot: vi.fn(), mint: vi.fn(),
}));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => h.settings }));
vi.mock('@/features/auth/useLoginSuccess.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/auth/useLoginSuccess.ts')>()),
  useLoginSuccess: () => h.onLogin,
}));
vi.mock('@/api/auth.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/auth.ts')>()),
  codeEmail: h.codeEmail, codeEmailSend: h.codeEmailSend, codePhone: h.codePhone, codeResend: h.codeResend, codeVerify: h.codeVerify,
  passwordLogin: h.passwordLogin, passwordForgot: h.passwordForgot, loginTelegram: vi.fn(),
}));
vi.mock('@/features/checkout/GuestTurnstile.tsx', async () => {
  const { createElement } = await import('react');
  return { GuestTurnstile: forwardRef((_p, ref) => { useImperativeHandle(ref, () => ({ mint: h.mint })); return createElement('span', { 'data-testid': 'turnstile' }); }) };
});
vi.mock('@/features/auth/TelegramLogin.tsx', async () => {
  const { createElement } = await import('react');
  return { TelegramLogin: () => createElement('button', { type: 'button' }, 'Continue with Telegram') };
});
vi.mock('@/features/auth/WhatsappLogin.tsx', async () => {
  const { createElement } = await import('react');
  return { WhatsappLogin: () => createElement('p', null, 'WHATSAPP CARD') };
});

import { LoginOptions } from '@/features/auth/LoginOptions.tsx';

const SENT = (o: Record<string, unknown> = {}) => ({ next: 'code', attemptId: 'att-1', channel: 'whatsapp', maskedTo: '+44 •••• 0123', resendAfter: 60, ...o });
const LANG = { language: 'en' };
const LOGIN = { token: 'tok', customer: { id: 1, nickname: 'Ada' } };
const configure = (o: CodeSettingsOpts = {}) => { h.settings = codeSettings(o); };
const shell = () => render(
  <MantineProvider env="test"><QueryClientProvider client={new QueryClient()}><MemoryRouter><LoginOptions /></MemoryRouter></QueryClientProvider></MantineProvider>,
);
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const queryButton = (name: string | RegExp) => screen.queryByRole('button', { name });
const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const settle = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  h.mint.mockReset().mockResolvedValue('ts-1');
  for (const f of [h.codeEmail, h.codeEmailSend, h.codePhone, h.codeResend, h.codeVerify, h.passwordLogin, h.passwordForgot]) f.mockReset();
  h.onLogin.mockReset().mockResolvedValue(undefined);
  h.codePhone.mockResolvedValue(SENT());
  h.codeEmail.mockResolvedValue(SENT({ channel: 'email', maskedTo: 'a***@example.com' }));
  h.codeEmailSend.mockResolvedValue(SENT({ channel: 'email', maskedTo: 'a***@example.com' }));
  h.codeVerify.mockResolvedValue({ status: 'signed_in', ...LOGIN, isNew: false });
  h.passwordLogin.mockResolvedValue(LOGIN);
  h.passwordForgot.mockResolvedValue({ ok: true });
  configure();
});
afterEach(cleanup);

describe('the opening choice', () => {
  it('is three big buttons in the spec order, and a line for newcomers', () => {
    configure({ telegram: true });
    shell();
    const names = screen.getAllByRole('button').map((b) => b.textContent);
    expect(names).toEqual(['Continue with phone number', 'Continue with Telegram', 'Continue with email']);
    expect(screen.getByText('New here? You’ll create your account as you sign in.')).toBeTruthy();
    expect(queryButton('Continue with WhatsApp')).toBeNull();
  });

  it('drops the newcomer line when registration is closed', () => {
    configure({ registration: false });
    shell();
    expect(screen.queryByText(/New here\?/)).toBeNull();
  });

  it('shows only what works: email only, phone only, or a block that is off', () => {
    configure({ phone: 'off' });
    shell();
    expect(queryButton('Continue with phone number')).toBeNull();
    expect(button('Continue with email')).toBeTruthy();
    cleanup();
    configure({ email: 'off' });
    shell();
    expect(button('Continue with phone number')).toBeTruthy();
    expect(queryButton('Continue with email')).toBeNull();
    cleanup();
    configure({ phone: 'absent', email: 'verify' });
    shell();
    expect(queryButton('Continue with phone number')).toBeNull();
    expect(button('Continue with email')).toBeTruthy();
  });

  it('a shop with passwords but no email codes still offers Email', () => {
    configure({ email: 'off', password: true, phone: 'off' });
    shell();
    expect(button('Continue with email')).toBeTruthy();
  });

  it('Telegram on its own is still a sign-in', () => {
    configure({ phone: 'off', email: 'off', telegram: true });
    shell();
    expect(button('Continue with Telegram')).toBeTruthy();
    expect(screen.queryByText('Sign-in isn’t available right now')).toBeNull();
  });

  it('nothing at all is the existing "not available" panel', () => {
    configure({ phone: 'off', email: 'off' });
    shell();
    expect(screen.getByText('Sign-in isn’t available right now')).toBeTruthy();
  });

  it('the Turnstile widget is not loaded until a step that sends', () => {
    configure({ turnstile: true });
    shell();
    expect(screen.queryByTestId('turnstile')).toBeNull();
    fireEvent.click(button('Continue with phone number'));
    expect(screen.getByTestId('turnstile')).toBeTruthy();
  });
});

describe('phone', () => {
  const open = () => { shell(); fireEvent.click(button('Continue with phone number')); };

  it('puts the shop country first and offers WhatsApp and text message, nothing else', () => {
    open();
    const select = screen.getByLabelText('Country') as HTMLSelectElement;
    expect(select.value).toBe('GB');
    expect(select.querySelector('optgroup')!.label).toBe('Suggested');
    expect(button('Send code by WhatsApp')).toBeTruthy();
    expect(button('Send code by text message')).toBeTruthy();
    expect(queryButton(/Continue with WhatsApp/)).toBeNull();
  });

  it('offers only the channels the backend lists', () => {
    configure({ channels: ['sms'] });
    open();
    expect(queryButton('Send code by WhatsApp')).toBeNull();
    expect(button('Send code by text message')).toBeTruthy();
  });

  it('sends a national number with the chosen country and opens the code screen', async () => {
    open();
    type('Phone number', '07700 900123');
    fireEvent.click(button('Send code by WhatsApp'));
    await settle();
    expect(h.codePhone).toHaveBeenCalledWith('+4407700900123', 'whatsapp', undefined, LANG);
    expect(screen.getByRole('heading', { name: 'Enter your code' })).toBeTruthy();
  });

  it.each([['+44 7700 900123'], ['0044 7700 900123']])('an international number (%s) wins over the picker', async (typed) => {
    open();
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'FR' } });
    type('Phone number', typed);
    fireEvent.click(button('Send code by text message'));
    await settle();
    expect(h.codePhone).toHaveBeenCalledWith('+447700900123', 'sms', undefined, LANG);
  });

  it('a national number with no country chosen asks for the country and sends nothing', async () => {
    configure({ defaultCountry: null });
    open();
    type('Phone number', '7700900123');
    fireEvent.click(button('Send code by WhatsApp'));
    await settle();
    expect(screen.getByText('Choose your country')).toBeTruthy();
    expect(h.codePhone).not.toHaveBeenCalled();
  });

  it.each([[''], ['abc'], ['12']])('"%s" is not a number: the field says so and nothing is sent', async (typed) => {
    open();
    type('Phone number', typed);
    fireEvent.click(button('Send code by WhatsApp'));
    await settle();
    expect(h.codePhone).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Phone number')).toHaveAttribute('aria-invalid', 'true');
  });

  it('a channel the number cannot get keeps the form and offers the other one', async () => {
    h.codePhone.mockRejectedValue(new ApiError(400, 'CODE_CHANNEL_UNAVAILABLE'));
    open();
    type('Phone number', '07700 900123');
    fireEvent.click(button('Send code by WhatsApp'));
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t send a WhatsApp message to that number. Try a text message instead');
    expect((screen.getByLabelText('Phone number') as HTMLInputElement).value).toBe('07700 900123');
    expect(button('Send code by text message')).toBeEnabled();
  });

  it('fallback mode reuses today’s WhatsApp flow and shows no country picker', () => {
    configure({ phone: 'whatsapp' });
    open();
    expect(screen.getByText('WHATSAPP CARD')).toBeTruthy();
    expect(screen.queryByLabelText('Country')).toBeNull();
    expect(h.codePhone).not.toHaveBeenCalled();
  });

  it('"Choose another way" goes back to the three buttons', () => {
    open();
    fireEvent.click(button('Choose another way'));
    expect(button('Continue with phone number')).toBeTruthy();
  });
});

describe('email', () => {
  const open = () => { shell(); fireEvent.click(button('Continue with email')); };
  const submit = async (value: string) => {
    type('Email address', value);
    fireEvent.click(button('Continue'));
    await settle();
  };

  it('a new address gets a code at once', async () => {
    open();
    await submit(' New@Example.com ');
    expect(h.codeEmail).toHaveBeenCalledWith('new@example.com', undefined, LANG);
    expect(screen.getByText('Enter the 6-digit code we sent to a***@example.com by email.')).toBeTruthy();
  });

  it('a bad address is a field error and no request', async () => {
    open();
    await submit('nope');
    expect(h.codeEmail).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Email address')).toHaveAttribute('aria-invalid', 'true');
  });

  it('a password account is asked for its password first, with "Email me a code instead" and Forgot', async () => {
    configure({ password: true });
    h.codeEmail.mockResolvedValue({ next: 'password' });
    open();
    await submit('ada@example.com');
    expect(screen.getByText('Enter the password for ada@example.com.')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(button('Sign in')).toBeTruthy();
    expect(button('Forgot your password?')).toBeTruthy();
    expect(button('Email me a code instead')).toBeTruthy();
    expect(h.codeEmailSend).not.toHaveBeenCalled();
  });

  it('"Email me a code instead" sends and opens the code screen', async () => {
    configure({ password: true });
    h.codeEmail.mockResolvedValue({ next: 'password' });
    open();
    await submit('ada@example.com');
    fireEvent.click(button('Email me a code instead'));
    await settle();
    expect(h.codeEmailSend).toHaveBeenCalledWith('ada@example.com', undefined, LANG);
    expect(screen.getByRole('heading', { name: 'Enter your code' })).toBeTruthy();
  });

  it('signs in with the password, and a wrong one is one sentence', async () => {
    configure({ password: true });
    h.codeEmail.mockResolvedValue({ next: 'password' });
    h.passwordLogin.mockRejectedValueOnce(new ApiError(401, 'Invalid credentials'));
    open();
    await submit('ada@example.com');
    type('Password', 'wrong');
    fireEvent.click(button('Sign in'));
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('Email/phone or password is incorrect');
    type('Password', 'right password');
    fireEvent.click(button('Sign in'));
    await settle();
    expect(h.passwordLogin).toHaveBeenLastCalledWith({ email: 'ada@example.com' }, 'right password');
    expect(h.onLogin).toHaveBeenCalledWith(LOGIN);
  });

  it('a shop with passwords but no email codes skips the request and offers no code button', async () => {
    configure({ email: 'off', password: true, phone: 'off' });
    open();
    await submit('ada@example.com');
    expect(h.codeEmail).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(queryButton('Email me a code instead')).toBeNull();
  });

  it('the old pieces are gone: no Create an account, no Email/Phone switch', async () => {
    configure({ password: true });
    h.codeEmail.mockResolvedValue({ next: 'password' });
    open();
    expect(screen.queryByRole('group', { name: 'Use your email or your phone' })).toBeNull();
    await submit('ada@example.com');
    expect(queryButton('Create an account')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Use your email or your phone' })).toBeNull();
  });

  it('forgot password: a reset link when the shop can email one, otherwise the contact copy', async () => {
    configure({ password: true, resetByEmail: true });
    h.codeEmail.mockResolvedValue({ next: 'password' });
    open();
    await submit('ada@example.com');
    fireEvent.click(button('Forgot your password?'));
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeTruthy();
    expect(screen.getByText('We’ll email a link for choosing a new password to ada@example.com.')).toBeTruthy();
    fireEvent.click(button('Send reset link'));
    await settle();
    expect(h.passwordForgot).toHaveBeenCalledWith('ada@example.com', undefined);
    expect(screen.getByRole('status')).toHaveTextContent('If an account exists for that address, a link is on its way.');
    fireEvent.click(button('Back to sign in'));
    expect(screen.getByLabelText('Password')).toBeTruthy();
    cleanup();
    configure({ password: true, resetByEmail: false });
    open();
    await submit('ada@example.com');
    fireEvent.click(button('Forgot your password?'));
    expect(screen.getByText(/Password reset isn’t available online yet/)).toBeTruthy();
    expect(queryButton('Send reset link')).toBeNull();
  });

  it('"Use a different email" goes back to the address', async () => {
    configure({ password: true });
    h.codeEmail.mockResolvedValue({ next: 'password' });
    open();
    await submit('ada@example.com');
    fireEvent.click(button('Use a different email'));
    expect(screen.getByLabelText('Email address')).toBeTruthy();
  });
});

describe('the whole round trip', () => {
  it('phone: send, type six digits, signed in through the shared success path', async () => {
    shell();
    fireEvent.click(button('Continue with phone number'));
    type('Phone number', '07700 900123');
    fireEvent.click(button('Send code by WhatsApp'));
    await settle();
    fireEvent.change(screen.getByRole('textbox', { name: '6-digit code' }), { target: { value: '123456' } });
    await settle();
    expect(h.codeVerify).toHaveBeenCalledWith('att-1', '123456');
    expect(h.onLogin).toHaveBeenCalledWith(LOGIN);
  });

  it('closed registration: a new customer’s code is refused with the shop’s sentence', async () => {
    configure({ registration: false });
    h.codeVerify.mockRejectedValue(new ApiError(403, 'REGISTRATION_CLOSED'));
    shell();
    fireEvent.click(button('Continue with phone number'));
    type('Phone number', '07700 900123');
    fireEvent.click(button('Send code by WhatsApp'));
    await settle();
    fireEvent.change(screen.getByRole('textbox', { name: '6-digit code' }), { target: { value: '123456' } });
    await settle();
    expect(within(screen.getByRole('alert')).getByText('This shop isn’t taking new customers right now.')).toBeTruthy();
  });
});

describe('phone autofill and the email button', () => {
  const open = () => { shell(); fireEvent.click(button('Continue with phone number')); };

  it('a +44 number with the matching country picked does not double the country code', async () => {
    open();
    type('Phone number', '+44 7700 900123');
    fireEvent.click(button('Send code by WhatsApp'));
    await settle();
    expect(h.codePhone).toHaveBeenCalledWith('+447700900123', 'whatsapp', undefined, LANG);
  });

  it('a 0044 number with the matching country picked does not double the country code', async () => {
    open();
    type('Phone number', '0044 7700 900123');
    fireEvent.click(button('Send code by WhatsApp'));
    await settle();
    expect(h.codePhone).toHaveBeenCalledWith('+447700900123', 'whatsapp', undefined, LANG);
  });

  it('an international number needs no country picked at all', async () => {
    configure({ defaultCountry: null });
    open();
    type('Phone number', '+44 7700 900123');
    fireEvent.click(button('Send code by text message'));
    await settle();
    expect(h.codePhone).toHaveBeenCalledWith('+447700900123', 'sms', undefined, LANG);
  });

  it('never shows Email when neither an email code nor a password can follow it', () => {
    configure({ email: 'off', password: false });
    shell();
    expect(queryButton('Continue with email')).toBeNull();
    cleanup();
    configure({ email: 'absent', phone: 'verify', password: false });
    shell();
    expect(queryButton('Continue with email')).toBeNull();
  });
});

describe('the page heading line', () => {
  it('shows on the opening choice and goes away on every sub-step, which own their titles', async () => {
    const { LoginPage } = await import('@/features/auth/LoginPage.tsx');
    await import('@/builder/render.tsx');
    render(<MantineProvider env="test"><QueryClientProvider client={new QueryClient()}><MemoryRouter><LoginPage /></MemoryRouter></QueryClientProvider></MantineProvider>);
    const lede = 'Choose how you’d like to sign in.';
    expect(await screen.findByText(lede)).toBeTruthy();
    fireEvent.click(button('Continue with phone number'));
    expect(screen.queryByText(lede)).toBeNull();
    fireEvent.click(button('Choose another way'));
    expect(screen.getByText(lede)).toBeTruthy();
  });
});
