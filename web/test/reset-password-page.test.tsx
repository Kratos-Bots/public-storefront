import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { ApiError } from '@/lib/errors.ts';
import type { SlotRender } from '@/builder/define.ts';

const h = vi.hoisted(() => ({ onLogin: vi.fn(), check: vi.fn(), reset: vi.fn() }));
vi.mock('@/features/auth/useLoginSuccess.ts', () => ({ useLoginSuccess: () => h.onLogin }));
vi.mock('@/api/auth.ts', () => ({ checkResetToken: h.check, passwordReset: h.reset }));

import { ResetPasswordFamily } from '@/builder/family-reset-password.ts';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage.tsx';

const RESULT = { token: 'sess', customer: { id: 1, nickname: 'Ada' } };

/** The container's slot, drawn the way the default document draws it: heading part then form part. */
const content = Object.assign(
  ({ className }: { className?: string } = {}) => (
    <div className={className}>
      <ResetPasswordFamily.PartHost name="ResetPasswordHeading" props={{}} />
      <ResetPasswordFamily.PartHost name="ResetPasswordForm" props={{}} />
    </div>
  ),
  { items: [] },
) as unknown as SlotRender;

function mount(url = '/reset-password?token=tok') {
  return render(
    <MantineProvider env="test"><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[url]}><ResetPasswordPage slots={{ content }} /></MemoryRouter>
    </QueryClientProvider></MantineProvider>,
  );
}

beforeEach(() => {
  h.onLogin.mockReset().mockResolvedValue(undefined);
  h.check.mockReset().mockResolvedValue({ valid: true, mode: 'reset' });
  h.reset.mockReset().mockResolvedValue(RESULT);
});
afterEach(cleanup);

const field = () => screen.findByLabelText('New password') as Promise<HTMLInputElement>;
const save = () => screen.getByRole('button', { name: 'Save password' });

describe('checking', () => {
  it('shows a status line and the heading while the link is being checked', async () => {
    h.check.mockReturnValue(new Promise(() => {}));
    mount();
    expect((await screen.findByRole('status')).textContent).toBe('Checking your link…');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Choose a new password');
    expect(screen.queryByLabelText('New password')).toBeNull();
  });
});

describe('the form', () => {
  it('is a labelled new-password field with the length hint and a template-styled submit', async () => {
    mount();
    const input = await field();
    expect(input.type).toBe('password');
    expect(input.getAttribute('autocomplete')).toBe('new-password');
    expect(screen.getByText('Use at least 8 characters.')).toBeTruthy();
    expect(save().getAttribute('data-sf-part')).toBe('button');
    expect(save().getAttribute('data-variant')).toBe('filled');
    expect(save().getAttribute('type')).toBe('submit');
  });

  it('a customer with no password yet is told to choose one', async () => {
    h.check.mockResolvedValue({ valid: true, mode: 'set' });
    mount();
    await field();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Choose a password');
  });

  it('saves untrimmed, signs in through useLoginSuccess and locks the button while it works', async () => {
    let finish!: (v: unknown) => void;
    h.reset.mockReturnValue(new Promise((res) => { finish = res; }));
    mount();
    fireEvent.change(await field(), { target: { value: '  a new password  ' } });
    fireEvent.click(save());
    const saving = await screen.findByRole('button', { name: 'Saving…' });
    expect((saving as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(saving);
    expect(h.reset).toHaveBeenCalledTimes(1);
    finish(RESULT);
    await waitFor(() => expect(h.onLogin).toHaveBeenCalledWith(RESULT));
    expect(h.reset).toHaveBeenCalledWith('tok', '  a new password  ');
  });

  it('a short password is an error under the field and nothing is sent', async () => {
    mount();
    fireEvent.change(await field(), { target: { value: 'short' } });
    fireEvent.click(save());
    expect(screen.getByText('Use at least 8 characters')).toBeTruthy();
    expect(h.reset).not.toHaveBeenCalled();
  });

  it('a 429 keeps the field filled and shows the rate-limit sentence', async () => {
    h.reset.mockRejectedValue(new ApiError(429, 'Too many requests'));
    mount();
    const input = await field();
    fireEvent.change(input, { target: { value: 'long enough pw' } });
    fireEvent.click(save());
    expect(await screen.findByText('Too many attempts — please wait a moment and try again')).toBeTruthy();
    expect(input.value).toBe('long enough pw');
    expect((save() as HTMLButtonElement).disabled).toBe(false);
  });

  it('a banned customer sees the banned sentence', async () => {
    h.reset.mockRejectedValue(new ApiError(403, 'ACCOUNT_BANNED'));
    mount();
    fireEvent.change(await field(), { target: { value: 'long enough pw' } });
    fireEvent.click(save());
    expect(await screen.findByText('This account can’t sign in right now. Contact the shop for help.')).toBeTruthy();
  });

  it('a banned reset ends in a terminal panel: the banned sentence, no form, no submit button', async () => {
    h.reset.mockRejectedValue(new ApiError(403, 'ACCOUNT_BANNED'));
    mount();
    fireEvent.change(await field(), { target: { value: 'long enough pw' } });
    fireEvent.click(save());
    expect((await screen.findByRole('alert')).textContent).toBe('This account can’t sign in right now. Contact the shop for help.');
    expect(screen.queryByLabelText('New password')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save password' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Saving…' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to sign in' }).getAttribute('href')).toBe('/login');
  });
});

describe('expired links', () => {
  const expectExpired = async () => {
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('This link has expired'));
    expect(screen.queryByLabelText('New password')).toBeNull();
    expect(screen.getByText(/If you already chose a new password, sign in with it/)).toBeTruthy();
    const back = screen.getByRole('link', { name: 'Back to sign in' });
    expect(back.getAttribute('href')).toBe('/login');
    expect(back.getAttribute('data-sf-part')).toBe('button');
  };

  it('a used or unknown token', async () => {
    h.check.mockResolvedValue({ valid: false, mode: null });
    mount();
    await expectExpired();
  });

  it('no token in the URL, with no request', async () => {
    mount('/reset-password');
    await expectExpired();
    expect(h.check).not.toHaveBeenCalled();
  });

  it('RESET_LINK_INVALID on submit replaces the form with the expired panel', async () => {
    h.reset.mockRejectedValue(new ApiError(400, 'RESET_LINK_INVALID'));
    mount();
    fireEvent.change(await field(), { target: { value: 'long enough pw' } });
    fireEvent.click(save());
    await expectExpired();
  });
});

describe('unreachable', () => {
  it('says so, and Try again checks again', async () => {
    h.check.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValueOnce({ valid: true, mode: 'reset' });
    mount();
    expect((await screen.findByRole('alert')).textContent).toBe('We couldn’t check your link. Check your connection and try again.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await field();
    expect(h.check).toHaveBeenCalledTimes(2);
  });
});
