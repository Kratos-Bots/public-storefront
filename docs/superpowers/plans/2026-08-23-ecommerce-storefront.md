# ecommerce-storefront Implementation Plan (Spec 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `ecommerce-storefront` — a runtime-themed customer shop (catalog, cart, checkout, WA/TG login, account, order status, tracking, verify) served by one Cloudflare Worker per client — plus the small backend additions it needs (brand/features/theme settings, storefront branding uploads, Turnstile-verified guest checkout).

**Architecture:** One Worker script serves the Mantine SPA's static assets and thin-proxies `/api/*` → `${BACKEND_URL}api/v1/public/*` (allowlisted, edge-cached) and `/media/*` → backend image routes. Everything configurable (brand, features incl. `layout: storefront|menu`, theme, notices, cut-offs, login availability) comes from `GET /api/storefront/settings` at load; the bundle is identical for every client. Backend keeps all business logic (incl. Turnstile verification and courier tracking); the Worker holds no secrets.

**Tech Stack:** React 19.2, Vite 7, TypeScript ~5.9, Mantine 9.5 (`@mantine/core`, `hooks`, `notifications`, `form`, `colors-generator`), react-router 7.13, @tanstack/react-query 5, ky 1.14, zustand 5, zod 4, vitest 4 (+ `@cloudflare/vitest-pool-workers` 0.22 for the Worker), wrangler 4, `@marsidev/react-turnstile`. Backend: Express 5 + Drizzle + zod 4 (existing).

**Spec:** `ecommerce-storefront/docs/superpowers/specs/2026-08-23-ecommerce-storefront-design.md` — read it first. Backend contract: `ecommerce-backend/STOREFRONT.md`.

## Global Constraints

- Two repos are touched: `T:\Projects\ecommerce\ecommerce-backend` (Tasks 1–6, git repo, work on branch `feature/storefront-theme-guest-checkout` off `main`) and `T:\Projects\ecommerce\ecommerce-storefront` (Tasks 7+, new git repo already initialised on `main`, commit directly to `main`). Never touch `ecommerce-menu/` (read it freely — several tasks port from it).
- Backend conventions (from `ecommerce-backend/CLAUDE.md`): 4-file module structure; **extensionless imports** (`from '../../middleware/validate'`); throw `AppError` subclasses from `src/utils/errors` (`ValidationError` = 422, `NotFoundError` = 404, `ServiceUnavailableError` = 503); `validate({ body, query, params })` from `src/middleware/validate`; responses via `sendSuccess(res, data, status?, meta?)` from `src/utils/response`; rate limits via `rateLimit({ windowMs: 15 * 60 * 1000, max: N })` from `src/middleware/rate-limit`; no test runner — verify with `npm run build` (tsc) and curl/tsx scripts against `npm run dev`.
- Backend dev DB (`DATABASE_URL` in `.env`) is a LIVE database with a real Telegram broadcast channel: never seed orders there; verification scripts only touch `bot_settings` keys prefixed `storefront_` and must delete what they created.
- Storefront SPA conventions: `@/*` → `web/src/*`; imports carry `.ts`/`.tsx` extensions (`from '@/lib/format.ts'`); Mantine components + CSS modules (`*.module.css`), **no Tailwind**; colours only via Mantine theme tokens or `--sf-*` CSS variables — never hard-coded hex in components; every feature folder self-contained; cross-feature code in `lib/`, `stores/`, `components/`.
- **All UI tasks (marked `[UI]`) must be executed by a subagent that first loads the `frontend-design:frontend-design` skill** — the user requires this for every frontend change. Logic-only tasks do not need it.
- Worker: wrangler 4 `assets` binding with `run_worker_first: ["/api/*", "/media/*"]` and `not_found_handling: "single-page-application"`; the only Worker var is `BACKEND_URL` (trailing slash); the Worker holds **no secrets**.
- Route allowlist through the Worker (exact): `storefront/`, `catalog`, `catalog/`, `orders/`, `verify/` — `wholesale/` is deliberately excluded (bot-JWT surface). Edge cache: `storefront/settings` 30 s, `catalog`, `catalog/products/:id` 60 s — GET only, never when `Authorization` is present.
- Service-point (collection) delivery is **out of scope** (backend strips `servicePoint*` from storefront checkouts); the address step is home delivery only.
- Backend envelope is `{ success, data, error, meta? }`; the kill switch is `503` + `error === 'STOREFRONT_DISABLED'`; there is no machine-readable `code` field anywhere.
- Copy/format rules: prices via `formatMoney(amount, settings.currency)`; dates via `Intl.DateTimeFormat` in the viewer's locale; storage keys prefixed `sf-` (`sf-session-v1`, `sf-cart-v1`, `sf-theme-v1`, `sf-dismissed-notices-v1`).
- Commit after every task; commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01GcxZST4rkeVRNoYRfHhmv5`.

---

## File map

### Backend (`ecommerce-backend/`)

| File | Change | Responsibility |
|---|---|---|
| `src/modules/storefront-settings/schemas.ts` | modify | add `storefrontBrandSchema`, `storefrontFeaturesSchema`, `storefrontThemeSchema`, new optional PUT fields |
| `src/modules/storefront-settings/service.ts` | modify | new keys, defaults, read/write, expose `brand`/`features`/`theme`/`turnstile` on the public response |
| `src/modules/storefront-settings/branding.ts` | create | storefront logo/favicon upload/get/delete (reuses settings module helpers) |
| `src/modules/storefront-settings/controller.ts` + `router.ts` | modify | branding routes |
| `src/lib/css-sanitizer.ts` | create | `sanitizeCustomCss(css: string): string` (css-tree) |
| `src/lib/turnstile.ts` | create | `verifyTurnstileToken(token, secret, ip)` |
| `src/modules/public-storefront/cart.ts` | modify | `buildGuestCartItems(lines)` |
| `src/modules/public-storefront/checkout.ts` | modify | `buildQuote` takes a cart source; `getGuestCheckoutQuote`, `placeGuestOrder` |
| `src/modules/public-storefront/schemas.ts` | modify | guest quote/checkout schemas |
| `src/modules/public-storefront/tracking.ts` | create | menu Worker's tracking sanitisers + orchestrator (`trackStorefrontOrder`) |
| `src/modules/public-storefront/controller.ts` + `router.ts` | modify | guest + tracking routes |
| `src/modules/public-orders/{service,controller,router}.ts` | modify | `GET /:reference/:accessKey/payment-options` |
| `STOREFRONT.md` | modify | document the new keys, branding routes, guest checkout, tracking, payment-options |

### Storefront (`ecommerce-storefront/`)

| File | Responsibility |
|---|---|
| `package.json`, `wrangler.jsonc`, `.dev.vars.example`, `.gitignore`, `README.md` | root scripts, Worker config |
| `worker/src/index.ts` | fetch handler: dispatch `/api/*`, `/media/*`, else `env.ASSETS.fetch` |
| `worker/src/proxy.ts` | `isAllowedApiPath`, `buildBackendUrl`, `cacheTtlFor`, `proxyApi(request, env, ctx)` |
| `worker/src/media.ts` | `mediaTarget(path, search, backendUrl)`, `proxyMedia(request, env, ctx)` |
| `worker/test/*.test.ts` | vitest-pool-workers tests |
| `web/index.html` | inline theme bootstrap |
| `web/src/main.tsx`, `web/src/app/{App,router,theme-bridge,settings,closed-gate}.tsx/ts` | providers, routes, theme |
| `web/src/api/*.ts` | one module per backend domain (typed) |
| `web/src/types/*.ts` | contract types |
| `web/src/lib/{format,cutoffs,media-url,chat-links,dial-codes,errors}.ts` | pure helpers |
| `web/src/stores/{session,cart,ui}.ts` | zustand stores |
| `web/src/layouts/{StorefrontShell,MenuShell,Chromeless}.tsx` | shells |
| `web/src/features/**` | per spec §4 |
| `web/test/**` | vitest unit tests (jsdom) |
| `e2e/` | Playwright mocked pass |
| `.github/workflows/release.yml` | tag → GitHub Release zip |

---

## Phase A — Backend additions (`ecommerce-backend`, branch `feature/storefront-theme-guest-checkout`)

### Task 1: Brand / features / theme settings keys + public exposure

**Files:**
- Modify: `src/modules/storefront-settings/schemas.ts`
- Modify: `src/modules/storefront-settings/service.ts` (KEYS L32–42, interfaces L53–79, `getStorefrontSettings` L123, `updateStorefrontSettings` L144, `getPublicStorefrontSettings` L191)
- Create: `src/lib/css-sanitizer.ts`
- Modify: `src/docs/registry.ts` (storefront settings doc block near L1076–1100)

**Interfaces:**
- Produces (backend): new `bot_settings` keys `storefront_brand`, `storefront_features`, `storefront_theme`, `storefront_guest_checkout_enabled`, `storefront_turnstile_site_key`, `storefront_turnstile_secret`, `storefront_tracking_api_url`, `storefront_tracking_api_key`; public settings response gains `brand`, `features`, `theme`, `turnstile`; internal exports `getStorefrontTurnstileSecret()` and `getStorefrontTrackingCredentials()`.
- Produces (types used by the SPA, Task 10): exactly the JSON shapes below.

- [ ] **Step 1: Create the CSS sanitiser (pure function, verify with a tsx script)**

`src/lib/css-sanitizer.ts`:

```ts
import * as csstree from 'css-tree';
import { ValidationError } from '../utils/errors';

const MAX_CSS_BYTES = 20 * 1024;
const FORBIDDEN_ATRULES = new Set(['import', 'charset', 'namespace']);
const FORBIDDEN_PROPERTIES = new Set(['behavior', '-moz-binding']);
const FORBIDDEN_FUNCTIONS = new Set(['expression']);

/**
 * Validates a client-authored stylesheet for the storefront. Allowed: any
 * rule whose url() points at a same-origin `/media/` path or a data:image.
 * Rejected (422): @import/@charset/@namespace, behavior/-moz-binding,
 * expression(), any other url() origin, unparsable input, > 20 KB.
 * Returns the stylesheet re-serialised by css-tree (comments dropped).
 */
export function sanitizeCustomCss(css: string): string {
  if (Buffer.byteLength(css, 'utf8') > MAX_CSS_BYTES) {
    throw new ValidationError('Custom CSS must be 20 KB or smaller');
  }
  let ast: csstree.CssNode;
  try {
    ast = csstree.parse(css, {
      parseValue: true,
      onParseError: () => {
        throw new Error('parse');
      },
    });
  } catch {
    throw new ValidationError('Custom CSS could not be parsed');
  }

  csstree.walk(ast, (node) => {
    if (node.type === 'Atrule' && FORBIDDEN_ATRULES.has(node.name.toLowerCase())) {
      throw new ValidationError(`@${node.name} is not allowed in custom CSS`);
    }
    if (node.type === 'Declaration' && FORBIDDEN_PROPERTIES.has(node.property.toLowerCase())) {
      throw new ValidationError(`${node.property} is not allowed in custom CSS`);
    }
    if (node.type === 'Function' && FORBIDDEN_FUNCTIONS.has(node.name.toLowerCase())) {
      throw new ValidationError(`${node.name}() is not allowed in custom CSS`);
    }
    if (node.type === 'Url') {
      const value = node.value.replace(/^['"]|['"]$/g, '').trim();
      const ok = value.startsWith('/media/') || /^data:image\//i.test(value);
      if (!ok) throw new ValidationError('Custom CSS url() must point at /media/ or a data:image');
    }
  });

  return csstree.generate(ast);
}
```

- [ ] **Step 2: Verify the sanitiser with a throwaway script**

Create `scratch/css-sanitizer-check.ts` (do not commit; the repo `.gitignore` should already exclude `scratch/` — if not, delete the file after):

```ts
import { sanitizeCustomCss } from '../src/lib/css-sanitizer';
const ok = sanitizeCustomCss('.sf-hero{background:url("/media/products/1/image?variant=web")} h1{color:red}');
console.log('OK ->', ok);
for (const bad of [
  '@import url(https://evil.example/x.css);',
  'body{background:url(https://evil.example/x.png)}',
  'div{behavior:url(#default#time2)}',
  'div{width:expression(alert(1))}',
  '{{{',
]) {
  try { sanitizeCustomCss(bad); console.log('FAIL (accepted):', bad); }
  catch (e) { console.log('rejected:', bad, '->', (e as Error).message); }
}
```

Run: `npx tsx scratch/css-sanitizer-check.ts`
Expected: the first line prints the regenerated CSS; the five bad inputs each print `rejected:`. Then delete `scratch/css-sanitizer-check.ts`.

- [ ] **Step 3: Add the zod schemas**

Append to `src/modules/storefront-settings/schemas.ts`:

```ts
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a 6-digit hex colour');
const fontName = z.string().trim().min(1).max(50).regex(/^[A-Za-z0-9 ]+$/, 'Font names may contain letters, digits and spaces');

export const storefrontBrandSchema = z.object({
  name: z.string().trim().min(1).max(100),
  shortName: z.string().trim().min(1).max(40),
  tagline: z.string().trim().max(120),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300),
  logoHeight: z.number().int().min(16).max(64),
  links: z.object({
    whatsapp: z.string().url().max(300).nullable(),
    telegram: z.string().url().max(300).nullable(),
  }),
});

export const storefrontFeaturesSchema = z
  .object({
    layout: z.enum(['storefront', 'menu']),
    ordering: z.boolean(),
    guestCheckout: z.boolean(),
    accounts: z.boolean(),
    verify: z.boolean(),
    tracking: z.boolean(),
    wholesale: z.boolean(),
    upsell: z.boolean(),
  })
  .refine((f) => !f.wholesale || f.ordering, { message: 'wholesale requires ordering' })
  .refine((f) => !(f.ordering && !f.accounts) || f.guestCheckout, {
    message: 'ordering without accounts requires guestCheckout',
  });

export const storefrontThemeSchema = z.object({
  scheme: z.enum(['dark', 'light']),
  colors: z.object({
    primary: hexColor,
    bg: hexColor,
    surface: hexColor,
    text: hexColor,
    muted: hexColor,
    success: hexColor,
    warn: hexColor,
    danger: hexColor,
  }),
  fonts: z.object({
    heading: fontName.nullable(),
    body: fontName.nullable(),
    mono: fontName.nullable(),
  }),
  radius: z.enum(['sm', 'md', 'lg', 'xl']),
  density: z.enum(['comfortable', 'compact']),
  customCss: z.string().max(20 * 1024),
});

export type StorefrontBrand = z.infer<typeof storefrontBrandSchema>;
export type StorefrontFeatures = z.infer<typeof storefrontFeaturesSchema>;
export type StorefrontTheme = z.infer<typeof storefrontThemeSchema>;
```

Then extend `updateStorefrontSettingsSchema` (L31–41) with:

```ts
  brand: storefrontBrandSchema.optional(),
  features: storefrontFeaturesSchema.optional(),
  theme: storefrontThemeSchema.optional(),
  guestCheckoutEnabled: z.boolean().optional(),
  turnstileSiteKey: z.string().trim().max(100).nullable().optional(),
  turnstileSecret: z.string().trim().max(100).nullable().optional(),
  trackingApiUrl: z.string().trim().url().max(300).nullable().optional(),
  trackingApiKey: z.string().trim().max(200).nullable().optional(),
```

- [ ] **Step 4: Add keys, defaults and read/write in `service.ts`**

Add to `KEYS` (L32–42):

```ts
  brand: 'storefront_brand',
  features: 'storefront_features',
  theme: 'storefront_theme',
  guestCheckoutEnabled: 'storefront_guest_checkout_enabled',
  turnstileSiteKey: 'storefront_turnstile_site_key',
  turnstileSecret: 'storefront_turnstile_secret',
  trackingApiUrl: 'storefront_tracking_api_url',
  trackingApiKey: 'storefront_tracking_api_key',
```

Add defaults after `DEFAULT_CUTOFFS`:

```ts
export const DEFAULT_FEATURES: StorefrontFeatures = {
  layout: 'storefront', ordering: true, guestCheckout: false, accounts: true,
  verify: true, tracking: false, wholesale: false, upsell: false,
};
// Matches ecommerce-menu's DEFAULT_PALETTE (the `kp` look) so an unthemed client is presentable.
export const DEFAULT_THEME: StorefrontTheme = {
  scheme: 'dark',
  colors: {
    primary: '#ffffff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc',
    muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278',
  },
  fonts: { heading: null, body: null, mono: null },
  radius: 'md',
  density: 'comfortable',
  customCss: '',
};
function defaultBrand(companyName: string): StorefrontBrand {
  return {
    name: companyName, shortName: companyName, tagline: '', title: companyName,
    description: '', logoHeight: 28, links: { whatsapp: null, telegram: null },
  };
}
```

Extend `StorefrontSettings` with `brand: StorefrontBrand | null` (null = not set, resolved against `companyName` at read time), `features: StorefrontFeatures`, `theme: StorefrontTheme`, `guestCheckoutEnabled: boolean`, `turnstileSiteKey: string | null`, `turnstileSecretSet: boolean`, `trackingApiUrl: string | null`, `trackingApiKeySet: boolean`. In `getStorefrontSettings` parse them with the existing `parseJsonSetting(raw, fallback, schema)` helper (brand fallback `null`, features `DEFAULT_FEATURES`, theme `DEFAULT_THEME`); booleans via `=== 'true'`; strings via `normalize`. The two secrets are **never** part of `StorefrontSettings` (so the admin `GET` can never leak them); expose them only through:

```ts
export async function getStorefrontTurnstileSecret(): Promise<string | null> {
  return normalize(await getBotSettingValue(KEYS.turnstileSecret));
}
export async function getStorefrontTrackingCredentials(): Promise<{ url: string; key: string } | null> {
  const [url, key] = await Promise.all([
    getBotSettingValue(KEYS.trackingApiUrl),
    getBotSettingValue(KEYS.trackingApiKey),
  ]);
  return url && key ? { url: url.replace(/\/+$/, ''), key } : null;
}
```

In `updateStorefrontSettings` add, following the existing per-field pattern:

```ts
  if (input.brand !== undefined) await upsertBotSetting({ key: KEYS.brand, value: JSON.stringify(input.brand) });
  if (input.features !== undefined) await upsertBotSetting({ key: KEYS.features, value: JSON.stringify(input.features) });
  if (input.theme !== undefined) {
    const customCss = input.theme.customCss ? sanitizeCustomCss(input.theme.customCss) : '';
    await upsertBotSetting({ key: KEYS.theme, value: JSON.stringify({ ...input.theme, customCss }) });
  }
  if (input.guestCheckoutEnabled !== undefined) await upsertBotSetting({ key: KEYS.guestCheckoutEnabled, value: String(input.guestCheckoutEnabled) });
  if (input.turnstileSiteKey !== undefined) await setOrClearBotSetting(KEYS.turnstileSiteKey, input.turnstileSiteKey);
  if (input.turnstileSecret !== undefined) await setOrClearBotSetting(KEYS.turnstileSecret, input.turnstileSecret);
  if (input.trackingApiUrl !== undefined) await setOrClearBotSetting(KEYS.trackingApiUrl, input.trackingApiUrl);
  if (input.trackingApiKey !== undefined) await setOrClearBotSetting(KEYS.trackingApiKey, input.trackingApiKey);
```

Import `sanitizeCustomCss` from `'../../lib/css-sanitizer'`.

Extend `PublicStorefrontSettings` and `getPublicStorefrontSettings` (L191–225): read `companyName` from the general settings row you already `Promise.all` (`getSettings()` — destructure `{ currency, companyName }`), then add to the returned object:

```ts
    brand: {
      ...(settings.brand ?? defaultBrand(companyName)),
      logoUrl: await getStorefrontBrandingUrl('logo'),       // Task 2; until then: null
      faviconUrl: await getStorefrontBrandingUrl('favicon'), // Task 2; until then: null
    },
    features: settings.features,
    theme: settings.theme,
    turnstile: settings.turnstileSiteKey ? { siteKey: settings.turnstileSiteKey } : null,
```

`features.guestCheckout` (what the SPA renders) and `guestCheckoutEnabled` (the server gate) are intentionally both required for the guest path: the public payload exposes `features.guestCheckout && guestCheckoutEnabled` as `features.guestCheckout` so the SPA sees a single boolean — compute `features: { ...settings.features, guestCheckout: settings.features.guestCheckout && settings.guestCheckoutEnabled }`.

- [ ] **Step 5: Document in `src/docs/registry.ts`**

Add the three new schemas to the storefront settings doc block (same place `storefrontCutoffsSchemaDoc` lives, ~L1085) and to the public settings response doc so Swagger shows `brand`/`features`/`theme`/`turnstile`.

- [ ] **Step 6: Build + live verify**

Run: `npm run build`
Expected: tsc exits 0.

Start `npm run dev` (port from `.env`; if 3000 is busy use `PORT=3001`). Obtain an admin JWT the sanctioned way (see memory `env-dev-db-admin-login-workaround`: create a temp admin with a tsx script and hard-delete it in a `finally`). Then:

```bash
curl -s -X PUT http://localhost:3000/api/v1/storefront-settings -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"features":{"layout":"menu","ordering":true,"guestCheckout":false,"accounts":true,"verify":true,"tracking":false,"wholesale":false,"upsell":false},"theme":{"scheme":"light","colors":{"primary":"#3355ff","bg":"#ffffff","surface":"#f4f6fa","text":"#101828","muted":"#667085","success":"#12b76a","warn":"#f79009","danger":"#f04438"},"fonts":{"heading":"Inter","body":"Inter","mono":null},"radius":"lg","density":"compact","customCss":"h1{letter-spacing:-0.02em}"}}'
curl -s http://localhost:3000/api/v1/public/storefront/settings | jq '.data.features.layout, .data.theme.colors.primary, .data.brand.name, .data.turnstile'
curl -s -X PUT http://localhost:3000/api/v1/storefront-settings -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"features":{"layout":"menu","ordering":true,"guestCheckout":false,"accounts":false,"verify":true,"tracking":false,"wholesale":false,"upsell":false}}'
```

Expected: `"menu"`, `"#3355ff"`, the company name, `null` (no site key yet); the third call returns 422 mentioning `ordering without accounts requires guestCheckout`. Finally delete the keys you wrote: `DELETE` is rejected for the prefix by the generic endpoint, so run a tsx one-liner `db.delete(botSettings).where(inArray(botSettings.key, ['storefront_features','storefront_theme']))`.

- [ ] **Step 7: Commit**

```bash
git checkout -b feature/storefront-theme-guest-checkout
git add src/lib/css-sanitizer.ts src/modules/storefront-settings src/docs/registry.ts
git commit -m "feat(storefront-settings): brand/features/theme keys + css sanitiser, exposed on public settings"
```

---

### Task 2: Storefront branding uploads (logo + favicon)

**Files:**
- Create: `src/modules/storefront-settings/branding.ts`
- Modify: `src/modules/storefront-settings/controller.ts`, `router.ts`
- Modify: `src/modules/storefront-settings/service.ts` (replace the two `null` placeholders from Task 1 with `getStorefrontBrandingUrl`)
- Reuse: `src/middleware/upload.ts` (`uploadSvg`, `uploadFavicon`), `src/lib/svg-sanitizer.ts` (`sanitizeSvg`), `src/lib/s3.ts` (`uploadFile`, `deleteFile`, `getFile`), `src/lib/branding.ts` (`brandingAssetContentType`)

**Interfaces:**
- Produces: `GET /api/v1/storefront-settings/branding/{logo|favicon}` (public), `POST`/`DELETE` same paths (admin JWT, multipart field `image`); `getStorefrontBrandingUrl(kind): Promise<string | null>` returning `/api/v1/storefront-settings/branding/<kind>?v=<timestamp>` or null.

- [ ] **Step 1: Write `branding.ts`**

The asset key is stored in `bot_settings` under `storefront_branding_logo_key` / `storefront_branding_favicon_key` (add both to `KEYS` so they are prefix-protected like the rest). Mirror `src/modules/settings/service.ts:155–215` exactly, but parameterised on those keys:

```ts
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { botSettings } from '../../db/schema';
import { getBotSettingValue, upsertBotSetting } from '../bot-settings/service';
import { uploadFile, deleteFile } from '../../lib/s3';
import { sanitizeSvg } from '../../lib/svg-sanitizer';
import { ValidationError } from '../../utils/errors';

export type StorefrontBrandingKind = 'logo' | 'favicon';
const KEY_FOR: Record<StorefrontBrandingKind, string> = {
  logo: 'storefront_branding_logo_key',
  favicon: 'storefront_branding_favicon_key',
};

export async function getStorefrontBrandingKey(kind: StorefrontBrandingKind): Promise<string | null> {
  return (await getBotSettingValue(KEY_FOR[kind])) ?? null;
}

/** API-relative URL the public settings payload advertises; cache-busted by the key's timestamp. */
export async function getStorefrontBrandingUrl(kind: StorefrontBrandingKind): Promise<string | null> {
  const key = await getStorefrontBrandingKey(kind);
  if (!key) return null;
  const version = key.match(/-(\d+)\.\w+$/)?.[1] ?? '0';
  return `/api/v1/storefront-settings/branding/${kind}?v=${version}`;
}

function isIco(buffer: Buffer): boolean {
  if (buffer.length < 6 + 16) return false;
  const reserved = buffer.readUInt16LE(0);
  const type = buffer.readUInt16LE(2);
  const count = buffer.readUInt16LE(4);
  return reserved === 0 && type === 1 && count >= 1 && buffer.length >= 6 + count * 16;
}
function looksLikeIcoUpload(file: Express.Multer.File): boolean {
  return file.originalname.toLowerCase().endsWith('.ico')
    || file.mimetype === 'image/x-icon' || file.mimetype === 'image/vnd.microsoft.icon';
}

export async function uploadStorefrontBrandingAsset(kind: StorefrontBrandingKind, file: Express.Multer.File) {
  let body: Buffer; let contentType: string; let ext: 'svg' | 'ico';
  if (kind === 'favicon' && looksLikeIcoUpload(file)) {
    if (!isIco(file.buffer)) throw new ValidationError('File is not a valid ICO image');
    body = file.buffer; contentType = 'image/x-icon'; ext = 'ico';
  } else {
    body = sanitizeSvg(file.buffer); contentType = 'image/svg+xml'; ext = 'svg';
  }
  const key = `storefront-branding/${kind}-${Date.now()}.${ext}`;
  await uploadFile(key, body, contentType);
  const oldKey = await getStorefrontBrandingKey(kind);
  await upsertBotSetting({ key: KEY_FOR[kind], value: key });
  if (oldKey) await deleteFile(oldKey).catch(() => {});
  return { url: await getStorefrontBrandingUrl(kind) };
}

export async function deleteStorefrontBrandingAsset(kind: StorefrontBrandingKind) {
  const oldKey = await getStorefrontBrandingKey(kind);
  await db.delete(botSettings).where(eq(botSettings.key, KEY_FOR[kind]));
  if (oldKey) await deleteFile(oldKey).catch(() => {});
  return { url: null };
}
```

(If `isIco`/`looksLikeIcoUpload` can be exported from `settings/service.ts` without widening its surface unreasonably, export and import them instead of duplicating — prefer the export.)

- [ ] **Step 2: Controller + routes**

In `controller.ts` add `uploadBranding(kind)`, `deleteBranding(kind)`, `getBranding(kind)` factories mirroring `src/modules/settings/controller.ts:35–70` (the `getBranding` one streams from `getFile(key)` with `Content-Type: brandingAssetContentType(key)`, `Cache-Control: public, max-age=1209600, immutable` outside development, `Cross-Origin-Resource-Policy: cross-origin`, and `NotFoundError(kind === 'favicon' ? 'Favicon' : 'Logo')` when unset).

In `router.ts` add **before** the admin-only routes (these two GETs are public):

```ts
storefrontSettingsRouter.get('/branding/logo', storefrontSettingsController.getBranding('logo'));
storefrontSettingsRouter.get('/branding/favicon', storefrontSettingsController.getBranding('favicon'));
storefrontSettingsRouter.post('/branding/logo', authenticate, authorize('admin'), uploadSvg, storefrontSettingsController.uploadBranding('logo'));
storefrontSettingsRouter.post('/branding/favicon', authenticate, authorize('admin'), uploadFavicon, storefrontSettingsController.uploadBranding('favicon'));
storefrontSettingsRouter.delete('/branding/logo', authenticate, authorize('admin'), storefrontSettingsController.deleteBranding('logo'));
storefrontSettingsRouter.delete('/branding/favicon', authenticate, authorize('admin'), storefrontSettingsController.deleteBranding('favicon'));
```

Replace the two `null` placeholders in `getPublicStorefrontSettings` with `await getStorefrontBrandingUrl('logo' | 'favicon')`.

- [ ] **Step 3: Build + live verify**

`npm run build` → 0. With the dev server and `$JWT`:

```bash
printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>' > /tmp/l.svg
curl -s -X POST http://localhost:3000/api/v1/storefront-settings/branding/logo -H "Authorization: Bearer $JWT" -F image=@/tmp/l.svg | jq .data.url
curl -sI http://localhost:3000/api/v1/storefront-settings/branding/logo | head -3
curl -s http://localhost:3000/api/v1/public/storefront/settings | jq .data.brand.logoUrl
curl -s -X DELETE http://localhost:3000/api/v1/storefront-settings/branding/logo -H "Authorization: Bearer $JWT" | jq .data
```

Expected: a `/api/v1/storefront-settings/branding/logo?v=…` URL; `200` with `Content-Type: image/svg+xml`; the same URL in the public payload; `{ "url": null }` and the S3 object gone.

- [ ] **Step 4: Commit**

```bash
git add src/modules/storefront-settings
git commit -m "feat(storefront-settings): storefront logo/favicon branding assets"
```

---

### Task 3: Turnstile verification helper

**Files:**
- Create: `src/lib/turnstile.ts`

**Interfaces:**
- Produces: `verifyTurnstileToken(token: string, secret: string, remoteIp?: string): Promise<void>` — throws `ValidationError('Verification failed')` on any non-success.

- [ ] **Step 1: Write it**

```ts
import { ValidationError } from '../utils/errors';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Server-side Turnstile check. Tokens are single-use on Cloudflare's side, so
 * every guest quote/checkout call needs a fresh one from the widget.
 */
export async function verifyTurnstileToken(token: string, secret: string, remoteIp?: string): Promise<void> {
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);
  let ok = false;
  try {
    const res = await fetch(SITEVERIFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(5000),
    });
    const json = (await res.json()) as { success?: boolean };
    ok = res.ok && json.success === true;
  } catch {
    ok = false;
  }
  if (!ok) throw new ValidationError('Verification failed');
}
```

- [ ] **Step 2: Verify with Cloudflare's documented test keys**

`npx tsx -e "import('./src/lib/turnstile').then(m => m.verifyTurnstileToken('XXXX.DUMMY.TOKEN.XXXX','1x0000000000000000000000000000000AA').then(()=>console.log('pass-key ok')).then(()=>m.verifyTurnstileToken('bad','2x0000000000000000000000000000000AA')).catch(e=>console.log('fail-key rejected:', e.message)))"`
Expected: `pass-key ok` then `fail-key rejected: Verification failed` (the `1x…` secret always passes, `2x…` always fails).

- [ ] **Step 3: Commit**

```bash
git add src/lib/turnstile.ts
git commit -m "feat(lib): Turnstile siteverify helper"
```

---

### Task 4: Guest checkout (quote + place) behind the flag

**Files:**
- Modify: `src/modules/public-storefront/cart.ts` (`buildStorefrontCartItems` L116 — widen `customerId` to `number | null`; add `buildGuestCartItems`)
- Modify: `src/modules/public-storefront/checkout.ts` (`buildQuote` L181, `runCheckout` L538, `placeStorefrontOrder` L810)
- Modify: `src/modules/public-storefront/schemas.ts`, `controller.ts`, `router.ts`
- Modify: `STOREFRONT.md` (new §3.5a Guest checkout; §5.1 new keys; §6 branding routes)

**Interfaces:**
- Consumes: `verifyTurnstileToken` (Task 3); `getStorefrontSettings().guestCheckoutEnabled` / `getStorefrontTurnstileSecret()` (Task 1); `resolveOrCreateCustomer` (`src/modules/customers/service.ts:691`); `clientKey` (`src/middleware/rate-limit.ts:10`).
- Produces: `POST /public/storefront/checkout/guest/quote`, `POST /public/storefront/checkout/guest` — same response shapes as the session versions.

- [ ] **Step 1: Schemas**

Append to `src/modules/public-storefront/schemas.ts`:

```ts
const guestLineSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(999),
});
const guestLinesSchema = z.array(guestLineSchema).min(1).max(100)
  .refine((a) => new Set(a.map((l) => l.productId)).size === a.length, 'Duplicate productId in items');

export const guestCheckoutQuoteSchema = checkoutQuoteSchema.omit({ useStoreCredit: true }).extend({
  turnstileToken: z.string().trim().min(1).max(2048),
  items: guestLinesSchema,
});

export const placeGuestOrderSchema = placeStorefrontOrderSchema.omit({ useStoreCredit: true }).extend({
  turnstileToken: z.string().trim().min(1).max(2048),
  items: guestLinesSchema,
  // Guests have no session identity — at least one contact is required regardless of contactModes.
}).refine((b) => Boolean(b.email || b.phone), { message: 'Email or phone is required' });

export type GuestCheckoutQuoteInput = z.infer<typeof guestCheckoutQuoteSchema>;
export type PlaceGuestOrderInput = z.infer<typeof placeGuestOrderSchema>;
```

- [ ] **Step 2: Cart helper for guests**

In `cart.ts`, change `buildStorefrontCartItems(lines: CartLineInput[], customerId: number)` to accept `customerId: number | null` (its custom-price lookup must treat `null` as "no custom prices" — check `getCustomPriceMap`'s signature; if it requires a number, branch: `customerId === null ? new Map() : await getCustomPriceMap(customerId, ids)`). Then add:

```ts
/** Guest checkout: validate + snapshot bare {productId, quantity} lines exactly like PUT /cart, without persisting. */
export async function buildGuestCartItems(lines: CartLineInput[]): Promise<CartItem[]> {
  const { items } = await buildStorefrontCartItems(lines, null);
  return items;
}
```

- [ ] **Step 3: Make `buildQuote` accept a cart source**

Introduce a discriminated source type at the top of `checkout.ts`:

```ts
type CartSource =
  | { kind: 'session'; customerId: number }
  | { kind: 'guest'; items: CartItem[] };
```

Change `buildQuote(customerId: number, input)` to `buildQuote(source: CartSource, input: CheckoutQuoteInput)`:
- Line loading (L182–191): `session` → existing `loadCartForCheckout(source.customerId)` path unchanged; `guest` → `items = source.items`, `inactiveProductIds = []` (already validated by `buildGuestCartItems`).
- `resolveCartLines(items, customerId)` (L193) → pass `source.kind === 'session' ? source.customerId : null`.
- Store credit (L296–306): for `guest`, `storeCreditBalance = 0` and `storeCreditApplied = 0` (skip the DB read).
- Every other use of `customerId` inside `buildQuote` gets the same `session ? id : null` treatment; `listStorefrontPaymentMethods` is unchanged.

Update the two callers: `getCheckoutQuote(customerId, input)` → `buildQuote({ kind: 'session', customerId }, input)`; `runCheckout` (L543) → same with its `customerId`.

- [ ] **Step 4: Guest entry points**

Below `placeStorefrontOrder`, add:

```ts
async function assertGuestCheckoutEnabled(): Promise<string> {
  const settings = await getStorefrontSettings();
  if (!settings.features.guestCheckout || !settings.guestCheckoutEnabled) throw new NotFoundError('Feature');
  const secret = await getStorefrontTurnstileSecret();
  if (!secret) throw new ServiceUnavailableError('Guest checkout is not configured');
  return secret;
}

export async function getGuestCheckoutQuote(input: GuestCheckoutQuoteInput, ip: string) {
  const secret = await assertGuestCheckoutEnabled();
  await verifyTurnstileToken(input.turnstileToken, secret, ip);
  const items = await buildGuestCartItems(input.items);
  return projectQuote(await buildQuote({ kind: 'guest', items }, {
    country: input.country, couponCode: input.couponCode, shippingOptionId: input.shippingOptionId,
  }));
}

export async function placeGuestOrder(input: PlaceGuestOrderInput, ip: string): Promise<StorefrontCheckoutResult> {
  const secret = await assertGuestCheckoutEnabled();
  await verifyTurnstileToken(input.turnstileToken, secret, ip);
  const items = await buildGuestCartItems(input.items);
  const { customer } = await resolveOrCreateCustomer({
    email: input.email, phone: input.phone, acquisitionChannel: 'WEBSITE',
    phoneCountry: input.shippingAddress.country,
  });
  // Same per-customer lock + runCheckout as the session path, with the guest's lines
  // substituted for the stored cart and store credit forced off.
  return placeStorefrontOrder(customer.id, { ...input, useStoreCredit: false }, { kind: 'guest', items });
}
```

Thread the optional third argument through: `placeStorefrontOrder(customerId, input, source: CartSource = { kind: 'session', customerId })` → `runCheckout(customerId, input, source)` → `buildQuote(source, …)`. Inside `runCheckout`, `clearStorefrontCart(customerId)` (L700) must run **only** for `source.kind === 'session'`. Imports: `getStorefrontSettings`, `getStorefrontTurnstileSecret` from `'../storefront-settings/service'`; `verifyTurnstileToken` from `'../../lib/turnstile'`; `resolveOrCreateCustomer` from `'../customers/service'`; `buildGuestCartItems` from `'./cart'`; `NotFoundError`, `ServiceUnavailableError` from `'../../utils/errors'`.

- [ ] **Step 5: Controller + routes**

`controller.ts`:

```ts
export async function getGuestQuote(req: Request, res: Response) {
  sendSuccess(res, await storefrontCheckout.getGuestCheckoutQuote(req.body as GuestCheckoutQuoteInput, clientKey(req)));
}
export async function placeGuestOrder(req: Request, res: Response) {
  sendSuccess(res, await storefrontCheckout.placeGuestOrder(req.body as PlaceGuestOrderInput, clientKey(req)), 201);
}
```

`router.ts`, next to the session checkout routes (L111–130), **no** `authenticateStorefrontCustomer`:

```ts
publicStorefrontRouter.post('/checkout/guest/quote',
  requireStorefrontEnabled, rateLimit({ windowMs: 15 * 60 * 1000, max: 120 }),
  validate({ body: guestCheckoutQuoteSchema }), publicStorefrontController.getGuestQuote);
publicStorefrontRouter.post('/checkout/guest',
  requireStorefrontEnabled, rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }),
  validate({ body: placeGuestOrderSchema }), publicStorefrontController.placeGuestOrder);
```

- [ ] **Step 6: Build + live verify (quote only — never place a real order on the live DB)**

`npm run build` → 0. With the dev server, `$JWT`, and a real leaf product id `$PID` from `GET /api/v1/public/catalog`:

```bash
# flag off → 404
curl -s -X POST http://localhost:3000/api/v1/public/storefront/checkout/guest/quote -H 'Content-Type: application/json' \
  -d "{\"turnstileToken\":\"XXXX.DUMMY.TOKEN.XXXX\",\"items\":[{\"productId\":$PID,\"quantity\":1}],\"country\":\"GB\"}" | jq .error
# enable with Cloudflare's always-pass test secret, storefront enabled
curl -s -X PUT http://localhost:3000/api/v1/storefront-settings -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"enabled":true,"guestCheckoutEnabled":true,"turnstileSiteKey":"1x00000000000000000000AA","turnstileSecret":"1x0000000000000000000000000000000AA","features":{"layout":"storefront","ordering":true,"guestCheckout":true,"accounts":true,"verify":true,"tracking":false,"wholesale":false,"upsell":false}}' | jq '.data.turnstileSecretSet, .data.turnstileSecret'
curl -s -X POST http://localhost:3000/api/v1/public/storefront/checkout/guest/quote -H 'Content-Type: application/json' \
  -d "{\"turnstileToken\":\"XXXX.DUMMY.TOKEN.XXXX\",\"items\":[{\"productId\":$PID,\"quantity\":2}],\"country\":\"GB\"}" | jq '.data.subtotal, .data.storeCredit, (.data.shippingOptions|length)'
curl -s http://localhost:3000/api/v1/public/storefront/settings | jq '.data.turnstile, .data.features.guestCheckout'
```

Expected: `"Feature not found"`; `true` then `null` (secret never echoed); a subtotal, `{balance:0,applied:0,remaining:0}`, ≥1 shipping option; `{ siteKey: "1x00000000000000000000AA" }` and `true`. Then restore: PUT `{"enabled":false,"guestCheckoutEnabled":false,"turnstileSiteKey":null,"turnstileSecret":null}` and delete `storefront_features` with the tsx one-liner from Task 1.

- [ ] **Step 7: Document + commit**

Add to `STOREFRONT.md`: §3.5a Guest checkout (both routes, bodies, 404 when off, 503 when no secret, 422 `Verification failed`), §5.1 rows for the six new keys + two branding-key rows, §6 branding routes, and the `brand`/`features`/`theme`/`turnstile` fields in §5.2.

```bash
git add src/modules/public-storefront STOREFRONT.md
git commit -m "feat(public-storefront): Turnstile-verified guest checkout quote + place behind storefront_guest_checkout_enabled"
```

---

### Task 5: Public tracking lookup endpoint (replaces the menu Worker's `/api/tracking`)

**Files:**
- Create: `src/modules/public-storefront/tracking.ts` (sanitisers + tracking-API client + orchestrator)
- Modify: `src/modules/public-storefront/schemas.ts`, `controller.ts`, `router.ts`
- Modify: `STOREFRONT.md` (new §3.10 Tracking)
- Source to port: `T:\Projects\ecommerce\ecommerce-menu\worker\src\tracking.ts` (417 lines — read it in full; the pure functions `normalizeTrackingNumber`, `sanitizeOrderContext`, `sanitizeShipments`, `collectTrackingNumbers`, `toParcelTracking`, `pickLastMileLink`, `mergeTracking`, `newestCheckedAt`, `fetchTrackingBatch` and the types `TrackedEvent`, `ParcelTracking`, `TrackedParcel`, `TrackingLookup` are copied verbatim; only the orchestrator changes)

**Interfaces:**
- Consumes: `verifyTurnstileToken` (Task 3); `getStorefrontTurnstileSecret` + `getStorefrontTrackingCredentials` (Task 1); the order-by-reference loader `public-orders/service.ts` already uses to build the public order view with `shipments` (reuse it — do not write a new query); `clientKey`.
- Produces: `POST /public/storefront/tracking` body `{ reference: string, turnstileToken: string, refresh?: boolean }` → `TrackingLookup` = `{ reference, status, createdAt, itemCount, isPreorder, parcels: TrackedParcel[], trackingAvailable, checkedAt }` (exact menu shape). 404 unknown reference; 422 `Verification failed`; 503 when no Turnstile secret; 30/15min/IP.

- [ ] **Step 1: Port the pure layer**

Create `tracking.ts` with the menu file's contents from `TRACKING_NUMBER_RE` down to `newestCheckedAt` unchanged (keep the comments — they document security decisions), dropping the `./backend` / `./validate` / `./turnstile` imports. `fetchTrackingBatch(env, numbers, refresh)` becomes `fetchTrackingBatch(creds: { url: string; key: string }, numbers: string[], refresh: boolean)` using `creds.url` / `creds.key`; its body is otherwise unchanged (Node 20 has global `fetch` and `AbortSignal.timeout`).

- [ ] **Step 2: Orchestrator**

```ts
export async function trackStorefrontOrder(
  input: { reference: string; turnstileToken: string; refresh: boolean },
  ip: string,
): Promise<TrackingLookup> {
  const secret = await getStorefrontTurnstileSecret();
  if (!secret) throw new ServiceUnavailableError('Tracking is not configured');
  await verifyTurnstileToken(input.turnstileToken, secret, ip);

  // Same three selects `public-orders/service.ts:76-86` (getPublicOrder) runs; no shared loader exists.
  const order = (await db.select().from(orders).where(eq(orders.reference, input.reference)).limit(1))[0];
  if (!order) throw new NotFoundError('Order');
  const [items, orderShipments] = await Promise.all([
    db.select({ quantity: orderItems.quantity, isPreorder: orderItems.isPreorder }).from(orderItems).where(eq(orderItems.orderId, order.id)),
    db.select().from(shipments).where(eq(shipments.orderId, order.id)),
  ]);

  const context = sanitizeOrderContext(
    { reference: order.reference, status: order.status, createdAt: order.createdAt, isPreorder: order.isPreorder, items },
    input.reference,
  );
  const parcels = sanitizeShipments(orderShipments);
  const numbers = collectTrackingNumbers(parcels);
  const creds = await getStorefrontTrackingCredentials();
  const byNumber = numbers.length && creds ? await fetchTrackingBatch(creds, numbers, input.refresh) : null;
  if (byNumber) mergeTracking(parcels, byNumber);
  return {
    ...context,
    parcels,
    trackingAvailable: numbers.length === 0 ? true : byNumber !== null,
    checkedAt: newestCheckedAt(parcels),
  };
}
```

`sanitizeOrderContext` reads `items[].quantity`, `reference`, `status`, `createdAt`, `isPreorder`; `sanitizeShipments` reads `shipments[]` → `status`, `trackingNumber`, `shippedAt`, `deliveredAt`, `trackingStatusDescription` — all columns on the `shipments` table (`src/db/schema/shipments.ts`), so the raw rows pass straight in. Imports: `db` from `'../../db'`, `orders`, `orderItems` from `'../../db/schema/orders'` (or wherever `public-orders/service.ts` imports them from — copy its import lines), `shipments` from `'../../db/schema/shipments'`, `eq` from `'drizzle-orm'`. If `orderItems` has no `isPreorder` column, drop it from the select — `sanitizeOrderContext` falls back to `order.isPreorder`.

- [ ] **Step 3: Schema, controller, route**

```ts
// schemas.ts
export const trackingLookupSchema = z.object({
  reference: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).transform((r) => r.toUpperCase()),
  turnstileToken: z.string().trim().min(1).max(2048),
  refresh: z.boolean().optional().default(false),
});
export type TrackingLookupInput = z.infer<typeof trackingLookupSchema>;

// controller.ts
export async function trackOrder(req: Request, res: Response) {
  sendSuccess(res, await storefrontTracking.trackStorefrontOrder(req.body as TrackingLookupInput, clientKey(req)));
}

// router.ts
publicStorefrontRouter.post('/tracking',
  requireStorefrontEnabled, rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }),
  validate({ body: trackingLookupSchema }), publicStorefrontController.trackOrder);
```

- [ ] **Step 4: Build + live verify**

`npm run build` → 0. With the storefront enabled and the always-pass Turnstile secret set (Task 4 step 6 commands), and `$REF` = a real order reference that has at least one shipment (read-only — pick one via the admin orders list):

```bash
curl -s -X POST http://localhost:3000/api/v1/public/storefront/tracking -H 'Content-Type: application/json' \
  -d "{\"reference\":\"$REF\",\"turnstileToken\":\"XXXX.DUMMY.TOKEN.XXXX\"}" | jq '.data | {reference, itemCount, trackingAvailable, parcels: (.parcels|length), keys: keys}'
curl -s -X POST http://localhost:3000/api/v1/public/storefront/tracking -H 'Content-Type: application/json' \
  -d '{"reference":"NOPE00","turnstileToken":"XXXX.DUMMY.TOKEN.XXXX"}' | jq .error
```

Expected: the first shows the reference, item count, `trackingAvailable` (`false` with no tracking creds and ≥1 tracking number; `true` when the shipments carry no numbers yet), and the exact key list `["checkedAt","createdAt","isPreorder","itemCount","parcels","reference","status","trackingAvailable"]` — nothing about customer, address, carrier, or prices; the second prints `"Order not found"`. Restore settings afterwards as in Task 4.

- [ ] **Step 5: Document + commit**

```bash
git add src/modules/public-storefront STOREFRONT.md
git commit -m "feat(public-storefront): Turnstile-gated tracking lookup (ported from menu worker)"
```

---

### Task 6: Public payment options for a placed order

**Files:**
- Modify: `src/modules/public-orders/router.ts`, `controller.ts`, `service.ts`
- Modify: `STOREFRONT.md` (§3.9)

**Interfaces:**
- Consumes: `listStorefrontPaymentMethods(country: string | undefined, orderTotal: number)` from `public-storefront/checkout.ts:103`; the existing reference + access-key resolution used by `GET /public/orders/:reference/:accessKey`; `round2`.
- Produces: `GET /public/orders/:reference/:accessKey/payment-options` → `StorefrontPaymentMethod[]` (same shape as `quote.paymentMethods`, incl. `cryptoOptions`), `[]` when the order is not payable.

- [ ] **Step 1: Service**

In `public-orders/service.ts`, next to the function that builds the public order view (it already resolves the order by reference and verifies the access key — reuse that exact function; never duplicate the HMAC check):

```ts
export async function getPublicOrderPaymentOptions(reference: string, accessKey: string) {
  const view = await getPublicOrder(reference, accessKey); // the existing builder; 404 on bad key
  if (!view.payment.canPay) return [];
  const preFeeTotal = round2(view.totals.totalAmount - (view.totals.paymentFeeAmount ?? 0));
  return listStorefrontPaymentMethods(view.shippingAddress?.country, preFeeTotal);
}
```

(Use the builder's real name if it differs from `getPublicOrder`.)

- [ ] **Step 2: Controller + route**

Controller: `sendSuccess(res, await service.getPublicOrderPaymentOptions(req.params.reference, req.params.accessKey))`. Route, mirroring the `payment-method` POST at `public-orders/router.ts:18–19`:

```ts
publicOrdersRouter.get('/:reference/:accessKey/payment-options',
  rateLimit({ windowMs: 15 * 60_000, max: 30 }), validate({ params: publicOrderParamsSchema }),
  publicOrdersController.getPaymentOptions);
```

- [ ] **Step 3: Build + live verify**

`npm run build` → 0. Take a `publicUrl` from any existing order via the admin API (`GET /api/v1/orders/:id` → `publicUrl`), extract `REF`/`KEY`:

```bash
curl -s http://localhost:3000/api/v1/public/orders/$REF/$KEY/payment-options | jq '.data | map({slot, method, chargeTotal})'
```

Expected: `[]` for a paid/non-pending order, or the slot list for a pending one. No writes happen.

- [ ] **Step 4: Document + commit**

```bash
git add src/modules/public-orders STOREFRONT.md
git commit -m "feat(public-orders): payment-options for a placed order (access-key keyed)"
```

Phase A is complete when `npm run build` passes on the branch and all six commits exist. Merge to `main` happens after the SPA is verified against it (final task).

---
## Phase B — Repo scaffold + Worker (`ecommerce-storefront`)

### Task 7: Repository scaffold (root, web, worker, test runners)

**Files:**
- Create: `package.json`, `.gitignore`, `.dev.vars.example`, `wrangler.jsonc`, `tsconfig.base.json`
- Create: `worker/tsconfig.json`, `worker/src/index.ts` (assets-only placeholder), `worker/vitest.config.ts`, `worker/test/smoke.test.ts`
- Create: `web/package.json`, `web/index.html`, `web/vite.config.ts`, `web/tsconfig.json`, `web/tsconfig.app.json`, `web/tsconfig.node.json`, `web/postcss.config.cjs`, `web/vitest.config.ts`, `web/src/main.tsx`, `web/src/app/App.tsx`, `web/src/vite-env.d.ts`, `web/public/_headers`

**Interfaces:**
- Produces: `npm run dev`, `dev:web`, `build`, `typecheck`, `test`, `deploy` at root; `@/` alias; `Env` type for the Worker.

- [ ] **Step 1: Root files**

`package.json`:

```json
{
  "name": "ecommerce-storefront",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev --port 8787",
    "dev:web": "npm --prefix web run dev",
    "build": "npm --prefix web run build && tsc --noEmit -p worker",
    "typecheck": "npm --prefix web run typecheck && tsc --noEmit -p worker",
    "test": "npm --prefix web test && vitest run --config worker/vitest.config.ts",
    "test:web": "npm --prefix web test",
    "test:worker": "vitest run --config worker/vitest.config.ts",
    "deploy": "npm run build && wrangler deploy",
    "postinstall": "npm --prefix web install"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.22.0",
    "@cloudflare/workers-types": "^5.20260823.1",
    "typescript": "~5.9.3",
    "vitest": "^4.1.0",
    "wrangler": "^4.125.0"
  }
}
```

`wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "ecommerce-storefront",
  "main": "worker/src/index.ts",
  "compatibility_date": "2026-08-01",
  "assets": {
    "directory": "./web/dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/media/*"]
  },
  // Per-client values are set at deploy time (Spec 3) or via .dev.vars locally.
  "vars": { "BACKEND_URL": "http://localhost:3000/" },
  "workers_dev": false,
  "preview_urls": false,
  "observability": { "enabled": true }
}
```

`.dev.vars.example`:

```
BACKEND_URL=http://localhost:3000/
```

`.gitignore`: `node_modules/`, `web/dist/`, `.dev.vars`, `.wrangler/`, `*.tsbuildinfo`, `e2e/screenshots/`, `test-results/`.

`worker/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "strict": true,
    "noEmit": true, "skipLibCheck": true, "types": ["@cloudflare/workers-types/2023-07-01"],
    "lib": ["ES2022"]
  },
  "include": ["src", "test"]
}
```

`worker/src/index.ts` (placeholder, replaced in Task 8):

```ts
export interface Env {
  ASSETS: Fetcher;
  BACKEND_URL: string;
}

export default {
  async fetch(request, env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
```

`worker/vitest.config.ts`:

```ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    include: ['worker/test/**/*.test.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: '../wrangler.jsonc' },
        miniflare: { bindings: { BACKEND_URL: 'https://backend.test/' } },
      },
    },
  },
});
```

`worker/test/smoke.test.ts`:

```ts
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('worker env', () => {
  it('exposes BACKEND_URL', () => {
    expect(env.BACKEND_URL).toBe('https://backend.test/');
  });
});
```

- [ ] **Step 2: Web scaffold**

`web/package.json`:

```json
{
  "name": "ecommerce-storefront-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run",
    "preview": "vite preview"
  },
  "dependencies": {
    "@mantine/colors-generator": "^9.5.2",
    "@mantine/core": "^9.5.2",
    "@mantine/form": "^9.5.2",
    "@mantine/hooks": "^9.5.2",
    "@mantine/notifications": "^9.5.2",
    "@marsidev/react-turnstile": "^1.6.0",
    "@tanstack/react-query": "^5.90.0",
    "ky": "^1.14.3",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-router": "^7.13.0",
    "zod": "^4.3.6",
    "zustand": "^5.0.11"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.3.0",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^5.1.1",
    "jsdom": "^26.0.0",
    "postcss": "^8.5.0",
    "postcss-preset-mantine": "^1.18.0",
    "postcss-simple-vars": "^7.0.1",
    "typescript": "~5.9.3",
    "vite": "^7.3.1",
    "vitest": "^4.1.0"
  }
}
```

(Run `npm install` in `web/` and let npm settle exact minors; if a listed version does not resolve, take the nearest published one and note it in the commit body.)

`web/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
      '/media': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
```

`web/postcss.config.cjs`:

```js
module.exports = {
  plugins: {
    'postcss-preset-mantine': {},
    'postcss-simple-vars': {
      variables: { 'mantine-breakpoint-xs': '36em', 'mantine-breakpoint-sm': '48em', 'mantine-breakpoint-md': '62em', 'mantine-breakpoint-lg': '75em', 'mantine-breakpoint-xl': '88em' },
    },
  },
};
```

`web/vitest.config.ts`:

```ts
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, defineConfig({
  test: { environment: 'jsdom', globals: false, include: ['test/**/*.test.{ts,tsx}'], setupFiles: ['test/setup.ts'] },
}));
```

`web/test/setup.ts`: `import '@testing-library/jest-dom/vitest';` plus a `window.matchMedia` stub (Mantine needs it under jsdom):

```ts
import '@testing-library/jest-dom/vitest';
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }),
});
```

`web/tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json`: copy the admin SPA's (`ecommerce-admin-frontend/`) three files verbatim, then in `tsconfig.app.json` set `"paths": { "@/*": ["./src/*"] }`, `"baseUrl": "."`, `"allowImportingTsExtensions": true`, `"include": ["src", "test"]`.

`web/index.html` (the bootstrap script is filled in by Task 12; keep the marker comment):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="dark light" />
    <title>Shop</title>
    <!-- sf-theme-bootstrap -->
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`web/src/main.tsx`:

```tsx
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`web/src/app/App.tsx` (placeholder, replaced in Task 14):

```tsx
import { MantineProvider, Text } from '@mantine/core';

export function App() {
  return (
    <MantineProvider>
      <Text>storefront</Text>
    </MantineProvider>
  );
}
```

`web/public/_headers`:

```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

- [ ] **Step 3: Install and verify every script runs**

```bash
npm install            # root (also installs web/ via postinstall)
npm run typecheck
npm run test:worker
npm run build
```

Expected: typecheck clean; the smoke test passes; `web/dist/index.html` exists and the worker typechecks. Then `npm run dev` in one terminal and `curl -s http://localhost:8787/ | head -3` → the built `index.html`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold worker + web (Vite, Mantine 9, vitest, wrangler assets)"
```

---

### Task 8: Worker `/api/*` reverse proxy with allowlist + edge cache

**Files:**
- Create: `worker/src/proxy.ts`
- Modify: `worker/src/index.ts`
- Test: `worker/test/proxy.test.ts`

**Interfaces:**
- Produces: `isAllowedApiPath(rest: string): boolean`, `buildBackendUrl(backendUrl: string, rest: string, search: string): URL`, `cacheTtlFor(rest: string): number` (seconds, 0 = no cache), `proxyApi(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>`.

- [ ] **Step 1: Write the failing tests**

```ts
import { env, createExecutionContext, waitOnExecutionContext, fetchMock } from 'cloudflare:test';
import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import { isAllowedApiPath, buildBackendUrl, cacheTtlFor } from '../src/proxy';
import worker from '../src/index';

beforeAll(() => { fetchMock.activate(); fetchMock.disableNetConnect(); });
afterEach(() => fetchMock.assertNoPendingInterceptors());

describe('allowlist', () => {
  it.each(['storefront/settings', 'storefront/cart', 'storefront/tracking', 'catalog', 'catalog/products/4', 'orders/ABC/key', 'orders/ABC/key/payment-options', 'verify/x/y'])('allows %s', (p) => {
    expect(isAllowedApiPath(p)).toBe(true);
  });
  it.each(['', 'products', 'users', 'bot-settings', 'storefront-settings', 'catalogue', 'auth/login', 'wholesale/catalog', '../products'])('blocks %s', (p) => {
    expect(isAllowedApiPath(p)).toBe(false);
  });
});

describe('buildBackendUrl', () => {
  it('joins under api/v1/public and keeps the query', () => {
    expect(buildBackendUrl('https://b.test/', 'catalog/products/4', '?x=1').toString()).toBe('https://b.test/api/v1/public/catalog/products/4?x=1');
  });
});

describe('cacheTtlFor', () => {
  it('caches settings 30s, catalog 60s, nothing else', () => {
    expect(cacheTtlFor('storefront/settings')).toBe(30);
    expect(cacheTtlFor('catalog')).toBe(60);
    expect(cacheTtlFor('catalog/products/9')).toBe(60);
    expect(cacheTtlFor('storefront/cart')).toBe(0);
  });
});

describe('fetch /api/*', () => {
  it('404s a blocked path without contacting the backend', async () => {
    const res = await worker.fetch(new Request('https://shop.test/api/products'), env, createExecutionContext());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, data: null, error: 'Not found' });
  });

  it('forwards an allowed path with Authorization + X-Forwarded-For and strips cookies', async () => {
    fetchMock.get('https://backend.test').intercept({ path: '/api/v1/public/storefront/cart', method: 'GET' })
      .reply(200, ({ headers }) => {
        const h = headers as Record<string, string>;
        return JSON.stringify({ auth: h.authorization, xff: h['x-forwarded-for'], cookie: h.cookie ?? null });
      }, { headers: { 'content-type': 'application/json' } });
    const req = new Request('https://shop.test/api/storefront/cart', {
      headers: { Authorization: 'Bearer tok', Cookie: 'a=b', 'CF-Connecting-IP': '203.0.113.9' },
    });
    const res = await worker.fetch(req, env, createExecutionContext());
    expect(await res.json()).toEqual({ auth: 'Bearer tok', xff: '203.0.113.9', cookie: null });
  });

  it('serves settings from cache on the second hit', async () => {
    fetchMock.get('https://backend.test').intercept({ path: '/api/v1/public/storefront/settings', method: 'GET' })
      .reply(200, '{"success":true,"data":{"enabled":true}}', { headers: { 'content-type': 'application/json' } }).times(1);
    const ctx = createExecutionContext();
    const a = await worker.fetch(new Request('https://shop.test/api/storefront/settings'), env, ctx);
    await waitOnExecutionContext(ctx);
    const b = await worker.fetch(new Request('https://shop.test/api/storefront/settings'), env, createExecutionContext());
    expect(a.headers.get('X-SF-Cache')).toBe('MISS');
    expect(b.headers.get('X-SF-Cache')).toBe('HIT');
    expect(await b.json()).toEqual({ success: true, data: { enabled: true } });
  });

  it('returns 502 when the backend is unreachable', async () => {
    fetchMock.get('https://backend.test').intercept({ path: '/api/v1/public/catalog', method: 'GET' }).replyWithError(new Error('boom'));
    const res = await worker.fetch(new Request('https://shop.test/api/catalog?nocache=1'), env, createExecutionContext());
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ success: false, data: null, error: 'Backend unavailable' });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:worker`
Expected: FAIL — `../src/proxy` not found.

- [ ] **Step 3: Implement `proxy.ts`**

```ts
import type { Env } from './index';

const ALLOWED_PREFIXES = ['storefront/', 'catalog', 'orders/', 'verify/'];
const CACHE_RULES: Array<[RegExp, number]> = [
  [/^storefront\/settings$/, 30],
  [/^catalog$/, 60],
  [/^catalog\/products\/\d+$/, 60],
];
const STRIP_REQUEST_HEADERS = ['cookie', 'host', 'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip'];

export function isAllowedApiPath(rest: string): boolean {
  if (!rest || rest.includes('..')) return false;
  return ALLOWED_PREFIXES.some((p) => (p.endsWith('/') ? rest.startsWith(p) : rest === p || rest.startsWith(p + '/')));
}

export function buildBackendUrl(backendUrl: string, rest: string, search: string): URL {
  const base = backendUrl.endsWith('/') ? backendUrl : backendUrl + '/';
  return new URL(`${base}api/v1/public/${rest}${search}`);
}

export function cacheTtlFor(rest: string): number {
  for (const [re, ttl] of CACHE_RULES) if (re.test(rest)) return ttl;
  return 0;
}

function envelope(status: number, error: string): Response {
  return new Response(JSON.stringify({ success: false, data: null, error }), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function forwardHeaders(request: Request): Headers {
  const out = new Headers();
  request.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (STRIP_REQUEST_HEADERS.includes(k) || k.startsWith('cf-')) return;
    out.set(key, value);
  });
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) out.set('X-Forwarded-For', ip);
  out.set('X-Forwarded-Proto', 'https');
  return out;
}

export async function proxyApi(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const rest = url.pathname.replace(/^\/api\//, '');
  if (!isAllowedApiPath(rest)) return envelope(404, 'Not found');

  const target = buildBackendUrl(env.BACKEND_URL, rest, url.search);
  const ttl = request.method === 'GET' && !request.headers.has('authorization') ? cacheTtlFor(rest) : 0;
  const cache = caches.default;
  const cacheKey = new Request(target.toString(), { method: 'GET' });

  if (ttl > 0) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const h = new Headers(hit.headers); h.set('X-SF-Cache', 'HIT');
      return new Response(hit.body, { status: hit.status, headers: h });
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      method: request.method,
      headers: forwardHeaders(request),
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    });
  } catch {
    return envelope(502, 'Backend unavailable');
  }

  const headers = new Headers(upstream.headers);
  headers.delete('set-cookie');
  headers.set('X-SF-Cache', ttl > 0 ? 'MISS' : 'BYPASS');
  headers.set('cache-control', ttl > 0 ? `public, max-age=${ttl}` : 'no-store');
  const response = new Response(upstream.body, { status: upstream.status, headers });
  if (ttl > 0 && upstream.status === 200) ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
```

`worker/src/index.ts`:

```ts
import { proxyApi } from './proxy';

export interface Env {
  ASSETS: Fetcher;
  BACKEND_URL: string;
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) return proxyApi(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 4: Run tests**

Run: `npm run test:worker`
Expected: all pass. (If `fetchMock` header introspection differs, assert on the intercepted request via `.intercept({ path, headers: {...} })` instead — behaviour under test is unchanged.)

- [ ] **Step 5: Commit**

```bash
git add worker
git commit -m "feat(worker): allowlisted /api reverse proxy with edge cache"
```

---

### Task 9: Worker `/media/*` image proxy

**Files:**
- Create: `worker/src/media.ts`
- Modify: `worker/src/index.ts`
- Test: `worker/test/media.test.ts`

**Interfaces:**
- Produces: `mediaTarget(pathname: string, search: string, backendUrl: string): URL | null`, `proxyMedia(request, env, ctx): Promise<Response>`. Public path contract (used by the SPA, Task 12): `/media/products/:id/image?variant=web|thumbnail`, `/media/settings/branding/{logo|favicon}`, `/media/storefront-settings/branding/{logo|favicon}`.

- [ ] **Step 1: Failing tests**

```ts
import { env, createExecutionContext, fetchMock } from 'cloudflare:test';
import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import { mediaTarget } from '../src/media';
import worker from '../src/index';

beforeAll(() => { fetchMock.activate(); fetchMock.disableNetConnect(); });
afterEach(() => fetchMock.assertNoPendingInterceptors());

describe('mediaTarget', () => {
  it('maps product images', () => {
    expect(mediaTarget('/media/products/12/image', '?variant=thumbnail', 'https://b.test/')?.toString())
      .toBe('https://b.test/api/v1/products/12/image?variant=thumbnail');
  });
  it('maps branding', () => {
    expect(mediaTarget('/media/storefront-settings/branding/logo', '?v=3', 'https://b.test/')?.toString())
      .toBe('https://b.test/api/v1/storefront-settings/branding/logo?v=3');
    expect(mediaTarget('/media/settings/branding/favicon', '', 'https://b.test/')?.toString())
      .toBe('https://b.test/api/v1/settings/branding/favicon');
  });
  it('rejects anything else', () => {
    expect(mediaTarget('/media/products/12', '', 'https://b.test/')).toBeNull();
    expect(mediaTarget('/media/users/1/avatar', '', 'https://b.test/')).toBeNull();
    expect(mediaTarget('/media/../api/v1/users', '', 'https://b.test/')).toBeNull();
  });
});

describe('fetch /media/*', () => {
  it('proxies with a 1-day cache header and no cookies', async () => {
    fetchMock.get('https://backend.test').intercept({ path: '/api/v1/products/5/image?variant=web', method: 'GET' })
      .reply(200, 'PNGDATA', { headers: { 'content-type': 'image/png', 'set-cookie': 'x=1' } });
    const res = await worker.fetch(new Request('https://shop.test/media/products/5/image?variant=web'), env, createExecutionContext());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400');
    expect(res.headers.get('set-cookie')).toBeNull();
  });
  it('404s unknown media paths', async () => {
    const res = await worker.fetch(new Request('https://shop.test/media/whatever'), env, createExecutionContext());
    expect(res.status).toBe(404);
  });
  it('405s non-GET', async () => {
    const res = await worker.fetch(new Request('https://shop.test/media/products/5/image', { method: 'POST' }), env, createExecutionContext());
    expect(res.status).toBe(405);
  });
});
```

- [ ] **Step 2: Run → fails (module missing).**

- [ ] **Step 3: Implement**

```ts
import type { Env } from './index';

const RULES: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^\/media\/products\/(\d+)\/image$/, (m) => `api/v1/products/${m[1]}/image`],
  [/^\/media\/settings\/branding\/(logo|favicon)$/, (m) => `api/v1/settings/branding/${m[1]}`],
  [/^\/media\/storefront-settings\/branding\/(logo|favicon)$/, (m) => `api/v1/storefront-settings/branding/${m[1]}`],
];

export function mediaTarget(pathname: string, search: string, backendUrl: string): URL | null {
  if (pathname.includes('..')) return null;
  for (const [re, build] of RULES) {
    const m = pathname.match(re);
    if (m) {
      const base = backendUrl.endsWith('/') ? backendUrl : backendUrl + '/';
      return new URL(base + build(m) + search);
    }
  }
  return null;
}

export async function proxyMedia(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
  const url = new URL(request.url);
  const target = mediaTarget(url.pathname, url.search, env.BACKEND_URL);
  if (!target) return new Response('Not found', { status: 404 });

  const cache = caches.default;
  const key = new Request(target.toString(), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), { method: 'GET', headers: { accept: request.headers.get('accept') ?? '*/*' } });
  } catch {
    return new Response('Upstream unavailable', { status: 502 });
  }
  if (!upstream.ok) return new Response(null, { status: upstream.status === 404 ? 404 : 502 });

  const headers = new Headers();
  headers.set('content-type', upstream.headers.get('content-type') ?? 'application/octet-stream');
  headers.set('cache-control', 'public, max-age=86400');
  const etag = upstream.headers.get('etag'); if (etag) headers.set('etag', etag);
  const res = new Response(upstream.body, { status: 200, headers });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
```

Add to `index.ts` before the assets fallthrough: `if (pathname.startsWith('/media/')) return proxyMedia(request, env, ctx);`

- [ ] **Step 4: Run tests → pass. Commit.**

```bash
git add worker
git commit -m "feat(worker): /media image proxy with 1-day edge cache"
```

---

Phase B is complete when `npm run test:worker` passes and `npm run build` produces `web/dist`.

---
## Phase C — SPA foundation (`ecommerce-storefront/web`)

### Task 10: Contract types + API client + settings query + closed gate

**Files:**
- Create: `web/src/types/settings.ts`, `catalog.ts`, `cart.ts`, `checkout.ts`, `orders.ts`, `profile.ts`, `public-order.ts`, `tracking.ts`, `auth.ts`
- Create: `web/src/lib/errors.ts`, `web/src/api/client.ts`, `web/src/api/settings.ts`
- Create: `web/src/app/settings.ts`, `web/src/app/closed-gate.ts`
- Test: `web/test/api-client.test.ts`

**Interfaces:**
- Produces: every type below (later tasks import them by name); `api` (ky instance, prefix `/api`), `unwrap<T>(p: Promise<Response>): Promise<T>`, `unwrapWithMeta<T>`, `ApiError { status, message, isStorefrontDisabled }`; `useSettings()` (react-query, key `['settings']`); `closedGate` store `{ closed: boolean; setClosed(v) }`.

- [ ] **Step 1: Types (verbatim from `STOREFRONT.md` — do not "improve" field names)**

`types/settings.ts`:

```ts
export type NoticeStyle = 'info' | 'warning' | 'promo';
export interface Notice { id: string; style: NoticeStyle; title: string | null; body: string; startsAt: string | null; endsAt: string | null; active: boolean }
export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export interface CutoffDay { enabled: boolean; cutoff: string; shipsOn: string }
export interface Cutoffs { timezone: string; days: Record<DayKey, CutoffDay> }
export type ContactFieldMode = 'required' | 'optional' | 'hidden';
export interface ContactModes { phoneMode: ContactFieldMode; emailMode: ContactFieldMode; defaultPhoneCountry: string | null }
export interface SupportLink { label: string; url: string }
export interface Brand {
  name: string; shortName: string; tagline: string; title: string; description: string;
  logoUrl: string | null; faviconUrl: string | null; logoHeight: number;
  links: { whatsapp: string | null; telegram: string | null };
}
export type LayoutKind = 'storefront' | 'menu';
export interface Features {
  layout: LayoutKind; ordering: boolean; guestCheckout: boolean; accounts: boolean;
  verify: boolean; tracking: boolean; wholesale: boolean; upsell: boolean;
}
export interface Theme {
  scheme: 'dark' | 'light';
  colors: { primary: string; bg: string; surface: string; text: string; muted: string; success: string; warn: string; danger: string };
  fonts: { heading: string | null; body: string | null; mono: string | null };
  radius: 'sm' | 'md' | 'lg' | 'xl';
  density: 'comfortable' | 'compact';
  customCss: string;
}
export interface StorefrontSettings {
  enabled: boolean; closedMessage: string; welcomeMessage: string | null;
  notices: Notice[]; cutoffs: Cutoffs; serverTime: string; contactModes: ContactModes;
  currency: string; supportLinks: SupportLink[];
  login: { whatsapp: { available: boolean; number: string | null }; telegram: { available: boolean; botUsername: string | null } };
  brand: Brand; features: Features; theme: Theme; turnstile: { siteKey: string } | null;
}
```

`types/catalog.ts`:

```ts
export interface PricingTier { id: number; minQuantity: number; price: number }
export interface Product {
  id: number; sku: string; name: string; displayName: string; shortDisplayName: string | null;
  description: string | null; categoryId: number | null; categoryName: string | null; sortOrder: number;
  price: number; inStock: boolean; lowStockAlert: boolean; isActive: boolean; isPreorder: boolean;
  preorderEta: number | null; pricingTiers: PricingTier[]; upsellProductIds: number[];
  excludedFromFreeShipping: boolean; imageProductId: number | null; provenance: string | null;
}
export interface Category { id: number; name: string; slug: string | null; parentId: number | null; sortOrder: number; emoji: string | null }
export interface Catalog { products: Product[]; categories: Category[] }
export type StockStatus = 'in' | 'low' | 'out';
```

`types/cart.ts`:

```ts
export interface ServerCartLine {
  productId: number; name: string; quantity: number; unitPrice: number; lineTotal: number;
  imageUrl: string | null; isPreorder: boolean; outOfStock: boolean; priceChanged: boolean; inactive: boolean;
}
export interface ServerCart { items: ServerCartLine[]; subtotal: number; itemCount: number }
export interface CartLineInput { productId: number; quantity: number }
```

`types/checkout.ts`:

```ts
export interface QuoteItem { productId: number; name: string; sku: string | null; quantity: number; unitPrice: number; lineTotal: number; tierApplied: boolean; isPreorder: boolean }
export interface QuoteCoupon { code: string; discountAmount: number; shippingDiscount: number; autoApplied: boolean }
export interface ShippingOption { id: number; name: string; courier: string | null; price: number; freeShipping: boolean }
export interface CryptoOption { coin: string; network: string; coinLabel: string; networkLabel: string; feeType: string | null; feeValue: number | null; feeRateText: string; feeLabel: string; fee: number; chargeTotal: number }
export interface PaymentMethod {
  slot: 'card' | 'crypto' | 'manual'; method: string; displayName: string; type: 'gateway' | 'crypto' | 'offline';
  details: Record<string, string> | null; feeType: string | null; feeValue: number | null; feeRateText: string; feeLabel: string;
  fee: number; chargeTotal: number; cryptoOptions?: CryptoOption[];
}
export interface Quote {
  items: QuoteItem[]; subtotal: number; coupon: QuoteCoupon | null; shippingOptions: ShippingOption[];
  selectedShippingOptionId: number | null; shippingAmount: number;
  storeCredit: { balance: number; applied: number; remaining: number };
  grandTotal: number; amountDue: number; paymentMethods: PaymentMethod[];
  contactModes: import('./settings.ts').ContactModes;
}
export interface QuoteInput { country?: string; couponCode?: string; shippingOptionId?: number; useStoreCredit?: boolean }
export interface ShippingAddressInput {
  firstName: string; surname: string; addressLine1: string; addressLine2?: string | null; addressLine3?: string | null;
  city: string; county?: string | null; zip: string; country: string;
}
export interface CheckoutInput {
  shippingAddress: ShippingAddressInput; email?: string; phone?: string; shippingOptionId: number; couponCode?: string;
  paymentMethod?: string; coin?: string; network?: string; useStoreCredit?: boolean; notes?: string;
}
export type CheckoutPayment =
  | { type: 'none' }
  | { type: 'checkout_url'; paymentId: number; method: string; amount: number; url: string }
  | { type: 'manual'; paymentId: number; method: string; displayName: string; amount: number; instructions: Record<string, string> }
  | { type: 'crypto'; paymentId: number; method: string; coin: string; network: string; coinLabel: string; networkLabel: string; address: string; coinAmount: string; fiatAmount: number; qrData: string; walletLinks: Array<{ label: string; url: string }> };
export interface CheckoutResult { reference: string; publicUrl: string | null; status: string; total: number; payment: CheckoutPayment; warning?: string }
export interface GuestQuoteInput extends Omit<QuoteInput, 'useStoreCredit'> { turnstileToken: string; items: import('./cart.ts').CartLineInput[] }
export interface GuestCheckoutInput extends Omit<CheckoutInput, 'useStoreCredit'> { turnstileToken: string; items: import('./cart.ts').CartLineInput[] }
```

`types/orders.ts` (session endpoints):

```ts
export interface OrderSummary { reference: string; status: string; createdAt: string; totalAmount: number; outstandingBalance: number }
export interface OrderShipment { status: string; carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; trackingStatusDescription: string | null; shippedAt: string | null; deliveredAt: string | null }
export interface OrderDetail {
  reference: string; status: string; createdAt: string;
  items: Array<{ name: string; quantity: number; unitPrice: number; lineTotal: number }>;
  subtotal: number; shippingAmount: number; discountAmount: number; totalAmount: number;
  payments: Array<{ method: string; amount: number; status: string; createdAt: string }>;
  outstandingBalance: number; shipments: OrderShipment[]; publicUrl: string | null;
}
export interface PageMeta { page: number; limit: number; totalItems: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean }
```

`types/profile.ts`:

```ts
export interface Profile {
  loyaltyPoints: number; storeCreditBalance: number; referralCode: string; referralsCount: number; referredPeopleCount: number;
  hasReferrer: boolean; referrerNickname: string | null; totalOrders: number; totalSpend: number; memberSince: string;
  nickname: string | null; identities: { telegram: boolean; whatsapp: boolean; email: boolean };
}
export interface RedeemOption { id: number; label: string; pointsCost: number; creditValue: number; affordable: boolean }
export interface RedeemOptions { loyaltyPoints: number; options: RedeemOption[] }
export interface RedeemResult { pointsDeducted: number; creditAwarded: number; newPointsBalance: number; newCreditBalance: number }
```

`types/public-order.ts` — copy `ecommerce-menu/web/src/types/order.ts` verbatim (it already matches the backend's public order view: `PublicOrder`, `OrderItem`, `OrderTotals`, `ShippingAddress`, `Shipment`, `PublicCryptoPayment`, `ActivePayment`, `OrderPaymentState`, `PublicOrderStatus`, `ShipmentStatus`), then add:

```ts
export type CryptoTxidVerification = 'confirmed' | 'checking' | 'needs_review';
export interface SelectPaymentResult {
  paymentId: number; method: string; kind: 'gateway' | 'crypto' | 'other'; status: string; checkoutUrl: string | null;
  crypto: { coin: string; network: string; coinLabel: string; networkLabel: string; address: string; coinAmount: string; fiatAmount: number; verificationStatus: string } | null;
}
```

`types/tracking.ts` — copy `ecommerce-menu/web/src/types/tracking.ts` verbatim.

`types/auth.ts`:

```ts
export interface WhatsappStart { attemptId: string; attemptSecret: string; code: string; waLink: string; expiresAt: string }
export type AttemptStatus = 'pending' | 'completed' | 'expired';
export interface LoginResult { token: string; customer: { id: number; nickname: string | null } }
export interface TelegramAuthPayload { id: number | string; auth_date: number | string; hash: string; first_name?: string; last_name?: string; username?: string; photo_url?: string }
```

- [ ] **Step 2: Failing tests for the client**

`web/test/api-client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, unwrap, ApiError } from '@/api/client.ts';
import { useSessionStore } from '@/stores/session.ts';
import { closedGate } from '@/app/closed-gate.ts';

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}

describe('api client', () => {
  beforeEach(() => { useSessionStore.getState().clear(); closedGate.getState().setClosed(false); });
  afterEach(() => vi.restoreAllMocks());

  it('unwraps the envelope', async () => {
    mockFetch(200, { success: true, data: { a: 1 }, error: null });
    await expect(unwrap<{ a: number }>(api.get('storefront/settings'))).resolves.toEqual({ a: 1 });
  });

  it('adds the bearer token when a session exists', async () => {
    useSessionStore.getState().setSession('tok123', { id: 1, nickname: null });
    const spy = mockFetch(200, { success: true, data: null, error: null });
    await unwrap(api.get('storefront/profile'));
    const req = spy.mock.calls[0]![0] as Request;
    expect(req.headers.get('authorization')).toBe('Bearer tok123');
  });

  it('clears the session on 401 and throws ApiError', async () => {
    useSessionStore.getState().setSession('tok', { id: 1, nickname: null });
    mockFetch(401, { success: false, data: null, error: 'Unauthorized' });
    await expect(unwrap(api.get('storefront/cart'))).rejects.toMatchObject({ status: 401 });
    expect(useSessionStore.getState().token).toBeNull();
  });

  it('flips the closed gate on STOREFRONT_DISABLED', async () => {
    mockFetch(503, { success: false, data: null, error: 'STOREFRONT_DISABLED' });
    const err = await unwrap(api.get('storefront/cart')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).isStorefrontDisabled).toBe(true);
    expect(closedGate.getState().closed).toBe(true);
  });

  it('surfaces the backend message on 422', async () => {
    mockFetch(422, { success: false, data: null, error: 'Minimum spend of 50 not met' });
    await expect(unwrap(api.post('storefront/checkout/quote'))).rejects.toMatchObject({ status: 422, message: 'Minimum spend of 50 not met' });
  });
});
```

- [ ] **Step 3: Run → fails (modules missing).**

`npm --prefix web test` → cannot resolve `@/api/client.ts`.

- [ ] **Step 4: Implement**

`web/src/lib/errors.ts`:

```ts
export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = 'ApiError'; }
  get isStorefrontDisabled(): boolean { return this.status === 503 && this.message === 'STOREFRONT_DISABLED'; }
  get isUnauthorized(): boolean { return this.status === 401; }
}
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'Too many attempts — please wait a moment and try again';
    if (err.status === 502) return 'The store is temporarily unavailable';
    return err.message || fallback;
  }
  return fallback;
}
```

`web/src/app/closed-gate.ts`:

```ts
import { create } from 'zustand';
export const closedGate = create<{ closed: boolean; setClosed: (v: boolean) => void }>((set) => ({
  closed: false,
  setClosed: (closed) => set({ closed }),
}));
```

`web/src/api/client.ts`:

```ts
import ky, { HTTPError } from 'ky';
import { ApiError } from '@/lib/errors.ts';
import { useSessionStore } from '@/stores/session.ts';
import { closedGate } from '@/app/closed-gate.ts';

interface Envelope<T> { success: boolean; data: T; error: string | null; meta?: unknown }

export const api = ky.create({
  prefixUrl: '/api',
  timeout: 20_000,
  retry: { limit: 1, methods: ['get'] },
  hooks: {
    beforeRequest: [(req) => {
      const token = useSessionStore.getState().token;
      if (token) req.headers.set('Authorization', `Bearer ${token}`);
    }],
  },
});

async function toApiError(err: unknown): Promise<never> {
  if (err instanceof HTTPError) {
    let message = err.response.statusText || 'Request failed';
    try { const body = (await err.response.clone().json()) as Partial<Envelope<unknown>>; if (typeof body.error === 'string' && body.error) message = body.error; } catch { /* non-JSON */ }
    const apiErr = new ApiError(err.response.status, message);
    if (apiErr.isUnauthorized) useSessionStore.getState().clear();
    if (apiErr.isStorefrontDisabled) closedGate.getState().setClosed(true);
    throw apiErr;
  }
  if (err instanceof Error && err.name === 'TimeoutError') throw new ApiError(0, 'The request timed out');
  throw new ApiError(0, 'Network error');
}

export async function unwrap<T>(p: Promise<Response>): Promise<T> {
  try {
    const body = (await (await p).json()) as Envelope<T>;
    if (!body.success) throw new ApiError(500, body.error ?? 'Request failed');
    return body.data;
  } catch (err) { if (err instanceof ApiError) throw err; return toApiError(err); }
}

export async function unwrapWithMeta<T, M>(p: Promise<Response>): Promise<{ data: T; meta: M }> {
  try {
    const body = (await (await p).json()) as Envelope<T> & { meta: M };
    if (!body.success) throw new ApiError(500, body.error ?? 'Request failed');
    return { data: body.data, meta: body.meta };
  } catch (err) { if (err instanceof ApiError) throw err; return toApiError(err); }
}
```

`web/src/api/settings.ts`:

```ts
import { api, unwrap } from '@/api/client.ts';
import type { StorefrontSettings } from '@/types/settings.ts';
export const fetchSettings = () => unwrap<StorefrontSettings>(api.get('storefront/settings'));
```

`web/src/app/settings.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { fetchSettings } from '@/api/settings.ts';
import { closedGate } from '@/app/closed-gate.ts';
import type { StorefrontSettings } from '@/types/settings.ts';

export const SETTINGS_KEY = ['settings'] as const;

export function useSettingsQuery() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async () => {
      const s = await fetchSettings();
      closedGate.getState().setClosed(!s.enabled);
      return s;
    },
    staleTime: 30_000,
    refetchInterval: (q) => (q.state.data && !q.state.data.enabled ? 60_000 : false),
    refetchOnWindowFocus: true,
    retry: 2,
  });
}

/** Only for components rendered under <App/> after settings have loaded — throws otherwise. */
export function useSettings(): StorefrontSettings {
  const q = useSettingsQuery();
  if (!q.data) throw new Error('useSettings() called before settings loaded');
  return q.data;
}
```

The session store is created in Task 13; for this task create the minimal version it needs (`token`, `customer`, `setSession`, `clear`) — Task 13 extends it without changing those names.

- [ ] **Step 5: Run tests → pass. Typecheck. Commit.**

```bash
npm --prefix web test && npm run typecheck
git add web
git commit -m "feat(web): contract types, ky client with envelope/401/503 handling, settings query"
```

---

### Task 11: Pure helpers — format, cutoffs, media-url, chat-links, dial-codes

**Files:**
- Create: `web/src/lib/format.ts`, `cutoffs.ts`, `media-url.ts`, `chat-links.ts`, `dial-codes.ts`
- Test: `web/test/format.test.ts`, `cutoffs.test.ts`, `media-url.test.ts`, `chat-links.test.ts`

**Interfaces:**
- Produces: `formatMoney(amount: number, currency: string): string`; `formatDate(iso: string): string`; `formatDateTime(iso: string): string`; `formatCoinAmount(v: string | number): string`; `deriveStockStatus(inStock, lowAlert): StockStatus`; `stockLabel(s): string`; `resolveTier(product, qty)`, `resolveUnitPrice(product, qty)`; `nextCutoff(cutoffs, serverTime, clientNowAtFetch, clientNow): NextCutoff | null`; `productImageUrl(id: number, variant?: 'web' | 'thumbnail'): string`; `mediaUrl(backendRelative: string | null): string | null`; `withPrefilledText(link: string | null, text: string): string | null`; `orderChatMessage(ref: string): string`; `DIAL_CODES`, `dialCodeFor`, `composePhoneNumber`.

- [ ] **Step 1: Failing tests**

`web/test/cutoffs.test.ts` (the only non-trivial logic here — drift-corrected "order by HH:mm" in the store's timezone):

```ts
import { describe, expect, it } from 'vitest';
import { nextCutoff } from '@/lib/cutoffs.ts';
import type { Cutoffs } from '@/types/settings.ts';

const base: Cutoffs = {
  timezone: 'Europe/London',
  days: {
    mon: { enabled: true, cutoff: '15:00', shipsOn: 'same day' },
    tue: { enabled: true, cutoff: '15:00', shipsOn: 'same day' },
    wed: { enabled: false, cutoff: '12:00', shipsOn: '' },
    thu: { enabled: true, cutoff: '15:00', shipsOn: 'same day' },
    fri: { enabled: true, cutoff: '13:00', shipsOn: 'Monday' },
    sat: { enabled: false, cutoff: '12:00', shipsOn: '' },
    sun: { enabled: false, cutoff: '12:00', shipsOn: '' },
  },
};

describe('nextCutoff', () => {
  it('returns today’s cutoff when before it (BST)', () => {
    // Tue 2026-08-25 10:00 London = 09:00Z
    const r = nextCutoff(base, '2026-08-25T09:00:00.000Z', 1000, 1000)!;
    expect(r.day).toBe('tue');
    expect(r.shipsOn).toBe('same day');
    expect(r.at.toISOString()).toBe('2026-08-25T14:00:00.000Z'); // 15:00 BST
    expect(r.msRemaining).toBe(5 * 3600_000);
  });
  it('rolls to the next enabled day after the cutoff, skipping disabled days', () => {
    // Tue 16:00 London → next is Thu 15:00 (wed disabled)
    const r = nextCutoff(base, '2026-08-25T15:00:00.000Z', 0, 0)!;
    expect(r.day).toBe('thu');
    expect(r.at.toISOString()).toBe('2026-08-27T14:00:00.000Z');
  });
  it('applies client drift: serverTime + (clientNow - clientNowAtFetch)', () => {
    const r = nextCutoff(base, '2026-08-25T09:00:00.000Z', 0, 3600_000)!;
    expect(r.msRemaining).toBe(4 * 3600_000);
  });
  it('wraps the week (Fri after cutoff → Mon)', () => {
    const r = nextCutoff(base, '2026-08-28T13:00:00.000Z', 0, 0)!; // Fri 14:00 BST
    expect(r.day).toBe('mon');
    expect(r.at.toISOString()).toBe('2026-08-31T14:00:00.000Z');
  });
  it('returns null when no day is enabled', () => {
    const none = { ...base, days: Object.fromEntries(Object.entries(base.days).map(([k, v]) => [k, { ...v, enabled: false }])) as Cutoffs['days'] };
    expect(nextCutoff(none, '2026-08-25T09:00:00.000Z', 0, 0)).toBeNull();
  });
});
```

`web/test/media-url.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mediaUrl, productImageUrl } from '@/lib/media-url.ts';
describe('media-url', () => {
  it('builds product image urls through /media', () => {
    expect(productImageUrl(12)).toBe('/media/products/12/image?variant=web');
    expect(productImageUrl(12, 'thumbnail')).toBe('/media/products/12/image?variant=thumbnail');
  });
  it('maps backend-relative branding urls', () => {
    expect(mediaUrl('/api/v1/storefront-settings/branding/logo?v=3')).toBe('/media/storefront-settings/branding/logo?v=3');
    expect(mediaUrl('/api/v1/settings/branding/favicon')).toBe('/media/settings/branding/favicon');
    expect(mediaUrl('/api/v1/products/4/image?variant=web')).toBe('/media/products/4/image?variant=web');
  });
  it('passes through absolute http(s) urls and null', () => {
    expect(mediaUrl('https://cdn.example/x.png')).toBe('https://cdn.example/x.png');
    expect(mediaUrl(null)).toBeNull();
  });
});
```

`web/test/format.test.ts`: `formatMoney(4.5, 'GBP') === '£4.50'`, `formatMoney(4.5, 'USD') === '$4.50'` (locale `'en'`, as the menu does — `en-GB` renders USD as `US$`), `formatCoinAmount('0.00081000') === '0.00081'`, `formatCoinAmount(12) === '12'`, `deriveStockStatus(false, false) === 'out'`, `resolveTier({ price: 10, pricingTiers: [{ id: 1, minQuantity: 5, price: 8 }, { id: 2, minQuantity: 10, price: 7 }] }, 7)?.price === 8`.

`web/test/chat-links.test.ts`: `withPrefilledText('https://wa.me/447700900000', 'hi there')` contains `text=hi+there`; `withPrefilledText(null, 'x') === null`; `withPrefilledText('not a url', 'x') === 'not a url'`.

- [ ] **Step 2: Run → fail. Step 3: Implement.**

`format.ts` — port `ecommerce-menu/web/src/lib/format.ts` with the currency made a parameter (`new Intl.NumberFormat('en', { style: 'currency', currency })`, memoised per currency in a `Map`), plus `formatDateTime(iso)` using `Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })`.

`cutoffs.ts`:

```ts
import type { Cutoffs, DayKey } from '@/types/settings.ts';

export interface NextCutoff { day: DayKey; at: Date; msRemaining: number; shipsOn: string; cutoff: string; isToday: boolean }
const DAYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Wall-clock parts of `date` in `timeZone`. */
function zoned(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = get('weekday').toLowerCase().slice(0, 3) as DayKey;
  return { weekday, y: +get('year'), m: +get('month'), d: +get('day'), h: +get('hour') % 24, min: +get('minute'), s: +get('second') };
}

/** Offset (ms) of `timeZone` at `date`, computed from the formatted wall-clock. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const z = zoned(date, timeZone);
  const asUtc = Date.UTC(z.y, z.m - 1, z.d, z.h, z.min, z.s);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant of `HH:mm` on the calendar day that is `dayOffset` days after `now`'s day in `timeZone`. */
function instantAt(now: Date, dayOffset: number, hhmm: string, timeZone: string): Date {
  const z = zoned(now, timeZone);
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const naive = Date.UTC(z.y, z.m - 1, z.d + dayOffset, h, m, 0);
  // Two-pass: use the offset in force at the target instant (handles DST transitions).
  const guess = new Date(naive - tzOffsetMs(now, timeZone));
  return new Date(naive - tzOffsetMs(guess, timeZone));
}

export function nextCutoff(cutoffs: Cutoffs, serverTime: string, clientNowAtFetch: number, clientNow: number): NextCutoff | null {
  const server = Date.parse(serverTime);
  if (Number.isNaN(server)) return null;
  const now = new Date(server + (clientNow - clientNowAtFetch));
  const tz = cutoffs.timezone || 'UTC';
  const todayIdx = DAYS.indexOf(zoned(now, tz).weekday);
  for (let offset = 0; offset < 8; offset++) {
    const day = DAYS[(todayIdx + offset) % 7]!;
    const cfg = cutoffs.days[day];
    if (!cfg?.enabled) continue;
    const at = instantAt(now, offset, cfg.cutoff, tz);
    if (at.getTime() <= now.getTime()) continue;
    return { day, at, msRemaining: at.getTime() - now.getTime(), shipsOn: cfg.shipsOn, cutoff: cfg.cutoff, isToday: offset === 0 };
  }
  return null;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
```

`media-url.ts`:

```ts
export function productImageUrl(id: number, variant: 'web' | 'thumbnail' = 'web'): string {
  return `/media/products/${id}/image?variant=${variant}`;
}
export function mediaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return value.replace(/^\/api\/v1\//, '/media/');
}
```

`chat-links.ts` — port `withPrefilledText` verbatim, add `export const orderChatMessage = (ref: string) => \`I've just placed an order, here is my Order ID: ${ref}. I'd like to pay.\``.

`dial-codes.ts` — copy `ecommerce-menu/web/src/lib/dial-codes.ts` verbatim (`DIAL_CODES`, `dialCodeFor`, `composePhoneNumber`).

- [ ] **Step 4: Run → pass. Commit.**

```bash
git add web && git commit -m "feat(web): format/cutoff/media/chat/dial helpers with tests"
```

---

### Task 12: Theme bridge + first-paint bootstrap

**Files:**
- Create: `web/src/app/theme-bridge.ts`, `web/src/app/theme-bootstrap.ts` (the script source that is inlined), `web/src/styles/global.css`
- Modify: `web/index.html` (replace `<!-- sf-theme-bootstrap -->`)
- Test: `web/test/theme-bridge.test.ts`

**Interfaces:**
- Consumes: `Theme`, `Brand` (Task 10), `generateColors` from `@mantine/colors-generator`, `mediaUrl` (Task 11).
- Produces: `buildMantineTheme(theme: Theme): MantineThemeOverride`; `cssVariablesFor(theme: Theme, brand: Brand): Record<string, string>` (the `--sf-*` map); `applyDocumentTheme(theme, brand): void` (sets vars on `:root`, `data-mantine-color-scheme`, fonts link, title/meta/favicon, custom CSS `<style id="sf-custom-css">`, and persists `{theme, brand}` to `localStorage['sf-theme-v1']`); `googleFontsHref(fonts): string | null`.
- CSS variable contract used by every component: `--sf-bg`, `--sf-bg-deep`, `--sf-surface`, `--sf-surface-2`, `--sf-surface-3`, `--sf-line`, `--sf-line-strong`, `--sf-text`, `--sf-muted`, `--sf-faint`, `--sf-primary`, `--sf-primary-soft`, `--sf-success`, `--sf-warn`, `--sf-danger`, `--sf-logo-h`, `--sf-font-heading`, `--sf-font-body`, `--sf-font-mono`.

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildMantineTheme, cssVariablesFor, googleFontsHref } from '@/app/theme-bridge.ts';
import type { Theme, Brand } from '@/types/settings.ts';

const theme: Theme = {
  scheme: 'dark',
  colors: { primary: '#3355ff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' },
  fonts: { heading: 'Space Grotesk', body: 'Inter', mono: null },
  radius: 'lg', density: 'compact', customCss: '',
};
const brand = { logoHeight: 32 } as Brand;

describe('theme bridge', () => {
  it('builds a 10-shade brand ramp and maps radius/fonts', () => {
    const t = buildMantineTheme(theme);
    expect(t.primaryColor).toBe('brand');
    expect((t.colors as Record<string, string[]>).brand).toHaveLength(10);
    expect(t.defaultRadius).toBe('lg');
    expect(t.fontFamily).toContain('Inter');
    expect(t.headings?.fontFamily).toContain('Space Grotesk');
  });
  it('derives surface-2/3, line, faint from bg/surface/muted', () => {
    const v = cssVariablesFor(theme, brand);
    expect(v['--sf-bg']).toBe('#0f3965');
    expect(v['--sf-primary']).toBe('#3355ff');
    expect(v['--sf-logo-h']).toBe('32px');
    expect(v['--sf-surface-2']).toMatch(/^#[0-9a-f]{6}$/);
    expect(v['--sf-surface-2']).not.toBe(v['--sf-surface']);
    expect(v['--sf-line']).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('builds one Google Fonts href for the distinct families', () => {
    expect(googleFontsHref(theme.fonts)).toBe('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
    expect(googleFontsHref({ heading: null, body: null, mono: null })).toBeNull();
  });
});
```

- [ ] **Step 2: Run → fail. Step 3: Implement.**

`theme-bridge.ts`:

```ts
import { createTheme, type MantineThemeOverride } from '@mantine/core';
import { generateColors } from '@mantine/colors-generator';
import type { Theme, Brand } from '@/types/settings.ts';
import { mediaUrl } from '@/lib/media-url.ts';

const SYSTEM_SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const SYSTEM_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
export const THEME_STORAGE_KEY = 'sf-theme-v1';

function family(name: string | null, fallback: string): string { return name ? `"${name}", ${fallback}` : fallback; }

/** Mix `hex` toward `toward` by `t` (0..1) in sRGB — enough for derived surfaces/lines. */
export function mix(hex: string, toward: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex), b = p(toward);
  return '#' + a.map((c, i) => Math.round(c + (b[i]! - c) * t).toString(16).padStart(2, '0')).join('');
}

export function buildMantineTheme(theme: Theme): MantineThemeOverride {
  const compact = theme.density === 'compact';
  return createTheme({
    primaryColor: 'brand',
    primaryShade: { light: 6, dark: 5 },
    colors: { brand: generateColors(theme.colors.primary) },
    fontFamily: family(theme.fonts.body, SYSTEM_SANS),
    fontFamilyMonospace: family(theme.fonts.mono, SYSTEM_MONO),
    headings: { fontFamily: family(theme.fonts.heading ?? theme.fonts.body, SYSTEM_SANS), fontWeight: '600' },
    defaultRadius: theme.radius,
    spacing: compact ? { xs: '0.5rem', sm: '0.625rem', md: '0.875rem', lg: '1.125rem', xl: '1.5rem' } : undefined,
    fontSizes: compact ? { xs: '0.7rem', sm: '0.8rem', md: '0.9rem', lg: '1rem', xl: '1.15rem' } : undefined,
    other: { density: theme.density },
  });
}

export function cssVariablesFor(theme: Theme, brand: Pick<Brand, 'logoHeight'>): Record<string, string> {
  const dark = theme.scheme === 'dark';
  const c = theme.colors;
  const towardText = dark ? '#ffffff' : '#000000';
  return {
    '--sf-bg': c.bg,
    '--sf-bg-deep': mix(c.bg, dark ? '#000000' : '#ffffff', 0.18),
    '--sf-surface': c.surface,
    '--sf-surface-2': mix(c.surface, towardText, 0.07),
    '--sf-surface-3': mix(c.surface, towardText, 0.14),
    '--sf-line': mix(c.surface, towardText, 0.12),
    '--sf-line-strong': mix(c.surface, towardText, 0.24),
    '--sf-text': c.text,
    '--sf-muted': c.muted,
    '--sf-faint': mix(c.muted, c.bg, 0.35),
    '--sf-primary': c.primary,
    '--sf-primary-soft': mix(c.primary, c.bg, 0.75),
    '--sf-success': c.success,
    '--sf-warn': c.warn,
    '--sf-danger': c.danger,
    '--sf-logo-h': `${brand.logoHeight}px`,
    '--sf-font-heading': family(theme.fonts.heading ?? theme.fonts.body, SYSTEM_SANS),
    '--sf-font-body': family(theme.fonts.body, SYSTEM_SANS),
    '--sf-font-mono': family(theme.fonts.mono, SYSTEM_MONO),
  };
}

export function googleFontsHref(fonts: Theme['fonts']): string | null {
  const names = [...new Set([fonts.heading, fonts.body, fonts.mono].filter((n): n is string => !!n))];
  if (names.length === 0) return null;
  const q = names.map((n) => `family=${n.trim().replace(/\s+/g, '+')}:wght@400;500;600;700`).join('&');
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

function upsert<T extends HTMLElement>(selector: string, create: () => T): T {
  const existing = document.head.querySelector<T>(selector);
  if (existing) return existing;
  const el = create(); document.head.appendChild(el); return el;
}

export function applyDocumentTheme(theme: Theme, brand: Brand): void {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(cssVariablesFor(theme, brand))) root.style.setProperty(k, v);
  root.setAttribute('data-mantine-color-scheme', theme.scheme);
  root.style.colorScheme = theme.scheme;

  const href = googleFontsHref(theme.fonts);
  const link = upsert<HTMLLinkElement>('link#sf-fonts', () => Object.assign(document.createElement('link'), { id: 'sf-fonts', rel: 'stylesheet' }));
  if (href) link.href = href; else link.remove();

  const style = upsert<HTMLStyleElement>('style#sf-custom-css', () => Object.assign(document.createElement('style'), { id: 'sf-custom-css' }));
  style.textContent = theme.customCss || '';

  document.title = brand.title;
  upsert<HTMLMetaElement>('meta[name="description"]', () => Object.assign(document.createElement('meta'), { name: 'description' })).content = brand.description;
  upsert<HTMLMetaElement>('meta[name="theme-color"]', () => Object.assign(document.createElement('meta'), { name: 'theme-color' })).content = theme.colors.bg;
  const fav = mediaUrl(brand.faviconUrl) ?? '/favicon.svg';
  upsert<HTMLLinkElement>('link[rel="icon"]', () => Object.assign(document.createElement('link'), { rel: 'icon' })).href = fav;

  try { localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ theme, brand })); } catch { /* private mode */ }
}
```

`theme-bootstrap.ts` — exported as a **string** so `index.html` can inline it and Vite keeps it out of the bundle graph; keep it dependency-free and tiny (it re-implements only `mix` + the variable names, which is acceptable duplication documented here):

```ts
// Inlined into index.html by hand (copy the body between the markers). Runs before React:
// reads sf-theme-v1 and sets the same --sf-* variables applyDocumentTheme() sets, so a returning
// visitor never sees the default palette. Must stay in sync with cssVariablesFor().
export const THEME_BOOTSTRAP = `(function(){try{var raw=localStorage.getItem('sf-theme-v1');if(!raw)return;var s=JSON.parse(raw),t=s.theme,b=s.brand,c=t.colors,d=t.scheme==='dark',tt=d?'#ffffff':'#000000';
function p(h){return[1,3,5].map(function(i){return parseInt(h.slice(i,i+2),16)})}
function mix(h,w,k){var a=p(h),q=p(w);return'#'+a.map(function(x,i){return Math.round(x+(q[i]-x)*k).toString(16).padStart(2,'0')}).join('')}
var r=document.documentElement,v={'--sf-bg':c.bg,'--sf-bg-deep':mix(c.bg,d?'#000000':'#ffffff',.18),'--sf-surface':c.surface,'--sf-surface-2':mix(c.surface,tt,.07),'--sf-surface-3':mix(c.surface,tt,.14),'--sf-line':mix(c.surface,tt,.12),'--sf-line-strong':mix(c.surface,tt,.24),'--sf-text':c.text,'--sf-muted':c.muted,'--sf-faint':mix(c.muted,c.bg,.35),'--sf-primary':c.primary,'--sf-primary-soft':mix(c.primary,c.bg,.75),'--sf-success':c.success,'--sf-warn':c.warn,'--sf-danger':c.danger,'--sf-logo-h':b.logoHeight+'px'};
for(var k in v)r.style.setProperty(k,v[k]);r.setAttribute('data-mantine-color-scheme',t.scheme);r.style.colorScheme=t.scheme;if(b.title)document.title=b.title;}catch(e){}})();`;
```

Paste the string's content into `index.html` as `<script>…</script>` in place of the marker (the `.ts` export exists so the test can assert the two stay in sync: add a test that evaluates `THEME_BOOTSTRAP` in jsdom with a seeded `localStorage` and checks `--sf-surface-2` equals `cssVariablesFor(...)['--sf-surface-2']`).

`styles/global.css` (imported from `main.tsx` after Mantine's CSS):

```css
:root { --sf-bg:#0f3965; --sf-bg-deep:#0a2a4d; --sf-surface:#15457a; --sf-surface-2:#1d5189; --sf-surface-3:#26609a; --sf-line:#1a4275; --sf-line-strong:#26568f; --sf-text:#f4f7fc; --sf-muted:#a9c0e0; --sf-faint:#7089ad; --sf-primary:#ffffff; --sf-primary-soft:#dde7f4; --sf-success:#5fcc9b; --sf-warn:#e3b97a; --sf-danger:#e08278; --sf-logo-h:28px; --sf-font-heading:system-ui,sans-serif; --sf-font-body:system-ui,sans-serif; --sf-font-mono:ui-monospace,monospace; }
html, body { background: var(--sf-bg); color: var(--sf-text); min-height: 100%; -webkit-text-size-adjust: 100%; overscroll-behavior: none; }
body { font-family: var(--sf-font-body); }
/* Point Mantine's own surfaces at ours so every component follows the client palette. */
:root[data-mantine-color-scheme] { --mantine-color-body: var(--sf-bg); --mantine-color-text: var(--sf-text); --mantine-color-dimmed: var(--sf-muted); --mantine-color-default: var(--sf-surface); --mantine-color-default-hover: var(--sf-surface-2); --mantine-color-default-border: var(--sf-line-strong); --mantine-color-default-color: var(--sf-text); --mantine-color-placeholder: var(--sf-faint); --mantine-color-error: var(--sf-danger); }
input, select, textarea { font-size: 16px; } /* iOS zoom guard */
* { touch-action: manipulation; }
.pb-safe { padding-bottom: max(env(safe-area-inset-bottom), 1rem); }
.pt-safe { padding-top: env(safe-area-inset-top); }
```

- [ ] **Step 4: Run → pass. Commit.**

```bash
git add web && git commit -m "feat(web): runtime theme bridge (Mantine + --sf-* vars), first-paint bootstrap"
```

---

### Task 13: Stores — session, cart (local ⇄ server), ui, saved-orders

**Files:**
- Create/extend: `web/src/stores/session.ts`, `web/src/stores/cart.ts`, `web/src/stores/ui.ts`, `web/src/stores/saved-orders.ts`
- Create: `web/src/api/cart.ts`, `web/src/api/auth.ts`
- Test: `web/test/cart-store.test.ts`, `web/test/saved-orders.test.ts`

**Interfaces:**
- Produces:
  - `useSessionStore`: `{ token: string | null; customer: { id: number; nickname: string | null } | null; returnTo: string | null; setSession(token, customer); setReturnTo(path | null); clear() }` persisted under `sf-session-v1` (partialize `token`, `customer`).
  - `useCartStore`: `{ lines: LocalLine[]; mode: 'local' | 'server'; add(product: Product, qty?: number); setQuantity(productId, qty); remove(productId); clear(); replaceFromServer(cart: ServerCart); mergeForLogin(): CartLineInput[]; setMode(m) }` + selectors `selectCount`, `selectSubtotal(lines)`, `selectHasMixedPreorder`; `LocalLine = { productId, displayName, sku, unitPrice, basePrice, pricingTiers, quantity, isPreorder, excludedFromFreeShipping, imageProductId }`; persisted under `sf-cart-v1` (partialize `lines`; `mode` is derived from session presence at boot).
  - `useUiStore`: `{ cartOpen, filterOpen, loginOpen, open(name), close(name) }`.
  - `saved-orders.ts`: `listSavedOrders()`, `saveOrder(reference, accessKey)`, `findSavedOrder(reference)` — port of the menu's file with key `sf-orders-v1`.
  - `api/cart.ts`: `fetchCart()`, `putCart(items: CartLineInput[])`, `clearCart()`.
  - `api/auth.ts`: `startWhatsapp()`, `pollAttempt(id)`, `completeWhatsapp(attemptId, attemptSecret)`, `loginTelegram(payload)`, `logout()`.

- [ ] **Step 1: Failing tests**

`web/test/cart-store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useCartStore, selectCount, selectSubtotal } from '@/stores/cart.ts';
import type { Product } from '@/types/catalog.ts';

const p = (id: number, price = 10, tiers: Product['pricingTiers'] = []): Product => ({
  id, sku: `S${id}`, name: `P${id}`, displayName: `P${id}`, shortDisplayName: null, description: null, categoryId: 1, categoryName: 'C',
  sortOrder: 0, price, inStock: true, lowStockAlert: false, isActive: true, isPreorder: false, preorderEta: null, pricingTiers: tiers,
  upsellProductIds: [], excludedFromFreeShipping: false, imageProductId: null, provenance: null,
});

describe('cart store', () => {
  beforeEach(() => useCartStore.getState().clear());

  it('adds and merges quantities, re-resolving tier price', () => {
    const s = useCartStore.getState();
    s.add(p(1, 10, [{ id: 1, minQuantity: 3, price: 8 }]), 2);
    s.add(p(1, 10, [{ id: 1, minQuantity: 3, price: 8 }]), 1);
    expect(useCartStore.getState().lines).toEqual([expect.objectContaining({ productId: 1, quantity: 3, unitPrice: 8 })]);
    expect(selectSubtotal(useCartStore.getState().lines)).toBe(24);
    expect(selectCount(useCartStore.getState())).toBe(3);
  });

  it('setQuantity(0) removes', () => {
    useCartStore.getState().add(p(2));
    useCartStore.getState().setQuantity(2, 0);
    expect(useCartStore.getState().lines).toHaveLength(0);
  });

  it('mergeForLogin returns {productId, quantity} lines', () => {
    useCartStore.getState().add(p(3), 2);
    expect(useCartStore.getState().mergeForLogin()).toEqual([{ productId: 3, quantity: 2 }]);
  });

  it('replaceFromServer mirrors the server cart and switches to server mode', () => {
    useCartStore.getState().replaceFromServer({ items: [{ productId: 9, name: 'X', quantity: 4, unitPrice: 5, lineTotal: 20, imageUrl: null, isPreorder: false, outOfStock: false, priceChanged: false, inactive: false }], subtotal: 20, itemCount: 4 });
    const st = useCartStore.getState();
    expect(st.mode).toBe('server');
    expect(st.lines[0]).toMatchObject({ productId: 9, quantity: 4, unitPrice: 5, displayName: 'X' });
  });
});
```

`web/test/saved-orders.test.ts`: save two, list returns newest first, `findSavedOrder` finds by reference, saving the same reference again dedupes, corrupt JSON in storage → `[]`.

- [ ] **Step 2: Run → fail. Step 3: Implement.**

`stores/session.ts`:

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Customer { id: number; nickname: string | null }
interface SessionState {
  token: string | null; customer: Customer | null; returnTo: string | null;
  setSession: (token: string, customer: Customer) => void;
  setReturnTo: (path: string | null) => void;
  clear: () => void;
}
export const useSessionStore = create<SessionState>()(persist((set) => ({
  token: null, customer: null, returnTo: null,
  setSession: (token, customer) => set({ token, customer }),
  setReturnTo: (returnTo) => set({ returnTo }),
  clear: () => set({ token: null, customer: null }),
}), { name: 'sf-session-v1', partialize: (s) => ({ token: s.token, customer: s.customer }) }));
export const selectIsLoggedIn = (s: SessionState) => s.token !== null;
```

`stores/cart.ts` — port the menu's `cart-store.ts` (`addItem` → `add`, `setQuantity`, `removeItem` → `remove`, `clear`, tier re-resolution via `resolveUnitPrice` from `lib/format.ts`) with `mode`, `replaceFromServer`, `mergeForLogin`, and the `LocalLine` shape above; persist name `sf-cart-v1`, `partialize: (s) => ({ lines: s.lines })`. `replaceFromServer` maps each `ServerCartLine` to a `LocalLine` (`displayName: name`, `basePrice: unitPrice`, `pricingTiers: []`, `sku: ''`, `imageProductId: productId`, `excludedFromFreeShipping: false`) and sets `mode: 'server'`.

`stores/ui.ts`: three booleans + `open`/`close`/`toggle` by key.

`api/cart.ts` and `api/auth.ts` — thin typed wrappers over `api` + `unwrap` (paths: `storefront/cart` GET/PUT/DELETE; `storefront/auth/whatsapp/start` POST (empty json body `{}`), `storefront/auth/attempts/${id}` GET, `storefront/auth/whatsapp/complete` POST, `storefront/auth/telegram` POST, `storefront/auth/logout` POST).

- [ ] **Step 4: Run → pass. Typecheck. Commit.**

```bash
git add web && git commit -m "feat(web): session/cart/ui stores, saved orders, cart + auth api modules"
```

---

### Task 14 [UI]: App providers, router, shells, notices, cut-off bar, closed page

**Files:**
- Modify: `web/src/app/App.tsx`; Create: `web/src/app/router.tsx`, `web/src/app/guards.tsx`
- Create: `web/src/layouts/StorefrontShell.tsx` (+ `.module.css`), `MenuShell.tsx` (+ `.module.css`), `Chromeless.tsx`
- Create: `web/src/components/Brand.tsx`, `Money.tsx`, `EmptyState.tsx`, `PageSkeleton.tsx`, `ContactLinks.tsx`
- Create: `web/src/features/notices/NoticeBanners.tsx`, `CutoffBar.tsx`; `web/src/features/closed/ClosedPage.tsx`; `web/src/features/NotFoundPage.tsx`
- Create: placeholder pages for every route in the table below (each a one-line `<EmptyState title="…" />`) so the router compiles; later tasks replace them
- Test: `web/test/guards.test.tsx` (route guard logic), `web/test/cutoff-bar.test.tsx` (renders "Order by 15:00 for same day", hidden when `nextCutoff` is null)

**Interfaces:**
- Consumes: `useSettingsQuery`/`useSettings`, `closedGate`, `applyDocumentTheme`, `buildMantineTheme`, stores, `nextCutoff`/`formatCountdown`, `mediaUrl`, `withPrefilledText`.
- Produces: `<App/>`; route table (spec §4.2) with guards `requireFeature(flag)`, `requireSession()`; `useShellSearch()` outlet context `{ search: string; setSearch(v) }` (used by catalog + wholesale); `<Brand size="sm"|"md"|"lg" />` (logo image via `mediaUrl(brand.logoUrl)` → admin branding fallback `/media/settings/branding/logo` → text `brand.shortName`); `<Money amount currency? />`; `<ContactLinks prefill? />`.

**Design brief for the frontend-design subagent** (load `frontend-design:frontend-design` first): two shells, both mobile-first and responsive, reading only Mantine tokens + `--sf-*` variables. *Storefront shell*: top header (logo left; centre search on ≥ md; right: account icon (or "Sign in" when `features.accounts` and no session), cart icon with count badge when `features.ordering`), beneath it `NoticeBanners` then `CutoffBar`; `<Outlet/>`; footer with `supportLinks`, WA/TG `ContactLinks`, brand tagline. *Menu shell*: a compact sticky bar (logo, search field inline, cart + account icons) — the current menu's dense idiom — same banners/cut-off, no footer but a sticky bottom `ContactLinks` strip on catalog routes. *Chromeless*: only a centred brand header. `NoticeBanners`: Mantine `Alert`-like strips per notice (`info`/`warning`/`promo` map to `--sf-primary`/`--sf-warn`/`--sf-success` tints), dismissible per id (persisted in `sf-dismissed-notices-v1`). `CutoffBar`: one line "Order by **15:00** for *same day* dispatch · 4h 12m left", ticking each minute; hidden when `nextCutoff()` is null. `ClosedPage`: brand, `closedMessage`, support + contact links — full screen. Loading state before settings: `PageSkeleton` with a neutral palette.

- [ ] **Step 1: Guard tests**

```tsx
import { describe, expect, it } from 'vitest';
import { guardDecision } from '@/app/guards.tsx';
describe('guardDecision', () => {
  it('404s when the feature is off', () => {
    expect(guardDecision({ feature: 'verify' }, { features: { verify: false } as never, loggedIn: false, path: '/verify' })).toEqual({ kind: 'notFound' });
  });
  it('redirects to login with returnTo when session is required', () => {
    expect(guardDecision({ session: true }, { features: { accounts: true } as never, loggedIn: false, path: '/account/orders' })).toEqual({ kind: 'redirect', to: '/login?returnTo=%2Faccount%2Forders' });
  });
  it('allows otherwise', () => {
    expect(guardDecision({ feature: 'ordering' }, { features: { ordering: true } as never, loggedIn: false, path: '/cart' })).toEqual({ kind: 'allow' });
  });
});
```

- [ ] **Step 2: Implement `guards.tsx`**

```tsx
import { Navigate, useLocation } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import { NotFoundPage } from '@/features/NotFoundPage.tsx';
import type { Features } from '@/types/settings.ts';

export interface GuardSpec { feature?: keyof Features; session?: boolean }
export type GuardDecision = { kind: 'allow' } | { kind: 'notFound' } | { kind: 'redirect'; to: string };

export function guardDecision(spec: GuardSpec, ctx: { features: Features; loggedIn: boolean; path: string }): GuardDecision {
  if (spec.feature && !ctx.features[spec.feature]) return { kind: 'notFound' };
  if (spec.session) {
    if (!ctx.features.accounts) return { kind: 'notFound' };
    if (!ctx.loggedIn) return { kind: 'redirect', to: `/login?returnTo=${encodeURIComponent(ctx.path)}` };
  }
  return { kind: 'allow' };
}

export function Guard({ spec, children }: { spec: GuardSpec; children: React.ReactNode }) {
  const { features } = useSettings();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const { pathname, search } = useLocation();
  const d = guardDecision(spec, { features, loggedIn, path: pathname + search });
  if (d.kind === 'notFound') return <NotFoundPage />;
  if (d.kind === 'redirect') return <Navigate to={d.to} replace />;
  return <>{children}</>;
}
```

- [ ] **Step 3: `App.tsx` + `router.tsx`**

`App.tsx` composition: `QueryClientProvider` (one `QueryClient`, `retry: 1`, `staleTime: 10_000`) → `<SettingsBoundary>` which runs `useSettingsQuery()`; while loading renders `<MantineProvider><PageSkeleton/></MantineProvider>`; on error renders a retry screen; on data calls `applyDocumentTheme(theme, brand)` in a `useEffect` keyed on the JSON of `{theme, brand}`, then renders `<MantineProvider theme={useMemo(() => buildMantineTheme(theme), [theme])} forceColorScheme={theme.scheme}><Notifications position="top-center" /><ClosedGate><RouterProvider router={router} /></ClosedGate></MantineProvider>`. `ClosedGate` renders `<ClosedPage/>` when `closedGate.closed || !settings.enabled`, else children. Also: when the session token exists at boot, kick `fetchCart()` → `replaceFromServer` (and on 401 the client clears the session; cart falls back to local).

`router.tsx` — `createBrowserRouter` with the spec §4.2 table; shell chosen by `features.layout` via a `ShellSwitch` element; `/order/:ref/:accessKey` under `Chromeless`; `/p/:id` in menu layout redirects to `/?p=:id`; `/cart` on ≥ md viewport redirects to `/` and opens the drawer (use `useMediaQuery('(min-width: 62em)')`). Feature guards per the table. All feature pages are `lazy()` imports.

- [ ] **Step 4: Shells, components, notices, cut-off bar, closed page (design work)**

Build per the brief. `CutoffBar` logic:

```tsx
const { cutoffs, serverTime } = useSettings();
const fetchedAt = useRef(Date.now()); // reset whenever serverTime changes
const [now, setNow] = useState(Date.now());
useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
const next = useMemo(() => nextCutoff(cutoffs, serverTime, fetchedAt.current, now), [cutoffs, serverTime, now]);
if (!next) return null;
```

- [ ] **Step 5: Verify in the browser**

Run backend (`storefront_enabled=true` via admin PUT), `npm run dev`, `npm run dev:web`; open `http://localhost:5173`. Switch `features.layout` between `storefront` and `menu` via the admin PUT and reload: the correct shell renders, the theme colours from the PUT apply, the notice and cut-off bar show. Set `enabled:false` → closed page appears within 60 s without reload. Screenshot both shells at 390 px and 1280 px into `docs/screenshots/` (commit them).

- [ ] **Step 6: Tests + typecheck pass. Commit.**

```bash
npm --prefix web test && npm run typecheck
git add web docs && git commit -m "feat(web): app providers, router + guards, storefront/menu shells, notices, cut-off bar, closed page"
```

Phase C is complete when both shells render from live settings.

---
## Phase D — Features

### Task 15: Catalog data layer (api, category tree, filtering, search)

**Files:**
- Create: `web/src/api/catalog.ts`, `web/src/features/catalog/category-tree.ts`, `web/src/features/catalog/use-catalog.ts`, `web/src/features/catalog/filter.ts`
- Test: `web/test/category-tree.test.ts`, `web/test/catalog-filter.test.ts`

**Interfaces:**
- Produces: `fetchCatalog(): Promise<Catalog>`, `fetchProduct(id): Promise<Product>`; `useCatalog()` (key `['catalog']`, `staleTime: 60_000`), `useProduct(id)` (key `['product', id]`); `buildCategoryTree(categories, countsById): CategoryNode[]`, `collectDescendantIds(rootId, categories): Set<number>`, `categoryCounts(products): Map<number, number>`; `bySortOrder(a, b)`; `filterProducts(products, categories, { categoryId, search }): Product[]`; `findCategoryBySlugOrId(categories, key): Category | undefined`; `upsellsFor(product, catalog): Product[]`.

- [ ] **Step 1: Failing tests** — port the behaviours from `ecommerce-menu/web/src/features/catalog/category-tree.ts` (§4 of the menu report): orphan promotes to root; transitive counts; zero-product branches pruned; sort by `sortOrder` then name; `collectDescendantIds` is order-independent. Add `filterProducts`: no category → all sorted by `bySortOrder`; category → descendants only; `search` matches `displayName` or `sku` case-insensitively; both combine.

- [ ] **Step 2: Implement** — copy `buildCategoryTree` and `collectDescendantIds` verbatim; add:

```ts
export const bySortOrder = (a: Product, b: Product) =>
  a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName, undefined, { numeric: true });

export function categoryCounts(products: Product[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const p of products) if (p.categoryId != null) counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
  return counts;
}

export function filterProducts(products: Product[], categories: Category[], f: { categoryId: number | null; search: string }): Product[] {
  let out = products;
  if (f.categoryId != null) { const allowed = collectDescendantIds(f.categoryId, categories); out = out.filter((p) => p.categoryId != null && allowed.has(p.categoryId)); }
  const q = f.search.trim().toLowerCase();
  if (q) out = out.filter((p) => p.displayName.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  return [...out].sort(bySortOrder);
}

export function findCategoryBySlugOrId(categories: Category[], key: string): Category | undefined {
  return categories.find((c) => c.slug === key) ?? categories.find((c) => String(c.id) === key);
}

export function upsellsFor(product: Product, catalog: Catalog | undefined): Product[] {
  if (!catalog) return [];
  return product.upsellProductIds.map((id) => catalog.products.find((p) => p.id === id)).filter((p): p is Product => !!p);
}
```

- [ ] **Step 3: Run → pass. Commit** — `feat(web): catalog api + tree/filter helpers`.

---

### Task 16 [UI]: Catalog — storefront layout (grid, cards, category nav, product page, upsells)

**Files:**
- Create: `web/src/features/catalog/CatalogPage.tsx` (layout switch), `ProductGrid.tsx`, `ProductCard.tsx`, `StockChip.tsx`, `CategoryNav.tsx` (chips on mobile / rail on desktop), `FilterDrawer.tsx`, `ProductDetailPage.tsx`, `ProductImage.tsx`, `Upsells.tsx`, `AddToCart.tsx`, `BulkPricing.tsx`, `Provenance.tsx`, `*.module.css`
- Modify: `web/src/app/router.tsx` (replace placeholders for `/`, `/c/:categorySlug`, `/p/:id`)

**Interfaces:**
- Consumes: Task 15 hooks/helpers; `useCartStore.add`; `useShellSearch()`; `productImageUrl`; `formatMoney` with `settings.currency`; `deriveStockStatus`; `features.ordering`, `features.upsell`, `features.wholesale`.
- Produces: `<CatalogPage/>` renders `<WholesaleCatalogPage/>` (Task 18) when `features.wholesale`, else `<ProductGrid/>` (storefront) or `<ProductList/>` (menu, Task 17); `<StockChip status/>`, `<AddToCart product/>` (button cycles "Add · £x" → "Added" 1.6 s → "Add another"; disabled when `!isActive || (!isPreorder && status === 'out')`), `<ProductImage productId variant/>` (hides itself on `onError`), `<Upsells product/>`, `<BulkPricing tiers price/>`, `<Provenance markdown/>` (render `product.provenance` — plain paragraphs + `**bold**`/lists via a 30-line markdown-lite, no dependency).

**Design brief**: image-led storefront. Hero strip under the banners: `brand.tagline` + `welcomeMessage` (when set) on `--sf-surface`. Category chips (horizontal scroll, mobile) / left rail (desktop ≥ 62em) with counts from the tree. Grid: 2 columns at 390 px, 3 at ≥ 48em, 4 at ≥ 75em; card = image (thumbnail variant, 1:1, `--sf-surface-2` placeholder), `displayName` (2-line clamp), price, `StockChip` only when not `in`, pre-order badge, quick-add button when `features.ordering`. Product page `/p/:id`: large image (web variant), name, category path (`categoryName`), price, description, `BulkPricing`, `Provenance`, `Upsells` (4-up row of small cards), `AddToCart`, "Ask first" WA/TG links. Empty search state. Everything keyboard-navigable; tap targets ≥ 44 px.

- [ ] **Step 1: Build per brief.** Category selection drives the URL (`/c/:slug` with id fallback); search comes from the shell's outlet context; `document.title = \`${product.displayName} — ${brand.name}\`` on the product page (restore `brand.title` on unmount).
- [ ] **Step 2: Browser check** at 390/1280 with a real catalog; screenshot to `docs/screenshots/catalog-storefront-{mobile,desktop}.png`.
- [ ] **Step 3: Typecheck + tests pass. Commit** — `feat(web): storefront catalog grid, product page, upsells`.

---

### Task 17 [UI]: Catalog — menu layout (dense rows, detail sheet, filter sheet)

**Files:**
- Create: `web/src/features/catalog/ProductList.tsx`, `ProductRow.tsx`, `ProductDetailSheet.tsx`, `FilterSheet.tsx`, `*.module.css`
- Modify: `CatalogPage.tsx` (menu branch), `router.tsx` (`/p/:id` → `/?p=:id` in menu layout; `?p=` opens the sheet)

**Interfaces:**
- Consumes: same as Task 16; `Drawer` (Mantine, `position="bottom"` on mobile / `"right"` on desktop).
- Produces: `<ProductList/>` — rows grouped by category with sticky group headers; `<ProductRow product/>` = name + variant line, price, `StockChip`, `+` quick-add (or qty stepper if already in cart); `<ProductDetailSheet productId onClose/>` = the product page's content in a sheet (reuse `ProductImage`, `BulkPricing`, `Provenance`, `Upsells`, `AddToCart`; upsell tap navigates within the sheet preserving search); `<FilterSheet/>` = category tree with counts, "All products" reset.

**Design brief**: the current menu's dense idiom reinterpreted in Mantine — rows ~56 px, tabular-nums prices, quiet dividers (`--sf-line`), group headers on `--sf-surface` with the category emoji when present; the sheet slides up on mobile with a grab handle and a sticky action footer. Filter button in the menu shell bar shows a dot when a category is active.

- [ ] **Step 1: Build.** - [ ] **Step 2: Browser check + screenshots** (`catalog-menu-{mobile,desktop}.png`). - [ ] **Step 3: Commit** — `feat(web): menu-layout catalog rows, detail sheet, filter sheet`.

---

### Task 18 [UI]: Wholesale catalog variant

**Files:**
- Create: `web/src/features/wholesale/WholesaleCatalogPage.tsx`, `WholesaleRow.tsx`, `TierLadder.tsx`, `WholesaleBar.tsx`, `*.module.css`
- Test: `web/test/wholesale.test.ts` (`bandRows`, `ladderRungs` ported from the menu §9)

**Interfaces:**
- Consumes: `useCatalog`, `useCartStore` (`add`, `setQuantity`), `resolveTier`/`resolveUnitPrice`, shell search.
- Produces: `<WholesaleCatalogPage/>` (rendered by `CatalogPage` when `features.wholesale`, under either shell); `bandRows(products)`, `ladderRungs(product)` pure helpers.

**Design brief**: port the menu's wholesale table — SKU column, name (shrink-to-fit then wrap), unit price resolved at the current qty, `−N%`/`bulk` chip toggling the `TierLadder`, line total, `− [qty] +` stepper; greenbar banding per category run (`--sf-surface-2`), sticky `WholesaleBar` footer (count, subtotal, "View basket" → opens cart drawer). Desktop: full-width table; mobile: two-line rows.

- [ ] **Step 1: Tests for the two helpers → fail → port → pass.** - [ ] **Step 2: Build UI, browser check with `features.wholesale=true`, screenshot.** - [ ] **Step 3: Commit** — `feat(web): wholesale catalog variant`.

---

### Task 19 [UI]: Cart — drawer, mobile bar, cart page, server sync

**Files:**
- Create: `web/src/features/cart/useServerCart.ts`, `CartDrawer.tsx`, `CartLine.tsx`, `CartSummary.tsx`, `MobileCartBar.tsx`, `CartPage.tsx`, `*.module.css`
- Modify: shells (mount `CartDrawer`, `MobileCartBar` when `features.ordering`), `router.tsx` (`/cart`)
- Test: `web/test/use-server-cart.test.tsx` (mutation maps local lines → `PUT /cart` body; 422 message surfaces; 401 falls back to local)

**Interfaces:**
- Consumes: `useCartStore`, `api/cart.ts`, `useSessionStore`, `notifications`.
- Produces: `useServerCart()` → `{ sync(): Promise<void>; setQuantity(productId, qty); remove(productId); isSyncing; issues: ServerCartLine[] }` — in `server` mode every local mutation is applied optimistically then `PUT /cart` with the full line list (debounced 400 ms, latest-wins), response replaces local via `replaceFromServer`; lines flagged `inactive`/`outOfStock`/`priceChanged` are surfaced as `issues` for the drawer to render ("Price changed", "Out of stock — remove to continue"). In `local` mode it is a no-op wrapper over the store. `CartDrawer` (right on desktop, bottom on mobile), `MobileCartBar` (sticky bottom: count + subtotal + "Checkout"), `CartPage` (mobile full page = same content).

**Design brief**: lines with thumbnail (`productImageUrl(imageProductId ?? productId, 'thumbnail')`), name, unit price (struck-through base when a tier applies), qty stepper, remove; summary: subtotal, "Shipping & discounts calculated at checkout", primary "Checkout" CTA (→ `/checkout`; when `!session && !features.guestCheckout` → `/login?returnTo=/checkout`), secondary "Continue shopping". Mixed pre-order + in-stock warning (`selectHasMixedPreorder`). Empty state with a link back to the catalog.

- [ ] **Step 1: Hook tests → fail → implement → pass.** - [ ] **Step 2: Build UI; browser check logged-out (local) and logged-in (server mode: confirm the line appears in admin Live Carts).** - [ ] **Step 3: Commit** — `feat(web): cart drawer/page with server sync`.

---

### Task 20 [UI]: Auth — login page/modal, WhatsApp flow, Telegram widget

**Files:**
- Create: `web/src/features/auth/LoginPage.tsx`, `LoginModal.tsx`, `WhatsappLogin.tsx`, `TelegramLogin.tsx`, `useWhatsappLogin.ts`, `useLoginSuccess.ts`, `*.module.css`
- Modify: `router.tsx` (`/login`), shells (account icon → `/login` or `/account`)
- Test: `web/test/use-whatsapp-login.test.tsx` (state machine: idle → started → polling → completed → done; `expired` → error state; stops polling after 5 min)

**Interfaces:**
- Consumes: `api/auth.ts`, `useSessionStore`, `useCartStore.mergeForLogin` + `putCart`/`replaceFromServer`, `settings.login`, `useUiStore.loginOpen`.
- Produces: `useWhatsappLogin()` → `{ state: 'idle' | 'started' | 'completed' | 'done' | 'expired' | 'error'; start(); data?: WhatsappStart; error?: string }`; `useLoginSuccess()` → `(result: LoginResult) => Promise<void>` which sets the session, merges the local cart into the server cart (`PUT /cart` with `mergeForLogin()` unioned with the server cart by productId, quantities summed), invalidates `['cart']`, then navigates to `returnTo ?? '/account'`; `<TelegramLogin botUsername onAuth/>` injects the official widget script (`https://telegram.org/js/telegram-widget.js?22`, `data-telegram-login`, `data-size="large"`, `data-onauth="onSfTelegramAuth(user)"`, `data-request-access="write"`) into a `ref` container and defines `window.onSfTelegramAuth` once; shows the 5-s "Telegram login isn't available right now" hint if the iframe never mounts.

**Design brief**: a calm single-column page: brand, "Sign in to {brand.name}", one card per available provider. WhatsApp card: explanation, big "Open WhatsApp" button (`waLink`), the `code` in a copyable mono block "or send this code to {number}", a spinner line "Waiting for your message…" with countdown to `expiresAt`, restart link on expiry. Telegram card: the widget centred. A third, muted card "Email or phone sign-in — coming soon" rendered only if `settings.login` ever gains a `password` key (type it as optional; today it never renders). `LoginModal` = same content in a Mantine `Modal` for inline prompts from the cart/checkout.

- [ ] **Step 1: Hook tests → fail → implement (poll every 2 s with `setTimeout` chain, abort on unmount; on `completed` call `completeWhatsapp` exactly once) → pass.**
- [ ] **Step 2: Build UI. Browser check**: with a paired wa-worker, complete a real WhatsApp login; with a registered domain (or at least verify the widget script mounts and the hint logic), check Telegram. If neither is available in dev, verify the states with Playwright route mocks (Task 29) and say so in the commit body.
- [ ] **Step 3: Commit** — `feat(web): WhatsApp + Telegram login, cart merge on login`.

---

### Task 21: Checkout logic — schemas, quote hook, outcome mapping

**Files:**
- Create: `web/src/api/checkout.ts`, `web/src/features/checkout/schemas.ts`, `useQuote.ts`, `outcome.ts`, `form-state.ts`
- Test: `web/test/checkout-schemas.test.ts`, `web/test/checkout-outcome.test.ts`, `web/test/use-quote.test.tsx`

**Interfaces:**
- Consumes: `api`, types from Task 10, `composePhoneNumber`, `useCartStore`, `useSessionStore`, `settings.contactModes` + `settings.turnstile`.
- Produces:
  - `api/checkout.ts`: `quote(input: QuoteInput)`, `placeOrder(input: CheckoutInput)`, `guestQuote(input: GuestQuoteInput)`, `placeGuestOrder(input: GuestCheckoutInput)`.
  - `schemas.ts`: `buildContactSchema(contactModes, { guest: boolean })` (port of the menu's `buildContactStepSchema`; when `guest`, at least one of email/phone required regardless of modes), `addressSchema`, `shippingSchema`, `paymentSchema` (`{ method?: string; coin?: string; network?: string; useStoreCredit: boolean }` with refine: crypto requires coin+network when the chosen method has `cryptoOptions`).
  - `form-state.ts`: `CheckoutForm` (`firstName, surname, email, phone, phonePrefix, phonePrefixTouched, addressLine1, addressLine2, city, county, zip, country, shippingOptionId, couponCode, useStoreCredit, paymentMethod, coin, network, notes`), `DEFAULT_FORM`, `loadPersistedForm()`/`persistForm()` under `sf-checkout-v1` (never persists tokens), `clearPersistedCheckout()`.
  - `useQuote(form, { guest, turnstileToken })` → `{ quote, isFetching, error }`: react-query keyed on `['quote', guest, hash(country, couponCode, shippingOptionId, useStoreCredit, lines)]`, debounced 300 ms, `keepPreviousData`, enabled only when `country` is set; guest variant sends `items` + `turnstileToken` and is **not** auto-refetched (a token is single-use — the hook exposes `refetchWithToken(token)`).
  - `outcome.ts`: `resolveCheckoutOutcome(result: CheckoutResult): { kind: 'external'; url: string } | { kind: 'navigate'; to: string }`:

```ts
export function resolveCheckoutOutcome(r: CheckoutResult) {
  if (r.payment.type === 'checkout_url') return { kind: 'external' as const, url: r.payment.url };
  const orderPath = publicOrderPath(r.publicUrl);
  if ((r.payment.type === 'crypto' || r.payment.type === 'manual') && orderPath) return { kind: 'navigate' as const, to: orderPath };
  const q = new URLSearchParams({ order: r.reference });
  if (r.warning) q.set('warning', '1');
  return { kind: 'navigate' as const, to: orderPath && r.payment.type !== 'none' ? orderPath : `/order-placed?${q}` };
}
/** Same-origin `/order/:ref/:key` when publicUrl points at this site, else null. */
export function publicOrderPath(publicUrl: string | null): string | null {
  if (!publicUrl) return null;
  try { const u = new URL(publicUrl, window.location.origin); const m = u.pathname.match(/^\/order\/([^/]+)\/([^/]+)$/); return m && u.origin === window.location.origin ? u.pathname : null; } catch { return null; }
}
```

  Also: when `publicOrderPath` is non-null, `saveOrder(ref, key)` is called so the payment-redirect pages can find the key later.

- [ ] **Step 1: Tests** — schemas: hidden email stripped, required phone enforced, `composePhoneNumber` applied; guest requires one contact; payment refine. Outcome: the four `payment.type` cases + foreign-origin `publicUrl` → `/order-placed`. `useQuote`: debounces, sends uppercased coupon, surfaces a 422 message, keeps the previous quote while refetching.
- [ ] **Step 2: Run → fail. Implement. Run → pass. Commit** — `feat(web): checkout schemas, quote hook, outcome mapping`.

---

### Task 22 [UI]: Checkout pages (session + guest)

**Files:**
- Create: `web/src/features/checkout/CheckoutPage.tsx`, `steps/ContactStep.tsx`, `steps/AddressStep.tsx`, `steps/ShippingStep.tsx`, `steps/PaymentStep.tsx`, `steps/ReviewStep.tsx`, `QuoteSummary.tsx`, `CouponField.tsx`, `CryptoComboPicker.tsx`, `PhoneField.tsx`, `CountrySelect.tsx`, `GuestTurnstile.tsx`, `*.module.css`
- Modify: `router.tsx` (`/checkout`)

**Interfaces:**
- Consumes: Task 21; `useServerCart` issues; `useSettings().contactModes/turnstile/features`; `@marsidev/react-turnstile` (`Turnstile` with `options={{ size: 'invisible' }}`, `ref.execute()`/`reset()`); `resolveCheckoutOutcome`; `clearPersistedCheckout`; `useCartStore.clear`; `notifications`.
- Produces: `/checkout` — guarded: `features.ordering`; if no session and `!features.guestCheckout` → redirect to `/login?returnTo=/checkout`; if no session and guest allowed → guest mode. Steps: Contact → Address → Shipping → Payment → Review, with a persistent `QuoteSummary` (desktop right column; mobile collapsible header) showing items, subtotal, coupon, shipping, store credit, grand total, amount due, selected method fee/charge total.

**Behaviour** (each step validates with the Task 21 schemas; errors inline):
- Contact: names; email/phone per `contactModes` (`PhoneField` = dial-code select seeded once from `defaultPhoneCountry`, not overwritten once touched); guest mode shows a "Have an account? Sign in" link.
- Address: lines, city/zip, county, `CountrySelect` (all ISO codes via `Intl.DisplayNames`, default from `contactModes.defaultPhoneCountry`); changing country syncs the phone prefix unless touched; triggers a re-quote.
- Shipping: radio list from `quote.shippingOptions` (FREE or price); `CouponField` (apply → re-quote; shows `coupon.autoApplied` as "Applied automatically"); empty list → "We can't ship to {country} yet".
- Payment: "Use store credit (£x available)" switch when `storeCredit.balance > 0` (session only); method cards from `quote.paymentMethods` (`displayName`, `feeRateText`, `chargeTotal`); choosing a crypto method opens `CryptoComboPicker` (port of the menu's: Coins/Stablecoins groups, per-combo `chargeTotal`); `amountDue === 0` → "Nothing left to pay — store credit covers this order".
- Review: items, address, contact, shipping, payment, totals; `notes` textarea (≤ 500); in guest mode the invisible `GuestTurnstile` executes on submit to mint a fresh token for `placeGuestOrder` (and a second fresh token is required for every guest re-quote — `useQuote.refetchWithToken`); submit button "Place order · {chargeTotal}". On success: `clearCart()` (local) — server cart is already cleared by the backend —, `clearPersistedCheckout()`, `saveOrder` when applicable, then `resolveCheckoutOutcome` → `window.location.assign(url)` or `navigate(to)`. `409 Checkout already in progress` → toast + re-enable after 3 s. Any other error → inline alert with `errorMessage(err)`.

**Design brief**: a focused, distraction-free checkout: progress stepper (Mantine `Stepper`, compact on mobile), one card per step, sticky summary. Large tap targets; currency always via `Money`. Never show gateway brand names beyond `displayName`.

- [ ] **Step 1: Build per brief.** - [ ] **Step 2: Browser check**: session path through to the Review step with a real quote; guest path with `features.guestCheckout=true` + Cloudflare test site key `1x00000000000000000000AA` (always passes) — **stop at Review without placing an order on the live DB**; screenshot each step at 390 px. - [ ] **Step 3: Typecheck + tests pass. Commit** — `feat(web): checkout flow (session + guest)`.

---
### Task 23 [UI]: Account area — orders, loyalty, referrals, profile

**Files:**
- Create: `web/src/api/orders.ts`, `web/src/api/profile.ts`
- Create: `web/src/features/account/AccountLayout.tsx`, `OrdersPage.tsx`, `OrderDetailPage.tsx`, `LoyaltyPage.tsx`, `ReferralsPage.tsx`, `ProfilePage.tsx`, `*.module.css`
- Modify: `router.tsx` (`/account/*`, guard `session: true`)
- Test: `web/test/api-orders.test.ts` (pagination meta unwrapped), `web/test/referral-share.test.ts` (share text/links)

**Interfaces:**
- Consumes: `unwrap`/`unwrapWithMeta`, types from Task 10, `useSessionStore`, `logout()`, `withPrefilledText`, `formatMoney`, `formatDate`, status labels from Task 24's `status.ts` (create that file in this task if 24 has not run yet — it is shared).
- Produces: `api/orders.ts`: `fetchOrders(page, limit)` → `{ data: OrderSummary[], meta: PageMeta }`, `fetchOrder(reference)`; `api/profile.ts`: `fetchProfile()`, `setReferralCode(code)`, `fetchRedeemOptions()` (404 → `null`), `redeem(optionId)`; `referralShareText(code, brandName)` + `referralShareLinks(code, brand)` (WA/TG prefilled via `withPrefilledText` on `brand.links`).

**Design brief**: `/account` → tabs (Mantine `Tabs`, scrollable on mobile; `SegmentedControl` is fine too): **Orders** — list cards (reference mono, date, status pill via `orderStatusLabel`, total, "Balance due" when `outstandingBalance > 0`), paginated (`hasNextPage` → "Load more"); `/account/orders/:ref` — items, totals, payments ledger (method + status + amount), shipments (carrier, tracking link), "Open order page" when `publicUrl` (it has the payment actions). **Loyalty** — big number points, store credit balance, redeem section (options as cards, `affordable` gates the button, confirm modal, success toast with new balances; hidden when `fetchRedeemOptions()` returns null). **Referrals** — your code (copy), share buttons (WA/TG/native `navigator.share` when available), counts, and "Were you referred?" form when `!hasReferrer` (422 messages inline), `referrerNickname` when set. **Profile** — nickname, member since, total orders/spend, identities as badges (Telegram/WhatsApp/Email linked or not), logout button (calls `logout()`, clears the session, empties the local cart and sets mode → `local` — never `DELETE /cart`, the server cart belongs to the customer — then navigates `/`).

- [ ] **Step 1: API modules + tests → pass.** - [ ] **Step 2: Build UI; browser check with a real session** (log in via WhatsApp in dev, or seed a session token with a tsx script against the dev DB — **delete it in a `finally`**). Screenshots of each tab at 390 px. - [ ] **Step 3: Commit** — `feat(web): account area (orders, loyalty, referrals, profile)`.

---

### Task 24 [UI]: Order status page `/order/:ref/:accessKey` (port)

**Files:**
- Create: `web/src/api/public-order.ts` (`fetchPublicOrder`, `fetchPaymentOptions`, `selectPaymentMethod`, `submitCryptoTxid` + `InvalidLinkError`, `PaymentConflictError`)
- Create: `web/src/features/order-status/status.ts` (port of the menu's `status.ts` — `statusView`, `ROUTE_STEPS`, `SHIPMENT_LABEL`, `orderStatusLabel`; tone strings become `--sf-*` var names instead of Tailwind classes), `OrderStatusPage.tsx`, `StatusHero.tsx`, `ItemsCard.tsx`, `AddressCard.tsx`, `ShipmentCard.tsx`, `PaymentSection.tsx`, `MethodPicker.tsx`, `CryptoPaymentCard.tsx`, `CryptoComboPicker.tsx` (reuse Task 22's if identical props), `StateScreens.tsx`, `*.module.css`
- Test: `web/test/order-status.test.ts` (`statusView` table; `visibleCryptoPayments`; `cardState` machine; `maskTxid`)

**Interfaces:**
- Consumes: `api` (paths `orders/${ref}/${key}`, `orders/${ref}/${key}/payment-options`, `orders/${ref}/${key}/payment-method`, `orders/${ref}/${key}/crypto-txid`), `PublicOrder` types, `saveOrder`, `formatMoney(…, order.currency)`, `formatCoinAmount`, `withPrefilledText` + `orderChatMessage`.
- Produces: the page under `Chromeless`; `visibleCryptoPayments(order)`, `cardState(payment, mutationState)`, `maskTxid(t)` helpers.

**Port notes (from the menu report §6 — keep these behaviours)**: `refetchInterval` logic (10 s while a gateway payment is pending or a crypto payment is `checking`, 30 s otherwise while payable, off when terminal); `document.title = \`Order ${ref} — ${brand.name}\``; `saveOrder` after first successful load; `InvalidLinkError` on 400/403/404 → invalid-link screen; `PaymentConflictError` (409) → silent refetch. `MethodPicker` now lists `fetchPaymentOptions()` (Task 6) instead of the menu's worker route: cards by `slot`, label `slotLabel(displayName, feeRateText)` ("Crypto (3% discount)"), crypto → `CryptoComboPicker` → `selectPaymentMethod({ method, coin, network })`; gateway → open a blank tab synchronously on click, then point it at `checkoutUrl` (popup-blocker pattern from the menu); `manual` → the public order view carries no bank instructions, so `MethodPicker` keeps the picked `PaymentMethod` in local state and, after `selectPaymentMethod` resolves and the order refetches, renders that method's `details` (`Record<string,string>`) inline as copyable rows under "Pay by {displayName}", plus the chat links; if `details` is null, show "We'll send your payment details" + chat links. `CryptoPaymentCard`: amount + address copy rows, exact-amount warning, txid form (10–120 chars), `state` machine `awaiting | checking | confirmed | attention`. No carrier/gateway brand leakage beyond what the backend returns.

**Design brief**: chromeless, centred, max-width ~60rem; `StatusHero` with the vertical 4-step route (hidden while `payment.canPay`), then Payment → Shipments on the left and Items → Address on the right at ≥ 62em (single column on mobile). Status tones via `--sf-success/--sf-danger/--sf-muted`.

- [ ] **Step 1: Pure-helper tests → port → pass.** - [ ] **Step 2: Build UI; browser check with a real `publicUrl` from the admin (read-only: do not submit a txid or switch methods on a real order; verify those with Playwright mocks in Task 29).** Screenshots mobile/desktop. - [ ] **Step 3: Commit** — `feat(web): public order status page with payment actions`.

---

### Task 25 [UI]: Payment redirect + order-placed pages

**Files:**
- Create: `web/src/features/payment-redirect/PaymentSuccessPage.tsx`, `PaymentCancelPage.tsx`, `web/src/features/order-placed/OrderPlacedPage.tsx`
- Modify: `router.tsx`

**Interfaces:**
- Consumes: `findSavedOrder`, `useCartStore.clear`, `clearPersistedCheckout`, `ContactLinks`, `withPrefilledText` + `orderChatMessage`, `brand.links`.
- Produces: `/payment/success?order=REF` — clears cart + persisted checkout; if `findSavedOrder(REF)` → immediately `<Navigate to={/order/REF/KEY} replace/>` (the order page polls status itself); else a "Thanks — your order {REF} is being confirmed" screen with chat links (no polling endpoint exists without the key). `/payment/cancel?order=REF` — "Payment cancelled, no charge taken", "Return to your order" when saved, else "Back to shop". `/order-placed?order=REF[&warning=1]` — "Order placed", reference (copy), when `warning=1` an alert "We couldn't set up online payment — contact us to pay", WA/TG buttons prefilled with `orderChatMessage(REF)`; fallback copy when no links configured.

- [ ] **Step 1: Build (small). Step 2: Browser check the three routes by URL. Step 3: Commit** — `feat(web): payment redirect + order-placed pages`.

---

### Task 26 [UI]: Tracking page (port)

**Files:**
- Create: `web/src/api/tracking.ts` (`lookupTracking({ reference, turnstileToken, refresh })` → `POST storefront/tracking`, `TrackingLookupError(status)`)
- Create: `web/src/features/tracking/status.ts` (port verbatim minus Tailwind maps: `STAGES`, `stageOfCode`, `furthestStage`, `parcelLabel`, `parcelTone`, `orderStatusLabel`, `isTerminalParcel`, `hasHandover`, `partitionEvents`, `formatStamp`, `formatRelative`, `refreshReadyAt`, `allTerminal`, `REFRESH_COOLDOWN_MS`), `TrackingPage.tsx`, `LookupForm.tsx`, `OrderHero.tsx`, `ParcelCard.tsx`, `ParcelTimeline.tsx`, `ProgressStepper.tsx`, `RefreshButton.tsx`, `StateScreens.tsx`, `*.module.css`
- Modify: `router.tsx` (`/tracking`, `/tracking/:reference`, guard `feature: 'tracking'`)
- Test: `web/test/tracking-status.test.ts` (`furthestStage`, `partitionEvents`, `refreshReadyAt`, `allTerminal`, `formatRelative`)

**Interfaces:**
- Consumes: `settings.turnstile?.siteKey` (when null → the page renders "Tracking isn't available right now" — the backend needs a Turnstile secret), `@marsidev/react-turnstile`, `listSavedOrders` (recent chips), `TrackingLookup` types.
- Produces: the page with the menu's phases `idle | pending | found | notFound | error | blocked` and the bounded token wait (15 s → `blocked`), fetch-once-per-reference guard, stale-response guard, refresh cooldown (10 min) — port the orchestration from `ecommerce-menu/web/src/features/tracking/TrackingPage.tsx` faithfully (the four coupled effects are documented in the menu report §7; keep their order).

**Design brief**: the lookup form (reference input, recent-order chips), then hero (status label, placed date, items, parcels), page-level `ProgressStepper` for single-parcel orders, `ParcelCard`s with timelines, `RefreshButton` with "Checked 3 min ago" and cooldown `m:ss`. Degraded notice when `trackingAvailable === false`. Tones via `--sf-*`.

- [ ] **Step 1: Helper tests → port → pass.** - [ ] **Step 2: Build; browser check with a real reference + the test Turnstile site key (backend must have the matching test secret).** Screenshot. - [ ] **Step 3: Commit** — `feat(web): tracking page (Turnstile-gated, backend lookup)`.

---

### Task 27 [UI]: Verify page (port)

**Files:**
- Create: `web/src/api/verify.ts` (`verifyProductUnit(code, authCode)` → `GET verify/${encodeURIComponent(code)}/${authCode}`; 404 → `{ status: 'invalid' }`), `web/src/features/verify/VerifyPage.tsx`, `*.module.css`
- Modify: `router.tsx` (`/verify`, guard `feature: 'verify'`)

**Interfaces:** port of the menu's page: zod `{ verificationCode: min(1), authCode: /^\d+$/ }`, states `idle | pending | verified | invalid | error`, editing resets a verdict; `verified` card shows Issued/Expires (`formatDate`) and a "past expiry" note when `expiryDate < now`; `invalid` and `error` cards include `ContactLinks`.

- [ ] **Step 1: Build. Step 2: Browser check with a real label code pair (read-only). Step 3: Commit** — `feat(web): verify page`.

---

## Phase E — Release, verification, hand-off

### Task 28: README, release workflow, Worker fallthrough polish

**Files:**
- Create: `README.md`, `.github/workflows/release.yml`, `web/public/favicon.svg` (neutral placeholder used until a client uploads one)
- Modify: `worker/src/index.ts` (add `/healthz` → `200 ok`, no-cache, for Spec 3's post-deploy check)

- [ ] **Step 1: README** — sections: what this is (link to the spec), local dev (3 terminals), settings you must set in the admin before the storefront works (`storefront_enabled`, features/theme via PUT until Spec 2, Turnstile keys for guest checkout/tracking, BotFather `/setdomain` for Telegram, `ORDER_PUBLIC_BASE_URL` must point at this site), manual deploy (`npm run deploy` + route), release process (tag `vX.Y.Z` → zip on the GitHub Release), what the Worker does and does not do, test commands.

- [ ] **Step 2: Release workflow**

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
      - run: npm test
      - run: npm run build
      - name: Package
        run: |
          mkdir -p out
          zip -r "out/storefront-${GITHUB_REF_NAME}.zip" wrangler.jsonc worker/src web/dist package.json
      - uses: softprops/action-gh-release@v2
        with: { files: out/*.zip }
```

- [ ] **Step 3: `/healthz`** in the Worker + a test. `npm test` green. Commit — `chore: README, release workflow, healthz`.

---

### Task 29: Playwright mocked pass (both layouts, mobile + desktop)

**Files:**
- Create: `e2e/fixtures/settings.{storefront,menu}.json`, `e2e/fixtures/catalog.json`, `e2e/fixtures/quote.json`, `e2e/fixtures/public-order.json`, `e2e/fixtures/profile.json`, `e2e/mocks.ts`, `e2e/storefront.spec.ts`, `e2e/playwright.config.ts`
- Modify: root `package.json` (`"test:e2e": "playwright test -c e2e/playwright.config.ts"`, devDependency `@playwright/test`)

**Interfaces:**
- Consumes: the technique in memory `env-playwright-mocked-admin-pass` (Vite on a spare port, `page.route('**/api/**')` mocks, seeded `localStorage`); fixtures shaped exactly like the Task 10 types.
- Produces: a green e2e run + screenshots in `e2e/screenshots/` (gitignored) and a committed contact sheet `docs/screenshots/e2e-contact-sheet.png`.

- [ ] **Step 1: `mocks.ts`** — `installMocks(page, { settings, catalog, quote, order, profile, session?: boolean })` routing: `GET /api/storefront/settings`, `GET /api/catalog`, `GET /api/catalog/products/:id`, `GET/PUT /api/storefront/cart`, `POST /api/storefront/checkout/quote`, `POST /api/storefront/checkout` (→ `{ payment: { type: 'crypto', … }, publicUrl: 'http://localhost:5174/order/REF/KEY' }`), `GET /api/orders/REF/KEY`, `GET /api/orders/REF/KEY/payment-options`, `POST …/crypto-txid` (→ `checking`), `GET /api/storefront/orders`, `GET /api/storefront/profile`, `GET /api/storefront/profile/redeem-options`, `POST /api/storefront/auth/whatsapp/start`, `GET /api/storefront/auth/attempts/:id` (pending ×2 then completed), `POST …/complete` (→ token), `POST /api/storefront/tracking`, `GET /api/verify/:c/:a`, `GET /media/**` (1×1 PNG).

- [ ] **Step 2: Specs** (each runs for `{ layout: 'storefront' | 'menu' } × { viewport: 390×844 | 1280×800 }`):
  1. catalog renders products + categories; search filters; category click filters.
  2. product detail (page or sheet by layout) → add to cart → cart shows line → checkout (session seeded) → Contact → Address → Shipping (quote mocked) → Payment (crypto combo) → Review → place → lands on `/order/REF/KEY` with the crypto card → submit txid → "Verifying".
  3. guest checkout path with `features.guestCheckout = true` (Turnstile component stubbed by routing the `challenges.cloudflare.com` script to a tiny shim that calls `onSuccess('tok')`).
  4. login page: WhatsApp flow reaches "done" via the polling mocks and lands on `/account`; account tabs render orders/loyalty/referrals/profile.
  5. closed page when `enabled:false`; 503 `STOREFRONT_DISABLED` mid-session flips to closed.
  6. tracking page + verify page happy paths; `features.tracking=false` → 404.
  7. theme: after first load, reload → `--sf-bg` is set before React mounts (check `document.documentElement.style.getPropertyValue('--sf-bg')` in an `addInitScript` hook).

- [ ] **Step 3: Run `npm run test:e2e`** → all green; build the contact sheet from the screenshots (any simple montage script or a hand-composed PNG), commit it. Commit — `test(e2e): mocked Playwright pass for both layouts`.

---

### Task 30: End-to-end verification against the backend branch, then merge

- [ ] **Step 1: Full stack check** — backend on `feature/storefront-theme-guest-checkout` with `storefront_enabled=true`, Worker + Vite running. Walk: settings theme change applies on reload; catalog in both layouts; logged-out cart → login (real WhatsApp if the wa-worker is paired, else seeded token) → cart merged and visible in admin Live Carts; checkout to Review (do **not** place); account tabs against real data; a real `publicUrl` order page; tracking with the test Turnstile keys; verify with a real code pair. Note every deviation in `docs/verification-2026-08-XX.md`.
- [ ] **Step 2: Repo gates** — `npm run typecheck && npm test && npm run test:e2e && npm run build` in `ecommerce-storefront`; `npm run build` in `ecommerce-backend`.
- [ ] **Step 3: Merge backend** — `git checkout main && git merge --no-ff feature/storefront-theme-guest-checkout` in `ecommerce-backend` (do not push — the user pushes). Tag the storefront `v0.1.0` locally (`git tag v0.1.0`) so Spec 3 has a first release to target once pushed.
- [ ] **Step 4: Memory** — update `project_storefront_backend.md` / add `project_ecommerce_storefront.md` in the memory directory with: branch/merge state, what was verified live vs mocked, the Turnstile/tracking settings needed per client, and the Spec 2/3 hand-off points.
