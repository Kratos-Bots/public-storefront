# Checkout form fixes: phone field, address step, shippable countries

Date: 2026-10-04
Repos: `ecommerce-backend` (small, no migration), `ecommerce-storefront` (release v0.14.0)
Status: design approved in chat, awaiting spec review

This is piece 1 of 4 from the checkout feedback of 2026-10-04. The other three
get their own specs, in this order: unpaid order recovery, payment method
presentation, delivery estimates and dispatch.

## Goal

The Contact and Address steps of the storefront checkout should read as a
finished form to a customer:

- the phone prefix picker shows a prefix, not a country name;
- the address form has a third address line, a sensible field order, and labels
  that match the delivery country;
- the country list offers only countries the shop can ship to.

Success is a customer in the UK seeing `+44`, "Town / City", "County" and
"Postcode", choosing from only the shop's countries, and never picking a country
that then has no delivery options (group rules aside, see Limits).

## What the shop owner asked for

1. The phone code field shows the country, not the prefix. Merge the two
   controls into one if sensible, and show `+44` rather than
   `United Kingdom +44`.
2. Address line 3 is missing although the admin panel supports it.
3. The order City, Zip, County is odd; it should be City, County, Zip.
4. With United Kingdom selected the form should say Postcode, not
   Zip/Postcode. Add country localisations.
5. The country dropdown shows every country instead of the serviceable ones
   from the backend.

Decisions taken in the design conversation:

- Phone: one merged control (prefix picker inside the same border as the
  number).
- Localisation: label profiles by country, no format validation.
- Countries: a new backend list (serviceable setting narrowed by shipping
  regions), not the existing raw serviceable setting.
- Country moves to the top of the address step. This was proposed by the
  designer, not requested, and was approved.

## Current state

Storefront (`web/src/`):

- `features/checkout/PhoneField.tsx` renders a native `<select>` whose options
  read `{name} +{dial}` in a fixed 6.75rem column, beside a `tel` input. It is
  also used by `features/auth/PasswordLogin.tsx` and
  `features/account/PasswordSection.tsx`. State is `phonePrefix` (ISO code) and
  `phone` (national number); `composePhoneNumber` joins them at submit.
- `features/checkout/steps/AddressStep.tsx` renders line 1, line 2, a
  City + ZIP pair, County, then Country. Labels are editable-text keys in
  `text/keys/checkout.ts` and are the same for every country.
- `addressLine3` exists on `ShippingAddressInput` but `CheckoutPage.tsx`
  `buildBody()` sends `null`; `CheckoutForm` has no such field.
- `features/checkout/CountrySelect.tsx` lists every key of `DIAL_CODES`. Its
  doc comment records that no serviceable-countries data exists on the
  storefront API.
- `features/auth/PhoneEntry.tsx` (code sign-in) is a separate component and is
  out of scope.

Backend (`src/`):

- `settings.serviceable_countries` is a comma-separated ISO list; empty means
  all countries.
- `shipping_regions.country_codes` holds the countries each region covers;
  `shipping_options` belong to a region and carry `isActive`, `isPublic`,
  `isCollectionPoint`.
- `getCheckoutOptions` (`modules/shipping/service.ts`) rejects a country not in
  the serviceable list and returns `[]` for a country in no active region.
- `getPublicStorefrontSettings` (`modules/storefront-settings/service.ts`)
  exposes the raw serviceable list only as `login.phone.countries`.
- The storefront order schema already accepts `addressLine3`.

## Design

### 1. Backend: `shipping.countries` on the public storefront settings

Add a function in `modules/shipping/service.ts`:

```ts
/** Countries a web checkout can deliver to: ISO alpha-2, upper-case, sorted. */
export async function getShippableCountries(): Promise<string[]>
```

A country is included when both hold:

- it appears in the `countryCodes` of at least one active region that has at
  least one option with `isActive`, `isPublic` and not `isCollectionPoint`
  (the web checkout quotes with `publicOnly: true, deliveryMethod: 'home'`, so
  these are exactly the options it can offer);
- the serviceable-countries setting is empty, or contains it.

`getPublicStorefrontSettings` adds `shipping: { countries }` to its response and
`PublicStorefrontSettings` gains the field. `login.phone.countries` is left as
it is.

Customer-group shipping rules are not applied: the settings response is
anonymous and cached, so it cannot vary by customer.

No migration, no admin change, no new route. The Worker already caches
`GET /settings` for 30 seconds, so a region edit reaches shoppers within that.

### 2. Storefront: country list

- `StorefrontSettings` gains optional `shipping?: { countries: string[] }`.
- `CountrySelect` takes the allowed codes and renders only those, still named
  by `regionName` and sorted by `compareNames`.
- When `shipping` is absent (older backend) or `countries` is empty, the full
  list is shown as today. The quote stays the authority either way; the
  existing "unserviceable" handling is untouched.
- Exactly one allowed country: it is preselected when the form's country is
  blank.
- A persisted or seeded country that is not in a non-empty allowed list is
  cleared when the list is known, so the customer must choose again.
- The doc comment in `CountrySelect.tsx` is rewritten to describe the new
  source.

### 3. Storefront: address step

New render order:

1. Country
2. Address line 1 (required)
3. Address line 2 (optional)
4. Address line 3 (optional, `autoComplete="address-line3"`, max 255)
5. City (required)
6. County (optional) and Postcode (required), sharing a row on wide screens

`CheckoutForm` and `DEFAULT_FORM` gain `addressLine3: ''`. The persistence key
stays `sf-checkout-v1`; a stored form without the field reads as blank.
`addressSchema` accepts it (optional, max 255) and `buildBody()` sends the
trimmed value or `null`. The Review step shows line 3 when present.

Required rules are unchanged: county is optional for every country and there is
no postcode format check.

### 4. Storefront: label profiles

A new pure module `features/checkout/address-profiles.ts` maps a country to a
profile and a profile to the text keys for the city, county and postcode
labels.

| Profile | Countries | City | County | Postcode |
|---|---|---|---|---|
| `uk` | GB, IM, JE, GG | Town / City | County | Postcode |
| `ie` | IE | Town / City | County | Eircode |
| `us` | US | City | State | ZIP code |
| `ca` | CA | City | Province | Postal code |
| `au` | AU | Suburb | State | Postcode |
| fallback | everything else, and no country chosen | City | State / Region | Postal code |

The fallback uses the three existing keys (`checkout.address.city`, `.county`,
`.zip`); their English defaults change from "County / Region" and
"ZIP / Postcode" to the fallback wording above. A shop that has already edited
those keys keeps its wording. Each profile cell that differs from the fallback
gets a new key in `text/keys/checkout.ts`, plus `checkout.address.line3`
("Address line 3"), each with a `max` and an entry in `text/notes/checkout.ts`
explaining which country it applies to. The Checkout Address editor field
definitions are extended so the new labels can be edited in the builder.
Exact key names follow the existing `area.part.name` grammar and are settled
in the plan.

Any validation message that names one of these three fields uses the active
profile's label; messages that do not name a field are unchanged.

### 5. Storefront: phone field

`PhoneField` becomes one bordered control with one visible label ("Phone"):

- Left: the prefix picker. It stays a native `<select>` (the phone's own
  picker is better than a drawn listbox, as the stylesheet already notes),
  made visually transparent over a visible `+44` and chevron, so the closed
  state shows only the prefix. With no prefix chosen it shows the existing
  `checkout.phone.code` text.
- Option text is `+44  United Kingdom`. Options are grouped: the shop's
  shippable countries first, then all countries, mirroring the grouping
  `PhoneEntry` uses. With no shippable list, one flat list.
- Right: the number input, unchanged in behaviour (`type="tel"`,
  `autoComplete="tel"`).
- The select keeps its accessible name from `checkout.phone.codeAriaLabel`.
  Error, hint and "Optional" render under the whole control.
- Focus styling treats the pair as one field.

Props and stored state do not change, so `composePhoneNumber`, the
prefix-follows-country behaviour in `AddressStep`, and the submitted `phone`
string are untouched. Password sign-in and the account profile pick up the new
control through the shared component.

## Limits and non-goals

- A customer whose group is denied every shipping option for a country can
  still pick it and will see the existing "no delivery options" message.
- Not included: billing address, postcode validation, hiding the county field
  per country, address lookup, the code sign-in phone screen, and any admin SPA
  change.

## Testing

Backend:

- Unit tests for `getShippableCountries`: empty serviceable setting; serviceable
  setting narrower than the regions; inactive region; region whose only options
  are inactive, non-public or collection-point; country in two regions appears
  once; output upper-case and sorted.
- A test that the public settings response carries `shipping.countries`.

Storefront:

- vitest: profile lookup per country and fallback; `addressLine3` in schema and
  request body (present, blank becomes `null`); country list filtered, full-list
  fallback when the field is absent or empty, single-country preselect, stale
  country cleared; phone field shows the prefix closed and groups its options.
- Playwright: `checkout-parts.spec.ts` payload baseline updated for
  `addressLine3`; the e2e mock settings gain `shipping.countries`.
- DOM-parity baselines and screenshot goldens regenerated for checkout,
  password sign-in and account profile, across the three templates and both
  widths. Each regenerated baseline is reviewed as an intended change.
- Release CI runs as en-US/UTC: `TZ=UTC npm test` before tagging.

## Rollout

1. Backend to `main` and deployed. Harmless alone: an older storefront ignores
   the new field.
2. Storefront to `main`, `chore(release): web 0.14.0`, tag `v0.14.0`. Harmless
   against an older backend: the country list falls back to all countries.

Documentation to update with the change: the storefront contract
(`STOREFRONT.md`, settings section) for `shipping.countries`, and the backend
`CLAUDE.md` Settings/Shipping notes.
