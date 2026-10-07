# Page builder

Renderer half of the page builder (v0.7.0). The editor half is at the end of this file
(`## The editor (/__builder)`). When this document and the code disagree, trust
`web/src/builder/{types,define,guard,rules,render,runtime}.ts(x)`; the block table below is
written by hand from `web/public/blocks.json` and the block files in `web/src/builder/blocks/`.

## What the page builder is

Templates own the look (tokens, parts, slots — see [`templates.md`](templates.md)); page
documents own structure: which blocks appear on a page, in which order, with which options. Every
page of every layout (`storefront`, `menu`, `webapp`) renders from a Puck-format document through
the storefront's own renderer (`web/src/builder/`), inside the store's template. Owners edit them
in Admin → Storefront → Pages; a page set is published as a whole, with a 20-version history.

With no published set (a store that never publishes, a backend older than v0.7.0, a 404/503 or a
malformed body) every page renders the built-in default document for its route, and the defaults
reproduce v0.6.0's DOM. `e2e/dom-parity.spec.ts` proves it against snapshots captured before the
builder touched any source.

## Data model

From `web/src/builder/types.ts`:

```ts
export type LayoutKind = 'storefront' | 'menu' | 'webapp';

export const FIXED_ROUTE_KEYS = ['catalog', 'product', 'cart', 'checkout', 'login', 'account.orders', 'account.order',
  'account.loyalty', 'account.referrals', 'account.profile', 'payment-success', 'payment-cancel',
  'order-placed', 'verify', 'tracking', 'reset-password', 'verify-email'] as const;
export type FixedRouteKey = typeof FIXED_ROUTE_KEYS[number];
export type RouteKey = FixedRouteKey | `page:${string}`; // slug /^[a-z0-9-]{1,60}$/
export type DocKey = RouteKey | 'shell';

export interface ComponentData { type: string; props: { id: string; [k: string]: unknown } }
export interface PageRootProps { title: string; description: string; chrome: 'shell' | 'none' }
export interface PuckDoc { root: { props: PageRootProps }; content: ComponentData[]; zones?: Record<string, ComponentData[]> }
export interface PageSet { schemaVersion: 1; shell: PuckDoc; pages: Partial<Record<RouteKey, PuckDoc>> }
export interface Issue { docKey: DocKey; rule: string; message: string; blockId?: string }
```

A page set is **sparse**: `shell` is required, `pages` holds only the routes the owner has
customised. A missing key means "the default document". Custom pages live under `page:<slug>` and
are served at `/pages/<slug>`. The root props are `title` (the tab title; empty leaves the store's
own), `description` (the meta description) and `chrome` (`'shell'`, or `'none'` for the chromeless
frame — no built-in page uses it now).

## How a page renders

1. **`usePageSet(layout)`** reads the published set through the public route
   `storefront/pages/:layout` (Worker-cached 30 s). It is read once per page load (`PAGES_QUERY`),
   and any failure yields `null`, meaning defaults. `fetchPageSet` passes `retry: 0`, so a 503 is
   one request rather than the shared client's two. A `PageSetOverrideProvider` (the editor)
   replaces it.
2. **`validateDoc(doc, docKey, layout)`** (`guard.ts`) cleans the stored document (memoised per
   doc object and key). See "The guard" below.
3. **`RenderDoc`** (`render.tsx`) renders the cleaned content. It adds no wrapper elements; each
   block has its own `BlockBoundary` that renders nothing when the block throws. A route block that
   throws escalates to the page-level `DocBoundary`, which renders that route's default document.
4. While the set is loading, `PuckPage` shows the inline `PageSkeleton` and `PuckShell` shows
   `PageSkeleton` (or the chromeless skeleton when the matched route's default document is
   `chrome: 'none'`) instead of painting the default and swapping it a moment later.

### The guard

`validateDoc` never throws. It drops, with informational issues:

| Issue id | Cause |
|---|---|
| `drop:shape` | a child that is not `{ type, props: { id } }` |
| `drop:unknown-block` | a `type` this release does not register (saved by a newer release, or removed); one console warning per type |
| `drop:layout` | a block not available in the current layout |
| `drop:depth` | nested deeper than 12 |
| `drop:too-many` | beyond 2 000 blocks in a document |

Props are parsed with the block's schema, whole object first, else field by field onto the block's
defaults. Duplicate ids are re-keyed (`id~2`). Root props are parsed field by field. The number of
drop issues is capped at 50. Then `checkRules` runs, and **any rule violation replaces the whole
document with the route's default** (the violations are returned as issues so the editor can show
them). A document that is not an object also falls back.

### PuckShell and the system mounts

`PuckShell` replaces the per-layout shell switch: the layout's frame (`StorefrontFrame`,
`MenuFrame`, `WebAppFrame`) around the shell document, where `PageOutlet` renders the current
route. The frame supplies the system mounts, which are not blocks and cannot be removed:
first-paint theme, `CartDrawer`, `LoginModal`, Telegram chrome and `PrimaryActionBar`, the
preview listener, the template's `Overlay` slot, and the per-route document title. The phone cart
bar is a block (`MobileCartBar`) owners may place; **when the shell document on screen contains
none, the frame mounts it itself** (the safety net; it also applies when a published shell has
crashed and the default shell is showing). A page whose root says `chrome: 'none'` gets the
chromeless frame (`Chromeless`: brand header only, no shell) instead.

The `CartDrawer` mount renders the layout's **cart document**, not a fixed panel: it resolves the
guarded `cart` document, finds its one `CartContents` and renders it with `renderComponent` inside a
`CartHostContext` whose `frame()` builds the drawer's `Sheet` from the container's `main` region
(body) and `summary` region (pinned footer). Content blocks at the document root and in `head` are
page-only. The panel module is requested when the shell first mounts the drawer and registers the
cart views, so opening the drawer never suspends. A throw inside the published arrangement falls
back to the default cart document for the rest of the page load.

## The block contract

`defineBlock<P>` (`define.ts`) takes:

- `name` (the registry key, equal to the file name), `label`, `category`
  (`shell | catalogue | product | commerce | post-order | content`), `layouts`
  (`LayoutKind[] | 'all'`) and `routeBound`.
- `slots`: the prop names holding `ComponentData[]`. A slot prop arrives at render as a
  `SlotRender` function: called with no argument it renders the children with no wrapper; pass
  `{ className, style, as }` to get one wrapper element. Slots are declared as required arrays.
- `schema` (zod, every prop except `id`) and `defaultProps`.
- `render(props & { puck: { editing, docKey, layout, style? } })`.
- `style` (**required**): `false`, or `{ target: 'root' | 'wrap' | 'pass', keys }` — see *Block
  styling*. Build it with `styleSupport(target, include, exclude)` from `@/builder/style/model.ts`.

Conventions:

- `render` returns JSX of an inner component and never calls hooks itself (the editor may call it
  as a plain function).
- Prop naming: `*Html` — richtext strings sanitised by `sanitizeRichtext` (DOMPurify; allowed tags
  `p h2 h3 h4 strong em u s a ul ol li blockquote br code`); `href` / `*Href` — route links
  (`routeLink()`: empty, a site path, or `https:`/`mailto:`/`tel:`; never `//host` or `/\host`,
  never control or whitespace characters); `src` / `*Src` — **uploaded media only**
  (`/media/storefront-pages/media/<32 hex>.<png|jpg|webp|gif>` or empty); `*Token` — palette
  colours (`paletteToken()`); `productId` / `categoryId`; `items: Array<{ productId }>`.
- Richtext links go through the same href rule inside `sanitizeRichtext`; richtext never carries
  images (media is only the `Image` block or an `imageSrc`).
- No `{ type, props }` objects inside non-slot arrays: only slots hold child blocks.
- Owner-selectable spacing props use the `SPACING` scale (`none xs sm md lg xl`).
- Content blocks mark their root with `data-sf-block="<Name>"`.
- Heavy components load behind `lazy()`; mobile rules are those of `templates.md` §7.

**Adding a block:** create `web/src/builder/blocks/<Name>.tsx` exporting `block` — the registry
globs the directory; add a unit test; regenerate `blocks.json`
(`UPDATE_BLOCKS_JSON=1 npm --prefix web test -- test/blocks-manifest.test.ts`). Decide its rules
(`rules.ts`) and, if it is a route block, its default in `defaults/groups/*.ts`.

## Block library

The 47 blocks of this release. "All" layouts = storefront, menu and webapp. Slots are marked
*(slot)*.

### Shell

| Block | Layouts | Route-bound | Props |
|---|---|---|---|
| `PageOutlet` | all | yes (`shell`) | none — renders the current route |
| `Header` | all | no | `variant` (auto/storefront/menu/webapp), `topBar`, `sticky`, `start`, `nav`, `middle`, `end` *(slots; `HeaderBrand` required)*; legacy `search`, `accountIcon`, `cartIcon` (inherit/show/hide) are read only when the slots are absent |
| `TopBar` | storefront, menu | no | none — the template's `TopBar` slot |
| `NavLinks` | all | no | `items` (`{ label, href }`, up to 12), `ariaLabel`, `direction` (row/column) |
| `NoticeBanners` | all | no | `pinned` |
| `CutoffBar` | all | no | none |
| `ContactStrip` | all | no | `catalogOnly` |
| `MobileCartBar` | storefront, menu | no | none |
| `Footer` | storefront, menu | no | `variant` (template/columns), `columns` (1-4), `colophon`, `col1`–`col4` *(slots)* |

### Catalogue

| Block | Layouts | Route-bound | Props |
|---|---|---|---|
| `ProductGrid` | all | yes (`catalog`) | `categoryPicker`, `pageTitle`, `intro`, `sku` (each inherit/show/hide) |
| `ProductList` | all | yes (`catalog`) | same four overrides |
| `WholesaleTable` | all | yes (`catalog`) | same four overrides |
| `CatalogHero` | all | no | `variant` (template/custom), `surface` (auto/grid/list/wholesale), `title`, `bodyHtml`, `imageSrc`, `imageAlt`, `align` |
| `CategoryNav` | all | no | none |
| `SearchField` | all | no | `placeholder` |
| `FeaturedProducts` | all | no | `title`, `source` (picked/category), `items` (`{ productId }`, up to 24), `categoryId`, `limit` |
| `Upsells` | all | no | `productId` (null = the product on the current route) |

### Product

| Block | Layouts | Route-bound | Props |
|---|---|---|---|
| `ProductDetail` | all | yes (`product`) | `gallery`, `bulkPricing`, `provenance`, `upsells`, `sku` (inherit/show/hide) |

### Commerce

| Block | Layouts | Route-bound | Props |
|---|---|---|---|
| `CartContents` | all | yes (`cart`) | `head`, `main`, `summary` *(slots; `CartHeading`, `CartLines`, `CartEmpty` required)* |
| `CartSummary` | all | yes (`cart`) | `items` *(slot; `CartSummarySubtotal`, `CartSummaryCheckout` required)* |
| `CheckoutFlow` | all | yes (`checkout`) | none |
| `LoginOptions` | all | yes (`login`) | `content` *(slot; `LoginHeading`, `LoginMethods` required)* |
| `AccountNav` | all | no (placement `account.*`) | `head`, `body` *(slots; `AccountGreeting`, `AccountTabs` required)* |
| `OrdersList` | all | yes (`account.orders`) | `content` *(slot; `OrdersRows`, `OrdersEmpty` required)* |
| `OrderDetail` | all | yes (`account.order`) | `content` *(slot; `OrderHeading`, `OrderItems` required)* |
| `Loyalty` | all | yes (`account.loyalty`) | `content` *(slot; `LoyaltyPoints`, `LoyaltyRewards` required)* |
| `Referrals` | all | yes (`account.referrals`) | `content` *(slot; `ReferralCode` required)* |
| `Profile` | all | yes (`account.profile`) | `content` *(slot; `ProfileSignOut` required)* |

### Post-order

| Block | Layouts | Route-bound | Props |
|---|---|---|---|
| `PaymentSuccess` | all | yes (`payment-success`) | `content` *(slot; `PaymentHeadline`, `PaymentReference` required)* |
| `PaymentCancel` | all | yes (`payment-cancel`) | `content` *(slot; `PaymentHeadline`, `PaymentActions` required)* |
| `OrderPlaced` | all | yes (`order-placed`) | `content` *(slot; `PaymentHeadline`, `PaymentReference`, `PaymentActions` required)* |
| `VerifyForm` | all | yes (`verify`) | `content` *(slot; `VerifyIntro`, `VerifyFields`, `VerifyResult` required)* |
| `TrackingLookup` | all | yes (`tracking`) | `top`, `main`, `result` *(slots; `TrackingIntro`, `TrackingState`, `TrackingForm`, `TrackingHero`, `TrackingParcels` required)* |
| `ResetPassword` | all | yes (`reset-password`) | `content` *(slot; `ResetPasswordHeading`, `ResetPasswordForm` required)* |
| `VerifyEmail` | all | yes (`verify-email`) | `content` *(slot; `VerifyEmailHeading`, `VerifyEmailStatus` required)* |

### Content

| Block | Layouts | Route-bound | Props |
|---|---|---|---|
| `Heading` | all | no | `text`, `eyebrow`, `level` (h2/h3/h4), `align` |
| `RichText` | all | no | `bodyHtml`, `width` (narrow/full) |
| `Image` | all | no | `src`, `alt`, `caption`, `width` (narrow/rail/full), `aspect` (auto, 1/1, 4/3, 16/9) |
| `Button` | all | no | `label`, `href`, `variant` (filled/default/subtle), `align` |
| `Divider` | all | no | `spacing`, `toneToken` (line/line-strong) |
| `Spacer` | all | no | `size` |
| `Columns` | all | no | `columns` (2-4), `stackBelow` (sm/md/lg), `gap`, `col1`–`col4` *(slots)* |
| `Section` | all | no | `padding`, `backgroundToken`, `textToken`, `width` (rail/full), `content` *(slot)* |
| `FAQ` | all | no | `title`, `items` (`{ question, answerHtml }`, up to 30) |
| `Testimonial` | all | no | `quote`, `author`, `detail` |
| `Video` | all | no | `provider` (youtube/vimeo), `videoId`, `title` |

The route blocks are the only place checkout, cart, sign-in and account behaviour lives; they are
self-contained, so an edit around them cannot break a flow.

## Text layer (editable text)

Every line of shopper-facing text the storefront writes itself — headings, buttons, labels,
screen-reader names, empty and error states, validation messages — is a key in a registry, and
the owner can reword it in the editor's Text panel. Data (product, category and method names),
owner content (brand, notices, block props such as a `Button`'s label), backend messages shown
verbatim, and the editor's and admin's own UI are not text-layer keys. With nothing published the
DOM is byte-identical to v0.7.0.

### The registry

`web/src/text/keys/<area>.ts` — one file per area, in Text-panel order: `common`, `shell`,
`catalog`, `product`, `cart`, `checkout`, `auth`, `account`, `order`, `payment`, `tracking`,
`verify`, `wholesale`, `webapp`, `notices`, `errors`, `templates`, `closed`, `boot`. Each file is
`defineTextArea('<area>', { '<part>.<name>': entry })`; `registry.ts` merges them into `TEXT`.

- **Key shape**: `<area>.<part>.<name>`, 2–6 dot-separated segments, camelCase, at most 100
  characters (`KEY_RE`, identical to the backend's). `-` appears only inside template ids
  (`templates.dark-luxury.footer.support`). Template slot copy is keyed per template:
  `templates.default.*` for the built-in slots, `templates.<id>.*` for each template.
- **Entry**: `en` (the default: a string, or plural forms `{ one, other }`), `note` (required —
  where the line appears, in shopper words; for error and empty states, when it shows), `label?`
  (else derived from the last segment), `max?` (default 200, never above 1000) and `fixed?`.
- **Defaults are the rendered string**: entities decoded, JSX whitespace collapsed as React
  does, typographic characters (`’ — … ←` and U+00A0) copied, never retyped.
- **Placeholders** are `{name}` (`[A-Za-z][A-Za-z0-9]{0,31}`), at most 10 per key; no other `{` or
  `}` may appear. Plural keys get `{count}` from `tp`.
- **Fixed keys**: everything under `closed.*` and `boot.*` (and nothing else) is `fixed: true` —
  read through the same API, never editable, because those screens render before or without the
  published text.
- **One key per meaning**: shared wording (Try again, Close, Subtotal, Remove {name}, …) lives in
  `common.*`; an area reuses it rather than registering a copy.

### Reading text

- **Components**: `const { t, tp, tn, msg } = useText();` at the top of the component (never in a
  block's `render`, which must not call hooks — call it in the inner view).
  - `t('cart.drawer.title')`, `t('common.qty.remove', { name })` — a string; params are required
    exactly when the key has placeholders (type-checked).
  - `tp('cart.summary.items', n)` — plural by `Intl.PluralRules`; inserts `String(n)` as `{count}`.
    Only an `n === 1` ternary becomes a plural key; other conditions stay two string keys.
  - `tn('account.orders.balanceDue', { amount: <Money amount={due} /> })` — a sentence that embeds an
    element; returns strings and keyed fragments, so the serialised DOM is unchanged.
  - `msg(value)` — renders component state that holds either a key (stored with `textKey(…)`) or
    a backend message: a registered string key resolves, anything else passes through verbatim.
- **Outside React** (`lib/errors.ts`, `api/client.ts`, status helpers, zod messages):
  `textSnapshot().t(…)` from `@/text/snapshot.ts`, read **at call time** — never at import time,
  never in a module-level constant. Module-scope maps hold keys (`textKey('…')`) so the orphan
  check sees each literal. zod messages use the function form:
  `.min(1, { error: () => textSnapshot().t('checkout.errors.required') })`. Pass error
  fallbacks as `errorMessage(err, t('<area>.errors.<name>'))`.
- **The snapshot rule**: `textSnapshot()` is the *deepest mounted* provider's text, read when
  called. Reading it during a render — directly or through a helper — is only fresh if that
  component re-renders on a text change, i.e. it also calls `useText()`; a `useMemo` that reads it
  must list that `t` in its deps. Prefer passing `t` into helpers (`groupProducts(visible, tree, t)`,
  `defaultPrimaryAction(input, t)`) and rendering from key maps (`t(shipmentLabelKey(status))`).
  `test/text-snapshot-guard.test.ts` enforces this; a reviewed exception carries
  `// text-snapshot-ok: <reason>` on or above the line.
- **What the snapshot guard does not catch** (review for these by hand):
  - *Subscribed but not nearest.* A component that calls `useText()` passes the guard even if it
    also reads the snapshot. It re-renders on a change, but the snapshot is the *deepest* provider,
    not its nearest — wrong when providers nest (the editor frame inside the app). Pass the `t` from
    `useText()` instead (`statusView(order, t)`, `orderStatusLabel(status, t)`).
  - *Arrow functions inside render.* Only a component or hook body and its `useMemo` callbacks count
    as render; every other nested function is treated as call-time, so a read in
    `{rows.map((o) => orderStatusLabel(o.status))}` is not flagged.
  - *Render helpers not named like components.* Only functions bound to a `Capitalised` or `useX`
    name are scanned; a `renderRow()` helper called from JSX is not.
  - *Imports it cannot follow.* Readers are matched by name across `web/src` (no scope analysis):
    namespace (`import * as s`) and default imports are not followed, and a local that shadows a
    reader's name is treated as the reader.
  - *Memo deps by name.* The `useMemo` check only looks for an identifier `t` in the deps array; a
    renamed binding (`const { t: text } = useText()`) or `t` passed under another name is not
    recognised either way.
- `@/text/snapshot.ts` imports nothing outside `@/text/*`, so importing it never enters the
  `runtime → builder/published → api/client → lib/errors` cycle; `runtime.tsx` re-exports it for
  components. Non-React modules import it directly.
- Template slot components (including external templates) import `useText` from
  `@/templates/contract.ts`.

### Resolution

`TextProvider` (app level) reads the published text of the effective layout from the page-set
response (`GET storefront/pages/:layout` carries `text` — no extra request); the editor and the
version preview inject theirs through `PageSetOverrideProvider`'s `text`. For each key: the
layout's override for the store language, then the shared value, then the built-in English. A
stored value is ignored (with one console warning) when it fails `checkValue`: unknown key, string
vs plural mismatch, a placeholder the key doesn't offer, a stray brace, empty, longer than `max`,
or a fixed key. The provider also sets `<html lang>` and the **format profile**: English with
built-in formatting keeps every v0.7.0 per-call-site locale (money `en`, dates `en-GB`, …); any
other language (or an explicit *Numbers and dates* locale) formats money, dates, numbers and
country names in that locale, falling back to the legacy profile when `Intl` rejects it.

### Blocks and the Text panel

`BlockDef.text` lists the keys a block renders — exact keys or `area.part.*` prefixes
(`OrderPayments: ['order.*', …]`, `Header: ['shell.header.*', 'catalog.search.*', …]`); the
editor shows them under **Text in this block**. Template-slot patterns shared by several blocks
live in `builder/blocks/_shared/text-patterns.ts` (`HERO_TEXT`, `FOOTER_TEXT`, `TOP_BAR_TEXT`, …).
Keys of mounts that belong to no block — cart drawer, login modal, phone cart bar safety net,
Telegram chrome, not-found page, error fallbacks — and `common.*` form the **Site-wide** group
(`SITE_WIDE_TEXT` in `text/site-wide.ts`). `BlockDef.textProps` maps an owner prop to a key it
falls back to when blank (`SearchField: { placeholder: 'catalog.search.placeholder' }`; render
uses `prop.trim() || t(key)`).

### The guard

- `test/text-guard.test.ts` scans every file under `web/src` (except `builder/editor/**` and
  `text/keys/**`) for shopper text outside the registry: JSX text; text attributes (`aria-label`,
  `title`, `placeholder`, `alt`, `label`, `eyebrow`, …); literal JSX children and branches,
  including a same-file `const` rendered as `{label}`; messages passed to `setErrors`,
  `errorMessage`, `notifications.show` and zod; message-like object properties; and
  sentence-like literals anywhere else — including messages of app error classes (`ApiError`),
  which `errorMessage` shows. Exempt: code positions, built-in `Error` messages, non-text props
  (`className`, `color`, `path`, …), and a `defineBlock`'s `label`, `defaultProps`, `text` and
  `textProps`.
- Exceptions live in `test/text-guard.allow.ts` as `{ file, text, reason }` (`text: '*'` for a
  whole editor- or admin-only file); a stale entry fails the test.
- `test/text-inventory.test.ts` checks every v0.7.0 literal (`test/helpers/text-inventory.json`)
  still occurs, character-exact, in some default.
- `test/text-registry.test.ts` checks key shape and area, `fixed` exactly on `closed.*`/`boot.*`,
  every default against `checkValue` and its `max`, a note on every key, no orphan (every
  non-fixed key appears as a literal under `web/src`), and that every non-fixed key is covered by
  a block's `text` or `SITE_WIDE_TEXT` (with no dead pattern).

### Adding a string

1. Add the key to its area file with a `note` (and a `max` for short labels):
   `'drawer.title': { en: 'Your cart', note: 'Heading of the slide-out cart', max: 60 }`.
2. Render it with `t('cart.drawer.title')` (or `tp`/`tn`/`msg`; `textSnapshot().t` outside React).
3. Make sure a block's `text` (or `SITE_WIDE_TEXT`) covers it.
4. Run `npm --prefix web test -- test/text-guard.test.ts test/text-registry.test.ts test/text-snapshot-guard.test.ts`.

## Block styling

Owners can give most blocks a background, spacing, a border, corners, a shadow, a text colour and
size, alignment, a maximum width, or hide them on phones or on desktop. Everything is a token or a
step on the app's fixed scale — never a raw colour or length — so a template or preset switch
restyles styled blocks in the new template's voice.

### The `blockStyle` prop

A component stores it beside its other props (`style/model.ts`, runtime-safe):

```json
{ "type": "Heading", "props": { "id": "h-1", "text": "Wholesale enquiries", "level": "h2",
  "blockStyle": { "bg": "surface-2", "padTop": "lg", "padBottom": "lg", "radius": "card" } } }
```

| Key | Values |
|---|---|
| `bg`, `fg`, `borderColor` | a palette token: `bg bg-deep surface surface-2 surface-3 line line-strong text muted faint primary primary-soft success warn danger` |
| `padTop`, `padBottom`, `padX`, `marginTop`, `marginBottom` | the `SPACING` scale: `none xs sm md lg xl` |
| `border` | `thin medium thick` |
| `borderStyle` | `solid dashed dotted` |
| `radius` | `none sm md lg card pill` |
| `shadow` | `card raised` |
| `textSize` | `sm lg xl` |
| `align` | `start center end` |
| `maxWidth` | `narrow text wide` |
| `hide` | `mobile desktop` |

- **Absent means the template default.** An absent `blockStyle`, `{}` and "every key absent" render
  identically (nothing added). The editor and the guard never write `{}` — an empty result removes
  the prop.
- **`none` is a real value** for spacing and radius (zero, overriding the block's own), distinct
  from absent.
- `borderColor` / `borderStyle` without `border` are kept but do nothing.
- `hide` has one value, so "hidden everywhere" cannot be expressed — delete the block instead.
- Keys are written in `STYLE_KEY_ORDER` — `bg fg padTop padBottom padX marginTop marginBottom border
  borderColor borderStyle radius shadow textSize align maxWidth hide` (the key order of `STYLE_KEYS`,
  not the grouping of the table above) — so diffs stay quiet.
- `STYLE_KEYS` is mirrored by the backend's `BLOCK_STYLE_VALUES` (`storefront-pages/schemas.ts`) —
  change both, backend first.

### What each value does

| Key | CSS on the target |
|---|---|
| `bg` | `background: var(--sf-<token>)` (replaces a gradient too). Without `padX` it also adds `padding-inline: 1rem`, the inset Section's tinted band uses, so text never touches the tint (not on a part element such as the header, nor on `WholesaleTable`, whose cart bar is a full-bleed band). |
| `fg` | `color: var(--sf-<token>)` and `--sf-block-fg: var(--sf-<token>)` |
| `padTop` / `padBottom` / `padX` | `padding-block-start` / `padding-block-end` / `padding-inline` = `SPACING[step]` (`none 0, xs .5rem, sm 1rem, md 1.5rem, lg 2.5rem, xl 4rem`) |
| `marginTop` / `marginBottom` | `margin-block-start` / `margin-block-end` = `SPACING[step]` |
| `border` | `border: <1px \| 2px \| 4px> var(--sfs-bs, solid) var(--sfs-bc, var(--sf-line))` |
| `borderColor` / `borderStyle` | set `--sfs-bc` / `--sfs-bs` |
| `radius` | `none 0`, `sm/md/lg var(--mantine-radius-*)`, `card var(--sf-card-radius)`, `pill var(--sf-pill-radius)`; never clips (`overflow` is never set) |
| `shadow` | `card var(--sf-card-shadow)`, `raised var(--sf-card-shadow-hover)` |
| `textSize` | `--sf-text-scale: <.875 \| 1.125 \| 1.25>` |
| `align` | `text-align`; with `maxWidth` also places the box (`center` → `margin-inline: auto`, `end` → `margin-inline-start: auto`) |
| `maxWidth` | `max-width: min(<36rem \| 68ch \| 60rem>, 100%)` |
| `hide` | `display: none !important` below 62em (`mobile`) or from 62em (`desktop`) — the breakpoint of `.sf-hide-mobile` / `.sf-hide-desktop`. A hidden `Header` also zeroes the shell's `--sf-bar-h` / `--sf-pin-h` at that breakpoint (as `sticky: false` does), so sticky page heads come to rest at the top; its pinned notices go with it |

Every styled target also gets `box-sizing: border-box; min-width: 0` and resets `--sfs-bc` /
`--sfs-bs` to `initial`, so a nested block never inherits its parent's border colour.
`--sf-block-fg` and `--sf-text-scale` are **meant** to inherit: the `fg` colour (`--sf-block-fg`) and
the text scale set on a Section or Columns flow into the text blocks inside it — a Section set to a
large text size enlarges the Headings and RichText inside it — and a nested block's own setting wins.

**Text blocks read the variables.** A block that offers `fg` / `textSize` and owns its text writes
`color: var(--sf-block-fg, <token>)` and `font-size: calc(<size> * var(--sf-text-scale, 1))`. Unset,
both compute to exactly the old values. Secondary text (eyebrows, captions, testimonial detail)
keeps its own muted colour and only scales. Interactive rows keep `min-height: 44px` whatever the
scale.

### Targets and per-block support

`BlockDef.style` is required: `false`, or `{ target, keys }`.

- `root` — the block spreads `{...puck.style}` onto the element it owns (spreading `undefined` adds
  nothing, so the JSX needs no branch).
- `wrap` — `renderBlock` puts one `<div>` carrying the attributes around the block's render. A wrap
  block that renders nothing leaves an empty div, which the stylesheet hides (`:empty`).
- `pass` — as `root`, but the block forwards `puck.style` (as a `styleAttrs` prop) to a named inner
  element.

Key sets: **BOX** = `bg padTop padBottom padX marginTop marginBottom border borderColor borderStyle
radius shadow maxWidth`; **TEXT** = `fg textSize align`; **VIS** = `hide`.

| Block | Target | Keys | Why |
|---|---|---|---|
| `Section` | root | BOX − `bg padTop padBottom maxWidth` + `textSize align` + VIS | its own background, text colour, padding and width props stay |
| `Heading` | root | BOX + `fg textSize` + VIS | own `align` |
| `RichText` | root | BOX − `maxWidth` + TEXT + VIS | own `width` |
| `Image` | root | BOX − `maxWidth` + VIS | own `width` |
| `Button` | root | BOX + VIS | own `align`; the label is the template's `button` part |
| `Divider` | root | `maxWidth align` + VIS | own `spacing` / `toneToken` |
| `Spacer` | root | VIS | its size is the block |
| `Columns`, `FAQ`, `Testimonial`, `NavLinks` | root | BOX + TEXT + VIS | |
| `Video`, `CatalogHero`, `CategoryNav`, `SearchField`, `FeaturedProducts` | root | BOX + VIS | no text controls (template slots; inputs stay 16px) |
| `Upsells`, `TopBar`, `NoticeBanners`, `CutoffBar`, `Footer` | wrap | BOX + VIS | no single root the block owns |
| `ContactStrip` | pass → the strip element | BOX + VIS | the strip is `position: sticky; bottom: 0`; a wrapper sized to it would stop it sticking |
| `Header` | pass → `<header data-sf-part="header">` | `bg shadow` + VIS | a wrapper would end `position: sticky`; padding or a border would change `--sf-bar-h` |
| The 20 route-bound blocks (`ProductGrid` … `VerifyEmail`) and `AccountNav` | wrap | BOX | never `hide`, never TEXT |
| `WholesaleTable` (route-bound) | wrap | `bg padTop marginTop marginBottom shadow` | its `WholesaleBar` is a sticky full-bleed band: side padding, bottom padding, borders, corners and a max width would offset or clip it |
| `PageOutlet` | — | `false` | it is the page: hiding it hides every route, padding doubles `<main>`'s, a wrapper breaks `flex: 1` |
| `MobileCartBar` | — | `false` | fixed-position; hiding it would remove the phone checkout path |

`CatalogHero` in its `template` variant renders the template's hero slot, which owns no element the
block can mark: when (and only when) styled it gets one `<div>` carrying the attributes.
`NavLinks` and `Testimonial` align through `data-sfs-align` rather than an own prop.

**Allowlists only grow.** A later release may add keys to a block, never remove them — removing
turns stored styles into blocking issues in every store. `test/builder-style-contract.test.tsx`
pins today's lists as a floor.

### Rendering

`renderBlock` (`style/apply.tsx`) is the only caller of `def.render` — the shop, the exact preview
and the editor canvas all go through it, so they cannot disagree. `styleAttrs(def, style, editing)`
re-checks the allowlist and each value (the canvas hands it props the guard never saw) and returns
`null` when nothing applies; `renderBlock` then makes the exact unstyled call (same `puck` object),
so an unstyled page's DOM is byte-identical to one built before styling existed. Otherwise it
emits `data-sf-style="<Block>"` plus one attribute per key: `data-sfs-bg`, `-fg`, `-pt`, `-pb`,
`-px`, `-mt`, `-mb`, `-border`, `-bc`, `-bs`, `-radius`, `-shadow`, `-text`, `-align`, `-max`, and
`data-sfs-hide` — or `data-sfs-ghost` on the editor canvas (`editing: true`), where the editor's CSS
shows a hidden block ghosted at the matching width so it can still be selected. Styling is
attribute-only; no `className` is ever touched.

### The stylesheet

`style/block-style.css` is **generated** by `renderBlockStyleCss()` (`style/css.ts`) and checked in;
`test/block-style-css.test.ts` fails when it is stale
(`UPDATE_BLOCK_STYLE_CSS=1 npm --prefix web test -- test/block-style-css.test.ts` rewrites it). It
is imported once, in `main.tsx`. Every per-value rule is `:root:root [data-sf-style][data-sfs-<key>="<value>"]`
— specificity **(0,4,0)**, above module classes and template part rules (0,3,0), so an owner's
choice is what the shopper sees. It has no transitions or animations.

**Phones.** Below 48em spacing `lg` / `xl` (padding and margins) drop to 1.5rem / 2.5rem, `padX`
`md`–`xl` to 1rem, `textSize: xl` to 1.125, and a third nested `padX` level to 0. `maxWidth` is
always `min(…, 100%)`. `hide` uses 62em (the editor labels it "Hide below 992 px" / "Hide from
992 px").

### Guard and rules

The guard parses `blockStyle` beside the schema (`parseBlockStyle`, called from
`parseBlockPropsDetailed`): an unknown key drops silently (forward compatibility); a key the block
does not accept, or a value outside its list, drops with `field:<Block>.blockStyle.<key>`; a
non-object is `field:<Block>.blockStyle`. Field issues keep the page rendering (the key is just not
applied) and block Publish.

`hidden-required:<Block>` (see *Rules*) closes the last way `hide` could remove a flow: required
blocks cannot carry `hide`, and nothing that carries it may hold them. It fires per hidden
container, even when a visible copy of the required block exists elsewhere, so a mobile-only list
beside a desktop-only grid is not possible.

### Editor

Every stylable block's fields end with a collapsible **Style** group (`editor/custom-fields/style.tsx`,
appended last by `blockFields`), built only from the block's allowed keys: colours as the palette
swatches, spacing as `0 · XS · S · M · L · XL` chips, corners, shadow, text size, alignment, max
width and visibility. Every row starts at "Default" (absent) with its own reset, **Reset style**
clears the group in one undo step, and a contrast hint shows under 4.5 : 1 (it compares `fg` against
the block's `bg` token, or `--sf-bg` when none is set; the block's real background — a Section band,
a template surface — is not probed). The Header's Visibility row warns that hiding the header hides its pinned
notices too (and the cart and back buttons in the Telegram web app layout). `prepareProps`
normalises `blockStyle` (unknown / disallowed / invalid keys dropped, canonical order, `{}`
removed) before a change is posted.

## Containers and parts

The product page, the product sheet, the catalogue grid and list, the product card and row, the
header, the cart, the account pages, the sign-in page, the payment pages, order tracking and
verification are not single blocks any more: each is a **container** that owns the data, with **parts** that each
draw one piece of it (the title, the price, the add button …). An owner can reorder parts, wrap them
in content blocks, drop optional ones and style each one; the default arrangement of every container
renders byte-for-byte the markup of v0.7.0.

### The pattern

- **The container owns the data.** It keeps the queries, the selected state and the loading, error
  and not-found states (unchanged markup, drawn before any slot). Parts cannot fetch, mutate or
  navigate, so an arrangement changes what a shopper *sees*, never what a purchase *does*.
- **Parts are shells.** A part block's `render` is always
  `(p) => <Family.PartHost name="<Block>" props={p} styleAttrs={p.puck.style} />`. `PartHost` reads
  the family context and draws the container's view for that name; with no container above it
  (impossible after the guard, possible mid-drag in the editor) it renders `null`.
- **Views travel through context.** The container wraps its output in
  `Family.Provider value={{ data, views }}`, where `views` is a static map in the container's own
  lazy chunk. Block files are globbed into the entry bundle by the registry: if a part imported its
  view, the product page would move into the entry; if each part used `lazy()`, every part would
  suspend once and flash. The container stays the **only lazy boundary**, as before, and parts
  render in the same commit as their container.

Files:

| File | What it holds |
|---|---|
| `builder/parts.ts` | runtime-safe contract: `PartFamily`, `ContainerSpec`, `createFamily` (`Provider`, `useData`, `PartHost`), `slotShows`, `containsType`, `partId` / `part` / `group` helpers, `fixedSlot`, `FAMILY_DOCS` + `familyAllowedOn` |
| `builder/families.ts` | the four families (`ProductFamily`, `CatalogueFamily`, `CardTileFamily`, `CardRowFamily`), their data types, the slot types, and `ProductHostContext` (type-only feature imports — it is in the entry) |
| `builder/blocks/_shared/product-container.ts`, `catalogue-container.ts`, `card-containers.ts` | each container's `ContainerSpec`: `defaultSlots`, `required`, `unique`, `requires`, `slotAccepts`, `legacyProps`, `insertSlot` |
| `builder/blocks/<Part>.tsx` | one block per part (`category: 'part'`, `part: { family }`, `slots: []` except groups) |
| `features/catalog/product-parts.tsx` | product views shared by page and sheet (breadcrumbs, groups, …) and `productData()` |
| `features/catalog/ProductDetailPage.tsx` / `ProductDetailSheet.tsx` | `PAGE_VIEWS` / `SHEET_VIEWS` and the two surfaces; the sheet body is `ProductSheetBody` |
| `features/catalog/ProductGrid.tsx` / `ProductList.tsx` / `catalogue-parts.tsx` | `GRID_VIEWS` / `LIST_VIEWS` and the shared catalogue views |
| `features/catalog/ProductCard.tsx` / `ProductRow.tsx` | `TILE_VIEWS` / `ROW_VIEWS` and the built-in compositions |

`BlockDef` gains `container?: ContainerSpec` and `part?: { family }` (never both), and
`BlockCategory` gains `'part'`. A `SlotRender` carries the stored children as `.items`, so a
container can choose classes from what a slot holds (`layoutNoImage`, `noNav`) without rendering it.

### Stage 4 families (shell, cart, account, order pages)

Stage 4 reuses the same pattern for more surfaces; the container still owns the data and parts are
shells. The families, their containers and the documents they live on:

| Family | Container(s) | Document(s) | Required parts |
|---|---|---|---|
| `header` | `Header` | `shell` | `HeaderBrand` |
| `cart` | `CartContents` | `cart` | `CartHeading`, `CartLines`, `CartEmpty` |
| `cart-summary` | `CartSummary` (nested in `CartContents`) | `cart` | `CartSummarySubtotal`, `CartSummaryCheckout` |
| `account` | `AccountNav` (nests the five sections) | `account.*` | `AccountGreeting`, `AccountTabs` |
| `orders` | `OrdersList` | `account.orders` | `OrdersRows`, `OrdersEmpty` |
| `order` | `OrderDetail` | `account.order` | `OrderHeading`, `OrderItems` (optional: `OrderBackLink`, `OrderBalance`, `OrderAddress`, `OrderParcels`, `OrderPayments`) |
| `loyalty` | `Loyalty` | `account.loyalty` | `LoyaltyPoints`, `LoyaltyRewards` |
| `referrals` | `Referrals` | `account.referrals` | `ReferralCode` |
| `profile` | `Profile` | `account.profile` | `ProfileSignOut` (`ProfilePassword` is an optional part: it draws nothing while the shop has password sign-in off) |
| `login` | `LoginOptions` | `login` | `LoginHeading`, `LoginMethods` |
| `payment` | `PaymentSuccess`, `PaymentCancel`, `OrderPlaced` | `payment-success`, `payment-cancel`, `order-placed` | per container (see the block table) |
| `tracking` | `TrackingLookup` | `tracking` | `TrackingIntro`, `TrackingState`, `TrackingForm`, `TrackingHero`, `TrackingParcels` |
| `verify` | `VerifyForm` | `verify` | `VerifyIntro`, `VerifyFields`, `VerifyResult` |
| `reset-password` | `ResetPassword` | `reset-password` | `ResetPasswordHeading`, `ResetPasswordForm` |
| `verify-email` | `VerifyEmail` | `verify-email` | `VerifyEmailHeading`, `VerifyEmailStatus` |

`MobileCartBar`, `PrimaryActionBar`, the notice banners, the footer template and `LoginModal` stay
whole blocks or system mounts. The header is a single container: `topBar` and `sticky` are
container props, and only `HeaderBrand` is required, so every other piece can be dropped or moved
between the `start`, `middle` and `end` slots (`nav` is never filled by default). Header parts take
no vertical spacing, margins, `maxWidth` or `textSize`: the bar's height is fixed.

**Contract extensions** (`ContainerSpec`, all optional):

- `offers` — the parts of the family this container accepts (default: all). The payment family is
  shared by three containers, and every container accepts every part (the success page's `PaymentActions` shows
  the sign-in or order link by default). A part that is not offered fails `part-placement`.
- `nests` — containers its slots may hold, at any depth: `CartContents` nests `CartSummary`;
  `AccountNav` nests the five account sections. A nested container keeps its own placement and
  `exactly-one` rules, and owns its own parts.
- `slotRejects` — a slot never holding these types, at any depth, where the area is not shown on
  every surface (rule id `slot-rejects:<Container>.<slot>`).

**Required parts and `hide`.** A required part never offers `hide`, with two exceptions that are
required in some payment containers and optional in others: `PaymentReference` and
`PaymentActions`. A hidden required part (or a hidden block holding one) is reported as
`hidden-required:<Type>`. Which parts are required is per container; the editor locks them with
`requiredPartsOn`.

**The cart drawer rule.** The cart container renders in two places, the `/cart` page and the
drawer, told apart by `CartHostContext` (`null` = the page). The drawer renders the same cart
document (see "PuckShell and the system mounts"): `main` becomes its body and `summary` its pinned
footer. The cart views register themselves through `cartViews` (`builder/blocks/_shared/cart-views.ts`)
instead of being imported by the registry, which keeps the shell, the registry and the cart from
forming an import cycle.

The drawer ignores the cart container's own block styling (`blockStyle`: spacing, background, border, width): that styling belongs to the `/cart` page, and the drawer's chrome is the shop's sheet. Parts inside the container keep their own styling in both places. The editor's Drawer stage shows the same, with a caption saying so.

**Preview states.** A stateful container reads `usePreviewState('<Name>')` and, when the editor has
set one, draws that state from fixture data instead of its live state machine; the fixtures arrive
through `previewFixtures` in `BuilderMode`, never by import. Shoppers get the constant `SHOPPER`
mode (both null), so no fixture can reach them: the fixtures module (`builder/editor/fixtures.ts`)
is imported only from `builder/editor/**` and its data (including `FIXTURE_TRACKING`) ships only in
the editor chunk. State ids per container are `PREVIEW_STATE_IDS` in `builder/mode.ts`, first is the
editor's default: `OrdersList` (orders, none, more), `Loyalty` (rewards, no-points), `Referrals`
(new, referred), `Profile` (website, webapp), `PaymentSuccess` (reference, missing),
`PaymentCancel` (signed-out, no-reference), `OrderPlaced` (chat, warning, no-chat, missing),
`TrackingLookup` (form, found-2, found-1, nothing-shipped, not-found, error), `VerifyForm` (form,
authentic, expired, not-verified, error), `ResetPassword` (form, set, expired, checking,
unreachable), `VerifyEmail` (verifying, done, invalid, otherAccount, error), `OrderDetail`
(awaiting-payment, hosted-open, crypto-waiting, shipped, collection, cancelled: an order and its payment view
from the fixtures, so the page reads neither). The editor's Page / Drawer switch previews the two cart
surfaces.

Stage-4 files: `builder/blocks/_shared/<family>-container.ts` (specs), `builder/blocks/<Part>.tsx`
(shells), and the views in `layouts/header-parts.tsx`, `features/cart/` (`CartPage`,
`CartSummary`, `CartDrawerPanel`), `features/account/`, `features/auth/LoginPage.tsx`,
`features/payment-redirect/payment-parts.tsx`, `features/tracking/tracking-parts.tsx`,
`features/verify/VerifyPage.tsx`, `features/auth/ResetPasswordPage.tsx` and
`features/auth/VerifyEmailPage.tsx`. A part block file imports nothing from `@/features/` or
`@/layouts/` (the stage-4 contract test checks it).

### Password sign-in pages

Two documents belong to email/phone and password sign-in: `reset-password` (`ResetPassword`:
`ResetPasswordHeading`, `ResetPasswordForm`) and `verify-email` (`VerifyEmail`: `VerifyEmailHeading`,
`VerifyEmailStatus`). `useResetPassword` and `useVerifyEmail` own the token check and the submit; the
families (`family-reset-password.ts`, `family-verify-email.ts`) only carry their state to the parts.

- Both pages are reached from an emailed or chat link with a `?token=`. Neither is among the
  closed-gate exemptions (`app/closed-gate.ts`): a closed shop cannot reset a password or verify an
  email. Neither is in the link picker (`LINKABLE_ROUTES`).
- `/reset-password` needs the `accounts` feature but no session. `/verify-email` needs a session: a
  signed-out visitor goes to `/login?returnTo=…` (the return path keeps the query, so the token
  survives) and comes back to the link after signing in.
- The editor previews both from fixtures and never calls the backend: `ResetPassword` (form, set,
  expired, checking, unreachable) and `VerifyEmail` (verifying, done, invalid, otherAccount, error).
- A hand-arranged Profile page keeps its arrangement, so an owner who wants the Password section
  adds `ProfilePassword` with "Add block". It is an optional part of the `profile` container, and it
  renders nothing while password sign-in is off (it still shows in the editor preview).
- Where the sign-in card and its reset routes come from (backend behaviour a store operator should
  know): password sign-in is behind a backend setting, off by default, and the storefront shows the
  email-or-phone card only when `login.password.available` is true. Reset by email is offered only
  when `login.password.resetByEmail` is true (there is no mailer yet, so today it is not offered).
  Reset by WhatsApp opens WhatsApp with the fixed message `RESET PASSWORD` and the shop's bot replies
  with a link. A wrong current password in Account → Profile is reported on the field and never
  signs the shopper out.
- Deploy order: backend first, then the admin SPA, then this storefront. A store must not switch the
  setting on until its storefront has been redeployed with this release: the previous release shows a
  "coming soon" card when it sees the flag.

### Shop access

A shop can be public (the default), require a sign-in, or admit only allowed customers. The settings
carry `access` (`storefront`, `registration`, `deniedMessage`, `deniedButtons`); every reader goes
through `accessOf()` in `app/access.ts`, so a backend that predates it means a public shop.
`AccessBoundary` applies `accessDecision()` to every navigation:

- Builder mode and the closed-gate exempt paths are never gated.
- A signed-out visitor in a non-public shop is redirected once to `/login?returnTo=…` (path and query
  kept) and the anonymous catalogue is never requested. `/login` and `/reset-password` render in a
  bare frame with no header, footer or cart. With accounts off, or after a Mini App sign-in refused
  for closed registration, there is nothing to sign in to, so the lockout screen is shown instead.
- A signed-in customer the backend refuses (`ACCESS_DENIED`, or `shopAccess: false` on the profile) in
  a restricted shop sees the lockout screen everywhere except `/account/*`, so their orders stay
  reachable. "Check again" asks for the profile and re-opens the shop only when `shopAccess` is not
  false.
- The sign-in notice shows the owner's message and buttons only when the shop is restricted or
  registration is closed; in plain login-required mode it says only "Sign in to view the shop."
- Button links are rendered only when they start with `https://`. Wording is Site text under
  `auth.access.*` and `errors.*` (not fixed; the lockout message and button labels come from settings).

### Checkout parts

Stage 5 turns the checkout page into a container. **`CheckoutFlow`**
(`family: 'checkout'`, document `checkout`) keeps everything that spends money or talks to the backend: the quote, the
guest identity and Turnstile token, the place-order call and the payment hand-off. The parts only decide what the shopper *sees* and where. The action band
(Back / Continue / Place order), the terms line, the alerts and the Turnstile widget are not parts;
they stay in the container, so no arrangement can remove a consent or a way to place the order.
The checkout is steps only (there is no single-page mode).

**Checkout parts** (`CheckoutFlow`; every part is unique):

| Part | Required | Home | Why |
|---|---|---|---|
| `CheckoutHeading` | yes | `CheckoutFlow.head` | the page's only `h1` |
| `CheckoutProgress` | no | `CheckoutFlow.lead` | a navigation aid only; Back and the review's Change links remain |
| `CheckoutContact` | yes | `CheckoutFlow.steps` | who the order is for; the guest identity floor (email or phone) |
| `CheckoutAddress` | yes | `CheckoutFlow.steps` | where it goes; the country drives the quote |
| `CheckoutShipping` | yes | `CheckoutFlow.steps` | the delivery option the order is priced with |
| `CheckoutPayment` | yes | `CheckoutFlow.steps` | the method the charge total depends on |
| `CheckoutReview` | yes | `CheckoutFlow.steps` | the last look; the place-order step |
| `CheckoutCoupon` | no | `before` / `after` of `CheckoutShipping`, `CheckoutPayment`, `CheckoutReview`; `CheckoutFlow.aside` | never before a quote can exist |
| `CheckoutNotes` | no | `before` / `after` of any of the five steps | no quote dependency |
| `CheckoutSummary` | yes | `CheckoutFlow.aside` | no one should place an order without seeing the total; the phone collapse and "open on review" belong to the aside |

The address step leads with the country, because the wording of the fields below it (City, County,
State, Postal code) depends on it. `settings.shipping.countries` limits the country picker and
leads the phone prefix list; an empty or missing list means every country is listed, and the quote
stays the authority on what can actually be delivered. The label wording comes from
`web/src/features/checkout/address-profiles.ts`, whose keys are ordinary editable Site text under
`checkout.address.*`. `displayPhoneNumber` in `web/src/lib/dial-codes.ts` is for display only (the
Review step): the submitted number still carries any trunk zero, and the backend normalises it.

Where a country offers collection points (`settings.shipping.collectionCountries`), the address step
shows a Home address / Collection point switch; a country in that list but not in
`settings.shipping.countries` is collection only, with a line saying so and no switch. Collection
replaces the address fields with a postcode search and a list of points
(`features/checkout/PointPicker.tsx`, fed by `GET storefront/service-points`, limited to 60 searches
per 15 minutes per shopper). The postcode box is seeded once from the home postcode, the result count
is announced in a live region, and a chosen point collapses to a summary with a Change action (and,
once Change is open, a Keep action that returns to the current point). The rules for what a change
clears live in `features/checkout/collection-mode.ts`: a new country clears the point, and a new
method or a point from another carrier clears the chosen delivery option. A collection order needs a
phone number, so the phone field becomes required and a shop that hides it offers no collection. The
order carries the point's street as the address line, its city, postcode and country, and the point's
id, carrier and name; the Review step and the order pages read it back as "Collect from". The picker
is part of the existing Delivery address part: there is no separate block, and its wording is
ordinary editable Site text under `checkout.address.*`.

**The old order link.** The key-based order page (`/order/:ref/:accessKey`), its `OrderStatus` container and
its six parts are gone. The backend still writes that address into order emails and uses it as the return
address of hosted payments, so the route stays as a redirect (`app/OrderLinkRedirect.tsx`) to the account
order page, `/account/orders/:ref`; the key is not read, and a signed-out visitor goes through sign-in and
back. A page set saved while the old page existed keeps its `order-status` entry harmlessly: nothing reads
it, and a stored `OrderDetail` that still holds an `OrderPageLink` block drops it with a `drop:unknown-block`
issue. The cancel control (`features/order-status/CancelOrder.tsx`) sits at the foot of the account order's
payment card: a quiet "Cancel order" button that opens a confirmation dialog while the order can still be
cancelled, or a pointer to the shop when money may already be on its way. Its wording is `order.cancel.*`.

**Payment method names.** The names on the account order's method picker, the checkout's Payment and Review
steps, and the account order's payment list are the shop's own, set in the admin app (Storefront settings
-> Payments) and sent by the backend with each method; they are not Site text, and the two Site text
entries "Card" and "Crypto" no longer exist. On the account order page the fee wording around a name is still Site text
(`order.method.withDiscount`, `order.method.withFee`); on the checkout's Payment step the fee note under a name
comes from the backend (its `feeLabel` and rate), not from Site text. A method sent with an empty name is shown by
its id read as words.

**Account order parts.** The `OrderDetail` container holds `OrderBackLink`, `OrderHeading`, `OrderBalance`,
`OrderItems`, `OrderAddress`, `OrderParcels` and `OrderPayments`; only `OrderHeading` and `OrderItems` are
required, and a stored arrangement does not gain `OrderAddress` until the owner adds it. The account's
greeting and section tabs draw nothing on `/account/orders/:ref` (`isOrderDetailPath`).

`OrderBalance` ("Payment needed") draws only while money is owed on an order that is not cancelled or refunded.
It is one card: the amount due as the largest figure on the page, then the payment section (a method picker,
the open hosted checkout, the crypto address, or "we're checking your payment"), then Cancel order under a
rule. While the payment state loads the card shows a busy placeholder; if it fails it says so with a Try again
button; if the order cannot be paid online it shows the help text and the shop's support links. Everything
runs on the customer's session (no access key).
On this page the payment card's own heading replaces the eyebrows that otherwise say payment is needed: it renders
`PaymentSection` with `embedded`, which leaves out `order.payment.required` (method-picker and hosted-checkout faces),
`order.payment.pendingEyebrow` (pending face) and the awaiting crypto card's `order.payment.required` eyebrow, so those
three texts do not show here (they still show wherever `PaymentSection` is used without `embedded`). The crypto card's
`order.crypto.label` eyebrow in its checking, confirmed and attention states stays. Embedded faces carry `data-embedded`
instead of `data-sf-part="card"`, so no template paints a card inside the payment card.

The page sorts the container's items into three areas itself (`features/account/order-layout.ts`): `head`
(back link, heading), `main` (payment, items) and `side` (address, parcels, payments), keeping their order
within each. A content block goes to `side` only when every order part inside it is a side part. On the
published site the areas become a header, a main column and, when something placed in the side column will
draw, a side column from 62em (DOM order puts the side column last, so a phone reads payment, items, address,
parcels, history). In the editor the slot stays one drop zone and is drawn as one column.

`CheckoutFlow.steps` accepts only the five step parts (a content block between two steps would
render inside every step's card); `CheckoutFlow.after` accepts content only. Each step part has
`before` and `after` slots for content blocks and the optional parts that have a home there. Every
required part and `CheckoutCoupon` / `CheckoutNotes` are `noHide`: they may not carry `hide`, nor
sit inside a block that hides. In checkout only `CheckoutProgress` and content blocks accept
`hide`.

**The four legal step orders.** Over the step parts in stored order: Review is last; Address comes
before Shipping, and Shipping before Payment; Contact may sit anywhere before Review. That admits
exactly four orders:

1. Contact, Address, Shipping, Payment, Review (the default)
2. Address, Contact, Shipping, Payment, Review
3. Address, Shipping, Contact, Payment, Review
4. Address, Shipping, Payment, Contact, Review

Shipping options only exist once the country (the address) is known, the charge total depends on
the chosen shipping option, and the review recaps everything and carries Place order, so it is
always last. Contact depends on nothing and nothing depends on it before submit, so it floats. The
rule id is `part-order:CheckoutFlow`. The editor's **Step order** list in the `CheckoutFlow` panel
is the only way to reorder steps (the steps are not draggable on the canvas) and disables every
move that would break the rule, with the reason as its tooltip.

A document with an illegal order is not served. The shop guard rejects it like any other rule
failure, so the shopper gets the **default** checkout page. The container keeps a second line of
defence: if an illegal order ever reaches it (a path that bypasses the guard), it falls back to the
default step order and logs a console warning once per page load.

**The effective form.** The shopper's checkout form persists in the browser and outlives any one
arrangement. The container derives `couponShown` / `notesShown` from the *visible* slots (a part
in a hidden `Columns` column counts as absent). An absent coupon or notes part means that field is
**ignored** in the quote and in the order body, while the saved value is kept: restoring the part
brings the saved code back, and a removed coupon box can never price an order through a field the
shopper cannot see or clear. Nothing in the guest path reads the arrangement otherwise: the quote
key, the Turnstile token per quote and the retry are container code, and a token is never spent
on a coupon the shopper cannot see.

**Contract additions** (`ContainerSpec` and `part`, all optional; a container or part without them
behaves exactly as in stages 3 and 4):

- `homes` — per part, the slots it may live in, written `Container.slot` (for the step parts, the
  step's own type: `CheckoutShipping.before`). The nearest family ancestor slot decides, through
  content blocks. A part outside its homes fails `part-home:<Part>`. `homeWhy` supplies the reason
  shown in the message (the coupon: "no prices exist there yet").
- `order` — `(slots, props) => { message, blockId? } | null`, run on the stored (not
  visibility-filtered) slots. A non-null result is `part-order:<Container>`; a missing member is
  only a `part-required` problem.
- `noHide` — parts guarded like required ones (`hidden-required`) without being required.
- `contentOnly` — the container's slots, and the step parts' slots, accept content blocks and the
  parts that have a home there, and nothing else (no route blocks, no other containers).
- `part.defaultSlots` — a part with slots of its own (the step parts) can supply their default
  content. `fillAbsentSlots` fills an absent slot **before** the guard cleans the document, so the
  filled parts get the same id de-duplication, block budget and checks as stored ones; a present
  slot, even `[]`, is never touched. The shipping step's default `after` is the coupon and the
  review step's is the notes, which is how the default document keeps today's arrangement.

Counting for `part-required`, `part-unique` and `part-home` goes through the slots of slotted parts
(a part inside a step's `before` counts for the container); a required part parked in a hidden
`Columns` column inside a step does not count, and raises `part-required`.

**The editor.** The checkout canvas renders **every step stacked**, each in its own card with its
step head, in the owner's order, so each step's `before` / `after` slots are droppable and the whole
flow is visible; one inert copy of the action band follows the last card, then the terms line and
`after`. Alerts and the Turnstile widget are not mounted. The exact preview renders the real
stepper. The checkout previews as a signed-in shopper with a sample cart. Placing an order
or choosing a payment in the editor is refused by the fixture API ("Preview only — nothing was
sent."). The step parts cannot be deleted, duplicated or dragged; other required parts can be moved
within their homes but not deleted. A legality guard in the editor reverts any insert, move, reorder
or replace that would break an arrangement rule (`part-home`, `part-placement`, `part-order`,
`slot-accepts`, `slot-rejects`), on every document, so an owner cannot save one by accident. A second
violation of a rule id already present in a stored document is tolerated in the editor (publishing
stays blocked).

Files: `builder/family-checkout.ts` (family data and the step-order
helpers; type-only feature imports, in the entry), `builder/blocks/_shared/checkout-container.ts`
(spec), `builder/blocks/Checkout*.tsx` (the container and ten part shells), and the views in `features/checkout/checkout-parts.tsx`
(in its lazy page chunk, so the entry grows by shells and specs only). Part keys stay within the `partId` budget (at most 23 characters).

### Unpaid order prompt

"You have an unpaid order" is a dialog, not a block: it lives in `features/unpaid-prompt/` and is
mounted once by each shell frame (storefront, menu, web app) beside the sign-in dialog, so no page
document can place, move or remove it. A signed-in customer is asked about their newest payable order
(`GET storefront/orders/unpaid`). It has one button, "Review or cancel order", which opens that order's page in the
account (where the customer pays, changes method or cancels), a quiet "Not now", and, when more than one order is
waiting, a "more" link to the order list. Those are the only ways out: it has no close button, a tap outside does
not close it, and neither does Escape, so the customer decides. Cancelling is not done in the pop-up: its confirmation is a dialog on the
order page, and an order the customer cannot cancel (a transfer or a crypto transaction is on its way) gets the same
pop-up with the same single button.

It never shows on the checkout, the order and payment pages (`/order/*` redirects, `/payment/*`, `/order-placed`,
`/account/orders/:ref`), `/login`, `/auth/*`, `/reset-password`, `/verify-email`, `/verify/*` and
`/tracking*`; in the page builder or the appearance preview; to a customer the shop has refused access
(a restricted shop's account pages stay open to them); or while the cart or sign-in dialog is open (it
may appear once they close). "Not now" lasts
for the page load: it is a module variable, kept for the customer who said it, so navigating the shop does not bring
it back, but a reload, a new tab or reopening the Mini App asks again, and a different customer signing in without
a reload is asked for themselves. Nothing is written to any storage. Opening the order page of an unpaid order counts
as having been asked for the load, so going back to the shop does not ask about the order the customer was just on.

The shell part is only the hook that decides whether to ask; the dialog itself (Modal, cancel control, the
order page's stylesheet) is a separate lazily loaded chunk, fetched only when there is an order to show.

Its wording is `order.prompt.*`, and the cancel confirmation inside it `order.cancel.*`; both are
site-wide text groups (`text/site-wide.ts`), editable in the Text panel without a block.

### Placement and rules

A part is allowed on a document exactly where its family's container is (`FAMILY_DOCS`):
`product` → `product`; `catalogue` → `catalog`; `card-tile` → `card:tile`; `card-row` → `card:row`.
Its **nearest container ancestor** — through every slot, hidden ones included — must be of its
family: a part at the page root or in a `Section` outside the container fails. Content blocks may
sit *between* a container and its parts (a `Columns` in the product page's `main` slot holding the
price and stock is valid). A container's slots accept its family's parts, the group part, content
blocks and the non-route `catalogue` blocks allowed on the document (`FeaturedProducts`, `Upsells`,
`CategoryNav`, `SearchField`), unless `slotAccepts` narrows the slot; route blocks and other
containers never, at any depth. Card documents accept only their frame and their family's parts.

Rules run **per container instance** (two containers on one catalogue each need their own results),
counting parts through visible slots and stopping at a nested container:

| Rule id | Meaning |
|---|---|
| `part-required:<Container>.<Part>` | a required part is missing or appears more than once |
| `part-unique:<Container>.<Part>` | a part appears more than once (most parts render fixed element ids — `bulk-heading`, `upsells-heading` — or the page's only `h1`) |
| `part-requires:<Part>.<Needs>` | e.g. a card's add button without its price |
| `part-placement:<Part>` | the part's nearest container is missing or of another family |
| `slot-accepts:<Container>.<slot>` | a restricted slot (or a block inside a container slot) holds something it may not |
| `exactly-one:CardTile` / `exactly-one:CardRow` | on `card:tile` / `card:row` |
| `hidden-required:<Block>` | extended to parts: a block with `hide` may not hold, at any depth inside a container, a part that container requires (reported once per holder) |

| Container | Required | Why |
|---|---|---|
| `ProductDetail` | `ProductTitle`, `ProductPrice`, `ProductAddToCart` | the page's only `h1`; the price before a purchase; the purchase path. `ProductAddToCart` is storefront-only, so menu / web-app sheets require title and price. |
| `ProductGrid`, `ProductList` | `CatalogTitle`, `CatalogResults`, `CatalogEmpty` | the page's `h1`; the products; the empty states carry the only "Clear search" / "Show all" recovery |
| `CardTile` | `CardTileName` | the card's only link to the product page |
| `CardRow` | `CardRowName` | the row's only way to open the product |

Every part is `unique` except the group parts (`ProductGroup`, `CardTileGroup`, `CardRowGroup`),
which are wrappers — the sheet's default uses two `ProductGroup`s. `requires`:
`CardTileAdd → CardTilePrice`, `CardRowAdd → CardRowPrice`. Required parts accept no `hide`, and no
part holding an input (`CatalogSearch`, `ProductAddToCart`, `CardTileAdd`, `CardRowAdd`) accepts
`textSize`.

### Product page and sheet (`family: 'product'`, container `ProductDetail`)

Slots `top`, `media`, `main`, `below`. On the page, `top` and `below` render bare, and
`media` / `main` sit in the `layout` grid; `media` renders only when it shows something
(`ProductGallery` is silent for a product without a photo), and `layoutNoImage` is added exactly
then. On the sheet the four slots render bare, in order, after the sheet's loading / failed states.

| Part | Page view | Sheet view | Layouts |
|---|---|---|---|
| `ProductBreadcrumbs` | `<nav class="crumbs">` trail | the same | all |
| `ProductGallery` | `ProductImage variant="web" eager` | `ProductImage class="thumb"` | all |
| `ProductTitle` *(req.)* | `<header class="head"><h1 data-sf-part="page-title">` + SKU | `<h2 data-sf-part="sheet-title">` | all |
| `ProductPrice` *(req.)* | `<p class="price" data-sf-part="price">` | `<div class="priceBand">` | all |
| `ProductStock` | `<div class="flags">` chip, pre-order, minimum | `<p class="flags">` SKU, chip, pre-order, minimum | all |
| `ProductAddToCart` *(req.)* | `AddToCart size="lg"` | — (pinned in the sheet footer) | storefront |
| `ProductDescription` | `<p class="description">` | `<section class="block">` | all |
| `ProductBulkPricing` | `<section aria-labelledby="bulk-heading">` | `<section class="block">` | all |
| `ProductProvenance` | `<section aria-labelledby="provenance-heading">` | `<section class="block">` | all |
| `ProductCoa` ("Lab report") | `<section aria-labelledby="coa-heading">` | `<section class="block">` | all |
| `ProductAsk` | `<section class="ask">` + contact links | `<section class="block">` | all |
| `ProductUpsells` | `Upsells` (cards) | `Upsells onSelect` (rows, swap in place) | all |
| `ProductGroup` | `kind` `priceRow` ("Side by side"), `identity` ("Text beside thumbnail"), `identityText` ("Text column"); one slot `items` | same classes | all |

Each view renders `null` exactly when v0.7.0 omitted the piece (no description, tiers, provenance,
contact links or curated upsells). Defaults — *storefront*: `top` [Breadcrumbs] · `media` [Gallery]
· `main` [Title, Group(priceRow)[Price, Stock], AddToCart, Description, BulkPricing, Provenance, Ask]
· `below` [Upsells]. *menu, webapp*: `top` [] · `media` [] · `main` [Group(identity)[Group(identityText)
[Title, Stock], Gallery], Price, Description, BulkPricing, Provenance, Ask] · `below` [Upsells].

`ProductCoa` is deliberately **not** in those defaults. It draws the product's latest lab report (certificate
of analysis, `Product.coas`) and its earlier ones under a "Previous reports" disclosure, and nothing when the
product has none. When the product document holds no `ProductCoa` anywhere in the container's slots, the
container draws the same view itself: on the page, last inside the `main` column; in the sheet, between
`main` and `below` (so before the upsells). When the owner has placed the part, only that one draws. The
editor canvas follows the same rule. A product without a displayable report adds no markup at all,
so the goldens and DOM baselines are untouched. The report link is the lab's own page, else the uploaded file
at `/media/coas/<id>/<key>`; inside Telegram it opens through `openExternalLink`. Its labels and values read
`--sf-block-fg` and `--sf-text-scale` (`Coa.module.css`); the links keep the template's colours.

### Catalogue grid and list (`family: 'catalogue'`)

`ProductGrid` has slots `top`, `rail`, `main` (`rail` renders bare as a grid track and accepts only
`CatalogCategories`; `noNav` is added when it shows nothing; the `FilterDrawer` mounts when the
picker is on and a `CatalogCategories` exists). `ProductList` has one slot, `content`, followed by
the container-owned product sheet and `FilterSheet`.

| Part | Grid | List |
|---|---|---|
| `CatalogIntro` | the template hero slot, `surface="grid"` | `surface="list"`; nothing on an unknown category |
| `CatalogSearch` | `SearchField` on the shell search state | the same |
| `CatalogCategories` | `CategoryNav` (chips + rail); nothing with the picker off | the same |
| `CatalogTitle` *(req.)* | section label + `head` h1 + count, or the visually hidden h1 | section label + `head` h1 + tally |
| `CatalogResults` *(req.)* | the card grid, or rows when nothing has a photo | category sections of rows |
| `CatalogEmpty` *(req.)* | unknown category / no matches / empty category | the same |

Defaults: grid `top` [Intro, Search] · `rail` [Categories] · `main` [Title, Empty, Results]; list
`content` [Title, Intro, Empty, Results]. `CatalogEmpty` and `CatalogResults` never render together.

### Cards (`family: 'card-tile'` / `'card-row'`)

The frames `CardTile` (`<article class="card" data-sf-part="product-card">`) and `CardRow`
(`<div class="row" data-sf-part="product-row">`) are the containers and the root of a card
document (route-bound, locked), each with one slot `content`.

| Part | Renders |
|---|---|
| `CardTileImage` | `ProductImage variant="thumbnail"`, or the empty well when a sibling has a photo |
| `CardTileGroup` | `kind` `body` → `<div class="body">`, `foot` → `<div class="foot">`; slot `items` |
| `CardTileName` *(req.)* | `<h3><Link class="link">` — the stretched link; the product's `shortDescription`, when set, follows as a `<p class="blurb">` sibling (2 lines), so every card design gets it |
| `CardTileFlags` | minimum, pre-order, stock — only when one applies |
| `CardTilePrice` | `<p class="prices">` price + best tier |
| `CardTileAdd` | `<div class="add">` `AddToCart size="sm"` |
| `CardRowGroup` | `kind` `text` → `<div class="text">`; slot `items` |
| `CardRowName` *(req.)* | `<h3><button class="open">` → the row's `onSelect` (name wraps to 3 lines); the product's `shortDescription`, when set, follows as a `<p class="blurb">` sibling (2 lines), so every row design gets it |
| `CardRowMeta` | SKU, minimum, tier, pre-order, stock — only when one applies |
| `CardRowPrice` | `<p class="price" data-sf-part="price">` |
| `CardRowAdd` | `<div class="gutter">` quick add / stepper; nothing when ordering is off |

Defaults: tile `content` [Image, Group(body)[Name, Flags, Group(foot)[Price, Add]]]; row `content`
[Group(text)[Name, Meta], Price, Add]. The card context is exactly the props `ProductCard` /
`ProductRow` take: `{ product, index?, eager, hasSiblingImages, onSelect? }`.

### Styling and text per part

Parts are `root` targets (except `CatalogIntro` and `CatalogResults`, `wrap`, and
`CatalogCategories`, `pass` to both of its navs). Shared feature components that are a part's root
take an optional `rootAttrs` prop (`AddToCart`, `ProductImage`, `SearchField`, `EmptyState`,
`Upsells`; `CategoryNav` takes `navAttrs`). Parts offering TEXT read `var(--sf-block-fg, <today>)`
and `calc(<today> * var(--sf-text-scale, 1))` in their views' module CSS, which compute to today's
values when unset. `web/test/builder-parts-contract.test.tsx` pins each part's family, target and
keys (keys may be added later, never removed) and checks the CSS reads the variables.

**TEXT reach is partial** inside `ProductBulkPricing`, `ProductProvenance`, `ProductAsk`,
`ProductStock` and `ProductBreadcrumbs`. `fg` and `textSize` reach the text the part's view draws
from `ProductDetailPage.module.css` / `ProductDetailSheet.module.css` (section headings, the ask
copy, the flags row, the breadcrumb links and their size), but not the shared components nested
inside them: the tier table (`BulkPricing.module.css`), the provenance rows (`Provenance.module.css`),
the stock chip (`StockChip.module.css`), the contact link buttons, the breadcrumb separators and the
link hover colour keep their own colours and sizes. An owner who sets a text colour on these parts
sees the heading change and the body stay in the template's voice.

### Menu and web-app sheet

In menu and webapp the `product` route redirects to the catalogue with `?p=<id>`, so that layout's
`product` document drives the **sheet body**. `ProductDetailSheet` keeps its `Sheet` chrome (the
category eyebrow, close, the pinned `AddToCart size="lg"` footer), its title effect and its product
query; its body renders the layout's guarded `product` document through `RenderDoc` inside a
`ProductHostContext` `{ productId, onSelect, surface: 'sheet', SheetBody }`. `ProductDetail`,
seeing a host, renders `SheetBody` (`ProductSheetBody`) instead of the page — so the sheet needs no
lazy chunk and no route. A stored `ProductAddToCart` in a menu document drops as `drop:layout`.
Root content blocks of that document render around the container in the sheet body; its root
`title` / `description` do nothing. **The storefront layout keeps the built-in sheet**: its
`product` document is a page, so a `ProductList` placed on a storefront catalogue opens the
default (menu) sheet document, not the storefront page document.

### Wholesale

With `features.wholesale` on, `ProductGrid` and `ProductList` render `WholesaleCatalogPage` and
ignore their slots, so owner content inside those containers is hidden too, while blocks outside
them still render. The editor marks the container with a notice ("Wholesale mode is on: shoppers
see the trade list here …"). `WholesaleTable` stays a monolith.

### Old documents

A v0.7.0 (or stage 1/2) document stores `ProductDetail`, `ProductGrid` or `ProductList` with no
slot keys. `upgradeDoc` / `fillAbsentSlots` (`builder/upgrade.ts`, pure) fill every slot whose key is
**absent** from `container.defaultSlots(parsedProps, { layout, id })`; a slot that is present —
even `[]` — is never touched (idempotent; `[]` is an owner's deliberate empty slot).

- It runs in the **guard** (before a container's slots are cleaned, so the filled parts get the
  same id de-duplication, budget and checks), in the **default table** (`defaultDoc`), and on the
  **editor's load**, before documents reach Puck — otherwise the first autosave would store `[]`
  and wipe every part.
- `ProductDetail`'s v0.7.0 toggles `gallery`, `bulkPricing`, `provenance`, `upsells` are
  `legacyProps`: read only by `defaultSlots` on storefront (`gallery: false` ⇒ `media` [], the others
  leave their part out); ignored on menu / webapp, whose v0.7.0 sheet never read them. They stay in
  the schema forever (optional, absent = on), are not shown as fields, and are dropped on save from
  a container whose slots are present. A rollback to v0.7.0 is safe: its schema strips the slots.
- No stored document is rewritten by the backend or a migration. **An already-edited v0.7.0
  product or catalogue document shows once as changed in the admin's publish diff after its first
  editor load**: the load fills the absent slots and the next autosave posts the upgraded shape.
  The shop renders the same thing before and after; the diff entry is the new shape being stored.
  This is accepted — publishing (or leaving it) is safe either way.

### Adding a part

1. Copy a part block file in `builder/blocks/` (`category: 'part'`, `part: { family }`,
   `slots: []`, `render` = `PartHost`), with `style` (BOX, plus TEXT only if the view reads the
   variables; never `hide` on a required part, never `textSize` with an input) and `text` (the keys
   the view renders).
2. Write the view in the surface file(s) — the container's lazy chunk — and add it to that
   surface's `*_VIEWS` map. Render `null` when there is nothing to show.
3. Decide whether it is in the container's `defaultSlots` (a default change breaks parity — only if
   intended), `unique`, `required`, `requires`, `slotAccepts`.
4. Add its fields file under `builder/editor/fields/`.
5. Add it to the table in `test/builder-parts-contract.test.tsx` and `PART_BLOCKS` in
   `test/builder-editor-contract.test.ts` (stage 3), to the `STAGE4_PARTS` table in
   `test/helpers/stage4-parts.ts` (stage 4), or to the `STAGE5_PARTS` table in
   `test/helpers/stage5-parts.ts` (checkout and order status: `{ family, style: T(target, ...key
   groups) }` per part, the same shape as the other tables); the registered parts must equal the
   union of those tables exactly. `test/builder-parts-stage4-contract.test.ts` checks every
   stage-4 container's defaults, part key length (at most 19 characters) and the import rules;
   `test/builder-parts-stage5-contract.test.ts` does the same for the two stage-5 containers
   (defaults pass their own rules in every layout, required parts carry no `hide`, `noHide` covers
   what must not be hidden, every pattern of the sixteen parts is a valid text key, no part block
   imports a view or the registry). Regenerate `web/public/blocks.json`
   (`UPDATE_BLOCKS_JSON=1 npm --prefix web test -- test/blocks-manifest.test.ts`).
6. The golden captures (`test/golden-parity.test.tsx`) and `e2e/dom-parity.spec.ts` must pass
   **unchanged**.

`blocks.json` lists, per block, `part: { family }` or `container: { family, slots, required,
unique, insertSlot }` when the block has one, so the admin can mirror the part rules. It carries structure
only: the stage-5 contract fields (`homes`, `order`, `noHide`, `contentOnly`, `defaultSlots`) are
code and are not emitted.

## Card designs

An owner can redesign the product card (tile) and the product row per layout.

- **Storage.** `PageSet.cards?: Partial<Record<'tile' | 'row', PuckDoc>>`, sparse like `pages`:
  an absent kind is the built-in design. It publishes, versions, restores and diffs with the
  layout. The document keys are `card:tile` / `card:row` (`DocKey`); they are not routes, so they
  are not in `pages`. A card document's root props are ignored; its content is exactly one frame
  (`CardTile` / `CardRow`, `exactly-one`) holding the family's parts. Both kinds exist in every
  layout: tiles appear in the grid, `FeaturedProducts` and page upsells; rows in the list, the
  grid's all-imageless mode and the sheet's upsells.
- **Compile once.** `compileCard(doc, kind, layout)` (`builder/cards.ts`) guards the document once
  (a violation ⇒ `null` ⇒ built-in), walks it once into a static element tree through
  `renderBlock` (block renders are pure), and memoises per `(doc object, layout)`.
  `design.render(data, views)` wraps the **same element objects** in the card family's provider
  for each card, with the views from the caller's chunk — no parse, guard walk, tree walk or Puck
  per card.
- **Where designs apply.** `CardDesignProvider` (`builder/card-design.tsx`, mounted by `PuckShell`
  — also on chrome-less pages — and by the editor canvas and preview) reads `pageSet.cards`.
  `ProductCard` and `ProductRow` keep their names, props and call sites and ask
  `useCardDesign('tile' | 'row')`: with a design they return `design.render(…)`, otherwise their
  built-in composition drawn from the same views. `WholesaleRow` is untouched.
- **Failure.** One `CardDesignBoundary` per card list (grid, list, `Upsells`, `FeaturedProducts`)
  catches a throw, logs once, marks that kind failed in the provider for the rest of the page load,
  and every list re-renders with the built-in design. It adds no DOM.
- **Parity.** The built-in cards are composed of the same views as a compiled design; a unit test
  proves the compiled *default* card document draws markup identical to the built-in card, so
  publishing the default design changes nothing a shopper sees. A published design costs one
  `PartHost` per part per card (measured about 25 % more render time per 500 tiles than the
  built-in); with no design there is no extra cost.

## Rules

`checkRules(doc, docKey, layout)` (`rules.ts`) returns issues; a non-empty list makes the guard
fall back to the route's default document.

| Rule id | Meaning |
|---|---|
| `exactly-one:<Block>` | the route needs exactly one of the block(s) below (counted through visible slots) |
| `at-most-one:<Block>` | `Header` and `MobileCartBar`: never more than one in a document (two headers fight over `--sf-pin-h`; two phone bars stack) |
| `at-least-one:catalog` | the catalogue needs a `ProductGrid`, `ProductList` or `WholesaleTable` |
| `placement:<Block>` | the block is not allowed on this document (the `PLACEMENT` and `SHELL_ONLY` tables) |
| `layout:<Block>` | the block is not available in this layout |
| `hidden-required:<Block>` | a block with `blockStyle.hide` holds (through visible slots, any depth) a block the document requires — its `EXACTLY_ONE` / `AT_LEAST_ONE` blocks, `PageOutlet` or `MobileCartBar` |
| `drop:*` | informational, from the guard (see above); never a fallback by themselves |

**EXACTLY_ONE**: `shell` → `PageOutlet`; `product` → `ProductDetail`; `cart` → `CartContents` and
`CartSummary`; `checkout` → `CheckoutFlow`; `login` → `LoginOptions`; `account.orders` →
`OrdersList`; `account.order` → `OrderDetail`; `account.loyalty` → `Loyalty`; `account.referrals`
→ `Referrals`; `account.profile` → `Profile`; `payment-success` →
`PaymentSuccess`; `payment-cancel` → `PaymentCancel`; `order-placed` → `OrderPlaced`; `verify` →
`VerifyForm`; `tracking` → `TrackingLookup`; `reset-password` → `ResetPassword`; `verify-email` →
`VerifyEmail`. (`catalog` and custom pages have none.)

**AT_LEAST_ONE**: `catalog` → any of `ProductGrid`, `ProductList`, `WholesaleTable`.

**AT_MOST_ONE** (any document): `Header`, `MobileCartBar`.

**Visible slots.** The counts (`exactly-one`, `at-most-one`, `at-least-one`, and `countBlocks`)
walk only the slots a shopper sees. A block may declare `visibleSlots(props)`: `Columns` returns
`col1`…`colN` for its `columns` count, and `Footer` returns none in its `template` variant and
`col1`…`colN` in its `columns` variant; any other block shows all of its slots. So a
`PageOutlet` moved into `col3` of a Columns that is then set to two columns counts as missing:
the guard falls back to the default shell for shoppers, and the editor lists the `exactly-one`
issue so Publish stays off. `placement` and `layout` still check every stored block, hidden
slots included.

**PLACEMENT** (only on the listed document; anywhere else, including custom pages, is refused):
`PageOutlet` → `shell`; `ProductGrid`, `ProductList`, `WholesaleTable` → `catalog`;
`ProductDetail` → `product`; `CartContents`, `CartSummary` → `cart`; `CheckoutFlow` → `checkout`;
`LoginOptions` → `login`; `AccountNav` → the five `account.*` documents; every other account and
post-order route block → its own route. On the shell document only `shell` and `content` category
blocks may sit.

**SHELL_ONLY**: `PageOutlet`, `Header`, `Footer`, `TopBar`, `MobileCartBar` — allowed only on the
shell document. `allowedOn(type, docKey)` exports the placement decision (the editor's Add menu
uses it).

## Default documents

From `defaults/groups/*.ts`, resolved by `defaultDoc(docKey, layout)`:

- **Shell** — storefront: `Header`, `NoticeBanners`, `CutoffBar`, `PageOutlet`, `Footer`. Menu: the
  same, then `ContactStrip`. Web app: `Header`, `NoticeBanners`, `CutoffBar`, `PageOutlet`.
- **catalog** — storefront: `ProductGrid`; menu and webapp: `ProductList`. Under wholesale mode
  `CatalogueBody` swaps in the trade list under any shell and any list block, so a default (or
  published) document still shows the trade list.
- **product** — `ProductDetail`. **cart** — `CartContents` with a `CartSummary` in its `summary`
  slot. **checkout** — `CheckoutFlow`. **login** — `LoginOptions`.
- **account.\*** — `AccountNav` with the route's block (`OrdersList`, `OrderDetail`, `Loyalty`,
  `Referrals`, `Profile`) in its `body` slot.
- **payment-success**, **payment-cancel**,
  **order-placed**, **verify**, **tracking** — their one block.
- **reset-password**, **verify-email** — their one container with its default arrangement
  (heading, then form / status).
- A custom page has no default: an unknown or unpublished `/pages/<slug>` redirects to `/`.

## Core options per block

Template core options (`showPageTitle`, `showCatalogIntro`, `showSku`, `showCategoryPicker`,
`headerAccountIcon`, `headerCartIcon`, …) are store-wide. A block can override some for its own
subtree through `CoreOptionsScope`, using `inherit` (the store-wide option decides), `show` or
`hide`: `Header` (`accountIcon`, `cartIcon`), `ProductGrid` / `ProductList` / `WholesaleTable`
(`categoryPicker`, `pageTitle`, `intro`, `sku`) and `ProductDetail` (`sku`). `compactScope` drops
`inherit` so the store option stays in charge. `intro` is also how a store hides a list block's
built-in catalogue intro when it adds a custom `CatalogHero`.

## Media and the Worker

Owners upload images in the editor (admin → backend). The stored form is
`/media/storefront-pages/media/<32 hex>.<png|jpg|webp|gif>`; the Worker's `/media/*` proxy maps it
to `api/v1/storefront-pages/media/<key>` with a one-day edge cache. Product lab-report files are the
exception: `/media/coas/<id>/<32 hex>` maps to `api/v1/public/catalog/coas/<id>/<key>/file`, is credentialed
by the key, and is never stored at the edge (the backend's `private, max-age=300` is passed through). `storefront/pages/:layout` is
proxied under the `/api` allowlist and edge-cached for 30 s (unauthenticated GETs only). Uploaded
images are **never garbage-collected**: removing an `Image` block leaves the file in storage.

## Testing

- **`e2e/dom-parity.spec.ts`** — the no-published-set gate: default documents against v0.6.0 DOM
  snapshots in `e2e/__baseline__/`. Regenerate one snapshot with
  `npm run test:e2e -- dom-parity.spec.ts --update-snapshots -g "<test name>"`; every regeneration
  must be justified in the commit message.
- **`e2e/builder.spec.ts`** — published sets across the three layouts: composition, fallbacks
  (404/503 pages route, failing rules, crashes), custom pages, checkout through a customised page.
- **Unit** — `web/test/builder-*.test.ts(x)`: define, guard, rules, registry, sanitize, render,
  runtime, shell, each block group, defaults completeness, the editor contract, and
  `blocks-manifest.test.ts`, which fails when `web/public/blocks.json` is stale.
- **Golden captures** — `web/test/golden-parity.test.tsx` against `web/test/__golden__/`: the v0.7.0
  markup of the product page and sheet, cards, grid and list (loading, error and not-found states
  included), which every default container arrangement must reproduce. Never regenerate them to
  make a change pass.
- **`web/test/builder-parts-contract.test.tsx`** — the part table (family, style target and keys),
  each container's defaults passing its own rules in every layout, and TEXT parts reading the
  variables.
- `npm run build` emits `web/dist/blocks.json`.

## Known limitations

- A standalone `CategoryNav` is roots-only on phones (the button that opens nested categories is
  hidden); the list blocks' own picker still reaches every level.
- `Footer` `columns` replaces the template footer, so it drops the template footer's support links
  and contact details; re-add them as blocks in a column.
- A custom `CatalogHero` does not hide the list block's built-in intro: set the list block's
  `intro` override to `hide`.
- Uploaded images are never garbage-collected.
- `Video` accepts YouTube ids and Vimeo ids of six or more digits; private (hash) Vimeo links are
  not supported.
- Hidden `Columns` / `Footer` columns keep their content but do not render it, and blocks in
  them do not count toward the rules (see Visible slots).
- `hidden-required` fires for every hidden container that holds a required block, even when a
  visible copy exists elsewhere on the page — so "a mobile-only `ProductList` in one Section and a
  desktop-only `ProductGrid` in another" cannot be built (see *Block styling*).
- TEXT reach is partial inside `ProductBulkPricing`, `ProductProvenance`, `ProductAsk`,
  `ProductStock` and `ProductBreadcrumbs`: nested shared components keep their own colours and sizes
  (see *Containers and parts*).
- An already-edited v0.7.0 product or catalogue document shows once as changed in the admin's
  publish diff after its first editor load (see *Old documents*).
- A Telegram-only customer who forgets their password has no self-service reset:
  staff generate a link for them.

## The editor (`/__builder`)

The editor is a lazy chunk of the storefront, framed by the admin's **Storefront → Pages** tab
at `/__builder?sf-builder=1`. It boots only when that parameter is present **and** the page is
inside a frame (decided once per window, like the Appearance preview); anything else redirects
to `/`. The build fails if `@puckeditor/core`, tiptap, dnd-kit or any `src/builder/editor/`
module is statically reachable from the shopper entry (`vite-plugins/builder-isolation.ts`,
tested in `test/builder-isolation-plugin.test.ts` against hand-built bundle fixtures). Shopper lazy
chunks are checked too; only the chunk holding `EditorApp.tsx` is a boundary.

### Protocol (spec §13 A6)

| Direction | Message |
|---|---|
| admin → storefront | `sf-builder-load { protocol: 1, loadId, layout, pageSet \| null, theme, readOnly, siteText? }` — `pageSet.text` = this layout's text overrides; `siteText` absent = the admin can't save shared text (overrides only, shared read-only), `null` = none stored yet |
| admin → storefront | `sf-builder-theme { theme }` |
| admin → storefront | `sf-builder-select-page { docKey }` (optional: the editor honours it; the current admin does not send it) |
| admin → storefront | `sf-builder-upload-result { requestId, url \| null, error \| null }` |
| storefront → admin | `sf-builder-ready { protocol: 1 }` (to `'*'`; once per frame boot) |
| storefront → admin | `sf-builder-change { loadId, pageSet, issues, siteText?, textIssues }` (500 ms debounce, flushed at once when the frame blurs, is hidden or unloads; never when read-only). `pageSet.text` carries overrides; `siteText` (the full shared doc) is present iff the load carried it; `textIssues` lists blocking text problems `{ scope, key, rule, message }` |
| storefront → admin | `sf-builder-upload-request { requestId, file }` |
| storefront → admin | `sf-builder-viewport { width: 360 \| 768 \| 1280 \| null }` (on every toggle change and after every load) |

Load identity: every `sf-builder-load` carries a `loadId`, and every `sf-builder-change` echoes
the `loadId` of the load it derives from, so the admin can discard changes belonging to a
superseded load. On each load the editor cancels any pending debounced change and posts exactly
one change built from the loaded data (also when `pageSet` is `null`; none when `readOnly`).

The debounce never holds back the owner's last edit: when the frame loses focus (the owner
clicks Publish or anything else in the admin), is hidden, or unloads (`blur`, `visibilitychange`
to hidden, `pagehide`), the pending change is sent immediately. The issues in a change, and the
issue list in the editor's header, are both computed from the same prepared docs (editor-only
leftovers such as an unpicked Featured row removed), so the two always agree.

Only messages whose `source` is the parent frame are read; the first valid load pins the admin
origin (it must be an `http(s)` origin), and later messages from any other origin are ignored.
Draft themes never carry custom CSS into the frame. Guard issues whose rule starts with `drop:`
are informational and are not posted to the admin.

### Preview width

Puck's own canvas iframe is disabled (the app's theme variables live on the document root), and
its canvas always fills the frame. The header's **Fit / Phone / Tablet / Desktop** toggle posts
`sf-builder-viewport`; the admin resizes the iframe element to that width (centred, scrollable),
so CSS media queries and `useMediaQuery` respond exactly as they would on a real device width.

**Fit** is editing. **Phone / Tablet / Desktop** are *exact previews*, and editing is paused
while one shows: Puck's panels would otherwise eat into the width being previewed. The draft is
rendered full-frame through the storefront's own runtime (the draft set in
`PageSetOverrideProvider`, then `PuckShell` with the header, footer, cart drawer, cart bar and
other system mounts around `PuckPage`, or `Chromeless` for a `chrome: 'none'` page), under a bar
with a single **Back to editing** button. The Puck canvas stays mounted but hidden, so selection
and undo history survive the round trip; nothing is posted while a preview shows, and anything
that changed meanwhile goes out on the way back.

**Hotkey guard.** While an exact preview shows, `guardHiddenCanvasHotkeys` (`preview-keys.ts`)
holds back undo/redo (Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl/Cmd+Y) everywhere and Delete/Backspace
outside text fields, so Puck's document-level shortcuts can't edit or delete blocks in the
hidden canvas. The keys keep their default action (typing in a text field still works).

The read-only version view uses the same full-runtime render at a width preset; at Fit it shows
the page on the shop's ground without the shell.

### Fixture mode

Blocks that need a session, a cart or an order render against built-in **Northbound Supply**
fixtures (`src/builder/editor/fixtures.ts`), chosen with **Preview as** (signed out / signed in /
signed in with orders × empty cart / cart with items). In the editor the api client is
intercepted: the catalogue and settings come from the live public API (without any token),
session routes are answered from fixtures, and every mutation or lookup is refused with a
"Preview only" toast. The session and cart stores write to memory, never to the shop's
`localStorage`, and navigation away from `/__builder` is blocked.

### Fields

Each block's Puck fields live in `src/builder/editor/fields/<Block>.ts` and are derived from the
block's zod schema (`derive-fields.ts`), by prop name first:

| Prop name | Field |
|---|---|
| ends in `Html` | Puck `richtext` limited to what the sanitiser keeps: paragraphs, headings h2–h4, bold, italic, underline, strike, inline code, quotes, lists, line breaks and links to `https:` / `mailto:` / `tel:` / site paths (no h1/h5/h6, code blocks, rules or alignment). Stored as an HTML string, sanitised on save and render |
| `href` / ends in `Href` | route link: a fixed page, a custom page (`/pages/<slug>`), or an `https:` / `mailto:` / `tel:` address |
| `src` / ends in `Src` | image uploaded through the admin (PNG, JPEG, WebP, GIF, ≤ 5 MB) |
| ends in `Token` (enum) | palette swatches (`var(--sf-<token>)`) |
| `productId` / ends in `ProductId` | product picker over the live catalogue |
| `categoryId` / ends in `CategoryId` | category picker over the live catalogue |
| a slot | Puck `slot` |

Otherwise the JSON-schema type decides: enum → radio (≤ 3 options) or select, boolean → On/Off,
number → number (with min/max), string → text (textarea above 200 chars), array of objects →
array, object → object. A test fails if any schema key of any block has no field.

The page settings' **Page title** and **Search description** stop at the backend's limits (120
and 300 characters) as the owner types, with a running count. In a route link, switching to
**Web address** and leaving the empty box keeps the existing link; only deleting a typed address
clears it.

An image upload can outlive its field (the owner selects another block or switches page while
the admin stores the file). The URL is then put into the block it was picked for — through the
live canvas when that page is open, else into the stored draft — as long as the set hasn't been
reloaded or reset and the block still exists. Otherwise a toast says "Upload finished — the image
wasn't added because you left the page."

### Parts and card designs

The blocks drawer opens with a **parts group** named for the container on the page: **Product
page parts** (the product page, and the menu / web-app product sheet), **Catalogue parts** (the
grid or list) or **Card parts** (the two card designs). A part is offered only on a page that has
a container of its family, and an at-most-one part that is already on the page is not offered
again (`Remove` it first, or use **Add** below). The group sits first; the usual content blocks
follow. Where a drop is allowed is the container's allow list: a part may only land in its own
family's container, and a container's slots refuse route blocks and other containers. A part
dropped anywhere else (for instance Price dragged out onto the page root) is undone by the editor,
which says why. A stored document that is already misplaced still raises `part-placement:<Part>`:
the block is marked "Needs attention" on the canvas, the issue is in the header's list and in
`sf-builder-change.issues`, and publishing is blocked until it is moved back.

**Locks.** Required parts (Title, Price and the add button on the product page; the product name
on a card) have no delete action and read "Required" in the panel; they can still be moved.
Optional parts can be deleted and come back with Add.

**The Parts panel.** Selecting a container shows, under its fields in the right column, its
notices, a **Parts** list and **Reset arrangement**. Each part reads *On the page*, *Required* or
*Removed*; a removed part has an **Add** button that puts it where the default arrangement has it
(after its nearest default neighbour still present). Add and Reset are each one `replace`, so each
is one Undo step; after either, focus goes to the part row or to Reset and a polite live region
says what happened ("Bulk pricing added", "Arrangement reset"). Reset puts every slot back to the
default arrangement and removes the content blocks the owner added inside (it says how many in a
warning beside the button); style and text settings are kept. Puck keeps the fields panel
mounted across a replace, which is what lets focus and the announcement survive.
The panel also links a grid or list to the two card designs.

**Notices.** On a catalogue container, while the shop's wholesale mode is on: shoppers see the
trade list instead, and this arrangement shows when it is off. On the menu / web-app product
sheet: the add to cart button is pinned to the sheet's footer, so it is not a part of the
arrangement. **Add block** with a part chosen puts it into the selection's own container: right
after the selected block when that slot takes it, else at the end of the container's main slot,
never at the page root.

**Preview with.** One header control picks the product the product page, the sheet canvas and the
card designer show (default: the first product with a photo). It is editor-only and not saved.

**The sheet canvas.** The menu / web-app product document is edited as the real sheet: a 420 px
column on a dimmed ground between inert copies of the sheet's header and its pinned add button,
with the document drawn through `ProductSheetBody` for the previewed product. At a phone or tablet
preview width the same document opens the real sheet through `?p=<id>` over the catalogue (the
fixture location owns that parameter). The sheet is modal, as it is for a shopper; the exact
preview's bar sits above its overlay, so **Back to editing** stays clickable.

**The card designer.** Choose **Product card** or **Product row** in the page picker (the
**Product cards** group; the keys are `card:tile` and `card:row`, and the designs are saved as
`pageSet.cards.tile` / `.row`, never under `pages`). The canvas shows the real grid (or rows list)
with the editable card first (Puck's own drop-zone wrapper is the first grid item) followed by
three inert **state copies**: out of stock, pre-order with a minimum of 3, and no photo. The copies
render the draft through their own `CardDesignProvider`, remounted whenever the draft changes, so a
design that threw is dropped for one render only and recovers once fixed, and they fall back to the
built-in card exactly as the shop does. The page editor's canvas gets the same provider, so a
catalogue or product page shows the draft designs in its cards.

### Text

Every shopper-facing line is edited from the **Text** button (spec 2026-09-30 editable text §7).
On a wide frame the Text panel is a left-sidebar tab (Blocks and Outline come back when it
closes); below 1024 px it overlays the canvas. It has the store language and "Numbers and
dates" at the top (editing the shared draft), search, filters (All / Edited / This layout /
Issues), one group per area with Site-wide first, and an Unused group for saved wording this
release no longer shows. Each row edits one key at a scope — **All layouts** (shared Site text)
or **Only {layout}** (this layout's override) — with the built-in default, the layer the canvas
currently shows, placeholder chips, a length count and Reset; clearing the box resets. Plural
keys get one box per plural category of the store language, with a live example.

Selecting a block shows **Text in this block** under its fields (from the block's `text`
patterns). The canvas re-resolves on every keystroke; only posting is debounced. Text edits share
Undo/Redo with block edits (`editor/text/history.ts` anchors each text step to Puck's history
entry). Ctrl/⌘+Z in a Text field undoes text, never a hidden block: when the next step is a
text step it takes that; otherwise the field keeps the browser's own undo.

A value the backend would refuse (a half-typed `{`, a plural without "other") stays on screen
with a blocking issue but is left out of the posted change, so an autosave never fails on it.
Issues show on the row and under "Text" in the header's issue list, and block Publish. Without
`siteText` in the load (an older admin), "All layouts" is disabled and shared wording is read
from the public page-set read. If that read fails, the Text panel and "Text in this block" say so
instead of editing (the language isn't known).

The backend keeps wording in at most 10 languages per layer (shared, and each layout's
overrides) and at most 256 KB of shared text. Picking an 11th language is refused, and a row
can't take wording in a language its layer has no room for; the Language section then explains
why and lists the other languages holding wording, each with **Clear wording** (one undo step).
Stored text already over either cap is a blocking issue ("Languages" / "Amount of wording").

Known gaps, seen in a real browser:

- Puck's first history entry of a mount has no id. The store tells a canvas undo/redo from a new
  block edit by position in Puck's history (same place, same id — null matching null), so undoing
  the **first** block edit of a mount keeps a text step waiting to be redone, like any later one.
  This leans on Puck 0.23's history shape (entries with ids, an index); if a Puck upgrade changes
  it, the store falls back to dropping the text redo (the safe failure).
- Puck records history on a short debounce: two block edits made within it are one undo step.

On a touch screen (`pointer: coarse`) the header's controls and the Text panel's are 44 px
targets, with 16 px text in selects and inputs.

### Trust boundary

Any site can frame `/__builder?sf-builder=1`; the storefront doesn't restrict `frame-ancestors`
to the admin. That is acceptable because the frame holds nothing worth stealing: it has no admin
session or token, fixture mode refuses every mutation and swaps the frame's storage for memory,
and the only data it sends a framer is the draft it was given plus, when the user picks a file
in an image field, that file (uploads go to whoever sent the load). This is the same stance as
the Appearance preview. A per-client `frame-ancestors` limited to the admin origin is a possible
hardening.
