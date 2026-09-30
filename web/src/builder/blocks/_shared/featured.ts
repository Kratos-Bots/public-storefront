import { bySortOrder, filterProducts } from '@/features/catalog/filter.ts';
import type { Category, Product } from '@/types/catalog.ts';

export type FeaturedQuery = { source: 'picked' | 'category'; items: Array<{ productId: number }>; categoryId: number | null; limit: number };

export function pickFeatured(products: Product[], categories: Category[], q: FeaturedQuery): Product[] {
  if (q.source === 'picked') {
    const byId = new Map(products.map((p) => [p.id, p]));
    const ids = [...new Set(q.items.map((i) => i.productId))];
    return ids.map((id) => byId.get(id)).filter((p): p is Product => p !== undefined).slice(0, q.limit);
  }
  if (q.categoryId === null) return [...products].sort(bySortOrder).slice(0, q.limit);
  return filterProducts(products, categories, { categoryId: q.categoryId, search: '' }).slice(0, q.limit);
}
