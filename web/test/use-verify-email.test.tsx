import { StrictMode, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { ApiError } from '@/lib/errors.ts';

const h = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock('@/api/auth.ts', () => ({ verifyEmail: h.verify }));

import { BuilderModeProvider } from '@/builder/mode.ts';
import { PROFILE_KEY } from '@/features/account/queries.ts';
import { useVerifyEmail } from '@/features/auth/useVerifyEmail.ts';

beforeEach(() => { h.verify.mockReset().mockResolvedValue({ ok: true }); });

function setup(url = '/verify-email?token=tok', opts: { strict?: boolean; fixture?: unknown } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const Wrapper = ({ children }: { children: ReactNode }) => {
    let tree = <QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}>{children}</MemoryRouter></QueryClientProvider>;
    if (opts.fixture) tree = <BuilderModeProvider value={{ editing: true, previewAs: null, previewFixtures: { VerifyEmail: opts.fixture } }}>{tree}</BuilderModeProvider>;
    return opts.strict ? <StrictMode>{tree}</StrictMode> : tree;
  };
  return { ...renderHook(() => useVerifyEmail(), { wrapper: Wrapper }), invalidate };
}
const phaseIs = (r: ReturnType<typeof setup>, phase: string) => waitFor(() => expect(r.result.current.phase).toBe(phase));

describe('useVerifyEmail', () => {
  it('verifies on load and refreshes the profile so the verified marker shows', async () => {
    const r = setup();
    expect(r.result.current.phase).toBe('verifying');
    await phaseIs(r, 'done');
    expect(h.verify).toHaveBeenCalledWith('tok');
    await waitFor(() => expect(r.invalidate).toHaveBeenCalledWith({ queryKey: PROFILE_KEY }));
  });

  it('React StrictMode consumes the token exactly once', async () => {
    const r = setup('/verify-email?token=tok', { strict: true });
    await phaseIs(r, 'done');
    expect(h.verify).toHaveBeenCalledTimes(1);
  });

  it('no token is invalid with no request', () => {
    const r = setup('/verify-email');
    expect(r.result.current.phase).toBe('invalid');
    expect(h.verify).not.toHaveBeenCalled();
  });

  it.each([
    ['VERIFY_LINK_INVALID', new ApiError(400, 'VERIFY_LINK_INVALID'), 'invalid'],
    ['a 404 (feature off)', new ApiError(404, 'Feature not found'), 'invalid'],
    ["another account's link (403)", new ApiError(403, 'Forbidden'), 'otherAccount'],
    ['a banned account (403 ACCOUNT_BANNED)', new ApiError(403, 'ACCOUNT_BANNED'), 'error'],
    ['a 429', new ApiError(429, 'Too many requests'), 'error'],
    ['a network failure', new ApiError(0, 'Network error'), 'error'],
  ])('%s', async (_name, failure, phase) => {
    h.verify.mockRejectedValue(failure);
    const r = setup();
    await phaseIs(r, phase);
    if (phase === 'error') expect(r.result.current.error).toBe(failure);
  });

  it('Try again asks once more', async () => {
    h.verify.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValueOnce({ ok: true });
    const r = setup();
    await phaseIs(r, 'error');
    act(() => r.result.current.onRetry());
    await phaseIs(r, 'done');
    expect(h.verify).toHaveBeenCalledTimes(2);
  });

  it('the editor preview uses the fixture and never calls the backend', () => {
    const r = setup('/verify-email', { fixture: { phase: 'otherAccount' } });
    expect(r.result.current.phase).toBe('otherAccount');
    expect(h.verify).not.toHaveBeenCalled();
  });
});
