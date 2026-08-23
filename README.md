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
settings, not anything in this repo:

| Setting | What it does |
|---|---|
| `storefront_enabled` | Master switch. While `false` (the default), every `/public/storefront/*` route the SPA depends on 503s and the site shows the closed gate. |
| `storefront_features` / `storefront_theme` / `storefront_brand` | Feature flags, colours/fonts/layout, and logo/title/description. There is no admin UI for these yet (Spec 2) — set them via `PUT /api/v1/storefront-settings` until then. |
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

## Manual deploy

```bash
npm run deploy   # npm run build && wrangler deploy
```

`wrangler.jsonc` has no route/custom domain committed — Spec 3 sets those per client through the
Cloudflare API. For a manual deploy, add a `routes` entry to a local copy of `wrangler.jsonc` (or
pass `--route` to `wrangler deploy`) first.

**Deploy order matters**: this Worker has zero functionality without the backend's storefront
surface already live and configured (see Prerequisites above) — deploy/configure the backend
first, then this Worker.

## Release process

Pushing a tag matching `v*` (e.g. `v0.2.0`) runs `.github/workflows/release.yml`: checkout → install
(`npm ci` at the root, then `npm ci` in `web/`) → `npm test` → `npm run build` → zip
`wrangler.jsonc`, `worker/src`, `web/dist`, and `package.json` into `storefront-<tag>.zip` →
attach it to a GitHub Release via `softprops/action-gh-release`. That release artifact is what
Spec 3's backend-driven deploy pipeline will list and upload to a client's own Cloudflare account.
