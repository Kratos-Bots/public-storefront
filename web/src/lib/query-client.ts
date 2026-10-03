import { QueryClient } from '@tanstack/react-query';

/** Defined here (and re-exported by app/settings.ts) so the api client can name it without an import cycle. */
export const SETTINGS_KEY = ['settings'] as const;

/**
 * The app's one query client. A module of its own so the api client can reach the cache
 * (a LOGIN_REQUIRED answer means the cached settings are out of date) without importing App.
 */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});
