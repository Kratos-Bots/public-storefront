import type { StorefrontSettings } from '@/types/settings.ts';
import type { Warehouse } from '@/types/warehouses.ts';
import { useSelectedWarehouse } from '@/features/warehouses/use-warehouse.ts';

type ShipLists = StorefrontSettings['shipping'];

/**
 * Where the checkout can deliver: the lists of the warehouse the shopper ships from when it has its own,
 * otherwise the shop's (`settings.shipping`). A warehouse that uses the shop's shipping repeats the shop's
 * lists, so the default warehouse and an older backend (no `shipping` on the warehouse) both land on the
 * settings. With the warehouse feature off nothing here differs from before it existed.
 */
export function shipSource(settings: Pick<StorefrontSettings, 'shipping'>, warehouse: Warehouse | null | undefined, enabled: boolean): ShipLists {
  if (!enabled || !warehouse || warehouse.isDefault || !warehouse.shipping) return settings.shipping;
  return warehouse.shipping;
}

/** `shipSource` for the warehouse in force: the chosen non-default one while the feature applies. */
export function useShipSource(settings: Pick<StorefrontSettings, 'shipping'>): ShipLists {
  const { enabled, selectedId, current } = useSelectedWarehouse();
  return shipSource(settings, selectedId !== null ? current : null, enabled);
}
