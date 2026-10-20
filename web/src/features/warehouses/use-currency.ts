import { useSettings } from '@/app/settings.ts';
import { useSelectedWarehouse } from '@/features/warehouses/use-warehouse.ts';

/**
 * The currency prices are shown in: the warehouse the shopper is shopping from, else the shop's. The picker being
 * off, a single warehouse, a failed list or a backend that sends no warehouse currency all land on the shop currency,
 * so a shop that does not use warehouses is unchanged. Store credit (`LoyaltyPage`) stays on the shop currency.
 */
export function useCurrency(): string {
  const { currency } = useSettings();
  const { current } = useSelectedWarehouse();
  return current?.currency || currency;
}
