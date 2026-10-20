import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSettingsQuery } from '@/app/settings.ts';
import { selectIsLoggedIn, useSessionStore } from '@/stores/session.ts';
import { isTelegramWebApp } from '@/lib/telegram-webapp.ts';
import { deletePushDevice, fetchPushDevices } from '@/features/push/api.ts';
import { currentEndpoint, subscribeThisDevice, unsubscribeThisDevice } from '@/features/push/client.ts';
import { pushAvailability, readBrowserPushEnv, type PushAvailability } from '@/features/push/support.ts';

const DEVICES_KEY = ['push-devices'] as const;

export function usePush() {
  const settingsPush = useSettingsQuery().data?.push;
  const signedIn = useSessionStore(selectIsLoggedIn);
  const qc = useQueryClient();
  const [tick, setTick] = useState(0);
  // undefined = this browser has not been asked yet (or push is not active here), so `subscribed` is not yet a fact.
  const [endpoint, setEndpoint] = useState<string | null | undefined>(undefined);

  const availability: PushAvailability = useMemo(
    () => pushAvailability({ settingsPush, signedIn, telegram: isTelegramWebApp(), ...readBrowserPushEnv() }),
    // `tick` re-reads Notification.permission after enable()/disable().
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settingsPush, signedIn, tick],
  );
  const active = availability === 'ready' || availability === 'denied';

  useEffect(() => {
    let live = true;
    if (!active) { setEndpoint(undefined); return; }
    void currentEndpoint().then((e) => { if (live) setEndpoint(e); });
    return () => { live = false; };
  }, [active, tick]);

  const devices = useQuery({
    queryKey: [...DEVICES_KEY, endpoint],
    queryFn: () => fetchPushDevices(endpoint ?? null).then((r) => r.devices),
    // Wait for the browser's own endpoint so the list marks the current device on its first fetch.
    enabled: active && endpoint !== undefined,
    staleTime: 30_000,
  });

  const refresh = useCallback(async () => {
    setTick((n) => n + 1);
    await qc.invalidateQueries({ queryKey: DEVICES_KEY });
  }, [qc]);

  /** Call from a tap handler: the permission prompt needs the user gesture. */
  const enable = useCallback(async () => {
    // Telegram, signed out, iOS-not-installed, denied: never reach the permission prompt or the service worker.
    if (availability !== 'ready' || !settingsPush) return;
    try { await subscribeThisDevice(settingsPush.publicKey); } finally { await refresh(); }
  }, [availability, settingsPush, refresh]);

  const disable = useCallback(async () => {
    try { await unsubscribeThisDevice(); } finally { await refresh(); }
  }, [refresh]);

  /** The current device goes through the browser (unsubscribe + DELETE by endpoint); any other is deleted by id. */
  const removeDevice = useCallback(async (id: number) => {
    if (devices.data?.find((d) => d.id === id)?.current) { await disable(); return; }
    try { await deletePushDevice(id); } finally { await refresh(); }
  }, [devices.data, disable, refresh]);

  // `settled`: the browser's own subscription has been read, so `subscribed` can be trusted (a banner must not fire before it).
  return { availability, subscribed: typeof endpoint === 'string', settled: !active || endpoint !== undefined, devices: devices.data ?? [], enable, disable, removeDevice };
}
