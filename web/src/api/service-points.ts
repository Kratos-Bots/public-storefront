import { api, unwrap } from '@/api/client.ts';
import type { ServicePointSearch } from '@/types/service-points.ts';

/**
 * Collection points near a postcode. The backend limits this to 60 requests per
 * 15 minutes per shopper and answers `429` beyond that, and `502` when the
 * carrier lookup is down; both arrive as an `ApiError` carrying that status.
 * Never retried: a retry would spend the shopper's allowance twice.
 */
export const searchServicePoints = (country: string, postalCode: string, signal?: AbortSignal) =>
  unwrap<ServicePointSearch>(api.get('storefront/service-points', { searchParams: { country, postalCode }, signal, retry: 0 }));
