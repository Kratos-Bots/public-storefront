import { describe, expect, it } from 'vitest';
import { bySortOrder, categoryCounts, filterProducts, findCategoryBySlugOrId, upsellsFor } from '@/features/catalog/filter.ts';
import type { Catalog, Category, Product } from '@/types/catalog.ts';

function product(overrides: Partial<Product> & { id: number }): Product {
  return {
    sku: `SKU-${overrides.id}`,
    name: `Product ${overrides.id}`,
    displayName: `Product ${overrides.id}`,
    shortDisplayName: null,
    description: null,
    categoryId: null,
    categoryName: null,
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

function category(overrides: Partial<Category> & { id: number }): Category {
  return { name: `Cat ${overrides.id}`, slug: null, parentId: null, sortOrder: 0, emoji: null, ...overrides };
}

describe('bySortOrder', () => {
  it('sorts by sortOrder then by displayName', () => {
    const products = [
      product({ id: 1, sortOrder: 2, displayName: 'B' }),
      product({ id: 2, sortOrder: 1, displayName: 'Z' }),
      product({ id: 3, sortOrder: 1, displayName: 'A' }),
    ];
    expect([...products].sort(bySortOrder).map((p) => p.id)).toEqual([3, 2, 1]);
  });
});

describe('categoryCounts', () => {
  it('counts products per categoryId, ignoring uncategorized products', () => {
    const products = [
      product({ id: 1, categoryId: 1 }),
      product({ id: 2, categoryId: 1 }),
      product({ id: 3, categoryId: 2 }),
      product({ id: 4, categoryId: null }),
    ];
    expect(categoryCounts(products)).toEqual(new Map([[1, 2], [2, 1]]));
  });
});

describe('filterProducts', () => {
  it('with no category filter returns everything sorted by bySortOrder', () => {
    const products = [
      product({ id: 1, sortOrder: 2, displayName: 'B' }),
      product({ id: 2, sortOrder: 1, displayName: 'A' }),
    ];
    const out = filterProducts(products, [], { categoryId: null, search: '' });
    expect(out.map((p) => p.id)).toEqual([2, 1]);
  });

  it('with a category filter returns only products in that category or its descendants', () => {
    const categories = [
      category({ id: 1, parentId: null }),
      category({ id: 2, parentId: 1 }),
      category({ id: 3, parentId: null }), // unrelated
    ];
    const products = [
      product({ id: 1, categoryId: 1 }),
      product({ id: 2, categoryId: 2 }),
      product({ id: 3, categoryId: 3 }),
      product({ id: 4, categoryId: null }),
    ];
    const out = filterProducts(products, categories, { categoryId: 1, search: '' });
    expect(out.map((p) => p.id).sort()).toEqual([1, 2]);
  });

  it('search matches displayName or sku, case-insensitively', () => {
    const products = [
      product({ id: 1, displayName: 'Blue Widget', sku: 'BW-1' }),
      product({ id: 2, displayName: 'Red Gadget', sku: 'RG-2' }),
      product({ id: 3, displayName: 'Green Thing', sku: 'BW-3' }),
    ];

    expect(filterProducts(products, [], { categoryId: null, search: 'widget' }).map((p) => p.id)).toEqual([1]);
    expect(filterProducts(products, [], { categoryId: null, search: 'bw' }).map((p) => p.id).sort()).toEqual([1, 3]);
    expect(filterProducts(products, [], { categoryId: null, search: 'RED' }).map((p) => p.id)).toEqual([2]);
  });

  it('combines the category and search filters', () => {
    const categories = [
      category({ id: 1, parentId: null }),
      category({ id: 2, parentId: 1 }),
    ];
    const products = [
      product({ id: 1, categoryId: 1, displayName: 'Blue Widget' }),
      product({ id: 2, categoryId: 2, displayName: 'Blue Gadget' }),
      product({ id: 3, categoryId: 1, displayName: 'Red Widget' }),
      product({ id: 4, categoryId: null, displayName: 'Blue Orphan' }),
    ];
    const out = filterProducts(products, categories, { categoryId: 1, search: 'blue' });
    expect(out.map((p) => p.id).sort()).toEqual([1, 2]);
  });
});

describe('findCategoryBySlugOrId', () => {
  it('matches by slug before falling back to id, even when a slug collides with another id', () => {
    const categories = [
      category({ id: 5, slug: 'widgets' }),
      category({ id: 7, slug: '5' }),
    ];
    expect(findCategoryBySlugOrId(categories, 'widgets')?.id).toBe(5);
    // '5' matches category 7's slug before it would match category 5's id.
    expect(findCategoryBySlugOrId(categories, '5')?.id).toBe(7);
  });

  it('falls back to matching by id when no slug matches', () => {
    const categories = [
      category({ id: 5, slug: 'widgets' }),
      category({ id: 9, slug: null }),
    ];
    expect(findCategoryBySlugOrId(categories, '9')?.id).toBe(9);
  });

  it('returns undefined when nothing matches', () => {
    const categories = [category({ id: 1, slug: 'a' })];
    expect(findCategoryBySlugOrId(categories, 'missing')).toBeUndefined();
  });
});

describe('upsellsFor', () => {
  it('resolves upsell ids to catalog products, dropping ids not present in the catalog', () => {
    const catalog: Catalog = {
      products: [product({ id: 1 }), product({ id: 2 }), product({ id: 3 })],
      categories: [],
    };
    const p = product({ id: 10, upsellProductIds: [2, 999, 1] });
    expect(upsellsFor(p, catalog).map((x) => x.id)).toEqual([2, 1]);
  });

  it('returns an empty array when there is no catalog yet', () => {
    const p = product({ id: 10, upsellProductIds: [1, 2] });
    expect(upsellsFor(p, undefined)).toEqual([]);
  });
});
