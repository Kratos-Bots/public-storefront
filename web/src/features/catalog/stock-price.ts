import { deriveStockStatus } from '@/lib/format.ts';
import { useCoreOptions } from '@/templates/hooks.ts';
import type { Product } from '@/types/catalog.ts';

/**
 * True when this product's price slot should read "Out of stock" instead (the
 * `showOutOfStockPrice` core option is off and the product is out for stock reasons —
 * the same test the row's add button uses, so a preorder keeps its price). Lists and
 * cards only: the product sheet and page always show the price.
 */
export function useOutOfStockInPriceSlot(product: Product): boolean {
  const { showOutOfStockPrice } = useCoreOptions();
  return !showOutOfStockPrice && !product.isPreorder && deriveStockStatus(product.inStock, product.lowStockAlert) === 'out';
}
