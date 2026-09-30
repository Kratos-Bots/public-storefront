import { useMemo } from 'react';
import { Button } from '@mantine/core';
import { useParams, useSearchParams } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { CardDesignBoundary } from '@/builder/card-design.tsx';
import { CatalogueFamily, type CatalogueData, type ListSlots } from '@/builder/families.ts';
import type { FamilyValue, PartViewProps } from '@/builder/parts.ts';
import { defaultSlotRenders } from '@/builder/render.tsx';
import { useCatalog } from '@/features/catalog/use-catalog.ts';
import { buildCategoryTree } from '@/features/catalog/category-tree.ts';
import { categoryCounts, filterProducts, findCategoryBySlugOrId } from '@/features/catalog/filter.ts';
import { groupProducts } from '@/features/catalog/group.ts';
import { treeHasEmoji } from '@/features/catalog/CategoryNav.tsx';
import { CatalogCategoriesView, CatalogEmptyView, CatalogSearchView } from '@/features/catalog/catalogue-parts.tsx';
import { ProductRow } from '@/features/catalog/ProductRow.tsx';
import { ProductDetailSheet } from '@/features/catalog/ProductDetailSheet.tsx';
import { FilterSheet } from '@/features/catalog/FilterSheet.tsx';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { useShellSearch } from '@/layouts/shell-context.ts';
import { FADE } from '@/lib/motion.ts';
import { Slot } from '@/templates/runtime.tsx';
import { useCoreOptions } from '@/templates/hooks.ts';
import { useText } from '@/text/runtime.tsx';
import type { Product } from '@/types/catalog.ts';
import classes from '@/features/catalog/ProductList.module.css';

function ListTitle({ styleAttrs }: PartViewProps) {
  const { active, visible, products, unknownCategory } = CatalogueFamily.useData();
  const { showPageTitle } = useCoreOptions();
  const { t, tp } = useText();
  // A category we can't resolve has no honest heading or count — the empty state
  // is the whole answer, so nothing goes above it.
  if (unknownCategory) return null;
  return (
    <>
      {/* The page-title core option hides the whole heading block (its label and tally
          too), leaving the h1 in the accessibility tree only. */}
      {showPageTitle ? <Slot name="SectionLabel" index={1} title={active ? active.name : t('catalog.list.allProducts')} level="page" /> : null}
      <div className={showPageTitle ? classes.head : undefined} {...styleAttrs}>
        <h1 className={showPageTitle ? classes.title : 'sf-visually-hidden'} data-sf-part="page-title">{active ? active.name : t('catalog.list.allProducts')}</h1>
        {/* How much of the list you are looking at — a fraction only once it is one. */}
        {showPageTitle ? (
          <p className={classes.tally}>
            <span className={classes.shown}>{visible.length}</span>
            {visible.length === products.length ? (
              <span className={classes.tallyUnit}>{tp('catalog.list.unit', products.length)}</span>
            ) : (
              <>
                <span className={classes.tallyUnit}>{t('catalog.list.of')}</span>
                <span>{products.length}</span>
              </>
            )}
          </p>
        ) : null}
      </div>
    </>
  );
}

function ListIntro() {
  const { products, tree, unknownCategory } = CatalogueFamily.useData();
  const { brand, welcomeMessage } = useSettings();
  return unknownCategory ? null : (
    <Slot name="CatalogHero" surface="list" tagline={brand.tagline} welcomeMessage={welcomeMessage} productCount={products.length} categoryCount={tree.length} />
  );
}

function ListResults() {
  const { groups, unknownCategory, glyphs, openProduct } = CatalogueFamily.useData();
  if (unknownCategory || groups.length === 0) return null;
  return (
    <CardDesignBoundary kind="row">
      {groups.map((group, groupIndex) => (
        <section
          key={group.key}
          className={classes.group}
          role="group"
          aria-labelledby={`group-${group.key}`}
        >
          <Slot name="SectionLabel" index={groupIndex + 1} title={group.label} level="group" />
          <h2 id={`group-${group.key}`} className={classes.groupHead} data-sf-part="group-title">
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
                <ProductRow product={product} onSelect={openProduct} index={i} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </CardDesignBoundary>
  );
}

const LIST_VIEWS: FamilyValue<CatalogueData>['views'] = {
  CatalogIntro: ListIntro, CatalogSearch: CatalogSearchView, CatalogCategories: CatalogCategoriesView,
  CatalogTitle: ListTitle, CatalogResults: ListResults, CatalogEmpty: CatalogEmptyView,
};

/**
 * The menu layout's catalogue: one dense manifest, ruled into sections by category,
 * with the detail and the index both arriving as sheets over it. A container of
 * catalogue parts in one slot (spec §5.2); without `slots` it draws the default
 * arrangement, exactly v0.7.0's.
 */
export function ProductList({ slots }: { slots?: ListSlots } = {}) {
  const legacy = useMemo(() => (slots ? null : (defaultSlotRenders('ProductList', 'menu') as unknown as ListSlots)), [slots]);
  const { search, setSearch } = useShellSearch();
  const { categorySlug } = useParams();
  const [params, setParams] = useSearchParams();
  const catalog = useCatalog();
  const { showCategoryPicker } = useCoreOptions();
  const { t } = useText();

  const products = useMemo(() => catalog.data?.products ?? [], [catalog.data]);
  const categories = useMemo(() => catalog.data?.categories ?? [], [catalog.data]);
  const tree = useMemo(() => buildCategoryTree(categories, categoryCounts(products)), [categories, products]);
  const active = categorySlug ? findCategoryBySlugOrId(categories, categorySlug) : undefined;
  const unknownCategory = !!categorySlug && !active;
  const visible = useMemo(
    () => filterProducts(products, categories, { categoryId: active?.id ?? null, search }),
    [products, categories, active?.id, search],
  );
  const groups = useMemo(() => groupProducts(visible, tree, t), [visible, tree, t]);

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
  const data: CatalogueData = {
    surface: 'list', products, tree, active, unknownCategory, visible, groups, search, query: search.trim(), setSearch,
    imageless: false, glyphs: treeHasEmoji(tree), openProduct: (p) => showProduct(p),
  };

  return (
    <CatalogueFamily.Provider value={{ data, views: LIST_VIEWS }}>
      <div className={`${classes.page} ${FADE}`}>
        {s.content()}
        <ProductDetailSheet
          productId={selectedId}
          onClose={closeProduct}
          onSelect={(product) => showProduct(product, true)}
        />
        {showCategoryPicker ? <FilterSheet tree={tree} total={products.length} activeId={active?.id ?? null} /> : null}
      </div>
    </CatalogueFamily.Provider>
  );
}
