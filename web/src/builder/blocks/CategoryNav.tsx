import { lazy, useMemo } from 'react';
import { useParams } from 'react-router';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { useCatalog } from '@/features/catalog/use-catalog.ts';
import { buildCategoryTree } from '@/features/catalog/category-tree.ts';
import { categoryCounts, findCategoryBySlugOrId } from '@/features/catalog/filter.ts';

const CategoryNav = lazy(() => import('@/features/catalog/CategoryNav.tsx').then((m) => ({ default: m.CategoryNav })));

function CategoryNavView() {
  const catalog = useCatalog();
  const { categorySlug } = useParams();
  const products = useMemo(() => catalog.data?.products ?? [], [catalog.data]);
  const categories = useMemo(() => catalog.data?.categories ?? [], [catalog.data]);
  const tree = useMemo(() => buildCategoryTree(categories, categoryCounts(products)), [categories, products]);
  if (!catalog.data) return null;
  const active = categorySlug ? findCategoryBySlugOrId(categories, categorySlug) : undefined;
  return <CategoryNav tree={tree} total={products.length} activeId={active?.id ?? null} />;
}

/** The category chips (phones) and rail (from 62em). */
export const block = defineBlock<{ id: string }>({
  name: 'CategoryNav', label: 'Categories', category: 'catalogue', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <CategoryNavView />,
});
