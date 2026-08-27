# Storefront admin editor + deploy-from-admin — Design (Specs 2 & 3)

Date: 2026-08-26. Follows [Spec 1](2026-08-23-ecommerce-storefront-design.md), which shipped the
storefront app and the backend settings surface but left the admin UI and the deploy pipeline as
open items (§10 there). This document covers both, scoped for a first testable release.

Three repos change: `ecommerce-storefront` (release workflow), `ecommerce-backend` (new
`storefront-deploy` module), `ecommerce-admin-frontend` (four new Storefront tabs).

## 0. Goals and non-goals

Goals:

1. Every `storefront_*` setting the backend already accepts is editable in the admin SPA — brand,
   theme, features, guest checkout, Turnstile, tracking API, logo/favicon.
2. A store owner can connect their own Cloudflare account (API token), choose a hostname on one of
   their zones, and deploy any published release of `Kratos-Bots/public-storefront` to it from the
   admin — and later update to a newer release the same way.
3. The GitHub release pipeline actually produces an artifact the backend can consume.

Non-goals (deferred): live preview of appearance edits; `workers.dev` targets; more than one
storefront per backend; automatic rollback (re-deploying an older tag covers it); password login;
migrating `ecommerce-menu` vendors.

Locked decisions:

- **Cloudflare auth is an API token**, pasted into the admin. Cloudflare offers no third-party OAuth,
  so "sign in with Cloudflare" is not possible. The token is encrypted at rest with the backend's
  existing `encryptSecret()` (AES-256-GCM keyed from `JWT_SECRET`).
- **The backend talks to the Cloudflare REST API directly** (Approach A). No `wrangler` in the
  backend image. CI pre-bundles the Worker so the backend only uploads files.
- **Custom domain only** as the deploy target: a zone from the connected account + a hostname on it.
- **One Worker per backend**, fixed name `ecommerce-storefront`, in the connected account.
- **`bot_settings` is for the Telegram bot only.** Storefront configuration moves to a new
  `storefront_settings` key/value table (§2.0); the deploy module's config lives there too. Spec 1
  parked the `storefront_*` keys in `bot_settings` — this spec migrates them out.
- **Admin UI work uses the `frontend-design` skill** for every new card/tab so the tabs read as one
  deliberate design rather than a form dump.

---

## 1. Release artifact (`ecommerce-storefront`)

### 1.1 Why the current workflow fails

The `v0.1.0` tag run ended in `startup_failure` with zero jobs: GitHub rejected the workflow before
running it. `actions/checkout` and `actions/setup-node` are GitHub-authored; the only third-party
step is `softprops/action-gh-release@v2`, which an org Actions policy ("allow GitHub-authored /
verified actions only") blocks at workflow validation time. Removing the dependency fixes it
regardless of the policy.

### 1.2 New `release.yml`

```yaml
name: release
on:
  push:
    tags: ['v*']
jobs:
  build:
    runs-on: ubuntu-latest
    permissions: { contents: write }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm --prefix web ci
      - run: npm test
      - run: npm run build
      - run: npx wrangler deploy --dry-run --outdir=worker/dist
      - name: Write release manifest
        run: node scripts/write-release-manifest.mjs "$GITHUB_REF_NAME"
      - name: Package
        run: |
          mkdir -p out
          zip -r "out/storefront-${GITHUB_REF_NAME}.zip" release.json worker/dist web/dist
      - name: Publish release
        env: { GH_TOKEN: '${{ github.token }}' }
        run: gh release create "$GITHUB_REF_NAME" out/*.zip --title "$GITHUB_REF_NAME" --generate-notes
```

`wrangler deploy --dry-run --outdir` bundles `worker/src/index.ts` + its two local imports into
`worker/dist/index.js` (ES module) without deploying. `npm test` is vitest only — no Playwright
install needed in CI.

### 1.3 `release.json`

Written by `scripts/write-release-manifest.mjs` from `wrangler.jsonc` (parsed with the `jsonc-parser`
dev dependency, or a comment-stripping read — the script is the only place that reads the jsonc):

```json
{
  "schemaVersion": 1,
  "tag": "v0.1.0",
  "worker": { "main": "worker/dist/index.js", "compatibilityDate": "2026-08-01" },
  "assets": {
    "directory": "web/dist",
    "notFoundHandling": "single-page-application",
    "runWorkerFirst": ["/api/*", "/media/*", "/healthz"]
  },
  "vars": ["BACKEND_URL"]
}
```

The backend refuses to deploy a zip whose `schemaVersion` it doesn't know, and refuses one that
declares a `vars` entry it can't supply. `vars` exists so a future release can add a variable without
silently deploying an unset one.

### 1.4 Re-release

After the workflow lands on `main`, move `v0.1.0` to that commit (`git tag -f v0.1.0 && git push
origin v0.1.0 --force`) — the old tag never produced a release, so nothing downstream references it.
Future releases: `npm version <minor|patch>` then `git push origin main --follow-tags`.

README: replace the "Release process" and "Manual deploy" sections to describe the above and the
admin-driven deploy; keep the prerequisites table but note the settings now have an admin UI.

---

## 2. Backend: `storefront-deploy` module

Path `src/modules/storefront-deploy/` with the standard `router.ts` / `controller.ts` / `service.ts`
/ `schemas.ts`, mounted at `/api/v1/storefront-deploy`, every route `authenticate, authorize('admin')`.
Two thin API clients live in `src/lib/`: `cloudflare-api.ts` and `github-releases.ts`. The deploy
job lives in `src/lib/queues/storefront-deploy.ts` following the existing queue files.

### 2.0 `storefront_settings` table (moves existing keys out of `bot_settings`)

`src/db/schema/storefront-settings.ts`:

```ts
export const storefrontSettings = pgTable('storefront_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  ...timestamps,
});
```

The generated migration gets two data statements appended (precedent: `drizzle/0003_*.sql`,
`0007_*.sql` carry hand-written `INSERT`/`UPDATE`):

```sql
INSERT INTO storefront_settings (key, value, created_at, updated_at)
  SELECT key, value, created_at, updated_at FROM bot_settings WHERE key LIKE 'storefront\_%';
DELETE FROM bot_settings WHERE key LIKE 'storefront\_%';
```

Code changes:

- `storefront-settings/service.ts` gains local `getStorefrontSetting(key)` /
  `upsertStorefrontSetting(key, value)` / `deleteStorefrontSetting(key)` against the new table and
  stops importing `getBotSettingValue` / `upsertBotSetting`. It keeps importing `PAYMENT_SLOT_KEYS`
  and `getCheckoutContactModes` — those are genuine bot values the storefront falls back to.
- `bot-settings/service.ts`: the read-side filter that hides `storefront_*` rows becomes dead and is
  removed. The write-side guard in `bot-settings/schemas.ts` (reject `storefront_*` keys on the
  generic endpoint) stays, message updated to point at `/storefront-settings`.
- Key names are unchanged, so nothing else in the backend (`middleware/storefront.ts`,
  `public-storefront/*`) moves — they already go through the service.

### 2.1 Configuration storage

`storefront_settings` KV (§2.0), via the same helpers `storefront-settings/service.ts` uses:

| Key | Value |
|---|---|
| `storefront_cf_api_token` | `encryptSecret(token)` |
| `storefront_cf_account_id` / `storefront_cf_account_name` | chosen account |
| `storefront_cf_token_suffix` | last 4 chars, for display |
| `storefront_cf_verified_at` | ISO timestamp of last successful verify |
| `storefront_cf_zone_id` / `storefront_cf_zone_name` / `storefront_cf_hostname` | deploy target |
| `storefront_deployed_tag` | tag of the last succeeded deploy |
| `storefront_public_url` | `https://<hostname>` after first success (see §2.6) |

### 2.2 Table `storefront_deploys` (`src/db/schema/storefront-deploys.ts`, exported from the index; migration via `npm run db:generate`)

| column | type |
|---|---|
| `id` | identity PK |
| `tag` | text, not null |
| `hostname` | text, not null (target at the time) |
| `status` | text enum `queued` \| `running` \| `succeeded` \| `failed` |
| `step` | text, nullable — current/last step id |
| `log` | jsonb `[{ t: ISO, level: 'info'|'warn'|'error', msg }]`, default `[]` |
| `error` | text, nullable — final failure message |
| `warning` | text, nullable — non-fatal note on success |
| `triggered_by_user_id` | int → users.id |
| `started_at` / `finished_at` | timestamptz, nullable |
| `created_at` / `updated_at` | `...timestamps` |

Index on `(status)` for the "is one active?" check.

### 2.3 Endpoints

All responses use the standard envelope. Validation with zod in `schemas.ts`; errors are `AppError`
subclasses (`ValidationError` 422, `ConflictError` 409, `NotFoundError` 404, plus a new
`UpstreamError` 502 carrying Cloudflare/GitHub error text).

**Connection**

- `GET /connection` → `{ connected: boolean, accountId, accountName, tokenSuffix, verifiedAt } | { connected: false }`.
- `PUT /connection` body `{ apiToken: string (10–300), accountId?: string }`:
  1. `GET /user/tokens/verify` with the token → must return `status: "active"`, else 422
     "Token is invalid or inactive".
  2. `GET /accounts?per_page=50` → if `accountId` given, it must be in the list; if not given and
     exactly one account, use it; if not given and several, respond `200 { needsAccount: true,
     accounts: [{ id, name }] }` without storing anything.
  3. Store keys from §2.1, return the `GET /connection` shape.
- `POST /connection/test` → runs verify + accounts + zones and returns
  `{ token: ok|fail, accounts: ok|fail, zones: ok|fail, message? }` — never throws on a failed check.
- `DELETE /connection` → clears all `storefront_cf_*` keys (target included). 409 if a deploy is
  queued/running.

**Target**

- `GET /zones` → `GET /zones?account.id=<id>&per_page=50&status=active` → `[{ id, name, status }]`.
  422 if not connected or the stored token can no longer be decrypted (e.g. after a `JWT_SECRET`
  rotation — the UI shows a "disconnect and reconnect" hint); 502 on Cloudflare/network errors.
- `GET /target` → `{ zoneId, zoneName, hostname } | null`.
- `PUT /target` body `{ zoneId, hostname }`: zone must be in the current `GET /zones` result;
  `hostname` lowercased, must be a valid DNS name and equal `zoneName` or end with `.zoneName`;
  no wildcard. Stores; returns the target.

**Releases & deploys**

- `GET /releases` → `{ releases: [{ tag, name, publishedAt, notes, assetName }], deployedTag,
  latestTag, updateAvailable }`. Source: GitHub `GET /repos/Kratos-Bots/public-storefront/releases?per_page=20`
  (unauthenticated, public repo), filtered to releases that have exactly one `storefront-*.zip`
  asset and are not drafts/prereleases. Cached in memory for 5 minutes with the ETag reused on
  refresh. GitHub failure → 502 with its message; the cache is served stale if present.
  `updateAvailable = deployedTag && latestTag !== deployedTag` (compare by publish order, not semver).
- `POST /deploys` body `{ tag }`:
  - 422 "Connect Cloudflare first" / "Choose a domain first" / "Backend API_HOST is not configured"
    (`env.API_HOST` is what becomes `BACKEND_URL`).
  - 404 if `tag` is not in the release list.
  - 409 if a deploy is `queued` or `running`.
  - Inserts the row (`queued`, `hostname` snapshot), enqueues `{ deployId }`, returns the row.
- `GET /deploys` → last 20, newest first, without `log`.
- `GET /deploys/:id` → full row including `log`.

**Socket**: on every log append and status change the job emits `storefront-deploy:updated { id }`
to the admin namespace via the same helper `storefront-settings` uses for WhatsApp status; the SPA
invalidates `['storefront-deploy', 'deploys']` on it.

### 2.4 Cloudflare client (`src/lib/cloudflare-api.ts`)

A small class over global `fetch`: `constructor(token)`, base `https://api.cloudflare.com/client/v4`,
`Authorization: Bearer`, parses the `{ success, result, errors }` envelope and throws
`CloudflareApiError(status, errors[])` whose message is `errors.map(e => \`${e.code}: ${e.message}\`)`.
Methods, each a one-call wrapper:

| method | HTTP |
|---|---|
| `verifyToken()` | `GET /user/tokens/verify` |
| `listAccounts()` | `GET /accounts` |
| `listZones(accountId)` | `GET /zones?account.id=…&status=active&per_page=50` |
| `createAssetsUploadSession(accountId, script, manifest)` | `POST /accounts/{a}/workers/scripts/{s}/assets-upload-session` |
| `uploadAssets(jwt, files)` | `POST /accounts/{a}/workers/assets/upload?base64=true` — multipart, one part per hash, base64 body; auth is the session JWT |
| `putScript(accountId, script, metadata, moduleSource)` | `PUT /accounts/{a}/workers/scripts/{s}` — multipart with `metadata` (JSON) and `index.js` (`application/javascript+module`) |
| `listDomains(accountId)` | `GET /accounts/{a}/workers/domains` |
| `attachDomain(accountId, { zoneId, hostname, service })` | `PUT /accounts/{a}/workers/domains` |

Asset hashing follows Cloudflare's rule: `sha256(base64(content) + extension).hex.slice(0, 32)`;
manifest keys are `/`-prefixed paths relative to `web/dist`. Files >25 MiB or more than 20,000 files
abort with a clear error (Cloudflare limits).

### 2.5 Deploy job

One BullMQ queue `storefront-deploy`, concurrency 1, no retries (a failed deploy is re-run by the
user). Steps, each writing a log line before and after, with `step` updated on the row:

| step | action |
|---|---|
| `download` | fetch the release asset (`browser_download_url`), max 100 MiB, into memory |
| `extract` | unzip (`fflate` — new dependency, pure JS) into `Map<path, Buffer>`; read + validate `release.json` (`schemaVersion === 1`; `vars ⊆ ['BACKEND_URL']`) |
| `manifest` | hash every file under `assets.directory` (blake3 over base64 content + extension, first 32 hex chars — what wrangler does). `_headers` / `_redirects` are **not** assets: they are lifted out and passed as `assets.config._headers` / `_redirects` in the script metadata, again mirroring wrangler |
| `upload-session` | create session; skip `upload-assets` when `buckets` is empty (everything already stored) |
| `upload-assets` | upload bucket by bucket, sequentially; keep the completion JWT |
| `script` | PUT with metadata `{ main_module: 'index.js', compatibility_date, bindings: [{ type:'assets', name:'ASSETS' }, { type:'plain_text', name:'BACKEND_URL', text: \`https://${API_HOST}/\` }], assets: { jwt, config: { not_found_handling, run_worker_first } }, observability: { enabled: true } }` |
| `domain` | if `listDomains` has no entry for `hostname`→`ecommerce-storefront`, `attachDomain`. Errors here are surfaced verbatim (the common ones: existing CNAME on the hostname; token lacks zone permissions) |
| `health` | poll `GET https://<hostname>/healthz` every 10 s, up to 12 attempts; 200 → done; timeout → `warning = 'Deployed, but https://<hostname>/healthz did not answer within 2 minutes — the certificate may still be provisioning. Check again in a few minutes.'` and still `succeeded` |
| `finalize` | set `storefront_deployed_tag`, `storefront_public_url`; `finished_at` |

Any thrown error → `status: failed`, `error: <message>`, `finished_at`. Every log line is
`{ t, level, msg }`; secrets never appear in logs (the client masks the token; the session JWT is
not logged).

### 2.6 `publicUrl` improvement

`src/modules/orders/access-key.ts` currently returns `null` without `ORDER_PUBLIC_BASE_URL`. Change
the base to: `env.ORDER_PUBLIC_BASE_URL` when set, otherwise the `storefront_public_url` setting
(it only exists after a successful deploy). The env var wins so that deploying a storefront never
redirects an operator's existing order site by itself — switching customers to the storefront is a
deliberate step (unset `ORDER_PUBLIC_BASE_URL`). `buildOrderPublicUrl` stays synchronous (six call
sites), so the setting is held in an in-process cache loaded at boot, refreshed after a deploy's
`finalize` step, and re-read every five minutes so the separate bot process picks it up without a
restart. (Revised 2026-08-27: the original precedence — setting over env — moved live customer
links to the new storefront as soon as a deploy succeeded.)

### 2.7 Security notes

- The API token is only ever decrypted inside the service for outbound Cloudflare calls; no route
  returns it, and `GET /connection` exposes only `tokenSuffix`.
- All routes are admin-only JWT. No API-key scopes are added.
- Deploy inputs the owner controls (`hostname`, `tag`) are validated against server-side lists
  (zones, releases) before use.

---

## 3. Admin SPA

`src/features/storefront-settings/` gains one file per card; `StorefrontSettingsPage.tsx` gets four
tabs appended: **Appearance**, **Features**, **Integrations**, **Deploy** (nine tabs total; the
`Tabs` component already scrolls horizontally below `lg`). New API modules:
`src/api/storefront-deploy.ts`; `src/api/storefront-settings.ts` and
`src/types/storefront-settings.ts` extended with the brand/features/theme/turnstile/tracking fields
the backend already returns.

All four tabs are designed with the `frontend-design` skill before coding: one pass to settle the
visual language of the new tabs (section rhythm, how switches/colour swatches/status badges read,
the Deploy tab's step-log treatment) so they feel like one deliberate surface, consistent with the
existing five tabs and the admin's theme tokens.

Every card follows `GeneralCard.tsx`: react-hook-form + zod, `useQuery` on the shared
`storefrontSettingsKeys.all`, content-keyed `reset` so an unrelated tab's save does not clobber an
in-progress edit, `useMutation` → invalidate + toast, `Save` disabled until dirty.

### 3.1 Appearance tab

- `BrandCard`: name, short name, tagline, title, description, logo height (16–64 number), WhatsApp
  link, Telegram link. Logo + favicon: current image preview, Upload (SVG for logo, `.ico`/`.png`
  for favicon — whatever `uploadSvg`/`uploadFavicon` accept), Remove; posts to the existing
  `storefront-settings/branding/*` routes.
- `ThemeCard`: scheme (dark/light), the eight colours via the existing `ColorPicker`, fonts
  (heading, body, mono — text inputs; a preview line under each renders the family name using a
  Google Fonts `<link>` injected for the typed family, debounced), radius, density, custom CSS
  (`Textarea`, live byte counter against 20 KB; 422 detail from the backend shown under the field).
- Header of the tab: "Open storefront ↗" linking to `https://<hostname>` when a deploy target
  exists, else a hint pointing at the Deploy tab.

### 3.2 Features tab

`FeaturesCard`: layout radio (storefront / menu); switches for ordering, accounts, guestCheckout,
verify, tracking, wholesale, upsell; the `guestCheckoutEnabled` master switch in its own row with
the note "Guest checkout also needs a Turnstile site key + secret (Integrations tab)". Cross-field
rules mirrored in the zod schema so they show inline before saving: wholesale requires ordering;
ordering without accounts requires guestCheckout; upsell is disabled (greyed) when wholesale is on.

### 3.3 Integrations tab

`IntegrationsCard`: Turnstile site key (text) + secret (password input; placeholder "•••• set" when
`turnstileSecretSet`, blank submit leaves it unchanged, explicit "Clear" sends `null`); Tracking API
URL + key, same pattern. Doc links to Cloudflare Turnstile and the tracking provider.

### 3.4 Deploy tab (`DeployTab.tsx` composed of four cards)

1. `CloudflareConnectionCard` — disconnected: token input, "Create token ↗" (opens
   `https://dash.cloudflare.com/profile/api-tokens`; the pre-fill query format is undocumented, so
   the card lists the permissions instead), a permissions checklist (Account:
   Workers Scripts Edit, Account Settings Read; Zone: Zone Read, Workers Routes Edit, DNS Edit,
   SSL and Certificates Edit), Connect. If the response is `needsAccount`, a `Select` of accounts
   appears and Connect is re-sent with `accountId`. Connected: account name, `…<suffix>`, verified
   time, "Test connection" (shows the three check results), Disconnect (confirm dialog).
2. `DomainCard` — `Select` of zones (fetched when connected), hostname input with the zone name as
   a suffix hint and the resolved full hostname shown, Save. Disabled until connected.
3. `ReleaseCard` — list of releases (tag, date, notes collapsed), "Current" badge on
   `deployedTag`, "Update available" badge on the newest when `updateAvailable`, Deploy button per
   release with a confirm dialog ("Deploy v0.2.0 to shop.example.com?"). Disabled while a deploy is
   active or prerequisites are missing (the reason shown inline: connect / choose domain /
   `API_HOST`).
4. `DeployHistoryCard` — table of the last 20: status badge, tag, hostname, started, duration,
   warning/error excerpt; a row expands to the full log (`GET /deploys/:id`). Subscribes to
   `storefront-deploy:updated` via `useSocket()` and invalidates. After the first `succeeded` deploy
   a one-time callout reminds: run BotFather `/setdomain` with the new origin.

### 3.5 Sidebar / breadcrumb

Unchanged (`/storefront-settings` already exists). No new routes.

---

## 4. Error handling summary

| where | behaviour |
|---|---|
| Cloudflare 401/403 on connect | 422 with the Cloudflare message; nothing stored |
| Token loses permissions later | deploy fails at the affected step with the verbatim Cloudflare error; `POST /connection/test` pinpoints which check |
| GitHub unreachable | `GET /releases` serves stale cache if any, else 502 |
| Zip malformed / unknown manifest | deploy fails at `extract` with "Release vX is not deployable by this backend version" |
| Hostname has an existing CNAME | deploy fails at `domain` with Cloudflare's error; the UI links to the zone's DNS page |
| Two deploys at once | 409 |
| Backend restarts mid-deploy | `attempts: 1` only stops retry-after-failure; BullMQ's stalled-job recovery still re-delivers a job whose worker died holding the lock (correction from the final review). The job therefore guards on the row's status and skips replay of anything not `queued`/`running`; re-runs of a live row are idempotent (assets dedupe, domain attach is skipped). A `queued`/`running` row older than 15 minutes is treated as stale: the "is one active?" check ignores it, and the next `GET /deploys` marks it `failed` with error "Interrupted by a backend restart". If enqueueing itself fails (Redis down), the row is marked `failed` immediately rather than left `queued` |

---

## 5. Testing

- **Storefront repo**: existing unit + e2e suites unchanged. Verification of §1 is the re-tagged
  `v0.1.0` run producing a Release whose zip contains `release.json`, `worker/dist/index.js`,
  `web/dist/index.html`.
- **Backend**: add `vitest` (dev dependency + `npm test` script; first tests in the repo). Unit
  tests for: asset hash + manifest builder (known-answer from Cloudflare's doc example), zip →
  file map and `release.json` validation (fixture zip built in the test), hostname/zone validation,
  `CloudflareApiError` message formatting, and the deploy job's step sequence against a mocked
  `fetch` (happy path; failure at `script`; empty-bucket skip; health-check timeout → warning).
  `access-key.ts` fallback order. Migrations checked with `npm run db:generate` producing exactly
  one new migration (both tables), and the data move verified against a dev database seeded with
  `storefront_*` rows in `bot_settings`: after migrating, they exist in `storefront_settings`,
  are gone from `bot_settings`, and `GET /storefront-settings` returns the same values as before.
- **Admin SPA**: no runner (per CLAUDE.md). `npm run build` + `npm run lint` clean; manual pass of
  each tab against a local backend, including the 422 paths.
- **End-to-end**: one real deploy to a test zone in the user's Cloudflare account, then a re-deploy
  of the same tag (exercises the empty-bucket path and the "domain already attached" skip).

---

## 6. Implementation order

1. Storefront repo: workflow + manifest script + README; re-tag; confirm the release exists (the
   backend's release list is useless without it).
2. Backend: `storefront_settings` table + data migration + repoint `storefront-settings/service.ts`
   (verify existing settings survive) → `storefront_deploys` table → Cloudflare/GitHub clients
   (with tests) → service/routes → queue job → `publicUrl` fallback.
3. SPA: `frontend-design` pass for the four tabs → types/api → Appearance, Features, Integrations
   cards → Deploy tab.
4. End-to-end deploy against a real zone; fix what it surfaces; update `STOREFRONT.md` in the
   backend with the new endpoints.
