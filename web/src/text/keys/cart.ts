import { defineTextArea } from '@/text/define.ts';

/** Area `cart`: the slide-out cart, the cart page and the phone cart bar (editable-text spec §6.1). */
export default defineTextArea('cart', {
  'summary.items': { en: { one: '{count} item', other: '{count} items' }, note: 'Item count in the cart drawer, cart page, cart summary, phone cart bar and checkout summary', max: 40 },
  'summary.mixedNotice': { en: 'This order mixes in-stock and pre-order items — pre-orders dispatch when they land.', note: 'Notice above the cart total when the cart holds both in-stock and pre-order products', max: 200 },
  'summary.terms': { en: 'Shipping and discounts are calculated at checkout.', note: 'Small print under the cart subtotal', max: 200 },
  'summary.held': { en: 'Resolve the flagged items to continue.', note: 'Shown under the disabled Checkout button while a line is unavailable or breaks an order limit', max: 120 },
  'summary.checkout': { en: 'Checkout', note: 'Checkout button in the cart summary and the phone cart bar', max: 40 },
  'summary.keepShopping': { en: 'Continue shopping', note: 'Link under the cart summary back to the catalogue', max: 60 },
  'drawer.title': { en: 'Your cart', note: 'Heading of the slide-out cart, also its screen-reader label', max: 60 },
  'page.eyebrow': { en: 'Cart', note: 'Small label above the cart page heading and above the empty-cart message', max: 40 },
  'page.title': { en: 'Your cart', note: 'Heading of the cart page', max: 60 },
  'empty.title': { en: 'Nothing on the order yet', note: 'Heading of the empty cart, in the drawer and on the cart page', max: 80 },
  'empty.description': { en: "Everything you add shows up here, with the price at the quantity you're buying.", note: 'Text under the empty-cart heading', max: 200 },
  'line.removeButton': { en: 'Remove', note: 'Text button that removes a line from the cart or from the trade-list order', max: 30 },
  'line.perUnit': { en: '/ea', note: 'Suffix after a unit price in the cart and the trade list', max: 20 },
  'line.priceUpdated': { en: 'Price updated', note: 'Chip on a cart line whose price the server changed', max: 40 },
  'line.quantityLabel': { en: '{name} quantity', note: 'Screen-reader label of a quantity field; {name} is the product', max: 120 },
  'line.unavailable': { en: 'No longer available — remove to continue', note: 'Note on a cart line whose product has been withdrawn', max: 120 },
  'line.minimum': { en: 'Minimum {count} per order', note: "Note on a cart line below its product's minimum order quantity", max: 80 },
  'line.maximum': { en: 'Maximum {count} per order', note: "Note on a cart line above its product's maximum order quantity", max: 80 },
  'line.setTo': { en: 'Set to {count}', note: 'Button on a quantity-limit note that snaps the line to the limit', max: 40 },
  'line.outOfStock': { en: 'Out of stock', note: 'Note on a cart line whose product has sold out', max: 60 },
  'bar.viewCartLabel': { en: 'View cart — {items}, {subtotal}', note: 'Screen-reader label of the phone cart bar link; {items} is the item count, {subtotal} the cart subtotal', max: 120 },
  'sync.signInAgain': { en: 'Please sign in again', note: 'Toast when the session has expired while saving the cart', max: 80 },
  'sync.updateFailed': { en: "We couldn't update your cart", note: 'Toast when saving the cart fails and the server gave no reason', max: 100 },
});
