# Backend: `storefront_settings` table + `storefront-deploy` module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move storefront configuration out of `bot_settings` into a new `storefront_settings` table, and add a `storefront-deploy` module that stores a store owner's Cloudflare API token (encrypted), lets them pick a zone + hostname, lists GitHub releases of `Kratos-Bots/public-storefront`, and deploys a chosen release to their Cloudflare account as a Worker with static assets and a custom domain — with a logged, socket-pushed deploy history.

**Architecture:** Standard 4-file module (`router/controller/service/schemas`) at `/api/v1/storefront-deploy`, admin-JWT only. Thin API clients in `src/lib/` (`cloudflare-api.ts`, `github-releases.ts`) over global `fetch`; release zip handling in `src/lib/storefront-release.ts` (fflate + blake3). One BullMQ queue (`storefront-deploy`, concurrency 1, attempts 1) runs the deploy job in the API process and emits `storefront-deploy:updated` over the admin socket after every log line. Config values live in `storefront_settings` (key/value), the token via the existing `encryptSecret`/`decryptSecret`.

**Tech Stack:** Express 5, Drizzle (Postgres), BullMQ, zod 4, Node 22 (`fetch`/`FormData`/`File` globals), new deps `fflate`, `blake3-wasm`, `mime-types` (+ `@types/mime-types`), dev dep `vitest`.

**Spec:** `T:\Projects\ecommerce\ecommerce-storefront\docs\superpowers\specs\2026-08-26-storefront-admin-editor-and-deploy-design.md` §2, §4, §5.

## Global Constraints

- Repo: `T:\Projects\ecommerce\ecommerce-backend`. Read its `CLAUDE.md` first. Run `npm` from that directory.
- **Extensionless relative imports** (`from '../config/env'`) — CommonJS (`"module": "NodeNext"`, no `"type"` field). Never add `.js`/`.ts` to imports.
- Every domain module is exactly `router.ts` / `controller.ts` / `service.ts` / `schemas.ts` (extra helper files are allowed alongside, e.g. `deploy-job.ts`).
- Throw `AppError` subclasses from `src/utils/errors`; controllers are one-liners calling `sendSuccess(res, data)` from `src/utils/response`. Express 5 forwards async rejections.
- `validate({ body: schema })` replaces `req.body` in place; controllers read `req.body`. `req.user!.id` is a `number`.
- After any change in `src/db/schema/`, run `npm run db:generate` (creates `drizzle/00NN_*.sql`) and restart the dev server. `npm run db:migrate` applies to `DATABASE_URL`.
- Worker name on Cloudflare is the constant `ecommerce-storefront`. GitHub repo is `Kratos-Bots/public-storefront`.
- Secrets never appear in logs or responses: the API token is only decrypted for outbound calls; `GET /connection` returns `tokenSuffix` only.
- Socket events carry minimal payloads (`{ id }`); clients re-fetch via REST.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_017mSv2DDn5QZPBHwUF4bkKc`.
- Dev database: `drizzle.config.ts` defaults to `postgres://ecom:ecom123@192.168.1.42:5432/ecom` when `DATABASE_URL` is unset; the same value is used by the manual verification steps below.

---

### Task 1: vitest + `UpstreamError`

**Files:**
- Create: `vitest.config.ts`, `src/test/setup.ts`, `src/utils/errors.test.ts`
- Modify: `package.json` (dev dep + scripts), `src/utils/errors.ts`

**Interfaces:**
- Produces: `class UpstreamError extends AppError` — `constructor(message = 'Upstream service error')`, status **502**. Used by every later task for Cloudflare/GitHub failures.
- Produces: `npm test` (vitest, `src/**/*.test.ts`) with env defaults so importing `src/config/env` in a test does not `process.exit(1)`.

- [ ] **Step 1: Install vitest and add scripts**

Run: `npm install --save-dev vitest@^4.1.0`

In `package.json` `"scripts"`, add:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

- [ ] **Step 2: Config + env setup file**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
});
```

`src/test/setup.ts` — `src/config/env.ts` `safeParse`s `process.env` at import and exits on failure, so every required var gets a harmless default before any module under test is imported:

```ts
// Defaults for the env vars `src/config/env.ts` requires, so unit tests can
// import modules that import `env` without the process exiting. Tests that
// need a specific value set it themselves *before* importing the module.
const defaults: Record<string, string> = {
  DATABASE_URL: 'postgres://test:test@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'test-jwt-secret-at-least-16',
  CLIENT_ID: 'test-client',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'test',
  S3_ACCESS_KEY_ID: 'test',
  S3_SECRET_ACCESS_KEY: 'test',
  OPENROUTER_API_KEY: 'test',
  API_HOST: 'api.test.example',
};
for (const [k, v] of Object.entries(defaults)) {
  if (process.env[k] === undefined) process.env[k] = v;
}
```

- [ ] **Step 3: Write the failing test**

`src/utils/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AppError, UpstreamError } from './errors';

describe('UpstreamError', () => {
  it('is a 502 AppError with a default message', () => {
    const err = new UpstreamError();
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(502);
    expect(err.message).toBe('Upstream service error');
  });

  it('keeps a custom message', () => {
    expect(new UpstreamError('Cloudflare: 10000: Authentication error').message).toBe(
      'Cloudflare: 10000: Authentication error',
    );
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test -- src/utils/errors.test.ts`
Expected: FAIL — `UpstreamError` is not exported.

- [ ] **Step 5: Add the class**

Append to `src/utils/errors.ts` (after `ServiceUnavailableError`):

```ts
/** A third-party API (Cloudflare, GitHub) failed or answered unexpectedly.
 *  The message carries the upstream error text verbatim for the admin UI. */
export class UpstreamError extends AppError {
  constructor(message: string = 'Upstream service error') {
    super(message, 502);
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: 2 passing, 0 failing.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts src/test/setup.ts src/utils/errors.ts src/utils/errors.test.ts package.json package-lock.json
git commit -m "test: add vitest; feat: UpstreamError (502)"
```

---

### Task 2: `storefront_settings` table — schema, data migration, repoint the storefront-settings module

**Files:**
- Create: `src/db/schema/storefront-settings.ts`, `src/modules/storefront-settings/store.ts`, `src/modules/storefront-settings/store.test.ts`
- Modify: `src/db/schema/index.ts`, `src/modules/storefront-settings/service.ts`, `src/modules/storefront-settings/branding.ts`, `src/modules/bot-settings/service.ts`, `src/modules/bot-settings/schemas.ts`, generated `drizzle/00NN_*.sql`

**Interfaces:**
- Produces (in `store.ts`, used by Tasks 7–9):
  ```ts
  export async function getStorefrontSetting(key: string): Promise<string | null>;
  export async function getStorefrontSettings(keys: readonly string[]): Promise<Map<string, string>>;
  export async function upsertStorefrontSetting(key: string, value: string): Promise<void>;
  export async function deleteStorefrontSetting(key: string): Promise<void>;
  /** Trimmed value → upsert; empty/null → delete (so read-side fallbacks see an absent key). */
  export async function setOrClearStorefrontSetting(key: string, value: string | null | undefined): Promise<void>;
  ```

- [ ] **Step 1: Schema file + export**

`src/db/schema/storefront-settings.ts`:

```ts
import { pgTable, text } from 'drizzle-orm/pg-core';
import { timestamps } from './_helpers';

/** Key/value store for everything the customer storefront (and its deploy
 *  pipeline) is configured with. `bot_settings` is for the Telegram bot only. */
export const storefrontSettings = pgTable('storefront_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  ...timestamps,
});
```

Append to `src/db/schema/index.ts`:

```ts
export * from './storefront-settings';
```

- [ ] **Step 2: Generate the migration and append the data move**

Run: `npm run db:generate`
Expected: a new file `drizzle/0025_<name>.sql` (number may differ — use whatever was created) containing `CREATE TABLE "storefront_settings" (...)`.

Append to the end of that SQL file (drizzle runs statements split on the breakpoint marker):

```sql
--> statement-breakpoint
INSERT INTO "storefront_settings" ("key", "value", "created_at", "updated_at")
  SELECT "key", "value", "created_at", "updated_at" FROM "bot_settings" WHERE "key" LIKE 'storefront\_%';
--> statement-breakpoint
DELETE FROM "bot_settings" WHERE "key" LIKE 'storefront\_%';
```

(`\_` escapes the LIKE wildcard so only the literal `storefront_` prefix matches.) Do **not** edit `drizzle/meta/*` by hand — drizzle-kit owns it.

- [ ] **Step 3: Write the failing store test**

`src/modules/storefront-settings/store.test.ts` — the store is a thin Drizzle wrapper; unit-test the one piece of logic (`setOrClearStorefrontSetting`'s trim/clear decision) by mocking the two primitives:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsert = vi.fn();
const del = vi.fn();
vi.mock('./store-primitives', () => ({
  upsertStorefrontSetting: (...a: unknown[]) => upsert(...a),
  deleteStorefrontSetting: (...a: unknown[]) => del(...a),
  getStorefrontSetting: vi.fn(),
  getStorefrontSettings: vi.fn(),
}));

import { setOrClearStorefrontSetting } from './store';

describe('setOrClearStorefrontSetting', () => {
  beforeEach(() => { upsert.mockReset(); del.mockReset(); });

  it('upserts a trimmed value', async () => {
    await setOrClearStorefrontSetting('k', '  v  ');
    expect(upsert).toHaveBeenCalledWith('k', 'v');
    expect(del).not.toHaveBeenCalled();
  });

  it.each([null, undefined, '', '   '])('deletes when the value is %s', async (v) => {
    await setOrClearStorefrontSetting('k', v as string | null | undefined);
    expect(del).toHaveBeenCalledWith('k');
    expect(upsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test -- src/modules/storefront-settings/store.test.ts`
Expected: FAIL — cannot resolve `./store` / `./store-primitives`.

- [ ] **Step 5: Implement the store (two files so the primitives are mockable)**

`src/modules/storefront-settings/store-primitives.ts`:

```ts
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { storefrontSettings } from '../../db/schema/storefront-settings';

export async function getStorefrontSetting(key: string): Promise<string | null> {
  const row = (await db.select().from(storefrontSettings).where(eq(storefrontSettings.key, key)).limit(1))[0];
  return row?.value ?? null;
}

export async function getStorefrontSettings(keys: readonly string[]): Promise<Map<string, string>> {
  if (keys.length === 0) return new Map();
  const rows = await db.select().from(storefrontSettings).where(inArray(storefrontSettings.key, [...keys]));
  return new Map(rows.map((r) => [r.key, r.value]));
}

export async function upsertStorefrontSetting(key: string, value: string): Promise<void> {
  await db
    .insert(storefrontSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: storefrontSettings.key, set: { value, updatedAt: new Date() } });
}

export async function deleteStorefrontSetting(key: string): Promise<void> {
  await db.delete(storefrontSettings).where(eq(storefrontSettings.key, key));
}
```

`src/modules/storefront-settings/store.ts`:

```ts
import { deleteStorefrontSetting, upsertStorefrontSetting } from './store-primitives';

export {
  getStorefrontSetting,
  getStorefrontSettings,
  upsertStorefrontSetting,
  deleteStorefrontSetting,
} from './store-primitives';

/** Sets the key to a trimmed value, or deletes it outright when cleared so
 *  read-side fallbacks (e.g. payment slots falling back to the bot slot) see
 *  a genuinely absent key rather than a stored empty string. */
export async function setOrClearStorefrontSetting(key: string, value: string | null | undefined): Promise<void> {
  const trimmed = value?.trim();
  if (trimmed) {
    await upsertStorefrontSetting(key, trimmed);
  } else {
    await deleteStorefrontSetting(key);
  }
}
```

- [ ] **Step 6: Run the store test**

Run: `npm test -- src/modules/storefront-settings/store.test.ts`
Expected: 5 passing.

- [ ] **Step 7: Repoint `storefront-settings/service.ts`**

In `src/modules/storefront-settings/service.ts`:

1. Delete the import `import { botSettings } from '../../db/schema/bot-settings';` (line 4) and remove `getBotSettingValue,` is **kept** (line 318 reads the bot's `bot_username`), but remove `upsertBotSetting,` from the `../bot-settings/service` import.
2. Add: `import { getStorefrontSetting, getStorefrontSettings as readStorefrontSettings, upsertStorefrontSetting, setOrClearStorefrontSetting } from './store';`
3. Delete the local `setOrClearBotSetting` function (lines 155–165) and replace every call `setOrClearBotSetting(KEYS.x, v)` with `setOrClearStorefrontSetting(KEYS.x, v)`.
4. Replace every `await upsertBotSetting({ key: KEYS.x, value: V })` with `await upsertStorefrontSetting(KEYS.x, V)` (lines 245–285 in `updateStorefrontSettings`).
5. Replace `getBotSettingValue(KEYS.…)` with `getStorefrontSetting(KEYS.…)` at lines 168, 172–175 (only the `KEYS.*` reads — the `PAYMENT_SLOT_KEYS.*` fallbacks stay on `getBotSettingValue` because those are bot keys), 219, 226–227.
6. Replace the bulk read in `getStorefrontSettings` (lines ~181–184, `db.select().from(botSettings).where(inArray(botSettings.key, Object.values(KEYS)))` and the `get(key)` closure built from it) with:
   ```ts
   const values = await readStorefrontSettings(Object.values(KEYS));
   const get = (key: string): string | null => values.get(key) ?? null;
   ```
   If `db`/`eq`/`inArray` imports become unused, remove them.
7. Line 318 stays `getBotSettingValue('bot_username')`.
8. The admin SPA needs the current logo/favicon URLs for previews. Add to the `StorefrontSettings` interface (after `trackingApiKeySet`):
   ```ts
   /** Origin-relative URLs (`/api/v1/storefront-settings/branding/logo?v=…`); null when none uploaded. */
   branding: { logoUrl: string | null; faviconUrl: string | null };
   ```
   and in `getStorefrontSettings()`'s returned object:
   ```ts
   branding: {
     logoUrl: await getStorefrontBrandingUrl('logo'),
     faviconUrl: await getStorefrontBrandingUrl('favicon'),
   },
   ```
   (`getStorefrontBrandingUrl` is already imported from `./branding`.) The registry entry for `GET /storefront-settings` gets `branding: { logoUrl, faviconUrl }` appended to its description.

Then in `src/modules/storefront-settings/branding.ts`: replace each `getBotSettingValue(...)` with `getStorefrontSetting(...)`, each `upsertBotSetting({ key, value })` with `upsertStorefrontSetting(key, value)`, and each `db.delete(botSettings).where(eq(botSettings.key, …))` with `deleteStorefrontSetting(…)`, importing from `./store`. Remove the now-unused `botSettings`/bot-settings imports.

Run: `npx tsc --noEmit`
Expected: no errors. (`grep -n "botSettings\|upsertBotSetting" src/modules/storefront-settings/*.ts` must return nothing.)

- [ ] **Step 8: Trim the bot-settings module**

`src/modules/bot-settings/service.ts`: delete the `STOREFRONT_SETTING_PREFIX` const with its comment block (lines 25–38) and make `listBotSettings` a plain select:

```ts
export async function listBotSettings() {
  return db.select().from(botSettings);
}
```

`src/modules/bot-settings/schemas.ts`: keep the write-side refinements; change only the message:

```ts
const RESERVED_KEY_MESSAGE =
  "Keys starting with 'storefront_' belong to the storefront (storefront_settings table) — use /api/v1/storefront-settings";
```

Run: `npx tsc --noEmit` → no errors. `npm test` → all passing.

- [ ] **Step 9: Apply the migration and verify the data move (dev DB)**

Run: `npm run db:migrate`

Then verify with a throwaway script (uses the dev DB from `drizzle.config.ts`):

```bash
npx tsx -e "
import { db } from './src/db/client';
import { sql } from 'drizzle-orm';
const a = await db.execute(sql\`select count(*)::int as n from storefront_settings\`);
const b = await db.execute(sql\`select count(*)::int as n from bot_settings where key like 'storefront\\\\_%'\`);
console.log('storefront_settings rows:', a.rows[0].n, '| leftover in bot_settings:', b.rows[0].n);
process.exit(0);
"
```

Expected: `storefront_settings rows: <N ≥ 1>` (every storefront key the dev DB had) and `leftover in bot_settings: 0`.

Start the API (`npm run dev`) and `GET /api/v1/storefront-settings` with an admin JWT: the response must equal what it returned before the migration (compare `enabled`, `brand`, `theme`, `features`).

- [ ] **Step 10: Commit**

```bash
git add src/db/schema/storefront-settings.ts src/db/schema/index.ts drizzle/ src/modules/storefront-settings/ src/modules/bot-settings/
git commit -m "feat(storefront): move storefront_* settings into storefront_settings table"
```

---

### Task 3: `storefront_deploys` table

**Files:**
- Create: `src/db/schema/storefront-deploys.ts`
- Modify: `src/db/schema/index.ts`, generated `drizzle/00NN_*.sql`

**Interfaces:**
- Produces: `storefrontDeploys` Drizzle table; TS types `StorefrontDeployRow = typeof storefrontDeploys.$inferSelect`, `DeployStatus = 'queued' | 'running' | 'succeeded' | 'failed'`, `DeployLogLine = { t: string; level: 'info' | 'warn' | 'error'; msg: string }`.

- [ ] **Step 1: Schema**

`src/db/schema/storefront-deploys.ts`:

```ts
import { pgTable, integer, text, jsonb, index, timestamp } from 'drizzle-orm/pg-core';
import { timestamps } from './_helpers';
import { users } from './users';

export type DeployStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type DeployLogLine = { t: string; level: 'info' | 'warn' | 'error'; msg: string };

/** One row per deploy-from-admin attempt of the storefront Worker. */
export const storefrontDeploys = pgTable('storefront_deploys', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  tag: text('tag').notNull(),
  hostname: text('hostname').notNull(),
  status: text('status').$type<DeployStatus>().notNull().default('queued'),
  step: text('step'),
  log: jsonb('log').$type<DeployLogLine[]>().notNull().default([]),
  error: text('error'),
  warning: text('warning'),
  triggeredByUserId: integer('triggered_by_user_id').notNull().references(() => users.id),
  startedAt: timestamp('started_at', { mode: 'date', withTimezone: true }),
  finishedAt: timestamp('finished_at', { mode: 'date', withTimezone: true }),
  ...timestamps,
}, (table) => [
  index('storefront_deploys_status_idx').on(table.status),
]);

export type StorefrontDeployRow = typeof storefrontDeploys.$inferSelect;
```

Append to `src/db/schema/index.ts`: `export * from './storefront-deploys';`

- [ ] **Step 2: Generate + apply**

Run: `npm run db:generate` → new `drizzle/00NN_*.sql` with `CREATE TABLE "storefront_deploys"`. Then `npm run db:migrate`. Then `npx tsc --noEmit` → clean.

- [ ] **Step 3: Commit**

```bash
git add src/db/schema/storefront-deploys.ts src/db/schema/index.ts drizzle/
git commit -m "feat(storefront-deploy): storefront_deploys table"
```

---

### Task 4: Cloudflare API client

**Files:**
- Create: `src/lib/cloudflare-api.ts`, `src/lib/cloudflare-api.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export class CloudflareApiError extends Error { status: number; errors: { code: number; message: string }[] }
  export interface CloudflareAccount { id: string; name: string }
  export interface CloudflareZone { id: string; name: string; status: string }
  export type AssetManifest = Record<string, { hash: string; size: number }>;   // keys are '/'-prefixed paths
  export interface UploadSession { jwt: string; buckets: string[][] }
  export interface WorkerDomain { id: string; hostname: string; service: string; zone_id: string; zone_name: string }
  export interface AssetUploadFile { hash: string; base64: string; contentType: string }
  export interface ScriptMetadata {
    main_module: string;
    compatibility_date: string;
    bindings: Array<{ type: 'assets'; name: string } | { type: 'plain_text'; name: string; text: string }>;
    assets: { jwt?: string; config: { not_found_handling: string; run_worker_first?: string[]; _headers?: string; _redirects?: string } };
    keep_assets?: boolean;
    observability: { enabled: boolean };
  }
  export class CloudflareApi {
    constructor(token: string, fetchImpl?: typeof fetch);
    verifyToken(): Promise<{ id: string; status: string }>;
    listAccounts(): Promise<CloudflareAccount[]>;
    listZones(accountId: string): Promise<CloudflareZone[]>;
    createAssetsUploadSession(accountId: string, script: string, manifest: AssetManifest): Promise<UploadSession>;
    isSingleAssetUploadMode(sessionJwt: string): boolean;
    uploadAssetBucket(accountId: string, sessionJwt: string, files: AssetUploadFile[]): Promise<string | null>; // completion jwt if returned
    uploadSingleAsset(accountId: string, sessionJwt: string, file: AssetUploadFile): Promise<string | null>;
    putScript(accountId: string, script: string, metadata: ScriptMetadata, moduleSource: string): Promise<unknown>;
    listDomains(accountId: string): Promise<WorkerDomain[]>;
    attachDomain(accountId: string, input: { zoneId: string; hostname: string; service: string }): Promise<WorkerDomain>;
  }
  ```

- [ ] **Step 1: Write the failing tests**

`src/lib/cloudflare-api.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { CloudflareApi, CloudflareApiError } from './cloudflare-api';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function fakeJwt(payload: Record<string, unknown>) {
  const b64 = (s: string) => Buffer.from(s).toString('base64url');
  return `${b64('{"alg":"none"}')}.${b64(JSON.stringify(payload))}.sig`;
}

describe('CloudflareApi', () => {
  it('sends the bearer token and unwraps result', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true, result: [{ id: 'a1', name: 'Acme' }], errors: [] }));
    const api = new CloudflareApi('tok', fetchImpl as unknown as typeof fetch);
    const accounts = await api.listAccounts();
    expect(accounts).toEqual([{ id: 'a1', name: 'Acme' }]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts?per_page=50');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('throws CloudflareApiError with code: message on failure envelopes', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ success: false, result: null, errors: [{ code: 10000, message: 'Authentication error' }] }, 403),
    );
    const api = new CloudflareApi('bad', fetchImpl as unknown as typeof fetch);
    await expect(api.verifyToken()).rejects.toMatchObject({
      name: 'CloudflareApiError',
      status: 403,
      message: '10000: Authentication error',
    });
  });

  it('throws CloudflareApiError on non-JSON bodies', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>502</html>', { status: 502 }));
    const api = new CloudflareApi('tok', fetchImpl as unknown as typeof fetch);
    await expect(api.listAccounts()).rejects.toBeInstanceOf(CloudflareApiError);
    await expect(api.listAccounts()).rejects.toMatchObject({ message: 'Cloudflare API responded 502' });
  });

  it('uploads a bucket as base64 multipart parts named by hash, authorised with the session jwt', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true, result: { jwt: 'completion' }, errors: [] }));
    const api = new CloudflareApi('tok', fetchImpl as unknown as typeof fetch);
    const jwt = await api.uploadAssetBucket('a1', 'session-jwt', [
      { hash: 'h1', base64: Buffer.from('hello').toString('base64'), contentType: 'text/html' },
    ]);
    expect(jwt).toBe('completion');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/a1/workers/assets/upload?base64=true');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer session-jwt');
    const form = init.body as FormData;
    const part = form.get('h1') as File;
    expect(part.name).toBe('h1');
    expect(part.type).toBe('text/html');
    expect(await part.text()).toBe(Buffer.from('hello').toString('base64'));
  });

  it('detects single-asset upload mode from the session jwt', () => {
    const api = new CloudflareApi('tok');
    expect(api.isSingleAssetUploadMode(fakeJwt({ wrangler_single_asset_uploads: true }))).toBe(true);
    expect(api.isSingleAssetUploadMode(fakeJwt({}))).toBe(false);
    expect(api.isSingleAssetUploadMode('not-a-jwt')).toBe(false);
  });

  it('PUTs the script as multipart with metadata + module part', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true, result: { id: 'ecommerce-storefront' }, errors: [] }));
    const api = new CloudflareApi('tok', fetchImpl as unknown as typeof fetch);
    await api.putScript('a1', 'ecommerce-storefront', {
      main_module: 'index.js',
      compatibility_date: '2026-08-01',
      bindings: [{ type: 'assets', name: 'ASSETS' }, { type: 'plain_text', name: 'BACKEND_URL', text: 'https://api.example/' }],
      assets: { jwt: 'completion', config: { not_found_handling: 'single-page-application', run_worker_first: ['/api/*'] } },
      observability: { enabled: true },
    }, 'export default { fetch() {} }');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/a1/workers/scripts/ecommerce-storefront');
    expect(init.method).toBe('PUT');
    const form = init.body as FormData;
    expect(JSON.parse(await (form.get('metadata') as File).text()).main_module).toBe('index.js');
    const mod = form.get('index.js') as File;
    expect(mod.type).toBe('application/javascript+module');
  });

  it('attaches a domain with zone_id + hostname + service', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ success: true, result: { id: 'd1', hostname: 'shop.example.com', service: 'ecommerce-storefront', zone_id: 'z1', zone_name: 'example.com' }, errors: [] }),
    );
    const api = new CloudflareApi('tok', fetchImpl as unknown as typeof fetch);
    const d = await api.attachDomain('a1', { zoneId: 'z1', hostname: 'shop.example.com', service: 'ecommerce-storefront' });
    expect(d.hostname).toBe('shop.example.com');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/a1/workers/domains');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ zone_id: 'z1', hostname: 'shop.example.com', service: 'ecommerce-storefront', environment: 'production' });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- src/lib/cloudflare-api.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/cloudflare-api.ts`:

```ts
/** Minimal Cloudflare v4 API client for deploying the storefront Worker.
 *  Every method is one HTTP call; the envelope `{ success, result, errors }`
 *  is unwrapped and failures become CloudflareApiError with the upstream
 *  `code: message` list as the message (surfaced verbatim to admins). */

const BASE = 'https://api.cloudflare.com/client/v4';

export interface CloudflareErrorEntry { code: number; message: string }

export class CloudflareApiError extends Error {
  readonly status: number;
  readonly errors: CloudflareErrorEntry[];
  constructor(status: number, errors: CloudflareErrorEntry[]) {
    super(errors.length ? errors.map((e) => `${e.code}: ${e.message}`).join('; ') : `Cloudflare API responded ${status}`);
    this.name = 'CloudflareApiError';
    this.status = status;
    this.errors = errors;
  }
}

interface Envelope<T> { success: boolean; result: T; errors?: CloudflareErrorEntry[] }

export interface CloudflareAccount { id: string; name: string }
export interface CloudflareZone { id: string; name: string; status: string }
export type AssetManifest = Record<string, { hash: string; size: number }>;
export interface UploadSession { jwt: string; buckets: string[][] }
export interface WorkerDomain { id: string; hostname: string; service: string; zone_id: string; zone_name: string }
export interface AssetUploadFile { hash: string; base64: string; contentType: string }
export interface ScriptMetadata {
  main_module: string;
  compatibility_date: string;
  bindings: Array<{ type: 'assets'; name: string } | { type: 'plain_text'; name: string; text: string }>;
  assets: {
    jwt?: string;
    config: { not_found_handling: string; run_worker_first?: string[]; _headers?: string; _redirects?: string };
  };
  keep_assets?: boolean;
  observability: { enabled: boolean };
}

export class CloudflareApi {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly token: string, fetchImpl?: typeof fetch) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  private async request<T>(path: string, init: RequestInit = {}, bearer: string = this.token): Promise<T> {
    const res = await this.fetchImpl(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${bearer}`, ...(init.headers as Record<string, string> | undefined) },
    });
    let body: Envelope<T> | null = null;
    try {
      body = (await res.json()) as Envelope<T>;
    } catch {
      body = null;
    }
    if (!res.ok || !body || body.success === false) {
      throw new CloudflareApiError(res.status, body?.errors ?? []);
    }
    return body.result;
  }

  private json(body: unknown, method: 'POST' | 'PUT' = 'POST'): RequestInit {
    return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  }

  verifyToken() {
    return this.request<{ id: string; status: string }>('/user/tokens/verify');
  }

  listAccounts() {
    return this.request<CloudflareAccount[]>('/accounts?per_page=50');
  }

  listZones(accountId: string) {
    return this.request<CloudflareZone[]>(`/zones?account.id=${encodeURIComponent(accountId)}&status=active&per_page=50`);
  }

  createAssetsUploadSession(accountId: string, script: string, manifest: AssetManifest) {
    return this.request<UploadSession>(
      `/accounts/${accountId}/workers/scripts/${script}/assets-upload-session`,
      this.json({ manifest }),
    );
  }

  /** Cloudflare may flag a session for one-request-per-asset uploads. */
  isSingleAssetUploadMode(sessionJwt: string): boolean {
    try {
      const payload = JSON.parse(Buffer.from(sessionJwt.split('.')[1] ?? '', 'base64url').toString('utf8'));
      return payload.wrangler_single_asset_uploads === true;
    } catch {
      return false;
    }
  }

  async uploadAssetBucket(accountId: string, sessionJwt: string, files: AssetUploadFile[]): Promise<string | null> {
    const form = new FormData();
    for (const f of files) {
      form.append(f.hash, new File([f.base64], f.hash, { type: f.contentType }), f.hash);
    }
    const result = await this.request<{ jwt?: string }>(
      `/accounts/${accountId}/workers/assets/upload?base64=true`,
      { method: 'POST', body: form },
      sessionJwt,
    );
    return result?.jwt ?? null;
  }

  async uploadSingleAsset(accountId: string, sessionJwt: string, file: AssetUploadFile): Promise<string | null> {
    const result = await this.request<{ jwt?: string }>(
      `/accounts/${accountId}/workers/assets/upload/${file.hash}`,
      { method: 'POST', headers: { 'Content-Type': file.contentType }, body: Buffer.from(file.base64, 'base64') },
      sessionJwt,
    );
    return result?.jwt ?? null;
  }

  putScript(accountId: string, script: string, metadata: ScriptMetadata, moduleSource: string) {
    const form = new FormData();
    form.append('metadata', new File([JSON.stringify(metadata)], 'metadata.json', { type: 'application/json' }), 'metadata.json');
    form.append(
      metadata.main_module,
      new File([moduleSource], metadata.main_module, { type: 'application/javascript+module' }),
      metadata.main_module,
    );
    return this.request<unknown>(`/accounts/${accountId}/workers/scripts/${script}`, { method: 'PUT', body: form });
  }

  listDomains(accountId: string) {
    return this.request<WorkerDomain[]>(`/accounts/${accountId}/workers/domains`);
  }

  attachDomain(accountId: string, input: { zoneId: string; hostname: string; service: string }) {
    return this.request<WorkerDomain>(
      `/accounts/${accountId}/workers/domains`,
      this.json({ zone_id: input.zoneId, hostname: input.hostname, service: input.service, environment: 'production' }, 'PUT'),
    );
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- src/lib/cloudflare-api.test.ts`
Expected: 7 passing. (If `File` is reported undefined, the Node version is < 20 — this repo requires Node 22.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/cloudflare-api.ts src/lib/cloudflare-api.test.ts
git commit -m "feat(storefront-deploy): Cloudflare API client"
```

---

### Task 5: GitHub releases client

**Files:**
- Create: `src/lib/github-releases.ts`, `src/lib/github-releases.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface StorefrontRelease { tag: string; name: string; publishedAt: string; notes: string; assetName: string; assetUrl: string }
  export function parseReleases(payload: unknown): StorefrontRelease[];     // pure
  export async function listStorefrontReleases(opts?: { fetchImpl?: typeof fetch; now?: number }): Promise<StorefrontRelease[]>; // cached 5 min, ETag, stale-on-error
  export function resetReleaseCache(): void;                                  // tests
  export const STOREFRONT_REPO = 'Kratos-Bots/public-storefront';
  ```

- [ ] **Step 1: Write the failing tests**

`src/lib/github-releases.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listStorefrontReleases, parseReleases, resetReleaseCache } from './github-releases';

const release = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  name: tag,
  draft: false,
  prerelease: false,
  published_at: '2026-08-26T10:00:00Z',
  body: 'notes',
  assets: [{ name: `storefront-${tag}.zip`, browser_download_url: `https://gh/${tag}.zip` }],
  ...extra,
});

describe('parseReleases', () => {
  it('keeps only published releases with exactly one storefront zip', () => {
    const out = parseReleases([
      release('v0.2.0'),
      release('v0.1.9', { draft: true }),
      release('v0.1.8', { prerelease: true }),
      release('v0.1.7', { assets: [] }),
      release('v0.1.6', { assets: [{ name: 'other.tar.gz', browser_download_url: 'x' }] }),
    ]);
    expect(out.map((r) => r.tag)).toEqual(['v0.2.0']);
    expect(out[0]).toEqual({
      tag: 'v0.2.0', name: 'v0.2.0', publishedAt: '2026-08-26T10:00:00Z', notes: 'notes',
      assetName: 'storefront-v0.2.0.zip', assetUrl: 'https://gh/v0.2.0.zip',
    });
  });

  it('returns [] for a non-array payload', () => {
    expect(parseReleases({ message: 'Not Found' })).toEqual([]);
  });
});

describe('listStorefrontReleases', () => {
  beforeEach(() => resetReleaseCache());

  it('fetches once within the TTL', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([release('v0.1.0')]), { status: 200, headers: { etag: '"e1"' } }));
    const a = await listStorefrontReleases({ fetchImpl: fetchImpl as unknown as typeof fetch, now: 0 });
    const b = await listStorefrontReleases({ fetchImpl: fetchImpl as unknown as typeof fetch, now: 60_000 });
    expect(a).toEqual(b);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('https://api.github.com/repos/Kratos-Bots/public-storefront/releases?per_page=20');
  });

  it('revalidates with the ETag after the TTL and keeps the cache on 304', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([release('v0.1.0')]), { status: 200, headers: { etag: '"e1"' } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    await listStorefrontReleases({ fetchImpl: fetchImpl as unknown as typeof fetch, now: 0 });
    const again = await listStorefrontReleases({ fetchImpl: fetchImpl as unknown as typeof fetch, now: 6 * 60_000 });
    expect(again.map((r) => r.tag)).toEqual(['v0.1.0']);
    const [, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['If-None-Match']).toBe('"e1"');
  });

  it('serves stale data when GitHub fails, and throws when there is no cache', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([release('v0.1.0')]), { status: 200 }))
      .mockResolvedValueOnce(new Response('rate limited', { status: 403 }));
    await listStorefrontReleases({ fetchImpl: fetchImpl as unknown as typeof fetch, now: 0 });
    const stale = await listStorefrontReleases({ fetchImpl: fetchImpl as unknown as typeof fetch, now: 10 * 60_000 });
    expect(stale.map((r) => r.tag)).toEqual(['v0.1.0']);

    resetReleaseCache();
    const failing = vi.fn(async () => new Response('down', { status: 503 }));
    await expect(listStorefrontReleases({ fetchImpl: failing as unknown as typeof fetch, now: 0 })).rejects.toMatchObject({
      statusCode: 502,
    });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- src/lib/github-releases.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/github-releases.ts`:

```ts
import { UpstreamError } from '../utils/errors';

export const STOREFRONT_REPO = 'Kratos-Bots/public-storefront';
const RELEASES_URL = `https://api.github.com/repos/${STOREFRONT_REPO}/releases?per_page=20`;
const TTL_MS = 5 * 60_000;
const ASSET_RE = /^storefront-v.+\.zip$/;

export interface StorefrontRelease {
  tag: string;
  name: string;
  publishedAt: string;
  notes: string;
  assetName: string;
  assetUrl: string;
}

let cache: { fetchedAt: number; etag: string | null; releases: StorefrontRelease[] } | null = null;

export function resetReleaseCache(): void {
  cache = null;
}

/** Published (non-draft, non-prerelease) releases carrying exactly one storefront-*.zip. */
export function parseReleases(payload: unknown): StorefrontRelease[] {
  if (!Array.isArray(payload)) return [];
  const out: StorefrontRelease[] = [];
  for (const r of payload as Array<Record<string, unknown>>) {
    if (r.draft || r.prerelease || typeof r.tag_name !== 'string') continue;
    const assets = Array.isArray(r.assets) ? (r.assets as Array<{ name: string; browser_download_url: string }>) : [];
    const zips = assets.filter((a) => ASSET_RE.test(a.name));
    if (zips.length !== 1) continue;
    out.push({
      tag: r.tag_name,
      name: typeof r.name === 'string' && r.name ? r.name : r.tag_name,
      publishedAt: typeof r.published_at === 'string' ? r.published_at : '',
      notes: typeof r.body === 'string' ? r.body : '',
      assetName: zips[0]!.name,
      assetUrl: zips[0]!.browser_download_url,
    });
  }
  return out;
}

export async function listStorefrontReleases(opts: { fetchImpl?: typeof fetch; now?: number } = {}): Promise<StorefrontRelease[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) return cache.releases;

  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'ecommerce-backend' };
  if (cache?.etag) headers['If-None-Match'] = cache.etag;

  let res: Response;
  try {
    res = await fetchImpl(RELEASES_URL, { headers });
  } catch (err) {
    if (cache) return cache.releases;
    throw new UpstreamError(`GitHub unreachable: ${(err as Error).message}`);
  }

  if (res.status === 304 && cache) {
    cache = { ...cache, fetchedAt: now };
    return cache.releases;
  }
  if (!res.ok) {
    if (cache) return cache.releases;
    throw new UpstreamError(`GitHub responded ${res.status} listing releases`);
  }
  const releases = parseReleases(await res.json());
  cache = { fetchedAt: now, etag: res.headers.get('etag'), releases };
  return releases;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- src/lib/github-releases.test.ts`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/github-releases.ts src/lib/github-releases.test.ts
git commit -m "feat(storefront-deploy): GitHub releases client with ETag cache"
```

---

### Task 6: Release zip handling — extract, validate `release.json`, build the asset manifest

**Files:**
- Create: `src/lib/storefront-release.ts`, `src/lib/storefront-release.test.ts`
- Modify: `package.json` (deps `fflate`, `blake3-wasm`, `mime-types`, dev `@types/mime-types`)

**Interfaces:**
- Consumes: `AssetManifest` from Task 4.
- Produces:
  ```ts
  export interface ReleaseManifest {
    schemaVersion: 1; tag: string;
    worker: { main: string; compatibilityDate: string };
    assets: { directory: string; notFoundHandling: string; runWorkerFirst: string[] };
    vars: string[];
  }
  export const SUPPORTED_VARS: readonly string[];           // ['BACKEND_URL']
  export function extractRelease(zip: Uint8Array): { manifest: ReleaseManifest; files: Map<string, Uint8Array> }; // throws ValidationError
  export interface PreparedAssets { manifest: AssetManifest; byHash: Map<string, { path: string; bytes: Uint8Array; contentType: string }>; headers: string | null; redirects: string | null }
  export function prepareAssets(files: Map<string, Uint8Array>, directory: string): PreparedAssets;
  export function hashAsset(bytes: Uint8Array, path: string): string;     // blake3(base64(bytes) + ext).hex.slice(0, 32)
  export function contentTypeFor(path: string): string;                  // mime lookup, else 'application/null'
  ```

- [ ] **Step 1: Install deps**

Run: `npm install fflate@^0.8.2 blake3-wasm@^2.1.5 mime-types@^3.0.1 && npm install --save-dev @types/mime-types@^3.0.1`

- [ ] **Step 2: Write the failing tests**

`src/lib/storefront-release.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { contentTypeFor, extractRelease, hashAsset, prepareAssets } from './storefront-release';

const MANIFEST = {
  schemaVersion: 1,
  tag: 'v0.1.0',
  worker: { main: 'worker/dist/index.js', compatibilityDate: '2026-08-01' },
  assets: { directory: 'web/dist', notFoundHandling: 'single-page-application', runWorkerFirst: ['/api/*', '/media/*', '/healthz'] },
  vars: ['BACKEND_URL'],
};

function makeZip(manifest: unknown = MANIFEST, extra: Record<string, string> = {}) {
  return zipSync({
    'release.json': strToU8(JSON.stringify(manifest)),
    'worker/dist/index.js': strToU8('export default { fetch() {} }'),
    'web/dist/index.html': strToU8('<!doctype html>'),
    'web/dist/assets/app.js': strToU8('console.log(1)'),
    'web/dist/_headers': strToU8('/*\n  X-Content-Type-Options: nosniff\n'),
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, strToU8(v)])),
  });
}

describe('extractRelease', () => {
  it('returns the manifest and a path→bytes map', () => {
    const { manifest, files } = extractRelease(makeZip());
    expect(manifest.tag).toBe('v0.1.0');
    expect(manifest.worker.compatibilityDate).toBe('2026-08-01');
    expect([...files.keys()].sort()).toEqual(['web/dist/_headers', 'web/dist/assets/app.js', 'web/dist/index.html', 'worker/dist/index.js']);
  });

  it('rejects a missing release.json', () => {
    const zip = zipSync({ 'web/dist/index.html': strToU8('x') });
    expect(() => extractRelease(zip)).toThrow(/release\.json/);
  });

  it('rejects an unknown schemaVersion', () => {
    expect(() => extractRelease(makeZip({ ...MANIFEST, schemaVersion: 2 }))).toThrow(/not deployable by this backend version/);
  });

  it('rejects vars this backend cannot supply', () => {
    expect(() => extractRelease(makeZip({ ...MANIFEST, vars: ['BACKEND_URL', 'SENTRY_DSN'] }))).toThrow(/SENTRY_DSN/);
  });

  it('rejects a zip whose worker main is missing', () => {
    const zip = zipSync({ 'release.json': strToU8(JSON.stringify(MANIFEST)), 'web/dist/index.html': strToU8('x') });
    expect(() => extractRelease(zip)).toThrow(/worker\/dist\/index\.js/);
  });
});

describe('hashAsset / contentTypeFor', () => {
  it('hashes base64 content + extension with blake3, 32 hex chars', () => {
    const h = hashAsset(strToU8('hello'), '/index.html');
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(hashAsset(strToU8('hello'), '/index.txt')).not.toBe(h); // extension is part of the hash
    expect(hashAsset(strToU8('hello'), '/other/index.html')).toBe(h); // path is not
  });

  it('maps content types and falls back to application/null', () => {
    expect(contentTypeFor('/index.html')).toBe('text/html');
    expect(contentTypeFor('/assets/app.js')).toMatch(/javascript/);
    expect(contentTypeFor('/weird.unknownext')).toBe('application/null');
  });
});

describe('prepareAssets', () => {
  it('builds a /-prefixed manifest, dedupes by hash, and lifts _headers/_redirects out', () => {
    const { files } = extractRelease(makeZip(MANIFEST, { 'web/dist/copy.js': 'console.log(1)' }));
    const prepared = prepareAssets(files, 'web/dist');
    expect(Object.keys(prepared.manifest).sort()).toEqual(['/assets/app.js', '/copy.js', '/index.html']);
    expect(prepared.manifest['/index.html']!.size).toBe('<!doctype html>'.length);
    expect(prepared.byHash.size).toBe(2); // app.js and copy.js share a hash
    expect(prepared.headers).toBe('/*\n  X-Content-Type-Options: nosniff\n');
    expect(prepared.redirects).toBeNull();
  });

  it('rejects files over 25 MiB', () => {
    const files = new Map([['web/dist/big.bin', new Uint8Array(25 * 1024 * 1024 + 1)]]);
    expect(() => prepareAssets(files, 'web/dist')).toThrow(/25 MiB/);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm test -- src/lib/storefront-release.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

`src/lib/storefront-release.ts`:

```ts
import { unzipSync } from 'fflate';
import { hash as blake3 } from 'blake3-wasm';
import mime from 'mime-types';
import { z } from 'zod';
import { ValidationError } from '../utils/errors';
import type { AssetManifest } from './cloudflare-api';

export const SUPPORTED_VARS: readonly string[] = ['BACKEND_URL'];
const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const MAX_ASSET_COUNT = 20_000;
const META_FILES = new Set(['_headers', '_redirects', '.assetsignore']);

const releaseManifestSchema = z.object({
  schemaVersion: z.literal(1),
  tag: z.string().min(1),
  worker: z.object({ main: z.string().min(1), compatibilityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  assets: z.object({
    directory: z.string().min(1),
    notFoundHandling: z.string().min(1),
    runWorkerFirst: z.array(z.string()),
  }),
  vars: z.array(z.string()),
});
export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;

export function extractRelease(zip: Uint8Array): { manifest: ReleaseManifest; files: Map<string, Uint8Array> } {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip);
  } catch (err) {
    throw new ValidationError(`Release zip is corrupt: ${(err as Error).message}`);
  }
  const files = new Map<string, Uint8Array>();
  for (const [name, bytes] of Object.entries(entries)) {
    if (name.endsWith('/')) continue; // directory entries
    files.set(name.replace(/\\/g, '/'), bytes);
  }
  const raw = files.get('release.json');
  if (!raw) throw new ValidationError('Release zip has no release.json — it predates deploy-from-admin');
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw).toString('utf8'));
  } catch {
    throw new ValidationError('release.json is not valid JSON');
  }
  const result = releaseManifestSchema.safeParse(parsed);
  if (!result.success) {
    const version = (parsed as { schemaVersion?: unknown })?.schemaVersion;
    if (version !== 1) throw new ValidationError(`Release (schemaVersion ${String(version)}) is not deployable by this backend version`);
    throw new ValidationError(`release.json is invalid: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  }
  const manifest = result.data;
  const unsupported = manifest.vars.filter((v) => !SUPPORTED_VARS.includes(v));
  if (unsupported.length) throw new ValidationError(`Release needs variables this backend cannot supply: ${unsupported.join(', ')}`);
  if (!files.has(manifest.worker.main)) throw new ValidationError(`Release zip is missing ${manifest.worker.main}`);
  files.delete('release.json');
  return { manifest, files };
}

/** Cloudflare's asset hash: blake3 over (base64 content + bare extension), first 32 hex chars. */
export function hashAsset(bytes: Uint8Array, path: string): string {
  const ext = path.includes('.') ? path.slice(path.lastIndexOf('.') + 1) : '';
  return blake3(Buffer.from(bytes).toString('base64') + ext).toString('hex').slice(0, 32);
}

/** 'application/null' tells the Assets API to serve the file with no Content-Type. */
export function contentTypeFor(path: string): string {
  return mime.lookup(path) || 'application/null';
}

export interface PreparedAssets {
  manifest: AssetManifest;
  byHash: Map<string, { path: string; bytes: Uint8Array; contentType: string }>;
  headers: string | null;
  redirects: string | null;
}

export function prepareAssets(files: Map<string, Uint8Array>, directory: string): PreparedAssets {
  const prefix = directory.replace(/\/+$/, '') + '/';
  const manifest: AssetManifest = {};
  const byHash = new Map<string, { path: string; bytes: Uint8Array; contentType: string }>();
  let headers: string | null = null;
  let redirects: string | null = null;
  let count = 0;
  for (const [name, bytes] of files) {
    if (!name.startsWith(prefix)) continue;
    const rel = name.slice(prefix.length);
    if (META_FILES.has(rel)) {
      if (rel === '_headers') headers = Buffer.from(bytes).toString('utf8');
      if (rel === '_redirects') redirects = Buffer.from(bytes).toString('utf8');
      continue;
    }
    if (bytes.byteLength > MAX_ASSET_BYTES) throw new ValidationError(`${rel} is larger than Cloudflare's 25 MiB asset limit`);
    if (++count > MAX_ASSET_COUNT) throw new ValidationError(`Release has more than ${MAX_ASSET_COUNT} asset files`);
    const path = '/' + rel;
    const hash = hashAsset(bytes, path);
    manifest[path] = { hash, size: bytes.byteLength };
    if (!byHash.has(hash)) byHash.set(hash, { path, bytes, contentType: contentTypeFor(path) });
  }
  return { manifest, byHash, headers, redirects };
}
```

If `import { hash as blake3 } from 'blake3-wasm'` fails to type-check (the package ships its own `.d.ts`; the default CJS export exposes `hash`), use `import * as blake3Wasm from 'blake3-wasm'` and call `blake3Wasm.hash(...)`.

- [ ] **Step 5: Run the tests**

Run: `npm test -- src/lib/storefront-release.test.ts`
Expected: 10 passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storefront-release.ts src/lib/storefront-release.test.ts package.json package-lock.json
git commit -m "feat(storefront-deploy): release zip extraction + Cloudflare asset manifest"
```

---

### Task 7: Module — connection & target (schemas, service, controller, router, mount, docs)

**Files:**
- Create: `src/modules/storefront-deploy/schemas.ts`, `service.ts`, `service.test.ts`, `controller.ts`, `router.ts`
- Modify: `src/app.ts` (import + mount), `src/docs/registry.ts` (registerPath entries)

**Interfaces:**
- Consumes: `store.ts` helpers (Task 2), `CloudflareApi` (Task 4), `encryptSecret`/`decryptSecret` from `src/utils/crypto`.
- Produces (service):
  ```ts
  export const CF_KEYS = { token, accountId, accountName, tokenSuffix, verifiedAt, zoneId, zoneName, hostname, deployedTag, publicUrl } // storefront_cf_* / storefront_deployed_tag / storefront_public_url
  export const WORKER_NAME = 'ecommerce-storefront';
  export interface ConnectionInfo { connected: true; accountId: string; accountName: string; tokenSuffix: string; verifiedAt: string | null } | { connected: false }
  export interface DeployTarget { zoneId: string; zoneName: string; hostname: string }
  export async function getConnection(): Promise<ConnectionInfo>;
  export async function connect(input: { apiToken: string; accountId?: string }): Promise<ConnectionInfo | { needsAccount: true; accounts: CloudflareAccount[] }>;
  export async function testConnection(): Promise<{ token: 'ok' | 'fail'; accounts: 'ok' | 'fail'; zones: 'ok' | 'fail'; message?: string }>;
  export async function disconnect(): Promise<void>;
  export async function listZones(): Promise<CloudflareZone[]>;
  export async function getTarget(): Promise<DeployTarget | null>;
  export async function setTarget(input: { zoneId: string; hostname: string }): Promise<DeployTarget>;
  export function validateHostname(hostname: string, zoneName: string): string;  // pure — returns normalised hostname or throws ValidationError
  export async function getCloudflareClient(): Promise<{ api: CloudflareApi; accountId: string }>; // throws ValidationError('Connect Cloudflare first')
  ```
  The `deps` object pattern (`createApi?: (token: string) => CloudflareApi`) is used so tests inject a fake client.

- [ ] **Step 1: Schemas**

`src/modules/storefront-deploy/schemas.ts`:

```ts
import { z } from 'zod';

export const connectSchema = z.object({
  apiToken: z.string().trim().min(10).max(300),
  accountId: z.string().trim().min(1).max(64).optional(),
});
export type ConnectInput = z.infer<typeof connectSchema>;

export const targetSchema = z.object({
  zoneId: z.string().trim().min(1).max(64),
  hostname: z.string().trim().min(1).max(253),
});
export type TargetInput = z.infer<typeof targetSchema>;

export const createDeploySchema = z.object({
  tag: z.string().trim().regex(/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'tag must look like v1.2.3'),
});
export type CreateDeployInput = z.infer<typeof createDeploySchema>;

export const deployIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
```

- [ ] **Step 2: Write the failing service tests**

`src/modules/storefront-deploy/service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const kv = new Map<string, string>();
vi.mock('../storefront-settings/store', () => ({
  getStorefrontSetting: async (k: string) => kv.get(k) ?? null,
  getStorefrontSettings: async (keys: string[]) => new Map(keys.filter((k) => kv.has(k)).map((k) => [k, kv.get(k)!])),
  upsertStorefrontSetting: async (k: string, v: string) => { kv.set(k, v); },
  deleteStorefrontSetting: async (k: string) => { kv.delete(k); },
  setOrClearStorefrontSetting: async (k: string, v: string | null | undefined) => { v?.trim() ? kv.set(k, v.trim()) : kv.delete(k); },
}));

import { decryptSecret } from '../../utils/crypto';
import { CF_KEYS, connect, disconnect, getConnection, getTarget, setTarget, validateHostname } from './service';

function fakeApi(over: Partial<Record<'verifyToken' | 'listAccounts' | 'listZones', unknown>> = {}) {
  return {
    verifyToken: vi.fn(async () => ({ id: 't', status: 'active' })),
    listAccounts: vi.fn(async () => [{ id: 'a1', name: 'Acme' }]),
    listZones: vi.fn(async () => [{ id: 'z1', name: 'example.com', status: 'active' }]),
    ...over,
  };
}

describe('validateHostname', () => {
  it('normalises and accepts the apex or a subdomain of the zone', () => {
    expect(validateHostname(' Shop.Example.com ', 'example.com')).toBe('shop.example.com');
    expect(validateHostname('example.com', 'example.com')).toBe('example.com');
  });
  it.each(['*.example.com', 'shop.other.com', 'bad host.example.com', 'shopexample.com'])('rejects %s', (h) => {
    expect(() => validateHostname(h, 'example.com')).toThrow();
  });
});

describe('connect', () => {
  beforeEach(() => kv.clear());

  it('verifies, auto-selects a single account, stores the token encrypted', async () => {
    const api = fakeApi();
    const res = await connect({ apiToken: 'cf-token-1234' }, { createApi: () => api as never });
    expect(res).toMatchObject({ connected: true, accountId: 'a1', accountName: 'Acme', tokenSuffix: '1234' });
    expect(kv.get(CF_KEYS.token)).not.toContain('cf-token');
    expect(decryptSecret(kv.get(CF_KEYS.token)!)).toBe('cf-token-1234');
  });

  it('asks for an account when several exist and stores nothing', async () => {
    const api = fakeApi({ listAccounts: vi.fn(async () => [{ id: 'a1', name: 'A' }, { id: 'a2', name: 'B' }]) });
    const res = await connect({ apiToken: 'cf-token-1234' }, { createApi: () => api as never });
    expect(res).toEqual({ needsAccount: true, accounts: [{ id: 'a1', name: 'A' }, { id: 'a2', name: 'B' }] });
    expect(kv.size).toBe(0);
  });

  it('rejects an inactive token with 422', async () => {
    const api = fakeApi({ verifyToken: vi.fn(async () => ({ id: 't', status: 'disabled' })) });
    await expect(connect({ apiToken: 'cf-token-1234' }, { createApi: () => api as never })).rejects.toMatchObject({ statusCode: 422 });
  });

  it('disconnect clears connection and target', async () => {
    await connect({ apiToken: 'cf-token-1234' }, { createApi: () => fakeApi() as never });
    await setTarget({ zoneId: 'z1', hostname: 'shop.example.com' }, { createApi: () => fakeApi() as never });
    expect(await getTarget()).toEqual({ zoneId: 'z1', zoneName: 'example.com', hostname: 'shop.example.com' });
    await disconnect();
    expect(await getConnection()).toEqual({ connected: false });
    expect(await getTarget()).toBeNull();
  });

  it('setTarget rejects a zone not in the account', async () => {
    await connect({ apiToken: 'cf-token-1234' }, { createApi: () => fakeApi() as never });
    await expect(setTarget({ zoneId: 'zX', hostname: 'shop.example.com' }, { createApi: () => fakeApi() as never })).rejects.toMatchObject({ statusCode: 422 });
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm test -- src/modules/storefront-deploy/service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Service (connection + target part)**

`src/modules/storefront-deploy/service.ts` — this task writes the first half; Task 8 appends releases/deploys to the same file:

```ts
import { CloudflareApi, CloudflareApiError, type CloudflareAccount, type CloudflareZone } from '../../lib/cloudflare-api';
import { decryptSecret, encryptSecret } from '../../utils/crypto';
import { UpstreamError, ValidationError } from '../../utils/errors';
import {
  deleteStorefrontSetting,
  getStorefrontSetting,
  getStorefrontSettings,
  upsertStorefrontSetting,
} from '../storefront-settings/store';
import type { ConnectInput, TargetInput } from './schemas';

export const WORKER_NAME = 'ecommerce-storefront';

export const CF_KEYS = {
  token: 'storefront_cf_api_token',
  accountId: 'storefront_cf_account_id',
  accountName: 'storefront_cf_account_name',
  tokenSuffix: 'storefront_cf_token_suffix',
  verifiedAt: 'storefront_cf_verified_at',
  zoneId: 'storefront_cf_zone_id',
  zoneName: 'storefront_cf_zone_name',
  hostname: 'storefront_cf_hostname',
  deployedTag: 'storefront_deployed_tag',
  publicUrl: 'storefront_public_url',
} as const;

/** Injection seam for tests; production uses the real client. */
export interface ServiceDeps {
  createApi?: (token: string) => CloudflareApi;
}
const realApi = (token: string) => new CloudflareApi(token);

export type ConnectionInfo =
  | { connected: true; accountId: string; accountName: string; tokenSuffix: string; verifiedAt: string | null }
  | { connected: false };

export interface DeployTarget { zoneId: string; zoneName: string; hostname: string }

function upstream(err: unknown): never {
  if (err instanceof CloudflareApiError) throw new UpstreamError(`Cloudflare: ${err.message}`);
  throw err;
}

export async function getConnection(): Promise<ConnectionInfo> {
  const v = await getStorefrontSettings([CF_KEYS.token, CF_KEYS.accountId, CF_KEYS.accountName, CF_KEYS.tokenSuffix, CF_KEYS.verifiedAt]);
  if (!v.get(CF_KEYS.token) || !v.get(CF_KEYS.accountId)) return { connected: false };
  return {
    connected: true,
    accountId: v.get(CF_KEYS.accountId)!,
    accountName: v.get(CF_KEYS.accountName) ?? '',
    tokenSuffix: v.get(CF_KEYS.tokenSuffix) ?? '',
    verifiedAt: v.get(CF_KEYS.verifiedAt) ?? null,
  };
}

export async function getCloudflareClient(deps: ServiceDeps = {}): Promise<{ api: CloudflareApi; accountId: string }> {
  const v = await getStorefrontSettings([CF_KEYS.token, CF_KEYS.accountId]);
  const enc = v.get(CF_KEYS.token);
  const accountId = v.get(CF_KEYS.accountId);
  if (!enc || !accountId) throw new ValidationError('Connect Cloudflare first');
  return { api: (deps.createApi ?? realApi)(decryptSecret(enc)), accountId };
}

export async function connect(
  input: ConnectInput,
  deps: ServiceDeps = {},
): Promise<ConnectionInfo | { needsAccount: true; accounts: CloudflareAccount[] }> {
  const api = (deps.createApi ?? realApi)(input.apiToken);
  let accounts: CloudflareAccount[];
  try {
    const verify = await api.verifyToken();
    if (verify.status !== 'active') throw new ValidationError(`Token is ${verify.status}, not active`);
    accounts = await api.listAccounts();
  } catch (err) {
    if (err instanceof CloudflareApiError) throw new ValidationError(`Cloudflare rejected the token: ${err.message}`);
    throw err;
  }
  if (accounts.length === 0) throw new ValidationError('This token has access to no Cloudflare accounts');
  let account: CloudflareAccount | undefined;
  if (input.accountId) {
    account = accounts.find((a) => a.id === input.accountId);
    if (!account) throw new ValidationError('That account is not accessible with this token');
  } else if (accounts.length === 1) {
    account = accounts[0];
  } else {
    return { needsAccount: true, accounts: accounts.map((a) => ({ id: a.id, name: a.name })) };
  }
  await upsertStorefrontSetting(CF_KEYS.token, encryptSecret(input.apiToken));
  await upsertStorefrontSetting(CF_KEYS.accountId, account.id);
  await upsertStorefrontSetting(CF_KEYS.accountName, account.name);
  await upsertStorefrontSetting(CF_KEYS.tokenSuffix, input.apiToken.slice(-4));
  await upsertStorefrontSetting(CF_KEYS.verifiedAt, new Date().toISOString());
  return getConnection();
}

export async function testConnection(deps: ServiceDeps = {}) {
  const result: { token: 'ok' | 'fail'; accounts: 'ok' | 'fail'; zones: 'ok' | 'fail'; message?: string } = { token: 'fail', accounts: 'fail', zones: 'fail' };
  let client: { api: CloudflareApi; accountId: string };
  try {
    client = await getCloudflareClient(deps);
  } catch (err) {
    return { ...result, message: (err as Error).message };
  }
  try {
    const v = await client.api.verifyToken();
    if (v.status !== 'active') return { ...result, message: `Token is ${v.status}` };
    result.token = 'ok';
    const accounts = await client.api.listAccounts();
    if (!accounts.some((a) => a.id === client.accountId)) return { ...result, message: 'Token no longer has access to the connected account' };
    result.accounts = 'ok';
    await client.api.listZones(client.accountId);
    result.zones = 'ok';
    await upsertStorefrontSetting(CF_KEYS.verifiedAt, new Date().toISOString());
    return result;
  } catch (err) {
    return { ...result, message: err instanceof CloudflareApiError ? `Cloudflare: ${err.message}` : (err as Error).message };
  }
}

export async function disconnect(): Promise<void> {
  for (const key of [CF_KEYS.token, CF_KEYS.accountId, CF_KEYS.accountName, CF_KEYS.tokenSuffix, CF_KEYS.verifiedAt, CF_KEYS.zoneId, CF_KEYS.zoneName, CF_KEYS.hostname]) {
    await deleteStorefrontSetting(key);
  }
}

export async function listZones(deps: ServiceDeps = {}): Promise<CloudflareZone[]> {
  const { api, accountId } = await getCloudflareClient(deps);
  try {
    return (await api.listZones(accountId)).map((z) => ({ id: z.id, name: z.name, status: z.status }));
  } catch (err) {
    return upstream(err);
  }
}

const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Lowercases; must be the zone apex or end with `.<zone>`; no wildcards. */
export function validateHostname(hostname: string, zoneName: string): string {
  const h = hostname.trim().toLowerCase();
  if (!HOSTNAME_RE.test(h)) throw new ValidationError('Enter a valid hostname, e.g. shop.example.com');
  if (h !== zoneName && !h.endsWith(`.${zoneName}`)) throw new ValidationError(`Hostname must be ${zoneName} or a subdomain of it`);
  return h;
}

export async function getTarget(): Promise<DeployTarget | null> {
  const v = await getStorefrontSettings([CF_KEYS.zoneId, CF_KEYS.zoneName, CF_KEYS.hostname]);
  const zoneId = v.get(CF_KEYS.zoneId);
  const zoneName = v.get(CF_KEYS.zoneName);
  const hostname = v.get(CF_KEYS.hostname);
  if (!zoneId || !zoneName || !hostname) return null;
  return { zoneId, zoneName, hostname };
}

export async function setTarget(input: TargetInput, deps: ServiceDeps = {}): Promise<DeployTarget> {
  const zones = await listZones(deps);
  const zone = zones.find((z) => z.id === input.zoneId);
  if (!zone) throw new ValidationError('That zone is not in the connected Cloudflare account');
  const hostname = validateHostname(input.hostname, zone.name);
  await upsertStorefrontSetting(CF_KEYS.zoneId, zone.id);
  await upsertStorefrontSetting(CF_KEYS.zoneName, zone.name);
  await upsertStorefrontSetting(CF_KEYS.hostname, hostname);
  return { zoneId: zone.id, zoneName: zone.name, hostname };
}

export async function getDeployedTag(): Promise<string | null> {
  return getStorefrontSetting(CF_KEYS.deployedTag);
}
```

- [ ] **Step 5: Run the service tests**

Run: `npm test -- src/modules/storefront-deploy/service.test.ts`
Expected: 8 passing.

- [ ] **Step 6: Controller + router + mount**

`src/modules/storefront-deploy/controller.ts` (Task 8 appends the deploy handlers):

```ts
import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import * as service from './service';

export async function getConnection(_req: Request, res: Response) {
  sendSuccess(res, await service.getConnection());
}

export async function connect(req: Request, res: Response) {
  sendSuccess(res, await service.connect(req.body));
}

export async function testConnection(_req: Request, res: Response) {
  sendSuccess(res, await service.testConnection());
}

export async function disconnect(_req: Request, res: Response) {
  await service.disconnect();
  sendSuccess(res, { ok: true });
}

export async function listZones(_req: Request, res: Response) {
  sendSuccess(res, await service.listZones());
}

export async function getTarget(_req: Request, res: Response) {
  sendSuccess(res, await service.getTarget());
}

export async function setTarget(req: Request, res: Response) {
  sendSuccess(res, await service.setTarget(req.body));
}
```

`src/modules/storefront-deploy/router.ts`:

```ts
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import { connectSchema, targetSchema } from './schemas';

export const storefrontDeployRouter = Router();

storefrontDeployRouter.use(authenticate, authorize('admin'));

storefrontDeployRouter.get('/connection', controller.getConnection);
storefrontDeployRouter.put('/connection', validate({ body: connectSchema }), controller.connect);
storefrontDeployRouter.post('/connection/test', controller.testConnection);
storefrontDeployRouter.delete('/connection', controller.disconnect);

storefrontDeployRouter.get('/zones', controller.listZones);
storefrontDeployRouter.get('/target', controller.getTarget);
storefrontDeployRouter.put('/target', validate({ body: targetSchema }), controller.setTarget);
```

`src/app.ts`: add `import { storefrontDeployRouter } from './modules/storefront-deploy/router';` next to the storefront-settings import (line 34), and after line 108 (`storefront-settings` mount) add:

```ts
app.use(`${v1}/storefront-deploy`, storefrontDeployRouter);
```

- [ ] **Step 7: Docs registry**

In `src/docs/registry.ts`, after the `// ---- STOREFRONT SETTINGS (admin) ----` block, add:

```ts
// ---- STOREFRONT DEPLOY (admin) ----
registry.registerPath({ method: 'get', path: '/api/v1/storefront-deploy/connection', tags: ['Storefront Deploy'], summary: 'Cloudflare connection status', security: bearerAuth, description: 'Never returns the token — only tokenSuffix (last 4 chars).', responses: { 200: { description: '{ connected, accountId, accountName, tokenSuffix, verifiedAt } | { connected: false }' } } });
registry.registerPath({ method: 'put', path: '/api/v1/storefront-deploy/connection', tags: ['Storefront Deploy'], summary: 'Connect a Cloudflare API token', security: bearerAuth, description: 'Verifies the token, lists accounts. With several accounts and no accountId, responds { needsAccount: true, accounts } and stores nothing.', request: { body: { content: { 'application/json': { schema: z.object({ apiToken: z.string(), accountId: z.string().optional() }) } } } }, responses: { 200: { description: 'Connection info or account picker' }, 422: { description: 'Token invalid/inactive' } } });
registry.registerPath({ method: 'post', path: '/api/v1/storefront-deploy/connection/test', tags: ['Storefront Deploy'], summary: 'Test the stored token (token, accounts, zones)', security: bearerAuth, responses: { 200: { description: "{ token: 'ok'|'fail', accounts, zones, message? }" } } });
registry.registerPath({ method: 'delete', path: '/api/v1/storefront-deploy/connection', tags: ['Storefront Deploy'], summary: 'Forget the Cloudflare token and deploy target', security: bearerAuth, responses: { 200: { description: '{ ok: true }' }, 409: { description: 'A deploy is in progress' } } });
registry.registerPath({ method: 'get', path: '/api/v1/storefront-deploy/zones', tags: ['Storefront Deploy'], summary: 'Active zones in the connected account', security: bearerAuth, responses: { 200: { description: '[{ id, name, status }]' } } });
registry.registerPath({ method: 'get', path: '/api/v1/storefront-deploy/target', tags: ['Storefront Deploy'], summary: 'Deploy target (zone + hostname)', security: bearerAuth, responses: { 200: { description: '{ zoneId, zoneName, hostname } | null' } } });
registry.registerPath({ method: 'put', path: '/api/v1/storefront-deploy/target', tags: ['Storefront Deploy'], summary: 'Set the deploy target', security: bearerAuth, request: { body: { content: { 'application/json': { schema: z.object({ zoneId: z.string(), hostname: z.string() }) } } } }, responses: { 200: { description: '{ zoneId, zoneName, hostname }' }, 422: { description: 'Zone not in account / hostname not on zone' } } });
```

Add `{ name: 'Storefront Deploy', description: 'Deploy the customer storefront to the store owner\'s Cloudflare account' }` to the `tags` array in `src/docs/generator.ts` (lines 16–36).

- [ ] **Step 8: Typecheck, run everything, smoke the routes**

Run: `npx tsc --noEmit && npm test` → clean / all passing.

Start `npm run dev`, then with an admin JWT:

```bash
curl -s -H "Authorization: Bearer $JWT" localhost:3000/api/v1/storefront-deploy/connection
# → {"success":true,"data":{"connected":false},"error":null}
curl -s -X PUT -H "Authorization: Bearer $JWT" -H 'content-type: application/json' -d '{"apiToken":"definitely-not-valid"}' localhost:3000/api/v1/storefront-deploy/connection
# → 422 {"success":false,"error":"Cloudflare rejected the token: ..."}
```

- [ ] **Step 9: Commit**

```bash
git add src/modules/storefront-deploy/ src/app.ts src/docs/registry.ts src/docs/generator.ts
git commit -m "feat(storefront-deploy): Cloudflare connection + deploy target endpoints"
```

---

### Task 8: Releases, deploys, the deploy job, queue and socket

**Files:**
- Create: `src/modules/storefront-deploy/deploy-job.ts`, `deploy-job.test.ts`, `src/lib/queues/storefront-deploy.ts`
- Modify: `src/modules/storefront-deploy/service.ts` (append), `controller.ts` (append), `router.ts` (append), `src/index.ts` (start/stop worker), `src/docs/registry.ts`

**Interfaces:**
- Consumes: Tasks 3–7.
- Produces (service, appended):
  ```ts
  export interface ReleaseListing { releases: StorefrontRelease[]; deployedTag: string | null; latestTag: string | null; updateAvailable: boolean }
  export async function getReleases(): Promise<ReleaseListing>;
  export async function createDeploy(input: { tag: string }, userId: number): Promise<StorefrontDeployRow>;   // 422/404/409 per spec
  export async function listDeploys(): Promise<Omit<StorefrontDeployRow, 'log'>[]>;                        // last 20, marks stale rows failed
  export async function getDeploy(id: number): Promise<StorefrontDeployRow>;                               // 404
  export async function hasActiveDeploy(): Promise<boolean>;
  ```
- Produces (`deploy-job.ts`):
  ```ts
  export interface DeployJobDeps {
    fetchImpl?: typeof fetch;                 // release download + health check
    createApi?: (token: string) => CloudflareApi;
    sleep?: (ms: number) => Promise<void>;
    healthAttempts?: number;                 // default 12
  }
  export async function runStorefrontDeploy(deployId: number, deps?: DeployJobDeps): Promise<void>;
  ```
- Produces (queue): `enqueueStorefrontDeploy(deployId: number)`, `startStorefrontDeployWorker()`, `stopStorefrontDeployWorker()`.
- Socket event: `storefront-deploy:updated` `{ id: number }` to room `role:admin`.

- [ ] **Step 1: Write the failing deploy-job test**

`src/modules/storefront-deploy/deploy-job.test.ts` — the job's DB access goes through four small functions in `deploy-job-store.ts` (created in Step 3) which the test mocks, so the whole step sequence runs in memory:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

type Row = { id: number; tag: string; hostname: string; status: string; step: string | null; log: { t: string; level: string; msg: string }[]; error: string | null; warning: string | null; startedAt: Date | null; finishedAt: Date | null };
const rows = new Map<number, Row>();
const settings = new Map<string, string>();
const emitted: unknown[] = [];

vi.mock('./deploy-job-store', () => ({
  loadDeploy: async (id: number) => rows.get(id) ?? null,
  patchDeploy: async (id: number, patch: Partial<Row>) => { Object.assign(rows.get(id)!, patch); },
  appendDeployLog: async (id: number, line: Row['log'][number]) => { rows.get(id)!.log.push(line); },
  notifyDeployUpdated: (id: number) => { emitted.push(id); },
}));
vi.mock('../storefront-settings/store', () => ({
  getStorefrontSetting: async (k: string) => settings.get(k) ?? null,
  getStorefrontSettings: async (keys: string[]) => new Map(keys.filter((k) => settings.has(k)).map((k) => [k, settings.get(k)!])),
  upsertStorefrontSetting: async (k: string, v: string) => { settings.set(k, v); },
  deleteStorefrontSetting: async (k: string) => { settings.delete(k); },
  setOrClearStorefrontSetting: async () => {},
}));
vi.mock('../../lib/github-releases', () => ({
  listStorefrontReleases: async () => [{ tag: 'v0.1.0', name: 'v0.1.0', publishedAt: '', notes: '', assetName: 'storefront-v0.1.0.zip', assetUrl: 'https://gh/v0.1.0.zip' }],
}));

import { encryptSecret } from '../../utils/crypto';
import { CF_KEYS } from './service';
import { runStorefrontDeploy } from './deploy-job';

const MANIFEST = { schemaVersion: 1, tag: 'v0.1.0', worker: { main: 'worker/dist/index.js', compatibilityDate: '2026-08-01' }, assets: { directory: 'web/dist', notFoundHandling: 'single-page-application', runWorkerFirst: ['/api/*'] }, vars: ['BACKEND_URL'] };
const ZIP = zipSync({ 'release.json': strToU8(JSON.stringify(MANIFEST)), 'worker/dist/index.js': strToU8('export default {}'), 'web/dist/index.html': strToU8('<html>'), 'web/dist/_headers': strToU8('/*\n  X-Frame-Options: DENY\n') });

function fakeApi(over: Record<string, unknown> = {}) {
  return {
    createAssetsUploadSession: vi.fn(async (_a: string, _s: string, manifest: Record<string, unknown>) => ({ jwt: 'session', buckets: [Object.values(manifest).map((m) => (m as { hash: string }).hash)] })),
    isSingleAssetUploadMode: () => false,
    uploadAssetBucket: vi.fn(async () => 'completion'),
    putScript: vi.fn(async () => ({ id: 'ecommerce-storefront' })),
    listDomains: vi.fn(async () => []),
    attachDomain: vi.fn(async () => ({ id: 'd1' })),
    ...over,
  };
}

function fetchFor(health: () => Response) {
  return vi.fn(async (url: string) => (url === 'https://gh/v0.1.0.zip' ? new Response(ZIP) : health()));
}

beforeEach(() => {
  rows.clear(); settings.clear(); emitted.length = 0;
  rows.set(1, { id: 1, tag: 'v0.1.0', hostname: 'shop.example.com', status: 'queued', step: null, log: [], error: null, warning: null, startedAt: null, finishedAt: null });
  settings.set(CF_KEYS.token, encryptSecret('cf-token'));
  settings.set(CF_KEYS.accountId, 'a1');
  settings.set(CF_KEYS.zoneId, 'z1');
  settings.set(CF_KEYS.zoneName, 'example.com');
  settings.set(CF_KEYS.hostname, 'shop.example.com');
});

describe('runStorefrontDeploy', () => {
  it('runs every step, attaches the domain, records success + deployed tag + public url', async () => {
    const api = fakeApi();
    await runStorefrontDeploy(1, { fetchImpl: fetchFor(() => new Response('ok')) as never, createApi: () => api as never, sleep: async () => {} });
    const row = rows.get(1)!;
    expect(row.status).toBe('succeeded');
    expect(row.error).toBeNull();
    expect(row.warning).toBeNull();
    expect(row.finishedAt).toBeInstanceOf(Date);
    expect(settings.get(CF_KEYS.deployedTag)).toBe('v0.1.0');
    expect(settings.get(CF_KEYS.publicUrl)).toBe('https://shop.example.com');
    const metadata = (api.putScript.mock.calls[0] as unknown as [string, string, { bindings: unknown[]; assets: { jwt: string; config: Record<string, unknown> } }])[2];
    expect(metadata.bindings).toEqual([{ type: 'assets', name: 'ASSETS' }, { type: 'plain_text', name: 'BACKEND_URL', text: 'https://api.test.example/' }]);
    expect(metadata.assets.jwt).toBe('completion');
    expect(metadata.assets.config._headers).toContain('X-Frame-Options');
    expect(api.attachDomain).toHaveBeenCalledWith('a1', { zoneId: 'z1', hostname: 'shop.example.com', service: 'ecommerce-storefront' });
    expect(row.log.map((l) => l.msg)).toEqual(expect.arrayContaining([expect.stringMatching(/Downloading/), expect.stringMatching(/Health check passed/)]));
    expect(emitted.length).toBeGreaterThan(5);
  });

  it('skips the upload when Cloudflare already has every asset, and skips domain attach when present', async () => {
    const api = fakeApi({
      createAssetsUploadSession: vi.fn(async () => ({ jwt: 'session', buckets: [] })),
      listDomains: vi.fn(async () => [{ id: 'd1', hostname: 'shop.example.com', service: 'ecommerce-storefront', zone_id: 'z1', zone_name: 'example.com' }]),
    });
    await runStorefrontDeploy(1, { fetchImpl: fetchFor(() => new Response('ok')) as never, createApi: () => api as never, sleep: async () => {} });
    expect(api.uploadAssetBucket).not.toHaveBeenCalled();
    expect(api.attachDomain).not.toHaveBeenCalled();
    const metadata = (api.putScript.mock.calls[0] as unknown as [string, string, { assets: { jwt?: string }; keep_assets?: boolean }])[2];
    expect(metadata.assets.jwt).toBe('session');
    expect(rows.get(1)!.status).toBe('succeeded');
  });

  it('marks the deploy failed with the Cloudflare error when the script upload fails', async () => {
    const { CloudflareApiError } = await import('../../lib/cloudflare-api');
    const api = fakeApi({ putScript: vi.fn(async () => { throw new CloudflareApiError(400, [{ code: 10021, message: 'Uncaught SyntaxError' }]); }) });
    await runStorefrontDeploy(1, { fetchImpl: fetchFor(() => new Response('ok')) as never, createApi: () => api as never, sleep: async () => {} });
    const row = rows.get(1)!;
    expect(row.status).toBe('failed');
    expect(row.step).toBe('script');
    expect(row.error).toBe('Cloudflare: 10021: Uncaught SyntaxError');
    expect(settings.get(CF_KEYS.deployedTag)).toBeUndefined();
  });

  it('succeeds with a warning when the health check never answers', async () => {
    const api = fakeApi();
    await runStorefrontDeploy(1, { fetchImpl: fetchFor(() => new Response('', { status: 522 })) as never, createApi: () => api as never, sleep: async () => {}, healthAttempts: 2 });
    const row = rows.get(1)!;
    expect(row.status).toBe('succeeded');
    expect(row.warning).toMatch(/did not answer/);
    expect(settings.get(CF_KEYS.deployedTag)).toBe('v0.1.0');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/modules/storefront-deploy/deploy-job.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: DB-touching helpers the job uses**

`src/modules/storefront-deploy/deploy-job-store.ts`:

```ts
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { storefrontDeploys, type DeployLogLine, type StorefrontDeployRow } from '../../db/schema/storefront-deploys';
import { emitEvent } from '../../lib/emitter';

export async function loadDeploy(id: number): Promise<StorefrontDeployRow | null> {
  return (await db.select().from(storefrontDeploys).where(eq(storefrontDeploys.id, id)).limit(1))[0] ?? null;
}

export async function patchDeploy(id: number, patch: Partial<Pick<StorefrontDeployRow, 'status' | 'step' | 'error' | 'warning' | 'startedAt' | 'finishedAt'>>): Promise<void> {
  await db.update(storefrontDeploys).set(patch).where(eq(storefrontDeploys.id, id));
}

/** Appends atomically so concurrent log lines never clobber each other. */
export async function appendDeployLog(id: number, line: DeployLogLine): Promise<void> {
  await db
    .update(storefrontDeploys)
    .set({ log: sql`${storefrontDeploys.log} || ${JSON.stringify([line])}::jsonb` })
    .where(eq(storefrontDeploys.id, id));
}

export function notifyDeployUpdated(id: number): void {
  emitEvent('storefront-deploy:updated', { id }, { target: 'role:admin' });
}
```

- [ ] **Step 4: The job**

`src/modules/storefront-deploy/deploy-job.ts`:

```ts
import pino from 'pino';
import { env } from '../../config/env';
import { CloudflareApi, CloudflareApiError, type AssetUploadFile, type ScriptMetadata } from '../../lib/cloudflare-api';
import { listStorefrontReleases } from '../../lib/github-releases';
import { extractRelease, prepareAssets } from '../../lib/storefront-release';
import { upsertStorefrontSetting } from '../storefront-settings/store';
import { appendDeployLog, loadDeploy, notifyDeployUpdated, patchDeploy } from './deploy-job-store';
import { CF_KEYS, WORKER_NAME, getCloudflareClient, getTarget } from './service';

const logger = pino({ name: 'storefront-deploy' });
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;

export interface DeployJobDeps {
  fetchImpl?: typeof fetch;
  createApi?: (token: string) => CloudflareApi;
  sleep?: (ms: number) => Promise<void>;
  healthAttempts?: number;
}

type Step = 'download' | 'extract' | 'manifest' | 'upload-session' | 'upload-assets' | 'script' | 'domain' | 'health' | 'finalize';

class StepFailure extends Error {
  constructor(readonly step: Step, message: string) {
    super(message);
  }
}

function describe(err: unknown): string {
  if (err instanceof CloudflareApiError) return `Cloudflare: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

export async function runStorefrontDeploy(deployId: number, deps: DeployJobDeps = {}): Promise<void> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const healthAttempts = deps.healthAttempts ?? 12;

  const row = await loadDeploy(deployId);
  if (!row) {
    logger.warn({ deployId }, 'deploy row vanished');
    return;
  }

  const log = async (msg: string, level: 'info' | 'warn' | 'error' = 'info') => {
    await appendDeployLog(deployId, { t: new Date().toISOString(), level, msg });
    notifyDeployUpdated(deployId);
  };
  let current: Step = 'download';
  const step = async <T>(name: Step, msg: string, fn: () => Promise<T>): Promise<T> => {
    current = name;
    await patchDeploy(deployId, { step: name });
    await log(msg);
    try {
      return await fn();
    } catch (err) {
      throw new StepFailure(name, describe(err));
    }
  };

  await patchDeploy(deployId, { status: 'running', startedAt: new Date() });
  notifyDeployUpdated(deployId);

  try {
    if (!env.API_HOST) throw new StepFailure('download', 'Backend API_HOST is not configured');
    const backendUrl = `https://${env.API_HOST}/`;
    const target = await getTarget();
    if (!target) throw new StepFailure('download', 'Choose a domain first');
    const { api, accountId } = await getCloudflareClient({ createApi: deps.createApi });

    const zipBytes = await step('download', `Downloading release ${row.tag}…`, async () => {
      const releases = await listStorefrontReleases({ fetchImpl });
      const release = releases.find((r) => r.tag === row.tag);
      if (!release) throw new Error(`Release ${row.tag} is no longer listed on GitHub`);
      const res = await fetchImpl(release.assetUrl, { redirect: 'follow' });
      if (!res.ok) throw new Error(`GitHub responded ${res.status} downloading ${release.assetName}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > MAX_DOWNLOAD_BYTES) throw new Error('Release zip exceeds 100 MiB');
      await log(`Downloaded ${(buf.byteLength / 1024).toFixed(0)} KiB`);
      return buf;
    });

    const { manifest, files } = await step('extract', 'Reading release contents…', async () => extractRelease(zipBytes));
    const workerSource = Buffer.from(files.get(manifest.worker.main)!).toString('utf8');

    const assets = await step('manifest', 'Hashing static assets…', async () => {
      const prepared = prepareAssets(files, manifest.assets.directory);
      await log(`${Object.keys(prepared.manifest).length} files, ${prepared.byHash.size} unique`);
      return prepared;
    });

    const session = await step('upload-session', 'Starting asset upload with Cloudflare…', () =>
      api.createAssetsUploadSession(accountId, WORKER_NAME, assets.manifest),
    );

    let completionJwt: string = session.jwt;
    const totalToUpload = session.buckets.reduce((n, b) => n + b.length, 0);
    if (totalToUpload === 0) {
      await log('Cloudflare already has every asset — nothing to upload');
    } else {
      await step('upload-assets', `Uploading ${totalToUpload} new assets in ${session.buckets.length} batches…`, async () => {
        const single = api.isSingleAssetUploadMode(session.jwt);
        for (const bucket of session.buckets) {
          const filesForBucket: AssetUploadFile[] = bucket.map((hash) => {
            const entry = assets.byHash.get(hash);
            if (!entry) throw new Error(`Cloudflare asked for unknown asset hash ${hash}`);
            return { hash, base64: Buffer.from(entry.bytes).toString('base64'), contentType: entry.contentType };
          });
          if (single) {
            for (const f of filesForBucket) {
              const jwt = await api.uploadSingleAsset(accountId, session.jwt, f);
              if (jwt) completionJwt = jwt;
            }
          } else {
            const jwt = await api.uploadAssetBucket(accountId, session.jwt, filesForBucket);
            if (jwt) completionJwt = jwt;
          }
        }
      });
    }

    await step('script', `Deploying Worker ${WORKER_NAME}…`, async () => {
      const metadata: ScriptMetadata = {
        main_module: 'index.js',
        compatibility_date: manifest.worker.compatibilityDate,
        bindings: [
          { type: 'assets', name: 'ASSETS' },
          { type: 'plain_text', name: 'BACKEND_URL', text: backendUrl },
        ],
        assets: {
          jwt: completionJwt,
          config: {
            not_found_handling: manifest.assets.notFoundHandling,
            run_worker_first: manifest.assets.runWorkerFirst,
            ...(assets.headers ? { _headers: assets.headers } : {}),
            ...(assets.redirects ? { _redirects: assets.redirects } : {}),
          },
        },
        observability: { enabled: true },
      };
      await api.putScript(accountId, WORKER_NAME, metadata, workerSource);
    });

    await step('domain', `Attaching ${target.hostname}…`, async () => {
      const existing = await api.listDomains(accountId);
      if (existing.some((d) => d.hostname === target.hostname && d.service === WORKER_NAME)) {
        await log(`${target.hostname} is already attached to ${WORKER_NAME}`);
        return;
      }
      await api.attachDomain(accountId, { zoneId: target.zoneId, hostname: target.hostname, service: WORKER_NAME });
      await log(`DNS record and certificate requested for ${target.hostname}`);
    });

    const healthy = await step('health', `Checking https://${target.hostname}/healthz…`, async () => {
      for (let attempt = 1; attempt <= healthAttempts; attempt++) {
        try {
          const res = await fetchImpl(`https://${target.hostname}/healthz`, { redirect: 'manual' });
          if (res.status === 200) return true;
          await log(`Attempt ${attempt}/${healthAttempts}: HTTP ${res.status}`, 'warn');
        } catch (err) {
          await log(`Attempt ${attempt}/${healthAttempts}: ${(err as Error).message}`, 'warn');
        }
        if (attempt < healthAttempts) await sleep(10_000);
      }
      return false;
    });

    await step('finalize', 'Recording deployment…', async () => {
      await upsertStorefrontSetting(CF_KEYS.deployedTag, row.tag);
      await upsertStorefrontSetting(CF_KEYS.publicUrl, `https://${target.hostname}`);
    });

    const warning = healthy
      ? null
      : `Deployed, but https://${target.hostname}/healthz did not answer within ${healthAttempts * 10} seconds — the certificate may still be provisioning. Check again in a few minutes.`;
    await log(healthy ? 'Health check passed' : warning!, healthy ? 'info' : 'warn');
    await patchDeploy(deployId, { status: 'succeeded', step: 'finalize', warning, finishedAt: new Date() });
    notifyDeployUpdated(deployId);
  } catch (err) {
    const failedStep = err instanceof StepFailure ? err.step : current;
    const message = err instanceof StepFailure ? err.message : describe(err);
    logger.error({ deployId, step: failedStep, err: message }, 'storefront deploy failed');
    await log(message, 'error');
    await patchDeploy(deployId, { status: 'failed', step: failedStep, error: message, finishedAt: new Date() });
    notifyDeployUpdated(deployId);
  }
}
```

- [ ] **Step 5: Run the job tests**

Run: `npm test -- src/modules/storefront-deploy/deploy-job.test.ts`
Expected: 4 passing.

- [ ] **Step 6: Queue**

`src/lib/queues/storefront-deploy.ts`:

```ts
import { Queue, Worker, type Job } from 'bullmq';
import pino from 'pino';
import { connection, queuePrefix } from './connection';
import { runStorefrontDeploy } from '../../modules/storefront-deploy/deploy-job';

const logger = pino({ name: 'storefront-deploy-queue' });

export const STOREFRONT_DEPLOY_QUEUE = 'storefront-deploy';
export interface StorefrontDeployJobData { deployId: number }

export const storefrontDeployQueue = new Queue<StorefrontDeployJobData>(STOREFRONT_DEPLOY_QUEUE, {
  connection,
  prefix: queuePrefix,
  defaultJobOptions: { attempts: 1, removeOnComplete: { count: 100 }, removeOnFail: { count: 100 } },
});

export function enqueueStorefrontDeploy(deployId: number) {
  return storefrontDeployQueue.add('deploy', { deployId });
}

let worker: Worker<StorefrontDeployJobData> | null = null;

export function startStorefrontDeployWorker() {
  worker = new Worker<StorefrontDeployJobData>(
    STOREFRONT_DEPLOY_QUEUE,
    async (job) => runStorefrontDeploy(job.data.deployId),
    { connection, prefix: queuePrefix, concurrency: 1 },
  );
  worker.on('failed', (job: Job<StorefrontDeployJobData> | undefined, err: Error) => {
    logger.error({ deployId: job?.data.deployId, err: err.message }, 'storefront deploy job crashed');
  });
  logger.info('Storefront deploy worker started');
}

export async function stopStorefrontDeployWorker() {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('Storefront deploy worker stopped');
  }
}
```

`src/index.ts`: import `{ startStorefrontDeployWorker, stopStorefrontDeployWorker } from './lib/queues/storefront-deploy'`; call `startStorefrontDeployWorker();` right after `startCryptoVerifyWorker();` (line ~107) and `await stopStorefrontDeployWorker();` in the shutdown sequence next to `await stopCryptoVerifyWorker();`.

- [ ] **Step 7: Service — releases + deploys (append to `service.ts`)**

Add imports at the top of `src/modules/storefront-deploy/service.ts`:

```ts
import { desc, eq, inArray, lt, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { storefrontDeploys, type StorefrontDeployRow } from '../../db/schema/storefront-deploys';
import { env } from '../../config/env';
import { listStorefrontReleases, type StorefrontRelease } from '../../lib/github-releases';
import { enqueueStorefrontDeploy } from '../../lib/queues/storefront-deploy';
import { ConflictError, NotFoundError } from '../../utils/errors';
import type { CreateDeployInput } from './schemas';
```

Append:

```ts
const STALE_AFTER_MS = 15 * 60_000;

export interface ReleaseListing {
  releases: StorefrontRelease[];
  deployedTag: string | null;
  latestTag: string | null;
  updateAvailable: boolean;
}

export async function getReleases(): Promise<ReleaseListing> {
  const [releases, deployedTag] = await Promise.all([listStorefrontReleases(), getDeployedTag()]);
  const latestTag = releases[0]?.tag ?? null; // GitHub lists newest first
  return { releases, deployedTag, latestTag, updateAvailable: Boolean(deployedTag && latestTag && latestTag !== deployedTag) };
}

/** Rows stuck in queued/running for >15 min were interrupted (backend restart);
 *  mark them failed so they no longer block new deploys. */
async function failStaleDeploys(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  await db
    .update(storefrontDeploys)
    .set({ status: 'failed', error: 'Interrupted by a backend restart', finishedAt: new Date() })
    .where(and(inArray(storefrontDeploys.status, ['queued', 'running']), lt(storefrontDeploys.updatedAt, cutoff)));
}

export async function hasActiveDeploy(): Promise<boolean> {
  await failStaleDeploys();
  const rows = await db
    .select({ id: storefrontDeploys.id })
    .from(storefrontDeploys)
    .where(inArray(storefrontDeploys.status, ['queued', 'running']))
    .limit(1);
  return rows.length > 0;
}

export async function createDeploy(input: CreateDeployInput, userId: number): Promise<StorefrontDeployRow> {
  if (!(await getConnection()).connected) throw new ValidationError('Connect Cloudflare first');
  const target = await getTarget();
  if (!target) throw new ValidationError('Choose a domain first');
  if (!env.API_HOST) throw new ValidationError('Backend API_HOST is not configured — the storefront needs it to reach this API');
  const { releases } = await getReleases();
  if (!releases.some((r) => r.tag === input.tag)) throw new NotFoundError(`Release ${input.tag}`);
  if (await hasActiveDeploy()) throw new ConflictError('A deploy is already in progress');

  const [row] = await db
    .insert(storefrontDeploys)
    .values({ tag: input.tag, hostname: target.hostname, status: 'queued', triggeredByUserId: userId })
    .returning();
  await enqueueStorefrontDeploy(row!.id);
  return row!;
}

export async function listDeploys(): Promise<Omit<StorefrontDeployRow, 'log'>[]> {
  await failStaleDeploys();
  const rows = await db.select().from(storefrontDeploys).orderBy(desc(storefrontDeploys.id)).limit(20);
  return rows.map(({ log: _log, ...rest }) => rest);
}

export async function getDeploy(id: number): Promise<StorefrontDeployRow> {
  const row = (await db.select().from(storefrontDeploys).where(eq(storefrontDeploys.id, id)).limit(1))[0];
  if (!row) throw new NotFoundError('Deploy');
  return row;
}
```

Also update `disconnect()` (Task 7) to refuse while a deploy is active — insert as its first line:

```ts
  if (await hasActiveDeploy()) throw new ConflictError('A deploy is in progress — wait for it to finish');
```

- [ ] **Step 8: Controller + router (append)**

Append to `controller.ts`:

```ts
export async function getReleases(_req: Request, res: Response) {
  sendSuccess(res, await service.getReleases());
}

export async function createDeploy(req: Request, res: Response) {
  sendSuccess(res, await service.createDeploy(req.body, req.user!.id), 201);
}

export async function listDeploys(_req: Request, res: Response) {
  sendSuccess(res, await service.listDeploys());
}

export async function getDeploy(req: Request, res: Response) {
  sendSuccess(res, await service.getDeploy(Number(req.params.id)));
}
```

Append to `router.ts` (import `createDeploySchema, deployIdParamSchema` from `./schemas`):

```ts
storefrontDeployRouter.get('/releases', controller.getReleases);
storefrontDeployRouter.get('/deploys', controller.listDeploys);
storefrontDeployRouter.post('/deploys', validate({ body: createDeploySchema }), controller.createDeploy);
storefrontDeployRouter.get('/deploys/:id', validate({ params: deployIdParamSchema }), controller.getDeploy);
```

Append to the registry block from Task 7:

```ts
registry.registerPath({ method: 'get', path: '/api/v1/storefront-deploy/releases', tags: ['Storefront Deploy'], summary: 'Published storefront releases (GitHub, cached 5 min)', security: bearerAuth, responses: { 200: { description: '{ releases: [{ tag, name, publishedAt, notes, assetName }], deployedTag, latestTag, updateAvailable }' }, 502: { description: 'GitHub unreachable and nothing cached' } } });
registry.registerPath({ method: 'post', path: '/api/v1/storefront-deploy/deploys', tags: ['Storefront Deploy'], summary: 'Queue a deploy of a release tag', security: bearerAuth, request: { body: { content: { 'application/json': { schema: z.object({ tag: z.string() }) } } } }, responses: { 201: { description: 'Deploy row (status queued)' }, 404: { description: 'Unknown tag' }, 409: { description: 'A deploy is already active' }, 422: { description: 'Not connected / no target / API_HOST unset' } } });
registry.registerPath({ method: 'get', path: '/api/v1/storefront-deploy/deploys', tags: ['Storefront Deploy'], summary: 'Last 20 deploys (without log)', security: bearerAuth, responses: { 200: { description: '[{ id, tag, hostname, status, step, error, warning, startedAt, finishedAt, createdAt }]' } } });
registry.registerPath({ method: 'get', path: '/api/v1/storefront-deploy/deploys/{id}', tags: ['Storefront Deploy'], summary: 'One deploy with its log lines', security: bearerAuth, request: { params: z.object({ id: z.string() }) }, responses: { 200: { description: 'Deploy row with log: [{ t, level, msg }]' }, 404: { description: 'Not found' } } });
```

- [ ] **Step 9: Typecheck + full test run**

Run: `npx tsc --noEmit && npm test`
Expected: clean; all suites passing (errors, store, cloudflare-api, github-releases, storefront-release, service, deploy-job).

- [ ] **Step 10: Live smoke (needs Plan 1's release to exist)**

With `npm run dev` and an admin JWT:

```bash
curl -s -H "Authorization: Bearer $JWT" localhost:3000/api/v1/storefront-deploy/releases
# → releases[0].tag === "v0.1.0", deployedTag null, updateAvailable false
curl -s -X POST -H "Authorization: Bearer $JWT" -H 'content-type: application/json' -d '{"tag":"v0.1.0"}' localhost:3000/api/v1/storefront-deploy/deploys
# → 422 "Connect Cloudflare first" (no token stored yet) — the full deploy is exercised end-to-end from the SPA in Plan 3.
```

- [ ] **Step 11: Commit**

```bash
git add src/modules/storefront-deploy/ src/lib/queues/storefront-deploy.ts src/index.ts src/docs/registry.ts
git commit -m "feat(storefront-deploy): releases, deploy job, queue, history endpoints"
```

---

### Task 9: `publicUrl` falls back to the deployed storefront

**Files:**
- Create: `src/lib/storefront-public-url.ts`, `src/modules/orders/access-key.test.ts`
- Modify: `src/modules/orders/access-key.ts`, `src/index.ts`, `src/bot/index.ts`, `src/modules/storefront-deploy/deploy-job.ts` (refresh after finalize)

**Interfaces:**
- Produces:
  ```ts
  export function getStorefrontPublicUrl(): string | null;                 // in-process cache
  export async function refreshStorefrontPublicUrl(): Promise<void>;       // reads storefront_public_url
  export function startStorefrontPublicUrlRefresh(intervalMs?: number): void; // boot: refresh now + every 5 min (unref'd)
  ```
  `buildOrderPublicUrl` stays synchronous; base = `getStorefrontPublicUrl() ?? env.ORDER_PUBLIC_BASE_URL`.

- [ ] **Step 1: Write the failing test**

`src/modules/orders/access-key.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

let cached: string | null = null;
vi.mock('../../lib/storefront-public-url', () => ({
  getStorefrontPublicUrl: () => cached,
}));

process.env.ORDER_ACCESS_SECRET = 'x'.repeat(32);
process.env.ORDER_PUBLIC_BASE_URL = 'https://order.example.com/';

import { buildOrderPublicUrl, generateOrderAccessKey } from './access-key';

describe('buildOrderPublicUrl', () => {
  beforeEach(() => { cached = null; });

  it('uses ORDER_PUBLIC_BASE_URL when no storefront is deployed', () => {
    expect(buildOrderPublicUrl('AB12CD')).toBe(`https://order.example.com/AB12CD/${generateOrderAccessKey('AB12CD')}`);
  });

  it('prefers the deployed storefront url', () => {
    cached = 'https://shop.example.com';
    expect(buildOrderPublicUrl('AB12CD')).toBe(`https://shop.example.com/AB12CD/${generateOrderAccessKey('AB12CD')}`);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/modules/orders/access-key.test.ts`
Expected: FAIL — cannot resolve `../../lib/storefront-public-url`.

- [ ] **Step 3: Implement the cache and the fallback**

`src/lib/storefront-public-url.ts`:

```ts
import pino from 'pino';
import { getStorefrontSetting } from '../modules/storefront-settings/store';

const logger = pino({ name: 'storefront-public-url' });
const KEY = 'storefront_public_url';
let cached: string | null = null;

/** Origin of the deployed customer storefront (set by a successful deploy),
 *  cached in-process because `buildOrderPublicUrl` is synchronous. */
export function getStorefrontPublicUrl(): string | null {
  return cached;
}

export async function refreshStorefrontPublicUrl(): Promise<void> {
  try {
    cached = await getStorefrontSetting(KEY);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'could not refresh storefront public url');
  }
}

/** Boot-time: load now, then poll so the bot process (which never runs the
 *  deploy job) picks up a new hostname without a restart. */
export function startStorefrontPublicUrlRefresh(intervalMs = 5 * 60_000): void {
  void refreshStorefrontPublicUrl();
  const timer = setInterval(() => void refreshStorefrontPublicUrl(), intervalMs);
  timer.unref();
}
```

`src/modules/orders/access-key.ts` — replace `buildOrderPublicUrl`:

```ts
import { getStorefrontPublicUrl } from '../../lib/storefront-public-url';

/** Full customer link, e.g. https://shop.example.com/AB12CD/0f3a…  Prefers the
 *  storefront deployed from the admin; falls back to ORDER_PUBLIC_BASE_URL.
 *  Null when neither is configured. */
export function buildOrderPublicUrl(reference: string): string | null {
  const base = getStorefrontPublicUrl() ?? env.ORDER_PUBLIC_BASE_URL;
  if (!base) return null;
  const accessKey = generateOrderAccessKey(reference);
  if (!accessKey) return null;
  return `${base.replace(/\/+$/, '')}/${reference}/${accessKey}`;
}
```

`src/index.ts` and `src/bot/index.ts`: import `startStorefrontPublicUrlRefresh` from `./lib/storefront-public-url` (`../lib/...` from the bot) and call `startStorefrontPublicUrlRefresh();` right after `runMigrations()` completes in each `main()`.

`deploy-job.ts` finalize step: after the two `upsertStorefrontSetting` calls add `await refreshStorefrontPublicUrl();` (import from `../../lib/storefront-public-url`).

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all passing, clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storefront-public-url.ts src/modules/orders/access-key.ts src/modules/orders/access-key.test.ts src/index.ts src/bot/index.ts src/modules/storefront-deploy/deploy-job.ts
git commit -m "feat(orders): publicUrl prefers the storefront deployed from the admin"
```

---

### Task 10: `STOREFRONT.md`

**Files:**
- Modify: `STOREFRONT.md` — §5 Settings (storage note) and a new §6.1 under "Admin: storefront-settings module".

- [ ] **Step 1: Storage note in §5**

At the top of `## 5. Settings`, add one paragraph:

```markdown
All `storefront_*` keys live in the `storefront_settings` table (key/value, same shape as
`bot_settings`, which is now reserved for the Telegram bot). The deploy pipeline's
`storefront_cf_*`, `storefront_deployed_tag` and `storefront_public_url` keys live there too.
```

- [ ] **Step 2: New subsection after §6**

```markdown
### 6.1 Deploy-from-admin (`/api/v1/storefront-deploy`, admin JWT)

| Method | Path | Purpose |
|---|---|---|
| GET | `/connection` | `{ connected, accountId, accountName, tokenSuffix, verifiedAt }` or `{ connected: false }` |
| PUT | `/connection` | `{ apiToken, accountId? }` → verifies with Cloudflare; several accounts → `{ needsAccount: true, accounts }` |
| POST | `/connection/test` | `{ token, accounts, zones: 'ok'|'fail', message? }` |
| DELETE | `/connection` | forget token + target (409 while a deploy runs) |
| GET | `/zones` | active zones in the connected account |
| GET/PUT | `/target` | `{ zoneId, hostname }` → `{ zoneId, zoneName, hostname }` |
| GET | `/releases` | `{ releases, deployedTag, latestTag, updateAvailable }` from GitHub `Kratos-Bots/public-storefront` |
| POST | `/deploys` | `{ tag }` → 201 deploy row; 409 if one is active |
| GET | `/deploys`, `/deploys/:id` | history (20) / one with `log: [{ t, level, msg }]` |

Token permissions the store owner's API token needs: Account → Workers Scripts: Edit, Account
Settings: Read; Zone → Zone: Read, Workers Routes: Edit, DNS: Edit, SSL and Certificates: Edit.

Deploy steps (`storefront_deploys.step`): download → extract → manifest → upload-session →
upload-assets → script → domain → health → finalize. The Worker is named `ecommerce-storefront`,
gets `BACKEND_URL = https://${API_HOST}/`, and the release's `_headers` file is passed through as
asset config. Socket event `storefront-deploy:updated { id }` (room `role:admin`) fires on every
log line. On success `storefront_public_url` is set and `publicUrl` on orders uses it (falling back
to `ORDER_PUBLIC_BASE_URL`). BotFather `/setdomain` remains a manual step.
```

- [ ] **Step 3: Commit**

```bash
git add STOREFRONT.md
git commit -m "docs(storefront): storefront_settings table + deploy-from-admin endpoints"
```

---

## Self-review

- **Spec coverage**: §2.0 table + migration + repoint → Task 2. §2.2 table → Task 3. §2.3 endpoints → Tasks 7–8 (all eleven routes). §2.4 client → Task 4 (plus single-asset mode wrangler uses). §2.5 job steps → Task 8 (`_headers` passed via `assets.config._headers` — a refinement over the spec, which assumed it was an asset; wrangler excludes it from the manifest). §2.6 `publicUrl` → Task 9 (uses "set" rather than "set and storefront enabled" — the key only exists after a successful deploy, so the extra gate added nothing). §2.7 security → token encrypted (Task 7), only `tokenSuffix` exposed. §4 error table → 422/409/404/502 in Tasks 7–8, stale rows in `failStaleDeploys`. §5 vitest + unit tests → Tasks 1, 2, 4, 5, 6, 7, 8, 9.
- **Type consistency**: `getStorefrontSetting(s)`/`upsertStorefrontSetting`/`deleteStorefrontSetting`/`setOrClearStorefrontSetting` names match between Task 2 and every mock in Tasks 7–9. `CF_KEYS`, `WORKER_NAME`, `getCloudflareClient`, `getTarget` are defined in Task 7 and imported by Task 8's job. `AssetUploadFile`, `ScriptMetadata`, `UploadSession` match between Task 4 and Task 8. `DeployLogLine` shape `{ t, level, msg }` is identical in schema, store and job.
- **Placeholders**: none.
