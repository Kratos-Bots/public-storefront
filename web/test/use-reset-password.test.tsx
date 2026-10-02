import { StrictMode, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { FormEvent } from 'react';
import { ApiError } from '@/lib/errors.ts';

const h = vi.hoisted(() => ({ onLogin: vi.fn(), check: vi.fn(), reset: vi.fn() }));
vi.mock('@/features/auth/useLoginSuccess.ts', () => ({ useLoginSuccess: () => h.onLogin }));
vi.mock('@/api/auth.ts', () => ({ checkResetToken: h.check, passwordReset: h.reset }));

import { BuilderModeProvider } from '@/builder/mode.ts';
import { useResetPassword } from '@/features/auth/useResetPassword.ts';

const RESULT = { token: 'sess', customer: { id: 1, nickname: 'Ada' } };
const ev = { preventDefault: () => {} } as unknown as FormEvent;

beforeEach(() => {
  h.onLogin.mockReset().mockResolvedValue(undefined);
  h.check.mockReset().mockResolvedValue({ valid: true, mode: 'reset' });
  h.reset.mockReset().mockResolvedValue(RESULT);
});

function setup(url = '/reset-password?token=abc', opts: { strict?: boolean; fixture?: unknown } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => {
    let tree = <QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}>{children}</MemoryRouter></QueryClientProvider>;
    if (opts.fixture) tree = <BuilderModeProvider value={{ editing: true, previewAs: null, previewFixtures: { ResetPassword: opts.fixture } }}>{tree}</BuilderModeProvider>;
    return opts.strict ? <StrictMode>{tree}</StrictMode> : tree;
  };
  return { ...renderHook(() => useResetPassword(), { wrapper: Wrapper }), client };
}
const submit = (r: ReturnType<typeof setup>) => act(async () => { r.result.current.onSubmit(ev); });
const ready = (r: ReturnType<typeof setup>) => waitFor(() => expect(r.result.current.phase).toBe('form'));

describe('the token check', () => {
  it('no token at all is expired and asks nothing', () => {
    const r = setup('/reset-password');
    expect(r.result.current.phase).toBe('expired');
    expect(h.check).not.toHaveBeenCalled();
  });

  it('a blank token is the same', () => {
    expect(setup('/reset-password?token=%20%20').result.current.phase).toBe('expired');
    expect(h.check).not.toHaveBeenCalled();
  });

  it('checks once on load and opens the form in reset mode', async () => {
    const r = setup();
    expect(r.result.current.phase).toBe('checking');
    await ready(r);
    expect(r.result.current.mode).toBe('reset');
    expect(h.check).toHaveBeenCalledWith('abc');
    expect(h.check).toHaveBeenCalledTimes(1);
  });

  it('a customer with no password yet gets set mode', async () => {
    h.check.mockResolvedValue({ valid: true, mode: 'set' });
    const r = setup();
    await ready(r);
    expect(r.result.current.mode).toBe('set');
  });

  it('a token opened a second time (already used or expired) reads as expired', async () => {
    h.check.mockResolvedValue({ valid: false, mode: null });
    const r = setup();
    await waitFor(() => expect(r.result.current.phase).toBe('expired'));
    expect(r.result.current.mode).toBeNull();
  });

  it('a 404 (the shop switched password sign-in off) reads as expired too', async () => {
    h.check.mockRejectedValue(new ApiError(404, 'Feature not found'));
    const r = setup();
    await waitFor(() => expect(r.result.current.phase).toBe('expired'));
  });

  it('a network or server failure is "unreachable", and Try again re-checks', async () => {
    h.check.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValueOnce({ valid: true, mode: 'reset' });
    const r = setup();
    await waitFor(() => expect(r.result.current.phase).toBe('unreachable'));
    act(() => r.result.current.onRetry());
    await ready(r);
    expect(h.check).toHaveBeenCalledTimes(2);
  });

  it('React StrictMode asks the backend once', async () => {
    const r = setup('/reset-password?token=abc', { strict: true });
    await ready(r);
    expect(h.check).toHaveBeenCalledTimes(1);
  });
});

describe('saving the new password', () => {
  it('a short password is refused under the field and nothing is sent', async () => {
    const r = setup();
    await ready(r);
    act(() => r.result.current.onPasswordChange('1234567'));
    await submit(r);
    expect(r.result.current.error).toBe('Use at least 8 characters');
    expect(h.reset).not.toHaveBeenCalled();
  });

  it('sends the password verbatim, hands the session to useLoginSuccess and stays locked afterwards', async () => {
    const r = setup();
    await ready(r);
    act(() => r.result.current.onPasswordChange('  new password!  '));
    await submit(r);
    expect(h.reset).toHaveBeenCalledWith('abc', '  new password!  ');
    expect(h.onLogin).toHaveBeenCalledWith(RESULT);
    await submit(r); // a second Enter after success must not post again
    expect(h.reset).toHaveBeenCalledTimes(1);
    expect(r.result.current.pending).toBe(true);
  });

  it('clears the password from state as soon as the reset succeeds, without waiting for the login callback', async () => {
    h.onLogin.mockReturnValue(new Promise(() => {})); // the navigation never finishes
    const r = setup();
    await ready(r);
    act(() => r.result.current.onPasswordChange('long enough pw'));
    await submit(r);
    expect(h.onLogin).toHaveBeenCalledTimes(1);
    expect(r.result.current.password).toBe('');
  });

  it('a double submit sends one request', async () => {
    let finish!: (v: unknown) => void;
    h.reset.mockReturnValue(new Promise((res) => { finish = res; }));
    const r = setup();
    await ready(r);
    act(() => r.result.current.onPasswordChange('long enough pw'));
    await act(async () => { r.result.current.onSubmit(ev); r.result.current.onSubmit(ev); });
    expect(h.reset).toHaveBeenCalledTimes(1);
    await act(async () => { finish(RESULT); });
  });

  it('RESET_LINK_INVALID after a "valid" check (a second tab, or a lost reply) swaps the form for the expired state', async () => {
    h.reset.mockRejectedValue(new ApiError(400, 'RESET_LINK_INVALID'));
    const r = setup();
    await ready(r);
    act(() => r.result.current.onPasswordChange('long enough pw'));
    await submit(r);
    expect(r.result.current.phase).toBe('expired');
    expect(r.result.current.password).toBe('');
  });

  it('a 429 shows the rate-limit sentence, keeps the typed password and re-enables the form', async () => {
    h.reset.mockRejectedValueOnce(new ApiError(429, 'Too many requests')).mockResolvedValueOnce(RESULT);
    const r = setup();
    await ready(r);
    act(() => r.result.current.onPasswordChange('long enough pw'));
    await submit(r);
    expect(r.result.current.error).toBe('Too many attempts — please wait a moment and try again');
    expect(r.result.current.phase).toBe('form');
    expect(r.result.current.password).toBe('long enough pw');
    expect(r.result.current.pending).toBe(false);
    await submit(r);
    expect(h.onLogin).toHaveBeenCalledTimes(1);
  });

  it('a network failure leaves the form open for a retry (the token may or may not have been used — the retry finds out)', async () => {
    h.reset.mockRejectedValueOnce(new ApiError(0, 'Network error')).mockRejectedValueOnce(new ApiError(400, 'RESET_LINK_INVALID'));
    const r = setup();
    await ready(r);
    act(() => r.result.current.onPasswordChange('long enough pw'));
    await submit(r);
    expect(r.result.current.error).toBe('Network error');
    await submit(r);
    expect(r.result.current.phase).toBe('expired');
  });

  it('a banned customer still reset the password but is refused a session: the banned sentence', async () => {
    h.reset.mockRejectedValue(new ApiError(403, 'ACCOUNT_BANNED'));
    const r = setup();
    await ready(r);
    act(() => r.result.current.onPasswordChange('long enough pw'));
    await submit(r);
    expect(r.result.current.error).toBe('This account can’t sign in right now. Contact the shop for help.');
  });

  it('editing the field clears the error', async () => {
    const r = setup();
    await ready(r);
    act(() => r.result.current.onPasswordChange('short'));
    await submit(r);
    expect(r.result.current.error).not.toBeNull();
    act(() => r.result.current.onPasswordChange('short2'));
    expect(r.result.current.error).toBeNull();
  });

  it('after a successful reset the cached check is marked spent when the page goes away', async () => {
    const r = setup();
    await ready(r);
    act(() => r.result.current.onPasswordChange('long enough pw'));
    await submit(r);
    r.unmount();
    expect(r.client.getQueryData(['reset-check', 'abc'])).toEqual({ valid: false, mode: null });
  });
});

describe('the editor preview', () => {
  it('uses the fixture, never the network, whatever the URL says', async () => {
    const r = setup('/reset-password', { fixture: { phase: 'form', mode: 'set' } });
    expect(r.result.current.phase).toBe('form');
    expect(r.result.current.mode).toBe('set');
    await submit(r);
    expect(h.check).not.toHaveBeenCalled();
    expect(h.reset).not.toHaveBeenCalled();
  });
});
