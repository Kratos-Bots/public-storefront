import { unwrap } from '@/api/client.ts';
import { warehouseGet } from '@/api/warehouse-param.ts';
import type { FaqData } from '@/types/faq.ts';

/**
 * The FAQ a shopper reads. Open while the shop is public; otherwise a signed-in, allowed shopper only (the same gate as the reviews).
 * `warehouse` is the chosen non-default warehouse (`null` = send nothing, the request is then `GET storefront/faq` as it was);
 * it is a query parameter so no cache can mix one warehouse's FAQ into another's.
 */
export const fetchFaq = (warehouse: number | null = null) => unwrap<FaqData>(warehouseGet('storefront/faq', warehouse));
