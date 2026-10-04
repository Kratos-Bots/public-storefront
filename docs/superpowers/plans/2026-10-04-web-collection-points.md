# Web Collection Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shopper on the web storefront can choose delivery to a carrier collection point in the address step, find one by postcode, see only matching delivery options, place the order, and afterwards see which point they chose.

**Architecture:** The backend already stores collection points and serves the point search; it gains a `collectionCountries` settings list, a quote that accepts a delivery method and point carrier, an order path that keeps (and validates) the point instead of stripping it, and order views that show it. New backend logic lives in small pure modules because `runCheckout` cannot be driven in a unit test. The storefront adds form state plus one pure reconcile module, a point picker inside the existing address step, and "Collect from" lines on the review and order pages.

**Tech Stack:** Backend: Express 5, Drizzle (Postgres), zod 4, vitest. Storefront: React 19, Vite, zod, Mantine, ky, TanStack Query, CSS modules, vitest + Testing Library, Playwright.

**Spec:** `ecommerce-storefront/docs/superpowers/specs/2026-10-04-web-collection-points-design.md`

Two repos under `T:\Projects\ecommerce\`:

- `ecommerce-backend/` on a new branch `feature/web-collection-points` (Tasks 1 to 3).
- `ecommerce-storefront/` on the existing branch `feature/web-collection-points` (Tasks 4 to 8).

## Global Constraints

- Backend: extensionless imports; throw `AppError` subclasses (`ValidationError`), never catch-and-return; no schema change, no migration. Every query inside a transaction uses `tx`.
- Storefront: `@/` alias imports **with** `.ts`/`.tsx` extensions; shopper-visible wording only through editable-text keys with a note and a `max`; no text key may be unreferenced (a registry test fails on orphans). `web/test/helpers/text-inventory.json` is a frozen v0.7.0 record: never edit it.
- `shipping.countries` keeps its meaning (home delivery can be quoted). `shipping.collectionCountries` is the new list. A storefront at v0.14.0 must behave exactly as before against the new backend.
- A quote or order with no `deliveryMethod` / no service point behaves exactly as today.
- The point id is never exposed to the customer on any order view: only `{ name, carrier }`.
- A collection order needs a phone number. When the shop's phone mode is `hidden`, collection is not offered on the web (and the backend rejects it).
- The point's street address is taken from the request; the point id is not re-validated against SendCloud at order time.
- `sf-checkout-v1` stays the persistence key.
- No map library, no geolocation, no new builder part, no admin SPA change.
- Storefront release is `web` 0.15.0, tag `v0.15.0`; run `TZ=UTC npm test` before tagging. Deploy backend first.
- Goldens and DOM baselines are regenerated only in Task 8, only where a diff is fully explained by this plan's intended changes, each diff read in full. Between Task 6 and Task 8 the stored goldens of the address step and review step may be red on purpose; no other test may be red.
- Do not run Docker. Do not push, merge or deploy without the owner's say-so. Do not start the backend dev server or touch any database (the local `.env` points at a live one).
- Git: stage only named files. The storefront working tree is CRLF with LF in the index: keep each file's endings and check `git diff --numstat`. Write files with the Write/Edit tools, not shell heredocs. Type invisible characters as escapes.
- Commit trailers, both lines, on every commit:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01HAtBukqatpqJEquLeqLcz5`
- UI tasks (6 and 7) go to a Sonnet subagent that loads the `frontend-design:frontend-design` skill. Implementers and reviewers on Sonnet; Haiku for small mechanical tasks and tiny re-reviews.

## Review Focus

1. A shopper picks a point, then changes country: the point must be cleared and a stale `servicePointCarrier` must not be sent on the next quote. Test in Task 4.
2. A shopper picks a point, a delivery option, then a different point from another carrier: the delivery option must be cleared, not silently kept and rejected at submit. Test in Task 4.
3. A shopper fills Contact with no phone (optional), then chooses collection: Continue from Contact is no longer the gate, so placing the order must send them back to Contact with the phone marked required. Test in Task 5.
4. A crafted request sends a home-delivery option with a service point, or a collection option whose carrier differs from the point's: the order must be rejected, not created. Tests in Task 2.
5. The point search is slow and the shopper searches again, or changes country mid-search: an older response must never replace a newer one or show points for the wrong country. Test in Task 6.

## File Structure

Backend (`ecommerce-backend/src/`):

| File | Responsibility |
|---|---|
| `modules/shipping/shippable-countries.ts` | Adds `computeCollectionCountries` and the loader `getShippingCountryLists` |
| `modules/storefront-settings/service.ts` | `shipping: { countries, collectionCountries }` |
| `modules/shipping-providers/point-carrier.ts` (new) | `narrowOptionsToCarrier`, `filterOptionsForPointCarrier` (shared by bot and web) |
| `modules/public-storefront/collection.ts` (new) | Pure helpers: delivery args from an address, phone check, address normalising, `projectServicePoint` |
| `modules/public-storefront/schemas.ts`, `checkout.ts` | Quote fields; quote and order wiring |
| `bot/menus/checkout.ts` | Uses the shared filter |
| `modules/public-orders/service.ts`, `modules/public-storefront/account.ts` | `servicePoint` on the two order views |
| `STOREFRONT.md`, `CLAUDE.md` | Contract and notes |

Storefront (`ecommerce-storefront/web/`):

| File | Responsibility |
|---|---|
| `src/types/{settings,checkout,public-order,orders}.ts`, `src/types/service-points.ts` (new) | Types |
| `src/api/service-points.ts` (new) | `searchServicePoints` |
| `src/features/checkout/collection-mode.ts` (new) | Pure: picker countries, mode for a country, reconcile rules, collection address |
| `src/features/checkout/form-state.ts` | Three new form fields |
| `src/features/checkout/useQuote.ts`, `CheckoutPage.tsx`, `schemas.ts` | Quote key, order body, validation, phone requirement |
| `src/features/checkout/usePointSearch.ts`, `PointPicker.tsx` (new), `steps/AddressStep.tsx`, `Fields.module.css` | The switch and the picker |
| `src/features/checkout/steps/ReviewStep.tsx`, `src/features/order-status/AddressCard.tsx`, `src/features/account/OrderDetailPage.tsx` | "Collect from" |
| `src/text/keys/*.ts`, `src/text/notes/*.ts` | Wording |
| `test/*`, `../e2e/*` | Tests, mocks, baselines |

---

### Task 1: Backend `shipping.collectionCountries`

**Repo:** `ecommerce-backend`. Start with `git checkout main && git checkout -b feature/web-collection-points`.

**Files:**
- Modify: `src/modules/shipping/shippable-countries.ts`, `src/modules/shipping/shippable-countries.test.ts`
- Modify: `src/modules/storefront-settings/service.ts` (type `PublicStorefrontSettings`, `safeShippableCountries`, `getPublicStorefrontSettings`)
- Modify: `src/modules/storefront-settings/public-settings.test.ts`; and `bird-verify-settings.test.ts`, `telegram-oidc-settings.test.ts` (add the module mock)
- Modify: `STOREFRONT.md`, `CLAUDE.md`

**Interfaces:**
- Produces: `computeCollectionCountries(serviceable, regions, options, mappings, providerReady): string[]`; `getShippingCountryLists(serviceable): Promise<{ countries: string[]; collectionCountries: string[] }>`. Settings JSON: `shipping: { countries: string[]; collectionCountries: string[] }`. `getShippableCountries` is removed.

- [ ] **Step 1: Write the failing tests**

Append to `src/modules/shipping/shippable-countries.test.ts` (change its import line to `import { computeCollectionCountries, computeShippableCountries } from './shippable-countries';`):

```ts
describe('computeCollectionCountries', () => {
  const cOption = (id: number, regionId: number, over: Partial<{ isActive: boolean; isPublic: boolean; isCollectionPoint: boolean }> = {}) => ({
    id, regionId, isActive: true, isPublic: true, isCollectionPoint: true, ...over,
  });
  const mapping = (shippingOptionId: number, serviceCode = 'inpost:locker', destinationCountries: string | null = null) => ({
    shippingOptionId, serviceCode, destinationCountries,
  });

  it('lists a country with a mapped, public, active collection option', () => {
    expect(computeCollectionCountries([], [region(1, 'GB,IE')], [cOption(10, 1)], [mapping(10)], true)).toEqual(['GB', 'IE']);
  });

  it('is empty when the provider is not ready (missing, disabled or without keys)', () => {
    expect(computeCollectionCountries([], [region(1, 'GB')], [cOption(10, 1)], [mapping(10)], false)).toEqual([]);
  });

  it('needs a mapping for the option', () => {
    expect(computeCollectionCountries([], [region(1, 'GB')], [cOption(10, 1)], [mapping(99)], true)).toEqual([]);
    expect(computeCollectionCountries([], [region(1, 'GB')], [cOption(10, 1)], [], true)).toEqual([]);
  });

  it('a mapping limited to some destinations covers only those', () => {
    expect(computeCollectionCountries([], [region(1, 'GB,IE,FR')], [cOption(10, 1)], [mapping(10, 'inpost:locker', 'gb, ie')], true)).toEqual(['GB', 'IE']);
  });

  it('a mapping with a blank destination list covers every destination', () => {
    expect(computeCollectionCountries([], [region(1, 'GB,FR')], [cOption(10, 1)], [mapping(10, 'inpost:locker', ' , ')], true)).toEqual(['FR', 'GB']);
  });

  it('ignores a mapping whose service code has no carrier', () => {
    expect(computeCollectionCountries([], [region(1, 'GB')], [cOption(10, 1)], [mapping(10, ':locker')], true)).toEqual([]);
  });

  it('skips inactive regions and options that are inactive, hidden or home delivery', () => {
    const regions = [region(1, 'GB', false), region(2, 'FR'), region(3, 'DE'), region(4, 'ES')];
    const options = [cOption(10, 1), cOption(20, 2, { isActive: false }), cOption(30, 3, { isPublic: false }), cOption(40, 4, { isCollectionPoint: false })];
    const mappings = [mapping(10), mapping(20), mapping(30), mapping(40)];
    expect(computeCollectionCountries([], regions, options, mappings, true)).toEqual([]);
  });

  it('is narrowed by the serviceable setting', () => {
    expect(computeCollectionCountries(['GB'], [region(1, 'GB,IE')], [cOption(10, 1)], [mapping(10)], true)).toEqual(['GB']);
  });

  it('does not change what counts as home-deliverable', () => {
    // A region with only a collection option is not in the home list.
    expect(computeShippableCountries([], [region(1, 'GB')], [cOption(10, 1)])).toEqual([]);
  });
});
```

Run: `npx vitest run src/modules/shipping/shippable-countries.test.ts`
Expected: FAIL, `computeCollectionCountries` is not exported.

- [ ] **Step 2: Implement the pure function and the loader**

In `src/modules/shipping/shippable-countries.ts`:

Add imports:

```ts
import { and, eq } from 'drizzle-orm';
import { shippingProviders } from '../../db/schema/shipping-providers';
import { providerServiceMappings } from '../../db/schema/provider-service-mappings';
```

(replace the existing `import { eq } from 'drizzle-orm';`).

Replace the `TEMPORARY` comment block inside `computeShippableCountries` with:

```ts
  // `countries` means "a home delivery can be quoted here", permanently: a
  // storefront that predates web collection points lists exactly these and can
  // only order home delivery. Collection-only countries are reported separately
  // by `computeCollectionCountries`.
```

Add below `computeShippableCountries`:

```ts
export interface CollectionOption extends ShippableOption { id: number }
export interface CollectionMapping { shippingOptionId: number; serviceCode: string; destinationCountries: string | null }

/** Does this provider service mapping serve `country`? Mirrors `getOptionCarrierMap`: a carrier must be readable from the service code, and a blank destination list means anywhere. */
function mappingCovers(mapping: CollectionMapping, country: string): boolean {
  if (!mapping.serviceCode.split(':')[0]?.trim()) return false;
  const list = (mapping.destinationCountries ?? '').split(',').map(code).filter(Boolean);
  return list.length === 0 || list.includes(country);
}

/**
 * Countries where the web checkout can offer a collection point: ISO alpha-2,
 * upper-case, sorted. Mirrors `getServicePointContext` (public-storefront/
 * service-points.ts), narrowed by the serviceable setting: an enabled SendCloud
 * provider with keys (`providerReady`), an active region listing the country,
 * and an active, public collection option there with a mapping that serves it.
 * `mappings` must be the ACTIVE mappings of that provider only.
 */
export function computeCollectionCountries(
  serviceable: readonly string[],
  regions: readonly ShippableRegion[],
  options: readonly CollectionOption[],
  mappings: readonly CollectionMapping[],
  providerReady: boolean,
): string[] {
  if (!providerReady) return [];
  const allow = new Set(serviceable.map(code).filter((c) => ISO2.test(c)));
  const out = new Set<string>();
  for (const region of regions) {
    if (!region.isActive) continue;
    const collection = options.filter((o) => o.regionId === region.id && o.isActive && o.isPublic && o.isCollectionPoint);
    if (collection.length === 0) continue;
    for (const raw of region.countryCodes.split(',')) {
      const c = code(raw);
      if (!ISO2.test(c)) continue;
      if (allow.size > 0 && !allow.has(c)) continue;
      if (collection.some((o) => mappings.some((m) => m.shippingOptionId === o.id && mappingCovers(m, c)))) out.add(c);
    }
  }
  return [...out].sort();
}

/** An enabled SendCloud provider whose config has both keys, exactly as the service-point search requires. */
function sendcloudReady(config: string | null | undefined): boolean {
  try {
    const parsed = JSON.parse(config || '{}') as Record<string, string>;
    return Boolean(parsed.publicKey?.trim()) && Boolean(parsed.secretKey?.trim());
  } catch {
    return false;
  }
}
```

Replace `getShippableCountries` with:

```ts
/** `serviceable` is the store's serviceable-countries setting (empty = all). */
export async function getShippingCountryLists(
  serviceable: readonly string[],
): Promise<{ countries: string[]; collectionCountries: string[] }> {
  const [regions, options, providers, mappings] = await Promise.all([
    db
      .select({ id: shippingRegions.id, countryCodes: shippingRegions.countryCodes, isActive: shippingRegions.isActive })
      .from(shippingRegions)
      .where(eq(shippingRegions.isActive, true)),
    db
      .select({
        id: shippingOptions.id,
        regionId: shippingOptions.regionId,
        isActive: shippingOptions.isActive,
        isPublic: shippingOptions.isPublic,
        isCollectionPoint: shippingOptions.isCollectionPoint,
      })
      .from(shippingOptions)
      .where(eq(shippingOptions.isActive, true)),
    db
      .select({ config: shippingProviders.config })
      .from(shippingProviders)
      .where(and(eq(shippingProviders.name, 'sendcloud'), eq(shippingProviders.enabled, true)))
      .limit(1),
    db
      .select({
        shippingOptionId: providerServiceMappings.shippingOptionId,
        serviceCode: providerServiceMappings.serviceCode,
        destinationCountries: providerServiceMappings.destinationCountries,
      })
      .from(providerServiceMappings)
      .innerJoin(shippingProviders, eq(shippingProviders.id, providerServiceMappings.providerId))
      .where(
        and(
          eq(providerServiceMappings.isActive, true),
          eq(shippingProviders.enabled, true),
          eq(shippingProviders.name, 'sendcloud'),
        ),
      ),
  ]);
  const providerReady = providers.length > 0 && sendcloudReady(providers[0]!.config);
  return {
    countries: computeShippableCountries(serviceable, regions, options),
    collectionCountries: computeCollectionCountries(serviceable, regions, options, mappings, providerReady),
  };
}
```

Run: `npx vitest run src/modules/shipping/shippable-countries.test.ts`
Expected: PASS (the 9 existing cases and the 9 new ones).

- [ ] **Step 3: Write the failing settings tests**

In `src/modules/storefront-settings/public-settings.test.ts`:

- Change the hoisted `shippable` mock to return both lists and rename the mocked export:

```ts
  shippable: (async () => ({ countries: ['GB', 'IE'], collectionCountries: ['GB'] })) as
    (serviceable: readonly string[]) => Promise<{ countries: string[]; collectionCountries: string[] }>,
```

```ts
vi.mock('../shipping/shippable-countries', () => ({
  getShippingCountryLists: (serviceable: readonly string[]) => mocks.shippable(serviceable),
}));
```

- In `beforeEach`: `mocks.shippable = async () => ({ countries: ['GB', 'IE'], collectionCountries: ['GB'] });`
- In the existing "carries the shippable countries" test, make the local override return `{ countries: ['GB', 'IE'], collectionCountries: ['GB'] }` and change the assertion to `expect(shipping).toEqual({ countries: ['GB', 'IE'], collectionCountries: ['GB'] });`
- In the existing failing-lookup test change the assertion to `expect(shipping).toEqual({ countries: [], collectionCountries: [] });`

In `bird-verify-settings.test.ts` and `telegram-oidc-settings.test.ts`, add beside their other `vi.mock` calls (this stops those two files issuing real database queries, a loose end from the previous release):

```ts
vi.mock('../shipping/shippable-countries', () => ({
  getShippingCountryLists: async () => ({ countries: [], collectionCountries: [] }),
}));
```

Run: `npx vitest run src/modules/storefront-settings`
Expected: FAIL (the service still imports `getShippableCountries`).

- [ ] **Step 4: Implement in the settings service**

In `src/modules/storefront-settings/service.ts`:

- Import: `import { getShippingCountryLists } from '../shipping/shippable-countries';`
- Type: replace the `shipping` member of `PublicStorefrontSettings` with:

```ts
  /**
   * Where a web checkout can deliver (ISO alpha-2, sorted). `countries`: a home delivery can be quoted.
   * `collectionCountries`: a collection point can be offered. Both empty = unknown: the storefront lists every country.
   */
  shipping: { countries: string[]; collectionCountries: string[] };
```

- Replace `safeShippableCountries` with:

```ts
/** The settings response must answer even if this lookup fails: empty lists make the storefront list every country and offer no collection. */
async function safeShippingCountryLists(serviceable: readonly string[]): Promise<{ countries: string[]; collectionCountries: string[] }> {
  try {
    return await getShippingCountryLists(serviceable);
  } catch (err) {
    logger.warn({ err }, 'Shipping-countries lookup failed; the storefront will list every country and offer no collection');
    return { countries: [], collectionCountries: [] };
  }
}
```

- In `getPublicStorefrontSettings`: `const shippingCountries = await safeShippingCountryLists(serviceableCountries ?? []);` and in the returned object `shipping: shippingCountries,`.

Run: `npx vitest run src/modules/storefront-settings && npm test && npx tsc --noEmit`
Expected: all PASS, typecheck clean, and no warning lines from `storefront-settings` in the test output.

- [ ] **Step 5: Document**

`STOREFRONT.md`: in the `GET /settings` example change the `shipping` line to `"shipping": { "countries": ["GB", "IE"], "collectionCountries": ["GB"] },` and replace the paragraph that begins `` `shipping.countries` lists where a web checkout can deliver `` with:

```markdown
`shipping.countries` lists where a home delivery can be quoted: every country in an active shipping region that has at least one active, customer-visible, home-delivery option, narrowed by `serviceableCountries` when that is set. `shipping.collectionCountries` lists where a collection point can be offered: an active region with an active, customer-visible collection option that is mapped to a carrier on an enabled SendCloud provider, narrowed the same way; it matches what `GET /service-points?country=XX` reports as `available`. Offer the union in the checkout country picker when `countries` is not empty. Both lists are the same for every visitor (customer-group shipping rules are not applied), so the quote stays the authority. Empty lists, or a missing `shipping` (older backend), mean unknown: list every country and offer no collection.
```

`CLAUDE.md`: in the Settings bullet replace the sentence added for `shipping.countries` (from `` `GET /public/storefront/settings` additionally exposes `shipping.countries` `` to the end of that bullet) with:

```markdown
 `GET /public/storefront/settings` additionally exposes `shipping.countries` (home delivery can be quoted) and `shipping.collectionCountries` (a collection point can be offered), both from `modules/shipping/shippable-countries.ts`. `countries` keeps that meaning permanently: storefronts older than v0.15.0 list exactly those.
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/shipping/shippable-countries.ts src/modules/shipping/shippable-countries.test.ts src/modules/storefront-settings/service.ts src/modules/storefront-settings/public-settings.test.ts src/modules/storefront-settings/bird-verify-settings.test.ts src/modules/storefront-settings/telegram-oidc-settings.test.ts STOREFRONT.md CLAUDE.md
git commit -m "feat(storefront-settings): shipping.collectionCountries, where a collection point can be offered"
```

---

### Task 2: Backend quote and order accept a collection point

**Files:**
- Create: `src/modules/shipping-providers/point-carrier.ts`, `src/modules/shipping-providers/point-carrier.test.ts`
- Create: `src/modules/public-storefront/collection.ts`, `src/modules/public-storefront/collection.test.ts`
- Create: `src/modules/public-storefront/checkout-collection.test.ts`
- Modify: `src/modules/public-storefront/schemas.ts` (`checkoutQuoteSchema`, near line 114)
- Modify: `src/modules/public-storefront/checkout.ts` (`buildQuote` shipping block near line 328; `runCheckout` near lines 648-660 and 779-797; `getGuestCheckoutQuote` near line 993)
- Modify: `src/bot/menus/checkout.ts` (`loadCheckoutShippingOptions`, near line 568)
- Modify: `STOREFRONT.md`, `CLAUDE.md`

**Interfaces:**
- Produces: `narrowOptionsToCarrier<T extends { id: number }>(options: T[], carrierMap: Map<number, string[]>, carrier: string): T[]`; `filterOptionsForPointCarrier<T extends { id: number }>(options: T[], country: string, carrier: string | null | undefined): Promise<T[]>`; in `collection.ts`: `deliveryArgsForAddress`, `assertCollectionPhone`, `normaliseCollectionAddress`, `projectServicePoint` (used by Task 3). Quote input gains `deliveryMethod?: 'home' | 'collection'` and `servicePointCarrier?: string`.

- [ ] **Step 1: Write the failing tests for the shared filter**

Create `src/modules/shipping-providers/point-carrier.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ map: new Map<number, string[]>(), calls: [] as Array<{ ids: number[]; country?: string }> }));
vi.mock('./service', () => ({
  getOptionCarrierMap: async (ids: number[], country?: string) => { mocks.calls.push({ ids, country }); return mocks.map; },
}));

import { filterOptionsForPointCarrier, narrowOptionsToCarrier } from './point-carrier';

const options = [{ id: 1, name: 'InPost' }, { id: 2, name: 'Evri' }, { id: 3, name: 'Unmapped' }];

beforeEach(() => {
  mocks.map = new Map([[1, ['inpost']], [2, ['evri', 'inpost']]]);
  mocks.calls = [];
});

describe('narrowOptionsToCarrier', () => {
  it('keeps the options mapped to the carrier', () => {
    expect(narrowOptionsToCarrier(options, mocks.map, 'evri').map((o) => o.id)).toEqual([2]);
    expect(narrowOptionsToCarrier(options, mocks.map, 'inpost').map((o) => o.id)).toEqual([1, 2]);
  });
  it('matches the carrier whatever its case or padding', () => {
    expect(narrowOptionsToCarrier(options, mocks.map, '  InPost ').map((o) => o.id)).toEqual([1, 2]);
  });
  it('drops an option with no mapping', () => {
    expect(narrowOptionsToCarrier(options, mocks.map, 'dpd')).toEqual([]);
  });
});

describe('filterOptionsForPointCarrier', () => {
  it('looks the carriers up for the country and narrows', async () => {
    expect((await filterOptionsForPointCarrier(options, 'GB', 'evri')).map((o) => o.id)).toEqual([2]);
    expect(mocks.calls).toEqual([{ ids: [1, 2, 3], country: 'GB' }]);
  });
  it('returns the options untouched, with no lookup, when there is no carrier', async () => {
    for (const carrier of [null, undefined, '', '   ']) expect(await filterOptionsForPointCarrier(options, 'GB', carrier)).toBe(options);
    expect(mocks.calls).toEqual([]);
  });
  it('does no lookup for an empty list', async () => {
    expect(await filterOptionsForPointCarrier([], 'GB', 'evri')).toEqual([]);
    expect(mocks.calls).toEqual([]);
  });
});
```

Run: `npx vitest run src/modules/shipping-providers/point-carrier.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 2: Implement the shared filter**

Create `src/modules/shipping-providers/point-carrier.ts`:

```ts
import { getOptionCarrierMap } from './service';

/** The options a parcel for a point of `carrier` can use, given the option → carriers map. */
export function narrowOptionsToCarrier<T extends { id: number }>(
  options: T[],
  carrierMap: Map<number, string[]>,
  carrier: string,
): T[] {
  const wanted = carrier.trim().toLowerCase();
  return options.filter((o) => (carrierMap.get(o.id) ?? []).includes(wanted));
}

/**
 * Collection options narrowed to the chosen point's carrier. The one place the
 * bot checkout and the web checkout decide which delivery options suit a point,
 * so the two channels cannot drift. No carrier (no point picked yet) = no
 * narrowing.
 */
export async function filterOptionsForPointCarrier<T extends { id: number }>(
  options: T[],
  country: string,
  carrier: string | null | undefined,
): Promise<T[]> {
  if (!carrier || !carrier.trim() || options.length === 0) return options;
  const carrierMap = await getOptionCarrierMap(options.map((o) => o.id), country);
  return narrowOptionsToCarrier(options, carrierMap, carrier);
}
```

Run: `npx vitest run src/modules/shipping-providers/point-carrier.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing tests for the pure checkout helpers**

Create `src/modules/public-storefront/collection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../utils/errors';
import { assertCollectionPhone, deliveryArgsForAddress, normaliseCollectionAddress, projectServicePoint } from './collection';

const home = { firstName: 'Ada', surname: 'Sterling', addressLine1: '14 Kirkgate', city: 'Leeds', zip: 'LS1 6BY', country: 'GB' };
const point = { ...home, servicePointId: ' 12345 ', servicePointCarrier: ' InPost ', servicePointName: ' Tesco Express ' };

describe('deliveryArgsForAddress', () => {
  it('a plain address is a home delivery', () => {
    expect(deliveryArgsForAddress(home)).toEqual({ deliveryMethod: 'home' });
    expect(deliveryArgsForAddress({ ...home, servicePointId: null, servicePointCarrier: null, servicePointName: null })).toEqual({ deliveryMethod: 'home' });
  });
  it('a service point is a collection, with the carrier lower-cased and trimmed', () => {
    expect(deliveryArgsForAddress(point)).toEqual({ deliveryMethod: 'collection', servicePointCarrier: 'inpost' });
  });
  it('rejects a point with a blank id, carrier or name', () => {
    for (const bad of [{ servicePointId: '  ' }, { servicePointCarrier: '' }, { servicePointName: ' ' }]) {
      expect(() => deliveryArgsForAddress({ ...point, ...bad })).toThrow(ValidationError);
    }
  });
});

describe('assertCollectionPhone', () => {
  it('a collection order needs a phone', () => {
    expect(() => assertCollectionPhone(point, undefined)).toThrow('A phone number is needed for collection');
    expect(() => assertCollectionPhone(point, '+447801123456')).not.toThrow();
  });
  it('a home order does not', () => {
    expect(() => assertCollectionPhone(home, undefined)).not.toThrow();
  });
});

describe('normaliseCollectionAddress', () => {
  it('trims the point fields and lower-cases the carrier', () => {
    expect(normaliseCollectionAddress(point)).toMatchObject({
      addressLine1: '14 Kirkgate', servicePointId: '12345', servicePointCarrier: 'inpost', servicePointName: 'Tesco Express',
    });
  });
  it('a home address carries null point fields', () => {
    expect(normaliseCollectionAddress(home)).toMatchObject({ servicePointId: null, servicePointCarrier: null, servicePointName: null });
  });
});

describe('projectServicePoint', () => {
  it('exposes the name and carrier, never the id', () => {
    expect(projectServicePoint({ servicePointId: '12345', servicePointCarrier: 'inpost', servicePointName: 'Tesco Express' }))
      .toEqual({ name: 'Tesco Express', carrier: 'inpost' });
  });
  it('is null for a home address, a missing address or an incomplete point', () => {
    expect(projectServicePoint(home)).toBeNull();
    expect(projectServicePoint(null)).toBeNull();
    expect(projectServicePoint({ servicePointId: '1', servicePointCarrier: 'inpost', servicePointName: null })).toBeNull();
  });
});
```

Run: `npx vitest run src/modules/public-storefront/collection.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement the pure helpers**

Create `src/modules/public-storefront/collection.ts`:

```ts
// Collection points on the web checkout: the decisions that can be made from the
// submitted address alone. Pure on purpose (no db, no env import): `runCheckout`
// cannot be driven in a unit test, so everything it decides about a collection
// order lives here where it can be.
import { ValidationError } from '../../utils/errors';

interface PointFields {
  servicePointId?: string | null;
  servicePointCarrier?: string | null;
  servicePointName?: string | null;
}

export type DeliveryArgs =
  | { deliveryMethod: 'home' }
  | { deliveryMethod: 'collection'; servicePointCarrier: string };

const clean = (v: string | null | undefined) => v?.trim() ?? '';

/**
 * What to quote for an order's address. A service point means collection, the
 * same way the bot decides it. The request schema guarantees all three point
 * fields come together but not that they are non-blank, and a blank carrier
 * would skip the carrier check, so blanks are refused here.
 */
export function deliveryArgsForAddress(address: PointFields): DeliveryArgs {
  if (address.servicePointId == null) return { deliveryMethod: 'home' };
  const carrier = clean(address.servicePointCarrier).toLowerCase();
  if (!clean(address.servicePointId) || !carrier || !clean(address.servicePointName)) {
    throw new ValidationError('The collection point is incomplete');
  }
  return { deliveryMethod: 'collection', servicePointCarrier: carrier };
}

/** Carriers text the pick-up code, so a collection order needs a number. With the shop's phone field hidden there is none, and collection is refused. */
export function assertCollectionPhone(address: PointFields, phone: string | undefined): void {
  if (address.servicePointId != null && !phone) throw new ValidationError('A phone number is needed for collection');
}

/** The address as `createOrder` should store it: point fields trimmed and the carrier lower-cased (the form the option → carrier map uses), or null for a home delivery. */
export function normaliseCollectionAddress<T extends PointFields>(address: T): T & { servicePointId: string | null; servicePointCarrier: string | null; servicePointName: string | null } {
  if (address.servicePointId == null) {
    return { ...address, servicePointId: null, servicePointCarrier: null, servicePointName: null };
  }
  return {
    ...address,
    servicePointId: clean(address.servicePointId),
    servicePointCarrier: clean(address.servicePointCarrier).toLowerCase(),
    servicePointName: clean(address.servicePointName),
  };
}

/** What a customer may see of the point they chose. The id is the label's routing key and is never exposed. */
export function projectServicePoint(address: PointFields | null | undefined): { name: string; carrier: string } | null {
  const name = clean(address?.servicePointName);
  const carrier = clean(address?.servicePointCarrier);
  if (!address || !clean(address.servicePointId) || !name || !carrier) return null;
  return { name, carrier };
}
```

Run: `npx vitest run src/modules/public-storefront/collection.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing wiring and schema tests**

Create `src/modules/public-storefront/checkout-collection.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkoutQuoteSchema, guestCheckoutQuoteSchema, placeStorefrontOrderSchema } from './schemas';

// `runCheckout` and `buildQuote` are not exported and need a full cart, quote and gateway to drive, so (as
// checkout-contact-capture.test.ts does) the wiring is pinned on the source, and the decisions themselves are
// unit-tested in collection.test.ts and shipping-providers/point-carrier.test.ts.
describe('storefront checkout collection wiring', () => {
  const checkout = readFileSync(join(process.cwd(), 'src/modules/public-storefront/checkout.ts'), 'utf8');
  const bot = readFileSync(join(process.cwd(), 'src/bot/menus/checkout.ts'), 'utf8');

  it('the quote no longer pins home delivery and narrows collection options by the point carrier', () => {
    expect(checkout).not.toMatch(/deliveryMethod: 'home',/);
    expect(checkout).toMatch(/filterOptionsForPointCarrier\(/);
  });

  it('the order derives its delivery method from the address, checks the phone, and stores the normalised address', () => {
    expect(checkout).toMatch(/deliveryArgsForAddress\(input\.shippingAddress\)/);
    expect(checkout).toMatch(/assertCollectionPhone\(input\.shippingAddress, customerPhone\)/);
    expect(checkout).toMatch(/shippingAddress: normaliseCollectionAddress\(input\.shippingAddress\)/);
    expect(checkout).not.toMatch(/homeOnlyShippingAddress/);
  });

  it('the guest quote forwards the delivery fields', () => {
    expect(checkout).toMatch(/deliveryMethod: input\.deliveryMethod, servicePointCarrier: input\.servicePointCarrier/);
  });

  it('the bot uses the same carrier filter', () => {
    expect(bot).toMatch(/filterOptionsForPointCarrier\(/);
    expect(bot).not.toMatch(/carrierMap\.get\(o\.id\)/);
  });
});

describe('checkout quote schema', () => {
  it('a request with no delivery fields parses as before', () => {
    expect(checkoutQuoteSchema.parse({ country: 'gb' })).toEqual({ country: 'GB' });
  });
  it('accepts a delivery method and normalises the carrier', () => {
    expect(checkoutQuoteSchema.parse({ country: 'GB', deliveryMethod: 'collection', servicePointCarrier: ' InPost ' }))
      .toEqual({ country: 'GB', deliveryMethod: 'collection', servicePointCarrier: 'inpost' });
  });
  it('rejects an unknown delivery method, a blank carrier and an over-long one', () => {
    expect(checkoutQuoteSchema.safeParse({ deliveryMethod: 'drone' }).success).toBe(false);
    expect(checkoutQuoteSchema.safeParse({ servicePointCarrier: '  ' }).success).toBe(false);
    expect(checkoutQuoteSchema.safeParse({ servicePointCarrier: 'x'.repeat(65) }).success).toBe(false);
  });
  it('the guest quote schema carries the same fields', () => {
    const parsed = guestCheckoutQuoteSchema.parse({
      turnstileToken: 't', items: [{ productId: 1, quantity: 1 }], deliveryMethod: 'collection', servicePointCarrier: 'evri',
    });
    expect(parsed).toMatchObject({ deliveryMethod: 'collection', servicePointCarrier: 'evri' });
  });
  it('an order still requires the three point fields together', () => {
    const base = { shippingOptionId: 1, shippingAddress: { firstName: 'A', surname: 'B', addressLine1: '1', city: 'C', zip: 'Z', country: 'GB' } };
    expect(placeStorefrontOrderSchema.safeParse(base).success).toBe(true);
    expect(placeStorefrontOrderSchema.safeParse({ ...base, shippingAddress: { ...base.shippingAddress, servicePointId: '1' } }).success).toBe(false);
    expect(placeStorefrontOrderSchema.safeParse({
      ...base, shippingAddress: { ...base.shippingAddress, servicePointId: '1', servicePointCarrier: 'inpost', servicePointName: 'Tesco' },
    }).success).toBe(true);
  });
});
```

Run: `npx vitest run src/modules/public-storefront/checkout-collection.test.ts`
Expected: FAIL (wiring assertions and the new schema fields).

- [ ] **Step 6: Extend the quote schema**

In `src/modules/public-storefront/schemas.ts`, replace `checkoutQuoteSchema` with:

```ts
export const checkoutQuoteSchema = z.object({
  country: countryCodeSchema.optional(),
  couponCode: couponCodeSchema.optional(),
  shippingOptionId: z.number().int().positive().optional(),
  useStoreCredit: z.boolean().optional(),
  /** Omitted = home, which is what a storefront that predates web collection points sends. */
  deliveryMethod: z.enum(['home', 'collection']).optional(),
  /** The chosen point's carrier; with `collection` it narrows the options to that carrier. */
  servicePointCarrier: z.string().trim().min(1).max(64).toLowerCase().optional(),
});
```

`guestCheckoutQuoteSchema` derives from it and needs no edit.

- [ ] **Step 7: Wire the quote**

In `src/modules/public-storefront/checkout.ts`:

Add imports:

```ts
import { filterOptionsForPointCarrier } from '../shipping-providers/point-carrier';
import { assertCollectionPhone, deliveryArgsForAddress, normaliseCollectionAddress } from './collection';
```

In `buildQuote`, replace the `const shippingOptions = input.country ? await getCheckoutOptions(…) : [];` statement (including its comment about the service-point picker) with:

```ts
  // Home unless the shopper chose a collection point. An omitted method is home,
  // which is all a storefront older than web collection points ever asks for.
  const deliveryMethod = input.deliveryMethod ?? 'home';
  const offeredOptions = input.country
    ? await getCheckoutOptions(input.country, effectiveSubtotal, {
        publicOnly: true,
        eligibleItemCount,
        deliveryMethod,
        groupId,
        freeShippingGranted: priced.freeShippingGranted,
      })
    : [];
  // A point is served by one carrier; only that carrier's options can deliver to it.
  const shippingOptions = input.country && deliveryMethod === 'collection'
    ? await filterOptionsForPointCarrier(offeredOptions, input.country, input.servicePointCarrier)
    : offeredOptions;
```

In `getGuestCheckoutQuote`, replace the object passed to `buildQuote` with:

```ts
    country: input.country, couponCode: input.couponCode, shippingOptionId: input.shippingOptionId,
    deliveryMethod: input.deliveryMethod, servicePointCarrier: input.servicePointCarrier,
```

- [ ] **Step 8: Wire the order**

In `runCheckout`:

Replace the `const quote = await buildQuote(source, {…});` call with:

```ts
  // A service point on the address means collection, exactly as the bot decides it.
  // Quoting with the point's carrier is what enforces "this option can deliver to
  // this point": a selected option outside the returned list is rejected by buildQuote.
  const delivery = deliveryArgsForAddress(input.shippingAddress);
  const quote = await buildQuote(source, {
    country,
    couponCode: input.couponCode,
    shippingOptionId: input.shippingOptionId,
    useStoreCredit: input.useStoreCredit,
    ...delivery,
  });
```

Directly after the `const customerPhone = resolveContactField(…);` line add:

```ts
  assertCollectionPhone(input.shippingAddress, customerPhone);
```

Delete the comment block that begins `// The web storefront has no service-point picker UI yet` and the `const { servicePointId: _spId, … homeOnlyShippingAddress } = input.shippingAddress;` statement below it. In the `createOrder({…})` call replace `shippingAddress: homeOnlyShippingAddress,` with:

```ts
      shippingAddress: normaliseCollectionAddress(input.shippingAddress),
```

- [ ] **Step 9: Use the shared filter in the bot**

In `src/bot/menus/checkout.ts`, in `loadCheckoutShippingOptions`, replace:

```ts
  if (deliveryMethod === 'collection' && servicePointCarrier) {
    const carrierMap = await getOptionCarrierMap(options.map((o) => o.id), country);
    options = options.filter((o) => (carrierMap.get(o.id) ?? []).includes(servicePointCarrier));
  }
```

with:

```ts
  if (deliveryMethod === 'collection') {
    options = await filterOptionsForPointCarrier(options, country, servicePointCarrier);
  }
```

Add `import { filterOptionsForPointCarrier } from '../../modules/shipping-providers/point-carrier';` and remove `getOptionCarrierMap` from this file's imports if nothing else in the file uses it (search the file first).

- [ ] **Step 10: Run everything**

Run: `npx vitest run src/modules/public-storefront src/modules/shipping-providers`
Expected: PASS.

Run: `npm test && npx tsc --noEmit`
Expected: PASS, clean. `checkout-contact-capture.test.ts` must still pass (it pins `captureCustomerContact: false`).

- [ ] **Step 11: Document**

`STOREFRONT.md`, in the checkout section (search for `checkout/quote`): add to the quote request description that it accepts `deliveryMethod` (`"home"` default, or `"collection"`) and `servicePointCarrier`, that a collection quote returns only collection options (narrowed to the carrier when given), and that `POST /checkout` and `POST /checkout/guest` accept `servicePointId`, `servicePointCarrier`, `servicePointName` together inside `shippingAddress`, with the address fields holding the point's street address and the shopper's own name; that such an order needs a phone number (`422 A phone number is needed for collection`) and a delivery option that serves the point's carrier (`422 The selected shipping option is not available for this order`).

`CLAUDE.md`, in the Collection points passage of the Shipping bullet: replace the statement that the web checkout is home-only (search `deliveryMethod: 'home'` and "strip") with: the web checkout derives the method from the submitted address (`public-storefront/collection.ts`), quotes with the point's carrier, and both channels narrow options through `shipping-providers/point-carrier.ts`.

- [ ] **Step 12: Commit**

```bash
git add src/modules/shipping-providers/point-carrier.ts src/modules/shipping-providers/point-carrier.test.ts src/modules/public-storefront/collection.ts src/modules/public-storefront/collection.test.ts src/modules/public-storefront/checkout-collection.test.ts src/modules/public-storefront/schemas.ts src/modules/public-storefront/checkout.ts src/bot/menus/checkout.ts STOREFRONT.md CLAUDE.md
git commit -m "feat(storefront): web checkout quotes and places collection-point orders; bot and web share the carrier filter"
```

---

### Task 3: Backend order views show the collection point

**Files:**
- Modify: `src/modules/public-orders/service.ts` (the `shippingAddress` projection, near line 209)
- Modify: `src/modules/public-storefront/account.ts` (`StorefrontOrderDetail`, `getStorefrontOrderDetail`)
- Create: `src/modules/public-storefront/order-view-service-point.test.ts`
- Modify: `STOREFRONT.md`

**Interfaces:**
- Consumes: `projectServicePoint` from `src/modules/public-storefront/collection.ts` (Task 2).
- Produces: public order `shippingAddress.servicePoint: { name: string; carrier: string } | null`; account order detail `servicePoint: { name: string; carrier: string } | null`.

- [ ] **Step 1: Write the failing test**

Create `src/modules/public-storefront/order-view-service-point.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Both views load an order from the database, so (as checkout-contact-capture.test.ts does) the projection is
// pinned on the source; `projectServicePoint` itself is unit-tested in collection.test.ts.
describe('order views expose the collection point, never its id', () => {
  const publicOrders = readFileSync(join(process.cwd(), 'src/modules/public-orders/service.ts'), 'utf8');
  const account = readFileSync(join(process.cwd(), 'src/modules/public-storefront/account.ts'), 'utf8');

  it('the public order view projects servicePoint on the shipping address', () => {
    expect(publicOrders).toMatch(/servicePoint: projectServicePoint\(shippingAddress\)/);
  });

  it('the account order detail projects servicePoint', () => {
    expect(account).toMatch(/servicePoint: projectServicePoint\(/);
  });

  it('neither view returns the raw point fields', () => {
    for (const source of [publicOrders, account]) {
      expect(source).not.toMatch(/servicePointId:/);
      expect(source).not.toMatch(/servicePointCarrier:/);
      expect(source).not.toMatch(/servicePointName:/);
    }
  });
});
```

Run: `npx vitest run src/modules/public-storefront/order-view-service-point.test.ts`
Expected: FAIL on the first two cases.

- [ ] **Step 2: Implement**

In `src/modules/public-orders/service.ts`: add `import { projectServicePoint } from '../public-storefront/collection';` and, in the `shippingAddress` projection, after `country: shippingAddress.country,` add:

```ts
          servicePoint: projectServicePoint(shippingAddress),
```

In `src/modules/public-storefront/account.ts`:

- add imports `import { shippingAddresses } from '../../db/schema/addresses';` and `import { projectServicePoint } from './collection';`
- add to `StorefrontOrderDetail`, after `shipments`:

```ts
  /** The collection point the order goes to, or null for a home delivery. Never the point id. */
  servicePoint: { name: string; carrier: string } | null;
```

- in `getStorefrontOrderDetail`, extend the `Promise.all` with a fifth query and destructure it as `shippingAddress`:

```ts
    db.select().from(shippingAddresses).where(eq(shippingAddresses.orderId, order.id)).limit(1).then((rows) => rows[0] ?? null),
```

- in the returned object, before `publicUrl`, add:

```ts
    servicePoint: projectServicePoint(shippingAddress),
```

- [ ] **Step 3: Run**

Run: `npx vitest run src/modules/public-storefront/order-view-service-point.test.ts && npm test && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 4: Document and commit**

`STOREFRONT.md`: in the public order response and the account order detail response descriptions, add `servicePoint: { name, carrier } | null` (on `shippingAddress` for the public order; top-level for the account order), noting the id is never returned and that it is set for collection orders from any channel.

```bash
git add src/modules/public-orders/service.ts src/modules/public-storefront/account.ts src/modules/public-storefront/order-view-service-point.test.ts STOREFRONT.md
git commit -m "feat(orders): customer order views show the collection point's name and carrier"
```

---

### Task 4: Storefront types, point search client, form state and delivery rules

**Repo:** `ecommerce-storefront`, branch `feature/web-collection-points`. Run vitest/tsc from `web/`.

**Files:**
- Create: `web/src/types/service-points.ts`, `web/src/api/service-points.ts`
- Create: `web/src/features/checkout/collection-mode.ts`, `web/test/collection-mode.test.ts`
- Modify: `web/src/types/settings.ts`, `web/src/types/checkout.ts`, `web/src/types/public-order.ts`, `web/src/types/orders.ts`
- Modify: `web/src/features/checkout/form-state.ts`
- Modify: `web/test/checkout-form-state.test.ts`

**Interfaces:**
- Produces:
  - `ServicePoint`, `ServicePointSearch` types; `searchServicePoints(country: string, postalCode: string, signal?: AbortSignal): Promise<ServicePointSearch>`.
  - `CheckoutForm.deliveryMethod: 'home' | 'collection'`, `.servicePoint: ServicePoint | null`, `.pointPostcode: string`.
  - In `collection-mode.ts`: `ShipLists`, `shipListsOf(settings)`, `pickerCountries(lists)`, `CountryMode`, `modeForCountry(country, lists, phoneMode)`, `reconcileDelivery(prev, next, lists, phoneMode)`, `quoteDeliveryFields(form)`, `collectionAddress(form)`.

- [ ] **Step 1: Types**

Create `web/src/types/service-points.ts`:

```ts
/** A carrier pick-up point, as `GET storefront/service-points` returns it. */
export interface ServicePoint {
  id: string;
  carrier: string;
  name: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  /** Metres from the searched postcode, when the carrier reports it. */
  distance: number | null;
}
export interface ServicePointSearch { available: boolean; carriers: string[]; points: ServicePoint[] }
```

In `web/src/types/settings.ts`, replace the `shipping?` member of `StorefrontSettings` with:

```ts
  /**
   * Where the shop can deliver (ISO alpha-2). `countries`: home delivery. `collectionCountries`: a collection
   * point can be offered. Missing (older backend) or empty `countries` = unknown: list every country.
   */
  shipping?: { countries: string[]; collectionCountries?: string[] };
```

In `web/src/types/checkout.ts`:

- `QuoteInput` becomes `{ country?: string; couponCode?: string; shippingOptionId?: number; useStoreCredit?: boolean; deliveryMethod?: 'home' | 'collection'; servicePointCarrier?: string }`.
- `ShippingAddressInput` gains `servicePointId?: string | null; servicePointCarrier?: string | null; servicePointName?: string | null;`.

In `web/src/types/public-order.ts`, add to `ShippingAddress`: `/** The collection point this order goes to; absent on an older backend. */ servicePoint?: { name: string; carrier: string } | null;`

In `web/src/types/orders.ts`, add to `OrderDetail`: `servicePoint?: { name: string; carrier: string } | null;`

- [ ] **Step 2: API client**

Create `web/src/api/service-points.ts`:

```ts
import { api, unwrap } from '@/api/client.ts';
import type { ServicePointSearch } from '@/types/service-points.ts';

/**
 * Collection points near a postcode. The backend limits this to 60 requests per
 * 15 minutes per shopper and answers `429` beyond that, and `502` when the
 * carrier lookup is down; both arrive as an `ApiError` carrying that status.
 * Never retried: a retry would spend the shopper's allowance twice.
 */
export const searchServicePoints = (country: string, postalCode: string, signal?: AbortSignal) =>
  unwrap<ServicePointSearch>(api.get('storefront/service-points', { searchParams: { country, postalCode }, signal, retry: 0 }));
```

- [ ] **Step 3: Write the failing tests**

Create `web/test/collection-mode.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_FORM, type CheckoutForm } from '@/features/checkout/form-state.ts';
import {
  collectionAddress, modeForCountry, pickerCountries, quoteDeliveryFields, reconcileDelivery, shipListsOf,
} from '@/features/checkout/collection-mode.ts';
import type { ServicePoint } from '@/types/service-points.ts';

const point = (over: Partial<ServicePoint> = {}): ServicePoint => ({
  id: '12345', carrier: 'inpost', name: 'Tesco Express', street: 'Kirkgate', houseNumber: '14', postalCode: 'LS1 6BY',
  city: 'Leeds', country: 'GB', latitude: null, longitude: null, distance: 300, ...over,
});
const lists = { home: ['GB', 'IE'], collection: ['GB', 'FR'] };
const form = (over: Partial<CheckoutForm> = {}): CheckoutForm => ({ ...DEFAULT_FORM, ...over });

describe('shipListsOf', () => {
  it('normalises both lists and tolerates an older backend', () => {
    expect(shipListsOf({ shipping: { countries: ['gb', 'GB', 'x'], collectionCountries: [' fr '] } })).toEqual({ home: ['GB'], collection: ['FR'] });
    expect(shipListsOf({ shipping: { countries: ['GB'] } })).toEqual({ home: ['GB'], collection: [] });
    expect(shipListsOf({})).toEqual({ home: [], collection: [] });
  });
});

describe('pickerCountries', () => {
  it('is the union, home first, each country once', () => {
    expect(pickerCountries(lists)).toEqual(['GB', 'IE', 'FR']);
  });
  it('is empty (list every country) while the home list is unknown', () => {
    expect(pickerCountries({ home: [], collection: ['FR'] })).toEqual([]);
  });
});

describe('modeForCountry', () => {
  it.each([
    ['GB', 'choice'],      // in both
    ['FR', 'collection'],  // collection only
    ['IE', 'home'],        // home only
    ['DE', 'home'],        // in neither
    ['', 'home'],          // nothing chosen
  ] as const)('%s → %s', (country, mode) => {
    expect(modeForCountry(country, lists, 'optional')).toBe(mode);
  });
  it('with the home list unknown, a collection country offers the choice', () => {
    expect(modeForCountry('FR', { home: [], collection: ['FR'] }, 'optional')).toBe('choice');
    expect(modeForCountry('GB', { home: [], collection: ['FR'] }, 'optional')).toBe('home');
  });
  it('a shop that hides the phone field offers no collection', () => {
    expect(modeForCountry('GB', lists, 'hidden')).toBe('home');
    expect(modeForCountry('FR', lists, 'hidden')).toBe('home');
  });
});

describe('reconcileDelivery', () => {
  const run = (prev: CheckoutForm, patch: Partial<CheckoutForm>, phoneMode: 'hidden' | 'optional' | 'required' = 'optional') =>
    reconcileDelivery(prev, { ...prev, ...patch }, lists, phoneMode);

  it('returns the same object when nothing needs changing', () => {
    const next = form({ country: 'GB', addressLine1: '1 High St' });
    expect(reconcileDelivery(form({ country: 'GB' }), next, lists, 'optional')).toBe(next);
  });

  it('changing the country clears the point and the delivery option', () => {
    const prev = form({ country: 'GB', deliveryMethod: 'collection', servicePoint: point(), shippingOptionId: 7 });
    const out = run(prev, { country: 'FR' });
    expect(out.servicePoint).toBeNull();
    expect(out.shippingOptionId).toBeNull();
  });

  it('a collection-only country forces collection; a home-only one forces home', () => {
    expect(run(form({ country: 'GB' }), { country: 'FR' }).deliveryMethod).toBe('collection');
    expect(run(form({ country: 'GB', deliveryMethod: 'collection' }), { country: 'IE' }).deliveryMethod).toBe('home');
  });

  it('a country with both keeps what the shopper chose', () => {
    expect(run(form({ country: 'GB' }), { deliveryMethod: 'collection' }).deliveryMethod).toBe('collection');
  });

  it('switching method clears the delivery option but keeps the home address and the point', () => {
    const prev = form({ country: 'GB', addressLine1: '1 High St', city: 'Leeds', servicePoint: point(), shippingOptionId: 7 });
    const out = run(prev, { deliveryMethod: 'collection' });
    expect(out.shippingOptionId).toBeNull();
    expect(out.addressLine1).toBe('1 High St');
    expect(out.servicePoint).toEqual(point());
  });

  it('a point from another carrier clears the delivery option; the same carrier keeps it', () => {
    const prev = form({ country: 'GB', deliveryMethod: 'collection', servicePoint: point(), shippingOptionId: 7 });
    expect(run(prev, { servicePoint: point({ id: '9', carrier: 'evri' }) }).shippingOptionId).toBeNull();
    expect(run(prev, { servicePoint: point({ id: '9' }) }).shippingOptionId).toBe(7);
  });

  it('choosing a delivery option is left alone', () => {
    const prev = form({ country: 'GB', deliveryMethod: 'collection', servicePoint: point() });
    expect(run(prev, { shippingOptionId: 7 }).shippingOptionId).toBe(7);
  });

  it('a remembered collection choice is dropped when the shop hides the phone field', () => {
    const prev = form({ country: 'GB', deliveryMethod: 'collection', servicePoint: point(), shippingOptionId: 7 });
    const out = reconcileDelivery(prev, prev, lists, 'hidden');
    expect(out.deliveryMethod).toBe('home');
    expect(out.shippingOptionId).toBeNull();
  });
});

describe('what a collection form sends', () => {
  const collecting = form({ country: 'GB', firstName: ' Ada ', surname: 'Sterling', deliveryMethod: 'collection', servicePoint: point(), addressLine1: '1 High St', county: 'Yorks' });

  it('quoteDeliveryFields sends nothing for home, the method alone before a point is chosen, and the carrier after', () => {
    expect(quoteDeliveryFields(form({ country: 'GB' }))).toEqual({});
    // A point kept from before a switch back to home must not leak its carrier.
    expect(quoteDeliveryFields(form({ country: 'GB', servicePoint: point() }))).toEqual({});
    expect(quoteDeliveryFields(form({ country: 'GB', deliveryMethod: 'collection' }))).toEqual({ deliveryMethod: 'collection' });
    expect(quoteDeliveryFields(collecting)).toEqual({ deliveryMethod: 'collection', servicePointCarrier: 'inpost' });
  });

  it('collectionAddress needs the method and a point', () => {
    expect(collectionAddress(form({ country: 'GB', deliveryMethod: 'collection' }))).toBeNull();
    expect(collectionAddress(form({ country: 'GB', servicePoint: point() }))).toBeNull();
  });

  it('collectionAddress is the shopper’s name at the point’s address, with the point fields', () => {
    expect(collectionAddress(collecting)).toEqual({
      firstName: 'Ada', surname: 'Sterling', addressLine1: 'Kirkgate 14', addressLine2: null, addressLine3: null,
      city: 'Leeds', county: null, zip: 'LS1 6BY', country: 'GB',
      servicePointId: '12345', servicePointCarrier: 'inpost', servicePointName: 'Tesco Express',
    });
  });

  it('falls back to the point name when it has no street', () => {
    const noStreet = { ...collecting, servicePoint: point({ street: '', houseNumber: '' }) };
    expect(collectionAddress(noStreet)?.addressLine1).toBe('Tesco Express');
  });

  it('is null when the form is not a collection', () => {
    expect(collectionAddress(form({ country: 'GB' }))).toBeNull();
  });
});
```

Replace the single test in `web/test/checkout-form-state.test.ts` with one that covers every field added since the saved form may predate them:

```ts
  it('a form saved before newer fields existed loads with their defaults', () => {
    const { addressLine3: _a, deliveryMethod: _d, servicePoint: _s, pointPostcode: _p, ...old } = { ...DEFAULT_FORM, addressLine1: '1 High St', city: 'Leeds' };
    localStorage.setItem('sf-checkout-v1', JSON.stringify(old));
    const loaded = loadPersistedForm();
    expect(loaded).toMatchObject({ addressLine3: '', deliveryMethod: 'home', servicePoint: null, pointPostcode: '', addressLine1: '1 High St' });
  });
```

Run: `npx vitest run test/collection-mode.test.ts test/checkout-form-state.test.ts`
Expected: FAIL.

- [ ] **Step 4: Form state**

In `web/src/features/checkout/form-state.ts`: add `import type { ServicePoint } from '@/types/service-points.ts';`; add to `CheckoutForm` after `country: string;`:

```ts
  /** Home delivery, or collection from a carrier pick-up point. */
  deliveryMethod: 'home' | 'collection';
  /** The chosen pick-up point. Kept while the shopper is on home delivery so switching back restores it; cleared when the country changes. */
  servicePoint: ServicePoint | null;
  /** What the shopper last searched for in the point picker. */
  pointPostcode: string;
```

and to `DEFAULT_FORM` after `country: '',`: `deliveryMethod: 'home', servicePoint: null, pointPostcode: '',`.

- [ ] **Step 5: Implement the pure module**

Create `web/src/features/checkout/collection-mode.ts`:

```ts
// Collection points in the checkout: every decision that needs no React. Which
// countries the picker lists, whether a country offers home delivery, a
// collection point or the choice, what a change to the form has to clear, and
// what a collection order sends.
import type { CheckoutForm } from '@/features/checkout/form-state.ts';
import { normaliseShipCountries } from '@/features/checkout/ship-countries.ts';
import type { QuoteInput, ShippingAddressInput } from '@/types/checkout.ts';
import type { ContactFieldMode, StorefrontSettings } from '@/types/settings.ts';

export interface ShipLists {
  /** Where a home delivery can be quoted. Empty = unknown. */
  home: string[];
  /** Where a collection point can be offered. */
  collection: string[];
}

export function shipListsOf(settings: Pick<StorefrontSettings, 'shipping'>): ShipLists {
  return {
    home: normaliseShipCountries(settings.shipping?.countries),
    collection: normaliseShipCountries(settings.shipping?.collectionCountries),
  };
}

/** The countries the picker offers. Empty = every country (the shop's home list is unknown, as before collection points). */
export function pickerCountries(lists: ShipLists): string[] {
  if (lists.home.length === 0) return [];
  return [...lists.home, ...lists.collection.filter((c) => !lists.home.includes(c))];
}

export type CountryMode = 'home' | 'collection' | 'choice';

/**
 * What a country offers. A carrier texts the pick-up code, so a shop that hides
 * the phone field offers no collection. With the home list unknown, home
 * delivery cannot be ruled out, so a collection country offers the choice.
 */
export function modeForCountry(country: string, lists: ShipLists, phoneMode: ContactFieldMode): CountryMode {
  if (!country || phoneMode === 'hidden' || !lists.collection.includes(country)) return 'home';
  return lists.home.length === 0 || lists.home.includes(country) ? 'choice' : 'collection';
}

/**
 * `next` with the delivery rules applied, given the form it came from. Returns
 * `next` itself when nothing changes, so it is safe in a state updater.
 *  - a point belongs to a country: a new country clears it;
 *  - the country decides the method where it offers only one;
 *  - a new method, or a point from another carrier, makes the chosen delivery
 *    option meaningless, so it is cleared rather than left to fail at submit.
 */
export function reconcileDelivery(prev: CheckoutForm, next: CheckoutForm, lists: ShipLists, phoneMode: ContactFieldMode): CheckoutForm {
  const countryChanged = next.country !== prev.country;
  const servicePoint = countryChanged ? null : next.servicePoint;
  const mode = modeForCountry(next.country, lists, phoneMode);
  const deliveryMethod = mode === 'choice' ? next.deliveryMethod : mode;

  const methodChanged = deliveryMethod !== prev.deliveryMethod;
  const carrierChanged = deliveryMethod === 'collection' && (servicePoint?.carrier ?? null) !== (prev.servicePoint?.carrier ?? null);
  const shippingOptionId = countryChanged || methodChanged || carrierChanged ? null : next.shippingOptionId;

  if (servicePoint === next.servicePoint && deliveryMethod === next.deliveryMethod && shippingOptionId === next.shippingOptionId) return next;
  return { ...next, servicePoint, deliveryMethod, shippingOptionId };
}

/** The delivery part of a quote request. Nothing for home, so a home quote is byte-identical to the one sent before collection points. */
export function quoteDeliveryFields(form: CheckoutForm): Pick<QuoteInput, 'deliveryMethod' | 'servicePointCarrier'> {
  if (form.deliveryMethod !== 'collection') return {};
  return form.servicePoint ? { deliveryMethod: 'collection', servicePointCarrier: form.servicePoint.carrier } : { deliveryMethod: 'collection' };
}

/** The order's shipping address for a collection: the shopper's own name at the point's address (the carrier's convention), plus the point. Null when the form is not a collection. */
export function collectionAddress(form: CheckoutForm): ShippingAddressInput | null {
  const point = form.servicePoint;
  if (form.deliveryMethod !== 'collection' || !point) return null;
  const street = [point.street, point.houseNumber].map((s) => s.trim()).filter(Boolean).join(' ');
  return {
    firstName: form.firstName.trim(),
    surname: form.surname.trim(),
    addressLine1: street || point.name,
    addressLine2: null,
    addressLine3: null,
    city: point.city,
    county: null,
    zip: point.postalCode,
    country: point.country,
    servicePointId: point.id,
    servicePointCarrier: point.carrier,
    servicePointName: point.name,
  };
}
```

`ContactFieldMode` is the existing type of `contactModes.phoneMode` in `web/src/types/settings.ts`; confirm it is exported there (it is imported by `features/checkout/schemas.ts`).

- [ ] **Step 6: Run and commit**

Run: `npx vitest run test/collection-mode.test.ts test/checkout-form-state.test.ts && npx tsc -b`
Expected: PASS, clean. If `tsc` reports a `CheckoutForm` literal elsewhere that lacks the new fields, add `deliveryMethod: 'home', servicePoint: null, pointPostcode: ''` there.

Run: `npm test` (from `web/`)
Expected: PASS, nothing red.

```bash
git add web/src/types/service-points.ts web/src/types/settings.ts web/src/types/checkout.ts web/src/types/public-order.ts web/src/types/orders.ts web/src/api/service-points.ts web/src/features/checkout/form-state.ts web/src/features/checkout/collection-mode.ts web/test/collection-mode.test.ts web/test/checkout-form-state.test.ts
git commit -m "feat(checkout): collection-point form state, delivery rules and point search client"
```

---

### Task 5: Storefront checkout page wiring

**Files:**
- Modify: `web/src/features/checkout/useQuote.ts`
- Modify: `web/src/features/checkout/CheckoutPage.tsx`
- Modify: `web/src/builder/family-checkout.ts` (`CheckoutData`)
- Modify: `web/src/features/checkout/checkout-parts.tsx` (the `Address` and `Contact` views)
- Modify: `web/src/features/checkout/steps/AddressStep.tsx`, `steps/ContactStep.tsx` (props only)
- Modify: `web/src/text/keys/checkout.ts`, `web/src/text/notes/checkout.ts` (one error key)
- Test: `web/test/use-quote.test.tsx`, `web/test/checkout-page.test.tsx`

**Interfaces:**
- Consumes: everything Task 4 produces.
- Produces: `CheckoutData.shipCountries` now holds the picker union; new `CheckoutData.countryMode: CountryMode`; `CheckoutData.contactModes` is the effective one (phone required while collecting); `AddressStepProps.mode?: CountryMode`; text key `checkout.errors.pointMissing`.

- [ ] **Step 1: Write the failing tests**

In `web/test/use-quote.test.tsx`, add two cases following that file's existing style for asserting what `fetchQuote` / `guestQuote` were called with (read the file's first signed-in case and its first guest case and mirror their setup):

- signed in, form `{ country: 'GB', deliveryMethod: 'collection', servicePoint: <a point with carrier 'inpost'> }`: the quote is requested with `deliveryMethod: 'collection'` and `servicePointCarrier: 'inpost'`; then with the form changed to a point of carrier `'evri'` a second request goes out with `servicePointCarrier: 'evri'`.
- signed in, form `{ country: 'GB' }` (home): the request object has no `deliveryMethod` and no `servicePointCarrier` key (assert with `expect(Object.keys(call)).not.toEqual(expect.arrayContaining(['deliveryMethod', 'servicePointCarrier']))`).

In `web/test/checkout-page.test.tsx`, add inside the signed-in `describe` (the one whose `beforeEach` sets `state.settings = settings(false)`), reusing its helpers `mount`, `settle`, `type`, `pressContinue`, `pressPlace`, `walkToReview`:

```tsx
  describe('collection points', () => {
    const POINT = {
      id: '12345', carrier: 'inpost', name: 'Tesco Express', street: 'Kirkgate', houseNumber: '14', postalCode: 'LS1 6BY',
      city: 'Leeds', country: 'GB', latitude: null, longitude: null, distance: 300,
    };
    const seedCollection = () => localStorage.setItem('sf-checkout-v1', JSON.stringify({
      ...DEFAULT_FORM, firstName: 'Ada', surname: 'Lovelace', email: 'ada@example.com', country: 'GB',
      deliveryMethod: 'collection', servicePoint: POINT,
    }));
    const withCollection = () => {
      state.settings = { ...settings(false), shipping: { countries: ['GB'], collectionCountries: ['GB'] } };
    };

    it('a collection order sends the point, the point’s address and the shopper’s name', async () => {
      withCollection();
      seedCollection();
      mount();
      await settle();
      type(/^phone$/i, '07801 123456');
      await walkToReviewFrom('contact');
      pressPlace();
      await settle();
      expect(placeOrderMock).toHaveBeenCalledTimes(1);
      expect(placeOrderMock.mock.calls[0]![0].shippingAddress).toEqual({
        firstName: 'Ada', surname: 'Lovelace', addressLine1: 'Kirkgate 14', addressLine2: null, addressLine3: null,
        city: 'Leeds', county: null, zip: 'LS1 6BY', country: 'GB',
        servicePointId: '12345', servicePointCarrier: 'inpost', servicePointName: 'Tesco Express',
      });
      expect(quoteMock.mock.calls.at(-1)![0]).toMatchObject({ deliveryMethod: 'collection', servicePointCarrier: 'inpost' });
    });

    it('collection without a chosen point cannot leave the address step', async () => {
      withCollection();
      localStorage.setItem('sf-checkout-v1', JSON.stringify({ ...DEFAULT_FORM, firstName: 'Ada', surname: 'Lovelace', email: 'ada@example.com', country: 'GB', deliveryMethod: 'collection' }));
      mount();
      await settle();
      pressContinue(); // Contact → Address
      pressContinue(); // refused
      expect(screen.getByText('Choose a collection point')).toBeTruthy();
    });

    it('collection makes the phone required even when the shop has it optional', async () => {
      withCollection();
      seedCollection();
      mount();
      await settle();
      pressContinue(); // Contact, with no phone
      expect(screen.getByText('Required')).toBeTruthy();
    });

    it('a home order is unchanged: no point fields and no delivery fields on the quote', async () => {
      withCollection();
      mount();
      await settle();
      await walkToReview();
      pressPlace();
      await settle();
      const address = placeOrderMock.mock.calls[0]![0].shippingAddress;
      expect(Object.keys(address)).not.toEqual(expect.arrayContaining(['servicePointId']));
      expect(Object.keys(quoteMock.mock.calls.at(-1)![0])).not.toEqual(expect.arrayContaining(['deliveryMethod', 'servicePointCarrier']));
    });
  });
```

`walkToReviewFrom('contact')` is a small local helper to add beside `walkToReview` in that file: it presses Continue on Contact (already filled from the seeded form), Continue on Address (the point is already chosen), then does exactly what `walkToReview` does from the shipping step onwards (select the delivery radio, settle, Continue, select the payment radio, Continue). Extract those shared lines from `walkToReview` into it and have `walkToReview` call it after filling Contact and Address, so the steps exist once.

Run: `npx vitest run test/use-quote.test.tsx test/checkout-page.test.tsx`
Expected: FAIL.

- [ ] **Step 2: The error key**

In `web/src/text/keys/checkout.ts`, after `'errors.shippingMissing'`: `'errors.pointMissing': { en: 'Choose a collection point', max: 80 },`
In `web/src/text/notes/checkout.ts`, beside the other `errors.*` notes: `'errors.pointMissing': 'Shown on the address step when collection is chosen but no point is picked',`

- [ ] **Step 3: The quote hook**

In `web/src/features/checkout/useQuote.ts`:

- import `import { quoteDeliveryFields } from '@/features/checkout/collection-mode.ts';`
- add to `HashInput`: `deliveryMethod?: 'collection'; servicePointCarrier?: string;`
- in the `hashInput` memo, add `...quoteDeliveryFields(form),` to `base`, and add `form.deliveryMethod, form.servicePoint` to the memo's dependency array;
- in `runQuote`, add to BOTH the `guestQuote({…})` and the `fetchQuote({…})` argument objects:

```ts
        ...(debounced.deliveryMethod ? { deliveryMethod: debounced.deliveryMethod } : {}),
        ...(debounced.servicePointCarrier ? { servicePointCarrier: debounced.servicePointCarrier } : {}),
```

- [ ] **Step 4: The page**

In `web/src/features/checkout/CheckoutPage.tsx`:

Imports:

```ts
import { collectionAddress, modeForCountry, pickerCountries, quoteDeliveryFields, reconcileDelivery, shipListsOf } from '@/features/checkout/collection-mode.ts';
```

Replace the two lines that compute `rawShipCountries` and `shipCountries` with:

```ts
  const rawShipping = settings.shipping;
  const shipLists = useMemo(() => shipListsOf({ shipping: rawShipping }), [rawShipping]);
  const shipCountries = useMemo(() => pickerCountries(shipLists), [shipLists]);
  const phoneMode = contactModes.phoneMode;
```

Replace the form initialiser so the delivery rules are applied to the restored form:

```ts
  const [form, setForm] = useState<CheckoutForm>(() => {
    const seeded = applyShipCountries(seedForm(loadPersistedForm() ?? DEFAULT_FORM, contactModes.defaultPhoneCountry), shipCountries);
    return reconcileDelivery(seeded, seeded, shipLists, phoneMode);
  });
```

Replace the settings effect added in v0.14.0:

```ts
  // Settings refetch on window focus, so the shop's countries can change under an open checkout.
  useEffect(() => {
    setForm((f) => {
      const next = applyShipCountries(f, shipCountries);
      return reconcileDelivery(f, next, shipLists, phoneMode);
    });
  }, [shipCountries, shipLists, phoneMode]);
```

In `patch`, replace `setForm((f) => ({ ...f, ...next }));` with:

```ts
    setForm((f) => reconcileDelivery(f, { ...f, ...next }, shipLists, phoneMode));
```

and add `shipLists, phoneMode` to that `useCallback`'s dependency array.

In `guestQuoteKey`, add `...quoteDeliveryFields(form),` inside the object passed to `JSON.stringify`, and add `form.deliveryMethod, form.servicePoint` to the memo's dependencies.

Replace the `contactSchema` memo:

```ts
  // A carrier texts the pick-up code: while the order is a collection, the phone is required.
  const collecting = form.deliveryMethod === 'collection';
  const effectiveContactModes = useMemo(
    () => (collecting ? { ...contactModes, phoneMode: 'required' as const } : contactModes),
    [contactModes, collecting],
  );
  const contactSchema = useMemo(
    () => buildContactSchema(effectiveContactModes, { guest }),
    [effectiveContactModes, guest],
  );
```

In `validate`, at the top of the `kind === 'address'` branch:

```ts
      if (form.deliveryMethod === 'collection') {
        if (form.country.length !== 2) {
          setErrors({ country: textKey('checkout.errors.countryMissing') });
          return false;
        }
        if (!form.servicePoint) {
          setErrors({ servicePoint: textKey('checkout.errors.pointMissing') });
          return false;
        }
        return true;
      }
```

In `buildBody`, replace the `shippingAddress: { … },` property with:

```ts
      shippingAddress: collectionAddress(form) ?? {
        firstName: form.firstName.trim(),
        surname: form.surname.trim(),
        addressLine1: form.addressLine1.trim(),
        addressLine2: form.addressLine2.trim() || null,
        addressLine3: form.addressLine3.trim() || null,
        city: form.city.trim(),
        county: form.county.trim() || null,
        zip: form.zip.trim(),
        country: form.country,
      },
```

In the `data` memo: replace `contactModes,` with `contactModes: effectiveContactModes,`, add `countryMode: modeForCountry(form.country, shipLists, phoneMode),` after `shipCountries,`, and update the dependency array (`effectiveContactModes` in place of `contactModes`; add `shipLists`, `phoneMode`).

- [ ] **Step 5: Carry the mode to the address step**

In `web/src/builder/family-checkout.ts`, add to `CheckoutData` after `shipCountries`:

```ts
  /** What the chosen country offers: home delivery, a collection point, or the shopper's choice. */
  countryMode: import('@/features/checkout/collection-mode.ts').CountryMode;
```

In `web/src/features/checkout/steps/AddressStep.tsx`, add to `AddressStepProps`: `/** What the country offers; omitted = home. */ mode?: import('@/features/checkout/collection-mode.ts').CountryMode;` (destructure it as `mode` and leave it unused for now; Task 6 renders it).

In `web/src/features/checkout/checkout-parts.tsx`, in the `Address` view add `mode={d.countryMode}` to `<AddressStep …>`.

- [ ] **Step 6: Run and commit**

Run: `npx vitest run test/use-quote.test.tsx test/checkout-page.test.tsx test/collection-mode.test.ts && npx tsc -b`
Expected: PASS, clean. (The "cannot leave the address step" test finds the error text because `AddressStep` already renders `errors.country`; if it does not surface `errors.servicePoint` yet, render it in this task as a plain note under the country field, `{errors.servicePoint ? <p className={classes.note} data-tone="danger">{msg(errors.servicePoint)}</p> : null}` with `msg` from `useText()`, and let Task 6 move it into the picker.)

Run: `npm test` (from `web/`)
Expected: PASS, nothing red.

```bash
git add web/src/features/checkout/useQuote.ts web/src/features/checkout/CheckoutPage.tsx web/src/builder/family-checkout.ts web/src/features/checkout/checkout-parts.tsx web/src/features/checkout/steps/AddressStep.tsx web/src/text/keys/checkout.ts web/src/text/notes/checkout.ts web/test/use-quote.test.tsx web/test/checkout-page.test.tsx
git commit -m "feat(checkout): quote, validate and place collection-point orders"
```

---

### Task 6: Storefront point picker in the address step

UI task: the implementer loads the `frontend-design:frontend-design` skill. Markup, behaviour and wording below are fixed; CSS values may be refined to sit right in the three templates and both input styles (underline and box), as long as the tests and acceptance checks hold.

**Files:**
- Create: `web/src/features/checkout/usePointSearch.ts`, `web/src/features/checkout/PointPicker.tsx`
- Create: `web/test/use-point-search.test.tsx`, `web/test/point-picker.test.tsx`
- Modify: `web/src/features/checkout/steps/AddressStep.tsx`, `web/src/features/checkout/Fields.module.css`
- Modify: `web/src/text/keys/checkout.ts`, `web/src/text/notes/checkout.ts`
- Modify: `web/test/address-step.test.tsx`

**Interfaces:**
- Consumes: `searchServicePoints`, `ServicePoint`, `CountryMode`, `AddressStepProps.mode`, form fields from Tasks 4 and 5.
- Produces: `usePointSearch(country)` → `{ state: PointSearchState; search(postcode: string): void }`; `<PointPicker country value postcode error onPostcodeChange onChoose />`.

- [ ] **Step 1: Text keys**

In `web/src/text/keys/checkout.ts`, after `'address.chooseCountry'`:

```ts
  'address.deliverTo': { en: 'Deliver to', max: 40 },
  'address.methodHome': { en: 'Home address', max: 40 },
  'address.methodCollection': { en: 'Collection point', max: 40 },
  'address.collectionOnly': { en: 'Orders to {country} are delivered to a collection point.', max: 120 },
  'address.pointPostcode': { en: 'Postcode', max: 40 },
  'address.pointSearch': { en: 'Search', max: 30 },
  'address.pointPrompt': { en: 'Enter a postcode to find collection points near you.', max: 120 },
  'address.pointSearching': { en: 'Finding collection points…', max: 80 },
  'address.pointEmpty': { en: 'No collection points found near that postcode. Try another.', max: 120 },
  'address.pointFailed': { en: "We couldn't load collection points. Please try again.", max: 120 },
  'address.pointBusy': { en: 'Too many searches. Please wait a minute and try again.', max: 120 },
  'address.pointList': { en: 'Collection points', max: 60 },
  'address.pointChosen': { en: 'Your collection point', max: 60 },
  'address.pointChange': { en: 'Change', max: 30 },
  'address.pointDistance': { en: '{km} km', max: 30 },
```

In `web/src/text/notes/checkout.ts`, add a note for each (one line each, saying where it shows), for example `'address.deliverTo': 'Label of the home / collection switch on the address step',` and `'address.pointDistance': 'Distance to a collection point; {km} is a number with one decimal',`. Every key above must have a note.

- [ ] **Step 2: Write the failing hook test**

Create `web/test/use-point-search.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { ApiError } from '@/lib/errors.ts';
import type { ServicePoint, ServicePointSearch } from '@/types/service-points.ts';

vi.mock('@/api/service-points.ts', () => ({ searchServicePoints: vi.fn() }));
import { searchServicePoints } from '@/api/service-points.ts';
import { usePointSearch } from '@/features/checkout/usePointSearch.ts';

const searchMock = vi.mocked(searchServicePoints);
const point = (id: string): ServicePoint => ({
  id, carrier: 'inpost', name: `Point ${id}`, street: 'Kirkgate', houseNumber: '14', postalCode: 'LS1 6BY', city: 'Leeds',
  country: 'GB', latitude: null, longitude: null, distance: 300,
});
const found = (...ids: string[]): ServicePointSearch => ({ available: true, carriers: ['inpost'], points: ids.map(point) });
/** A promise the test settles by hand, to order responses. */
function deferred<T>() {
  let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => searchMock.mockReset());
afterEach(cleanup);

describe('usePointSearch', () => {
  it('starts idle, shows searching, then the results', async () => {
    const d = deferred<ServicePointSearch>();
    searchMock.mockReturnValueOnce(d.promise);
    const { result } = renderHook(() => usePointSearch('GB'));
    expect(result.current.state).toEqual({ status: 'idle' });
    act(() => result.current.search(' LS1 6BY '));
    expect(result.current.state).toEqual({ status: 'searching' });
    expect(searchMock).toHaveBeenCalledWith('GB', 'LS1 6BY', expect.any(AbortSignal));
    await act(async () => { d.resolve(found('1', '2')); await d.promise; });
    expect(result.current.state).toEqual({ status: 'results', points: [point('1'), point('2')] });
  });

  it('no points, or collection reported unavailable, is the empty state', async () => {
    searchMock.mockResolvedValueOnce(found());
    const { result } = renderHook(() => usePointSearch('GB'));
    await act(async () => { result.current.search('LS1'); });
    expect(result.current.state).toEqual({ status: 'empty' });
    searchMock.mockResolvedValueOnce({ available: false, carriers: [], points: [] });
    await act(async () => { result.current.search('LS2'); });
    expect(result.current.state).toEqual({ status: 'empty' });
  });

  it('a 429 is "busy"; any other failure is "failed"', async () => {
    const { result } = renderHook(() => usePointSearch('GB'));
    searchMock.mockRejectedValueOnce(new ApiError(429, 'Too many requests'));
    await act(async () => { result.current.search('LS1'); });
    expect(result.current.state).toEqual({ status: 'error', kind: 'busy' });
    searchMock.mockRejectedValueOnce(new ApiError(502, 'down'));
    await act(async () => { result.current.search('LS1'); });
    expect(result.current.state).toEqual({ status: 'error', kind: 'failed' });
  });

  it('ignores a postcode shorter than two characters and a search with no country', () => {
    const { result, rerender } = renderHook(({ c }) => usePointSearch(c), { initialProps: { c: 'GB' } });
    act(() => result.current.search(' L '));
    rerender({ c: '' });
    act(() => result.current.search('LS1 6BY'));
    expect(searchMock).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('an older response never replaces a newer one', async () => {
    const first = deferred<ServicePointSearch>(); const second = deferred<ServicePointSearch>();
    searchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => usePointSearch('GB'));
    act(() => result.current.search('LS1'));
    act(() => result.current.search('LS2'));
    expect((searchMock.mock.calls[0]![2] as AbortSignal).aborted).toBe(true);
    await act(async () => { second.resolve(found('new')); await second.promise; });
    await act(async () => { first.resolve(found('old')); await first.promise; });
    expect(result.current.state).toEqual({ status: 'results', points: [point('new')] });
  });

  it('changing the country drops a search in flight and returns to idle', async () => {
    const d = deferred<ServicePointSearch>();
    searchMock.mockReturnValueOnce(d.promise);
    const { result, rerender } = renderHook(({ c }) => usePointSearch(c), { initialProps: { c: 'GB' } });
    act(() => result.current.search('LS1'));
    rerender({ c: 'FR' });
    expect(result.current.state).toEqual({ status: 'idle' });
    await act(async () => { d.resolve(found('gb-point')); await d.promise; });
    expect(result.current.state).toEqual({ status: 'idle' });
  });
});
```

Run: `npx vitest run test/use-point-search.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the hook**

Create `web/src/features/checkout/usePointSearch.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { searchServicePoints } from '@/api/service-points.ts';
import { ApiError } from '@/lib/errors.ts';
import type { ServicePoint } from '@/types/service-points.ts';

export type PointSearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'results'; points: ServicePoint[] }
  | { status: 'empty' }
  /** `busy`: the shopper has searched too often (429). `failed`: anything else. */
  | { status: 'error'; kind: 'busy' | 'failed' };

const IDLE: PointSearchState = { status: 'idle' };

/**
 * Collection points near a postcode in `country`. Each search aborts the one
 * before it and carries a sequence number, so a slow earlier answer can never
 * replace a later one, and an answer for a country the shopper has since left
 * is dropped. Results are not kept across a country change.
 */
export function usePointSearch(country: string): { state: PointSearchState; search: (postcode: string) => void } {
  const [state, setState] = useState<PointSearchState>(IDLE);
  const seq = useRef(0);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    seq.current += 1;
    inFlight.current?.abort();
    setState(IDLE);
  }, [country]);

  useEffect(() => () => inFlight.current?.abort(), []);

  const search = useCallback(
    (postcode: string) => {
      const query = postcode.trim();
      if (query.length < 2 || !country) return;
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      const mine = (seq.current += 1);
      setState({ status: 'searching' });
      searchServicePoints(country, query, controller.signal).then(
        (found) => {
          if (mine !== seq.current) return;
          setState(found.available && found.points.length > 0 ? { status: 'results', points: found.points } : { status: 'empty' });
        },
        (err: unknown) => {
          if (mine !== seq.current) return;
          setState({ status: 'error', kind: err instanceof ApiError && err.status === 429 ? 'busy' : 'failed' });
        },
      );
    },
    [country],
  );

  return { state, search };
}
```

Run: `npx vitest run test/use-point-search.test.tsx`
Expected: PASS.

- [ ] **Step 4: Write the failing picker and step tests**

Create `web/test/point-picker.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ApiError } from '@/lib/errors.ts';
import type { ServicePoint } from '@/types/service-points.ts';

vi.mock('@/api/service-points.ts', () => ({ searchServicePoints: vi.fn() }));
import { searchServicePoints } from '@/api/service-points.ts';
import { PointPicker } from '@/features/checkout/PointPicker.tsx';

const searchMock = vi.mocked(searchServicePoints);
const point = (over: Partial<ServicePoint> = {}): ServicePoint => ({
  id: '1', carrier: 'inpost', name: 'Tesco Express', street: 'Kirkgate', houseNumber: '14', postalCode: 'LS1 6BY', city: 'Leeds',
  country: 'GB', latitude: null, longitude: null, distance: 340, ...over,
});

const mount = (over: Partial<Parameters<typeof PointPicker>[0]> = {}) => {
  const props = { country: 'GB', value: null, postcode: '', onPostcodeChange: vi.fn(), onChoose: vi.fn(), ...over };
  render(<MantineProvider env="test"><PointPicker {...props} /></MantineProvider>);
  return props;
};
const search = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Search' })); }); };

beforeEach(() => searchMock.mockReset());
afterEach(cleanup);

describe('PointPicker', () => {
  it('prompts before any search', () => {
    mount();
    expect(screen.getByText('Enter a postcode to find collection points near you.')).toBeTruthy();
  });

  it('searches the typed postcode and lists the points with address, carrier and distance', async () => {
    searchMock.mockResolvedValueOnce({ available: true, carriers: ['inpost'], points: [point(), point({ id: '2', name: 'News Plus', distance: null })] });
    mount({ postcode: 'LS1 6BY' });
    await search();
    expect(searchMock).toHaveBeenCalledWith('GB', 'LS1 6BY', expect.any(AbortSignal));
    const rows = screen.getAllByRole('radio');
    expect(rows).toHaveLength(2);
    expect(screen.getByText('Tesco Express')).toBeTruthy();
    expect(screen.getByText('Kirkgate 14, Leeds')).toBeTruthy();
    expect(screen.getByText('0.3 km')).toBeTruthy();
    expect(screen.getAllByText('inpost')).toHaveLength(2);
  });

  it('Enter in the postcode box searches', async () => {
    searchMock.mockResolvedValueOnce({ available: true, carriers: [], points: [point()] });
    mount({ postcode: 'LS1' });
    await act(async () => { fireEvent.keyDown(screen.getByLabelText('Postcode'), { key: 'Enter' }); });
    expect(searchMock).toHaveBeenCalledTimes(1);
  });

  it('choosing a row reports the point', async () => {
    searchMock.mockResolvedValueOnce({ available: true, carriers: [], points: [point(), point({ id: '2', name: 'News Plus' })] });
    const props = mount({ postcode: 'LS1' });
    await search();
    fireEvent.click(screen.getByRole('radio', { name: /News Plus/ }));
    expect(props.onChoose).toHaveBeenCalledWith(point({ id: '2', name: 'News Plus' }));
  });

  it('shows the chosen point with a Change action, and Change brings the search back', () => {
    mount({ value: point(), postcode: 'LS1 6BY' });
    expect(screen.getByText('Your collection point')).toBeTruthy();
    expect(screen.getByText('Tesco Express')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy();
  });

  it('says so when nothing is found, when the lookup fails and when searching too often', async () => {
    searchMock.mockResolvedValueOnce({ available: true, carriers: [], points: [] });
    mount({ postcode: 'ZZ1' });
    await search();
    expect(screen.getByText('No collection points found near that postcode. Try another.')).toBeTruthy();
    searchMock.mockRejectedValueOnce(new ApiError(502, 'down'));
    await search();
    expect(screen.getByText("We couldn't load collection points. Please try again.")).toBeTruthy();
    searchMock.mockRejectedValueOnce(new ApiError(429, 'slow down'));
    await search();
    expect(screen.getByText('Too many searches. Please wait a minute and try again.')).toBeTruthy();
  });

  it('shows the step’s error', () => {
    mount({ error: 'Choose a collection point' });
    expect(screen.getByText('Choose a collection point')).toBeTruthy();
  });
});
```

Append to `web/test/address-step.test.tsx` (it mounts `AddressStep` with a `mount(form, patch)` helper; extend that helper to accept a third argument `mode` passed as the `mode` prop, default `undefined`):

```tsx
describe('AddressStep delivery method', () => {
  it('offers no switch for a home-only country', () => {
    mount({ country: 'GB' }, vi.fn(), 'home');
    expect(screen.queryByRole('radiogroup', { name: 'Deliver to' })).toBeNull();
    expect(screen.getByLabelText('Address line 1')).toBeTruthy();
  });

  it('offers the switch when the country allows both, and reports the choice', () => {
    const patch = mount({ country: 'GB' }, vi.fn(), 'choice');
    fireEvent.click(screen.getByRole('radio', { name: 'Collection point' }));
    expect(patch).toHaveBeenCalledWith({ deliveryMethod: 'collection' });
  });

  it('collection replaces the address fields with the point picker, keeping the country', () => {
    mount({ country: 'GB', deliveryMethod: 'collection' }, vi.fn(), 'choice');
    expect(screen.getByLabelText('Country')).toBeTruthy();
    expect(screen.queryByLabelText('Address line 1')).toBeNull();
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy();
  });

  it('a collection-only country shows the picker with an explanation and no switch', () => {
    mount({ country: 'GB', deliveryMethod: 'collection' }, vi.fn(), 'collection');
    expect(screen.queryByRole('radiogroup', { name: 'Deliver to' })).toBeNull();
    expect(screen.getByText('Orders to United Kingdom are delivered to a collection point.')).toBeTruthy();
  });

  it('seeds the point search with the home postcode the first time', () => {
    const patch = mount({ country: 'GB', zip: 'LS1 6BY' }, vi.fn(), 'choice');
    fireEvent.click(screen.getByRole('radio', { name: 'Collection point' }));
    expect(patch).toHaveBeenCalledWith({ deliveryMethod: 'collection' });
    cleanup();
    mount({ country: 'GB', zip: 'LS1 6BY', deliveryMethod: 'collection' }, vi.fn(), 'choice');
    expect((screen.getByLabelText('Postcode') as HTMLInputElement).value).toBe('LS1 6BY');
  });
});
```

The existing order test in that file (`'orders the fields country first…'`) must keep passing unchanged for the home mode.

Run: `npx vitest run test/point-picker.test.tsx test/address-step.test.tsx`
Expected: FAIL.

- [ ] **Step 5: Implement the picker**

Create `web/src/features/checkout/PointPicker.tsx`:

```tsx
import { useState } from 'react';
import { Field } from '@/features/checkout/Field.tsx';
import { usePointSearch } from '@/features/checkout/usePointSearch.ts';
import type { ServicePoint } from '@/types/service-points.ts';
import { useText } from '@/text/runtime.tsx';
import fields from '@/features/checkout/Fields.module.css';

export interface PointPickerProps {
  country: string;
  /** The chosen point, if any. */
  value: ServicePoint | null;
  /** The postcode box, held by the form so it survives leaving the step. */
  postcode: string;
  error?: string;
  onPostcodeChange: (postcode: string) => void;
  onChoose: (point: ServicePoint) => void;
}

const pointAddress = (p: ServicePoint) =>
  [[p.street, p.houseNumber].map((s) => s.trim()).filter(Boolean).join(' '), p.city].filter(Boolean).join(', ');

/** One collection point's name, address, carrier and distance. */
function PointLines({ point }: { point: ServicePoint }) {
  const { t } = useText();
  return (
    <>
      <span className={fields.choiceBody}>
        <span className={fields.choiceName}>{point.name}</span>
        <span className={fields.choiceNote}>{pointAddress(point)}</span>
        <span className={fields.choiceNote}>{point.carrier}</span>
      </span>
      {point.distance !== null ? (
        <span className={fields.choiceFigure}>{t('checkout.address.pointDistance', { km: (point.distance / 1000).toFixed(1) })}</span>
      ) : null}
    </>
  );
}

/**
 * Find a carrier collection point by postcode and choose one. A postcode search
 * and a list, like the shop's Telegram address form: no map. With a point
 * already chosen it shows that point and a Change action instead of the search.
 */
export function PointPicker({ country, value, postcode, error, onPostcodeChange, onChoose }: PointPickerProps) {
  const { t, msg } = useText();
  const { state, search } = usePointSearch(country);
  // Open when there is nothing chosen yet, or when the shopper asked to change it.
  const [changing, setChanging] = useState(false);
  const searching = value === null || changing;

  if (!searching && value) {
    return (
      <div className={fields.point}>
        <p className={fields.label}>{t('checkout.address.pointChosen')}</p>
        <div className={fields.choices}>
          <div className={fields.pointChosen}>
            <PointLines point={value} />
            <button type="button" className={fields.pointChange} onClick={() => setChanging(true)}>
              {t('checkout.address.pointChange')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={fields.point}>
      <div className={fields.pointSearch}>
        <div
          className={fields.pointPostcode}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              search(postcode);
            }
          }}
        >
          <Field
            label={t('checkout.address.pointPostcode')}
            value={postcode}
            onChange={onPostcodeChange}
            autoComplete="postal-code"
            maxLength={16}
          />
        </div>
        <button
          type="button"
          className={fields.pointSearchButton}
          data-sf-part="button"
          data-variant="default"
          disabled={state.status === 'searching'}
          onClick={() => search(postcode)}
        >
          {t('checkout.address.pointSearch')}
        </button>
      </div>

      <div aria-live="polite">
        {state.status === 'idle' ? <p className={fields.hint}>{t('checkout.address.pointPrompt')}</p> : null}
        {state.status === 'searching' ? <p className={fields.hint}>{t('checkout.address.pointSearching')}</p> : null}
        {state.status === 'empty' ? <p className={fields.hint}>{t('checkout.address.pointEmpty')}</p> : null}
        {state.status === 'error' ? (
          <p className={fields.error}>{t(state.kind === 'busy' ? 'checkout.address.pointBusy' : 'checkout.address.pointFailed')}</p>
        ) : null}
      </div>

      {state.status === 'results' ? (
        <div className={`${fields.choices} ${fields.pointList}`} role="radiogroup" aria-label={t('checkout.address.pointList')}>
          {state.points.map((p) => (
            <label className={fields.choice} key={`${p.carrier}-${p.id}`}>
              <input
                type="radio"
                name="service-point"
                checked={value?.id === p.id && value.carrier === p.carrier}
                onChange={() => {
                  setChanging(false);
                  onChoose(p);
                }}
              />
              <span className={fields.marker} aria-hidden />
              <PointLines point={p} />
            </label>
          ))}
        </div>
      ) : null}

      {error ? <span className={fields.error}>{msg(error)}</span> : null}
    </div>
  );
}
```

The radio's accessible name comes from its wrapping `<label>` (name, address, carrier, distance), which is what `getByRole('radio', { name: /News Plus/ })` matches.

- [ ] **Step 6: Render it in the address step**

In `web/src/features/checkout/steps/AddressStep.tsx`:

Imports: add `import { PointPicker } from '@/features/checkout/PointPicker.tsx';` and `import { countryName } from '@/features/checkout/CountrySelect.tsx';` (extend the existing `CountrySelect` import).

Inside the component, after `const labels = addressLabels(form.country);`:

```tsx
  const collecting = form.deliveryMethod === 'collection' && (mode === 'choice' || mode === 'collection');
```

Directly after the `<CountrySelect … />` element add:

```tsx
      {mode === 'choice' ? (
        <div className={fields.field}>
          <span className={fields.label} id="deliver-to-label">{t('checkout.address.deliverTo')}</span>
          <div className={fields.segmented} role="radiogroup" aria-labelledby="deliver-to-label">
            {(['home', 'collection'] as const).map((method) => (
              <label className={fields.segment} key={method}>
                <input
                  type="radio"
                  name="delivery-method"
                  checked={form.deliveryMethod === method}
                  onChange={() =>
                    patch({
                      deliveryMethod: method,
                      // First time into collection: start the point search from the postcode already typed.
                      ...(method === 'collection' && !form.pointPostcode && form.zip ? { pointPostcode: form.zip } : {}),
                    })
                  }
                />
                <span>{t(method === 'home' ? 'checkout.address.methodHome' : 'checkout.address.methodCollection')}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {mode === 'collection' ? (
        <p className={classes.note}>{t('checkout.address.collectionOnly', { country: countryName(form.country) })}</p>
      ) : null}
```

Wrap the five address `Field`s and the County/Postcode pair (everything from the Address line 1 `Field` to the closing `</div>` of `fields.pair`) so they render only for home:

```tsx
      {collecting ? (
        <PointPicker
          country={form.country}
          value={form.servicePoint}
          postcode={form.pointPostcode || form.zip}
          error={errors.servicePoint}
          onPostcodeChange={(v) => patch({ pointPostcode: v })}
          onChoose={(point) => patch({ servicePoint: point })}
        />
      ) : (
        <>
          {/* …the existing Address line 1, 2, 3, City fields and the County / Postcode pair, unchanged… */}
        </>
      )}
```

Remove the temporary `errors.servicePoint` note if Task 5 added one. Update the component's doc comment: replace the paragraph saying delivery is to an address only with: `With a country that offers collection points the shopper can switch to one: the address fields give way to a postcode search and a list (PointPicker). The home fields are kept in the form, so switching back restores them.`

The `radiogroup` test looks the group up by name `'Deliver to'`: `aria-labelledby` pointing at the label span provides it. Use `useId()` for that id rather than the literal `deliver-to-label` (two address steps can be on the editor canvas at once).

- [ ] **Step 7: Style**

Append to `web/src/features/checkout/Fields.module.css`, before the `@media (prefers-reduced-motion: reduce)` rule:

```css
/* Home / collection switch: two segments in one hairline frame, the chosen one filled. */
.segmented {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 1px solid var(--sf-line-strong);
  border-radius: var(--sf-card-radius);
  overflow: hidden;
}

.segment {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0.5rem 0.75rem;
  font-family: var(--sf-font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-align: center;
  color: var(--sf-muted);
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}

.segment + .segment {
  border-left: 1px solid var(--sf-line-strong);
}

.segment input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.segment:has(input:checked) {
  background: var(--sf-surface);
  color: var(--sf-text);
}

.segment:has(input:focus-visible) {
  outline: 2px solid var(--sf-primary);
  outline-offset: -2px;
}

/* The collection-point picker: postcode + search, a status line, then the list. */
.point {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
}

.pointSearch {
  display: flex;
  align-items: flex-end;
  gap: 0.6rem;
}

.pointPostcode {
  flex: 1;
  min-width: 0;
}

.pointSearchButton {
  flex: none;
  min-height: 44px;
  padding: 0 1rem;
  border: 1px solid var(--sf-line-strong);
  border-radius: var(--sf-btn-radius, var(--sf-card-radius));
  background: transparent;
  color: var(--sf-text);
  font-family: var(--sf-font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  cursor: pointer;
}

.pointSearchButton:disabled {
  opacity: 0.5;
  cursor: default;
}

/* Long result lists scroll inside the step rather than pushing Continue off-screen. */
.pointList {
  max-height: 22rem;
  overflow-y: auto;
}

.pointChosen {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 56px;
  padding: 0.7rem 0.85rem;
}

.pointChange {
  margin-left: auto;
  flex: none;
  min-height: 44px;
  padding: 0 0.25rem;
  border: 0;
  background: transparent;
  color: var(--sf-primary);
  font-family: var(--sf-font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  cursor: pointer;
}
```

Add `.segment` to the selector list of the `prefers-reduced-motion` rule. In `.pointChosen`, the distance figure from `PointLines` already takes `margin-left: auto` via `.choiceFigure`; make sure the Change button sits last without doubling that margin (set `margin-left: 0.5rem` on `.pointChange` when a figure precedes it, or drop the figure from the chosen summary if it reads as clutter; the tests do not assert the distance in the chosen summary).

- [ ] **Step 8: Run and check**

Run: `npx vitest run test/use-point-search.test.tsx test/point-picker.test.tsx test/address-step.test.tsx test/checkout-page.test.tsx && npx tsc -b`
Expected: PASS, clean.

Run: `npm test` (from `web/`)
Expected: PASS except stored goldens that render the address step for a country in `choice` or `collection` mode, if any exist (the existing goldens use settings with no `collectionCountries`, so they should be unchanged; a red golden here is unexpected: stop and report).

Rendered acceptance checks, via a throwaway Playwright script against the mock backend (as the phone-control task did: `e2e/mocks.ts` with `tweakSettings` setting `shipping: { countries: ['GB'], collectionCountries: ['GB'] }` and a `page.route` for `**/api/storefront/service-points**` returning three synthetic points; delete the script afterwards), at 360, 390 and 1280 px, in each template and both input styles:

- The switch reads as one control; the chosen segment is clearly distinguished; keyboard focus is visible; arrow keys move between the two radios.
- Postcode box and Search button align on one row; Search is at least 44 px tall.
- The list rows show name, address, carrier and distance without wrapping awkwardly; a long point name wraps rather than overflowing; ten or more rows scroll inside the list.
- The chosen-point summary shows the point and Change; the status line never causes layout jump of more than its own height.
- No horizontal page scroll at 360 px.
- The Telegram Mini App layout (`webapp`) renders the same picker.

Say exactly which checks were done.

- [ ] **Step 9: Commit**

```bash
git add web/src/features/checkout/usePointSearch.ts web/src/features/checkout/PointPicker.tsx web/src/features/checkout/steps/AddressStep.tsx web/src/features/checkout/Fields.module.css web/src/text/keys/checkout.ts web/src/text/notes/checkout.ts web/test/use-point-search.test.tsx web/test/point-picker.test.tsx web/test/address-step.test.tsx
git commit -m "feat(checkout): choose home delivery or a collection point, and find a point by postcode"
```

---

### Task 7: Storefront "Collect from" on review and order pages

UI task (small): Sonnet with the frontend-design skill.

**Files:**
- Modify: `web/src/features/checkout/steps/ReviewStep.tsx`
- Modify: `web/src/features/order-status/AddressCard.tsx`
- Modify: `web/src/features/account/OrderDetailPage.tsx` (`HeadingView`)
- Modify: `web/src/text/keys/{checkout,order,account}.ts` and matching `web/src/text/notes/*.ts`
- Create: `web/test/collect-from.test.tsx`

**Interfaces:**
- Consumes: `collectionAddress` (Task 4); `ShippingAddress.servicePoint`, `OrderDetail.servicePoint` (Task 4 types).
- Produces: text keys `checkout.review.collectFrom`, `order.address.collectFrom`, `account.order.collectFrom`.

- [ ] **Step 1: Text keys**

- `web/src/text/keys/checkout.ts`, after `'review.notChosen'`: `'review.collectFrom': { en: 'Collect from', max: 40 },`
- `web/src/text/keys/order.ts`, after `'address.title'`: `'address.collectFrom': { en: 'Collect from', max: 40 },`
- `web/src/text/keys/account.ts`, after `'order.placed'`: `'order.collectFrom': { en: 'Collect from {name}', max: 80 },`
- a note for each in the matching `notes` file (for example `'review.collectFrom': 'Review step: heading above the collection point on the address slip'`).

- [ ] **Step 2: Write the failing tests**

Create `web/test/collect-from.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AddressCard } from '@/features/order-status/AddressCard.tsx';
import { ReviewStep } from '@/features/checkout/steps/ReviewStep.tsx';
import { DEFAULT_FORM } from '@/features/checkout/form-state.ts';
import type { ShippingAddress } from '@/types/public-order.ts';

afterEach(cleanup);
const wrap = (ui: React.ReactNode) => render(<MantineProvider env="test">{ui}</MantineProvider>);

const address: ShippingAddress = {
  firstName: 'Ada', surname: 'Sterling', addressLine1: 'Kirkgate 14', addressLine2: null, addressLine3: null,
  city: 'Leeds', county: null, zip: 'LS1 6BY', country: 'GB',
};
const point = {
  id: '12345', carrier: 'inpost', name: 'Tesco Express', street: 'Kirkgate', houseNumber: '14', postalCode: 'LS1 6BY',
  city: 'Leeds', country: 'GB', latitude: null, longitude: null, distance: 300,
};

describe('AddressCard', () => {
  it('names the collection point above the address', () => {
    wrap(<AddressCard address={{ ...address, servicePoint: { name: 'Tesco Express', carrier: 'inpost' } }} />);
    expect(screen.getByText('Collect from')).toBeTruthy();
    expect(screen.getByText('Tesco Express')).toBeTruthy();
    expect(screen.getByText('Kirkgate 14')).toBeTruthy();
  });
  it('is unchanged for a home delivery and for an older backend', () => {
    wrap(<AddressCard address={address} />);
    expect(screen.queryByText('Collect from')).toBeNull();
    cleanup();
    wrap(<AddressCard address={{ ...address, servicePoint: null }} />);
    expect(screen.queryByText('Collect from')).toBeNull();
  });
});

describe('ReviewStep address slip', () => {
  const review = (form: typeof DEFAULT_FORM) =>
    wrap(<ReviewStep form={form} quote={undefined} method={undefined} combo={null} order={['contact', 'address', 'shipping', 'payment', 'review']} onEdit={() => {}} />);

  it('a collection shows the point, not the home address the shopper typed earlier', () => {
    review({ ...DEFAULT_FORM, country: 'GB', addressLine1: '1 Home Street', city: 'York', zip: 'YO1 1AA', deliveryMethod: 'collection', servicePoint: point });
    expect(screen.getByText('Collect from')).toBeTruthy();
    expect(screen.getByText('Tesco Express')).toBeTruthy();
    expect(screen.getByText(/Kirkgate 14/)).toBeTruthy();
    expect(screen.queryByText('1 Home Street')).toBeNull();
  });
  it('a home delivery shows the home address even when a point is remembered', () => {
    review({ ...DEFAULT_FORM, country: 'GB', addressLine1: '1 Home Street', city: 'York', zip: 'YO1 1AA', servicePoint: point });
    expect(screen.getByText('1 Home Street')).toBeTruthy();
    expect(screen.queryByText('Collect from')).toBeNull();
  });
});
```

Run: `npx vitest run test/collect-from.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`web/src/features/order-status/AddressCard.tsx`: inside `<address>`, before the name paragraph, add:

```tsx
        {address.servicePoint ? (
          <>
            <p className={classes.cardEyebrow}>{t('order.address.collectFrom')}</p>
            <p className={classes.addressName}>{address.servicePoint.name}</p>
          </>
        ) : null}
```

`web/src/features/checkout/steps/ReviewStep.tsx`: import `import { collectionAddress } from '@/features/checkout/collection-mode.ts';`, compute `const collect = collectionAddress(form);` beside `phone`, and replace the `address` slip's `body` with:

```tsx
      body: collect ? (
        <>
          <span>{t('checkout.review.collectFrom')}</span>
          {collect.servicePointName}
          <span>{collect.addressLine1}</span>
          <span>
            {collect.city} {collect.zip}
          </span>
          <span>{countryName(collect.country)}</span>
        </>
      ) : (
        <>
          {form.addressLine1}
          {form.addressLine2 ? <span>{form.addressLine2}</span> : null}
          {form.addressLine3 ? <span>{form.addressLine3}</span> : null}
          <span>
            {form.city}
            {form.county ? `, ${form.county}` : ''} {form.zip}
          </span>
          <span>{countryName(form.country)}</span>
        </>
      ),
```

`web/src/features/account/OrderDetailPage.tsx`, in `HeadingView`: read the order data the way the view already does, and under the existing "Placed {date}" line add a sibling line in the same element and class as that line:

```tsx
      {data.servicePoint ? <p className={/* the class the Placed line uses */}>{t('account.order.collectFrom', { name: data.servicePoint.name })}</p> : null}
```

Use the exact element and class of the existing `account.order.placed` line so it inherits its styling.

Add a test for it to `web/test/collect-from.test.tsx` only if `HeadingView` can be rendered on its own the way an existing test in `web/test/` renders account order parts (search `OrderDetailPage` in `web/test`); if it needs the whole page harness, cover it in the Task 8 end-to-end test instead and say so in the report.

- [ ] **Step 4: Run and commit**

Run: `npx vitest run test/collect-from.test.tsx test/checkout-page.test.tsx && npx tsc -b && npm test`
Expected: the focused tests pass; in the full suite only stored goldens of the review step or order pages may be red, and only if their fixtures have a collection point (existing fixtures do not, so nothing should be red: a red golden is unexpected, stop and report).

```bash
git add web/src/features/checkout/steps/ReviewStep.tsx web/src/features/order-status/AddressCard.tsx web/src/features/account/OrderDetailPage.tsx web/src/text/keys/checkout.ts web/src/text/keys/order.ts web/src/text/keys/account.ts web/src/text/notes web/test/collect-from.test.tsx
git commit -m "feat(orders): review step and order pages say which collection point an order goes to"
```

(Stage only the notes files actually changed.)

---

### Task 8: End-to-end tests, baselines, docs, then stop

**Files:**
- Modify: `e2e/mocks.ts` (a `storefront/service-points` route; `InstallMocksOptions`)
- Modify: `e2e/checkout-parts.spec.ts` (a new `describe`)
- Modify: `docs/builder.md`
- Regenerate: only baselines named by Step 3

Run from the repo root.

- [ ] **Step 1: Mock the point search**

In `e2e/mocks.ts`:

- add to `InstallMocksOptions`: `/** What `GET storefront/service-points` answers with a postcode (default: three synthetic GB points). A number answers with that HTTP status instead. */ servicePoints?: ServicePoint[] | number;` and import the `ServicePoint` type from `../web/src/types/service-points.ts`;
- add to the mock state (beside `checkouts`) `servicePointSearches: string[]` and initialise it to `[]`;
- in the `/api/**` handler, before the checkout quote branch, add:

```ts
    if (path === 'storefront/service-points' && method === 'GET') {
      const query = new URL(route.request().url()).searchParams;
      const postalCode = query.get('postalCode');
      const answer = options.servicePoints ?? DEFAULT_SERVICE_POINTS;
      if (postalCode) state.servicePointSearches.push(postalCode);
      if (typeof answer === 'number') {
        await route.fulfill({ status: answer, contentType: 'application/json', body: JSON.stringify({ success: false, data: null, error: 'Service point search is temporarily unavailable. Please try again.' }) });
        return;
      }
      await envelope(route, { available: answer.length > 0, carriers: [...new Set(answer.map((p) => p.carrier))], points: postalCode ? answer : [] });
      return;
    }
```

- define near the other fixtures:

```ts
/** Synthetic collection points (no real shop, carrier account or address). */
export const DEFAULT_SERVICE_POINTS: ServicePoint[] = [
  { id: '9001', carrier: 'inpost', name: 'Northbound Locker A', street: 'Kirkgate', houseNumber: '14', postalCode: 'LS1 6BY', city: 'Leeds', country: 'GB', latitude: null, longitude: null, distance: 320 },
  { id: '9002', carrier: 'evri', name: 'Corner News', street: 'Vicar Lane', houseNumber: '2', postalCode: 'LS1 7JH', city: 'Leeds', country: 'GB', latitude: null, longitude: null, distance: 540 },
  { id: '9003', carrier: 'inpost', name: 'Station Locker', street: 'Station Road', houseNumber: '', postalCode: 'LS1 4DY', city: 'Leeds', country: 'GB', latitude: null, longitude: null, distance: null },
];
```

Read how `quoteFor(state.quote, asked)` builds the mocked quote. If it does not already echo the asked `shippingOptionId`, leave it; the new test only needs the existing "Tracked 24" option to be offered for a collection quote, which it is (the mock ignores the delivery method).

- [ ] **Step 2: The end-to-end test**

In `e2e/checkout-parts.spec.ts`, after the `describe` titled `checkout · the contact and address form`, add:

```ts
test.describe('checkout · collection points', () => {
  const withCollection = (s: Parameters<NonNullable<OpenOptions['tweakSettings']>>[0]) => {
    s.shipping = { countries: ['GB'], collectionCountries: ['GB'] };
  };
  const next = (page: Page) => page.getByRole('button', { name: 'Continue' }).click();

  async function fillContact(page: Page, phone: string | null) {
    await page.getByRole('textbox', { name: 'First name' }).fill('Ada');
    await page.getByRole('textbox', { name: 'Surname' }).fill('Sterling');
    await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.invalid');
    if (phone) await page.getByRole('textbox', { name: 'Phone' }).fill(phone);
  }

  test('a signed-in shopper collects from a point: quote, order body, review', async ({ page }) => {
    const { mocks } = await open(page, 'storefront', null, '/checkout', { tweakSettings: withCollection });
    await fillContact(page, '07801 123456');
    await next(page);

    await expect(page.getByRole('heading', { name: 'Delivery address' })).toBeVisible();
    await page.getByRole('radio', { name: 'Collection point' }).check();
    await expect(page.getByRole('textbox', { name: 'Address line 1' })).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Postcode' }).fill('LS1 6BY');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByRole('radio', { name: /Northbound Locker A/ })).toBeVisible();
    await page.getByRole('radio', { name: /Corner News/ }).check();
    await next(page);

    await page.getByText('Tracked 24').click();
    await next(page);
    await page.locator('label').filter({ hasText: 'Crypto' }).first().click();
    await page.locator('label').filter({ hasText: 'USDT' }).first().click();
    await next(page);

    await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
    await expect(page.getByText('Collect from')).toBeVisible();
    await expect(page.getByText('Corner News')).toBeVisible();

    await placeOrder(page);
    expect(mocks.state.servicePointSearches).toEqual(['LS1 6BY']);
    expect(mocks.state.quotes.at(-1)).toMatchObject({ country: 'GB', deliveryMethod: 'collection', servicePointCarrier: 'evri' });
    expect(mocks.state.checkouts[0]!.shippingAddress).toEqual({
      firstName: 'Ada', surname: 'Sterling', addressLine1: 'Vicar Lane 2', addressLine2: null, addressLine3: null,
      city: 'Leeds', county: null, zip: 'LS1 7JH', country: 'GB',
      servicePointId: '9002', servicePointCarrier: 'evri', servicePointName: 'Corner News',
    });
  });

  test('switching back to home restores the address and sends no point', async ({ page }) => {
    const { mocks } = await open(page, 'storefront', null, '/checkout', { tweakSettings: withCollection });
    await fillContact(page, null);
    await next(page);
    await page.getByRole('textbox', { name: 'Address line 1' }).fill('14 Kirkgate');
    await page.getByRole('textbox', { name: 'Town / City' }).fill('Leeds');
    await page.getByRole('textbox', { name: 'Postcode' }).fill('LS1 6BY');
    await page.getByRole('radio', { name: 'Collection point' }).check();
    await expect(page.getByRole('textbox', { name: 'Postcode' })).toHaveValue('LS1 6BY');
    await page.getByRole('radio', { name: 'Home address' }).check();
    await expect(page.getByRole('textbox', { name: 'Address line 1' })).toHaveValue('14 Kirkgate');
    await next(page);
    await page.getByText('Tracked 24').click();
    await next(page);
    await page.locator('label').filter({ hasText: 'Crypto' }).first().click();
    await page.locator('label').filter({ hasText: 'USDT' }).first().click();
    await next(page);
    await placeOrder(page);
    expect(mocks.state.checkouts[0]).toMatchObject(BASE_BODY);
    expect(Object.keys(mocks.state.checkouts[0]!.shippingAddress as object)).not.toEqual(expect.arrayContaining(['servicePointId']));
  });

  test('collection needs a phone: placing sends the shopper back to their details', async ({ page }) => {
    await open(page, 'storefront', null, '/checkout', { tweakSettings: withCollection });
    await fillContact(page, null);
    await next(page);
    await page.getByRole('radio', { name: 'Collection point' }).check();
    await page.getByRole('textbox', { name: 'Postcode' }).fill('LS1');
    await page.getByRole('button', { name: 'Search' }).click();
    await page.getByRole('radio', { name: /Northbound Locker A/ }).check();
    await next(page);
    await page.getByText('Tracked 24').click();
    await next(page);
    await page.locator('label').filter({ hasText: 'Crypto' }).first().click();
    await page.locator('label').filter({ hasText: 'USDT' }).first().click();
    await next(page);
    await page.getByRole('button', { name: /^Place order/ }).click();
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
    await expect(page.getByText('Required')).toBeVisible();
  });

  test('a guest can collect, and a failed search says so', async ({ page }) => {
    const { mocks } = await open(page, 'storefront', null, '/checkout', { guest: true, tweakSettings: withCollection });
    await fillContact(page, '07801 123456');
    await next(page);
    await page.getByRole('radio', { name: 'Collection point' }).check();
    await page.getByRole('textbox', { name: 'Postcode' }).fill('LS1 6BY');
    await page.getByRole('button', { name: 'Search' }).click();
    await page.getByRole('radio', { name: /Northbound Locker A/ }).check();
    await next(page);
    await page.getByText('Tracked 24').click();
    await next(page);
    await page.locator('label').filter({ hasText: 'Crypto' }).first().click();
    await page.locator('label').filter({ hasText: 'USDT' }).first().click();
    await next(page);
    await placeOrder(page);
    expect(mocks.state.checkouts[0]!.shippingAddress).toMatchObject({ servicePointId: '9001', servicePointCarrier: 'inpost' });
    expect(mocks.state.guestQuotes.at(-1)).toMatchObject({ deliveryMethod: 'collection', servicePointCarrier: 'inpost' });
  });
});
```

The failed-search half of the last title needs the `servicePoints: 502` mock option, which `open()` does not pass through. Add a `servicePoints` field to `OpenOptions` in this spec and forward it to `installMocks`, then add a fifth test: open with `servicePoints: 502`, choose Collection point, search, and expect `We couldn't load collection points. Please try again.` to be visible. Rename the fourth test to `a guest can collect`.

Adapt each test to how the mocks behave where needed, keeping what it asserts; if an assertion cannot hold because the product does not do what it says, that is a bug: stop and report it.

Run: `npm run test:e2e -- checkout-parts.spec.ts -g "collection points"`
Expected: PASS.

- [ ] **Step 3: Full runs and baselines**

Run: `TZ=UTC npm test` and `npm run test:e2e`.

Expected: unit suites all green. In e2e, the only acceptable failures are (a) the guest "default arrangement" tests that are known to fail only under full-suite load and pass alone (confirm each passes alone), and (b) DOM or screenshot baselines whose diff is fully explained by this plan: none is expected, because the existing baselines use settings with no `collectionCountries`, so the address step, review slip and order pages render exactly as before. Any baseline that differs is unexpected: read its diff; if it is not one of this plan's intended changes, fix the code, do not regenerate. If one is an intended change, regenerate only that file and name it and the reason in the commit message.

The order payload baseline (`BASE_BODY`) must pass unchanged for home orders.

- [ ] **Step 4: Docs**

In `docs/builder.md`, after the paragraph added in v0.14.0 that begins "The address step leads with the country", add:

```markdown
Where a country offers collection points (`settings.shipping.collectionCountries`), the address step
shows a Home address / Collection point switch; a country in that list but not in
`settings.shipping.countries` is collection only. Collection replaces the address fields with a
postcode search and a list of points (`features/checkout/PointPicker.tsx`, fed by
`GET storefront/service-points`, limited to 60 searches per 15 minutes per shopper). The rules for
what a change clears live in `features/checkout/collection-mode.ts`: a new country clears the point,
and a new method or a point from another carrier clears the chosen delivery option. A collection
order needs a phone number, so the phone field becomes required and a shop that hides it offers no
collection. The picker is part of the existing Delivery address part: there is no separate block,
and its wording is ordinary editable Site text under `checkout.address.*`.
```

- [ ] **Step 5: Commit**

```bash
git add e2e/mocks.ts e2e/checkout-parts.spec.ts docs/builder.md
git commit -m "test(checkout): end-to-end collection-point orders on the mock backend; docs"
```

(Add any regenerated baseline, named in the message body with its reason.)

- [ ] **Step 6: Stop and report**

Report to the owner: both branches and their commits, the unit and e2e results, which rendered checks were done, and what was not verified (no real backend, no real SendCloud search, no real collection order). Merging, the `web 0.15.0` bump, the `v0.15.0` tag and any push or deploy happen only on their say-so, backend first.
