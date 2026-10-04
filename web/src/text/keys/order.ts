import { defineTextArea } from '@/text/define.ts';

/** Area `order`: order and payment wording shared by the account order page, tracking and the unpaid prompt, and the chat messages it prefills. */
export default defineTextArea('order', {
  // Short order-status names (order lists, account order detail, tracking page).
  'status.pending': { en: 'Order received', max: 40 },
  'status.confirmed': { en: 'Confirmed', max: 40 },
  'status.processing': { en: 'Being prepared', max: 40 },
  'status.partiallyShipped': { en: 'Partially shipped', max: 40 },
  'status.shipped': { en: 'On its way', max: 40 },
  'status.delivered': { en: 'Delivered', max: 40 },
  'status.cancelled': { en: 'Cancelled', max: 40 },
  'status.refunded': { en: 'Refunded', max: 40 },

  // Eyebrow of the payment-return pages' missing-reference screen.
  'link.eyebrow': { en: 'Order link', max: 40 },

  // Cancelling an unpaid order.
  'cancel.action': { en: 'Cancel order', max: 40 },
  'cancel.confirmTitle': { en: 'Cancel order {reference}?', max: 80 },
  'cancel.confirmBody': { en: 'The order will be cancelled and nothing will be charged. This cannot be undone.', max: 200 },
  'cancel.confirm': { en: 'Yes, cancel it', max: 40 },
  'cancel.keep': { en: 'Keep the order', max: 40 },
  'cancel.working': { en: 'Cancelling…', max: 40 },
  'cancel.done': { en: 'Order {reference} was cancelled.', max: 120 },
  'cancel.contact': { en: 'To cancel this order, contact us: a payment may already be on its way.', max: 200 },
  'cancel.refusedPaid': { en: 'This order has already been paid, so it can no longer be cancelled here.', max: 200 },
  'cancel.refusedInFlight': { en: 'A payment may already be on its way, so this order cannot be cancelled here. Contact us and we will help.', max: 220 },
  'cancel.refusedGone': { en: 'This order is no longer waiting for payment.', max: 160 },
  'cancel.failed': { en: "We couldn't cancel the order. Please try again.", max: 160 },
  'prompt.title': { en: 'You have an unpaid order', max: 80 },
  'prompt.body': { en: 'Order {reference} is waiting for payment.', max: 160 },
  'prompt.amount': { en: 'Amount due', max: 40 },
  'prompt.review': { en: 'Review or cancel order', max: 40 },
  'prompt.later': { en: 'Not now', max: 40 },
  'prompt.more': { en: 'You have other unpaid orders too. See all orders', max: 120 },

  // Parcels.
  'shipment.status.shipped': { en: 'Shipped', max: 30 },
  'shipment.status.delivered': { en: 'Delivered', max: 30 },
  'shipment.status.returned': { en: 'Returned', max: 30 },

  // Copy rows (deposit address, amount, tracking number, reference).
  'copy.copyNamed': { en: 'Copy {name}', max: 80 },
  'copy.copiedNamed': { en: '{name} copied', max: 80 },

  // Paying.
  'payment.ariaLabel': { en: 'Payment', max: 40 },
  'payment.required': { en: 'Payment required', max: 40 },
  'payment.chooseHowToPay': { en: 'Choose how to pay {total}', max: 80 },
  'payment.finishTitle': { en: 'Finish your payment', max: 60 },
  'payment.hostedFigure': { en: '{total} · secure hosted checkout', max: 80 },
  'payment.awaiting': { en: 'Awaiting payment', max: 40 },
  'payment.openCheckout': { en: 'Open secure checkout', max: 60 },
  'payment.hostedNote': { en: 'The checkout opens in a new tab. This page updates on its own once the payment lands.' },
  'payment.pendingEyebrow': { en: 'Payment pending', max: 40 },
  'payment.pendingTitle': { en: 'We’re waiting on your payment', max: 80 },
  'payment.pendingNote': { en: 'This one is arranged with us directly. Message us if anything is unclear.' },
  'payment.deadline': { en: 'Pay by {when} — after that the order cancels itself.' },
  'payment.changeMethod': { en: 'Change payment method', max: 60 },
  'payment.keepMethod': { en: 'Keep this method', max: 60 },

  // Payment method list.
  'method.loading': { en: 'Loading payment methods…', max: 80 },
  'method.none': { en: 'There’s no online payment method for this order right now. Message us and we’ll arrange it.' },
  'method.opening': { en: 'Opening checkout…', max: 60 },
  'method.withDiscount': { en: '{method} ({rate} discount)', max: 80 },
  'method.withFee': { en: '{method} ({rate} fee)', max: 80 },
  'method.preparing': { en: 'Preparing payment…', max: 60 },
  'method.payWith': { en: 'Pay with {coin}', max: 80 },
  'method.chooseCoin': { en: 'Choose a coin above', max: 60 },
  'method.coinBlurb': { en: 'The address and the exact amount appear right here.' },
  'method.transferHead': { en: 'Pay by {method}', max: 80 },
  'method.paymentReference': { en: 'Payment reference', max: 40 },
  'method.transferBlurb': { en: 'Use the order reference so we can match your transfer. Message us once it’s sent and we’ll confirm the order.' },
  'method.noDetails': { en: 'Message us and we’ll send the transfer details for order {reference}.' },

  // Crypto payment card.
  'crypto.label': { en: 'Crypto payment', max: 40 },
  'crypto.pillChecking': { en: 'Verifying', max: 30 },
  'crypto.pillConfirmed': { en: 'Confirmed', max: 30 },
  'crypto.pillAttention': { en: 'In review', max: 30 },
  'crypto.titleChecking': { en: 'Verifying your payment', max: 60 },
  'crypto.titleConfirmed': { en: 'Payment confirmed', max: 60 },
  'crypto.titleAttention': { en: 'Payment in review', max: 60 },
  'crypto.sendTitle': { en: 'Send {amount} {coin}', max: 80 },
  'crypto.figure': { en: '{coin} · {network} network · {fiat}', max: 120 },
  'crypto.amountToSend': { en: 'Amount to send', max: 40 },
  'crypto.addressLabel': { en: '{coin} address ({network})', max: 80 },
  'crypto.sendExactly': { en: 'Send exactly {amount} {coin} on the {network} network. A different amount or network can delay or lose your payment.', max: 300 },
  'crypto.txidLabel': { en: 'Transaction ID', max: 40 },
  'crypto.txidBlurb': { en: 'Once you’ve sent it, paste the transaction ID from your wallet and we’ll verify it on-chain.' },
  'crypto.txidPlaceholder': { en: 'Paste transaction ID', max: 60 },
  'crypto.sending': { en: 'Sending…', max: 30 },
  'crypto.submit': { en: 'Submit', max: 30 },
  'crypto.checkingNote': { en: 'Reading it off the chain — this can take a few minutes. The page updates on its own.' },
  'crypto.receivedInFull': { en: 'Payment received in full', max: 80 },
  'crypto.attentionNote': { en: 'We’re taking a closer look at this payment — nothing more is needed from you. Message us if it stays here.' },

  // Error fallbacks (shown when the shop sends no message of its own).
  'errors.loadMethods': { en: "We couldn't load the payment methods", max: 120 },
  'errors.methodUnavailable': { en: "That payment method isn't available right now", max: 120 },
  'errors.txidRejected': { en: 'That transaction ID was not accepted. Check it and try again.', max: 120 },

  // Prefilled chat messages.
  'chat.payRequest': { en: "I've just placed an order, here is my Order ID: {reference}. I'd like to pay." },
  'chat.inquiry': { en: 'Hi — checking in about my order {reference}.' },
});
