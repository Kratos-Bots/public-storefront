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

  it('re-strikes a line whose base price is the same but whose tiers differ', () => {
    useCartStore.getState().add(p(1, 150, [{ id: 10, minQuantity: 10, price: 130 }]), 10);

    useCartStore.getState().repriceFromCatalogue([p(1, 150, [{ id: 10, minQuantity: 10, price: 120 }])]);
    expect(line(1)).toMatchObject({ basePrice: 150, unitPrice: 120 });
    expect(line(1).pricingTiers).toEqual([{ id: 10, minQuantity: 10, price: 120 }]);
  });

  it('re-strikes tiers that differ only in length, even when the unit price comes out the same', () => {
    useCartStore.getState().add(p(1, 150, [{ id: 10, minQuantity: 10, price: 130 }]), 1);

    useCartStore.getState().repriceFromCatalogue([p(1, 150, [{ id: 10, minQuantity: 10, price: 130 }, { id: 11, minQuantity: 50, price: 100 }])]);
    expect(line(1).pricingTiers).toHaveLength(2);
    expect(line(1).unitPrice).toBe(150);
  });

  it('still reprices a line that changes when another line\'s product is absent', () => {
    useCartStore.getState().add(p(1, 150), 2);
    useCartStore.getState().add(p(2, 40), 3);
    const absent = line(1);

    useCartStore.getState().repriceFromCatalogue([p(2, 45)]);
    expect(line(1)).toBe(absent);
    expect(line(2)).toMatchObject({ basePrice: 45, unitPrice: 45, quantity: 3 });
  });
});

describe('signed-in basket re-based from a warehouse catalogue', () => {
  const serverCart = (unitPrice: number, quantity = 2) => ({
    items: [{
      productId: 1, name: 'P1', quantity, unitPrice, lineTotal: unitPrice * quantity, imageUrl: null, isPreorder: false, outOfStock: false,
      priceChanged: false, inactive: false, belowMin: false, aboveMax: false, minOrderQuantity: null, maxOrderQuantity: null,
    }],
    subtotal: unitPrice * quantity, itemCount: quantity,
  });
  beforeEach(() => useCartStore.getState().clear());

  it('a line added at warehouse A, repriced by the server at B, no longer looks discounted once B\'s catalogue arrives', () => {
    // Added at A (base 200), then the server re-prices the basket at B (unit price 150).
    useCartStore.getState().add(p(1, 200, [{ id: 10, minQuantity: 10, price: 180 }]), 2);
    useCartStore.getState().replaceFromServer(serverCart(150));
    expect(line(1)).toMatchObject({ basePrice: 200, unitPrice: 150 }); // the stale metadata: reads as "was 200, now 150"

    useCartStore.getState().rebaseFromCatalogue([p(1, 150, [{ id: 11, minQuantity: 10, price: 120 }])]);
    expect(line(1)).toMatchObject({ basePrice: 150, unitPrice: 150, quantity: 2 });
    expect(line(1).pricingTiers).toEqual([{ id: 11, minQuantity: 10, price: 120 }]);
    // A quantity edit now resolves from B's tiers, not A's.
    useCartStore.getState().setQuantity(1, 10);
    expect(line(1).unitPrice).toBe(120);
  });

  it('never touches the unit price or quantity the server gave', () => {
    useCartStore.getState().replaceFromServer(serverCart(137, 4));
    useCartStore.getState().rebaseFromCatalogue([p(1, 150)]);
    expect(line(1)).toMatchObject({ unitPrice: 137, quantity: 4, basePrice: 150 });
  });

  it('leaves a line whose product is absent from the catalogue untouched', () => {
    useCartStore.getState().add(p(1, 200), 2);
    useCartStore.getState().replaceFromServer(serverCart(150));
    const absent = line(1);

    useCartStore.getState().rebaseFromCatalogue([p(2, 40)]);
    expect(line(1)).toBe(absent);
  });

  it('changes nothing, not even the state reference, when the metadata already matches', () => {
    useCartStore.getState().add(p(1, 150, [{ id: 10, minQuantity: 10, price: 130 }]), 2);
    useCartStore.getState().replaceFromServer(serverCart(150));
    useCartStore.getState().rebaseFromCatalogue([p(1, 150)]); // adopt a catalogue with no tiers
    const before = useCartStore.getState();

    useCartStore.getState().rebaseFromCatalogue([p(1, 150)]);
    expect(useCartStore.getState()).toBe(before);
    expect(useCartStore.getState().lines).toBe(before.lines);
  });

  it('a server refresh after the re-base keeps the re-based metadata', () => {
    useCartStore.getState().add(p(1, 200, [{ id: 10, minQuantity: 10, price: 180 }]), 2);
    useCartStore.getState().replaceFromServer(serverCart(150));
    useCartStore.getState().rebaseFromCatalogue([p(1, 150, [{ id: 11, minQuantity: 10, price: 120 }])]);

    useCartStore.getState().replaceFromServer(serverCart(150, 3));
    expect(line(1)).toMatchObject({ basePrice: 150, unitPrice: 150, quantity: 3 });
    expect(line(1).pricingTiers).toEqual([{ id: 11, minQuantity: 10, price: 120 }]);
  });
});
