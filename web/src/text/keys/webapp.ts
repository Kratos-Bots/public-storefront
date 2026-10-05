import { defineTextArea } from '@/text/define.ts';

/** Area `webapp`: the Telegram web-app's main button. */
export default defineTextArea('webapp', {
  'action.checkout': { en: 'Checkout · {subtotal}', max: 60 },
  'action.back': { en: 'Back', max: 40 },
  'action.viewCart': { en: 'View cart · {subtotal}', max: 60 },
});
