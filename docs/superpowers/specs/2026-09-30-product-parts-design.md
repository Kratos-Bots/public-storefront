# Product surfaces as parts — design (stage 3 of "everything editable")

Date: 2026-09-30. Status: written for review; no code yet.
Repos: `ecommerce-storefront` (lead), `ecommerce-backend` (validation of one new optional field),
`ecommerce-admin-frontend` (publish diff and labels only), branch `feature/puck-editable`.
Initiative overview and cross-stage rules:
[`2026-09-30-puck-editable-overview.md`](2026-09-30-puck-editable-overview.md). Builds on
[`2026-09-29-puck-page-builder-design.md`](2026-09-29-puck-page-builder-design.md) (§13 wins over
its §1–12), stage 1 ([`2026-09-30-editable-text-design.md`](2026-09-30-editable-text-design.md)),
stage 2 ([`2026-09-30-block-styling-design.md`](2026-09-30-block-styling-design.md)) and
[`../../builder.md`](../../builder.md). Examples use the fixture store "Northbound Supply" at
`shop.example`.

## 1. Goal

The product page, the product sheet of the menu and web-app layouts, the catalogue grid and list,
and the product card stop being sealed boxes. An owner can reorder their pieces, remove the
optional ones, put content blocks between them, and style each piece on its own — and a product
card designed once shows up everywhere a product card or row is drawn. None of it can produce a
product page without a price or an add-to-cart button, and with nothing published every page is
byte-for-byte what v0.7.0 renders.

## 2. Decisions

**U** = the user's decision (binding). **D** = this spec's decision, with its reason.

| # | Decision | By |
|---|---|---|
| 1 | **Break blocks apart.** The product page becomes breadcrumbs / gallery / title / price / stock / add to cart / description / bulk pricing / provenance / ask / upsells, each rearrangeable, removable (unless required) and addable; the grid and list pages become intro / search / category rail / title / results / empty state; a product-card designer feeds the grid, the list, `FeaturedProducts` and upsells. Owners can put content between parts. | U |
| 2 | **Container + parts.** The existing route block (`ProductDetail`, `ProductGrid`, `ProductList`) stays and becomes a *container*: it owns the data (queries, selection, cart actions, loading / error / not-found states) and exposes it through React context. Each piece is a new *part* block that renders one thing from that context and can only live inside a container of its family. | D — §3.1 |
| 3 | **Part views live in the container's lazy chunk.** A part block (in the main bundle) is a thin shell; the component that draws it is handed down by the container through context. | D — route chunking unchanged, no per-part `lazy()` suspense (§3.3) |
| 4 | **Required parts per container, counted per container instance**, plus "each part at most once" and "A needs B" rules. A violation replaces the document with the route default for shoppers and blocks Publish, like every rule. | D — overview rule 5 (§4) |
| 5 | **Old documents are upgraded in memory, never rewritten.** A container whose slot key is *absent* gets that slot's default content, derived from its legacy toggles and the layout. The guard does it for shoppers; the editor does it on load before Puck sees the document. | D — overview rule 4 (§8) |
| 6 | **Card designs are stored per layout in a new optional `PageSet.cards` field** (`tile`, `row`), each a Puck document with one locked frame block. Absent ⇒ built-in design. | D — §6.1 |
| 7 | **A card design is compiled once** (guard + element tree, memoised per document object) and every card renders that same element tree under its own small context provider. With no card design published, the existing `ProductCard` / `ProductRow` components render — no compiled path at all. | D — hundreds of cards (§6.3) |
| 8 | **The menu / web-app product sheet is driven by that layout's `product` document.** The same parts render their sheet form there; the sheet's header and pinned add-to-cart footer stay fixed. | D — §7.2 |
| 9 | **`WholesaleTable` and the wholesale swap are unchanged.** Under wholesale mode the grid and list containers render the trade list and ignore their parts, exactly as today. | D — §7.1 |
| 10 | **No `ProductOptions` part.** The public catalogue carries no option or variant data (each sellable item is its own product; parent rules arrive pre-resolved as min / max quantities), so such a part could only render nothing. A later release adds it as a new part name if the API grows options. | D |
| 11 | **Stage 3 adds no text key.** Every part reuses the keys the monolith rendered; an owner's stage-1 wording survives the split. | Overview rule 2 |
| 12 | **Admin changes are limited to the publish diff and labels** (so a card-only edit can be published); the backend accepts and validates `cards`; both deploy in the usual order, backend first. | D — §10 |

## 3. The container / part pattern (reused by stages 4–5)

### 3.1 Why this shape

Three shapes were considered:

- *Free-standing blocks that each fetch what they need* (as `Upsells` reads the URL today):
  rejected. Every piece would re-derive the product, the selected state and the loading /
  not-found handling; the menu sheet has no route to read; and nothing could guarantee that a
  page shows a price next to its add-to-cart button.
- *Keep the monolith with an "order" prop*: rejected. It cannot hold content between pieces or
  give a piece its own style, and every new piece would widen one ever-larger schema.
- **A container that owns state, with parts that only render** (chosen): the data flow of a flow
  stays in one component, as v0.7.0 §7 promised ("the functional blocks are the existing feature
  components moved behind a block wrapper"); parts cannot fetch, mutate or navigate on their own,
  so an arrangement can change what a shopper *sees*, never what a purchase *does*.

### 3.2 Contract (`web/src/builder/parts.ts`, runtime-safe)

```ts
export type PartFamily = 'product' | 'catalogue' | 'card-tile' | 'card-row';   // stages 4–5 add theirs

export interface ContainerSpec {
  family: PartFamily;
  /**
   * Default content for every slot. Called with the container's parsed props (legacy toggles
   * included), the layout and the container's id; returns fresh components with ids derived as
   * `${id.slice(0, 40)}-${partKey}` (≤ 64 chars). Used by default documents, by upgrade (§8) and by
   * the editor's "Reset arrangement".
   */
  defaultSlots(props: Record<string, unknown>, ctx: { layout: LayoutKind; id: string }): Record<string, ComponentData[]>;
  required: readonly string[];      // exactly one per container instance (parts not available in the layout are skipped)
  unique: readonly string[];        // at most one per container instance
  requires?: ReadonlyArray<readonly [part: string, needs: string]>;   // if `part` is present, `needs` must be too
  slotAccepts?: Readonly<Record<string, readonly string[]>>;         // a slot restricted to these types only
  legacyProps?: readonly string[];  // read only when slots are absent (§8); hidden in the editor, dropped on save
  insertSlot: string;               // where "Add part" puts a part when nothing inside the container is selected
}

// define.ts — BlockDef gains (both optional, mutually exclusive):
container?: ContainerSpec;
part?: { family: PartFamily };
// BlockCategory gains 'part'.

// define.ts — SlotRender gains the stored children, so a container can decide on classes that
// depend on what a slot holds (e.g. `layoutNoImage`) without rendering it first:
export type SlotRender = ((p?: { className?: string; style?: CSSProperties; as?: ElementType }) => ReactNode)
  & { readonly items: readonly ComponentData[] };

/** A family's context: the container's data plus the views that draw each part. */
export interface FamilyValue<Data> { data: Data; views: Readonly<Record<string, ComponentType<PartViewProps>>> }
export interface PartViewProps { props: Record<string, unknown>; styleAttrs?: StyleAttrs }
export function createFamily<Data>(family: PartFamily): {
  Provider: Provider<FamilyValue<Data> | null>;
  useData(): Data;                          // throws outside a container (a view never renders outside one)
  PartHost(p: { name: string; props: Record<string, unknown>; styleAttrs?: StyleAttrs }): ReactNode;
};
/** True when `items` holds something that will render: any type not in `silent`. */
export function slotShows(items: readonly ComponentData[], silent: ReadonlySet<string>): boolean;
/** Depth-first through registered slots: does the subtree hold a block of `type`? */
export function containsType(items: readonly ComponentData[], type: string): boolean;
```

- `render.tsx`'s `slotRender` attaches `items` (it already has them). The editor's `EditorBlock`
  reads the block's stored slot arrays through Puck's `getItemById(id)` (the API `insert-target.ts`
  already uses) and attaches them to Puck's slot functions, so canvas and shop see the same items.
- A **part block's `render`** is always `(p) => <PartHost name="<Block>" props={p} styleAttrs={p.puck.style} />`.
  `PartHost` reads the family context; with no container above it (impossible after the guard,
  possible mid-drag in the editor) it renders `null`. It never fetches or calls a mutation.
- A **container's `render`** is `(p) => <XContainer {...p} />` — lazy as today — and the lazily
  loaded container view wraps its output in `Family.Provider value={{ data, views }}`, where
  `views` is a static map imported from the same chunk (`features/catalog/product-parts.tsx`,
  `catalogue-parts.tsx`, `card-parts.tsx`).

### 3.3 Why views travel through context

The block files are globbed into the main bundle by the registry. If each part imported its view,
the whole product page would move into the entry; if each part used `lazy()`, every part would
suspend once on first render (a separate promise per lazy component) and flash its fallback.
Handing views down from the container keeps today's chunks exactly (the container is the only
`lazy()`, as now), makes parts render in the same commit as their container, and means a part
simply cannot exist without the state it reads.

### 3.4 Placement

- `allowedOn(part, docKey)` = allowed where its family's container is allowed:
  `product` → `product`; `catalogue` → `catalog`; `card-tile` → `card:tile`; `card-row` → `card:row`.
- New rule `part-placement:<Part>`: the part's **nearest container ancestor** (through every slot,
  hidden ones included, like `placement`) must be of its family. A part at the page root, or in a
  `Section` outside the container, fails. Content blocks may sit *between* a container and its
  parts (a `Columns` in the product page's main slot holding the price and stock is valid).
- A container's slots accept its family's parts, the group part, content blocks, and non-route
  `catalogue` blocks allowed on the document (`FeaturedProducts`, `Upsells`, `CategoryNav`,
  `SearchField`) — unless `slotAccepts` narrows the slot. Route blocks and other containers never.
- Card documents (`card:tile`, `card:row`) accept only their frame and their family's parts: every
  other block would repeat once per product (hundreds of repeated headings for a screen reader) and
  any link or button would sit under the card's stretched link.

## 4. Rules (`rules.ts`)

Per **container instance** (two containers on one catalogue each need their own results),
counting parts through visible slots and stopping at a nested container:

| Rule id | Meaning |
|---|---|
| `part-required:<Container>.<Part>` | a required part is missing or appears more than once |
| `part-unique:<Container>.<Part>` | a part appears more than once (most parts render fixed element ids, e.g. `bulk-heading`, `upsells-heading`, or the page's only `h1`) |
| `part-requires:<Part>.<Needs>` | e.g. a card's add button without its price |
| `part-placement:<Part>` | §3.4 |
| `slot-accepts:<Container>.<slot>` | a restricted slot holds something else |
| `exactly-one:CardTile` / `exactly-one:CardRow` | on `card:tile` / `card:row` |

Stage 2's `hidden-required` extends to parts: a block with `hide` may not contain, at any depth
inside a container, a part that container requires. Required parts accept no `hide` themselves
(§9). Messages are shopper-neutral editor copy, e.g. "The product page needs its Add to cart
button." / "A product card with an add button must also show the price."

**Required, and why:**

| Container | Required | Why |
|---|---|---|
| `ProductDetail` | `ProductTitle`, `ProductPrice`, `ProductAddToCart` | the page's only `h1`; no one should buy without seeing the price; the purchase path. `ProductAddToCart` exists only in the storefront layout (§7.2), so menu / web-app sheets require title and price. |
| `ProductGrid`, `ProductList` | `CatalogTitle`, `CatalogResults`, `CatalogEmpty` | the page's `h1` (visual hiding stays the `pageTitle` override, which keeps it for screen readers); the products themselves; the empty states carry the only "Clear search" / "Show all" recovery. |
| `CardTile` | `CardTileName` | the card's only link to the product page |
| `CardRow` | `CardRowName` | the row's only way to open the product |

Every part of every family is `unique`. `requires`: `CardTileAdd → CardTilePrice`,
`CardRowAdd → CardRowPrice`.

## 5. The parts

### 5.1 Product page and sheet (`family: 'product'`, container `ProductDetail`)

Container slots: `top`, `media`, `main`, `below`. On the page surface:

```
<article class="page FADE">                    ← container
  {top()}                                       bare
  <div class="layout[ layoutNoImage]">
    {mediaShows ? media({ className: media }) : null}
    {main({ className: detail })}
  </div>
  {below()}                                     bare
</article>
```

`mediaShows = slotShows(media.items, product.imageProductId === null ? {'ProductGallery'} : {})`;
`layoutNoImage` is added exactly when `!mediaShows` — today's `hasImage` rule. On the **sheet
surface** (§7.2) the container renders `top`, `media`, `main`, `below` bare, in that order, after
its own loading / failed states.

| Part | Page view (DOM = v0.7.0) | Sheet view (DOM = v0.7.0) | Layouts |
|---|---|---|---|
| `ProductBreadcrumbs` | `<nav class="crumbs">` trail | the same nav | all |
| `ProductGallery` | `<ProductImage variant="web" eager>` (null without image) | `<ProductImage class="thumb">` | all |
| `ProductTitle` | `<header class="head"><h1 data-sf-part="page-title">` + SKU when `showSku` | `<h2 data-sf-part="sheet-title">` | all |
| `ProductPrice` | `<p class="price" data-sf-part="price">` | `<div class="priceBand">` label + price | all |
| `ProductStock` | `<div class="flags">` stock chip, pre-order, minimum | `<p class="flags">` SKU (when `showSku`), chip, pre-order, minimum | all |
| `ProductAddToCart` | `<AddToCart size="lg">` | — (pinned in the sheet footer) | storefront |
| `ProductDescription` | `<p class="description">` | `<section class="block">` "Description" | all |
| `ProductBulkPricing` | `<section aria-labelledby="bulk-heading">` | `<section class="block">` | all |
| `ProductProvenance` | `<section aria-labelledby="provenance-heading">` | `<section class="block">` | all |
| `ProductAsk` | `<section class="ask">` + contact links | `<section class="block">` | all |
| `ProductUpsells` | `<Upsells product>` (cards) | `<Upsells product onSelect>` (rows, swap in place) | all |
| `ProductGroup` | `kind`: `priceRow` → `<div class="priceRow">`, `identity` → `<div class="identity FADE">`, `identityText` → `<div class="identityText">`; one slot `items` | same classes | all |

Each view renders `null` exactly when v0.7.0 omitted the piece (no description, no tiers, no
provenance, no contact links, no curated upsells). `ProductGroup`'s kinds keep the three wrappers
the two surfaces use; an owner adding a group gets `priceRow` ("Side by side"), and the editor
labels the other two "Text beside thumbnail" and "Text column".

**Default arrangement** (`ProductDetail.container.defaultSlots`):

- *storefront*: `top` [Breadcrumbs] · `media` [Gallery] · `main` [Title, Group(priceRow)[Price,
  Stock], AddToCart, Description, BulkPricing, Provenance, Ask] · `below` [Upsells].
- *menu, webapp* (the sheet): `top` [] · `media` [] · `main` [Group(identity)[Group(identityText)
  [Title, Stock], Gallery], Price, Description, BulkPricing, Provenance, Ask] · `below` [Upsells].

The container keeps: the product query (`useProduct`), the catalogue (for the trail), the
not-found / pending / error states (unchanged markup and keys), the `document.title` effect on the
page surface, and its `sku` override prop. `gallery`, `bulkPricing`, `provenance`, `upsells` become
`legacyProps` (§8).

### 5.2 Catalogue grid and list (`family: 'catalogue'`)

**`ProductGrid`** slots `top`, `rail`, `main`:

```
<div class="page FADE">                         ← container (loading / error states unchanged, before any slot)
  {top()}                                        bare
  <div class="layout[ noNav]">
    {railShows ? rail() : null}                  bare — its items are grid items of .layout
    {main({ className: column })}
  </div>
  {showCategoryPicker && containsType(all slots, 'CatalogCategories') ? <FilterDrawer/> : null}
</div>
```

`railShows = slotShows(rail.items, showCategoryPicker ? {} : {'CatalogCategories'})`; `noNav` is
added exactly when `!railShows`. `slotAccepts: { rail: ['CatalogCategories'] }` — the rail is a
grid track whose children the grid CSS positions (the rail nav is `sticky` with `align-self:
start`); anything else there would land in the wrong column.

**`ProductList`** has one slot, `content`, rendered bare inside `<div class="page FADE">`, followed
by the container-owned `ProductDetailSheet` (driven by `?p=`, §7.2) and `FilterSheet` (when
`showCategoryPicker`, as today).

| Part | Grid view | List view |
|---|---|---|
| `CatalogIntro` | the template `CatalogHero` slot, `surface="grid"`, counts from the container | `surface="list"`; renders nothing on an unknown category |
| `CatalogSearch` | `<SearchField class="search">` on the shell search state | the same (the list's shell also has one — owner's choice) |
| `CatalogCategories` | `<CategoryNav>` (chips + rail); nothing when `showCategoryPicker` is off | the same |
| `CatalogTitle` | `SectionLabel` slot + `<div class="head">` h1 + result count, or the visually hidden h1 | `SectionLabel` + `head` h1 + tally; nothing on an unknown category |
| `CatalogResults` | card grid `[data-sf-part="product-grid"]` of tiles, or `<ul class="rows">` of rows when nothing has a photo; nothing when empty | category sections of rows; nothing when empty |
| `CatalogEmpty` | unknown category / no matches / empty category states; nothing otherwise | the same |

Defaults: grid `top` [Intro, Search] · `rail` [Categories] · `main` [Title, Empty, Results];
list `content` [Title, Intro, Empty, Results]. `CatalogEmpty` and `CatalogResults` never render
together, so their default order reproduces v0.7.0's single conditional.

### 5.3 Cards (`family: 'card-tile'` / `'card-row'`)

The frame is the container and the root of a card document (`routeBound`, locked):

| Block | Renders (v0.7.0 `ProductCard` / `ProductRow`) |
|---|---|
| `CardTile` | `<article class="card anim" data-sf-part="product-card">`, slot `content` bare |
| `CardTileImage` | `ProductImage variant="thumbnail" class="media"`, or the empty well when a sibling has a photo, else nothing |
| `CardTileGroup` | `kind` `body` → `<div class="body">`, `foot` → `<div class="foot">`; slot `items` |
| `CardTileName` | `<h3><Link class="link">` (the stretched link) |
| `CardTileFlags` | `<div class="flags">` minimum, pre-order, stock — only when one applies |
| `CardTilePrice` | `<p class="prices">` price + best tier |
| `CardTileAdd` | `<div class="add"><AddToCart size="sm" showPrice={false}>` |
| `CardRow` | `<div class="row[ anim]" data-sf-part="product-row">`, slot `content` bare |
| `CardRowGroup` | `kind` `text` → `<div class="text">`; slot `items` |
| `CardRowName` | `<h3><button class="open">` → the context's `onSelect` |
| `CardRowMeta` | `<p class="meta">` SKU, minimum, tier, pre-order, stock — only when one applies |
| `CardRowPrice` | `<p class="price" data-sf-part="price">` |
| `CardRowAdd` | `<div class="gutter">` quick add / stepper; nothing when ordering is off |

Defaults: tile `content` [Image, Group(body)[Name, Flags, Group(foot)[Price, Add]]]; row
`content` [Group(text)[Name, Meta], Price, Add].

Card context (per card): `{ product, index?, eager, hasSiblingImages, onSelect? }` — exactly the
props the two components take today.

## 6. The card designer

### 6.1 Storage

```ts
export type CardKind = 'tile' | 'row';
export type CardKey = `card:${CardKind}`;
export type DocKey = RouteKey | 'shell' | CardKey;
export interface PageSet { schemaVersion: 1; shell: PuckDoc; pages: …; text?: PageText; cards?: Partial<Record<CardKind, PuckDoc>> }
```

- **Per layout, inside the page set**, sparse like `pages`: absent kind = built-in design. It
  publishes, versions, restores and diffs with the layout, which matches how an owner thinks of a
  layout's look, and needs no new table, endpoint or history.
- Not in `pages`: those keys are routes (the backend checks them against the route list, the
  custom-page cap counts them, the admin labels them as pages). Not a section of `shell`: the shell
  is one document of chrome; cards would mix product internals into it and be counted by its rules.
  Not store-wide: that would need a second publish path like Site text for little gain — tiles
  and rows already differ in practice between the storefront and menu layouts.
- A card document's root props are ignored (`EMPTY_ROOT`); the editor shows no page settings for it.
- **Both kinds exist in every layout**: tiles appear in the grid, `FeaturedProducts` and page
  upsells; rows in the list, the grid's all-imageless mode and the sheet's upsells.

### 6.2 Where designs apply

`CardDesignProvider` (mounted by `PuckShell`, and by the editor canvas and exact preview) reads
`pageSet.cards` from the same query/override as the page set. `ProductCard` and `ProductRow` keep
their names, props and call sites (`ProductGrid` results, `ProductList` results, `Upsells`,
`FeaturedProducts`) and gain one line: `const design = useCardDesign('tile')` — with a design they
return `design.render(props)`, otherwise their built-in composition. `WholesaleRow` is untouched.

### 6.3 Compile once, render many

`compileCard(doc, kind, layout): CardDesign | null` (`web/src/builder/cards.ts`, runtime-safe):

1. `validateDoc(doc, 'card:<kind>', layout)` — once, memoised per document object as today;
   a violation ⇒ `null` ⇒ the built-in design.
2. Walk the cleaned tree once and build a **static React element tree**: for each component,
   stage 2's `renderBlock(def, props, ctx)` with slot props bound to the already-built child
   elements (`items` attached), `ctx = { editing: false, docKey, layout }`. Block renders are pure
   (the contract forbids hooks), so calling them at compile time is safe.
3. Memoise per `(doc object, layout)` in a `WeakMap`.

`design.render(cardProps)` returns `<CardFamily.Provider value={{ data: cardProps, views }}>
{design.element}</CardFamily.Provider>` — the **same element objects** for every card. Per card
there is no parse, no guard walk, no tree walk and no Puck: only the part components render, as the
built-in card's sub-components do today. There is no per-part error boundary in compiled cards; one
`CardDesignBoundary` per card list catches a throw, logs once, marks that kind failed in the
provider for the rest of the page load, and every list re-renders with the built-in design.

The built-in `ProductCard` / `ProductRow` are refactored into the same part views
(`card-parts.tsx`), composed in fixed JSX — so the no-design path is today's cost and a unit test can
prove the compiled default document draws identical markup (§12).

## 7. Interactions

### 7.1 Wholesale mode

With `features.wholesale` on, `ProductGrid` and `ProductList` render `WholesaleCatalogPage` under
their core-option scope and ignore their slots, as v0.6.0's rule and today's `CatalogueBody` do —
so owner content inside those containers is hidden too, while blocks outside them still render.
The editor shows a notice on the container: "Wholesale mode is on: shoppers see the trade list
here. This arrangement shows when wholesale mode is off." `WholesaleTable` stays a monolith this
stage: its rows are a form (quantity inputs, tier ladder, trade bar) whose columns align across the
table; splitting it is not in this initiative's plan.

### 7.2 Menu and web-app layouts, and the product sheet

- In menu and webapp the `product` route redirects to the catalogue with `?p=<id>` (unchanged), so
  that layout's `product` document had no shopper-visible effect. It now drives the **sheet body**.
  `ProductDetailSheet` keeps its `Sheet` chrome — header (category trail eyebrow, close) and the
  pinned `<AddToCart size="lg">` footer — its title effect and its product query; its body renders
  the layout's guarded `product` document through `RenderDoc` inside a `ProductHostContext`
  `{ productId, onSelect, surface: 'sheet' }`. The container, seeing `surface: 'sheet'`, renders the
  sheet's loading shapes / failed state / parts (the same markup as today's `Loading`, failed block
  and `Detail`); with no host it is the page surface reading `useParams()`.
- `ProductAddToCart` is `layouts: ['storefront']`: in a sheet the add button is pinned to the
  footer for thumb reach, never arranged. A stored `ProductAddToCart` in a menu document is dropped
  as `drop:layout` (informational).
- Content blocks at the root of a menu `product` document render in the sheet body around the
  container. Root `title` / `description` of that document do nothing (the sheet is not a route);
  the editor hides those fields for it.
- The Telegram MainButton / `PrimaryActionBar` do not read the product surfaces; unaffected.

### 7.3 SEO and metadata

The product page's `document.title` effect stays in the container (page surface) and the sheet
host (sheet); parts cannot touch metadata. The root `title` override hint for the product page is
unchanged. There is no structured data today and this stage adds none. `ProductTitle` being
required keeps exactly one `h1` on the product page; `CatalogTitle` keeps the catalogue's.

### 7.4 Loading and errors

Only containers show loading, error and not-found states, with today's markup, before any slot
renders: a part never renders without its data, so no part has a skeleton. Card designs arrive in
the page-set response, which the shell already waits for, so no card waits on anything.

## 8. Old documents — upgrade in memory

A v0.7.0 (or stage 1/2) document stores `ProductDetail`, `ProductGrid` or `ProductList` with no
slot keys. `upgradeDoc(doc, docKey, layout)` (`web/src/builder/upgrade.ts`, pure, runtime-safe):

- For every component whose block has a `container`: each slot whose key is **absent**
  (`undefined`) is filled from `container.defaultSlots(parsedProps, { layout, id })`. A slot that is
  present — even `[]` — is never touched. Idempotent.
- `ProductDetail` on storefront maps its legacy toggles: `gallery: false` ⇒ `media` []; `bulkPricing:
  false` / `provenance: false` ⇒ that part left out of `main`; `upsells: false` ⇒ `below` []. The
  result renders exactly what v0.7.0's `ProductDetailPage sections={…}` rendered. On menu / webapp
  the toggles are ignored and the sheet default is used, because v0.7.0's sheet never read them.
- `ProductGrid` / `ProductList` have no layout-relevant legacy props; their `categoryPicker`,
  `pageTitle`, `intro`, `sku` overrides stay live container props.

Where it runs: the **guard** (in `cleanItems`, before a container's slots are cleaned, so the
filled parts get the same id de-duplication, budget and checks) and the **editor's load**
(`page-set.ts` `fromPageSet`) before the documents reach Puck — otherwise Puck would render empty
slots and the first autosave would store `[]`, wiping every part. `validateDoc`'s memo key already
includes the layout.

Legacy props stay in the schemas forever (names are never reused), are read only by `defaultSlots`,
are not shown as fields (`derive-fields` skips `legacyProps`; the "every schema key has a field"
test exempts them), and `prepareProps` drops them from a container whose slots are present. A
rollback to v0.7.0 is safe: its `z.object` strips the slot props, the missing toggles default to
`true`, and the unknown part types are never reached because v0.7.0 does not know those slots.

No stored document is rewritten by the backend or by a migration; an old document takes the new
shape the next time an owner edits it.

## 9. Styling (stage 2) and text (stage 1) per part

Stage 2 key sets: **BOX** = `bg padTop padBottom padX marginTop marginBottom border borderColor
borderStyle radius shadow maxWidth`; **TEXT** = `fg textSize align`; **VIS** = `hide`. Parts own a
root, so they are `root` targets; a shared feature component that is a part's root gains an
optional `rootAttrs?: StyleAttrs` prop spread on its root (`AddToCart`, `ProductImage`,
`SearchField`, `EmptyState`, `Upsells`; `CategoryNav` gains `navAttrs` for its two navs) — `undefined` adds nothing.
Required parts never take `hide`. Parts offering TEXT switch their module CSS to
`var(--sf-block-fg, <today>)` and `calc(<today> * var(--sf-text-scale, 1))`, which compute to today's
values when unset. Containers keep their stage-2 support (`wrap`, BOX) — the sheet surface has no
root element to carry attributes.

| Part | Target | Keys | Text patterns (`BlockDef.text`) |
|---|---|---|---|
| `ProductBreadcrumbs` | root | BOX + TEXT + VIS | `product.detail.breadcrumb`, `product.detail.shop` |
| `ProductGallery` | root (via `ProductImage`) | BOX + VIS | — |
| `ProductTitle` *(req.)* | root | BOX + TEXT | — (data) |
| `ProductPrice` *(req.)* | root | BOX + TEXT | `product.sheet.unit` |
| `ProductStock` | root | BOX + TEXT + VIS | `product.stock.*`, `product.detail.preorderShips`, `product.sheet.ships`, `common.product.preorder`, `product.limit.min` |
| `ProductAddToCart` *(req.)* | root (via `AddToCart`) | BOX | `product.add.*`, `common.product.*` |
| `ProductDescription` | root | BOX + TEXT + VIS | `product.sheet.description` |
| `ProductBulkPricing` | root | BOX + TEXT + VIS | `product.bulk.*` |
| `ProductProvenance` | root | BOX + TEXT + VIS | `product.provenance.*` |
| `ProductAsk` | root | BOX + TEXT + VIS | `product.ask.*`, `common.contact.*` |
| `ProductUpsells` | root (via `Upsells`) | BOX + VIS | `product.upsells.*`, `PRODUCT_CARD_TEXT` |
| `ProductGroup`, `CardTileGroup`, `CardRowGroup` | root | BOX + `align` + VIS | — |
| `CatalogIntro` | wrap | BOX + VIS | `HERO_TEXT` — the template slot owns its DOM |
| `CatalogSearch` | root (via `SearchField`) | BOX + VIS | `catalog.search.*` |
| `CatalogCategories` | pass → both navs (chips and rail; only one shows per width) | BOX + VIS | `catalog.nav.*` |
| `CatalogTitle` *(req.)* | root → the `head` div (the template's section label above keeps its own look) | BOX + TEXT | `catalog.list.allProducts`, `.count`, `.matching`, `.unit`, `.of`, `SECTION_LABEL_TEXT` |
| `CatalogResults` *(req.)* | wrap (the list renders a run of sections) | BOX | `catalog.group.*`, `PRODUCT_CARD_TEXT`, `SECTION_LABEL_TEXT` |
| `CatalogEmpty` *(req.)* | root (via `EmptyState`) | BOX + TEXT | `catalog.list.eyebrow*`, `catalog.list.*Detail`, `catalog.list.showAll`, `common.list.*`, `common.actions.tryAgain` |
| `CardTile`, `CardRow` *(frames)* | root | BOX | — |
| `CardTileImage` | root | BOX + VIS | — |
| `CardTileName`, `CardRowName` *(req.)* | root | BOX + TEXT | — (data) |
| `CardTileFlags`, `CardRowMeta` | root | BOX + TEXT + VIS | `product.limit.min`, `common.product.preorder`, `product.stock.*` |
| `CardTilePrice`, `CardRowPrice` | root | BOX + TEXT + VIS | — |
| `CardTileAdd` | root | BOX + VIS | `product.add.*`, `common.product.*` |
| `CardRowAdd` | root | BOX + VIS | `product.add.*`, `product.row.*`, `common.qty.*`, `common.product.preorder` |

`textSize` is never offered on a part containing an input (`CatalogSearch`, the add controls).
Containers' `text` narrows to what they still draw themselves: `ProductDetail` — `product.detail.product`,
`.notFoundTitle`, `.notFoundDetail`, `.browse`, `product.sheet.loadFailed`, `common.actions.tryAgain`,
`common.status.loading`; `ProductGrid` / `ProductList` — their load-failed state, `catalog.filter.*`,
and (list) the sheet chrome `product.detail.product`, `common.actions.close`. The stage-1 coverage
test keeps proving every key is covered by some block.

**Template CSS.** Every `data-sf-part` stays on the same element. With the default arrangement
the DOM is unchanged, so every template is. A *custom* card arrangement can stop matching a
template's structural selectors (bento styles `[data-sf-part="product-card"] > :first-child` as the
image and features the grid's first card); that is the owner's visible choice in an editor that
renders the real template. `templates.md` gains: "structural selectors inside product surfaces
assume the default arrangement; degrade gracefully when it changes."

## 10. Backend and admin

### 10.1 Backend (`ecommerce-backend`, `storefront-pages/schemas.ts`) — deploys first

- `pageSetSchema` gains `cards: z.strictObject({ tile: puckDocSchema.optional(), row:
  puckDocSchema.optional() }).optional()` — strict, so an unknown kind is a loud 400 in autosave.
  **Without this the non-strict root would silently strip `cards` on every save.**
- `checkStructure` walks `cards.tile` / `cards.row` like a page (paths `['cards', kind, …]`):
  component shape, type regex, id length, depth, `blockStyle`, link props; they share the
  2 000-component budget and the 512 KB cap. `sanitizeHtmlProps` runs over `cards` too.
- No new limit (the default product page grows from 1 to 13 components, a card document is 6–8),
  no DB migration, no new route. The public read already returns the stored set minus `text`, so
  `cards` reaches shoppers with no change; a test pins it.
- Tests (`npm test`): cards accepted and stored; unknown kind 400; a card document's components
  count toward 2 000 and its bytes toward 512 KB; `*Html` inside a card document sanitised; a bad
  link prop in a card document 400; public read returns `cards`.

### 10.2 Admin (`ecommerce-admin-frontend`)

The editor protocol mirror is a `looseObject` and already carries `cards`. Two small changes, or a
card-only edit would show an empty diff and Publish would stay disabled:

- `types/storefront-pages.ts`: `PageSet.cards?`, `CardKey` in `DocKey`.
- `diff.ts` `docsOf` adds `card:tile` / `card:row`; `labels.ts` names them "Product card" and
  "Product row" and ranks them after the fixed routes.

Gates: `npm run build`, lint against the pre-branch baseline, mocked Pages pass with a card-only
edit enabling Publish.

### 10.3 Storefront transport

`api/pages.ts` `toPageSet` passes `cards` through (a malformed `cards` is dropped alone, keeping the
set); the editor's `protocol.ts` `pageSetSchema` — a **strict** `z.object` — gains `cards`, or every
load would strip the designs; `sf-builder-select-page` accepts card keys. `protocol` stays `1`.

## 11. Editor

- **Parts palette.** A drawer category per family ("Product page parts", "Catalogue parts",
  "Card parts"), shown only on documents where that family's container lives. `buildEditorConfig`
  sets Puck `allow` lists on every slot field of that document: container slots per §3.4, other
  slots (e.g. a `Section` inside the container) allow the family's parts too, and `rail` allows only
  `CatalogCategories`. Puck cannot restrict its root zone, so a part dropped at the page root shows
  the `part-placement` issue, highlighted, and blocks Publish. "Add block" with nothing selected
  inside the container inserts a part at the end of the container's `insertSlot`
  (`insert-target.ts` gains the rule).
- **Container panel.** Selecting a container shows, after its fields, a **Parts** list: every part
  of its family with its state (on the page / removed) and **Add** for a removed optional part,
  which inserts it where the default arrangement puts it (after the nearest default predecessor
  present, else at the start of its default slot). **Reset arrangement** replaces the slots with
  `defaultSlots` in one undo step, keeping the container's own props.
- **Locks.** Required parts get `permissions: { delete: false, duplicate: false }` on documents
  where they are required; every other part gets `duplicate: false`. Frames are locked like route
  blocks.
- **Preview product.** On `product` and card documents the header shows **Preview with** — a
  product picker over the live catalogue, defaulting to the first product with a photo; with an
  empty catalogue, a built-in Northbound Supply fixture product (`editor/fixtures.ts`). It sets the
  fixture route's id (page) or the host context (sheet, cards).
- **Sheet canvas.** In menu / webapp the page picker lists `product` as "Product sheet"; the
  canvas draws it in a 420 px column between non-interactive copies of the sheet header and footer.
  The exact preview opens the catalogue with `?p=<preview id>`, so the real sheet shows the draft.
- **Card designer.** Page picker group "Product cards": "Product card" (`card:tile`) and "Product
  row" (`card:row`), in every layout. Container and `FeaturedProducts` / `ProductUpsells` panels
  link to it ("Edit card design"). The card canvas (the Puck root render for card documents) is a
  **card stage**: a `[data-sf-part="product-grid"]` grid (tiles) or a `rows` list (rows) holding the
  one editable card for the preview product, followed by three compiled, `inert` copies for derived
  states of that product — out of stock, pre-order with a minimum quantity, no photo (clones with
  fields flipped, never saved) — so the owner sees every state and the real template's grid rules.
- **Notices** (editor-only copy): the wholesale notice (§7.1); `ProductAddToCart` explaining the
  pinned sheet footer in menu / webapp; the existing "double intro" hint now looks for a
  `CatalogIntro` part in a list container whose `intro` override is not `hide`.
- Everything above lives under `web/src/builder/editor/`; the builder-isolation check is unchanged.

## 12. Parity gate — how the defaults reproduce today's JSX

With no published set (or a set that never touches these blocks), every product surface renders
from the default arrangement of §5, and:

1. **Wrappers**: the only elements a container adds are exactly today's (`article.page`,
   `div.layout`, `div.media`, `div.detail`, `div.page`, `div.layout`, `div.column`), produced by
   `SlotRender({ className })` which adds exactly one element with exactly that class. Every other
   slot renders bare. `RenderDoc` adds no element per block (boundaries and keys are not DOM).
2. **Conditional classes** are computed from slot items with today's conditions (`layoutNoImage`
   ⇔ no gallery would render; `noNav` ⇔ no rail would render).
3. **Part markup** is the v0.7.0 JSX moved verbatim into views, including `null` returns,
   conditional attributes, `aria-labelledby` ids and class-string construction. Stage 1 keys and
   stage 2's "no style ⇒ no attribute" apply unchanged.
4. **Cards** with no design render the existing components (composed from the same views).

Gates:

- `e2e/dom-parity.spec.ts` (catalog, category, product, product-sheet, wholesale × layouts ×
  widths) passes **with no snapshot regenerated**.
- Before the refactor, the first implementation task captures golden markup of v0.7.0
  `ProductDetailPage` for every combination of the four legacy toggles × {with / without photo}
  (`web/test/__golden__/product-legacy-*.html`); a unit test renders upgraded monolith documents
  and must match them exactly.
- Unit: `compileCard(defaultTileDoc)` and `(defaultRowDoc)` render markup identical to
  `ProductCard` / `ProductRow` across a fixture matrix (photo / no photo / sibling well, in / low /
  out, pre-order ± ETA, minimum, tiers, ordering off, SKU on / off, index given / omitted).
- The templates matrix and `templates-baseline*` screenshots unchanged.

## 13. Testing

**Storefront unit (Vitest)** — new `test/builder-parts.test.ts`, `test/builder-cards.test.ts`,
plus additions:

- `parts.ts`: `slotShows`, `containsType`, `PartHost` renders null without a container.
- Rules: each required part missing / doubled per container; two `ProductGrid`s on one catalogue
  each checked separately; `part-unique`; `part-requires`; `part-placement` (root, `Section`
  outside the container, a part of another family, a valid part inside a `Columns` inside the
  container); `slot-accepts` for `rail`; `hidden-required` with a hidden `Section` holding
  `ProductPrice`; a required part in a hidden `Columns` column is reported by `part-required`
  only; `exactly-one:CardTile`; a card document holding a `Heading` → placement.
- Upgrade: absent vs `[]` slots; each legacy toggle; menu/webapp ignore toggles; idempotent;
  derived ids ≤ 64 and de-duplicated; the golden legacy markup (§12).
- Cards: guard + compile called once per document object across 500 cards (spies); a design
  that throws falls back to built-in for every list, logged once; `requires` failure ⇒ built-in.
- Contract: every part and container declares `style` per §9; required parts have no `hide`;
  every part has `part.family`, every container a `ContainerSpec` whose defaults pass its own
  rules in every layout; `blocks.json` regenerated with `container` / `part` fields.
- Text: coverage and orphan tests green with the narrowed container patterns; no new key.
- A timing benchmark (500 compiled default tiles vs 500 built-in) is logged, not gated; the
  once-per-document assertions are the gate.

**Storefront e2e (Playwright, mocked; Northbound Supply page sets in `e2e/page-sets.ts`)**

- `dom-parity.spec.ts` unchanged, no snapshot regenerated; the rest of the suite unedited.
- New `e2e/product-parts.spec.ts`: storefront product page with description moved above price, a
  `RichText` between add to cart and bulk pricing, upsells removed; a document without
  `ProductAddToCart` renders the default page; a menu sheet with bulk pricing first and the add
  button still in the footer, completing an add to cart; a grid with the search moved into `main`
  and the rail removed (`noNav` layout); a list with the intro removed; a published tile design
  (price above name, flags removed) shown in the grid, `FeaturedProducts` on a custom page and page
  upsells; a row design in the list and the sheet's upsells; a tile design with an add button and
  no price falls back to the built-in card; a v0.7.0-shaped product document with `gallery: false`
  and `upsells: false` renders no media column and no upsells; wholesale mode ignores the
  arrangement; no horizontal overflow at 360 px on every one of these, under every built-in
  template.
- `builder-editor.spec.ts`: parts only in the product page's drawer; drag description above price
  → the change carries the new order; a required part has no delete; Parts list Add restores a
  removed part in its default place; Reset arrangement; a part dropped at the root shows the issue
  and Publish reports it; card designer: edit the tile, state copies update, the catalogue canvas
  shows the new tile; opening a v0.7.0-shaped document and editing posts full slots (never `[]`).

**Backend** — §10.1. **Admin** — §10.2.

No test touches a live database, bucket, bot or deployed storefront; live verification after
deploy is a pending manual step (rearrange a test layout's product page and card, publish, check
under two templates on a phone and in the Telegram web app).

## 14. Delivery

1. **Backend** — `cards` in the page-set schema, walk, sanitise, tests. Deploy first: an older
   backend strips `cards` on save.
2. **Storefront** (released with the branch as v0.8.0; clients redeployed from the admin):
   in order — golden capture (§12); `parts.ts` + `define.ts` / `render.tsx` / `rules.ts` / guard /
   `upgrade.ts`; refactor product page and sheet into views + container + parts; catalogue grid
   and list; card views + `cards.ts` + provider; editor (palette, allow lists, Parts panel,
   preview product, sheet canvas, card designer); transport (`toPageSet`, editor protocol).
   `dom-parity.spec.ts` must pass after each surface, before the editor work starts.
3. **Admin** — diff and labels. An old admin against the new storefront publishes cards only
   alongside a page edit.

Docs: `docs/builder.md` gains "Containers and parts" (the pattern, rules, per-family tables,
upgrade) and "Card designs"; `docs/templates.md` gains the structural-selector note;
`web/public/blocks.json` regenerated.

## 15. Non-goals

A `ProductOptions` / variant part; splitting `WholesaleTable` or `WholesaleRow`; content blocks
inside card designs; more than one design per card kind (e.g. a different tile for
`FeaturedProducts`); per-category or per-product arrangements; moving the sheet's header or
pinned add button; parts outside their container (e.g. a lone price on a custom page); rewriting
stored documents server-side; structured data (JSON-LD); arranging the header, cart, account or
checkout (stages 4–5).

## 16. Review focus — likely failure modes

1. **Parity leaks from the split** — a class string rebuilt differently (`layoutNoImage`, `noNav`,
   `anim` on rows only when `index` is given), a slot rendered with an extra wrapper, a `null`
   return that became an empty element, a view whose conditional moved. Only `dom-parity.spec.ts`,
   the golden legacy markup and the card-parity unit test catch these; no snapshot may be
   regenerated to "fix" one.
2. **Absent vs empty slots** — any path that turns an absent slot into `[]` before `upgradeDoc`
   runs (a `?? []` in the guard, Puck's defaults on load, `prepareProps`) wipes an old document's
   parts on its next autosave and trips the required-part rules.
3. **Stripped in transit** — `cards` must survive the backend's non-strict root, the storefront's
   `toPageSet`, the editor's strict protocol schema, and the admin diff. One missing link silently
   discards designs on the next save.
4. **Counting per container, not per document** — two list containers on one catalogue; a part
   inside a `Columns` inside the container; a required part in a hidden column (visible-slot
   walk) vs `part-placement` (all slots).
5. **Canvas and shop disagreeing on slot items** — the editor's `items` come from Puck's API, the
   shop's from the stored doc; a stale read makes the canvas show a media column the shop won't.
6. **Compiled cards going stale or per-card** — the compile memo must key on the document object
   (the editor produces a new object per change), never re-run per card, and the per-card context
   value must not leak one product into another (reused element objects, distinct providers).
7. **Sheet vs page** — the sheet host and the container must not both set `document.title`; the
   host's footer add button and the container share one product query key; the sheet document's
   root title does nothing.
8. **Fixed element ids** — `bulk-heading`, `provenance-heading`, `ask-heading`,
   `upsells-heading`: `unique` must hold per container, and a stage 4–5 part must not reuse them.
9. **Main-bundle growth** — part blocks must stay thin shells (no view imports); the container
   remains the only lazy boundary; check the entry chunk size before and after.
10. **Template selectors under custom arrangements** — bento's first-child and featured-card rules;
    the editor must render the card stage inside the real template's grid so owners see the effect.
11. **Required parts that can vanish** — a required part whose view returns `null` for data
    reasons is fine (no description), but one that returns `null` because of an owner setting
    would defeat the rule; required parts expose no such setting and accept no `hide`.
12. **Wholesale swap hiding owner content** — expected, but only the editor notice tells the owner;
    it must show whenever the store's flag is on.
