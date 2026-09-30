import { defineTextArea } from '@/text/define.ts';

/** Area `webapp`: the Telegram web-app's main button. */
export default defineTextArea('webapp', {
  'action.checkout': { en: 'Checkout · {subtotal}', note: 'Telegram main button on the cart page; {subtotal} is the cart subtotal', max: 60 },
  'action.viewCart': { en: 'View cart · {subtotal}', note: 'Telegram main button on other pages when the cart has items; {subtotal} is the cart subtotal', max: 60 },
});
