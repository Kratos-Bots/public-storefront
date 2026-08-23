import { useSettings } from '@/app/settings.ts';
import { ProductGrid } from '@/features/catalog/ProductGrid.tsx';
import { ProductList } from '@/features/catalog/ProductList.tsx';
import { WholesaleCatalogPage } from '@/features/wholesale/WholesaleCatalogPage.tsx';

/**
 * The one route (`/` and `/c/:categorySlug`) behind three catalogue bodies. The
 * client's flags decide which: wholesale replaces the catalogue under either
 * shell, otherwise the layout flag picks the grid or the dense list.
 */
export function CatalogPage() {
  const { features } = useSettings();
  if (features.wholesale) return <WholesaleCatalogPage />;
  if (features.layout === 'menu') return <ProductList />;
  return <ProductGrid />;
}
