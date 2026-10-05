import type { CartPromotion, Nudge, PromotionTag, ServerCart } from '@/types/cart.ts';
import type { TextApi } from '@/text/snapshot.ts';

// Everything the storefront does with the backend's promotion fields that is not drawing. Every
// field is optional on the wire — a backend older than promotions sends none of them — and each
// helper reads a missing one as "no promotion": [] / 0 / null, a cart total as its subtotal.

/** Money arrives as 2 dp doubles; subtracting two of them leaves float dust. */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** A promotion list as it will be drawn: the first label, and how many more there are behind it. */
export interface BadgeParts { label: string; extra: number; all: string[] }

/** Blank labels are dropped; null when nothing is left to show. */
export function badgeParts(tags: readonly PromotionTag[] | null | undefined): BadgeParts | null {
  const all = (tags ?? []).map((t) => t.label.trim()).filter((l) => l !== '');
  return all.length === 0 ? null : { label: all[0]!, extra: all.length - 1, all };
}

export interface LineFigures {
  /** The line after its promotion discount, never below zero. */
  net: number;
  /** Something was taken off. */
  discounted: boolean;
  /** Discounted all the way to nothing — draw "Free", not a bare 0.00. */
  free: boolean;
}

export function lineFigures(lineTotal: number, promotionDiscount: number | null | undefined): LineFigures {
  const discount = promotionDiscount ?? 0;
  const net = Math.max(0, round2(lineTotal - discount));
  return { net, discounted: discount > 0, free: discount > 0 && net === 0 };
}

/** An order's `discountAmount` includes its promotion part; what is left is the coupon or manual discount. */
export function otherDiscount(discountAmount: number, promotionDiscount: number | null | undefined): number {
  return Math.max(0, round2(discountAmount - (promotionDiscount ?? 0)));
}

/** The nudge as a sentence, in the shopper's wording (`common.promo.nudge*`). `money` formats the spend gap. */
export function nudgeSentence(nudge: Nudge, text: Pick<TextApi, 't' | 'tp'>, money: (amount: number) => string): string {
  if (nudge.kind === 'spend') return text.t('common.promo.nudgeSpend', { amount: money(nudge.missing), label: nudge.label });
  if (nudge.target === 'get') return text.tp('common.promo.nudgeGet', nudge.missing, { label: nudge.label });
  return text.t('common.promo.nudgeBuy', { missing: nudge.missing, label: nudge.label });
}

/** What the server's cart says about promotions, with every absent field read as "none". */
export interface BasketPromotions {
  promotions: CartPromotion[];
  discount: number;
  /** The basket after promotions — a figure for the cart, not an order total (shipping is still to come). */
  total: number;
  nudge: Nudge | null;
}

export function basketPromotions(cart: ServerCart | null | undefined): BasketPromotions | null {
  if (!cart) return null;
  return {
    promotions: cart.promotions ?? [],
    discount: cart.promotionDiscount ?? 0,
    total: cart.total ?? cart.subtotal,
    nudge: cart.nudge ?? null,
  };
}

/**
 * Whether the server's cart still describes what is in the local one. Its promotion figures belong
 * to exactly the quantities it priced: the moment the shopper edits a line the optimistic display
 * takes over (a discount struck for 3 units must not sit beside a subtotal for 4) and the figures
 * come back with the reconcile.
 */
export function snapshotMatchesLines(
  cart: ServerCart | null | undefined,
  lines: ReadonlyArray<{ productId: number; quantity: number }>,
): boolean {
  if (!cart || cart.items.length !== lines.length) return false;
  const local = new Map(lines.map((l) => [l.productId, l.quantity]));
  return cart.items.every((i) => local.get(i.productId) === i.quantity);
}
