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
  'account.loyalty', 'account.referrals', 'account.profile', 'order-status', 'payment-success', 'payment-cancel',
  'order-placed', 'verify', 'tracking'] as const;
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
frame — the default of `order-status`, the shared order link).

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

The 45 blocks of this release. "All" layouts = storefront, menu and webapp. Slots are marked
*(slot)*.

### Shell

| Block | Layouts | Route-bound | Props |
|---|---|---|---|
| `PageOutlet` | all | yes (`shell`) | none — renders the current route |
| `Header` | all | no | `variant` (auto/storefront/menu/webapp), `topBar`, `search`, `sticky`, `accountIcon` and `cartIcon` (inherit/show/hide), `nav` *(slot)* |
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
| `CartContents` | all | yes (`cart`) | `summary` *(slot)* |
| `CartSummary` | all | yes (`cart`) | none |
| `CheckoutFlow` | all | yes (`checkout`) | none |
| `LoginOptions` | all | yes (`login`) | none |
| `AccountNav` | all | no (placement `account.*`) | `body` *(slot)* |
| `OrdersList` | all | yes (`account.orders`) | none |
| `OrderDetail` | all | yes (`account.order`) | none |
| `Loyalty` | all | yes (`account.loyalty`) | none |
| `Referrals` | all | yes (`account.referrals`) | none |
| `Profile` | all | yes (`account.profile`) | none |

### Post-order

| Block | Layouts | Route-bound | Props |
|---|---|---|---|
| `OrderStatus` | all | yes (`order-status`) | none |
| `PaymentSuccess` | all | yes (`payment-success`) | none |
| `PaymentCancel` | all | yes (`payment-cancel`) | none |
| `OrderPlaced` | all | yes (`order-placed`) | none |
| `VerifyForm` | all | yes (`verify`) | none |
| `TrackingLookup` | all | yes (`tracking`) | none |

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
(`OrderStatus: ['order.*', …]`, `Header: ['shell.header.*', 'catalog.search.*', …]`); the
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
| The 19 route-bound blocks (`ProductGrid` … `TrackingLookup`) and `AccountNav` | wrap | BOX | never `hide`, never TEXT |
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
→ `Referrals`; `account.profile` → `Profile`; `order-status` → `OrderStatus`; `payment-success` →
`PaymentSuccess`; `payment-cancel` → `PaymentCancel`; `order-placed` → `OrderPlaced`; `verify` →
`VerifyForm`; `tracking` → `TrackingLookup`. (`catalog` and custom pages have none.)

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
- **order-status** — `OrderStatus`, root `chrome: 'none'`. **payment-success**, **payment-cancel**,
  **order-placed**, **verify**, **tracking** — their one block.
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
to `api/v1/storefront-pages/media/<key>` with a one-day edge cache. `storefront/pages/:layout` is
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
