import { lazy, useMemo } from 'react';
import { useParams } from 'react-router';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { useCatalog } from '@/features/catalog/use-catalog.ts';
import { buildCategoryTree } from '@/features/catalog/category-tree.ts';
import { categoryCounts, findCategoryBySlugOrId } from '@/features/catalog/filter.ts';
import classes from '@/builder/blocks/CategoryNav.module.css';

const CategoryNav = lazy(() => import('@/features/catalog/CategoryNav.tsx').then((m) => ({ default: m.CategoryNav })));

function CategoryNavView() {
  const catalog = useCatalog();
  const { categorySlug } = useParams();
  const products = useMemo(() => catalog.data?.products ?? [], [catalog.data]);
  const categories = useMemo(() => catalog.data?.categories ?? [], [catalog.data]);
  const tree = useMemo(() => buildCategoryTree(categories, categoryCounts(products)), [categories, products]);
  if (!catalog.data) return null;
  const active = categorySlug ? findCategoryBySlugOrId(categories, categorySlug) : undefined;
  return (
    <div className={classes.wrap} data-sf-block="CategoryNav">
      <CategoryNav tree={tree} total={products.length} activeId={active?.id ?? null} />
    </div>
  );
}

/**
 * The category chips (phones) and rail (from 62em). Placed explicitly, so it ignores the
 * `showCategoryPicker` core option (which only governs the list blocks' built-in picker).
 */
export const block = defineBlock<{ id: string }>({
  name: 'CategoryNav', label: 'Categories (always shown)', category: 'catalogue', layouts: 'all', routeBound: false, slots: [],
  text: ['catalog.nav.*', 'catalog.list.*'],
  schema: z.object({}), defaultProps: {},
  render: () => <CategoryNavView />,
});
