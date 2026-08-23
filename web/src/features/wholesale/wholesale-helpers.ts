import type { Product } from '@/types/catalog.ts';
import { resolveTier } from '@/lib/format.ts';

export interface BandedRow {
  product: Product;
  /** This row's contiguous category run is a banded one (the greenbar look). */
  band: boolean;
  /** Last row of its category run — closes it with a heavier rule. */
  groupEnd: boolean;
}

/**
 * Alternate a subtle band per contiguous category run — the greenbar look.
 * Ported from the Telegram wholesale menu so both sheets band identically.
 */
export function bandRows(products: Product[]): BandedRow[] {
  let band = false;
  return products.map((p, i) => {
    const prev = products[i - 1];
    if (prev && prev.categoryId !== p.categoryId) band = !band;
    const next = products[i + 1];
    return { product: p, band, groupEnd: !next || next.categoryId !== p.categoryId };
  });
}

export interface Rung {
  minQuantity: number;
  price: number;
}

/** Lowest→highest rungs: the base price at 1+, then each defined tier. */
export function ladderRungs(product: Pick<Product, 'price' | 'pricingTiers'>): Rung[] {
  const tiers = product.pricingTiers
    .map((t) => ({ minQuantity: t.minQuantity, price: t.price }))
    .sort((a, b) => a.minQuantity - b.minQuantity);
  return [{ minQuantity: 1, price: product.price }, ...tiers];
}

/**
 * The rung in force at a quantity, keyed by its threshold. An empty stepper still
 * quotes the 1+ rung — that is the price of the first one you add.
 */
export function activeRungMin(
  product: Pick<Product, 'price' | 'pricingTiers'>,
  quantity: number,
): number {
  return resolveTier(product, Math.max(quantity, 1))?.minQuantity ?? 1;
}
