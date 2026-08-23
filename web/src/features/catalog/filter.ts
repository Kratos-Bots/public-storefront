import { collectDescendantIds } from '@/features/catalog/category-tree.ts';
import type { Catalog, Category, Product } from '@/types/catalog.ts';

export const bySortOrder = (a: Product, b: Product) =>
  a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName, undefined, { numeric: true });

export function categoryCounts(products: Product[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const p of products) if (p.categoryId != null) counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
  return counts;
}

export function filterProducts(products: Product[], categories: Category[], f: { categoryId: number | null; search: string }): Product[] {
  let out = products;
  if (f.categoryId != null) { const allowed = collectDescendantIds(f.categoryId, categories); out = out.filter((p) => p.categoryId != null && allowed.has(p.categoryId)); }
  const q = f.search.trim().toLowerCase();
  if (q) out = out.filter((p) => p.displayName.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  return [...out].sort(bySortOrder);
}

export function findCategoryBySlugOrId(categories: Category[], key: string): Category | undefined {
  return categories.find((c) => c.slug === key) ?? categories.find((c) => String(c.id) === key);
}

export function upsellsFor(product: Product, catalog: Catalog | undefined): Product[] {
  if (!catalog) return [];
  return product.upsellProductIds.map((id) => catalog.products.find((p) => p.id === id)).filter((p): p is Product => !!p);
}
