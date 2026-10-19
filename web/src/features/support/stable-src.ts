import { attachmentSrc, type SupportAttachment } from '@/api/support.ts';
import { useSessionStore } from '@/stores/session.ts';

/** A cached link is swapped for a fresh one once it has less than this left. */
const REFRESH_BEFORE_MS = 5 * 60_000;

const seen = new Map<number, { src: string; expMs: number }>();
// The links are the signed-in customer's: they go with the session.
useSessionStore.subscribe((s, prev) => { if (s.token !== prev.token) seen.clear(); });

const expiryOf = (src: string): number => {
  const exp = Number(new URL(src, 'http://x').searchParams.get('exp'));
  return Number.isFinite(exp) && exp > 0 ? exp * 1000 : 0;
};

/**
 * The link to show for a photo. The server signs a fresh hour-long link on every read of the ticket, so the 15 s poll
 * would hand every photo a new URL (a new cache entry: re-downloaded, blank, repainted). The first link seen for a
 * photo is kept until it is close to expiring, so the thread stays still between polls.
 */
export function stableAttachmentSrc(a: SupportAttachment, now = Date.now()): string {
  const kept = seen.get(a.id);
  if (kept && kept.expMs - now > REFRESH_BEFORE_MS) return kept.src;
  const src = attachmentSrc(a);
  seen.set(a.id, { src, expMs: expiryOf(src) });
  return src;
}
