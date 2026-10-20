import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSettingsQuery } from '@/app/settings.ts';
import { selectIsLoggedIn, useSessionStore } from '@/stores/session.ts';
import { isTelegramWebApp } from '@/lib/telegram-webapp.ts';
import { fetchPushDevices } from '@/features/push/api.ts';
import { currentEndpoint, subscribeThisDevice, unsubscribeThisDevice } from '@/features/push/client.ts';
import { pushAvailability, readBrowserPushEnv, type PushAvailability } from '@/features/push/support.ts';

const DEVICES_KEY = ['push-devices'] as const;

export function usePush() {
  const settingsPush = useSettingsQuery().data?.push;
  const signedIn = useSessionStore(selectIsLoggedIn);
  const qc = useQueryClient();
  const [tick, setTick] = useState(0);
  const [endpoint, setEndpoint] = useState<string | null>(null);

  const availability: PushAvailability = useMemo(
    () => pushAvailability({ settingsPush, signedIn, telegram: isTelegramWebApp(), ...readBrowserPushEnv() }),
    // `tick` re-reads Notification.permission after enable()/disable().
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settingsPush, signedIn, tick],
  );
  const active = availability === 'ready' || availability === 'denied';

  useEffect(() => {
    let live = true;
    if (!active) { setEndpoint(null); return; }
    void currentEndpoint().then((e) => { if (live) setEndpoint(e); });
    return () => { live = false; };
  }, [active, tick]);

  const devices = useQuery({
    queryKey: [...DEVICES_KEY, endpoint],
    queryFn: () => fetchPushDevices(endpoint).then((r) => r.devices),
    enabled: active,
    staleTime: 30_000,
  });

  const refresh = useCallback(async () => {
    setTick((n) => n + 1);
    await qc.invalidateQueries({ queryKey: DEVICES_KEY });
  }, [qc]);

  /** Call from a tap handler: the permission prompt needs the user gesture. */
  const enable = useCallback(async () => {
    if (!settingsPush) return;
    try { await subscribeThisDevice(settingsPush.publicKey); } finally { await refresh(); }
  }, [settingsPush, refresh]);

  const disable = useCallback(async () => {
    try { await unsubscribeThisDevice(); } finally { await refresh(); }
  }, [refresh]);

  /** The backend deletes only by endpoint and only this browser knows its own, so only the current device can be removed from here. */
  const removeDevice = useCallback(async (id: number) => {
    if (devices.data?.find((d) => d.id === id)?.current) await disable();
  }, [devices.data, disable]);

  return { availability, subscribed: endpoint !== null, devices: devices.data ?? [], enable, disable, removeDevice };
}
