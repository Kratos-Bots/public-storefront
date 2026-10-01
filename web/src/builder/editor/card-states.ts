import type { Product } from '@/types/catalog.ts';

/** A pre-order date for a product that has none: fixed, so the copy never drifts between renders. */
const SAMPLE_ETA = Date.UTC(2026, 10, 16, 12);

/**
 * The derived states the card designer shows next to the editable card (spec §11): the preview
 * product cloned with a few fields flipped. Editor-only; the clones are never saved.
 */
export function cardStates(product: Product): Array<{ label: string; product: Product }> {
  return [
    { label: 'Out of stock', product: { ...product, inStock: false, isPreorder: false } },
    { label: 'Pre-order, minimum 3', product: { ...product, isPreorder: true, preorderEta: product.preorderEta ?? SAMPLE_ETA, minOrderQuantity: 3 } },
    { label: 'No photo', product: { ...product, imageProductId: null } },
  ];
}
