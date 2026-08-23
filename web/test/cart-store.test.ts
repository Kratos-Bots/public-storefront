import { beforeEach, describe, expect, it } from 'vitest';
import { useCartStore, selectCount, selectSubtotal } from '@/stores/cart.ts';
import type { Product } from '@/types/catalog.ts';

const p = (id: number, price = 10, tiers: Product['pricingTiers'] = []): Product => ({
  id, sku: `S${id}`, name: `P${id}`, displayName: `P${id}`, shortDisplayName: null, description: null, categoryId: 1, categoryName: 'C',
  sortOrder: 0, price, inStock: true, lowStockAlert: false, isActive: true, isPreorder: false, preorderEta: null, pricingTiers: tiers,
  upsellProductIds: [], excludedFromFreeShipping: false, imageProductId: null, provenance: null,
});

describe('cart store', () => {
  beforeEach(() => useCartStore.getState().clear());

  it('adds and merges quantities, re-resolving tier price', () => {
    const s = useCartStore.getState();
    s.add(p(1, 10, [{ id: 1, minQuantity: 3, price: 8 }]), 2);
    s.add(p(1, 10, [{ id: 1, minQuantity: 3, price: 8 }]), 1);
    expect(useCartStore.getState().lines).toEqual([expect.objectContaining({ productId: 1, quantity: 3, unitPrice: 8 })]);
    expect(selectSubtotal(useCartStore.getState().lines)).toBe(24);
    expect(selectCount(useCartStore.getState())).toBe(3);
  });

  it('setQuantity(0) removes', () => {
    useCartStore.getState().add(p(2));
    useCartStore.getState().setQuantity(2, 0);
    expect(useCartStore.getState().lines).toHaveLength(0);
  });

  it('mergeForLogin returns {productId, quantity} lines', () => {
    useCartStore.getState().add(p(3), 2);
    expect(useCartStore.getState().mergeForLogin()).toEqual([{ productId: 3, quantity: 2 }]);
  });

  it('replaceFromServer keeps the catalogue metadata of lines it already holds', () => {
    // Added locally at a bulk break: unit 8, base 10, with the tier that did it.
    useCartStore.getState().add(p(1, 10, [{ id: 1, minQuantity: 3, price: 8 }]), 3);

    useCartStore.getState().replaceFromServer({
      items: [
        { productId: 1, name: 'P1 as the server names it', quantity: 4, unitPrice: 8, lineTotal: 32, imageUrl: null, isPreorder: true, outOfStock: false, priceChanged: false, inactive: false },
        { productId: 99, name: 'Added from the bot', quantity: 1, unitPrice: 12, lineTotal: 12, imageUrl: null, isPreorder: false, outOfStock: false, priceChanged: false, inactive: false },
      ],
      subtotal: 44,
      itemCount: 5,
    });

    const [seen, unseen] = useCartStore.getState().lines;
    // Server wins on what is on the order and what it costs...
    expect(seen).toMatchObject({ productId: 1, quantity: 4, unitPrice: 8, displayName: 'P1 as the server names it', isPreorder: true });
    // ...local keeps what the server's line shape cannot carry, so the struck
    // base price survives a round trip.
    expect(seen).toMatchObject({ basePrice: 10, sku: 'S1', imageProductId: null, excludedFromFreeShipping: false });
    expect(seen!.pricingTiers).toEqual([{ id: 1, minQuantity: 3, price: 8 }]);
    expect(seen!.unitPrice < seen!.basePrice).toBe(true);

    // A line this browser has never seen shows no discount rather than a wrong one.
    expect(unseen).toMatchObject({ productId: 99, basePrice: 12, unitPrice: 12, sku: '', imageProductId: 99 });
    expect(unseen!.pricingTiers).toEqual([]);
  });

  it('replaceFromServer mirrors the server cart and switches to server mode', () => {
    useCartStore.getState().replaceFromServer({ items: [{ productId: 9, name: 'X', quantity: 4, unitPrice: 5, lineTotal: 20, imageUrl: null, isPreorder: false, outOfStock: false, priceChanged: false, inactive: false }], subtotal: 20, itemCount: 4 });
    const st = useCartStore.getState();
    expect(st.mode).toBe('server');
    expect(st.lines[0]).toMatchObject({ productId: 9, quantity: 4, unitPrice: 5, displayName: 'X' });
  });
});
