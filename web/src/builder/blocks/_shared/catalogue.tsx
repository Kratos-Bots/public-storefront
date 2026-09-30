import { lazy } from 'react';
import { useSettings } from '@/app/settings.ts';
import { boolOverride, compactScope, override, type Override } from '@/builder/define.ts';
import { CoreOptionsScope } from '@/builder/blocks/_shared/CoreOptionsScope.tsx';
import type { GridSlots, ListSlots } from '@/builder/families.ts';

const ProductGrid = lazy(() => import('@/features/catalog/ProductGrid.tsx').then((m) => ({ default: m.ProductGrid })));
const ProductList = lazy(() => import('@/features/catalog/ProductList.tsx').then((m) => ({ default: m.ProductList })));
const WholesaleCatalogPage = lazy(() => import('@/features/wholesale/WholesaleCatalogPage.tsx').then((m) => ({ default: m.WholesaleCatalogPage })));

export type CatalogueOverrides = { categoryPicker: Override; pageTitle: Override; intro: Override; sku: Override };
export const catalogueOverrideShape = { categoryPicker: override(), pageTitle: override(), intro: override(), sku: override() };
export const CATALOGUE_OVERRIDE_DEFAULTS: CatalogueOverrides = { categoryPicker: 'inherit', pageTitle: 'inherit', intro: 'inherit', sku: 'inherit' };

/**
 * One catalogue body. Wholesale mode replaces the catalogue under any shell and any
 * list block — v0.6.0's CatalogPage rule — so a default document still shows the trade list.
 * It ignores the container's `slots`: owner content inside the container is hidden too (spec §7.1).
 */
export function CatalogueBody({ body, overrides, slots }: {
  body: 'grid' | 'list' | 'wholesale'; overrides: CatalogueOverrides; slots?: GridSlots | ListSlots;
}) {
  const { features } = useSettings();
  const which = features.wholesale ? 'wholesale' : body;
  const scope = compactScope({
    showCategoryPicker: boolOverride(overrides.categoryPicker),
    showPageTitle: boolOverride(overrides.pageTitle),
    showCatalogIntro: boolOverride(overrides.intro),
    showSku: boolOverride(overrides.sku),
  });
  return (
    <CoreOptionsScope value={scope}>
      {which === 'grid' ? (
        <ProductGrid slots={slots as GridSlots | undefined} />
      ) : which === 'list' ? (
        <ProductList slots={slots as ListSlots | undefined} />
      ) : (
        <WholesaleCatalogPage />
      )}
    </CoreOptionsScope>
  );
}
