import type { CartPage } from '@/features/cart/CartPage.tsx';
import type { CartSummary } from '@/features/cart/CartSummary.tsx';

/**
 * Registry-free state shared by the cart blocks and the cart drawer.
 *
 * The container views register themselves here once their feature modules have loaded. The blocks
 * lazy-load them (a block file may not import a feature statically) but render a registered view
 * directly, so a container drawn inside the drawer, which preloads them at startup, never suspends
 * (stage 4 spec §7.3).
 */
export const cartViews: {
  page: typeof CartPage | null;
  summary: typeof CartSummary | null;
  /** The published cart document crashed in the drawer: the default arrangement serves the rest of the page load. */
  publishedFailed: boolean;
} = { page: null, summary: null, publishedFailed: false };

/** Test hook: a fresh page load. */
export function resetCartDrawerFallback(): void {
  cartViews.publishedFailed = false;
}
