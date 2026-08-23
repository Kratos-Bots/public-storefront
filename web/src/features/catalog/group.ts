import type { CategoryNode } from '@/features/catalog/category-tree.ts';
import type { Product } from '@/types/catalog.ts';

export interface ProductGroup {
  key: string;
  /** The category's own name — the header's headline. */
  label: string;
  /** Its ancestors, already joined — the quiet half of the header. */
  trail: string;
  emoji: string | null;
  products: Product[];
}

/** Depth-first walk of the tree, carrying each node's ancestor names with it. */
function walk(nodes: CategoryNode[], trail: string[] = []): { node: CategoryNode; trail: string[] }[] {
  return nodes.flatMap((node) => [
    { node, trail },
    ...walk(node.children, [...trail, node.name]),
  ]);
}

/**
 * Bucket the visible products under their own category and emit the buckets in
 * the index's order, so every catalogue body and the filter sheet agree on what
 * comes first. Each bucket keeps the order the products arrived in. A product
 * whose category the catalogue no longer carries keeps its place at the end
 * rather than vanishing.
 */
export function groupProducts(visible: Product[], tree: CategoryNode[]): ProductGroup[] {
  const buckets = new Map<number, Product[]>();
  const loose: Product[] = [];
  for (const product of visible) {
    if (product.categoryId === null) {
      loose.push(product);
      continue;
    }
    const bucket = buckets.get(product.categoryId);
    if (bucket) bucket.push(product);
    else buckets.set(product.categoryId, [product]);
  }

  const groups: ProductGroup[] = [];
  for (const { node, trail } of walk(tree)) {
    const products = buckets.get(node.id);
    if (!products) continue;
    buckets.delete(node.id);
    groups.push({ key: String(node.id), label: node.name, trail: trail.join(' / '), emoji: node.emoji, products });
  }
  for (const [id, products] of buckets) {
    groups.push({ key: String(id), label: products[0]?.categoryName ?? 'Other', trail: '', emoji: null, products });
  }
  if (loose.length > 0) {
    groups.push({ key: 'none', label: 'Uncategorised', trail: '', emoji: null, products: loose });
  }
  return groups;
}
