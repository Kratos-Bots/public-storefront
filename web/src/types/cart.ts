export interface ServerCartLine {
  productId: number; name: string; quantity: number; unitPrice: number; lineTotal: number;
  imageUrl: string | null; isPreorder: boolean; outOfStock: boolean; priceChanged: boolean; inactive: boolean;
  /** Whether this line currently violates its resolved order-quantity limit. */
  belowMin: boolean; aboveMax: boolean;
  /** The resolved limit for this shopper, or null for no limit — never re-derive precedence client-side. */
  minOrderQuantity: number | null; maxOrderQuantity: number | null;
  /** Automatic promotions on this line. Every promotion field is absent from a backend that predates promotions. */
  promotionDiscount?: number; promotions?: PromotionTag[];
}
export interface ServerCart {
  items: ServerCartLine[]; subtotal: number; itemCount: number;
  /** What the promotions take off `subtotal`, each with its own share; `total` is the basket after them. */
  promotionDiscount?: number; promotions?: CartPromotion[]; total?: number; nudge?: Nudge | null;
}
/** A live promotion's customer-facing label. */
export interface PromotionTag { id: number; label: string }
/** A free-shipping promotion arrives with `amount: 0` and `freeShipping: true`. */
export interface CartPromotion extends PromotionTag { amount: number; freeShipping?: boolean }
/** The one promotion a basket is closest to earning. */
export type Nudge =
  | { promotionId: number; label: string; kind: 'quantity'; missing: number; target: 'buy' | 'get' }
  | { promotionId: number; label: string; kind: 'spend'; missing: number };
export interface CartLineInput { productId: number; quantity: number }
