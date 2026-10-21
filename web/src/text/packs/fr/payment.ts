// TODO(translate)
import type payment from '@/text/keys/payment.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "payment.reference.label": "Reference",
  "payment.missing.title": "Order reference missing",
  "payment.missing.description": "Return to the shop and try again, or message us for help.",
  "payment.success.eyebrow": "Payment received",
  "payment.success.headline": "Thanks — your order’s being confirmed",
  "payment.success.detail": "We’re finalising your order now. You’ll hear from us as soon as it’s confirmed — keep this reference handy if you need to get in touch.",
  "payment.cancel.eyebrow": "Payment cancelled",
  "payment.cancel.headline": "No charge taken",
  "payment.cancel.detail": "Your order is still saved. Return to it to try again or choose another way to pay, or message us if you’d like a hand.",
  "payment.cancel.returnToOrder": "Return to your order",
  "payment.cancel.backToShop": "Back to shop",
  "payment.placed.eyebrow": "Order confirmed",
  "payment.placed.headline": "Order placed",
  "payment.placed.warning": "We couldn’t set up online payment for this order — message us and we’ll help you pay.",
  "payment.placed.chatHint": "Message us on WhatsApp or Telegram to arrange payment — your order reference is already filled in for you.",
  "payment.placed.checkoutHint": "Your order is saved and waiting for payment. Use the button below to pay securely online.",
  "payment.placed.payViaWhatsapp": "Pay via WhatsApp",
  "payment.placed.payViaTelegram": "Pay via Telegram",
  "payment.placed.viewOrder": "View your order",
  "payment.signIn.action": "Sign in to view your order",
  "payment.signIn.hint": "Use the email or phone number you gave at checkout.",
  "payment.placed.fallback": "Contact us through your usual channel and quote your order reference to arrange payment.",
  "payment.placed.notify": "Get notified when your order ships",
} satisfies AreaPack<typeof payment>;
