import { defineTextArea } from '@/text/define.ts';

/** Area `cart`: the slide-out cart, the cart page and the phone cart bar (editable-text spec §6.1). */
export default defineTextArea('cart', {
  'summary.items': { en: { one: '{count} item', other: '{count} items' }, note: 'Item count in the cart drawer, cart page, cart summary, phone cart bar and checkout summary', max: 40 },
});
