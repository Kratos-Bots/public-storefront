# Header, cart, account and simple order pages as parts — design (stage 4 of "everything editable")

Date: 2026-09-30. Status: written for review; no code yet.
Repos: `ecommerce-storefront` only. `ecommerce-backend` and `ecommerce-admin-frontend` need **no
change** beyond what stage 3 already ships (§10). Branch `feature/puck-editable`.
Initiative overview and cross-stage rules:
[`2026-09-30-puck-editable-overview.md`](2026-09-30-puck-editable-overview.md). Builds on
[`2026-09-29-puck-page-builder-design.md`](2026-09-29-puck-page-builder-design.md) (§13 wins over
its §1–12), stage 1 ([`2026-09-30-editable-text-design.md`](2026-09-30-editable-text-design.md)),
stage 2 ([`2026-09-30-block-styling-design.md`](2026-09-30-block-styling-design.md)), stage 3
([`2026-09-30-product-parts-design.md`](2026-09-30-product-parts-design.md) — its container / part
pattern is reused **unchanged** and only extended in §3) and [`../../builder.md`](../../builder.md).
Examples use the fixture store "Northbound Supply" at `shop.example`.

## 1. Goal

The header bar, the cart (page and drawer), the account area and the simple post-order pages
(payment success / cancel, order placed, tracking, verify) and the sign-in page stop being sealed
boxes. An owner can reorder their pieces, remove the optional ones, put content between them and
style each piece on its own, with the same editor gestures stage 3 introduced for the product page.
No arrangement can remove the way to checkout, the way home, the way to sign out or the answer a
page exists to give, and with nothing published every page is byte-for-byte what v0.7.0 renders.

Checkout (`CheckoutFlow`) and order status (`OrderStatus`) are stage 5 and are not touched here.

## 2. Decisions

**U** = the user's decision (binding). **D** = this spec's decision, with its reason.

| # | Decision | By |
|---|---|---|
| 1 | **Break blocks apart.** The header becomes brand / back / search / filter / account / cart pieces; the cart becomes heading / lines / empty state / summary pieces; the account header and each account section, the sign-in page and the simple order pages become their cards and sections. Owners reorder, remove optional pieces and add content between them; guard rules enforce the required ones; every part takes stage-1 text and stage-2 `blockStyle`. | U |
| 2 | **Stage 3's container + part pattern, reused exactly**: the existing block becomes the container (owns queries, mutations, effects, redirects, loading / error / empty states and exposes data + views through a family context); each piece is a thin part block that only renders; views live in the container's module so chunking is unchanged; required / unique / requires rules per container instance; old documents upgraded in memory; default slots = today's DOM. | D — one pattern for owners and reviewers (§3) |
| 3 | **Three small extensions to `ContainerSpec`**: `offers` (a container that shares a family offers a subset of its parts), `nests` (a container slot may hold a named nested container), `slotRejects` (a slot refuses named parts). No other contract change. | D — §3.1 |
| 4 | **One `Header` container for all three variants.** Views branch on the resolved variant (storefront / menu / webapp) and take that variant's CSS module from the container; `<header>`, the pinned notice stack, the web app's safe-area spacer and the inner row stay container-owned, so `position: sticky`, `--sf-bar-h` and `--sf-pin-h` behave exactly as today. | D — §5.1, §7.1 |
| 5 | **`topBar` and `sticky` stay container props; the template TopBar is not a part.** It renders *above* `<header>` (outside the sticky element); a TopBar part inside the bar would make it sticky and change the bar height every sticky element lines up with. The standalone `TopBar` block remains the way to move it. | D — §7.2 |
| 6 | **The cart drawer is driven by the layout's `cart` document**, like stage 3's product sheet: the drawer keeps its `Sheet` chrome (header, title, count, close) and renders the `CartContents` container on a `drawer` surface — its `main` slot in the sheet body and its `summary` slot in the pinned footer. Owners arrange the cart once; phones (page) and desktops (drawer) both see it. | D — §5.2, §7.3 |
| 7 | **`CartSummary` becomes a nested container** (family `cart-summary`) inside `CartContents`' existing `summary` slot, keeping its name and meaning and today's `exactly-one` rule. | D — §5.2 |
| 8 | **`MobileCartBar`, `PrimaryActionBar`, the Footer's template variant, `NoticeBanners` (pinned), `LoginModal`, the `Chromeless` brand header and the drawer's chrome stay whole.** | D — §6 |
| 9 | **Auth redirects stay at route level; states stay in containers.** The route `Guard` (signed-out → `/login?returnTo=`) is above the document and unchanged; every account section container owns its pending / error / not-found / empty states with today's markup, before any slot renders. | D — §7.4 |
| 10 | **An editor-only *Preview state* per stateful container** (tracking found / not found, verify verdicts, payment page variants, empty cart and so on) so owners can see and arrange parts that only render in one state. Shoppers can never reach it. | D — §11 |
| 11 | **Stage 4 adds no text key.** Every part reuses the keys the monolith rendered. | Overview rule 2 |
| 12 | **No backend, admin, protocol or page-set shape change.** Parts are ordinary components in existing documents. | D — §10 |

## 3. Pattern — what stage 3 gives and what stage 4 adds

Everything in stage 3 §3 applies verbatim: `ContainerSpec` (`defaultSlots`, `required`, `unique`,
`requires`, `slotAccepts`, `legacyProps`, `insertSlot`), `createFamily`, `PartHost`, `SlotRender`
with `items`, `slotShows`, `containsType`, part renders as `<PartHost>` shells, container renders as
today's `lazy()` view wrapping `Family.Provider value={{ data, views }}`, placement by nearest
container ancestor, rules per container instance, `upgradeDoc` filling **absent** slots only, and ids
`${id.slice(0, 40)}-${partKey}`.

### 3.1 Contract extensions (`web/src/builder/parts.ts`)

```ts
export type PartFamily = 'product' | 'catalogue' | 'card-tile' | 'card-row'          // stage 3
  | 'header' | 'cart' | 'cart-summary' | 'account' | 'orders' | 'order' | 'loyalty'
  | 'referrals' | 'profile' | 'login' | 'payment' | 'tracking' | 'verify';          // stage 4

export interface ContainerSpec {
  /* …stage 3 fields… */
  /** The parts of the family this container accepts (default: all). A part it does not offer fails `part-placement`. */
  offers?: readonly string[];
  /** Containers of another family its slots may hold (default: none). Counting stops at them, as stage 3 already does. */
  nests?: readonly string[];
  /** Parts a slot refuses — used where a slot is not rendered on every surface or in every state. */
  slotRejects?: Readonly<Record<string, readonly string[]>>;
}
```

- `offers` exists because one family can serve several containers with different pieces: the
  `payment` family is shared by `PaymentSuccess`, `PaymentCancel` and `OrderPlaced` (same visual
  language, same CSS module), but the success page has no action row. Offering a part that would
  always render `null` would be a control that does nothing.
- `nests` lists exactly two relationships: `CartContents` nests `CartSummary`; `AccountNav` nests
  `OrdersList`, `OrderDetail`, `Loyalty`, `Referrals`, `Profile`. Both already nest in v0.7.0
  documents (`CartContents.summary`, `AccountNav.body`), so this only makes stage 3's "a container's
  slots never accept other containers" precise. A nested container is still subject to its own
  placement (`PLACEMENT`) and `exactly-one` rules, which are unchanged.
- `slotRejects` produces a new rule id `slot-rejects:<Container>.<slot>` (§4).

### 3.2 Surfaces and hosts

A container that renders in two places learns which from a host context, as stage 3's
`ProductHostContext` does:

```ts
// features/cart/cart-host.ts (runtime-safe)
export interface CartHost {
  surface: 'drawer';
  /** The drawer builds its Sheet from the container's two regions. `footer` undefined = no footer. */
  frame(regions: { body: ReactNode; footer: ReactNode | undefined }): ReactNode;
  dismiss(): void;
}
export const CartHostContext = createContext<CartHost | null>(null);   // null = the page surface
```

`render.tsx` gains one export, `renderComponent(item, ctx): ReactNode`, which renders one stored
component exactly as `RenderDoc` would (boundary, style, slots). The drawer uses it (§7.3).

### 3.3 Editor-only preview states

```ts
// builder/mode.ts (runtime-safe) — BuilderMode gains:
previewStates: Readonly<Record<string, string>> | null;   // container name → state id; null for shoppers
export function usePreviewState(container: string): string | null;
```

A stateful container reads `usePreviewState('<Name>')` and, when it returns a state id, renders
that state from `editor/fixtures.ts` data instead of its live state machine (§11.3). The value is
only ever set by the editor's `PageSetOverrideProvider` / fixture mode; the shopper app's
`BuilderMode` is the constant `SHOPPER` whose `previewStates` is `null`, so a shopper can never
reach a fixture state, and no fixture data enters the shopper bundle (the fixtures module stays
under `builder/editor/`; the containers receive fixture objects through the context value).

## 4. Rules (`rules.ts`)

Stage 3's rule ids apply to every family here (`part-required`, `part-unique`, `part-requires`,
`part-placement`, `slot-accepts`, `hidden-required`), plus:

| Rule id | Meaning |
|---|---|
| `part-placement:<Part>` | (extended) the nearest container ancestor is of the part's family **and** offers it |
| `slot-rejects:<Container>.<slot>` | a slot holds a part it refuses |

`hidden-required` clarification: it forbids a hidden block *between* a container and a part the
container requires. Hiding a non-required container itself (a `Header` with `hide: 'mobile'`, which
stage 2 allows) hides its parts with it and is not a violation.

Every part of every family is `unique` (most render fixed ids, `aria-labelledby` targets or the
page's only `h1`). There are no `requires` pairs in this stage.

**Required parts, and why:**

| Container | Required | Why |
|---|---|---|
| `Header` | `HeaderBrand` | the way home from every page and the shop's name for screen readers |
| `CartContents` | `CartHeading`, `CartLines`, `CartEmpty` | the page's `h1`; the order itself; the empty state's only recovery ("Browse the catalogue") |
| `CartSummary` | `CartSummarySubtotal`, `CartSummaryCheckout` | no one proceeds without seeing the subtotal; the purchase path (in the web app, the "held" message that explains why the primary action is disabled) |
| `AccountNav` | `AccountGreeting`, `AccountTabs` | the page's `h1`; the only way between account sections — sign-out lives on Profile |
| `OrdersList` | `OrdersRows`, `OrdersEmpty` | the answer; the empty state's only action |
| `OrderDetail` | `OrderHeading`, `OrderItems` | the reference and status; what was bought and the totals |
| `Loyalty` | `LoyaltyPoints`, `LoyaltyRewards` | the balance; the page's only action |
| `Referrals` | `ReferralCode` | the page's purpose |
| `Profile` | `ProfileSignOut` | the only sign-out (it also clears the cart and session on a shared device) |
| `LoginOptions` | `LoginHeading`, `LoginMethods` | the page's `h1`; the ways in |
| `PaymentSuccess` | `PaymentHeadline`, `PaymentReference` | the `h1`; the reference the shopper quotes |
| `PaymentCancel` | `PaymentHeadline`, `PaymentActions` | the `h1`; the way back to finish paying |
| `OrderPlaced` | `PaymentHeadline`, `PaymentReference`, `PaymentActions` | the `h1`; the reference; the pay-via-chat buttons |
| `TrackingLookup` | `TrackingIntro`, `TrackingState`, `TrackingForm`, `TrackingHero`, `TrackingParcels` | the `h1` before an answer; every non-answer screen (pending, error, blocked, not found); the only way to look up; the `h1` and verdict; the parcels |
| `VerifyForm` | `VerifyIntro`, `VerifyFields`, `VerifyResult` | the `h1`; the form; the verdict |

A required part whose view returns `null` for **data** reasons (no lines yet, not found yet, inside
Telegram for sign-out) is fine; no required part exposes a setting that hides it, and none accepts
`hide` (§9).

## 5. The parts

Conventions for every table: "DOM" is the v0.7.0 JSX moved verbatim into the view, including
`null` returns, conditional attributes and class-string construction (e.g.
`` `${classes.action} ${accountClass}` `` keeps its trailing space when `accountClass` is `''`).
Containers keep every effect, query, mutation, redirect and state screen they have today.

### 5.1 Header (`family: 'header'`, container `Header`, document `shell`)

Container render (the variant `v` resolved as today: `auto` → layout; `webapp` outside the web app
→ `menu`):

```
{topBar && v !== 'webapp' ? <Slot name="TopBar"/> : null}
<header class="{bar}[ {unstuck}]" data-sf-part="header" {...styleAttrs}>   ← stage 2 `pass` target, unchanged
  {v === 'webapp' ? <div class="{safeTop}"/> : null}
  <NoticeBanners pinned/>
  <div class="{inner}">                                          headerInner / barInner
    {start()} {nav()} {middle()} {end({ className: actions })}   start, nav, middle bare
  </div>
</header>
```

`{bar}`, `{inner}`, `{actions}` … come from the variant's module (`StorefrontShell.module.css`,
`MenuShell.module.css`, `WebAppShell.module.css`); the container passes that `classes` object in the
family data so views use the same module.

Slots: **`start`**, **`nav`** (the existing slot, same meaning, stored content untouched),
**`middle`**, **`end`** (inside `.actions`, which carries `margin-left: auto`). `insertSlot: 'end'`.

Family data: `{ variant, classes, brandName, loggedIn, native, cartCount, search, setSearch,
onCatalog, canFilter, filtered, showBack, openFilter(), goBack() }` — computed once in the container
from the same hooks the three headers call today.

| Part | Storefront view | Menu view | Web-app view | Layouts |
|---|---|---|---|---|
| `HeaderBrand` *(req.)* | `<Link to="/" class="home" aria-label>` + `<Brand size="md">` | same, `size="sm"` | same, `size="sm"` | all |
| `HeaderBack` | — (`null`) | — (`null`) | `<button class="action back">` chevron when `showBack` | webapp |
| `HeaderSearch` | `<SearchField class="search">` (default placeholder) | `<SearchField class="search" placeholder={shell.header.searchPlaceholder}>` | as menu | all |
| `HeaderFilter` | `null` | `<button class="action">` filter + dot, when `canFilter` | as menu | all |
| `HeaderAccount` | signed in: icon link `/account`; else text link "Sign in" (`signIn`) | icon link to `/account` or `/login` | icon link, `/account` when signed in **or** native | all |
| `HeaderCart` | `<Link to="/cart" class="action …">` bag 18 + `badge` | bag 17 + `badge` | as menu | all |

`HeaderAccount` and `HeaderCart` each carry `icon: Override` (inherit / show / hide) — the Header's
`accountIcon` / `cartIcon` moved onto the part they govern — and wrap their view in the same
`CoreOptionsScope` the Header uses today (no element), so the template's `desktop` / `mobile` /
`none` icon modes keep working under `inherit`. Both render `null` when their feature
(`accounts` / `ordering`) is off, exactly as today. `HeaderFilter` in the storefront variant renders
`null` (the editor says so, §11); it is not layout-restricted because a store may choose the menu
variant in the storefront layout.

**Defaults** (`Header.container.defaultSlots`, from the resolved variant and the legacy props):

- `start`: webapp `[HeaderBack, HeaderBrand]`, otherwise `[HeaderBrand]`.
- `nav`: never filled (it is present in every stored and default document, as `[]` or content).
- `middle`: `[HeaderSearch]`, or `[]` when legacy `search` is `false`.
- `end`: storefront `[HeaderAccount, HeaderCart]`; menu / webapp `[HeaderFilter, HeaderAccount,
  HeaderCart]`; `icon` on each = the legacy `accountIcon` / `cartIcon`.

`search`, `accountIcon`, `cartIcon` become `legacyProps`. `variant`, `topBar`, `sticky` stay live
container props. The Header's slots accept what v0.7.0's `nav` slot accepts, plus header parts
(so no stored document gains a violation). The editor warns, without blocking, when a block other
than a header part, `NavLinks` or `Button` sits in the header: "Tall blocks make the header taller
on every page." (§11).

`StorefrontHeader`, `MenuHeader` and `WebAppHeader` keep their exports and props and are rewritten
as fixed compositions of the same views, so the legacy parity shells
(`test/builder-shell.test.tsx`) keep their meaning.

### 5.2 Cart (`family: 'cart'`, container `CartContents`; nested `family: 'cart-summary'`, container `CartSummary`; document `cart`)

**`CartContents`** — slots **`head`**, **`main`**, **`summary`** (the existing slot).
`nests: ['CartSummary']`. `insertSlot: 'main'`.

Page surface (no host):

```
empty
  ? <>{head()}{main()}{summary()}</>                               ← v0.7.0 rendered only EmptyState
  : <div class="page">{head()}{main()}{summary({ className: foot })}</div>
```

Drawer surface (`CartHostContext` set, §7.3): `host.frame({ body: main(), footer: empty ? undefined
: summary() })`; `head` is not rendered in the drawer (its chrome is the drawer's own header).

The container keeps `useServerCart()`, the page's refresh-on-mount (page surface only; the drawer
host keeps its refresh-on-open), `issueByProduct`, `blocked`, and provides `{ surface, lines, count,
isSyncing, issueByProduct, blocked, setQuantity, remove, dismiss? }`.
`slotRejects: { head: [CartLines, CartEmpty, CartSummary], main: [CartSummary], summary: [CartLines,
CartEmpty] }` — `head` never renders in the drawer and `summary` never renders on an empty cart, so
a required part there would vanish; a `CartSummary` in `main` would draw twice in the drawer.

| Part | Page view (DOM = v0.7.0) | Drawer view (DOM = v0.7.0) |
|---|---|---|
| `CartHeading` *(req.)* | `<header class="head">` eyebrow, `h1`, count + sync pulse; `null` when empty | `null` (the Sheet header shows title and count) |
| `CartLines` *(req.)* | `<ul class="lines">` (CartPage module) of `CartLine`; `null` when empty | `<ul class="lines">` (CartDrawer module); `null` when empty |
| `CartEmpty` *(req.)* | `<EmptyState>` with "Browse the catalogue"; `null` when not empty | same, the button also calls `dismiss` |

Default: `head [CartHeading]` · `main [CartEmpty, CartLines]` · `summary [CartSummary]`.

**`CartSummary`** — the root `<div class="summary">` (stage 2 moves it from `wrap` to `root`; its
key list only grows) holding one slot, **`items`**, bare. Family data: `{ blocked, onNavigate?,
count, subtotal, currency, mixedPreorder, primaryElsewhere, checkoutTo }`. Inside a `CartContents` it
takes `blocked` and `dismiss` from the cart family and renders `null` when the cart is empty (today
neither the page foot nor the drawer footer exists then); on its own — v0.7.0 allowed it anywhere on
the cart document — it computes `blocked` from `useServerCart()` as `CartSummaryView` does today.
`CartBlockedContext` is deleted (the cart family replaces it).

| Part | View (DOM = v0.7.0) |
|---|---|
| `CartSummaryNotice` | `<p class="notice">` mixed pre-order notice; `null` otherwise |
| `CartSummarySubtotal` *(req.)* | `<div class="ledger">` label, item count, figure |
| `CartSummaryTerms` | `<p class="terms">` |
| `CartSummaryCheckout` *(req.)* | the checkout `Link`, or the disabled button + `held` note; in the web app only the `held` note when blocked, else `null` |
| `CartSummaryContinue` | `<Link class="keep">` "Keep shopping" (calls `onNavigate`) |

Default `items`: `[Notice, Subtotal, Terms, Checkout, Continue]`.

### 5.3 Account header (`family: 'account'`, container `AccountNav`, documents `account.*`)

`AccountNav` keeps `body`; gains **`head`**. `nests` the five section containers. Render:
`<div class="account">{head()}<div key={pathname} class={FADE}>{body()}</div></div>` — the keyed,
re-animating body wrapper stays container JSX.

| Part | View |
|---|---|
| `AccountGreeting` *(req.)* | `<header class="letterhead">` eyebrow, `h1` name (session nickname first), standing line when the profile is in |
| `AccountTabs` *(req.)* | `<nav class="tabs" aria-label>` of the four `NavLink`s |

Default `head [AccountGreeting, AccountTabs]`. Each of the five account documents carries its own
`AccountNav`, as in v0.7.0; a shared account header is a non-goal (§15).

### 5.4 Account sections

Every section container keeps its query, its `PageSkeleton inline` while pending and its
error / not-found `EmptyState`, rendered before any slot. One slot, **`content`**.

**`OrdersList`** (`orders`): rows empty → `content()` bare (only `OrdersEmpty` draws, as v0.7.0
returned only the `EmptyState`); otherwise `content({ className: body })`.

| Part | View |
|---|---|
| `OrdersHeading` | `<div class="sectionHead">` `h2` + count; `null` when empty |
| `OrdersRows` *(req.)* | `<ul class="orders">` rows; `null` when empty |
| `OrdersMore` | `<div class="more">` load-more button when `hasNextPage` |
| `OrdersEmpty` *(req.)* | `<EmptyState>` "Browse the catalogue" when empty; `null` otherwise |

Default `[Heading, Rows, More, Empty]`.

**`OrderDetail`** (`order`): `content({ className: body })`.

| Part | View |
|---|---|
| `OrderBackLink` | `<Link class="back">` back to orders |
| `OrderHeading` *(req.)* | `<div class="detailHead">` `h2` reference, status pill, placed date |
| `OrderBalance` | `<p class="band">` balance due; `null` when settled |
| `OrderItems` *(req.)* | `<section aria-label>` items + subtotal / shipping / discount / total rows |
| `OrderPayments` | payments `<section>`; `null` when none |
| `OrderParcels` | parcels `<section>`; `null` when none |
| `OrderPageLink` | the order-page `a.cta` + `p.note`; `null` without `publicUrl` |

Default in that order.

**`Loyalty`** (`loyalty`): `<div class="body">{content()}{confirmModal}</div>` — the container owns
the redeem mutation, the toast and the confirm `Modal`, which stays the wrapper's last child.

| Part | View |
|---|---|
| `LoyaltyPoints` *(req.)* | `<div class="meter">` points figure + unit |
| `LoyaltyCredit` | store-credit `<div class="row">` |
| `LoyaltyNoPoints` | `<p class="note">` when the balance is 0 |
| `LoyaltyRewards` *(req.)* | redeem `<section>` (ladder, reach bars, Redeem buttons → `data.confirm(option)`); `null` until the ladder loads |

Default `[Points, Credit, NoPoints, Rewards]`.

**`Referrals`** (`referrals`): `content({ className: body })`; the container owns the claim
mutation, clipboard and share.

| Part | View |
|---|---|
| `ReferralCode` *(req.)* | `<div class="plate">` code + Copy |
| `ReferralShare` | `div.share` + `p.note`; `null` with no share method |
| `ReferralStats` | "brought in" `<section>` |
| `ReferralReferrer` | referrer `<section>`: who referred you, or the claim form |

Default in that order.

**`Profile`** (`profile`): `content({ className: body })`; the container owns sign-out.

| Part | View |
|---|---|
| `ProfileDetails` | `div.sectionHead` + name / member since / orders / spend rows |
| `ProfileChannels` | channels `<section>` + note |
| `ProfileContact` | "talk to us" `<section>`; web app with chat links only |
| `ProfileBotSwitch` | `<ClassicBotSwitch>`; Telegram beta only |
| `ProfileSignOut` *(req.)* | sign-out button → `data.signOut()`; `null` inside Telegram |

Default in that order. As in stage 3 (`ProductAddToCart` → `AddToCart`), a part may render an
existing self-contained leaf component that owns its own interaction (`ClassicBotSwitch`,
`LoginOptions`, `LookupForm`); what a part never owns is page-level state.

### 5.5 Sign-in (`family: 'login'`, container `LoginOptions`, document `login`)

The container keeps the `returnTo` parking effect, the signed-in `<Navigate>`, the Telegram
sign-in error screen (`div.page > TelegramSignInError`) and renders `content({ className: page })`.

| Part | View |
|---|---|
| `LoginHeading` *(req.)* | `<div class="head">` `h1` + lede |
| `LoginMethods` *(req.)* | `<LoginOptions>` — stays one part: the method cards are feature-flag driven and shared with `LoginModal`, so the page and the modal never disagree on the ways in |

### 5.6 Payment pages (`family: 'payment'`, containers `PaymentSuccess`, `PaymentCancel`, `OrderPlaced`)

Each container keeps its effects (clear cart + persisted checkout on success / placed), the
missing-reference screen, and success's hand-off `<Navigate>` to a saved order link; it renders
`content({ className: \`${page} ${FADE}\` })` (the exact v0.7.0 class string). Family data:
`{ kind: 'success' | 'cancel' | 'placed', orderRef, saved, warning, whatsapp, telegram }`.

| Part | Success | Cancel | Placed |
|---|---|---|---|
| `PaymentMark` | `span.ring.ringSuccess` check | `span.ring.ringWarn` close | as success |
| `PaymentEyebrow` | `p.eyebrow[data-tone=success]` | `[data-tone=warn]` | success tone |
| `PaymentHeadline` *(req.)* | `h1.headline` | `h1.headline` | `h1.headline` |
| `PaymentMessage` | `p.detail` | `p.detail` | warning `p.alert[role=status]`, or chat hint `p.detail`, or `null` |
| `PaymentReference` | `ReferenceRow` | `ReferenceRow` when a reference exists | `ReferenceRow` |
| `PaymentActions` | *not offered* | `div.actions` return-to-order or back-to-shop CTA | `div.actions` pay-via-WhatsApp / Telegram, or `p.fallback` |
| `PaymentContact` | `div.contact > ContactLinks` (inquiry prefill) | same (order-chat prefill) | same (order-chat prefill) |
| `PaymentBack` | `Link.back` | `Link.back` | `Link.back` |

Defaults: success `[Mark, Eyebrow, Headline, Message, Reference, Contact, Back]`; cancel `[Mark,
Eyebrow, Headline, Message, Reference, Actions, Contact]`; placed `[Mark, Eyebrow, Headline,
Message, Reference, Actions, Back]`. `offers`: success = all but `PaymentActions`; cancel and placed
= all (a cancel page may add a back link; a placed page may add contact links).

### 5.7 Tracking (`family: 'tracking'`, container `TrackingLookup`, document `tracking`)

The container keeps the whole Turnstile / phase state machine (the four ordered effects, token
wait, stale-response guard, `run()`), the no-site-key screen (`div.page > TrackingUnavailableScreen`,
before any slot) and the invisible `<Turnstile>` as its last child. Render:

```
<div class="page">
  {top()}{main()}
  {phase === 'found' && data ? <div aria-busy={isRefreshing}>{result()}</div> : null}
  {turnstile}
</div>
```

Family data: `{ phase, compact, data, isRefreshing, awaitingToken, errorStatus, retry(), refresh(),
reload() }`.

| Part | Slot | View |
|---|---|---|
| `TrackingIntro` *(req.)* | top | compact → `div.strip` label + "another" link; else `div.masthead` eyebrow, `h1`, lead |
| `TrackingState` *(req.)* | main | pending → `VerifyingNote` (while awaiting a token) + `PendingSkeleton`; error → `ErrorScreen`; blocked → `VerifyBlockedScreen`; not found → `NotFoundScreen`; else `null` |
| `TrackingForm` *(req.)* | main | idle → `LookupForm`; not found → `div.retry > LookupForm`; else `null` |
| `TrackingHero` *(req.)* | result | `OrderHero` (`h1`) |
| `TrackingProgress` | result | single-parcel `ProgressStepper`; `null` otherwise |
| `TrackingRefresh` | result | `RefreshButton` while anything is still in transit with live tracking |
| `TrackingNotice` | result | `DegradedNotice` when tracking is degraded and parcels exist |
| `TrackingParcels` *(req.)* | result | `ParcelCard`s, or `NothingShippedScreen` |

Defaults: `top [Intro]` · `main [State, Form]` · `result [Hero, Progress, Refresh, Notice,
Parcels]` — `State` before `Form` reproduces v0.7.0's not-found order (screen, then the retry form).
`slotRejects: { result: [TrackingIntro, TrackingState, TrackingForm] }` — `result` only renders once
an answer exists, so those would vanish when they matter. `result` parts placed in `top` / `main`
still render (their views return `null` until `found`), just outside the `aria-busy` wrapper.

### 5.8 Verify (`family: 'verify'`, container `VerifyForm`, document `verify`)

The container keeps the two fields' state, validation (`schema`, `msg()` errors), the submit
handler, the "an edit drops the verdict" rule and the ids; renders `content({ className: page })`.

| Part | View |
|---|---|
| `VerifyIntro` *(req.)* | `div.masthead` eyebrow, `h1`, lead |
| `VerifyFields` *(req.)* | `<form class="form">` both fields + submit, bound to container state |
| `VerifyResult` *(req.)* | `VerifiedCard` / `InvalidCard` / `ErrorCard` by status; `null` while idle or pending |
| `VerifyBack` | `Link.back` |

Default in that order.

### 5.9 Chunks and views

Views live in the module that already holds the container's lazily loaded view:
`layouts/header-parts.tsx` (the shell is in the entry today, so the header stays there);
`features/cart/cart-parts.tsx` and `cart-summary-parts.tsx` (already in the entry via `CartDrawer`,
which imports `CartLine` and `CartSummary` statically); `features/account/*Page.tsx` each export
their section's views; `features/auth/LoginPage.tsx`, `features/payment-redirect/*Page.tsx`,
`features/tracking/TrackingPage.tsx`, `features/verify/VerifyPage.tsx` likewise. The one entry
growth is the cart container view (`CartPage.tsx`, ~80 lines), which the drawer now imports
statically (§7.3); it is measured in the gate (§12).

## 6. What stays whole, and why

| Piece | Why |
|---|---|
| `MobileCartBar` | Fixed to the phone's foot; its two targets (view cart, checkout) are one purchase control sized for a thumb; the frame mounts it as a safety net when the shell has none; stage 2 made it unstylable for the same reasons. Its text is already editable. It stays one block — no parts, no style. |
| `PrimaryActionBar` (web app) | A system mount wired to Telegram's MainButton; not a document block. |
| `NoticeBanners pinned` inside the header | Publishes `--sf-pin-h` from inside the sticky element; exactly one stack may do so. Container-owned. |
| `TopBar` slot | §7.2. |
| `Footer` | Its `columns` variant is already owner-composed (four slots of content); its `template` variant is the active template's slot component, whose DOM belongs to the template. |
| Cart drawer chrome | The `Sheet` header (title, count, close) and its focus trap and dismiss wiring are the drawer's frame, like the product sheet's header in stage 3. |
| `LoginModal`, `Chromeless` brand header | System mounts outside any document. |
| Leaf components (`CartLine`, `ParcelCard`, `OrderHero`, `LookupForm`, `ClassicBotSwitch`, `LoginOptions`, the loyalty confirm modal) | Each is one control or one card; splitting them would expose inputs and their labels as separate pieces. |

## 7. Interactions

### 7.1 Sticky and the header variants

`sticky` keeps producing `.unstuck` on the container-owned `<header>`, so `.shell:has(.unstuck)`
still zeroes `--sf-bar-h` / `--sf-pin-h`. The inner row keeps its fixed height (56 px, 68 px from the
desktop breakpoint), so no arrangement or part style changes the bar height: header parts accept no
vertical spacing (§9). The three variants differ only in views, classes and defaults; changing
`variant` in the editor keeps the arrangement and offers **Reset arrangement** to take the new
variant's defaults (e.g. to gain the Categories button).

### 7.2 The template TopBar

`Header.topBar` (default on; ignored in the web app, where Telegram owns the top) renders the
TopBar slot above `<header>`, as today. It is not a part: inside the bar it would become sticky and
push every sticky element down. An owner who wants it elsewhere turns `topBar` off and adds the
existing `TopBar` block — the editor's field hint says exactly that.

### 7.3 The cart drawer and the cart page

`/cart` is a page on phones and in the web app, and hands off to the drawer on desktop storefront
and menu layouts (unchanged routing). Both now render the layout's `cart` document:

- `CartDrawer` keeps `opened`, dismiss, refresh-on-open, the `Sheet` and its header. It resolves the
  guarded document with `resolveDoc(pageSet, 'cart', layout)` (the shell has already waited for the
  page set), finds its one `CartContents` component and renders it with `renderComponent` inside a
  `CartHostContext` whose `frame()` returns `<Sheet header={…} footer={footer}>{body}</Sheet>`. The
  container is imported statically (not through the block's `lazy()`), so opening the drawer never
  suspends.
- If the document keeps `CartSummary` **outside** `CartContents` (legal in v0.7.0), the drawer footer
  renders that component instead of the empty `summary` slot; the page renders it where it is.
- Content blocks at the document root and in `head` are page-only (the editor says so, §11).
- A throw inside the drawer's published arrangement is caught by a `DocBoundary` around the
  `frame()` result; the drawer then renders the default document's `CartContents` for the rest of
  the page load (the same "failed stays failed" rule as the shell).

### 7.4 Auth-gated pages

The route `Guard` above `/account/*` still redirects signed-out shoppers to
`/login?returnTo=…` before any document renders, and `LoginOptions` still sends a signed-in
visitor on. Section containers own pending (`PageSkeleton inline`), error and not-found states with
unchanged markup and keys; `AccountGreeting` greets from the session nickname immediately, as today.
No part ever renders without its data, so no part has a skeleton.

### 7.5 Web app

The web app has no drawer and no `MobileCartBar`; its cart page uses the same arrangement, and
`CartSummaryCheckout` shows only the held note because `PrimaryActionBar` is the checkout.
`HeaderBack` exists only in this layout. Telegram chrome is unaffected.

## 8. Old documents — upgrade in memory

`upgradeDoc` (stage 3 §8) runs for every container here; a slot whose key is **absent** is filled
from `defaultSlots(parsedProps, { layout, id })`, a present slot (even `[]`) is never touched.

| Container | Slots filled when absent | Legacy props read |
|---|---|---|
| `Header` | `start`, `middle`, `end` (`nav` is always present) | `search`, `accountIcon`, `cartIcon` |
| `CartContents` | `head`, `main` (`summary` present) | — |
| `CartSummary` | `items` | — |
| `AccountNav` | `head` (`body` present) | — |
| `OrdersList`, `OrderDetail`, `Loyalty`, `Referrals`, `Profile`, `LoginOptions`, `PaymentSuccess`, `PaymentCancel`, `OrderPlaced`, `VerifyForm` | `content` | — |
| `TrackingLookup` | `top`, `main`, `result` | — |

The upgraded result renders exactly what v0.7.0 rendered for that document (a `Header` with
`search: false` and `cartIcon: 'hide'` → no search part, `HeaderCart.icon = 'hide'`). It runs in the
guard (before a container's slots are cleaned) and in the editor's `fromPageSet` before Puck sees the
document; legacy props are hidden in the editor and dropped on save by `prepareProps` once slots
exist. A rollback to v0.7.0 is safe for the reasons stage 3 gives (its `z.object` strips unknown
slots; missing toggles take their defaults).

## 9. Styling (stage 2) and text (stage 1) per part

Key sets as stage 2: **BOX**, **TEXT** (`fg textSize align`), **VIS** (`hide`). New for the header:
**BAR** = `bg fg border borderColor borderStyle radius padX` — no vertical spacing, margins,
`maxWidth` or `textSize`, because every header part sits in a fixed-height flex row whose height
other sticky elements line up with (§7.1). Required parts never take `hide`; parts containing an
input never take `textSize`; parts offering `fg` / `textSize` switch their module CSS to
`var(--sf-block-fg, <today>)` / `calc(<today> * var(--sf-text-scale, 1))`. A shared component that is
a part's root gains an optional `rootAttrs` (`EmptyState` already has it from stage 3; `SearchField`
(layouts), `ReferenceRow`, `ContactLinks`, `LookupForm`, `OrderHero`, `RefreshButton`,
`LoginOptions`). Parts whose view is a run of siblings use `wrap`.

| Part | Target | Keys | Text patterns |
|---|---|---|---|
| `HeaderBrand` *(req.)* | root | BAR | `shell.header.homeAriaLabel` |
| `HeaderBack` | root | BAR + VIS | `shell.webapp.back` |
| `HeaderSearch` | root (via `SearchField`) | BAR − `fg` + VIS | `catalog.search.*`, `shell.header.searchPlaceholder` |
| `HeaderFilter` | root | BAR + VIS | `shell.header.categories*` |
| `HeaderAccount` | root | BAR + VIS | `common.nav.yourAccount`, `common.actions.signIn` |
| `HeaderCart` | root | BAR + VIS | `shell.header.cartAriaLabel` |
| `CartHeading` *(req.)* | root | BOX + TEXT | `cart.page.*`, `cart.summary.items` |
| `CartLines` *(req.)* | root | BOX | `cart.line.*`, `common.qty.*`, `common.product.*` |
| `CartEmpty` *(req.)* | root (via `EmptyState`) | BOX + TEXT | `cart.empty.*`, `cart.page.eyebrow`, `common.actions.browseCatalogue` |
| `CartSummary` *(container)* | root | BOX | — (its parts list theirs) |
| `CartSummaryNotice`, `CartSummaryTerms` | root | BOX + TEXT + VIS | `cart.summary.mixedNotice` / `cart.summary.terms` |
| `CartSummarySubtotal` *(req.)* | root | BOX + TEXT | `common.totals.subtotal`, `cart.summary.items` |
| `CartSummaryCheckout` *(req.)* | wrap | BOX | `cart.summary.checkout`, `cart.summary.held` |
| `CartSummaryContinue` | root | BOX + TEXT + VIS | `cart.summary.keepShopping` |
| `AccountGreeting` *(req.)*, `AccountTabs` *(req.)* | root | BOX + TEXT | `account.layout.*`, `account.orders.count`, `common.nav.yourAccount` / `account.nav.*` |
| `OrdersHeading`, `OrdersMore` | root | BOX + TEXT + VIS | `account.orders.title`, `.count` / `.loadMore`, `.loadingMore` |
| `OrdersRows` *(req.)* | root | BOX + TEXT | `account.orders.balanceDue`, `order.status.*` |
| `OrdersEmpty` *(req.)* | root (via `EmptyState`) | BOX + TEXT | `account.orders.empty*`, `account.nav.orders`, `common.actions.browseCatalogue` |
| `OrderHeading` *(req.)*, `OrderItems` *(req.)* | root | BOX + TEXT | `account.order.placed`, `order.status.*` / `account.order.items`, `.lines`, `common.totals.*` |
| `OrderBackLink`, `OrderBalance`, `OrderPayments`, `OrderParcels` | root | BOX + TEXT + VIS | `account.order.*` (their keys), `common.shipment.*` |
| `OrderPageLink` | wrap | BOX + TEXT + VIS | `account.order.openOrderPage`, `.orderPageNote` |
| `LoyaltyPoints` *(req.)* | root | BOX + TEXT | `account.loyalty.points` |
| `LoyaltyCredit`, `LoyaltyNoPoints` | root | BOX + TEXT + VIS | `account.loyalty.storeCredit` / `.noPoints` |
| `LoyaltyRewards` *(req.)* | root | BOX + TEXT | `account.loyalty.redeem*`, `.cost`, `.worth`, `.pointsToGo`, `.nothingToRedeem` |
| `ReferralCode` *(req.)* | root | BOX + TEXT | `account.referrals.yourCode`, `.copyAria`, `common.actions.copy*` |
| `ReferralShare` | wrap | BOX + TEXT + VIS | `account.referrals.share*`, `common.contact.*` |
| `ReferralStats` | root | BOX + TEXT + VIS | `account.referrals.broughtIn*`, `.peopleReferred`, `.ordersEarned` |
| `ReferralReferrer` | root | BOX + VIS | `account.referrals.referr*`, `.enterCodeNote`, `.code*`, `.apply`, `.checking`, `.someone` |
| `ProfileDetails` | wrap | BOX + TEXT + VIS | `account.profile.detailsTitle`, `.name*`, `.memberSince`, `.orders`, `.totalSpend` |
| `ProfileChannels`, `ProfileContact`, `ProfileBotSwitch` | root | BOX + TEXT + VIS | `account.profile.channel*` / `.contactAria`, `.talkToUs`, `common.contact.*` / `account.profile.bot*` |
| `ProfileSignOut` *(req.)* | root | BOX | `account.profile.signOut`, `.signingOut` |
| `LoginHeading` *(req.)* | root | BOX + TEXT | `auth.page.*` |
| `LoginMethods` *(req.)* | root (via `LoginOptions`) | BOX | `auth.options.*`, `auth.telegram.*`, `auth.whatsapp.*`, `common.contact.*` |
| `PaymentMark` | root | BOX + VIS | — |
| `PaymentEyebrow`, `PaymentMessage` | root | BOX + TEXT + VIS | `payment.{success,cancel,placed}.eyebrow` / `.detail`, `.warning`, `.chatHint` |
| `PaymentHeadline` *(req.)* | root | BOX + TEXT | `payment.{success,cancel,placed}.headline` |
| `PaymentReference` | root (via `ReferenceRow`) | BOX + TEXT (+ VIS where not required) | `payment.reference.label`, `common.actions.copy*` |
| `PaymentActions` | root | BOX (+ VIS where not required) | `payment.cancel.returnToOrder`, `.backToShop`, `payment.placed.payVia*`, `.fallback` |
| `PaymentContact`, `PaymentBack` | root | BOX + VIS | `common.contact.*` / `common.actions.backToShop` |
| `TrackingIntro` *(req.)* | root | BOX + TEXT | `tracking.lookup.eyebrow`, `.title`, `.lead`, `.strip`, `.another` |
| `TrackingState` *(req.)*, `TrackingParcels` *(req.)* | wrap | BOX | `tracking.states.*` / `tracking.parcel.*`, `tracking.timeline.*`, `tracking.status.*`, `tracking.time.*` |
| `TrackingForm` *(req.)* | root (via `LookupForm` / `div.retry`) | BOX | `tracking.lookup.label`, `.placeholder`, `.submit`, `.hint`, `.recent`, `.invalidReference` |
| `TrackingHero` *(req.)* | root (via `OrderHero`) | BOX | `tracking.hero.*` |
| `TrackingProgress`, `TrackingRefresh`, `TrackingNotice` | root | BOX + VIS | `tracking.status.stage*` / `tracking.refresh.*` / `tracking.states.degraded*` |
| `VerifyIntro` *(req.)*, `VerifyResult` *(req.)* | root | BOX + TEXT | `verify.page.*` / `verify.result.*` |
| `VerifyFields` *(req.)* | root | BOX | `verify.form.*`, `verify.errors.*`, `checkout.errors.required`, `common.status.checking` |
| `VerifyBack` | root | BOX + VIS | `common.actions.backToShop` |

`PaymentReference` and `PaymentActions` are required on some payment containers and not others:
the `hide` key is offered per *placement* — the Style group drops `hide` when the part sits in a
container that requires it, and the guard's `hidden-required` check covers the rest.

Containers' `text` narrows to what they still draw themselves: `Header` — `TOP_BAR_TEXT`; account
sections — their `loadFailed*` / `notFound*` keys, `common.actions.tryAgain`, `common.status.loading`;
`PaymentSuccess` / `OrderPlaced` — `payment.missing.*`, `order.link.eyebrow`; `TrackingLookup` —
`tracking.states.disabled*`, `.off*`; `LoginOptions` — `auth.telegram.error*`. The drawer chrome's
keys (`cart.drawer.title`, `common.actions.close`) stay in the Site-wide group. The stage-1 coverage
and orphan tests stay green with no new key.

**Template CSS.** Every `data-sf-part` (`header`, `badge`, `drawer`, `cart-bar`, `button`) stays on
the same element; built-in templates target the header and the cart only through descendant
selectors (checked), so custom arrangements keep their treatment. `templates.md` gains: "Header,
cart and account parts can be reordered; don't rely on child order or `:first-child` inside
`[data-sf-part="header"]` or the cart."

## 10. Backend and admin

- **Backend: no change.** Parts are ordinary components; the page-set walk (`checkStructure`,
  `blockStyle`, link props, depth) already covers them, and the stage-3 `cards` field is the only
  new page-set field in this initiative. A fully arranged page set stays far inside the limits
  (every document of this stage stored explicitly adds ≈ 120 components against the 2 000 budget,
  a few KB against 512 KB).
- **Admin: no change.** The publish diff compares whole documents per `DocKey`, so an arrangement
  edit shows as "Edited" on its page; no new `DocKey`. Usual gates only (build, lint against the
  baseline, mocked Pages pass).
- **Storefront transport: no change.** `protocol` stays `1`.
- **Deploy order:** the storefront release (v0.8.0) after the stage-3 backend, as already planned;
  nothing in this stage depends on a backend deploy.

## 11. Editor

### 11.1 Parts palette, panel, locks

As stage 3 §11: a drawer category per family shown only on documents where its container lives
("Header parts" on `shell`; "Cart parts" and "Cart summary parts" on `cart`; "Account header parts"
plus the section's own ("Order history parts", …) on `account.*`; "Sign-in parts"; "Payment page
parts"; "Tracking parts"; "Verify parts"). Puck `allow` lists follow `offers`, `slotAccepts`,
`slotRejects` and `nests`. The container panel's **Parts** list (state, **Add** in the default
place) and **Reset arrangement** (one undo step, keeps container props) work unchanged; for
`Header`, Reset uses the *current* variant's defaults. Required parts get `delete: false,
duplicate: false`; every other part `duplicate: false`.

### 11.2 Notices (editor copy, never shopper text)

- `HeaderFilter` in a storefront-variant header: "Shows only with the Menu or Web app header style."
- A non-part block other than `NavLinks` / `Button` in the header: "Tall blocks make the header
  taller on every page." (non-blocking)
- `Header.topBar` field hint: "To place the template top bar elsewhere, turn this off and add a
  Template top bar block."
- Cart document, drawer surface: content at the root and in the heading slot is tagged "Cart page
  only" (the stage-2 ghost style), because the drawer shows only the lines and summary.
- `PaymentActions` / `PaymentReference` panels name the pages where they are required.

### 11.3 Fixture data and preview states

- **Preview as** (existing: signed out / signed in / with orders × empty cart / items) drives the
  header's account and cart parts, the cart and the account sections from the Northbound Supply
  fixtures, as in v0.7.0.
- **Preview state** (new, header control shown when the current document's container has states):

| Container | States (first = default) |
|---|---|
| `CartContents` | follow *Preview as* (items / empty) |
| `OrdersList` | orders · no orders · more to load |
| `Loyalty` | with rewards · no points |
| `Referrals` | not referred yet · referred |
| `Profile` | website · web app (contact section) |
| `PaymentSuccess` | with reference · missing reference |
| `PaymentCancel` | saved order · no saved order · no reference |
| `OrderPlaced` | chat links · warning · no chat links · missing reference |
| `TrackingLookup` | lookup form · found (2 parcels) · found (1 parcel) · nothing shipped · not found · error |
| `VerifyForm` | form · authentic · expired · not verified · error |

  Fixture data (`FIXTURE_TRACKING`, `FIXTURE_VERIFICATION`, invented Northbound Supply chat
  links) lives in `editor/fixtures.ts`; states travel to the canvas and exact previews in the
  editor's override next to `previewAs` (§3.3). Lookups and mutations stay refused ("Preview only"
  toast) as in v0.7.0 fixture mode.
- **Cart surface switch** (storefront, menu): **Page / Drawer**. Drawer draws a 420 px column with
  a non-interactive copy of the drawer header, the container's `main` slot as the body and its
  `summary` slot as the pinned footer. The exact preview at desktop width opens `/cart`, so the real
  drawer shows the draft.
- Everything above lives under `web/src/builder/editor/`; the builder-isolation check is unchanged.

## 12. Parity gate

With no published set, or a set that never touches these blocks, every surface renders from the
default arrangements of §5, and:

1. **Wrappers** are exactly today's, produced by container JSX or `SlotRender({ className })`; every
   other slot renders bare. The conditional wrappers (`div.page` only for a non-empty cart,
   `div.body` only for a non-empty order list, the `aria-busy` result wrapper only when found) are
   computed from the same state v0.7.0 branched on.
2. **Part markup** is the v0.7.0 JSX moved verbatim; `null` exactly where v0.7.0 omitted a piece.
3. **Nested containers** add nothing: `CartSummary` renders the same `div.summary`; `AccountNav`'s
   body wrapper stays keyed by pathname.
4. Stage 1 keys and stage 2's "no style ⇒ no attribute" apply unchanged.

Gates:

- `e2e/dom-parity.spec.ts` (shell on every route, cart page at 390 and the drawer at 1280, login,
  the five account routes, payment success / cancel, order placed, tracking with and without a
  reference, verify — × layouts × widths) passes **with no snapshot regenerated**.
- Before any refactor, the first task captures **golden markup** of the v0.7.0 components for the
  states dom-parity does not reach (`web/test/__golden__/stage4-*.html`): each header variant ×
  signed in / out × account and cart icon modes × `search` / `sticky` / `topBar` toggles × cart count
  0 / 3 × web app native / browser × on / off the catalogue; cart page and drawer empty / with
  lines / blocked / mixed pre-order / web app; orders empty / with more; order detail with and
  without balance, payments, parcels, public link; loyalty with ladder / no points; referrals
  referred / not; profile website / web app / Telegram; sign-in Telegram error; each payment page
  state of §11.3; every tracking phase; every verify verdict. A unit test renders the default and
  upgraded-monolith documents in the same states and must match byte for byte.
- `templates.spec.ts` and the `templates-baseline*` screenshots unchanged.
- The entry chunk size before and after is recorded; growth beyond the cart container view (§5.9)
  fails review.

## 13. Testing

**Storefront unit (Vitest)** — new `test/builder-parts-stage4.test.ts`, plus additions:

- Contract: `offers`, `nests`, `slotRejects` validated at registry build; every new part has
  `part.family`, `style` per §9 and no `hide` when required anywhere; every container's defaults pass
  its own rules in every layout and for every header variant; `blocks.json` regenerated.
- Rules: each required part missing / doubled per container instance; a part not offered
  (`PaymentActions` on success) fails `part-placement`; `slot-rejects` for `CartLines` in `head`,
  `CartSummary` in `main`, `TrackingForm` in `result`; a `CartLines` inside `CartSummary.items`
  fails placement (nearest container is the summary); `AccountTabs` inside `OrdersList.content`
  fails placement; counting stops at nested containers; `hidden-required` for a hidden `Section`
  in `end` holding `HeaderBrand`, and **no** issue for a hidden `Header`.
- Upgrade: absent vs `[]` for every container of §8; `Header` legacy `search` / icons; `nav`
  untouched; idempotent; derived ids ≤ 64 and de-duplicated; golden markup (§12).
- Drawer: `CartSummary` outside `CartContents` goes to the footer; empty cart → no footer; a
  throwing published arrangement falls back to the default for the rest of the load, logged once.
- Preview states: `usePreviewState` is `null` without the editor provider; each container renders
  every state of §11.3 from fixtures without touching the network.
- Text: coverage and orphan tests green with the narrowed container patterns; no new key.

**Storefront e2e (Playwright, mocked; Northbound Supply page sets in `e2e/page-sets.ts`)**

- `dom-parity.spec.ts` unchanged, no snapshot regenerated; the rest of the suite unedited.
- New `e2e/shell-cart-account-parts.spec.ts`:
  - Header: cart moved to `start`, search removed, a `NavLinks` between brand and account; still
    sticky after scrolling (`top` 0) with the pinned notices under it; `sticky: false` scrolls away;
    menu variant with the filter button opening the category sheet; web-app back button outside
    Telegram; a document without `HeaderBrand` renders the default shell.
  - Cart: summary above the lines and a `RichText` between lines and summary on the phone page;
    the same arrangement in the desktop drawer with the summary still pinned in the footer and
    checkout completing; a document without `CartSummaryCheckout` renders the default cart; the
    empty cart shows `CartEmpty` in both surfaces; the web app cart shows the held note when blocked.
  - Account: tabs above the greeting; order detail with parcels before items; loyalty redeem still
    confirms through the modal; profile without the channels section still signs out; signed-out
    `/account/orders` still redirects to `/login?returnTo=`.
  - Sign-in heading below the methods; payment success with contact links removed; cancel with a
    back link added; order placed with the reference above the headline; tracking with the refresh
    button removed and a `RichText` above the parcels; verify with the back link above the form.
  - A v0.7.0-shaped shell with `search: false`, `cartIcon: 'hide'` renders no search and no cart
    icon; a v0.7.0 cart document with `CartSummary` outside `CartContents` renders it in the drawer
    footer.
  - No horizontal overflow at 360 px on each of these under every built-in template.
- `builder-editor.spec.ts`: header parts only on the shell document; drag `HeaderCart` into `start`
  → the change carries the new order; `HeaderBrand` has no delete; Parts list Add restores
  `HeaderSearch` in `middle`; switching the Header to the menu variant then Reset arrangement adds
  the filter; cart surface switch draws the drawer stage; Preview state "found (2 parcels)" shows
  the tracking result parts; opening a v0.7.0-shaped shell and editing posts full slots (never
  `[]`).

**Backend / admin** — no new tests; their standard gates run on the branch.

No test touches a live database, bucket, bot or deployed storefront; live verification after deploy
is a pending manual step (rearrange a test layout's header, cart and one account page, publish, check
under two templates on a phone, a desktop and in the Telegram web app).

## 14. Delivery

Storefront only, released with the branch as v0.8.0 (clients redeployed from the admin), after
stage 3's surfaces. In order:

1. Golden capture (§12) from the untouched v0.7.0 components.
2. `parts.ts` extensions (`offers`, `nests`, `slotRejects`), rules, `renderComponent`,
   `usePreviewState`, upgrade entries.
3. Header (views, container, parts, legacy headers as fixed compositions) → `dom-parity` green.
4. Cart: `CartSummary` nested container, `CartContents` container, drawer host → `dom-parity` green.
5. `AccountNav` and the five sections → green. 6. Sign-in, payment pages → green.
7. Tracking, verify → green. 8. Editor (palettes, allow lists, notices, preview states, cart
   surface switch, fixtures). 9. Docs.

`dom-parity.spec.ts` must pass after each surface, before the editor work starts.

Docs: `docs/builder.md` "Containers and parts" gains the stage-4 families, the `offers` / `nests` /
`slotRejects` extensions, the drawer rule and preview states; the Shell / Commerce / Post-order block
tables list the new slots; "PuckShell and the system mounts" notes that the drawer renders the cart
document. `docs/templates.md` gains the child-order note (§9). `web/public/blocks.json` regenerated.

## 15. Non-goals

Checkout and order status (stage 5); splitting `MobileCartBar`, `PrimaryActionBar`, the Footer's
template variant, `LoginModal`, the drawer's chrome or any leaf component of §6; a TopBar part or a
second pinned notice stack; per-part vertical spacing in the header; one shared account header
document for the five account pages (each keeps its own `AccountNav`, as in v0.7.0); a separate
drawer document; parts outside their containers (a lone "Checkout" button on a custom page);
simulating states for shoppers; any backend, admin or page-set shape change; new text keys.

## 16. Review focus — likely failure modes

1. **Parity leaks from conditional wrappers** — `div.page` on an empty cart, `div.body` on an empty
   order list, the `aria-busy` wrapper outside the found phase, `div.retry` around the form, the
   trailing space in `` `${action} ${iconClass}` ``. Only `dom-parity` and the golden captures catch
   these; no snapshot may be regenerated to "fix" one.
2. **Absent vs empty slots** — especially `Header.nav` (always present) versus `start` / `middle` /
   `end` (absent in every stored v0.7.0 shell). A `?? []` before `upgradeDoc` wipes the header of
   every store on its first autosave and trips `HeaderBrand`'s rule, which falls the whole shell
   back to default.
3. **Sticky and bar height** — any header part style or content that changes the row's height, or
   any wrapper added around `<header>`, breaks `position: sticky` and `--sf-bar-h` alignment of
   every sticky column head. BAR must not grow vertical keys.
4. **Drawer vs page** — the drawer must render the *guarded* cart document, not import the block
   through `lazy()` (a first-open suspense flash), must keep refresh-on-open, must fall back cleanly
   on a throw, and must not double-render a `CartSummary` placed outside `CartContents`.
5. **Nested containers** — counting must stop at `CartSummary` and at the account sections; a
   part's placement is decided by its *nearest* container; `blocked` must come from the cart family
   inside `CartContents` and from `useServerCart` outside it.
6. **State owned by the wrong layer** — the tracking state machine (effect order, token wait,
   stale-response guard), verify's "an edit drops the verdict", loyalty's modal and sign-out's
   hard navigation must stay in containers verbatim; a part that grows a `useState` or effect is a
   review failure.
7. **Preview states leaking** — `usePreviewState` must be `null` for shoppers under every entry
   point (normal load, exact preview outside the editor, version preview); fixture data must not
   enter the shopper bundle.
8. **Variant-dependent parts** — `HeaderFilter` in a storefront variant, `HeaderBack` outside the web
   app, the web app's native account link; views must branch on the resolved variant, not the
   layout, except where the table says layout.
9. **`offers` and required-per-container** — `PaymentActions` is required on two containers and not
   offered on the third; the Style group's `hide` and the rules must read the same table.
10. **Main-bundle growth** — header views are in the entry already; only the cart container view
    joins it. Anything else moving into the entry fails review.
11. **Account pages drifting apart** — five `AccountNav`s per layout can disagree after edits; that
    is the v0.7.0 model and a documented non-goal, but the editor's Parts list must make each
    document's state obvious.
