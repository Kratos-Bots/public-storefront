import { group, part, type ContainerSpec } from '@/builder/parts.ts';
import type { ComponentData, LayoutKind } from '@/builder/types.ts';

const PARTS = ['ProductBreadcrumbs', 'ProductGallery', 'ProductTitle', 'ProductPrice', 'ProductStock', 'ProductAddToCart',
  'ProductDescription', 'ProductBulkPricing', 'ProductProvenance', 'ProductCoa', 'ProductAsk', 'ProductUpsells'] as const;

/** Spec §5.1 default arrangement; the storefront one honours the v0.7.0 toggles (§8), the sheet ignores them. */
function defaultSlots(props: Record<string, unknown>, { layout, id }: { layout: LayoutKind; id: string }): Record<string, ComponentData[]> {
  const p = (type: string) => part(type, id);
  const g = (kind: string, items: ComponentData[]) => group('ProductGroup', id, kind, items);
  if (layout !== 'storefront') {
    return {
      top: [], media: [],
      main: [g('identity', [g('identityText', [p('ProductTitle'), p('ProductStock')]), p('ProductGallery')]),
        p('ProductPrice'), p('ProductDescription'), p('ProductBulkPricing'), p('ProductProvenance'), p('ProductAsk')],
      below: [p('ProductUpsells')],
    };
  }
  const on = (k: string) => props[k] !== false;
  return {
    top: [p('ProductBreadcrumbs')],
    media: on('gallery') ? [p('ProductGallery')] : [],
    main: [p('ProductTitle'), g('priceRow', [p('ProductPrice'), p('ProductStock')]), p('ProductAddToCart'), p('ProductDescription'),
      ...(on('bulkPricing') ? [p('ProductBulkPricing')] : []), ...(on('provenance') ? [p('ProductProvenance')] : []), p('ProductAsk')],
    below: on('upsells') ? [p('ProductUpsells')] : [],
  };
}

export const PRODUCT_CONTAINER: ContainerSpec = {
  family: 'product',
  defaultSlots,
  required: ['ProductTitle', 'ProductPrice', 'ProductAddToCart'],
  // ProductGroup is a wrapper: the sheet's default uses two (spec §5.1), so groups are not unique.
  unique: PARTS,
  legacyProps: ['gallery', 'bulkPricing', 'provenance', 'upsells'],
  insertSlot: 'main',
};
