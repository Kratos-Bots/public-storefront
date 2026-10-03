import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { ApiError } from '@/lib/errors.ts';

const h = vi.hoisted(() => ({ complete: vi.fn(), onLogin: vi.fn() }));
vi.mock('@/api/auth.ts', () => ({ completeTelegramOidc: h.complete }));
vi.mock('@/features/auth/useLoginSuccess.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/auth/useLoginSuccess.ts')>()),
  useLoginSuccess: () => h.onLogin,
}));

import { BINDING_KEY } from '@/features/auth/telegram-oidc.ts';
import { resetTelegramCallbackAttempts } from '@/features/auth/useTelegramCallback.ts';
import { TelegramCallbackPage } from '@/features/auth/TelegramCallbackPage.tsx';
import { useSessionStore } from '@/stores/session.ts';

const BINDING = 'b'.repeat(43);
const RESULT = { token: 'sess', customer: { id: 7, nickname: 'Ada' }, returnTo: '/checkout' as string | null };

function mount(search = '?code=c1&state=s1', opts: { strict?: boolean } = {}) {
  // The address bar as Telegram left it: the page scrubs it, so a test can see that it did.
  window.history.replaceState(null, '', `/auth/telegram/callback${search}`);
  const tree = (
    <MantineProvider env="test">
      <MemoryRouter initialEntries={[`/auth/telegram/callback${search}`]}><TelegramCallbackPage /></MemoryRouter>
    </MantineProvider>
  );
  return render(opts.strict ? <StrictMode>{tree}</StrictMode> : tree);
}

beforeEach(() => {
  resetTelegramCallbackAttempts();
  sessionStorage.clear();
  sessionStorage.setItem(BINDING_KEY, BINDING);
  useSessionStore.setState({ returnTo: null });
  h.complete.mockReset().mockResolvedValue(RESULT);
  h.onLogin.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('success', () => {
  it('completes once with code, state and the stored binding, then follows the shared sign-in path', async () => {
    mount();
    expect(screen.getByRole('status').textContent).toBe('Checking with Telegram…');
    await waitFor(() => expect(h.onLogin).toHaveBeenCalledTimes(1));
    expect(h.complete).toHaveBeenCalledWith('c1', 's1', BINDING);
    expect(h.onLogin).toHaveBeenCalledWith({ token: 'sess', customer: RESULT.customer });
  });

  it('scrubs the one-time code from the address bar before anything else, and leaves the path', async () => {
    let atCall = 'unset';
    h.complete.mockImplementation(async () => { atCall = window.location.search; return RESULT; });
    mount();
    await waitFor(() => expect(h.onLogin).toHaveBeenCalled());
    expect(atCall).toBe('');
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/auth/telegram/callback');
  });

  it('a sign-in that throws after the session is stored is still a sign-in, not an error page', async () => {
    h.onLogin.mockImplementation(async () => {
      useSessionStore.setState({ token: 'sess' });
      throw new Error('landing blew up');
    });
    mount();
    await waitFor(() => expect(h.onLogin).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('alert')).toBeNull();
    useSessionStore.setState({ token: null });
  });

  it('a remount joins the attempt in flight instead of flashing "expired"', async () => {
    let finish!: (v: typeof RESULT) => void;
    h.complete.mockReturnValue(new Promise((r) => { finish = r; }));
    const first = mount();
    await waitFor(() => expect(h.complete).toHaveBeenCalledTimes(1));
    first.unmount();
    mount();
    expect(screen.queryByRole('alert')).toBeNull();
    finish(RESULT);
    await waitFor(() => expect(h.onLogin).toHaveBeenCalledTimes(1));
    expect(h.complete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('removes the binding as it is used', async () => {
    mount();
    await waitFor(() => expect(h.onLogin).toHaveBeenCalled());
    expect(sessionStorage.getItem(BINDING_KEY)).toBeNull();
  });

  it('hands the backend’s returnTo to the landing logic before signing in', async () => {
    let seen: string | null = null;
    h.onLogin.mockImplementation(async () => { seen = useSessionStore.getState().returnTo; });
    mount();
    await waitFor(() => expect(h.onLogin).toHaveBeenCalled());
    expect(seen).toBe('/checkout');
  });

  it('ignores an unsafe returnTo and a null one', async () => {
    h.complete.mockResolvedValue({ ...RESULT, returnTo: '//evil.example' });
    let seen: string | null = 'unset';
    h.onLogin.mockImplementation(async () => { seen = useSessionStore.getState().returnTo; });
    mount();
    await waitFor(() => expect(h.onLogin).toHaveBeenCalled());
    expect(seen).toBeNull();
  });

  it('React StrictMode consumes the attempt exactly once', async () => {
    mount('?code=c1&state=s1', { strict: true });
    await waitFor(() => expect(h.onLogin).toHaveBeenCalledTimes(1));
    expect(h.complete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('failures', () => {
  const backLink = () => screen.getByRole('link', { name: 'Back to sign in' });

  it.each([
    ['TELEGRAM_LOGIN_EXPIRED', new ApiError(400, 'TELEGRAM_LOGIN_EXPIRED'), 'This sign-in was started in another browser or tab, or it ran out of time. Please try again.'],
    ['TELEGRAM_LOGIN_FAILED', new ApiError(401, 'TELEGRAM_LOGIN_FAILED'), "Telegram couldn't confirm your sign-in. Please try again."],
    ['TELEGRAM_LOGIN_UNAVAILABLE', new ApiError(404, 'TELEGRAM_LOGIN_UNAVAILABLE'), 'Telegram sign-in isn’t available right now.'],
    ['REGISTRATION_CLOSED', new ApiError(403, 'REGISTRATION_CLOSED'), 'This shop isn’t taking new customers right now.'],
    ['ACCOUNT_BANNED', new ApiError(403, 'ACCOUNT_BANNED'), 'This account can’t sign in right now. Contact the shop for help.'],
    ['429', new ApiError(429, 'Too many requests'), 'Too many attempts — please wait a moment and try again'],
    ['anything else', new ApiError(500, 'boom'), "We couldn't finish signing you in. Please try again."],
    ['a network failure', new ApiError(0, 'Network error'), "We couldn't finish signing you in. Please try again."],
  ])('%s is one plain sentence with a way back', async (_name, failure, sentence) => {
    h.complete.mockRejectedValue(failure);
    mount();
    expect((await screen.findByRole('alert')).textContent).toBe(sentence);
    expect(backLink().getAttribute('href')).toBe('/login');
    expect(h.onLogin).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });

  it('a missing binding is treated as expired and nothing is sent', async () => {
    sessionStorage.clear();
    mount();
    expect((await screen.findByRole('alert')).textContent).toContain('started in another browser or tab');
    expect(h.complete).not.toHaveBeenCalled();
    expect(backLink()).toBeTruthy();
    expect(window.location.search).toBe('');
  });

  it('the shopper cancelling at Telegram (error param) says so and sends nothing', async () => {
    mount('?error=access_denied&state=s1');
    expect((await screen.findByRole('alert')).textContent).toBe('You cancelled the sign-in with Telegram.');
    expect(h.complete).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(BINDING_KEY)).toBeNull();
    expect(backLink()).toBeTruthy();
    expect(window.location.search).toBe('');
  });

  it.each([['?state=s1'], ['?code=c1'], ['']])('a return with code or state missing (%s) is expired', async (search) => {
    mount(search);
    expect((await screen.findByRole('alert')).textContent).toContain('started in another browser or tab');
    expect(h.complete).not.toHaveBeenCalled();
  });

  it('a failed attempt is not retried by a re-render', async () => {
    h.complete.mockRejectedValue(new ApiError(401, 'TELEGRAM_LOGIN_FAILED'));
    mount('?code=c1&state=s1', { strict: true });
    await screen.findByRole('alert');
    expect(h.complete).toHaveBeenCalledTimes(1);
  });
});
