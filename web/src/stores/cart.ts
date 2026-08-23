import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product, PricingTier } from '@/types/catalog.ts';
import type { ServerCart, CartLineInput } from '@/types/cart.ts';
import { resolveUnitPrice } from '@/lib/format.ts';

export interface LocalLine {
  productId: number;
  displayName: string;
  sku: string;
  unitPrice: number; // snapshot at add-time; re-resolved on quantity edits
  basePrice: number;
  pricingTiers: PricingTier[];
  quantity: number;
  isPreorder: boolean;
  excludedFromFreeShipping: boolean;
  imageProductId: number | null;
}

interface CartState {
  lines: LocalLine[];
  mode: 'local' | 'server';
  add: (product: Product, quantity?: number) => void;
  setQuantity: (productId: number, quantity: number) => void;
  remove: (productId: number) => void;
  clear: () => void;
  replaceFromServer: (cart: ServerCart) => void;
  mergeForLogin: () => CartLineInput[];
  setMode: (mode: 'local' | 'server') => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      mode: 'local',

      add: (product, quantity = 1) => {
        const existing = get().lines.find((l) => l.productId === product.id);
        if (existing) {
          const newQty = existing.quantity + quantity;
          set({
            lines: get().lines.map((l) =>
              l.productId === product.id
                ? {
                    ...l,
                    quantity: newQty,
                    unitPrice: resolveUnitPrice(product, newQty),
                    basePrice: product.price,
                    pricingTiers: product.pricingTiers,
                    excludedFromFreeShipping: product.excludedFromFreeShipping,
                  }
                : l,
            ),
          });
          return;
        }
        set({
          lines: [
            ...get().lines,
            {
              productId: product.id,
              displayName: product.displayName,
              sku: product.sku,
              unitPrice: resolveUnitPrice(product, quantity),
              basePrice: product.price,
              pricingTiers: product.pricingTiers,
              quantity,
              isPreorder: product.isPreorder,
              excludedFromFreeShipping: product.excludedFromFreeShipping,
              imageProductId: product.imageProductId,
            },
          ],
        });
      },

      setQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          set({ lines: get().lines.filter((l) => l.productId !== productId) });
          return;
        }
        set({
          lines: get().lines.map((l) =>
            l.productId === productId
              ? { ...l, quantity, unitPrice: resolveUnitPrice({ price: l.basePrice, pricingTiers: l.pricingTiers }, quantity) }
              : l,
          ),
        });
      },

      remove: (productId) => {
        set({ lines: get().lines.filter((l) => l.productId !== productId) });
      },

      clear: () => set({ lines: [], mode: 'local' }),

      /**
       * Adopt the server's cart. The server has the last word on what is on the
       * order and what it costs — quantity, unit price, name, pre-order — but its
       * line shape carries none of the catalogue metadata the UI needs: the base
       * price a bulk break is struck against, the tiers, the SKU, the parent
       * image. For a line the store already holds, that metadata is kept; only a
       * line this browser has never seen (added from the bot, or from another
       * device) falls back to `basePrice = unitPrice` and no tiers, which reads
       * as "no discount to show" rather than a wrong one.
       */
      replaceFromServer: (cart) => {
        const known = new Map(get().lines.map((l) => [l.productId, l]));
        set({
          mode: 'server',
          lines: cart.items.map((item) => {
            const prior = known.get(item.productId);
            return {
              productId: item.productId,
              displayName: item.name,
              sku: prior ? prior.sku : '',
              unitPrice: item.unitPrice,
              basePrice: prior ? prior.basePrice : item.unitPrice,
              pricingTiers: prior ? prior.pricingTiers : [],
              quantity: item.quantity,
              isPreorder: item.isPreorder,
              excludedFromFreeShipping: prior ? prior.excludedFromFreeShipping : false,
              imageProductId: prior ? prior.imageProductId : item.productId,
            };
          }),
        });
      },

      mergeForLogin: () => get().lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),

      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'sf-cart-v1',
      partialize: (s) => ({ lines: s.lines }),
    },
  ),
);

// Derived selectors — call inside components.
export function selectCount(state: CartState): number {
  return state.lines.reduce((sum, l) => sum + l.quantity, 0);
}

export function selectSubtotal(lines: LocalLine[]): number {
  return lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
}

export function selectHasMixedPreorder(state: CartState): boolean {
  const hasPre = state.lines.some((l) => l.isPreorder);
  const hasNot = state.lines.some((l) => !l.isPreorder);
  return hasPre && hasNot;
}
