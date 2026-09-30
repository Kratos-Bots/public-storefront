import { useMemo } from 'react';
import { Button } from '@mantine/core';
import { Link, useNavigate, useParams } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useCatalog } from '@/features/catalog/use-catalog.ts';
import { buildCategoryTree } from '@/features/catalog/category-tree.ts';
import { categoryCounts, filterProducts, findCategoryBySlugOrId } from '@/features/catalog/filter.ts';
import { CategoryNav } from '@/features/catalog/CategoryNav.tsx';
import { FilterDrawer } from '@/features/catalog/FilterDrawer.tsx';
import { ProductCard } from '@/features/catalog/ProductCard.tsx';
import { ProductRow } from '@/features/catalog/ProductRow.tsx';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { SearchField } from '@/layouts/SearchField.tsx';
import { useShellSearch } from '@/layouts/shell-context.ts';
import { FADE, rowAnim } from '@/lib/motion.ts';
import { Slot } from '@/templates/runtime.tsx';
import { useCoreOptions } from '@/templates/hooks.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/catalog/ProductGrid.module.css';

/** How many cards load their image eagerly — the first two rows on a phone. */
const EAGER_CARDS = 4;

/**
 * The storefront catalogue: hero strip, category index, card grid. Rendered by
 * `CatalogPage` for `layout: 'storefront'`; the menu layout has its own body.
 */
export function ProductGrid() {
  const { brand, welcomeMessage } = useSettings();
  const { search, setSearch } = useShellSearch();
  const { categorySlug } = useParams();
  const catalog = useCatalog();
  const { showPageTitle, showCategoryPicker } = useCoreOptions();
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

  const query = search.trim();

  return (
    <div className={`${classes.page} ${FADE}`}>
      <Slot name="CatalogHero" surface="grid" tagline={brand.tagline} welcomeMessage={welcomeMessage} productCount={products.length} categoryCount={tree.length} />

      <SearchField className={classes.search} value={search} onChange={setSearch} />

      {/* Without the picker the column takes the full width: no rail, no chip row, no sheet. */}
      <div className={showCategoryPicker ? classes.layout : `${classes.layout} ${classes.noNav}`}>
        {showCategoryPicker ? <CategoryNav tree={tree} total={products.length} activeId={active?.id ?? null} /> : null}

        <div className={classes.column}>
          {/* The page-title core option hides the whole heading block (its label and count
              too), leaving the h1 in the accessibility tree only. */}
          {showPageTitle ? <Slot name="SectionLabel" index={1} title={active ? active.name : t('catalog.list.allProducts')} level="page" /> : null}
          <div className={showPageTitle ? classes.head : undefined}>
            <h1 className={showPageTitle ? classes.title : 'sf-visually-hidden'} data-sf-part="page-title">{active ? active.name : t('catalog.list.allProducts')}</h1>
            {/* Micro-caps, so the shopper's own query stays out of it — the field
                above and the empty state below both quote it in their own case. */}
            {showPageTitle ? (
              <p className={classes.result}>
                {query ? t('catalog.list.matching', { count: visible.length }) : t('catalog.list.count', { count: visible.length })}
              </p>
            ) : null}
          </div>

          {unknownCategory ? (
            <EmptyState
              eyebrow={t('catalog.list.eyebrowCategory')}
              title={t('common.list.categoryMissing')}
              description={t('catalog.list.categoryMissingDetail')}
              action={
                <Button component={Link} to="/" variant="default" size="sm">
                  {t('catalog.list.showAll')}
                </Button>
              }
            />
          ) : visible.length === 0 ? (
            query ? (
              <EmptyState
                eyebrow={t('catalog.list.eyebrowSearch')}
                title={t('common.list.noMatches', { query })}
                description={t('catalog.list.noMatchesDetail')}
                action={
                  <Button variant="default" size="sm" onClick={() => setSearch('')}>
                    {t('common.list.clearSearch')}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                eyebrow={t('catalog.list.eyebrowCatalogue')}
                title={t('common.list.emptyCategory')}
                description={t('catalog.list.emptyCategoryDetail')}
              />
            )
          ) : imageless ? (
            <ul className={classes.rows}>
              {visible.map((product, i) => (
                <li key={product.id} {...rowAnim(i)}>
                  <ProductRow product={product} onSelect={(p) => navigate(`/p/${p.id}`)} />
                </li>
              ))}
            </ul>
          ) : (
            <div className={classes.grid} data-sf-part="product-grid">
              {visible.map((product, i) => (
                <ProductCard key={product.id} product={product} eager={i < EAGER_CARDS} hasSiblingImages index={i} />
              ))}
            </div>
          )}
        </div>
      </div>

      {showCategoryPicker ? <FilterDrawer tree={tree} total={products.length} activeId={active?.id ?? null} /> : null}
    </div>
  );
}
