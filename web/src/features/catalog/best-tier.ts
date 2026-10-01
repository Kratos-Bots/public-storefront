import type { Product } from '@/types/catalog.ts';

/** The lowest-price bulk rung, or null. */
export function bestTier(product: Product): Product['pricingTiers'][number] | null {
  return product.pricingTiers.reduce<Product['pricingTiers'][number] | null>(
    (lowest, tier) => (!lowest || tier.price < lowest.price ? tier : lowest),
    null,
  );
}
