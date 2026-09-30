import type { Product, PricingTier, StockStatus } from '@/types/catalog.ts';
import { LEGACY_PROFILE, type FormatProfile } from '@/text/format-profile.ts';
import { textSnapshot } from '@/text/snapshot.ts';

// The active profile. TextLayerProvider sets it synchronously during render (idempotent), before any
// child formats; caches are keyed by locale so switching profiles never reuses a wrong formatter.
let profile: FormatProfile = LEGACY_PROFILE;
export function setFormatProfile(p: FormatProfile): void { profile = p; }
export function getFormatProfile(): FormatProfile { return profile; }

// Legacy money locale is 'en' rather than a region-specific one so non-native currencies keep
// their bare symbol (en-GB renders USD as "US$"; en renders it as "$").
// Memoised per locale+currency since a storefront's shoppers can see multiple
// currencies (crypto totals, multi-currency settings) in the same session.
const priceFmts = new Map<string, Intl.NumberFormat>();
function priceFmt(currency: string, locale: string | undefined = profile.money): Intl.NumberFormat {
  const k = `${locale ?? ''}|${currency}`;
  let fmt = priceFmts.get(k);
  if (!fmt) { fmt = new Intl.NumberFormat(locale, { style: 'currency', currency }); priceFmts.set(k, fmt); }
  return fmt;
}

export function formatMoney(amount: number, currency: string): string {
  return priceFmt(currency).format(amount);
}

/**
 * An amount as a banking app's amount field wants it: no symbol, no grouping,
 * the currency's own number of decimals ("1234.50" for GBP, "1235" for JPY).
 * Machine format — never localised (always 'en' digits).
 */
export function formatAmountPlain(amount: number, currency: string): string {
  const digits = priceFmt(currency, 'en').resolvedOptions().maximumFractionDigits ?? 2;
  return amount.toFixed(digits);
}

const dtfs = new Map<string, Intl.DateTimeFormat>();
/** A cached DateTimeFormat for the profile's `date` or `dateTime` locale. */
export function dateTimeFormat(slot: 'date' | 'dateTime', options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const locale = profile[slot];
  const k = `${locale ?? ''}|${JSON.stringify(options)}`;
  let fmt = dtfs.get(k);
  if (!fmt) { fmt = new Intl.DateTimeFormat(locale, options); dtfs.set(k, fmt); }
  return fmt;
}

/** Format an ISO 8601 timestamp as e.g. "7 July 2026". Returns '' for unparseable input. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dateTimeFormat('date', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

/** Format an ISO 8601 timestamp in the viewer's own locale/timezone, e.g. "7 Jul 2026, 11:00". Returns '' for unparseable input. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dateTimeFormat('dateTime', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

const intFmts = new Map<string, Intl.NumberFormat>();
/** Replaces `n.toLocaleString()` (legacy: the viewer's locale). */
export function formatInteger(n: number): string {
  const k = profile.number ?? '';
  let fmt = intFmts.get(k);
  if (!fmt) { fmt = new Intl.NumberFormat(profile.number); intFmts.set(k, fmt); }
  return fmt.format(n);
}

// Built lazily per locale behind a try/catch: `Intl.DisplayNames` is absent on a few old WebViews and
// throws on construction there — a missing formatter degrades to bare ISO codes.
const regionFmts = new Map<string, Intl.DisplayNames | null>();
/** Country name for an ISO-3166-1 alpha-2 code, falling back to the code itself. */
export function regionName(iso: string): string {
  const k = (profile.regions ?? []).join(',');
  if (!regionFmts.has(k)) {
    try { regionFmts.set(k, new Intl.DisplayNames(profile.regions, { type: 'region' })); } catch { regionFmts.set(k, null); }
  }
  try { return regionFmts.get(k)?.of(iso) ?? iso; } catch { return iso; }
}
/** Country-name sort: legacy keeps `a.localeCompare(b)` exactly. */
export function compareNames(a: string, b: string): number {
  return profile.collation === undefined ? a.localeCompare(b) : a.localeCompare(b, profile.collation);
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
  return textSnapshot().t(status === 'in' ? 'product.stock.in' : status === 'low' ? 'product.stock.low' : 'product.stock.out');
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
