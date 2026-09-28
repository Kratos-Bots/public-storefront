import { useSettings } from '@/app/settings.ts';
import { useEffectiveLayout } from '@/app/layout.ts';
import { ProductGrid } from '@/features/catalog/ProductGrid.tsx';
import { ProductList } from '@/features/catalog/ProductList.tsx';
import { WholesaleCatalogPage } from '@/features/wholesale/WholesaleCatalogPage.tsx';

/**
 * The one route (`/` and `/c/:categorySlug`) behind three catalogue bodies. The
 * client's flags decide which: wholesale replaces the catalogue under any shell,
 * otherwise the grid for the storefront layout and the dense list for the menu
 * and web app layouts.
 */
export function CatalogPage() {
  const { features } = useSettings();
  const layout = useEffectiveLayout();
  if (features.wholesale) return <WholesaleCatalogPage />;
  if (layout !== 'storefront') return <ProductList />;
  return <ProductGrid />;
}
