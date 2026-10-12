import { useSettings } from '@/app/settings.ts';
import { faqAvailableAt } from '@/features/faq/settings.ts';
import { useSelectedWarehouse } from '@/features/warehouses/use-warehouse.ts';

/**
 * Whether the FAQ is on offer to this shopper: the selected warehouse's own answer when it has its own FAQ, else the
 * shop's. The one place that decides it: the bottom bar, the menu and the page all read this.
 */
export function useFaqAvailable(): boolean {
  const settings = useSettings();
  const { selectedId, warehouses } = useSelectedWarehouse();
  // `selectedId` is null for the default warehouse, so "choosing nothing" and "choosing the default" both read the shop.
  const row = selectedId === null ? null : warehouses.find((w) => w.id === selectedId) ?? null;
  return faqAvailableAt(settings, row);
}
