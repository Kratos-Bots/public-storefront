# Payment Method List and Per-Gateway Return Address Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The storefront offers any number of payment methods in an order and under names the admin sets, and each processor gateway can be told not to receive the shop's address.

**Architecture:** One `storefront_settings` key holds an ordered list of `{ method, enabled, label }`; `listStorefrontPaymentMethods` builds the customer's offer from it instead of the two slots, so checkout quotes and the order page follow automatically. A single `resolveReturnUrls` replaces the two duplicated return-URL blocks in `orders/service.ts` and reads two new per-gateway config fields. The admin app replaces its two dropdowns with a drag-to-reorder list; the storefront stops translating slots into "Card"/"Crypto" and shows the backend's names.

**Tech Stack:** Backend: Express 5, Drizzle/Postgres, zod, vitest (PGlite for integration, installed `--no-save`). Admin: React 19, Vite, TanStack Query, ky, i18next (five locales), Tailwind v4. Storefront: React 19, Vite, Mantine, TanStack Query, vitest, Playwright.

**Spec:** `ecommerce-storefront/docs/superpowers/specs/2026-10-04-payment-method-list-design.md`

## Global Constraints

- Three repos, three branches all named `feature/payment-method-list`: `ecommerce-backend` (create from `main`), `ecommerce-admin-frontend` (create from `main`), `ecommerce-storefront` (exists; holds this plan and the spec). Run commands from inside the repo a task names.
- **Backend:** the local `.env` points at a LIVE database and Redis. Never start the server, never run anything that connects to them, no `db:push`, no Docker. Tests only. Extensionless imports. router / controller / service / schemas structure. Throw `AppError` subclasses. No migration in this plan. `npx tsc --noEmit` does not type-check `*.test.ts`: run the tests.
- **Admin:** `@/` imports with `.ts`/`.tsx` extensions. Every string through `t()` with a namespace-qualified key; `useTranslation(['ns'])` array form; all five locale files (`en`, `it`, `es`, `fr`, `zh-CN`) updated together; `npm run i18n:check` must pass. Reuse `src/components/ui/` primitives. `npm run lint` already fails on `main`: count errors before and after, the count must not rise. No test runner: verification is `npm run build` plus a mocked Playwright browser pass.
- **Storefront:** `@/` imports with `.ts`/`.tsx` extensions. All customer-facing wording through editable-text keys with a `max` and a note; no orphan keys. Never edit `web/test/helpers/text-inventory.json`. Never regenerate `web/test/__golden__` or `e2e/__baseline__` to make a change pass (they may show as modified from line endings only; never stage them). Working tree CRLF, index LF: check `git diff --numstat` for whole-file rewrites. Synthetic data only: the repo is public.
- Method names are gateway `name`s from `GATEWAY_REGISTRY`. The literal methods `cash`, `bank_transfer`, `manual`, `store_credit` are never list entries.
- A label is 1 to 40 characters after trimming, or `null`.
- Gateway config values are strings: a boolean config field is stored as `'true'` or `'false'`.
- Return-URL requirements, verified against processor documentation on 2026-10-04: **Stripe** requires `success_url` in hosted mode (`cancel_url` optional); **PayPal** is treated as requiring `return_url` and `cancel_url` (documentation does not confirm they may be omitted); **Revolut**, **OxaPay**, **NexaPay**, **Whop**, **Peer Pay** document theirs as optional.
- Every commit ends with these two trailer lines:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01HAtBukqatpqJEquLeqLcz5`
- No push, merge, tag or version bump: those happen on the owner's say-so, backend first, then admin, then storefront.

## Review Focus

1. **A saved list naming a gateway that was later disabled, or that fails the country or minimum-order check.** The customer is simply not offered it; no error, and the rest of the list keeps its order. Tested in Task 1.
2. **A shop that never opens the new admin card.** It offers exactly what it offered before deploy (card slot, crypto slot, bank gateways), including the bot-slot fallback. Tested in Task 1.
3. **An order paid with a method that is hidden or removed from the list afterwards.** Its order page and account page still name the payment (list label if an entry exists, otherwise the gateway's own name) and never show a blank or a raw id. Tested in Task 3.
4. **Stripe or PayPal with the switch on and no neutral address.** The save is refused in the admin API; if such a config exists anyway (hand-edited), session creation sends the shop's address rather than failing the customer's checkout. Tested in Task 4.
5. **A label that is only spaces, 41 characters, or contains emoji.** Spaces become `null`, 41 is refused, emoji count as written characters and are accepted. Tested in Task 2.

---

### Task 1: Backend, the list and the storefront offer

**Repo:** `ecommerce-backend`. Create the branch first: `git checkout -b feature/payment-method-list main`.

**Files:**
- Create: `src/modules/storefront-settings/payment-method-list.ts`
- Create: `src/modules/storefront-settings/payment-method-list.test.ts`
- Modify: `src/modules/storefront-settings/service.ts` (add the key to `KEYS`; export `getStorefrontPaymentMethodList`)
- Modify: `src/modules/public-storefront/checkout.ts` (`listStorefrontPaymentMethods`, the `slot` types, remove `SLOT_RANK` and `MANUAL_BANK_GATEWAYS`)
- Test: the existing tests of `listStorefrontPaymentMethods` (find with `grep -rn "listStorefrontPaymentMethods" src --include=*.test.ts`)

**Interfaces:**
- Produces, in `payment-method-list.ts`:
  ```ts
  export interface PaymentMethodEntry { method: string; enabled: boolean; label: string | null }
  export const MANUAL_BANK_GATEWAYS: readonly string[];            // moved here from checkout.ts
  export const paymentMethodEntrySchema: z.ZodType<PaymentMethodEntry>;
  export function parseStoredList(raw: string | null): PaymentMethodEntry[] | null;
  export function deriveStartingList(slots: { card: string | null; crypto: string | null }, enabledManual: string[]): PaymentMethodEntry[];
  export function legacySlot(m: { type: 'offline' | 'gateway' | 'crypto'; cryptoOptions?: unknown[] }): 'card' | 'crypto' | 'manual';
  export function applyList<M extends { method: string; displayName: string }>(list: PaymentMethodEntry[], available: M[]): (M & { displayName: string })[];
  ```
- Produces, in `service.ts`: `export async function getStorefrontPaymentMethodList(): Promise<PaymentMethodEntry[]>` (the saved list, or the derived starting list when the key is absent).
- `listStorefrontPaymentMethods(country, orderTotal, groupId)` keeps its signature and return type; `StorefrontPaymentMethod.slot` stays, now derived by `legacySlot`.

- [ ] **Step 1: Write the failing unit tests**

`src/modules/storefront-settings/payment-method-list.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyList, deriveStartingList, legacySlot, parseStoredList } from './payment-method-list';

const avail = (method: string, displayName = method) => ({ method, displayName, type: 'gateway' as const });

describe('parseStoredList', () => {
  it('is null when nothing is stored, so the caller derives the starting list', () => {
    expect(parseStoredList(null)).toBeNull();
    expect(parseStoredList('')).toBeNull();
  });
  it('is null for JSON that is not a list of entries', () => {
    expect(parseStoredList('{"a":1}')).toBeNull();
    expect(parseStoredList('not json')).toBeNull();
  });
  it('returns the entries in stored order, dropping names no longer in the registry', () => {
    const raw = JSON.stringify([
      { method: 'crypto', enabled: true, label: null },
      { method: 'gone_gateway', enabled: true, label: null },
      { method: 'stripe', enabled: false, label: 'Card' },
    ]);
    expect(parseStoredList(raw)).toEqual([
      { method: 'crypto', enabled: true, label: null },
      { method: 'stripe', enabled: false, label: 'Card' },
    ]);
  });
  it('an empty stored list stays an empty list (the admin removed everything)', () => {
    expect(parseStoredList('[]')).toEqual([]);
  });
});

describe('deriveStartingList', () => {
  it('is card, crypto, then the enabled bank gateways, all shown and unnamed', () => {
    expect(deriveStartingList({ card: 'stripe', crypto: 'crypto' }, ['uk_bank_transfer', 'sepa_transfer'])).toEqual([
      { method: 'stripe', enabled: true, label: null },
      { method: 'crypto', enabled: true, label: null },
      { method: 'uk_bank_transfer', enabled: true, label: null },
      { method: 'sepa_transfer', enabled: true, label: null },
    ]);
  });
  it('skips an unset slot and never lists one gateway twice', () => {
    expect(deriveStartingList({ card: null, crypto: 'oxapay' }, [])).toEqual([{ method: 'oxapay', enabled: true, label: null }]);
    expect(deriveStartingList({ card: 'oxapay', crypto: 'oxapay' }, [])).toHaveLength(1);
  });
});

describe('applyList', () => {
  const list = [
    { method: 'crypto', enabled: true, label: 'Pay with crypto' },
    { method: 'stripe', enabled: true, label: null },
    { method: 'paypal', enabled: false, label: 'PayPal' },
    { method: 'revolut', enabled: true, label: null },
  ];
  it('keeps list order, uses the label, and drops hidden entries', () => {
    const out = applyList(list, [avail('stripe', 'Stripe'), avail('paypal', 'PayPal'), avail('crypto', 'Crypto')]);
    expect(out.map((m) => [m.method, m.displayName])).toEqual([['crypto', 'Pay with crypto'], ['stripe', 'Stripe']]);
  });
  it('an entry whose gateway is not available (disabled, wrong country, below minimum) is skipped without disturbing the rest', () => {
    const out = applyList(list, [avail('revolut', 'Revolut'), avail('crypto', 'Crypto')]);
    expect(out.map((m) => m.method)).toEqual(['crypto', 'revolut']);
  });
  it('an available gateway that is not in the list is not offered', () => {
    expect(applyList(list, [avail('whop', 'Whop')])).toEqual([]);
  });
});

describe('legacySlot', () => {
  it('maps kinds onto the three slots older storefronts know', () => {
    expect(legacySlot({ type: 'offline' })).toBe('manual');
    expect(legacySlot({ type: 'crypto', cryptoOptions: [{}] })).toBe('crypto');
    expect(legacySlot({ type: 'gateway' })).toBe('card');
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/modules/storefront-settings/payment-method-list.test.ts`
Expected: FAIL, cannot find module `./payment-method-list`.

- [ ] **Step 3: Write `payment-method-list.ts`**

```ts
import { z } from 'zod';
import { GATEWAY_MAP } from '../payment-gateways/registry';

/** One row of the storefront's payment method list, in display order. */
export interface PaymentMethodEntry {
  method: string;
  enabled: boolean;
  /** Customer-facing name; null = the gateway's own display name. */
  label: string | null;
}

/** Region-restricted, processor-less bank-transfer gateways. */
export const MANUAL_BANK_GATEWAYS: readonly string[] = ['uk_bank_transfer', 'sepa_transfer', 'ach_wire'];

export const PAYMENT_METHOD_LABEL_MAX = 40;

const labelSchema = z
  .string()
  .nullable()
  .optional()
  .transform((v) => {
    const trimmed = v?.trim() ?? '';
    return trimmed === '' ? null : trimmed;
  })
  .refine((v) => v === null || [...v].length <= PAYMENT_METHOD_LABEL_MAX, {
    message: `Name must be at most ${PAYMENT_METHOD_LABEL_MAX} characters`,
  });

export const paymentMethodEntrySchema = z.object({
  method: z.string().min(1).max(50),
  enabled: z.boolean(),
  label: labelSchema,
});

/** The saved list, or null when none is stored (or what is stored is not a list). Entries naming a
 *  gateway that has left the registry are dropped, so a removed gateway can never be offered. */
export function parseStoredList(raw: string | null): PaymentMethodEntry[] | null {
  if (!raw) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  const result = z.array(paymentMethodEntrySchema).safeParse(parsed);
  if (!result.success) return null;
  return result.data.filter((e) => GATEWAY_MAP.has(e.method));
}

/** What a shop offered before the list existed: its card slot, its crypto slot, then its bank gateways. */
export function deriveStartingList(
  slots: { card: string | null; crypto: string | null },
  enabledManual: string[],
): PaymentMethodEntry[] {
  const names = [slots.card, slots.crypto, ...enabledManual].filter((n): n is string => Boolean(n));
  return [...new Set(names)].map((method) => ({ method, enabled: true, label: null }));
}

/** The `slot` older storefront builds read: they name 'card' and 'crypto' themselves and treat 'manual' as a bank transfer. */
export function legacySlot(m: { type: 'offline' | 'gateway' | 'crypto'; cryptoOptions?: unknown[] }): 'card' | 'crypto' | 'manual' {
  if (m.type === 'offline') return 'manual';
  if (m.cryptoOptions && m.cryptoOptions.length > 0) return 'crypto';
  return 'card';
}

/** The offer: shown entries, in list order, that are available right now, each under its list name. */
export function applyList<M extends { method: string; displayName: string }>(
  list: PaymentMethodEntry[],
  available: M[],
): (M & { displayName: string })[] {
  const byName = new Map(available.map((m) => [m.method, m]));
  return list.flatMap((entry) => {
    const m = byName.get(entry.method);
    if (!entry.enabled || !m) return [];
    return [{ ...m, displayName: entry.label ?? m.displayName }];
  });
}
```

If `GATEWAY_MAP` is not exported under that name from `registry.ts`, use the export that `payment-methods/service.ts` imports (it imports `GATEWAY_MAP`).

- [ ] **Step 4: Run the unit tests**

Run: `npx vitest run src/modules/storefront-settings/payment-method-list.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Add the setting and its reader in `storefront-settings/service.ts`**

Add to `KEYS` (beside `paymentSlotCrypto`): `paymentMethods: 'storefront_payment_methods',`. Add it to whatever list `settingsReadKeys()` returns if that list is explicit.

Add, below `getStorefrontPaymentSlots`:

```ts
/** The storefront's payment method list: the saved one, or, until an admin saves one, what the shop
 *  offered under the two-slot model (card slot, crypto slot, enabled bank gateways in id order). */
export async function getStorefrontPaymentMethodList(): Promise<PaymentMethodEntry[]> {
  const stored = parseStoredList(await getStorefrontSetting(KEYS.paymentMethods));
  if (stored) return stored;
  const [slots, manual] = await Promise.all([
    getStorefrontPaymentSlots(),
    db
      .select({ name: paymentGateways.name })
      .from(paymentGateways)
      .where(and(eq(paymentGateways.enabled, true), inArray(paymentGateways.name, [...MANUAL_BANK_GATEWAYS])))
      .orderBy(asc(paymentGateways.id)),
  ]);
  return deriveStartingList(slots, manual.map((g) => g.name));
}
```

Import `parseStoredList`, `deriveStartingList`, `MANUAL_BANK_GATEWAYS`, `type PaymentMethodEntry` from `./payment-method-list`; `paymentGateways` from `../../db/schema/payment-gateways`; `and`, `asc`, `eq`, `inArray` from `drizzle-orm`; `db` from `../../db/client` (reuse imports the file already has).

- [ ] **Step 6: Write the failing test for the offer**

In the existing test file for `listStorefrontPaymentMethods` (or a new `src/modules/public-storefront/payment-method-offer.test.ts` mocking `getStorefrontPaymentMethodList` and `getAvailablePaymentMethods` in the style that file's neighbours mock them), add:

```ts
it('offers the list in its order under its names, with the fee label following the name', async () => {
  mockList([
    { method: 'crypto', enabled: true, label: 'Pay with crypto' },
    { method: 'stripe', enabled: true, label: 'Card' },
    { method: 'paypal', enabled: false, label: null },
  ]);
  mockAvailable([
    gateway('stripe', 'Stripe', { feeType: 'percent', feeValue: 2 }),
    gateway('paypal', 'PayPal'),
    cryptoGateway('crypto', 'Crypto', { feeType: 'percent', feeValue: -3 }),
  ]);
  const out = await listStorefrontPaymentMethods('GB', 100, null);
  expect(out.map((m) => [m.method, m.displayName, m.slot])).toEqual([
    ['crypto', 'Pay with crypto', 'crypto'],
    ['stripe', 'Card', 'card'],
  ]);
  expect(out[0].feeLabel).toBe('Pay with crypto discount');
  expect(out[0].cryptoOptions?.every((o) => o.feeLabel === 'Pay with crypto discount')).toBe(true);
  expect(out[1].feeLabel).toBe('Card fee');
  expect(out[1].chargeTotal).toBe(102);
});

it('a method with no fee keeps an empty fee label under a custom name', async () => {
  mockList([{ method: 'paypal', enabled: true, label: 'PayPal balance' }]);
  mockAvailable([gateway('paypal', 'PayPal')]);
  const [m] = await listStorefrontPaymentMethods('GB', 100, null);
  expect(m.feeLabel).toBe('');
});

it('a shop that never saved a list offers its two slots then its bank gateways', async () => {
  mockList([
    { method: 'stripe', enabled: true, label: null },
    { method: 'crypto', enabled: true, label: null },
    { method: 'uk_bank_transfer', enabled: true, label: null },
  ]);
  mockAvailable([offline('uk_bank_transfer', 'UK Bank Transfer'), cryptoGateway('crypto', 'Crypto'), gateway('stripe', 'Stripe')]);
  const out = await listStorefrontPaymentMethods('GB', 100, null);
  expect(out.map((m) => [m.method, m.slot])).toEqual([['stripe', 'card'], ['crypto', 'crypto'], ['uk_bank_transfer', 'manual']]);
});
```

Write the small `mockList`, `mockAvailable`, `gateway`, `cryptoGateway`, `offline` helpers in the test file: `gateway(name, displayName, fee?)` returns an `AvailablePaymentMethod` with `type: 'gateway'`, `details: null`, the fee fields, `feeRateText` and `feeLabel: describeFee(fee, displayName)` (import the real `describeFee` and `formatFeeRate` from `../payment-gateways/fees`); `cryptoGateway` adds `type: 'crypto'` and one `cryptoOptions` entry (`coin: 'BTC', network: 'bitcoin'`) carrying the same fee fields.

- [ ] **Step 7: Run it and see it fail**

Run: `npx vitest run src/modules/public-storefront`
Expected: the three new tests FAIL (order is still slot-ranked; names are the gateway's).

- [ ] **Step 8: Rewire `listStorefrontPaymentMethods`**

In `src/modules/public-storefront/checkout.ts`: delete `MANUAL_BANK_GATEWAYS` and `SLOT_RANK` (import `MANUAL_BANK_GATEWAYS` from the new module only if another function in this file still uses it); keep `export type StorefrontPaymentSlot = 'card' | 'crypto' | 'manual';`; change the doc comment on `StorefrontPaymentMethod.slot` to: `/** For storefront builds released before the payment method list: 'manual' for a bank transfer, 'crypto' for a method with coin choices, otherwise 'card'. Current builds do not read it. */`. Replace the function body:

```ts
export async function listStorefrontPaymentMethods(
  country: string | undefined,
  orderTotal: number,
  groupId: number | null = null,
): Promise<StorefrontPaymentMethod[]> {
  const [list, all] = await Promise.all([
    getStorefrontPaymentMethodList(),
    getAvailablePaymentMethods({ country, orderTotal, excludeOffline: true, groupId }),
  ]);

  return applyList(list, all).map((m) => {
    // The fee line is named after what the customer chose, so it follows the list name.
    const feeLabel = describeFee(m, m.displayName);
    const cryptoOptions = m.cryptoOptions?.map((o) => ({
      ...o,
      feeLabel: describeFee(o, m.displayName),
      ...quoteFee(o, orderTotal),
    }));
    return { ...m, feeLabel, slot: legacySlot(m), ...quoteFee(m, orderTotal), cryptoOptions } as StorefrontPaymentMethod;
  });
}
```

Replace the function's doc comment's first paragraph with: `The payment methods the storefront offers: the admin's list (storefront_payment_methods), in its order and under its names, limited to what is available for this country, total and customer group.` Import `describeFee` from `../payment-gateways/fees`, `applyList` and `legacySlot` from `../storefront-settings/payment-method-list`, `getStorefrontPaymentMethodList` from `../storefront-settings/service`. Remove the now-unused `getStorefrontPaymentSlots` import from this file if nothing else uses it.

- [ ] **Step 9: Run the module's tests, then everything**

Run: `npx vitest run src/modules/public-storefront src/modules/storefront-settings src/modules/public-orders`
Expected: PASS. Existing tests that mocked `getStorefrontPaymentSlots` for this function now need `getStorefrontPaymentMethodList` mocked instead: update those mocks to return the equivalent starting list, keeping each test's assertions.

Run: `npm test` and `npx tsc --noEmit`
Expected: all green, no type errors.

- [ ] **Step 10: Commit**

```bash
git add src/modules/storefront-settings/payment-method-list.ts src/modules/storefront-settings/payment-method-list.test.ts src/modules/storefront-settings/service.ts src/modules/public-storefront/checkout.ts
git add <each test file you changed, by name>
git commit -m "feat(storefront): the storefront offers an ordered, named list of payment methods"
```

---

### Task 2: Backend, the admin API for the list

**Repo:** `ecommerce-backend`.

**Files:**
- Modify: `src/modules/storefront-settings/schemas.ts` (`updateStorefrontSettingsSchema`)
- Modify: `src/modules/storefront-settings/service.ts` (`StorefrontSettings`, `getStorefrontSettings`, `updateStorefrontSettings`)
- Create: `src/modules/storefront-settings/payment-method-admin.ts` (the admin view and save validation)
- Create: `src/modules/storefront-settings/payment-method-admin.test.ts`
- Modify: `src/docs/registry.ts` (storefront-settings GET/PUT entries, near the existing `paymentSlotCard` lines), `STOREFRONT.md` (the payment methods section and the settings table rows naming the two slots)

**Interfaces:**
- Consumes: `PaymentMethodEntry`, `paymentMethodEntrySchema`, `getStorefrontPaymentMethodList` (Task 1).
- Produces:
  ```ts
  export interface PaymentMethodAdminRow extends PaymentMethodEntry {
    displayName: string;                       // the gateway's own name
    type: 'gateway' | 'crypto' | 'offline';
    gatewayEnabled: boolean;
  }
  export interface PaymentMethodChoice { method: string; displayName: string; type: 'gateway' | 'crypto' | 'offline' }
  export function isListable(method: string): boolean;
  export function assertValidList(entries: PaymentMethodEntry[]): void;       // throws ValidationError
  export async function buildPaymentMethodAdminView(list: PaymentMethodEntry[]): Promise<{ paymentMethods: PaymentMethodAdminRow[]; paymentMethodChoices: PaymentMethodChoice[] }>;
  ```
- `GET /api/v1/storefront-settings` response gains `paymentMethods: PaymentMethodAdminRow[]` and `paymentMethodChoices: PaymentMethodChoice[]`.
- `PUT /api/v1/storefront-settings` body gains `paymentMethods?: { method: string; enabled: boolean; label?: string | null }[]` (max 30 entries), replacing the whole list.

- [ ] **Step 1: Write the failing tests**

`src/modules/storefront-settings/payment-method-admin.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../utils/errors';
import { paymentMethodEntrySchema } from './payment-method-list';
import { assertValidList, isListable } from './payment-method-admin';

const entry = (method: string, label: string | null = null, enabled = true) => ({ method, enabled, label });

describe('isListable', () => {
  it('accepts processor, crypto and manual gateways', () => {
    for (const name of ['stripe', 'crypto', 'uk_bank_transfer', 'monzo']) expect(isListable(name)).toBe(true);
  });
  it('refuses a gateway with no processor, an unknown name and the literal methods', () => {
    for (const name of ['sumup', 'nope', 'cash', 'bank_transfer', 'manual', 'store_credit']) expect(isListable(name)).toBe(false);
  });
});

describe('assertValidList', () => {
  it('accepts an ordinary list, an empty list and a hidden entry', () => {
    expect(() => assertValidList([entry('stripe', 'Card'), entry('crypto'), entry('paypal', null, false)])).not.toThrow();
    expect(() => assertValidList([])).not.toThrow();
  });
  it('names the entry that cannot be listed', () => {
    expect(() => assertValidList([entry('stripe'), entry('sumup')])).toThrow(ValidationError);
    expect(() => assertValidList([entry('stripe'), entry('sumup')])).toThrow(/sumup/);
  });
  it('refuses the same method twice, naming it', () => {
    expect(() => assertValidList([entry('stripe'), entry('stripe', 'Card again')])).toThrow(/stripe/);
  });
});

describe('label rules (the entry schema)', () => {
  const parse = (label: unknown) => paymentMethodEntrySchema.safeParse({ method: 'stripe', enabled: true, label });
  it('spaces only, empty and missing become null', () => {
    for (const v of ['   ', '', null, undefined]) {
      const r = parse(v);
      expect(r.success && r.data.label).toBe(null);
    }
  });
  it('is trimmed', () => {
    const r = parse('  Card  ');
    expect(r.success && r.data.label).toBe('Card');
  });
  it('40 written characters pass, 41 fail, and emoji count as one each', () => {
    expect(parse('a'.repeat(40)).success).toBe(true);
    expect(parse('a'.repeat(41)).success).toBe(false);
    expect(parse('💳'.repeat(40)).success).toBe(true);
    expect(parse('💳'.repeat(41)).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run src/modules/storefront-settings/payment-method-admin.test.ts`
Expected: FAIL, cannot find `./payment-method-admin`. (The label tests may already pass against Task 1's schema; that is fine.)

- [ ] **Step 3: Write `payment-method-admin.ts`**

```ts
import { asc } from 'drizzle-orm';
import { db } from '../../db/client';
import { paymentGateways } from '../../db/schema/payment-gateways';
import { GATEWAY_MAP } from '../payment-gateways/registry';
import { getProcessor } from '../payment-gateways/processors';
import { ValidationError } from '../../utils/errors';
import type { PaymentMethodEntry } from './payment-method-list';

type Kind = 'gateway' | 'crypto' | 'offline';

export interface PaymentMethodAdminRow extends PaymentMethodEntry {
  /** The gateway's own name, shown as the placeholder for an unnamed entry. */
  displayName: string;
  type: Kind;
  gatewayEnabled: boolean;
}

export interface PaymentMethodChoice { method: string; displayName: string; type: Kind }

function kindOf(method: string): Kind {
  const def = GATEWAY_MAP.get(method);
  if (def?.manual) return 'offline';
  if (def?.crypto) return 'crypto';
  return 'gateway';
}

/** A gateway the storefront can actually take a payment through: in the registry, and either
 *  manual, static-crypto, or backed by a processor (a registry entry without one fails at checkout). */
export function isListable(method: string): boolean {
  const def = GATEWAY_MAP.get(method);
  if (!def) return false;
  return Boolean(def.manual || def.crypto || getProcessor(method));
}

export function assertValidList(entries: PaymentMethodEntry[]): void {
  const seen = new Set<string>();
  for (const e of entries) {
    if (!isListable(e.method)) throw new ValidationError(`'${e.method}' cannot be offered on the storefront`);
    if (seen.has(e.method)) throw new ValidationError(`'${e.method}' is listed more than once`);
    seen.add(e.method);
  }
}

/** The list as the admin edits it, plus the enabled gateways that could be added to it. */
export async function buildPaymentMethodAdminView(list: PaymentMethodEntry[]): Promise<{
  paymentMethods: PaymentMethodAdminRow[];
  paymentMethodChoices: PaymentMethodChoice[];
}> {
  const rows = await db
    .select({ name: paymentGateways.name, displayName: paymentGateways.displayName, enabled: paymentGateways.enabled })
    .from(paymentGateways)
    .orderBy(asc(paymentGateways.id));
  const byName = new Map(rows.map((g) => [g.name, g]));
  const listed = new Set(list.map((e) => e.method));

  const paymentMethods = list.map((e) => ({
    ...e,
    displayName: byName.get(e.method)?.displayName ?? GATEWAY_MAP.get(e.method)?.displayName ?? e.method,
    type: kindOf(e.method),
    gatewayEnabled: byName.get(e.method)?.enabled ?? false,
  }));
  const paymentMethodChoices = rows
    .filter((g) => g.enabled && !listed.has(g.name) && isListable(g.name))
    .map((g) => ({ method: g.name, displayName: g.displayName, type: kindOf(g.name) }));
  return { paymentMethods, paymentMethodChoices };
}
```

Check the import path of `getProcessor`: it is exported from `src/modules/payment-gateways/processors/index.ts` (`orders/service.ts` imports it; copy that import's path relative to this file).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/modules/storefront-settings/payment-method-admin.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into the settings read and write**

`schemas.ts`, inside `updateStorefrontSettingsSchema` after `paymentSlotCrypto`:

```ts
  /** The whole payment method list, in display order; replaces the stored list. */
  paymentMethods: z.array(paymentMethodEntrySchema).max(30).optional(),
```

(import `paymentMethodEntrySchema` from `./payment-method-list`).

`service.ts`:
- `StorefrontSettings` gains `paymentMethods: PaymentMethodAdminRow[];` and `paymentMethodChoices: PaymentMethodChoice[];`.
- In `getStorefrontSettings`, before the `return`, add `const paymentView = await buildPaymentMethodAdminView(await getStorefrontPaymentMethodList());` and spread `...paymentView` into the returned object after `paymentSlotCrypto`.
- In `updateStorefrontSettings`, BEFORE the first write (beside the Bird key validation, which carries the comment "Validate ... BEFORE anything is written"), add `if (input.paymentMethods !== undefined) assertValidList(input.paymentMethods);`. Among the writes, after the `paymentSlotCrypto` block, add:

```ts
  if (input.paymentMethods !== undefined) {
    await upsertStorefrontSetting(KEYS.paymentMethods, JSON.stringify(input.paymentMethods));
  }
```

If `getPublicStorefrontSettings` (the anonymous settings the storefront reads) is built from `getStorefrontSettings`, do NOT build the admin payment view inside `getStorefrontSettings`: build it only in the admin GET path (the controller/service function behind `GET /storefront-settings`), so an anonymous settings fetch pays no extra gateway query. Either way make sure `paymentMethods` and `paymentMethodChoices` are NOT included in the public response: check its projection and add a test asserting the public settings have neither key.

- [ ] **Step 6: Add an integration test of save then read**

In the storefront-settings service tests (find the file that tests `updateStorefrontSettings`; follow its mocking of `upsertStorefrontSetting` / `getStorefrontSetting`), add:

```ts
it('saving the payment method list stores it and it comes back in the same order with labels trimmed', async () => {
  await updateStorefrontSettings(
    updateStorefrontSettingsSchema.parse({
      paymentMethods: [
        { method: 'crypto', enabled: true, label: '  Pay with crypto ' },
        { method: 'stripe', enabled: false, label: '' },
      ],
    }),
  );
  expect(storedValue('storefront_payment_methods')).toBe(
    JSON.stringify([
      { method: 'crypto', enabled: true, label: 'Pay with crypto' },
      { method: 'stripe', enabled: false, label: null },
    ]),
  );
});

it('a list naming an unlistable gateway is refused before anything is written', async () => {
  await expect(
    updateStorefrontSettings(updateStorefrontSettingsSchema.parse({ enabled: true, paymentMethods: [{ method: 'sumup', enabled: true }] })),
  ).rejects.toThrow(/sumup/);
  expect(writes()).toEqual([]);
});
```

Use the file's existing helpers for reading what was written; if it has none, add `storedValue(key)` and `writes()` over the mocked `upsertStorefrontSetting` calls.

- [ ] **Step 7: Docs**

`src/docs/registry.ts`: in the storefront-settings response and request schemas (beside `paymentSlotCard`, near lines 1937 and 1961), add `paymentMethods` and `paymentMethodChoices` (response) and `paymentMethods` (request) with the shapes above; mark `paymentSlotCard` / `paymentSlotCrypto` descriptions as "Used only until a payment method list is saved".

`STOREFRONT.md`: in the payment methods part of the checkout quote section (around lines 647-672) replace the slot explanation with: methods come from the admin's list, in its order, under its names; `slot` remains for older builds (`manual` for a bank transfer, `crypto` for a method with coin choices, otherwise `card`). Fix the example's `"feeType": "percentage"` to `"percent"`. In the settings tables (around 1387 and 1570) add the `paymentMethods` rows and the note on the two slot fields.

- [ ] **Step 8: Run everything**

Run: `npx vitest run src/modules/storefront-settings src/modules/public-storefront`, then `npm test`, then `npx tsc --noEmit`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add src/modules/storefront-settings/payment-method-admin.ts src/modules/storefront-settings/payment-method-admin.test.ts src/modules/storefront-settings/schemas.ts src/modules/storefront-settings/service.ts src/docs/registry.ts STOREFRONT.md
git add <each test file you changed, by name>
git commit -m "feat(storefront-settings): read and save the payment method list"
```

---

### Task 3: Backend, names on existing orders and only offered methods on the order page

**Repo:** `ecommerce-backend`.

**Files:**
- Create: `src/modules/storefront-settings/payment-method-names.ts`
- Create: `src/modules/storefront-settings/payment-method-names.test.ts`
- Modify: `src/modules/public-orders/service.ts` (the fee label around lines 178-185; `selectPublicPaymentMethod` around 319-387)
- Modify: `src/modules/public-storefront/account.ts` (the payments projection of `getStorefrontOrderDetail`)
- Modify: `STOREFRONT.md`, `src/docs/registry.ts` (`methodLabel`; the stricter rule)
- Test: the existing public-orders and account tests

**Interfaces:**
- Consumes: `getStorefrontPaymentMethodList` (Task 1), `listStorefrontPaymentMethods` (Task 1).
- Produces:
  ```ts
  /** method id -> customer-facing name, for every gateway: the list label if the list has an entry with one, else the gateway's displayName. */
  export async function loadPaymentMethodNames(): Promise<(method: string) => string>;
  export function humaniseMethod(method: string): string;   // 'bank_transfer' -> 'Bank transfer'
  ```
- The account order detail's payments each gain `methodLabel: string`.
- `selectPublicPaymentMethod` refuses a method not in `listStorefrontPaymentMethods(order country, pre-fee total, order customer's group)`.

- [ ] **Step 1: Write the failing tests for the names**

`src/modules/storefront-settings/payment-method-names.test.ts` (mock `./service`'s `getStorefrontPaymentMethodList` and the gateway rows query in the file's neighbours' style; if a pure core is easier to test, export `buildNameResolver(list, gatewayRows)` and test that):

```ts
import { describe, expect, it } from 'vitest';
import { buildNameResolver, humaniseMethod } from './payment-method-names';

const gateways = [
  { name: 'stripe', displayName: 'Stripe' },
  { name: 'crypto', displayName: 'Crypto' },
  { name: 'paypal', displayName: 'PayPal' },
];

describe('buildNameResolver', () => {
  const name = buildNameResolver(
    [
      { method: 'stripe', enabled: true, label: 'Card' },
      { method: 'crypto', enabled: false, label: 'Pay with crypto' },
      { method: 'paypal', enabled: true, label: null },
    ],
    gateways,
  );
  it('uses the list label, even for a hidden entry (an old order still names its payment)', () => {
    expect(name('stripe')).toBe('Card');
    expect(name('crypto')).toBe('Pay with crypto');
  });
  it('falls back to the gateway name for an unnamed entry or a gateway not in the list', () => {
    expect(name('paypal')).toBe('PayPal');
    expect(buildNameResolver([], gateways)('stripe')).toBe('Stripe');
  });
  it('never returns a blank or a raw id: literal and unknown methods are humanised', () => {
    expect(name('store_credit')).toBe('Store credit');
    expect(name('bank_transfer')).toBe('Bank transfer');
    expect(name('something_new')).toBe('Something new');
  });
});

describe('humaniseMethod', () => {
  it('turns an id into words', () => {
    expect(humaniseMethod('uk_bank_transfer')).toBe('Uk bank transfer');
    expect(humaniseMethod('cash')).toBe('Cash');
  });
});
```

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run src/modules/storefront-settings/payment-method-names.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `payment-method-names.ts`**

```ts
import { db } from '../../db/client';
import { paymentGateways } from '../../db/schema/payment-gateways';
import type { PaymentMethodEntry } from './payment-method-list';
import { getStorefrontPaymentMethodList } from './service';

export function humaniseMethod(method: string): string {
  const words = method.replace(/_/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : method;
}

/** Names a payment's method for a customer: the storefront list's label when it has one (shown or
 *  hidden, so an order paid before the method was hidden still reads the same), else the gateway's
 *  own name, else the id as words. Never blank. */
export function buildNameResolver(
  list: PaymentMethodEntry[],
  gateways: { name: string; displayName: string }[],
): (method: string) => string {
  const labels = new Map(list.filter((e) => e.label).map((e) => [e.method, e.label as string]));
  const names = new Map(gateways.map((g) => [g.name, g.displayName]));
  return (method) => labels.get(method) ?? names.get(method) ?? humaniseMethod(method);
}

export async function loadPaymentMethodNames(): Promise<(method: string) => string> {
  const [list, gateways] = await Promise.all([
    getStorefrontPaymentMethodList(),
    db.select({ name: paymentGateways.name, displayName: paymentGateways.displayName }).from(paymentGateways),
  ]);
  return buildNameResolver(list, gateways);
}
```

If importing `./service` here creates an import cycle (`service.ts` must not import this file), keep it this way round: `service.ts` never imports `payment-method-names`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/modules/storefront-settings/payment-method-names.test.ts`
Expected: PASS.

- [ ] **Step 5: Use the names on the public order view**

In `src/modules/public-orders/service.ts`, the payment fee label (around lines 178-185) is built from the registry `displayName` of the paying gateway. Load `const nameOf = await loadPaymentMethodNames();` once in that function and pass `nameOf(method)` where the gateway's display name is passed to the fee-label builder. If the function already reads gateway rows for this, keep that read and only change the name passed. Add to the existing public-order tests:

```ts
it('names the payment fee by the storefront list name', async () => {
  // order with a completed/pending stripe payment carrying a fee; list labels stripe "Card"
  const view = await getPublicOrder(reference, accessKey);
  expect(view.totals.paymentFeeLabel).toBe('Card fee');
});
```

using that file's existing fixtures and the exact field the view already exposes for the fee label (read the view's shape; do not add a field). If the view also exposes a display name for the active payment's method, pass `nameOf(method)` there too and assert it in the same test; if it exposes only the method id and kind, leave it.

- [ ] **Step 6: Add `methodLabel` to the account order detail**

In `src/modules/public-storefront/account.ts`, where `getStorefrontOrderDetail` maps payments, load `nameOf` once and add `methodLabel: nameOf(p.method)` to each payment. Add a test beside the existing detail tests:

```ts
it('each payment carries a customer-facing name, including for a method since removed from the list', async () => {
  // order with a 'stripe' payment and a 'store_credit' payment; list is empty
  const detail = await getStorefrontOrderDetail(customerId, reference);
  expect(detail.payments.map((p) => p.methodLabel)).toEqual(['Stripe', 'Store credit']);
});
```

(adapt the fixture construction to the file's helpers; the assertion is the point).

- [ ] **Step 7: Write the failing test for the stricter order page**

In the public-orders tests for `selectPublicPaymentMethod`:

```ts
it('refuses an enabled gateway the storefront does not offer', async () => {
  // gateways stripe and paypal both enabled; the list offers only stripe
  await expect(selectPublicPaymentMethod(reference, accessKey, { method: 'paypal' })).rejects.toThrow(/not available/i);
});

it('accepts a method the list offers', async () => {
  const result = await selectPublicPaymentMethod(reference, accessKey, { method: 'stripe' });
  expect(result.method).toBe('stripe');
});
```

Run: `npx vitest run src/modules/public-orders` and see the first FAIL.

- [ ] **Step 8: Enforce it**

In `selectPublicPaymentMethod`, after the existing refusals of `store_credit`, the offline literals and manual gateways (around lines 329-336), and using the same country, pre-fee total and group that `getPublicOrderPaymentOptions` computes for this order (extract a small local helper `offeredMethodsFor(order)` used by both functions so they cannot drift):

```ts
  const offered = await offeredMethodsFor(order);
  if (!offered.some((m) => m.method === input.method)) {
    throw new ValidationError('That payment method is not available for this order');
  }
```

The check must not strand a live order: when the order already has a pending payment whose method equals `input.method` (the customer is retrying or re-opening the method they already chose), skip the offered-list check, so a method hidden or removed from the list after the order was placed can still be paid. Add the test:

```ts
it('a pending payment on a method since hidden from the list can still be re-selected and paid', async () => {
  // order has a pending 'paypal' payment; the list now offers only stripe
  const result = await selectPublicPaymentMethod(reference, accessKey, { method: 'paypal' });
  expect(result.method).toBe('paypal');
});
```

Also trace how the order page completes an existing pending payment (the active payment's stored `checkoutUrl`, crypto txid submission): confirm in the report that neither path goes through this check.

Match the error class and wording style the function already uses for an unavailable method (if it throws a `ConflictError` or a coded message elsewhere in this function, use the same class; the storefront shows the message as given).

- [ ] **Step 9: Docs, then run everything**

`STOREFRONT.md` and `src/docs/registry.ts`: document `payments[].methodLabel` on the account order detail; in the public `payment-method` route's description state that only a method returned by `payment-options` is accepted.

Run: `npx vitest run src/modules/public-orders src/modules/public-storefront src/modules/storefront-settings`, then `npm test`, then `npx tsc --noEmit`
Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add src/modules/storefront-settings/payment-method-names.ts src/modules/storefront-settings/payment-method-names.test.ts src/modules/public-orders/service.ts src/modules/public-storefront/account.ts STOREFRONT.md src/docs/registry.ts
git add <each test file you changed, by name>
git commit -m "feat(storefront): orders name their payment by the list; the order page takes only offered methods"
```

---

### Task 4: Backend, per-gateway return address

**Repo:** `ecommerce-backend`.

**Files:**
- Create: `src/modules/payment-gateways/return-urls.ts`
- Create: `src/modules/payment-gateways/return-urls.test.ts`
- Modify: `src/modules/payment-gateways/registry.ts` (`GatewayDefinition`, `GatewayConfigField`, the seven gateways)
- Modify: `src/modules/payment-gateways/processors/types.ts` and the seven processors: `stripe.ts`, `paypal.ts`, `revolut.ts`, `oxapay.ts`, `nexapay.ts`, `whop.ts`, `peerpay.ts`
- Modify: `src/modules/payment-gateways/service.ts` (config validation on update)
- Modify: `src/modules/orders/service.ts` (the two return-URL blocks, around lines 2001-2035 and 2307-2332)
- Modify: `payment-gateways.md`, `CLAUDE.md` (the payments bullet)
- Test: each processor's existing test file; `src/modules/payment-gateways` service tests

**Interfaces:**
- `GatewayConfigField` gains `showWhen?: string` (the name of a boolean field that must be `'true'` for this field to be shown) and `help?: string`.
- `GatewayDefinition` gains `sendsReturnUrl?: boolean` and `returnUrlRequired?: boolean`.
- `CreateSessionParams.successUrl` and `cancelUrl` become `string | undefined` (optional).
- Produces:
  ```ts
  export const RETURN_ADDRESS_FIELDS: GatewayConfigField[];   // hideShopAddress, neutralReturnUrl
  export function assertReturnAddressConfig(def: GatewayDefinition, config: Record<string, string>): void;  // throws ValidationError
  export function resolveReturnUrls(
    def: GatewayDefinition | undefined,
    config: Record<string, string>,
    shop: { orderPublicUrl: string | null; storeFrontUrl: string | null | undefined; orderReference: string },
  ): { successUrl?: string; cancelUrl?: string };
  ```

- [ ] **Step 1: Write the failing tests for the resolver**

`src/modules/payment-gateways/return-urls.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../utils/errors';
import { GATEWAY_MAP } from './registry';
import { assertReturnAddressConfig, resolveReturnUrls } from './return-urls';

const shop = { orderPublicUrl: 'https://shop.example/order/AB12CD/key', storeFrontUrl: 'https://shop.example', orderReference: 'AB12CD' };
const def = (name: string) => GATEWAY_MAP.get(name)!;

describe('resolveReturnUrls', () => {
  it('switch off: the order page for both, as today', () => {
    expect(resolveReturnUrls(def('revolut'), {}, shop)).toEqual({ successUrl: shop.orderPublicUrl, cancelUrl: shop.orderPublicUrl });
  });
  it('switch off, no order page: the /payment pages on the shop', () => {
    expect(resolveReturnUrls(def('revolut'), { hideShopAddress: 'false' }, { ...shop, orderPublicUrl: null })).toEqual({
      successUrl: 'https://shop.example/payment/success?order=AB12CD',
      cancelUrl: 'https://shop.example/payment/cancel?order=AB12CD',
    });
  });
  it('switch off and no shop URL at all is the existing configuration error', () => {
    expect(() => resolveReturnUrls(def('revolut'), {}, { ...shop, orderPublicUrl: null, storeFrontUrl: null })).toThrow(ValidationError);
    expect(() => resolveReturnUrls(def('revolut'), {}, { ...shop, storeFrontUrl: null })).toThrow(/storeFrontUrl/);
  });
  it('switch on with a neutral address: that address, exactly, with no order reference', () => {
    const out = resolveReturnUrls(def('stripe'), { hideShopAddress: 'true', neutralReturnUrl: 'https://thanks.example/done' }, shop);
    expect(out).toEqual({ successUrl: 'https://thanks.example/done', cancelUrl: 'https://thanks.example/done' });
  });
  it('switch on with no neutral address: nothing is sent, and no shop URL is needed', () => {
    expect(resolveReturnUrls(def('revolut'), { hideShopAddress: 'true' }, { ...shop, storeFrontUrl: null, orderPublicUrl: null })).toEqual({});
  });
  it('a processor that requires a return URL never gets nothing: without a neutral address it falls back to the shop', () => {
    for (const name of ['stripe', 'paypal']) {
      expect(resolveReturnUrls(def(name), { hideShopAddress: 'true' }, shop)).toEqual({ successUrl: shop.orderPublicUrl, cancelUrl: shop.orderPublicUrl });
    }
  });
  it('a gateway that sends no return URL is untouched by stray config', () => {
    expect(resolveReturnUrls(def('sushipp'), { hideShopAddress: 'true' }, shop)).toEqual({ successUrl: shop.orderPublicUrl, cancelUrl: shop.orderPublicUrl });
  });
});

describe('assertReturnAddressConfig', () => {
  it('accepts the switch off, and the switch on where the URL is optional', () => {
    expect(() => assertReturnAddressConfig(def('revolut'), {})).not.toThrow();
    expect(() => assertReturnAddressConfig(def('revolut'), { hideShopAddress: 'true' })).not.toThrow();
  });
  it('refuses the switch on without a neutral address where the processor requires a return URL', () => {
    expect(() => assertReturnAddressConfig(def('stripe'), { hideShopAddress: 'true' })).toThrow(/return address/i);
    expect(() => assertReturnAddressConfig(def('paypal'), { hideShopAddress: 'true', neutralReturnUrl: '  ' })).toThrow(ValidationError);
  });
  it('the neutral address must be an https URL', () => {
    for (const bad of ['http://thanks.example', 'thanks.example', 'javascript:alert(1)', 'https://']) {
      expect(() => assertReturnAddressConfig(def('revolut'), { hideShopAddress: 'true', neutralReturnUrl: bad })).toThrow(ValidationError);
    }
    expect(() => assertReturnAddressConfig(def('stripe'), { hideShopAddress: 'true', neutralReturnUrl: 'https://thanks.example/done' })).not.toThrow();
  });
  it('exactly seven gateways send a return URL, and two of them require it', () => {
    const sends = [...GATEWAY_MAP.values()].filter((g) => g.sendsReturnUrl).map((g) => g.name).sort();
    expect(sends).toEqual(['nexapay', 'oxapay', 'paypal', 'peerpay', 'revolut', 'stripe', 'whop']);
    expect([...GATEWAY_MAP.values()].filter((g) => g.returnUrlRequired).map((g) => g.name).sort()).toEqual(['paypal', 'stripe']);
  });
});
```

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run src/modules/payment-gateways/return-urls.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Registry**

In `registry.ts`, add to `GatewayConfigField`:

```ts
  /** Shown only while the named boolean field is on. */
  showWhen?: string;
  /** One sentence shown under the field in the admin form. */
  help?: string;
```

and to `GatewayDefinition`:

```ts
  /** The processor is sent a customer return URL at session creation; such a gateway carries RETURN_ADDRESS_FIELDS. */
  sendsReturnUrl?: boolean;
  /** The processor refuses a session without a return URL (verified against its documentation, 2026-10-04). */
  returnUrlRequired?: boolean;
```

Define above `GATEWAY_REGISTRY` and export:

```ts
export const RETURN_ADDRESS_FIELDS: GatewayConfigField[] = [
  {
    name: 'hideShopAddress',
    label: "Don't send my shop's address to this processor",
    required: false,
    type: 'boolean',
    help: 'After paying, customers are not sent back to the shop. They reach their order from their confirmation message, their saved link or their account.',
  },
  {
    name: 'neutralReturnUrl',
    label: 'Return address to send instead',
    required: false,
    type: 'text',
    showWhen: 'hideShopAddress',
    help: 'An https address that says nothing about the shop. Leave blank to send no return address at all.',
  },
];
```

For each of `stripe`, `paypal`, `revolut`, `oxapay`, `nexapay`, `whop`, `peerpay`: append `...RETURN_ADDRESS_FIELDS` to `configFields` and set `sendsReturnUrl: true`. For `stripe` and `paypal` also set `returnUrlRequired: true`. Do not touch any other gateway. Check `toResponse` in `payment-gateways/service.ts` passes `configFields` through as they are (so `showWhen` and `help` reach the admin app); if it projects specific properties, add the two. Also add `returnUrlRequired: definition?.returnUrlRequired ?? false` to `toResponse`, so the admin form can mark the address as required.

- [ ] **Step 4: Write `return-urls.ts`**

```ts
import { ValidationError } from '../../utils/errors';
import type { GatewayDefinition } from './registry';

const isOn = (config: Record<string, string>) => config.hideShopAddress === 'true';
const neutral = (config: Record<string, string>) => config.neutralReturnUrl?.trim() ?? '';

function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Save-time check of the two return-address fields. A gateway that sends no return URL has neither. */
export function assertReturnAddressConfig(def: GatewayDefinition, config: Record<string, string>): void {
  if (!def.sendsReturnUrl) return;
  const url = neutral(config);
  if (url && !isHttpsUrl(url)) {
    throw new ValidationError('The return address must be a full https address, e.g. https://example.com/thanks');
  }
  if (isOn(config) && def.returnUrlRequired && !url) {
    throw new ValidationError(`${def.displayName} needs a return address: enter one to send instead of your shop's`);
  }
}

/**
 * The customer return URLs a processor is given for an order.
 *
 * Default: the order page for both outcomes, else the shop's /payment pages (which need storeFrontUrl).
 * With "hide my shop's address" on: the gateway's neutral address, exactly as entered; or nothing at
 * all when none is set. A processor that refuses a session without a return URL is never given
 * nothing: if no neutral address is stored (save-time validation prevents it) the shop's is sent,
 * because a failed checkout costs more than the address.
 *
 * Server-to-server callback URLs are not customer redirects and are not decided here.
 */
export function resolveReturnUrls(
  def: GatewayDefinition | undefined,
  config: Record<string, string>,
  shop: { orderPublicUrl: string | null; storeFrontUrl: string | null | undefined; orderReference: string },
): { successUrl?: string; cancelUrl?: string } {
  if (def?.sendsReturnUrl && isOn(config)) {
    const url = neutral(config);
    if (url && isHttpsUrl(url)) return { successUrl: url, cancelUrl: url };
    if (!def.returnUrlRequired) return {};
  }
  if (!shop.storeFrontUrl) {
    throw new ValidationError('storeFrontUrl must be configured in settings before using online payment gateways');
  }
  return {
    successUrl: shop.orderPublicUrl ?? `${shop.storeFrontUrl}/payment/success?order=${shop.orderReference}`,
    cancelUrl: shop.orderPublicUrl ?? `${shop.storeFrontUrl}/payment/cancel?order=${shop.orderReference}`,
  };
}
```

- [ ] **Step 5: Run the resolver tests**

Run: `npx vitest run src/modules/payment-gateways/return-urls.test.ts`
Expected: PASS.

- [ ] **Step 6: Make the processors accept an absent return URL**

`processors/types.ts`: change to `successUrl?: string;` and `cancelUrl?: string;` with the comment `/** Absent when the gateway is set not to send the shop's address and has no neutral address. */`.

In each processor, send a return field only when its value is present. The seven, with the field names they send today:

| File | Today | Change to |
|---|---|---|
| `stripe.ts` (~25-26) | `success_url: params.successUrl, cancel_url: params.cancelUrl` | `success_url` unchanged (always present for Stripe by the resolver); `...(params.cancelUrl ? { cancel_url: params.cancelUrl } : {})`. If `params.successUrl` is absent, throw `new ValidationError('Stripe needs a return address')` before calling Stripe. |
| `paypal.ts` (~75-81) | `experience_context: { return_url, cancel_url, ... }` | unchanged values; if either is absent, throw `new ValidationError('PayPal needs a return address')` before calling PayPal. |
| `revolut.ts` (~24) | `redirect_url: params.successUrl` | `...(params.successUrl ? { redirect_url: params.successUrl } : {})` |
| `oxapay.ts` (~23) | `return_url: params.successUrl` | `...(params.successUrl ? { return_url: params.successUrl } : {})`; `callback_url` unchanged |
| `nexapay.ts` (~21-22) | `success_url`, `cancel_url` | each spread only when present; `callback_url` unchanged |
| `whop.ts` (~78) | `redirect_url: params.successUrl` | spread only when present |
| `peerpay.ts` (~99-100) | `successUrl`, `cancelUrl` | each spread only when present |

For each processor, add to its existing test file (they mock `fetch` or the SDK and inspect the request body; follow the file):

```ts
it('sends no customer return address when none is given, and still sends its callback', async () => {
  await processor.createSession({ ...baseParams, successUrl: undefined, cancelUrl: undefined }, config);
  const body = lastRequestBody();
  expect(body).not.toHaveProperty('<each return field of this processor>');
  // oxapay and nexapay only:
  expect(body.callback_url).toMatch(/\/api\/v1\/webhooks\//);
});
```

with the real field names per the table (for PayPal the fields sit under `payment_source.paypal.experience_context`). For Stripe and PayPal the test is instead `await expect(processor.createSession({ ...baseParams, successUrl: undefined, cancelUrl: undefined }, config)).rejects.toThrow(/return address/)` and an assertion that no request was made. The other processors that take `CreateSessionParams` (Paygate, Sushipp, Orderify, Wise, Monzo) do not read the two fields: confirm with `grep -n "successUrl\|cancelUrl" src/modules/payment-gateways/processors/*.ts` that only the seven do, and change nothing in the rest.

- [ ] **Step 7: Use the resolver in both session paths**

In `src/modules/orders/service.ts`, in `createGatewayCheckoutSession` (around 2001-2035) replace from `const storeFrontUrl = siteSettings?.storeFrontUrl;` through the `cancelUrl` line with:

```ts
  const { successUrl, cancelUrl } = resolveReturnUrls(definition, config, {
    orderPublicUrl: buildOrderPublicUrl(orderReference),
    storeFrontUrl: siteSettings?.storeFrontUrl,
    orderReference,
  });
```

keeping the fee computation where it is, and the comment about preferring the customer order page moved onto `resolveReturnUrls` (already in its doc comment). `definition` and `config` are the variables that function already holds for the gateway (the registry definition and the parsed config passed to `processor.createSession`); if the parsed config has a different name there, use it.

In `addPayment` (around 2307-2332) make the same replacement with `order.reference`. The `storeFrontUrl must be configured` throw now lives only in the resolver: delete both inline copies. Import `resolveReturnUrls` from `../payment-gateways/return-urls`.

Then run `grep -rn "createSession(" src --include=*.ts | grep -v test` and `grep -rn "successUrl\|cancelUrl\|payment/success\|payment/cancel" src --include=*.ts | grep -v test`: every place that builds a customer return URL for a processor (check `switchPaymentMethod`, admin-created payments, any resend-link or reconcile path) must get its URLs from `resolveReturnUrls`. List each caller and what you did in the report.

Add to the orders tests that cover `createGatewayCheckoutSession` (find with `grep -rn "createGatewayCheckoutSession" src --include=*.test.ts`), using their processor mock:

```ts
it('a gateway set to hide the shop address passes its neutral address to the processor', async () => {
  // gateway revolut, config { ...creds, hideShopAddress: 'true', neutralReturnUrl: 'https://thanks.example/done' }
  await createGatewayCheckoutSession(/* existing arguments for a revolut order */);
  expect(processorMock.createSession).toHaveBeenCalledWith(
    expect.objectContaining({ successUrl: 'https://thanks.example/done', cancelUrl: 'https://thanks.example/done' }),
    expect.anything(),
  );
});

it('with no neutral address nothing is passed, and a missing storeFrontUrl no longer blocks the session', async () => {
  // gateway revolut, config { ...creds, hideShopAddress: 'true' }; settings.storeFrontUrl null
  await createGatewayCheckoutSession(/* ... */);
  const [params] = processorMock.createSession.mock.calls.at(-1)!;
  expect(params.successUrl).toBeUndefined();
  expect(params.cancelUrl).toBeUndefined();
});
```

- [ ] **Step 8: Validate on save**

In `src/modules/payment-gateways/service.ts`, in the update function, at the point where the incoming `config` has been merged/normalised and before it is written (beside the call to the definition's `normalizeConfig`, if any), add `if (definition) assertReturnAddressConfig(definition, mergedConfig);` using that function's variable for the final config. The check must run on the config that will be stored (so turning the switch on in one save and having set the URL in an earlier save passes). Add to the service's tests:

```ts
it('refuses hiding the shop address on Stripe without a return address, and stores nothing', async () => {
  await expect(updatePaymentGateway(stripeId, { config: { hideShopAddress: 'true' } })).rejects.toThrow(/return address/i);
  expect(storedConfig(stripeId).hideShopAddress).not.toBe('true');
});
it('accepts it with an https return address, and for Revolut with none', async () => {
  await updatePaymentGateway(stripeId, { config: { hideShopAddress: 'true', neutralReturnUrl: 'https://thanks.example/done' } });
  await updatePaymentGateway(revolutId, { config: { hideShopAddress: 'true' } });
});
```

following that test file's fixtures and helper names. Check every existing per-gateway `normalizeConfig` in `registry.ts` (Paygate, Whop, Peer Pay and any other): none may drop `hideShopAddress` or `neutralReturnUrl` from the config it returns; add a test that saving the two keys on Whop and on Peer Pay stores them. Confirm how the update treats config keys: if it rejects keys not in `configFields`, the two new keys are now in `configFields` for the seven; if booleans are coerced to strings somewhere, keep storing `'true'` / `'false'`.

- [ ] **Step 9: Docs**

`payment-gateways.md`: add a section "Return address" stating: which seven gateways send one and with which fields; the two config fields; the three-row behaviour table from the spec; that Stripe and PayPal require a neutral address before the switch can be turned on; that callbacks and webhooks are unaffected and that OxaPay's and NexaPay's `callback_url` still carries the API host; that the setting applies to every order paid through the gateway (storefront, bot, admin). `CLAUDE.md`: one sentence in the payments bullet naming `resolveReturnUrls` as the only place return URLs are decided.

- [ ] **Step 10: Run everything**

Run: `npx vitest run src/modules/payment-gateways src/modules/orders`, then `npm test`, then `npx tsc --noEmit`
Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add src/modules/payment-gateways/return-urls.ts src/modules/payment-gateways/return-urls.test.ts src/modules/payment-gateways/registry.ts src/modules/payment-gateways/service.ts src/modules/payment-gateways/processors/types.ts src/modules/payment-gateways/processors/stripe.ts src/modules/payment-gateways/processors/paypal.ts src/modules/payment-gateways/processors/revolut.ts src/modules/payment-gateways/processors/oxapay.ts src/modules/payment-gateways/processors/nexapay.ts src/modules/payment-gateways/processors/whop.ts src/modules/payment-gateways/processors/peerpay.ts src/modules/orders/service.ts payment-gateways.md CLAUDE.md
git add <each test file you changed, by name>
git commit -m "feat(payments): a gateway can be told not to receive the shop's address"
```

---

### Task 5: Admin app, the payment method list

**Repo:** `ecommerce-admin-frontend`. Create the branch first: `git checkout -b feature/payment-method-list main`. Read the repo's `CLAUDE.md` (i18n section) before writing any string. Use the `frontend-design` skill for the visual side; the card must look like its neighbours on the Storefront settings page.

**Files:**
- Modify: `src/types/storefront-settings.ts`
- Modify: `src/features/promotions/use-drag-reorder.ts` (generalise ids), `src/features/promotions/PromotionsPage.tsx` (only if the call site needs a type argument)
- Rewrite: `src/features/storefront-settings/PaymentsCard.tsx`
- Create: `src/features/storefront-settings/payment-method-list.ts` (pure list operations)
- Modify: the storefront-settings i18n namespace in all five locales (`src/i18n/locales/{en,it,es,fr,zh-CN}/<namespace>.json`; find the namespace the Storefront settings page uses; if this card's strings are not yet translated, add them to that namespace)

**Interfaces:**
- Consumes (backend, Task 2): `GET /storefront-settings` → `paymentMethods: { method, enabled, label, displayName, type, gatewayEnabled }[]`, `paymentMethodChoices: { method, displayName, type }[]`; `PUT /storefront-settings` ← `paymentMethods: { method, enabled, label }[]`.
- Produces:
  ```ts
  // src/types/storefront-settings.ts
  export type PaymentMethodKind = 'gateway' | 'crypto' | 'offline';
  export interface StorefrontPaymentMethodRow { method: string; enabled: boolean; label: string | null; displayName: string; type: PaymentMethodKind; gatewayEnabled: boolean }
  export interface StorefrontPaymentMethodChoice { method: string; displayName: string; type: PaymentMethodKind }
  export interface StorefrontPaymentMethodInput { method: string; enabled: boolean; label: string | null }
  // src/features/storefront-settings/payment-method-list.ts
  export function reorder<T extends { method: string }>(rows: T[], order: string[]): T[];
  export function toInput(rows: StorefrontPaymentMethodRow[]): StorefrontPaymentMethodInput[];
  export function sameList(a: StorefrontPaymentMethodInput[], b: StorefrontPaymentMethodInput[]): boolean;
  // use-drag-reorder.ts
  export function useDragReorder<Id extends string | number>(options: { ids: Id[]; enabled: boolean; onCommit: (ids: Id[]) => void }): ...
  ```

- [ ] **Step 1: Record the lint baseline**

Run: `npm run lint 2>&1 | tail -3` and note the error and warning counts.

- [ ] **Step 2: Types**

In `src/types/storefront-settings.ts` add the four types above. In `StorefrontSettings` add `paymentMethods: StorefrontPaymentMethodRow[];` and `paymentMethodChoices: StorefrontPaymentMethodChoice[];` after `paymentSlotCrypto`, and change the comment on the two slot fields to `/** Used only until a payment method list is saved. */`. In the update input type add `paymentMethods?: StorefrontPaymentMethodInput[];`.

- [ ] **Step 3: Generalise the drag hook**

In `src/features/promotions/use-drag-reorder.ts` make the hook generic over the id: `interface Options<Id extends string | number> { ids: Id[]; enabled: boolean; onCommit: (ids: Id[]) => void }`, `export function useDragReorder<Id extends string | number>({ ids, enabled, onCommit }: Options<Id>)`, and replace every `number` that types an id (state, the `Map` keys of `rows`, `handles`, `lastTops`, the refs `startOrder`, `refocus`, `keepFocus`, and the parameters of `handleProps` and `rowRef`) with `Id`. `ids.join(',')` stays valid. Nothing else changes. `PromotionsPage.tsx` infers `Id = number` from its `ids`; confirm with `npx tsc -b` that it compiles unchanged.

- [ ] **Step 4: Pure list operations**

`src/features/storefront-settings/payment-method-list.ts`:

```ts
import type { StorefrontPaymentMethodInput, StorefrontPaymentMethodRow } from '@/types/storefront-settings.ts';

/** `rows` in the order `order` names them; a row `order` does not name keeps its place at the end. */
export function reorder<T extends { method: string }>(rows: T[], order: string[]): T[] {
  const rank = new Map(order.map((m, i) => [m, i]));
  return [...rows].sort((a, b) => (rank.get(a.method) ?? order.length) - (rank.get(b.method) ?? order.length));
}

/** What the API stores: a blank name is no name. */
export function toInput(rows: StorefrontPaymentMethodRow[]): StorefrontPaymentMethodInput[] {
  return rows.map((r) => ({ method: r.method, enabled: r.enabled, label: r.label?.trim() ? r.label.trim() : null }));
}

export function sameList(a: StorefrontPaymentMethodInput[], b: StorefrontPaymentMethodInput[]): boolean {
  return a.length === b.length && a.every((x, i) => x.method === b[i].method && x.enabled === b[i].enabled && x.label === b[i].label);
}
```

- [ ] **Step 5: Rewrite `PaymentsCard.tsx`**

Replace the two selects with the list. Behaviour, all inside the existing `SectionCard`, form and `SectionActions` save button:

- State: `rows: StorefrontPaymentMethodRow[]`, initialised from `settings.paymentMethods` and re-synced during render when the server list changes, compared with `sameList(toInput(server), toInput(lastSynced))` (keep the existing pattern and its comment about not using an effect, adapted to the list). An in-progress edit survives an unrelated tab's save.
- The gateways query and the bot slots query are no longer needed: remove them and their imports. `paymentMethodChoices` comes from settings.
- `useDragReorder({ ids: rows.map((r) => r.method), enabled: canWrite, onCommit: (ids) => setRows((prev) => reorder(prev, ids)) })`. Render rows in `order` (the hook's live order) by looking each id up in `rows`. Attach `rowRef(method)` to the row element and `handleProps(method, name, positionLabel)` to a `GripVertical` handle, exactly as `src/features/promotions/PromotionRow.tsx` does (read it; reuse its handle classes). Render the hook's `announcement` in a visually hidden `aria-live="polite"` element as that page does.
- Each row: handle; a text input for the name (`maxLength={40}`, placeholder = `row.displayName`, value `row.label ?? ''`, `aria-label` from i18n with the gateway name); secondary text: `row.displayName` and the kind (`gateway` → "Card or hosted checkout", `crypto` → "Crypto", `offline` → "Bank transfer", via i18n); a show/hide switch (the app's existing toggle primitive; find the one `PaymentsTab.tsx` uses for a gateway's enabled toggle and use it) labelled by i18n with the name; a remove icon button (`aria-label` via i18n); and, when `!row.gatewayEnabled`, a small warning line: "This gateway is turned off in Settings → Payments, so customers won't see it."
- Below the list: a `Select` "Add a payment method" listing `settings.paymentMethodChoices` minus methods already in `rows`; choosing one appends `{ method, enabled: true, label: null, displayName, type, gatewayEnabled: true }` and resets the select. When a removed row's method was not in the server's choices (it was listed), make it available to add again: the add options are `[...choices, ...removed server rows whose gateway is enabled]` de-duplicated by method.
- Empty state (no rows): the `Hint` "No payment methods are offered on the storefront. Add one below." If there are also no choices: "Enable a payment gateway in Settings → Payments first."
- Save: `updateStorefrontSettings({ paymentMethods: toInput(rows) })`; on success invalidate `storefrontSettingsKeys.all` and toast "Storefront payment methods saved"; on error toast the message. `dirty` is `!sameList(toInput(rows), toInput(settings.paymentMethods))`. The whole fieldset is disabled without `storefront:write`, and the handle, add select and remove buttons are not rendered.
- Card title "Storefront payment methods"; subtitle "Choose which payment methods customers see at checkout, what each is called, and in what order. Drag to reorder."
- Loading state: three skeleton rows in place of the two skeleton fields.

All strings through `t()` in the page's namespace under a `payments.` prefix (e.g. `payments.title`, `payments.subtitle`, `payments.nameLabel`, `payments.kind.gateway`, `payments.kind.crypto`, `payments.kind.offline`, `payments.show`, `payments.remove`, `payments.gatewayOff`, `payments.add`, `payments.addPlaceholder`, `payments.empty`, `payments.emptyNoGateways`, `payments.saved`, `payments.dragHandle`, `payments.position`), added to all five locale files with real translations (check `docs/i18n-glossary.md` for "gateway", "checkout", "storefront"). Remove any keys this card no longer uses.

- [ ] **Step 6: Build and check**

Run: `npm run build` (includes `tsc -b` and `i18n:check`)
Expected: succeeds.
Run: `npm run lint 2>&1 | tail -3`
Expected: error count not above the Step 1 baseline.

- [ ] **Step 7: Browser pass on mocks**

Following the approach in the auto-memory note "Playwright mocked admin pass" (seeded JWT in storage, `page.route` mocks for `/api/v1/*`, the Vite dev server; no real backend), write a throwaway script under the scratchpad directory that opens the Storefront settings page with `GET /storefront-settings` mocked to return four `paymentMethods` (one with `gatewayEnabled: false`, one hidden, one named) and two `paymentMethodChoices`, and checks at 1280 and 390 wide: the four rows render in order; typing a name enables Save; toggling show/hide; dragging the third row above the first with the pointer; moving a row with the keyboard (focus the handle, ArrowUp); removing a row then re-adding it from the select; adding a choice; Save sends `PUT` with `paymentMethods` in the on-screen order with `label: null` for a blank name (assert on the captured request body); a viewer (no `storefront:write`) sees the list read-only with no handles. Look at one screenshot per width. Delete the script and screenshots afterwards.

- [ ] **Step 8: Commit**

```bash
git add src/types/storefront-settings.ts src/features/promotions/use-drag-reorder.ts src/features/storefront-settings/PaymentsCard.tsx src/features/storefront-settings/payment-method-list.ts
git add src/i18n/locales/en/<ns>.json src/i18n/locales/it/<ns>.json src/i18n/locales/es/<ns>.json src/i18n/locales/fr/<ns>.json src/i18n/locales/zh-CN/<ns>.json
git commit -m "feat(storefront-settings): choose, name and order the storefront's payment methods"
```

---

### Task 6: Admin app, the return address fields

**Repo:** `ecommerce-admin-frontend`. Use the `frontend-design` skill for the visual side.

**Files:**
- Modify: `src/types/payment-gateways.ts` (or wherever the gateway config field type lives; find with `grep -rn "displayToCustomer" src/types`)
- Modify: `src/features/settings/PaymentsTab.tsx` (`GatewayItem`'s dynamic config form)
- Modify: the settings i18n namespace in all five locales, only if a new string is needed

**Interfaces:**
- Consumes (backend, Task 4): each gateway's `configFields[]` may carry `showWhen?: string` and `help?: string`; the seven gateways carry `hideShopAddress` (`type: 'boolean'`) and `neutralReturnUrl` (`type: 'text'`, `showWhen: 'hideShopAddress'`). Config values are strings; a boolean is `'true'` / `'false'`. Saving `hideShopAddress: 'true'` on Stripe or PayPal with no `neutralReturnUrl` answers 422 with a message to show.

- [ ] **Step 1: Types**

Add `showWhen?: string;` and `help?: string;` to the config field type.

- [ ] **Step 2: Render them**

In `GatewayItem`'s dynamic field rendering (the map over `configFields` that switches on `field.type`):
- skip a field whose `showWhen` names a field whose current form value is not `'true'` (read the form state the component already keeps for config values; a boolean field's on state is whatever the existing boolean rendering writes: confirm it writes `'true'`/`'false'` strings and keep that);
- under any field with `help`, render it with the `Hint` component (or the small muted text style the form already uses for helper text);
- when the gateway's `returnUrlRequired` is true (add `returnUrlRequired?: boolean` to the gateway type), show the `neutralReturnUrl` field as required (the form's existing required marker) and disable Save while the switch is on and the address is blank, with the reason shown through the field's existing error style;
- a hidden field's value is still sent as stored (do not clear `neutralReturnUrl` when the switch is turned off: the admin may turn it back on).

`label` and `help` come from the backend in English, as every other gateway field label does today: do not add i18n keys for them. If this component already translates field labels through a lookup, follow that lookup and add the keys for the two labels and two help texts in all five locales.

Server validation errors (the 422 for Stripe/PayPal, or a non-https address) must surface through the mutation's existing error toast: confirm the mutation's `onError` shows `err.message` and that the backend message arrives intact.

- [ ] **Step 3: Build and lint**

Run: `npm run build`, then `npm run lint 2>&1 | tail -3`
Expected: build succeeds; lint errors not above the baseline recorded in Task 5.

- [ ] **Step 4: Browser pass on mocks**

Throwaway script as in Task 5, opening Settings → Payments with `GET /payment-gateways` mocked to return Stripe (enabled, with the two new fields in `configFields`), Revolut (the same) and Sushipp (without them). Check: Stripe's panel shows the switch and its help text; the address field appears only after the switch is turned on; on Stripe (`returnUrlRequired: true`) Save stays disabled until an address is typed, on Revolut it does not; saving sends `config.hideShopAddress: 'true'` and the address; with the `PATCH` mocked to answer 422 `{ success: false, data: null, error: "Stripe needs a return address: enter one to send instead of your shop's" }` the toast shows that sentence; Sushipp shows neither field. Look at a screenshot at 1280 and 390. Delete the script and screenshots.

- [ ] **Step 5: Commit**

```bash
git add src/types/payment-gateways.ts src/features/settings/PaymentsTab.tsx
git add <locale files, only if changed, by name>
git commit -m "feat(payments): per-gateway switch to keep the shop's address from the processor"
```

---

### Task 7: Storefront, names from the backend

**Repo:** `ecommerce-storefront` (branch `feature/payment-method-list` exists). Use the `frontend-design` skill only if a visible layout changes; none should.

**Files:**
- Modify: `web/src/types/checkout.ts` (`PaymentMethod.slot`), `web/src/types/orders.ts` (payment `methodLabel`)
- Modify: `web/src/features/order-status/payment-state.ts` (`slotLabel`, `isManual`, remove `SLOT_BASE`)
- Modify: `web/src/features/account/OrderDetailPage.tsx` (the method name, around lines 38-40 and 252)
- Modify: `web/src/text/keys/order.ts`, `web/src/text/notes/order.ts` (retire `order.method.card`, `order.method.crypto`)
- Modify: `web/src/builder/editor/fixtures.ts`, `web/src/builder/editor/fixture-api.ts` (only as far as the type change requires)
- Test: `web/test/` files covering `slotLabel`, `isManual`, the order detail page (find with `grep -rln "slotLabel\|isManual\|order.method.card" web/test web/src`)

**Interfaces:**
- Consumes (backend): each payment method's `displayName` is now the customer-facing name and `type` is `'gateway' | 'crypto' | 'offline'`; `slot` may be present and is ignored; the account order detail's payments carry `methodLabel: string` (absent on a backend older than this change).
- Produces: `slotLabel(method)` keeps its name and signature and returns `method.displayName` plus the fee wording; `isManual(method)` returns `method.type === 'offline'`.

- [ ] **Step 1: Write the failing tests**

In the test file that covers `payment-state.ts` (create `web/test/payment-method-names.test.ts` if none), with the text snapshot set up the way neighbouring tests set it up:

```ts
import { describe, expect, it } from 'vitest';
import { isManual, slotLabel } from '@/features/order-status/payment-state.ts';
import type { PaymentMethod } from '@/types/checkout.ts';

const method = (over: Partial<PaymentMethod>): PaymentMethod => ({
  method: 'stripe', displayName: 'Card', type: 'gateway', details: null,
  feeType: null, feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 10, ...over,
});

describe('slotLabel', () => {
  it('is the name the shop gave the method, whatever slot an older backend sent', () => {
    expect(slotLabel(method({ displayName: 'Pay by card', slot: 'crypto' }))).toBe('Pay by card');
    expect(slotLabel(method({ displayName: 'Pay with crypto', method: 'crypto', type: 'crypto' }))).toBe('Pay with crypto');
  });
  it('spells out a discount and a fee around that name', () => {
    expect(slotLabel(method({ displayName: 'Pay with crypto', feeRateText: '−3%' }))).toContain('Pay with crypto');
    expect(slotLabel(method({ displayName: 'Pay with crypto', feeRateText: '−3%' }))).toContain('3%');
    expect(slotLabel(method({ displayName: 'Card', feeRateText: '+2%' }))).toContain('2%');
  });
});

describe('isManual', () => {
  it('is decided by the method type, not the slot', () => {
    expect(isManual(method({ type: 'offline', method: 'uk_bank_transfer' }))).toBe(true);
    expect(isManual(method({ type: 'gateway', slot: 'manual' }))).toBe(false);
    expect(isManual(method({ type: 'crypto' }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run and see them fail**

Run: `cd web && npx vitest run test/payment-method-names.test.ts`
Expected: FAIL (the first test returns the site text "Crypto"; `isManual` reads `slot`).

- [ ] **Step 3: Change `payment-state.ts` and the type**

`web/src/types/checkout.ts`: `slot` becomes `/** Sent for older builds; not read. */ slot?: 'card' | 'crypto' | 'manual';`.

`web/src/features/order-status/payment-state.ts`: delete `SLOT_BASE` and its comment; then

```ts
/**
 * Button copy for a payment method: the name the shop gave it, plus the fee spelled
 * out. The backend signs every rate ('−3%' / '+2%'), and a bare '−3%' reads as
 * a fee at a glance, so the sign becomes a word.
 */
export function slotLabel(method: PaymentMethod): string {
  const { t } = textSnapshot();
  const base = method.displayName;
  const rate = method.feeRateText?.trim();
  if (!rate) return base;
  if (rate.startsWith('−') || rate.startsWith('-')) return t('order.method.withDiscount', { method: base, rate: rate.slice(1) });
  return t('order.method.withFee', { method: base, rate: rate.replace(/^\+/, '') });
}

/**
 * A manual bank transfer can't be started from this page: the backend refuses
 * every manual gateway on the public payment-method route, so the
 * picker shows the transfer details instead of creating a payment.
 */
export function isManual(method: PaymentMethod): boolean {
  return method.type === 'offline';
}
```

Remove imports this leaves unused (`textKey`, `StringKey` if no longer referenced).

- [ ] **Step 4: Retire the two text keys**

Remove `order.method.card` and `order.method.crypto` from `web/src/text/keys/order.ts` and their notes from `web/src/text/notes/order.ts`. Remove them from any block's `text` declaration and from `web/src/text/site-wide.ts` if listed by name (a family pattern such as `order.method.*` stays, since `withDiscount` and `withFee` remain). Then run `cd web && npx vitest run test/text-registry.test.ts test/text-inventory.test.ts test/text-catalog.test.ts` (use the real file names: `ls web/test | grep -i text`).

`web/test/helpers/text-inventory.json` is frozen and records the original wording; the survival check in `web/test/text-inventory.test.ts` has a documented exemption list for wording that was deliberately changed. If that check fails for "Card" or "Crypto" because the literals no longer exist in the defaults, add one exemption entry per literal in `web/test/text-inventory.test.ts` exactly in the form the existing entries use, with the reason "the method's name now comes from the shop's payment method list". Do not edit the JSON. If the mechanism cannot express a removed key, STOP and report: do not invent a workaround.

- [ ] **Step 5: The account order page**

`web/src/types/orders.ts`: the order detail payment type gains `methodLabel?: string;`.

`web/src/features/account/OrderDetailPage.tsx`: where the payment method is shown (the helper around lines 38-40 that replaces underscores, used around line 252), show `payment.methodLabel ?? <the existing humanised id>`. Add a test beside the existing order detail tests:

```ts
it('names a payment by the shop\'s name for the method, falling back to the id as words on an older backend', async () => {
  // render the page with payments [{ method: 'stripe', methodLabel: 'Pay by card', ... }, { method: 'bank_transfer', ... }]
  expect(await screen.findByText('Pay by card')).toBeInTheDocument();
  expect(screen.getByText(/bank transfer/i)).toBeInTheDocument();
});
```

built with that file's render helper and fixtures.

- [ ] **Step 6: Fixtures**

In `web/src/builder/editor/fixtures.ts` and `fixture-api.ts`, leave fixture data as it is unless the compiler requires a change (the `slot` field is now optional, so existing fixture objects still type-check). Do NOT change fixture content that goldens render: `cd web && npx vitest run` must show every golden test still passing without regenerating anything. If a golden differs, the cause is a rendered name that changed: the order page fixtures' methods carry `displayName`s of gateways ("Stripe") where the page used to print "Card". The builder fixture's methods (`fixtures.ts:73-74`, `displayName: 'Card payment'`) feed BOTH the checkout quote and the order page's `payment-options` (`fixture-api.ts:93`), so a fixture name cannot keep both pages unchanged. If a golden or baseline of an order page differs only because the method row now prints the fixture's `displayName` where it printed the site text "Card", that is an intended change of this plan, but regenerating is the owner's call: STOP, report the exact files and the one-line diff of each, and wait.

- [ ] **Step 7: Run everything**

Run: `cd web && npx tsc -b`, then from the repo root `TZ=UTC npm test`
Expected: all green; `git diff --ignore-cr-at-eol --stat -- web/test/__golden__ e2e/__baseline__ web/test/helpers/text-inventory.json` prints nothing.

- [ ] **Step 8: Commit**

```bash
git add web/src/types/checkout.ts web/src/types/orders.ts web/src/features/order-status/payment-state.ts web/src/features/account/OrderDetailPage.tsx web/src/text/keys/order.ts web/src/text/notes/order.ts
git add <each test, fixture or declaration file you changed, by name>
git commit -m "feat(checkout): payment methods carry the shop's own names on the order pages"
```

---

### Task 8: Storefront, end-to-end tests and docs, then stop

**Repo:** `ecommerce-storefront`. Run from the repo root.

**Files:**
- Modify: `e2e/mocks.ts` (a `paymentMethods` option)
- Create: `e2e/payment-methods.spec.ts`
- Modify: `docs/builder.md` (the order-status payment part: method names)

- [ ] **Step 1: Mocks**

In `e2e/mocks.ts`, `InstallMocksOptions` gains `paymentMethods?: PaymentMethod[]` (import the type from `web/src/types/checkout.ts` as the file imports other web types). When given, the quote answers (signed-in and guest) and the order page's `payment-options` answer return exactly that list in that order, and the account order detail's payments gain `methodLabel` from the matching entry's `displayName`. When absent, every existing answer is byte-for-byte what it is today, so no existing spec or baseline changes. Export a ready list for the spec:

```ts
export const FOUR_METHODS: PaymentMethod[] = [
  { method: 'crypto', displayName: 'Pay with crypto', type: 'crypto', details: null, feeType: 'percent', feeValue: -3, feeRateText: '−3%', feeLabel: 'Pay with crypto discount', fee: -1.42, chargeTotal: 46.03,
    cryptoOptions: [{ coin: 'USDT', network: 'polygon', coinLabel: 'USDT', networkLabel: 'Polygon', feeType: 'percent', feeValue: -3, feeRateText: '−3%', feeLabel: 'Pay with crypto discount', fee: -1.42, chargeTotal: 46.03 }] },
  { method: 'stripe', displayName: 'Pay by card', type: 'gateway', details: null, feeType: null, feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 47.45 },
  { method: 'paypal', displayName: 'PayPal balance', type: 'gateway', details: null, feeType: 'percent', feeValue: 2, feeRateText: '+2%', feeLabel: 'PayPal balance fee', fee: 0.95, chargeTotal: 48.4 },
  { method: 'uk_bank_transfer', displayName: 'Bank transfer (UK)', type: 'offline', details: { 'Account name': 'Example Shop Ltd', 'Sort code': '00-00-00', 'Account number': '00000000' }, feeType: null, feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 47.45 },
];
```

Adjust `chargeTotal` values to the mock cart's real amount due if it differs (read what the existing quote mock computes); the names and order are what the tests assert.

- [ ] **Step 2: End-to-end tests**

Create `e2e/payment-methods.spec.ts` with `installMocks` and the open/walk helpers the checkout specs use (read `e2e/checkout-parts.spec.ts`; reuse its helpers by exporting them or copying the two small ones this spec needs). Synthetic data only. Tests:

1. Checkout Payment step lists four methods in the list's order with the shop's names: assert the radio labels' text order is `Pay with crypto`, `Pay by card`, `PayPal balance`, `Bank transfer (UK)`.
2. Choosing `PayPal balance` and placing the order posts `paymentMethod: 'paypal'` (the mock's recorded checkout body) and the Review step named it `PayPal balance`.
3. Choosing `Pay with crypto` opens the coin picker, and the order is posted with `coin` and `network`.
4. Choosing `Bank transfer (UK)` shows the offline note, and placing lands on the order page showing the transfer details.
5. The order page's method picker (an unpaid order with no method) lists the same four names in the same order; the bank transfer row opens details and creates no payment; `Pay by card` posts `method: 'stripe'`.
6. The account order page names a paid order's payment `Pay by card`.
7. An older backend (no `paymentMethods` option, default fixtures with `slot`) still renders the checkout and the order page: one smoke assertion each that a method is shown and selectable.

Wait for the debounced quote to settle before clicking Place order (the known race: the button is briefly disabled after a shipping change; assert the button is enabled and the quote request count is stable, as `unpaid-orders.spec.ts` waits on positive signals).

Run: `npm run test:e2e -- payment-methods.spec.ts --repeat-each=3`
Expected: all pass three times.

- [ ] **Step 3: Full runs**

Run `TZ=UTC npm test` and `npm run test:e2e` (output to a file in the scratchpad directory; read the whole summary). Unit suites: all green. End to end: the known pre-existing failures are the guest "one token per request" / "a token per request" tests in `checkout-parts.spec.ts` (lines 225 and 529; a debounced re-quote races the click; about 3 to 14% even alone) and `core-options.spec.ts:41`; re-run any failure alone three times and report both results. No baseline is expected to change: `git diff --ignore-cr-at-eol --stat -- e2e/__baseline__ web/test/__golden__ web/test/helpers/text-inventory.json` must print nothing. A baseline that differs is unexpected: read its diff; if the order page now prints a gateway name where it printed "Card", fix the fixture per Task 7 Step 6, not the baseline.

- [ ] **Step 4: Docs**

In `docs/builder.md`, in the order-status payment part and the checkout payment part: method names come from the shop's payment method list in the admin app (Storefront settings → Payments), not from site text; the two site-text entries "Card" and "Crypto" no longer exist; the fee wording around the name (`order.method.withDiscount`, `order.method.withFee`) is still site text.

- [ ] **Step 5: Commit**

```bash
git add e2e/mocks.ts e2e/payment-methods.spec.ts docs/builder.md
git commit -m "test(checkout): end-to-end payment method list on the mock backend; docs"
```

- [ ] **Step 6: Stop and report**

Report to the owner: the three branches and their commits; unit, build and e2e results; which browser passes were done; and what was not verified (no real backend; no real session created with the return address omitted or replaced for any of the seven processors; the bot untouched; `ecommerce-menu` and the desktop app untouched). Also report, as items for the owner: OxaPay's and NexaPay's callback URLs still carry the API host; the customer order link path question from the spec's section 7. Merging, the storefront `web` minor bump and tag, and any push or deploy happen only on the owner's say-so: backend first, then admin, then storefront.
