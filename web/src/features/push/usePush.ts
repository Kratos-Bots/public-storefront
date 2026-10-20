import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSettingsQuery } from '@/app/settings.ts';
import { selectIsLoggedIn, useSessionStore } from '@/stores/session.ts';
import { isTelegramWebApp } from '@/lib/telegram-webapp.ts';
import { deletePushDevice, fetchPushDevices } from '@/features/push/api.ts';
import { currentSubscription, hasOptedOut, subscribeThisDevice, unsubscribeThisDevice } from '@/features/push/client.ts';
import { pushAvailability, readBrowserPushEnv, type PushAvailability } from '@/features/push/support.ts';

const DEVICES_KEY = ['push-devices'] as const;

// One silent re-subscribe per page load, shared by every usePush() caller, so a failure cannot loop.
let healAttempted = false;
/** Test hook: a fresh page load. */
export function resetPushHeal(): void { healAttempted = false; }

interface BrowserSub { endpoint: string; keyMatches: boolean }

export function usePush() {
  const settingsPush = useSettingsQuery().data?.push;
  const signedIn = useSessionStore(selectIsLoggedIn);
  const qc = useQueryClient();
  const [tick, setTick] = useState(0);
  // undefined = this browser has not been asked yet (or push is not active here), so `subscribed` is not yet a fact.
  const [browser, setBrowser] = useState<BrowserSub | null | undefined>(undefined);
  const endpoint = browser === undefined ? undefined : browser?.endpoint ?? null;
  const publicKey = settingsPush?.publicKey;

  const availability: PushAvailability = useMemo(
    () => pushAvailability({ settingsPush, signedIn, telegram: isTelegramWebApp(), ...readBrowserPushEnv() }),
    // `tick` re-reads Notification.permission after enable()/disable().
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settingsPush, signedIn, tick],
  );
  const active = availability === 'ready' || availability === 'denied';

  useEffect(() => {
    let live = true;
    if (!active) { setBrowser(undefined); return; }
    void currentSubscription(publicKey).then((b) => { if (live) setBrowser(b); });
    return () => { live = false; };
  }, [active, tick, publicKey]);

  const devices = useQuery({
    queryKey: [...DEVICES_KEY, endpoint],
    queryFn: () => fetchPushDevices(endpoint ?? null).then((r) => r.devices),
    // Wait for the browser's own endpoint so the list marks the current device on its first fetch.
    enabled: active && endpoint !== undefined,
    staleTime: 30_000,
  });

  // The browser's own subscription is not proof: the keys may have been regenerated, the server may have
  // dropped the row, or another customer may own it. Only a live, current-key, server-known device counts.
  const serverKnowsThisDevice = devices.data?.some((d) => d.current) === true;
  const subscribed = typeof endpoint === 'string' && browser?.keyMatches === true && serverKnowsThisDevice;
  // Settled once nothing is in flight that could still change `subscribed` (a banner must not fire before then).
  const waitingOnServer = typeof endpoint === 'string' && browser?.keyMatches === true && devices.isPending;
  const settled = !active || (endpoint !== undefined && !waitingOnServer);

  const refresh = useCallback(async () => {
    setTick((n) => n + 1);
    await qc.invalidateQueries({ queryKey: DEVICES_KEY });
  }, [qc]);

  // Self-heal: permission was already granted, so this is not a prompt. A browser subscription that is missing,
  // made against an old key, or unknown to the server is quietly replaced (the server upsert reassigns the endpoint).
  // A shopper who switched notifications off (or signed out) on this browser is left alone.
  useEffect(() => {
    if (healAttempted || availability !== 'ready' || !settingsPush || !settled || subscribed) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || hasOptedOut()) return;
    // A failed list fetch says nothing about the server: only act on a list we actually have.
    if (typeof endpoint === 'string' && browser?.keyMatches === true && !devices.isSuccess) return;
    healAttempted = true;
    void subscribeThisDevice(settingsPush.publicKey).catch(() => undefined).finally(() => { void refresh(); });
  }, [availability, settingsPush, settled, subscribed, endpoint, browser, devices.isSuccess, refresh]);

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

  return { availability, subscribed, settled, devices: devices.data ?? [], enable, disable, removeDevice };
}
