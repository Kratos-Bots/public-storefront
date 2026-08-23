import type { Product, PricingTier, StockStatus } from '@/types/catalog.ts';

// 'en' rather than a region-specific locale so non-native currencies keep
// their bare symbol (en-GB renders USD as "US$"; en renders it as "$").
// Memoised per currency since a storefront's shoppers can see multiple
// currencies (crypto totals, multi-currency settings) in the same session.
const priceFmts = new Map<string, Intl.NumberFormat>();

function priceFmt(currency: string): Intl.NumberFormat {
  let fmt = priceFmts.get(currency);
  if (!fmt) {
    fmt = new Intl.NumberFormat('en', { style: 'currency', currency });
    priceFmts.set(currency, fmt);
  }
  return fmt;
}

export function formatMoney(amount: number, currency: string): string {
  return priceFmt(currency).format(amount);
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** Format an ISO 8601 timestamp as e.g. "7 July 2026". Returns '' for unparseable input. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dateFmt.format(d);
}

const dateTimeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Format an ISO 8601 timestamp in the viewer's own locale/timezone, e.g. "7 Jul 2026, 11:00". Returns '' for unparseable input. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dateTimeFmt.format(d);
}

/**
 * Trim trailing zeros from a decimal crypto amount ("11.270000000000" → "11.27",
 * "5.000000000000" → "5"). String-based so high-precision amounts never lose
 * digits to a float round-trip; non-decimal strings pass through unchanged.
 */
export function formatCoinAmount(value: string | number): string {
  const s = String(value);
  if (!s.includes('.')) return s;
  return s.replace(/0+$/, '').replace(/\.$/, '');
}

export function deriveStockStatus(inStock: boolean, lowAlert: boolean): StockStatus {
  if (!inStock) return 'out';
  if (lowAlert) return 'low';
  return 'in';
}

export function stockLabel(status: StockStatus): string {
  return status === 'in' ? 'In Stock' : status === 'low' ? 'Low Stock' : 'Out of Stock';
}

/**
 * Resolve the pricing tier that applies at a given quantity, or null when the
 * base price applies. Single source of truth for tier matching — mirrors the
 * backend: highest-minQuantity tier ≤ quantity wins.
 */
export function resolveTier(
  product: Pick<Product, 'price' | 'pricingTiers'>,
  quantity: number,
): PricingTier | null {
  const tiers = [...product.pricingTiers].sort((a, b) => b.minQuantity - a.minQuantity);
  return tiers.find((t) => quantity >= t.minQuantity) ?? null;
}

/**
 * Resolve the unit price for a given quantity using the product's pricing tiers.
 * Mirrors the backend's resolveUnitPrice — highest-minQuantity match wins, base price as fallback.
 */
export function resolveUnitPrice(product: Pick<Product, 'price' | 'pricingTiers'>, quantity: number): number {
  return resolveTier(product, quantity)?.price ?? product.price;
}
