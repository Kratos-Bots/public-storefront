// TODO(translate)
import type cart from '@/text/keys/cart.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "cart.summary.items": {"one":"{count} item","other":"{count} items"},
  "cart.summary.mixedNotice": "This order mixes in-stock and pre-order items — pre-orders dispatch when they land.",
  "cart.summary.afterPromotions": "Basket after promotions",
  "cart.summary.terms": "Shipping and discounts are calculated at checkout.",
  "cart.summary.held": "Resolve the flagged items to continue.",
  "cart.limit.maxUnits": {"one":"Maximum {count} item per order. Remove {excess} to continue.","other":"Maximum {count} items per order. Remove {excess} to continue."},
  "cart.summary.checkout": "Checkout",
  "cart.summary.keepShopping": "Continue shopping",
  "cart.drawer.title": "Your cart",
  "cart.page.eyebrow": "Cart",
  "cart.page.title": "Your cart",
  "cart.empty.title": "Nothing on the order yet",
  "cart.empty.description": "Everything you add shows up here, with the price at the quantity you're buying.",
  "cart.line.removeButton": "Remove",
  "cart.line.perUnit": "/ea",
  "cart.line.priceUpdated": "Price updated",
  "cart.line.quantityLabel": "{name} quantity",
  "cart.line.unavailable": "No longer available — remove to continue",
  "cart.line.minimum": "Minimum {count} per order",
  "cart.line.maximum": "Maximum {count} per order",
  "cart.line.setTo": "Set to {count}",
  "cart.bar.viewCartLabel": "View cart — {items}, {subtotal}",
  "cart.sync.signInAgain": "Please sign in again",
  "cart.sync.updateFailed": "We couldn't update your cart",
} satisfies AreaPack<typeof cart>;
