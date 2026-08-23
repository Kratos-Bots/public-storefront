import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { LoginResult, WhatsappStart } from '@/types/auth.ts';

vi.mock('@/api/auth.ts', () => ({
  startWhatsapp: vi.fn(),
  pollAttempt: vi.fn(),
  completeWhatsapp: vi.fn(),
  loginTelegram: vi.fn(),
  logout: vi.fn(),
}));

// The success path is its own hook with its own test — here it stands in for
// "the session was established", so this file needs no router and no query client.
const onSuccess = vi.fn<(result: LoginResult) => Promise<void>>();
vi.mock('@/features/auth/useLoginSuccess.ts', () => ({
  useLoginSuccess: () => onSuccess,
}));

import { completeWhatsapp, pollAttempt, startWhatsapp } from '@/api/auth.ts';
import { ApiError } from '@/lib/errors.ts';
import {
  MAX_WAIT_MS,
  POLL_INTERVAL_MS,
  useWhatsappLogin,
} from '@/features/auth/useWhatsappLogin.ts';

const startMock = vi.mocked(startWhatsapp);
const pollMock = vi.mocked(pollAttempt);
const completeMock = vi.mocked(completeWhatsapp);

const NOW = new Date('2026-08-23T12:00:00.000Z');

function attempt(overrides: Partial<WhatsappStart> = {}): WhatsappStart {
  return {
    attemptId: 'a'.repeat(32),
    attemptSecret: 'secret-token-value',
    code: 'LOGIN-XY3F9K',
    waLink: 'https://wa.me/447700900000?text=LOGIN-XY3F9K',
    // Ten minutes out, so the hook's own five-minute cap is what stops it.
    expiresAt: new Date(NOW.getTime() + 10 * 60_000).toISOString(),
    ...overrides,
  };
}

const loginResult: LoginResult = { token: 'tok', customer: { id: 42, nickname: 'Jane D.' } };

/** Kick the flow off and let the start request settle. */
async function begin(start: () => void) {
  await act(async () => {
    start();
    await vi.advanceTimersByTimeAsync(0);
  });
}

/** Advance whole poll ticks and let each tick's promise chain settle. */
async function ticks(n: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * n);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  startMock.mockResolvedValue(attempt());
  pollMock.mockResolvedValue({ status: 'pending' });
  completeMock.mockResolvedValue(loginResult);
  onSuccess.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useWhatsappLogin', () => {
  it('starts idle and holds no attempt', () => {
    const { result } = renderHook(() => useWhatsappLogin());
    expect(result.current.state).toBe('idle');
    expect(result.current.data).toBeUndefined();
    expect(startMock).not.toHaveBeenCalled();
  });

  it('start() opens an attempt and exposes it', async () => {
    const { result } = renderHook(() => useWhatsappLogin());
    await begin(result.current.start);

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('started');
    expect(result.current.data).toEqual(attempt());
  });

  it('polls the attempt every 2 s while it waits', async () => {
    const { result } = renderHook(() => useWhatsappLogin());
    await begin(result.current.start);

    expect(pollMock).not.toHaveBeenCalled();
    await ticks(1);
    expect(pollMock).toHaveBeenCalledTimes(1);
    expect(pollMock).toHaveBeenCalledWith('a'.repeat(32));
    await ticks(1);
    expect(pollMock).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe('started');
  });

  it('completes the attempt exactly once when the poll flips to completed', async () => {
    pollMock.mockResolvedValueOnce({ status: 'pending' }).mockResolvedValue({ status: 'completed' });
    const { result } = renderHook(() => useWhatsappLogin());
    await begin(result.current.start);

    await ticks(2);

    expect(completeMock).toHaveBeenCalledTimes(1);
    expect(completeMock).toHaveBeenCalledWith('a'.repeat(32), 'secret-token-value');
    expect(onSuccess).toHaveBeenCalledWith(loginResult);
    expect(result.current.state).toBe('done');
  });

  it('stops polling once the attempt is completed', async () => {
    pollMock.mockResolvedValue({ status: 'completed' });
    const { result } = renderHook(() => useWhatsappLogin());
    await begin(result.current.start);

    await ticks(1);
    const pollsAtCompletion = pollMock.mock.calls.length;

    await ticks(10);

    expect(pollMock).toHaveBeenCalledTimes(pollsAtCompletion);
    expect(completeMock).toHaveBeenCalledTimes(1);
  });

  it('never calls complete before the poll says completed', async () => {
    const { result } = renderHook(() => useWhatsappLogin());
    await begin(result.current.start);
    await ticks(5);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('goes to expired when the server reports the attempt expired', async () => {
    pollMock.mockResolvedValue({ status: 'expired' });
    const { result } = renderHook(() => useWhatsappLogin());
    await begin(result.current.start);

    await ticks(1);
    expect(result.current.state).toBe('expired');

    await ticks(5);
    expect(pollMock).toHaveBeenCalledTimes(1);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('stops polling after five minutes', async () => {
    const { result } = renderHook(() => useWhatsappLogin());
    await begin(result.current.start);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MAX_WAIT_MS + POLL_INTERVAL_MS);
    });

    expect(result.current.state).toBe('expired');
    const polls = pollMock.mock.calls.length;
    expect(polls).toBeLessThanOrEqual(MAX_WAIT_MS / POLL_INTERVAL_MS);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(pollMock).toHaveBeenCalledTimes(polls);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('stops at the attempt expiry when that comes first', async () => {
    startMock.mockResolvedValue(attempt({ expiresAt: new Date(NOW.getTime() + 30_000).toISOString() }));
    const { result } = renderHook(() => useWhatsappLogin());
    await begin(result.current.start);

    await ticks(14); // 28 s — still inside the window
    expect(result.current.state).toBe('started');

    await ticks(2); // 32 s — past it
    expect(result.current.state).toBe('expired');
  });

  it('keeps waiting through a transient poll failure', async () => {
    pollMock
      .mockRejectedValueOnce(new ApiError(0, 'Network error'))
      .mockResolvedValue({ status: 'completed' });
    const { result } = renderHook(() => useWhatsappLogin());
    await begin(result.current.start);

    await ticks(1);
    expect(result.current.state).toBe('started');

    await ticks(1);
    expect(result.current.state).toBe('done');
  });

  it('reports a failed start as an error with the server’s message', async () => {
    startMock.mockRejectedValue(new ApiError(422, 'WhatsApp login is not available'));
    const { result } = renderHook(() => useWhatsappLogin());
    await begin(result.current.start);

    expect(result.current.state).toBe('error');
    expect(result.current.error).toBe('WhatsApp login is not available');
    expect(pollMock).not.toHaveBeenCalled();
  });

  it('reports a failed complete as an error', async () => {
    pollMock.mockResolvedValue({ status: 'completed' });
    completeMock.mockRejectedValue(new ApiError(401, 'Unauthorized'));
    const { result } = renderHook(() => useWhatsappLogin());
    await begin(result.current.start);

    await ticks(1);

    expect(result.current.state).toBe('error');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('start() from expired opens a fresh attempt and resumes polling', async () => {
    pollMock.mockResolvedValueOnce({ status: 'expired' }).mockResolvedValue({ status: 'pending' });
    const { result } = renderHook(() => useWhatsappLogin());
    await begin(result.current.start);
    await ticks(1);
    expect(result.current.state).toBe('expired');

    startMock.mockResolvedValue(attempt({ attemptId: 'b'.repeat(32), code: 'LOGIN-ZZ9Q1M' }));
    await begin(result.current.start);

    expect(result.current.state).toBe('started');
    expect(result.current.data?.code).toBe('LOGIN-ZZ9Q1M');
    expect(result.current.error).toBeUndefined();

    await ticks(1);
    expect(pollMock).toHaveBeenLastCalledWith('b'.repeat(32));
  });

  it('abandons the poll on unmount', async () => {
    const { result, unmount } = renderHook(() => useWhatsappLogin());
    await begin(result.current.start);
    await ticks(1);
    const polls = pollMock.mock.calls.length;

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 10);
    });

    expect(pollMock).toHaveBeenCalledTimes(polls);
  });
});
