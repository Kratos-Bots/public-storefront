import { beforeEach, describe, expect, it } from 'vitest';
import { useCartStore } from '@/stores/cart.ts';
import type { Product } from '@/types/catalog.ts';

const p = (id: number, price: number, tiers: Product['pricingTiers'] = []): Product => ({
  id, sku: `S${id}`, name: `P${id}`, displayName: `P${id}`, shortDisplayName: null, shortDescription: null, description: null, categoryId: 1, categoryName: 'C',
  sortOrder: 0, price, inStock: true, lowStockAlert: false, isActive: true, isPreorder: false, preorderEta: null, pricingTiers: tiers,
  upsellProductIds: [], excludedFromFreeShipping: false, imageProductId: null, provenance: null,
  minOrderQuantity: null, maxOrderQuantity: null,
});

const line = (id: number) => useCartStore.getState().lines.find((l) => l.productId === id)!;

describe('guest basket repriced from a warehouse catalogue', () => {
  beforeEach(() => useCartStore.getState().clear());

  it('replaces the base price and tiers and re-resolves the unit price at the line quantity', () => {
    useCartStore.getState().add(p(1, 150, [{ id: 10, minQuantity: 10, price: 130 }]), 10);
    expect(line(1)).toMatchObject({ quantity: 10, basePrice: 150, unitPrice: 130 });

    useCartStore.getState().repriceFromCatalogue([p(1, 200, [{ id: 10, minQuantity: 10, price: 180 }])]);
    expect(line(1)).toMatchObject({ quantity: 10, basePrice: 200, unitPrice: 180 });
    expect(line(1).pricingTiers).toEqual([{ id: 10, minQuantity: 10, price: 180 }]);
  });

  it('prices below the first tier at the new base price', () => {
    useCartStore.getState().add(p(1, 150, [{ id: 10, minQuantity: 10, price: 130 }]), 1);
    expect(line(1).unitPrice).toBe(150);

    useCartStore.getState().repriceFromCatalogue([p(1, 200, [{ id: 10, minQuantity: 10, price: 180 }])]);
    expect(line(1)).toMatchObject({ quantity: 1, basePrice: 200, unitPrice: 200 });
  });

  it('leaves a line whose product is not in the catalogue exactly as it was', () => {
    useCartStore.getState().add(p(1, 150), 2);
    useCartStore.getState().add(p(2, 40), 3);
    const untouched = line(2);

    useCartStore.getState().repriceFromCatalogue([p(1, 200)]);
    expect(line(1)).toMatchObject({ basePrice: 200, unitPrice: 200 });
    expect(line(2)).toBe(untouched);
  });

  it('does not change the store state when the prices already match', () => {
    useCartStore.getState().add(p(1, 150, [{ id: 10, minQuantity: 10, price: 130 }]), 10);
    const before = useCartStore.getState();

    // A fresh copy with the same figures, as the next catalogue response would be.
    useCartStore.getState().repriceFromCatalogue([p(1, 150, [{ id: 10, minQuantity: 10, price: 130 }])]);
    expect(useCartStore.getState()).toBe(before);
    expect(useCartStore.getState().lines).toBe(before.lines);
  });

  it('does not touch an empty basket', () => {
    const before = useCartStore.getState();
    useCartStore.getState().repriceFromCatalogue([p(1, 200)]);
    expect(useCartStore.getState()).toBe(before);
  });
});
