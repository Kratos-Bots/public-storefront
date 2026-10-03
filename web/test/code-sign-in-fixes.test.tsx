import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
const LOGIN = { token: 'tok', customer: { id: 1, nickname: 'Ada' } };
const configure = (o: CodeSettingsOpts = {}) => { h.settings = codeSettings(o); };
const client = new QueryClient();
const tree = () => (
  <MantineProvider env="test"><QueryClientProvider client={client}><MemoryRouter><LoginOptions /></MemoryRouter></QueryClientProvider></MantineProvider>
);
let current: ReturnType<typeof render>;
const shell = () => (current = render(tree()));
const rerenderCurrent = () => current.rerender(tree());
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


const choose = () => {
  expect(button('Continue with email')).toBeTruthy();
};
const codeBox = () => screen.getByRole('textbox', { name: '6-digit code' });
const toCodeScreen = async () => {
  shell();
  fireEvent.click(button('Continue with phone number'));
  type('Phone number', '07700 900123');
  fireEvent.click(button('Send code by WhatsApp'));
  await settle();
};

describe('settings that change under the shopper never leave a blank screen', () => {
  it('phone step: phone switched off returns to the list', () => {
    const view = shell();
    fireEvent.click(button('Continue with phone number'));
    configure({ phone: 'off' });
    view.rerender(tree());
    choose();
    expect(queryButton('Continue with phone number')).toBeNull();
    expect(screen.queryByRole('heading', { name: /phone/i })).toBeNull();
  });

  it('"Use a different number" with phone now off lands on the list', async () => {
    await toCodeScreen();
    fireEvent.click(button('Use a different number'));
    configure({ phone: 'off' });
    rerenderCurrent();
    choose();
    expect(queryButton('Use a different number')).toBeNull();
  });

  it('code screen: a CODE_LOGIN_UNAVAILABLE answer, then the refetched settings, keep its sentence on the list', async () => {
    h.codeVerify.mockRejectedValue(new ApiError(404, 'CODE_LOGIN_UNAVAILABLE'));
    await toCodeScreen();
    fireEvent.change(codeBox(), { target: { value: '123456' } });
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in by code isn’t working right now. Please try another way');
    configure({ phone: 'off' });
    rerenderCurrent();
    await settle();
    choose();
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in by code isn’t working right now. Please try another way');
    expect(screen.queryByRole('textbox', { name: '6-digit code' })).toBeNull();
    expect(document.activeElement).toBe(screen.getAllByRole('button')[0]);
  });

  it('code screen: settings flipped with no failure still return to the list', async () => {
    await toCodeScreen();
    configure({ phone: 'off' });
    rerenderCurrent();
    await settle();
    choose();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('email step: email codes and passwords both off returns to the list', () => {
    configure({ password: true });
    const view = shell();
    fireEvent.click(button('Continue with email'));
    expect(screen.getByLabelText('Email address')).toBeTruthy();
    configure({ email: 'off', password: false });
    view.rerender(tree());
    expect(queryButton('Continue with email')).toBeNull();
    expect(button('Continue with phone number')).toBeTruthy();
    expect(screen.queryByLabelText('Email address')).toBeNull();
  });

  it('the list is usable afterwards: a way that still works opens normally', async () => {
    const view = shell();
    fireEvent.click(button('Continue with phone number'));
    configure({ phone: 'off' });
    view.rerender(tree());
    await settle();
    fireEvent.click(button('Continue with email'));
    expect(screen.getByLabelText('Email address')).toBeTruthy();
  });
});

describe('the phone step remembers what was typed', () => {
  it('"Use a different number" comes back with the number and the country', async () => {
    shell();
    fireEvent.click(button('Continue with phone number'));
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'FR' } });
    type('Phone number', '06 12 34 56 78');
    fireEvent.click(button('Send code by WhatsApp'));
    await settle();
    fireEvent.click(button('Use a different number'));
    expect((screen.getByLabelText('Phone number') as HTMLInputElement).value).toBe('06 12 34 56 78');
    expect((screen.getByLabelText('Country') as HTMLSelectElement).value).toBe('FR');
  });
});

describe('focus after a failed send', () => {
  it('goes back to the button that was pressed', async () => {
    h.codePhone.mockRejectedValue(new ApiError(400, 'CODE_CHANNEL_UNAVAILABLE'));
    shell();
    fireEvent.click(button('Continue with phone number'));
    type('Phone number', '07700 900123');
    fireEvent.click(button('Send code by text message'));
    await settle();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(document.activeElement).toBe(button('Send code by text message'));
  });

  it('a failed resend goes back to Resend code', async () => {
    h.codeResend.mockRejectedValue(new ApiError(400, 'CODE_CHANNEL_UNAVAILABLE'));
    h.codePhone.mockResolvedValue(SENT({ resendAfter: 0 }));
    await toCodeScreen();
    fireEvent.click(button(/Resend code/));
    await settle();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(document.activeElement).toBe(button(/Resend code/));
  });
});
