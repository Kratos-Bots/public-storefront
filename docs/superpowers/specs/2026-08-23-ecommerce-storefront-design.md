# ecommerce-storefront — Design (Spec 1 of 3)

**Date:** 2026-08-23
**Status:** approved in brainstorming, awaiting written-spec review
**Repo:** `ecommerce-storefront/` (new, independent repo in the workspace)
**Backend contract:** `ecommerce-backend/STOREFRONT.md` (all `/public/storefront/*` endpoints already live)

## 0. Why

`ecommerce-menu` is a per-vendor, build-time-configured catalog (`web/src/config/vendors/<code>/`)
deployed by hand to Cloudflare Pages + a separate Worker. Every styling tweak is a rebuild and a
redeploy by the maintainer. The backend now has a full storefront surface (passwordless WhatsApp /
Telegram login, persistent carts, checkout, order history, loyalty, referrals, redemption, notices,
cut-offs, kill switch), so the frontend can become a real shop with accounts — and its configuration
can move to the backend so clients self-serve.

This is the first of three specs:

| Spec | Scope | Status |
|---|---|---|
| **1 (this)** | The storefront app (Worker + SPA) and the small backend additions it needs (theme/brand/feature settings, guest checkout). | this doc |
| 2 | Admin SPA **Appearance** editor for the new settings, with live preview. | later |
| 3 | **Deploy-from-admin**: client enters their own Cloudflare credentials in the admin SPA; the backend fetches a tagged GitHub Release of this repo and uploads it as a Worker (assets + vars + custom domain) to the client's account. | later |

Locked decisions from brainstorming:

- **Runtime configuration.** All per-client customisation (colours, fonts, layout, logo, links, feature
  flags) is fetched from the backend at load time. The built bundle is byte-identical for every client.
  Per-client deploy inputs are only `BACKEND_URL` + the domain (+ an optional tracking API key).
- **Thin Worker.** One Worker script serves the SPA's static assets and reverse-proxies `/api/*` and
  `/media/*` to the backend. No business logic, no sanitisation, no checkout orchestration in the Worker.
- **Guest checkout is a per-client flag.** Login-required is the default; when the flag is on, a
  session-less backend checkout path (Turnstile-verified server-side) is available.
- **Release artifact = GitHub Release** (built by CI on tag), consumed by Spec 3.
- **Stack:** React 19 + Vite 7 + Mantine 9 (+ `@mantine/colors-generator` for the primary ramp) + react-router 7 + @tanstack/react-query 5 + ky + zustand + zod 4.
  TypeScript throughout. Worker on wrangler 4 with the `assets` binding.
- **All four page groups** ship in this spec: catalog/cart/checkout, login + account, order status +
  payment redirects, verify + tracking.

Non-goals for this spec: the admin editor UI (Spec 2), the deploy pipeline (Spec 3), email/phone +
password login (no backend endpoint yet — the login page leaves a slot for it), modifying
`ecommerce-menu` (it stays as-is until clients are migrated).

---

## 1. Repository layout

```
ecommerce-storefront/
  package.json              # root scripts: dev, build, typecheck, test, deploy (delegates to web/ + worker/)
  wrangler.jsonc            # single Worker: main = worker/src/index.ts, assets.directory = web/dist
  .dev.vars.example         # BACKEND_URL, TRACKING_API_URL, TRACKING_API_KEY
  worker/
    src/index.ts            # fetch handler: /api/*, /media/*, /api/tracking, else assets
    src/proxy.ts            # allowlist + forward + edge cache
    src/tracking.ts         # ported from ecommerce-menu/worker/src/tracking.ts
    tsconfig.json
  web/
    index.html              # inline theme bootstrap (see §3.4)
    vite.config.ts          # @/ alias, dev proxy /api + /media → :8787
    src/…                   # §4
  docs/superpowers/specs/   # this file
  .github/workflows/release.yml   # on tag v* → build → zip → GitHub Release asset (consumed by Spec 3)
```

`wrangler.jsonc`:

```jsonc
{
  "name": "ecommerce-storefront",
  "main": "worker/src/index.ts",
  "compatibility_date": "2026-08-01",
  "assets": {
    "directory": "./web/dist",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/media/*"]
  },
  "vars": { "BACKEND_URL": "http://localhost:3000/" },
  "workers_dev": false,
  "preview_urls": false
}
```

Routes/custom domains are **not** in the committed config — Spec 3 sets them per client through the
Cloudflare API; for manual deploys the operator passes `--route`/edits a local copy. Secrets
(`TRACKING_API_KEY`) are never in the file.

The root `package.json` scripts:

| script | does |
|---|---|
| `dev` | `wrangler dev --port 8787` (expects `web/dist` to exist for asset serving; in practice developers run `web` Vite on 5173 and only hit the Worker for `/api`) |
| `dev:web` | `cd web && vite` |
| `build` | `cd web && tsc -b && vite build`, then `tsc --noEmit -p worker` |
| `typecheck` | both projects |
| `test` | `vitest run` in `web` and `worker` |
| `deploy` | `npm run build && wrangler deploy` |

No test runner is configured elsewhere in the workspace; this repo *does* get Vitest (see §7) because
the theme bridge, cut-off maths, cart merge, and the Worker allowlist are pure logic worth pinning.

---

## 2. The Worker

`worker/src/index.ts` handles exactly four things; everything else falls through to the assets binding
(`env.ASSETS.fetch(request)`), which serves the SPA with `index.html` fallback.

### 2.1 `/api/*` reverse proxy

`/api/<rest>` → `${BACKEND_URL}api/v1/public/<rest>`. The SPA never knows the backend origin.

- **Allowlisted prefixes** (anything else → `404 { success:false, error:"Not found" }`):
  `storefront/`, `catalog`, `catalog/`, `orders/`, `verify/`, `wholesale/`.
  The admin/API-key surfaces of the backend are therefore unreachable through the client's domain.
- **Forwarded:** method, body, `Content-Type`, `Authorization` (the storefront Bearer token),
  `Accept`. **Added:** `X-Forwarded-For: <cf-connecting-ip>` and `X-Forwarded-Proto: https`
  (the backend's per-IP rate limits and Telegram-widget origin checks key on these).
  **Stripped:** cookies, `Host` (rewritten to the backend host), all `CF-*` headers.
- **Edge cache** (`caches.default`, keyed on the full URL, GET only, no `Authorization` header present):
  `storefront/settings` → 30 s, `catalog` and `catalog/products/:id` → 60 s, `wholesale/catalog` → 60 s.
  Everything else is `no-store`. The cached response copies the backend's status + body and adds
  `X-SF-Cache: HIT|MISS`.
- Backend unreachable / 5xx on the proxy itself → `502 { success:false, error:"Backend unavailable" }`.
- Request bodies are streamed through unchanged; the Worker does not parse JSON.

### 2.2 `/media/*` image proxy

`/media/<path>` → `${BACKEND_URL}api/v1/<path>` for the backend's public image routes only
(allowlist, GET only):

| storefront path | backend route |
|---|---|
| `/media/products/:id/image?variant=web\|thumbnail` | `GET /api/v1/products/:id/image` (public, what the menu uses today) |
| `/media/settings/branding/logo\|favicon` | `GET /api/v1/settings/branding/…` (admin branding, fallback) |
| `/media/storefront-settings/branding/logo\|favicon` | `GET /api/v1/storefront-settings/branding/…` (§3.2) |

Cached 1 day at the edge with `Cache-Control: public, max-age=86400`. The SPA builds image URLs
through one helper, `productImageUrl(id, variant)` → `/media/products/…`, and maps `brand.logoUrl` /
`faviconUrl` (backend-relative `/api/v1/…` strings) to `/media/…` via `mediaUrl()`. The product's
`imageProductId` (parent-image fallback) semantics are ported from the menu unchanged.

### 2.3 `/api/tracking`

Ported verbatim from `ecommerce-menu/worker/src/tracking.ts`: looks up the order through the proxy,
then calls the China Tracking API with `TRACKING_API_KEY`. If `TRACKING_API_URL`/`TRACKING_API_KEY`
are unset the endpoint returns the order with `tracking: { degraded: true }` and the page renders the
degraded state. This is the **only** secret the Worker ever holds.

### 2.4 Bindings

| name | kind | required |
|---|---|---|
| `ASSETS` | assets binding | yes (wrangler-managed) |
| `BACKEND_URL` | var, trailing slash | yes |
| `TRACKING_API_URL` | var | no |
| `TRACKING_API_KEY` | secret | no |

### 2.5 What the Worker deliberately does not do

No Turnstile verification (moved to the backend, §5.2), no field sanitisation (the backend's public
catalog already omits cost/stock thresholds), no WebSockets (WhatsApp login completion polls
`GET /api/storefront/auth/attempts/:id`), no per-vendor config.

---

## 3. Settings contract (backend → SPA)

### 3.1 Existing (unchanged)

`GET /public/storefront/settings` already returns `enabled`, `closedMessage`, `welcomeMessage`,
`notices[]`, `cutoffs`, `serverTime`, `contactModes`, `currency`, `supportLinks[]`, `login.{whatsapp,telegram}`.
It is reachable even when the kill switch is off.

### 3.2 New keys (this spec, backend)

Added to the `storefront-settings` module (same `bot_settings` KV + `storefront_` prefix pattern),
validated with zod, every field defaulted, exposed on the public settings response as three new
top-level objects:

```jsonc
"brand": {
  "name": "Kratos Pharma",            // storefront_brand_name        default: companyName setting
  "shortName": "KRATOS",              // storefront_brand_short_name  default: name
  "tagline": "Peptides & Supplements",// storefront_brand_tagline     default: ""
  "title": "Kratos Pharma — Shop",    // storefront_brand_title       default: "<name>"
  "description": "…",                 // storefront_brand_description default: ""
  "logoUrl": "/api/v1/storefront-settings/branding/logo",     // null when none uploaded; SPA falls back to admin branding logo, then to text
  "faviconUrl": "/api/v1/storefront-settings/branding/favicon",
  "logoHeight": 28,                   // px at the default header size; default 28
  "links": { "whatsapp": "https://wa.me/…", "telegram": "https://t.me/…" }   // storefront_brand_links, both optional
},
"features": {                          // storefront_features (one JSON key)
  "layout": "storefront",             // "storefront" | "menu"           default "storefront"
  "ordering": true,                   // false → browse-only, no cart
  "guestCheckout": false,             // see §5.2
  "accounts": true,                   // false → hides login/account; implies guestCheckout must be true for ordering to work (validated)
  "verify": true,
  "tracking": false,
  "wholesale": false,                 // requires ordering
  "upsell": false                     // ignored when wholesale
},
"theme": {                             // storefront_theme (one JSON key)
  "scheme": "dark",                   // "dark" | "light"
  "colors": {
    "primary": "#ffffff",             // accent; Mantine ramp derived
    "bg": "#0f3965",
    "surface": "#15457a",
    "text": "#f4f7fc",
    "muted": "#a9c0e0",
    "success": "#5fcc9b",
    "warn": "#e3b97a",
    "danger": "#e08278"
  },
  "fonts": { "heading": "Inter", "body": "Inter", "mono": null },   // Google Fonts family names; null = system stack
  "radius": "md",                     // "sm" | "md" | "lg" | "xl"
  "density": "comfortable",           // "comfortable" | "compact"
  "customCss": ""                     // max 20 KB, sanitised server-side
},
"turnstile": { "siteKey": "0x…" }      // present only when guestCheckout is on and a key is configured
```

Defaults reproduce the current `kp` vendor look (the menu's `DEFAULT_PALETTE`) so a fresh client with
no theme saved gets something presentable.

**Branding uploads**: `POST/DELETE /api/v1/storefront-settings/branding/{logo,favicon}` (admin JWT)
and `GET` (public) — same multer + `sanitizeSvg` + header-verified `.ico` handlers as the admin
`settings/branding` routes, stored under a distinct asset key. The public `GET` is what `/media/*`
proxies.

**`customCss` sanitisation**: parsed with `css-tree` (already a backend dependency); rejects
`@import`, `url()` to non-`/media/` origins, `expression()`, `behavior`, and `-moz-binding`; anything
that fails to parse is rejected with `422`. Stored only after passing; the SPA injects it verbatim as
the last `<style>` in the cascade.

**Validation rules** (422 on write): `wholesale` requires `ordering`; `ordering && !accounts` requires
`guestCheckout`; colours must be 6-digit hex; font names `^[A-Za-z0-9 ]{1,50}$`; `logoHeight` 16–64.

### 3.3 Admin write path

`PUT /api/v1/storefront-settings` accepts the new keys (`brandName`, `brandShortName`, …, `features`,
`theme`, `guestCheckoutEnabled`, `turnstileSiteKey`, `turnstileSecret`) alongside the existing ones.
Spec 2 builds the editor; until then they are settable through that endpoint.

### 3.4 SPA theme bridge

`web/src/app/theme-bridge.ts` turns `settings.theme` + `settings.brand` into:

- a `MantineThemeOverride`: `primaryColor: 'brand'` with a 10-step ramp generated from
  `colors.primary` by `generateColors()` from `@mantine/colors-generator`,
  `fontFamily`, `headings.fontFamily`, `defaultRadius`, `colorScheme`, spacing scale for `density`;
- CSS variables on `:root`: `--sf-bg`, `--sf-surface`, `--sf-surface-2/3` (derived), `--sf-line`,
  `--sf-text`, `--sf-muted`, `--sf-success/warn/danger`, `--sf-logo-h`;
- a `<link rel="stylesheet">` to Google Fonts for each named family (deduped, `display=swap`);
- `document.title`, `<meta name="description">`, `<meta name="theme-color">`, `<link rel="icon">`.

**First-paint strategy**: `index.html` carries a ~20-line inline script that reads
`localStorage['sf-theme-v1']` (the last applied `theme`+`brand`) and sets the CSS variables + scheme
before React mounts, so returning visitors never see the default palette. The React app then fetches
settings (edge-cached, one round trip) and reconciles. First-ever visit shows a neutral skeleton
until settings arrive. All storage access is try/catch-wrapped.

---

## 4. SPA structure

```
web/src/
  main.tsx                  mounts <App/>
  app/
    App.tsx                 providers: MantineProvider(themeFromSettings) → QueryClientProvider → RouterProvider
    router.tsx              routes (§4.2), lazy features
    theme-bridge.ts         §3.4
    settings.ts             useSettings(): react-query, staleTime 30s, refetch on window focus, drives everything below
    closed-gate.tsx         renders <ClosedPage/> when settings.enabled === false or any request returns 503 STOREFRONT_DISABLED
  api/
    client.ts               ky instance, base '/api', Authorization from session store, 401 → session.clear(), 503/STOREFRONT_DISABLED → closed-gate
    settings.ts catalog.ts auth.ts cart.ts checkout.ts orders.ts profile.ts tracking.ts verify.ts publicOrder.ts
  lib/
    media-url.ts format.ts (money via settings.currency) cutoffs.ts (next cut-off from cutoffs + serverTime drift) chat-links.ts dial-codes.ts color.ts (OKLCH ramp)
  stores/
    session.ts              zustand+persist: token, customer summary (nickname, identities), returnTo
    cart.ts                 zustand+persist: local lines; mode 'local' | 'server'; merge() on login
    ui.ts                   open drawers/sheets
  layouts/
    StorefrontShell.tsx     header (logo, category nav, search, cart + account icons), NoticeBanners, CutoffBar, footer (support links, chat links)
    MenuShell.tsx           compact top bar (logo, search, cart, account), NoticeBanners, CutoffBar — the current menu idiom
    Chromeless.tsx          for /order/:ref/:key
  features/
    catalog/      CatalogPage (reads features.layout → <ProductGrid/> or <ProductList/>), ProductCard, ProductRow, StockChip, FilterDrawer, CategoryNav, category-tree.ts, useCatalog.ts, ProductDetailPage (storefront) / ProductDetailSheet (menu), Upsells
    wholesale/    WholesaleCatalogPage, WholesaleRow, TierLadder, SearchBar, WholesaleBar (ported)
    cart/         CartDrawer, CartLine, CartSummary, MobileCartBar
    checkout/     CheckoutPage: steps Contact → Address (incl. service-point picker when available) → Shipping → Payment → Review; useQuote() re-quotes on every meaningful change; guest vs session path (§5)
    auth/         LoginPage (+ LoginModal variant), WhatsAppLogin (start → show prefilled wa.me link + code → poll attempts → complete), TelegramLogin (widget embed, data-auth-url-less onauth callback), returnTo handling, password slot placeholder
    account/      AccountLayout (tabs), OrdersPage, OrderDetailPage, LoyaltyPage (points, redeem options → redeem), ReferralsPage (code, share link, "I was referred" form), ProfilePage (nickname, identities, logout)
    order-status/ OrderStatusPage /order/:ref/:key — ported: StatusHero, ItemsCard, AddressCard, ShipmentCard, PaymentSection (CryptoPaymentCard, CryptoComboPicker, txid submit, payment-method switch)
    payment-redirect/ PaymentSuccessPage, PaymentCancelPage, OrderPlacedPage (chat-settled)
    tracking/     TrackingPage (ported)
    verify/       VerifyPage (ported)
    notices/      NoticeBanners (info/warning/promo, dismiss per id in localStorage), CutoffBar (countdown, "order by HH:mm for <shipsOn>")
    closed/       ClosedPage (brand, closedMessage, support + chat links)
  components/     small shared pieces only (Brand, Money, EmptyState, PageSkeleton) — Mantine primitives otherwise
```

### 4.1 Conventions

- `@/*` → `src/*`, imports carry `.ts`/`.tsx` extensions (matches the other workspace SPAs).
- Mantine components + CSS modules for layout; no Tailwind. Colours only via Mantine theme tokens or
  `--sf-*` vars — never hard-coded hex in components.
- Every feature folder is self-contained; cross-feature code lives in `lib/`, `stores/`, `components/`.
- react-query keys: `['settings']`, `['catalog']`, `['product', id]`, `['cart']`, `['quote', hash]`,
  `['orders']`, `['order', ref]`, `['profile']`, `['redeem-options']`.

### 4.2 Routes

| path | shell | guard |
|---|---|---|
| `/` | per `features.layout` | — |
| `/c/:categorySlug` | same | — |
| `/p/:id` | same (page in storefront layout; in menu layout redirects to `/?p=id` which opens the sheet) | — |
| `/cart` | same (mobile full page; desktop redirects to `/` and opens drawer) | `features.ordering` |
| `/checkout` | same | `features.ordering`; session or `guestCheckout` |
| `/login` | same | `features.accounts` |
| `/account`, `/account/orders`, `/account/orders/:ref`, `/account/loyalty`, `/account/referrals`, `/account/profile` | same | `features.accounts` + session; else redirect `/login?returnTo=` |
| `/order/:ref/:accessKey` | chromeless | — |
| `/payment/success`, `/payment/cancel`, `/order-placed` | same | — |
| `/verify` | same | `features.verify` |
| `/tracking`, `/tracking/:reference` | same | `features.tracking` |
| `*` | — | redirect `/` |

Flag-gated routes that are off render the 404 state, not a redirect, so links in old messages fail
honestly.

### 4.3 Layouts

- **storefront** — image-led: hero strip (welcome message + tagline), category chips (mobile) /
  left category rail (desktop ≥ 992px), product card grid (2 cols mobile, 3–4 desktop) with image,
  name, price (tier/customer price if the catalog returns one), stock chip, quick-add. Product detail
  is a page. Sticky bottom cart bar on mobile; cart drawer on desktop.
- **menu** — dense: compact top bar, grouped rows per category (the current `ProductRow` look:
  name, strength/variant, price, stock chip, `+`), detail as a bottom sheet, filter sheet. Same
  mobile cart bar.
- Both: `NoticeBanners` under the header, `CutoffBar` above the catalog (only when today/any day is
  enabled), footer with `supportLinks` and chat links. Wholesale replaces the catalog body under
  either shell.
- Breakpoints follow Mantine defaults; the app is designed mobile-first and verified at 390 px and
  1280 px.

### 4.4 Session & cart behaviour

- Token in `localStorage` via the session store; `Authorization: Bearer` injected by `api/client.ts`.
  `401` → clear session, cart switches back to local mode (keeping its lines), toast "Please sign in
  again", redirect to `/login?returnTo=<current>` only when on a guarded route.
- Cart modes: `local` (guest) keeps `{productId, quantity}` lines in localStorage; `server` mirrors
  `GET/PUT /cart` with optimistic updates and re-fetch on error. On login: `merge()` = union by
  productId, sum quantities, `PUT /cart`, then switch to `server`. On logout: `DELETE /cart` is **not**
  called (the server cart is the customer's), local cart becomes empty.
- Logged-in cart edits therefore appear in admin Live Carts unchanged.

### 4.5 Checkout

- Step form with a persistent summary panel fed by `useQuote()` (`POST /checkout/quote` on country,
  coupon, shipping option, store-credit toggle change — debounced 300 ms, keyed on a hash of inputs).
- Payment step lists `quote.paymentMethods`; crypto shows the coin/network picker with per-combo
  `chargeTotal`; offline/manual shows `details` after placement, not before.
- Submit → `POST /checkout` → on success: gateway `redirectUrl` → navigate away; manual/crypto/chat →
  navigate to `publicUrl`'s path (`/order/:ref/:key`) for on-site payment instructions; chat-settled →
  `/order-placed` with the prefilled chat links (ported behaviour).
- Contact step respects `contactModes`; address step asks `GET /service-points?country=` once per
  country and shows the service-point picker when available (ported from the collection-points work).
- Guest path (§5.2): same steps; the cart lines are sent in the body, a Turnstile widget (invisible)
  runs before quote and checkout calls, and the contact step is mandatory.

### 4.6 Auth UI

- **WhatsApp**: `POST /auth/whatsapp/start` → show the code + a big "Open WhatsApp" button
  (`wa.me/<number>?text=<prefilled>`) → poll `GET /auth/attempts/:id` every 2 s (max 5 min) → on
  `completed` call `POST /auth/whatsapp/complete` with the attempt secret → store token. Shown only
  when `login.whatsapp.available`.
- **Telegram**: embed the official widget (`data-telegram-login = login.telegram.botUsername`,
  `data-onauth`), post the payload to `POST /auth/telegram`. Shown only when
  `login.telegram.available`. The widget needs the client's domain registered via BotFather
  `/setdomain` — called out in the README and surfaced as a hint in Spec 2's editor.
- `LoginPage` reserves a third card "Email or phone + password" rendered only when a future
  `login.password.available` flag appears — no code path behind it today.

### 4.7 Account area

Tabs: **Orders** (`GET /orders` paginated list → `/account/orders/:ref` detail which reuses the
order-status components via the session endpoint rather than the access-key one), **Loyalty**
(`profile.loyaltyPoints`, `storeCreditBalance`, redeem options when the feature is on — 404 hides the
section), **Referrals** (`referralCode` with copy + share links into WA/TG, counts, and an "enter a
referral code" form when `!hasReferrer`), **Profile** (nickname, identities as badges, member since,
logout).

---

## 5. Backend additions

All in `ecommerce-backend`, following its module conventions (`router/controller/service/schemas`,
extensionless imports, `AppError` subclasses, zod schemas).

### 5.1 `storefront-settings` extensions

- New keys per §3.2, typed accessors in `service.ts`, zod in `schemas.ts`, exposure in
  `public-storefront` settings handler.
- Branding upload/get/delete routes for storefront logo + favicon, reusing the `settings` module's
  multer configs, `sanitizeSvg`, and `.ico` header check, with distinct storage keys
  (`storefront-logo`, `storefront-favicon`).
- `customCss` sanitiser in `src/lib/css-sanitizer.ts` (css-tree walk; rules in §3.2).

### 5.2 Guest checkout

Gated by `storefront_guest_checkout_enabled` (default `false`) and the kill switch; `404 Feature not
found` when off.

| route | body | notes |
|---|---|---|
| `POST /public/storefront/checkout/guest/quote` | `{ turnstileToken, items:[{productId,quantity}], country?, couponCode?, shippingOptionId? }` | 120/15min/IP. No store credit. |
| `POST /public/storefront/checkout/guest` | quote fields + `contact`, `shippingAddress`, `payment` (same shapes as the session checkout) | 10/15min/IP. |

- Turnstile token verified against `https://challenges.cloudflare.com/turnstile/v0/siteverify` with
  `storefront_turnstile_secret`; failure → `422 Verification failed`. Tokens are single-use by
  Cloudflare's design, so the SPA obtains a fresh one per call (invisible widget, `execute()`).
- Implementation reuses `getCheckoutQuote`/`placeStorefrontOrder` from `public-storefront/checkout.ts`
  by extracting the cart-loading step into a parameter (`lines` supplied by the caller instead of read
  from `storefront_carts`). Customer resolution = the bot's find-or-create by phone/email from
  `contact` (same helper the bot checkout uses), `source: 'WEBSITE'`. Guest orders still carry a
  `customerId`, so loyalty accrues to whoever later logs in with that phone.
- Per-customer Redis checkout lock applies the same way.

### 5.3 No schema migrations

Everything lives in existing KV settings and existing tables.

---

## 6. Error handling

| situation | behaviour |
|---|---|
| settings fetch fails on first visit | full-page retry state with brand text; subsequent failures keep the last good settings |
| `503 STOREFRONT_DISABLED` on any call | closed-gate swaps the whole app for `ClosedPage` (uses `closedMessage`; still shows support/chat links); settings keep polling every 60 s and the app comes back on its own |
| `401` | §4.4 |
| `422` from quote/checkout | rendered inline on the relevant step (coupon field, shipping, address); the summary panel shows the last good quote greyed out |
| `404` coupon | inline "Unknown code" |
| `429` | toast with retry-after when present |
| Worker `502` | toast "Store temporarily unavailable", react-query retries with backoff |
| Telegram widget fails to render (domain not registered) | after 5 s show a hint "Telegram login isn't available right now" — not an error toast |
| WhatsApp poll times out | "Didn't get your message — try again" with a restart button |

---

## 7. Testing

- **Vitest (web)**: `color.ts` ramp derivation, `cutoffs.ts` (next cut-off across day boundaries and
  timezone, drift correction), cart `merge()`, `media-url.ts`, theme-bridge output for a default and
  a fully-specified theme, route guards.
- **Vitest (worker, `@cloudflare/vitest-pool-workers`)**: allowlist (admin path → 404), header
  forwarding/stripping, cache HIT/MISS on settings, `/media` mapping, tracking degraded mode.
- **Playwright mocked pass** (same technique as the admin SPA: Vite on a spare port, `page.route`
  mocks for `/api/*`): both layouts at 390 px and 1280 px — catalog → detail → add to cart → checkout
  to the payment step; login page rendering with each provider available/unavailable; account tabs;
  closed page; order-status page with a crypto-pending order. Screenshots attached to the PR.
- **Manual, before enabling for a client**: real Telegram widget on a registered domain, real
  WhatsApp login (needs a paired wa-worker), one real checkout per enabled gateway.

---

## 8. Local development

```
# 1 backend            cd ecommerce-backend && npm run dev          (:3000)
# 2 worker             cd ecommerce-storefront && npm run dev       (:8787, BACKEND_URL from .dev.vars)
# 3 spa                cd ecommerce-storefront && npm run dev:web   (:5173, proxies /api + /media → :8787)
```

Enable the storefront in admin Settings → Storefront (`storefront_enabled`), optionally set
`features`/`theme` via `PUT /api/v1/storefront-settings` until Spec 2 lands.

---

## 9. Release & deploy (hand-off to Spec 3)

- `.github/workflows/release.yml`: on `v*` tags → `npm ci && npm run build && npm test` → zip
  `wrangler.jsonc`, `worker/`, `web/dist/` as `storefront-<tag>.zip` → attach to the GitHub Release.
  Spec 3's backend module lists these releases and uploads the chosen one to a client's Cloudflare
  account with `BACKEND_URL`, optional tracking secret, and the custom domain.
- Manual deploy for now: `npm run deploy` with a local `wrangler.jsonc` route added, then
  `wrangler secret put TRACKING_API_KEY` if tracking is on.

---

## 10. Open items carried to later specs

- Spec 2: Appearance editor (colour pickers, font picker with Google Fonts preview, layout toggle,
  feature toggles with the §3.2 validation surfaced inline, logo/favicon upload, custom CSS editor,
  live preview iframe pointing at the client's storefront with `?preview=<draft-id>` — needs a
  backend draft endpoint, designed then).
- Spec 3: Cloudflare credential storage (encrypted at rest, same approach as gateway secrets),
  release listing via GitHub API, Worker script + assets upload, vars/secrets, custom domain binding,
  deploy history, and "update available" badge when a newer release exists.
- Password login (email/phone): backend endpoint + `login.password` flag; SPA slot already reserved.
- Migrating existing `ecommerce-menu` vendors: a one-off script that converts each
  `web/src/config/vendors/<code>/config.ts` into a `PUT /storefront-settings` payload.
