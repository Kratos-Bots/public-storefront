# Unpaid order recovery

Date: 2026-10-04
Repos: `ecommerce-backend` (no migration), `ecommerce-storefront` (release v0.16.0)
Status: design approved in chat, awaiting spec review

Piece 3 of 5 from the checkout feedback of 2026-10-04. Pieces 1 (checkout form
fixes) and 2 (collection points) are released. Remaining after this: payment
method presentation, delivery estimates and dispatch.

## Goal

A customer who placed an order but did not pay can finish or abandon it without
help:

- on their account order page they can pay, choose a payment method when none
  is attached, or change it;
- when they come back to the site with an unpaid order they are asked whether
  to complete payment or cancel;
- they can cancel their own unpaid order.

## What the shop owner asked for and decided

- "When the user goes back to the menu or loads the site but has an unpaid
  order they can be prompted to complete the checkout or cancel the order."
- "Viewing the order in /account/orders/:ref and there's no payment method
  attached, they should be prompted to select a payment method." "Currently
  when there is a payment method there is no way for them to pay it."
- Cancel rule: unpaid, with nothing in flight (below).
- The gaps in cancellation (store credit, coupon use, pending payments) are
  fixed for every cancellation, not only the customer's.
- The prompt is a pop-up on arrival, for signed-in customers and for guests on
  the same device.
- Flagging money that arrives after a cancellation, for every processor, was
  proposed by the designer and approved.

## Current state

Backend (`src/`):

- `updateOrder(id, { status: 'cancelled', reason })` (`modules/orders/service.ts`)
  is the only cancel path. Staff (`PATCH /orders/:id`) and the auto-cancel job
  (`scanPendingOrders`, `modules/orders/maintenance.ts`) use it. It restores
  stock, emits socket events, sends the CANCELLED notification and cancels a
  dropship link. It does not touch payments (pending rows stay pending,
  `releasePaymentFee` is not called), does not return store credit spent on
  the order, and does not release the coupon use.
- No customer-initiated cancel exists in any channel.
- The public order API (`modules/public-orders/`, credential: the HMAC access
  key in the URL) already lets a customer pay: `GET /:reference/:accessKey`
  (`payment: { canPay, payBy, activePayment }`, `cryptoPayments[]`),
  `GET …/payment-options`, `POST …/payment-method`, `POST …/crypto-txid`.
  `canPay` is `status === 'pending'` and no completed payment.
- The storefront account order detail (`getStorefrontOrderDetail`,
  `modules/public-storefront/account.ts`) returns `payments[]`,
  `outstandingBalance` and `publicUrl`, but no access key, no payment state.
  The order list has no status filter; there is no "my unpaid orders" lookup.
- A payment that completes for an order that is no longer pending:
  hosted-link gateways (`settleHostedLinkPaid` → `flagIfOrderNotPending`) and
  Monzo (`handleCreditAgainstNonPendingOrder`) leave a "needs review" note;
  the Stripe, PayPal, Revolut, OxaPay, Wise, Paygate and NexaPay webhooks and
  crypto verification complete the payment and flag nothing.
  `confirmOrderIfFullyPaid` returns early for a non-pending order, so nothing
  is revived; `POST /orders/:id/reinstate` is the staff route back.

Storefront (`web/src/`):

- `features/order-status/PaymentSection.tsx` (with `MethodPicker`,
  `CryptoPaymentCard`) takes `{ order, reference, accessKey }` as props and
  owns paying, changing method and submitting a crypto transaction ID. It is
  used only on the public order page `/order/:ref/:accessKey`.
- `features/account/OrderDetailPage.tsx` shows a display-only "balance due"
  band and a link to the public order page; a comment records that payment
  actions were kept on the public page to avoid a second implementation.
- `stores/saved-orders.ts` remembers `{ reference, accessKey, savedAt }` for
  orders placed or opened in this browser (localStorage `sf-orders-v1`).
- Nothing checks for an unpaid order when the site loads.
- The site frame mounts `LoginModal` and the cart drawer outside the page
  builder's blocks; `@mantine/notifications` is available.

## Design

### 1. Backend: what a cancellation does

Inside `updateOrder`, in the same transaction as the stock restore, a
transition to `cancelled` additionally:

- **returns store credit**: the sum of the order's `completed` `store_credit`
  payments is credited back to the customer's `storeCreditBalance`, with a
  `store_credit_log` row (movement type for an order cancellation, before and
  after balances, the order reference), and those payment rows become
  `refunded`. The customer row is locked for the balance write, as
  `redeemPoints` does. An order with no customer or no store-credit payment is
  untouched.
- **releases the coupon use**: the order's `coupon_usages` row is removed and
  the coupon's `usageCount` decremented, through the existing
  `removeCouponUsage`.
- **closes pending payments**: every `pending` payment of the order becomes
  `failed` with a note ("Order cancelled"), and `releasePaymentFee` runs for
  each, per the rule that any path that fails a payment must call it. Rows
  are kept, so a late webhook still finds its payment.

This applies to every caller: staff, the auto-cancel job and the new customer
cancel. `refunded` keeps its current behaviour.

Reinstating a cancelled order still requires completed payments covering the
total; store credit returned at cancellation no longer counts, which is
correct.

### 2. Backend: who may cancel their own order

One pure function decides, from the order and its payments:

- `status === 'pending'`, and
- no `completed` payment (a store-credit part-payment counts as completed, so
  an order part-paid with store credit is not customer-cancellable), and
- no payment of the order, in any status, uses a manual or offline method
  (the same set the auto-cancel job treats as staff-reconciled:
  `uk_bank_transfer`, `sepa_transfer`, `ach_wire`, `bank_transfer`, `cash`,
  `manual`), and
- no crypto payment of the order has a transaction ID submitted.

A pending hosted-gateway or Monzo payment does not block cancelling.

The function returns `{ allowed: true }` or `{ allowed: false, reason }` with
`reason` one of `not_pending`, `paid`, `bank_transfer`, `crypto_submitted`.

Routes, both calling one service function that re-checks the rule inside the
transaction and then `updateOrder(id, { status: 'cancelled', reason:
'Cancelled by customer' })`:

- `POST /api/v1/public/storefront/orders/:reference/cancel`: session; the
  same ownership rule as the order detail (a non-owner and an unknown
  reference are both 404). Behind the storefront kill switch like its
  neighbours, not behind the shop-access gate (in-flight orders stay
  reachable).
- `POST /api/v1/public/orders/:reference/:accessKey/cancel`: the access key
  is the credential; 30 requests per 15 minutes like the other action routes.

A refused cancel is `409` with the reason as the message
(`ORDER_NOT_CANCELLABLE:<reason>`). Cancelling an already-cancelled order is
a `409 ORDER_NOT_CANCELLABLE:not_pending`.

### 3. Backend: order views

- Public order (`getPublicOrder`): `payment` gains
  `canCancel: boolean` and `cancelBlockedBy: 'paid' | 'bank_transfer' |
  'crypto_submitted' | null` (null when it can be cancelled or the order is
  not pending).
- Account order detail: gains `accessKey: string | null` (null when
  `ORDER_ACCESS_SECRET` is unset), `canCancel` and `cancelBlockedBy`.
- New `GET /api/v1/public/storefront/orders/unpaid` (session): the customer's
  orders that are `pending` with no completed payment and not archived, newest
  first, at most 5: `{ reference, accessKey, createdAt, totalAmount,
  outstandingBalance, payBy, canCancel, cancelBlockedBy }`. One query for the
  orders and one for their payments; no per-row queries.

### 4. Backend: money that arrives after a cancellation

Every path that completes a payment calls one shared helper after the status
write: if the order is `cancelled` or `refunded`, it appends a de-duplicated
"paid after the order was cancelled, needs review" note to `payments.notes`
and emits `payment:updated`. The helper is the existing
`flagIfOrderNotPending`, moved to where all handlers can use it. Callers
added: the Stripe, PayPal, Revolut, OxaPay, Wise, Paygate and NexaPay webhook
handlers and crypto verification. Hosted-link gateways and Monzo keep their
current behaviour. Nothing is reinstated automatically.

### 5. Storefront: paying from the account order page

- `OrderDetail` gains `accessKey`, `canCancel`, `cancelBlockedBy`.
- When the order has an `accessKey` and an outstanding balance, the page
  loads the public order (`fetchPublicOrder(reference, accessKey)`, the same
  query key and polling the public page uses) and the `OrderBalance` part
  renders the existing `PaymentSection` under the balance figure. No payment
  logic is duplicated; the component is the one the public page uses.
- With no `accessKey` (older backend, or the secret unset) the part renders
  as today.
- After a method is chosen or a transaction ID submitted, both the public
  order query and the account order query are refreshed.
- The comment explaining why payment was kept off this page is rewritten.

### 6. Storefront: cancelling

- API: `cancelOrder(reference)` (session) and
  `cancelPublicOrder(reference, accessKey)`.
- A shared `CancelOrder` control: a button, then a confirmation step naming
  the order, then the request. On success the order queries refresh and a
  notification confirms it. A `409` shows the reason in plain words and
  refreshes the order.
- When `canCancel` is false and `cancelBlockedBy` is `bank_transfer` or
  `crypto_submitted`, it shows "contact us to cancel this order" with the
  shop's support links instead of the button. When blocked by `paid`, or the
  order is not pending, nothing is shown.
- Shown on the account order page (in the `OrderBalance` part) and on the
  public order page (in the payment part).

### 7. Storefront: the pop-up

A frame-level component mounted beside `LoginModal` in every layout.

Finding the order:

- signed in: `GET storefront/orders/unpaid`;
- signed out: the three most recent entries of `saved-orders` no older than
  14 days are fetched with `fetchPublicOrder`; those with `payment.canPay`
  qualify. Entries whose link no longer resolves are skipped.

Behaviour:

- shown once per visit, after settings and session are ready, for the newest
  qualifying order; with more than one, a line links to the order list
  (signed in);
- content: reference, amount due, and three actions: Complete payment,
  Cancel order (the `CancelOrder` control, or the contact line when it cannot
  be cancelled), Not now;
- Complete payment goes to `/account/orders/:ref` when signed in, otherwise
  to `/order/:ref/:accessKey`;
- Not now, or closing it, hides it until the next visit (session storage);
  completing or cancelling removes the cause;
- never shown on `/checkout`, `/order/*`, `/payment/*`, `/order-placed`,
  `/account/orders/*`, the sign-in pages, or in the page builder; not shown
  while the shop is closed or the visitor is refused access;
- all wording is editable text with notes.

## Limits and non-goals

- An order part-paid with store credit is outside this piece. The backend's
  existing rule treats any completed payment as "paid" for the purposes of
  paying online (`canPay` is false, and choosing a method is refused), so such
  an order cannot be paid, cancelled or prompted for through the storefront.
  It keeps showing its balance and the order link, as today.
- No partial payment, no editing an order, no cancelling a paid order, no
  refunds.
- No cancel button in the Telegram bot.
- No shop setting to turn the pop-up off.
- A guest on another device gets no pop-up; their order link still works.
- The pop-up checks at most three saved guest orders per visit.

## Testing

Backend:

- Unit: the cancel-eligibility function (each rule, each reason); the
  projection of `canCancel` / `cancelBlockedBy`; the late-payment helper
  (note added once, only for cancelled or refunded orders).
- Database-backed, on the in-memory Postgres the promotions integration suite
  uses (skipped unless installed, as that suite is): a cancellation returns
  store credit with a log row and marks the payment refunded; releases the
  coupon use; fails pending payments and releases their fees; an order with
  none of those is unchanged; the customer cancel routes enforce ownership,
  the rule and idempotency; the unpaid lookup returns the right orders.
- Source-pinning tests where a webhook handler cannot be driven: each handler
  calls the helper after completing a payment.

Storefront:

- Unit: the pop-up's eligibility and suppression rules as a pure function;
  the `CancelOrder` control's confirm, success, refused and blocked states;
  the account order page with and without an `accessKey`.
- End to end on the mock backend: pay from the account order page; choose a
  method when none is attached; cancel from the account page, the public page
  and the pop-up; the pop-up for a signed-in customer and for a guest; Not
  now; a blocked cancel.
- Baselines regenerated only where the account order page changes on purpose,
  each diff read in full. `TZ=UTC npm test` before tagging.

## Rollout

1. Backend to `main` and deployed. From that moment every cancellation
   (staff, auto-cancel) returns store credit, releases the coupon use and
   fails pending payments. An older storefront ignores the new fields.
2. Storefront to `main`, `chore(release): web 0.16.0`, tag `v0.16.0`. Against
   an older backend the account page stays as it is, no cancel control
   appears, and the signed-in pop-up lookup fails quietly.

Documentation: backend `STOREFRONT.md` and `CLAUDE.md` (Orders bullet:
what a cancellation does; the customer cancel routes); storefront
`docs/builder.md`.
