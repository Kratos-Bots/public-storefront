import { useSettings } from '@/app/settings.ts';
import { useWarehouseOrdering } from '@/features/warehouses/use-warehouse.ts';

/**
 * While the warehouse the shopper ships from is not taking orders, the quantity picker has nothing
 * to do, so the price takes its slot instead of sitting under the name. True only when the shop
 * orders at all (a browse-only shop keeps its price where it always was) and the design has an Add
 * part to carry it (`hasAddPart` is false only for a published design with a price but no Add part,
 * where the price must stay put).
 */
export function usePriceInAddSlot(hasAddPart: boolean | undefined): boolean {
  const { features } = useSettings();
  const { paused } = useWarehouseOrdering();
  return features.ordering && paused && hasAddPart !== false;
}
