# Collection points on the web checkout

Date: 2026-10-04
Repos: `ecommerce-backend` (no migration), `ecommerce-storefront` (release v0.15.0)
Status: design approved in chat, awaiting spec review

Piece 2 of 5 from the checkout feedback of 2026-10-04. Piece 1 (checkout form
fixes) is merged. The remaining pieces, in order: unpaid order recovery,
payment method presentation, delivery estimates and dispatch.

## Goal

A shopper on the web storefront can have their order delivered to a carrier
pick-up point instead of a home address, the way a Telegram bot customer
already can. Success is a shopper who picks "Collection point" in the address
step, finds a point by postcode, sees only delivery options that work for that
point, places the order, and afterwards sees which point they chose.

## What the shop owner asked for and decided

- "Collection points also need to be supported for web checkout."
- The choice lives in the Address step, not the Delivery step.
- The picker is a postcode search with a list. No map.
- After ordering, the customer sees the point's name.
- A phone number is required for a collection order; when the shop hides the
  phone field, collection is not offered on the web.

## Current state

Backend (`src/`), from the collection-points work of 2026-08-13:

- `shipping_options.is_collection_point` flags an option; `shipping_addresses`
  has `service_point_id`, `service_point_carrier`, `service_point_name`. For a
  collection order the ordinary address columns hold the point's street address
  and the customer's own name.
- `GET /api/v1/public/storefront/service-points?country=XX[&postalCode=…]`
  (`modules/public-storefront/service-points.ts`): no auth, outside the
  storefront kill switch, 60 requests per 15 minutes per client IP. Without a
  postcode it is an availability probe; with one it proxies SendCloud and
  returns `{ available, carriers, points[] }`, each point
  `{ id, carrier, name, street, houseNumber, postalCode, city, country,
  latitude, longitude, distance }`. Upstream failure is a `502`. SendCloud only.
- `getCheckoutOptions(…, { deliveryMethod })` filters options to home or
  collection. It has no carrier argument: the bot filters by the point's
  carrier afterwards, in `bot/menus/checkout.ts` `loadCheckoutShippingOptions`,
  using `getOptionCarrierMap`.
- The web checkout (`modules/public-storefront/checkout.ts`) pins every quote
  to `deliveryMethod: 'home'` in `buildQuote` and strips the three
  service-point fields from the address in `runCheckout`. The request schemas
  already accept the three fields (all or none).
- Nothing, on any path, checks that the chosen shipping option is a collection
  option or that its carrier matches the point.
- The public order view and the storefront account order detail do not expose
  the point.
- `modules/shipping/shippable-countries.ts` excludes collection-point options
  from `shipping.countries`, marked temporary for this piece.

Storefront (`web/src/`):

- No service-point code exists. The Worker already proxies
  `/api/storefront/service-points`, uncached, forwarding the shopper's IP.
- The address step (`features/checkout/steps/AddressStep.tsx`) leads with the
  country and is rendered by the `CheckoutAddress` builder part.
- The quote (`features/checkout/useQuote.ts`) is re-requested when country,
  coupon, shipping option, store credit or cart lines change. A guest quote
  spends a Turnstile token each time.

## Design

### 1. Backend: which countries offer what

The shippable-countries module returns two lists, both ISO alpha-2, upper-case,
sorted, each narrowed by the serviceable-countries setting when that is set:

- `countries`: unchanged in meaning from piece 1. Countries in an active region
  with an active, public option that is not a collection option, i.e. where a
  home delivery can be quoted. It keeps this meaning for good, because a
  storefront at v0.14.0 lists exactly these and can only order home delivery.
- `collectionCountries`: countries in an active region with an active, public
  collection option that has an active service mapping on an enabled SendCloud
  provider whose keys are set, and whose mapping covers that country.

`collectionCountries` must agree with the existing probe: a country is in the
list exactly when `getServicePointContext(country)` would answer
`available: true`. Both read the same conditions; a test pins the agreement.

The public settings response becomes
`shipping: { countries, collectionCountries }`. The "temporary" comment in the
code is rewritten to state the permanent meaning of `countries`. A failed
lookup still answers with two empty lists and one warning log line.

### 2. Backend: quoting

`checkoutQuoteSchema` and `guestCheckoutQuoteSchema` gain two optional fields:

- `deliveryMethod: 'home' | 'collection'` (default `'home'`);
- `servicePointCarrier`: trimmed, lower-cased, 1 to 64 characters, only
  meaningful with `'collection'`.

`buildQuote` passes `deliveryMethod` to `getCheckoutOptions`. For a collection
quote with a carrier, the options are narrowed to those mapped to that carrier.
A collection quote with no carrier yet (the shopper has not picked a point)
returns every collection option for the country.

The carrier narrowing moves out of the bot into one exported function,
`filterOptionsForPointCarrier(options, country, carrier)`, in the
shipping-providers module beside `getOptionCarrierMap`. The bot's
`loadCheckoutShippingOptions` and the web `buildQuote` both call it, so the two
channels cannot drift.

An omitted `deliveryMethod` behaves exactly as today, so a storefront released
before this change keeps working.

### 3. Backend: placing the order

`runCheckout` stops stripping the service-point fields. The delivery method is
derived from the address, as the bot does: a `servicePointId` means collection.
Before the order is created, these are checked, each a `ValidationError`:

- collection: the chosen shipping option must be a collection option mapped to
  the point's carrier ("The selected delivery option cannot be used with this
  collection point");
- collection: a phone number is required ("A phone number is needed for
  collection");
- home: the chosen option must not be a collection option (already true through
  the home-only quote; kept as the quote check).

The first check falls out of calling `buildQuote` with the derived
`deliveryMethod` and the point's carrier: a selected option that is not in the
returned list is already rejected there.

The point's own details (street, city, postcode) are taken from the request, as
the bot's address webhook takes them. The label is addressed by
`to_service_point: { id }`, so a tampered address cannot redirect a parcel. The
point id is not re-validated against SendCloud at order time.

Signed-in and guest orders share `runCheckout`, so both gain the behaviour.

### 4. Backend: showing the point after the order

- Public order view (`modules/public-orders/service.ts`): `shippingAddress`
  gains `servicePoint: { name, carrier } | null`. The point id is not exposed.
- Storefront account order detail (`getStorefrontOrderDetail`): gains
  `servicePoint: { name, carrier } | null`.

Orders placed through the bot to a collection point show it too.

### 5. Storefront: settings and API

- `StorefrontSettings.shipping` gains optional `collectionCountries`. Missing
  (older backend) means no collection anywhere.
- The country picker lists the union of `countries` and `collectionCountries`
  (through the existing `normaliseShipCountries`). As before, when both are
  empty or missing every country is listed.
- New `web/src/api/service-points.ts`: `searchServicePoints(country,
  postalCode)` calling `storefront/service-points`, with the `ServicePoint`
  type. A `429` and a `502` are surfaced as distinct errors.
- `QuoteInput`, `GuestQuoteInput` and `ShippingAddressInput` gain the new
  fields. `PublicOrder` and `OrderDetail` gain `servicePoint`.

### 6. Storefront: form state

`CheckoutForm` gains, persisted with the rest under `sf-checkout-v1`:

- `deliveryMethod: 'home' | 'collection'` (default `'home'`);
- `servicePoint: ServicePoint | null` (default `null`);
- `pointPostcode: string` (default `''`).

A pure module decides the mode a country allows:

| Country is in | Result |
|---|---|
| `countries` and `collectionCountries` | the switch is shown; the shopper chooses |
| `collectionCountries` only | collection is forced; no switch; a line says delivery there is to a collection point |
| `countries` only, or `countries` is empty (unknown) and the country is not in `collectionCountries` | home; no switch (today's behaviour) |
| `countries` is empty (unknown) and the country is in `collectionCountries` | the switch is shown (home cannot be ruled out; the quote decides) |

Collection is treated as unavailable whenever the shop's phone mode is
`hidden`. If that leaves a collection-only country with no way to order, the
country is still listed and the quote's existing "unserviceable" handling
applies.

Rules, enforced in the same reconcile function that piece 1 added for
countries:

- changing the country clears `servicePoint` (a point belongs to a country) and
  re-derives the allowed mode;
- changing the delivery method clears `shippingOptionId`;
- choosing a different point clears `shippingOptionId` when its carrier differs
  from the previous point's;
- the home address fields are kept when the shopper switches to collection, so
  switching back restores them.

### 7. Storefront: address step

Under Country, when the country allows both, a two-option segmented control:
"Home address" and "Collection point". In collection mode the address fields
are replaced by:

- a postcode input (2 to 16 characters, seeded from the home postcode if one
  was typed) and a Search button; Enter searches;
- the result list as radio rows: point name, "street houseNumber, city", the
  carrier, and the distance in km when known. The list scrolls within a capped
  height;
- states: idle (a prompt), searching, results, no results, failure (`502`:
  try again), and too many searches (`429`: try again shortly);
- the chosen point shown as a summary with a "Change" action when the shopper
  returns to the step with a point already chosen.

Searches are abortable and sequence-guarded so a slow earlier response cannot
replace a later one. The result list is not persisted; the chosen point is.

Validation of the step in collection mode: a country and a chosen point.
In home mode it is unchanged.

All wording is editable text under `checkout.address.*` and
`checkout.errors.*`, with notes. No new builder part: the picker is inside the
existing `CheckoutAddress` part, so stored page documents need no change.

### 8. Storefront: the rest of the checkout

- Quote: `deliveryMethod` and the chosen point's carrier are sent and are part
  of the quote key, for signed-in and guest quotes.
- Delivery step: unchanged; it renders whatever the quote returns.
- Contact step: the phone field is required while the form is in collection
  mode. `submit()` already re-validates every step, so a shopper who filled
  Contact before choosing collection is sent back to it.
- Order body: for collection, `shippingAddress` is the shopper's first name and
  surname, `addressLine1` = "street houseNumber" (the point's name if both are
  blank), the point's city, postcode and country, no line 2, line 3 or county,
  plus `servicePointId`, `servicePointCarrier`, `servicePointName`.
- Review step: the address slip reads "Collect from" with the point's name
  above its address.
- Order status page and account order page: a "Collect from" line with the
  point's name when `servicePoint` is present.

Guest checkout and the Telegram Mini App use the same page and gain all of
this.

## Limits and non-goals

- SendCloud only, as today. Envia branch delivery is not part of this.
- No map, no "use my location", no saved or favourite points.
- The point's address is trusted from the browser (see Design 3).
- Customs routes to a collection point are not handled specially.
- A customer whose group is denied every collection option for a country can
  still choose collection and will see the existing "no delivery options"
  message; the settings lists are the same for every visitor.
- No admin SPA change.

## Testing

Backend:

- Unit: the two country lists (home only, collection only, both, collection
  option with no mapping, disabled provider, blank keys, mapping that excludes
  the country, serviceable narrowing); agreement with the probe.
- Unit: `filterOptionsForPointCarrier`; the quote with each delivery method and
  with and without a carrier; an older client's quote (no new fields) is
  unchanged.
- Database-backed (PGlite, as the existing integration suites): a web
  collection order stores the three fields and the point's address; each
  rejection (option not for the carrier, home option with a point, missing
  phone); a guest collection order.
- Unit: the two order views expose `servicePoint` and never the id.
- The bot's option loading still behaves as before, through the shared filter.

Storefront:

- Unit: the mode-for-country table; each reconcile rule; the order body for a
  collection order; the quote key including the new fields; the picker's
  states, the abort and sequence guard, and the `429` and `502` paths.
- End to end on the mock backend: a signed-in collection order and a guest
  one; a collection-only country; switching back to home restores the address.
- Baselines regenerated only where the address step, review slip or order
  pages change on purpose, each diff read in full.
- `TZ=UTC npm test` before tagging.

## Rollout

1. Backend to `main` and deployed. Harmless alone: an older storefront never
   sends the new fields, ignores `collectionCountries`, and `countries` means
   what it meant before.
2. Storefront to `main`, `chore(release): web 0.15.0`, tag `v0.15.0`. Against
   an older backend the switch never appears.

Documentation: backend `STOREFRONT.md` (settings, quote, checkout, order
views) and `CLAUDE.md` (Collection points passage); storefront
`docs/builder.md` (the checkout parts section).
