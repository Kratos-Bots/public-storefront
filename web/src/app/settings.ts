import { useQuery } from '@tanstack/react-query';
import { fetchSettings } from '@/api/settings.ts';
import { closedGate } from '@/app/closed-gate.ts';
import type { StorefrontSettings } from '@/types/settings.ts';

export const SETTINGS_KEY = ['settings'] as const;

export function useSettingsQuery() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async () => {
      const s = await fetchSettings();
      closedGate.getState().setClosed(!s.enabled);
      return s;
    },
    staleTime: 30_000,
    refetchInterval: (q) => (q.state.data && !q.state.data.enabled ? 60_000 : false),
    refetchOnWindowFocus: true,
    retry: 2,
  });
}

/** Only for components rendered under <App/> after settings have loaded — throws otherwise. */
export function useSettings(): StorefrontSettings {
  const q = useSettingsQuery();
  if (!q.data) throw new Error('useSettings() called before settings loaded');
  return q.data;
}
