import { defineTextArea } from '@/text/define.ts';

/** Area `order`: the order-status page opened from a chat link, and the chat messages it prefills. */
export default defineTextArea('order', {
  documentTitle: { en: 'Order {reference} — {shop}', note: 'Browser tab title on the order page; {reference} is the order ID, {shop} the shop name', max: 120 },

  // The hero: where the order is.
  'hero.ariaLabel': { en: 'Order status', note: 'Screen-reader label of the order page\'s top section', max: 60 },
  'hero.eyebrow': { en: 'Order status', note: 'Small line above the order page headline (every state but delivered)', max: 40 },
  'hero.deliveredEyebrow': { en: 'Delivered', note: 'Small line above the order page headline once delivered', max: 40 },
  'hero.pendingHeadline': { en: 'Order received', note: 'Order page headline for a new order', max: 60 },
  'hero.pendingDetail': { en: "We've got your order and we're getting it ready.", note: 'Sentence under the headline for a new order' },
  'hero.confirmedHeadline': { en: 'Order confirmed', note: 'Order page headline for a confirmed order', max: 60 },
  'hero.confirmedDetail': { en: 'Your order is confirmed and moving into preparation.', note: 'Sentence under the headline for a confirmed order' },
  'hero.processingHeadline': { en: 'Being prepared', note: 'Order page headline while the order is packed', max: 60 },
  'hero.processingDetail': { en: "We're packing your order now.", note: 'Sentence under the headline while the order is packed' },
  'hero.partiallyShippedHeadline': { en: 'Partially shipped', note: 'Order page headline when some parcels have shipped', max: 60 },
  'hero.partiallyShippedDetail': { en: 'Some items are on their way. The rest will follow shortly.', note: 'Sentence under the headline when some parcels have shipped' },
  'hero.shippedHeadline': { en: 'On its way', note: 'Order page headline once shipped', max: 60 },
  'hero.shippedDetail': { en: 'Your order has shipped. Track it below.', note: 'Sentence under the headline once shipped' },
  'hero.deliveredHeadline': { en: 'Delivered', note: 'Order page headline once delivered', max: 60 },
  'hero.deliveredDetail': { en: 'Your order has arrived. Thanks for shopping with us.', note: 'Sentence under the headline once delivered' },
  'hero.cancelledHeadline': { en: 'Order cancelled', note: 'Order page headline for a cancelled order', max: 60 },
  'hero.cancelledDetail': { en: "This order has been cancelled and won't be dispatched.", note: 'Sentence under the headline for a cancelled order' },
  'hero.refundedHeadline': { en: 'Order refunded', note: 'Order page headline for a refunded order', max: 60 },
  'hero.refundedDetail': { en: 'This order has been refunded.', note: 'Sentence under the headline for a refunded order' },
  'hero.preorderFlag': { en: 'Contains pre-order items', note: 'Flag under the headline when the order has pre-order items', max: 60 },
  'hero.cancelledNotice': { en: "If that isn't right, reply to the message that sent you this link and we'll sort it out.", note: 'Note under the headline of a cancelled order' },
  'hero.refundedNotice': { en: 'Refunds take 5–10 business days to appear on your statement.', note: 'Note under the headline of a refunded order' },

  // Dates, shown in the hero and on each parcel.
  'dates.placed': { en: 'Placed {date}', note: 'When the order was placed; {date} is the date', max: 60 },
  'dates.shipped': { en: 'Shipped {date}', note: 'When a parcel shipped; {date} is the date', max: 60 },
  'dates.delivered': { en: 'Delivered {date}', note: 'When the order or a parcel was delivered; {date} is the date', max: 60 },

  // The four milestones on the route.
  'steps.ariaLabel': { en: 'Order progress', note: 'Screen-reader label of the four-step order progress', max: 60 },
  'steps.received': { en: 'Received', note: 'First step of the order progress', max: 30 },
  'steps.confirmed': { en: 'Confirmed', note: 'Second step of the order progress', max: 30 },
  'steps.shipped': { en: 'Shipped', note: 'Third step of the order progress', max: 30 },
  'steps.delivered': { en: 'Delivered', note: 'Last step of the order progress', max: 30 },
  'steps.partial': { en: 'Partial', note: 'Marker on the Shipped step when only some items have shipped', max: 30 },

  // Short order-status names (order lists, account order detail, tracking page).
  'status.pending': { en: 'Order received', note: 'Status name of a new order in order lists and on the tracking page', max: 40 },
  'status.confirmed': { en: 'Confirmed', note: 'Status name of a confirmed order', max: 40 },
  'status.processing': { en: 'Being prepared', note: 'Status name while an order is packed', max: 40 },
  'status.partiallyShipped': { en: 'Partially shipped', note: 'Status name when some parcels have shipped', max: 40 },
  'status.shipped': { en: 'On its way', note: 'Status name once shipped', max: 40 },
  'status.delivered': { en: 'Delivered', note: 'Status name once delivered', max: 40 },
  'status.cancelled': { en: 'Cancelled', note: 'Status name of a cancelled order', max: 40 },
  'status.refunded': { en: 'Refunded', note: 'Status name of a refunded order', max: 40 },

  // Loading and error screens.
  'screens.loading': { en: 'Loading your order', note: 'Screen-reader label while the order page loads', max: 60 },
  'link.eyebrow': { en: 'Order link', note: 'Small line above the "link isn\'t valid" and "reference missing" screens', max: 40 },
  'screens.invalidTitle': { en: "This link isn't valid", note: 'Heading when the order link is broken or expired', max: 80 },
  'screens.invalidDescription': { en: "The link looks incomplete or has expired. Reply to the message that sent it and we'll share a fresh one.", note: 'Text when the order link is broken or expired' },
  'screens.networkEyebrow': { en: 'Connection', note: 'Small line above the "couldn\'t load your order" screen', max: 40 },
  'screens.networkTitle': { en: "We couldn't load your order", note: 'Heading when the order page can\'t reach the shop', max: 80 },
  'screens.networkDescription': { en: 'Your order is safe — this was a hiccup between your browser and us.', note: 'Text when the order page can\'t reach the shop' },

  // Footer.
  'footer.reference': { en: 'Order {reference}', note: 'Order ID at the foot of the order page', max: 60 },
  'footer.questions': { en: 'Questions about this order? Message us and quote that reference.', note: 'Line above the chat links at the foot of the order page' },

  // Items and totals.
  'items.title': { en: 'Items', note: 'Heading of the ordered-items card (capital I)', max: 40 },
  'items.delivery': { en: 'Delivery', note: 'Totals row for the delivery charge on the order page', max: 40 },
  'items.free': { en: 'Free', note: 'Delivery amount when delivery costs nothing', max: 30 },
  'items.paymentDiscount': { en: 'Payment discount', note: 'Totals row when the payment method gives a discount', max: 40 },
  'items.tax': { en: 'Tax', note: 'Totals row for tax', max: 40 },

  'address.title': { en: 'Delivery address', note: 'Heading of the delivery-address card', max: 40 },

  // Parcels.
  'shipment.parcel': { en: 'Parcel', note: 'Heading of the parcel card when there is one parcel', max: 40 },
  'shipment.parcelOf': { en: 'Parcel {index} of {count}', note: 'Heading of each parcel card when there are several', max: 60 },
  'shipment.untitled': { en: 'On its way', note: 'Parcel card title when the carrier is unknown', max: 60 },
  'shipment.trackingNumber': { en: 'Tracking number', note: 'Label of the copyable tracking number', max: 40 },
  'shipment.track': { en: 'Track this parcel', note: 'Link to the carrier\'s tracking page', max: 60 },
  'shipment.status.shipped': { en: 'Shipped', note: 'Parcel status pill', max: 30 },
  'shipment.status.inTransit': { en: 'In transit', note: 'Parcel status pill', max: 30 },
  'shipment.status.delivered': { en: 'Delivered', note: 'Parcel status pill', max: 30 },
  'shipment.status.returned': { en: 'Returned', note: 'Parcel status pill', max: 30 },

  // Copy rows (deposit address, amount, tracking number, reference).
  'copy.copyNamed': { en: 'Copy {name}', note: 'Screen-reader label of a Copy button; {name} is what it copies, in lower case', max: 80 },
  'copy.copiedNamed': { en: '{name} copied', note: 'Screen-reader label of a Copy button just after copying; {name} is what was copied', max: 80 },

  // Paying.
  'payment.ariaLabel': { en: 'Payment', note: 'Screen-reader label of the payment card', max: 40 },
  'payment.required': { en: 'Payment required', note: 'Small line above the payment card while money is owed', max: 40 },
  'payment.chooseHowToPay': { en: 'Choose how to pay {total}', note: 'Payment card heading; {total} is the amount owed', max: 80 },
  'payment.finishTitle': { en: 'Finish your payment', note: 'Payment card heading while a hosted checkout is open', max: 60 },
  'payment.hostedFigure': { en: '{total} · secure hosted checkout', note: 'Line under "Finish your payment"; {total} is the amount', max: 80 },
  'payment.awaiting': { en: 'Awaiting payment', note: 'Status pill on a payment card waiting for money', max: 40 },
  'payment.openCheckout': { en: 'Open secure checkout', note: 'Button that opens the hosted checkout', max: 60 },
  'payment.hostedNote': { en: 'The checkout opens in a new tab. This page updates on its own once the payment lands.', note: 'Note under the hosted-checkout button' },
  'payment.pendingEyebrow': { en: 'Payment pending', note: 'Small line above the card for a payment arranged with the shop', max: 40 },
  'payment.pendingTitle': { en: 'We’re waiting on your payment', note: 'Heading of the card for a payment arranged with the shop', max: 80 },
  'payment.pendingNote': { en: 'This one is arranged with us directly. Message us if anything is unclear.', note: 'Text of the card for a payment arranged with the shop' },
  'payment.deadline': { en: 'Pay by {when} — after that the order cancels itself.', note: 'Deadline above the payment card; {when} is the date and time' },
  'payment.changeMethod': { en: 'Change payment method', note: 'Button that opens the list to switch payment method', max: 60 },
  'payment.keepMethod': { en: 'Keep this method', note: 'The same button while the switch list is open', max: 60 },

  // Payment method list.
  'method.loading': { en: 'Loading payment methods…', note: 'While the payment methods load', max: 80 },
  'method.none': { en: 'There’s no online payment method for this order right now. Message us and we’ll arrange it.', note: 'When no payment method can be used on the order page' },
  'method.opening': { en: 'Opening checkout…', note: 'Payment method row while its hosted checkout opens', max: 60 },
  'method.card': { en: 'Card', note: 'Name of the card payment option', max: 30 },
  'method.crypto': { en: 'Crypto', note: 'Name of the crypto payment option', max: 30 },
  'method.withDiscount': { en: '{method} ({rate} discount)', note: 'Payment option with a discount; {method} is its name, {rate} the percentage', max: 80 },
  'method.withFee': { en: '{method} ({rate} fee)', note: 'Payment option with a fee; {method} is its name, {rate} the percentage', max: 80 },
  'method.preparing': { en: 'Preparing payment…', note: 'Crypto pay button while the payment is created', max: 60 },
  'method.payWith': { en: 'Pay with {coin}', note: 'Crypto pay button; {coin} is the coin and network', max: 80 },
  'method.chooseCoin': { en: 'Choose a coin above', note: 'Crypto pay button before a coin is picked', max: 60 },
  'method.coinBlurb': { en: 'The address and the exact amount appear right here.', note: 'Note under the crypto pay button' },
  'method.transferHead': { en: 'Pay by {method}', note: 'Heading of the bank-transfer details; {method} is the method name', max: 80 },
  'method.paymentReference': { en: 'Payment reference', note: 'Label of the copyable order reference in bank-transfer details', max: 40 },
  'method.transferBlurb': { en: 'Use the order reference so we can match your transfer. Message us once it’s sent and we’ll confirm the order.', note: 'Note under the bank-transfer details' },
  'method.noDetails': { en: 'Message us and we’ll send the transfer details for order {reference}.', note: 'When a bank transfer has no details to show; {reference} is the order ID' },

  // Crypto payment card.
  'crypto.label': { en: 'Crypto payment', note: 'Crypto payment card heading line once sent, and its screen-reader label', max: 40 },
  'crypto.pillChecking': { en: 'Verifying', note: 'Crypto card status pill while the transaction is checked', max: 30 },
  'crypto.pillConfirmed': { en: 'Confirmed', note: 'Crypto card status pill once confirmed', max: 30 },
  'crypto.pillAttention': { en: 'In review', note: 'Crypto card status pill when the shop is reviewing it', max: 30 },
  'crypto.titleChecking': { en: 'Verifying your payment', note: 'Crypto card heading while the transaction is checked', max: 60 },
  'crypto.titleConfirmed': { en: 'Payment confirmed', note: 'Crypto card heading once confirmed', max: 60 },
  'crypto.titleAttention': { en: 'Payment in review', note: 'Crypto card heading when the shop is reviewing it', max: 60 },
  'crypto.sendTitle': { en: 'Send {amount} {coin}', note: 'Crypto card heading before paying; {amount} and {coin} are the exact sum', max: 80 },
  'crypto.figure': { en: '{coin} · {network} network · {fiat}', note: 'Line under the crypto card heading; {fiat} is the amount in the shop\'s currency', max: 120 },
  'crypto.amountToSend': { en: 'Amount to send', note: 'Label of the copyable amount (crypto and bank transfer)', max: 40 },
  'crypto.addressLabel': { en: '{coin} address ({network})', note: 'Label of the copyable deposit address', max: 80 },
  'crypto.sendExactly': { en: 'Send exactly {amount} {coin} on the {network} network. A different amount or network can delay or lose your payment.', note: 'Warning on the crypto card before paying', max: 300 },
  'crypto.txidLabel': { en: 'Transaction ID', note: 'Label of the transaction ID field and of the submitted ID', max: 40 },
  'crypto.txidBlurb': { en: 'Once you’ve sent it, paste the transaction ID from your wallet and we’ll verify it on-chain.', note: 'Help under the transaction ID label' },
  'crypto.txidPlaceholder': { en: 'Paste transaction ID', note: 'Placeholder in the transaction ID field', max: 60 },
  'crypto.sending': { en: 'Sending…', note: 'Submit button while the transaction ID is sent', max: 30 },
  'crypto.submit': { en: 'Submit', note: 'Button that sends the transaction ID', max: 30 },
  'crypto.checkingNote': { en: 'Reading it off the chain — this can take a few minutes. The page updates on its own.', note: 'Note while the transaction is checked' },
  'crypto.receivedInFull': { en: 'Payment received in full', note: 'Note once the crypto payment is confirmed', max: 80 },
  'crypto.attentionNote': { en: 'We’re taking a closer look at this payment — nothing more is needed from you. Message us if it stays here.', note: 'Note when the shop is reviewing the crypto payment' },

  // Error fallbacks (shown when the shop sends no message of its own).
  'errors.loadMethods': { en: "We couldn't load the payment methods", note: 'When the payment methods fail to load', max: 120 },
  'errors.methodUnavailable': { en: "That payment method isn't available right now", note: 'When choosing a payment method fails', max: 120 },
  'errors.txidRejected': { en: 'That transaction ID was not accepted. Check it and try again.', note: 'When a submitted transaction ID is refused', max: 120 },

  // Prefilled chat messages.
  'chat.payRequest': { en: "I've just placed an order, here is my Order ID: {reference}. I'd like to pay.", note: 'Chat message prefilled by "pay via chat" links; {reference} is the order ID' },
  'chat.inquiry': { en: 'Hi — checking in about my order {reference}.', note: 'Chat message prefilled after a successful payment; {reference} is the order ID' },
});
