import { useMemo } from 'react';
import { Button } from '@mantine/core';
import { useNavigate, useParams } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { CardDesignBoundary } from '@/builder/card-design.tsx';
import { CatalogueFamily, type CatalogueData, type GridSlots } from '@/builder/families.ts';
import { containsType, NO_SILENT, slotShows, type FamilyValue, type PartViewProps } from '@/builder/parts.ts';
import { defaultSlotRenders } from '@/builder/render.tsx';
import { useCatalog } from '@/features/catalog/use-catalog.ts';
import { buildCategoryTree } from '@/features/catalog/category-tree.ts';
import { categoryCounts, filterProducts, findCategoryBySlugOrId } from '@/features/catalog/filter.ts';
import { CatalogCategoriesView, CatalogEmptyView, CatalogSearchView } from '@/features/catalog/catalogue-parts.tsx';
import { FilterDrawer } from '@/features/catalog/FilterDrawer.tsx';
import { ProductCard } from '@/features/catalog/ProductCard.tsx';
import { ProductRow } from '@/features/catalog/ProductRow.tsx';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { useShellSearch } from '@/layouts/shell-context.ts';
import { FADE, rowAnim } from '@/lib/motion.ts';
import { Slot } from '@/templates/runtime.tsx';
import { useCoreOptions } from '@/templates/hooks.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/catalog/ProductGrid.module.css';

/** How many cards load their image eagerly — the first two rows on a phone. */
const EAGER_CARDS = 4;

/** With the picker off, a rail holding only the categories part draws nothing. */
const CATEGORIES_SILENT: ReadonlySet<string> = new Set(['CatalogCategories']);

function GridIntro() {
  const { products, tree } = CatalogueFamily.useData();
  const { brand, welcomeMessage } = useSettings();
  return <Slot name="CatalogHero" surface="grid" tagline={brand.tagline} welcomeMessage={welcomeMessage} productCount={products.length} categoryCount={tree.length} />;
}

function GridTitle({ styleAttrs }: PartViewProps) {
  const { active, visible, query } = CatalogueFamily.useData();
  const { showPageTitle } = useCoreOptions();
  const { t } = useText();
  // The page-title core option hides the whole heading block (its label and count
  // too), leaving the h1 in the accessibility tree only.
  return (
    <>
      {showPageTitle ? <Slot name="SectionLabel" index={1} title={active ? active.name : t('catalog.list.allProducts')} level="page" /> : null}
      <div className={showPageTitle ? classes.head : undefined} {...styleAttrs}>
        <h1 className={showPageTitle ? classes.title : 'sf-visually-hidden'} data-sf-part="page-title">{active ? active.name : t('catalog.list.allProducts')}</h1>
        {/* Micro-caps, so the shopper's own query stays out of it — the field
            above and the empty state below both quote it in their own case. */}
        {showPageTitle ? (
          <p className={classes.result}>
            {query ? t('catalog.list.matching', { count: visible.length }) : t('catalog.list.count', { count: visible.length })}
          </p>
        ) : null}
      </div>
    </>
  );
}

function GridResults() {
  const { visible, unknownCategory, imageless, openProduct } = CatalogueFamily.useData();
  if (unknownCategory || visible.length === 0) return null;
  return imageless ? (
    <CardDesignBoundary kind="row">
      <ul className={classes.rows}>
        {visible.map((product, i) => (
          <li key={product.id} {...rowAnim(i)}>
            <ProductRow product={product} onSelect={openProduct} />
          </li>
        ))}
      </ul>
    </CardDesignBoundary>
  ) : (
    <CardDesignBoundary kind="tile">
      <div className={classes.grid} data-sf-part="product-grid">
        {visible.map((product, i) => (
          <ProductCard key={product.id} product={product} eager={i < EAGER_CARDS} hasSiblingImages index={i} />
        ))}
      </div>
    </CardDesignBoundary>
  );
}

const GRID_VIEWS: FamilyValue<CatalogueData>['views'] = {
  CatalogIntro: GridIntro, CatalogSearch: CatalogSearchView, CatalogCategories: CatalogCategoriesView,
  CatalogTitle: GridTitle, CatalogResults: GridResults, CatalogEmpty: CatalogEmptyView,
};

/**
 * The storefront catalogue: a container of catalogue parts (spec §5.2) over the top, the
 * category rail and the main column. Without `slots` it draws the default arrangement —
 * v0.7.0's hero strip, category index and card grid.
 */
export function ProductGrid({ slots }: { slots?: GridSlots } = {}) {
  const legacy = useMemo(() => (slots ? null : (defaultSlotRenders('ProductGrid', 'storefront') as unknown as GridSlots)), [slots]);
  const { search, setSearch } = useShellSearch();
  const { categorySlug } = useParams();
  const catalog = useCatalog();
  const { showCategoryPicker } = useCoreOptions();
  const { t } = useText();

  const products = useMemo(() => catalog.data?.products ?? [], [catalog.data]);
  const categories = useMemo(() => catalog.data?.categories ?? [], [catalog.data]);
  const tree = useMemo(
    () => buildCategoryTree(categories, categoryCounts(products)),
    [categories, products],
  );
  const active = categorySlug ? findCategoryBySlugOrId(categories, categorySlug) : undefined;
  const unknownCategory = !!categorySlug && !active;
  const visible = useMemo(
    () => filterProducts(products, categories, { categoryId: active?.id ?? null, search }),
    [products, categories, active?.id, search],
  );
  const navigate = useNavigate();
  const imageless = visible.length > 0 && visible.every((p) => p.imageProductId === null);

  if (catalog.isPending) return <PageSkeleton inline />;

  if (catalog.isError) {
    return (
      <EmptyState
        eyebrow={t('catalog.list.eyebrowCatalogue')}
        title={t('common.list.loadFailed')}
        description={t('catalog.list.loadFailedDetail')}
        action={
          <Button variant="default" size="sm" onClick={() => void catalog.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  }

  const s = slots ?? legacy!;
  const query = search.trim();
  const data: CatalogueData = {
    surface: 'grid', products, tree, active, unknownCategory, visible, groups: [], search, query, setSearch, imageless, glyphs: false,
    openProduct: (p) => navigate(`/p/${p.id}`),
  };
  const all = [...s.top.items, ...s.rail.items, ...s.main.items];
  // Today's rule, from the slot: without a rail that would render, the column takes the full width.
  const railShows = slotShows(s.rail.items, showCategoryPicker ? NO_SILENT : CATEGORIES_SILENT);

  return (
    <CatalogueFamily.Provider value={{ data, views: GRID_VIEWS }}>
      <div className={`${classes.page} ${FADE}`}>
        {s.top()}
        <div className={railShows ? classes.layout : `${classes.layout} ${classes.noNav}`}>
          {railShows ? s.rail() : null}
          {s.main({ className: classes.column })}
        </div>
        {showCategoryPicker && containsType(all, 'CatalogCategories') ? <FilterDrawer tree={tree} total={products.length} activeId={active?.id ?? null} /> : null}
      </div>
    </CatalogueFamily.Provider>
  );
}
