# Verification — 2026-08-24 (Task 30)

Full-repo gates plus a live smoke against the real dev backend/DB, run at the end of the
storefront build (spec 1). This is a verification pass only — no merge, no tag, no push.
Repos: `ecommerce-storefront` (main, was `d77e4a5`) and `ecommerce-backend`
(`feature/storefront-theme-guest-checkout`, `c959314`, unmerged).

## 1. Repo gates

### `ecommerce-storefront`

| Gate | Result |
|---|---|
| `npm run typecheck` | exit 0, no output (`web tsc -b --noEmit` + `worker tsc --noEmit`) |
| `npm test` | web: **35 files / 340 tests passed**; worker: **4 files / 41 tests passed** |
| `npm run test:e2e` | **20/20 passed** (27.5s, Playwright, mocked pass per Task 29) |
| `npm run build` | web `vite build` ✓ (pre-existing >500 kB `index-*.js` chunk warning, unrelated) + `worker tsc --noEmit -p worker` ✓ |

### `ecommerce-backend` (branch `feature/storefront-theme-guest-checkout`)

| Gate | Result |
|---|---|
| `npm run build` | `tsc`, exit 0, no output |

All gates green before any change was made in this task.

## 2. A real bug found by the live smoke, fixed

**`GET /healthz` on the Worker did not answer `ok`.** `worker/src/index.ts` defines the route
(`200`, body `ok`, `text/plain`, `no-store`) ahead of the `/api` dispatch, and
`worker/test/healthz.test.ts` passes — but that test calls `worker.fetch()` directly, which
never exercises the Cloudflare Workers-with-assets routing decision. Against a real
`wrangler dev` instance, `curl http://localhost:8787/healthz` returned **200 with the app's own
`index.html`** (asset `ETag`, `CF-Cache-Status: HIT`, no `ok` body) — `wrangler.jsonc`'s
`assets.run_worker_first` only listed `["/api/*", "/media/*"]`, and with
`not_found_handling: "single-page-application"`, any path with no static-asset match (like
`/healthz`) is answered by the SPA fallback **before the Worker's own `fetch()` handler ever
runs**, unless that path is in `run_worker_first`.

Fix: added `"/healthz"` to `run_worker_first`. Confirmed against a real running `wrangler dev`
instance, before/after:

```
# before
$ curl -i http://localhost:8787/healthz
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
ETag: "ef765959f9b103d602ba7af5497d3c88"
CF-Cache-Status: HIT
<!doctype html> ...

# after
$ curl -i http://localhost:8787/healthz
HTTP/1.1 200 OK
Content-Type: text/plain
Cache-Control: no-store
ok
```

A `cloudflare:test` `SELF.fetch()` regression test was tried and **does not reproduce the bug**
— `SELF` invokes the Worker's exported handler directly, same gap as the existing unit test, so
it passed under both the broken and fixed config. This class of bug (Worker vs. Assets routing
precedence) is only observable through the real dev/deployed request pipeline in this repo's
current tooling; no automated regression test accompanies the fix for that reason. Full repo
gates (`typecheck`, `test`, `build`) re-run clean after the change.

Commit: **`058765a`** — `fix(worker): route /healthz through the Worker instead of the SPA
fallback`, on top of `d77e4a5`.

## 3. Live smoke (backend `:3001` + Worker `:8787` + Vite `:5177`)

Backend: the already-running `:3001` dev server on `feature/storefront-theme-guest-checkout`
(not started by me, not stopped — confirmed serving the branch HEAD `c959314` by curling the
new `payment-options` route and getting a real `Order not found`, not a 404 route-miss).
Worker `wrangler dev --port 8787` with the repo's `.dev.vars` (`BACKEND_URL=http://localhost:3001/`).
Vite `:5177` (`5173`–`5176` occupied by other projects/sessions), proxying `/api` and `/media`
to `:8787` per `web/vite.config.ts`. All driven through the service layer via a throwaway,
snapshot-before-write script (`ecommerce-backend/scratch/sf-verify-live.ts`, deleted before
finishing) — never through the admin API (there isn't one yet; that's Spec 2).

Chosen live customer: **id 16, "Paul DW", 43 orders** (same customer Task 23 used). Chosen
live order for the `publicUrl` check: **`N2NUBR`** (Paul DW's newest, £245.00, "on its way",
Royal Mail by SendCloud).

| # | Check | Result |
|---|---|---|
| a | Theme colour paints the shell | `storefront_theme` written with a deliberately off-brand hot pink (`primary: #ff2d95`, dark navy-black `bg`/`surface`). Reloaded: category rail active state, every `ADD` button, the low-stock dot, and the account rail's active tab all render in `#ff2d95`. See `docs/verification/storefront-theme-catalog-desktop.png`. |
| b | Catalog renders real products | Same screenshot: **102 products**, real category tree with real counts (Amino Acids · 5, Weight Loss Pen · 8, Peptide Pens · 30 with real sub-categories…), real names/prices (`(UGL) Isotretinoin 10mg x 100` · £50.00, `5-amino-1mq 50mg Pen` · £65.00, `Anadrol 50mg` · £35.00 with a `LOW STOCK` flag). No mocks. |
| c | Flip `features.layout` to `menu`, reload → dense rows | `layout: menu` written via the script; **first reload still showed the storefront layout** — the Worker's edge cache on `storefront/settings` (30s TTL, `worker/src/proxy.ts`) served the stale cached response. A second reload ~25s later showed the correct dense menu layout: grouped-by-category rows, SKU under each name, `+` steppers, `LOW STOCK`/`OUT OF STOCK` flags, real prices (`L-carnitine 600mg/mL` LC500 £12.00, `Retatrutide 10mg Pen` RT10PEN £40.00…). See `docs/verification/menu-layout-dense-desktop.png`. **Not a bug** — the cache rule is deliberate — but worth flagging for Spec 2 (admin Appearance editor): an admin previewing a theme/layout change through the public site can see a stale response for up to 30s after saving. |
| d | Seed a session row + `sf-session-v1`, open `/account/orders` | A `storefront_sessions` row was created for customer 16 (real token, hashed per `hashToken()`); `localStorage['sf-session-v1']` seeded with `{state:{token,customer:{id:16,nickname:"Paul DW"}},version:0}` (the exact shape `web/src/stores/session.ts` persists). `/account/orders` rendered **43 real orders**, newest first, correct status pills (`ON ITS WAY`, `CANCELLED`, `ORDER RECEIVED`, `DELIVERED`), `BALANCE DUE` lines on two orders. See `docs/verification/account-orders-desktop.png`. |
| e | A real order's `publicUrl` → `/order/:ref/:key` | Access key computed read-only with the backend's own `generateOrderAccessKey()` (`src/modules/orders/access-key.ts`, HMAC-SHA256 of the reference with `ORDER_ACCESS_SECRET`, no DB write). `/order/N2NUBR/f30a23c386e7f29be951e836b44fc388` rendered the chromeless order page: real status timeline (`Received`✓ → `Confirmed`✓ → `Shipped`■ → `Delivered`○), real tracking number `MZ539621812GB` (Royal Mail by SendCloud, "Parcel en route"), real items (`Tirzepatide 60mg Pen` 3×£80.00 = £240.00), real totals (`SUBTOTAL £240.00`, `DELIVERY £5.00`, `TOTAL £245.00` — matches the orders-list row exactly), real delivery address. See `docs/verification/order-public-page-desktop.png`. |
| f | `GET /healthz` on the Worker → `ok` | After the fix in §2: `200`, `ok`, `text/plain`, `no-store`. |

Console: only the pre-existing, previously-documented noise on every page (`/media/products/*`
404s — no product in this DB has an image; `/media/settings/branding/logo` 502 — no logo
configured). No React warnings, no new errors, on any of the four pages checked.

**No order was placed, nothing was redeemed, no referral was submitted, no customer/order row
was written** — the customer and order used above were read-only lookups.

### Cleanup (verified)

| touched | before | after |
|---|---|---|
| `bot_settings.storefront_enabled` | `'false'` | `'false'` (restored, re-read via the public settings endpoint: `enabled: false`) |
| `bot_settings.storefront_features` | no row | row deleted |
| `bot_settings.storefront_theme` | no row | row deleted |
| `storefront_sessions` | 0 rows | 1 row created, hard-deleted — table verified **empty** afterward |

One process note for the record: the script's first `setup` run crashed mid-way on a wrong
import path (`createStorefrontSession`/`hashToken` live in
`src/modules/public-storefront/sessions.ts`, not `orders/access-key.ts`) — by that point it had
already written `storefront_enabled=true` plus the features/theme rows. This was caught
immediately: the *pre-task* baseline had already been captured separately via a `check`
sub-command (`storefront_enabled=false`, `storefront_guest_checkout_enabled=false`, no other
`storefront_*` rows, 0 sessions) before the crash, so the auto-snapshot file (which had been
polluted by the partial write) was hand-corrected back to that true baseline before `teardown`
ran. `teardown`'s own `matchesSnapshot` check reported `true` against the corrected baseline,
and the independent `check`/curl re-reads above confirm it.

`ecommerce-backend/scratch/` deleted before finishing; `git status --short` on
`ecommerce-backend` is empty. `ecommerce-storefront`'s `wrangler.jsonc` fix (§2) is committed;
otherwise only this doc and the four screenshots under `docs/verification/` are new.

### Servers

Worker (`wrangler dev --port 8787`) and Vite (`web`, `:5177`) were both started by this task and
both stopped — `wrangler dev` spawns nested `workerd` children that respawn if only the top
process is killed (same trap Task 14 hit); `taskkill /T /F` was needed against the actual root
`node` process (the wrangler CLI itself) before `workerd` stopped respawning. **Ports `8787` and
`5177` confirmed free afterward.** The pre-existing `:3000`, `:3001` (backend), `:5173`, `:5174`
servers were not started by this task and were not touched — same PIDs before and after.

## 4. Consolidated verification status (spec 1, tasks 1–30)

What has actually been exercised against the real backend/live DB/browser vs. what has only
ever been exercised through mocks, across the whole build — compiled from every task's report.

### Verified live (real backend, real DB, real browser)

- **Guest checkout** (Task 4): 17/17 assertions against the live DB and a real HTTP round trip,
  including a real call to Cloudflare's Turnstile siteverify endpoint (test secret).
- **Tracking backend endpoint** (Task 5): real `curl` round trip against the live dev server
  (`POST /public/storefront/tracking`, reference `ER21Z1`) — real response, then a real 404 for
  an unknown reference, then confirmed `503 STOREFRONT_DISABLED` after restore. The endpoint
  itself is live-verified; the **tracking page UI** that calls it (Task 26) was only ever
  checked against mocked routes (see below).
- **Shells, routing, theme, notices, cut-off bar, closed page** (Task 14): live theme
  (colours/fonts), notices, cut-off countdown, closed-page recovery all against the live
  backend/DB.
- **Cart** (Task 19): add/remove/checkout-target and the admin **Live Carts** data path
  (`listLiveCarts()`) confirmed live — a storefront cart shows up in Live Carts exactly as a bot
  cart does.
- **Checkout, session + guest** (Task 22): both paths walked to the Review step against the
  real backend with real quotes and real payment methods (Sushipp, OxaPay) — **stopped at
  Review, no order placed**, by design (this DB is live).
- **Account area** (Task 23): 43 real orders, order detail, profile, referral code all against
  live data for customer 16 ("Paul DW"). Loyalty ladder and referral-links mocked (see below —
  the live shop's ladder is empty and it has no configured chat links).
- **This pass** (Task 30): theme paint, catalog render, layout switch (storefront↔menu), account
  orders list, and a real order's public page — all against the live backend/DB (§3 above).
  Also found and fixed a real `/healthz` routing bug (§2).

### Mocked only (never checked against the live backend/DB through the browser)

- **WhatsApp login flow, browser pass** (Task 20): `login.whatsapp.available` is `false` on this
  dev backend (the wa-worker isn't paired), so the state machine was driven via `page.route`
  mocks of `storefront/auth/*`. The **Telegram widget** shown alongside it was genuine, unmocked
  — but it renders Telegram's real "Bot domain invalid" frame, because `localhost` isn't a
  registered bot domain.
- **Wholesale sheet's bulk-pricing/provenance/pre-order fields** (Tasks 16–18): this DB's
  products carry none of those fields, so one product's catalog response was routed with
  enriched fields for the screenshot; the rest of the catalogue and the sheet's own composition
  ran against the real backend.
- **Cart issue states** (`inactive`/`outOfStock`/`priceChanged`) (Task 19): the live cart had no
  flagged lines, so the screenshot used a crafted `ServerCart` response.
- **Loyalty redemption + referral chat links** (Task 23): the live shop's redeem ladder is
  empty and has no `brand.links` configured, so both were exercised via mocked responses —
  correctly, since a real redeem would move real balances and a real referral claim is
  permanent.
- **Crypto combo picker** (Task 22/24): this shop has no static-crypto gateway mapped, so a live
  quote never carries `cryptoOptions` — the picker was exercised by splicing combos into a real
  quote response.
- **Verify page** (Task 27): entirely mocked (`vi.mock`/`page.route`) — never checked against a
  live backend or a real printed-label code pair.
- **Tracking page UI** (Task 26): the Turnstile round trip itself was real (Cloudflare's
  always-pass test key against the live challenge endpoint), but the backend calls were mocked
  — no live-backend browser check was ever done for this page (the raw endpoint was, see above).
- **e2e suite** (Task 29): fully mocked by design (`page.route` for every `/api/**` call, a
  local Turnstile shim) — 20/20 green, but this is deliberately never run against the live
  backend.

### Never done live, at all

- **Real WhatsApp login end-to-end.** Needs a paired wa-worker; this dev environment has never
  had one paired. Every WhatsApp-login browser check across the whole build (Task 20 included)
  was route-mocked.
- **Telegram login widget against a registered domain.** Needs a `BotFather /setdomain`
  registration for the domain the app is served from; `localhost` has never been registered, so
  the widget has only ever been seen in its "Bot domain invalid" state.
- **Any real gateway checkout / order placement.** Deliberately never done — this DB is live
  with real customers. Every checkout walkthrough across the build (Tasks 4, 22, 29) stopped
  short of placing an order, or placed a scoped test order only inside the fully-mocked e2e
  suite.
- **A real static-crypto or manual/offline payment.** No live shop in this dev environment has a
  static-crypto gateway mapped or a manual gateway configured, so the crypto-txid card, the
  crypto combo picker, and the manual/offline payment card have only ever met mocked or spliced
  payloads (Tasks 22, 24).
- **A real loyalty redemption or referral-code claim.** Both are permanent, balance-moving
  actions against live customer data — never executed; both were exercised via mocks only
  (Task 23).
- **The new `payment-options` endpoint's full functional path** (backend commit `c959314`,
  latest on the branch). Confirmed **live and reachable** in this pass (§3 preamble — a bogus
  reference/key returns a real `Order not found`, proving the route is compiled and mounted),
  but never exercised end-to-end through the UI against a real order's actual payment options.

## 5. What this means for the merge decision

Both repos' gates are green. The live smoke covers the storefront's core rendering/data path
(theme, catalog, both layouts, account, public order page) against the real backend and found
one real, now-fixed bug (`/healthz` routing). Everything under "never done live" above is a
known, accepted gap for this environment (no paired wa-worker, no registered Telegram domain, no
live gateway/crypto config, and a deliberate no-live-orders rule) rather than something this
task could have closed — those are pending operational/config steps per client deployment, not
code defects. This is a verification report only; the merge/tag decision is the controller's,
per Task 30's brief.
