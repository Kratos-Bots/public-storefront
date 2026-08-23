import { describe, expect, it } from 'vitest';
import { activeRungMin, bandRows, ladderRungs } from '@/features/wholesale/wholesale-helpers.ts';
import type { PricingTier, Product } from '@/types/catalog.ts';

function product(overrides: Partial<Product> & { id: number }): Product {
  return {
    sku: `SKU-${overrides.id}`,
    name: `Product ${overrides.id}`,
    displayName: `Product ${overrides.id}`,
    shortDisplayName: null,
    description: null,
    categoryId: 1,
    categoryName: 'Cat 1',
    sortOrder: overrides.id,
    price: 100,
    inStock: true,
    lowStockAlert: false,
    isActive: true,
    isPreorder: false,
    preorderEta: null,
    pricingTiers: [],
    upsellProductIds: [],
    excludedFromFreeShipping: false,
    imageProductId: null,
    provenance: null,
    ...overrides,
  };
}

function tier(minQuantity: number, price: number): PricingTier {
  return { id: minQuantity, minQuantity, price };
}

describe('bandRows', () => {
  it('returns nothing for an empty catalogue', () => {
    expect(bandRows([])).toEqual([]);
  });

  it('leaves the first category run unbanded and flips on every following run', () => {
    const rows = bandRows([
      product({ id: 1, categoryId: 1 }),
      product({ id: 2, categoryId: 1 }),
      product({ id: 3, categoryId: 2 }),
      product({ id: 4, categoryId: 3 }),
      product({ id: 5, categoryId: 3 }),
    ]);
    expect(rows.map((r) => r.band)).toEqual([false, false, true, false, false]);
  });

  it('closes every run — the last row of each, and the last row overall', () => {
    const rows = bandRows([
      product({ id: 1, categoryId: 1 }),
      product({ id: 2, categoryId: 1 }),
      product({ id: 3, categoryId: 2 }),
      product({ id: 4, categoryId: 3 }),
    ]);
    expect(rows.map((r) => r.groupEnd)).toEqual([false, true, true, true]);
  });

  it('starts a new run when a category comes back later in the order', () => {
    const rows = bandRows([
      product({ id: 1, categoryId: 1 }),
      product({ id: 2, categoryId: 2 }),
      product({ id: 3, categoryId: 1 }),
    ]);
    expect(rows.map((r) => r.band)).toEqual([false, true, false]);
    expect(rows.map((r) => r.groupEnd)).toEqual([true, true, true]);
  });

  it('treats consecutive uncategorised products as one run', () => {
    const rows = bandRows([
      product({ id: 1, categoryId: null }),
      product({ id: 2, categoryId: null }),
      product({ id: 3, categoryId: 4 }),
    ]);
    expect(rows.map((r) => r.band)).toEqual([false, false, true]);
    expect(rows.map((r) => r.groupEnd)).toEqual([false, true, true]);
  });

  it('keeps the catalogue order and carries each product through untouched', () => {
    const products = [product({ id: 7 }), product({ id: 3 }), product({ id: 5 })];
    expect(bandRows(products).map((r) => r.product)).toEqual(products);
  });
});

describe('ladderRungs', () => {
  it('is a single 1+ rung at the base price when a product has no tiers', () => {
    expect(ladderRungs(product({ id: 1, price: 42 }))).toEqual([{ minQuantity: 1, price: 42 }]);
  });

  it('puts the base price first, then every tier by ascending threshold', () => {
    const rungs = ladderRungs(
      product({ id: 1, price: 100, pricingTiers: [tier(25, 80), tier(5, 92), tier(100, 70)] }),
    );
    expect(rungs).toEqual([
      { minQuantity: 1, price: 100 },
      { minQuantity: 5, price: 92 },
      { minQuantity: 25, price: 80 },
      { minQuantity: 100, price: 70 },
    ]);
  });
});

describe('activeRungMin', () => {
  it('is the base rung below the first threshold — an empty quantity included', () => {
    const p = product({ id: 1, price: 100, pricingTiers: [tier(5, 92), tier(25, 80)] });
    expect(activeRungMin(p, 0)).toBe(1);
    expect(activeRungMin(p, 4)).toBe(1);
  });

  it('is the highest threshold the quantity has reached', () => {
    const p = product({ id: 1, price: 100, pricingTiers: [tier(5, 92), tier(25, 80)] });
    expect(activeRungMin(p, 5)).toBe(5);
    expect(activeRungMin(p, 24)).toBe(5);
    expect(activeRungMin(p, 25)).toBe(25);
    expect(activeRungMin(p, 900)).toBe(25);
  });

  it('is the base rung for a product with no tiers at any quantity', () => {
    expect(activeRungMin(product({ id: 1, pricingTiers: [] }), 500)).toBe(1);
  });
});
