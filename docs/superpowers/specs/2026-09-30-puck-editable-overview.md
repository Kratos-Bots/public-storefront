# Everything editable — overview

Date: 2026-09-30. Status: approved in conversation; stage 1 has its own spec
([`2026-09-30-editable-text-design.md`](2026-09-30-editable-text-design.md)); stages 2–5 each get
their own spec before any of their code is written.
Repos: `ecommerce-storefront` (lead), `ecommerce-backend`, `ecommerce-admin-frontend`, branch
`feature/puck-editable` in all three. Builds on the page builder (v0.7.0,
[`2026-09-29-puck-page-builder-design.md`](2026-09-29-puck-page-builder-design.md), whose §13
amendments stay binding) and on [`../../builder.md`](../../builder.md).

## Goal

After v0.7.0 an owner can arrange blocks, but every word inside a functional block, every
colour and spacing choice inside a block, and the inner arrangement of the product, cart,
account and checkout flows are still fixed. This initiative makes all of it editable in the
same `/__builder` editor, without ever letting an edit break a purchase.

## The five stages

| # | Stage | Delivers | Needs |
|---|---|---|---|
| 1 | **Editable text everywhere** | A per-store *Site text* document (draft / publish / last-20 history) plus optional per-layout overrides in each page set; every shopper-visible string in the storefront moves behind a typed key with its current English as the built-in default; plural forms, `{placeholder}` interpolation; a store language + number/date format setting that drives `<html lang>` and every formatter; a Text panel and a "Text in this block" section in the editor; publish/diff/history for text in the admin. | — |
| 2 | **Per-block styling** | One shared, bounded `style` prop group on every block (spacing on the `SPACING` scale, background/text/border palette tokens, radius scale, width, alignment, hide on phone/desktop). Rendered as classes + `--sf-*` variables — never raw CSS, never hex. `inherit` everywhere by default, which adds no attribute and no wrapper. | 1 (the guard test for raw strings is already in force) |
| 3 | **Product surfaces as sub-blocks** | `ProductDetail`, the product card used by `ProductGrid`, `ProductList` rows and the list's detail sheet become containers with a slot whose default content is today's arrangement (gallery, title, price, bulk pricing, provenance, SKU, stock, quantity + add, upsells…). Owners reorder, remove optional parts, and style each. | 1, 2 |
| 4 | **Header, cart, account and simple order pages as sub-blocks** | `Header` (brand, search, nav, account, cart), `CartContents` / `CartSummary` internals, `AccountNav` and the five account bodies, `PaymentSuccess` / `PaymentCancel` / `OrderPlaced` / `VerifyForm` / `TrackingLookup` internals. | 1, 2; patterns from 3 |
| 5 | **Checkout and order status, reorderable with a locked safety order** | `CheckoutFlow` and `OrderStatus` sections become sub-blocks an owner may reorder and restyle, but the rules pin a safety order (e.g. contact → address → delivery → payment → review → place order; payment instructions before tracking) and required sections; a violation falls back to the default document, exactly like a missing route block today. | 1, 2, 4 |

Work is strictly sequential: stage *N + 1* starts only when stage *N* has passed its review and
every gate below is green on the branch. The branch merges once, as storefront release
**v0.8.0**, unless the user chooses to merge a finished stage earlier.

## Cross-stage rules (binding for every stage)

1. **Byte-identical defaults.** With no published page set and no published site text, every
   page's DOM is identical to v0.7.0. `e2e/dom-parity.spec.ts` stays green through every stage
   **without regenerating any snapshot**; a regeneration needs the user's explicit OK and a
   per-snapshot justification in the commit. The rest of the existing Vitest and Playwright
   suites (≈ 50 files assert English text) must also pass unedited.
2. **Every string goes through the stage-1 text layer.** No stage adds a raw shopper-visible
   literal: the text guard test (stage 1 §6.6) fails the build on JSX text or a
   text-bearing attribute outside the text registry. New sub-blocks reuse the keys the monolithic
   block used, so an owner's text edits survive the split, and list their keys for the editor's
   "Text in this block" section.
3. **Every split-out sub-block gets the stage-2 style props** — no stage 3–5 sub-block ships
   without them — and follows the block contract in `builder.md` (CSS modules, palette tokens,
   44 × 44 targets, no overflow at 360 px, `prefers-reduced-motion`).
4. **Old documents keep rendering.** A v0.7.0 document stores monolithic blocks with no
   sub-block slot. A monolithic block becomes a container whose new slot defaults to today's
   arrangement, so the guard's per-field default fill gives an old document the default slot
   content — no stored-document migration. Block names are never reused for a different
   meaning; a rename ships a guard migration (v0.7.0 §12).
5. **A broken edit never takes a flow down.** Required sub-blocks and ordering constraints are
   rules in `rules.ts`; any violation replaces the whole document with the route's default at
   render time and blocks Publish in the editor. Sub-blocks of a functional flow are placement-
   restricted to their parent's slot and read state from the parent through context, never from
   props an owner can edit.
6. **Shoppers never download the editor.** The builder-isolation build check stays on; text
   panel, style controls and sub-block fields live under `web/src/builder/editor/`.
7. **Deploy order: backend first**, then the storefront release (clients redeployed from the
   admin), then the admin SPA. Every contract change is additive: the backend accepts and
   serves old shapes, the editor protocol stays `protocol: 1` with optional fields, an old
   storefront ignores new response fields, a new storefront treats their absence as "nothing
   published".
8. **Public repo.** Fixtures, docs, screenshots and examples use "Northbound Supply" /
   `shop.example` only — no client names, real data, local paths or usernames.
9. **No live systems.** No stage touches a live database, S3 bucket, Telegram bot or
   Cloudflare account; live verification is a named pending manual step after deploy.
10. **Docs move with code.** `docs/builder.md` gains a section per stage (text layer, style
    props, sub-block tables, safety-order rules); `web/public/blocks.json` is regenerated
    whenever blocks change.

## Gates per stage

- Storefront: `npm --prefix web test`, `npm --prefix web run build` (includes the isolation
  check), the full Playwright suite including `dom-parity.spec.ts` and the templates matrix.
- Backend: `npm test` (not only `tsc --noEmit`, which skips test files) and `npm run build`;
  a Drizzle migration generated with `npm run db:generate` for any schema change.
- Admin: `npm run build`; `npm run lint` compared against the pre-branch baseline (it already
  fails on main — a regression gate, not a clean-run target); a mocked Playwright pass of the
  Pages tab.

## Non-goals (whole initiative)

Owner-authored HTML, scripts or arbitrary CSS; a shopper-facing language switcher (stage 1 is
only *ready* for one); translating backend-sent messages, bot texts or emails; A/B tests;
scheduled publishing; editing data names (products, categories, payment and shipping methods)
from the builder — those stay in their own admin screens.
