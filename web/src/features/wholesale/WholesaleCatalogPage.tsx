import { useMemo } from 'react';
import { Button } from '@mantine/core';
import { Link, useParams } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useWarehouseOrdering } from '@/features/warehouses/use-warehouse.ts';
import { effectiveLayout } from '@/app/layout.ts';
import { isTelegramWebApp } from '@/lib/telegram-webapp.ts';
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
import { Slot } from '@/templates/runtime.tsx';
import { useCoreOptions } from '@/templates/hooks.ts';
import classes from '@/features/wholesale/WholesaleCatalogPage.module.css';
import { useText } from '@/text/runtime.tsx';

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
  const { t, tp } = useText();
  const { brand, features, welcomeMessage } = useSettings();
  // Quantity inputs and the running tab are ordering controls; a paused warehouse is browse-only.
  const { paused } = useWarehouseOrdering();
  const ordering = features.ordering && !paused;
  const { search, setSearch } = useShellSearch();
  const { categorySlug } = useParams();
  const catalog = useCatalog();
  const { showPageTitle, showSku } = useCoreOptions();

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
    () => bandRows(groupProducts(visible, tree, t).flatMap((g) => g.products)),
    [visible, tree, t],
  );

  if (catalog.isPending) return <PageSkeleton inline />;

  if (catalog.isError) {
    return (
      <EmptyState
        eyebrow={t('wholesale.page.eyebrow')}
        title={t('common.list.loadFailed')}
        description={t('wholesale.page.loadFailedHint')}
        action={
          <Button variant="default" size="sm" onClick={() => void catalog.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  }

  const query = search.trim();
  // The menu and web app shells keep their search in the bar at every width; the
  // storefront header drops it below 62em, so there the sheet carries its own.
  const layout = effectiveLayout(features.layout, isTelegramWebApp());
  const ownSearch = layout === 'storefront';

  if (unknownCategory) {
    return (
      <EmptyState
        eyebrow={t('wholesale.page.categoryEyebrow')}
        title={t('common.list.categoryMissing')}
        description={t('wholesale.page.categoryMissingHint')}
        action={
          <Button component={Link} to="/" variant="default" size="sm">
            {t('wholesale.page.showWholeList')}
          </Button>
        }
      />
    );
  }

  return (
    <div className={classes.page}>
      {/* The page-title core option hides the heading block (label, title, tally) and leaves
          the h1 in the accessibility tree only. "Whole list" is navigation, not decoration: it
          stays, alone on a slim row, while a category is open. */}
      {showPageTitle ? <Slot name="SectionLabel" index={1} title={active ? active.name : t('wholesale.page.title')} level="page" /> : null}
      <div className={showPageTitle ? classes.head : active ? classes.headBare : undefined}>
        <h1 className={showPageTitle ? classes.title : 'sf-visually-hidden'} data-sf-part="page-title">{active ? active.name : t('wholesale.page.title')}</h1>
        {showPageTitle ? (
          <p className={classes.tally}>
            <span className={classes.shown}>{visible.length}</span>
            {visible.length === products.length ? (
              <span className={classes.tallyUnit}>{tp('wholesale.tally.unit', products.length)}</span>
            ) : (
              <>
                <span className={classes.tallyUnit}>{t('wholesale.tally.of')}</span>
                <span>{products.length}</span>
              </>
            )}
          </p>
        ) : null}
        {active ? (
          <Link className={classes.clear} to="/">
            {t('wholesale.page.wholeList')}
          </Link>
        ) : null}
      </div>

      <Slot name="CatalogHero" surface="wholesale" tagline={brand.tagline} welcomeMessage={welcomeMessage} productCount={products.length} categoryCount={tree.length} />

      {ownSearch ? (
        <SearchField
          className={classes.search}
          value={search}
          onChange={setSearch}
          placeholder={showSku ? t('wholesale.search.withCode') : t('wholesale.search.plain')}
        />
      ) : null}

      {rows.length === 0 ? (
        query ? (
          <EmptyState
            eyebrow={t('wholesale.page.searchEyebrow')}
            title={t('common.list.noMatches', { query })}
            description={t('wholesale.page.noMatchesHint')}
            action={
              <Button variant="default" size="sm" onClick={() => setSearch('')}>
                {t('common.list.clearSearch')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            eyebrow={t('wholesale.page.eyebrow')}
            title={t('common.list.emptyCategory')}
            description={t('wholesale.page.emptyHint')}
          />
        )
      ) : (
        /* Roles are declared rather than inherited: below 62em the rows become a
           grid, and a table whose display changes loses its native semantics. */
        <table className={classes.table} role="table">
          <thead className={classes.thead} role="rowgroup">
            <tr className={classes.headRow} role="row">
              {showSku ? (
                <th className={classes.hCode} scope="col" role="columnheader">
                  {t('wholesale.table.code')}
                </th>
              ) : null}
              <th className={classes.hProduct} scope="col" role="columnheader">
                {t('wholesale.table.product')}
              </th>
              <th className={classes.hUnit} scope="col" role="columnheader">
                {t('wholesale.table.unit')}
              </th>
              <th className={classes.hBulk} scope="col" role="columnheader">
                {t('wholesale.table.bulk')}
              </th>
              {ordering ? (
                <>
                  <th className={classes.hLine} scope="col" role="columnheader">
                    {t('wholesale.table.line')}
                  </th>
                  <th className={classes.hQty} scope="col" role="columnheader">
                    {t('wholesale.table.qty')}
                  </th>
                </>
              ) : null}
            </tr>
          </thead>

          {rows.map(({ product, band, groupEnd }, i) => (
            <WholesaleRow
              key={product.id}
              product={product}
              band={band}
              groupEnd={groupEnd}
              ordering={ordering}
              index={i}
            />
          ))}
        </table>
      )}

      {/* The web app's primary action is its cart button, on this sheet as everywhere else. */}
      {ordering && layout !== 'webapp' ? <WholesaleBar /> : null}
    </div>
  );
}
