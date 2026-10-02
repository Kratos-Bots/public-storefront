import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { ApiError } from '@/lib/errors.ts';
import type { SlotRender } from '@/builder/define.ts';

const h = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock('@/api/auth.ts', () => ({ verifyEmail: h.verify }));

import { VerifyEmailFamily } from '@/builder/family-verify-email.ts';
import { VerifyEmailPage } from '@/features/auth/VerifyEmailPage.tsx';

const content = Object.assign(
  ({ className }: { className?: string } = {}) => (
    <div className={className}>
      <VerifyEmailFamily.PartHost name="VerifyEmailHeading" props={{}} />
      <VerifyEmailFamily.PartHost name="VerifyEmailStatus" props={{}} />
    </div>
  ),
  { items: [] },
) as unknown as SlotRender;

const mount = (url = '/verify-email?token=tok') => render(
  <MantineProvider env="test"><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[url]}><VerifyEmailPage slots={{ content }} /></MemoryRouter>
  </QueryClientProvider></MantineProvider>,
);

beforeEach(() => { h.verify.mockReset().mockResolvedValue({ ok: true }); });
afterEach(cleanup);

describe('VerifyEmailPage', () => {
  it('shows a status while confirming, then the confirmation with a way on to the profile', async () => {
    let finish!: (v: unknown) => void;
    h.verify.mockReturnValue(new Promise((res) => { finish = res; }));
    mount();
    expect((await screen.findByRole('status')).textContent).toBe('Confirming your email…');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Confirm your email');
    finish({ ok: true });
    expect(await screen.findByText('Email confirmed')).toBeTruthy();
    expect(screen.getByText('That address is now verified on your account.')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Go to your profile' });
    expect(link.getAttribute('href')).toBe('/account/profile');
    expect(link.getAttribute('data-sf-part')).toBe('button');
  });

  it('consumes the token once', async () => {
    mount();
    await screen.findByText('Email confirmed');
    expect(h.verify).toHaveBeenCalledTimes(1);
  });

  it('an expired or already used link', async () => {
    h.verify.mockRejectedValue(new ApiError(400, 'VERIFY_LINK_INVALID'));
    mount();
    expect(await screen.findByText('This link has expired')).toBeTruthy();
    expect(screen.getByText(/Ask for a new one from your profile/)).toBeTruthy();
  });

  it("another account's link", async () => {
    h.verify.mockRejectedValue(new ApiError(403, 'Forbidden'));
    mount();
    expect(await screen.findByText('This link is for a different account')).toBeTruthy();
  });

  it('a failure shows its sentence and Try again', async () => {
    h.verify.mockRejectedValueOnce(new ApiError(429, 'Too many requests')).mockResolvedValueOnce({ ok: true });
    mount();
    expect(await screen.findByText('We couldn’t confirm your email')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('Too many attempts — please wait a moment and try again');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Email confirmed')).toBeTruthy();
  });

  it('a banned account sees the banned sentence', async () => {
    h.verify.mockRejectedValue(new ApiError(403, 'ACCOUNT_BANNED'));
    mount();
    expect((await screen.findByRole('alert')).textContent).toBe('This account can’t sign in right now. Contact the shop for help.');
  });

  it('no token reads as an expired link without asking the backend', async () => {
    mount('/verify-email');
    expect(await screen.findByText('This link has expired')).toBeTruthy();
    expect(h.verify).not.toHaveBeenCalled();
  });
});
