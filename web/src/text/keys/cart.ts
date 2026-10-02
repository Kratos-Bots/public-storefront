import { defineTextArea } from '@/text/define.ts';

/** Area `cart`: the slide-out cart, the cart page and the phone cart bar (editable-text spec §6.1). */
export default defineTextArea('cart', {
  'summary.items': { en: { one: '{count} item', other: '{count} items' }, max: 40 },
  'summary.mixedNotice': { en: 'This order mixes in-stock and pre-order items — pre-orders dispatch when they land.', max: 200 },
  'summary.afterPromotions': { en: 'Basket after promotions', max: 60 },
  'summary.terms': { en: 'Shipping and discounts are calculated at checkout.', max: 200 },
  'summary.held': { en: 'Resolve the flagged items to continue.', max: 120 },
  'summary.checkout': { en: 'Checkout', max: 40 },
  'summary.keepShopping': { en: 'Continue shopping', max: 60 },
  'drawer.title': { en: 'Your cart', max: 60 },
  'page.eyebrow': { en: 'Cart', max: 40 },
  'page.title': { en: 'Your cart', max: 60 },
  'empty.title': { en: 'Nothing on the order yet', max: 80 },
  'empty.description': { en: "Everything you add shows up here, with the price at the quantity you're buying.", max: 200 },
  'line.removeButton': { en: 'Remove', max: 30 },
  'line.perUnit': { en: '/ea', max: 20 },
  'line.priceUpdated': { en: 'Price updated', max: 40 },
  'line.quantityLabel': { en: '{name} quantity', max: 120 },
  'line.unavailable': { en: 'No longer available — remove to continue', max: 120 },
  'line.minimum': { en: 'Minimum {count} per order', max: 80 },
  'line.maximum': { en: 'Maximum {count} per order', max: 80 },
  'line.setTo': { en: 'Set to {count}', max: 40 },
  'bar.viewCartLabel': { en: 'View cart — {items}, {subtotal}', max: 120 },
  'sync.signInAgain': { en: 'Please sign in again', max: 80 },
  'sync.updateFailed': { en: "We couldn't update your cart", max: 100 },
});
