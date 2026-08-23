import { describe, expect, it } from 'vitest';
import { buildCategoryTree, collectDescendantIds } from '@/features/catalog/category-tree.ts';
import type { Category } from '@/types/catalog.ts';

function cat(overrides: Partial<Category> & { id: number }): Category {
  return { name: `Cat ${overrides.id}`, slug: null, parentId: null, sortOrder: 0, emoji: null, ...overrides };
}

describe('buildCategoryTree', () => {
  it('promotes a category whose parentId points at a missing category to root', () => {
    const categories = [
      cat({ id: 1, name: 'Root', parentId: null }),
      cat({ id: 2, name: 'Orphan', parentId: 999 }),
    ];
    const counts = new Map([[1, 1], [2, 1]]);
    const tree = buildCategoryTree(categories, counts);
    expect(tree.map((n) => n.id).sort()).toEqual([1, 2]);
    expect(tree.find((n) => n.id === 2)?.children).toEqual([]);
  });

  it('sums product counts transitively up the tree', () => {
    const categories = [
      cat({ id: 1, name: 'A', parentId: null }),
      cat({ id: 2, name: 'B', parentId: 1 }),
      cat({ id: 3, name: 'C', parentId: 2 }),
    ];
    const counts = new Map([[2, 3], [3, 2]]);
    const tree = buildCategoryTree(categories, counts);
    const a = tree.find((n) => n.id === 1)!;
    const b = a.children.find((n) => n.id === 2)!;
    const c = b.children.find((n) => n.id === 3)!;
    expect(a.productCount).toBe(5);
    expect(b.productCount).toBe(5);
    expect(c.productCount).toBe(2);
  });

  it('keeps a branch whose own count is zero when a descendant has products, but prunes it otherwise', () => {
    const categories = [
      cat({ id: 1, name: 'Has products', parentId: null }),
      cat({ id: 2, name: 'Empty root', parentId: null }),
      cat({ id: 3, name: 'Empty child', parentId: 1 }),
      cat({ id: 4, name: 'Grandchild with product', parentId: 3 }),
    ];
    const counts = new Map([[1, 1], [4, 1]]);
    const tree = buildCategoryTree(categories, counts);
    expect(tree.map((n) => n.id)).toEqual([1]); // "Empty root" (#2) is pruned entirely
    const has = tree[0]!;
    expect(has.children.map((n) => n.id)).toEqual([3]); // "Empty child" survives because its descendant has products
    expect(has.children[0]!.productCount).toBe(1);
  });

  it('drops a branch entirely when neither it nor any descendant has products', () => {
    const categories = [
      cat({ id: 1, name: 'Empty', parentId: null }),
      cat({ id: 2, name: 'Also empty', parentId: 1 }),
    ];
    const tree = buildCategoryTree(categories, new Map());
    expect(tree).toEqual([]);
  });

  it('sorts siblings by sortOrder then by name', () => {
    const categories = [
      cat({ id: 1, name: 'Zebra', parentId: null, sortOrder: 1 }),
      cat({ id: 2, name: 'Apple', parentId: null, sortOrder: 1 }),
      cat({ id: 3, name: 'First', parentId: null, sortOrder: 0 }),
    ];
    const counts = new Map([[1, 1], [2, 1], [3, 1]]);
    const tree = buildCategoryTree(categories, counts);
    expect(tree.map((n) => n.id)).toEqual([3, 2, 1]);
  });
});

describe('collectDescendantIds', () => {
  const categories = [
    cat({ id: 1, name: 'Root', parentId: null }),
    cat({ id: 2, name: 'Child', parentId: 1 }),
    cat({ id: 3, name: 'Grandchild', parentId: 2 }),
    cat({ id: 4, name: 'Unrelated', parentId: null }),
  ];

  it('collects the root id and every transitive descendant', () => {
    const ids = collectDescendantIds(1, categories);
    expect(ids).toEqual(new Set([1, 2, 3]));
  });

  it('is order-independent — array order does not change the result', () => {
    const shuffled = [categories[3]!, categories[2]!, categories[0]!, categories[1]!];
    const forward = collectDescendantIds(1, categories);
    const reordered = collectDescendantIds(1, shuffled);
    expect(reordered).toEqual(forward);
    expect(reordered).toEqual(new Set([1, 2, 3]));
  });
});
