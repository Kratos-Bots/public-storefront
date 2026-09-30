import { lazy } from 'react';
import { z } from 'zod';
import { boolOverride, compactScope, defineBlock, override, type Override } from '@/builder/define.ts';
import { CoreOptionsScope } from '@/builder/blocks/_shared/CoreOptionsScope.tsx';

const ProductDetailPage = lazy(() => import('@/features/catalog/ProductDetailPage.tsx').then((m) => ({ default: m.ProductDetailPage })));

type Props = { id: string; gallery: boolean; bulkPricing: boolean; provenance: boolean; upsells: boolean; sku: Override };

/** The product page body (storefront layout; menu and web app open a sheet from the list instead). */
export const block = defineBlock<Props>({
  name: 'ProductDetail', label: 'Product detail', category: 'product', layouts: 'all', routeBound: true, slots: [],
  text: ['product.*', 'catalog.nav.*', 'common.product.*', 'common.contact.*', 'common.actions.*', 'common.status.loading'],
  schema: z.object({ gallery: z.boolean(), bulkPricing: z.boolean(), provenance: z.boolean(), upsells: z.boolean(), sku: override() }),
  defaultProps: { gallery: true, bulkPricing: true, provenance: true, upsells: true, sku: 'inherit' },
  render: ({ gallery, bulkPricing, provenance, upsells, sku }) => (
    <CoreOptionsScope value={compactScope({ showSku: boolOverride(sku) })}>
      <ProductDetailPage sections={{ gallery, bulkPricing, provenance, upsells }} />
    </CoreOptionsScope>
  ),
});
