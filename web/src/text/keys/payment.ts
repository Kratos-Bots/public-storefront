import { defineTextArea } from '@/text/define.ts';

/** Area `payment`: the pages a shopper lands on after checkout hands off (payment success, cancel, order placed). */
export default defineTextArea('payment', {
  'reference.label': { en: 'Reference', note: 'Label of the copyable order reference on the after-checkout pages', max: 40 },

  'missing.title': { en: 'Order reference missing', note: 'Heading when an after-checkout link has no order reference', max: 80 },
  'missing.description': { en: 'Return to the shop and try again, or message us for help.', note: 'Text when an after-checkout link has no order reference' },

  'success.eyebrow': { en: 'Payment received', note: 'Small line above the heading after a successful payment', max: 40 },
  'success.headline': { en: 'Thanks — your order’s being confirmed', note: 'Heading after a successful payment', max: 80 },
  'success.detail': { en: 'We’re finalising your order now. You’ll hear from us as soon as it’s confirmed — keep this reference handy if you need to get in touch.', note: 'Text after a successful payment' },

  'cancel.eyebrow': { en: 'Payment cancelled', note: 'Small line above the heading when the shopper backs out of paying', max: 40 },
  'cancel.headline': { en: 'No charge taken', note: 'Heading when the shopper backs out of paying', max: 80 },
  'cancel.detail': { en: 'Your order is still saved. Return to it to try again or choose another way to pay, or message us if you’d like a hand.', note: 'Text when the shopper backs out of paying' },
  'cancel.returnToOrder': { en: 'Return to your order', note: 'Button back to the order page after a cancelled payment', max: 60 },
  'cancel.backToShop': { en: 'Back to shop', note: 'Button after a cancelled payment when the order page link is unknown (no arrow)', max: 60 },

  'placed.eyebrow': { en: 'Order confirmed', note: 'Small line above the heading once an order is placed without online payment', max: 40 },
  'placed.headline': { en: 'Order placed', note: 'Heading once an order is placed without online payment', max: 80 },
  'placed.warning': { en: 'We couldn’t set up online payment for this order — message us and we’ll help you pay.', note: 'Shown when the online payment could not be started' },
  'placed.chatHint': { en: 'Message us on WhatsApp or Telegram to arrange payment — your order reference is already filled in for you.', note: 'Text above the pay-via-chat buttons' },
  'placed.payViaWhatsapp': { en: 'Pay via WhatsApp', note: 'Button that opens WhatsApp with the order reference filled in', max: 60 },
  'placed.payViaTelegram': { en: 'Pay via Telegram', note: 'Button that opens Telegram with the order reference filled in', max: 60 },
  'placed.fallback': { en: 'Contact us through your usual channel and quote your order reference to arrange payment.', note: 'Shown when the shop has no WhatsApp or Telegram link' },
});
