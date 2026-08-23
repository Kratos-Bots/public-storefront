import { useMemo } from 'react';
import { Button } from '@mantine/core';
import { Link, useParams } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useCatalog } from '@/features/catalog/use-catalog.ts';
import { buildCategoryTree } from '@/features/catalog/category-tree.ts';
import { categoryCounts, filterProducts, findCategoryBySlugOrId } from '@/features/catalog/filter.ts';
import { CategoryNav } from '@/features/catalog/CategoryNav.tsx';
import { FilterDrawer } from '@/features/catalog/FilterDrawer.tsx';
import { ProductCard } from '@/features/catalog/ProductCard.tsx';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { SearchField } from '@/layouts/SearchField.tsx';
import { useShellSearch } from '@/layouts/shell-context.ts';
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

  if (catalog.isPending) return <PageSkeleton inline />;

  if (catalog.isError) {
    return (
      <EmptyState
        eyebrow="Catalogue"
        title="We couldn't load the products"
        description="The shop is still there — this was a hiccup between your browser and us."
        action={
          <Button variant="default" size="sm" onClick={() => void catalog.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  const hasHero = !!(brand.tagline || welcomeMessage);
  const query = search.trim();

  return (
    <div className={classes.page}>
      {hasHero ? (
        <section className={classes.hero} aria-label="About this shop">
          <div className={classes.heroText}>
            {brand.tagline ? <p className={classes.tagline}>{brand.tagline}</p> : null}
            {welcomeMessage ? <p className={classes.welcome}>{welcomeMessage}</p> : null}
          </div>
          <p className={classes.stock}>
            {products.length} products
            {tree.length > 0 ? ` · ${tree.length} categories` : ''}
          </p>
        </section>
      ) : null}

      <SearchField className={classes.search} value={search} onChange={setSearch} />

      <div className={classes.layout}>
        <CategoryNav tree={tree} total={products.length} activeId={active?.id ?? null} />

        <div className={classes.column}>
          <div className={classes.head}>
            <h1 className={classes.title}>{active ? active.name : 'All products'}</h1>
            {/* Micro-caps, so the shopper's own query stays out of it — the field
                above and the empty state below both quote it in their own case. */}
            <p className={classes.result}>
              {query ? `${visible.length} matching` : `${visible.length} products`}
            </p>
          </div>

          {unknownCategory ? (
            <EmptyState
              eyebrow="Category"
              title="That category isn't here"
              description="It may have been renamed or retired. The full range is still one tap away."
              action={
                <Button component={Link} to="/" variant="default" size="sm">
                  Show all products
                </Button>
              }
            />
          ) : visible.length === 0 ? (
            query ? (
              <EmptyState
                eyebrow="Search"
                title={`Nothing matches "${query}"`}
                description="Try a shorter word, or the product code from your last order."
                action={
                  <Button variant="default" size="sm" onClick={() => setSearch('')}>
                    Clear search
                  </Button>
                }
              />
            ) : (
              <EmptyState
                eyebrow="Catalogue"
                title="Nothing stocked here yet"
                description="This part of the shop is empty for now — check back soon."
              />
            )
          ) : (
            <div className={classes.grid}>
              {visible.map((product, i) => (
                <ProductCard key={product.id} product={product} eager={i < EAGER_CARDS} />
              ))}
            </div>
          )}
        </div>
      </div>

      <FilterDrawer tree={tree} total={products.length} activeId={active?.id ?? null} />
    </div>
  );
}
