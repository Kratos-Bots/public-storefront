import { useSettings } from '@/app/settings.ts';
import { faqAvailableAt } from '@/features/faq/settings.ts';
import { useSelectedWarehouse } from '@/features/warehouses/use-warehouse.ts';
import { selectedWarehouseId, useWarehouseStore } from '@/features/warehouses/store.ts';

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

/**
 * The picker is on, a non-default warehouse is stored, and the warehouse list has neither arrived nor failed: which FAQ
 * applies is not known yet. The page waits (skeleton) instead of flashing the shop's answer; the bar and menu do not.
 */
export function useFaqPending(): boolean {
  const selectedId = useWarehouseStore(selectedWarehouseId);
  const listed = useWarehouseStore((st) => st.ctx.list !== null);
  return selectedId !== null && !listed;
}
