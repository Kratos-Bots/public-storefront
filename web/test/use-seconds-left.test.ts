import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSecondsLeft } from '@/features/auth/useSecondsLeft.ts';

const NOW = Date.parse('2026-10-03T10:00:00Z');
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => vi.useRealTimers());

describe('useSecondsLeft', () => {
  it('counts down in whole seconds, rounded up, and stops at zero', () => {
    const { result } = renderHook(() => useSecondsLeft(NOW + 3_000));
    expect(result.current).toBe(3);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(2);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current).toBe(0);
  });
  it('is zero with no deadline or a deadline already past', () => {
    expect(renderHook(() => useSecondsLeft(null)).result.current).toBe(0);
    expect(renderHook(() => useSecondsLeft(NOW - 10)).result.current).toBe(0);
  });
  it('restarts when the deadline moves', () => {
    const { result, rerender } = renderHook(({ at }) => useSecondsLeft(at), { initialProps: { at: NOW + 1_000 } });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current).toBe(0);
    rerender({ at: NOW + 2_000 + 60_000 });
    expect(result.current).toBe(60);
  });
});
