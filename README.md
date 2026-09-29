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
(orders, loyalty, referrals, profile), order status + payment redirect pages, and product
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
| `storefront_tracking_api_url` / `storefront_tracking_api_key` | China Tracking API credentials. Until both are set, the tracking page runs in degraded mode (`tracking: null` for every parcel). |

Plus one Telegram- and one order-link prerequisite, both outside `storefront-settings`:

- **BotFather `/setdomain`** — message `@BotFather`, run `/setdomain`, pick the storefront's bot,
  and enter this site's exact origin (e.g. `https://shop.example.com`). The Telegram Login Widget
  refuses to render on an unregistered domain.
- **`ORDER_PUBLIC_BASE_URL`** (a backend env var, alongside `ORDER_ACCESS_SECRET`) must point at
  *this* site, not `ecommerce-order`, once a client is running the storefront — it's what the
  backend uses to build the `publicUrl` on order records and in notification links.

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

## What the Worker does — and does not do

`worker/src/index.ts` is deliberately thin. In order, it handles:

- **`GET /healthz`** — `200 ok`, `text/plain`, `Cache-Control: no-store`. No backend round-trip;
  it only proves the Worker itself is up. Used as the post-deploy check by Spec 3's deploy pipeline.
- **`/api/*`** — reverse-proxies to `${BACKEND_URL}api/v1/public/<rest>`, allowlisted to the
  `storefront/`, `catalog`, `orders/` and `verify/` prefixes (everything else 404s as
  `{ success:false, error:"Not found" }`). Forwards method, body, `Content-Type`, `Authorization`,
  `Accept`; strips `Cookie`/`Host`/`X-Real-Ip` and any inbound `X-Forwarded-*`/`Cf-*`, then sets its
  own `X-Forwarded-For` (from `Cf-Connecting-Ip`) and `X-Forwarded-Proto: https`. GET responses are
  edge-cached via the Cache API when the request is unauthenticated: `storefront/settings` for 30s,
  `catalog` and `catalog/products/:id` for 60s; everything else bypasses the cache.
- **`/media/*`** — a second, narrower proxy for public images (product photos, storefront/settings
  branding) with a 1-day edge cache and `Set-Cookie` stripped.
- Everything else falls through to `env.ASSETS.fetch(request)` — the SPA's static build, served
  with single-page-application fallback.

It does **not**: run any checkout, payment, or cart business logic (that's all backend-side);
sanitise or validate request bodies beyond the path allowlist; hold any secret (`BACKEND_URL` is
its only binding, and it's not sensitive); or reach `/public/wholesale/*` — that surface is the
Telegram WebApp's JWT-keyed catalog, not this proxy's concern.

## Releases

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
