export type PushAvailability = 'unavailable' | 'needs-install' | 'ready' | 'denied';

export interface PushEnv {
  settingsPush: { enabled: boolean; publicKey: string } | null | undefined;
  signedIn: boolean;
  telegram: boolean;
  hasPushManager: boolean;
  hasServiceWorker: boolean;
  isIOS: boolean;
  standalone: boolean;
  permission: NotificationPermission | 'unsupported';
}

/**
 * Whether this device can be offered web push. Pure: everything it needs comes in through `env`
 * (the browser half is read by `readBrowserPushEnv`). A missing or null `push` setting (an older
 * backend) is inactive, and so is the Telegram Mini App, which never registers a service worker.
 */
export function pushAvailability(env: PushEnv): PushAvailability {
  if (!env.signedIn || env.telegram || !env.settingsPush || !env.settingsPush.enabled || !env.settingsPush.publicKey) return 'unavailable';
  // iOS only exposes PushManager to an installed home-screen app, so a browser tab gets the install hint first.
  if (env.isIOS && !env.standalone) return 'needs-install';
  if (env.permission === 'denied') return 'denied';
  if (env.hasPushManager && env.hasServiceWorker) return 'ready';
  return 'unavailable';
}

/** The browser-reading half of the availability check, kept apart so `pushAvailability` stays pure. */
export function readBrowserPushEnv(): Pick<PushEnv, 'hasPushManager' | 'hasServiceWorker' | 'isIOS' | 'standalone' | 'permission'> {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  const win = typeof window === 'undefined' ? null : window;
  const ua = nav?.userAgent ?? '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (nav?.platform === 'MacIntel' && (nav?.maxTouchPoints ?? 0) > 1);
  const standalone = Boolean(win?.matchMedia?.('(display-mode: standalone)').matches) || (nav as { standalone?: boolean } | null)?.standalone === true;
  return {
    hasPushManager: win !== null && 'PushManager' in win,
    hasServiceWorker: nav !== null && 'serviceWorker' in nav,
    isIOS,
    standalone,
    permission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  };
}
