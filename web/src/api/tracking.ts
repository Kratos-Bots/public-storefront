import { ApiError, api, unwrap } from '@/api/client.ts';
import type { TrackingLookup } from '@/types/tracking.ts';

/**
 * A tracking lookup that didn't answer, carrying the status the page branches
 * on: 404 (no such order), 422 (the security check failed), 503 (tracking isn't
 * configured), 429 (too many lookups from this address), 0 (never got there).
 *
 * The status is what matters, not the sentence — every one of those means a
 * different screen, and the backend's own message is written for an API client
 * rather than a customer.
 */
export class TrackingLookupError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'TrackingLookupError';
    this.status = status;
  }
}

export interface TrackingLookupInput {
  reference: string;
  /** Single-use: Cloudflare consumes a token on verification, so every lookup mints its own. */
  turnstileToken: string;
  /** Force a live courier read rather than the cached one. Rate-limited by the cooldown. */
  refresh?: boolean;
}

/**
 * `POST /public/storefront/tracking` — the whole page in one call. The order
 * reference is the only credential, which is why Turnstile guards it.
 *
 * The 20 s client default is deliberately overridden: the backend gives the
 * courier API 20 s of its own, so a healthy-but-cold forced refresh would abort
 * on this side before the answer arrived.
 */
export async function lookupTracking({
  reference,
  turnstileToken,
  refresh,
}: TrackingLookupInput): Promise<TrackingLookup> {
  try {
    return await unwrap<TrackingLookup>(
      api.post('storefront/tracking', {
        json: {
          reference: reference.trim().toUpperCase(),
          turnstileToken,
          refresh: refresh ?? false,
        },
        timeout: 30_000,
      }),
    );
  } catch (err) {
    if (err instanceof ApiError) throw new TrackingLookupError(err.status, err.message);
    throw new TrackingLookupError(0, 'Network error');
  }
}
