# Puck page builder — design

Date: 2026-09-29. Status: approved in conversation, awaiting written-spec review.
Repos: `ecommerce-storefront` (renderer + editor, lead), `ecommerce-backend` (storage + API),
`ecommerce-admin-frontend` (editor host). Branch `feature/puck-builder` in all three, worked in
worktrees under `T:/Projects/ecommerce/.worktrees/puck-builder/`.

## 1. Goal

Store owners compose their storefront's structure — which sections appear on which page, in what
order, with what content — in a drag-and-drop editor built on [Puck](https://puckeditor.com)
(`@puckeditor/core`). Templates keep owning the *visual* language (tokens, presets, CSS, slots);
Puck owns *structure*. Every current feature keeps working across all three layouts
(`storefront`, `menu`, `webapp`), with every existing template.

### Decisions (made with the user)

| Question | Decision |
|---|---|
| How much is composable? | **Every page is a Puck document**, including cart, checkout, account, order status, tracking, verify. Functional flows are self-contained blocks that own their logic. |
| Layouts vs documents | **One page set per layout.** `features.layout` still picks the browser set; Telegram always gets `webapp`. |
| Publishing | **Draft + publish + history.** Autosaved draft seen only by the admin editor; atomic publish per layout; last 20 published versions kept; one-click restore. |
| New pages | **Yes** — custom pages at `/pages/<slug>`, per layout, with SEO title/description. |
| Editor hosting | **Approach A** — the editor is a lazy `/__builder` chunk inside the storefront bundle, framed by the admin, which saves through its own authenticated API. |

### Non-goals

- Owner-authored raw HTML, scripts, or arbitrary CSS per block (the existing store-wide
  `customCss` stays the only CSS escape hatch).
- Rearranging the internals of a functional flow (checkout steps, cart line layout, login
  options). Those blocks expose toggles, not sub-slots.
- Changing the template contract. Templates built before this work keep working unchanged.
- Multi-language content, A/B testing, scheduled publishing.

## 2. Guarantees

1. **No published page set ⇒ visually identical to v0.6.0.** Built-in default documents
   reproduce every page of every layout. DOM is *not* byte-identical — Puck slots add wrapper
   elements — so wrappers that sit in layout-sensitive positions (shell children, grids, sticky
   headers) render with `display: contents`. The existing Vitest + Playwright suites (including
   `e2e/templates.spec.ts`'s template × preset × layout × viewport matrix) must pass with
   no test edits other than selector updates proven necessary by a wrapper, each justified in the
   commit message.
2. **A broken edit can never take a flow down.** A document that fails validation for its route
   is replaced by that route's default document at render time (§5.3).
3. **Shoppers never download the editor.** `<Puck>`, fields, drag-and-drop and editor CSS live in
   the lazy `/__builder` chunk; a build check fails if the main entry graph imports them (§8).
4. **No secrets in the storefront**, no draft ever reachable through the public API.

## 3. Data model

```ts
type LayoutKind = 'storefront' | 'menu' | 'webapp';

type FixedRouteKey =
  | 'catalog'            // '/', '/c/:categorySlug'
  | 'product'            // '/p/:id' — storefront layout only; menu/webapp open a sheet from the list block
  | 'cart' | 'checkout' | 'login'
  | 'account.orders' | 'account.order' | 'account.loyalty' | 'account.referrals' | 'account.profile'
  | 'order-status'       // '/order/:ref/:accessKey'
  | 'payment-success' | 'payment-cancel' | 'order-placed'
  | 'verify' | 'tracking';  // tracking covers '/tracking' and '/tracking/:reference'
type RouteKey = FixedRouteKey | `page:${string}`;   // custom: page:[a-z0-9-]{1,60}

interface PageRootProps {
  title: string;            // '' = app default document title
  description: string;      // '' = brand description
  chrome: 'shell' | 'none'; // 'none' = render without the shell (order-status default)
}

interface PageSet {
  schemaVersion: 1;
  shell: PuckData;                               // must contain exactly one PageOutlet block
  pages: Partial<Record<RouteKey, PuckData>>;    // a missing fixed key = that route's default doc
}
// PuckData = Puck's own Data: { root: { props: PageRootProps }, content: ComponentData[], zones?: {} }
// Only slot fields are used for nesting — no legacy DropZones — so `zones` is always empty.
```

A published set is **sparse**: only routes the owner touched are stored; everything else renders
its default. "Reset page to default" deletes that key from the draft. Custom pages exist only if
present in `pages`.

## 4. Backend (`ecommerce-backend`)

### 4.1 Table `storefront_page_sets`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `layout` | text | `storefront` \| `menu` \| `webapp` |
| `kind` | text | `draft` \| `published` |
| `version` | integer | draft: the published version it was last based on (0 if none); published: 1, 2, 3… per layout |
| `data` | jsonb | a `PageSet` |
| `created_by` | integer FK users, nullable | |
| `created_at` / `updated_at` | timestamptz | |

Constraints: unique `(layout)` where `kind = 'draft'`; unique `(layout, version)` where
`kind = 'published'`. New migration via `npm run db:generate` (next after `0044`).

### 4.2 Module `src/modules/storefront-pages/` (router / controller / service / schemas)

Admin routes (`authenticate, authorize('admin')`, same as every `storefront-settings` route; the
module is registered under the existing `storefront` module group in `config/modules.ts`):

| Route | Behaviour |
|---|---|
| `GET /storefront-pages/:layout/draft` | The draft, or — if none — the latest published set, or `null`. Includes `baseVersion` and `latestPublishedVersion`. |
| `PUT /storefront-pages/:layout/draft` | Body `{ data: PageSet, baseVersion }`. Upserts the draft. `409 PAGESET_CONFLICT` if `baseVersion` is lower than the latest published version (someone published since this editor loaded). |
| `DELETE /storefront-pages/:layout/draft` | Discard the draft. |
| `POST /storefront-pages/:layout/publish` | Body `{ baseVersion }`. In one transaction: re-validate the draft, insert `published` row `version = latest + 1`, set the draft's `version` to it, prune published rows beyond the newest 20. `409` as above. Emits socket event `storefront-pages:published { layout, version }`. |
| `GET /storefront-pages/:layout/versions` | `[{ version, createdAt, createdBy: { id, name } }]`, newest first. |
| `GET /storefront-pages/:layout/versions/:version` | One published set (for diff/preview). |
| `POST /storefront-pages/:layout/versions/:version/restore` | Copies that version's data into a **new** published version (history is never rewritten) and resets the draft to it. |
| `POST /storefront-pages/media` | Image upload (png/jpg/webp/gif, ≤ 5 MB) to the same S3 bucket/prefix scheme as storefront branding; returns `{ url: '/media/storefront-pages/<key>' }`. |

Public route: `GET /public/storefront/pages/:layout` → `{ version, data } | null` (latest
published). Behind the storefront kill switch like every other `/public/storefront/*` route. The
Worker's allowlist already covers the `storefront/` prefix; add `storefront/pages/` to its 30 s
edge-cache list alongside `storefront/settings`. The media path must be reachable through the
Worker's `/media/*` proxy — verify the prefix is served by the existing branding media handler or
add a sibling handler.

### 4.3 Validation (`schemas.ts`) — structural only

The backend never knows which blocks exist; the storefront release decides that.

- zod shape of `PageSet` / `PuckData` / `ComponentData { type, props: { id, ...record } }`.
- `type` matches `^[A-Z][A-Za-z0-9]{0,40}$`; `props.id` is a string ≤ 64.
- Route keys: fixed list or `page:[a-z0-9-]{1,60}`; ≤ 50 custom pages per layout.
- Nesting depth (slot inside slot) ≤ 12; ≤ 2 000 components per set; serialized size ≤ 512 KB.
- Root props: `title` ≤ 120, `description` ≤ 300, `chrome` enum.
- Every string prop ≤ 20 000 chars. Any prop value that is an object with
  `{ "__richtext": true, "html": string }` — the storefront's envelope for richtext fields — has its
  `html` passed through an allowlist sanitiser (the backend's existing `isomorphic-dompurify` dep, configured with an explicit allowlist): tags `p h2 h3 h4 strong
  em u s a ul ol li blockquote br code`; `a[href]` limited to `https:`, `mailto:`, `tel:`, and
  site-relative `/` paths; `rel="noopener noreferrer"` forced on external links; no attributes
  otherwise. The sanitised value is what is stored.
- Any string prop whose key ends in `Url`/`url`/`href` must be `https:`, `mailto:`, `tel:`, a
  site-relative path starting with `/`, or `''`.

### 4.4 Tests

Vitest (backend's `npm test`): schema accept/reject cases for every limit above; richtext
sanitising; publish increments version and prunes to 20; restore creates a new version; conflict
409 on stale `baseVersion`; public route returns only published data and `null` when none.

## 5. Storefront renderer (`ecommerce-storefront/web`)

New folder `web/src/builder/`:

```
builder/
  config.tsx          Puck Config: categories + every block (render-only fields stripped for <Render>)
  blocks/<Name>.tsx   one file per block: export const block = defineBlock({ schema, fields, defaultProps, render, rules? })
  define.ts           defineBlock(), zod helpers for palette-token/route-link/richtext fields
  guard.ts            validateDoc(doc, routeKey, layout) → { doc, issues[] }
  rules.ts            required-block rules per route key
  defaults/<layout>/<routeKey>.ts + shell.ts   built-in default documents
  runtime.tsx         <PuckShell>, <PuckPage>, usePageSet(), block + page error boundaries
  editor/             lazy /__builder chunk (§6) — nothing outside editor/ may import from it
```

### 5.1 Routing

`router.tsx` keeps its route table and guards. Changes:

- `ShellSwitch` → `<PuckShell />`: resolves the layout (`useEffectiveLayout()`), renders that
  layout's `shell` doc. The `PageOutlet` block renders react-router's `<Outlet />`.
- Each route element becomes `<PuckPage routeKey="…" />` (existing `Guard`s wrap it unchanged).
  `ProductRoute`'s menu/webapp redirect and `CartRoute`'s drawer hand-off stay as they are, around
  `<PuckPage>`.
- `/order/:ref/:accessKey` moves under the shell route; its default doc has `chrome: 'none'`, and
  `<PuckShell>` renders only the outlet (plus system mounts) for a page whose root says `none` —
  reproducing `Chromeless`.
- New `pages/:slug` route → `<PuckPage routeKey={`page:${slug}`} />`; unknown slug → the existing
  catch-all redirect to `/`.
- `/__builder` → lazy editor route, registered outside the shell (§6).

### 5.2 Loading

`usePageSet(layout)` — React Query on `GET /api/storefront/pages/:layout`, same stale time as
settings, fetched in parallel with settings at boot. While loading, pages render their default
docs' skeletons as today (the default docs *are* today's pages, so there is no extra loading
state). A failed fetch or `null` ⇒ defaults. Preview frames (`?sf-preview=1`) and the builder use
the draft posted by the admin instead (§6).

### 5.3 The guard (`validateDoc`)

Runs on every doc before `<Render>`, memoised per doc object:

1. **Unknown block types** (saved against a newer release, or removed) are dropped with one
   `console.warn` per type.
2. **Props** are parsed by the block's own zod `schema`; an invalid field falls back to that
   field's `defaultProps` value (field-by-field, mirroring `resolveOptions()`).
3. **Required-block rules** (`rules.ts`), checked after 1–2:

| Doc | Rule |
|---|---|
| shell | exactly one `PageOutlet` |
| `catalog` | ≥ 1 of `ProductGrid` / `ProductList` / `WholesaleTable` |
| `product` | exactly one `ProductDetail` |
| `cart` | exactly one `CartContents` and exactly one `CartSummary` |
| `checkout` | exactly one `CheckoutFlow` |
| `login` | exactly one `LoginOptions` |
| `account.*` | exactly one of that route's block (`OrdersList`, `OrderDetail`, `Loyalty`, `Referrals`, `Profile`) |
| `order-status` | exactly one `OrderStatus` |
| `payment-success` / `payment-cancel` / `order-placed` | exactly one `PaymentSuccess` / `PaymentCancel` / `OrderPlaced` |
| `verify` / `tracking` | exactly one `VerifyForm` / `TrackingLookup` |
| custom pages | none; may not contain route-bound blocks (anything in the table above, `PageOutlet`, `ProductDetail`) |
| any page doc | no `PageOutlet` |

   Blocks also declare `layouts` (e.g. `WholesaleTable` is valid everywhere, the webapp `Header`
   variant only in `webapp`); a block outside its layouts is dropped as in step 1.
4. If a rule fails, the **whole doc is replaced by the route's default** and one `console.error`
   names the rule. The editor shows the same issues inline (§6).

### 5.4 System mounts (never blocks)

`<PuckShell>` always mounts, regardless of the doc: the theme bridge / first-paint handling,
`CartDrawer`, `LoginModal`, the Telegram chrome (`useTelegramChrome`, `PrimaryActionBar` wiring,
MainButton/BackButton), `MobileCartBar`'s visibility logic (the bar itself is a block so owners
can place it; if absent, the system mounts the default one on phone widths so checkout is always
reachable), the preview listener, the template `Overlay` slot, and the per-route document title.

### 5.5 Templates

Templates are untouched. Every block keeps the `data-sf-part` attributes its component carries
today (they live inside the components, which the blocks wrap). Template slots render inside
their blocks: `Header` renders the `TopBar` slot above itself when its `topBar` prop is on (the
default), `Footer` renders the template `Footer` slot in its `template` variant, `CatalogHero`
renders the `CatalogHero` slot in its `template` variant, list/grid blocks render `SectionLabel`.
Core options (`useCoreOptions()`) keep applying store-wide; blocks may add a local override prop
(`inherit` | `show` | `hide`) where a core option applies, e.g. `ProductGrid.sku`.

### 5.6 Error boundaries

Each block renders inside a boundary that renders nothing on throw and logs once; a page-level
boundary around `<Render>` falls back to the route's default doc (and, if the default itself
throws, to the existing app error handling).

## 6. Editor (`/__builder`, storefront)

- Boots only when `?sf-builder=1` **and** `window.parent !== window`, cached per window exactly
  like `isPreviewMode()`. Otherwise `/__builder` redirects to `/`.
- Messages in (from the admin, `event.source === window.parent`, zod-parsed, anything else ignored):
  `sf-builder-load { layout, pageSet | null, theme, baseVersion }`, `sf-builder-theme { theme }`
  (Appearance changes while editing; `customCss` dropped as in preview mode),
  `sf-builder-select-page { routeKey }`.
- Messages out (`targetOrigin` = the admin origin captured from the first valid `load`'s
  `event.origin`): `sf-builder-ready`, `sf-builder-change { pageSet, issues }` (debounced 500 ms),
  `sf-builder-upload-request { requestId, file }` → the admin performs the authenticated upload and
  answers `sf-builder-upload-result { requestId, url | error }` (the storefront never holds a token).
- UI: `<Puck>` with Puck's own iframe canvas **disabled** (`iframe={{ enabled: false }}`) — the
  editor already lives in an isolated frame and the app's global CSS/theme must apply to the
  canvas. Header overrides: page picker (fixed routes grouped as in §3, custom pages, "+ New
  page" asking for slug + title), a layout badge, viewport toggle (360 / 768 / 1280), "Reset page
  to default", and an issues list. Required-block issues and the offending blocks are highlighted;
  route-bound blocks show a lock icon and cannot be deleted from their own route.
- Blocks render with live catalogue/settings data from the public API. Blocks that need a session,
  an order, a cart or a checkout run in **fixture mode** inside the editor: a "Preview as" toggle
  (`signed out` / `signed in` / `signed in, has orders`, `empty cart` / `cart with items`) feeds
  built-in fake data ("Northbound Supply" fixtures — never real customer data), and every mutation
  (add to cart, place order, login) is a no-op with a toast. Fixture data lives in
  `builder/editor/fixtures.ts` and is only imported by the editor chunk.
- Fields: Puck built-ins (`text`, `textarea`, `number`, `select`, `radio`, `array`, `object`,
  `slot`, `richtext`) plus custom fields: `paletteToken` (swatches from the resolved theme),
  `routeLink` (fixed route / custom page / `https:` URL), `image` (upload via the parent), and
  `product` / `category` pickers (Puck `external` fields over the catalogue query).
  `richtext` values are stored in the `{ __richtext: true, html }` envelope and rendered through a
  client-side allowlist sanitiser as defence in depth.

## 7. Block library

Category → blocks. "Required on" refers to §5.3. Every block file exports its zod schema, Puck
fields, defaults, render, and allowed layouts.

**Shell** — `PageOutlet` (required, shell only); `Header` (variants `storefront` / `menu` /
`webapp`; props: search, nav links, account icon, cart icon, sticky, topBar slot); `NavLinks`
(array of `routeLink`); `Footer` (`template` variant = the template's Footer slot; `columns`
variant = composable columns via slots); `TopBar`; `NoticeBanners`; `CutoffBar`; `ContactStrip`;
`MobileCartBar`.

**Catalogue** — `CatalogHero` (`template` / `custom` variants); `CategoryNav` (chips / rail);
`SearchField`; `ProductGrid`; `ProductList` (includes the menu/webapp `ProductDetailSheet`);
`WholesaleTable`; `FeaturedProducts` (hand-picked via product picker, or first N of a category);
`Upsells`.

**Product** — `ProductDetail` (toggles: gallery, provenance, bulk pricing, SKU, upsells).

**Commerce** — `CartContents`, `CartSummary`, `CheckoutFlow` (stepper, forms, coupon, quote,
Turnstile, payment), `LoginOptions`, `AccountNav`, `OrdersList`, `OrderDetail`, `Loyalty`,
`Referrals`, `Profile`.

**Post-order** — `OrderStatus`, `PaymentSuccess`, `PaymentCancel`, `OrderPlaced`, `VerifyForm`,
`TrackingLookup`.

**Content** (any doc) — `Heading`, `RichText`, `Image` (upload only; alt text required), `Button`
(`routeLink`, variant filled/default/subtle, carries `data-sf-part="button"`), `Columns` (2–4, a
slot per column, stacks below a chosen breakpoint), `Section` (slot; padding scale; background =
palette token or none), `Spacer`, `Divider`, `FAQ` (accordion; items of question + richtext),
`Testimonial`, `Video` (YouTube / Vimeo id only → `youtube-nocookie.com` / `player.vimeo.com`
iframe, lazy, 16:9).

Styling rules for new blocks: colours only as palette token names mapped to `--sf-*` variables
(no hex literals), spacing on a fixed scale, CSS modules, every interactive element ≥ 44×44, no
horizontal overflow at 360 px, `prefers-reduced-motion` honoured — i.e. the template mobile rules
(docs/templates.md §7) apply to blocks too. The functional blocks are the existing feature
components moved behind a block wrapper; their logic is not rewritten.

## 8. Build and bundle

- New deps (web): `@puckeditor/core` (pinned exactly) and `dompurify` (client-side richtext
  sanitiser, same allowlist as the backend's).
- `vite.config.ts`: `/__builder` stays a dynamic import; a small Vite plugin (or a Vitest test over
  the build manifest) fails the build if any chunk reachable from the entry — excluding the builder
  chunk's own graph — contains `@puckeditor/core`'s editor modules. `Render` is the only Puck
  import allowed outside `builder/editor/`.
- The release emits `web/dist/blocks.json` (`{ schemaVersion: 1, blocks: [{ name, category,
  layouts, routeBound }] }`) for documentation and for a future admin use; the backend does not
  consume it in this work.
- Version bump: web `0.7.0`, README release note, `docs/builder.md` (block contract, rules,
  editor protocol) generated from code the way `docs/templates.md` is.

## 9. Admin (`ecommerce-admin-frontend`)

New **Pages** tab in Storefront settings (`features/storefront-settings/pages/`):

- Layout switcher (storefront / menu / webapp); the active browser layout is marked.
- An iframe of the deployed storefront at `/__builder?sf-builder=1` (reuse `use-storefront-preview`'s
  URL resolution; when no storefront is deployed, show the same empty state as the live preview).
- On `sf-builder-ready`: `GET …/draft` and post `sf-builder-load` (plus the current theme).
- On `sf-builder-change`: debounced (1 s) `PUT …/draft`; status chip "Saving… / Saved / Error".
  A `409` shows a "Someone published since you opened this — reload" banner and stops autosave.
- **Publish** (disabled while the editor reports issues): a confirm dialog with a diff summary
  (pages added / changed / removed, computed client-side against the latest published version),
  then `POST …/publish`. Notes the ~30 s edge cache in the success toast.
- **Versions** drawer: list, preview (posts that version into the frame read-only), Restore.
- **Discard draft**.
- Uploads: answers `sf-builder-upload-request` via `POST /storefront-pages/media`.
- `RoleGate allow={['admin']}` — matches the backend's `authorize('admin')`.
- Socket `storefront-pages:published` invalidates the versions query.

## 10. Testing

**Storefront**
- Vitest: `validateDoc` (unknown type dropped, bad prop → default, each rule in §5.3 → fallback,
  layout-restricted block dropped); every block's schema round-trips its defaults; every default
  doc passes its own rules; `PuckPage` renders the default when the set is `null`, the published
  doc when valid, the default when invalid; richtext sanitiser; builder message parsing (wrong
  source/shape ignored).
- Playwright (mocked, `e2e/mocks.ts` gains a `pages` fixture): the **whole existing suite
  unchanged** with `pages: null` (regression gate); per layout, a published set with reordered
  catalogue blocks, a content section, and a custom page reachable from a nav link; a checkout doc
  with no `CheckoutFlow` falls back and checkout still completes to Review; the editor loaded in a
  mocked parent frame (load → add a Heading → change message received); `templates.spec.ts`
  matrix re-run with a published set containing every content block (no overflow at 360, tap
  targets).
- Bundle check from §8.

**Backend** — §4.4.

**Admin** — `npm run build`; lint compared against the pre-change baseline (it already fails on
main — a regression gate, not a clean-run target); a mocked Playwright pass of the Pages tab
(load, autosave, publish, restore, 409 banner) using page.route mocks and a seeded JWT.

No test touches a live database or a real storefront; nothing is verified against a deployed
client in this work — that is called out as a pending manual step.

## 11. Delivery

- Order of work: backend (table, module, public route) → storefront (block wrappers + default docs
  + renderer, proven visually identical) → storefront editor → admin Pages tab → cross-repo mocked
  e2e.
- Deploy order: **backend first**, then storefront release `v0.7.0` (redeploy clients from the
  admin), then the admin SPA. An old storefront against the new backend ignores the new route; a
  new storefront against an old backend gets a 404 from `pages/` and renders defaults.
- Execution: up to 5 concurrent subagents; every frontend task (storefront and admin) goes to a
  subagent that loads the `frontend-design:frontend-design` skill first. Nothing is merged or
  pushed without the user's OK. The storefront repo is public: fixtures and screenshots use
  "Northbound Supply" / `shop.example` only.

## 12. Risks

- **Visual parity of default docs** is the biggest risk — shells use grid/flex/sticky layouts
  whose direct-child assumptions wrappers can break. Mitigation: `display: contents` wrappers, and
  the unchanged e2e + template matrix as the gate before any editor work starts.
- **Puck version churn** (the package was renamed from `@measured/puck`): pin exactly; the guard
  tolerates unknown shapes by falling back.
- **Editor needs a deployed storefront** — same limitation as the live preview; documented.
- **Stored docs outlive blocks**: removing or renaming a block in a future release silently drops
  it from live pages (by design, §5.3). Renames must ship a doc migration in the guard.

## 13. Implementation amendments and cross-plan contracts

Added 2026-09-29 before planning. Where this section and §1–12 disagree, this section wins.

### A1. Shoppers never load Puck at all

`@puckeditor/core@0.23.0`'s `Render` chunk statically imports `@tiptap/html` and ~17 tiptap
extensions. The shopper-side renderer is therefore **our own** `RenderDoc`
(`web/src/builder/render.tsx`) over Puck's `Data` format; `@puckeditor/core` (pinned exactly
`0.23.0`) is imported — as a value — **only** under `web/src/builder/editor/`. `import type` from
it is allowed anywhere (erased). The §8 build check enforces "no `@puckeditor/core` module in any
chunk reachable from the entry except the editor chunk's graph".

Because we own the renderer, **slots render no wrapper element** unless the block passes
`className`/`style`/`as` (then exactly that element). Guarantee 1 is upgraded: with no published
set, the DOM of every page is identical to v0.6.0 wherever the default doc can reproduce it; any
remaining difference must be justified per case in the commit message. Inside the editor, Puck
adds its own wrappers — that is fine.

### A2. Richtext convention (replaces the `{ __richtext, html }` envelope)

Blocks use Puck's native `richtext` field, which stores an **HTML string**. Every richtext prop's
key **ends in `Html`** (`bodyHtml`, `answerHtml`). The backend sanitises every string prop whose
key ends in `Html` (at any depth, including inside arrays/objects) with `isomorphic-dompurify`
using the §4.3 allowlist; the storefront sanitises again with `dompurify` (same allowlist, exported
from `web/src/builder/sanitize.ts`) and renders with `dangerouslySetInnerHTML`. Inside `<Puck>` a
richtext prop may arrive as a React node — block renders handle `string | ReactNode`.

### A3. Media

- Upload: `POST /api/v1/storefront-pages/media` (JWT admin, multipart field `file`, png/jpeg/webp/gif,
  ≤ 5 MB) → `{ url: '/media/storefront-pages/media/<key>' }`, `<key>` =
  `^[a-f0-9]{32}\.(png|jpg|webp|gif)$`, stored in S3 under `storefront-pages/<key>`.
- Serve: `GET /api/v1/storefront-pages/media/:key` (public, no auth, long cache headers).
- Worker: new rule in `worker/src/media.ts` `RULES`:
  `/^\/media\/storefront-pages\/media\/([a-f0-9]{32}\.(?:png|jpg|webp|gif))$/` →
  `api/v1/storefront-pages/media/<key>`.
- Backend validation of `Url`/`url`/`href`/`src`-suffixed props additionally accepts exactly this
  site-relative path form.

### A4. Shared types (storefront `web/src/builder/types.ts`; backend mirrors them in zod)

```ts
export type LayoutKind = 'storefront' | 'menu' | 'webapp';
export const FIXED_ROUTE_KEYS = ['catalog','product','cart','checkout','login','account.orders','account.order',
  'account.loyalty','account.referrals','account.profile','order-status','payment-success','payment-cancel',
  'order-placed','verify','tracking'] as const;
export type FixedRouteKey = typeof FIXED_ROUTE_KEYS[number];
export type RouteKey = FixedRouteKey | `page:${string}`;          // slug /^[a-z0-9-]{1,60}$/
export type DocKey = RouteKey | 'shell';
export interface ComponentData { type: string; props: { id: string; [k: string]: unknown } }
export interface PageRootProps { title: string; description: string; chrome: 'shell' | 'none' }
export interface PuckDoc { root: { props: PageRootProps }; content: ComponentData[]; zones?: Record<string, ComponentData[]> }
export interface PageSet { schemaVersion: 1; shell: PuckDoc; pages: Partial<Record<RouteKey, PuckDoc>> }
export interface Issue { docKey: DocKey; rule: string; message: string; blockId?: string }
```

Slot props hold `ComponentData[]`. Shell root props use the same `PageRootProps` shape (title/description
ignored, `chrome` must be `'shell'`).

### A5. HTTP contract (backend ⇄ admin, backend ⇄ storefront)

All responses use the standard `{ success, data, error }` envelope. `:layout` is validated
against `LayoutKind` (400 otherwise).

| Method + path (under `/api/v1`) | Request | `data` |
|---|---|---|
| `GET /storefront-pages/:layout/draft` | — | `{ layout, source: 'draft' \| 'published' \| 'none', data: PageSet \| null, baseVersion: number, latestPublishedVersion: number, updatedAt: string \| null }` |
| `PUT /storefront-pages/:layout/draft` | `{ data: PageSet, baseVersion: number }` | `{ baseVersion: number, updatedAt: string }` |
| `DELETE /storefront-pages/:layout/draft` | — | `{ discarded: boolean }` |
| `POST /storefront-pages/:layout/publish` | `{ baseVersion: number }` | `{ version: number, publishedAt: string }` |
| `GET /storefront-pages/:layout/versions` | — | `Array<{ version: number, createdAt: string, createdBy: { id: number, name: string } \| null }>` |
| `GET /storefront-pages/:layout/versions/:version` | — | `{ version, createdAt, data: PageSet }` |
| `POST /storefront-pages/:layout/versions/:version/restore` | — | `{ version: number }` (the new version) |
| `POST /storefront-pages/media` | multipart `file` | `{ url: string }` |
| `GET /storefront-pages/media/:key` | — | raw image |
| `GET /public/storefront/pages/:layout` | — | `{ version: number, data: PageSet } \| null` |

Errors: `409` with `error.code = 'PAGESET_CONFLICT'` when `baseVersion < latestPublishedVersion`
(PUT and publish); `400` validation errors with the standard validation shape; publish with no
draft → `400` with code `NO_DRAFT`. The storefront reaches the public route as
`GET /api/storefront/pages/:layout` through its Worker (edge-cached 30 s like `storefront/settings`).
Socket event (admin namespace): `storefront-pages:published` with payload `{ layout, version }`.

### A6. Editor postMessage protocol (admin ⇄ storefront `/__builder`)

Every message is a plain object with a `type`. Storefront side parses with zod in
`web/src/builder/editor/protocol.ts`; admin mirrors the shapes in
`src/features/storefront-settings/pages/protocol.ts`. Unknown/malformed messages are ignored on
both sides; the storefront only accepts `event.source === window.parent`, the admin only accepts
`event.source === iframe.contentWindow` and `event.origin === storefrontOrigin`.

Admin → storefront:

- `{ type: 'sf-builder-load', protocol: 1, layout: LayoutKind, pageSet: PageSet | null, theme: Theme, readOnly: boolean }`
- `{ type: 'sf-builder-theme', theme: Theme }`
- `{ type: 'sf-builder-select-page', docKey: DocKey }`
- `{ type: 'sf-builder-upload-result', requestId: string, url: string | null, error: string | null }`

Storefront → admin (`targetOrigin` = origin of the first accepted `sf-builder-load`;
`sf-builder-ready` alone uses `'*'` because it carries nothing):

- `{ type: 'sf-builder-ready', protocol: 1 }`
- `{ type: 'sf-builder-change', pageSet: PageSet, issues: Issue[] }` (debounced 500 ms; also sent once right after load)
- `{ type: 'sf-builder-upload-request', requestId: string, file: File }`
- `{ type: 'sf-builder-viewport', width: 360 | 768 | 1280 | null }` — the editor's viewport toggle;
  the admin resizes the iframe element to that width (centred, horizontally scrollable; `null` =
  fill the panel) so media queries and `useMediaQuery` see the real breakpoint. Added after
  planning surfaced that Puck's own canvas iframe is disabled (§6).

`pageSet: null` on load means "no draft or published set": the editor starts from the default docs
and the first `sf-builder-change` carries a sparse set containing only `shell` (the default shell).
`readOnly: true` (version preview) disables editing and suppresses `sf-builder-change`.

### A7. Storefront internal module contract (`web/src/builder/`)

```ts
// define.ts — runtime-safe (no @puckeditor/core value imports)
export type BlockCategory = 'shell' | 'catalogue' | 'product' | 'commerce' | 'post-order' | 'content';
export type SlotRender = (p?: { className?: string; style?: CSSProperties; as?: ElementType }) => ReactNode;
export interface BlockRenderContext { editing: boolean; docKey: DocKey; layout: LayoutKind }
export interface BlockDef<P extends Record<string, unknown>> {
  name: string; label: string; category: BlockCategory;
  layouts: LayoutKind[] | 'all';
  routeBound: boolean;                         // may only appear on its own route(s)
  slots: readonly (keyof P & string)[];        // prop names holding ComponentData[]
  schema: z.ZodType<Omit<P, 'id'>>;            // non-slot props; parse failures fall back per field
  defaultProps: Omit<P, 'id'>;
  render(props: SlotProps<P> & { puck: BlockRenderContext }): ReactNode;  // slot props arrive as SlotRender
}
export function defineBlock<P extends Record<string, unknown>>(def: BlockDef<P>): BlockDef<P>;
// registry.ts
export const BLOCKS: Record<string, BlockDef<any>>;
// rules.ts
export function checkRules(doc: PuckDoc, docKey: DocKey, layout: LayoutKind): Issue[];
// guard.ts
export function validateDoc(doc: unknown, docKey: DocKey, layout: LayoutKind): { doc: PuckDoc | null; issues: Issue[] };  // null ⇒ use default
// defaults/index.ts
export function defaultDoc(docKey: DocKey, layout: LayoutKind): PuckDoc | null;  // null for custom pages
// render.tsx
export function RenderDoc(p: { doc: PuckDoc; docKey: DocKey; layout: LayoutKind }): ReactNode;
// runtime.tsx
export function usePageSet(layout: LayoutKind): { pageSet: PageSet | null; isLoading: boolean };
export function PuckShell(): ReactNode;     // replaces ShellSwitch
export function PuckPage(p: { routeKey: RouteKey }): ReactNode;
export function PageSetOverrideProvider(p: { pageSet: PageSet | null; children: ReactNode }): ReactNode; // editor/preview inject the draft
// mode.ts
export function useBuilderMode(): { editing: boolean; previewAs: PreviewAs | null };
export type PreviewAs = { session: 'signed-out' | 'signed-in' | 'signed-in-orders'; cart: 'empty' | 'items' };
// sanitize.ts
export const RICHTEXT_ALLOWED_TAGS: readonly string[];
export function sanitizeRichtext(html: string): string;
```

Editor-only: `web/src/builder/editor/fields/<BlockName>.ts` exports that block's Puck `fields`;
`editor/config.ts` merges `BLOCKS` + fields into a Puck `Config`. Heavy functional components stay
behind `lazy()` inside their block's render so route chunking is unchanged.

### A8. Plans

Four plans in `docs/superpowers/plans/` of this repo: `2026-09-29-puck-builder-1-backend.md`,
`-2-renderer.md` (storefront: builder core, blocks, default docs, routing, Worker, parity gate),
`-3-editor.md` (storefront `/__builder`), `-4-admin.md`. Plan 1 and plan 2 are independent;
plan 3 needs plan 2; plan 4 needs only A5/A6 and can run against mocks before plans 1–3 land.
