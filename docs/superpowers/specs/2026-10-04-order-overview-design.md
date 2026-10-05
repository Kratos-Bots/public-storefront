# Order overview page, and the end of the order link page

Date: 2026-10-04
Repos: `ecommerce-backend` (no migration, deploys first), `ecommerce-storefront` (minor release)
Status: design approved in chat, awaiting spec review

## Goal

A signed-in customer has one page for an order, `/account/orders/:ref`, and it
reads like a shop's order page: what the order is, what is owed and how to pay
it, what was bought, where it is going, where the parcels are. An unpaid order
can be paid or cancelled there without help. The site reminds the customer of an
unpaid order every time they arrive.

## What the shop owner asked for and decided

- The unpaid-order pop-up shows only once; it should show "every time they first
  browse to the site". Its button says "Review or Cancel" and goes to
  `/account/orders/:ref`. Decided: one button plus "Not now".
- The order page "needs some love": balance message and cancel at the top,
  payments at the bottom with no way to pay or pick a method, no address, messy.
  Make it a professional order overview on every template, mobile first, desktop
  equally important. Hide the Orders / Loyalty / Referrals / Profile navigation
  while viewing an order.
- An unpaid order can be paid or cancelled from the page. A cancellation is
  always confirmed, in a modal that cannot be closed by accident.
- On the deployment tested, the page showed only the balance figure: that
  backend has no `ORDER_ACCESS_SECRET`, which was "only really used for
  ecommerce-menu". Paying from the account page must not depend on it.
- `/order/:ref/:key` is removed **from the storefront only**. Guests must sign
  in. Live deployments still run `ecommerce-menu`, so the backend's key-based
  order API, the order emails' links and `ORDER_ACCESS_SECRET` stay exactly as
  they are.
- Shoppers "are not the smartest": the page has one obvious next step at a time.

## Current state

Storefront (`web/src/`):

- `features/account/OrderDetailPage.tsx` is the `OrderDetail` builder container
  with parts `OrderBackLink`, `OrderHeading`, `OrderBalance`, `OrderItems`,
  `OrderPayments`, `OrderParcels`, `OrderPageLink`. `OrderBalance` renders the
  shared `PaymentSection` only when the order carries an `accessKey`, by fetching
  the public order through `api/public-order.ts`. Without a key it draws the
  figure and nothing else.
- `features/order-status/` holds the link page (`OrderStatusPage`, the
  `OrderStatus*` blocks, doc key `order-status`) and the shared pay and cancel
  components (`PaymentSection`, `MethodPicker`, `CryptoPaymentCard`,
  `CancelOrder`), all of which take `reference` + `accessKey`.
- `features/unpaid-prompt/`: a Modal with Complete payment, an inline
  `CancelOrder`, and Not now. "Not now" writes `sessionStorage`, so it stays
  quiet for the life of the tab, reloads included. A guest branch reads
  `stores/saved-orders.ts` and asks the public order API about saved links.
- `AccountLayout` draws the greeting and the tab rail above every account page,
  the order page included.
- `/order/…` is referenced by: `app/routes.tsx`, `app/closed-gate.ts` (exempt
  prefix, also used by `app/access.ts`), `features/webapp/default-action.ts`,
  `features/unpaid-prompt/rules.ts`, `features/checkout/outcome.ts` and
  `CheckoutPage.tsx`, `features/payment-redirect/PaymentSuccessPage.tsx` and
  `payment-parts.tsx`, the builder editor fixtures, the Worker's
  `ALLOWED_PREFIXES` (`orders/`), and `e2e/mocks.ts`.

Backend (`src/`):

- `modules/public-orders/` (key in the URL): order view, `payment-options`,
  `payment-method`, `crypto-txid`, `cancel`. Each action resolves the order by
  key and then works on the order row, so the work is separable from the key.
- `modules/public-storefront/` (customer session): `GET /orders`,
  `GET /orders/unpaid`, `GET /orders/:reference`, `POST /orders/:reference/cancel`.
  The detail loads the shipping address row but returns only `servicePoint`.
  It has no payment state (`canPay`, `payBy`, `activePayment`, crypto cards).
- `buildOrderPublicUrl` feeds order emails, the admin order `publicUrl`, the
  checkout result's `publicUrl` and, through `resolveReturnUrls`, the success
  and cancel return address of hosted payments.
- A guest order is attached to a customer row matched or created by email /
  phone, so a later code sign-in with the same address sees it.

## Design

### 1. Backend: paying through the session

New routes in `modules/public-storefront/router.ts`, each behind
`requireStorefrontEnabled` + `authenticateStorefrontCustomer` + params
validation, **without** `requireStorefrontAccess` (a customer refused by shop
access must still be able to pay an in-flight order, as with the existing order
routes). Ownership is the existing rule: load by reference, compare
`customerId`, same 404 for unknown and for someone else's.

| Route | Limit | Returns |
|---|---|---|
| `GET /orders/:reference/payment` | 120 / 15 min | the public order projection (same shape as `GET /public/orders/:ref/:key`) |
| `GET /orders/:reference/payment-options` | 30 / 15 min | same as the public route |
| `POST /orders/:reference/payment-method` | 30 / 15 min | same as the public route |
| `POST /orders/:reference/crypto-txid` | 30 / 15 min | same as the public route |

The payment read is polled by the page (every few seconds while a payment is
open), hence its higher limit.

In `modules/public-orders/service.ts` the bodies after the key check are
extracted into functions that take the resolved order row
(`projectPublicOrder`, `paymentOptionsForOrder`, `selectPaymentMethodForOrder`,
`submitCryptoTxidForOrder`). The key-based functions become "check key, then
call". Behaviour of the key-based routes does not change.

`getStorefrontOrderDetail` additionally returns `shippingAddress`
(`firstName`, `surname`, `addressLine1..3`, `city`, `county`, `zip`, `country`,
`servicePoint`), the same projection the public view uses, or `null`. It never
returns the raw `servicePoint*` columns. `servicePoint`, `publicUrl` and
`accessKey` stay on the response: the change is additive, so the released
storefront keeps working against the new backend.

Not changed: the key-based routes, `buildOrderPublicUrl`, emails, return URLs,
`ORDER_ACCESS_SECRET`, the backend's `FIXED_ROUTE_KEYS` (it keeps
`order-status`, so a stored page set that still contains that page saves fine).

Docs: `STOREFRONT.md` and `src/docs/registry.ts` gain the four routes and the
address field.

### 2. Storefront: one order page API

`api/orders.ts` gains `fetchOrderPayment`, `fetchOrderPaymentOptions`,
`selectOrderPaymentMethod`, `submitOrderCryptoTxid`, with the error mapping
`api/public-order.ts` has today (409 → `PaymentConflictError`, 422 passed
through, 404 → not found).

`PaymentSection`, `MethodPicker` and `CryptoPaymentCard` lose their `accessKey`
prop and call these functions. The cache key for the payment view is
`['order-payment', reference]`; `paymentOptionsKey(reference)` is unchanged.
`CancelOrder` loses `viaLink` / `accessKey` and always cancels through the
session. `invalidateAfterCancel` drops its key argument.

Deleted: `api/public-order.ts`'s fetch/select/submit/cancel functions (its error
classes and `asCancelError` move to `api/orders.ts`), `stores/saved-orders.ts`
and its callers, `OrderDetail.accessKey` / `publicUrl` and `UnpaidOrder.accessKey`
from the types (the backend may still send them; they are ignored).

### 3. Removing the link page

- Deleted: `OrderStatusPage`, `order-status-parts`, `StatusHero`, `StateScreens`,
  `AddressCard`, `ItemsCard`, `ShipmentCard`, the `OrderStatus*` blocks, fields,
  container and family, the `order-status` doc key and its default doc, preview
  states and editor fixtures, the `OrderPageLink` part ("Open order page").
- Text keys used only by those are removed with their inventory entries.
- `order/:ref/:accessKey` stays in `routes.tsx` as a plain redirect:
  `<Navigate replace to="/account/orders/:ref">`. Emails already sent and the
  return address of hosted payments (both built by the backend, which is not
  changing) keep landing somewhere useful; the account guard sends a signed-out
  visitor through sign-in and back.
- A stored page set that still has an `order-status` page: the storefront never
  looks it up. A stored `account.order` page that still places `OrderPageLink`:
  the renderer drops the unknown block and renders the rest. Both are verified
  by a test, including a save from the editor.
- `closed-gate.ts` keeps `/order/` exempt (so the redirect can run) and nothing
  else changes there: when the shop is closed the order page shows the closed
  screen like the rest of the account area. Payments in progress still settle.
- `default-action.ts` drops `/order/` from its terminal paths.
- Worker `ALLOWED_PREFIXES` drops `orders/`.

### 4. After checkout and after paying

`resolveCheckoutOutcome` no longer reads `publicUrl`:

| Who | Payment | Goes to |
|---|---|---|
| signed in | hosted checkout | the processor (in Telegram: opens it, app goes to the order page) |
| signed in | crypto, bank transfer, other | `/account/orders/:ref` |
| signed in | none | `/order-placed?order=ref` as today |
| guest | hosted checkout | the processor |
| guest | anything else | `/order-placed?order=ref` |

`/payment/success`: a signed-in customer is redirected to
`/account/orders/:ref`; a signed-out one sees the static thanks page plus the
sign-in prompt below. `/payment/cancel`: "Return to order" goes to
`/account/orders/:ref` when signed in.

Sign-in prompt for guests (order placed, payment success, payment cancel), shown
only when the shop has accounts on: "Sign in with the email or phone number you
used to view and pay for your order", a button to
`/login?returnTo=/account/orders/:ref`. With accounts off the pages keep what
they show today (reference, pay-via-chat links). This is the stated cost of
"guests must sign in": a guest paying by crypto or bank transfer sees the
payment details only after signing in.

`features/tracking/LookupForm` loses its "recent orders" chips (their source was
the saved-orders store).

### 5. The order page

Parts of the `OrderDetail` container after this change, in default order:

`OrderBackLink`, `OrderHeading`, `OrderBalance`, `OrderItems`, `OrderAddress`
(new), `OrderParcels`, `OrderPayments`.

Required parts stay `OrderHeading` and `OrderItems`. No existing part is renamed.
A stored page keeps its own arrangement and does not gain `OrderAddress` until
the owner adds it; everything else below is behaviour of the parts and reaches
stored pages too.

**Header.** The account greeting and the tab rail draw nothing on
`/account/orders/:ref` (both views return null when the pathname matches; the
pathname is already in the account family's data). The page starts with
"‹ All orders", then the reference as the page title, the status pill, and
"Placed 4 October 2026".

**Payment needed (`OrderBalance`).** Shown only while money is owed. One card,
visually the strongest thing on the page:

- eyebrow "Payment needed", the amount due large, the pay-by deadline when the
  shop runs one;
- the body is `PaymentSection`: choose a method, or the open hosted checkout
  button, or the crypto address card, or "we're checking your payment", plus
  "Change payment method";
- under a divider, the quiet text button "Cancel order" (or, when cancelling is
  blocked, the existing "contact us" line with the support links).

States the card must cover: loading (skeleton, never a bare figure), payment
state failed to load (message + Try again), cannot be paid online (the existing
`account.order.payHelp` copy + support links), cancelled / refunded (card not
shown; the status pill says it).

Once the order is paid the card is gone and the page leads with the status.

**Details.** `OrderItems`: lines with quantity × price, promotions, then the
totals with the grand total emphasised. `OrderAddress`: "Delivery address", or
"Collect from" with the point's name and address for a collection order; draws
nothing when the order has no address. `OrderParcels`: carrier, tracking number,
status pill, latest tracking line, "Track parcel". `OrderPayments`: the payment
history, last and visually quiet (method, date, amount, status in plain words).

**Layout.** Mobile: single column in the order above, so paying comes first.
From 62em: two columns. The main column holds the payment card and the items;
the side column holds address, parcels and payment history. The container sorts
parts into the two columns by type, so a stored arrangement gets the same
layout. When the side column would be empty the main column takes the full
width. Cards use the existing `data-sf-part="card"` and `button` hooks and the
`--sf-*` tokens, so each template's own radius, borders, shadows and type apply;
no template gets order-specific CSS unless the browser check shows it needs it.

**Arriving to cancel.** The pop-up no longer cancels, so there is no
"open the cancel modal on arrival" path. Cancel is one tap on the page.

### 6. Cancel confirmation

`CancelOrder` keeps its trigger and its refusal handling; the inline panel is
replaced by a Mantine `Modal`: centred, `withCloseButton={false}`,
`closeOnClickOutside={false}`, `closeOnEscape={false}` while the request runs.
Title "Cancel order K4M2QP?", one line saying what happens, then two full-width
buttons on mobile (side by side on desktop): "Keep order" (default focus) and
"Yes, cancel order" (danger). Escape means "Keep order". While cancelling, both
buttons are disabled and the danger button reads "Cancelling…". On success the
modal closes, a notification confirms, and the page refetches into its cancelled
state. A refusal closes the modal and shows the reason on the page and as a
notification, as today.

### 7. The pop-up

- Signed-in customers only. The guest branch, the saved-orders lookups and
  `fromPublic` are deleted.
- Content: title, "Order K4M2QP is waiting for payment.", the amount, primary
  button "Review or cancel order" → `/account/orders/:ref`, secondary "Not now".
  With more than one unpaid order the existing "see all" link stays.
- "Not now" and the close button set a module-level flag instead of
  `sessionStorage`: the pop-up stays away while the customer moves around the
  site and returns on the next full page load. In the Telegram Mini App that is
  each time the app is opened.
- The dialog no longer renders `CancelOrder`, so the nested-dialog workarounds
  (`data-mantine-stop-propagation`) go.
- Still suppressed on checkout, payment, login and order pages, in the builder,
  and while the sign-in dialog or cart drawer is open.

## Out of scope

- Any change to `ecommerce-menu`, the backend's key-based order API, order
  emails or payment return URLs.
- Keeping orders payable while the shop is closed.
- Guest checkout with accounts switched off (keeps today's order-placed page).
- Turning off or redesigning guest checkout.

## Testing and verification

Backend: unit tests for the four routes' middleware chain and ownership (same
404 for unknown and foreign references); the PGlite integration suite extended
to drive the session routes through the same cases as
`payment-names.integration.test.ts`; a test that the detail's address never
carries raw service point columns.

Storefront: unit tests for the outcome table, the pop-up rules (returns after a
reload, signed-in only), the cancel modal (cannot be dismissed except by its two
buttons, Escape keeps), the order page states listed in section 5, and the
tolerated stale stored pages. Contract tests updated for one fewer page type and
block family and one new part; goldens and DOM baselines for the order page
regenerated and the diff read; `blocks.json` regenerated. `TZ=UTC npm test`
before tagging.

Browser check (Playwright against `e2e/mocks.ts`, session routes added to the
mocks): four templates × three layouts × 390 px and 1280 px, for unpaid with no
method, unpaid with hosted checkout open, unpaid crypto, paid and shipped with
two parcels, collection-point order, cancelled. Screenshots reviewed, not just
captured. The cancel modal and the pop-up are exercised in the same run.

Not verified by this work: real payment processors (never create gateway
payments against the dev database), and the live Telegram Mini App.

## Release

Backend first, then the storefront (version bump commit and tag). No admin SPA
change.
