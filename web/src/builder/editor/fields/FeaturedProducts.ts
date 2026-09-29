import type { ArrayField } from '@puckeditor/core';
import { blockFields } from '@/builder/editor/derive-fields.ts';

const derived = blockFields('FeaturedProducts');
const items = derived.items as ArrayField;

/**
 * FeaturedProducts: fields derived from the block's zod schema. A new picked row starts without a
 * `productId` (the derived default would be 1 — an arbitrary real product) and stays that way
 * until the admin picks one; the row is then summarised by the id the picker stored.
 */
export const fields = blockFields('FeaturedProducts', {
  items: {
    ...items,
    defaultItemProps: {},
    getItemSummary: (row: { productId?: unknown }) => (typeof row.productId === 'number' ? `Product #${row.productId}` : 'Pick a product'),
  },
});
