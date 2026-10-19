import { attachmentSrc, type SupportAttachment } from '@/api/support.ts';
import { useSessionStore } from '@/stores/session.ts';

/** A link is valid for an hour from when the server signed it. */
const LIFETIME_S = 3600;
/** A kept link is swapped for a fresh one once the fresh one outlives it by this much less than a lifetime. */
const REFRESH_BEFORE_S = 300;

const seen = new Map<number, { src: string; exp: number }>();
// The links are the signed-in customer's: they go with the session.
useSessionStore.subscribe((s, prev) => { if (s.token !== prev.token) seen.clear(); });

const expiryOf = (src: string): number => {
  const exp = Number(new URL(src, 'http://x').searchParams.get('exp'));
  return Number.isFinite(exp) && exp > 0 ? exp : 0;
};

/**
 * The link to show for a photo. The server signs a fresh hour-long link on every read of the ticket, so the 15 s poll
 * would hand every photo a new URL (a new cache entry: re-downloaded, blank, repainted). The first link seen for a
 * photo is kept until it is close to expiring, so the thread stays still between polls. "Close to expiring" compares
 * the two server-issued expiries only (a fresh link is signed "now" on the server), so a wrong device clock cannot
 * keep an expired link on screen.
 */
export function stableAttachmentSrc(a: SupportAttachment): string {
  const src = attachmentSrc(a);
  const exp = expiryOf(src);
  const kept = seen.get(a.id);
  if (kept && exp - kept.exp < LIFETIME_S - REFRESH_BEFORE_S) return kept.src;
  seen.set(a.id, { src, exp });
  return src;
}
