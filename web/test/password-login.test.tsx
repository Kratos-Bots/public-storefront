import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { ApiError } from '@/lib/errors.ts';

const h = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  onLogin: vi.fn(), mint: vi.fn(), login: vi.fn(), signup: vi.fn(), forgot: vi.fn(),
}));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => h.settings }));
vi.mock('@/features/auth/useLoginSuccess.ts', () => ({ useLoginSuccess: () => h.onLogin }));
vi.mock('@/api/auth.ts', () => ({ passwordLogin: h.login, passwordSignup: h.signup, passwordForgot: h.forgot }));
vi.mock('@/features/checkout/GuestTurnstile.tsx', async () => {
  const { createElement, forwardRef, useImperativeHandle } = await import('react');
  return {
    GuestTurnstile: forwardRef((_props: { siteKey: string }, ref) => {
      useImperativeHandle(ref, () => ({ mint: h.mint }));
      return createElement('span', { 'data-testid': 'turnstile' });
    }),
  };
});

import { PasswordLogin } from '@/features/auth/PasswordLogin.tsx';

const RESULT = { token: 'tok', customer: { id: 1, nickname: 'Ada' } };

interface Opts {
  turnstile?: boolean;
  reset?: { resetByEmail?: boolean; resetByWhatsapp?: boolean };
  number?: string | null;
}
function configure(o: Opts = {}) {
  h.settings = {
    brand: { name: 'Northbound Supply', shortName: 'Northbound', links: { whatsapp: null, telegram: null } },
    supportLinks: [{ label: 'Delivery and returns', url: 'https://example.invalid/delivery' }],
    contactModes: { phoneMode: 'optional', emailMode: 'required', defaultPhoneCountry: 'GB' },
    turnstile: o.turnstile === false ? null : { siteKey: 'site-key' },
    login: {
      whatsapp: { available: true, number: o.number === undefined ? '447700900123' : o.number },
      telegram: { available: false, botUsername: null },
      password: { available: true, resetByEmail: false, resetByWhatsapp: false, ...o.reset },
    },
  };
}

beforeEach(() => {
  h.onLogin.mockReset().mockResolvedValue(undefined);
  h.login.mockReset().mockResolvedValue(RESULT);
  h.signup.mockReset().mockResolvedValue(RESULT);
  h.forgot.mockReset().mockResolvedValue({ ok: true });
  h.mint.mockReset().mockResolvedValue('ts-token');
  configure();
});
afterEach(cleanup);

const mount = () => render(<MantineProvider env="test"><MemoryRouter><PasswordLogin /></MemoryRouter></MantineProvider>);
const email = () => screen.getByLabelText('Email address') as HTMLInputElement;
const secret = (label = 'Password') => screen.getByLabelText(label) as HTMLInputElement;
const button = (name: string) => screen.getByRole('button', { name });
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

describe('sign in', () => {
  it('opens in sign-in mode with the email fields and no Turnstile', () => {
    mount();
    expect(button('Email').getAttribute('aria-pressed')).toBe('true');
    expect(button('Phone').getAttribute('aria-pressed')).toBe('false');
    expect(email().closest('form')).not.toBeNull();
    expect(secret().type).toBe('password');
    expect(secret().getAttribute('autocomplete')).toBe('current-password');
    expect(button('Sign in').getAttribute('data-sf-part')).toBe('button');
    expect(button('Sign in').getAttribute('data-variant')).toBe('filled');
    expect(screen.queryByTestId('turnstile')).toBeNull();
  });

  it('the Phone switch swaps the email field for the dial-code picker and the number field, defaulting the country', () => {
    mount();
    fireEvent.click(button('Phone'));
    expect(button('Phone').getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByLabelText('Email address')).toBeNull();
    expect((screen.getByLabelText('Phone country code') as HTMLSelectElement).value).toBe('GB');
    expect(screen.getByLabelText('Phone')).toBeTruthy();
  });

  it('submits a phone typed with spaces as +CC… with the country hint', async () => {
    mount();
    fireEvent.click(button('Phone'));
    type(screen.getByLabelText('Phone'), '07700 900123');
    type(secret(), 'pw-pw-pw-pw');
    fireEvent.click(button('Sign in'));
    await waitFor(() => expect(h.login).toHaveBeenCalledWith({ phone: '+4407700900123', phoneCountry: 'GB' }, 'pw-pw-pw-pw'));
    expect(h.onLogin).toHaveBeenCalledWith(RESULT);
  });

  it('Enter submits (the card is a real form) and the password is not trimmed', async () => {
    mount();
    type(email(), 'Ada@Example.com');
    type(secret(), ' spaced out ');
    fireEvent.submit(email().closest('form')!);
    await waitFor(() => expect(h.login).toHaveBeenCalledWith({ email: 'ada@example.com' }, ' spaced out '));
  });

  it('shows the rejection as an alert, keeps the typed values and re-enables the button', async () => {
    h.login.mockRejectedValue(new ApiError(401, 'Invalid credentials'));
    mount();
    type(email(), 'a@b.co');
    type(secret(), 'wrong password');
    fireEvent.click(button('Sign in'));
    expect((await screen.findByRole('alert')).textContent).toBe('Email/phone or password is incorrect');
    expect(email().value).toBe('a@b.co');
    expect(secret().value).toBe('wrong password');
    expect((button('Sign in') as HTMLButtonElement).disabled).toBe(false);
  });

  it('a 429 shows the rate-limit sentence', async () => {
    h.login.mockRejectedValue(new ApiError(429, 'Too many requests'));
    mount();
    type(email(), 'a@b.co');
    type(secret(), 'pw-pw-pw-pw');
    fireEvent.click(button('Sign in'));
    expect((await screen.findByRole('alert')).textContent).toBe('Too many attempts — please wait a moment and try again');
  });

  it('blocks a second click while the request is in the air and relabels the button', async () => {
    let finish!: (v: unknown) => void;
    h.login.mockReturnValue(new Promise((res) => { finish = res; }));
    mount();
    type(email(), 'a@b.co');
    type(secret(), 'pw-pw-pw-pw');
    fireEvent.click(button('Sign in'));
    const busy = await screen.findByRole('button', { name: 'One moment…' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(busy);
    expect(h.login).toHaveBeenCalledTimes(1);
    finish(RESULT);
    await waitFor(() => expect(h.onLogin).toHaveBeenCalled());
  });

  it('disables the mode links and the Email | Phone switch while the request is in the air', async () => {
    let finish!: (v: unknown) => void;
    h.login.mockReturnValue(new Promise((res) => { finish = res; }));
    mount();
    type(email(), 'a@b.co');
    type(secret(), 'pw-pw-pw-pw');
    fireEvent.click(button('Sign in'));
    await screen.findByRole('button', { name: 'One moment…' });
    for (const name of ['Email', 'Phone', 'Forgot your password?', 'Create an account']) {
      expect((button(name) as HTMLButtonElement).disabled).toBe(true);
    }
    fireEvent.click(button('Create an account'));
    expect(screen.queryByLabelText('Create a password')).toBeNull();
    finish(RESULT);
    await waitFor(() => expect(h.onLogin).toHaveBeenCalled());
    await waitFor(() => expect((button('Phone') as HTMLButtonElement).disabled).toBe(false));
    expect((button('Forgot your password?') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('create account', () => {
  it('asks for one new-password field with the length rule, no confirm field, and mounts Turnstile', () => {
    mount();
    fireEvent.click(button('Create an account'));
    expect(secret('Create a password').getAttribute('autocomplete')).toBe('new-password');
    expect(screen.getByText('Use at least 8 characters.')).toBeTruthy();
    expect(screen.queryByLabelText(/confirm/i)).toBeNull();
    expect(screen.getByTestId('turnstile')).toBeTruthy();
    expect(button('Create account')).toBeTruthy();
  });

  it('mints a token per submit and shows the generic "taken" sentence on a 409', async () => {
    h.mint.mockReset().mockResolvedValueOnce('t1').mockResolvedValueOnce('t2');
    h.signup.mockRejectedValueOnce(new ApiError(409, 'taken')).mockResolvedValueOnce(RESULT);
    mount();
    fireEvent.click(button('Create an account'));
    type(email(), 'a@b.co');
    type(secret('Create a password'), 'pw-pw-pw-pw');
    fireEvent.click(button('Create account'));
    expect((await screen.findByRole('alert')).textContent).toBe('That email or phone can’t be used to create an account. Try signing in or resetting your password.');
    fireEvent.click(button('Create account'));
    await waitFor(() => expect(h.onLogin).toHaveBeenCalledWith(RESULT));
    expect(h.signup.mock.calls.map((c) => c[2])).toEqual(['t1', 't2']);
  });

  it('refuses a short password under the field and sends nothing', () => {
    mount();
    fireEvent.click(button('Create an account'));
    type(email(), 'a@b.co');
    type(secret('Create a password'), 'short');
    fireEvent.click(button('Create account'));
    expect(screen.getByText('Use at least 8 characters')).toBeTruthy();
    expect(h.signup).not.toHaveBeenCalled();
  });

  it('without a Turnstile key there is no widget', () => {
    configure({ turnstile: false });
    mount();
    fireEvent.click(button('Create an account'));
    expect(screen.queryByTestId('turnstile')).toBeNull();
  });

  it('"I already have an account" returns to sign-in keeping the email and clearing the password', () => {
    mount();
    type(email(), 'a@b.co');
    fireEvent.click(button('Create an account'));
    type(secret('Create a password'), 'pw-pw-pw-pw');
    fireEvent.click(button('I already have an account'));
    expect(email().value).toBe('a@b.co');
    expect(secret().value).toBe('');
  });
});

describe('forgot password', () => {
  const openForgot = () => fireEvent.click(button('Forgot your password?'));

  it('by email: a form, a token, and the neutral note; editing the address hides the note', async () => {
    configure({ reset: { resetByEmail: true } });
    mount();
    openForgot();
    expect(screen.getByText('Reset your password')).toBeTruthy();
    expect(screen.getByTestId('turnstile')).toBeTruthy();
    type(email(), 'ada@example.com');
    fireEvent.click(button('Send reset link'));
    await waitFor(() => expect(h.forgot).toHaveBeenCalledWith('ada@example.com', 'ts-token'));
    expect((await screen.findByRole('status')).textContent).toBe('If an account exists for that address, a link is on its way.');
    type(email(), 'ada@example.org');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('by phone with WhatsApp reset: an outbound link and no form', () => {
    configure({ reset: { resetByWhatsapp: true } });
    mount();
    openForgot();
    fireEvent.click(button('Phone'));
    const link = screen.getByRole('link', { name: 'Message us on WhatsApp' });
    expect(link.getAttribute('href')).toBe('https://wa.me/447700900123?text=RESET%20PASSWORD');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.queryByRole('button', { name: 'Send reset link' })).toBeNull();
    expect(screen.getByText(/use the link we already sent/)).toBeTruthy();
    expect(screen.queryByTestId('turnstile')).toBeNull();
  });

  it.each([
    ['email with no email delivery', { reset: { resetByWhatsapp: true } }, false],
    ['phone with no WhatsApp reset', { reset: { resetByEmail: true } }, true],
    ['phone, WhatsApp reset on but no number to message', { reset: { resetByWhatsapp: true }, number: null }, true],
  ] as const)('%s: a note and the other ways in, never a form that pretends to send', (_name, opts, phone) => {
    configure(opts);
    mount();
    openForgot();
    if (phone) fireEvent.click(button('Phone'));
    expect(screen.getByText(/Password reset isn’t available online yet/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send reset link' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Message us on WhatsApp' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Delivery and returns' }).getAttribute('href')).toBe('https://example.invalid/delivery');
  });

  it('"Back to sign in" returns to the sign-in form', () => {
    mount();
    openForgot();
    fireEvent.click(button('Back to sign in'));
    expect(button('Sign in')).toBeTruthy();
  });
});
