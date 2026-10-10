# ecommerce-storefront

A per-client storefront: a thin Cloudflare Worker + a React/Vite SPA, both driven entirely by
runtime config fetched from the backend. The built bundle is byte-identical for every client —
colours, fonts, layout, logo, feature flags and links all come from the backend's
`storefront_*` settings, so nothing here needs a rebuild to re-skin a client.

This is Spec 1 of a three-spec initiative; see
[`docs/superpowers/specs/2026-08-23-ecommerce-storefront-design.md`](docs/superpowers/specs/2026-08-23-ecommerce-storefront-design.md)
for the full design (Spec 2 is the admin Appearance editor, Spec 3 is deploy-from-admin — neither
exists yet). The backend contract this repo consumes is documented in `ecommerce-backend`'s
`STOREFRONT.md`.

Ships in this spec: catalog / cart / checkout, WhatsApp + Telegram passwordless login and account
(orders, loyalty, referrals, profile), payment redirect pages (the old `/order/:ref/:key` link redirects to the account order page), and product
verification + parcel tracking pages.

## Prerequisites — settings to configure in the admin first

Nothing renders usefully until the backend is configured. All of the following are backend admin
settings (Storefront page in the admin SPA), not anything in this repo:

| Setting | What it does |
|---|---|
| `storefront_enabled` | Master switch. While `false` (the default), every `/public/storefront/*` route the SPA depends on 503s and the site shows the closed gate. |
| `storefront_features` / `storefront_theme` / `storefront_brand` | Feature flags, colours/fonts/layout, and logo/title/description. Editable in the admin under Storefront → Appearance / Features (Spec 2); also settable via `PUT /api/v1/storefront-settings`. |
| `storefront_turnstile_site_key` / `storefront_turnstile_secret` | Cloudflare Turnstile keys. Required for guest checkout and for the parcel-tracking page (both are Turnstile-gated backend calls). |
| `storefront_guest_checkout_enabled` | Must be `true` **and** `features.guestCheckout` must be `true` for the session-less checkout path to appear — the two are independent gates. |
| Shop access (`access` in the settings) | Who may use the shop: public (the default), sign-in required, or only customers the owner has allowed; whether new accounts may be opened; and the message and contact buttons shown to someone who is turned away. Needs a backend with shop access; an older backend reports none of it and the shop stays open, as before. |
| `storefront_tracking_api_url` / `storefront_tracking_api_key` | China Tracking API credentials. Until both are set, the tracking page runs in degraded mode (`tracking: null` for every parcel). |

Plus one Telegram- and one order-link prerequisite, both outside `storefront-settings`:

- **BotFather `/setdomain`** — message `@BotFather`, run `/setdomain`, pick the storefront's bot,
  and enter this site's exact origin (e.g. `https://shop.example.com`). The Telegram Login Widget
  refuses to render on an unregistered domain.
- **`ORDER_PUBLIC_BASE_URL`** (a backend env var, alongside `ORDER_ACCESS_SECRET`) must point at
  *this* site, not `ecommerce-order`, once a client is running the storefront — it's what the
  backend uses to build the `publicUrl` on order records and in notification links.

## Referrals on the web

Browser and desktop only; the Telegram Mini App keeps using the bot's own referral deep link.

- **The link.** Account → Referrals shows `https://<shop>/ref/CODE` next to the code, with a copy
  button, and the share text (native share, WhatsApp, Telegram) carries it. The hash form
  `https://<shop>/#/ref/CODE` is also accepted on arrival.
- **Arrival.** `captureReferralFromLocation()` runs at boot, before the first render and before any
  access redirect, so a private shop that sends the visitor to sign-in has already kept the code. The
  top-level `/ref/:code` route (outside the access boundary) does the same and redirects to `/`.
  A matching hash is stripped from the address bar; any other hash is left alone.
- **Memory.** The code is kept in `localStorage` (`sf-referral-v1`) for 14 days. A newer valid link
  replaces it and restarts the 14 days (last link wins). Codes are trimmed, a leading `ref_` is
  dropped, and they are uppercased; only `A-Z0-9`, 4 to 32 characters, is accepted. Storage errors
  are swallowed.
- **Checkout.** Signed-out shoppers with no remembered link see an optional "Referral code" field
  under the coupon field (no Apply key, no validation). The order body carries `referralCode`: the
  remembered code if there is one, otherwise the typed one. Quotes never carry it. Signed-in
  shoppers never see the field but a remembered code is still sent. After a successful order the
  remembered code is cleared.
- **One referrer only.** The backend applies the code after the order is placed and silently
  ignores it if it is unknown, the shopper's own, or the customer already has a referrer.
- **Site text.** The field's wording is `checkout.referral.*`; the link row is
  `account.referrals.yourLink` / `copyLinkAria`. The share wording (`account.referrals.shareText`)
  is unchanged: the link is appended on its own line, so owner-edited wording keeps working.

## Warehouse selection

Lets a shopper choose which warehouse their order ships from. There are no
per-warehouse shipping rules yet; a warehouse decides which products are on offer, the stock shown and the prices.

- **Switching it on.** The admin sets `features.warehouseSelect` and, per warehouse, marks it
  customer-selectable (the default warehouse is always offered). With the flag off, or fewer than
  two warehouses on offer, the storefront behaves - and sends requests - exactly as it did before.
  Deploy order: backend, then admin, then storefront (an older backend ignores everything here).
- **What the shopper sees.** A slim "Shipping from" strip under the header (all three layouts, light
  and dark, every template). Choosing one keeps them on the page and refetches the catalogue, the
  product and, for a signed-in shopper, the cart. The choice is remembered (`sf-warehouse-v1`). It is
  hidden on `/checkout`, `/order-placed` and `/payment/*`: the choice is made while browsing, checkout
  still sends it, and the review step shows "Shipping from <name>" when it is not the default.
- **Hidden when not carried.** A non-default warehouse lists only the products it stocks. A product
  page it does not carry is the ordinary not-found view plus a line and a button to switch back to the
  shop's own warehouse. A basket line it cannot supply is never removed: a signed-in cart comes back
  from the backend flagged `inactive`, and a guest basket line missing from the warehouse's catalogue is
  flagged the same way here. Either shows "No longer available" and blocks checkout. Upsells that
  point at hidden products are dropped, as for a deleted product.
- **How it is sent.** `?warehouse=<id>` on the catalogue and product reads and on cart GET/PUT;
  `warehouseId` in the four quote and checkout bodies. It must be a query parameter, never a header
  or cookie: the Worker edge-caches the anonymous catalogue keyed on the full URL (query included), so
  each warehouse gets its own entry and shoppers never see each other's. Nothing is sent unless a
  non-default warehouse is chosen, which keeps every URL, query key and cache key unchanged for shops
  without the feature. The list (`GET storefront/warehouses`) is only asked for when the flag is on and,
  in a private shop, the shopper is signed in.
- **Prices follow the warehouse.** The backend serves each warehouse's own `price` and `pricingTiers`
  on the catalogue and product reads, and prices a signed-in cart and the quote at the warehouse sent.
  A guest basket stores its prices on the device, so `WarehouseSync` re-prices every line from the
  selected warehouse's catalogue (the same query the pages use) whenever it arrives or changes, on first
  load too: base price, tiers and the unit price for the line's quantity. A line the catalogue does not
  list is left as it is, and nothing is written when no price differs. A guest with lines on a
  feature-on shop reads the catalogue even on pages that would not, such as the cart.
- **While the list loads.** A returning shopper's stored warehouse is used straight away (the flag is
  on, and the backend falls back to the default for an id it does not offer), so the catalogue is
  fetched once. Only if the list then shows the id is stale, or there is no real choice, is it fetched
  again without the parameter, and a stale id is forgotten.
- **Pick-first prompt.** With `features.warehousePrompt` on (and `features.warehouseSelect` on, with
  two or more warehouses listed) a "choose a warehouse" screen comes before the shop. Nothing is
  pre-selected; a warehouse remembered from an earlier visit is tagged as the last choice. It is asked
  once per visit: the marker is sessionStorage `sf-warehouse-visit-v1`, separate from the remembered
  warehouse (`sf-warehouse-v1`, localStorage), and when sessionStorage is unavailable the answer is
  held in memory for the page. Choosing from the header's "Shipping from" select counts as having
  chosen. It appears only on catalogue routes (`/`, `/c/:slug`, `/p/:id`, `/cart`, `/pages/:slug`),
  never on checkout, payment, order-placed, account, sign-in, tracking, verify, referral links or the
  Telegram callback, and the page builder bypasses it. It fails open: if the list fails to load or has
  fewer than two entries the shop is shown as normal.
- **Ordering paused.** Each entry of `GET storefront/warehouses` carries `orderingEnabled` and
  `orderingMessage`. When the warehouse in force has `orderingEnabled: false` the shop is browse-only:
  add-to-basket and checkout controls are not offered, a notice shows the owner's message (or a default
  line), the basket stays readable and editable, and `/checkout` redirects to `/cart`. If the backend
  refuses a quote or an order with `503 WAREHOUSE_ORDERING_PAUSED` (the switch was flipped mid-session),
  the storefront refetches the list and shows the same notice; the sentinel text is never shown. Note
  the lag: the Worker caches `storefront/warehouses` for anonymous shoppers for 30 seconds
  (`worker/src/proxy.ts`), so after such a refusal the refetched list can still say "open" for up to
  that long. In that window the shopper sees the notice from the refused call and the redirect follows
  once the list catches up. The mocked browser tests flip instantly and do not exercise this.
- **Hidden products.** No storefront logic: the backend omits them from the catalogue, answers 404 on
  the product page, and returns a hidden basket line flagged `inactive`.
- **Where it lives.** `web/src/features/warehouses/` (store, `WarehouseSync` mounted above the router,
  the strip, the not-carried helper); the strip is drawn by the shared header bar. Wording is
  `shell.warehouse.*` site text. The page builder's editor does not use it.

## Local development

Three terminals:

```bash
# 1. backend — cd ecommerce-backend && npm run dev            (:3000, or PORT=3001 if 3000's taken)
# 2. worker  — cd ecommerce-storefront && npm run dev          (:8787, BACKEND_URL from .dev.vars)
# 3. spa     — cd ecommerce-storefront && npm run dev:web      (:5173, proxies /api + /media → :8787)
```

Install is two steps — this is not a monorepo with workspaces, `web/` has its own lockfile:

```bash
npm install        # root (worker + tooling deps)
npm run install:web  # web/ (SPA deps)
```

Copy `.dev.vars.example` to `.dev.vars` and point `BACKEND_URL` at your backend (defaults to
`http://localhost:3000/`; if you're running the backend on a different port locally, e.g. because
3000 is already in use, update it to match). Then in the admin (against that same backend), turn on
`storefront_enabled` and optionally set `features`/`theme` via `PUT /api/v1/storefront-settings` —
see Prerequisites above.

Open `http://localhost:5173` — the SPA dev server, not the Worker's `:8787`. Vite proxies `/api/*`
and `/media/*` through to the Worker, which proxies them on to the backend.

## Tests, typecheck, build

```bash
npm test            # web (vitest) + worker (vitest, @cloudflare/vitest-pool-workers)
npm run test:web     # web only
npm run test:worker  # worker only
npm run typecheck    # tsc -b in web, tsc --noEmit in worker
npm run build         # web: tsc -b && vite build, then worker: tsc --noEmit
npm run test:e2e      # Playwright, fully mocked (see below)
```

### Mocked end-to-end pass (`e2e/`)

`npm run test:e2e` starts its own Vite on `:5199` and drives the real app with **every** `/api/*`,
`/media/*` and Cloudflare-challenge request answered by `page.route` (`e2e/mocks.ts`, fixtures in
`e2e/fixtures/`). No Worker, no backend, no network — safe to run against nothing. First run needs
`npx playwright install chromium`.

Both layouts (`storefront`, `menu`) at 390×844 and 1280×800, plus guest checkout, WhatsApp sign-in,
the kill switch, tracking/verify and the first-paint theme bootstrap. Screenshots land in
`e2e/screenshots/` (gitignored); `node e2e/contact-sheet.mjs` montages them into
[`docs/screenshots/e2e-contact-sheet.png`](docs/screenshots/e2e-contact-sheet.png), which is
committed as the record of what the pass rendered.

## Templates

The storefront's look is a **template** (`web/src/templates/<id>/`) chosen per client in the
admin (Storefront → Appearance): `modern` (default), `dark-luxury`, `cyber-brutalism` and `bento`, plus any imported template.
The full contract — manifest, tokens, parts, slots, hooks, mobile rules, git imports — is in
[`docs/templates.md`](docs/templates.md).

    npm run template:new -- <id>   # scaffold a built-in template
    npm run templates:fetch        # vendor the repos pinned in templates.lock.json (runs before dev/build)

The build emits `web/dist/templates.json`, which the backend captures on deploy so the admin
knows which templates this release contains.

## Page builder

Every page of every layout is a page-builder document rendered by the storefront's own
renderer (`web/src/builder/`). Owners compose pages in Admin → Storefront → Pages; with nothing
published, the built-in default documents reproduce the pre-builder storefront exactly. Block
contract, rules, default documents and the editor protocol: [`docs/builder.md`](docs/builder.md).
The build emits `web/dist/blocks.json`, the list of blocks this release can render.

## What the Worker does — and does not do

`worker/src/index.ts` is deliberately thin. In order, it handles:

- **`GET /healthz`** — `200 ok`, `text/plain`, `Cache-Control: no-store`. No backend round-trip;
  it only proves the Worker itself is up. Used as the post-deploy check by Spec 3's deploy pipeline.
- **`/api/*`** — reverse-proxies to `${BACKEND_URL}api/v1/public/<rest>`, allowlisted to the
  `storefront/`, `catalog` and `verify/` prefixes (everything else 404s as
  `{ success:false, error:"Not found" }`). Forwards method, body, `Content-Type`, `Authorization`,
  `Accept`; strips `Cookie`/`Host`/`X-Real-Ip` and any inbound `X-Forwarded-*`/`Cf-*`, then sets its
  own `X-Forwarded-For` (from `Cf-Connecting-Ip`) and `X-Forwarded-Proto: https`. GET responses are
  edge-cached via the Cache API when the request is unauthenticated: `storefront/settings`,
  `storefront/warehouses` and `storefront/pages/:layout` for 30s, `catalog` and
  `catalog/products/:id` for 60s; everything else bypasses the cache. Only a `200` is ever stored
  (a private shop's `401` on the warehouse list is not), the rules match the path alone, and the
  cache key is the full backend URL, so `catalog?warehouse=2` is its own entry.
- **`/media/*`** — a second, narrower proxy for public images (product photos, storefront/settings
  branding, page-builder uploads under `/media/storefront-pages/media/<key>`) with a 1-day edge
  cache and `Set-Cookie` stripped. Product lab-report files (`/media/coas/<id>/<32 hex>`) are the one
  exception: passed straight through with the backend's `private, max-age=300`, never edge-cached.
- Everything else falls through to `env.ASSETS.fetch(request)` — the SPA's static build, served
  with single-page-application fallback.

It does **not**: run any checkout, payment, or cart business logic (that's all backend-side);
sanitise or validate request bodies beyond the path allowlist; hold any secret (`BACKEND_URL` is
its only binding, and it's not sensitive); or reach `/public/wholesale/*` — that surface is the
Telegram WebApp's JWT-keyed catalog, not this proxy's concern.

## Releases

- v0.12.0 — Private shops. When the backend reports a shop-access mode, a shop can require a sign-in (login required) or admit only customers the owner has allowed (allowed customers only). A signed-out visitor to a private shop is sent once to `/login?returnTo=…` (the page they asked for is kept and reopened after sign-in) and the anonymous catalogue is never requested; `/login` and `/reset-password` render in a bare frame without the shop header, footer or cart. A signed-in customer who is not allowed sees a lockout screen with the owner's message and contact buttons (only `https://` links are shown), a link to their orders, "Check again" (it asks the backend whether access has been granted and lets them in without signing out) and "Sign out"; their account pages stay reachable. When registration is closed the sign-in page drops sign-up and says so, guest checkout is off, and a Mini App sign-in refused for closed registration shows the lockout screen in a private shop (a public shop stays browsable). The backend's `LOGIN_REQUIRED`, `ACCESS_DENIED` and `REGISTRATION_CLOSED` errors are shown as plain sentences on every sign-in path and in the cart; all the new wording is editable Site text under `auth.access.*` and `errors.*`. Needs the backend with shop access deployed first; a backend without it behaves exactly as v0.11.0. Nothing has been verified against a deployed client yet; the end-to-end suite covers it against mocks only.
- v0.11.0 — Email/phone and password sign-in. When the store's backend has password sign-in switched on (off by default; the storefront shows the card only when it reports `login.password.available`), the sign-in page gains an email-or-phone card to sign in, create an account or reset a forgotten password, and Account → Profile gains a Password section (set or change the password, see which email or phone signs in, ask for a verification email). Two new pages, `/reset-password` and `/verify-email`, are page-builder documents (blocks `ResetPassword` and `VerifyEmail`, and the optional Profile part `ProfilePassword`; a hand-arranged Profile page adds it with "Add block"). Reset by email is offered only when the backend reports `login.password.resetByEmail` (no mailer exists yet, so today it is not); reset by WhatsApp opens WhatsApp with the message `RESET PASSWORD` and the shop's bot replies with a link. A wrong current password in Account is shown on the field and never signs the shopper out; `/verify-email` needs a signed-in session and returns to the link after sign-in. Known limits: the phone country select is clipped to its fixed width (shared with checkout), and a Telegram-only customer who forgets their password needs a staff-generated link. Deploy the backend first, then the admin SPA, then redeploy each client with this release; do not switch password sign-in on for a store until its storefront has been redeployed (the previous release shows a "coming soon" card when it sees the flag). Nothing has been verified against a deployed client yet.
- v0.7.0 — Page builder. In Admin → Storefront → Pages, owners get a per-layout page builder: every page (catalogue, product, cart, checkout, sign-in, account, order status, payment pages, tracking, verification) in every layout is a page document the store can recompose — reorder and hide sections, add headings, text, images, buttons, columns, sections, FAQs, testimonials, videos and featured products, restyle the footer as columns, and add custom pages at `/pages/<slug>` linked from the header — with draft/publish and a 20-version history, all in the store's own template. Checkout, cart, sign-in and account flows are self-contained blocks that cannot be broken by an edit: a page that fails its rules falls back to the built-in version. A store that never publishes looks and behaves exactly as v0.6.0. Deploy the backend first (migration 0045 applies on start; it stores and serves page sets), then this storefront release (redeploy each client from the admin), then the admin SPA. Nothing has been verified against a deployed client yet.
- v0.6.0 — More display options in Admin → Storefront → Appearance → Template options, on every template: hide product codes (SKUs); hide the category picker; show the header account and cart icons on phones and desktop, one only, or neither (in the web app the cart button at the foot already opens the cart); turn the dispatch cut-off banner off, reword it (`{time}` and `{dispatch}` fill in) or drop its countdown. Notices (Admin → Storefront → Selling → Notices) can be pinned so they stay at the top of the screen while shoppers scroll, and can be made non-dismissible. Everything defaults to how the store looks today. Deploy the backend first (it stores the two new notice fields), then the admin SPA, then redeploy each client from the admin so its template catalog picks up the new options.
- v0.5.2 — Telegram Mini App cart fixes: products added from the list's `+`/stepper now reach the shopper's cart (they used to vanish on opening the cart, and never reached admin Live Carts); in wholesale mode the web app shows the same View cart / Checkout button as everywhere else in place of the trade list's own basket bar, so checkout is reachable again. No backend or admin change; redeploy each client from the admin.
- v0.5.1 — The trade list (wholesale) row is designed phone-first: the name shares the top line with the quantity picker, the code, unit price and Bulk chip sit in a quiet line under it, and stock status, pre-order and minimum quantity get a line of their own only when there is something to say. New hide toggles in Admin → Storefront → Appearance → Template options: every template (imported ones too) can hide the page title, the catalogue intro and the section labels; bento and dark-luxury can hide their footer, cyber-brutalism its footer and button arrow. Everything defaults to shown. No backend or admin change; redeploy each client from the admin so its template catalog picks up the new options.
- v0.5.0 — Telegram Mini App: opened from the bot, the storefront signs the shopper in from Telegram and uses the new `webapp` layout — the store's own template in a phone-first shell with Telegram's MainButton/BackButton, chrome painted in the store's colours, payment pages opened in the browser. `webapp` is also a layout choice for browsers (Admin → Storefront → Features). Needs the backend with the `shop_webapp_mode` bot setting and `/auth/telegram-webapp` deployed first, then the admin SPA.
- v0.4.3 — `bento` redesigned phone-first: on a phone the shop board is the tagline plus one short strip (products, categories, open), so the first product is in the first screen; the footer is a single cell; quick-add labels are readable; the featured tile has no dead space on tablets and desktops. No backend change; redeploy each client on `bento` from the admin.
- v0.4.2 — new built-in template `bento`: the catalogue opens on a shop board of real store facts (product count, categories, ordering status, next dispatch cut-off, chat links) and the first product gets a large tile; the accent follows what the store sells — Tech & electronics (default), Fashion & apparel, Beauty & wellness, Home & lifestyle, Food & grocery, Monochrome — each in dark and light. No backend change; redeploy each client from the admin so its template catalog picks up `bento`. Existing stores keep their current template.
- v0.4.1 — storefront templates (v0.4.0 was never published; v0.4.1 adds the dark-luxury menu sheet-title fix): `modern` (the existing look, unchanged), `dark-luxury` (Gold / Silver / Emerald / Crimson) and `cyber-brutalism` (Acid Dark / Purple Light), chosen and customised in Admin → Storefront → Appearance with a live preview; each release ships `templates.json`, and templates can be imported at build time from git repos pinned in `templates.lock.json` (see [`docs/templates.md`](docs/templates.md)). Needs the backend with the template catalog endpoint deployed first; redeploy each client from the admin so its template catalog is captured, then deploy the admin SPA. Existing stores stay on `modern`.
- v0.3.0 — logged-in shoppers get their customer group's catalog and prices (falls back to the public catalog on a backend without that route); order quantity limits shown in the cart and enforced before checkout; a UK bank transfer on a non-GBP store shows the GBP "Amount to send" (needs backend ≥ migration `0042`, deployed first).
- v0.2.0 — design language: Inter, gradient chassis, sharp corners by default (needs backend ≥ the commit that accepts radius `none`), entrance motion, image-less catalogue list.
  Stores that saved a theme before v0.2.0 keep their corner radius — set Admin → Storefront → Appearance → Corner radius → **None** once to get the sharp look; new stores default to it.

## Deploying

The supported path (once Spec 3 ships) is **deploy from the admin**: a store owner connects their Cloudflare account
on the admin's Storefront → Deploy tab, picks a hostname on one of their zones, and deploys any
published release listed there. The backend downloads the release zip, uploads the Worker and its
assets to their account, attaches the custom domain and health-checks `/healthz`. Nothing in this
repo runs during that deploy — it only consumes the release artifact described below.

Manual deploy (maintainers only, e.g. for a preview account):

```bash
npm run deploy   # npm run build && wrangler deploy
```

`wrangler.jsonc` has no route/custom domain committed; add a `routes` entry to a local copy (or pass
`--route`) first. **Deploy order matters**: the Worker has zero functionality without the backend's
storefront surface already live and configured (see Prerequisites above).

### Telegram Mini App

The same deployment is the bot's Mini App — nothing extra to build. To switch a store on:

1. Deploy in order: **backend → admin SPA → storefront** (the storefront reads
   `telegramWebApp` from settings and posts to `/public/storefront/auth/telegram-webapp`;
   an older backend 404s that route and shoppers inside Telegram see the sign-in error card).
2. BotFather: `/setdomain` → the storefront hostname (the web Login Widget needs this too).
   Optionally `/newapp` for a `t.me/<bot>/<app>` link; the menu button is set by the backend.
3. Admin → Bot Settings → **Shop in web app (BETA)** → Beta. The bot then shows only a welcome
   (Open shop / Contact / Use classic bot) and notifications.

Inside Telegram the storefront always uses the `webapp` layout and signs the shopper in from
`initData`; choosing **Web app** in Admin → Storefront → Features makes browsers use it too.
Reviews, FAQ and Giveaways are not in the storefront yet — prefer Beta over Forced until they are.

## Release process

Pushing a tag matching `v*` runs `.github/workflows/release.yml`:

1. `npm ci` (root, then `web/`) → `npm test` → `npm run build`
2. `npx wrangler deploy --dry-run --outdir=worker/dist` — bundles the Worker to `worker/dist/index.js`
   without deploying
3. `node scripts/write-release-manifest.mjs <tag>` — writes `release.json` from `wrangler.jsonc`
   (`schemaVersion`, `tag`, worker `name` / `compatibilityDate` / `compatibilityFlags`, assets
   `binding` / `notFoundHandling` / `runWorkerFirst`, and the list of `vars` the deployer must
   supply — currently `BACKEND_URL`)
4. zips `release.json`, `worker/dist/index.js`, `web/dist/**` as `storefront-<tag>.zip`
5. `gh release create <tag> --generate-notes` attaches it to a GitHub Release — a pre-release tag
   (e.g. `v1.2.3-rc.1`) is published as a GitHub pre-release, and re-running the workflow on an
   already-tagged release replaces the zip asset instead of failing

To cut a release:

```bash
npm version minor            # or patch — bumps package.json, commits, tags v0.x.0
git push origin main --follow-tags
```

Once Spec 3 ships, the backend's Storefront → Deploy tab lists these releases within five minutes
and shows an "Update available" badge on stores running an older tag.
