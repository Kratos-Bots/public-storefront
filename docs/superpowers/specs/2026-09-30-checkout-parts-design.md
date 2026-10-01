# Checkout and order status as parts — design (stage 5 of "everything editable")

Date: 2026-09-30. Status: written for review; no code yet.
Repos: `ecommerce-storefront` only (lead and sole code change). `ecommerce-backend` and
`ecommerce-admin-frontend` need **no change** (§11). Branch `feature/puck-editable`.
Initiative overview and cross-stage rules:
[`2026-09-30-puck-editable-overview.md`](2026-09-30-puck-editable-overview.md). Builds on
[`2026-09-29-puck-page-builder-design.md`](2026-09-29-puck-page-builder-design.md) (§13 wins over
its §1–12), stage 1 ([`2026-09-30-editable-text-design.md`](2026-09-30-editable-text-design.md)),
stage 2 ([`2026-09-30-block-styling-design.md`](2026-09-30-block-styling-design.md)), stage 3
([`2026-09-30-product-parts-design.md`](2026-09-30-product-parts-design.md) — its container / part
contract §3 is reused **exactly**, with the three additive extensions in §3.2 here) and
[`../../builder.md`](../../builder.md). Stage 4 (header, cart, account and simple order pages) has
its own spec; nothing here depends on a stage-4 family, only on the pattern both share.
Examples use the fixture store "Northbound Supply" at `shop.example`.

## 1. Goal

The checkout and the shared order-status page stop being sealed boxes. An owner can reorder the
checkout's steps within a locked safe order, move the discount-code box and the order-notes box,
remove the optional pieces, put their own content before, between and after the sections and
cards, and style each piece — and none of it can produce a checkout that takes an order without
an address, a delivery choice, a payment choice or a visible total, or an order page that hides
how to pay while money is owed. With nothing published, both pages are byte-for-byte what v0.7.0
renders.

## 2. Decisions

**U** = the user's decision (binding). **D** = this spec's decision, with its reason.

| # | Decision | By |
|---|---|---|
| 1 | **Checkout too.** Owners can reorder, hide and add content between checkout sections and order-status cards. | U |
| 2 | **Locked safe order.** Payment always comes after address and shipping; the place-order action is always last; required fields and sections can't be hidden. ("Riskier: these carry payment logic, so steps would stay in a safe order.") | U |
| 3 | **Container + parts, as stage 3.** `CheckoutFlow` and `OrderStatus` stay route blocks and become containers. The container owns *every* piece of state and behaviour (form, persistence, validation, quote, Turnstile, submit latch, 409 lock, redirect, Telegram MainButton; order query, polling, saved-order, document title). Parts only render, reading the container's context. | D — §3.1 |
| 4 | **A checkout step is a part.** Five required step parts (`CheckoutContact`, `CheckoutAddress`, `CheckoutShipping`, `CheckoutPayment`, `CheckoutReview`) each own their fields *and* two slots (`before`, `after`) for content and the movable optional parts. The fields inside a step are fixed. | D — §5.1: fields never leave the step that validates them |
| 5 | **Exactly four legal step orders.** Review last; address → shipping → payment in that order; contact anywhere before review. Checked by a rule (`part-order:CheckoutFlow`) that falls back to the default document, and made unreachable in the editor (steps are not draggable; a Step order control offers only legal moves). | U #2 made precise — §4.2 |
| 6 | **Steps only; no single-page mode** this stage. One step shows at a time exactly as today, in the owner's order. | D — §6 |
| 7 | **The action band, the terms line, the alerts and the Turnstile widget are container-owned, not parts.** They are what "place order last" and "legal notices can't be hidden" mean; making them movable parts would add rules and no owner value. Owners can put content *after* them (the `after` slot). | D — §5.1 |
| 8 | **Optional form parts are ignored when absent.** With no `CheckoutCoupon` (or `CheckoutNotes`) rendering, the container sends no coupon code (no notes) and prices without one, even if the shopper's persisted form still holds one. No part that feeds the order body may be hidden per width. | D — §7.3: no invisible values on an order |
| 9 | **Order status: payment first, always.** `OrderStatusPayment` is required, lives only in the action column and precedes every other order card there. It stays **one** part (deadline, method picker, hosted checkout, pending note, crypto cards, change-method panel), because the change panel and the crypto card share state that keeps a shopper from paying a payment about to be replaced. | D — §5.2 |
| 10 | **Old documents are upgraded in memory** (stage 3 §8): an absent slot gets the container's (or part's) default. v0.7.0 `CheckoutFlow` and `OrderStatus` have no legacy props, so the default is the whole of today's page. | Overview rule 4 |
| 11 | **No new text key, no new shopper string.** Every part reuses the keys the monolith rendered. | Overview rule 2 |
| 12 | **No backend or admin change.** Slots are ordinary nested component arrays the backend already walks generically; the admin diff compares whole documents. | D — §11 |

## 3. Pattern

### 3.1 Why container + parts again

The alternatives stage 3 rejected are worse here, not better. Free-standing blocks would each need
the form state, the quote and the submit; a checkout whose submit lives in one block and whose
fields live in others is a checkout whose validation and body can drift apart. An "order" prop on
the monolith could not hold content between steps or style one step. With a container that owns
state and parts that only render, **an arrangement changes what a shopper sees, never what an
order does**: the request body, the validation, the quote key, the Turnstile token handling, the
submit latch, the redirect and the MainButton are the same code whatever the document says.

Part *views* are today's feature components (`ContactStep`, `PaymentSection`, …) moved into
`features/checkout/checkout-parts.tsx` and `features/order-status/order-status-parts.tsx`, both in
the containers' existing lazy chunks (stage 3 §3.3). A view may contain the feature logic it has
today — `PaymentSection`'s `MethodPicker` still runs its payment-options query and selection
mutation, as `ProductAddToCart` still mutates the cart — but a *part block* has no props an owner
can set other than `blockStyle`, so no document can reach that logic.

### 3.2 Contract extensions (additive to stage 3 §3.2, `web/src/builder/parts.ts`)

```ts
export type PartFamily = 'product' | 'catalogue' | 'card-tile' | 'card-row' | /* stage 4 … */ 'checkout' | 'order-status';

export type SlotRef = `${string}.${string}`;          // "<Block>.<slot>"

export interface ContainerSpec {
  /* …stage 3 fields unchanged… */
  /**
   * Where each part of the family may live: the slot of its nearest family ancestor (the container,
   * or a part that has slots), reached through any content blocks. A part not listed may live in
   * any slot of its container (stage 3 behaviour).
   */
  homes?: Readonly<Record<string, readonly SlotRef[]>>;
  /** Ordering constraints over the container's cleaned slots; null when legal. */
  order?: (slots: Readonly<Record<string, readonly ComponentData[]>>, props: Record<string, unknown>) =>
    { message: string; blockId?: string } | null;
  /** Parts that may never sit under a block with `blockStyle.hide` (required parts are always included). */
  noHide?: readonly string[];
}

// define.ts — BlockDef.part gains, for parts that have slots:
part?: { family: PartFamily; defaultSlots?: (props: Record<string, unknown>, ctx: { layout: LayoutKind; id: string }) => Record<string, ComponentData[]> };
```

- `homes` refines stage 3's `part-placement` (nearest *container*) with the nearest *family
  ancestor and slot*. It is what keeps the coupon out of the contact step and the payment card out
  of the summary column.
- `order` is a pure function per container; the rule id is `part-order:<Container>`.
- `noHide` feeds stage 2's `hidden-required` (which already reads the required-part tables).
- `part.defaultSlots` lets `upgradeDoc` (stage 3 §8) fill an absent slot of a *part* the same way
  it fills a container's: it walks every component whose block declares `container` **or**
  `part.defaultSlots`. A slot that is present, even `[]`, is never touched.

Everything else — `PartHost`, `createFamily`, `slotShows`, `containsType`, `SlotRender.items`,
views through context, per-container-instance counting, `part-required`, `part-unique`,
`part-placement`, `slot-accepts`, the id scheme `${id.slice(0, 40)}-${partKey}` — is stage 3's,
unchanged.

### 3.3 Placement

`allowedOn(part, docKey)`: `checkout` family → `checkout`; `order-status` family → `order-status`.
Inside these two containers the only non-part blocks allowed are **content** blocks (category
`content`). Catalogue and commerce blocks are refused (`slot-accepts`): an add-to-cart inside the
checkout would re-price the order mid-form, and a product card inside the order page invites a
second purchase flow on a page whose job is paying for this one.

## 4. Rules

### 4.1 Required, unique, homes, no-hide

Every part of both families is `unique`.

| Container | Part | Required | Home(s) | Why |
|---|---|---|---|---|
| `CheckoutFlow` | `CheckoutHeading` | yes | `CheckoutFlow.head` | the page's only `h1` |
| | `CheckoutProgress` | no | `CheckoutFlow.lead` | navigation aid only; Back and the review's Change links remain |
| | `CheckoutContact` | yes | `CheckoutFlow.steps` | who the order is for; the guest identity floor (email or phone) |
| | `CheckoutAddress` | yes | `CheckoutFlow.steps` | where it goes; the country drives the quote |
| | `CheckoutShipping` | yes | `CheckoutFlow.steps` | the delivery option the order is priced with |
| | `CheckoutPayment` | yes | `CheckoutFlow.steps` | the method the charge total depends on |
| | `CheckoutReview` | yes | `CheckoutFlow.steps` | the last look; the place-order step |
| | `CheckoutCoupon` | no | `CheckoutShipping.before/after`, `CheckoutPayment.before/after`, `CheckoutReview.before/after`, `CheckoutFlow.aside` | never before a quote can exist (§7.3) |
| | `CheckoutNotes` | no | `before`/`after` of any of the five steps | no quote dependency |
| | `CheckoutSummary` | yes | `CheckoutFlow.aside` | no one should place an order without seeing the total; its phone collapse and "open on review" belong to the aside |
| `OrderStatus` | `OrderStatusHero` | yes | `OrderStatus.top` | the page's only `h1`; the order's state |
| | `OrderStatusPayment` | yes | `OrderStatus.action` | the only thing on the page the customer can still change; payment actions while unpaid |
| | `OrderStatusShipments` | yes | `OrderStatus.action`, `OrderStatus.summary` | the page's second job: where the parcel is |
| | `OrderStatusItems` | yes | `OrderStatus.action`, `OrderStatus.summary` | what the total is made of (fees, discounts) |
| | `OrderStatusAddress` | no | `OrderStatus.action`, `OrderStatus.summary` | informational |
| | `OrderStatusFooter` | yes | `OrderStatus.bottom` | the only visible order reference, and the support contact for this order |

`slotAccepts`: `CheckoutFlow.steps` accepts **only** the five step parts (a content block between
two steps would render inside every step's card). `CheckoutFlow.after` accepts content only.

`noHide`: checkout — every required part plus `CheckoutCoupon` and `CheckoutNotes` (they feed the
order body; §7.3). Order status — every required part. So in checkout only `CheckoutProgress` and
content blocks accept `hide`; on the order page only `OrderStatusAddress` and content blocks.

### 4.2 The locked orders

**Checkout** (`CheckoutFlow.container.order`), over the step kinds in `steps`, in stored order:

1. `CheckoutReview` is last.
2. `CheckoutAddress` < `CheckoutShipping` < `CheckoutPayment`.
3. `CheckoutContact` anywhere before `CheckoutReview`.

That admits exactly four orders — Contact·Address·Shipping·Payment·Review (default),
Address·Contact·Shipping·Payment·Review, Address·Shipping·Contact·Payment·Review,
Address·Shipping·Payment·Contact·Review. Reasons: shipping options only exist once the country
(address) is known; the charge total depends on the shipping option; the review recaps
everything and carries the place-order action, which is therefore always last. Contact depends on
nothing and nothing depends on it before submit, so it floats. Messages: "Payment must come after
the Delivery address and Delivery steps." / "The Review step must be last — it holds Place order."

**Order status** (`OrderStatus.container.order`): inside `action`, no `OrderStatusItems`,
`OrderStatusAddress` or `OrderStatusShipments` may come before `OrderStatusPayment` (content
blocks may). Because `action` renders before `summary` on every width (side by side on desktop,
stacked on phones), this puts payment ahead of every other order card in reading order. Message:
"Payment must come before tracking and the order details."

### 4.3 Rule ids added

| Rule id | Meaning |
|---|---|
| `part-home:<Part>` | the part's nearest family ancestor slot is not one of its homes |
| `part-order:CheckoutFlow` / `part-order:OrderStatus` | §4.2 |
| `hidden-required:<Block>` (stage 2, extended) | a block with `hide` contains, at any depth inside the container, a `noHide` part |

Plus stage 3's `part-required`, `part-unique`, `part-placement`, `slot-accepts`, each per
container instance. Any of them ⇒ the guard renders the route's **default** document for
shoppers, and the editor lists a blocking issue.

## 5. The parts

### 5.1 Checkout (`family: 'checkout'`, container `CheckoutFlow`)

Container slots: `head`, `lead`, `steps`, `after`, `aside`. Page surface (every layout):

```
{empty cart / guest-unavailable → EmptyState, unchanged, before any slot}
<div class="page">                                         ← container
  {head()}                                                 bare
  <div class="grid">
    <div>
      {lead()}                                             bare
      <div key={step} class="card FADE" ref data-sf-part="card">   ← container
        <header class="cardHead"> count · h2 title of the active step </header>
        {alerts: page quote error · verify error + Try again · submit error · verifying}
        {steps()}                                          bare — only the active step renders
      </div>
      {nav: Back · Continue | Place order}                 ← container (omitted in Telegram on step 1, as today)
      {onReview ? <p class="terms"> : null}                ← container
      {after()}                                            bare
    </div>
    {aside({ className: aside, as: 'aside' })}
  </div>
  {guest && turnstile ? <GuestTurnstile/> : null}          ← container
</div>
```

Each step part's view returns `null` unless its kind is the active one, so `steps()` renders one
step exactly where v0.7.0's `step === n ? <XStep/> : null` chain did.

| Part | View (DOM = v0.7.0) | Slots |
|---|---|---|
| `CheckoutHeading` | `<header class="head">` eyebrow + `h1` (guest / signed-in title) | — |
| `CheckoutProgress` | the Mantine `Stepper` (`data-sf-part="stepper"`), labels in the owner's step order, `active` / `onStepClick` from context | — |
| `CheckoutContact` | `<div class="step">` → `{before()}` blurb, name pair, email, phone, guest sign-in line `{after()}` | `before`, `after` |
| `CheckoutAddress` | `<div class="step">` → `{before()}` blurb, lines, city/zip, county, country, quote notice `{after()}` | `before`, `after` |
| `CheckoutShipping` | `<div class="step">` → `{before()}` `<div class="section">` options + errors `{after()}` | `before`, `after` (default `after`: [`CheckoutCoupon`]) |
| `CheckoutPayment` | `<div class="step">` → `{before()}` store credit, methods, crypto combos, errors, offline note `{after()}` | `before`, `after` |
| `CheckoutReview` | `<div class="step">` → `{before()}` blurb, recap slips `{after()}` | `before`, `after` (default `after`: [`CheckoutNotes`]) |
| `CheckoutCoupon` | `<div class="section"><CouponField/></div>` | — |
| `CheckoutNotes` | `<TextareaField>` notes, 500-char counter | — |
| `CheckoutSummary` | `<QuoteSummary>` (docket; `defaultOpen` on the review step) | — |

`before` / `after` render bare inside the step's `div.step` (a flex column with today's gap), so
content blocks there are spaced like the fields. Both are empty in the default arrangement, which
therefore renders `div.step`'s children exactly as today.

**Default arrangement** (`CheckoutFlow.container.defaultSlots`, identical in every layout):
`head` [Heading] · `lead` [Progress] · `steps` [Contact, Address, Shipping{after: [Coupon]},
Payment, Review{after: [Notes]}] · `after` [] · `aside` [Summary].

**Container-owned pieces (never parts):** the empty-cart and guest-unavailable states; the card
wrapper with its step count, `h2` step title, the four alerts and the scroll-into-view ref; the
action band (Back, Continue, Place order with the total and the template's `ButtonAdornment`
slot); the terms line on the review step; `GuestTurnstile`; `usePrimaryAction` (the Telegram
MainButton). Their markup, conditions and keys are today's.

**What the container derives from the arrangement** (once per render, from `SlotRender.items`):

```ts
order: StepKind[];            // kinds in `steps` order — guaranteed legal by the guard
couponShown: boolean;         // containsType(visible slots, 'CheckoutCoupon')
notesShown: boolean;          // containsType(visible slots, 'CheckoutNotes')
```

and today's code changes only where it hard-coded the sequence:

- `STEPS[i]` → `STEP_META[order[i]]` (label + title keys per kind; count total = `order.length`,
  always 5).
- `validate(index)` → `validate(kind)` — the same five branches, selected by kind instead of
  position; `next()` validates `order[step]`.
- `submit()` re-checks `order.slice(0, -1)` in the owner's order and returns to the first failing
  step, as today.
- `ReviewStep`'s `onEdit(n)` → `onEdit(kind)` → `goTo(order.indexOf(kind))`; the recap slips are
  listed in `order` (so the default shows Contact, Address, Shipping, Payment as today).
- `lastStep` / `onReview` compare against `order.length - 1` (unchanged value).
- The *effective* form used for the quote, the guest quote key, `classifyQuoteError` and
  `buildBody` is `{ ...form, couponCode: couponShown ? form.couponCode : '', notes: notesShown ? form.notes : '' }`
  (§7.3). The persisted form keeps what the shopper typed, so re-adding a part restores it.

### 5.2 Order status (`family: 'order-status'`, container `OrderStatus`)

Container slots: `top`, `action`, `summary`, `bottom`.

```
{no ref/key or invalid link → InvalidLinkScreen · network error → NetworkErrorScreen · loading → LoadingScreen, unchanged}
<div class="page[ pageWide]">                               ← container
  {top()}                                                  bare
  <div class="layout[ layoutWide]">
    {action({ className: column })}
    {summary({ className: column })}
  </div>
  {bottom()}                                               bare
</div>
```

Both column elements always render, as today. **Wide layout** ⇔ `actionShows && summaryShows`,
where `xShows = slotShows(x.items, silent)` and `silent` is computed from the order:
`OrderStatusPayment` when `!(payment?.canPay || visibleCryptoPayments(order).length > 0)`,
`OrderStatusShipments` when there are no shipments, `OrderStatusAddress` when there is no shipping
address; `OrderStatusItems` and content blocks are never silent. With the default arrangement
`summaryShows` is always true (items), so wide ⇔ today's `hasActions`.

| Part | View (DOM = v0.7.0) | Target |
|---|---|---|
| `OrderStatusHero` | `<section class="hero FADE">` eyebrow, `h1`, detail, date stamp, pre-order flag, route or terminal notice | root |
| `OrderStatusPayment` | `PaymentSection` — deadline, choose-method card with `MethodPicker`, hosted-checkout card, pending card, crypto cards (`CryptoPaymentCard`), change-method disclosure; a fragment | wrap |
| `OrderStatusShipments` | one `ShipmentCard` per shipment (index / count from the order); a fragment, nothing with no shipments | wrap |
| `OrderStatusItems` | `ItemsCard` — lines and totals in the order's currency | root |
| `OrderStatusAddress` | `AddressCard`; nothing without an address | root |
| `OrderStatusFooter` | `<footer class="hero">` reference, "questions?", `ContactLinks` with the order prefill | root |

**Default arrangement:** `top` [Hero] · `action` [Payment, Shipments] · `summary` [Items, Address] ·
`bottom` [Footer] — v0.7.0's order exactly.

The container keeps the public-order query (polling interval, background refetch), the
`document.title` effect, `saveOrder`, and the three state screens. Parts read
`{ order, reference, accessKey }` from context. Why the payment part is not split further:
`PaymentSection`'s `changing` state hides the active payment's crypto card and hosted-checkout card
while the change panel is open; splitting the crypto card out would need that state lifted into
the container and a rule tying the two together, to allow a rearrangement ("crypto address below
the tracking card") that the safety order forbids anyway. `StatusHero` stays one part for the same
reason: its route milestones hide while payment is owed.

## 6. Step mode, and why not single-page

Checkout stays a stepper: one card, one step at a time, in the owner's legal order. A single-page
mode is a non-goal of this stage because it is a different checkout, not a rearrangement: it needs
whole-form validation with scroll-to-first-error across sections, a different home for quote
errors (today each step owns the errors of its inputs), a different MainButton contract in
Telegram (no Continue), a new DOM with its own parity baseline and every checkout e2e rewritten.
The step parts' `before` / `after` slots already give owners what a long page would mostly be used
for — reassurance copy next to the right fields.

## 7. Interactions

### 7.1 Telegram web app and phones

- The MainButton contract is unchanged: Continue on every step but the last, Place order (with
  the total) on the review step, disabled while submitting / locked / verifying. Step parts
  cannot reach it.
- The action band stays sticky at the foot on phones and is omitted on the first step inside
  Telegram, whichever kind the first step is. Content in `after` renders below it; the band stays
  sticky while the main column is in view, as the terms line does today.
- The aside keeps `order: -1` below 62em: on phones the summary — and any content or coupon the
  owner put in the aside — sits above the form. The editor says so on the aside (§10.4).
- Content blocks follow the block contract (44 × 44 targets, no overflow at 360 px); the step's
  inputs keep 16 px (no part with an input offers `textSize`).

### 7.2 Guests, Turnstile and the quote

Nothing in the guest path reads the arrangement except the effective form (§5.1): the quote key,
the mint-per-quote effect, the retry, the "Verifying…" state and the token on submit are
container code, unchanged. A token is never spent on a coupon the shopper can't see.

### 7.3 Removed or hidden form parts

The shopper's form persists in `localStorage` and outlives any one arrangement. If an owner removes
the coupon box, a shopper who applied a code last week would otherwise be priced (or refused with
a 422 attributed to the coupon) through a field that no longer exists, with no way to clear it.
Hence: `couponShown` / `notesShown` are computed from the *visible* slots (a part in a hidden
`Columns` column counts as absent), absent ⇒ ignored in the quote and the body; and neither part
may be hidden per width (`noHide`), because a width-hidden coupon with an error would strand phone
shoppers the same way. The coupon may only live where a quote can exist (§4.1), so its feedback
always appears next to it.

### 7.4 SEO, metadata, loading

`CheckoutHeading` and `OrderStatusHero` are required, so each page keeps exactly one `h1`. The
order page's `document.title` stays in the container. Only containers show loading, empty, error
and invalid-link states, before any slot renders. The order-status root `chrome: 'none'` is
unchanged.

## 8. Old documents — upgrade in memory

A v0.7.0 (or stage 1–4) document stores `{ "type": "CheckoutFlow", "props": { "id": … } }` and
`{ "type": "OrderStatus", "props": { "id": … } }` with no slot keys. Stage 3's `upgradeDoc` fills
every absent slot from `defaultSlots` (and, with §3.2, every absent slot of a slotted part from
`part.defaultSlots`), in the guard before cleaning and in the editor's load before Puck sees the
document. There are no legacy props. A document that stored `blockStyle` on the monolith keeps it
on the container (still a `wrap` target with BOX keys). A rollback to v0.7.0 strips the slot props
(`z.object`) and renders the monoliths.

## 9. Styling (stage 2) and text (stage 1) per part

Key sets as stage 2: **BOX**, **TEXT** (`fg textSize align`), **VIS** (`hide`). Required and
`noHide` parts never take `hide`. Parts containing inputs never take `textSize` (inputs stay
16 px). Shared components that become a part's root gain `rootAttrs?: StyleAttrs` spread on their
root (`TextareaField`, `QuoteSummary`, `ItemsCard`, `AddressCard`, `StatusHero`); the Mantine
`Stepper` takes the attributes through its root props. The two `wrap` parts sit in a flex column;
`OrderStatus.module.css` gains `.column > [data-sf-style="OrderStatusPayment"],
.column > [data-sf-style="OrderStatusShipments"] { display: flex; flex-direction: column; gap: <the column's gap> }`
so a styled run keeps today's spacing between its cards. TEXT parts switch their module CSS to
`var(--sf-block-fg, <today>)` and `calc(<today> * var(--sf-text-scale, 1))` (unset ⇒ today).

| Part | Target | Keys | Text patterns (`BlockDef.text`) |
|---|---|---|---|
| `CheckoutHeading` *(req.)* | root | BOX + TEXT | `checkout.page.eyebrow`, `.title`, `.guestTitle` |
| `CheckoutProgress` | root (Stepper) | BOX + VIS | `checkout.steps.contact`, `.address`, `.shipping`, `.payment`, `.review` |
| `CheckoutContact` *(req.)* | root (`div.step`) | BOX | `checkout.contact.*`, `checkout.field.*`, `checkout.phone.*`, `common.actions.signIn` |
| `CheckoutAddress` *(req.)* | root | BOX | `checkout.address.*`, `checkout.field.*` |
| `CheckoutShipping` *(req.)* | root | BOX | `checkout.shipping.*`, `checkout.quote.*`, `checkout.errors.stillPricing`, `.shippingStale` |
| `CheckoutPayment` *(req.)* | root | BOX | `checkout.payment.*`, `checkout.quote.*`, `checkout.errors.stillPricing`, `.paymentMissing`, `.methodStale`, `.comboStale` |
| `CheckoutReview` *(req.)* | root | BOX | `checkout.review.blurb`, `.change`, `.notChosen`, `checkout.steps.contact`, `.addressTitle`, `.shipping`, `.payment`, `common.totals.storeCredit` |
| `CheckoutCoupon` | root (`div.section`) | BOX | `checkout.coupon.*`, `common.status.*` |
| `CheckoutNotes` | root (via `TextareaField`) | BOX | `checkout.review.notes`, `.notesPlaceholder`, `checkout.field.*` |
| `CheckoutSummary` *(req.)* | root (via `QuoteSummary`) | BOX | `checkout.summary.*`, `checkout.shipping.*`, `cart.summary.items`, `common.totals.*`, `common.product.*` |
| `OrderStatusHero` *(req.)* | root | BOX + TEXT | `order.hero.*`, `order.status.*`, `order.steps.*`, `order.dates.*`, `common.dates.*`, `common.shipment.*` |
| `OrderStatusPayment` *(req.)* | wrap | BOX | `order.payment.*`, `order.method.*`, `order.crypto.*`, `order.errors.*`, `order.copy.*`, `common.actions.*`, `common.contact.*` |
| `OrderStatusShipments` *(req.)* | wrap | BOX | `order.shipment.*`, `common.shipment.*`, `order.dates.*`, `common.dates.*`, `order.copy.*`, `common.actions.*` |
| `OrderStatusItems` *(req.)* | root | BOX + TEXT | `order.items.*`, `common.totals.*`, `common.product.*` |
| `OrderStatusAddress` | root | BOX + TEXT + VIS | `order.address.*` |
| `OrderStatusFooter` *(req.)* | root | BOX + TEXT | `order.footer.*`, `common.contact.*` |

Containers narrow their own `text` to what they still draw: `CheckoutFlow` — `checkout.page.eyebrow`,
`.emptyTitle`, `.emptyBody`, `.guestUnavailableTitle`, `.guestUnavailableBody`, `.verifying`,
`.terms`, `checkout.steps.count`, the five `checkout.steps.*Title` keys, `checkout.actions.*`,
`checkout.errors.*`, `common.actions.*`, `common.totals.*` (the total in Place order);
`OrderStatus` — `order.documentTitle`, `order.screens.*`, `order.link.*`, `common.actions.tryAgain`,
`common.contact.*`. The stage-1 coverage test keeps proving every key is covered by some block.
`data-sf-part` attributes (`stepper`, `card`, `button`) stay on the same elements; template CSS is
unaffected by the default arrangement.

## 10. Editor

### 10.1 Palette and drop targets

Drawer categories "Checkout parts" and "Order status parts", shown only on their documents.
`buildEditorConfig` sets Puck `allow` lists from `homes` + §3.3: e.g. `CheckoutContact.before`
allows content and `CheckoutNotes` but not `CheckoutCoupon`; `CheckoutFlow.steps` allows the five
step types only; `OrderStatus.action` allows content, Payment, Shipments, Items, Address. Puck
cannot restrict its root zone or see a part nested inside a dragged `Columns`, so the editor also
checks every `insert` / `move` action (Puck `onAction`): if the resulting document has a
`part-home`, `part-placement` or `part-order` issue that the previous one did not, the editor
restores the previous data in the same tick and shows the rule's message as a toast
("Discount code can't go in the Your details step — no prices exist there yet."). Nothing illegal
reaches autosave through the canvas; a stored document (older editor, API) that is illegal shows
its blocking issue with a **Reset step order** / **Reset arrangement** quick fix.

Decided: the guard covers every family and all five arrangement rules (`part-home`, `part-placement`,
`part-order`, `slot-accepts`, `slot-rejects`) for the four action kinds insert, move, reorder and
replace. A second violation of a rule id already present in a stored document is tolerated in the
editor (publish stays blocked). The first Undo after a reverted drop is a no-op, because the revert
is itself recorded as one history step.

### 10.2 Locks and the Step order control

- The five step parts: `permissions: { delete: false, duplicate: false, drag: false }`. Steps are
  reordered **only** in the `CheckoutFlow` panel's **Step order** list: five rows with ↑ / ↓,
  every move that would break §4.2 disabled with its reason as the tooltip ("Delivery needs the
  address first"). Review has no arrows ("Always last — it holds Place order").
- Other required parts (`CheckoutHeading`, `CheckoutSummary`, the five required order-status parts):
  `delete: false, duplicate: false`; they may be dragged within their homes.
- Every other part: `duplicate: false`.
- The container panels keep stage 3's **Parts** list (Add a removed optional part at its default
  place) and **Reset arrangement** (one undo step).

### 10.3 Canvas and previews

- **Checkout canvas** (`editing: true`) renders **every step stacked**, each in its own card with
  its step head, in the owner's order, so each step's `before` / `after` slots are droppable and
  the whole flow is visible; one inert copy of the action band (buttons `inert`, no handlers)
  follows the last card, then the terms line and `after`. Alerts and the Turnstile widget are not
  mounted on the canvas. The **exact preview** (`editing: false`) is the real stepper.
- The checkout document always previews as a **signed-in shopper with the sample cart**
  (`FIXTURE_CART_LINES`, `FIXTURE_QUOTE`), whatever the header's Preview-as says; the header shows
  "Checkout previews signed in with a sample cart." The guest-only line ("Have an account? Sign in")
  is listed in the Contact step's panel. Placing an order or selecting a payment in the editor is
  refused by the fixture API ("Preview only — nothing was sent."), as today.
- **Order status: Preview order** control in the header on that document, with six Northbound
  Supply fixtures in `editor/fixtures.ts` served for `NB0977` by the fixture API: *Awaiting payment*
  (`canPay`, a pay-by deadline, method picker), *Hosted checkout open*, *Crypto sent, checking*,
  *Shipped* (today's fixture), *Two parcels*, *Cancelled*. Owners see the payment card, the wide
  and single-column layouts and the terminal state they are arranging around.

### 10.4 Notices and issues (editor-only copy)

- Aside: "On phones this column shows above the form."
- `after`: "Shows under the Place order button on the review step, and under Continue on the others."
- Content placed before `OrderStatusPayment` in the action column: a non-blocking hint "Customers
  who still owe payment see this before how to pay."
- Removing `CheckoutCoupon`: "Shoppers can't enter discount codes; a code saved in a shopper's
  browser is ignored."
- Every rule in §4 shows in the header's issue list, highlighted on its block, and blocks Publish.

Everything above lives under `web/src/builder/editor/`; the builder-isolation check is unchanged.

## 11. Backend and admin — no change

- **Backend.** The page-set walk is generic over nested component arrays: component shape, type
  regex, id length, depth, `blockStyle`, HTML sanitising, link props all apply to the new slots
  already. Sizes: the default checkout grows from 1 to 11 components and depth 3 (flow › step › coupon; 4
  with an owner `Columns` around the coupon), the order page from 1 to 7 — far inside the
  2 000-component, depth-12 and 512 KB caps. The checkout and order contracts the storefront calls
  (`POST storefront/checkout/quote|guest/quote`, `POST storefront/checkout|guest`, `GET
  orders/:ref/:key`, `payment-options`, method selection, txid submission) are unchanged in shape
  and use: the body is built by the same function from the same fields.
- **Admin.** The protocol mirror is loose; `diffPageSets` compares whole documents, so an
  arrangement edit shows as "Edited" on Checkout / Order status link and enables Publish. Block
  names never appear in admin labels. Usual gates only (build, lint vs baseline, mocked Pages pass).
- **Protocol** stays `1`; `web/public/blocks.json` is regenerated with the new parts.

## 12. Parity gate

With no published set (or one that never touches these routes), both pages render their default
arrangement and:

1. The only elements a container adds are today's: `div.page`, `div.grid`, the unnamed column
   `div`, the card, the nav, the terms line, `aside.aside` (via `SlotRender({ className, as })`);
   `div.page[.pageWide]`, `div.layout[.layoutWide]`, two `div.column`. Every other slot renders bare.
2. Conditional classes come from today's conditions (`pageWide` / `layoutWide` ⇔ `hasActions` in
   the default arrangement).
3. Views are the v0.7.0 JSX moved verbatim, including `null` returns, fragment boundaries, `key`s,
   `aria-*` and `data-sf-*` attributes, class-string construction.
4. An empty slot (the steps' `before` / `after`, the flow's `after`) renders nothing.

Gates:

- `e2e/dom-parity.spec.ts` (`checkout` × 3 layouts, `order-status` × 3 layouts) passes **with no
  snapshot regenerated**; the rest of the suite (including `telegram-webapp.spec.ts`,
  `storefront.spec.ts`, `flows.ts`'s `fillCheckout`) passes unedited.
- dom-parity only sees the first checkout step and one order state, so the **first implementation
  task** captures golden markup from the v0.7.0 components before any refactor
  (`web/test/__golden__/checkout-*.html`, `order-status-*.html`): each of the five steps ×
  {signed-in, guest} × {browser, Telegram}, plus the page quote error, verify error, submit error,
  verifying, empty cart and guest-unavailable states; and the order page in the six §10.3 states
  plus no-address and a pre-v0.7 order without `payment`. A unit test renders the upgraded
  monolith documents through the containers and must match them exactly.
- `templates-baseline*` screenshots unchanged.

## 13. Testing

**Storefront unit (Vitest)** — new `test/builder-checkout-parts.test.ts`,
`test/builder-order-status-parts.test.ts`, plus additions:

- `part-order:CheckoutFlow` over **all 120 permutations** of the five steps: exactly the four of
  §4.2 pass. `part-order:OrderStatus`: shipments / items / address before payment fail; content
  before payment passes.
- `part-home`: coupon in Contact / Address steps fails, in Shipping / Payment / Review / aside
  passes; coupon inside a `Columns` inside the Contact step fails (nearest family ancestor);
  Payment in `summary` fails; Hero outside `top` fails; content in `steps` fails `slot-accepts`.
- `part-required` / `part-unique` for every required part; two `CheckoutNotes` fail.
- `hidden-required`: a hidden `Section` holding `CheckoutCoupon`, `CheckoutSummary`,
  `OrderStatusPayment` each fail; a hidden `Section` holding `CheckoutProgress` or
  `OrderStatusAddress` passes; `hide` on a required part is dropped by the style allowlist
  (`field:` issue).
- Upgrade: bare v0.7.0 documents get the defaults; present `[]` slots untouched; a step part
  stored without `after` gets its `part.defaultSlots`; idempotent; ids ≤ 64 and unique.
- Container logic (React Testing Library, mocked API): `validate` by kind in a rearranged order;
  `submit` returns to the first failing step in owner order; review Change jumps to the right
  step; recap slips follow the order; with no coupon part and a persisted `couponCode`, the quote
  request and the order body carry no coupon; with no notes part, the body carries no notes; the
  wide order layout in each silent combination.
- Contract: every part declares `part.family` and `style` per §9; `noHide` ⊇ required; required
  parts have no `hide`; each container's `defaultSlots` passes its own rules in every layout.
- Text: coverage and orphan tests green with the narrowed container patterns; no new key.

**Storefront e2e (Playwright, mocked; Northbound Supply page sets in `e2e/page-sets.ts`)** — new
`e2e/checkout-parts.spec.ts`:

- **Happy path, rearranged**: order Address · Contact · Shipping · Payment · Review; coupon moved
  to the aside; notes moved to the Payment step's `after`; a `RichText` ("Orders ship from
  Northbound within one working day") in the Shipping step's `before`; a `Heading` in `after`;
  the progress bar hidden below 992 px. The shopper fills each step in that order (a
  `fillCheckout` variant taking the step order), applies the mock's coupon code in the aside, writes a note on
  the payment step, places the order: the posted body carries the address, contact, shipping
  option, crypto combo, coupon and notes, the cart clears and the browser lands on the order page.
  Run in storefront, menu and webapp layouts, at 390 and 1280, and once as a guest (Turnstile
  shim) and once inside the Telegram stub (MainButton Continue ×4 then Place order with the
  total).
- An illegal document (Payment before Shipping) and one missing `CheckoutSummary` each render the
  default checkout.
- Coupon removed + a persisted code in `localStorage`: no coupon in the quote or the body.
- Order page rearranged (Items moved into `action` after Payment, a `RichText` between them,
  Address removed) in the *awaiting payment* state: the payment card is first, choosing a method
  posts the selection; in the *shipped* state the tracking card shows; a document with Shipments
  before Payment renders the default; a hidden `Section` holding Payment renders the default.
- No horizontal overflow at 360 px on every case, under every built-in template.

`builder-editor.spec.ts`: checkout canvas shows five stacked step cards; Step order moves Contact
below Address and the posted change carries the new order; the ↓ on Payment is disabled; a step
has no drag handle; dragging the coupon into the Contact step is refused (allow list) and a
`Columns` holding the coupon dropped there is reverted with the toast; Parts list re-adds Notes on
the Review step; the order page's Preview order switches between *Awaiting payment* and *Shipped*;
opening a v0.7.0-shaped document and editing posts full slots (never `[]`).

No test touches a live database, bucket, bot or deployed storefront. Live verification after
deploy is a pending manual step: on a test layout, rearrange the checkout within the legal orders,
publish, place a real low-value order on a phone and in the Telegram web app, and open its order
link while unpaid and after shipping.

## 14. Security — what an owner cannot do

- **Break or reorder the purchase path.** Steps are all required and only legally ordered (rule +
  editor); the place-order action and the terms line are container-owned and render only on the
  last step; the MainButton is container-owned.
- **Hide a required notice or control.** Required and `noHide` parts accept no `hide`, nothing
  hidden may contain them, and none exposes a setting that makes it render nothing. The terms line,
  alerts, verifying notice, payment deadline, "Payment required" card and cancellation notices are
  inside container-owned markup or required parts. Owners can reword them through stage 1 (never
  to empty — stage 1 stores no empty string); the wording is the shop's responsibility.
- **Change what is charged or sent.** Parts have no props but `blockStyle`; the body, quote key,
  amounts and Turnstile token handling are container code. Optional form parts that are absent
  are ignored rather than silently applied.
- **Hide content behind styling.** Stage 2's keys cannot collapse a box (no height, overflow or
  display keys); low-contrast colour choices get stage 2's contrast hint.
- **Inject behaviour.** Content blocks are the sanitised stage-2 set; no commerce or catalogue
  block may sit inside either container. A link-bearing content block can navigate away from the
  checkout, which already persists the form.
- **Exercise payments from the editor.** Fixture mode refuses every mutation.
- **Expose more of an order.** The order page's parts render only fields the public order response
  already returns to the link holder.

## 15. Delivery

Storefront only, released with the branch as v0.8.0 (clients redeployed from the admin). Backend
first / admin last still holds for the branch as a whole; this stage adds nothing to either. In
order: golden capture (§12); `parts.ts` extensions (`homes`, `order`, `noHide`,
`part.defaultSlots`) + rules + `upgradeDoc`; checkout views + container + parts (dom-parity and the
golden set green before moving on); order-status views + container + parts (same gate); editor
(palette, allow lists, `onAction` revert, Step order control, stacked canvas, Preview order
fixtures, notices). Docs: `docs/builder.md` gains "Checkout and order status parts" (tables of
§4.1, the four legal orders, homes, the effective-form rule); `web/public/blocks.json`
regenerated.

## 16. Non-goals

A single-page checkout; moving, hiding or reordering individual fields (email / phone visibility
stays the shop's contact-mode setting in the admin); custom checkout fields; collection points;
moving the action band, terms line, alerts or Turnstile; content blocks between steps in the
`steps` slot; commerce or catalogue blocks inside either container; editing the Telegram
MainButton; splitting `PaymentSection`, `CryptoPaymentCard`, `MethodPicker` or `StatusHero`;
per-shopper-type (guest / signed-in) arrangements; a guest preview in the editor; the account
order page (`OrderDetail`, stage 4); backend or admin changes.

## 17. Review focus — likely failure modes

1. **Parity leaks** — the step chain (`null` for inactive steps, not an empty element); the card's
   `key={step}` remount and scroll ref staying on the container; `aside` still an `<aside>`; the
   Stepper root keeping `data-sf-part="stepper"`; `pageWide` derived from slots matching
   `hasActions` in the default. Only dom-parity and the golden set catch these; no snapshot may be
   regenerated to "fix" one.
2. **Position-coupled leftovers** — any remaining `step === n`, `STEPS[n]`, `onEdit(2)` or
   `index < STEPS.length - 1` that still assumes the default order; the 120-permutation test plus
   the rearranged e2e are the net.
3. **Invisible form values** — the effective form must be used everywhere the form feeds the
   backend: `useQuote`, the guest quote key, `classifyQuoteError`, `buildBody`. Missing one puts a
   coupon on the order the shopper cannot see or clear.
4. **Visible vs stored walks** — `couponShown` / `notesShown` and `part-required` walk visible
   slots; `part-home` and `part-placement` walk all slots. A coupon in a hidden column must be both
   "absent" to the container and still correctly homed.
5. **Absent vs empty slots** — a step part stored without `after` must get its default (the
   coupon / notes), not `[]`; any `?? []` before `upgradeDoc` silently removes them.
6. **Editor-only branches leaking** — the stacked canvas, the inert action band and the forced
   signed-in preview must key on `editing` / builder mode only; the exact preview must be the real
   stepper, or owners approve a checkout nobody will see.
7. **The `onAction` revert** — it must compare against the previous document's issues (not revert
   an already-illegal stored document on every edit) and must not fight Puck's history (one undo
   step, no autosave of the illegal intermediate).
8. **Telegram** — the MainButton must follow `order`, not indexes; the first-step band omission
   must use position, not kind; exactly one handler stays live (the existing
   `telegram-webapp.spec.ts` cases must pass unedited).
9. **Order page reading order** — payment first holds only because `action` precedes `summary` in
   the DOM on every width; a future CSS change that reorders the columns (grid areas, `order`)
   would silently break the safety order.
10. **Payment coupling** — `OrderStatusPayment` must remain one part carrying the `changing`
    state; any later split must bring a rule, not just a context.
11. **Wrap parts in a flex column** — a styled Payment or Shipments run must keep the column's gap;
    an unstyled one must add no element.
