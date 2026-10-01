import { describe, expect, it } from 'vitest';
import { bestTier } from '@/features/catalog/best-tier.ts';
import { baseProduct } from './helpers/product-fixtures.ts';

describe('bestTier', () => {
  it('null without tiers, else the lowest-priced rung', () => {
    expect(bestTier(baseProduct({ pricingTiers: [] }))).toBeNull();
    const tiers = [{ minQuantity: 5, price: 9 }, { minQuantity: 10, price: 7 }, { minQuantity: 20, price: 8 }];
    expect(bestTier(baseProduct({ pricingTiers: tiers as never }))).toEqual(tiers[1]);
  });
});
