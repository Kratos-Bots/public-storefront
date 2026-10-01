# Shell, cart and account parts — storefront (stage 4 of "everything editable") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The header bar, the cart (page and drawer), the account area, the sign-in page and the simple post-order pages (payment success / cancel, order placed, tracking, verify) become *containers* whose slots hold 62 new *part* blocks, so an owner can reorder, remove, restyle and interleave their pieces — while with nothing published every page stays byte-identical to v0.7.0.

**Architecture:** Stage 3's container / part pattern is reused unchanged (`web/src/builder/parts.ts`: `ContainerSpec`, `createFamily`, `PartHost`, `fixedSlot`, `containsType`, `partId`; `rules.ts` per-container rules; `upgrade.ts` fills *absent* slots; `defaultSlotRenders`). It gains three additive `ContainerSpec` fields (`offers`, `nests`, `slotRejects`), `renderComponent` (the drawer renders the layout's `cart` document), and editor-only *preview states* (`usePreviewState`). Each container keeps every query, mutation, effect, redirect and state screen and wraps today's wrapper markup in `Family.Provider`; each part is a thin `PartHost` block whose view is the v0.7.0 JSX moved verbatim into the container's feature module.

**Tech Stack:** React 19, TypeScript 5.9, zod 4, react-router 7, TanStack Query 5, Mantine, Vite, Vitest + Testing Library (jsdom), Playwright (mocked backend, port 5199), `@puckeditor/core` 0.23.0 (editor only).

**Spec:** `docs/superpowers/specs/2026-09-30-shell-cart-account-parts-design.md` (binding), with `docs/superpowers/specs/2026-09-30-puck-editable-overview.md` and stage 3's `docs/superpowers/specs/2026-09-30-product-parts-design.md` + its plan `docs/superpowers/plans/2026-09-30-product-parts-2-storefront.md` (the pattern; read its Task 8 and Task 10 for a finished container + parts example). Read `docs/builder.md` → "Containers and parts". **Start only after stage 3's final fix wave has landed.** Stage-3 rulings apply (ledger `.superpowers/sdd/2026-09-30-product-parts-2-storefront/progress.md`): `FAMILY_DOCS` / `familyAllowedOn` are multi-document; required parts never carry `hide`; goldens are never regenerated; views stay in the feature files that already hold the container's `lazy()` view; CSS modules keep their paths (class names are hashed from the path and live in the goldens).

## Global Constraints

- Work only in the `ecommerce-storefront/` worktree on `feature/puck-editable`. Never push, merge, or touch another checkout. The repo is **public**: fixtures, docs and screenshots use "Northbound Supply" / `shop.example`; no local paths, usernames, client names or credentials.
- House rules (`.superpowers/sdd/house-rules.md`): TDD; commit **by explicit pathspec only** (`git add -- <paths>` then `git commit -m "…" -- <paths>`); never `git add -A`, `git stash`, reset or check out others' files; every commit message ends with the two lines `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4`.
- Any task touching React components or CSS loads the `frontend-design:frontend-design` skill first.
- Imports are `@/…` with `.ts` / `.tsx` extensions. `@puckeditor/core` **value** imports only under `web/src/builder/editor/**`. `parts.ts`, `families.ts`, `family-*.ts`, `upgrade.ts`, `mode.ts`, `render.tsx` are shopper-bundle code: type-only imports from features, no fixtures.
- **Parity (spec §12):** with no published set, or a set that never touches these blocks, every page's DOM is byte-identical to v0.7.0. `e2e/dom-parity.spec.ts`, `e2e/templates*.spec.ts` and every `web/test/__golden__/stage4-*.html` pass **without regenerating anything** (never `--update-snapshots`; never `UPDATE_GOLDEN` after Tasks 1/3/4).
- **Absent ≠ empty:** a container slot whose key is `undefined` is filled from `defaultSlots`; a present slot (even `[]`) is never touched. `Header.nav` / `AccountNav.body` / `CartContents.summary` are present in every stored v0.7.0 doc; `defaultSlots` for those containers deliberately omits them so "Reset arrangement" and `resolveData` never overwrite owner content in them.
- Part ids: `partId(containerId, key)` = `` `${containerId.slice(0, 40)}-${key}` ``; longest key here is 19 chars (`CartSummaryCheckout`) → ≤ 60 chars (+ `-2`… from the editor). A test asserts every default id ≤ 64 and unique.
- **No new text key.** Moved JSX keeps its literal `t('…')` keys. Every part lists its patterns in `BlockDef.text` (copy the "Text patterns" column of spec §9); each container's `text` narrows to what it still draws (spec §9 last paragraph). The text coverage / orphan / guard tests stay green.
- **Style (spec §9).** BOX = `bg padTop padBottom padX marginTop marginBottom border borderColor borderStyle radius shadow maxWidth`; TEXT = `fg textSize align`; VIS = `hide`; **BAR** = `bg fg border borderColor borderStyle radius padX` (header parts only: no vertical spacing, margins, `maxWidth`, `textSize`). The exact table is `STAGE4_PARTS` in Task 2 and is binding. A part offering `fg` / `textSize` switches its CSS-module rule to `var(--sf-block-fg, <today>)` / `calc(<today> * var(--sf-text-scale, 1))`. Unstyled ⇒ no attribute, no wrapper.
- Parts render only through `PartHost`; a part view never owns state, effects, queries, mutations or navigation (a `useState` or `useEffect` in a part view is a review failure). Reading cached queries the container owns, settings, text, core options and stores is fine. Leaf components (`CartLine`, `ParcelCard`, `OrderHero`, `LookupForm`, `ClassicBotSwitch`, `LoginOptions`, `ReferenceRow`, `ContactLinks`, `EmptyState`, `SearchField`, `RefreshButton`, the loyalty confirm modal) stay whole; a part may render one.
- Part block files import **no** feature component and no view (they stay in the main bundle); views live in the feature module that already holds the container (spec §5.9). Entry-bundle growth other than part-block shells and the cart container view fails review (Task 15 measures).
- Template mobile rules: 44×44 tap targets, no overflow at 360 px, 16 px inputs, `prefers-reduced-motion`. Shop colours only via `--sf-*`; editor UI via `--sfb-*`.
- Editor protocol stays `protocol: 1`; page-set shape unchanged; `blocks.json` container entries keep their current keys (no `offers`/`nests` emitted — the admin mirror is unchanged).
- Tests: from `ecommerce-storefront/web`: `npx vitest run <files>`; typecheck `npm run typecheck`; build `npm run build`. Never `npm run install:web`; use `npm ci` inside `web/`. **Only the task marked "Playwright owner" runs `npm run test:e2e` (from `ecommerce-storefront/`).**
- If a sibling task's file breaks typecheck/tests: wait a minute and re-run; never edit it. Blocked → report BLOCKED / NEEDS_CONTEXT.
- Existing unit tests that mock a surface this stage refactors (e.g. `builder-account.test.tsx`, `builder-shell.test.tsx`, `text-guard-*.test.tsx`, `redirect-pages.test.tsx`, `verify.test.tsx`, `shell-header-options.test.tsx`) may be edited **only** by the task that owns that surface, and only to follow an intended structural change (never to relax a markup assertion).

## Review Focus

1. **A stored v0.7.0 shell / cart / account doc edited once in the editor** → the posted change carries full slots from `defaultSlots` (never `[]`), `Header.nav` content is untouched, legacy `search: false` / `cartIcon: 'hide'` become "no `HeaderSearch`" / `HeaderCart.icon = 'hide'`, and nothing trips `part-required:Header.HeaderBrand` (which would fall the whole shell back to default). Tests: Task 5 Step 1 (upgrade + `prepareProps`), Task 12 Step 1.
2. **Conditional wrappers** — `div.page` on an empty cart, `div.body` on an empty order list, the `aria-busy` result wrapper outside `found`, `div.retry`, `` `${action} ${iconClass}` `` trailing space — drift only shows in markup. Tests: golden parity (Tasks 1/3/4 files re-run by every family task) over default **and** upgraded-monolith documents.
3. **Drawer vs page** — drawer must render the *guarded* `cart` document (no first-open suspense flash), keep refresh-on-open, fall back to the default arrangement on a throw (logged once, for the rest of the load), and not draw a `CartSummary` placed outside `CartContents` twice or on an empty cart. Test: Task 6 Step 1.
4. **Nested containers** — counting stops at `CartSummary` and at the five account sections; a part's placement is its *nearest* container; `blocked` comes from the cart family inside `CartContents`, from `useServerCart` outside it; `hidden-required` fires for a hidden block between container and required part, never for a hidden `Header`. Tests: Task 2 Step 1, Task 6 Step 1.
5. **Preview states reaching shoppers** — `usePreviewState` / `usePreviewFixture` are `null` under every shopper entry point (normal load, exact preview outside the editor, version preview), and fixtures never enter the shopper bundle. Tests: Task 2 Step 1, Task 13 Step 1, Task 15 (bundle grep).

## File Structure

New shopper-bundle files (each owned by exactly one task):

| File | Owner |
|---|---|
| `web/src/builder/family-header.ts`, `blocks/_shared/header-container.ts`, `layouts/header-parts.tsx`, 6 `blocks/Header*.tsx` parts | T5 |
| `web/src/builder/family-cart.ts`, `blocks/_shared/cart-container.ts`, `features/cart/{cart-host.ts,cart-parts.tsx,cart-summary-parts.tsx}`, 8 `blocks/Cart*.tsx` parts (3 `Cart*` + 5 `CartSummary*`) | T6 |
| `family-account.ts`, `family-orders.ts`, `family-order.ts`, `blocks/_shared/{account,orders,order}-container.ts`, `AccountGreeting/AccountTabs/Orders*/Order*` parts | T7 |
| `family-loyalty.ts`, `family-referrals.ts`, `family-profile.ts`, `blocks/_shared/{loyalty,referrals,profile}-container.ts`, `Loyalty*/Referral*/Profile*` parts | T8 |
| `family-login.ts`, `family-payment.ts`, `blocks/_shared/{login,payment}-container.ts`, `LoginHeading/LoginMethods/Payment*` parts | T9 |
| `family-tracking.ts`, `blocks/_shared/tracking-container.ts`, `Tracking*` parts | T10 |
| `family-verify.ts`, `blocks/_shared/verify-container.ts`, `Verify*` parts | T11 |
| `web/test/helpers/stage4-golden.tsx`, `test/golden-stage4-{shell,account,flows}.test.tsx`, `test/__golden__/stage4-*.html` | T1 / T3 / T4 |
| `web/test/helpers/stage4-parts.ts` (the binding part table) | T2 |

Every part is one file `web/src/builder/blocks/<Part>.tsx` (the registry globs `./blocks/*.tsx`, file name = block name) plus `web/src/builder/editor/fields/<Part>.ts`. Each family task also owns one test file `web/test/builder-<family>-parts.test.tsx`.

## Waves (parallel execution)

| Wave | Tasks (disjoint files) | Depends on |
|---|---|---|
| 1 | **T1** golden harness + header/cart goldens · **T2** contract extensions | stage 3 complete |
| 2 | **T3** account goldens · **T4** flow goldens (login, payment, tracking, verify) | T1 (T3/T4 need only the T1 helper commit) |
| 3 | **T5** header · **T6** cart · **T7** account nav + orders + order · **T9** login + payment · **T10** tracking · **T11** verify | T1–T4 |
| 3b | **T8** loyalty + referrals + profile (shares `Account.module.css` with T7, so starts when T7 commits) | T7 |
| 4 | **T12** editor palette / rules / notices · **T13** editor preview states · **T14** editor cart surface | T5–T11 |
| 5 | **T15** contract flip, `blocks.json`, docs, bundle gate | T12–T14 |
| 6 | **T16** e2e + full verification — **Playwright owner** (only task running Playwright) | T15 |

Between T1/T3/T4 and wave 3, the controller removes the temporary golden worktree (`git worktree remove --force ../ecommerce-storefront-v070`).

## The part recipe (Tasks 5–11 follow it; "stage-3 pattern" in this plan means exactly this)

Reference implementations: stage 3 `web/src/features/catalog/ProductDetailPage.tsx` + `product-parts.tsx` + `web/src/builder/blocks/ProductDetail.tsx` + `blocks/_shared/product-container.ts` + `blocks/ProductTitle.tsx` + `editor/fields/ProductTitle.ts`.

1. **Family file** `web/src/builder/family-<x>.ts`: `export interface <X>Data {…}` (type-only imports) and `export const <X>Family = createFamily<<X>Data>('<family>')`.
2. **Views** in the feature module: `export const <X>_VIEWS: FamilyValue<<X>Data>['views'] = { PartName: ViewFn, … }`; `function ViewFn({ props, styleAttrs }: PartViewProps)` reads `<X>Family.useData()` and returns the v0.7.0 JSX of that piece **moved verbatim** (including `null` returns and class-string construction), spreading `{...styleAttrs}` on its root element (style target `root`) or via a shared component's new optional `rootAttrs?: StyleAttrs` (spread on that component's root; unit-tested "no attribute when undefined"). Target `wrap` ⇒ no spread (renderBlock adds the wrapper div).
3. **Container view**: the existing feature component keeps its name, exports and props and gains optional `slots?: Record<string, SlotRender>`; without `slots` it uses `defaultSlotRenders('<Container>', layout, props, docKey)` (legacy call sites and the golden entry points keep rendering v0.7.0). It computes the data once, keeps **every** effect / query / mutation / redirect / pending / error / not-found screen **before** any slot renders, wraps the spec's wrapper markup around slot calls, and renders `<X>Family.Provider value={{ data, views }}>` (memoise `value`).
4. **Part block file** (template — only `name`, `label`, `family`, `style`, `text`, `layouts`, schema change):
```tsx
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { <X>Family } from '@/builder/family-<x>.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

export const block = defineBlock<{ id: string }>({
  name: '<Part>', label: '<Label>', category: 'part', part: { family: '<family>' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),            // exactly the STAGE4_PARTS row
  text: ['<pattern>', …],                                    // spec §9 "Text patterns"
  schema: z.object({}), defaultProps: {},
  render: (p) => <<X>Family.PartHost name="<Part>" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
```
5. **Container block** (`blocks/<Container>.tsx`): add `container: <X>_CONTAINER`, the new slot names in `slots`, `slot()` schema entries with `[]` defaults, narrowed `text`, legacy props as optional schema fields **without** `defaultProps` entries (stage 3 `ProductDetail` pattern), keep `style`, `routeBound`, `layouts`. `blocks/_shared/<x>-container.ts` exports the `ContainerSpec` (code given in each task).
6. **Editor fields file** per new part: `export const fields = blockFields('<Part>');` (see `editor/fields/ProductTitle.ts`).
7. **CSS**: for each part whose `STAGE4_PARTS` keys include `fg` / `textSize`, edit the matching module rule to `color: var(--sf-block-fg, <today>)` / `font-size: calc(<today> * var(--sf-text-scale, 1))`. The test asserts the module text contains both variables for each such part's module (read the file with `readFileSync`). Never rename or move a CSS module.
8. **Tests** `web/test/builder-<family>-parts.test.tsx` (pattern: stage 3 `builder-product-parts.test.tsx`, `builder-parts-rules.test.ts`), always:
   - *Contract*: each part block's `part.family`, `style` equals its `STAGE4_PARTS` row, no `hide` on a part the container requires, `PartHost` outside a container renders `null` (no throw), every default id ≤ 64 chars and unique, defaults pass `checkRules` in each layout the container lives in.
   - *Rules*: for each required part: remove it ⇒ `part-required:<Container>.<Part>`; duplicate it ⇒ same rule id; `part-unique` for each optional part duplicated; a part inside another family's container ⇒ `part-placement:<Part>`; the container's `slotAccepts` / `slotRejects` / `offers` cases named in the task.
   - *Upgrade*: `upgradeItems` on the v0.7.0-shaped container (absent slots) ⇒ equals `defaultSlots`; the same with each slot present as `[]` ⇒ untouched; idempotent (second pass returns the same object).
   - *Arrangement*: render the container with a reordered slot and one interleaved `RichText`; assert DOM order, and that a removed optional part is absent.
   - *State ownership*: unchanged behaviour the container keeps (named per task) still works with arranged slots.
   - *Golden*: re-run the family's golden test file (`golden-stage4-*.test.tsx`) — must stay green with **no** golden written.
9. **Gate before commit:** the task's test file, its golden file(s), `npx vitest run test/builder-parts-contract.test.tsx test/builder-editor-contract.test.ts test/builder-rules.test.ts test/text-*.test.ts*` (all green — T2 relaxed the equality tables to subset checks), `npm run typecheck`. The only red test allowed anywhere is `blocks-manifest.test.ts` "the committed web/public/blocks.json is current" (regenerated by T15; do not touch it).

---

## Task 1: Golden harness, header and cart goldens (before any refactor)

**Depends on:** none. **Wave 1.** Spec §12 ("the first task captures golden markup … before any refactor"), §14 step 1.

**Files:**
- Create: `web/test/helpers/stage4-golden.tsx`, `web/test/golden-stage4-shell.test.tsx`, `web/test/__golden__/stage4-header-*.html`, `stage4-cart-*.html`, `.superpowers/sdd/2026-10-01-shell-cart-account-parts-storefront/entry-baseline.txt`
- No existing file is modified.

**Interfaces:**
- Produces (`web/test/helpers/stage4-golden.tsx`) — T3/T4 import it:
```tsx
export interface Mounted { container: HTMLElement }
/** QueryClient + MantineProvider(env="test") + MemoryRouter; `route` is the Route path pattern, `path` the visited URL; `outlet` becomes Outlet context (shell search). */
export function mountAt(ui: ReactNode, opts: { path: string; route?: string; outlet?: { search: string; setSearch: () => void } }): Mounted;
/** One stored v0.7.0-shaped component → a guarded doc rendered through RenderDoc (validateDoc, then RenderDoc), same providers. */
export function mountDoc(docKey: DocKey, layout: LayoutKind, content: ComponentData[], opts: { path: string; route?: string; outlet?: …; root?: Partial<PageRootProps> }): Mounted;
/** The default document for (docKey, layout) rendered through RenderDoc, same providers. */
export function mountDefault(docKey: DocKey, layout: LayoutKind, opts: { path: string; route?: string; outlet?: … }): Mounted;
/** `expectGolden(`stage4-${name}`, html)` — the existing helper; prefixes the name. */
export function expectStage4(name: string, html: string): void;
```
- Produces: the committed goldens (v0.7.0 markup) and the entry-chunk baseline.
- Contract kept by every later task: the **entry points** this test calls keep their exported names and props (`StorefrontHeader`, `MenuHeader`, `WebAppHeader` with `ShellHeaderProps`; `CartPage({ foot? })`; `CartDrawer()`; `CartSummary({ blocked, onNavigate? })`).

- [ ] **Step 1: Make the temporary v0.7.0 worktree.** From `ecommerce-storefront/`: `git worktree add --detach ../ecommerce-storefront-v070 HEAD` (record `git rev-parse HEAD` in the commit message). Give it dependencies without installing: `New-Item -ItemType Junction -Path ../ecommerce-storefront-v070/web/node_modules -Target web/node_modules` (PowerShell); if the junction fails, `npm ci` inside `../ecommerce-storefront-v070/web`. All golden *writing* happens there against untouched code; the final files are copied back.
- [ ] **Step 2: Write the helper** (in the temp worktree; copy to the real worktree at Step 6). `mountAt` follows `test/golden-parity.test.tsx` (`shell()`); `mountDoc` calls `validateDoc(doc, docKey, layout)` (from `@/builder/guard.ts`) and renders `RenderDoc`.
- [ ] **Step 3: Write `golden-stage4-shell.test.tsx`.** Mocks follow `test/shell-header-options.test.tsx` (settings, session store, cart store, `Brand`, `NoticeBanners`, `useShellState`) and `test/text-guard-cart.test.tsx` (`useServerCart`, `useCartStore`). One hoisted `state` object drives settings (`features.accounts/ordering/guestCheckout/wholesale`), session, cart lines, issues, `isSyncing`, native/Telegram. Every case renders **three** ways and compares each to the same golden: `entry` (the v0.7.0 component), `mountDefault(...)`, and `mountDoc(...)` with the **v0.7.0-shaped stored component** (legacy props, absent new slots — e.g. `{ type: 'Header', props: { id, variant, topBar, search, sticky, accountIcon, cartIcon, nav: [] } }`; `{ type: 'CartContents', props: { id, summary: [{ type: 'CartSummary', props: { id } }] } }`). Before the refactor all three must produce identical markup (this proves the harness).
  Header cases (`stage4-header-<variant>-<out|in>-cart<0|3>[-<tweak>]`): for each variant `storefront` / `menu` / `webapp`: signed out / in × cart count 0 / 3 (12 base). On signed-in cart-3, one tweak at a time: `search=false`, `sticky=false`, `topBar=false` (storefront, menu), `accountIcon=show|hide`, `cartIcon=show|hide` (via `CoreOptionsScope` for the entry; via the stored props for docs), `accounts` off, `ordering` off. Menu and web app: on the catalogue (`/`) with a category picker (filter button shown), filtered (dot), on the catalogue with wholesale (no filter), off the catalogue (`/cart`). Web app: native `true` / `false` × signed in / out, and `/cart` (back button) vs `/` (no back).
  Cart cases (`stage4-cart-<surface>-<state>`; surfaces `page`, `drawer`, `summary`): empty; 1 line; 3 lines; a line with `inactive` issue (blocked); `belowMin` issue; mixed pre-order; `isSyncing` true; web app layout (primary action elsewhere) blocked / not blocked; `guestCheckout` on / off (checkout target). Drawer cases set the ui store `cartOpen` true and render `<CartDrawer />` (query the portal — see how `golden-parity.test.tsx` captures the product sheet). `summary` = `<CartSummary blocked onNavigate />` alone, blocked / not / mixed / web app.
- [ ] **Step 4: Run in the temp worktree with `UPDATE_GOLDEN=1`** (`cd ../ecommerce-storefront-v070/web && $env:UPDATE_GOLDEN='1'; npx vitest run test/golden-stage4-shell.test.tsx`). Only the `entry` render writes a missing file; the `default` and `doc` renders must compare green. Re-run without the env var: all green, no new file.
- [ ] **Step 5: Baseline.** In the temp worktree `npm run build`; record the entry chunk's raw bytes (the largest `assets/index-*.js` referenced by `dist/index.html`) and its gzip size in `entry-baseline.txt` (two lines).
- [ ] **Step 6: Copy back** `stage4-golden.tsx`, `golden-stage4-shell.test.tsx`, the `stage4-header-*` / `stage4-cart-*` goldens (LF endings) and `entry-baseline.txt` into the real worktree. There run `npx vitest run test/golden-stage4-shell.test.tsx` — green with **no** `UPDATE_GOLDEN` (CI-style). Commit by pathspec: `test(golden): stage 4 header and cart goldens from v0.7.0 (<sha>)`.

---

## Task 2: Contract extensions — `offers`, `nests`, `slotRejects`, families, `renderComponent`, preview states

**Depends on:** none. **Wave 1.** Spec §3, §4, §14 step 2.

**Files:**
- Modify: `web/src/builder/parts.ts`, `web/src/builder/rules.ts`, `web/src/builder/render.tsx`, `web/src/builder/mode.ts`
- Create: `web/test/helpers/stage4-parts.ts`, `web/test/builder-parts-stage4.test.ts`
- Modify (relax to subset checks; T15 restores equality): `web/test/builder-parts-contract.test.tsx` ("covers exactly the registered parts"), `web/test/builder-editor-contract.test.ts` (`PART_BLOCKS` equality)

**Interfaces:**
- Produces (`parts.ts`):
```ts
export type PartFamily = 'product' | 'catalogue' | 'card-tile' | 'card-row'
  | 'header' | 'cart' | 'cart-summary' | 'account' | 'orders' | 'order' | 'loyalty'
  | 'referrals' | 'profile' | 'login' | 'payment' | 'tracking' | 'verify';
// ContainerSpec gains (all optional, additive):
offers?: readonly string[];                        // parts of the family this container accepts (default all)
nests?: readonly string[];                         // containers (by block name) its slots may hold, at any depth
slotRejects?: Readonly<Record<string, readonly string[]>>;
export function offersPart(spec: ContainerSpec, type: string): boolean;     // !spec.offers || spec.offers.includes(type)
export function findComponent(items: readonly ComponentData[], type: string): ComponentData | undefined; // depth-first, like containsType
FAMILY_DOCS: header ['shell'], cart ['cart'], 'cart-summary' ['cart'],
  account ['account.orders','account.order','account.loyalty','account.referrals','account.profile'],
  orders ['account.orders'], order ['account.order'], loyalty ['account.loyalty'], referrals ['account.referrals'],
  profile ['account.profile'], login ['login'], payment ['payment-success','payment-cancel','order-placed'],
  tracking ['tracking'], verify ['verify']   // plus the four stage-3 entries unchanged
```
- Produces (`rules.ts`): `FAMILY_NOUN` / `FAMILY_HOME` entries for the 13 new families (nouns: `header`, `cart`, `order summary`, `account page`, `order history`, `order page`, `loyalty page`, `referrals page`, `profile page`, `sign-in page`, `payment page`, `tracking page`, `verification page`); new rule ids `slot-rejects:<Container>.<slot>`; extended `part-placement:<Part>`; a required part carrying its own `hide` ⇒ `hidden-required:<Part>` ("`<label>` can't be hidden: every shopper must see it.", `blockId` = the part) — this covers `PaymentReference` / `PaymentActions`, which are required on some containers only.
- Produces (`render.tsx`): `export function renderComponent(item: ComponentData, ctx: BlockRenderContext): ReactNode` — `<BlockNode key=… item ctx/>` (boundary, style, slots) exactly as `RenderDoc` renders one entry.
- Produces (`mode.ts`):
```ts
export interface BuilderMode { editing: boolean; previewAs: PreviewAs | null;
  previewStates?: Readonly<Record<string, string>> | null;        // container name → state id
  previewFixtures?: Readonly<Record<string, unknown>> | null }     // container name → fixture object (built by the editor)
export function usePreviewState(container: string): string | null;       // own-key lookup; null for SHOPPER and when unset
export function usePreviewFixture<T>(container: string): T | null;
export const PREVIEW_STATE_IDS = {
  OrdersList: ['orders', 'none', 'more'], Loyalty: ['rewards', 'no-points'], Referrals: ['new', 'referred'],
  Profile: ['website', 'webapp'], PaymentSuccess: ['reference', 'missing'], PaymentCancel: ['saved', 'unsaved', 'no-reference'],
  OrderPlaced: ['chat', 'warning', 'no-chat', 'missing'],
  TrackingLookup: ['form', 'found-2', 'found-1', 'nothing-shipped', 'not-found', 'error'],
  VerifyForm: ['form', 'authentic', 'expired', 'not-verified', 'error'],
} as const;   // first id of each = the editor's default
```
- Produces (`test/helpers/stage4-parts.ts`): `export const STAGE4_PARTS: Record<string, { family: PartFamily; style: { target: StyleTarget; keys: readonly StyleKey[] } }>` and `export const STAGE4_CONTAINERS: Record<string, PartFamily>` — the table below, verbatim. Consumed by T5–T11 tests and T15's contract flip.

`STAGE4_PARTS` (BAR defined above; `T(target, …groups)` as in `builder-parts-contract.test.tsx`):

| Family | Part: target, keys |
|---|---|
| header | HeaderBrand root BAR · HeaderBack root BAR+VIS · HeaderSearch root BAR−`fg`+VIS · HeaderFilter / HeaderAccount / HeaderCart root BAR+VIS |
| cart | CartHeading root BOX+TEXT · CartLines root BOX · CartEmpty root BOX+TEXT |
| cart-summary | CartSummaryNotice / CartSummaryTerms / CartSummaryContinue root BOX+TEXT+VIS · CartSummarySubtotal root BOX+TEXT · CartSummaryCheckout wrap BOX |
| account | AccountGreeting / AccountTabs root BOX+TEXT |
| orders | OrdersHeading / OrdersMore root BOX+TEXT+VIS · OrdersRows / OrdersEmpty root BOX+TEXT |
| order | OrderHeading / OrderItems root BOX+TEXT · OrderBackLink / OrderBalance / OrderPayments / OrderParcels root BOX+TEXT+VIS · OrderPageLink wrap BOX+TEXT+VIS |
| loyalty | LoyaltyPoints / LoyaltyRewards root BOX+TEXT · LoyaltyCredit / LoyaltyNoPoints root BOX+TEXT+VIS |
| referrals | ReferralCode root BOX+TEXT · ReferralShare wrap BOX+TEXT+VIS · ReferralStats root BOX+TEXT+VIS · ReferralReferrer root BOX+VIS |
| profile | ProfileDetails wrap BOX+TEXT+VIS · ProfileChannels / ProfileContact / ProfileBotSwitch root BOX+TEXT+VIS · ProfileSignOut root BOX |
| login | LoginHeading root BOX+TEXT · LoginMethods root BOX |
| payment | PaymentMark root BOX+VIS · PaymentEyebrow / PaymentMessage root BOX+TEXT+VIS · PaymentHeadline root BOX+TEXT · PaymentReference root BOX+TEXT+VIS · PaymentActions root BOX+VIS · PaymentContact / PaymentBack root BOX+VIS |
| tracking | TrackingIntro root BOX+TEXT · TrackingState / TrackingParcels wrap BOX · TrackingForm / TrackingHero root BOX · TrackingProgress / TrackingRefresh / TrackingNotice root BOX+VIS |
| verify | VerifyIntro / VerifyResult root BOX+TEXT · VerifyFields root BOX · VerifyBack root BOX+VIS |

`STAGE4_CONTAINERS`: `Header: 'header'`, `CartContents: 'cart'`, `CartSummary: 'cart-summary'`, `AccountNav: 'account'`, `OrdersList: 'orders'`, `OrderDetail: 'order'`, `Loyalty: 'loyalty'`, `Referrals: 'referrals'`, `Profile: 'profile'`, `LoginOptions: 'login'`, `PaymentSuccess` / `PaymentCancel` / `OrderPlaced: 'payment'`, `TrackingLookup: 'tracking'`, `VerifyForm: 'verify'`. (Containers keep their existing `style` except `CartSummary`, whose target moves `wrap` → `root`, same keys.)

- [ ] **Step 1: Failing tests** `test/builder-parts-stage4.test.ts`, mocking the registry with `withFakeBlocks` plus extra fakes you add in the file (a family `'cart'` container `FakeCart` with `nests: ['FakeSummary']`, `offers`, `slotRejects: { head: ['FakeLines'] }`; a `'cart-summary'` container `FakeSummary` (routeBound true, like the real one); parts `FakeLines`, `FakeHead`, `FakeSumPart`; a `'payment'` container `FakePayOk` with `offers: ['FakeMark','FakeBack']` and a part `FakeActions` of the same family). Cases:
  1. `FakeActions` inside `FakePayOk` ⇒ `part-placement:FakeActions`; inside a sibling `payment` container that offers all ⇒ none; `offers` omitted ⇒ everything of the family is accepted.
  2. `FakeLines` in `head` (directly, and wrapped in a `Section`) ⇒ `slot-rejects:FakeCart.head`; in `main` ⇒ none.
  3. `FakeSummary` (routeBound container) inside `FakeCart.summary`, directly and wrapped in a `Section` ⇒ **no** `slot-accepts`; a route block that is not in `nests` (e.g. `ProductGrid`) there ⇒ `slot-accepts:FakeCart.summary`; `nests` omitted ⇒ any container is still refused (stage-3 behaviour).
  4. Counting stops at the nested container: `FakeSumPart` duplicated inside `FakeSummary` does not raise `part-unique` on `FakeCart`; a `FakeLines` inside `FakeSummary.items` ⇒ `part-placement:FakeLines` (nearest container is the summary).
  5. `hidden-required`: a required part with its own `hide: 'mobile'` ⇒ `hidden-required:<Part>`; a hidden `Section` wrapping the required part ⇒ one issue (unchanged); a hidden **container** (`blockStyle.hide`) holding all its parts ⇒ **no** issue.
  6. `FAMILY_DOCS` has exactly the 13 new keys listed above; `familyAllowedOn('payment', 'order-placed')` true, `('payment', 'cart')` false; `allowedOn('FakeSumPart', 'cart')` true.
  7. `renderComponent`: renders a registered block like `RenderDoc` (a thrown non-route block ⇒ nothing, logged once).
  8. `usePreviewState`: `null` with no provider, with `previewStates: null`, with a state for another container, and for `'constructor'` / `'__proto__'`; the id when set. `usePreviewFixture` likewise.
  9. `findComponent` finds depth-first through any slot, `undefined` otherwise; `offersPart`.
- [ ] **Step 2:** `npx vitest run test/builder-parts-stage4.test.ts` ⇒ fails.
- [ ] **Step 3: Implement.** `rules.ts` changes, exactly:
  - `checkPartPlacement(items, owner: ContainerSpec | null, …)`: `bad = def.part && !(owner && owner.family === def.part.family && offersPart(owner, c.type))` (same flagged key `part-placement:<Type>`; message unchanged when the family differs, `"${label} isn't available on this page's ${noun}."` when the family matches but it is not offered). Pass `def.container ?? owner` down.
  - `foreignInside(items, nests)`: skip any component whose type is in `nests` (and do not report its descendants — they are parts of the nested container).
  - `containerIssues`: after `slot-accepts`, for each slot with `spec.slotRejects` entry, walk the slot subtree (all slots of non-container blocks, stop at nested containers but test the container's own type) and report the first match once per slot as `slot-rejects:<Container>.<slot>` (`"${label} can't sit there: that area of the ${noun} never shows it."`, `blockId` = the match).
  - In `visit`: a required part whose own `hiddenAs(d, c.props)` is set ⇒ push `hidden-required:<type>`, once per type.
- [ ] **Step 4:** relax the two enumeration tests to `registered parts ⊆ expected` where expected = stage-3 list ∪ `Object.keys(STAGE4_PARTS)`; run the new test, `builder-parts-*.test.ts*`, `builder-rules.test.ts`, `builder-editor-contract.test.ts`, `npm run typecheck` ⇒ green. Commit `feat(builder): offers, nests, slotRejects, stage-4 families, renderComponent, preview-state plumbing (stage 4 §3)`.

---

## Task 3: Account goldens

**Depends on:** Task 1 (helper). **Wave 2.** Spec §12.

**Files:** Create `web/test/golden-stage4-account.test.tsx`, `web/test/__golden__/stage4-account-*.html`. Uses the still-existing temp worktree `../ecommerce-storefront-v070` (do not remove it).

**Interfaces:** Consumes T1's helper (copy it from the real worktree into the temp one first). Entry points called (must keep names/props): `AccountLayout({ children? })`, `OrdersPage()`, `OrderDetailPage()`, `LoyaltyPage()`, `ReferralsPage()`, `ProfilePage()`.

- [ ] **Step 1:** In the temp worktree write the test (mocks: `@/features/account/queries.ts` hooks driven by a hoisted `state`, session store, `useCoreOptions`, `isTelegramWebApp`, `useProfile`; see `test/builder-account.test.tsx`, `test/profile-telegram.test.tsx`, `test/text-guard-account.test.tsx`). Every case compares `entry`, `mountDefault('account.<x>', …)` and `mountDoc` with the v0.7.0-shaped stored doc (`AccountNav` with `body: [<section>]`, no `head`; the section with no `content`) to one golden. Cases (`stage4-account-<surface>-<state>`):
  - `nav`: name from session nickname / from profile / none; standing line present / absent; active tab for each of the four routes and for `/account/orders/K4M2QP`.
  - `orders`: pending, error, empty, list (mixed statuses, one with balance due), `hasNextPage` true, next page fetching.
  - `order`: pending, error, not found, full (balance, payments, parcels, `publicUrl`), without balance, without payments, without parcels, without `publicUrl`.
  - `loyalty`: pending, error, ladder with reachable and unreachable options, no points, with store credit, redeem confirm modal open.
  - `referrals`: pending, error, not referred (claim form), referred, share methods none / some, claim error.
  - `profile`: website, web app with chat links, web app without chat links, Telegram (no sign-out), Telegram beta (bot switch), signing out.
- [ ] **Step 2:** `UPDATE_GOLDEN=1` run in the temp worktree writes the entry goldens; the other two renders compare green; re-run without the env var green.
- [ ] **Step 3:** Copy the test and `stage4-account-*.html` back (LF); run in the real worktree green; commit `test(golden): stage 4 account goldens from v0.7.0`.

---

## Task 4: Flow goldens — login, payment pages, tracking, verify

**Depends on:** Task 1. **Wave 2.** Spec §12, §11.3 (the state list).

**Files:** Create `web/test/golden-stage4-flows.test.tsx`, `web/test/__golden__/stage4-{login,payment,tracking,verify}-*.html`. Uses the temp worktree.

**Interfaces:** Entry points (keep names/props): `LoginPage()`, `PaymentSuccessPage()`, `PaymentCancelPage()`, `OrderPlacedPage()`, `TrackingPage()`, `VerifyPage()`. Docs: `login`, `payment-success`, `payment-cancel`, `order-placed`, `tracking`, `verify` (stored shapes: container with no `content` / `top` / `main` / `result`).

- [ ] **Step 1:** Write the test in the temp worktree (mocks: `test/redirect-pages.test.tsx`, `test/verify.test.tsx`, `test/text-guard-tracking.test.tsx`, `test/use-login-success.test.tsx`; mock `@marsidev/react-turnstile` to hand back a token synchronously or never, per case; api modules via `vi.mock`). Same three-render comparison per case. Cases:
  - `login`: page with every method on / only email / Telegram sign-in error screen; signed-in redirect (no golden; assert `Navigate` target only).
  - `payment`: success with reference, missing reference (`MissingReferenceScreen`), saved-order hand-off redirect (assert only); cancel with saved order / without / no reference; order placed with chat links / warning / no chat links / missing reference.
  - `tracking`: no site key screen, idle form, pending (awaiting token, then verifying), error (500), blocked (403), not found (with retry form), found 2 parcels, found 1 parcel (progress stepper), nothing shipped, degraded notice, refresh button shown / hidden, `compact` strip (visited with a reference).
  - `verify`: form, field errors, pending, authentic, expired, not verified, error; an edit after a verdict drops it.
- [ ] **Step 2–3:** as Task 3 (write in the temp worktree with `UPDATE_GOLDEN=1`, re-run clean, copy back, run in the real worktree, commit `test(golden): stage 4 flow goldens from v0.7.0`).

---

## Task 5: Header family — 6 parts, the `Header` container, legacy shells as compositions

**Depends on:** Tasks 1–4. **Wave 3.** Spec §5.1, §7.1, §7.2, §8, §9.

**Files:**
- Create: `web/src/builder/family-header.ts`, `web/src/builder/blocks/_shared/header-container.ts`, `web/src/layouts/header-parts.tsx`, `web/src/builder/blocks/{HeaderBrand,HeaderBack,HeaderSearch,HeaderFilter,HeaderAccount,HeaderCart}.tsx`, `web/src/builder/editor/fields/{same six}.ts`, `web/test/builder-header-parts.test.tsx`
- Modify: `web/src/builder/blocks/Header.tsx`, `web/src/layouts/{StorefrontShell,MenuShell,WebAppShell}.tsx` (header functions only), `web/src/layouts/SearchField.tsx` (optional `rootAttrs`), `web/src/layouts/{StorefrontShell,MenuShell,WebAppShell}.module.css` (fg vars only), `web/src/builder/editor/fields/Header.ts` only if it overrides legacy fields
- Do not touch: shell frames, `*Main`, `Footer`, `ShellFooter`, `NoticeBanners`.

**Interfaces:**
- Produces `family-header.ts`:
```ts
export interface HeaderData {
  variant: 'storefront' | 'menu' | 'webapp';
  classes: Readonly<Record<string, string>>;   // the variant's CSS module object (StorefrontShell / MenuShell / WebAppShell)
  brandName: string; loggedIn: boolean; native: boolean; cartCount: number;
  search: string; setSearch: (v: string) => void;
  onCatalog: boolean; canFilter: boolean; filtered: boolean; showBack: boolean;
  openFilter(): void; goBack(): void;
}
export const HeaderFamily = createFamily<HeaderData>('header');
```
- Produces `layouts/header-parts.tsx`: `export function HeaderBar(p: { variant: HeaderData['variant']; topBar: boolean; sticky: boolean; slots: { start: SlotRender; nav: SlotRender; middle: SlotRender; end: SlotRender }; styleAttrs?: StyleAttrs }): ReactNode` (the container view: today's `<>{topBar && variant !== 'webapp' ? <Slot name="TopBar"/> : null}<header className={sticky ? bar : `${bar} ${unstuck}`} data-sf-part="header" {...styleAttrs}>{variant==='webapp' ? <div className={safeTop}/> : null}<NoticeBanners pinned/><div className={inner}>{start()}{nav()}{middle()}{end({ className: actions })}</div></header></>`, computing `HeaderData` from the hooks each of the three headers calls today), and `HEADER_VIEWS: Record<'storefront'|'menu'|'webapp', FamilyValue<HeaderData>['views']>`; `HeaderBar` picks `HEADER_VIEWS[variant]`. `.actions` wrapper renders even when `end` is empty. Per-variant differences are exactly the table in spec §5.1 (back button web app only; filter button menu/web app only, `null` in storefront; account link target rule in web app = `/account` when signed in **or** native; storefront signed-out account is the text link `signIn`).
- Produces `blocks/_shared/header-container.ts` (`HEADER_CONTAINER`):
```ts
export const resolveVariant = (variant: unknown, layout: LayoutKind): 'storefront' | 'menu' | 'webapp' =>
  variant === 'storefront' || variant === 'menu' || variant === 'webapp'
    ? (variant === 'webapp' && layout !== 'webapp' ? 'menu' : variant) : layout;
const icon = (v: unknown) => (v === 'show' || v === 'hide' ? v : 'inherit');
const withIcon = (type: string, id: string, o: unknown): ComponentData => ({ type, props: { id: partId(id, type), icon: icon(o) } });
export const HEADER_CONTAINER: ContainerSpec = {
  family: 'header', insertSlot: 'end', required: ['HeaderBrand'],
  unique: ['HeaderBrand', 'HeaderBack', 'HeaderSearch', 'HeaderFilter', 'HeaderAccount', 'HeaderCart'],
  legacyProps: ['search', 'accountIcon', 'cartIcon'],
  defaultSlots: (props, { layout, id }) => {      // `nav` is never filled (spec §5.1) so Reset keeps owner content in it
    const v = resolveVariant(props.variant, layout);
    return {
      start: v === 'webapp' ? [part('HeaderBack', id), part('HeaderBrand', id)] : [part('HeaderBrand', id)],
      middle: props.search === false ? [] : [part('HeaderSearch', id)],
      end: [...(v === 'storefront' ? [] : [part('HeaderFilter', id)]), withIcon('HeaderAccount', id, props.accountIcon), withIcon('HeaderCart', id, props.cartIcon)],
    };
  },
};
```
- `Header.tsx`: slots `['start','nav','middle','end']`; schema keeps `variant`, `topBar`, `sticky`, `nav`, adds `start`/`middle`/`end` `slot()`; `search`, `accountIcon`, `cartIcon` become **optional fields with no `defaultProps` entry**; `defaultProps: { variant:'auto', topBar:true, sticky:true, start:[], nav:[], middle:[], end:[] }`; `style` unchanged (`pass`, `bg shadow VIS`); `text: [...TOP_BAR_TEXT]`; render = `<HeaderBar variant={resolveVariant(variant, puck.layout)} topBar sticky slots={{ start, nav, middle, end }} styleAttrs={puck.style} />` (no outer `CoreOptionsScope` any more).
- Part blocks: `HeaderBrand` `label 'Brand'`; `HeaderBack` `'Back button'` with `layouts: ['webapp']`; `HeaderSearch` `'Search'`; `HeaderFilter` `'Categories button'`; `HeaderAccount` `'Account'`; `HeaderCart` `'Cart'`. `HeaderAccount` and `HeaderCart` schema `{ icon: override() }`, `defaultProps: { icon: 'inherit' }`; their **views** render `<CoreOptionsScope value={compactScope({ headerAccountIcon: iconOverride(props.icon as Override) })}>` (`headerCartIcon` for the cart) around an inner component that calls `useCoreOptions()` + `headerIconClass(...)`, null when the feature (`accounts` / `ordering`) is off or the class is `null` — exactly today's logic. `SearchField` gains `rootAttrs`; `HeaderSearch` passes `styleAttrs`.
- Legacy exports `StorefrontHeader`, `MenuHeader`, `WebAppHeader` keep their props (`ShellHeaderProps`) and become `<HeaderBar variant=… slots={{ ...defaultSlotRenders('Header', layout, { variant, search, accountIcon:'inherit', cartIcon:'inherit' }, 'shell'), nav: fixedSlot(nav) }} …/>`; `StorefrontShell` / `MenuShell` / `WebAppShell` (the parity oracles used by `builder-shell.test.tsx`) keep composing them unchanged.

- [ ] **Step 1: Failing tests** `builder-header-parts.test.tsx` per recipe step 8, plus: (a) upgrade of `{ type:'Header', props:{ id:'h', variant:'auto', topBar:true, search:false, sticky:true, accountIcon:'inherit', cartIcon:'hide', nav:[RichText] } }` in storefront ⇒ `start [HeaderBrand]`, `middle []`, `end [HeaderAccount(inherit), HeaderCart(icon:'hide')]`, `nav` untouched; the same in webapp ⇒ `start [HeaderBack, HeaderBrand]`; menu ⇒ `end` begins with `HeaderFilter`; (b) an empty `{}`-legacy header (no `search` key) ⇒ search part present; (c) `prepareProps` (editor) keeps absent slots absent and drops the three legacy props only once all of `start/middle/end` are present; (d) `variant: 'webapp'` in storefront resolves menu defaults; (e) rules: missing `HeaderBrand` ⇒ `part-required:Header.HeaderBrand`; a hidden `Section` in `end` holding `HeaderBrand` ⇒ `hidden-required:Section`; a `Header` with `blockStyle.hide: 'mobile'` ⇒ no issue; `HeaderBrand` inside `CatalogIntro`-family container ⇒ `part-placement`; (f) arrangement: cart moved to `start`, search removed, a `NavLinks` between brand and account render in that DOM order inside `.inner`, the `<header>` still carries `data-sf-part="header"` and (unstyled) no `data-sf*` attribute, `.unstuck` still produced when `sticky:false`; (g) `HeaderCart` with `icon:'hide'` renders nothing under every template icon mode; `HeaderFilter` renders nothing in the storefront variant; `HeaderBack` nothing outside the web app; (h) BAR: no part offers a vertical-spacing, margin, `maxWidth` or `textSize` key (read from the blocks, not the table); (i) CSS: each header part offering `fg` has `--sf-block-fg` in its module rule.
- [ ] **Step 2–4:** run (fail) → implement (recipe steps 1–7; move each header's JSX into `HEADER_VIEWS`, three variants, no behaviour change; keep the three CSS modules at their paths) → run: the task test, `test/golden-stage4-shell.test.tsx` (header cases, all three renders), `test/builder-shell.test.tsx`, `test/shell-header-options.test.tsx`, `test/shell-parts.test.tsx`, `test/text-guard-shell.test.tsx` green.
- [ ] **Step 5:** gate (recipe step 9) and commit `feat(builder): header parts and container (stage 4 §5.1)`.

---

## Task 6: Cart family — `CartContents` and nested `CartSummary` containers, 8 parts, the drawer renders the `cart` document

**Depends on:** Tasks 1–4. **Wave 3.** Spec §3.2, §5.2, §7.3, §7.5, §8, §9.

**Files:**
- Create: `web/src/builder/family-cart.ts`, `web/src/builder/blocks/_shared/cart-container.ts`, `web/src/features/cart/{cart-host.ts,cart-parts.tsx,cart-summary-parts.tsx}`, `web/src/builder/blocks/{CartHeading,CartLines,CartEmpty,CartSummaryNotice,CartSummarySubtotal,CartSummaryTerms,CartSummaryCheckout,CartSummaryContinue}.tsx`, matching `editor/fields/*.ts`, `web/test/builder-cart-parts.test.tsx`
- Modify: `web/src/builder/blocks/{CartContents,CartSummary}.tsx`, `web/src/features/cart/{CartPage,CartSummary,CartDrawer}.tsx`, `web/src/features/cart/{CartPage,CartSummary,CartDrawer}.module.css` (fg / textSize vars), `web/src/components/EmptyState.tsx` only if `rootAttrs` is missing there (stage 3 added it — verify)
- Delete: `web/src/builder/blocks/_shared/cart-context.ts` (and every import of `CartBlockedContext`)
- Do not touch: `CartLine*`, `MobileCartBar*`, `useServerCart.ts`.

**Interfaces:**
- Produces `family-cart.ts`:
```ts
export interface CartData {
  surface: 'page' | 'drawer'; lines: LocalLine[]; count: number; isSyncing: boolean;
  issueByProduct: ReadonlyMap<number, CartIssue>; blocked: boolean;
  setQuantity: (productId: number, quantity: number) => void; remove: (productId: number) => void;
  dismiss?: () => void;                        // drawer only
}
export const CartFamily = createFamily<CartData>('cart');
export interface CartSummaryData {
  blocked: boolean; onNavigate?: () => void; count: number; subtotal: number; currency: string;
  mixedPreorder: boolean; primaryElsewhere: boolean; checkoutTo: string;
}
export const CartSummaryFamily = createFamily<CartSummaryData>('cart-summary');
```
  (types of `LocalLine`, `CartIssue`, setter signatures: copy from `useServerCart` / `stores/cart` — type-only imports.)
- Produces `features/cart/cart-host.ts` (runtime-safe): `CartHost { surface: 'drawer'; frame(regions: { body: ReactNode; footer: ReactNode | undefined }): ReactNode; dismiss(): void }` and `CartHostContext = createContext<CartHost | null>(null)` (`null` = page).
- Produces `cart-container.ts`: `CART_SUMMARY_CONTAINER` (`family: 'cart-summary'`, `insertSlot: 'items'`, `required: ['CartSummarySubtotal','CartSummaryCheckout']`, `unique` all five, `defaultSlots: (_p,{id}) => ({ items: [Notice, Subtotal, Terms, Checkout, Continue].map(t => part(t, id)) })`) and
```ts
export const CART_CONTAINER: ContainerSpec = {
  family: 'cart', insertSlot: 'main', required: ['CartHeading','CartLines','CartEmpty'], unique: ['CartHeading','CartLines','CartEmpty'],
  nests: ['CartSummary'],
  slotRejects: { head: ['CartLines','CartEmpty','CartSummary'], main: ['CartSummary'], summary: ['CartLines','CartEmpty'] },
  defaultSlots: (_p, { id }) => ({
    head: [part('CartHeading', id)], main: [part('CartEmpty', id), part('CartLines', id)],
    summary: [{ type: 'CartSummary', props: { id: partId(id, 'summary'), ...CART_SUMMARY_CONTAINER.defaultSlots({}, { layout: 'storefront', id: partId(id, 'summary') }) } }],
  }),
};
```
- `CartContents` block: slots `['head','main','summary']`, `style` unchanged (`wrap` BOX), `text` narrowed to `['cart.drawer.*'?]` — **none**: it draws nothing itself, `text: []`; parts claim `cart.page.*`, `cart.empty.*`, `cart.summary.items`, `cart.line.*`, `common.qty.*`, `common.product.*`, `common.actions.browseCatalogue`. `CartSummary` block: `slots: ['items']`, `style: styleSupport('root', [...BOX])`, `text: []`, `container: CART_SUMMARY_CONTAINER`; its parts claim `cart.summary.*` rows per spec §9.
- `CartPage({ foot?, slots? })`: the container view. `slots` absent ⇒ `defaultSlotRenders('CartContents','storefront',{}, 'cart')`. Keeps `useServerCart()`, refresh-on-mount (page surface only), `issueByProduct`, `blocked`. Render: host `null` → `empty ? <>{head()}{main()}{summary()}</> : <div className={page}>{head()}{main()}{summary({ className: foot })}</div>`; host set → `host.frame({ body: main(), footer: empty ? undefined : summary() })` and **no** refresh-on-mount (drawer refreshes on open). Provide `CartFamily` with `surface`, `dismiss: host?.dismiss`. `foot` prop stays for legacy callers.
- `CartSummary` container view: `({ blocked?, onNavigate?, slots? })`. Inside a `CartContents` (reads `CartFamily` via `useContext` through a non-throwing accessor — add `useCartFamilyOptional()` to `family-cart.ts`) it takes `blocked` / `dismiss` from there and returns `null` when `lines.length === 0`; standalone it computes `blocked` from `useServerCart().issues` (`inactive || belowMin || aboveMax`) and `onNavigate` from `CartHostContext` (`dismiss`). Renders `<div className={summary} {...styleAttrs}>{items()}</div>` inside `CartSummaryFamily.Provider`.
- `CartDrawer` keeps `opened`, dismiss, refresh-on-open, `Sheet` + its header (title, count, sync pulse, close). Body/footer come from the layout's `cart` document: `const ctx = usePageSetContext(); const resolved = resolveDoc(ctx?.pageSet ?? null, 'cart', ctx?.layout ?? useEffectiveLayout())` (hooks unconditional); find the `CartContents` with `findComponent(doc.content, 'CartContents')`; render `renderComponent(item, { editing:false, docKey:'cart', layout })` inside `<CartHostContext.Provider value={host}>` where `host.frame` returns `<Sheet … footer={footer ?? outsideFooter}>{body}</Sheet>`; `outsideFooter = lines.length > 0 ? <rendered CartSummary component found outside the CartContents subtree> : undefined`. The `CartPage` container is imported **statically** from `CartContents` block (replace its `lazy()`), so first open never suspends. Wrap the frame result in `DocBoundary docKey="cart"` whose fallback renders the default document's `CartContents` and calls `onFallback` once (module-level flag: for the rest of the page load use the default directly; `console.error` logged once by `DocBoundary`). No `CartContents` in the doc ⇒ default doc.
- Views: `cart-parts.tsx` exports `CART_PAGE_VIEWS`, `CART_DRAWER_VIEWS` (`CartHeading` drawer view `null`; `CartLines` page uses `CartPage.module.css` `lines`, drawer uses `CartDrawer.module.css` `lines`; `CartEmpty` drawer's button also calls `dismiss`); the container picks by `surface`. `cart-summary-parts.tsx` exports `CART_SUMMARY_VIEWS`.

- [ ] **Step 1: Failing tests** `builder-cart-parts.test.tsx`, recipe step 8, plus: (a) default document: empty cart renders only `EmptyState` markup (no `div.page`), non-empty renders `div.page > header.head, ul.lines, div.foot > div.summary`; (b) arranged: summary above lines and a `RichText` between lines and summary on the page; (c) **drawer**: render `<CartDrawer/>` with `PageSetContext` holding a page set whose `cart` doc has the summary in `main` order changed ⇒ the Sheet footer still holds the summary and checkout completes (`dismiss` called on navigate); empty cart ⇒ no footer; drawer never suspends (no `Suspense` fallback shown on first open, assert synchronous presence); `CartSummary` outside `CartContents` in the doc ⇒ rendered once, in the footer; a doc whose `CartContents.summary` is `[]` and no outside summary ⇒ no footer; a doc whose `CartLines` throws on render ⇒ default arrangement shown, `console.error` called once across two opens; (d) refresh: page calls `refresh` on mount, drawer only on open; (e) rules: `CartLines` in `head` (direct and in a `Section`) ⇒ `slot-rejects:CartContents.head`; `CartSummary` in `main` ⇒ `slot-rejects:CartContents.main`; `CartEmpty` in `summary` ⇒ `slot-rejects:CartContents.summary`; duplicate `CartSummaryCheckout` ⇒ `part-required:CartSummary.CartSummaryCheckout` ("only once"); `CartLines` inside `CartSummary.items` ⇒ `part-placement:CartLines`; counting does not cross into the summary; `exactly-one:CartSummary` still satisfied by the nested one; (f) `blocked`: inside contents from the cart family (inactive line ⇒ checkout button disabled + `held`), standalone from `useServerCart`; web app layout ⇒ only the `held` note when blocked else nothing; (g) upgrade table: `CartContents` absent `head`/`main` filled, present `summary` untouched; `CartSummary` absent `items` filled (incl. when it only exists nested in a stored `summary`); (h) CSS vars for TEXT parts.
- [ ] **Step 2–4:** fail → implement → green, plus `golden-stage4-shell.test.tsx` (cart cases ×3 renders), `test/text-guard-cart.test.tsx`, `test/cart-line.test.tsx`, `test/builder-commerce.test.tsx`, `test/builder-shell.test.tsx` (drawer mock unaffected).
- [ ] **Step 5:** gate; commit `feat(builder): cart parts, nested summary container, drawer renders the cart document (stage 4 §5.2, §7.3)`.

---

## Task 7: Account header, order history and order detail

**Depends on:** Tasks 1–4. **Wave 3.** Spec §5.3, §5.4 (`OrdersList`, `OrderDetail`), §8, §9. **This task is the only one before T8 to edit `web/src/features/account/Account.module.css`; it applies the fg / textSize variable edits for the `AccountGreeting`, `AccountTabs`, `Orders*` and `Order*` parts only.**

**Files:**
- Create: `web/src/builder/{family-account,family-orders,family-order}.ts`, `web/src/builder/blocks/_shared/{account,orders,order}-container.ts`, parts `AccountGreeting, AccountTabs, OrdersHeading, OrdersRows, OrdersMore, OrdersEmpty, OrderBackLink, OrderHeading, OrderBalance, OrderItems, OrderPayments, OrderParcels, OrderPageLink` (`blocks/*.tsx` + `editor/fields/*.ts`), `web/test/builder-account-parts.test.tsx`
- Modify: `web/src/builder/blocks/{AccountNav,OrdersList,OrderDetail}.tsx`, `web/src/features/account/{AccountLayout,OrdersPage,OrderDetailPage}.tsx`, `web/src/features/account/Account.module.css`, `web/src/features/account/StatusPill.tsx` only if a part's root needs `rootAttrs`, `web/test/builder-account.test.tsx`

**Interfaces:**
- `family-account.ts`: `AccountData { name: string | null; standing: { memberSince: string; totalOrders: number } | null; pathname: string }`, `AccountFamily = createFamily<AccountData>('account')`. `family-orders.ts`: `OrdersData { rows: OrderSummary[]; hasNextPage: boolean; isFetchingNextPage: boolean; loadMore(): void; count: number }`, `OrdersFamily`, and `export interface OrdersPreview { rows: OrderSummary[]; hasNextPage: boolean }`. `family-order.ts`: `OrderData { order: OrderDetail }`, `OrderFamily` (the container owns pending / error / not-found).
- Containers (code, `blocks/_shared/*-container.ts`):
```ts
export const ACCOUNT_CONTAINER: ContainerSpec = {          // defaultSlots omits `body` (stored in every doc)
  family: 'account', insertSlot: 'head', required: ['AccountGreeting','AccountTabs'], unique: ['AccountGreeting','AccountTabs'],
  nests: ['OrdersList','OrderDetail','Loyalty','Referrals','Profile'],
  defaultSlots: (_p, { id }) => ({ head: [part('AccountGreeting', id), part('AccountTabs', id)] }),
};
export const ORDERS_CONTAINER: ContainerSpec = { family: 'orders', insertSlot: 'content', required: ['OrdersRows','OrdersEmpty'],
  unique: ['OrdersHeading','OrdersRows','OrdersMore','OrdersEmpty'],
  defaultSlots: (_p, { id }) => ({ content: ['OrdersHeading','OrdersRows','OrdersMore','OrdersEmpty'].map((t) => part(t, id)) }) };
export const ORDER_CONTAINER: ContainerSpec = { family: 'order', insertSlot: 'content', required: ['OrderHeading','OrderItems'],
  unique: [all seven], defaultSlots: (_p,{id}) => ({ content: ['OrderBackLink','OrderHeading','OrderBalance','OrderItems','OrderPayments','OrderParcels','OrderPageLink'].map((t) => part(t, id)) }) };
```
- `AccountNav` block: slots `['head','body']`, `container: ACCOUNT_CONTAINER`, `text: []`. `AccountLayout({ children?, slots? })` renders `<div className={account}>{head()}<div key={location.pathname} className={FADE}>{children ?? <Outlet/>}</div></div>` where `children` (the block passes `body()`); keeps `useProfile`, session nickname. Its `AccountFamily` data is computed once. No `slots` ⇒ `defaultSlotRenders('AccountNav', 'storefront', {}, docKey)` (`docKey` prop optional, default `'account.orders'`).
- `OrdersPage({ slots? })`: keeps `useOrders`, `PageSkeleton inline`, error `EmptyState`; rows empty ⇒ `content()` bare; else `content({ className: body })`; `loadMore` wires `fetchNextPage`. Preview: reads `usePreviewState('OrdersList')` / `usePreviewFixture<OrdersPreview>('OrdersList')`; when set, uses the fixture instead of the query (no network). `OrderDetailPage({ slots? })`: pending / error / not-found as today, then `content({ className: body })`.
- Parts: `OrdersRows` renders `<ul class="orders">` with the existing row JSX (`StatusPill` stays); `OrderItems` the items section with totals; views per spec §5.4 tables. Text patterns: spec §9 rows. `OrdersList` `text` narrows to its `loadFailed*`, `common.actions.tryAgain`, `common.status.loading`; `OrderDetail` likewise with `notFound*`.

- [ ] **Step 1: Failing tests** `builder-account-parts.test.tsx`, recipe step 8, plus: tabs above greeting; order detail with parcels before items; empty orders ⇒ only `OrdersEmpty` markup and no `div.body`; loading-more button calls `fetchNextPage`; `OrdersEmpty` / `OrderItems` required; rules `part-placement` for `AccountTabs` inside `OrdersList.content` (nearest container is `OrdersList`); `OrdersList` inside `AccountNav.body` raises **no** `slot-accepts`, `Section > OrdersList` neither, `ProductGrid` there does; counting stops at the nested section (a duplicate `OrdersRows` inside `OrdersList` does not raise on `AccountNav`); preview state `none` renders the empty state with the query still pending; `usePreviewState` null for shoppers ⇒ the query path; upgrade for each of the three containers.
- [ ] **Step 2–4:** fail → implement → green incl. `golden-stage4-account.test.tsx` (nav / orders / order cases), `test/text-guard-account.test.tsx`, `test/text-account-dom.test.tsx`, `test/builder-account.test.tsx` (updated to the new structure, same assertions on content).
- [ ] **Step 5:** gate; commit `feat(builder): account header, orders and order-detail parts (stage 4 §5.3–5.4)`.

---

## Task 8: Loyalty, referrals and profile

**Depends on:** Task 7 (shared `Account.module.css`). **Wave 3b.** Spec §5.4 (`Loyalty`, `Referrals`, `Profile`), §8, §9. Edits the `Loyalty*`, `Referral*` and `Profile*` rules of `Account.module.css` only.

**Files:**
- Create: `web/src/builder/{family-loyalty,family-referrals,family-profile}.ts`, `blocks/_shared/{loyalty,referrals,profile}-container.ts`, parts `LoyaltyPoints, LoyaltyCredit, LoyaltyNoPoints, LoyaltyRewards, ReferralCode, ReferralShare, ReferralStats, ReferralReferrer, ProfileDetails, ProfileChannels, ProfileContact, ProfileBotSwitch, ProfileSignOut` (+ fields), `web/test/builder-account-parts-2.test.tsx`
- Modify: `web/src/builder/blocks/{Loyalty,Referrals,Profile}.tsx`, `web/src/features/account/{LoyaltyPage,ReferralsPage,ProfilePage}.tsx`, `web/src/features/account/Account.module.css`, `web/test/profile-telegram.test.tsx` only to follow structure

**Interfaces:**
- `LoyaltyData { profile: Profile; options: RedeemOptions; confirm(option: RedeemOption): void; … }` (whatever the existing view needs, no more), `LoyaltyPreview { profile: Profile; options: RedeemOptions }`; `ReferralsData` (code, share handlers, stats, referrer / claim form state and `claim` mutation callbacks the views call), `ReferralsPreview { info: <the query's data type> }`; `ProfileData { profile; signOut(): void; signingOut: boolean; surface: 'website' | 'webapp' | 'telegram'; … }`, `ProfilePreview { surface: 'website' | 'webapp' }`. Families `'loyalty' | 'referrals' | 'profile'`.
- Containers, `insertSlot: 'content'`: `Loyalty` required `LoyaltyPoints, LoyaltyRewards`, default `[Points, Credit, NoPoints, Rewards]`; `Referrals` required `ReferralCode`, default `[Code, Share, Stats, Referrer]`; `Profile` required `ProfileSignOut`, default `[Details, Channels, Contact, BotSwitch, SignOut]`; all parts `unique`.
- `Loyalty`: `<div className={body}>{content()}{confirmModal}</div>` — the redeem mutation, toast and confirm `Modal` stay in the container, the modal stays the wrapper's last child. `Referrals`: `content({ className: body })`; claim mutation, clipboard and share stay. `Profile`: `content({ className: body })`; sign-out (clears cart and session, hard navigation) stays in the container; `ProfileSignOut` view calls `data.signOut()` and returns `null` inside Telegram; `ProfileBotSwitch` renders `<ClassicBotSwitch>`.
- Preview states per `PREVIEW_STATE_IDS` (`Loyalty`, `Referrals`, `Profile`) as in T7.

- [ ] **Step 1: Failing tests** recipe step 8 plus: loyalty redeem still confirms through the modal with `LoyaltyRewards` moved first; profile without `ProfileChannels` still signs out (and calls the clear-cart path); `LoyaltyRewards` renders `null` until the ladder loads while required; referrals claim form works inside `ReferralReferrer`; Telegram ⇒ `ProfileSignOut` null; preview states each render from fixtures with the queries pending and no `fetch`.
- [ ] **Step 2–5:** as T7 (golden: loyalty / referrals / profile cases; `test/text-guard-account.test.tsx`, `test/profile-telegram.test.tsx`, `test/referral-share.test.ts`, `test/loyalty-reach.test.ts`). Commit `feat(builder): loyalty, referrals and profile parts (stage 4 §5.4)`.

---

## Task 9: Sign-in page and the three payment pages

**Depends on:** Tasks 1–4. **Wave 3.** Spec §5.5, §5.6, §8, §9.

**Files:**
- Create: `web/src/builder/{family-login,family-payment}.ts`, `blocks/_shared/{login,payment}-container.ts`, parts `LoginHeading, LoginMethods, PaymentMark, PaymentEyebrow, PaymentHeadline, PaymentMessage, PaymentReference, PaymentActions, PaymentContact, PaymentBack` (+ fields), `web/test/builder-login-payment-parts.test.tsx`
- Modify: `web/src/builder/blocks/{LoginOptions,PaymentSuccess,PaymentCancel,OrderPlaced}.tsx`, `web/src/features/auth/{LoginPage,LoginOptions}.tsx` (`rootAttrs`), `web/src/features/auth/LoginPage.module.css`, `web/src/features/payment-redirect/{PaymentSuccessPage,PaymentCancelPage,OrderPlacedPage,ReferenceRow}.tsx`, `web/src/features/payment-redirect/PaymentRedirect.module.css`, `web/src/components/ContactLinks.tsx` (`rootAttrs`), `web/test/redirect-pages.test.tsx`, `web/test/text-guard-auth.test.tsx` only to follow structure

**Interfaces:**
- `family-login.ts`: `LoginData {}` (empty marker; heading text needs nothing) + `LoginFamily`. `family-payment.ts`:
```ts
export interface PaymentData { kind: 'success' | 'cancel' | 'placed'; orderRef: string | null; saved: boolean; warning: boolean; whatsapp: string | null; telegram: string | null }
export const PaymentFamily = createFamily<PaymentData>('payment');
export interface PaymentPreview { orderRef: string | null; saved: boolean; warning: boolean; whatsapp: string | null; telegram: string | null }
```
- `payment-container.ts`: one factory, three specs sharing `family: 'payment'`, `insertSlot: 'content'`, all parts `unique`:
  - `PaymentSuccess`: `offers` = all but `PaymentActions`; `required: ['PaymentHeadline','PaymentReference']`; default `[Mark, Eyebrow, Headline, Message, Reference, Contact, Back]`.
  - `PaymentCancel`: `required: ['PaymentHeadline','PaymentActions']`; default `[Mark, Eyebrow, Headline, Message, Reference, Actions, Contact]`.
  - `OrderPlaced`: `required: ['PaymentHeadline','PaymentReference','PaymentActions']`; default `[Mark, Eyebrow, Headline, Message, Reference, Actions, Back]`.
  Views branch on `data.kind` exactly per the §5.6 table (success/placed use the success tone ring+eyebrow; cancel the warn tone; `PaymentMessage` placed = warning `p.alert[role=status]`, else chat hint `p.detail`, else `null`).
- `LoginOptions` block (container): slot `content`, `container: LOGIN_CONTAINER` (`required ['LoginHeading','LoginMethods']`, default `[Heading, Methods]`), `text: ['auth.telegram.error*']` (whatever TelegramSignInError uses); `LoginPage({ slots? })` keeps the `returnTo` parking effect, signed-in `<Navigate>`, the Telegram sign-in error screen (`div.page > TelegramSignInError`, before any slot), renders `content({ className: page })`. `LoginMethods` renders `<LoginOptions rootAttrs={styleAttrs} …/>` (leaf, shared with `LoginModal`).
- Payment page containers keep effects (clear cart + persisted checkout on success / placed), the missing-reference screen, success's hand-off `<Navigate>`; render `content({ className: `${page} ${FADE}` })` — the exact v0.7.0 class string. Preview states per `PREVIEW_STATE_IDS` (`PaymentSuccess`, `PaymentCancel`, `OrderPlaced`) from `usePreviewFixture<PaymentPreview>(name)`; effects (clearing the cart) are skipped while a preview state is active.
- `ReferenceRow` and `ContactLinks` gain `rootAttrs` (no attribute when undefined, tested).

- [ ] **Step 1: Failing tests** recipe step 8, plus: `PaymentActions` on `PaymentSuccess` ⇒ `part-placement:PaymentActions`; required-per-container (`PaymentActions` removed from `PaymentCancel` / `OrderPlaced` ⇒ `part-required`, from `PaymentSuccess` default no issue); `PaymentReference` with `hide` on `PaymentSuccess` ⇒ `hidden-required:PaymentReference`, on `PaymentCancel` ⇒ none; payment success with contact links removed; cancel with `PaymentBack` added; placed with the reference above the headline; cart clearing still happens once on success and placed; saved-order success still redirects; sign-in heading below methods; Telegram sign-in error screen shown without slots; each payment preview state renders with cart untouched.
- [ ] **Step 2–5:** as before; golden: login + payment cases; `test/redirect-pages.test.tsx`, `test/text-guard-auth.test.tsx`, `test/builder-post-order.test.tsx`, `test/use-login-success.test.tsx`. Commit `feat(builder): sign-in and payment page parts (stage 4 §5.5–5.6)`.

---

## Task 10: Tracking

**Depends on:** Tasks 1–4. **Wave 3.** Spec §5.7, §8, §9, §16.6.

**Files:**
- Create: `web/src/builder/family-tracking.ts`, `blocks/_shared/tracking-container.ts`, parts `TrackingIntro, TrackingState, TrackingForm, TrackingHero, TrackingProgress, TrackingRefresh, TrackingNotice, TrackingParcels` (+ fields), `web/test/builder-tracking-parts.test.tsx`
- Modify: `web/src/builder/blocks/TrackingLookup.tsx`, `web/src/features/tracking/{TrackingPage,LookupForm,OrderHero,RefreshButton}.tsx` (`rootAttrs` on the three leaves), `web/src/features/tracking/Tracking.module.css`, `web/test/text-guard-tracking.test.tsx` only to follow structure

**Interfaces:**
```ts
export interface TrackingData {
  phase: 'idle' | 'pending' | 'found' | 'notfound' | 'error' | 'blocked'; compact: boolean;
  data: PublicTracking | undefined; isRefreshing: boolean; awaitingToken: boolean; errorStatus: number | null;
  retry(): void; refresh(): void; reload(): void;
}
export const TrackingFamily = createFamily<TrackingData>('tracking');
export interface TrackingPreview { phase: TrackingData['phase']; compact: boolean; data?: PublicTracking; errorStatus?: number | null }
export const TRACKING_CONTAINER: ContainerSpec = {
  family: 'tracking', insertSlot: 'main',
  required: ['TrackingIntro','TrackingState','TrackingForm','TrackingHero','TrackingParcels'],
  unique: [all eight], slotRejects: { result: ['TrackingIntro','TrackingState','TrackingForm'] },
  defaultSlots: (_p, { id }) => ({
    top: [part('TrackingIntro', id)], main: [part('TrackingState', id), part('TrackingForm', id)],
    result: ['TrackingHero','TrackingProgress','TrackingRefresh','TrackingNotice','TrackingParcels'].map((t) => part(t, id)),
  }),
};
```
(adapt `phase` / error field names to the real state machine in `TrackingPage.tsx`; names above are the spec's.) Container render (spec §5.7): `<div className={page}>{top()}{main()}{phase === 'found' && data ? <div aria-busy={isRefreshing}>{result()}</div> : null}{turnstile}</div>`; the no-site-key screen (`div.page > TrackingUnavailableScreen`) renders before any slot. The whole Turnstile / phase machine (four ordered effects, token wait, stale-response guard, `run()`) stays **verbatim** in the container; views only read `TrackingFamily.useData()` and call `retry` / `refresh` / `reload`. Views: `TrackingIntro` compact ⇒ `div.strip`, else `div.masthead`; `TrackingState` pending / error / blocked / not found screens; `TrackingForm` idle `LookupForm`, not found `div.retry > LookupForm`, else `null`; `TrackingProgress` single parcel only; `TrackingRefresh` while anything is in transit with live tracking; `TrackingNotice` degraded and parcels exist; `TrackingParcels` `ParcelCard`s or `NothingShippedScreen`. Preview: `usePreviewFixture<TrackingPreview>('TrackingLookup')` replaces the live state machine's outputs (no network, no Turnstile wait) when set.

- [ ] **Step 1: Failing tests** recipe step 8, plus: `TrackingForm` in `result` ⇒ `slot-rejects:TrackingLookup.result`; `TrackingHero` in `top` renders nothing until found; the `aria-busy` wrapper absent outside `found`; a `RichText` above the parcels; removing `TrackingRefresh`; not-found default order = screen then retry form; the stale-response guard and token wait unchanged (reuse the existing tracking tests' mocks: two overlapping lookups, the first resolving last ⇒ the second wins); every preview state renders with Turnstile never mounted.
- [ ] **Step 2–5:** golden: tracking cases (all phases); `test/text-guard-tracking.test.tsx`, `test/tracking-status.test.ts`, `test/public-order-api.test.ts`. Commit `feat(builder): tracking parts (stage 4 §5.7)`.

---

## Task 11: Verify

**Depends on:** Tasks 1–4. **Wave 3.** Spec §5.8, §8, §9.

**Files:**
- Create: `web/src/builder/family-verify.ts`, `blocks/_shared/verify-container.ts`, parts `VerifyIntro, VerifyFields, VerifyResult, VerifyBack` (+ fields), `web/test/builder-verify-parts.test.tsx`
- Modify: `web/src/builder/blocks/VerifyForm.tsx`, `web/src/features/verify/VerifyPage.tsx`, `web/src/features/verify/VerifyPage.module.css`, `web/test/verify.test.tsx` only to follow structure

**Interfaces:** `VerifyData { status: 'idle'|'pending'|'authentic'|'expired'|'not-verified'|'error'; result: …; fields/handlers the form needs (values, errors, onChange, onSubmit, ids) }` — the container keeps both fields' state, validation (`schema`, `msg()`), submit handler, "an edit drops the verdict" and ids; `VerifyFamily`; `VerifyPreview { status: VerifyData['status']; result?: … }`. `VERIFY_CONTAINER`: `insertSlot: 'content'`, `required ['VerifyIntro','VerifyFields','VerifyResult']`, default `[Intro, Fields, Result, Back]`. Render `content({ className: page })`. `VerifyFields` = the `<form class="form">` bound to container state (input labels stay inside it; no `textSize`). Preview states per `PREVIEW_STATE_IDS.VerifyForm`.

- [ ] **Step 1: Failing tests** recipe step 8, plus: back link above the form; verdict dropped on edit; each verdict renders its card; `VerifyResult` null while idle / pending; preview states without network.
- [ ] **Step 2–5:** golden verify cases; `test/verify.test.tsx`, `test/text-guard-*.test.tsx`. Commit `feat(builder): verify parts (stage 4 §5.8)`.

---

## Task 12: Editor — palettes, allow lists, parts panel, notices, style `hide`

**Depends on:** Tasks 5–11. **Wave 4.** Spec §4, §11.1, §11.2, §16.9, §16.11.

**Files:**
- Modify: `web/src/builder/editor/{config.ts,route-bound.ts,derive-fields.ts,container-parts.ts,insert-target.ts,ContainerPanel.tsx,style-ghost.css}`, `web/src/builder/editor/custom-fields/style.tsx` (+ `style-model.ts` if needed), `web/src/builder/editor/fields/Header.ts`
- Create: `web/test/builder-editor-parts-stage4.test.ts(x)`
- Do not touch: `EditorHeader.tsx`, `store.ts`, `fixtures.ts`, `EditorApp.tsx`, `ExactPreview.tsx` (T13), `page-ground.tsx` (T14).

**Interfaces:**
- `route-bound.ts`: `familiesOfDoc(docKey): PartFamily[]` (every family whose `FAMILY_DOCS` lists it, in `FAMILY_DOCS` key order); keep `familyOfDoc` returning the first (existing callers); `requiredPartsOn(docKey, layout)` uses `allowedOn(def.name, docKey)` instead of `familyAllowedOn(def.container.family, docKey)` (several containers share the `payment` family and docs — only the doc's own container's required parts lock).
- `config.ts`: `PART_TITLES` gains `header 'Header parts'`, `cart 'Cart parts'`, `'cart-summary' 'Cart summary parts'`, `account 'Account header parts'`, `orders 'Order history parts'`, `order 'Order parts'`, `loyalty 'Loyalty parts'`, `referrals 'Referral parts'`, `profile 'Profile parts'`, `login 'Sign-in parts'`, `payment 'Payment page parts'`, `tracking 'Tracking parts'`, `verify 'Verify parts'`. `blockMenu` emits **one `part` category per family of the doc** (`categories` key `part:<family>`, title from `PART_TITLES`), each listing only that family's parts that are `offered` by a container of the doc (`offers`) and not already present when unique. `PuckShell`-level typing: `CATEGORY_ORDER` handles the new keys.
- `derive-fields.ts`: `containerSlotAllow(def, slot, candidates)` additionally (a) removes `spec.slotRejects[slot]` types, (b) adds names in `spec.nests` that are `allowedOn` the doc, (c) for a part's family filters to parts the *container on the doc* offers. `scopeFields` passes the doc.
- `container-parts.ts`: `partStates` filters the family by `offersPart(container, name)`; `withPartAdded` / `withDefaultArrangement` unchanged but covered for `Header` (Reset uses the **current** `variant` — `defaultsOf` already parses props; a test locks it) and for `CartContents` (nested summary regenerated) and `AccountNav` / `Header` (slots absent from `defaultSlots` are left untouched).
- `insert-target.ts`: `containerAround` already climbs to the nearest container of the part's family; add tests for `cart-summary` parts selected inside the nested summary and `account` parts inside `AccountNav.head`.
- Style group: a part the *container it sits in* requires drops `hide` from its Style group (resolve the nearest container ancestor via `usePuck().getParentById` in the style field and `requiredParts(containerName, layout).includes(def.name)`); `PaymentActions` / `PaymentReference` panels show the note "Required on the success page / the cancel and order-placed pages" naming where they are required.
- Notices (`editorHints` / `ContainerPanel`, all non-blocking, never sent to the admin): `HeaderFilter` in a storefront-variant `Header` — "Shows only with the Menu or Web app header style."; a non-part block other than `NavLinks` / `Button` inside `Header` — "Tall blocks make the header taller on every page."; `Header.topBar` field hint — "To place the template top bar elsewhere, turn this off and add a Template top bar block." (a `description` on the `topBar` field in `fields/Header.ts`); the `cart-summary-outside` hint text updated to "Order summary sits outside Cart lines. Move it into the Summary area of Cart lines so it sits beside the lines and follows the cart's checkout state."; account documents: the Parts list heading names the document ("Account header — Order history page") so five separate `AccountNav`s are obvious. `style-ghost.css`: no change needed unless the cart-page-only tag (T14) needs a shared class — T14 owns that.

- [ ] **Step 1: Failing tests** `builder-editor-parts-stage4.test.ts`: palette categories per doc (shell ⇒ only "Header parts"; cart ⇒ "Cart parts" and "Cart summary parts"; `account.orders` ⇒ "Account header parts" + "Order history parts"; `payment-success` ⇒ "Payment page parts" **without** `PaymentActions`; cancel ⇒ with); required parts `permissions { delete: false, duplicate: false }` (`HeaderBrand` on `shell`; `PaymentActions` on `payment-cancel` and `order-placed` but not on `payment-success`; `CartSummaryCheckout` on `cart`); allow lists (`CartContents.head` excludes `CartLines`; `CartContents.summary` includes `CartSummary`; `AccountNav.body` includes `OrdersList` on `account.orders` and not `Loyalty`); `partStates` for `PaymentSuccess` omits `PaymentActions`; Reset on a `menu`-variant `Header` yields `HeaderFilter`, on a `Header` with changed `variant` uses the new one; Reset on `AccountNav` keeps `body`; hints; Style group `hide` dropped for a required placement and kept otherwise; `insertTarget` for header parts goes to `Header.end` by default and next to the selected part when accepted.
- [ ] **Step 2–4:** fail → implement → `npx vitest run test/builder-editor-*.test.ts*` green (all existing editor tests unedited), typecheck. Commit `feat(editor): stage-4 parts palettes, allow lists, locks, notices (stage 4 §11)`.

---

## Task 13: Editor — preview states and fixtures

**Depends on:** Tasks 5–11. **Wave 4.** Spec §3.3, §11.3, §16.7.

**Files:**
- Modify: `web/src/builder/editor/{store.ts,EditorHeader.tsx,EditorApp.tsx,ExactPreview.tsx,fixtures.ts}`, `web/src/builder/editor/Editor.module.css` (control styling only)
- Create: `web/src/builder/editor/preview-states.ts`, `web/test/builder-editor-preview-states.test.tsx`
- Do not touch: containers' source (they already read the hooks), `config.ts` (T12).

**Interfaces:**
- `preview-states.ts`: `PREVIEW_STATE_LABELS: Record<ContainerName, Array<{ id; label }>>` for the ids of `PREVIEW_STATE_IDS` (labels from spec §11.3: "orders · no orders · more to load", "with rewards · no points", "not referred yet · referred", "website · web app (contact section)", "with reference · missing reference", "saved order · no saved order · no reference", "chat links · warning · no chat links · missing reference", "lookup form · found (2 parcels) · found (1 parcel) · nothing shipped · not found · error", "form · authentic · expired · not verified · error"), `export function previewFixturesFor(states: Record<string, string>): Record<string, unknown>` building each container's fixture from `fixtures.ts` using the exported `OrdersPreview`, `LoyaltyPreview`, `ReferralsPreview`, `ProfilePreview`, `PaymentPreview`, `TrackingPreview`, `VerifyPreview` types; `export function containerOfDoc(docKey, layout): keyof typeof PREVIEW_STATE_IDS | null`.
- `store.ts`: `previewStates: Record<string, string>` (default `{}`), `setPreviewState(container: string, id: string)`; reset when the document changes. `fixtures.ts` gains `FIXTURE_TRACKING` (2 parcels, 1 parcel, nothing shipped), `FIXTURE_VERIFICATION` (authentic, expired, not verified), invented Northbound Supply chat links (`https://wa.me/440000000000`-style placeholders on `shop.example`), orders / loyalty / referral fixtures — all invented.
- `EditorHeader.tsx`: a "Preview state" `<select aria-label="Preview state">` shown only when `containerOfDoc(currentDoc, layout)` is non-null (next to `PreviewAsControls`); also extend `BLOCK_RULE_RE` and `docLabel` so issue ids `slot-rejects:*`, `part-placement:*`, `hidden-required:*` for the new containers read as block names and pages (account docs read "Order history", "Order page", …).
- `EditorApp.tsx` and `ExactPreview.tsx` build the mode `{ editing, previewAs, previewStates, previewFixtures }` (memoised); `previewStates` / `previewFixtures` are `null` when `readOnly` or in a version preview (shopper view).

- [ ] **Step 1: Failing tests** `builder-editor-preview-states.test.tsx`: every `PREVIEW_STATE_IDS` id has a label and a fixture builder (and vice versa); `previewFixturesFor` builds objects of the declared shapes; the select appears only on documents with a stateful container and resets on document change; selecting "found (2 parcels)" makes `TrackingLookup` render `TrackingHero` + two parcel cards with **no** fetch (spy on `fetch`); `ExactPreview` mode carries the states; read-only / version-preview mode has `previewStates === null` and `usePreviewState` returns `null` (Review Focus 5); issue-label regexes cover the new rule ids.
- [ ] **Step 2–4:** fail → implement → editor tests green. Commit `feat(editor): preview states and fixtures (stage 4 §11.3)`.

---

## Task 14: Editor — cart surface switch (Page / Drawer) and "Cart page only"

**Depends on:** Tasks 5–11 (needs T6). **Wave 4.** Spec §7.3, §11.2 (cart tag), §11.3 (cart surface switch).

**Files:**
- Create: `web/src/builder/editor/CartStage.tsx`, `CartStage.module.css`, `cart-surface.ts`, `web/test/builder-editor-cart-stage.test.tsx`
- Modify: `web/src/builder/editor/page-ground.tsx` (mount `CartStage` for the `cart` doc in `storefront` and `menu` layouts, mirroring how `SheetStage` is mounted for the product doc), `web/src/builder/editor/ExactPreview.tsx` **only** for the drawer's exact-preview URL (T13 also edits this file: **T14 starts after T13 commits**, or limits its change to one helper call `exactPreviewPath(docKey, surface)` in `cart-surface.ts` consumed by T13's code — T14 owns the helper, T13 does not touch the path logic)
- Do not touch: `store.ts`, `EditorHeader.tsx`.

**Interfaces:** `cart-surface.ts`: module-level external store (no Puck, no zustand store edit): `export type CartSurface = 'page' | 'drawer'; export function useCartSurface(): [CartSurface, (s: CartSurface) => void]`, resets to `'page'` on a document change. `CartStage({ children })`: Page ⇒ children unchanged; Drawer ⇒ a 420 px column with a **non-interactive** copy of the drawer header (title, count, close icon; `inert`, `aria-hidden`) using the real `Sheet` module classes, `CartHostContext.Provider value={{ surface: 'drawer', frame: ({ body, footer }) => <><div …>{body}</div>{footer ? <div pinned>{footer}</div> : null}</>, dismiss: noop }}` around the document's content, plus the segmented control "Page | Drawer" above the stage (`role="radiogroup"`, labelled "Cart surface"). Content blocks at the document root and in the cart's `head` slot get a ghost tag "Cart page only" in the Drawer surface (add a `data-sf-builder-page-only` attribute from `EditorBlock` **only via** a CSS rule in `CartStage.module.css` scoped under the stage — no edit to `EditorBlock.tsx`; select by slot: `[data-sf-builder-slot="head"] > *` — verify the attribute exists on Puck's slot wrappers, else tag via an injected class on the container's `head` slot call). Exact preview in Drawer mode at desktop width opens `/cart` (so the real drawer shows the draft); `exactPreviewPath('cart', 'drawer')` returns `'/cart'` and forces the preview viewport to desktop.

- [ ] **Step 1: Failing tests:** switch toggles the stage; Drawer wraps the doc in `CartHostContext` (the container renders its `main` in the column and its `summary` in the pinned footer; `head` not rendered); empty cart ("Preview as") ⇒ no footer; Page mode renders the container's page surface; the control is absent on non-cart docs and on the web-app layout; `exactPreviewPath` cases.
- [ ] **Step 2–4:** fail → implement → green; commit `feat(editor): cart page/drawer canvas switch (stage 4 §11.3)`.

---

## Task 15: Contract flip, `blocks.json`, docs, bundle gate

**Depends on:** Tasks 12–14. **Wave 5.** Spec §12, §13 (contract), §14 (docs).

**Files:**
- Modify: `web/test/builder-parts-contract.test.tsx` (restore **equality**: registered parts = stage-3 list ∪ `STAGE4_PARTS` keys; add the stage-4 style / CSS-reach rows from `STAGE4_PARTS`), `web/test/builder-editor-contract.test.ts` (`PART_BLOCKS` equality incl. stage-4 parts), `web/test/builder-defaults-complete.test.ts` only if it enumerates containers, `web/public/blocks.json` (regenerated)
- Create: `web/test/builder-parts-stage4-contract.test.ts` (every container's defaults pass its own rules in every layout it lives in and for every header variant; `part.family`, `style` vs `STAGE4_PARTS`; no `hide` on parts required anywhere except the two conditionally required; part keys ≤ 19 chars; `PREVIEW_STATE_IDS` keys are real containers; fixtures module not imported by any file outside `builder/editor/**` — grep over `web/src` excluding that folder; no part block file imports from `@/features/` or `@/layouts/`)
- Modify docs: `docs/builder.md` ("Containers and parts": the stage-4 families table, the `offers` / `nests` / `slotRejects` extensions, the drawer rule, preview states; Shell / Commerce / Post-order block tables list the new slots; "PuckShell and the system mounts" notes the drawer renders the cart document; "Adding a part" mentions `STAGE4_PARTS`-style tables), `docs/templates.md` (the child-order note: "Header, cart and account parts can be reordered; don't rely on child order or `:first-child` inside `[data-sf-part="header"]` or the cart.")

- [ ] **Step 1:** flip the tests; run them (they must be green now that all parts are registered).
- [ ] **Step 2:** `UPDATE_BLOCKS_JSON=1 npx vitest run test/blocks-manifest.test.ts`; verify the diff is only new blocks and the three changed containers' `slots` / `required` / `unique` / `insertSlot`, and `CartSummary.style.target` → `root`.
- [ ] **Step 3: Bundle gate.** `npm run build`; compare the entry chunk with `.superpowers/sdd/2026-10-01-shell-cart-account-parts-storefront/entry-baseline.txt`; append the new raw / gzip numbers and the delta to that file. Inspect `dist/assets` for chunk membership: the cart container view is in the entry; no account / tracking / verify / payment / login **view** moved into the entry (grep the entry chunk for a string literal unique to each, e.g. the tracking `NothingShippedScreen` copy key); fixtures (`FIXTURE_TRACKING`) are in no shopper chunk. Report any growth beyond part-block shells and the cart container view as BLOCKED.
- [ ] **Step 4:** docs; `npm run build` (builder-isolation check green); full `npx vitest run` ⇒ all green. Commit `chore(builder): stage-4 contract flip, blocks.json, docs, bundle record`.

---

## Task 16: End-to-end and full verification — Playwright owner

**Depends on:** Task 15. **Wave 6.** Spec §12, §13, overview "Gates per stage". The only task running Playwright.

**Files:**
- Create: `e2e/shell-cart-account-parts.spec.ts`
- Modify: `e2e/page-sets.ts` (Northbound Supply arrangements: add builders `arrangedShell`, `arrangedCart`, `v070Shell`, `v070CartOutsideSummary`, `arrangedAccountOrder`, … — append only), `e2e/builder-editor.spec.ts` (append the editor cases; do not edit existing ones), `e2e/mocks.ts` only if a route is missing
- `e2e/dom-parity.spec.ts`, `e2e/templates*.spec.ts` and every existing snapshot: **unchanged** (no `--update-snapshots`).

**Interfaces:** Consumes everything. Produces the verification record appended to `.superpowers/sdd/2026-10-01-shell-cart-account-parts-storefront/progress.md`.

- [ ] **Step 1: Write `shell-cart-account-parts.spec.ts`** (mocked backend; page sets installed through the existing `installMocks` page-set hook, as `e2e/product-parts.spec.ts` does):
  - *Header*: cart moved to `start`, search removed, a `NavLinks` between brand and account; after scrolling `top` is 0 and pinned notices sit under it; `sticky: false` scrolls away; menu variant with the filter button opening the category sheet; web-app back button outside Telegram; a document without `HeaderBrand` renders the default shell (and logs once).
  - *Cart*: summary above the lines and a `RichText` between lines and summary on the phone page (390); the same arrangement in the desktop drawer (1280) with the summary pinned in the footer and checkout completing; a document without `CartSummaryCheckout` renders the default cart; the empty cart shows `CartEmpty` in both surfaces; the web-app cart shows the held note when blocked; a v0.7.0 cart doc with `CartSummary` outside `CartContents` renders it in the drawer footer.
  - *Account*: tabs above the greeting; order detail with parcels before items; loyalty redeem still confirms through the modal; profile without the channels section still signs out; signed-out `/account/orders` still redirects to `/login?returnTo=`.
  - *Flows*: sign-in heading below the methods; payment success with contact links removed; cancel with a back link added; order placed with the reference above the headline; tracking with the refresh button removed and a `RichText` above the parcels; verify with the back link above the form.
  - *Legacy*: a v0.7.0-shaped shell with `search: false`, `cartIcon: 'hide'` renders no search and no cart icon.
  - *Overflow*: at 360 px, no horizontal overflow on each of these pages under every built-in template (loop the template ids as `templates.spec.ts` does).
- [ ] **Step 2: Append to `builder-editor.spec.ts`:** header parts only on the shell document; drag `HeaderCart` into `start` → the posted change carries the new order; `HeaderBrand` has no delete; Parts-list **Add** restores `HeaderSearch` in `middle`; switching the Header to the menu variant then **Reset arrangement** adds the filter; the cart surface switch draws the drawer stage; Preview state "found (2 parcels)" shows the tracking result parts; opening a v0.7.0-shaped shell and editing posts full slots (never `[]`) and `nav` unchanged.
- [ ] **Step 3: Full verification** (record each command and result in the ledger): `npm --prefix web run typecheck`; `npm --prefix web test` (all green); `npm --prefix web run build`; `npm run test:e2e` — `dom-parity.spec.ts` and `templates.spec.ts` / `templates-baseline*.spec.ts` pass with **no** snapshot written (`git status` shows no change under `e2e/__baseline__` / `*-snapshots`); the rest of the suite unedited and green; the entry-chunk record from Task 15 repeated.
- [ ] **Step 4:** Commit `test(e2e): shell, cart and account parts; stage-4 verification`.

---

## Spec deviations (for the reviewer)

1. **`BuilderMode.previewFixtures`** (spec §3.3 says containers "receive fixture objects through the context value" without naming it): added beside `previewStates`; optional on the interface so existing `BuilderModeProvider` call sites compile.
2. **Per-container requiredness**: spec §4 lists `PaymentActions` / `PaymentReference` as required on some payment containers and not others while §9 gives one style row. The static style keys include `hide` for those two; the `hidden-required:<Part>` rule (Task 2) and the editor's per-placement Style group (Task 12) enforce it.
3. **`requiredPartsOn`** switches from `familyAllowedOn(container.family, doc)` to `allowedOn(container.name, doc)` because three containers share the `payment` family and its three documents.
4. **`nests` is by block name and applies at any depth inside a slot** (a `Section > CartSummary` in `CartContents.summary` stays legal, as in v0.7.0).
5. **`CartContents.defaultSlots` builds the nested `CartSummary` with explicit `items`** (not left for `upgradeDoc`) so editor Reset and `resolveData` never depend on a later upgrade pass.
6. **`Header.defaultSlots` / `AccountNav.defaultSlots` omit `nav` / `body`** so Reset keeps owner content there (spec §5.1 "`nav`: never filled").
7. **Goldens run three renders per case** (v0.7.0 entry point, default document, upgraded stored v0.7.0 document) from one golden — stricter than the spec's "default and upgraded-monolith documents".
8. **Account CSS ownership is serialised** (T7 then T8) because one 1 000-line module serves all six account families.

## Cross-plan contract assumptions

- Stage 3 is fully landed (container/part contract, `FAMILY_DOCS`/`familyAllowedOn`, `defaultSlotRenders`, `PageSetContext`, editor Parts panel, `EmptyState.rootAttrs`); stage 4 only extends it.
- No backend, admin, page-set, protocol or text-key change; `blocks.json` container entries keep today's keys (`offers` / `nests` / `slotRejects` are not emitted), so the stage-4 admin plan needs nothing from this one.
- `PartFamily` union and `FAMILY_DOCS` are extended here with the 13 stage-4 families; stage 5 (checkout, order status) adds its own families to the same unions and a `STAGE5_PARTS` table beside `STAGE4_PARTS` — it must not edit this plan's tables.
- `PREVIEW_STATE_IDS` / `usePreviewState` / `usePreviewFixture` are the single preview-state channel; stage 5's stateful containers (`OrderStatus`, `CheckoutFlow`) should extend `PREVIEW_STATE_IDS` rather than add another mechanism.
- Release as storefront v0.8.0 after stage 3's backend; nothing here requires a backend deploy.
