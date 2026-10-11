import { api, unwrap } from '@/api/client.ts';
import type { FaqData } from '@/types/faq.ts';

/** The shop's FAQ. Open while the shop is public; otherwise a signed-in, allowed shopper only (the same gate as the reviews). */
export const fetchFaq = () => unwrap<FaqData>(api.get('storefront/faq'));
