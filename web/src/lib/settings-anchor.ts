/**
 * When each settings response arrived, keyed by its serverTime — the anchor for every
 * server-clock reading (CutoffBar, template clocks). Written by the settings queryFn at the
 * moment it resolves (React Query's dataUpdatedAt for that response). Plain module state,
 * not React: the reader works under test mocks of useSettings.
 */
const fetchedAtByServerTime = new Map<string, number>();

export function recordSettingsFetch(serverTime: string, at: number = Date.now()): void {
  fetchedAtByServerTime.set(serverTime, at);
  if (fetchedAtByServerTime.size > 8) fetchedAtByServerTime.delete(fetchedAtByServerTime.keys().next().value!);
}

export function settingsFetchedAt(serverTime: string): number | undefined {
  return fetchedAtByServerTime.get(serverTime);
}
