import type { StorefrontSettings } from '@/types/settings.ts';
import type { Warehouse } from '@/types/warehouses.ts';
import { normaliseShipCountries } from '@/features/checkout/ship-countries.ts';
import { useSelectedWarehouse } from '@/features/warehouses/use-warehouse.ts';

type ShipLists = StorefrontSettings['shipping'];

export interface ShipSource {
  lists: ShipLists;
  /**
   * The warehouse in force reports shipping and delivers to no country (a dropship warehouse whose partner shipping
   * has not been copied yet, or one whose own list has no regions). Not the same as an empty list that is merely
   * unknown (an older backend, the feature off, no warehouse chosen, a shop with nothing set up), which offers every
   * country as before.
   */
  none: boolean;
}

/**
 * Where the checkout can deliver: the lists of the warehouse the shopper ships from when it has its own,
 * otherwise the shop's (`settings.shipping`). The default warehouse repeats the shop's lists and an older backend
 * sends no `shipping` on a warehouse, so both land on the settings. With the warehouse feature off nothing here
 * differs from before it existed.
 */
export function shipSource(settings: Pick<StorefrontSettings, 'shipping'>, warehouse: Warehouse | null | undefined, enabled: boolean): ShipSource {
  if (!enabled || !warehouse || warehouse.isDefault || !warehouse.shipping) return { lists: settings.shipping, none: false };
  return { lists: warehouse.shipping, none: normaliseShipCountries(warehouse.shipping.countries).length === 0 };
}

/** `shipSource` for the warehouse in force: the chosen non-default one while the feature applies. */
export function useShipSource(settings: Pick<StorefrontSettings, 'shipping'>): ShipSource {
  const { enabled, selectedId, current } = useSelectedWarehouse();
  return shipSource(settings, selectedId !== null ? current : null, enabled);
}
