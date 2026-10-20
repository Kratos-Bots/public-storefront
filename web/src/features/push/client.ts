import { deleteSubscription, registerSubscription } from '@/features/push/api.ts';

const SW_URL = '/sw.js';

function keyBytes(base64Url: string): Uint8Array {
  const b64 = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration(SW_URL)) ?? null;
}

/** This browser's push endpoint, or null when it has none (or push is unsupported). Never registers anything. */
export async function currentEndpoint(): Promise<string | null> {
  return (await currentSubscription())?.endpoint ?? null;
}

/** This browser's subscription and whether it was made against `publicKey` (a changed key pair kills it). Never registers anything. */
export async function currentSubscription(publicKey?: string): Promise<{ endpoint: string; keyMatches: boolean } | null> {
  try {
    const sub = await (await registration())?.pushManager.getSubscription();
    if (!sub) return null;
    return { endpoint: sub.endpoint, keyMatches: publicKey ? sameKey(sub.options?.applicationServerKey, keyBytes(publicKey)) : true };
  } catch { return null; }
}

// The shopper switched notifications off on this browser (or signed out of it): nothing may quietly turn them back on.
const OPT_OUT_KEY = 'push-opted-out';

export function hasOptedOut(): boolean {
  try { return localStorage.getItem(OPT_OUT_KEY) === '1'; } catch { return false; }
}

function setOptedOut(off: boolean): void {
  try { if (off) localStorage.setItem(OPT_OUT_KEY, '1'); else localStorage.removeItem(OPT_OUT_KEY); } catch { /* storage unavailable */ }
}

/**
 * Subscribes this device and tells the backend. Call it from a tap handler: the permission prompt
 * is the first thing that runs, before any other await, so the browser still sees the user gesture.
 */
export async function subscribeThisDevice(publicKey: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted');

  await navigator.serviceWorker.register(SW_URL);
  const reg = await navigator.serviceWorker.ready;
  const key = keyBytes(publicKey);

  let sub = await reg.pushManager.getSubscription();
  // A subscription made against an older key pair is dead; replace it rather than reuse it.
  if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource });

  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) throw new Error('The browser returned an incomplete push subscription');
  await registerSubscription({ endpoint: json.endpoint, keys: { p256dh, auth } });
  setOptedOut(false);
}

/** Removes this device on the server first (that needs the session), then drops the browser subscription. */
export async function unsubscribeThisDevice(): Promise<void> {
  setOptedOut(true);
  const sub = await (await registration())?.pushManager.getSubscription();
  if (!sub) return;
  try {
    await deleteSubscription(sub.endpoint);
  } finally {
    await sub.unsubscribe().catch(() => undefined);
  }
}

/** Sign-out helper: best effort, bounded by `ms`, never throws. */
export async function unsubscribeBeforeSignOut(ms = 2000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<void>((resolve) => { timer = setTimeout(resolve, ms); });
  try {
    await Promise.race([unsubscribeThisDevice().catch(() => undefined), limit]);
  } finally {
    clearTimeout(timer);
  }
}
