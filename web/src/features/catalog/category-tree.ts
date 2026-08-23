import type { Category } from '@/types/catalog.ts';

export type CategoryNode = Category & { children: CategoryNode[]; productCount: number };

/**
 * Build a tree of categories from the flat list, then attach a `productCount`
 * representing the *transitive* number of products in that category (and all
 * descendants).
 *
 * @param categories — flat list (already filtered to only visible ones)
 * @param countsById — direct product counts keyed by categoryId
 */
export function buildCategoryTree(
  categories: Category[],
  countsById: Map<number, number>,
): CategoryNode[] {
  // Index nodes
  const byId = new Map<number, CategoryNode>();
  for (const c of categories) {
    byId.set(c.id, { ...c, children: [], productCount: countsById.get(c.id) ?? 0 });
  }

  const roots: CategoryNode[] = [];
  for (const c of categories) {
    const node = byId.get(c.id)!;
    if (c.parentId !== null && byId.has(c.parentId)) {
      byId.get(c.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sum child counts up the tree, depth-first
  const sumCounts = (node: CategoryNode): number => {
    let total = countsById.get(node.id) ?? 0;
    for (const child of node.children) total += sumCounts(child);
    node.productCount = total;
    return total;
  };
  for (const root of roots) sumCounts(root);

  // Sort by sortOrder, then name
  const sortNodes = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    for (const n of nodes) sortNodes(n.children);
  };
  sortNodes(roots);

  // Drop any branches with zero products (after filtering hidden-category products
  // upstream this can leave empty parents).
  const prune = (nodes: CategoryNode[]): CategoryNode[] =>
    nodes
      .map((n) => ({ ...n, children: prune(n.children) }))
      .filter((n) => n.productCount > 0);

  return prune(roots);
}

/**
 * Collect a category id and all of its descendant ids, so a parent-tap filter
 * matches every product in any sub-category beneath.
 */
export function collectDescendantIds(
  rootId: number,
  categories: Category[],
): Set<number> {
  const ids = new Set<number>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of categories) {
      if (c.parentId !== null && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id);
        grew = true;
      }
    }
  }
  return ids;
}
