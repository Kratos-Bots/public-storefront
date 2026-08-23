import { useMemo } from 'react';
import { Button } from '@mantine/core';
import { Link, useParams } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useCatalog } from '@/features/catalog/use-catalog.ts';
import { buildCategoryTree, collectDescendantIds } from '@/features/catalog/category-tree.ts';
import { categoryCounts, findCategoryBySlugOrId } from '@/features/catalog/filter.ts';
import { groupProducts } from '@/features/catalog/group.ts';
import { WholesaleRow } from '@/features/wholesale/WholesaleRow.tsx';
import { WholesaleBar } from '@/features/wholesale/WholesaleBar.tsx';
import { bandRows } from '@/features/wholesale/wholesale-helpers.ts';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { SearchField } from '@/layouts/SearchField.tsx';
import { useShellSearch } from '@/layouts/shell-context.ts';
import classes from '@/features/wholesale/WholesaleCatalogPage.module.css';

/**
 * The wholesale sheet: the whole range as one ruled trade list, priced at the
 * quantity you are actually buying. Rendered by `CatalogPage` for
 * `features.wholesale` under either shell, in place of the grid and the menu list.
 *
 * The band is the only grouping a sheet this dense can afford, so it has to mean
 * something: rows are laid out category by category in the index's own order —
 * each category keeping the response's order inside it, variations included —
 * and `bandRows` fills alternate runs. Search is the navigation.
 */
export function WholesaleCatalogPage() {
  const { features, welcomeMessage } = useSettings();
  const { search, setSearch } = useShellSearch();
  const { categorySlug } = useParams();
  const catalog = useCatalog();

  const products = useMemo(() => catalog.data?.products ?? [], [catalog.data]);
  const categories = useMemo(() => catalog.data?.categories ?? [], [catalog.data]);
  const active = categorySlug ? findCategoryBySlugOrId(categories, categorySlug) : undefined;
  const unknownCategory = !!categorySlug && !active;

  // The same predicates as `filterProducts`, deliberately without its sort: the
  // order inside a category is the response's own, variations included.
  const visible = useMemo(() => {
    let out = products;
    if (active) {
      const allowed = collectDescendantIds(active.id, categories);
      out = out.filter((p) => p.categoryId != null && allowed.has(p.categoryId));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (p) => p.displayName.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
      );
    }
    return out;
  }, [products, categories, active, search]);

  // The response is ordered by the product tree, not by category — measured on
  // the dev catalogue it gives 76 category runs across 102 products, 61 of them
  // a single row, which would make the band a stripe rather than a section. The
  // rows are gathered into the category index's order first.
  const tree = useMemo(
    () => buildCategoryTree(categories, categoryCounts(products)),
    [categories, products],
  );
  const rows = useMemo(
    () => bandRows(groupProducts(visible, tree).flatMap((g) => g.products)),
    [visible, tree],
  );

  if (catalog.isPending) return <PageSkeleton inline />;

  if (catalog.isError) {
    return (
      <EmptyState
        eyebrow="Trade list"
        title="We couldn't load the products"
        description="The list is still there — this was a hiccup between your browser and us."
        action={
          <Button variant="default" size="sm" onClick={() => void catalog.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  const query = search.trim();
  // The menu shell keeps its search in the bar at every width; the storefront
  // header drops it below 62em, so there the sheet carries its own.
  const ownSearch = features.layout !== 'menu';

  if (unknownCategory) {
    return (
      <EmptyState
        eyebrow="Category"
        title="That category isn't here"
        description="It may have been renamed or retired. The full list is still one tap away."
        action={
          <Button component={Link} to="/" variant="default" size="sm">
            Show the whole list
          </Button>
        }
      />
    );
  }

  return (
    <div className={classes.page}>
      <div className={classes.head}>
        <h1 className={classes.title}>{active ? active.name : 'Trade list'}</h1>
        <p className={classes.tally}>
          <span className={classes.shown}>{visible.length}</span>
          {visible.length === products.length ? (
            <span className={classes.tallyUnit}>{products.length === 1 ? 'line' : 'lines'}</span>
          ) : (
            <>
              <span className={classes.tallyUnit}>of</span>
              <span>{products.length}</span>
            </>
          )}
        </p>
        {active ? (
          <Link className={classes.clear} to="/">
            Whole list
          </Link>
        ) : null}
      </div>

      {welcomeMessage ? <p className={classes.welcome}>{welcomeMessage}</p> : null}

      {ownSearch ? (
        <SearchField
          className={classes.search}
          value={search}
          onChange={setSearch}
          placeholder="Search name or code"
        />
      ) : null}

      {rows.length === 0 ? (
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
            eyebrow="Trade list"
            title="Nothing stocked here yet"
            description="The list is empty for now — message us and we'll send the current sheet."
          />
        )
      ) : (
        /* Roles are declared rather than inherited: below 62em the rows become a
           grid, and a table whose display changes loses its native semantics. */
        <table className={classes.table} role="table">
          <thead className={classes.thead} role="rowgroup">
            <tr className={classes.headRow} role="row">
              <th className={classes.hCode} scope="col" role="columnheader">
                Code
              </th>
              <th className={classes.hProduct} scope="col" role="columnheader">
                Product
              </th>
              <th className={classes.hUnit} scope="col" role="columnheader">
                Unit
              </th>
              <th className={classes.hBulk} scope="col" role="columnheader">
                Bulk
              </th>
              {features.ordering ? (
                <>
                  <th className={classes.hLine} scope="col" role="columnheader">
                    Line
                  </th>
                  <th className={classes.hQty} scope="col" role="columnheader">
                    Qty
                  </th>
                </>
              ) : null}
            </tr>
          </thead>

          {rows.map(({ product, band, groupEnd }) => (
            <WholesaleRow
              key={product.id}
              product={product}
              band={band}
              groupEnd={groupEnd}
              ordering={features.ordering}
            />
          ))}
        </table>
      )}

      {features.ordering ? <WholesaleBar /> : null}
    </div>
  );
}
