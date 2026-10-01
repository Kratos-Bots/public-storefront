import { createContext, useContext } from 'react';
import { createFamily } from '@/builder/parts.ts';
import type { LocalLine } from '@/stores/cart.ts';
import type { BasketPromotions } from '@/lib/promotions.ts';
import type { ServerCartLine } from '@/types/cart.ts';

// Type-only imports: this module is in the shopper's entry bundle.

/** A line the server flagged (inactive, out of stock, repriced, outside its order limits). */
export type CartIssue = ServerCartLine;

/** The CartContents container's data (stage 4 spec §5.2). */
export interface CartData {
  surface: 'page' | 'drawer';
  lines: LocalLine[];
  count: number;
  isSyncing: boolean;
  issueByProduct: ReadonlyMap<number, CartIssue>;
  /** The server's word on every line while it still matches the lines on screen — carries the promotion figures. Empty before the reconcile and after an edit. */
  serverByProduct: ReadonlyMap<number, ServerCartLine>;
  /** A line is withdrawn or breaks its order-quantity limit: checkout is held. */
  blocked: boolean;
  setQuantity: (productId: number, quantity: number) => void;
  remove: (productId: number) => void;
  /** Drawer only: closes the drawer. */
  dismiss?: () => void;
}
export const CartFamily = createFamily<CartData>('cart');

/** Beside the family so a nested CartSummary can tell "inside a CartContents" from "standalone" (the family's own accessor throws). */
export const CartDataContext = createContext<CartData | null>(null);
export const useCartFamilyOptional = (): CartData | null => useContext(CartDataContext);

/** The nested CartSummary container's data (stage 4 spec §5.2). */
export interface CartSummaryData {
  blocked: boolean;
  onNavigate?: () => void;
  count: number;
  subtotal: number;
  currency: string;
  mixedPreorder: boolean;
  /** The web app's primary action is its own checkout bar. */
  primaryElsewhere: boolean;
  checkoutTo: string;
  /** The server's promotion figures while they still describe the lines on screen; null otherwise (guest cart, before the reconcile, mid-edit). */
  promotions: BasketPromotions | null;
}
export const CartSummaryFamily = createFamily<CartSummaryData>('cart-summary');
