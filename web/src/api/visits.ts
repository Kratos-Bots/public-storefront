import { api } from '@/api/client.ts';
import type { Touch } from '@/features/attribution/touch.ts';

/** Answers 204 with no body, so it is not unwrapped. */
export async function postVisit(touch: Touch, channel: 'web' | 'telegram_webapp'): Promise<void> {
  await api.post('storefront/visits', { json: { ...touch, channel } });
}
