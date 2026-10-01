import { lazy, useContext } from 'react';
import { z } from 'zod';
import { boolOverride, compactScope, defineBlock, override, slot, type Override } from '@/builder/define.ts';
import { CoreOptionsScope } from '@/builder/blocks/_shared/CoreOptionsScope.tsx';
import { PRODUCT_CONTAINER } from '@/builder/blocks/_shared/product-container.ts';
import { ProductHostContext, type ProductSlots } from '@/builder/families.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';
import type { ComponentData } from '@/builder/types.ts';

const ProductDetailPage = lazy(() => import('@/features/catalog/ProductDetailPage.tsx').then((m) => ({ default: m.ProductDetailPage })));

type Props = {
  id: string; top: ComponentData[]; media: ComponentData[]; main: ComponentData[]; below: ComponentData[];
  /**
   * Legacy (v0.7.0) toggles: read only while the slots are absent (spec §8). Optional with no
   * default, so the guard never adds them to a document that lacks them (absent = on).
   */
  gallery?: boolean; bulkPricing?: boolean; provenance?: boolean; upsells?: boolean; sku: Override;
};

/** Inside the menu / web-app sheet the host draws the sheet surface; elsewhere the page (spec §7.2). */
function ProductDetailBody({ slots }: { slots: ProductSlots }) {
  const host = useContext(ProductHostContext);
  return host ? <host.SheetBody slots={slots} /> : <ProductDetailPage slots={slots} />;
}

/** The product page (storefront) or the product sheet's body (menu, web app): a container of product parts. */
export const block = defineBlock<Props>({
  name: 'ProductDetail', label: 'Product detail', category: 'product', layouts: 'all', routeBound: true,
  slots: ['top', 'media', 'main', 'below'],
  style: styleSupport('wrap', [...BOX]),
  text: ['product.detail.product', 'product.detail.notFoundTitle', 'product.detail.notFoundDetail', 'product.detail.browse',
    'product.sheet.loadFailed', 'common.actions.tryAgain', 'common.status.loading'],
  container: PRODUCT_CONTAINER,
  schema: z.object({ top: slot(), media: slot(), main: slot(), below: slot(),
    gallery: z.boolean().optional(), bulkPricing: z.boolean().optional(), provenance: z.boolean().optional(), upsells: z.boolean().optional(),
    sku: override() }),
  defaultProps: { top: [], media: [], main: [], below: [], sku: 'inherit' },
  render: ({ top, media, main, below, sku }) => (
    <CoreOptionsScope value={compactScope({ showSku: boolOverride(sku) })}>
      <ProductDetailBody slots={{ top, media, main, below }} />
    </CoreOptionsScope>
  ),
});
