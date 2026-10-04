# Checkout Form Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the storefront checkout's Contact and Address steps read as a finished form: a merged phone control showing `+44`, a third address line, country-aware labels in a sensible order, and a country list limited to where the shop ships.

**Architecture:** The backend adds one derived list, `shipping.countries`, to the anonymous storefront settings response (pure function plus a thin DB loader, no migration). The storefront reads it, filters and reconciles the country, and renders the address step from a small pure profile table that maps a country to editable-text label keys. The phone control is restyled in place; what it stores and submits does not change.

**Tech Stack:** Backend: Express 5, Drizzle (Postgres), vitest. Storefront: React 19, Vite, zod, Mantine, CSS modules, vitest + Testing Library, Playwright.

**Spec:** `ecommerce-storefront/docs/superpowers/specs/2026-10-04-checkout-form-fixes-design.md`

Two repos, both under `T:\Projects\ecommerce\`:

- `ecommerce-backend/` on a new branch `feature/shippable-countries` (Task 1).
- `ecommerce-storefront/` on the existing branch `feature/checkout-form-fixes` (Tasks 2 to 8).

## Global Constraints

- Backend: extensionless imports (`from './users'`); throw `AppError` subclasses, never catch-and-return; no schema change, no migration.
- Storefront: `@/` alias imports **with** `.ts`/`.tsx` extensions; shopper-visible wording only through editable-text keys (`useText().t`), never string literals in components.
- Submitted phone value is unchanged: `composePhoneNumber` output goes to the backend as today. The backend's `normalisePhone` is the single authority on the stored number.
- County stays optional for every country. No postcode format validation.
- `sf-checkout-v1` stays the persistence key.
- The collection-point exclusion in the country list is temporary (piece 2 removes it). Keep it in one clearly commented place.
- A missing or empty `shipping.countries` means "show every country", exactly as today.
- Storefront release is `web` version `0.14.0`, tag `v0.14.0`. Run `TZ=UTC npm test` before tagging (release CI is en-US/UTC).
- Deploy order: backend first, then storefront. Either alone must be harmless.
- Do not run Docker on this machine. Do not push or deploy without the owner's say-so.
- Never commit real customer data, production screenshots or client brand names to the storefront repo.
- Storefront UI work (Tasks 5 and 6) is delegated to a frontend-design subagent; use `sonnet` for implementers and `haiku` for small re-reviews.
- Git on Windows: files must stay LF. After any scripted edit check `git diff --numstat` for a whole-file rewrite.
- Bash heredocs break on backticks in this harness: write files with the Write tool, not `cat <<EOF`.

## Review Focus

1. A returning shopper whose saved form predates this release (no `addressLine3`) must load with a blank line 3, not `undefined`, and still be able to place the order. Test in Task 3.
2. The settings list arrives lower-case, duplicated, padded or with a non-two-letter entry: the dropdown shows each real country once and ignores the rest. Test in Task 4.
3. The shippable list shrinks while a shopper is mid-checkout (settings refetch on window focus): their now-unshippable country is cleared rather than silently kept and quoted. Test in Task 4.
4. A single-country shop preselects the country, and the phone prefix follows it unless the shopper already chose a prefix. Test in Task 4.
5. The shippable-countries query throws: `GET /settings` must still answer (with an empty list) so the storefront boots and falls back to all countries. Test in Task 1.

## File Structure

Backend (`ecommerce-backend/src/`):

| File | Responsibility |
|---|---|
| `modules/shipping/shippable-countries.ts` (new) | Pure `computeShippableCountries` plus DB loader `getShippableCountries` |
| `modules/shipping/shippable-countries.test.ts` (new) | Unit tests for the pure function |
| `modules/storefront-settings/service.ts` | Add `shipping.countries` to `PublicStorefrontSettings` and its builder |
| `modules/storefront-settings/public-settings.test.ts` | Response carries the list; a failing loader yields `[]` |
| `lib/phone.test.ts` | Pin the GB and IT leading-zero behaviour |
| `STOREFRONT.md`, `CLAUDE.md` | Contract and notes |

Storefront (`ecommerce-storefront/web/`):

| File | Responsibility |
|---|---|
| `src/types/settings.ts` | `shipping?: { countries: string[] }` |
| `src/features/checkout/address-profiles.ts` (new) | Country → profile → label keys (pure) |
| `src/text/keys/checkout.ts`, `src/text/notes/checkout.ts` | New and reworded label keys |
| `src/lib/dial-codes.ts` | `displayPhoneNumber` |
| `src/features/checkout/form-state.ts`, `schemas.ts`, `CheckoutPage.tsx`, `steps/ReviewStep.tsx` | `addressLine3` end to end; Review display |
| `src/features/checkout/ship-countries.ts` (new) | Normalise the list; reconcile the form's country (pure) |
| `src/features/checkout/CountrySelect.tsx` | Render only allowed countries |
| `src/builder/family-checkout.ts`, `src/features/checkout/checkout-parts.tsx` | Carry `shipCountries` to the step views |
| `src/features/checkout/steps/AddressStep.tsx` | New order, line 3, profile labels |
| `src/features/checkout/PhoneField.tsx`, `Field.tsx`, `Fields.module.css`, `steps/ContactStep.tsx` | Merged phone control |
| `test/*.test.ts(x)`, `../e2e/*` | Tests and baselines |

---

### Task 1: Backend `shipping.countries`

**Repo:** `ecommerce-backend`. Start with `git checkout main && git checkout -b feature/shippable-countries`.

**Files:**
- Create: `src/modules/shipping/shippable-countries.ts`
- Create: `src/modules/shipping/shippable-countries.test.ts`
- Modify: `src/modules/storefront-settings/service.ts` (type near line 169, builder near line 576)
- Modify: `src/modules/storefront-settings/public-settings.test.ts`
- Modify: `src/lib/phone.test.ts`
- Modify: `STOREFRONT.md` (the `GET /settings` section, near the `login.phone` paragraph around line 1399), `CLAUDE.md` (Settings bullet)

**Interfaces:**
- Produces: `computeShippableCountries(serviceable: readonly string[], regions: readonly ShippableRegion[], options: readonly ShippableOption[]): string[]` and `getShippableCountries(serviceable: readonly string[]): Promise<string[]>`. Public settings JSON gains `shipping: { countries: string[] }` (ISO alpha-2, upper-case, sorted, possibly empty).

- [ ] **Step 1: Write the failing unit test**

Create `src/modules/shipping/shippable-countries.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/client', () => ({ db: {} }));

import { computeShippableCountries } from './shippable-countries';

const region = (id: number, countryCodes: string, isActive = true) => ({ id, countryCodes, isActive });
const option = (regionId: number, over: Partial<{ isActive: boolean; isPublic: boolean; isCollectionPoint: boolean }> = {}) => ({
  regionId, isActive: true, isPublic: true, isCollectionPoint: false, ...over,
});

describe('computeShippableCountries', () => {
  it('lists every country of an active region with a usable option, sorted', () => {
    expect(computeShippableCountries([], [region(1, 'IE,GB'), region(2, 'FR')], [option(1), option(2)])).toEqual(['FR', 'GB', 'IE']);
  });

  it('an empty serviceable setting means no narrowing', () => {
    expect(computeShippableCountries([], [region(1, 'GB')], [option(1)])).toEqual(['GB']);
  });

  it('a serviceable setting narrows the regions', () => {
    expect(computeShippableCountries(['GB'], [region(1, 'GB,FR')], [option(1)])).toEqual(['GB']);
  });

  it('a serviceable country in no region is not shippable', () => {
    expect(computeShippableCountries(['GB', 'DE'], [region(1, 'GB')], [option(1)])).toEqual(['GB']);
  });

  it('skips an inactive region', () => {
    expect(computeShippableCountries([], [region(1, 'GB', false)], [option(1)])).toEqual([]);
  });

  it('skips a region whose options are all inactive, hidden or collection-point', () => {
    const regions = [region(1, 'GB'), region(2, 'FR'), region(3, 'DE'), region(4, 'ES')];
    const options = [option(1, { isActive: false }), option(2, { isPublic: false }), option(3, { isCollectionPoint: true })];
    expect(computeShippableCountries([], regions, options)).toEqual([]);
  });

  it('one usable option is enough beside unusable ones', () => {
    expect(computeShippableCountries([], [region(1, 'GB')], [option(1, { isPublic: false }), option(1)])).toEqual(['GB']);
  });

  it('a country in two regions appears once', () => {
    expect(computeShippableCountries([], [region(1, 'GB,IE'), region(2, 'GB')], [option(1), option(2)])).toEqual(['GB', 'IE']);
  });

  it('normalises case and whitespace and drops anything that is not two letters', () => {
    expect(computeShippableCountries([' gb '], [region(1, 'gb, ie ,,GBR,1X')], [option(1)])).toEqual(['GB']);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/modules/shipping/shippable-countries.test.ts`
Expected: FAIL, cannot find module `./shippable-countries`.

- [ ] **Step 3: Implement**

Create `src/modules/shipping/shippable-countries.ts`:

```ts
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { shippingRegions } from '../../db/schema/shipping-regions';
import { shippingOptions } from '../../db/schema/shipping-options';

export interface ShippableRegion { id: number; countryCodes: string; isActive: boolean }
export interface ShippableOption { regionId: number; isActive: boolean; isPublic: boolean; isCollectionPoint: boolean }

const ISO2 = /^[A-Z]{2}$/;
const code = (raw: string) => raw.trim().toUpperCase();

/**
 * Countries a web checkout can deliver to: ISO alpha-2, upper-case, sorted.
 *
 * A country counts when an active region lists it and that region has an option
 * the web checkout can offer, and the serviceable setting (when not empty)
 * contains it. Customer-group shipping rules are deliberately not applied: the
 * result feeds the anonymous, cached settings response.
 */
export function computeShippableCountries(
  serviceable: readonly string[],
  regions: readonly ShippableRegion[],
  options: readonly ShippableOption[],
): string[] {
  // TEMPORARY (checkout feedback piece 2): the web checkout quotes home delivery
  // only, so a collection-point option does not make a country shippable yet.
  // Remove `!o.isCollectionPoint` in the release that adds the web point picker.
  const usableRegions = new Set(
    options.filter((o) => o.isActive && o.isPublic && !o.isCollectionPoint).map((o) => o.regionId),
  );
  const allow = new Set(serviceable.map(code).filter((c) => ISO2.test(c)));

  const out = new Set<string>();
  for (const region of regions) {
    if (!region.isActive || !usableRegions.has(region.id)) continue;
    for (const raw of region.countryCodes.split(',')) {
      const c = code(raw);
      if (!ISO2.test(c)) continue;
      if (allow.size > 0 && !allow.has(c)) continue;
      out.add(c);
    }
  }
  return [...out].sort();
}

/** `serviceable` is the store's serviceable-countries setting (empty = all). */
export async function getShippableCountries(serviceable: readonly string[]): Promise<string[]> {
  const [regions, options] = await Promise.all([
    db
      .select({ id: shippingRegions.id, countryCodes: shippingRegions.countryCodes, isActive: shippingRegions.isActive })
      .from(shippingRegions)
      .where(eq(shippingRegions.isActive, true)),
    db
      .select({
        regionId: shippingOptions.regionId,
        isActive: shippingOptions.isActive,
        isPublic: shippingOptions.isPublic,
        isCollectionPoint: shippingOptions.isCollectionPoint,
      })
      .from(shippingOptions)
      .where(eq(shippingOptions.isActive, true)),
  ]);
  return computeShippableCountries(serviceable, regions, options);
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run src/modules/shipping/shippable-countries.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Write the failing settings tests**

In `src/modules/storefront-settings/public-settings.test.ts`:

Extend the hoisted mocks object and add a module mock beside the existing `vi.mock` calls:

```ts
const mocks = vi.hoisted(() => ({
  values: new Map<string, string>(),
  access: {} as Record<string, unknown>,
  shippable: (async () => ['GB', 'IE']) as (serviceable: readonly string[]) => Promise<string[]>,
}));

vi.mock('../shipping/shippable-countries', () => ({
  getShippableCountries: (serviceable: readonly string[]) => mocks.shippable(serviceable),
}));
```

Replace the existing `../settings/service` mock so it returns a serviceable list:

```ts
vi.mock('../settings/service', () => ({
  getSettings: async () => ({ currency: 'GBP', companyName: 'Test Shop', serviceableCountries: ['GB', 'IE', 'FR'] }),
}));
```

In `beforeEach`, reset the loader: `mocks.shippable = async () => ['GB', 'IE'];`

Add at the end of the file:

```ts
describe('getPublicStorefrontSettings shipping block', () => {
  it('carries the shippable countries, computed from the serviceable setting', async () => {
    const seen: Array<readonly string[]> = [];
    mocks.shippable = async (serviceable) => { seen.push(serviceable); return ['GB', 'IE']; };
    const { shipping, login } = await getPublicStorefrontSettings();
    expect(shipping).toEqual({ countries: ['GB', 'IE'] });
    expect(seen).toEqual([['GB', 'IE', 'FR']]);
    // The sign-in hint keeps the raw serviceable setting.
    expect(login.phone.countries).toEqual(['GB', 'IE', 'FR']);
  });

  it('a failing lookup still answers, with an empty list', async () => {
    mocks.shippable = async () => { throw new Error('db down'); };
    const { shipping, enabled } = await getPublicStorefrontSettings();
    expect(shipping).toEqual({ countries: [] });
    expect(typeof enabled).toBe('boolean');
  });
});
```

Run: `npx vitest run src/modules/storefront-settings/public-settings.test.ts`
Expected: the two new tests FAIL (`shipping` is undefined); existing tests still pass.

- [ ] **Step 6: Implement in the settings service**

In `src/modules/storefront-settings/service.ts`:

Add the import beside the other module imports:

```ts
import { getShippableCountries } from '../shipping/shippable-countries';
```

Add to `PublicStorefrontSettings`, after `supportLinks`:

```ts
  /** Where a web checkout can deliver (ISO alpha-2, sorted). Empty = unknown: the storefront then lists every country. */
  shipping: { countries: string[] };
```

Add above `getPublicStorefrontSettings`:

```ts
/** The settings response must answer even if this lookup fails: an empty list makes the storefront list every country. */
async function safeShippableCountries(serviceable: readonly string[]): Promise<string[]> {
  try {
    return await getShippableCountries(serviceable);
  } catch {
    return [];
  }
}
```

In `getPublicStorefrontSettings`, after the `Promise.all` block:

```ts
  const shippableCountries = await safeShippableCountries(serviceableCountries ?? []);
```

and in the returned object, after `supportLinks: settings.supportLinks,`:

```ts
    shipping: { countries: shippableCountries },
```

- [ ] **Step 7: Run the settings tests, then the whole suite**

Run: `npx vitest run src/modules/storefront-settings/public-settings.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS. If another test file that calls `getPublicStorefrontSettings` (`bird-verify-settings.test.ts`, `telegram-oidc-settings.test.ts`) now fails while importing the database client, add this line beside its other `vi.mock` calls and re-run:

```ts
vi.mock('../shipping/shippable-countries', () => ({ getShippableCountries: async () => [] }));
```

Run: `npx tsc --noEmit`
Expected: no errors. (`tsc` skips `*.test.ts`; `npm test` is what checks test call sites.)

- [ ] **Step 8: Pin the leading-zero behaviour**

In `src/lib/phone.test.ts`, add inside the top-level `describe`, after the test named `strips the trunk zero the clients leave after a territory calling code`:

```ts
  // What the storefront sends when a shopper types the national form with the prefix picked.
  it('strips the trunk zero where the country drops it and keeps it where it is part of the number', () => {
    expect(normalisePhone('+4407801123456')).toBe('+447801123456');
    expect(normalisePhone('+330612345678')).toBe('+33612345678');
    expect(normalisePhone('+35308712345678')).toBe('+3538712345678');
    expect(normalisePhone('+39061234567')).toBe('+39061234567');
  });
```

Run: `npx vitest run src/lib/phone.test.ts`
Expected: PASS (this pins existing behaviour; it should pass first time).

- [ ] **Step 9: Document**

In `STOREFRONT.md`, in the `GET /settings` example JSON (the block containing `"login": {`), add a sibling of `login`:

```json
  "shipping": { "countries": ["GB", "IE"] },
```

and add this paragraph directly after the paragraph that begins `` `login.phone` and `login.email` say whether ``:

```markdown
`shipping.countries` lists where a web checkout can deliver: every country in an active shipping region that has at least one active, customer-visible, home-delivery option, narrowed by `serviceableCountries` when that is set. Offer only these in the checkout country picker. The list is the same for every visitor (customer-group shipping rules are not applied), so the quote stays the authority: a country in the list can still answer `422` or an empty `shippingOptions`. An empty list, or a missing `shipping` (older backend), means unknown: list every country. Collection-point-only countries are excluded until the web checkout gains a point picker.
```

In `CLAUDE.md`, append to the **Settings** bullet (the one ending `Public endpoint GET /settings/serviceable-countries.`):

```markdown
 `GET /public/storefront/settings` additionally exposes `shipping.countries` (`modules/shipping/shippable-countries.ts`): the serviceable list narrowed to countries in an active region with an active, public, home-delivery option. The collection-point exclusion there is temporary and marked in the code.
```

- [ ] **Step 10: Commit**

```bash
git add src/modules/shipping/shippable-countries.ts src/modules/shipping/shippable-countries.test.ts src/modules/storefront-settings/service.ts src/modules/storefront-settings/public-settings.test.ts src/lib/phone.test.ts STOREFRONT.md CLAUDE.md
git commit -m "feat(storefront-settings): expose shipping.countries, the countries a web checkout can deliver to"
```

Add any test file touched by the Step 7 fallback to the same commit.

---

### Task 2: Storefront settings type, label keys and address profiles

**Repo:** `ecommerce-storefront`, branch `feature/checkout-form-fixes`. Run commands from `web/` unless stated.

**Files:**
- Modify: `web/src/types/settings.ts` (`StorefrontSettings`)
- Create: `web/src/features/checkout/address-profiles.ts`
- Create: `web/test/address-profiles.test.ts`
- Modify: `web/src/text/keys/checkout.ts` (lines 50-57 and 68-71), `web/src/text/notes/checkout.ts` (lines 44-51)

**Interfaces:**
- Produces: `StorefrontSettings.shipping?: { countries: string[] }`; `addressProfile(country: string | null | undefined): AddressProfileId`; `addressLabels(country): { city: AddressLabelKey; county: AddressLabelKey; zip: AddressLabelKey }`; text keys `checkout.address.line3`, `.townCity`, `.countyPlain`, `.postcode`, `.eircode`, `.state`, `.zipCode`, `.province`, `.suburb`.

- [ ] **Step 1: Write the failing test**

Create `web/test/address-profiles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addressLabels, addressProfile } from '@/features/checkout/address-profiles.ts';
import { textSnapshot } from '@/text/snapshot.ts';

describe('addressProfile', () => {
  it('maps the UK and the Crown Dependencies to uk', () => {
    for (const iso of ['GB', 'IM', 'JE', 'GG']) expect(addressProfile(iso)).toBe('uk');
  });
  it('maps IE, US, CA and AU to their own profiles', () => {
    expect(addressProfile('IE')).toBe('ie');
    expect(addressProfile('US')).toBe('us');
    expect(addressProfile('CA')).toBe('ca');
    expect(addressProfile('AU')).toBe('au');
  });
  it('is case- and whitespace-insensitive', () => {
    expect(addressProfile(' gb ')).toBe('uk');
  });
  it('falls back for every other country and for no country', () => {
    for (const iso of ['FR', 'DE', 'NZ', 'ZZ', '', null, undefined]) expect(addressProfile(iso)).toBe('default');
  });
});

describe('addressLabels', () => {
  const english = (iso: string | null) => {
    const keys = addressLabels(iso);
    // With no text provider mounted the snapshot answers with the built-in English.
    const { t } = textSnapshot();
    return [t(keys.city), t(keys.county), t(keys.zip)];
  };
  it.each([
    ['GB', ['Town / City', 'County', 'Postcode']],
    ['IE', ['Town / City', 'County', 'Eircode']],
    ['US', ['City', 'State', 'ZIP code']],
    ['CA', ['City', 'Province', 'Postal code']],
    ['AU', ['Suburb', 'State', 'Postcode']],
    ['FR', ['City', 'State / Region', 'Postal code']],
    [null, ['City', 'State / Region', 'Postal code']],
  ])('%s reads %j', (iso, expected) => {
    expect(english(iso)).toEqual(expected);
  });
});
```

Run: `npx vitest run test/address-profiles.test.ts`
Expected: FAIL, cannot find `address-profiles.ts`.

- [ ] **Step 2: Add the type**

In `web/src/types/settings.ts`, add to `StorefrontSettings` after the `currency: string; supportLinks: SupportLink[];` line:

```ts
  /** Where the shop can deliver (ISO alpha-2). Missing (older backend) or empty = unknown: list every country. */
  shipping?: { countries: string[] };
```

- [ ] **Step 3: Add and reword the text keys**

In `web/src/text/keys/checkout.ts`, replace the `address.*` block (from `'address.blurb'` to `'address.chooseCountry'`) with:

```ts
  'address.blurb': { en: 'Where should we send it?', max: 100 },
  'address.line1': { en: 'Address line 1', max: 40 },
  'address.line2': { en: 'Address line 2', max: 40 },
  'address.line3': { en: 'Address line 3', max: 40 },
  'address.city': { en: 'City', max: 40 },
  'address.zip': { en: 'Postal code', max: 40 },
  'address.county': { en: 'State / Region', max: 40 },
  'address.townCity': { en: 'Town / City', max: 40 },
  'address.countyPlain': { en: 'County', max: 40 },
  'address.postcode': { en: 'Postcode', max: 40 },
  'address.eircode': { en: 'Eircode', max: 40 },
  'address.state': { en: 'State', max: 40 },
  'address.zipCode': { en: 'ZIP code', max: 40 },
  'address.province': { en: 'Province', max: 40 },
  'address.suburb': { en: 'Suburb', max: 40 },
  'address.country': { en: 'Country', max: 40 },
  'address.chooseCountry': { en: 'Choose a country', max: 40 },
```

In `web/src/text/notes/checkout.ts`, replace the lines for `'address.line2'` through `'address.county'` with:

```ts
  'address.line2': 'Address step field label (optional field)',
  'address.line3': 'Address step field label (optional field)',
  'address.city': 'City field label for countries without their own wording',
  'address.zip': 'Postal code field label for countries without their own wording',
  'address.county': 'State or region field label for countries without their own wording (optional field)',
  'address.townCity': 'City field label when delivering to the UK or Ireland',
  'address.countyPlain': 'County field label when delivering to the UK or Ireland (optional field)',
  'address.postcode': 'Postal code field label when delivering to the UK or Australia',
  'address.eircode': 'Postal code field label when delivering to Ireland',
  'address.state': 'State field label when delivering to the US or Australia (optional field)',
  'address.zipCode': 'Postal code field label when delivering to the US',
  'address.province': 'Province field label when delivering to Canada (optional field)',
  'address.suburb': 'City field label when delivering to Australia',
```

- [ ] **Step 4: Implement the profiles**

Create `web/src/features/checkout/address-profiles.ts`:

```ts
// Which wording the address step uses for a delivery country. Labels only: required
// rules and formats are the same everywhere (the spec rules out postcode validation).

export type AddressProfileId = 'uk' | 'ie' | 'us' | 'ca' | 'au' | 'default';

export type AddressLabelKey =
  | 'checkout.address.city'
  | 'checkout.address.county'
  | 'checkout.address.zip'
  | 'checkout.address.townCity'
  | 'checkout.address.countyPlain'
  | 'checkout.address.postcode'
  | 'checkout.address.eircode'
  | 'checkout.address.state'
  | 'checkout.address.zipCode'
  | 'checkout.address.province'
  | 'checkout.address.suburb';

export interface AddressLabels {
  city: AddressLabelKey;
  county: AddressLabelKey;
  zip: AddressLabelKey;
}

const PROFILE_OF: Record<string, AddressProfileId> = {
  GB: 'uk', IM: 'uk', JE: 'uk', GG: 'uk',
  IE: 'ie',
  US: 'us',
  CA: 'ca',
  AU: 'au',
};

const LABELS: Record<AddressProfileId, AddressLabels> = {
  default: { city: 'checkout.address.city', county: 'checkout.address.county', zip: 'checkout.address.zip' },
  uk: { city: 'checkout.address.townCity', county: 'checkout.address.countyPlain', zip: 'checkout.address.postcode' },
  ie: { city: 'checkout.address.townCity', county: 'checkout.address.countyPlain', zip: 'checkout.address.eircode' },
  us: { city: 'checkout.address.city', county: 'checkout.address.state', zip: 'checkout.address.zipCode' },
  ca: { city: 'checkout.address.city', county: 'checkout.address.province', zip: 'checkout.address.zip' },
  au: { city: 'checkout.address.suburb', county: 'checkout.address.state', zip: 'checkout.address.postcode' },
};

export function addressProfile(country: string | null | undefined): AddressProfileId {
  return PROFILE_OF[(country ?? '').trim().toUpperCase()] ?? 'default';
}

/** The text keys for the three country-dependent labels. No country chosen = the neutral wording. */
export function addressLabels(country: string | null | undefined): AddressLabels {
  return LABELS[addressProfile(country)];
}
```

- [ ] **Step 5: Run the test and the text suites**

Run: `npx vitest run test/address-profiles.test.ts`
Expected: PASS.

Run: `npx vitest run test/text`
Expected: PASS. A registry test that requires a note for every key, or a `max` on every label, is satisfied by Step 3; if one reports a missing entry, add exactly the entry it names.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/types/settings.ts web/src/features/checkout/address-profiles.ts web/test/address-profiles.test.ts web/src/text/keys/checkout.ts web/src/text/notes/checkout.ts
git commit -m "feat(checkout): address label profiles by country and their editable text keys"
```

---

### Task 3: Address line 3 end to end, and the Review phone display

**Files:**
- Modify: `web/src/lib/dial-codes.ts` (after `composePhoneNumber`)
- Modify: `web/src/features/checkout/form-state.ts`, `schemas.ts`
- Modify: `web/src/features/checkout/CheckoutPage.tsx` (`validate` near line 378, `buildBody` near line 484)
- Modify: `web/src/features/checkout/steps/ReviewStep.tsx` (lines 36, 45, 53-58)
- Test: `web/test/dial-codes.test.ts`, `web/test/checkout-schemas.test.ts`, `web/test/checkout-form-state.test.ts` (new)

**Interfaces:**
- Produces: `CheckoutForm.addressLine3: string`; `addressSchema` output gains `addressLine3?: string`; `displayPhoneNumber(iso: string | null | undefined, national: string | null | undefined): string | undefined`.

- [ ] **Step 1: Write the failing tests**

Append to `web/test/dial-codes.test.ts` (add `displayPhoneNumber` to its existing import from `@/lib/dial-codes.ts`):

```ts
describe('displayPhoneNumber', () => {
  it('drops one leading zero where the country drops it', () => {
    expect(displayPhoneNumber('GB', '07801 123456')).toBe('+447801123456');
    expect(displayPhoneNumber('FR', '06 12 34 56 78')).toBe('+33612345678');
    expect(displayPhoneNumber('IE', '087 123 4567')).toBe('+353871234567');
  });
  it('keeps the zero for Italy, San Marino and the Vatican', () => {
    expect(displayPhoneNumber('IT', '06 1234567')).toBe('+39061234567');
    expect(displayPhoneNumber('SM', '0549 123456')).toBe('+3780549123456');
    expect(displayPhoneNumber('VA', '06 69812345')).toBe(composePhoneNumber('VA', '06 69812345'));
  });
  it('leaves a number with no leading zero alone', () => {
    expect(displayPhoneNumber('GB', '7801 123456')).toBe('+447801123456');
  });
  it('shows already-international input exactly as it will be sent', () => {
    expect(displayPhoneNumber('FR', '+44 7801 123456')).toBe('+447801123456');
    expect(displayPhoneNumber('FR', '0044 7801 123456')).toBe('+447801123456');
  });
  it('matches composePhoneNumber when there is no prefix, and is undefined for a blank', () => {
    expect(displayPhoneNumber('', '07801 123456')).toBe(composePhoneNumber('', '07801 123456'));
    expect(displayPhoneNumber('GB', '   ')).toBeUndefined();
  });
  it('a lone zero is not stripped to nothing', () => {
    expect(displayPhoneNumber('GB', '0')).toBe('+440');
  });
});
```

If `composePhoneNumber` is not already imported in that test file, add it to the import.

Append to `web/test/checkout-schemas.test.ts` (it already imports `addressSchema`; add the import if not):

```ts
describe('addressSchema address line 3', () => {
  const base = { addressLine1: '1 High St', city: 'Leeds', zip: 'LS1 6BY', country: 'GB' };
  it('accepts and trims a third line', () => {
    const r = addressSchema.safeParse({ ...base, addressLine3: '  Flat 2  ' });
    expect(r.success && r.data.addressLine3).toBe('Flat 2');
  });
  it('treats a blank or missing third line as absent', () => {
    for (const addressLine3 of ['', '   ', undefined]) {
      const r = addressSchema.safeParse({ ...base, addressLine3 });
      expect(r.success && r.data.addressLine3).toBeUndefined();
    }
  });
  it('rejects a third line over 255 characters', () => {
    expect(addressSchema.safeParse({ ...base, addressLine3: 'x'.repeat(256) }).success).toBe(false);
  });
});
```

Create `web/test/checkout-form-state.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_FORM, loadPersistedForm } from '@/features/checkout/form-state.ts';

beforeEach(() => localStorage.clear());

describe('persisted checkout form', () => {
  it('a form saved before address line 3 existed loads with a blank line 3', () => {
    const { addressLine3: _dropped, ...old } = { ...DEFAULT_FORM, addressLine1: '1 High St', city: 'Leeds' };
    localStorage.setItem('sf-checkout-v1', JSON.stringify(old));
    const loaded = loadPersistedForm();
    expect(loaded?.addressLine3).toBe('');
    expect(loaded?.addressLine1).toBe('1 High St');
  });
});
```

Run: `npx vitest run test/dial-codes.test.ts test/checkout-schemas.test.ts test/checkout-form-state.test.ts`
Expected: FAIL (`displayPhoneNumber` not exported; `addressLine3` stripped by the schema; `addressLine3` not on `DEFAULT_FORM`).

- [ ] **Step 2: Implement `displayPhoneNumber`**

Append to `web/src/lib/dial-codes.ts`:

```ts
/** Countries whose national numbers keep their leading zero after the calling code. */
const KEEPS_LEADING_ZERO = new Set(['IT', 'SM', 'VA']);

/**
 * The number as the shopper should read it back. `composePhoneNumber` deliberately
 * leaves a national trunk zero in ("+4407801…") because the backend's parser strips
 * it per country; shown to the shopper that looks like a mistake, so for display one
 * leading zero is dropped, except where it is part of the number. Display only:
 * never send this value, the backend stays the authority on what is stored.
 */
export function displayPhoneNumber(iso: string | null | undefined, national: string | null | undefined): string | undefined {
  const composed = composePhoneNumber(iso, national);
  if (!composed) return undefined;

  const trimmed = (national ?? '').trim();
  const digits = trimmed.replace(/\D/g, '');
  // Already international ("+…" or the "00…" spelling): show exactly what is sent.
  if (trimmed.startsWith('+') || digits.startsWith('00')) return composed;

  const dial = dialCodeFor(iso);
  if (!dial || KEEPS_LEADING_ZERO.has((iso ?? '').toUpperCase())) return composed;
  return digits.length > 1 && digits.startsWith('0') ? `+${dial}${digits.slice(1)}` : composed;
}
```

- [ ] **Step 3: Add `addressLine3` to the form and schema**

In `web/src/features/checkout/form-state.ts`, add `addressLine3: string;` after `addressLine2: string;` in `CheckoutForm`, and `addressLine3: '',` after `addressLine2: '',` in `DEFAULT_FORM`.

In `web/src/features/checkout/schemas.ts`, add to `addressSchema` after the `addressLine2` line:

```ts
  addressLine3: optionalTrimmed(z.string().trim().max(255)),
```

- [ ] **Step 4: Thread it through the page**

In `web/src/features/checkout/CheckoutPage.tsx`:

In `validate`, in the `kind === 'address'` branch, add after `addressLine2: form.addressLine2,`:

```ts
        addressLine3: form.addressLine3,
```

In `buildBody`, replace `addressLine3: null,` with:

```ts
        addressLine3: form.addressLine3.trim() || null,
```

- [ ] **Step 5: Update the Review step**

In `web/src/features/checkout/steps/ReviewStep.tsx`:

Change the import `import { composePhoneNumber } from '@/lib/dial-codes.ts';` to `import { displayPhoneNumber } from '@/lib/dial-codes.ts';`.

Replace `const phone = composePhoneNumber(form.phonePrefix, form.phone);` with:

```ts
  const phone = displayPhoneNumber(form.phonePrefix, form.phone);
```

In the `address` slip body, add after the `addressLine2` line:

```tsx
          {form.addressLine3 ? <span>{form.addressLine3}</span> : null}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run test/dial-codes.test.ts test/checkout-schemas.test.ts test/checkout-form-state.test.ts test/checkout-page.test.tsx`
Expected: PASS. `checkout-page.test.tsx` already asserts `addressLine3: null` for a blank line and must stay green.

Run: `npx tsc -b`
Expected: no errors. If any other file builds a `CheckoutForm` literal without spreading `DEFAULT_FORM`, `tsc` names it: add `addressLine3: ''` there.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/dial-codes.ts web/src/features/checkout/form-state.ts web/src/features/checkout/schemas.ts web/src/features/checkout/CheckoutPage.tsx web/src/features/checkout/steps/ReviewStep.tsx web/test/dial-codes.test.ts web/test/checkout-schemas.test.ts web/test/checkout-form-state.test.ts
git commit -m "feat(checkout): address line 3 in the form, schema and order body; Review shows the phone without its trunk zero"
```

---

### Task 4: Shippable countries in the checkout

**Files:**
- Create: `web/src/features/checkout/ship-countries.ts`
- Create: `web/test/ship-countries.test.ts`
- Modify: `web/src/features/checkout/CountrySelect.tsx`
- Modify: `web/src/builder/family-checkout.ts` (`CheckoutData`, line 47)
- Modify: `web/src/features/checkout/CheckoutPage.tsx` (initial form near line 158, `data` near line 600)
- Create: `web/test/country-select.test.tsx`

**Interfaces:**
- Consumes: `StorefrontSettings.shipping` (Task 2), `CheckoutForm` (Task 3).
- Produces: `normaliseShipCountries(raw: readonly string[] | null | undefined): string[]`; `reconcileCountry(country: string, allowed: readonly string[]): string`; `applyShipCountries(form: CheckoutForm, allowed: readonly string[]): CheckoutForm`; `CountrySelect` prop `allowed?: readonly string[]`; `CheckoutData.shipCountries: readonly string[]`.

- [ ] **Step 1: Write the failing pure tests**

Create `web/test/ship-countries.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_FORM } from '@/features/checkout/form-state.ts';
import { applyShipCountries, normaliseShipCountries, reconcileCountry } from '@/features/checkout/ship-countries.ts';

describe('normaliseShipCountries', () => {
  it('upper-cases, trims, de-duplicates and drops non two-letter entries', () => {
    expect(normaliseShipCountries([' gb ', 'GB', 'ie', '', 'GBR', '1X', 'fr'])).toEqual(['GB', 'IE', 'FR']);
  });
  it('a missing list is empty', () => {
    expect(normaliseShipCountries(undefined)).toEqual([]);
    expect(normaliseShipCountries(null)).toEqual([]);
  });
});

describe('reconcileCountry', () => {
  it('an empty list changes nothing (unknown = every country)', () => {
    expect(reconcileCountry('NO', [])).toBe('NO');
    expect(reconcileCountry('', [])).toBe('');
  });
  it('keeps a country that is in the list', () => {
    expect(reconcileCountry('GB', ['GB', 'IE'])).toBe('GB');
  });
  it('clears a country that is not in the list', () => {
    expect(reconcileCountry('NO', ['GB', 'IE'])).toBe('');
  });
  it('preselects the only country, over a blank or a stale one', () => {
    expect(reconcileCountry('', ['GB'])).toBe('GB');
    expect(reconcileCountry('NO', ['GB'])).toBe('GB');
  });
  it('does not preselect when there is a choice', () => {
    expect(reconcileCountry('', ['GB', 'IE'])).toBe('');
  });
});

describe('applyShipCountries', () => {
  it('returns the same object when nothing changes', () => {
    const form = { ...DEFAULT_FORM, country: 'GB' };
    expect(applyShipCountries(form, ['GB', 'IE'])).toBe(form);
    expect(applyShipCountries(form, [])).toBe(form);
  });
  it('clears a stale country and leaves the phone prefix alone', () => {
    const next = applyShipCountries({ ...DEFAULT_FORM, country: 'NO', phonePrefix: 'NO' }, ['GB', 'IE']);
    expect(next.country).toBe('');
    expect(next.phonePrefix).toBe('NO');
  });
  it('a single-country shop preselects it and the blank phone prefix follows', () => {
    const next = applyShipCountries(DEFAULT_FORM, ['GB']);
    expect(next.country).toBe('GB');
    expect(next.phonePrefix).toBe('GB');
  });
  it('never overwrites a prefix the shopper chose, or one already set', () => {
    expect(applyShipCountries({ ...DEFAULT_FORM, phonePrefix: 'FR', phonePrefixTouched: true }, ['GB']).phonePrefix).toBe('FR');
    expect(applyShipCountries({ ...DEFAULT_FORM, phonePrefix: 'IE' }, ['GB']).phonePrefix).toBe('IE');
  });
});
```

Run: `npx vitest run test/ship-countries.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 2: Implement the pure module**

Create `web/src/features/checkout/ship-countries.ts`:

```ts
import type { CheckoutForm } from '@/features/checkout/form-state.ts';
import { DIAL_CODES } from '@/lib/dial-codes.ts';

const ISO2 = /^[A-Z]{2}$/;

/** `settings.shipping.countries` as clean ISO alpha-2 codes, first occurrence wins. Missing = empty = unknown. */
export function normaliseShipCountries(raw: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const entry of raw ?? []) {
    const iso = String(entry).trim().toUpperCase();
    if (ISO2.test(iso) && !out.includes(iso)) out.push(iso);
  }
  return out;
}

/**
 * The country the form should hold given where the shop delivers. An empty list
 * means the shop's countries are unknown, so nothing is changed. Otherwise a
 * country outside the list is dropped, and a shop with exactly one country has
 * it chosen for the shopper.
 */
export function reconcileCountry(country: string, allowed: readonly string[]): string {
  if (allowed.length === 0) return country;
  if (country && allowed.includes(country)) return country;
  return allowed.length === 1 ? allowed[0]! : '';
}

/** `reconcileCountry` applied to a form. Returns the same object when nothing changes, so it is safe in a state updater. */
export function applyShipCountries(form: CheckoutForm, allowed: readonly string[]): CheckoutForm {
  const country = reconcileCountry(form.country, allowed);
  if (country === form.country) return form;
  // A country chosen for the shopper carries the dial code with it, like one they pick themselves.
  const followPrefix = country && !form.phonePrefixTouched && !form.phonePrefix && DIAL_CODES[country];
  return { ...form, country, ...(followPrefix ? { phonePrefix: country } : {}) };
}
```

Run: `npx vitest run test/ship-countries.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing `CountrySelect` test**

Create `web/test/country-select.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { CountrySelect } from '@/features/checkout/CountrySelect.tsx';

afterEach(cleanup);

const mount = (allowed?: readonly string[], value = '') => render(
  <MantineProvider env="test">
    <CountrySelect value={value} onChange={() => {}} allowed={allowed} />
  </MantineProvider>,
);
const optionValues = () =>
  Array.from((screen.getByLabelText('Country') as HTMLSelectElement).options).map((o) => o.value).filter(Boolean);

describe('CountrySelect', () => {
  it('lists only the allowed countries, sorted by name', () => {
    mount(['IE', 'GB', 'FR']);
    expect(optionValues()).toEqual(['FR', 'IE', 'GB']); // France, Ireland, United Kingdom
  });
  it('lists every country when the allowed list is missing or empty', () => {
    mount(undefined);
    const all = optionValues().length;
    expect(all).toBeGreaterThan(100);
    cleanup();
    mount([]);
    expect(optionValues().length).toBe(all);
  });
  it('names an allowed country even when it has no dial-code entry', () => {
    mount(['GB', 'AQ']);
    expect(optionValues()).toContain('AQ');
  });
});
```

Run: `npx vitest run test/country-select.test.tsx`
Expected: FAIL (the `allowed` prop is ignored: three-country case returns the full list).

- [ ] **Step 4: Implement `allowed` in `CountrySelect`**

In `web/src/features/checkout/CountrySelect.tsx`:

Replace the doc comment above `optionsByLocale` with:

```ts
/**
 * The country roster. With no list from the shop (an older backend, or a shop
 * whose shipping is not set up) this is every ISO-3166-1 alpha-2 the app knows,
 * sorted by name; `DIAL_CODES` is the app's canonical ISO list and doubles as
 * that roster. With `settings.shipping.countries` the picker offers only those
 * (`allowedCountryOptions`). Either way the quote stays the authority: a
 * country that cannot be served still answers `422` and lands inline on this
 * step (STOREFRONT.md §3.5).
 */
```

Add after the `COUNTRY_OPTIONS` export:

```ts
/** The shop's countries by name; an empty or missing list falls back to the full roster. */
export function allowedCountryOptions(allowed: readonly string[] | undefined): Array<{ iso: string; name: string }> {
  if (!allowed || allowed.length === 0) return countryOptions();
  return allowed.map((iso) => ({ iso, name: regionName(iso) })).sort((a, b) => compareNames(a.name, b.name));
}
```

Add `allowed?: readonly string[];` to `CountrySelectProps` with the comment `/** The shop's deliverable countries; empty or missing = every country. */`, destructure `allowed` in the component, and replace `countryOptions().map(` in the JSX with `allowedCountryOptions(allowed).map(`.

Run: `npx vitest run test/country-select.test.tsx`
Expected: PASS.

- [ ] **Step 5: Carry the list through the checkout page**

In `web/src/builder/family-checkout.ts`, add to `CheckoutData` after `contactModes: ContactModes;`:

```ts
  /** Where the shop delivers (clean ISO codes). Empty = unknown: the pickers list every country. */
  shipCountries: readonly string[];
```

In `web/src/features/checkout/CheckoutPage.tsx`:

Add the import:

```ts
import { applyShipCountries, normaliseShipCountries } from '@/features/checkout/ship-countries.ts';
```

After the line `const { contactModes, currency, features } = settings;` add:

```ts
  const rawShipCountries = settings.shipping?.countries;
  const shipCountries = useMemo(() => normaliseShipCountries(rawShipCountries), [rawShipCountries]);
```

Replace the form initialiser:

```ts
  const [form, setForm] = useState<CheckoutForm>(() =>
    applyShipCountries(seedForm(loadPersistedForm() ?? DEFAULT_FORM, contactModes.defaultPhoneCountry), shipCountries),
  );
```

Add directly after the `useState` declarations block (before the `persistForm` effect):

```ts
  // Settings refetch on window focus, so the shop's countries can change under an open checkout.
  useEffect(() => {
    setForm((f) => applyShipCountries(f, shipCountries));
  }, [shipCountries]);
```

In the `data` memo object add `shipCountries,` after `contactModes,` and add `shipCountries` to that memo's dependency array.

- [ ] **Step 6: Write the page-level test**

In `web/test/checkout-page.test.tsx`, add these tests inside the signed-in `describe` whose `beforeEach` sets `state.settings = settings(false)` (near line 315), so they inherit its session, cart and quote mocks. They use the file's existing `settings`, `mount`, `settle`, `type` and `pressContinue` helpers. Add `DEFAULT_FORM` to the imports from `@/features/checkout/form-state.ts`.

```tsx
  describe('shippable countries', () => {
    const noDefault = { emailMode: 'required', phoneMode: 'optional', defaultPhoneCountry: null } as const;
    const country = () => screen.getByLabelText('Country') as HTMLSelectElement;
    /** Mounts and moves from Contact to Address. */
    async function toAddress() {
      mount();
      await settle();
      type('First name', 'Ada');
      type('Surname', 'Lovelace');
      type('Email', 'ada@example.com');
      pressContinue();
    }

    it('drops a remembered country the shop no longer delivers to', async () => {
      localStorage.setItem('sf-checkout-v1', JSON.stringify({ ...DEFAULT_FORM, country: 'NO' }));
      state.settings = { ...settings(false), contactModes: noDefault, shipping: { countries: ['GB', 'IE'] } };
      await toAddress();
      expect(country().value).toBe('');
      expect(Array.from(country().options).map((o) => o.value).filter(Boolean).sort()).toEqual(['GB', 'IE']);
    });

    it('a single-country shop has the country chosen', async () => {
      state.settings = { ...settings(false), contactModes: noDefault, shipping: { countries: ['IE'] } };
      await toAddress();
      expect(country().value).toBe('IE');
    });

    it('a list that shrinks under an open checkout clears the country', async () => {
      state.settings = { ...settings(false), shipping: { countries: ['GB', 'IE'] } };
      const view = mount();
      await settle();
      state.settings = { ...state.settings, shipping: { countries: ['IE', 'FR'] } };
      view.rerender(<Wrapper><CheckoutPage /></Wrapper>);
      await settle();
      type('First name', 'Ada');
      type('Surname', 'Lovelace');
      type('Email', 'ada@example.com');
      pressContinue();
      expect(country().value).toBe('');
    });

    it('with no list from the backend every country is offered', async () => {
      await toAddress();
      expect(country().options.length).toBeGreaterThan(100);
    });
  });
```

If the enclosing `describe` clears `localStorage` in an `afterEach`, nothing more is needed; if it does not, add `afterEach(() => localStorage.removeItem('sf-checkout-v1'));` inside this nested `describe`.

- [ ] **Step 7: Pass the list to the address step**

The address step view needs the list now so the tests above can pass (its layout changes in Task 5).

In `web/src/features/checkout/steps/AddressStep.tsx`, add to `AddressStepProps`:

```ts
  /** Where the shop delivers; empty = every country. */
  countries?: readonly string[];
```

Destructure `countries` and pass `allowed={countries}` to `<CountrySelect …>`.

In `web/src/features/checkout/checkout-parts.tsx`, in the `Address` view, add `countries={d.shipCountries}` to `<AddressStep …>`.

- [ ] **Step 8: Run**

Run: `npx vitest run test/ship-countries.test.ts test/country-select.test.tsx test/checkout-page.test.tsx`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors. If another file constructs a `CheckoutData` object (an editor fixture or a test helper), `tsc` names it: add `shipCountries: []`.

- [ ] **Step 9: Commit**

```bash
git add web/src/features/checkout/ship-countries.ts web/src/features/checkout/CountrySelect.tsx web/src/builder/family-checkout.ts web/src/features/checkout/CheckoutPage.tsx web/src/features/checkout/steps/AddressStep.tsx web/src/features/checkout/checkout-parts.tsx web/test/ship-countries.test.ts web/test/country-select.test.tsx web/test/checkout-page.test.tsx
git commit -m "feat(checkout): offer only the countries the shop delivers to"
```

---

### Task 5: Address step layout and labels

Delegate to a frontend-design subagent (model `sonnet`). Give it this task and the spec.

**Files:**
- Modify: `web/src/features/checkout/steps/AddressStep.tsx`
- Create: `web/test/address-step.test.tsx`
- Modify: any unit test that fills the address by its old labels (found in Step 4)

**Interfaces:**
- Consumes: `addressLabels` (Task 2), `CheckoutForm.addressLine3` (Task 3), `countries` prop (Task 4).

- [ ] **Step 1: Write the failing test**

Create `web/test/address-step.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AddressStep } from '@/features/checkout/steps/AddressStep.tsx';
import { DEFAULT_FORM, type CheckoutForm } from '@/features/checkout/form-state.ts';

afterEach(cleanup);

const mount = (form: Partial<CheckoutForm> = {}, patch = vi.fn()) => {
  render(
    <MantineProvider env="test">
      <AddressStep form={{ ...DEFAULT_FORM, ...form }} patch={patch} errors={{}} countries={['GB', 'IE', 'US', 'FR']} />
    </MantineProvider>,
  );
  return patch;
};
/** Accessible names of the step's controls, in DOM order. */
const controlNames = () =>
  Array.from(document.querySelectorAll('select, input')).map((el) => el.getAttribute('aria-label'));

describe('AddressStep', () => {
  it('orders the fields country first, then lines 1 to 3, city, county, postcode', () => {
    mount({ country: 'GB' });
    expect(controlNames()).toEqual([
      'Country', 'Address line 1', 'Address line 2', 'Address line 3', 'Town / City', 'County', 'Postcode',
    ]);
  });

  it.each([
    ['GB', ['Town / City', 'County', 'Postcode']],
    ['IE', ['Town / City', 'County', 'Eircode']],
    ['US', ['City', 'State', 'ZIP code']],
    ['FR', ['City', 'State / Region', 'Postal code']],
    ['', ['City', 'State / Region', 'Postal code']],
  ])('country %s labels the last three fields %j', (country, labels) => {
    mount({ country });
    expect(controlNames().slice(4)).toEqual(labels);
  });

  it('address line 3 is optional and edits the form', () => {
    const patch = mount({ country: 'GB' });
    fireEvent.change(screen.getByLabelText('Address line 3'), { target: { value: 'Flat 2' } });
    expect(patch).toHaveBeenCalledWith({ addressLine3: 'Flat 2' });
    expect(screen.getByLabelText('Address line 3').getAttribute('autocomplete')).toBe('address-line3');
  });

  it('choosing a country still carries the phone prefix when the shopper has not set one', () => {
    const patch = mount({ country: '' });
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'IE' } });
    expect(patch).toHaveBeenCalledWith({ country: 'IE', phonePrefix: 'IE' });
  });
});
```

Run: `npx vitest run test/address-step.test.tsx`
Expected: FAIL (order and labels differ; no line 3 input).

- [ ] **Step 2: Implement**

Replace the body of `AddressStep` in `web/src/features/checkout/steps/AddressStep.tsx` (imports: add `import { addressLabels } from '@/features/checkout/address-profiles.ts';`):

```tsx
export function AddressStep({ form, patch, errors, notice, countries, before, after, rootAttrs }: AddressStepProps) {
  const { t } = useText();
  // The wording of the last three fields follows the delivery country, which is why the country leads the step.
  const labels = addressLabels(form.country);
  return (
    <div className={classes.step} {...rootAttrs}>
      {before}
      <p className={classes.blurb}>{t('checkout.address.blurb')}</p>

      <CountrySelect
        value={form.country}
        error={errors.country}
        allowed={countries}
        onChange={(iso) =>
          patch({
            country: iso,
            // Track the delivery country onto the dial-code picker, but never
            // over a prefix the shopper set themselves.
            ...(!form.phonePrefixTouched && DIAL_CODES[iso] ? { phonePrefix: iso } : {}),
          })
        }
      />

      <Field
        label={t('checkout.address.line1')}
        value={form.addressLine1}
        onChange={(v) => patch({ addressLine1: v })}
        error={errors.addressLine1}
        autoComplete="address-line1"
        maxLength={255}
      />
      <Field
        label={t('checkout.address.line2')}
        value={form.addressLine2}
        onChange={(v) => patch({ addressLine2: v })}
        optional
        autoComplete="address-line2"
        maxLength={255}
      />
      <Field
        label={t('checkout.address.line3')}
        value={form.addressLine3}
        onChange={(v) => patch({ addressLine3: v })}
        error={errors.addressLine3}
        optional
        autoComplete="address-line3"
        maxLength={255}
      />

      <Field
        label={t(labels.city)}
        value={form.city}
        onChange={(v) => patch({ city: v })}
        error={errors.city}
        autoComplete="address-level2"
        maxLength={100}
      />

      <div className={fields.pair}>
        <Field
          label={t(labels.county)}
          value={form.county}
          onChange={(v) => patch({ county: v })}
          optional
          autoComplete="address-level1"
          maxLength={100}
        />
        <Field
          label={t(labels.zip)}
          value={form.zip}
          onChange={(v) => patch({ zip: v })}
          error={errors.zip}
          autoComplete="postal-code"
          maxLength={20}
        />
      </div>

      {notice ? (
        <p className={classes.note} data-tone="danger">
          {notice}
        </p>
      ) : null}
      {after}
    </div>
  );
}
```

Update the doc comment's first paragraph to: `Where the order goes. The country leads the step: it re-prices the order and decides how the fields below it are worded.` Keep the second paragraph about home delivery.

- [ ] **Step 3: Run**

Run: `npx vitest run test/address-step.test.tsx`
Expected: PASS.

- [ ] **Step 4: Update tests that used the old labels**

Run from `web/`: `npx vitest run test/checkout-page.test.tsx test/builder-checkout-parts.test.tsx test/builder-editor-checkout-canvas.test.tsx`

Tests that look a field up by `ZIP / Postcode`, `County / Region` or `City` fail where the form's country is GB (their settings carry `defaultPhoneCountry: 'GB'`, which seeds the country). For each failure replace the lookup with the wording for that test's country: GB → `Town / City`, `County`, `Postcode`; no country → `City`, `State / Region`, `Postal code`. Change lookups only, never an assertion about the submitted order body.

Run: `npx vitest run test/checkout-page.test.tsx test/builder-checkout-parts.test.tsx test/builder-editor-checkout-canvas.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/checkout/steps/AddressStep.tsx web/test/address-step.test.tsx web/test/checkout-page.test.tsx web/test/builder-checkout-parts.test.tsx web/test/builder-editor-checkout-canvas.test.tsx
git commit -m "feat(checkout): address step leads with the country, adds line 3, and words city, county and postcode for it"
```

(Add only the test files that actually changed.)

---

### Task 6: Merged phone control

Delegate to a frontend-design subagent (model `sonnet`). The markup and behaviour below are fixed; the subagent may refine the CSS values for the three templates as long as the acceptance checks in Step 6 hold.

**Files:**
- Modify: `web/src/features/checkout/Field.tsx` (export `OptionalTag` and `ErrorNote`)
- Modify: `web/src/features/checkout/PhoneField.tsx`
- Modify: `web/src/features/checkout/Fields.module.css` (the `.phone`, `.phoneCode`, `.phoneNumber` block at lines 201-215)
- Modify: `web/src/features/checkout/steps/ContactStep.tsx`, `web/src/features/checkout/checkout-parts.tsx`
- Create: `web/test/phone-field.test.tsx`

**Interfaces:**
- Consumes: `CheckoutData.shipCountries` (Task 4).
- Produces: `PhoneFieldProps.suggested?: readonly string[]`; `ContactStepProps.countries?: readonly string[]`. All existing `PhoneField` props keep their names and meaning.

- [ ] **Step 1: Write the failing test**

Create `web/test/phone-field.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { PhoneField } from '@/features/checkout/PhoneField.tsx';

afterEach(cleanup);

const mount = (over: Partial<Parameters<typeof PhoneField>[0]> = {}) => {
  const props = { prefix: 'GB', phone: '', optional: false, onPrefixChange: vi.fn(), onPhoneChange: vi.fn(), ...over };
  render(<MantineProvider env="test"><PhoneField {...props} /></MantineProvider>);
  return props;
};
const picker = () => screen.getByLabelText('Phone country code') as HTMLSelectElement;

describe('PhoneField', () => {
  it('shows only the prefix when closed', () => {
    mount();
    expect(screen.getByText('+44')).toBeTruthy();
    expect(screen.queryByText('United Kingdom +44')).toBeNull();
  });

  it('shows the placeholder wording when no prefix is chosen', () => {
    mount({ prefix: '' });
    expect(screen.getByText('Code', { selector: '[data-phone-code]' })).toBeTruthy();
  });

  it('options read prefix then country', () => {
    mount();
    const gb = Array.from(picker().options).find((o) => o.value === 'GB');
    expect(gb?.textContent).toBe('+44\u00a0\u00a0United Kingdom');
  });

  it('is one field: one visible label, and the number input is named Phone', () => {
    mount();
    expect(document.querySelectorAll('label')).toHaveLength(1);
    expect(screen.getByLabelText('Phone').getAttribute('type')).toBe('tel');
  });

  it('with suggestions, groups them first and lists each country once', () => {
    mount({ suggested: ['IE', 'GB'] });
    const groups = picker().querySelectorAll('optgroup');
    expect(groups).toHaveLength(2);
    expect(Array.from(groups[0]!.querySelectorAll('option')).map((o) => o.value)).toEqual(['IE', 'GB']);
    expect(Array.from(groups[1]!.querySelectorAll('option')).some((o) => o.value === 'GB')).toBe(false);
  });

  it('without suggestions the list is flat', () => {
    mount();
    expect(picker().querySelectorAll('optgroup')).toHaveLength(0);
  });

  it('reports prefix and number changes', () => {
    const props = mount();
    fireEvent.change(picker(), { target: { value: 'FR' } });
    expect(props.onPrefixChange).toHaveBeenCalledWith('FR');
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '07801 123456' } });
    expect(props.onPhoneChange).toHaveBeenCalledWith('07801 123456');
  });

  it('shows the error in place of the hint and marks the input invalid', () => {
    mount({ error: 'Required' });
    expect(screen.getByText('Required')).toBeTruthy();
    expect(screen.queryByText('Couriers may use this for delivery.')).toBeNull();
    expect(screen.getByLabelText('Phone').getAttribute('aria-invalid')).toBe('true');
  });
});
```

Run: `npx vitest run test/phone-field.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Export the two label helpers**

In `web/src/features/checkout/Field.tsx`, change `function OptionalTag()` to `export function OptionalTag()` and `function ErrorNote(` to `export function ErrorNote(`.

- [ ] **Step 3: Implement the control**

Replace everything in `web/src/features/checkout/PhoneField.tsx` from `export interface PhoneFieldProps` to the end of the file (keep `prefixOptions` and its comment, and update the imports as shown):

```tsx
import { useId } from 'react';
import { ErrorNote, OptionalTag } from '@/features/checkout/Field.tsx';
import { DIAL_CODES } from '@/lib/dial-codes.ts';
import { compareNames, getFormatProfile, regionName } from '@/lib/format.ts';
import classes from '@/features/checkout/Fields.module.css';
import { useText } from '@/text/runtime.tsx';
```

```tsx
export interface PhoneFieldProps {
  /** ISO-3166-1 alpha-2 the dial-code picker is set to. */
  prefix: string;
  /** The national number as typed — never the composed `+CC…` value. */
  phone: string;
  optional: boolean;
  error?: string;
  /** Sign-in and profile forms: the delivery hint is checkout copy and is wrong there. */
  hideHint?: boolean;
  /** Countries to lead the picker (the shop's delivery countries). Empty or missing = one flat list. */
  suggested?: readonly string[];
  onPrefixChange: (iso: string) => void;
  onPhoneChange: (value: string) => void;
}

function PrefixOptions({ options }: { options: PrefixOption[] }) {
  return (
    <>
      {options.map((o) => (
        <option key={o.iso} value={o.iso}>
          {`+${o.dial}\u00a0\u00a0${o.name}`}
        </option>
      ))}
    </>
  );
}

/**
 * Dial code + national number in one frame. To the shopper it is a single field
 * that shows "+44" beside what they type; to the DOM it is a native select laid
 * invisibly over that prefix (a phone's own picker beats any listbox we could
 * draw) and a `tel` input. `composePhoneNumber` joins the two at submit, so
 * nothing here has to know a country's trunk-prefix rules: "07801…" and
 * "7801…" are both fine to type.
 */
export function PhoneField({
  prefix,
  phone,
  optional,
  error,
  hideHint,
  suggested,
  onPrefixChange,
  onPhoneChange,
}: PhoneFieldProps) {
  const { t } = useText();
  const id = useId();
  const noteId = `${id}-note`;
  const hint = error || hideHint ? undefined : t('checkout.phone.hint');

  const all = prefixOptions();
  const wanted = new Set((suggested ?? []).map((c) => c.trim().toUpperCase()));
  const top = (suggested ?? [])
    .map((c) => all.find((o) => o.iso === c.trim().toUpperCase()))
    .filter((o): o is PrefixOption => Boolean(o))
    .filter((o, i, list) => list.indexOf(o) === i);
  const dial = DIAL_CODES[prefix];

  return (
    <div className={classes.field}>
      <label className={classes.label} htmlFor={id}>
        {t('checkout.phone.label')}
        {optional ? <OptionalTag /> : null}
      </label>
      <div className={classes.phoneBox} data-sf-part="input" data-invalid={error ? 'true' : undefined}>
        <span className={classes.phoneCode}>
          <select
            className={classes.phoneSelect}
            value={prefix}
            onChange={(e) => onPrefixChange(e.currentTarget.value)}
            aria-label={t('checkout.phone.codeAriaLabel')}
            autoComplete="tel-country-code"
          >
            <option value="">{t('checkout.phone.code')}</option>
            {top.length > 0 ? (
              <>
                <optgroup label={t('auth.code.phone.suggested')}><PrefixOptions options={top} /></optgroup>
                <optgroup label={t('auth.code.phone.allCountries')}><PrefixOptions options={all.filter((o) => !wanted.has(o.iso))} /></optgroup>
              </>
            ) : (
              <PrefixOptions options={all} />
            )}
          </select>
          <span className={classes.phoneCodeText} data-phone-code aria-hidden>
            {dial ? `+${dial}` : t('checkout.phone.code')}
          </span>
          <span className={classes.phoneCaret} aria-hidden />
        </span>
        <input
          id={id}
          className={classes.phoneInput}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={phone}
          onChange={(e) => onPhoneChange(e.currentTarget.value)}
          aria-label={t('checkout.phone.label')}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? noteId : undefined}
        />
      </div>
      {error ? (
        <ErrorNote id={noteId} error={error} />
      ) : hint ? (
        <p id={noteId} className={classes.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
```

The suggested group keeps the order it is given (the test expects `['IE', 'GB']`); the caller passes the shop's list, which the backend already sorts.

- [ ] **Step 4: Style it**

In `web/src/features/checkout/Fields.module.css`, replace the block from the comment `/* Dial code + national number: …` through the `.phoneNumber { … }` rule with:

```css
/* Dial code + national number in one frame. The frame carries the field's line
   (underline or box), the two controls inside it are bare. */
.phoneBox {
  display: flex;
  align-items: stretch;
  min-height: 44px;
  min-width: 0;
  border-bottom: 1px solid var(--sf-line-strong);
  transition: border-color 150ms ease;
}

.phoneBox:focus-within {
  border-bottom-color: var(--sf-primary);
}

.phoneBox[data-invalid='true'] {
  border-color: var(--sf-danger);
}

:global(:root[data-sf-input="box"]) .phoneBox {
  border: 1px solid var(--sf-line-strong);
  border-radius: var(--sf-card-radius);
  background: color-mix(in srgb, var(--sf-surface) 40%, transparent);
}

:global(:root[data-sf-input="box"]) .phoneBox:focus-within {
  border-color: var(--sf-primary);
}

:global(:root[data-sf-input="box"]) .phoneBox[data-invalid='true'] {
  border-color: var(--sf-danger);
}

/* The prefix: what the shopper sees is the text and caret; the select sits over
   them, invisible, so a tap opens the platform's own picker. */
.phoneCode {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-right: 0.7rem;
  padding-right: 0.7rem;
  border-right: 1px solid var(--sf-line);
  color: var(--sf-text);
  font-family: var(--sf-font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 16px;
  line-height: 1.4;
  white-space: nowrap;
}

:global(:root[data-sf-input="box"]) .phoneCode {
  padding-left: 0.75rem;
}

.phoneSelect {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  border: 0;
  opacity: 0;
  appearance: none;
  font-size: 16px; /* iOS zoom guard */
  cursor: pointer;
}

.phoneCode:has(.phoneSelect:focus-visible) {
  outline: 2px solid var(--sf-primary);
  outline-offset: 2px;
}

.phoneCaret {
  flex: none;
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid var(--sf-faint);
}

.phoneInput {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--sf-text);
  font-family: var(--sf-font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 16px; /* iOS zoom guard */
  line-height: 1.4;
}

.phoneInput:focus {
  outline: none;
}

:global(:root[data-sf-input="box"]) .phoneInput {
  padding-right: 0.75rem;
}
```

In the `@media (prefers-reduced-motion: reduce)` rule at the end of the file, add `.phoneBox,` to the selector list.

- [ ] **Step 5: Pass the shop's countries from the contact step**

In `web/src/features/checkout/steps/ContactStep.tsx`, add to its props interface `/** The shop's delivery countries, which lead the dial-code picker. */ countries?: readonly string[];`, destructure `countries`, and add `suggested={countries}` to `<PhoneField …>`.

In `web/src/features/checkout/checkout-parts.tsx`, in the `Contact` view, add `countries={d.shipCountries}` to `<ContactStep …>`.

`PasswordLogin.tsx` and `PasswordSection.tsx` are not changed: they pass no `suggested` and get the flat list.

- [ ] **Step 6: Run and check**

Run: `npx vitest run test/phone-field.test.tsx test/phone-field-hint.test.tsx test/phone-countries.test.tsx test/checkout-page.test.tsx`
Expected: PASS.

Run: `npx tsc -b && npm run lint` (skip `lint` if `web/package.json` has no such script)
Expected: no new errors.

Acceptance checks for the frontend-design subagent, in a browser via `npm run dev` at 390 px and 1280 px, for each of the three templates and in both input styles (underline and box):

- Closed, the control shows `+44`, a caret, a divider and the number, inside one line or box, at least 44 px tall.
- The whole control shows the focus colour when either part is focused, and a visible ring on the prefix when it is reached by keyboard.
- The error state turns the one frame red.
- A four-digit prefix (`+1684`, American Samoa) does not wrap or push the number off-screen at 360 px.
- No horizontal page scroll at 360 px.
- Password sign-in and the account profile password section look right with the same control.

- [ ] **Step 7: Commit**

```bash
git add web/src/features/checkout/Field.tsx web/src/features/checkout/PhoneField.tsx web/src/features/checkout/Fields.module.css web/src/features/checkout/steps/ContactStep.tsx web/src/features/checkout/checkout-parts.tsx web/test/phone-field.test.tsx
git commit -m "feat(checkout): one phone control that shows the prefix, with the shop's countries first in its list"
```

---

### Task 7: End-to-end tests and baselines

**Files:**
- Modify: `e2e/checkout-parts.spec.ts` (label lookups near lines 144-145 and 620, plus a new `describe`), `e2e/storefront.spec.ts` and any other spec Step 1 names
- Regenerate: `e2e/__baseline__/dom-*` files and `web/test/__golden__/` checkout files named in Steps 3 and 4

Run commands from the repo root.

- [ ] **Step 1: Run the suites and list what the markup change broke**

Run: `TZ=UTC npm test`
Run: `npm run test:e2e`

Expected failures, and only these kinds:

1. Lookups by an old label (`ZIP / Postcode`, `County / Region`, `City` with a GB country, or the old two-label phone field).
2. DOM-parity baselines `dom-checkout-*`, and those of pages that render `PhoneField` (password sign-in, account profile).
3. Vitest goldens under `web/test/__golden__/` for the checkout contact and address steps (`golden-stage5-checkout.test.tsx`), and any golden of a page that renders `PhoneField`.

Anything else failing is a regression: stop and fix the code, not the baseline. In particular the order payload assertions (`BASE_BODY` in `e2e/checkout-parts.spec.ts`) must pass unchanged, because a blank line 3 still sends `addressLine3: null`.

- [ ] **Step 2: Fix the label lookups**

In each failing spec replace the lookup with the wording for the country in that test (the e2e settings fixtures seed GB): `ZIP / Postcode` → `Postcode`, `City` → `Town / City`, `County / Region` → `County`. In the `walk` helper of `e2e/checkout-parts.spec.ts` the address branch becomes:

```ts
    } else if (kind === 'address') {
      await expect(page.getByRole('combobox', { name: 'Country' })).toHaveValue('GB');
      await page.getByRole('textbox', { name: 'Address line 1' }).fill('14 Kirkgate');
      await page.getByRole('textbox', { name: 'Town / City' }).fill('Leeds');
      await page.getByRole('textbox', { name: 'Postcode' }).fill('LS1 6BY');
```

- [ ] **Step 3: Regenerate the DOM-parity baselines that changed on purpose**

For each failing dom-parity test, by name:

```bash
npm run test:e2e -- dom-parity.spec.ts --update-snapshots -g "<test name>"
```

Then read `git diff e2e/__baseline__/` in full. Every changed line must be one of: the address fields in their new order with line 3 and the new labels; the phone control's new markup. Revert any baseline whose diff shows something else and fix the cause.

- [ ] **Step 4: Regenerate the vitest goldens that changed on purpose**

`web/test/helpers/golden.ts` only overwrites with `UPDATE_GOLDEN=force`, and `docs/builder.md` forbids regenerating goldens to make a change pass. This change is the intended new markup of the contact and address steps, so regenerate only the files those two steps (and the phone control) own:

```bash
cd web && UPDATE_GOLDEN=force npx vitest run test/golden-stage5-checkout.test.tsx
```

Read `git diff web/test/__golden__/` in full and apply the same rule as Step 3. Shipping, payment and review goldens must be unchanged except for the review slip gaining nothing (line 3 is blank in the fixtures); if one of them changed, revert it and find out why. Do not touch `golden-parity.test.tsx` captures.

- [ ] **Step 5: Add an end-to-end test for the new behaviour**

The `open`, `placeOrder` and cart-seeding helpers are local to `e2e/checkout-parts.spec.ts`, so add the test to that file, after the `describe` titled `checkout · the default arrangement sends what v0.7.0 sent`:

```ts
test.describe('checkout · the contact and address form', () => {
  test('prefix-only phone, the shop\'s countries, country-aware labels, line 3 on the order', async ({ page }) => {
    const { mocks } = await open(page, 'storefront', null, '/checkout', {
      tweakSettings: (s) => { s.shipping = { countries: ['GB', 'IE', 'US'] }; },
    });
    const next = () => page.getByRole('button', { name: 'Continue' }).click();

    // Contact: the closed picker shows the prefix alone.
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
    await expect(page.locator('[data-phone-code]')).toHaveText('+44');
    await page.getByRole('textbox', { name: 'First name' }).fill('Ada');
    await page.getByRole('textbox', { name: 'Surname' }).fill('Sterling');
    await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.invalid');
    await page.getByRole('textbox', { name: 'Phone' }).fill('07801 123456');
    await next();

    // Address: three countries, and the wording follows the one chosen.
    await expect(page.getByRole('heading', { name: 'Delivery address' })).toBeVisible();
    const country = page.getByRole('combobox', { name: 'Country' });
    await expect(country.locator('option:not([value=""])')).toHaveCount(3);
    await country.selectOption('US');
    await expect(page.getByRole('textbox', { name: 'ZIP code' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'State' })).toBeVisible();
    await country.selectOption('GB');
    await page.getByRole('textbox', { name: 'Address line 1' }).fill('14 Kirkgate');
    await page.getByRole('textbox', { name: 'Address line 3' }).fill('Flat 2');
    await page.getByRole('textbox', { name: 'Town / City' }).fill('Leeds');
    await page.getByRole('textbox', { name: 'Postcode' }).fill('LS1 6BY');
    await next();

    await page.getByText('Tracked 24').click();
    await next();
    await page.locator('label').filter({ hasText: 'Crypto' }).first().click();
    await page.locator('label').filter({ hasText: 'USDT' }).first().click();
    await next();

    // Review reads the phone back without the trunk zero and shows the third line.
    await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
    await expect(page.getByText('+447801123456')).toBeVisible();
    await expect(page.getByText('Flat 2')).toBeVisible();

    await placeOrder(page);
    const body = mocks.state.checkouts[0]!;
    expect(body.shippingAddress).toMatchObject({ addressLine1: '14 Kirkgate', addressLine3: 'Flat 2', city: 'Leeds', zip: 'LS1 6BY', country: 'GB' });
    // What is sent is unchanged: the backend strips the zero.
    expect(body.phone).toBe('+4407801123456');
  });
});
```

Run: `npm run test:e2e -- checkout-parts.spec.ts -g "contact and address form"`
Expected: PASS.

- [ ] **Step 6: Full run**

Run: `TZ=UTC npm test && npm run test:e2e`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add e2e web/test
git commit -m "test(checkout): e2e for shippable countries, address labels, line 3 and the phone control; baselines regenerated for the contact and address steps

Regenerated on purpose: the address step's new field order, address line 3 and country-aware labels, and the merged phone control (checkout, password sign-in, account profile). No other markup changed."
```

---

### Task 8: Verify in a browser, document, release

- [ ] **Step 1: Walk the checkout in a browser**

Run the storefront (`npm run dev`) against a backend that has Task 1 (a local backend on the Task 1 branch; mind the local-dev notes: the default `.env` database is a live client's, so only read from it). Check, at 390 px and 1280 px:

- Country lists only shippable countries; choosing United Kingdom gives Town / City, County, Postcode; United States gives City, State, ZIP code.
- Phone shows `+44`; typing `07801 123456` shows `+447801123456` on Review.
- Address line 3 appears on Review.

Do not place an order against a live database. If no safe backend is available, say so in the hand-back rather than claiming a browser check.

- [ ] **Step 2: Update the storefront docs**

In `README.md` or the doc that describes the checkout (search `docs/` for `sf-checkout-v1`), add one paragraph: the address step leads with the country, `settings.shipping.countries` limits the picker (empty or missing lists every country), label wording comes from `features/checkout/address-profiles.ts`, and `displayPhoneNumber` is display-only.

```bash
git add README.md docs
git commit -m "docs(checkout): shippable countries, address profiles and the phone display helper"
```

- [ ] **Step 3: Ask before integrating**

Stop and report to the owner: both branches, test results, what was and was not checked in a browser. Merging, the version bump and any push happen only on their say-so, in this order:

1. Backend: merge `feature/shippable-countries` into `main`. Deploy.
2. Storefront: merge `feature/checkout-form-fixes` into `main`, set `"version": "0.14.0"` in `web/package.json`, run `TZ=UTC npm test`, commit `chore(release): web 0.14.0`, tag `v0.14.0`.

Merges to `main` in these repos usually appear on the remote shortly after without an explicit push, so do not merge before the owner agrees.
