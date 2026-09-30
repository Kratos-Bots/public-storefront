import { Button } from '@mantine/core';
import { Link } from 'react-router';
import { CatalogueFamily } from '@/builder/families.ts';
import type { PartViewProps } from '@/builder/parts.ts';
import { CategoryNav } from '@/features/catalog/CategoryNav.tsx';
import { EmptyState } from '@/components/EmptyState.tsx';
import { SearchField } from '@/layouts/SearchField.tsx';
import { useCoreOptions } from '@/templates/hooks.ts';
import { useText } from '@/text/runtime.tsx';
import gridClasses from '@/features/catalog/ProductGrid.module.css';

/*
 * Catalogue part views both surfaces share (spec §5.2). The surface-specific views (intro, title,
 * results) live in ProductGrid.tsx / ProductList.tsx, where the source-scanning tests pin their markup.
 */

export function CatalogSearchView({ styleAttrs }: PartViewProps) {
  const { search, setSearch } = CatalogueFamily.useData();
  return <SearchField className={gridClasses.search} value={search} onChange={setSearch} rootAttrs={styleAttrs} />;
}

/** Nothing when the category picker is off (spec §5.2). */
export function CatalogCategoriesView({ styleAttrs }: PartViewProps) {
  const { tree, products, active } = CatalogueFamily.useData();
  const { showCategoryPicker } = useCoreOptions();
  return showCategoryPicker ? <CategoryNav tree={tree} total={products.length} activeId={active?.id ?? null} navAttrs={styleAttrs} /> : null;
}

/** Unknown category / no matches / empty category — nothing otherwise. The list tests its groups, the grid its products. */
export function CatalogEmptyView({ styleAttrs }: PartViewProps) {
  const { unknownCategory, visible, groups, surface, query, setSearch } = CatalogueFamily.useData();
  const { t } = useText();
  if (unknownCategory) {
    return (
      <EmptyState
        rootAttrs={styleAttrs}
        eyebrow={t('catalog.list.eyebrowCategory')}
        title={t('common.list.categoryMissing')}
        description={t('catalog.list.categoryMissingDetail')}
        action={
          <Button component={Link} to="/" variant="default" size="sm">
            {t('catalog.list.showAll')}
          </Button>
        }
      />
    );
  }
  if ((surface === 'list' ? groups.length : visible.length) > 0) return null;
  return query ? (
    <EmptyState
      rootAttrs={styleAttrs}
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
      rootAttrs={styleAttrs}
      eyebrow={t('catalog.list.eyebrowCatalogue')}
      title={t('common.list.emptyCategory')}
      description={t('catalog.list.emptyCategoryDetail')}
    />
  );
}
