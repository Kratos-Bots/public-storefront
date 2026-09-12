export interface ServerCartLine {
  productId: number; name: string; quantity: number; unitPrice: number; lineTotal: number;
  imageUrl: string | null; isPreorder: boolean; outOfStock: boolean; priceChanged: boolean; inactive: boolean;
  /** Whether this line currently violates its resolved order-quantity limit. */
  belowMin: boolean; aboveMax: boolean;
  /** The resolved limit for this shopper, or null for no limit — never re-derive precedence client-side. */
  minOrderQuantity: number | null; maxOrderQuantity: number | null;
}
export interface ServerCart { items: ServerCartLine[]; subtotal: number; itemCount: number }
export interface CartLineInput { productId: number; quantity: number }
