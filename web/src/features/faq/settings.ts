import type { StorefrontSettings } from '@/types/settings.ts';
import type { Warehouse } from '@/types/warehouses.ts';

/** Whether the shop has an FAQ to show. An older backend sends no `faq`, which reads as none. */
export function faqAvailable(settings: Pick<StorefrontSettings, 'faq'> | undefined | null): boolean {
  return settings?.faq?.available === true;
}

/**
 * Whether there is an FAQ to show a shopper at this warehouse. A warehouse with its own FAQ says so in `faq.available`;
 * one on the shop's FAQ (`faq: null`), an older backend (no `faq` key on the row), and no selected warehouse row at all
 * (picker off, nothing chosen, the list still loading) read the shop's value.
 */
export function faqAvailableAt(
  settings: Pick<StorefrontSettings, 'faq'> | undefined | null,
  warehouse: Pick<Warehouse, 'faq'> | undefined | null,
): boolean {
  const own = warehouse?.faq;
  if (own && typeof own.available === 'boolean') return own.available;
  return faqAvailable(settings);
}
