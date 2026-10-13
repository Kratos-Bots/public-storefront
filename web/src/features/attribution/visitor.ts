// A random id for this browser, sent as `X-Visitor-Id` on every API call. It lets the shop count
// unique visitors and show a guest's cart to the admin. It is not an account and carries no
// personal data.

export const VISITOR_KEY = 'sf-visitor-v1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let cached: string | null = null;

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Older webviews: build a v4 UUID from getRandomValues.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Storage can be unavailable (private mode, some in-app webviews). The shop must still work, so
 * the id then lives in memory for the life of the page: every request in this page load agrees,
 * and the next load is simply a new visitor.
 */
export function getVisitorId(): string {
  if (cached) return cached;
  try {
    const stored = localStorage.getItem(VISITOR_KEY);
    if (stored && UUID_RE.test(stored)) {
      cached = stored;
      return cached;
    }
  } catch { /* fall through to a fresh id */ }
  cached = newId();
  try { localStorage.setItem(VISITOR_KEY, cached); } catch { /* memory only */ }
  return cached;
}

export function resetVisitorIdForTests(): void {
  cached = null;
}
