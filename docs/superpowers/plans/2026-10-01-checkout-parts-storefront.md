# Checkout and order status parts — storefront (stage 5 of "everything editable") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `CheckoutFlow` and `OrderStatus` become containers whose slots hold 16 new part blocks (ten checkout parts, six order-status parts), so an owner can reorder the checkout's steps within the four legal orders, move or remove the optional pieces, put content before / between / after the sections and cards, and style each piece — while with nothing published both pages stay byte-identical to v0.7.0 and no arrangement can drop the address, delivery, payment, total or pay-now card.

**Architecture:** Stage 3/4's container / part pattern is reused unchanged (`web/src/builder/parts.ts`: `ContainerSpec` with `offers` / `nests` / `slotRejects`, `createFamily`, `PartHost`, `partId`, `slotShows`, `containsType`; `rules.ts` per-container rules; `upgrade.ts` fills *absent* slots; `defaultSlotRenders`; `usePreviewState` / `usePreviewFixture` + `PREVIEW_STATE_IDS` in `mode.ts`). It gains four additive `ContainerSpec` fields (`homes`, `order`, `noHide`, `contentOnly`), a `part.defaultSlots` hook so parts that own slots (the five checkout steps) are upgraded like containers, and two new families. Each container keeps every query, effect, mutation and state screen and renders its spec's wrapper markup around slot calls inside `<Family>.Provider`; each part is a thin `PartHost` block whose view is today's JSX.

**Tech Stack:** React 19, TypeScript 5.9, zod 4, react-router 7, TanStack Query 5, Mantine, Vite, Vitest + Testing Library (jsdom), Playwright (mocked backend, port 5199), `@puckeditor/core` 0.23.0 (editor only).

**Spec:** `docs/superpowers/specs/2026-09-30-checkout-parts-design.md` (binding, commit 0f6dd53), with the overview `docs/superpowers/specs/2026-09-30-puck-editable-overview.md`, the stage-3 spec `2026-09-30-product-parts-design.md` and the stage-4 plan `docs/superpowers/plans/2026-10-01-shell-cart-account-parts-storefront.md` (the pattern; read its Global Constraints and "The part recipe"). Rulings (binding, `.superpowers/sdd/stage5/rulings.md`): the container keeps all checkout / order logic; the action band, terms line, alerts and Turnstile are not parts; five required steps with `before` / `after` slots; only four legal step orders (default document otherwise); steps only (no single-page mode); an absent coupon / notes part means the saved value is ignored; `OrderStatusPayment` is required, first in the action column and one unsplit part. **Start only after stage 4 has fully landed** (stage 3/4/5 plans execute sequentially — they reshape the same files; this plan edits files stage 4's last tasks edit).

## Global Constraints

- Work only in the `ecommerce-storefront/` worktree on `feature/puck-editable`. Never push, merge, or touch another checkout. The repo is **public**: fixtures, docs and screenshots use "Northbound Supply" / `shop.example`; no local paths, usernames, client names or credentials.
- House rules (`.superpowers/sdd/house-rules.md`): TDD; commit **by explicit pathspec only** (`git add -- <paths>` then `git commit -m "…" -- <paths>`); never `git add -A`, `git stash`, reset or check out others' files; every commit message ends with the two lines `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4`.
- Any task touching React components or CSS loads the `frontend-design:frontend-design` skill first.
- Imports are `@/…` with `.ts` / `.tsx` extensions. `@puckeditor/core` **value** imports only under `web/src/builder/editor/**`. `parts.ts`, `define.ts`, `family-*.ts`, `upgrade.ts`, `mode.ts`, `blocks/**` are shopper-bundle code: type-only imports from features, no fixtures, no editor modules.
- **Registry cycle (stage 4's lesson):** part blocks, container blocks and `blocks/_shared/*-container.ts` import only `parts.ts`, `define.ts`, `style/model.ts`, `family-*.ts` and other `_shared` files. They never import `rules.ts`, `registry.ts`, `render.tsx`, `defaults/**` or any `features/**` module (except `lazy(() => import(...))` of the container view, as `CheckoutFlow.tsx` / `OrderStatus.tsx` do today). Feature container files (`CheckoutPage.tsx`, `OrderStatusPage.tsx`) may import `render.tsx` / `rules.ts` because they are only ever reached lazily; nothing the shell or the cart drawer imports statically may import them.
- **Parity (spec §12):** with no published set, or a set that never touches these routes, both pages' DOM is byte-identical to v0.7.0. `e2e/dom-parity.spec.ts`, `e2e/templates*.spec.ts`, `e2e/telegram-webapp.spec.ts`, `e2e/storefront.spec.ts`, and every `web/test/__golden__/stage5-*.html` pass **without regenerating anything** (never `--update-snapshots`; never `UPDATE_GOLDEN` after Tasks 1 and 3).
- **Absent ≠ empty:** a container (or slotted part) slot whose key is `undefined` is filled from `defaultSlots`; a present slot, even `[]`, is never touched. No `?? []` anywhere before `upgradeDoc` / `fillAbsentSlots` has run.
- **Text keys:** no new key, no new shopper string. Moved JSX keeps its literal `t('…')` keys. Every part's `BlockDef.text` lists **valid `TextKeyPattern`s**: an exact key or `area.part.*` (a trailing `.*` only; **no** `foo*` mid-segment wildcard — write the keys out). Each container's `text` narrows to what it still draws. The text coverage / orphan / guard / inventory tests stay green. Editor-only copy (hints, notes, toasts) lives under `web/src/builder/editor/**`, never in feature code (the text guard scans features).
- **Parts have no props but `blockStyle`** (and, for the five step parts, the `before` / `after` slots). Required and `noHide` parts never take `hide`. A part with an input never takes `textSize`. Style rows are exactly `STAGE5_PARTS` (Task 2); `fg` / `textSize` keys switch that part's CSS-module rules to `var(--sf-block-fg, <today>)` / `calc(<today> * var(--sf-text-scale, 1))`. Unstyled ⇒ no attribute, no wrapper.
- Parts render only through `PartHost`; a part view owns no state beyond what its feature component already owned (`PaymentSection`'s `changing`, `CouponField`'s draft, `QuoteSummary`'s `open`, `MethodPicker`'s query / mutation, `CryptoPaymentCard`'s submit) — no new `useState` / `useEffect` / query in a view adapter.
- Part ids: `partId(containerId, key)` = `` `${containerId.slice(0, 40)}-${key}` ``; a part inside a step part uses `partId(stepId, key)`; longest key here is 16 chars (`CheckoutShipping`) → every default id ≤ 57. A test asserts every default id ≤ 64 and unique.
- Template mobile rules: 44×44 tap targets, no overflow at 360 px, 16 px inputs, `prefers-reduced-motion`. Shop colours only via `--sf-*`; editor UI via `--sfb-*`.
- Editor protocol stays `protocol: 1`; page-set shape unchanged; `blocks.json` container entries keep their current keys (no `homes` / `order` / `noHide` / `contentOnly` emitted).
- Tests: from `ecommerce-storefront/web`: `npx vitest run <files>`; typecheck `npm run typecheck`; build `npm run build`. Never `npm run install:web`; use `npm ci` inside `web/`. **Only the task marked "Playwright owner" runs `npm run test:e2e` (from `ecommerce-storefront/`).** Golden tests pin `process.env.TZ = 'Europe/London'` in `vi.hoisted` and fake `Date` (`vi.useFakeTimers({ toFake: ['Date'] })`) wherever output depends on now.
- If a sibling task's file breaks typecheck/tests: wait a minute and re-run; never edit it. Blocked → report BLOCKED / NEEDS_CONTEXT.
- Existing unit tests that read a surface this stage refactors (`checkout-page.test.tsx`, `templates-parts.test.ts`, `motion-usage.test.ts`, `text-guard-order.test.tsx`, `builder-commerce.test.tsx`, `builder-post-order.test.tsx`) may be edited **only** by the task that owns that surface and only to follow an intended structural change (point a source-scan at the file the JSX moved to; never relax an assertion).

## Review Focus

1. **A stored v0.7.0 `CheckoutFlow` / `OrderStatus` document edited once in the editor** → the posted change carries full slots from `defaultSlots` (never `[]`), a step part stored without `after` gets its default coupon / notes (not `[]`), and nothing trips `part-required` / `part-order` (which would drop the shopper to the default page). Tests: Task 2 Step 1 (upgrade table), Task 4 Step 1 (upgrade + `prepareProps`), Task 6 Step 1 (editor load).
2. **A shopper whose saved form still holds a coupon code or notes after the owner removed the part (or put it in a hidden column)** → the quote request, the guest quote key, the 404/422 attribution and the order body carry neither; re-adding the part restores what they typed. Test: Task 4 Step 1 (container logic, all four sinks asserted separately).
3. **Rearranged checkout in the real flow** — Address · Contact · Shipping · Payment · Review (and the other three legal orders): `validate` by kind, `submit` returning to the *first failing step in the owner's order*, review "Change" jumping to the right step, recap slips following the order, Telegram's MainButton = Continue ×4 then Place order with the total, the first-step band omission by *position*, and a guest still minting exactly one token per quote. Tests: Task 4 Step 1; Task 9 (e2e, storefront / menu / webapp, 390 and 1280, guest and Telegram).
4. **Order page edge states** — an order with nothing to pay and no shipments (single column), a pre-v0.7 order with no `payment` block, a crypto payment that is cancelled, no shipping address, the change-method panel hiding the active payment's card, and the owner's arrangements that leave one column empty. Tests: Task 3 goldens (re-run by Task 5), Task 5 Step 1 (wide / narrow in each silent combination).
5. **Illegal arrangements that never pass through the guard** — a stored document with Payment before Shipping or a coupon in the Contact step (older editor, API), a `Columns` holding the coupon dragged into the Contact step, and an *already* illegal stored document that the owner then edits (the revert must compare against the previous issues, not undo every edit). Tests: Task 2 (rules, 120 permutations), Task 6 Step 1 (`introducesIllegal`), Task 9.

## File Structure

New shopper-bundle files (each owned by exactly one task):

| File | Owner |
|---|---|
| `web/test/golden-stage5-checkout.test.tsx`, `web/test/__golden__/stage5-checkout-*.html`, `.superpowers/sdd/2026-10-01-checkout-parts-storefront/entry-baseline.txt` | T1 |
| `web/test/helpers/stage5-parts.ts` (the binding part table), `web/test/builder-parts-stage5.test.ts` | T2 |
| `web/test/golden-stage5-order-status.test.tsx`, `web/test/__golden__/stage5-order-*.html` | T3 |
| `web/src/builder/family-checkout.ts`, `blocks/_shared/checkout-container.ts`, `features/checkout/{checkout-parts.tsx,step-meta.ts}`, 10 `blocks/Checkout*.tsx` parts + `editor/fields/*.ts`, `web/test/builder-checkout-parts.test.tsx` | T4 |
| `web/src/builder/family-order-status.ts`, `blocks/_shared/order-status-container.ts`, `features/order-status/order-status-parts.tsx`, 6 `blocks/OrderStatus*.tsx` parts + `editor/fields/*.ts`, `web/test/builder-order-status-parts.test.tsx` | T5 |
| `web/src/builder/editor/{step-order.ts,container-actions.ts,legality.ts}`, `StepOrderControl.tsx`, `web/test/builder-editor-checkout-parts.test.ts(x)` | T6 |
| `web/src/builder/editor/CheckoutNote.tsx`, `web/test/builder-editor-checkout-canvas.test.tsx` | T7 |

Every part is one file `web/src/builder/blocks/<Part>.tsx` (the registry globs `./blocks/*.tsx`, file name = block name) plus `web/src/builder/editor/fields/<Part>.ts`. Step components stay in `features/checkout/steps/*` (they gain props); `checkout-parts.tsx` / `order-status-parts.tsx` hold the view adapters (deviation 1).

## Waves (parallel execution)

| Wave | Tasks (disjoint files) | Depends on |
|---|---|---|
| 1 | **T1** checkout goldens + entry baseline · **T2** contract extensions + `STAGE5_PARTS` · **T3** order-status goldens | stage 4 complete |
| 2 | **T4** checkout family · **T5** order-status family | T1+T2 / T2+T3 |
| 3 | **T6** editor structure (palette, allow lists, locks, Step order, hints, legality revert, issue quick fix) · **T7** editor canvas + previews (stacked checkout canvas, signed-in forced preview, order fixtures) | T4, T5 |
| 4 | **T8** contract flip, `blocks.json`, docs, bundle gate | T6, T7 |
| 5 | **T9** e2e + full verification — **Playwright owner** | T8 |

T1 and T3 run in a temporary worktree at a pin commit supplied by the controller (`git rev-parse HEAD` when wave 1 starts, i.e. stage 4's last commit; both tasks record it). The controller removes it (`git worktree remove --force ../ecommerce-storefront-s5-pin`) after T3 commits, before wave 2.

## The part recipe (Tasks 4–5 follow it)

Reference implementations: stage 4's cart (`features/cart/{CartPage,cart-parts}.tsx`, `blocks/CartContents.tsx`, `blocks/_shared/cart-container.ts`, `blocks/CartHeading.tsx`, `editor/fields/CartHeading.ts`, `test/builder-cart-parts.test.tsx`) and stage 3's `ProductGroup` (a part with a slot).

1. **Family file** `web/src/builder/family-<x>.ts`: a data interface (type-only imports) and `export const <X>Family = createFamily<<X>Data>('<family>')`.
2. **Views** in the feature module: `export const <X>_VIEWS: FamilyValue<<X>Data>['views'] = { Part: View }`; `function View({ props, styleAttrs }: PartViewProps)` reads `<X>Family.useData()` and returns today's JSX of that piece, spreading `{...styleAttrs}` on its root element (target `root`) or via the shared component's new optional `rootAttrs?: StyleAttrs` (unit-tested: no attribute when `undefined`). Target `wrap` ⇒ no spread (`renderBlock` adds the wrapper).
3. **Container view**: the feature component keeps its name and export and gains an optional `slots` prop; without it, `defaultSlotRenders('<Container>', 'storefront', {}, '<docKey>')`. It computes data once, keeps every effect / query / mutation / state screen **before** any slot renders, wraps the spec's markup around slot calls, and renders `<X>Family.Provider value={useMemo(() => ({ data, views }), …)}>`.
4. **Part block file** (ordinary part; the five step parts are in Task 4):
```tsx
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CheckoutFamily } from '@/builder/family-checkout.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

export const block = defineBlock<{ id: string }>({
  name: 'CheckoutHeading', label: 'Checkout heading', category: 'part', part: { family: 'checkout' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),               // exactly the STAGE5_PARTS row
  text: ['checkout.page.eyebrow', 'checkout.page.title', 'checkout.page.guestTitle'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CheckoutFamily.PartHost name="CheckoutHeading" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
```
5. **Container block**: add `container: <X>_CONTAINER`, the slot names in `slots`, `slot()` schema entries with `[]` defaults, narrowed `text`; keep `style`, `routeBound`, `layouts`, `category`. The container block still `lazy()`-imports the page component.
6. **Editor fields file** per part: `export const fields = blockFields('<Part>');` (see `editor/fields/CartHeading.ts`).
7. **CSS**: for each part whose `STAGE5_PARTS` keys include `fg` / `textSize`, edit the matching module rules; the test reads the module text. Never rename or move a CSS module (class names are hashed from the path and live in the goldens).
8. **Gate before commit:** the task's test file, its golden file(s), `npx vitest run test/builder-parts-contract.test.tsx test/builder-editor-contract.test.ts test/builder-rules.test.ts test/builder-upgrade.test.ts test/text-*.test.ts*` (all green — Task 2 relaxed the two enumeration tests to subset checks), `npm run typecheck`. The only red test allowed anywhere is `blocks-manifest.test.ts` "the committed web/public/blocks.json is current" (regenerated by T8).

---

## Task 1: Checkout goldens and entry baseline (before any refactor)

**Depends on:** none. **Wave 1.** Spec §12 ("the first implementation task captures golden markup from the v0.7.0 components before any refactor").

**Files:**
- Create: `web/test/golden-stage5-checkout.test.tsx`, `web/test/__golden__/stage5-checkout-*.html`, `.superpowers/sdd/2026-10-01-checkout-parts-storefront/entry-baseline.txt`
- No existing file is modified. Reuses `web/test/helpers/stage4-golden.tsx` (`mountAt`, `mountDoc`, `mountDefault`) and `web/test/helpers/golden.ts` (`expectGolden`); each stage-5 golden test defines `const expectS5 = (name: string, html: string) => expectGolden(`stage5-${name}`, html);` itself.

**Interfaces:**
- Produces: the committed goldens (the pinned tree's markup) and the entry-chunk baseline.
- Contract kept by every later task: `CheckoutPage()` keeps its export name and no-argument form (it gains an optional `slots` prop only).

- [ ] **Step 1: Temporary worktree.** From `ecommerce-storefront/`: `git worktree add --detach ../ecommerce-storefront-s5-pin <PIN>` (the controller's pin; put it in the commit message). Junction `web/node_modules` into it (PowerShell: `New-Item -ItemType Junction -Path ../ecommerce-storefront-s5-pin/web/node_modules -Target web/node_modules`); if that fails, `npm ci` inside `../ecommerce-storefront-s5-pin/web`. All golden *writing* happens there against untouched code; copy the files back at Step 5.
- [ ] **Step 2: Write `golden-stage5-checkout.test.tsx`** in the temp worktree. Header: `vi.hoisted(() => { process.env.TZ = 'Europe/London'; })`, fake `Date` to a fixed instant. Mocks follow `test/checkout-page.test.tsx` (settings via a hoisted `state`, `@/api/checkout.ts` `quote` / `guestQuote` / `placeOrder` / `placeGuestOrder`, `useServerCart`, `@/lib/telegram-webapp.ts` `isTelegramWebApp`, `@mantine/notifications`, the Turnstile stub that hands tokens back synchronously or never). Copy that file's `Quote` fixture builder (do not import it): two shipping options (one free), card + crypto methods with combos, store credit balance for the signed-in user. Reach step *n* through the UI exactly as a shopper does: seed `localStorage` with a valid persisted form (`persistForm` from `@/features/checkout/form-state.ts`), mount, then click **Continue** *n−1* times awaiting the quote between clicks (a helper `advanceTo(m, n)`). Each case renders **three** ways and compares each to the same golden: `entry` (`<CheckoutPage />`), `mountDefault('checkout', 'storefront', …)`, `mountDoc('checkout', 'storefront', [{ type: 'CheckoutFlow', props: { id: 'CheckoutFlow-1' } }], …)` (the v0.7.0-shaped stored component: no slot keys). Route `/checkout`. Plus: `mountDefault` for `menu` and `webapp` once for steps 1 and 5 (same golden). Before the refactor all three must be identical (this proves the harness).
  Cases (`stage5-checkout-<case>`):
  - `step<1..5>-<in|guest>-<web|tg>` — five steps × signed-in / guest (Turnstile stub gives a token) × browser / Telegram (`isTelegramWebApp` true: no first-step band, no Continue button, no Place order button). 20 goldens.
  - Signed-in browser, step 3: `quote-error-coupon` (404 with a code on the form), `quote-error-shipping` (422, option chosen), `quote-error-address` (422, nothing else supplied), `quote-error-page` (429 → the card's page alert), `shipping-unserviceable` (quote with no options), `shipping-pending` (quote still in the air).
  - Signed-in browser, step 4: `payment-store-credit` (use credit on, amount due 0), `payment-crypto-combo` (crypto selected, combos open), `payment-methods-none`.
  - Signed-in browser, step 5: `review-coupon-notes` (persisted form with an applied coupon and typed notes), `review-submit-error` (`placeOrder` rejects), `review-locked` (409 → button disabled), `review-placing`.
  - Guest browser: `guest-verify-error` (mint rejects → alert + Try again), `guest-verifying` (mint pending → "Verifying…").
  - Page states: `empty-cart`, `guest-unavailable` (guest, no Turnstile site key).
- [ ] **Step 3: Run in the temp worktree with `UPDATE_GOLDEN=1`** (`cd ../ecommerce-storefront-s5-pin/web; $env:UPDATE_GOLDEN='1'; npx vitest run test/golden-stage5-checkout.test.tsx`). Only the `entry` render writes a missing file; the `default` and `doc` renders must compare green. Re-run without the variable: all green, no new file. Confirm the goldens differ meaningfully (e.g. `step3-in-web` contains the coupon field; `step1-*-tg` has no `.nav`).
- [ ] **Step 4: Baseline.** In the temp worktree `npm run build`; record the entry chunk's raw bytes (the largest `assets/index-*.js` referenced by `dist/index.html`) and gzip size as two lines in `entry-baseline.txt`; add a third line `pin: <PIN>`.
- [ ] **Step 5: Copy back** the test, the `stage5-checkout-*.html` goldens (LF endings) and `entry-baseline.txt` into the real worktree. There run `npx vitest run test/golden-stage5-checkout.test.tsx` — green with **no** `UPDATE_GOLDEN` and `CI=1`. Commit by pathspec: `test(golden): stage 5 checkout goldens from <PIN>`.

---

## Task 2: Contract extensions — `homes`, `order`, `noHide`, `contentOnly`, `part.defaultSlots`, families, `STAGE5_PARTS`

**Depends on:** none. **Wave 1.** Spec §3.2, §3.3, §4.2, §4.3, §15 (second item).

**Files:**
- Modify: `web/src/builder/parts.ts`, `web/src/builder/define.ts` (one type line), `web/src/builder/rules.ts`, `web/src/builder/upgrade.ts`, `web/src/builder/guard.ts` (one condition), `web/src/builder/mode.ts` (one `PREVIEW_STATE_IDS` entry)
- Create: `web/test/helpers/stage5-parts.ts`, `web/test/builder-parts-stage5.test.ts`
- Modify (relax to subset over the union; Task 8 restores equality): `web/test/builder-parts-contract.test.tsx` ("covers every registered part"), `web/test/builder-editor-contract.test.ts` ("registers only known parts")

**Interfaces:**
- Produces (`parts.ts`):
```ts
export type PartFamily = /* stage 3/4 members */ | 'checkout' | 'order-status';
export type SlotRef = `${string}.${string}`;                      // "<Block>.<slot>"
// ContainerSpec gains (all optional, additive):
homes?: Readonly<Record<string, readonly SlotRef[]>>;            // where each listed part of the family may live (nearest family ancestor + slot, through content blocks)
homeWhy?: Readonly<Record<string, string>>;                       // editor reason appended to part-home messages, e.g. "no prices exist there yet"
order?: (slots: Readonly<Record<string, readonly ComponentData[]>>, props: Record<string, unknown>) => { message: string; blockId?: string } | null;
noHide?: readonly string[];                                       // parts that may never sit under a hidden block (required parts always included)
contentOnly?: boolean;                                            // every non-part block inside must have category 'content'
export function flattenTypes(items: readonly ComponentData[]): string[];   // depth-first pre-order types through every component-shaped array
FAMILY_DOCS += checkout: ['checkout'], 'order-status': ['order-status'];
```
- Produces (`define.ts`): `part?: { family: PartFamily; defaultSlots?: (props: Record<string, unknown>, ctx: { layout: LayoutKind; id: string }) => Record<string, ComponentData[]> }`.
- Produces (`rules.ts`): `FAMILY_NOUN` / `FAMILY_HOME` entries (`checkout: 'checkout'`, `'order-status': 'order page'`; homes `Checkout flow` / `Order status`); rule ids `part-home:<Part>`, `part-order:<Container>`; `hidden-required:<Holder>` now also fires for `spec.noHide` parts; `slot-accepts` also fires for `contentOnly`; `export function containsVisibleType(items: readonly ComponentData[], type: string): boolean` (same walk as `countBlocks`: honours `visibleSlots`, so a part in a hidden `Columns` column is absent).
- Produces (`upgrade.ts` / `guard.ts`): `fillAbsentSlots` fills a block's absent slots from `def.container.defaultSlots` **or** `def.part.defaultSlots`; the guard calls it for `def.container || def.part?.defaultSlots`.
- Produces (`mode.ts`): `PREVIEW_STATE_IDS.OrderStatus = ['shipped', 'awaiting-payment', 'hosted-open', 'crypto-checking', 'two-parcels', 'cancelled']` (first = the editor's default = today's fixture).
- Produces (`test/helpers/stage5-parts.ts`) — consumed by T4–T8:
```ts
export const STAGE5_PARTS: Record<string, { family: PartFamily; style: { target: StyleTarget; keys: readonly StyleKey[] } }>;
export const STAGE5_CONTAINERS: Record<string, PartFamily>;   // CheckoutFlow: 'checkout', OrderStatus: 'order-status'
```
`STAGE5_PARTS` (`T(target, …groups)` as in `stage4-parts.ts`; spec §9, verbatim):

| Family | Part: target, keys |
|---|---|
| checkout | CheckoutHeading root BOX+TEXT · CheckoutProgress root BOX+VIS · CheckoutContact / CheckoutAddress / CheckoutShipping / CheckoutPayment / CheckoutReview root BOX · CheckoutCoupon / CheckoutNotes / CheckoutSummary root BOX |
| order-status | OrderStatusHero root BOX+TEXT · OrderStatusPayment wrap BOX · OrderStatusShipments wrap BOX · OrderStatusItems root BOX+TEXT · OrderStatusAddress root BOX+TEXT+VIS · OrderStatusFooter root BOX+TEXT |

- [ ] **Step 1: Failing tests** `test/builder-parts-stage5.test.ts`, mocking the registry with `withFakeBlocks` (`test/helpers/fake-parts.tsx`) plus fakes defined in the file, as `builder-parts-stage4.test.ts` does (fake blocks cast `as never`; use the **real** family string `'checkout'` and the doc key `'checkout'` so `familyAllowedOn` is true): container `FakeFlow` (family `checkout`, slots `head lead steps after aside`, `required: ['FakeHead','FakeStepA','FakeStepB','FakeSum']`, `unique` all, `slotAccepts: { steps: ['FakeStepA','FakeStepB'] }`, `contentOnly: true`, `noHide: ['FakeCoupon']`, `homes: { FakeHead: ['FakeFlow.head'], FakeStepA: ['FakeFlow.steps'], FakeStepB: ['FakeFlow.steps'], FakeCoupon: ['FakeStepB.before','FakeStepB.after','FakeFlow.aside'], FakeSum: ['FakeFlow.aside'] }`, `homeWhy: { FakeCoupon: 'no prices exist there yet' }`, `order: (slots) => …` returning `{ message: 'B must follow A.' }` when `FakeStepB` precedes `FakeStepA` in `flattenTypes(slots.steps)`); step parts `FakeStepA` / `FakeStepB` (slots `before`, `after`; `part: { family: 'checkout', defaultSlots: (_p, { id }) => ({ before: [], after: id.includes('B') ? [part('FakeCoupon', id)] : [] }) }`); parts `FakeHead`, `FakeCoupon`, `FakeSum`; real `Section` (slots, category content), `Columns` (`columns: 2` hides `col3`), `RichText`, and a non-content block (`FeaturedProducts`). Cases:
  1. **homes:** `FakeCoupon` in `FakeStepA.before` ⇒ `part-home:FakeCoupon` (message contains "can't go in" and "no prices exist there yet"); in `FakeStepB.after`, `FakeStepB.before`, `FakeFlow.aside` ⇒ none; wrapped in a `Section` inside `FakeStepA.after` ⇒ fails (nearest family ancestor is the step); wrapped in a `Columns` col3 (hidden) inside `FakeStepB.after` ⇒ **no** `part-home` (still correctly homed) ; `FakeSum` in `FakeFlow.steps` ⇒ `part-home:FakeSum` **and** `slot-accepts:FakeFlow.steps`; a part not listed in `homes` (none here) lives anywhere of its container.
  2. **order:** `FakeStepB` before `FakeStepA` in `steps` ⇒ `part-order:FakeFlow` with the function's message and `blockId`; the legal order ⇒ none; a `FakeStepA` / `FakeStepB` pair with a missing member ⇒ no `part-order` (only `part-required`).
  3. **noHide:** a `Section` with `blockStyle: { hide: 'mobile' }` holding `FakeCoupon` in `aside` ⇒ `hidden-required:Section`; holding `RichText` only ⇒ none; a hidden `Section` holding a required part ⇒ still reported (unchanged).
  4. **contentOnly:** `RichText` in `after` ⇒ none; `FeaturedProducts` in `after` (and wrapped in a `Section`) ⇒ `slot-accepts:FakeFlow.after`; a `FakeCoupon` in `FakeFlow.after` ⇒ `part-home:FakeCoupon`.
  5. **counting through slotted parts:** a duplicate `FakeCoupon` (one in `FakeStepB.after`, one in `aside`) ⇒ `part-unique:FakeFlow.FakeCoupon`; a required part nested in a visible slot of a slotted part counts (`part-required` not raised).
  6. **upgrade:** `upgradeItems` on `FakeStepB` stored without `after` ⇒ `after` equals `part.defaultSlots` (a `FakeCoupon` with id `partId(stepId,'FakeCoupon')`), `before` stays absent→`[]` default; the same step with `after: []` ⇒ untouched; the guard (`validateDoc`) fills an absent step slot **before** cleaning (the coupon survives); second `upgradeItems` pass returns the same objects; a container with absent slots still fills as before.
  7. **`flattenTypes`:** pre-order through nested slots, ignoring non-component arrays.
  8. **`containsVisibleType`:** true for a coupon in `FakeStepB.after`; false when the only coupon sits in a `Columns` (`columns: 2`) `col3`; true in `col1`.
  9. **families:** `FAMILY_DOCS.checkout` = `['checkout']`, `['order-status']`; `familyAllowedOn('checkout','order-status')` false; `PREVIEW_STATE_IDS.OrderStatus[0] === 'shipped'` and has six ids.
  10. **120 permutations:** a pure `stepOrderProblem`-style check is Task 4's; here assert only that `order` is called with the stored (not visible-filtered) slots and receives `props`.
- [ ] **Step 2:** `npx vitest run test/builder-parts-stage5.test.ts` ⇒ fails.
- [ ] **Step 3: Implement.** Exactly:
  - `parts.ts`: the type / interface additions above; `export function flattenTypes(items: readonly ComponentData[]): string[]` using the same `isComponentArray` walk as `containsType` (push `item.type`, then recurse through every component-shaped prop array in key order); two `FAMILY_DOCS` entries.
  - `define.ts`: widen `part?` as above (type-only change).
  - `rules.ts`:
    - `containsVisibleType`: `let hit = false; walk(items, (c) => { if (c.type === type) hit = true; }); return hit;`.
    - `checkPartHomes(items, holder, owner, docKey, flagged, issues)` called from `checkRules` after `checkPartPlacement`: for each component with `def.part` whose `owner?.homes` has an own key for its type and `owner.family === def.part.family`: `ref = holder ? `${holder.name}.${holder.slot}` : ''`; if `!owner.homes[type].includes(ref)` push `part-home:<Type>` once per type with message `${label} can't go in ${holder ? label(holder.name) : 'there'}${why ? ` — ${why}` : '.'}` (`why = owner.homeWhy?.[type]`; end with a period either way). Recurse into **every** slot of every block (hidden too, like `placement`); child `owner = def.container ?? owner`; child `holder = (def.container || def.part?.defaultSlots) ? { name: def.name, slot } : holder` (content blocks pass the nearest family ancestor through).
    - In `containerIssues`: build `guarded = new Set([...required, ...(spec.noHide ?? [])])` and use it in place of `required` for `hiddenHolders` and `hiddenParts` only (counts and `part-required` still use `required`); after `part-unique`, `if (spec.order)` call it with `Object.fromEntries(def.slots.map((s) => [s, Array.isArray(item.props[s]) ? item.props[s] : []]))` and push `{ docKey, rule: `part-order:${def.name}`, message, blockId: bad.blockId ?? blockId }`; in the `slot-accepts` loop, `bad = only ? … : foreignInside(...) ?? (spec.contentOnly ? nonContentInside(children) : undefined)` where `nonContentInside` is the first component (any depth, every slot) with `def && !def.part && def.category !== 'content'`.
  - `upgrade.ts`: `fillAbsentSlots` — `const spec = def.container; const own = def.part?.defaultSlots; if (!spec && !own) return props;` then `const defaults = (spec ? spec.defaultSlots(...) : own!(...))`. `guard.ts` line ~81: `def.container || def.part?.defaultSlots ? fillAbsentSlots(…) : raw.props`.
  - `mode.ts`: the `OrderStatus` ids.
  - `test/helpers/stage5-parts.ts` from the table (import `BOX, TEXT, VIS` and the `T` helper pattern from `stage4-parts.ts`; do not edit that file).
  - Relax the two enumeration tests to `registered parts ⊆ (stage-3 list ∪ STAGE4_PARTS ∪ STAGE5_PARTS keys)`, whatever form (subset or equality) they are in when you open them.
- [ ] **Step 4:** run the new test, `builder-parts-stage4.test.ts`, `builder-parts-*.test.ts*`, `builder-rules.test.ts`, `builder-upgrade.test.ts`, `builder-guard.test.ts`, `builder-editor-contract.test.ts`, `npm run typecheck` ⇒ green. Commit `feat(builder): homes, order, noHide, contentOnly, part.defaultSlots, checkout and order-status families (stage 5 §3)`.

---

## Task 3: Order-status goldens (before any refactor)

**Depends on:** none (reuses stage 4's helper). **Wave 1.** Spec §12.

**Files:** Create `web/test/golden-stage5-order-status.test.tsx`, `web/test/__golden__/stage5-order-*.html`. Uses the temp worktree from Task 1 if it exists, else creates it the same way at the same pin (do not remove it).

**Interfaces:** Entry point called (must keep its name and no-argument form): `OrderStatusPage()` from `@/features/order-status/OrderStatusPage.tsx`.

- [ ] **Step 1:** In the temp worktree write the test. Header as Task 1 (TZ pin, fake `Date` for `formatDate` / `formatDateTime` and the pay-by deadline). Mocks: `@/api/public-order.ts` (`fetchPublicOrder` resolved per case; `InvalidLinkError` thrown for the invalid case; a pending promise for loading), `@/app/settings.ts`, `@/api/...` used by `MethodPicker` (`payment-options`, selection, txid submit — read `MethodPicker.tsx` / `CryptoPaymentCard.tsx` for the exact modules) resolved with a card + crypto method list. Mount at `/order/NB0977/key1` with `route: '/order/:ref/:accessKey'`. Three renders per case as Task 1 (`entry` = `<OrderStatusPage />`; `mountDefault('order-status', …, { root … })`; `mountDoc('order-status', 'storefront', [{ type: 'OrderStatus', props: { id: 'OrderStatus-1' } }], { …, root: { chrome: 'none' } })`). Await the query (`findBy…` / settle loop as in `golden-stage4-flows.test.tsx`). Orders are local test fixtures in the shape of `PublicOrder` (Northbound Supply names, `GBP`).
  Cases (`stage5-order-<case>`): `awaiting-payment` (canPay, payBy set, no active payment → method picker card + deadline), `awaiting-changing` (active gateway, click the change-method disclosure open), `hosted-open` (active gateway with `checkoutUrl`), `pending-other` (active kind `other`), `crypto-awaiting`, `crypto-checking` (txid masked, verification `checking`), `crypto-attention` (`needsAttention`), `crypto-cancelled` (cancelled payment hidden), `shipped` (one parcel, in transit), `two-parcels`, `delivered` (route finished), `cancelled`, `refunded`, `preorder`, `paid-no-shipments` (nothing to pay, no shipments → narrow layout, no action column content), `no-address` (`shippingAddress: null`), `no-payment-block` (pre-v0.7 order: no `payment`, no `cryptoPayments`), `no-payment-block-crypto` (no `payment`, one crypto payment), `loading`, `invalid-link` (`InvalidLinkError`), `network-error`. Plus, for `awaiting-payment` and `shipped`, `mountDefault` on `menu` and `webapp` compared with the same golden.
- [ ] **Step 2:** `UPDATE_GOLDEN=1` run in the temp worktree writes the `entry` goldens; the other renders compare green; re-run without the variable green. Sanity-check that `awaiting-payment` has `pageWide` / `layoutWide` and `paid-no-shipments` does not.
- [ ] **Step 3:** Copy back the test and the `stage5-order-*.html` goldens (LF); run in the real worktree green with `CI=1`; commit `test(golden): stage 5 order-status goldens from <PIN>`.

---

## Task 4: Checkout family — ten parts, the `CheckoutFlow` container, effective form, steps by kind

**Depends on:** Tasks 1, 2. **Wave 2.** Spec §4.1–4.2, §5.1, §7, §8, §9, §14.

**Files:**
- Create: `web/src/builder/family-checkout.ts`, `web/src/builder/blocks/_shared/checkout-container.ts`, `web/src/features/checkout/{checkout-parts.tsx,step-meta.ts}`, parts `web/src/builder/blocks/{CheckoutHeading,CheckoutProgress,CheckoutContact,CheckoutAddress,CheckoutShipping,CheckoutPayment,CheckoutReview,CheckoutCoupon,CheckoutNotes,CheckoutSummary}.tsx`, matching `web/src/builder/editor/fields/*.ts`, `web/test/builder-checkout-parts.test.tsx`
- Modify: `web/src/builder/blocks/CheckoutFlow.tsx`, `web/src/features/checkout/CheckoutPage.tsx`, `features/checkout/steps/{ContactStep,AddressStep,ShippingStep,PaymentStep,ReviewStep}.tsx` (props), `features/checkout/{Field,QuoteSummary}.tsx` (`rootAttrs`), `features/checkout/CheckoutPage.module.css` (heading `fg` / `textSize`), `test/checkout-page.test.tsx` and `test/templates-parts.test.ts` (follow the move only: the `data-sf-part="stepper"` expectation points at `checkout-parts.tsx`; the CheckoutPage card / button counts are unchanged)
- Do not touch: `useQuote.ts`, `form-state.ts`, `schemas.ts`, `GuestTurnstile.tsx`, `CouponField.tsx`, `CryptoComboPicker.tsx`, `PhoneField.tsx`, any CSS other than the heading rules.

**Interfaces:**
- Produces `family-checkout.ts` (runtime-safe; type-only feature imports):
```ts
export type StepKind = 'contact' | 'address' | 'shipping' | 'payment' | 'review';
export const STEP_KINDS: readonly StepKind[] = ['contact', 'address', 'shipping', 'payment', 'review'];
export const STEP_TYPE: Readonly<Record<StepKind, string>> = { contact: 'CheckoutContact', address: 'CheckoutAddress', shipping: 'CheckoutShipping', payment: 'CheckoutPayment', review: 'CheckoutReview' };
export const DEFAULT_STEP_ORDER: readonly StepKind[] = STEP_KINDS;
export type StepOrderProblem = 'review-last' | 'address-first' | 'payment-last';
/** null when `order` (kinds in stored order) is legal OR not a full permutation (part-required reports that). */
export function stepOrderProblem(order: readonly StepKind[]): StepOrderProblem | null;
export const isLegalStepOrder = (o: readonly StepKind[]) => o.length === 5 && new Set(o).size === 5 && stepOrderProblem(o) === null;
export const STEP_ORDER_MESSAGE: Readonly<Record<StepOrderProblem, string>> = {
  'review-last': 'The Review step must be last — it holds Place order.',
  'address-first': 'Delivery options need the Delivery address step before them.',
  'payment-last': 'Payment must come after the Delivery address and Delivery steps.',
};
export function stepKindsOf(types: readonly string[]): StepKind[];    // maps STEP_TYPE back, dropping other types
export interface CheckoutData { /* below */ }
export const CheckoutFamily = createFamily<CheckoutData>('checkout');
export interface CheckoutSlots { head: SlotRender; lead: SlotRender; steps: SlotRender; after: SlotRender; aside: SlotRender }
```
  `stepOrderProblem` checks, in this order, over the kinds present once each: Review not at the end ⇒ `'review-last'`; else Address not before Shipping ⇒ `'address-first'`; else Shipping not before Payment ⇒ `'payment-last'`; else `null`. (Exactly four of the 120 permutations are legal: Contact·Address·Shipping·Payment·Review, Address·Contact·Shipping·Payment·Review, Address·Shipping·Contact·Payment·Review, Address·Shipping·Payment·Contact·Review.)
```ts
export interface CheckoutData {
  form: CheckoutForm;                     // the PERSISTED form (views read what the shopper typed)
  patch: (next: Partial<CheckoutForm>) => void;
  errors: Record<string, string>;
  contactModes: ContactModes; guest: boolean; currency: string;
  quote: Quote | undefined;               // shownQuote
  method: PaymentMethod | undefined; combo: CryptoOption | null;
  busy: boolean;                          // isFetching || verifying
  quoteStale: boolean;                    // Boolean(quoteError)
  couponError?: string; shippingNotice?: string; addressNotice?: string;
  order: readonly StepKind[]; step: number; kind: StepKind; onReview: boolean;
  goTo(index: number): void;              // clears errors, sets the step, scrolls the card into view
}
```
- Produces `blocks/_shared/checkout-container.ts` (imports `parts.ts`, `family-checkout.ts` only):
```ts
const STEP_SLOT_HOMES = ['CheckoutContact', 'CheckoutAddress', 'CheckoutShipping', 'CheckoutPayment', 'CheckoutReview'].flatMap((t) => [`${t}.before`, `${t}.after`]) as SlotRef[];
/** The slots of one step part in the default arrangement: Shipping carries the coupon, Review the notes (spec §5.1). */
export function stepSlots(type: string, stepId: string): Record<string, ComponentData[]> {
  return { before: [], after: type === 'CheckoutShipping' ? [part('CheckoutCoupon', stepId)] : type === 'CheckoutReview' ? [part('CheckoutNotes', stepId)] : [] };
}
const step = (type: string, id: string): ComponentData => { const sid = partId(id, type); return { type, props: { id: sid, ...stepSlots(type, sid) } }; };
export const CHECKOUT_CONTAINER: ContainerSpec = {
  family: 'checkout', insertSlot: 'steps', contentOnly: true,
  required: ['CheckoutHeading', 'CheckoutContact', 'CheckoutAddress', 'CheckoutShipping', 'CheckoutPayment', 'CheckoutReview', 'CheckoutSummary'],
  unique: ['CheckoutHeading', 'CheckoutProgress', 'CheckoutContact', 'CheckoutAddress', 'CheckoutShipping', 'CheckoutPayment', 'CheckoutReview', 'CheckoutCoupon', 'CheckoutNotes', 'CheckoutSummary'],
  noHide: ['CheckoutCoupon', 'CheckoutNotes'],
  slotAccepts: { steps: ['CheckoutContact', 'CheckoutAddress', 'CheckoutShipping', 'CheckoutPayment', 'CheckoutReview'] },
  homes: {
    CheckoutHeading: ['CheckoutFlow.head'], CheckoutProgress: ['CheckoutFlow.lead'], CheckoutSummary: ['CheckoutFlow.aside'],
    CheckoutContact: ['CheckoutFlow.steps'], CheckoutAddress: ['CheckoutFlow.steps'], CheckoutShipping: ['CheckoutFlow.steps'], CheckoutPayment: ['CheckoutFlow.steps'], CheckoutReview: ['CheckoutFlow.steps'],
    CheckoutCoupon: ['CheckoutShipping.before', 'CheckoutShipping.after', 'CheckoutPayment.before', 'CheckoutPayment.after', 'CheckoutReview.before', 'CheckoutReview.after', 'CheckoutFlow.aside'],
    CheckoutNotes: [...STEP_SLOT_HOMES],
  },
  homeWhy: { CheckoutCoupon: 'no prices exist there yet', CheckoutNotes: 'it belongs inside one of the five steps' },
  order: (slots) => { const p = stepOrderProblem(stepKindsOf(flattenTypes(slots.steps ?? []))); return p ? { message: STEP_ORDER_MESSAGE[p] } : null; },
  defaultSlots: (_p, { id }) => ({ head: [part('CheckoutHeading', id)], lead: [part('CheckoutProgress', id)], steps: STEP_KINDS.map((k) => step(STEP_TYPE[k], id)), after: [], aside: [part('CheckoutSummary', id)] }),
};
```
  (`CheckoutFlow.after` is in no part's `homes`, so only content blocks may go there; `part-home` fires for any part.) The `order` message for a `Columns`/`Section` between steps is moot: `slotAccepts` already refuses them.
- Produces the part block files. **Step parts** (five; label, text patterns in the table below) use this shape:
```tsx
export const block = defineBlock<{ id: string; before: ComponentData[]; after: ComponentData[] }>({
  name: 'CheckoutShipping', label: 'Delivery', category: 'part',
  part: { family: 'checkout', defaultSlots: (_p, { id }) => stepSlots('CheckoutShipping', id) },
  layouts: 'all', routeBound: false, slots: ['before', 'after'],
  style: styleSupport('root', [...BOX]),
  text: ['checkout.shipping.*', 'checkout.quote.*', 'checkout.errors.stillPricing', 'checkout.errors.shippingStale'],
  schema: z.object({ before: slot(), after: slot() }), defaultProps: { before: [], after: [] },
  render: (p) => <CheckoutFamily.PartHost name="CheckoutShipping" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
```
  Labels: Heading "Checkout heading", Progress "Progress bar", Contact "Your details", Address "Delivery address", Shipping "Delivery", Payment "Payment", Review "Review", Coupon "Discount code", Notes "Order notes", Summary "Order summary". Step parts have **no** `blockStyle.hide`, none offers `textSize`.

| Part | `text` (valid patterns; verify each view's `t(` / `tn(` keys against this list and add any missing explicit key) |
|---|---|
| CheckoutHeading | `checkout.page.eyebrow`, `checkout.page.title`, `checkout.page.guestTitle` |
| CheckoutProgress | `checkout.steps.contact`, `checkout.steps.address`, `checkout.steps.shipping`, `checkout.steps.payment`, `checkout.steps.review` |
| CheckoutContact | `checkout.contact.*`, `checkout.field.*`, `checkout.phone.*`, `common.actions.signIn` |
| CheckoutAddress | `checkout.address.*`, `checkout.field.*` |
| CheckoutShipping | `checkout.shipping.*`, `checkout.quote.*`, `checkout.errors.stillPricing`, `checkout.errors.shippingStale` |
| CheckoutPayment | `checkout.payment.*`, `checkout.crypto.*`, `checkout.quote.*`, `checkout.errors.stillPricing`, `checkout.errors.paymentMissing`, `checkout.errors.methodStale`, `checkout.errors.comboStale` |
| CheckoutReview | `checkout.review.blurb`, `checkout.review.change`, `checkout.review.notChosen`, `checkout.steps.contact`, `checkout.steps.addressTitle`, `checkout.steps.shipping`, `checkout.steps.payment`, `common.totals.storeCredit` |
| CheckoutCoupon | `checkout.coupon.*`, `common.status.*` |
| CheckoutNotes | `checkout.review.notes`, `checkout.review.notesPlaceholder`, `checkout.field.*` |
| CheckoutSummary | `checkout.summary.*`, `checkout.shipping.*`, `cart.summary.items`, `common.totals.*`, `common.product.*` |

  (`checkout.crypto.*` is added to the spec's list: `CryptoComboPicker` renders it inside the payment step.)
- `CheckoutFlow.tsx`: `slots: ['head','lead','steps','after','aside']`, `container: CHECKOUT_CONTAINER`, schema `z.object({ head: slot(), lead: slot(), steps: slot(), after: slot(), aside: slot() })`, `defaultProps` all `[]`, `style` unchanged (`wrap` BOX), `text` = `['checkout.page.eyebrow','checkout.page.emptyTitle','checkout.page.emptyBody','checkout.page.guestUnavailableTitle','checkout.page.guestUnavailableBody','checkout.page.verifying','checkout.page.terms','checkout.steps.count','checkout.steps.contactTitle','checkout.steps.addressTitle','checkout.steps.shippingTitle','checkout.steps.paymentTitle','checkout.steps.reviewTitle','checkout.actions.*','checkout.errors.*','common.actions.*','common.totals.*']`; `render: ({ head, lead, steps, after, aside }) => <CheckoutPage slots={{ head, lead, steps, after, aside }} />` (still `lazy`).
- `features/checkout/step-meta.ts`: `export const STEP_META: Record<StepKind, { label: StringKey; title: StringKey }>` built with `textKey(...)` (`@/text/snapshot.ts`) from today's `STEPS` table.
- Step component prop changes: each of the five gains optional `before?: ReactNode; after?: ReactNode; rootAttrs?: StyleAttrs` and renders `<div className={classes.step} {...rootAttrs}>{before}…{after}</div>` (`before` first child, `after` last); `ShippingStep` **drops** its coupon `<div className={classes.section}>` and the `couponError` / `busy` props (that markup moves to `CheckoutCoupon`'s view); `ReviewStep` drops the `TextareaField` and `patch`, takes `order: readonly StepKind[]` and `onEdit(kind: StepKind)`, and renders the recap slips **in `order` (excluding `review`)** with each slip's Change button calling `onEdit(kind)`; `NOTES_MAX` stays exported from `ReviewStep.tsx`. `TextareaField` (`Field.tsx`) and `QuoteSummary` gain `rootAttrs`.

**`CheckoutPage` refactor — the complete list of changes** (everything else is v0.7.0 verbatim; any remaining `step === n`, `STEPS[n]`, `onEdit(2)` or `index < STEPS.length - 1` is a defect):
1. Props `{ slots?: CheckoutSlots }`; `const legacy = useMemo(() => slots ? null : defaultSlotRenders('CheckoutFlow', 'storefront', {}, 'checkout') as unknown as CheckoutSlots, [slots]); const s = slots ?? legacy!;`.
2. `const order = useMemo(() => { const k = stepKindsOf(s.steps.items.map((i) => i.type)); return isLegalStepOrder(k) ? k : DEFAULT_STEP_ORDER; }, [s.steps.items]);` (defence in depth; the guard already refused illegal documents).
3. `const allItems = [...s.head.items, ...s.lead.items, ...s.steps.items, ...s.after.items, ...s.aside.items]; const couponShown = containsVisibleType(allItems, 'CheckoutCoupon'); const notesShown = containsVisibleType(allItems, 'CheckoutNotes');` (from `@/builder/rules.ts`; **before** the early returns).
4. `const effective = useMemo(() => ({ ...form, couponCode: couponShown ? form.couponCode : '', notes: notesShown ? form.notes : '' }), [form, couponShown, notesShown]);` and use `effective` — and only `effective` — for `useQuote(effective, { guest })`, `guestQuoteKey` (and its dependency list), `classifyQuoteError(quoteError, effective)`, and `buildBody` (`couponCode`, `notes`). Everything else keeps `form`. The persisted form is never rewritten.
5. `STEPS` removed; `STEP_META[order[i]]` supplies label / title; `total = order.length`; `const kind = order[step]!`; `validate(index)` → `validate(kind: StepKind)` with the same five branches selected by kind; `next()` calls `validate(order[step]!)`; `submit()` loops `order.slice(0, -1)` with `validate(order[i]!)` and `setStep(i)` for the first failing; `goTo`, `lastStep`, `onReview`, `nextDisabled` use `order.length - 1`.
6. Context: `const data = useMemo<CheckoutData>(…)` with the fields above (`kind`, `order`, `step`, `onReview`, `goTo`, notices from `errorTarget`: `couponError = errorTarget === 'coupon' ? quoteMessage : undefined`, `shippingNotice`, `addressNotice`); `const value = useMemo(() => ({ data, views: CHECKOUT_VIEWS }), [data])`; render inside `<CheckoutFamily.Provider value={value}>`.
7. Markup (spec §5.1 exactly): empty-cart and guest-unavailable `EmptyState`s unchanged and **before** any slot; then `<div className={classes.page}>{s.head()}<div className={classes.grid}><div>{s.lead()}<div key={step} className={`${classes.card} ${FADE}`} ref={cardRef} data-sf-part="card"><header className={classes.cardHead}>…count / title from `STEP_META[kind]`…</header>{alerts: pageQuoteError · verifyError + Try again · submitError · verifying — unchanged}{s.steps()}</div>{nav unchanged, omitted `inTelegram && step === 0`}{onReview ? <p className={classes.terms}>…</p> : null}{s.after()}</div>{s.aside({ className: classes.aside, as: 'aside' })}</div>{guest && settings.turnstile ? <GuestTurnstile …/> : null}</div>`. The `Stepper` leaves this file (it is `CheckoutProgress`'s view).
8. `features/checkout/checkout-parts.tsx` exports `CHECKOUT_VIEWS` (one adapter per part, all `useData()`): each step view returns `null` unless `data.kind === <KIND>` and otherwise the step component with `before`/`after` taken from `props` (`(props.before as SlotRender | undefined)?.()` — absent ⇒ `undefined`) and `rootAttrs={styleAttrs}`; `CheckoutHeading` → today's `<header className={classes.head} {...styleAttrs}>` (eyebrow, `guest ? guestTitle : title`); `CheckoutProgress` → today's `Stepper` (same `classNames`, `data-sf-part="stepper"`, `active={data.step}`, `onStepClick={data.goTo}`, steps from `data.order` via `STEP_META`, `{...styleAttrs}` on the root); `CheckoutCoupon` → `<div className={stepClasses.section} {...styleAttrs}><CouponField applied={data.quote?.coupon ?? null} code={data.form.couponCode} busy={data.busy} error={data.couponError} onApply={(code) => data.patch({ couponCode: code })} onRemove={() => data.patch({ couponCode: '' })} /></div>`; `CheckoutNotes` → today's `TextareaField` (notes, `NOTES_MAX`, `rootAttrs`); `CheckoutSummary` → `<QuoteSummary defaultOpen={data.onReview} quote={data.quote} isFetching={data.busy} stale={data.quoteStale} method={data.method} combo={data.combo} rootAttrs={styleAttrs} />`. `CheckoutShipping` passes `busy={data.busy}` and `notice={data.shippingNotice}`; `CheckoutAddress` `notice={data.addressNotice}`.
9. CSS: `.eyebrow` and `.title` in `CheckoutPage.module.css` → `color: var(--sf-block-fg, <today>)`, `font-size: calc(<today> * var(--sf-text-scale, 1))` (both rules, including any media-query override of `.title`).

- [ ] **Step 1: Failing tests** `test/builder-checkout-parts.test.tsx` (pattern: `builder-cart-parts.test.tsx`), mocks as `checkout-page.test.tsx`:
  - *Order logic (pure):* all 120 permutations of the five kinds through `stepOrderProblem`: exactly the four legal orders pass; `isLegalStepOrder` false for a four-element list; `stepKindsOf` ignores other types.
  - *Contract:* each of the ten blocks has `part.family === 'checkout'`, `style` equal to its `STAGE5_PARTS` row, `category 'part'`, no `hide` on required parts or on `CheckoutCoupon` / `CheckoutNotes`, no `textSize` on a part holding an input; the five step parts declare `part.defaultSlots` and `slots ['before','after']`; every `text` entry is a valid pattern (regex `^[a-z][A-Za-z]*(\.[A-Za-z]+)*(\.\*)?$` and, if exact, a key in `TEXT_ENTRIES`); `PartHost` outside a container renders `null`; every default id ≤ 64 and unique; `CHECKOUT_CONTAINER.defaultSlots` passes `checkRules` on doc `checkout` in all three layouts; `step(…)` ids equal what `upgradeItems` produces for a step stored without slots (`stepSlots` is the single source).
  - *Rules (real blocks):* removing each required part ⇒ `part-required:CheckoutFlow.<Part>`; a duplicate `CheckoutNotes` ⇒ `part-unique:CheckoutFlow.CheckoutNotes`; for every permutation of `steps`, `part-order:CheckoutFlow` present iff illegal; `part-home` table (coupon in Contact / Address `before` / `after` fails, in Shipping / Payment / Review / `aside` passes, inside a `Section` inside the Contact step fails, inside a visible `Columns` col1 inside Shipping `after` passes, Payment in `summary`… use `aside` / `after` slots: `CheckoutPayment` in `aside` fails, `CheckoutHeading` in `lead` fails, content in `steps` ⇒ `slot-accepts:CheckoutFlow.steps`, `FeaturedProducts` in `after` ⇒ `slot-accepts:CheckoutFlow.after`, a `ProductAddToCart` anywhere ⇒ `part-placement`); `hidden-required` (a hidden `Section` holding `CheckoutCoupon`, `CheckoutNotes` or `CheckoutSummary` each fail; holding `CheckoutProgress` passes; `blockStyle.hide` on `CheckoutSummary` is dropped by the style allowlist and reported as `field:`).
  - *Upgrade:* `{ type:'CheckoutFlow', props:{ id } }` (v0.7.0) ⇒ the container defaults; with `steps` present as `[]` untouched; a step part stored `{ id }` gets `after` default (coupon / notes), a step stored with `after: []` stays `[]`; second pass identity; `prepareProps('CheckoutFlow', …)` keeps absent slots absent (Review Focus 1).
  - *Arrangement (render `CheckoutPage` through `mountDoc`/`RenderDoc` with a guarded document):* default DOM equals the T1 goldens (re-run `golden-stage5-checkout.test.tsx`); order Address · Contact · Shipping · Payment · Review shows Address first, the stepper labels in that order, `checkout.steps.count` "Step 1 of 5", Back on step 1 absent, Continue validates the *address* fields; a `RichText` in `CheckoutShipping.before` renders before the options; a coupon in `aside` renders in the aside and a `Heading` in `after` renders after the terms line on the review step; `CheckoutProgress` removed ⇒ no `[data-sf-part="stepper"]`; `CheckoutNotes` moved into `CheckoutPayment.after` ⇒ rendered on the payment step and not on review.
  - *Container logic (Review Focus 2 and 3):* `validate` by kind in a rearranged order (Contact fourth: Continue on step 3 passes without contact, Continue on step 4 shows the contact errors); `submit` from review re-checks in owner order and returns to the **first failing step in that order** (clear Address and Contact on a Contact-after-Payment order ⇒ lands on Address); review Change jumps to `order.indexOf(kind)`; recap slips follow `order`; with no `CheckoutCoupon` part and `couponCode: 'NORTH10'` in `localStorage`: the quote request (`quote` mock args), the guest quote key (a second guest quote is not re-minted when only the saved code changes), a 404 is **not** attributed to a coupon (`classifyQuoteError` receives the effective form ⇒ shows at page level / not at all), and the `placeOrder` body carry no `couponCode`; likewise no `notes` with no `CheckoutNotes`; re-adding the part restores the saved value in the field and the body; a coupon inside a `Columns` (`columns: 2`) `col3` counts as absent; Telegram: MainButton label is Continue on steps 1–4 and "Place order · £…" on the last, first-step nav omitted by position (with Address first), one handler; guest: one token minted per quote, the "Verifying…" state and token on submit unchanged.
  - *CSS:* the heading rules contain both variables (read the module with `readFileSync`).
- [ ] **Step 2:** fails. **Step 3: Implement** (recipe steps 1–7, the list above). **Step 4:** run the task test, `golden-stage5-checkout.test.tsx` (all three renders per case, unchanged goldens), `checkout-page.test.tsx`, `templates-parts.test.ts`, `motion-usage.test.ts`, `text-guard-checkout.test.tsx`, `text-scan.test.ts`, `text-registry.test.ts`, `builder-commerce.test.tsx`, `builder-routes.test.tsx`; gate (recipe step 8).
- [ ] **Step 5:** commit `feat(builder): checkout parts and container, steps by kind, effective form (stage 5 §5.1)`.

---

## Task 5: Order-status family — six parts and the `OrderStatus` container

**Depends on:** Tasks 2, 3. **Wave 2.** Spec §4.1–4.2, §5.2, §8, §9, §14.

**Files:**
- Create: `web/src/builder/family-order-status.ts`, `web/src/builder/blocks/_shared/order-status-container.ts`, `web/src/features/order-status/order-status-parts.tsx`, parts `web/src/builder/blocks/{OrderStatusHero,OrderStatusPayment,OrderStatusShipments,OrderStatusItems,OrderStatusAddress,OrderStatusFooter}.tsx`, matching `editor/fields/*.ts`, `web/test/builder-order-status-parts.test.tsx`
- Modify: `web/src/builder/blocks/OrderStatus.tsx`, `web/src/features/order-status/OrderStatusPage.tsx`, `features/order-status/{StatusHero,ItemsCard,AddressCard}.tsx` (`rootAttrs`), `features/order-status/OrderStatus.module.css` (fg / textSize vars + the wrap-part column rule), `test/text-guard-order.test.tsx` and `test/builder-post-order.test.tsx` only if a structural change requires it
- Do not touch: `PaymentSection.tsx`, `CryptoPaymentCard.tsx`, `MethodPicker.tsx`, `ShipmentCard.tsx`, `payment-state.ts`, `status.ts`, `StateScreens.tsx`.

**Interfaces:**
- Produces `family-order-status.ts`:
```ts
export interface OrderStatusData { order: PublicOrder; reference: string; accessKey: string }
export const OrderStatusFamily = createFamily<OrderStatusData>('order-status');
export interface OrderStatusSlots { top: SlotRender; action: SlotRender; summary: SlotRender; bottom: SlotRender }
```
- Produces `order-status-container.ts` (imports `parts.ts` only):
```ts
const PARTS = ['OrderStatusHero', 'OrderStatusPayment', 'OrderStatusShipments', 'OrderStatusItems', 'OrderStatusAddress', 'OrderStatusFooter'];
const COLUMN = ['OrderStatus.action', 'OrderStatus.summary'] as const;
export const ORDER_STATUS_CONTAINER: ContainerSpec = {
  family: 'order-status', insertSlot: 'summary', contentOnly: true,
  required: ['OrderStatusHero', 'OrderStatusPayment', 'OrderStatusShipments', 'OrderStatusItems', 'OrderStatusFooter'],
  unique: PARTS, noHide: [],                       // required parts are always guarded; OrderStatusAddress may be hidden
  homes: {
    OrderStatusHero: ['OrderStatus.top'], OrderStatusPayment: ['OrderStatus.action'], OrderStatusFooter: ['OrderStatus.bottom'],
    OrderStatusShipments: [...COLUMN], OrderStatusItems: [...COLUMN], OrderStatusAddress: [...COLUMN],
  },
  order: (slots) => {
    const flat = flattenTypes(slots.action ?? []);
    const pay = flat.indexOf('OrderStatusPayment');
    if (pay < 0) return null;
    const early = flat.slice(0, pay).find((t) => t === 'OrderStatusItems' || t === 'OrderStatusAddress' || t === 'OrderStatusShipments');
    return early ? { message: 'Payment must come before tracking and the order details.' } : null;
  },
  defaultSlots: (_p, { id }) => ({ top: [part('OrderStatusHero', id)], action: [part('OrderStatusPayment', id), part('OrderStatusShipments', id)], summary: [part('OrderStatusItems', id), part('OrderStatusAddress', id)], bottom: [part('OrderStatusFooter', id)] }),
};
```
- `OrderStatus.tsx`: slots `['top','action','summary','bottom']`, `container: ORDER_STATUS_CONTAINER`, `slot()` schema entries, `style` unchanged, `text: ['order.documentTitle','order.screens.*','order.link.*','common.actions.tryAgain','common.contact.*']`, `render: ({ top, action, summary, bottom }) => <OrderStatusPage slots={{ top, action, summary, bottom }} />` (still `lazy`).
- Part blocks (labels: Hero "Order status", Payment "Payment", Shipments "Tracking", Items "Order items", Address "Shipping address", Footer "Order reference"); `OrderStatusPayment` / `OrderStatusShipments` use `styleSupport('wrap', [...BOX])`, Hero / Footer `root` BOX+TEXT, Items `root` BOX+TEXT, Address `root` BOX+TEXT+VIS — exactly `STAGE5_PARTS`. `text`: Hero `order.hero.*`, `order.status.*`, `order.steps.*`, `order.dates.*`, `common.dates.*`, `common.shipment.*`; Payment `order.payment.*`, `order.method.*`, `order.crypto.*`, `order.errors.*`, `order.copy.*`, `order.chat.*`, `common.actions.*`, `common.contact.*`; Shipments `order.shipment.*`, `common.shipment.*`, `order.dates.*`, `common.dates.*`, `order.copy.*`, `common.actions.*`; Items `order.items.*`, `common.totals.*`, `common.product.*`; Address `order.address.*`; Footer `order.footer.*`, `order.chat.*`, `common.contact.*` (verify each view's keys; add explicit keys if one is missing).

**`OrderStatusPage` refactor — the complete list of changes:**
1. Props `{ slots?: OrderStatusSlots }`; legacy `defaultSlotRenders('OrderStatus', 'storefront', {}, 'order-status')`.
2. Keep the `useQuery`, polling, `document.title` effect, `saveOrder` effect and the three screens (`InvalidLinkScreen`, `NetworkErrorScreen`, `LoadingScreen`) exactly, **before** any slot. Add `const fixture = usePreviewFixture<PublicOrder>('OrderStatus'); const order = fixture ?? orderQuery.data;` and `enabled: !fixture && !!ref && !!accessKey` (the editor supplies a fixture; shoppers never have one — `usePreviewFixture` is `null` outside the editor). Hooks stay unconditional.
3. After the screens: `const crypto = visibleCryptoPayments(order); const silent = new Set<string>(); if (!(order.payment?.canPay || crypto.length > 0)) silent.add('OrderStatusPayment'); if (order.shipments.length === 0) silent.add('OrderStatusShipments'); if (!order.shippingAddress) silent.add('OrderStatusAddress'); const wide = slotShows(s.action.items, silent) && slotShows(s.summary.items, silent);` (`OrderStatusItems`, `OrderStatusHero`, `OrderStatusFooter` and content blocks are never silent).
4. Markup: `<OrderStatusFamily.Provider value={…}><div className={wide ? `${classes.page} ${classes.pageWide}` : classes.page}>{s.top()}<div className={wide ? `${classes.layout} ${classes.layoutWide}` : classes.layout}>{s.action({ className: classes.column })}{s.summary({ className: classes.column })}</div>{s.bottom()}</div></OrderStatusFamily.Provider>` — **both column elements always render** and `action` precedes `summary` in the DOM at every width (the payment-first safety order depends on it; a comment says so).
5. `order-status-parts.tsx` exports `ORDER_STATUS_VIEWS`: Hero → `<StatusHero order={data.order} rootAttrs={styleAttrs} />`; Payment → `<PaymentSection order reference accessKey />` (a fragment; `wrap` target, no spread); Shipments → `data.order.shipments.map((shipment, i) => <ShipmentCard key={`${shipment.trackingNumber ?? 'parcel'}-${i}`} shipment index={i} count={…} />)` in a fragment; Items → `<ItemsCard items totals currency rootAttrs={styleAttrs} />`; Address → `data.order.shippingAddress ? <AddressCard address rootAttrs={styleAttrs} /> : null`; Footer → `<footer className={classes.hero} {...styleAttrs}>` with today's three children (`ContactLinks prefill={orderChatMessage(order.reference)}`).
6. `StatusHero`, `ItemsCard`, `AddressCard` gain `rootAttrs?: StyleAttrs` spread on their root element (`undefined` ⇒ no attribute).
7. CSS (`OrderStatus.module.css`): for TEXT parts apply `var(--sf-block-fg, <today>)` / `calc(<today> * var(--sf-text-scale, 1))` to every rule that sets colour or size of text the view draws (hero: `.eyebrow` incl. its `[data-tone]` variants, `.headline`, `.detail`, `.meta`; items: `.cardEyebrow`, `.itemName`, `.itemQty`, `.itemTotal`, `.rowLabel`, `.rowFigure`, `.grandFigure`; address: `.cardEyebrow`, `.addressName`, `.addressLine`; the shared `.detail` / `.meta` serve the footer too); and add `.column > [data-sf-style="OrderStatusPayment"], .column > [data-sf-style="OrderStatusShipments"] { display: grid; gap: 0.9rem; }` (the column's own gap) so a styled run keeps today's spacing — an unstyled part adds no element.

- [ ] **Step 1: Failing tests** `test/builder-order-status-parts.test.tsx`:
  - *Contract / rules (as Task 4, with `OrderStatus`):* part table; required parts have no `hide`; `OrderStatusAddress` keeps `hide`; defaults pass `checkRules` on doc `order-status` in all layouts; ids ≤ 64 unique; `part-required` per required part, `part-unique`; `part-home`: Hero outside `top` fails, Payment in `summary` fails, Footer in `action` fails, Items in `top` fails, content in any slot passes, a `FeaturedProducts` ⇒ `slot-accepts`; `part-order:OrderStatus`: Items / Address / Shipments before Payment in `action` fail (also nested in a `Section` that precedes Payment), a `RichText` before Payment passes, Items in `summary` with Payment second in `action` passes, Payment after Shipments in `action` fails; `hidden-required`: a hidden `Section` holding Payment / Items / Hero fails, holding `OrderStatusAddress` passes.
  - *Upgrade:* v0.7.0 `{ type:'OrderStatus', props:{ id } }` ⇒ defaults; present `[]` untouched; idempotent; a stored `blockStyle` on the monolith survives.
  - *Wide / narrow (Review Focus 4):* render the container with each combination — default arrangement + order with payment owed (wide), payment not owed + shipments (wide via Shipments), nothing owed and no shipments (narrow: Items only in `summary`, `action` column element still present and empty), crypto cancelled only (narrow), `OrderStatusItems` moved into `action` after Payment and `summary` holding only `OrderStatusAddress` with no address (action shows ⇒ wide only when summary shows ⇒ here narrow), a `RichText` in `summary` makes it show. Class names asserted via `container.querySelector('.page')`/`.layout` (the module's classes).
  - *Arrangement:* Items before Shipments in `action` (after Payment) renders in that DOM order; a `RichText` between Payment and Items; Address removed; Hero never rendered twice; `order.documentTitle` effect still sets `document.title` with a custom arrangement; the three screens render before slots; a pre-v0.7 order (no `payment`) with `usePreviewFixture`-free path renders crypto cards only.
  - *Payment coupling:* with an active gateway payment and the change-method disclosure open, the hosted-checkout card is hidden and the crypto card of the active payment is hidden — with Payment moved to the top of `action` and a `RichText` before it (the `changing` state lives in one part).
  - *Preview fixture:* inside `BuilderModeProvider` with `previewFixtures: { OrderStatus: awaitingOrder }` and `fetchPublicOrder` spied: no fetch happens and the payment card renders; without the provider the query path runs.
  - *Style:* a styled `OrderStatusPayment` produces one `[data-sf-style="OrderStatusPayment"]` wrapper holding the cards; unstyled adds no element; CSS variables test (hero / items / address / footer rules).
- [ ] **Step 2:** fails. **Step 3: Implement.** **Step 4:** run the task test, `golden-stage5-order-status.test.tsx` (three renders per case, unchanged goldens), `text-guard-order.test.tsx`, `builder-post-order.test.tsx`, `builder-routes.test.tsx`, `motion-usage.test.ts`, `templates-parts.test.ts`, `text-*.test.ts*`; gate.
- [ ] **Step 5:** commit `feat(builder): order-status parts and container (stage 5 §5.2)`.

---

## Task 6: Editor structure — palette, allow lists, locks, Step order, hints, legality revert, issue quick fix

**Depends on:** Tasks 4, 5. **Wave 3.** Spec §10.1, §10.2, §10.4.

**Files:**
- Create: `web/src/builder/editor/{step-order.ts,container-actions.ts,legality.ts,StepOrderControl.tsx}`, `web/test/builder-editor-checkout-parts.test.ts` (+ `.tsx` for component cases)
- Modify: `web/src/builder/editor/{config.ts,derive-fields.ts,container-parts.ts,ContainerPanel.tsx,ContainerPanel.module.css,EditorCanvas.tsx,EditorHeader.tsx,route-bound.ts}`, `web/src/builder/editor/fields/CheckoutFlow.ts` / `OrderStatus.ts` only if they override derived fields
- Do not touch: `store.ts`, `fixtures.ts`, `preview-states.ts`, `session.ts`, `fixture-mode.ts`, `EditorApp.tsx`, `ExactPreview.tsx`, `page-ground.tsx`, any `features/**` file (all T7).

**Interfaces:**
- Produces `step-order.ts` (pure, no Puck import):
```ts
export interface StepMove { ok: boolean; reason: string }                 // reason: tooltip text, '' when ok
export interface StepRow { kind: StepKind; label: string; up: StepMove; down: StepMove }
export function stepRows(order: readonly StepKind[]): StepRow[];          // adjacent-swap legality via isLegalStepOrder
export function moveStep(order: readonly StepKind[], kind: StepKind, dir: -1 | 1): StepKind[] | null;   // null when illegal
export function withStepOrder(checkoutFlow: ComponentData, order: readonly StepKind[]): ComponentData;     // reorders `steps` by kind, preserving each step's own props/slots/ids
```
  Reasons: Review (both arrows) "Always last — it holds Place order"; any move that makes `stepOrderProblem` = `'address-first'` "Delivery needs the address first"; `'payment-last'` "Payment must come after Delivery"; `'review-last'` "Review is always last"; a move off the list end "Already at the end".
- Produces `legality.ts`: `export function introducesIllegal(prev: PuckDoc, next: PuckDoc, docKey: DocKey, layout: LayoutKind): string | null` — runs `checkRules` on both; returns the message of the first issue in `next` whose rule starts with `part-home:`, `part-placement:`, `part-order:`, `slot-accepts:` or `slot-rejects:` and whose **rule id was not present in `prev`** (an already-illegal stored document is never reverted on an unrelated edit); `null` otherwise.
- Produces `container-actions.ts`: `resetArrangement(current: ComponentData, layout): ComponentData` (= `withDefaultArrangement`) and `resetStepOrder(current: ComponentData): ComponentData` (= `withStepOrder(current, DEFAULT_STEP_ORDER)`, keeping every slot's content), plus `applyToBlock(getPuck, dispatch, blockId, build)` factored out of `ContainerPanel.commit` (same one-`replace` behaviour) so the panel and the issue quick fix share it.
- Modified `config.ts`: `PART_TITLES` gains `checkout: 'Checkout parts'`, `'order-status': 'Order status parts'`; the five step parts get `permissions: { delete: false, duplicate: false, drag: false }`; other required parts keep `delete: false, duplicate: false` (existing rule); other parts `duplicate: false` (existing); `editorHints` gains the non-blocking hint "Customers who still owe payment see this before how to pay." when a non-part block precedes `OrderStatusPayment` in `OrderStatus.action`.
- Modified `derive-fields.ts`: `containerSlotAllow(def, slot, candidates)` additionally — for a container **or a part with `part.defaultSlots`** — restricts to `slotAccepts[slot]` when present, else to content-category blocks plus the family parts whose `homes[part]` includes `` `${def.name}.${slot}` `` (parts with no `homes` entry: any slot of the container, stage-3 behaviour); `CheckoutFlow.after` / `head`'s allow list therefore holds content only (plus `CheckoutHeading` in `head`). Puck can't see through a dragged `Columns`; that is `legality.ts`.
- Modified `container-parts.ts`: `isGroup(type)` becomes `slots.length > 0 && !part?.defaultSlots` (so the five steps appear in the Parts list as locked Required rows); `withPartAdded` gains **default-holder placement**: when the part's default location (found by walking `defaultsOf(item)`) is inside a component whose block declares `part.defaultSlots`, locate the first component of that holder type anywhere in the item and insert the new node into that holder's same slot (after its default predecessor in that slot, else at the start); without such a holder behaviour is unchanged. (Without this, "Add Discount code" would put the coupon directly in `steps`.)
- Modified `ContainerPanel.tsx`: notices (editor-only copy, exported constants): `CheckoutFlow` — "Shoppers can't enter discount codes; a code saved in a shopper's browser is ignored." when `CheckoutCoupon` is absent; "Order notes are off; notes saved in a shopper's browser are ignored." when `CheckoutNotes` is absent; always "On phones the Order summary column shows above the form." (for the aside) and "Content after the form shows under the Place order button on the review step, and under Continue on the others."; `OrderStatus` — none static. For a selected `CheckoutFlow` it renders `<StepOrderControl>` above the Parts list: five rows (label, ↑ / ↓ buttons `aria-label="Move <label> up"`, `disabled` with `title` = the reason; Review's arrows disabled), each enabled move calls `applyToBlock(…, (cur) => withStepOrder(cur, moveStep(order, kind, dir)!))` and announces "<label> moved up"; "Reset arrangement" is unchanged (and restores the default step order via `defaultSlots`).
- Modified `EditorCanvas.tsx`: wrap `onChange` and add `onAction`: keep a ref `lastLegal` (the last doc accepted); in `onChange(next)` call `introducesIllegal(lastLegal, prepared(next), docKey, layout)` — when non-null, **do not** call `updateDoc` for this change and schedule the revert; otherwise update `lastLegal` and call `updateDoc`. The revert uses Puck's own API so history gets no extra entry: read `node_modules/@puckeditor/core` types (`onAction`, `dispatch`, `history`) first and use the call that restores `lastLegal.content` / `zones` and leaves the history stack as it was before the offending action (prefer `history.back()` semantics if the offending action pushed one entry; otherwise `dispatch({ type: 'setData', data: lastLegal })`); then `useEditorStore` toast (use the existing toast mechanism; find it with `grep -n "toast" web/src/builder/editor/*.ts*`) with the returned message, e.g. "Discount code can't go in Your details — no prices exist there yet." Only `insert` / `move` / `replace` actions are checked. `lastLegal` resets on mount / document change.
- Modified `EditorHeader.tsx`: extend `BLOCK_RULE_RE` so `part-home:*`, `part-order:*` read as block names and highlight their block; issue rows for `part-order:CheckoutFlow` show a **Reset step order** button and for `part-home:*`, `part-placement:*`, `slot-accepts:*`, `part-order:OrderStatus` a **Reset arrangement** button — both call `applyToBlock` on the issue's container (`blockId` of the container: for `part-home` / `part-placement` find the nearest container ancestor with `forEachComponent`; read how the header reaches Puck's `dispatch` (`useGetPuck`) and mount the buttons where that is available; if the issue list renders outside Puck, select the container instead and focus its panel's Reset button).
- Modified `route-bound.ts`: nothing unless a test shows `requiredPartsOn('checkout', layout)` / `('order-status', layout)` is wrong — it must return the seven / five required parts.

- [ ] **Step 1: Failing tests** `test/builder-editor-checkout-parts.test.ts` (+ component file): palette — doc `checkout` ⇒ one category "Checkout parts" offering only absent unique parts (`CheckoutProgress`, `CheckoutCoupon`, `CheckoutNotes` when absent; none of the five steps, none of the order-status parts), doc `order-status` ⇒ "Order status parts" (only `OrderStatusAddress` when absent); permissions per spec (steps `drag: false`; `CheckoutHeading` / `CheckoutSummary` / the five required order-status parts delete/duplicate false, drag allowed; coupon / notes / progress / address duplicate false); allow lists (`CheckoutFlow.steps` = the five step types only; `CheckoutContact.before` allows content and `CheckoutNotes`, not `CheckoutCoupon`; `CheckoutShipping.after` allows both; `CheckoutFlow.after` content only; `OrderStatus.action` allows content, Payment, Shipments, Items, Address, not Hero / Footer); `stepRows` — for the default order: Review has no enabled arrow; Contact ↓ enabled until adjacent to Review; Address ↓ disabled with "Delivery needs the address first" when Shipping is next; Payment ↑ disabled "Payment must come after Delivery"; every enabled move yields one of the four legal orders (property check over reachable orders: starting at each legal order, every `ok` move lands on a legal order and every `!ok` move on an illegal one); `moveStep` returns `null` for illegal; `withStepOrder` preserves ids, `before` / `after` contents and a styled step's `blockStyle`; `resetStepOrder`; `introducesIllegal` — an insert of a coupon into the Contact step ⇒ message containing "Discount code can't go in"; a `Columns` holding the coupon dropped in the Contact step ⇒ same; a legal move ⇒ `null`; an **already illegal** stored document (Payment before Shipping) edited by adding a `RichText` ⇒ `null` (no revert); the same document with a *further* illegal change ⇒ message; `withPartAdded` re-adds `CheckoutCoupon` into `CheckoutShipping.after` and `CheckoutNotes` into `CheckoutReview.after` (never directly into `steps`), re-adds `CheckoutProgress` into `lead`, ids `partId(stepId, type)`; opening a v0.7.0-shaped `{ type:'CheckoutFlow', props:{ id } }` through `loaded` (editor/page-set) shows full slots including the steps' `after` defaults; Reset arrangement returns the default tree and keeps `blockStyle`; panel notices appear / disappear with the part's presence; Parts list shows the five steps as Required rows; the Step order control renders five rows and disables per `stepRows`; issue labels for `part-order:CheckoutFlow` / `part-home:CheckoutCoupon` resolve to block names; quick fix buttons produce a document with no issues.
- [ ] **Step 2–4:** fail → implement → `npx vitest run test/builder-editor-*.test.ts*` green (all existing editor tests unedited), typecheck. Commit `feat(editor): checkout and order-status parts structure, step order, legality guard (stage 5 §10)`.

---

## Task 7: Editor canvas and previews — stacked checkout, signed-in preview, order-status fixtures

**Depends on:** Tasks 4, 5. **Wave 3.** Spec §10.3, §10.4 (aside / after notices are Task 6), §7.4.

**Files:**
- Modify: `web/src/features/checkout/{CheckoutPage.tsx,checkout-parts.tsx,CheckoutPage.module.css}`, `web/src/builder/family-checkout.ts` (one field), `web/src/builder/editor/{fixtures.ts,preview-states.ts,session.ts,fixture-mode.ts,EditorApp.tsx,ExactPreview.tsx,page-ground.tsx}`
- Create: `web/src/builder/editor/CheckoutNote.tsx`, `web/test/builder-editor-checkout-canvas.test.tsx`
- Do not touch: `EditorHeader.tsx`, `config.ts`, `derive-fields.ts`, `container-parts.ts`, `ContainerPanel.tsx`, `EditorCanvas.tsx` (T6), `OrderStatusPage.tsx` (T5 already reads `usePreviewFixture('OrderStatus')`).

**Interfaces:**
- `CheckoutData` gains `stack: boolean` (= `useBuilderMode().editing`, **only**). Nothing else in the container reads builder mode.
- Checkout canvas (`stack === true`): the container renders `s.steps()` inside the card **without** the active-step filter — each step view, when `data.stack`, renders `<StepFrame kind>…</StepFrame>` = `<div className={classes.card} data-sf-part="card"><header className={classes.cardHead}><span className={classes.cardCount}>{t('checkout.steps.count', { current: index + 1, total })}</span><h2 className={classes.cardTitle}>{t(STEP_META[kind].title)}</h2></header>{step content}</div>` (index from `data.order.indexOf(kind)`), so every step is visible, in the owner's order, and each step's `before` / `after` slots are droppable. After `s.steps()` the container renders one **inert copy** of the action band (`<div className={classes.nav} inert aria-hidden>` with the Back / Continue / Place order buttons, no handlers), then the terms line, then `s.after()`. The page alerts, the verifying notice and `GuestTurnstile` are not mounted on the canvas; the single card wrapper (`key`, ref) is replaced by a plain `div` in this mode. The **exact preview** (`editing: false`) is the real stepper; a test asserts the exact-preview render is DOM-identical to the shopper render.
- `session.ts` / `fixture-mode.ts` / `EditorApp.tsx` / `ExactPreview.tsx`: `export function effectivePreviewAs(docKey: DocKey, p: PreviewAs): PreviewAs` returning `{ session: 'signed-in', cart: 'items' }` for `docKey === 'checkout'` and `p` otherwise; used wherever `previewAs` feeds `applyPreviewAs`, the fixture interceptor getter, and the `BuilderMode` of the canvas and the exact preview (read `store.ts` for the open document's key). The Preview-as controls are unchanged.
- `CheckoutNote.tsx` (editor-only, mounted by `page-ground.tsx` on the `checkout` document above the canvas content): the text "Checkout previews signed in with a sample cart." (`role="note"`, `--sfb-*` styles, in `Editor.module.css` or its own module). The guest-only "Have an account? Sign in" line is not on the canvas (guest-only); the Contact step's hint lives in T6's panel.
- `fixtures.ts`: `export const FIXTURE_ORDER_STATES: Record<'shipped' | 'awaiting-payment' | 'hosted-open' | 'crypto-checking' | 'two-parcels' | 'cancelled', PublicOrder>` (Northbound Supply, `NB0977`, invented): `shipped` = `FIXTURE_PUBLIC_ORDER` unchanged; `awaiting-payment` = status `pending`, `payment: { canPay: true, payBy: <fixed ISO date>, activePayment: null }`; `hosted-open` = `canPay` with `activePayment: { kind: 'gateway', status: 'pending', checkoutUrl: 'https://shop.example/pay/NB0977', canChange: true, … }`; `crypto-checking` = `canPay` with `cryptoPayments: [{ …verificationStatus: 'checking', txidMasked: '1a2b3c…d4e5f6' }]`, `activePayment.kind 'crypto'`, `canChange: false`; `two-parcels` = shipped with a second shipment (`status: 'delivered'`); `cancelled` = status `cancelled`, `payment.canPay: false`. No real names, addresses or URLs outside `shop.example`.
- `preview-states.ts` (stage 4's file): add `OrderStatus` labels ("Shipped", "Awaiting payment", "Hosted checkout open", "Crypto sent, checking", "Two parcels", "Cancelled"); `previewFixturesFor(states)` returns `OrderStatus: FIXTURE_ORDER_STATES[states.OrderStatus ?? 'shipped']`; `containerOfDoc('order-status', layout)` returns `'OrderStatus'` so stage 4's generic **Preview state** select shows on the order page (deviation 3: the control keeps stage 4's name).

- [ ] **Step 1: Failing tests** `test/builder-editor-checkout-canvas.test.tsx`: editing mode renders five step cards stacked in the owner's order (Address first), each with its count ("Step 1 of 5" …) and title, `before` / `after` slot content inside each step, exactly one inert action band after the last card with `inert` and no click effect (`fireEvent.click` on its buttons does nothing; no Continue handler runs), terms line then `after` content after the band, no alerts / no Turnstile / no verifying text even with a pending guest quote, `stack` false for shoppers and for `editing: false` (exact preview identical to the golden-default DOM for step 1); `effectivePreviewAs('checkout', { session: 'signed-out', cart: 'empty' })` = signed-in / items and identity for other docs; `FIXTURE_ORDER_STATES` — six entries, every state's `reference` is `NB0977`, `awaiting-payment.payment.canPay` true and `payBy` set, `hosted-open` has a `checkoutUrl` on `shop.example`, `crypto-checking` has a masked txid, `cancelled.payment.canPay` false, no fixture contains a string outside the Northbound / `shop.example` vocabulary (regex over `JSON.stringify` for `@`, `http`≠`shop.example`); `previewFixturesFor` maps each id; selecting "Awaiting payment" makes `OrderStatusPage` render the method-picker card with `fetchPublicOrder` spied **not called**; read-only / version preview (`previewFixtures: null`) ⇒ `usePreviewFixture('OrderStatus')` null; `CheckoutNote` renders on the checkout document only.
- [ ] **Step 2–4:** fail → implement → editor + checkout tests green: `builder-checkout-parts.test.tsx`, `golden-stage5-checkout.test.tsx`, `builder-editor-*.test.ts*` (stage 4's preview-state tests unedited). Commit `feat(editor): stacked checkout canvas, signed-in preview, order-status fixtures (stage 5 §10.3)`.

---

## Task 8: Contract flip, `blocks.json`, docs, bundle gate

**Depends on:** Tasks 6, 7. **Wave 4.** Spec §12, §13 (contract / text), §15 (docs).

**Files:**
- Modify: `web/test/builder-parts-contract.test.tsx` (restore **equality**: registered parts = stage-3 list ∪ `STAGE4_PARTS` ∪ `STAGE5_PARTS` keys; add the stage-5 style / CSS-reach rows), `web/test/builder-editor-contract.test.ts` (`PART_BLOCKS` equality incl. stage-5), `web/test/builder-defaults-complete.test.ts` only if it enumerates containers, `web/public/blocks.json` (regenerated), `docs/builder.md`, `docs/templates.md`, `.superpowers/sdd/2026-10-01-checkout-parts-storefront/entry-baseline.txt` (append)
- Create: `web/test/builder-parts-stage5-contract.test.ts` (both containers' defaults pass their own rules in every layout; `part.family` and `style` vs `STAGE5_PARTS`; required parts carry no `hide`; `noHide` ⊇ required for both containers; part keys ≤ 16 chars; `PREVIEW_STATE_IDS.OrderStatus` is a registered container; no part block file imports from `@/features/` or `@/layouts/` or `@/builder/rules.ts` / `registry.ts` / `render.tsx` (grep over `web/src/builder/blocks/Checkout*.tsx`, `OrderStatus*.tsx`, `_shared/checkout-container.ts`, `_shared/order-status-container.ts`, `family-checkout.ts`, `family-order-status.ts`); the fixtures module is imported by no file outside `builder/editor/**`; every `text` pattern of both containers and all sixteen parts is a valid `TextKeyPattern`; every checkout / order key in the registry is covered by some block's `text`)

- [ ] **Step 1:** flip the two enumeration tests to equality and run them (green: all parts are registered now).
- [ ] **Step 2:** `UPDATE_BLOCKS_JSON=1 npx vitest run test/blocks-manifest.test.ts`; verify the diff is only the sixteen new blocks and the two containers' new `container` entries and `slots` (no `homes` / `order` / `noHide` / `contentOnly` keys emitted).
- [ ] **Step 3: Bundle gate.** `npm run build`; compare the entry chunk with the T1 baseline lines; append the new raw / gzip numbers and delta to the file. Inspect `dist/assets`: `CheckoutPage` and `OrderStatusPage` stay in their lazy chunks (grep the entry chunk for CSS-module class-name fragments unique to those views, e.g. `cardCount`, `disclosurePanel` — both must be absent); `checkout-parts` / `order-status-parts` are in those chunks, not the entry; `FIXTURE_ORDER_STATES` is in no shopper chunk. Growth beyond sixteen part-block shells, two container shells, `family-*.ts` and the `parts.ts` / `rules.ts` additions is BLOCKED.
- [ ] **Step 4: Docs.** `docs/builder.md` gains "Checkout and order status parts": the §4.1 tables (required / home / why), the four legal step orders and why, the effective-form rule (absent coupon / notes ⇒ ignored, saved values kept), the contract additions (`homes`, `order`, `noHide`, `contentOnly`, `part.defaultSlots`) in "Containers and parts", the stacked editor canvas, "Add a part: `STAGE5_PARTS`-style table". `docs/templates.md`: "Checkout steps and order cards can be reordered; don't rely on child order or `:first-child` inside the checkout card or the order page columns."
- [ ] **Step 5:** `npm run build` (builder-isolation check green); full `npx vitest run` ⇒ all green. Commit `chore(builder): stage-5 contract flip, blocks.json, docs, bundle record`.

---

## Task 9: End-to-end and full verification — Playwright owner

**Depends on:** Task 8. **Wave 5.** Spec §12, §13, overview "Gates per stage". The only task running Playwright.

**Files:**
- Create: `e2e/checkout-parts.spec.ts`
- Modify (append only): `e2e/page-sets.ts` (Northbound Supply arrangements: `arrangedCheckoutSet(layout)`, `illegalCheckoutSet(layout, kind)`, `noCouponCheckoutSet(layout)`, `arrangedOrderSet(layout)`, `illegalOrderSet(layout, kind)`), `e2e/builder-editor.spec.ts` (new cases; existing ones untouched), `e2e/mocks.ts` only to add (a) coupon `NORTH10` handling on the quote routes and recording of posted checkout bodies for assertions, (b) public-order variants selectable per test (awaiting payment with `payment.canPay`, shipped) — follow the existing `crypto-txid` recording pattern
- `e2e/dom-parity.spec.ts`, `e2e/templates*.spec.ts`, `e2e/telegram-webapp.spec.ts`, `e2e/storefront.spec.ts`, `e2e/flows.ts` and every snapshot: **unchanged** (no `--update-snapshots`). A `fillCheckout` variant taking the step order is defined inside `checkout-parts.spec.ts` (do not edit `flows.ts`).

- [ ] **Step 1: Write `checkout-parts.spec.ts`** (mocked backend; page sets installed through the existing page-set hook as `e2e/product-parts.spec.ts` does):
  - *Happy path, rearranged* (storefront, menu, webapp × 390 and 1280): order Address · Contact · Shipping · Payment · Review; coupon moved to the aside; notes moved to `CheckoutPayment.after`; a `RichText` ("Orders ship from Northbound within one working day") in `CheckoutShipping.before`; a `Heading` in `after`; `CheckoutProgress` hidden below 992 px (`blockStyle.hide: 'mobile'`). The shopper fills each step in that order, applies `NORTH10` in the aside, writes a note on the payment step, places the order: the posted body carries address, contact, shipping option, crypto combo, coupon and notes; the cart clears; the browser lands on the order page. Repeat once as a **guest** (Turnstile shim; one token per quote) and once inside the **Telegram stub** (MainButton Continue ×4 then Place order with the total; first-step band absent).
  - *Illegal / incomplete documents:* Payment before Shipping; Contact after Review; a coupon in the Contact step; a document missing `CheckoutSummary` — each renders the default checkout (heading, five-step stepper, Contact first) and logs once.
  - *Removed coupon + saved code:* `localStorage` holds a coupon code, the document has no `CheckoutCoupon`: neither the quote request nor the order body carries it; with the part present again, it does.
  - *Order page, rearranged* (`arrangedOrderSet`): Items moved into `action` after Payment, a `RichText` between them, Address removed — *awaiting payment*: the payment card is first, choosing a method posts the selection; *shipped*: the tracking card shows and no payment card; a document with Shipments before Payment renders the default; a hidden `Section` holding Payment renders the default; a pre-v0.7 order (no `payment`) renders without error.
  - *Overflow:* at 360 px no horizontal overflow on every case above, under every built-in template (loop the template ids as `templates.spec.ts` does).
- [ ] **Step 2: Append to `builder-editor.spec.ts`:** the checkout canvas shows five stacked step cards and one inert action band, and the note "Checkout previews signed in with a sample cart."; **Step order** moves Contact below Address and the posted change carries the new order; the ↓ on Payment is disabled (tooltip "Always last"/reason text); a step has no drag handle; dragging the coupon into the Contact step is refused (allow list) and a `Columns` holding the coupon dropped there is reverted with the toast; the Parts list re-adds Notes on the Review step and the Coupon on the Delivery step (never in `steps`); the order page's Preview state switches between *Awaiting payment* and *Shipped* (payment card appears / disappears); an already illegal stored document can still be edited (no revert) and its Reset step order quick fix clears the issue; opening a v0.7.0-shaped document and editing posts full slots (never `[]`).
- [ ] **Step 3: Full verification** (record each command and result in `.superpowers/sdd/2026-10-01-checkout-parts-storefront/progress.md`): `npm --prefix web run typecheck`; `npm --prefix web test` (all green); `npm --prefix web run build`; `npm run test:e2e` — `dom-parity.spec.ts` (`checkout` and `order-status` × 3 layouts), `templates.spec.ts`, `templates-baseline*.spec.ts`, `telegram-webapp.spec.ts`, `storefront.spec.ts` pass with **no** snapshot written (`git status` shows no change under `e2e/__baseline__` / `*-snapshots`); the rest of the suite unedited and green; the Task 8 bundle record repeated.
- [ ] **Step 4:** Commit `test(e2e): checkout and order-status parts; stage-5 verification`.

---

## Spec deviations (for the reviewer)

1. **Step components stay in `features/checkout/steps/*`** (they gain `before` / `after` / `rootAttrs` props) and `checkout-parts.tsx` / `order-status-parts.tsx` hold thin view adapters, instead of moving the components' bodies into the parts files (spec §3.1). Same DOM and chunk; smaller diff, fewer broken source-scan tests (`templates-parts.test.ts`, `motion-usage.test.ts`).
2. **`ContainerSpec.contentOnly` and `homeWhy`** are two additions beyond spec §3.2's three: §3.3's "content blocks only" needs a rule the stage-3 `foreignInside` (route blocks and containers only) does not express, and the toast text in §10.1 ("no prices exist there yet") needs a per-part reason.
3. **The order page's "Preview order" control is stage 4's generic Preview state select** (`EditorHeader.tsx` is owned by Task 6; renaming it would need a second owner in one wave). The six states and their fixtures are as §10.3; `shipped` is first so the editor opens on today's fixture. Fixtures reach the container through `usePreviewFixture('OrderStatus')` (stage 4's channel) rather than the fixture API; the fixture API still serves `NB0977` as `shipped` for the exact preview's network path.
4. **The "previews signed in" note sits above the checkout canvas** (`CheckoutNote`, mounted by `page-ground.tsx`) rather than in the header, for the same single-owner reason; copy is the spec's.
5. **`CheckoutPayment.text` adds `checkout.crypto.*`** (the combo picker's keys), omitted from spec §9's table.
6. **Wrap parts use `display: grid`** in the order columns, not the spec's `flex`: `.column` is a grid with `gap: 0.9rem` today, and the wrapper must match it.
7. **Rule errors for illegal step orders** use three messages (`STEP_ORDER_MESSAGE`): the spec's two plus one for Shipping before Address.

## Cross-plan contract assumptions

- Stage 4 has fully landed before this plan starts (tasks 12–15 included): `ContainerSpec.offers` / `nests` / `slotRejects`, `renderComponent`, `usePreviewState` / `usePreviewFixture` / `PREVIEW_STATE_IDS` in `mode.ts`, the editor's `preview-states.ts` (`previewFixturesFor`, `containerOfDoc`, labels), `blockMenu`'s one-category-per-family drawer, `route-bound.ts`'s `requiredPartsOn` using `allowedOn`, `EditorHeader`'s generic **Preview state** select, and the two enumeration contract tests in the equality form this plan relaxes in Task 2 and restores in Task 8.
- Stage 4 left `web/test/helpers/stage4-golden.tsx` exporting `mountAt`, `mountDoc`, `mountDefault` as documented in its plan; this plan imports them and does not edit that file or `stage4-parts.ts`.
- `PREVIEW_STATE_IDS` (stage 4 owns the object) gains the `OrderStatus` key here (Task 2); no other mechanism is added.
- No backend, admin, page-set, protocol or text-key change; `blocks.json` container entries keep their keys. Release as storefront v0.8.0 with the branch; nothing here requires a backend deploy.
