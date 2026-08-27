import { useMemo } from 'react';
import { Button } from '@mantine/core';
import { Link, useParams, useSearchParams } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useCatalog } from '@/features/catalog/use-catalog.ts';
import { buildCategoryTree } from '@/features/catalog/category-tree.ts';
import { categoryCounts, filterProducts, findCategoryBySlugOrId } from '@/features/catalog/filter.ts';
import { groupProducts } from '@/features/catalog/group.ts';
import { treeHasEmoji } from '@/features/catalog/CategoryNav.tsx';
import { ProductRow } from '@/features/catalog/ProductRow.tsx';
import { ProductDetailSheet } from '@/features/catalog/ProductDetailSheet.tsx';
import { FilterSheet } from '@/features/catalog/FilterSheet.tsx';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { useShellSearch } from '@/layouts/shell-context.ts';
import { FADE } from '@/lib/motion.ts';
import type { Product } from '@/types/catalog.ts';
import classes from '@/features/catalog/ProductList.module.css';

/**
 * The menu layout's catalogue: one dense manifest, ruled into sections by category,
 * with the detail and the index both arriving as sheets over it. Rendered by
 * `CatalogPage` for `layout: 'menu'`.
 */
export function ProductList() {
  const { welcomeMessage } = useSettings();
  const { search, setSearch } = useShellSearch();
  const { categorySlug } = useParams();
  const [params, setParams] = useSearchParams();
  const catalog = useCatalog();

  const products = useMemo(() => catalog.data?.products ?? [], [catalog.data]);
  const categories = useMemo(() => catalog.data?.categories ?? [], [catalog.data]);
  const tree = useMemo(() => buildCategoryTree(categories, categoryCounts(products)), [categories, products]);
  const active = categorySlug ? findCategoryBySlugOrId(categories, categorySlug) : undefined;
  const unknownCategory = !!categorySlug && !active;
  const visible = useMemo(
    () => filterProducts(products, categories, { categoryId: active?.id ?? null, search }),
    [products, categories, active?.id, search],
  );
  const groups = useMemo(() => groupProducts(visible, tree), [visible, tree]);

  // `?p=` is the sheet's open state, so the product is shareable, and Back closes it.
  const raw = params.get('p');
  const selectedId = raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;

  const showProduct = (product: Product, replace = false) => {
    const next = new URLSearchParams(params);
    next.set('p', String(product.id));
    setParams(next, { replace });
  };
  const closeProduct = () => {
    const next = new URLSearchParams(params);
    next.delete('p');
    setParams(next, { replace: true });
  };

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

  const query = search.trim();
  const glyphs = treeHasEmoji(tree);

  return (
    <div className={`${classes.page} ${FADE}`}>
      {/* A category we can't resolve has no honest heading or count — the state below
          is the whole answer, so nothing goes above it. */}
      {unknownCategory ? null : (
        <>
          <div className={classes.head}>
            <h1 className={classes.title}>{active ? active.name : 'All products'}</h1>
            {/* How much of the list you are looking at — a fraction only once it is one. */}
            <p className={classes.tally}>
              <span className={classes.shown}>{visible.length}</span>
              {visible.length === products.length ? (
                <span className={classes.tallyUnit}>{products.length === 1 ? 'product' : 'products'}</span>
              ) : (
                <>
                  <span className={classes.tallyUnit}>of</span>
                  <span>{products.length}</span>
                </>
              )}
            </p>
          </div>
          {welcomeMessage ? <p className={classes.welcome}>{welcomeMessage}</p> : null}
        </>
      )}

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
      ) : groups.length === 0 ? (
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
        groups.map((group) => (
          <section
            key={group.key}
            className={classes.group}
            role="group"
            aria-labelledby={`group-${group.key}`}
          >
            <h2 id={`group-${group.key}`} className={classes.groupHead}>
              <span className={classes.groupName}>
                {glyphs ? (
                  <span className={classes.glyph} aria-hidden>
                    {group.emoji ?? ''}
                  </span>
                ) : null}
                {group.trail ? <span className={classes.trail}>{group.trail} / </span> : null}
                {group.label}
              </span>
              <span className={classes.groupCount}>{group.products.length}</span>
            </h2>
            <ul className={classes.rows}>
              {group.products.map((product, i) => (
                <li key={product.id}>
                  <ProductRow product={product} onSelect={showProduct} index={i} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <ProductDetailSheet
        productId={selectedId}
        onClose={closeProduct}
        onSelect={(product) => showProduct(product, true)}
      />
      <FilterSheet tree={tree} total={products.length} activeId={active?.id ?? null} />
    </div>
  );
}
