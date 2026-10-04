import { defineTextArea } from '@/text/define.ts';

/** Area `payment`: the pages a shopper lands on after checkout hands off (payment success, cancel, order placed). */
export default defineTextArea('payment', {
  'reference.label': { en: 'Reference', max: 40 },

  'missing.title': { en: 'Order reference missing', max: 80 },
  'missing.description': { en: 'Return to the shop and try again, or message us for help.' },

  'success.eyebrow': { en: 'Payment received', max: 40 },
  'success.headline': { en: 'Thanks — your order’s being confirmed', max: 80 },
  'success.detail': { en: 'We’re finalising your order now. You’ll hear from us as soon as it’s confirmed — keep this reference handy if you need to get in touch.' },

  'cancel.eyebrow': { en: 'Payment cancelled', max: 40 },
  'cancel.headline': { en: 'No charge taken', max: 80 },
  'cancel.detail': { en: 'Your order is still saved. Return to it to try again or choose another way to pay, or message us if you’d like a hand.' },
  'cancel.returnToOrder': { en: 'Return to your order', max: 60 },
  'cancel.backToShop': { en: 'Back to shop', max: 60 },

  'placed.eyebrow': { en: 'Order confirmed', max: 40 },
  'placed.headline': { en: 'Order placed', max: 80 },
  'placed.warning': { en: 'We couldn’t set up online payment for this order — message us and we’ll help you pay.' },
  'placed.chatHint': { en: 'Message us on WhatsApp or Telegram to arrange payment — your order reference is already filled in for you.' },
  'placed.payViaWhatsapp': { en: 'Pay via WhatsApp', max: 60 },
  'placed.payViaTelegram': { en: 'Pay via Telegram', max: 60 },
  'signIn.action': { en: 'Sign in to view your order', max: 40 },
  'signIn.hint': { en: 'Use the email or phone number you gave at checkout. You can pay for the order and follow it from there.', max: 200 },

  'placed.fallback': { en: 'Contact us through your usual channel and quote your order reference to arrange payment.' },
});
