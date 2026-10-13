/**
 * The shop-wide cap on total units per order (settings.limits.maxOrderUnits).
 * The only place the web app compares a cart against it; the backend refuses an
 * over-limit quote or order regardless.
 */
export interface OrderUnitLimit {
  /** null = no limit. */
  max: number | null;
  units: number;
  over: boolean;
  /** Units to remove before checkout; 0 when not over. */
  excess: number;
  /** Units that still fit; null = no limit. */
  remaining: number | null;
}

export function orderUnitLimit(max: number | null | undefined, units: number): OrderUnitLimit {
  const limit = max != null && Number.isInteger(max) && max >= 1 ? max : null;
  if (limit == null) return { max: null, units, over: false, excess: 0, remaining: null };
  return { max: limit, units, over: units > limit, excess: Math.max(0, units - limit), remaining: Math.max(0, limit - units) };
}

/** A stepper's ceiling for one line: the product's own max and the order's headroom, whichever is lower. null = none. */
export function cappedCeiling(
  lineQuantity: number,
  productMax: number | null | undefined,
  limit: OrderUnitLimit,
): number | null {
  const byOrder = limit.remaining == null ? null : lineQuantity + limit.remaining;
  if (byOrder == null) return productMax ?? null;
  return productMax == null ? byOrder : Math.min(productMax, byOrder);
}
