import { useSettings } from '@/app/settings.ts';
import { useWarehouseOrdering } from '@/features/warehouses/use-warehouse.ts';

/**
 * While the warehouse the shopper ships from is not taking orders, the quantity picker has nothing
 * to do, so the price takes its slot instead of sitting under the name. True only when the shop
 * orders at all (a browse-only shop keeps its price where it always was) and the Add part is the one to
 * carry it. In a published design (`addCarriesPrice`, from `builder/cards.ts`) the Add part carries the
 * paused price when EITHER the design draws the Add part on every viewport, OR the design has no Price
 * part that could carry it instead; otherwise (the Add part is hidden on some viewport, or absent, and a
 * Price part exists) the Add part draws nothing and the Price part keeps the price. That leaves exactly
 * one price at every width. A card with no design (the built-in one) leaves it undefined: the Add part.
 */
export function usePriceInAddSlot(addCarriesPrice: boolean | undefined): boolean {
  const { features } = useSettings();
  const { paused } = useWarehouseOrdering();
  return features.ordering && paused && addCarriesPrice !== false;
}
