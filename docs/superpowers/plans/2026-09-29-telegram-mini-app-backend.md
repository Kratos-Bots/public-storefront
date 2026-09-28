# Telegram Mini App — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `ecommerce-backend` Mini App sign-in (`initData`), a `storefront_webapp_mode` bot setting (`off | beta | forced`) that turns the bot into welcome + contact + open-shop + notifications, a per-customer opt-out, and the public-settings/account surface the storefront needs.

**Architecture:** Sign-in reuses the Telegram Login Widget's find-or-create → session path behind a new `initData` verifier. Bot behaviour is one Telegraf middleware (`webAppGate`) registered after `labelLoader()` that answers every private update with the welcome message when the Mini App is active for that customer; everything classic sits behind it untouched. The effective mode (`getWebAppMode`) folds in the three reasons the bot must stay classic: setting off, Wholesale Mode on, no deployed/enabled storefront.

**Tech Stack:** Express 5, Telegraf 4.16, Drizzle/Postgres, Zod 4, Vitest 4.

**Spec:** `ecommerce-storefront/docs/superpowers/specs/2026-09-29-telegram-mini-app-design.md`

**Repo:** `T:\Projects\ecommerce\ecommerce-backend` — all paths below are relative to it. Work on a branch `feature/telegram-mini-app`. Read `CLAUDE.md` in this repo first (4-file module rule, extensionless imports, `AppError` subclasses).

## Global Constraints

- Setting key `storefront_webapp_mode`, values exactly `off` | `beta` | `forced`, default `off`, stored in `bot_settings` (never `storefront_settings`).
- Customer column `customers.bot_webapp_opt_out boolean not null default false`; ignored when mode is `forced`.
- `initData` max age `86_400` s (`MAX_WEBAPP_AUTH_AGE_S`); future skew allowance 60 s (reuse `MAX_AUTH_SKEW_S`).
- Route `POST /api/v1/public/storefront/auth/telegram-webapp`, rate limit `{ windowMs: 15 * 60 * 1000, max: 60 }`, response shape identical to `/auth/telegram` (`{ token, customer: { id, nickname } }`).
- Route `POST /api/v1/public/storefront/account/bot-mode`, body `{ classic: boolean }`.
- Public settings gain `telegramWebApp: { mode: 'off' | 'beta' | 'forced' }` = the *effective* mode.
- Wholesale Mode on ⇒ effective webapp mode `off`.
- No `storefront_public_url` or storefront disabled ⇒ effective mode `off`, warning logged once per process.
- New template `tpl_webapp_welcome`; new labels `btn_open_shop`, `btn_contact`, `btn_use_classic_bot`, `btn_try_new_shop`.
- New callbacks `webapp_optout`, `webapp_optin`.
- Live Telegram state (default menu button) is only written when `env.TELEGRAM_SENDS_ENABLED` — same rule as the command menu. With the mode off, a BotFather-set menu button is left alone; only a default button pointing at our storefront is reset to `commands`.
- `setOptOut`/`isOptedOut` live in the db-only `src/bot/webapp-optout.ts`; API modules import that, never `webapp-gate.ts` (which pulls in the bot's menu modules).
- Extensionless imports; throw `AppError` subclasses; run `npm run db:generate` after the schema edit.

## Review Focus

- **Stale `initData` replayed after 24 h** (a Mini App left open overnight, then refreshed) → 401, and the storefront's error card lets the shopper reopen. Pinned in Task 1 (expired test).
- **`initData` with a duplicated key** (`user=…&user=…`) must not verify even if one copy is signed → 401. Pinned in Task 1.
- **Opted-out shopper in `forced` mode** must get the welcome, not the classic menu; the flag must not silently resurrect when the mode drops back to `beta`. Pinned in Task 4 (gate matrix) — the flag is untouched by `forced`, so it's honoured again in `beta`, which is the expected behaviour.
- **Session cart hand-over when a line is no longer purchasable** (product deactivated / over max) — `putCart` flags rather than throws for limits, but a thrown error must leave the session cart intact rather than losing it. Pinned in Task 3.
- **`/start ref_XXXX` in webapp mode** still records the referral. `handleReferralDeepLink` sends its own "referral applied" message (Continue → `cb('main')`), so when it returns `true` the gate stops there — the Continue tap then lands on the welcome through the gate. When it returns `false` (referrals off / invalid code) the welcome shows directly. Pinned in Task 4.

---

### Task 1: Mini App sign-in route

**Files:**
- Modify: `src/modules/public-storefront/telegram-login.ts`
- Modify: `src/modules/public-storefront/schemas.ts` (after `telegramLoginSchema`, ~line 44)
- Modify: `src/modules/public-storefront/controller.ts` (after `telegramLogin`, ~line 81)
- Modify: `src/modules/public-storefront/router.ts` (after the `/auth/telegram` route, ~line 84)
- Test: `src/modules/public-storefront/telegram-webapp.test.ts`

**Interfaces:**
- Produces: `verifyTelegramWebApp(initData: string): Promise<VerifiedTelegramLogin>`; `telegramWebAppLogin(initData: string, meta: { userAgent?: string; ip?: string }): Promise<TelegramLoginResult>`; `telegramWebAppLoginSchema`, `TelegramWebAppLoginInput`.

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/public-storefront/telegram-webapp.test.ts
import { createHmac } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getBotSettingValueMock } = vi.hoisted(() => ({ getBotSettingValueMock: vi.fn() }));
vi.mock('../bot-settings/service', () => ({ getBotSettingValue: getBotSettingValueMock }));
// verifyTelegramWebApp never touches these; stubbed so importing the module stays db-free.
vi.mock('../../db/client', () => ({ db: {} }));
vi.mock('../customers/service', () => ({ resolveOrCreateCustomer: vi.fn() }));
vi.mock('./sessions', () => ({ createStorefrontSession: vi.fn() }));

import { verifyTelegramWebApp } from './telegram-login';
import { ServiceUnavailableError, UnauthorizedError } from '../../utils/errors';

const BOT_TOKEN = '123456:TEST-token';

/** Signs fields exactly as Telegram does for Mini Apps (core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app). */
function sign(fields: Record<string, string>, token = BOT_TOKEN): string {
  const dataCheck = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(dataCheck).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const now = () => String(Math.floor(Date.now() / 1000));
const USER = JSON.stringify({ id: 777000111, first_name: 'Ada', username: 'ada_l' });

beforeEach(() => {
  getBotSettingValueMock.mockReset();
  getBotSettingValueMock.mockImplementation(async (k: string) => (k === 'bot_token' ? BOT_TOKEN : null));
});

describe('verifyTelegramWebApp', () => {
  it('accepts correctly signed initData and returns the Telegram id and username', async () => {
    const initData = sign({ auth_date: now(), query_id: 'AAE', user: USER, signature: 'sig' });
    await expect(verifyTelegramWebApp(initData)).resolves.toEqual({ telegramId: '777000111', username: 'ada_l' });
  });

  it('returns a null username when Telegram sent none', async () => {
    const initData = sign({ auth_date: now(), user: JSON.stringify({ id: 5, first_name: 'X' }) });
    await expect(verifyTelegramWebApp(initData)).resolves.toEqual({ telegramId: '5', username: null });
  });

  it('rejects a tampered field', async () => {
    const initData = sign({ auth_date: now(), user: USER }).replace('ada_l', 'eve');
    await expect(verifyTelegramWebApp(initData)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects data signed with another bot token', async () => {
    const initData = sign({ auth_date: now(), user: USER }, '999:other');
    await expect(verifyTelegramWebApp(initData)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects a malformed hash before hashing', async () => {
    await expect(verifyTelegramWebApp(`auth_date=${now()}&user=${encodeURIComponent(USER)}&hash=zz`)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects a duplicated key', async () => {
    const initData = `${sign({ auth_date: now(), user: USER })}&user=${encodeURIComponent(USER)}`;
    await expect(verifyTelegramWebApp(initData)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects initData older than 24 hours', async () => {
    const stale = String(Math.floor(Date.now() / 1000) - 86_401);
    await expect(verifyTelegramWebApp(sign({ auth_date: stale, user: USER }))).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects initData dated more than a minute in the future', async () => {
    const future = String(Math.floor(Date.now() / 1000) + 120);
    await expect(verifyTelegramWebApp(sign({ auth_date: future, user: USER }))).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects signed initData with no user', async () => {
    await expect(verifyTelegramWebApp(sign({ auth_date: now(), query_id: 'AAE' }))).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('is unavailable when no bot token is configured', async () => {
    getBotSettingValueMock.mockResolvedValue(null);
    await expect(verifyTelegramWebApp(sign({ auth_date: now(), user: USER }))).rejects.toBeInstanceOf(ServiceUnavailableError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/public-storefront/telegram-webapp.test.ts`
Expected: FAIL — `verifyTelegramWebApp` is not exported.

- [ ] **Step 3: Implement the verifier and the shared login step**

In `src/modules/public-storefront/telegram-login.ts`, add after `MAX_AUTH_SKEW_S`:

```ts
const MAX_WEBAPP_AUTH_AGE_S = 86_400; // Mini App initData: Telegram re-signs on every launch; a day covers a WebView left open
```

Add after `verifyTelegramLogin`:

```ts
/**
 * Mini App `initData` verification, per
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app.
 *
 * Unlike the widget, the Mini App's field set is open-ended (query_id, user,
 * chat_type, chat_instance, start_param, signature, …), so every field Telegram
 * sent goes into the data-check string exactly as received — a whitelist would
 * break on the next field Telegram adds. The secret is HMAC("WebAppData", token),
 * not SHA256(token). A key that appears twice is refused outright: which copy a
 * parser keeps is exactly the ambiguity a forged second `user` would exploit.
 */
export async function verifyTelegramWebApp(initData: string): Promise<VerifiedTelegramLogin> {
  const botToken = await getBotSettingValue('bot_token');
  if (!botToken) throw new ServiceUnavailableError('Telegram login is not configured');

  const params = new URLSearchParams(initData);
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) throw new UnauthorizedError('Invalid Telegram web app data');

  const hash = params.get('hash');
  if (!hash || !HASH_RE.test(hash)) throw new UnauthorizedError('Invalid Telegram web app data');
  params.delete('hash');

  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheck).digest('hex');
  const hashBuf = Buffer.from(hash, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (hashBuf.length !== expectedBuf.length || !timingSafeEqual(hashBuf, expectedBuf)) {
    throw new UnauthorizedError('Invalid Telegram web app data');
  }

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate)) throw new UnauthorizedError('Invalid Telegram web app data');
  const ageS = Date.now() / 1000 - authDate;
  if (ageS > MAX_WEBAPP_AUTH_AGE_S) throw new UnauthorizedError('Telegram web app session expired');
  if (ageS < -MAX_AUTH_SKEW_S) throw new UnauthorizedError('Telegram web app data is not yet valid');

  let user: { id?: unknown; username?: unknown };
  try {
    user = JSON.parse(params.get('user') ?? '');
  } catch {
    throw new UnauthorizedError('Telegram web app data has no user');
  }
  if (typeof user?.id !== 'number' || !Number.isSafeInteger(user.id)) {
    throw new UnauthorizedError('Telegram web app data has no user');
  }

  return {
    telegramId: String(user.id),
    username: typeof user.username === 'string' && user.username ? user.username : null,
  };
}
```

Then replace the body of `telegramLogin` so both entry points share the post-verification step. The existing `telegramLogin` becomes:

```ts
export async function telegramLogin(
  payload: Record<string, string | number>,
  meta: { userAgent?: string; ip?: string },
): Promise<TelegramLoginResult> {
  return loginVerifiedTelegram(await verifyTelegramLogin(payload), meta);
}

/** Mini App sign-in: same customer resolution and session as the widget. */
export async function telegramWebAppLogin(
  initData: string,
  meta: { userAgent?: string; ip?: string },
): Promise<TelegramLoginResult> {
  return loginVerifiedTelegram(await verifyTelegramWebApp(initData), meta);
}

/** Shared by both Telegram entry points so they can never diverge on account
 *  linking. Backfilling `telegramHandle` from `username` onto an existing
 *  customer is left entirely to `resolveOrCreateCustomer`'s resolve ladder
 *  (`fillBlankIdentities`) — never hand-write the identity update here. */
async function loginVerifiedTelegram(
  { telegramId, username }: VerifiedTelegramLogin,
  meta: { userAgent?: string; ip?: string },
): Promise<TelegramLoginResult> {
  const { customer } = await resolveOrCreateCustomer({
    telegramId,
    telegramHandle: username ?? undefined,
    acquisitionChannel: 'TELEGRAM',
  });

  const { token } = await createStorefrontSession(customer.id, meta);

  // Minimal projection instead of trusting the full row `resolveOrCreateCustomer`
  // returned — same approach as `completeWhatsappLogin` — and a defensive
  // re-check that the resolved customer is still live.
  const row = (await db
    .select({ id: customers.id, nickname: customers.nickname })
    .from(customers)
    .where(and(eq(customers.id, customer.id), isNull(customers.deletedAt)))
    .limit(1))[0];
  if (!row) {
    throw new UnauthorizedError('Login failed — please try again');
  }

  return { token, customer: { id: row.id, nickname: row.nickname } };
}
```

(Delete the old doc comment above `telegramLogin` — it now lives on `loginVerifiedTelegram`. Verified: `createStorefrontSession` (`sessions.ts`) selects the customer's `bannedAt` and calls `assertNotBanned`, which is what makes the widget reject banned customers; the Mini App inherits that through the shared helper, so no extra ban check is needed here.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/public-storefront/telegram-webapp.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Wire schema, controller and route**

`schemas.ts`, after `export type TelegramLoginInput …`:

```ts
// Auth — Telegram Mini App. `initData` is the raw query string Telegram hands
// the Mini App (`Telegram.WebApp.initData`), posted verbatim — the backend
// parses and verifies it; re-encoding on the client would break the hash.
export const telegramWebAppLoginSchema = z.object({
  initData: z.string().min(1).max(4096),
});

export type TelegramWebAppLoginInput = z.infer<typeof telegramWebAppLoginSchema>;
```

`controller.ts`: add `TelegramWebAppLoginInput` to the `import type { … } from './schemas'` list, and after `telegramLogin`:

```ts
export async function telegramWebAppLogin(req: Request, res: Response) {
  const { initData } = req.body as TelegramWebAppLoginInput;
  const userAgent = req.headers['user-agent'];
  const result = await telegramLoginService.telegramWebAppLogin(initData, {
    userAgent: typeof userAgent === 'string' ? userAgent : undefined,
    ip: clientKey(req),
  });
  sendSuccess(res, result);
}
```

`router.ts`: add `telegramWebAppLoginSchema` to the schemas import and, right after the `/auth/telegram` route:

```ts
// Mini App sign-in runs on every launch, and phones on one carrier NAT share
// an address — hence a wider window than the widget's 10.
publicStorefrontRouter.post(
  '/auth/telegram-webapp',
  requireStorefrontEnabled,
  rateLimit({ windowMs: 15 * 60 * 1000, max: 60 }),
  validate({ body: telegramWebAppLoginSchema }),
  publicStorefrontController.telegramWebAppLogin,
);
```

- [ ] **Step 6: Typecheck and run the module's tests**

Run: `npm run build && npx vitest run src/modules/public-storefront`
Expected: build succeeds; all tests pass (sessions tests unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/modules/public-storefront
git commit -m "feat(storefront): Telegram Mini App sign-in via initData"
```

---

### Task 2: Webapp-mode setting, opt-out column, effective mode

**Files:**
- Modify: `src/db/schema/customers.ts:61` (after `allowPrepaymentBatching`)
- Create: migration via `npm run db:generate` (next number after `0043_…`)
- Modify: `src/db/seed.ts:96` (next to `wholesale_mode_enabled`)
- Modify: `src/modules/bot-settings/schemas.ts` (append)
- Modify: `src/modules/bot-settings/service.ts` (`upsertBotSetting`, `bulkUpsertBotSettings`)
- Create: `src/bot/webapp-mode.ts`
- Test: `src/bot/webapp-mode.test.ts`

**Interfaces:**
- Consumes: `isWholesaleMode()` (`src/bot/menus/wholesale.ts`), `getStorefrontPublicUrl()` (`src/lib/storefront-public-url.ts`), `getStorefrontSetting(key)` (`src/modules/storefront-settings/store`).
- Produces: `WEBAPP_MODES`, `type WebAppMode = 'off' | 'beta' | 'forced'` (bot-settings/schemas.ts); `parseWebAppMode(raw: string | null): WebAppMode`; `getWebAppMode(): Promise<WebAppMode>`; `isWebAppActiveFor(mode: WebAppMode, optedOut: boolean): boolean`; `webAppUrl(): string | null`; column `customers.botWebappOptOut: boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// src/bot/webapp-mode.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  botSetting: vi.fn(),
  storefrontSetting: vi.fn(),
  publicUrl: vi.fn(),
  wholesale: vi.fn(),
}));
vi.mock('../modules/bot-settings/service', () => ({ getBotSettingValue: m.botSetting }));
vi.mock('../modules/storefront-settings/store', () => ({ getStorefrontSetting: m.storefrontSetting }));
vi.mock('../lib/storefront-public-url', () => ({ getStorefrontPublicUrl: m.publicUrl }));
vi.mock('./menus/wholesale', () => ({ isWholesaleMode: m.wholesale }));

import { getWebAppMode, isWebAppActiveFor, parseWebAppMode, webAppUrl } from './webapp-mode';

function configure({ mode = 'beta', enabled = 'true', url = 'https://shop.example.com/', wholesale = false } = {}) {
  m.botSetting.mockImplementation(async (k: string) => (k === 'storefront_webapp_mode' ? mode : null));
  m.storefrontSetting.mockImplementation(async (k: string) => (k === 'storefront_enabled' ? enabled : null));
  m.publicUrl.mockReturnValue(url);
  m.wholesale.mockResolvedValue(wholesale);
}

beforeEach(() => vi.clearAllMocks());

describe('parseWebAppMode', () => {
  it.each([['beta', 'beta'], ['forced', 'forced'], ['off', 'off'], [null, 'off'], ['FORCED', 'off'], ['true', 'off']])(
    '%s → %s', (raw, expected) => expect(parseWebAppMode(raw)).toBe(expected),
  );
});

describe('getWebAppMode', () => {
  it('returns the stored mode when the storefront is deployed and enabled', async () => {
    configure({ mode: 'forced' });
    await expect(getWebAppMode()).resolves.toBe('forced');
  });
  it('is off when the setting is off, without touching anything else', async () => {
    configure({ mode: 'off' });
    await expect(getWebAppMode()).resolves.toBe('off');
    expect(m.wholesale).not.toHaveBeenCalled();
  });
  it('is off while Wholesale Mode is on', async () => {
    configure({ wholesale: true });
    await expect(getWebAppMode()).resolves.toBe('off');
  });
  it('is off with no deployed storefront URL', async () => {
    configure({ url: null as unknown as string });
    await expect(getWebAppMode()).resolves.toBe('off');
  });
  it('is off while the storefront is disabled', async () => {
    configure({ enabled: 'false' });
    await expect(getWebAppMode()).resolves.toBe('off');
  });
});

describe('isWebAppActiveFor', () => {
  it.each([
    ['off', false, false], ['off', true, false],
    ['beta', false, true], ['beta', true, false],
    ['forced', false, true], ['forced', true, true],
  ] as const)('mode %s, opted out %s → %s', (mode, optedOut, expected) => {
    expect(isWebAppActiveFor(mode, optedOut)).toBe(expected);
  });
});

describe('webAppUrl', () => {
  it('strips trailing slashes', () => {
    m.publicUrl.mockReturnValue('https://shop.example.com//');
    expect(webAppUrl()).toBe('https://shop.example.com');
  });
  it('is null when nothing is deployed', () => {
    m.publicUrl.mockReturnValue(null);
    expect(webAppUrl()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/bot/webapp-mode.test.ts`
Expected: FAIL — cannot resolve `./webapp-mode`.

- [ ] **Step 3: Add the mode values and setting validation**

Append to `src/modules/bot-settings/schemas.ts`:

```ts
/** `storefront_webapp_mode`: whether the bot hands shopping to the storefront Mini App. */
export const WEBAPP_MODES = ['off', 'beta', 'forced'] as const;
export type WebAppMode = (typeof WEBAPP_MODES)[number];
```

In `src/modules/bot-settings/service.ts`, add a value import `import { WEBAPP_MODES } from './schemas';` (the existing import from `./schemas` is `import type { … }`, so it can't carry a value; `ValidationError` is already imported on line 7), then add below `assertNotReserved`:

```ts
/** Keys whose value is a closed set — a typo must not silently read as the default. */
const ENUM_SETTINGS: Record<string, readonly string[]> = {
  storefront_webapp_mode: WEBAPP_MODES,
};

function assertValidValue(key: string, value: string) {
  const allowed = ENUM_SETTINGS[key];
  if (allowed && !allowed.includes(value)) {
    throw new ValidationError(`${key} must be one of: ${allowed.join(', ')}`);
  }
}
```

Call `assertValidValue(input.key, input.value);` on the line after `assertNotReserved(input.key);` in `upsertBotSetting`, and in `bulkUpsertBotSettings` change the first loop to:

```ts
  for (const setting of input.settings) {
    assertNotReserved(setting.key);
    assertValidValue(setting.key, setting.value);
  }
```

- [ ] **Step 4: Implement `src/bot/webapp-mode.ts`**

```ts
import pino from 'pino';
import { getBotSettingValue } from '../modules/bot-settings/service';
import type { WebAppMode } from '../modules/bot-settings/schemas';
import { getStorefrontSetting } from '../modules/storefront-settings/store';
import { getStorefrontPublicUrl } from '../lib/storefront-public-url';
import { isWholesaleMode } from './menus/wholesale';

const logger = pino({ name: 'bot:webapp-mode' });
let warnedHalfConfigured = false;

export function parseWebAppMode(raw: string | null): WebAppMode {
  return raw === 'beta' || raw === 'forced' ? raw : 'off';
}

/** The deployed storefront origin the Mini App opens, or null when none is deployed. */
export function webAppUrl(): string | null {
  const url = getStorefrontPublicUrl()?.trim().replace(/\/+$/, '');
  return url || null;
}

/**
 * The mode the bot actually runs in. Three things keep it classic whatever the
 * setting says: Wholesale Mode (the narrower, deliberate takeover wins), no
 * deployed storefront to open, and a storefront switched off — a half-configured
 * toggle falls back to the classic menus instead of dead-ending shoppers, the
 * same rule `isWholesaleMode` follows.
 */
export async function getWebAppMode(): Promise<WebAppMode> {
  const mode = parseWebAppMode(await getBotSettingValue('storefront_webapp_mode'));
  if (mode === 'off') return 'off';
  if (await isWholesaleMode()) return 'off';

  const enabled = (await getStorefrontSetting('storefront_enabled')) === 'true';
  if (!webAppUrl() || !enabled) {
    if (!warnedHalfConfigured) {
      warnedHalfConfigured = true;
      logger.warn({ mode, hasUrl: Boolean(webAppUrl()), enabled }, 'storefront_webapp_mode is on but the storefront is not deployed/enabled; using classic menus');
    }
    return 'off';
  }
  return mode;
}

/** Whether this shopper gets the Mini App: always when forced, unless opted out in beta. */
export function isWebAppActiveFor(mode: WebAppMode, optedOut: boolean): boolean {
  return mode === 'forced' || (mode === 'beta' && !optedOut);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/bot/webapp-mode.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the opt-out column, migration and seed**

`src/db/schema/customers.ts`, after the `allowPrepaymentBatching` line:

```ts
    /** Shopper chose the classic bot over the storefront Mini App (only honoured in `beta` webapp mode). */
    botWebappOptOut: boolean('bot_webapp_opt_out').notNull().default(false),
```

`src/db/seed.ts`, after `{ key: 'wholesale_mode_enabled', value: 'false' },`:

```ts
  { key: 'storefront_webapp_mode', value: 'off' },
```

Run: `npm run db:generate`
Expected: a new `drizzle/0044_*.sql` containing `ALTER TABLE "customers" ADD COLUMN "bot_webapp_opt_out" boolean DEFAULT false NOT NULL;` and nothing else. If it contains anything else, stop and investigate schema drift before continuing.

- [ ] **Step 7: Typecheck, test, commit**

Run: `npm run build && npx vitest run src/bot src/modules/bot-settings`
Expected: build OK, tests pass.

```bash
git add src/db/schema/customers.ts drizzle src/db/seed.ts src/modules/bot-settings src/bot/webapp-mode.ts src/bot/webapp-mode.test.ts
git commit -m "feat(bot): storefront_webapp_mode setting, opt-out column, effective mode"
```

---

### Task 3: Welcome message, labels, cart hand-over, menu-button helpers

**Files:**
- Modify: `src/bot/templates.ts` (add a message template after `tpl_wholesale_menu` ~line 620; add four button labels next to `btn_open_catalog` ~line 1615)
- Modify: `src/lib/telegram-api.ts` (append `callTelegramApi`)
- Create: `src/bot/webapp.ts`
- Test: `src/bot/webapp.test.ts`

**Interfaces:**
- Consumes: `getWebAppMode`, `webAppUrl` (Task 2); `getCart`, `putCart` (`src/modules/public-storefront/cart.ts`); `untrackCart` (`src/modules/carts/service.ts`); `renderLabel`, `renderTemplate`, `safeEditOrSend`, `cb`.
- Produces:
  - `buildWelcomeKeyboard(labels: Map<string, string>, opts: { url: string; supportUsername: string | null; beta: boolean }): InlineKeyboardMarkup-compatible Markup`
  - `showWebAppWelcome(ctx: BotContext, mode: WebAppMode): Promise<void>`
  - `handOverSessionCart(customerId: number, chatId: number, session: SessionData): Promise<void>`
  - `webAppMenuButton(labels: Map<string, string>, url: string): MenuButton` → `{ type: 'web_app', text, web_app: { url } }`
  - `callTelegramApi(method: string, body: Record<string, unknown>): Promise<boolean>` (in `src/lib/telegram-api.ts`)

- [ ] **Step 1: Write the failing test**

```ts
// src/bot/webapp.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ getCart: vi.fn(), putCart: vi.fn(), untrackCart: vi.fn() }));
vi.mock('../db/client', () => ({ db: {} })); // labels.ts imports it; nothing here queries
vi.mock('../modules/public-storefront/cart', () => ({ getCart: m.getCart, putCart: m.putCart }));
vi.mock('../modules/carts/service', () => ({ untrackCart: m.untrackCart }));
vi.mock('../modules/bot-settings/service', () => ({ getBotSettingValue: vi.fn() }));
vi.mock('./webapp-mode', () => ({ webAppUrl: () => 'https://shop.example.com' }));
vi.mock('./templates', async (orig) => ({ ...(await orig<typeof import('./templates')>()), renderTemplate: vi.fn(async () => 'Welcome') }));

import { buildWelcomeKeyboard, handOverSessionCart, webAppMenuButton } from './webapp';
import type { SessionData } from './types';

const labels = new Map<string, string>();
const buttons = (kb: ReturnType<typeof buildWelcomeKeyboard>) => kb.reply_markup.inline_keyboard.map((row) => row.map((b) => b.text));

beforeEach(() => vi.clearAllMocks());

describe('buildWelcomeKeyboard', () => {
  it('offers open shop and contact, one per row', () => {
    const kb = buildWelcomeKeyboard(labels, { url: 'https://shop.example.com', supportUsername: '@help_desk', beta: false });
    const rows = kb.reply_markup.inline_keyboard;
    expect(rows).toHaveLength(2);
    expect(rows[0][0]).toMatchObject({ web_app: { url: 'https://shop.example.com' } });
    expect(rows[1][0]).toMatchObject({ url: 'https://t.me/help_desk' });
  });
  it('adds the classic-bot escape hatch only in beta', () => {
    const kb = buildWelcomeKeyboard(labels, { url: 'https://s', supportUsername: 'x', beta: true });
    expect(kb.reply_markup.inline_keyboard[2][0]).toMatchObject({ callback_data: 'webapp_optout' });
  });
  it('drops contact when no support username is set', () => {
    const kb = buildWelcomeKeyboard(labels, { url: 'https://s', supportUsername: null, beta: false });
    expect(buttons(kb)).toHaveLength(1);
  });
});

describe('webAppMenuButton', () => {
  it('points the chat menu button at the storefront', () => {
    expect(webAppMenuButton(labels, 'https://s')).toEqual({ type: 'web_app', text: '🛍 Open shop', web_app: { url: 'https://s' } });
  });
});

describe('handOverSessionCart', () => {
  const session = (cart: SessionData['cart']): SessionData => ({ cart });

  it('does nothing for an empty session cart', async () => {
    await handOverSessionCart(1, 99, session([]));
    expect(m.putCart).not.toHaveBeenCalled();
  });

  it('merges session lines into the storefront cart, summing overlaps, then empties the session', async () => {
    m.getCart.mockResolvedValue({ items: [{ productId: 10, quantity: 2 }, { productId: 11, quantity: 1 }] });
    const s = session([{ productId: 10, name: 'A', price: 1, quantity: 3 }, { productId: 12, name: 'C', price: 1, quantity: 1 }]);
    await handOverSessionCart(1, 99, s);
    expect(m.putCart).toHaveBeenCalledWith(1, [
      { productId: 10, quantity: 5 },
      { productId: 11, quantity: 1 },
      { productId: 12, quantity: 1 },
    ]);
    expect(s.cart).toEqual([]);
    expect(m.untrackCart).toHaveBeenCalledWith(99);
  });

  it('keeps the session cart when the storefront write fails', async () => {
    m.getCart.mockResolvedValue({ items: [] });
    m.putCart.mockRejectedValue(new Error('db down'));
    const s = session([{ productId: 10, name: 'A', price: 1, quantity: 3 }]);
    await handOverSessionCart(1, 99, s);
    expect(s.cart).toHaveLength(1);
    expect(m.untrackCart).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/bot/webapp.test.ts`
Expected: FAIL — cannot resolve `./webapp`.

- [ ] **Step 3: Register the template and labels**

In `src/bot/templates.ts`, after the `tpl_wholesale_menu` entry:

```ts
  {
    key: 'tpl_webapp_welcome',
    defaultValue:
      '👋 <b>Welcome{{customer_name_suffix}}!</b>\n\nOur shop lives right here in Telegram — tap <b>Open shop</b> to browse, order and track your orders.',
    description: 'Web app mode: the only menu the bot shows (Open shop / Contact)',
    variables: ['customer_name', 'customer_name_suffix'],
    exampleValues: { customer_name: 'John', customer_name_suffix: ', John' },
  },
```

Directly after the `btn_open_catalog` entry (same field order as it — `key, defaultValue, description, variables, exampleValues, kind`):

```ts
  {
    key: 'btn_open_shop',
    defaultValue: '🛍 Open shop',
    description: 'Web app mode: opens the storefront Mini App (also the chat menu button text)',
    variables: [],
    exampleValues: {},
    kind: 'button',
  },
  {
    key: 'btn_contact',
    defaultValue: '💬 Contact us',
    description: 'Web app mode: opens a chat with the support username',
    variables: [],
    exampleValues: {},
    kind: 'button',
  },
  {
    key: 'btn_use_classic_bot',
    defaultValue: '↩️ Use classic bot',
    description: 'Web app mode (beta): switch this shopper back to the classic bot menus',
    variables: [],
    exampleValues: {},
    kind: 'button',
  },
  {
    key: 'btn_try_new_shop',
    defaultValue: '✨ Try the new shop (beta)',
    description: 'Classic main menu, web app mode beta: switch this shopper to the Mini App',
    variables: [],
    exampleValues: {},
    kind: 'button',
  },
```

(The admin Message Templates tab puts keys outside its `KNOWN_GROUPS` into an auto-derived group, so these appear there with no admin change.)

- [ ] **Step 4: Add `callTelegramApi` to `src/lib/telegram-api.ts`**

```ts
/** One Bot API call from outside the Telegraf process (e.g. the API setting a
 *  chat's menu button). Returns false — never throws — on a missing token or a
 *  Telegram error; callers treat menu-button state as best-effort. */
export async function callTelegramApi(method: string, body: Record<string, unknown>): Promise<boolean> {
  const botToken = await getBotSettingValue('bot_token');
  if (!botToken) {
    logger.warn({ method }, 'bot_token not configured, skipping Telegram call');
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) logger.warn({ method, status: res.status, body: await res.text() }, 'Telegram call failed');
    return res.ok;
  } catch (err) {
    logger.warn({ err, method }, 'Telegram call threw');
    return false;
  }
}
```

- [ ] **Step 5: Implement `src/bot/webapp.ts`**

```ts
import { Markup } from 'telegraf';
import type { MenuButton } from 'telegraf/types'; // re-exports @telegraf/types' typegram; MenuButton = commands | web_app | default
import pino from 'pino';
import type { BotContext, SessionData } from './types';
import type { WebAppMode } from '../modules/bot-settings/schemas';
import { getBotSettingValue } from '../modules/bot-settings/service';
import { getCart, putCart } from '../modules/public-storefront/cart';
import { untrackCart } from '../modules/carts/service';
import { renderLabel } from './labels';
import { escapeHtml, renderTemplate } from './templates';
import { cb, safeEditOrSend } from './utils';
import { webAppUrl } from './webapp-mode';

const logger = pino({ name: 'bot:webapp' });

export function buildWelcomeKeyboard(
  labels: Map<string, string>,
  opts: { url: string; supportUsername: string | null; beta: boolean },
) {
  const rows = [[Markup.button.webApp(renderLabel(labels, 'btn_open_shop'), opts.url)]];
  const handle = opts.supportUsername?.trim().replace(/^@/, '');
  if (handle) rows.push([Markup.button.url(renderLabel(labels, 'btn_contact'), `https://t.me/${handle}`)]);
  if (opts.beta) rows.push([Markup.button.callback(renderLabel(labels, 'btn_use_classic_bot'), cb('webapp_optout'))]);
  return Markup.inlineKeyboard(rows);
}

export function webAppMenuButton(labels: Map<string, string>, url: string): MenuButton {
  return { type: 'web_app', text: renderLabel(labels, 'btn_open_shop'), web_app: { url } };
}

/**
 * A web_app button tap never reaches the bot, so the classic cart is handed to
 * the storefront the moment the bot shows the welcome instead. Lines are merged
 * (same product → quantities summed) and the storefront cart's own validation
 * flags anything over a limit. A failed write keeps the session cart: losing a
 * shopper's basket is worse than showing it twice.
 */
export async function handOverSessionCart(customerId: number, chatId: number, session: SessionData): Promise<void> {
  if (session.cart.length === 0) return;
  try {
    const current = await getCart(customerId);
    const quantities = new Map<number, number>();
    for (const line of current.items) quantities.set(line.productId, line.quantity);
    for (const line of session.cart) {
      quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity);
    }
    await putCart(customerId, [...quantities].map(([productId, quantity]) => ({ productId, quantity })));
    session.cart = [];
    session.pendingQty = undefined;
    await untrackCart(chatId);
  } catch (err) {
    logger.error({ err, customerId }, 'Could not hand the bot cart to the storefront; keeping it in the session');
  }
}

/** The only menu the bot shows in web app mode. */
export async function showWebAppWelcome(ctx: BotContext, mode: WebAppMode): Promise<void> {
  const url = webAppUrl();
  if (!url) return; // getWebAppMode already returned 'off' in this case; defensive only
  if (ctx.session.customerId && ctx.chat?.id) {
    await handOverSessionCart(ctx.session.customerId, ctx.chat.id, ctx.session);
  }
  const name = ctx.from?.first_name ?? '';
  const text = await renderTemplate('tpl_webapp_welcome', {
    customer_name: escapeHtml(name),
    customer_name_suffix: name ? `, ${escapeHtml(name)}` : '',
  });
  const keyboard = buildWelcomeKeyboard(ctx.labels, {
    url,
    supportUsername: await getBotSettingValue('support_username'),
    beta: mode === 'beta',
  });
  await safeEditOrSend(ctx, text, { ...keyboard, parse_mode: 'HTML' });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/bot/webapp.test.ts && npm run build`
Expected: PASS; build OK.

- [ ] **Step 7: Commit**

```bash
git add src/bot/templates.ts src/lib/telegram-api.ts src/bot/webapp.ts src/bot/webapp.test.ts
git commit -m "feat(bot): web app welcome, labels, cart hand-over and menu-button helpers"
```

---

### Task 4: The web app gate, opt-in/out callbacks, default menu button sync

**Files:**
- Create: `src/bot/webapp-optout.ts` (db-only; imported by the gate *and* by the API's `public-storefront/account.ts` in Task 5, so the API never pulls in the bot's menu modules)
- Create: `src/bot/webapp-gate.ts`
- Modify: `src/bot/bot.ts` (register the gate after `labelLoader()`, ~line 101; add `webapp_optin` case in the callback switch)
- Modify: `src/bot/menus/main.ts` (`showMainMenu`: opt-in row)
- Modify: `src/bot/commands.ts` (menu-button sync inside the existing tick)
- Modify: `src/bot/commands.test.ts:276` (`fakeTelegram` stub)
- Test: `src/bot/webapp-gate.test.ts`

**Interfaces:**
- Consumes: `getWebAppMode`, `isWebAppActiveFor`, `webAppUrl` (Task 2); `showWebAppWelcome`, `webAppMenuButton` (Task 3); `handleReferralDeepLink(ctx, code): Promise<boolean>` + `REFERRAL_START_PAYLOAD = /^ref_([A-Za-z0-9]{4,32})$/` (`./menus/profile` — on success it sends its own "referral applied" message with a Continue → `cb('main')` button and returns `true`; on a rejected/disabled code it is silent and returns `false`); `handleAccountLink(ctx, rawToken): Promise<boolean>` + `ACCOUNT_LINK_START_PAYLOAD = /^link_([A-Za-z0-9_-]{43})$/` (`./menus/account-link` — returns `true` when consumed, even on failure); `showMainMenu` (`./menus/main`); `clearPendingInput(session, keep?)`, `parseCb(data): { action, params }` (`./utils`).
- Produces: `isOptedOut(customerId: number | undefined): Promise<boolean>` and `setOptOut(customerId: number, optedOut: boolean): Promise<void>` (`src/bot/webapp-optout.ts`); `webAppGate(deps?: Partial<GateDeps>)` Telegraf middleware; `optInToWebApp(ctx)`; `syncDefaultMenuButton(telegram: Pick<Telegram, 'setChatMenuButton' | 'getChatMenuButton'>, loadLabels?: () => Promise<Map<string, string>>): Promise<void>`; `resetMenuButtonFingerprint(): void`.

- [ ] **Step 1: Write the failing test**

```ts
// src/bot/webapp-gate.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../db/client', () => ({ db: {} }));
vi.mock('./webapp', () => ({ showWebAppWelcome: vi.fn(), webAppMenuButton: vi.fn(() => ({ type: 'web_app' })) }));
vi.mock('./menus/main', () => ({ showMainMenu: vi.fn() }));
vi.mock('./menus/profile', () => ({ REFERRAL_START_PAYLOAD: /^ref_([A-Z0-9]+)$/, handleReferralDeepLink: vi.fn() }));
vi.mock('./menus/account-link', () => ({ ACCOUNT_LINK_START_PAYLOAD: /^link_(.+)$/, handleAccountLink: vi.fn() }));

import { webAppGate, type GateDeps } from './webapp-gate';
import type { WebAppMode } from '../modules/bot-settings/schemas';

function deps(mode: WebAppMode, optedOut: boolean) {
  return {
    getMode: vi.fn(async () => mode),
    isOptedOut: vi.fn(async () => optedOut),
    setOptOut: vi.fn(async () => undefined),
    welcome: vi.fn(async () => undefined),
    classicMenu: vi.fn(async () => undefined),
    referral: vi.fn(async () => true),
    accountLink: vi.fn(async () => true),
  } satisfies GateDeps;
}

function ctx(update: { text?: string; data?: string; other?: boolean }) {
  return {
    chat: { id: 99, type: 'private' },
    session: { cart: [], customerId: 1 },
    labels: new Map(),
    message: update.text !== undefined ? { text: update.text } : undefined,
    callbackQuery: update.data !== undefined ? { data: update.data } : undefined,
    myChatMember: update.other ? { new_chat_member: { status: 'kicked' } } : undefined,
    answerCbQuery: vi.fn(async () => true),
    telegram: { setChatMenuButton: vi.fn(async () => true) },
  } as never;
}

const next = vi.fn(async () => undefined);
beforeEach(() => vi.clearAllMocks());

describe('webAppGate', () => {
  it.each([
    ['off', false], ['beta', true],
  ] as const)('passes classic traffic through (mode %s, opted out %s)', async (mode, out) => {
    const d = deps(mode, out);
    await webAppGate(d)(ctx({ text: '/orders' }), next);
    expect(next).toHaveBeenCalled();
    expect(d.welcome).not.toHaveBeenCalled();
  });

  it.each([
    ['beta', false], ['forced', false], ['forced', true],
  ] as const)('answers everything with the welcome (mode %s, opted out %s)', async (mode, out) => {
    for (const u of [{ text: '/start' }, { text: '/orders' }, { text: 'hello' }, { data: 'categories' }]) {
      const d = deps(mode, out);
      await webAppGate(d)(ctx(u), next);
      expect(d.welcome).toHaveBeenCalledWith(expect.anything(), mode);
    }
    expect(next).not.toHaveBeenCalled();
  });

  it('lets an applied referral show its own confirmation (its Continue button leads to the welcome)', async () => {
    const d = deps('beta', false);
    await webAppGate(d)(ctx({ text: '/start ref_ABC123' }), next);
    expect(d.referral).toHaveBeenCalledWith(expect.anything(), 'ABC123');
    expect(d.welcome).not.toHaveBeenCalled();
  });

  it('falls through to the welcome when the referral is not applied', async () => {
    const d = { ...deps('beta', false), referral: vi.fn(async () => false) };
    await webAppGate(d)(ctx({ text: '/start ref_ABC123' }), next);
    expect(d.referral).toHaveBeenCalled();
    expect(d.welcome).toHaveBeenCalled();
  });

  it('lets an admin account-link deep link complete instead of the welcome', async () => {
    const d = deps('forced', false);
    await webAppGate(d)(ctx({ text: '/start link_tok' }), next);
    expect(d.accountLink).toHaveBeenCalledWith(expect.anything(), 'tok');
    expect(d.welcome).not.toHaveBeenCalled();
  });

  it('passes non-message updates (e.g. the shopper blocking the bot) through untouched', async () => {
    const d = deps('forced', false);
    await webAppGate(d)(ctx({ other: true }), next);
    expect(next).toHaveBeenCalled();
    expect(d.welcome).not.toHaveBeenCalled();
    expect(d.getMode).not.toHaveBeenCalled();
  });

  it('opts out in beta: flag set, chat menu reset to commands, classic menu shown', async () => {
    const d = deps('beta', false);
    const c = ctx({ data: 'webapp_optout' });
    await webAppGate(d)(c, next);
    expect(d.setOptOut).toHaveBeenCalledWith(1, true);
    expect((c as any).telegram.setChatMenuButton).toHaveBeenCalledWith({ chatId: 99, menuButton: { type: 'commands' } });
    expect(d.classicMenu).toHaveBeenCalled();
  });

  it('ignores opt-out in forced mode', async () => {
    const d = deps('forced', false);
    await webAppGate(d)(ctx({ data: 'webapp_optout' }), next);
    expect(d.setOptOut).not.toHaveBeenCalled();
    expect(d.welcome).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/bot/webapp-gate.test.ts`
Expected: FAIL — cannot resolve `./webapp-gate`.

- [ ] **Step 3: Implement `src/bot/webapp-optout.ts` and `src/bot/webapp-gate.ts`**

`src/bot/webapp-optout.ts` — db only, no bot imports, so the API (Task 5) can use it without loading Telegraf menus:

```ts
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { customers } from '../db/schema/customers';

/** Whether this shopper chose the classic bot (only meaningful in beta web app mode). */
export async function isOptedOut(customerId: number | undefined): Promise<boolean> {
  if (!customerId) return false;
  const row = (await db
    .select({ optOut: customers.botWebappOptOut })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1))[0];
  return row?.optOut ?? false;
}

export async function setOptOut(customerId: number, optedOut: boolean): Promise<void> {
  await db.update(customers).set({ botWebappOptOut: optedOut }).where(eq(customers.id, customerId));
}
```

`src/bot/webapp-gate.ts`:

```ts
import pino from 'pino';
import type { Telegram } from 'telegraf';
import type { MenuButton } from 'telegraf/types';
import type { WebAppMode } from '../modules/bot-settings/schemas';
import type { BotContext } from './types';
import { clearPendingInput, parseCb } from './utils';
import { loadButtonLabels } from './labels';
import { getWebAppMode, isWebAppActiveFor, webAppUrl } from './webapp-mode';
import { isOptedOut, setOptOut } from './webapp-optout';
import { showWebAppWelcome, webAppMenuButton } from './webapp';
import { showMainMenu } from './menus/main';
import { REFERRAL_START_PAYLOAD, handleReferralDeepLink } from './menus/profile';
import { ACCOUNT_LINK_START_PAYLOAD, handleAccountLink } from './menus/account-link';

const logger = pino({ name: 'bot:webapp-gate' });

export interface GateDeps {
  getMode: () => Promise<WebAppMode>;
  isOptedOut: (customerId: number | undefined) => Promise<boolean>;
  setOptOut: (customerId: number, optedOut: boolean) => Promise<void>;
  welcome: (ctx: BotContext, mode: WebAppMode) => Promise<void>;
  classicMenu: (ctx: BotContext) => Promise<void>;
  referral: (ctx: BotContext, code: string) => Promise<boolean>;
  accountLink: (ctx: BotContext, token: string) => Promise<boolean>;
}

const DEFAULT_DEPS: GateDeps = {
  getMode: getWebAppMode,
  isOptedOut,
  setOptOut,
  welcome: showWebAppWelcome,
  classicMenu: showMainMenu,
  referral: handleReferralDeepLink,
  accountLink: handleAccountLink,
};

/**
 * Web app mode: for a shopper the Mini App is active for, the bot is a front
 * door — every update (any command, free text, any button from an old classic
 * message) is answered with the welcome, and nothing classic runs. Order
 * notifications are sent by the notifications driver, not through here, so
 * they are unaffected.
 *
 * Two /start payloads still do their job first: an admin account-link
 * completes on its own screen, and an applied referral shows its own
 * confirmation (whose Continue → `main` button comes back through this gate
 * and gets the welcome); a referral that isn't applied is silent, so the
 * welcome shows straight away. Only messages and button taps are answered —
 * other updates (my_chat_member when a shopper blocks the bot, …) pass
 * through, since replying to them would only fail.
 * Registered after banGate() and labelLoader(), so bans still win and
 * ctx.labels is loaded.
 */
export function webAppGate(overrides: Partial<GateDeps> = {}) {
  const d = { ...DEFAULT_DEPS, ...overrides };
  return async (ctx: BotContext, next: () => Promise<void>) => {
    if (!ctx.message && !ctx.callbackQuery) return next();
    const mode = await d.getMode();
    if (mode === 'off') return next();

    const customerId = ctx.session.customerId;
    const optedOut = mode === 'beta' ? await d.isOptedOut(customerId) : false;
    if (!isWebAppActiveFor(mode, optedOut)) return next();

    clearPendingInput(ctx.session);

    const data = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;
    if (data !== undefined) {
      try { await ctx.answerCbQuery(); } catch { /* expired */ }
      if (parseCb(data).action === 'webapp_optout' && mode === 'beta' && customerId) {
        await d.setOptOut(customerId, true);
        await setChatMenu(ctx, { type: 'commands' });
        await d.classicMenu(ctx);
        return;
      }
    }

    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const payload = /^\/start(?:@\S+)?\s+(\S+)/.exec(text)?.[1];
    if (payload) {
      const link = ACCOUNT_LINK_START_PAYLOAD.exec(payload);
      if (link && (await d.accountLink(ctx, link[1]))) return;
      const ref = REFERRAL_START_PAYLOAD.exec(payload);
      if (ref && (await d.referral(ctx, ref[1]))) return;
    }

    await d.welcome(ctx, mode);
  };
}

async function setChatMenu(ctx: BotContext, menuButton: MenuButton) {
  if (!ctx.chat?.id) return;
  try {
    await ctx.telegram.setChatMenuButton({ chatId: ctx.chat.id, menuButton });
  } catch (err) {
    logger.warn({ err, chatId: ctx.chat.id }, 'Could not set the chat menu button');
  }
}

/** Classic-menu opt-in (beta): clear the flag, drop the per-chat override, show the welcome. */
export async function optInToWebApp(ctx: BotContext): Promise<void> {
  const mode = await getWebAppMode();
  if (mode !== 'beta' || !ctx.session.customerId) {
    await showMainMenu(ctx);
    return;
  }
  await setOptOut(ctx.session.customerId, false);
  await setChatMenu(ctx, { type: 'default' });
  await showWebAppWelcome(ctx, mode);
}

let lastMenuFingerprint: string | null = null;

/**
 * Keeps the bot's DEFAULT menu button in step with the effective mode. Runs on
 * the command-menu tick, so a setting change lands within a minute in the
 * process that owns the bot. Per-chat overrides (opt-outs) are untouched.
 *
 * With the mode off it does NOT blindly publish `commands`: stores may have a
 * web-app menu button set in BotFather (the existing `syncCommandMenu` comment
 * promises to leave it alone). It only resets a default button that points at
 * *our* storefront — i.e. one this sync published before the mode was turned off.
 */
export async function syncDefaultMenuButton(
  telegram: Pick<Telegram, 'setChatMenuButton' | 'getChatMenuButton'>,
  loadLabels: () => Promise<Map<string, string>> = loadButtonLabels,
): Promise<void> {
  const mode = await getWebAppMode();
  const url = webAppUrl();

  if (mode === 'off' || !url) {
    if (lastMenuFingerprint === 'off') return;
    const current = await telegram.getChatMenuButton({});
    if (url && current.type === 'web_app' && current.web_app.url.startsWith(url)) {
      await telegram.setChatMenuButton({ menuButton: { type: 'commands' } });
      logger.info('Default chat menu button reset to commands (web app mode off)');
    }
    lastMenuFingerprint = 'off';
    return;
  }

  const menuButton = webAppMenuButton(await loadLabels(), url);
  const fingerprint = JSON.stringify(menuButton);
  if (fingerprint === lastMenuFingerprint) return;
  await telegram.setChatMenuButton({ menuButton });
  lastMenuFingerprint = fingerprint;
  logger.info({ menuButton }, 'Default chat menu button published');
}

export function resetMenuButtonFingerprint() {
  lastMenuFingerprint = null;
}
```

Add to `webapp-gate.test.ts` (same file, new `describe`) — the off-mode behaviour is the one that can break a store that never touches this feature:

First add, at the top of `webapp-gate.test.ts` next to the other `vi.mock` calls (the gate tests inject `getMode`, so they are unaffected; `isWebAppActiveFor` stays real):

```ts
const modeMock = vi.hoisted(() => ({ getWebAppMode: vi.fn(), webAppUrl: vi.fn() }));
vi.mock('./webapp-mode', async (orig) => ({
  ...(await orig<typeof import('./webapp-mode')>()),
  getWebAppMode: modeMock.getWebAppMode,
  webAppUrl: modeMock.webAppUrl,
}));
```

and extend the import: `import { webAppGate, syncDefaultMenuButton, resetMenuButtonFingerprint, type GateDeps } from './webapp-gate';`. Then append:

```ts
describe('syncDefaultMenuButton', () => {
  const tg = (current: unknown) => ({
    setChatMenuButton: vi.fn(async () => true as const),
    getChatMenuButton: vi.fn(async () => current as never),
  });
  const labels = async () => new Map<string, string>();
  beforeEach(() => {
    resetMenuButtonFingerprint();
    modeMock.webAppUrl.mockReturnValue('https://shop.example.com');
  });

  it('leaves a BotFather web-app menu button alone when the mode is off', async () => {
    modeMock.getWebAppMode.mockResolvedValue('off');
    const t = tg({ type: 'web_app', text: 'Order', web_app: { url: 'https://other.example.com' } });
    await syncDefaultMenuButton(t, labels);
    expect(t.setChatMenuButton).not.toHaveBeenCalled();
  });

  it('resets our own web-app button to commands when the mode goes off', async () => {
    modeMock.getWebAppMode.mockResolvedValue('off');
    const t = tg({ type: 'web_app', text: 'Open', web_app: { url: 'https://shop.example.com' } });
    await syncDefaultMenuButton(t, labels);
    expect(t.setChatMenuButton).toHaveBeenCalledWith({ menuButton: { type: 'commands' } });
  });

  it('publishes the web-app button once while the mode is on', async () => {
    modeMock.getWebAppMode.mockResolvedValue('beta');
    const t = tg({ type: 'commands' });
    await syncDefaultMenuButton(t, labels);
    await syncDefaultMenuButton(t, labels);
    expect(t.setChatMenuButton).toHaveBeenCalledTimes(1);
  });
});
```

The `webAppMenuButton` mock at the top of the file returns `{ type: 'web_app' }`, which is enough for the "publishes once" case.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/bot/webapp-gate.test.ts`
Expected: PASS.

- [ ] **Step 5: Register the gate and the opt-in callback in `src/bot/bot.ts`**

Imports:

```ts
import { webAppGate, optInToWebApp } from './webapp-gate';
```

After `bot.use(labelLoader());`:

```ts
  // Web app mode: ahead of /start, commands, text and callbacks, so a shopper
  // the Mini App is active for never reaches a classic handler. After banGate
  // (bans still win) and labelLoader (the welcome's buttons need ctx.labels).
  bot.use(webAppGate());
```

In the callback `switch (action)`, next to `case 'main':`:

```ts
        case 'webapp_optin':
          await optInToWebApp(botCtx);
          break;
```

- [ ] **Step 6: Add the opt-in row to the classic main menu**

In `src/bot/menus/main.ts`, import `getWebAppMode` from `'../webapp-mode'`, and immediately after `const rows = orderingEnabled ? … : [];`:

```ts
  // Beta web app mode: anyone seeing the classic menu has opted out — offer the way back.
  if ((await getWebAppMode()) === 'beta') {
    rows.unshift([Markup.button.callback(renderLabel(ctx.labels, 'btn_try_new_shop'), cb('webapp_optin'))]);
  }
```

- [ ] **Step 7: Sync the default menu button on the command-menu tick**

In `src/bot/commands.ts`:
- import `syncDefaultMenuButton, resetMenuButtonFingerprint` from `'./webapp-gate'`;
- widen **only** `startCommandMenuSync`'s parameter to `telegram: Pick<Telegram, 'setMyCommands' | 'setChatMenuButton' | 'getChatMenuButton'>` (`syncCommandMenu` keeps `Pick<Telegram, 'setMyCommands'>`); `launchBot` passes `instance.telegram`, which satisfies it;
- in `tick`, replace the `syncInFlight = true; try { … } catch { … } finally { … }` sequence with two independently guarded calls, so one failing never blocks the other:

```ts
    syncInFlight = true;
    try {
      await syncCommandMenu(telegram);
    } catch (err) {
      logger.warn({ err }, 'Bot command menu sync failed; retrying next tick');
    }
    try {
      await syncDefaultMenuButton(telegram);
    } catch (err) {
      logger.warn({ err }, 'Default menu button sync failed; retrying next tick');
    } finally {
      syncInFlight = false;
    }
```

- in `stopCommandMenuSync`, add `resetMenuButtonFingerprint();`.
- Update the doc comment on `syncCommandMenu`: the default chat menu button is now managed by `syncDefaultMenuButton` while web app mode is on; with the mode off it is left alone unless it points at our storefront (so a BotFather-set web-app button still keeps working).

The `TELEGRAM_SENDS_ENABLED` guard at the top of `startCommandMenuSync` already covers the new call.

In `src/bot/commands.test.ts:276`, give the stub the two new methods so the tick's menu-button sync doesn't just throw and log:

```ts
  function fakeTelegram() {
    return {
      setMyCommands: vi.fn(async () => true as const),
      setChatMenuButton: vi.fn(async () => true as const),
      getChatMenuButton: vi.fn(async () => ({ type: 'commands' as const })),
    };
  }
```

(That file already mocks `getBotSettingValue` to return `null`, so the effective mode is `off` and no labels are loaded from the db. Test files are excluded from `tsc`, so only vitest exercises them.)

- [ ] **Step 8: Build and run the bot test suite**

Run: `npm run build && npx vitest run src/bot`
Expected: build OK; all bot tests pass. `commands.test.ts` drives the real `createBot()` pipeline, so the new `webAppGate()` runs there too — with `getBotSettingValue` mocked to `null` it resolves to `off` and calls `next()`, leaving those tests' behaviour unchanged. If any of them fail, that is a real regression in the gate's off path.

- [ ] **Step 9: Commit**

```bash
git add src/bot
git commit -m "feat(bot): web app mode gate, classic opt-in/out, default menu button sync"
```

---

### Task 5: Public settings mode and the in-app classic switch

**Files:**
- Modify: `src/modules/storefront-settings/service.ts` (`PublicStorefrontSettings` ~line 136, `getPublicStorefrontSettings` ~line 317)
- Modify: `src/modules/storefront-settings/schemas.ts:49` (layout enum)
- Modify: `src/modules/public-storefront/account.ts` (append `setBotMode`)
- Modify: `src/modules/public-storefront/schemas.ts`, `controller.ts`, `router.ts`
- Test: `src/modules/public-storefront/bot-mode.test.ts`
- Modify: `docs/bot-settings.md` (the file that documents `wholesale_mode_enabled`)

**Interfaces:**
- Consumes: `getWebAppMode`, `webAppUrl` (Task 2), `setOptOut` (Task 4, from the db-only `src/bot/webapp-optout.ts`), `callTelegramApi`, `editOrSendTelegramMessage` (`src/lib/telegram-api.ts`), `loadButtonLabels`, `renderLabel`.
- Produces: public settings field `telegramWebApp: { mode: WebAppMode }`; `setBotMode(customer: typeof customers.$inferSelect, classic: boolean, deps?): Promise<{ classic: boolean }>`; layout enum `'storefront' | 'menu' | 'webapp'`.

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/public-storefront/bot-mode.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../db/client', () => ({ db: {} }));

import { setBotMode, type BotModeDeps } from './account';
import { ValidationError } from '../../utils/errors';

function deps(mode: 'off' | 'beta' | 'forced') {
  return {
    getMode: vi.fn(async () => mode),
    setOptOut: vi.fn(async () => undefined),
    callTelegram: vi.fn(async () => true),
    sendMessage: vi.fn(async () => undefined),
    labels: vi.fn(async () => new Map<string, string>()),
  } satisfies BotModeDeps;
}

const customer = { id: 7, telegramId: '777' } as never;
beforeEach(() => vi.clearAllMocks());

describe('setBotMode', () => {
  it('switches a beta shopper to the classic bot and nudges them in Telegram', async () => {
    const d = deps('beta');
    await expect(setBotMode(customer, true, d)).resolves.toEqual({ classic: true });
    expect(d.setOptOut).toHaveBeenCalledWith(7, true);
    expect(d.callTelegram).toHaveBeenCalledWith('setChatMenuButton', { chat_id: 777, menu_button: { type: 'commands' } });
    expect(d.sendMessage).toHaveBeenCalledWith(777, expect.any(String), { inline_keyboard: [[{ text: expect.any(String), callback_data: 'main' }]] });
  });

  it('switches back to the web app', async () => {
    const d = deps('beta');
    await expect(setBotMode(customer, false, d)).resolves.toEqual({ classic: false });
    expect(d.setOptOut).toHaveBeenCalledWith(7, false);
    expect(d.callTelegram).toHaveBeenCalledWith('setChatMenuButton', { chat_id: 777, menu_button: { type: 'default' } });
  });

  it.each(['forced', 'off'] as const)('refuses in %s mode', async (mode) => {
    const d = deps(mode);
    await expect(setBotMode(customer, true, d)).rejects.toBeInstanceOf(ValidationError);
    expect(d.setOptOut).not.toHaveBeenCalled();
  });

  it('refuses a customer with no Telegram identity', async () => {
    await expect(setBotMode({ id: 7, telegramId: null } as never, true, deps('beta'))).rejects.toBeInstanceOf(ValidationError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/public-storefront/bot-mode.test.ts`
Expected: FAIL — `setBotMode` not exported.

- [ ] **Step 3: Implement `setBotMode` in `account.ts`**

Append to `src/modules/public-storefront/account.ts`. Imports at the top of the file: change the existing `import { NotFoundError } from '../../utils/errors';` to `import { NotFoundError, ValidationError } from '../../utils/errors';` (it does not import `ValidationError` today), and add `getWebAppMode` from `'../../bot/webapp-mode'`; `setOptOut` from `'../../bot/webapp-optout'` (the db-only module — **not** `webapp-gate`, which would drag the bot's menu modules into the API); `callTelegramApi, editOrSendTelegramMessage` from `'../../lib/telegram-api'`; `loadButtonLabels, renderLabel` from `'../../bot/labels'`:

```ts
export interface BotModeDeps {
  getMode: typeof getWebAppMode;
  setOptOut: typeof setOptOut;
  callTelegram: typeof callTelegramApi;
  sendMessage: (chatId: number, text: string, replyMarkup: unknown) => Promise<unknown>;
  labels: typeof loadButtonLabels;
}

const BOT_MODE_DEPS: BotModeDeps = {
  getMode: getWebAppMode,
  setOptOut,
  callTelegram: callTelegramApi,
  sendMessage: (chatId, text, replyMarkup) => editOrSendTelegramMessage(chatId, text, replyMarkup),
  labels: loadButtonLabels,
};

/**
 * The Mini App's "Switch to the classic bot" (and back). Only meaningful in
 * beta web app mode — forced has no opt-out and off has nothing to opt out of.
 * Switching to classic also resets the chat's menu button and drops a message
 * in the chat with a button into the classic main menu, because the Mini App
 * closes itself right after and the shopper needs somewhere to land.
 */
export async function setBotMode(
  customer: typeof customers.$inferSelect,
  classic: boolean,
  deps: BotModeDeps = BOT_MODE_DEPS,
): Promise<{ classic: boolean }> {
  if ((await deps.getMode()) !== 'beta') throw new ValidationError('Switching bots is not available for this shop');
  const chatId = Number(customer.telegramId);
  if (!customer.telegramId || !Number.isSafeInteger(chatId)) throw new ValidationError('This account has no Telegram chat');

  await deps.setOptOut(customer.id, classic);
  await deps.callTelegram('setChatMenuButton', {
    chat_id: chatId,
    menu_button: { type: classic ? 'commands' : 'default' },
  });
  if (classic) {
    const labels = await deps.labels();
    await deps.sendMessage(chatId, 'You’re back on the classic bot.', {
      inline_keyboard: [[{ text: renderLabel(labels, 'btn_back_to_menu'), callback_data: 'main' }]],
    });
  }
  return { classic };
}
```

(`customers` is already imported in account.ts (line 3). `btn_back_to_menu` is an existing label. The `callback_data: 'main'` button lands in the bot's callback router, which — the shopper now being opted out — shows the classic main menu.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/public-storefront/bot-mode.test.ts`
Expected: PASS.

- [ ] **Step 5: Route it**

`schemas.ts` (public-storefront):

```ts
export const botModeSchema = z.object({ classic: z.boolean() });
export type BotModeInput = z.infer<typeof botModeSchema>;
```

`controller.ts` (add `BotModeInput` to the type import):

```ts
export async function setBotMode(req: Request, res: Response) {
  const { classic } = req.body as BotModeInput;
  sendSuccess(res, await storefrontAccount.setBotMode(req.storefrontCustomer!, classic));
}
```

`router.ts`, after the `/profile/redeem` route (add `botModeSchema` to the schemas import):

```ts
// Mini App "Switch to the classic bot" (beta web app mode only).
publicStorefrontRouter.post(
  '/account/bot-mode',
  requireStorefrontEnabled,
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }),
  authenticateStorefrontCustomer,
  validate({ body: botModeSchema }),
  publicStorefrontController.setBotMode,
);
```

- [ ] **Step 6: Expose the mode and allow the `webapp` layout**

`src/modules/storefront-settings/schemas.ts:49`: `layout: z.enum(['storefront', 'menu', 'webapp']),`

`src/modules/storefront-settings/service.ts`:
- in `interface PublicStorefrontSettings`, after `turnstile: …`: `telegramWebApp: { mode: WebAppMode };`
- import `getWebAppMode` from `'../../bot/webapp-mode'` and `type WebAppMode` from `'../bot-settings/schemas'`;
- add `getWebAppMode()` as the last entry of the `Promise.all` in `getPublicStorefrontSettings` and destructure it as `webAppMode`;
- return `telegramWebApp: { mode: webAppMode },` after `turnstile`.

Run `npx vitest run src/modules/storefront-settings` — expected to pass unchanged (`schemas.test.ts` has no layout assertions; nothing else in the backend branches on `layout`, and `DEFAULT_FEATURES.layout` stays `'storefront'`).

- [ ] **Step 7: Document the setting**

`docs/bot-settings.md` documents settings as a table (`wholesale_mode_enabled` is the row at ~line 158). Add a row directly below it:

```md
| `storefront_webapp_mode` | `off` \| `beta` \| `forced` | `"off"` | Shop in web app (BETA): the bot shows only `tpl_webapp_welcome` (Open shop / Contact, plus Use classic bot in `beta`) and notifications; shopping happens in the storefront as a Telegram Mini App. See *Web app mode* below. Any other value is rejected with a 422. |
```

and, after the "Wholesale Mode templates" block (~line 235), a new section:

```md
### Web app mode

`storefront_webapp_mode`: `off` (default) | `beta` | `forced`. When on, the bot stops being a shop: every message and button
is answered with `tpl_webapp_welcome` (buttons: Open shop → the deployed storefront as a Telegram
Mini App, Contact → `support_username`, and in `beta` "Use classic bot"). The bot's only other
messages are notifications. The default chat menu button opens the Mini App. Shoppers sign in
automatically from Telegram (`POST /public/storefront/auth/telegram-webapp`).

- `beta`: shoppers can switch to the classic bot (welcome button or Mini App → Account); the choice
  is `customers.bot_webapp_opt_out`, and the classic main menu offers "Try the new shop".
- `forced`: no opt-out. Reviews, FAQ and Giveaways are not in the storefront yet — avoid `forced`
  until they are.
- Falls back to the classic bot when Wholesale Mode is on, or when no storefront is deployed
  (`storefront_public_url`) or it is disabled.
- BotFather: `/setdomain` to the storefront host (also needed for the web Login Widget).
- Templates/labels: `tpl_webapp_welcome` (`{{customer_name}}`, `{{customer_name_suffix}}`), `btn_open_shop`
  (also the menu-button text), `btn_contact`, `btn_use_classic_bot`, `btn_try_new_shop`.
```

In this repo's `CLAUDE.md`, directly after the **Wholesale Mode** bullet (~line 105), add:

```md
- **Web app mode**: `bot_settings.storefront_webapp_mode` (`off`/`beta`/`forced`). `webAppGate()` (`src/bot/webapp-gate.ts`, registered after `labelLoader()`) answers every private message/button with `tpl_webapp_welcome` (Open shop → the deployed storefront as a Mini App, Contact, and in beta Use classic bot) for shoppers the Mini App is active for; the bot's only other messages are notifications. Effective mode (`src/bot/webapp-mode.ts`) is `off` when Wholesale Mode is on or no storefront is deployed/enabled. Opt-out is `customers.bot_webapp_opt_out` (db helpers in `src/bot/webapp-optout.ts`). Mini App sign-in: `POST /public/storefront/auth/telegram-webapp` (`verifyTelegramWebApp`, `initData` HMAC, 24h max age).
```

- [ ] **Step 8: Full verification**

Run: `npm run build && npm test`
Expected: build OK; full suite passes.

- [ ] **Step 9: Commit**

```bash
git add src/modules docs/bot-settings.md CLAUDE.md
git commit -m "feat(storefront): expose web app mode, classic-bot switch, webapp layout"
```
