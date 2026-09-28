import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/settings.ts')>()),
  useSettings: () => state.settings,
}));
vi.mock('@/api/settings.ts', () => ({ fetchSettings: async () => ({ ...state.settings, serverTime: '2026-08-24T12:00:00.000Z' }) }));

import { useSettingsQuery } from '@/app/settings.ts';
import { recordSettingsFetch, settingsFetchedAt } from '@/lib/settings-anchor.ts';
import { useServerClock } from '@/lib/server-clock.ts';

const T0 = Date.parse('2026-08-24T10:00:00.000Z'); // client clock when the response arrived
const BASE_SETTINGS = { serverTime: '2026-08-24T09:00:00.000Z', cutoffs: { timezone: 'UTC', days: {} }, enabled: true } as unknown as StorefrontSettings;
state.settings = BASE_SETTINGS;

// A test that mutates the shared `state.settings` (e.g. to change `serverTime`) must not leak
// that into a later test regardless of run order — reset to the baseline after every test.
afterEach(() => { vi.useRealTimers(); state.settings = BASE_SETTINGS; });

describe('server clock anchor', () => {
  it('a clock mounted 60 s after the fetch reads serverTime + 60 s, not serverTime', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    recordSettingsFetch('2026-08-24T09:00:00.000Z', T0);
    vi.setSystemTime(T0 + 60_000);
    const { result } = renderHook(() => useServerClock());
    expect(result.current.toISOString()).toBe('2026-08-24T09:01:00.000Z');
  });

  it('without a recorded fetch (mocked settings) it anchors at first render', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    state.settings = { ...state.settings, serverTime: '2026-08-24T08:00:00.000Z' };
    vi.setSystemTime(T0);
    const { result } = renderHook(() => useServerClock());
    expect(result.current.toISOString()).toBe('2026-08-24T08:00:00.000Z');
  });

  it('the settings queryFn records the fetch time of each response', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const before = Date.now();
    const { result } = renderHook(() => useSettingsQuery(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const at = settingsFetchedAt('2026-08-24T12:00:00.000Z')!;
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(result.current.dataUpdatedAt);
  });
});
