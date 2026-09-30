# Editable text — design (stage 1 of "everything editable")

Date: 2026-09-30. Status: approved in conversation, awaiting written-spec review.
Repos: `ecommerce-storefront` (lead), `ecommerce-backend`, `ecommerce-admin-frontend`, branch
`feature/puck-editable`. Initiative overview and cross-stage rules:
[`2026-09-30-puck-editable-overview.md`](2026-09-30-puck-editable-overview.md). Builds on
[`2026-09-29-puck-page-builder-design.md`](2026-09-29-puck-page-builder-design.md) (§13 wins over
its §1–12) and [`../../builder.md`](../../builder.md).

## 1. Goal

Every word a shopper reads in the storefront — button labels, headings, empty states, form
errors, toasts, aria-labels, Telegram button labels, template slot copy — becomes editable by the
owner in the page builder, per store, with an optional different wording per layout. Text is
stored per language so a language switcher can be added later without a data migration; today
a store has exactly one active language, which also drives `<html lang>` and number, money and
date formatting.

### Decisions (made with the user — binding)

| Question | Decision |
|---|---|
| Where text lives | **Approach A.** One shared **Site text** document per store (draft / publish / last 20 versions, like a page set) **plus** optional per-layout overrides stored inside each layout's page set. Resolution per key: **layout override → shared → built-in default.** |
| Languages | **One language now, ready for many.** Strings are stored keyed by locale; one active store language; a store language setting (default `en`) drives `<html lang>` and all shopper-facing formatting. |
| Publishing | Publishing from the editor publishes the current layout **and** any shared-text changes **atomically, in one backend transaction**. The publish dialog warns "Shared text changes go live on all 3 layouts". |
| Format | **Plain text only**, never HTML. Placeholders `{name}`. Plurals are paired forms per `Intl.PluralRules` category (`one` / `other` for English) — owners edit forms, never ICU syntax. |
| Validation | An override may drop a placeholder but never introduce an unknown one; per-key length caps; the backend validates structure too. |
| Scope | **In:** every storefront literal, including local fallback strings (e.g. "Something went wrong"). **Out:** messages the backend sends and the storefront shows verbatim; data names (products, categories, payment methods, shipping methods). |

### Decisions made in this spec (flagged for review)

1. The store language lives **inside the Site text document** (`language`), so it drafts,
   publishes, versions and restores together with the text it describes.
2. The key registry is **hand-written TypeScript**, one file per area, not generated from
   source (§6.1).
3. The public page-set read also returns the **two text layers for the active locale**, not a
   pre-merged map, so a bad override can fall back per key to the shared value (§4.6).
4. Page-set history and text history stay **two linear histories**; each published page-set
   version **pins** the text version that was live right after it (§4.5).
5. Language `en` with no explicit format locale keeps today's **per-call-site legacy formatters**
   exactly (`'en'` money, `'en-GB'` dates, the viewer's locale for `toLocaleString`), so parity
   holds (§6.5).
6. Clearing a text box **resets** that key at that scope; an empty string is never stored.
7. The kill-switch page and the boot-failure screen go through the text layer but are **not
   editable** (`fixed: true`): under the kill switch the public read is a 503, so an edit there
   could never show.

## 2. Guarantees

1. **Nothing published ⇒ byte-identical DOM.** With no published Site text and no overrides,
   every built-in default equals the literal it replaces, character for character (curly
   apostrophes, em dashes, non-breaking spaces, collapsed JSX whitespace), and formatting is
   unchanged. `e2e/dom-parity.spec.ts` passes **with no snapshot regenerated**; every other
   existing Vitest/Playwright test passes unedited (≈ 50 files assert English text).
2. **A bad string can never break a page.** Every stored value is re-validated per key at render
   time against the running release's registry; an invalid value falls to the next layer.
3. **Text is never markup.** Resolved strings reach the DOM only as React text children or
   attribute values; never `dangerouslySetInnerHTML`, `href`, `src` or `style`.
4. **No extra shopper request.** Text arrives in the existing `storefront/pages/:layout`
   response (Worker-cached 30 s).
5. **Shoppers never download the editor.** The Text panel lives under `web/src/builder/editor/`;
   the builder-isolation build check is unchanged.

## 3. Data model

Storefront `web/src/text/types.ts`; the backend mirrors it in zod
(`src/modules/storefront-text/schemas.ts`).

```ts
/** BCP 47, canonical form, language[-Script][-REGION]: 'en', 'de', 'pt-BR', 'zh-Hant'. */
export type Locale = string;

/** One key's value in one locale. A plural value has `other` plus any other CLDR categories. */
export type PluralForms = Partial<Record<'zero' | 'one' | 'two' | 'few' | 'many', string>> & { other: string };
export type TextValue = string | PluralForms;

/** Sparse: only keys the owner set. */
export type LocaleStrings = Record<string, TextValue>;          // key → value

export interface TextLanguage {
  locale: Locale;          // the active store language; default 'en'
  formatLocale: '' | Locale;  // '' = built-in formatting for `locale` (§6.5); else used for every formatter
}

/** The shared Site text document — one per store. */
export interface SiteText {
  schemaVersion: 1;
  language: TextLanguage;
  strings: Record<Locale, LocaleStrings>;   // e.g. { en: { 'cart.drawer.title': 'Your basket' } }
}

/** Per-layout overrides, inside the layout's PageSet. */
export interface PageText {
  strings: Record<Locale, LocaleStrings>;
}

export interface PageSet {                  // web/src/builder/types.ts — one optional field added
  schemaVersion: 1;
  shell: PuckDoc;
  pages: Partial<Record<RouteKey, PuckDoc>>;
  text?: PageText;                          // absent or empty = no overrides
}
```

`PageSet.schemaVersion` stays `1`: the field is additive and a v0.7.0 storefront ignores it.
Strings for locales other than the active one may be stored (an owner who switches language
keeps the old wording for when they switch back) but are never served.

**Keys** look like `area.part.name` (`checkout.errors.paymentMissing`, `cart.summary.items`):
2–6 dot-separated segments, first segment lower-case letters, each later segment starts with a
letter or digit, total ≤ 100 chars. The running release's registry decides which keys exist; the
backend only checks the shape.

## 4. Backend (`ecommerce-backend`)

### 4.1 Tables and migration

New table **`storefront_site_text`** (Drizzle schema `src/db/schema/storefront-text.ts`),
the page-set table's shape without `layout`:

| Column | Type | Notes |
|---|---|---|
| `id` | integer identity PK | |
| `kind` | text | `draft` \| `published` (check constraint) |
| `version` | integer ≥ 0 | draft: the published text version it is based on (0 if none); published: 1, 2, 3… |
| `data` | jsonb | a `SiteText` |
| `created_by` | integer FK users, nullable | |
| `created_at` / `updated_at` | timestamptz | `timestamps` helper |

Unique index on `(kind)` where `kind = 'draft'` (at most one draft); unique `(version)` where
`kind = 'published'`.

**`storefront_page_sets`** gains `text_version integer null` — on `published` rows only, the Site
text version that was live right after this page-set version was published or restored (`0`
when none existed; `null` on rows published before this migration and on drafts).

One migration via `npm run db:generate` (the next number after the latest in `drizzle/` —
`0046` at the time of writing). No backfill.

### 4.2 Module `src/modules/storefront-text/`

`router.ts` / `controller.ts` / `service.ts` / `schemas.ts` plus a `store.ts` query seam, exactly
as `storefront-pages` is built (service unit-tested against an in-memory fake store). Mounted at
`/api/v1/storefront-text`, registered next to `storefront-pages` in the same module group, every
route `authenticate, authorize('admin')`.

| Method + path (under `/api/v1`) | Request | `data` |
|---|---|---|
| `GET /storefront-text/draft` | — | `{ source: 'draft' \| 'published' \| 'none', data: SiteText \| null, baseVersion, latestPublishedVersion, updatedAt: string \| null }` |
| `PUT /storefront-text/draft` | `{ data: SiteText, baseVersion }` | `{ baseVersion, updatedAt }` — `409 SITETEXT_CONFLICT` if `baseVersion < latestPublishedVersion` |
| `DELETE /storefront-text/draft` | — | `{ discarded: boolean }` |
| `GET /storefront-text/versions` | — | `Array<{ version, createdAt, createdBy: { id, name } \| null }>`, newest first |
| `GET /storefront-text/versions/:version` | — | `{ version, createdAt, data: SiteText }` |
| `POST /storefront-text/versions/:version/restore` | — | `{ version }` — copies into a **new** version and resets the draft to it |

There is deliberately **no** standalone text publish route: text is published through a layout
publish (§4.4), so the owner always sees the publish dialog's warning. Restore stands alone
because it starts from history, not from the editor.

Socket event (admin namespace, `role:admin`): `storefront-text:published { version }` after any
text publish or restore.

Every write takes the advisory lock `pg_advisory_xact_lock(hashtext('storefront_text'))`
(`textLockSql()` in `store.ts`), mirroring `layoutLockSql`.

### 4.3 Validation (`schemas.ts`) — structural only

`TEXT_LIMITS = { locales: 10, keysPerLocale: 3000, key: 100, value: 1000, placeholders: 10,
docBytes: 256 * 1024 }`.

- `siteTextSchema` = `z.strictObject({ schemaVersion: z.literal(1), language, strings })`;
  `pageTextSchema` = `z.strictObject({ strings })`. **Strict**, unlike the page-set root: an
  unknown text field from a newer editor is a loud 400 in autosave, never a silent strip.
- `language.locale`: matches `^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|\d{3}))?$` **and**
  `Intl.getCanonicalLocales(x)[0] === x`. `formatLocale`: `''` or the same rule.
- `strings`: record of locale (same rule) → record of key (§3 shape) → `TextValue`; ≤ 10 locales,
  ≤ 3 000 keys per locale.
- A string value, and every plural form: 1–1 000 chars; no control characters except `\n`
  (`/[\u0000-\u0009\u000B-\u001F\u007F]/` rejects); placeholders match
  `\{[A-Za-z][A-Za-z0-9]{0,31}\}`, and once they are removed no `{` or `}` may remain (no escape
  syntax in this stage); ≤ 10 distinct placeholder names.
- A plural value is a strict object whose keys ⊆ `zero one two few many other`, with `other`
  required.
- `SiteText` serialised ≤ 256 KB. A page set's `text` counts toward the existing 512 KB page-set
  cap.
- `pageSetSchema` gains `text: pageTextSchema.optional()`. The `*Html` / `*Url|href|src` walkers
  only walk `shell` and `pages`, so text values are never sanitised or link-checked — they are
  rendered as plain text (Guarantee 3). Validation messages name the key path
  (`strings.en["checkout.errors.paymentMissing"]`).

The backend never knows which keys exist or which placeholders a key accepts; that is the
storefront release's job (§6.3), as with blocks.

### 4.4 Publish — one transaction for both documents

`POST /storefront-pages/:layout/publish` body becomes
`{ baseVersion: number, text?: { baseVersion: number } }`; `text` is sent whenever the editor
session holds shared text. Response `data`:
`{ version, publishedAt, pagesPublished: boolean, textVersion: number, textPublished: boolean }`
(`version` = the layout's latest version afterwards, unchanged when `pagesPublished` is false).

In one `db.transaction`:

1. Take the **text lock, then the layout lock** — every transaction that holds both takes them
   in this order; text-only writes take only the text lock, page-only writes only the layout
   lock, so no deadlock is possible.
2. Layout conflict: `baseVersion < latest layout version` → `409 PAGESET_CONFLICT`.
3. Text conflict (only when `text` is given): `text.baseVersion < latest text version` →
   `409 SITETEXT_CONFLICT`. Either 409 rolls back **everything**.
4. Read both drafts. No layout draft and (no `text`, or no text draft) → `400 NO_DRAFT`.
5. Text: if a text draft exists, re-parse it with `siteTextSchema`; if it differs from the
   latest published text (stable JSON compare), insert published `latest + 1`, set the draft's
   `version` to it, prune text versions below the newest 20 → `textPublished: true`. If it is
   identical, just set the draft's `version` to the latest.
6. Layout: if a layout draft exists, publish it exactly as today (re-parse, insert
   `latest + 1`, set draft version, prune to 20) and store `text_version` = the latest text
   version after step 5 (`0` if none) → `pagesPublished: true`.
7. After commit: emit `storefront-pages:published` if step 6 ran and `storefront-text:published`
   if step 5 inserted.

A layout publish **without** `text` (an older admin) behaves exactly as today and records
`text_version` = the current latest text version.

### 4.5 History and restore — how the two documents stay coherent

- Two linear histories, each capped at 20: per-layout page sets, and the store's Site text.
  History is never rewritten; restore always appends.
- `GET /storefront-pages/:layout/versions` and `…/versions/:version` add
  `textVersion: number | null` (the pin).
- `POST /storefront-pages/:layout/versions/:version/restore` accepts an optional body
  `{ withText?: boolean }` (default `false`):
  - `false`: restores the layout's page set **including its per-layout overrides**; shared text
    is untouched (it belongs to all three layouts). The new page version pins the current text
    version.
  - `true`: in the same transaction (text lock, then layout lock), the pinned text version is
    restored as a new text version (skipped when it equals the latest) and the text draft is
    reset to it; the new page version pins it. A pin that is `null`, `0` or already pruned →
    `409 TEXT_VERSION_GONE`, nothing changes.
  - Response adds `textVersion` and `textRestored: boolean`.
- `POST /storefront-text/versions/:version/restore` restores only the shared text; page sets and
  their pins are untouched (a pin records history, it is not a live link).
- The admin's read-only version preview posts the page set **and**, when its pin still exists,
  that text version, so the preview shows the words the page had when it was published.

### 4.6 Public read

`GET /public/storefront/pages/:layout` keeps its route, kill switch (`requireStorefrontEnabled`)
and 30 s Worker edge cache (`worker/src/proxy.ts` `CACHE_RULES`, unchanged). `data` becomes:

```ts
null                                          // no published page set AND no published Site text (as today)
| {
    version: number;                          // layout's latest published version, 0 if none
    data: PageSet | null;                     // the published set WITHOUT its `text` field; null if none
    text: {
      version: number;                        // Site text version, 0 if none published
      locale: Locale;                         // language.locale ('en' when no Site text is published)
      formatLocale: '' | Locale;
      shared: LocaleStrings;                  // published Site text strings[locale], {} if none
      layout: LocaleStrings;                  // this layout's published PageText strings[locale], {} if none
    } | null;                                 // null only when neither layer nor a language exists
  }
```

Both layers are sent for the **active locale only**. Sending them separately (rather than
pre-merged) lets the storefront reject a bad override and still show the shared value for that
key. `data.text` is stripped so the overrides are not sent twice.

Compatibility: a v0.7.0 storefront reads `body.data` through `toPageSet`, which returns `null`
for `data: null` and ignores the extra `text` field — it keeps rendering defaults / its set.

### 4.7 Backend tests

Schema accept/reject for every rule in §4.3 (locale canonical form, key shape, placeholder
syntax, stray braces, control chars, plural shape, caps, strict unknown field, page-set `text`
inside the 512 KB cap). Service (fake store): text draft save/409/discard; publish with page
draft only, text draft only, both, neither (`NO_DRAFT`); identical text → no new version; a text
409 rolls back the layout insert; lock order recorded by the fake is text-then-layout in
publish and restore; prune at 20 for both; restore `withText` true/false/pin gone; text restore
leaves page sets untouched; events emitted only for what was inserted. Public read: `null` with
nothing; `{ version: 0, data: null, text }` with text only; `data.text` stripped; only the
active locale's layers. Router: admin-only on every text route; kill switch 503 on the public
read. Run with `npm test` (not only `tsc --noEmit`, which skips test files).

## 5. Storefront loading

- `web/src/api/pages.ts`: `fetchPageSet` becomes `fetchPublished(layout): Promise<Published>`,
  `interface Published { pageSet: PageSet | null; text: PublishedText | null }`. It never rejects
  (same `PAGE_SET_REQUEST`: no `Authorization`, `retry: 0`, 4 s timeout); a 404/503/timeout or
  malformed body yields `{ pageSet: null, text: null }`. `toPageSet` keeps its rules; a
  malformed `text` alone is dropped without dropping the page set.
- `runtime.tsx`: the `pagesKey(layout)` query now holds `Published`; `PAGES_QUERY` is unchanged
  (read once per page load — a publish never changes wording under a shopper mid-checkout).
  `usePageSet(layout)` keeps its signature. `PageSetOverrideProvider` gains an optional
  `text?: EditorText` prop for the editor and version preview.
- The prefetch in `app/App.tsx` is unchanged (same key, same function).
- **While the query is pending**, `useText()` resolves built-in defaults. Inside the shell this
  is never visible: `PuckShell` and `PuckPage` already show skeletons until the set is in. The
  boot screens above the shell (`SettingsBoundary`'s error state, `ClosedPage`) always use
  built-in defaults (their keys are `fixed`, §6.2).

## 6. Storefront text runtime (`web/src/text/`, shopper code)

```
text/
  types.ts          §3 types + TEXT_LIMITS mirror
  define.ts         defineTextArea(), placeholder parser, type helpers
  keys/<area>.ts    the registry, one file per area (hand-written)
  registry.ts       TEXT (all areas merged), TextKey / StringKey / PluralKey, isTextKey()
  resolve.ts        resolveText(), checkValue() — shared with the editor
  plural.ts         pluralCategory(locale, n), categoriesFor(locale)
  format-profile.ts FormatProfile, formatProfileFor(language)
  runtime.tsx       TextProvider, useText(), textSnapshot()
```

### 6.1 The registry — hand-written, typed

Chosen over source extraction: an extractor would need an AST pass on every build, could not
carry per-key notes and caps, and would still need the guard test to find what it missed. A
hand-written registry gives reviewable diffs and a single place for defaults, notes and limits;
the guard and integrity tests (§6.6) supply the "nothing missed" guarantee.

```ts
// text/keys/cart.ts
export default defineTextArea('cart', {
  'drawer.title':   { en: 'Your cart', note: 'Heading of the slide-out cart' },
  'summary.items':  { en: { one: '{count} item', other: '{count} items' }, note: 'Line count in the cart summary' },
  'drawer.close':   { en: 'Close cart', note: 'Screen-reader label of the close button' },
  'errors.stock':   { en: 'Only {available} left', max: 80 },
});
```

- `defineTextArea<const A, const E>(area, entries)` uses TypeScript 5 `const` type parameters so
  the full key (`'cart.summary.items'`) and its placeholders are inferred from the literal
  defaults: `ParamsOf<'Only {available} left'>` → `{ available: string | number }`.
- Entry fields: `en` (the built-in default — the only built-in language), `note?` (where it
  appears; shown in the Text panel), `label?` (short name; else derived from the last segment),
  `max?` (default 200, ≤ 1000), `fixed?` (§6.2).
- Placeholders of a key = the union of names in all default forms. A plural key always accepts
  `count`, even if a form omits it.
- **Areas** (and default groups in the Text panel): `common`, `shell`, `catalog`, `product`,
  `cart`, `checkout`, `auth`, `account`, `order` (order status), `payment` (payment-redirect,
  order placed), `tracking`, `verify`, `wholesale`, `webapp` (Telegram button labels,
  default-action labels), `notices`, `errors` (local fallbacks), `templates` (template slot
  copy, keyed `templates.<templateId>.<name>`), `closed`, `boot`.
- **One key per meaning.** The same wording used for the same purpose in several places (e.g.
  "Search products" in `SearchField` and the shells) is one key, so one edit changes it
  everywhere; per-layout wording differences use layout overrides.

### 6.2 Fixed keys

`closed.*` and `boot.*` are registered with `fixed: true`: they go through `useText()` (ready for
a future second language) but are hidden from the Text panel and ignored by the resolver's
stored layers — the kill switch returns 503 for the public read, and the boot screen renders
before any published data, so an edit there could never show.

### 6.3 Resolution (`resolve.ts`)

`resolveText(layers: { layout: LocaleStrings; shared: LocaleStrings }, locale): Resolved`,
memoised per layers object. For each key `t()` asks for, the first **valid** candidate wins:
layout override → shared → built-in default. `checkValue(key, value)` (also used by the editor)
rejects a candidate when:

| Rule id | Cause |
|---|---|
| `unknown-key` | not in this release's registry (saved by a newer release, or removed) — ignored, one `console.warn` per load |
| `type-mismatch` | a string for a plural key or a plural object for a string key |
| `unknown-placeholder` | a `{name}` the key does not accept (dropping a placeholder is allowed) |
| `bad-brace` | a `{` or `}` that is not part of a placeholder |
| `too-long` | longer than the key's `max` |
| `empty` | an empty string or form (the backend already refuses these) |
| `fixed` | a stored value for a `fixed` key |

A plural value missing the category the locale needs uses its own `other` (never another
layer's form). Rejections are silent for shoppers (one `console.warn` per key and load) and are
issues in the editor.

### 6.4 API

```ts
interface TextApi {
  locale: Locale;
  t<K extends StringKey>(key: K, ...p: ParamArgs<K>): string;
  tp<K extends PluralKey>(key: K, count: number, ...p: ParamArgs<K, 'count'>): string;
  tn<K extends TextKey>(key: K, params: NodeParams<K>, count?: number): ReactNode;  // params may be elements
  msg(value: string): string;       // a TextKey → t(value); anything else verbatim (a backend message)
}
export function useText(): TextApi;          // components
export function textSnapshot(): TextApi;     // non-React code (lib/errors.ts fallbacks): the resolved text of the mounted TextProvider
export function textKey<K extends StringKey>(key: K): K;   // marks a key in module-scope data (zod messages, status maps)
```

- `ParamArgs<K>` makes params required exactly when the key has placeholders, so a missing or
  misspelled param is a type error; `t()` on a plural key and `tp()` on a string key are type
  errors.
- `tp` picks the form with `new Intl.PluralRules(locale).select(count)` (memoised per locale);
  for English this is `one` exactly when `count === 1`, identical to today's ternaries. `{count}`
  is inserted as `String(count)` — not locale-formatted — because today's plural strings print
  the raw number; a call site that formats today passes its own formatted param.
- `tn` returns an array of strings and keyed fragments, for sentences that embed an element or a
  formatted component (the `LoyaltyPage.tsx:174` confirmation sentence); the string itself stays
  plain text.
- `TextProvider` is mounted in `app/App.tsx`'s `ThemedApp`, inside `TemplateProvider` and
  around `ClosedGate`; it reads the `pagesKey(useEffectiveLayout())` query (or the editor's
  override), resolves, sets the format profile (§6.5) and sets `document.documentElement.lang`
  when it differs from the locale. `index.html` keeps `lang="en"`, so the default changes
  nothing.

**How feature code changes** (all ≈ 450–700 strings, area by area):

| Today | After |
|---|---|
| `<h2>Your cart</h2>` | `<h2>{t('cart.drawer.title')}</h2>` |
| `{count} {count === 1 ? 'item' : 'items'}` | `{tp('cart.summary.items', count)}` |
| `aria-label="Back"` (`WebAppShell`) | `aria-label={t('shell.webapp.back')}` |
| `setErrors({ method: 'Choose how you’d like to pay' })` (`CheckoutPage.tsx:359-398`) | `setErrors({ method: textKey('checkout.errors.paymentMissing') })`; the field renders `msg(error)` |
| zod `z.string().min(1, 'Enter your email')` (`checkout/schemas.ts`) | `.min(1, textKey('checkout.errors.emailRequired'))`; `firstIssues` passes keys through; fields render `msg()` |
| `PARCEL_LABEL: Record<string, string>` (`tracking/status.ts`) | `Record<string, StringKey>`; `parcelLabel()` returns a key; the component calls `t()` |
| `notifications.show({ message: … })` in a mutation callback | `t` captured from `useText()` in the component |
| `document.title` fragments built in features | keys |
| an API error message shown as-is | unchanged (out of scope); its local fallback becomes a key |

`default-action.ts` (Telegram MainButton labels) returns keys; `PrimaryActionBar` resolves them.
Template slot components call `useText()` with `templates.<id>.*` keys.

**Blocks with an owner text prop that duplicates site text** — `SearchField.placeholder`
(`catalog.search.placeholder`) and `NavLinks.ariaLabel` (`shell.nav.ariaLabel`): `BlockDef`
gains `textProps?: Partial<Record<keyof P, StringKey>>`; the schema allows `''`, the default
becomes `''`, and render uses `prop.trim() || t(key)`. Neither block is in a default document,
so parity is unaffected; stored documents that hold the old explicit value keep it. Content
blocks' starter copy (`Button` "Shop now", `Testimonial`) is owner content and stays a prop.

### 6.5 Language and formatting

`formatProfileFor({ locale, formatLocale })` → `FormatProfile { money, date, dateTime, number,
regions }` (each an Intl locale argument, `undefined` meaning the viewer's locale):

- **`locale === 'en'` and `formatLocale === ''`** (the default, and every store today) → the
  legacy per-call-site locales, unchanged: money `'en'` (`lib/format.ts`), `formatDate` `'en-GB'`,
  `formatDateTime` `undefined`, `toLocaleString()` `undefined`, tracking stamps `'en-GB'`
  (`tracking/status.ts`), verify dates `'en-GB'` (`verify/VerifyPage.tsx`), country names
  `['en']` (`CountrySelect.tsx` `Intl.DisplayNames`).
- **Otherwise** every one of those uses `formatLocale || locale`. (An English store that picks
  `en-GB` explicitly accepts `US$` for dollars — the reason the legacy profile exists.)
- Machine formatters that parse parts are **never** localised: `lib/cutoffs.ts`'s `'en-US'`
  parts parser and the `templates/hooks.ts` clock/time-zone helpers.

`lib/format.ts` keeps every exported signature; formatters read a module-level profile that
`TextProvider` sets synchronously during render (idempotent), with formatter caches keyed by
locale. `LoyaltyPage`'s `toLocaleString()` calls become a new `formatInteger(n)` in `lib/format.ts`.
`CountrySelect`'s module-scope `DisplayNames` becomes a per-locale memoised `regionName(code)`.

The language picker offers left-to-right languages only (RTL layouts are a non-goal); `dir` is
never set.

### 6.6 Guard and integrity tests

- **`web/test/text-guard.test.ts`** parses every `web/src/**/*.{ts,tsx}` except
  `builder/editor/**`, `text/keys/**` and tests, with the TypeScript compiler API, and fails on:
  (a) JSX text containing a letter (`/\p{L}/u`); (b) a string literal or substitution-free
  template (directly, in `{…}`, or as a conditional branch) in the attributes `aria-label`,
  `aria-description`, `aria-roledescription`, `aria-valuetext`, `placeholder`, `title`, `alt`,
  `label`; (c) a letter-bearing literal as a JSX child expression or conditional branch;
  (d) a letter-bearing literal passed to `setErrors`, `setError`, `notifications.show`, zod
  `message`/min/max/refine messages, or as the value of an object property named `message`,
  `title`, `label`, `description`, `placeholder`, `hint` or `ariaLabel`. Exceptions live in
  `web/test/text-guard.allow.ts` as `{ file, text, reason }`; a stale entry also fails. The
  allowlist lands empty apart from reviewed exceptions (e.g. literal brand-neutral symbols with
  letters, CSS class-like strings caught by rule d).
- **`web/test/text-registry.test.ts`**: keys unique and well-formed; every default passes
  `checkValue`; `max ≥` default length; every non-fixed key is referenced as a literal somewhere
  under `web/src` outside `text/keys/` (no orphans — which is why module-scope maps hold literal
  keys via `textKey()`); every non-fixed key is covered by some block's `text` patterns or the
  site-wide group (§7.3).
- Type tests (`expectTypeOf`) for `ParamArgs`, `t`/`tp` misuse.

## 7. Editor (`/__builder`)

### 7.1 Protocol (additive; `protocol` stays `1`)

| Message | Change |
|---|---|
| `sf-builder-load` | `+ siteText?: SiteText \| null`. **Absent** = the admin cannot save shared text (older admin, or its text GET failed): the Text panel edits this layout's overrides only and shows shared values read-only with a note. `null` = none stored yet. The load's `pageSet` may carry `text`. |
| `sf-builder-change` | `pageSet` carries `text` (overrides). `+ siteText?: SiteText` (present iff the load carried the key; always the full doc). `+ textIssues: TextIssue[]` (`{ scope: 'shared' \| 'layout', key, rule, message }`, ≤ 500; only rules that block publishing — not `unknown-key`). |

The storefront's `protocol.ts` `pageSetSchema` (a strict `z.object` today) and `toPageSet` must
carry `text` — otherwise overrides would be stripped on every load; a test pins this. The
admin's mirror (`looseObject`) already keeps it but gains explicit shapes. The load-identity
rules (`loadId`, one change right after load, none when read-only) cover `siteText` unchanged.

### 7.2 Text panel

A **Text** button in `EditorHeader` opens a panel that takes the left sidebar's place (Blocks and
Outline return when it closes); below `WIDE_FRAME_PX` it overlays the canvas. The canvas stays
live: every keystroke re-resolves text through the editor's `PageSetOverrideProvider`
`text` prop, with no debounce (only posting is debounced, 500 ms as today). Exact previews and
fixture mode show the edited text too.

- **Language** (top): *Store language* (a curated list of ~40 LTR languages, native names via
  `Intl.DisplayNames`, default English) and *Numbers and dates* (*Built-in for {language}*, the
  language's common regional variants, or a typed BCP 47 tag validated with
  `Intl.getCanonicalLocales`). Changing either edits the shared draft. A counter reads
  "312 of 540 lines set in Deutsch — the rest show the built-in English".
- **Search** over key, label, note, default and current values; **filters** All / Edited /
  This layout / Issues.
- **Groups** per area (collapsible, with edited counts); `templates.*` shows only the active
  template's keys.
- **Row**: label and note; the built-in default (muted); the effective value and which layer it
  comes from (Default / Shared / {Layout}); a scope switch **All layouts** / **Only {Layout}**;
  the input (textarea when the default is over 60 chars); placeholder chips (click inserts
  `{name}`); a count against `max`; **Reset** (clears the chosen scope's value — clearing the box
  does the same). Plural keys show one input per category of
  `Intl.PluralRules(locale).resolvedOptions().pluralCategories` (`other` last) with a live
  example ("1 item" / "5 items").
- **Issues** show inline on the row and in the header's issue list (their own section,
  "Text"), and block Publish like guard issues. `unknown-key` values show in an **Unused**
  group with a delete action and do not block.

### 7.3 "Text in this block"

`BlockDef` gains `text?: readonly TextKeyPattern[]` — exact keys or `area.part.*` prefixes
(`CheckoutFlow` → `checkout.*`; `Header` → `shell.header.*`, `catalog.search.*`; `CartSummary` →
`cart.summary.*`). When a block is selected, the right sidebar (Puck `overrides.fields`
wrapper) renders its fields and then a **Text in this block** section with the same rows,
compact; blocks with more than 20 keys show search and **Open in Text panel**. Keys of system
mounts (cart drawer, login modal, phone cart bar safety net, Telegram chrome, not-found page,
error fallbacks) form the **Site-wide** group in the Text panel. There is no click-on-canvas
text editing in this stage.

### 7.4 Editor state

`editor/store.ts` holds `siteText` (the shared draft) and `pageText` (this layout's overrides);
`toPageSet` writes `text` (omitted when empty); undo/redo covers text edits through the same
history as block edits. Text states that only appear on error or empty paths are edited
"blind" — the note tells the owner where the line appears.

## 8. Admin (`ecommerce-admin-frontend`)

In `src/features/storefront-settings/pages/`:

- **API** `src/api/storefront-text.ts` (draft get/put/delete, versions, version, restore;
  `isSiteTextConflict`, `isTextVersionGone`); types in `src/types/storefront-pages.ts`;
  `publishPageSet(layout, baseVersion, textBaseVersion?)` and
  `restorePageSetVersion(layout, version, { withText })`.
- **Load** (`use-pages-editor.ts`): `GET …/draft` for the layout and `GET /storefront-text/draft`
  in parallel; the load carries `siteText`. A failed text GET shows a toast and loads without
  `siteText` (page editing unaffected).
- **Autosave**: a second `createAutosaver` for Site text with its own baseline, generation and
  1 s debounce → `PUT /storefront-text/draft`. `SITETEXT_CONFLICT` shows "Someone published
  site text since you opened this — reload", stops the text autosaver and disables Publish; page
  autosave continues. Changes whose `loadId` is stale are dropped for both.
- **Publish dialog** (`PublishDialog.tsx`, `diff.ts`): the diff gains a **Site text** group —
  shared keys added / changed / reset, language and format changes, this layout's overrides
  added / changed / removed — with an expandable before → after list by key id. When the shared
  diff is non-empty, a warning callout: **"Shared text changes go live on all 3 layouts."**
  Publish is enabled when either diff is non-empty and there are no page or text issues; it
  flushes both autosavers, reads both drafts back (as the page draft is today) and sends
  `text.baseVersion` whenever a text session exists.
- **Versions drawer**: tabs **Pages** (each row shows "Text v{n}" when pinned) and **Site
  text** (version, when, who; *Preview* = the current layout's published pages with that text,
  read-only; *Restore* with "Restores the shared text on all 3 layouts; page layouts are not
  changed"). Restoring a page version offers **"Also restore the site text from then (v{n}) —
  changes all 3 layouts"**, disabled with the reason when the pin is gone or already current.
- **Discard draft** gains "Also discard unpublished site text changes (all layouts)", unchecked
  by default, shown only when a text draft differs from the published text.
- Socket `storefront-text:published` invalidates the text versions query.
- `RoleGate allow={['admin']}` as today.

## 9. Parity

- No published text ⇒ resolver returns built-in defaults ⇒ the DOM is the literal it was.
  Serialised DOM is compared (`body.innerHTML`), so merging `{count}` and its word into one text
  node is invisible.
- Every default must be the **rendered** string: JSX collapses a line break plus indentation to
  one space and keeps `{' '}`; defaults copy the characters as rendered (typographic quotes,
  `—`, ` `), never retyped.
- `<html lang>` stays `en`; the legacy format profile keeps every formatter's locale.
- `e2e/dom-parity.spec.ts` passes with **no snapshot regenerated** (overview rule 1), and the
  mocks' pages route keeps serving `null` by default.

## 10. Testing

**Storefront (Vitest):** `defineTextArea` inference and placeholder parsing; `checkValue` for
every rule in §6.3; resolver layer order and per-key fallback; plural selection for `en`
(`0, 1, 2, 1.5`) and a many-category locale (`pl`) with `other` fallback; `tn` with element
params; `ParamArgs` type tests; `formatProfileFor` legacy profile produces exactly today's
outputs for a fixed set of amounts/dates/regions, and a non-English profile switches all of
them while `cutoffs.ts` stays `en-US`; `TextProvider` sets `lang` only when different;
`fetchPublished` parses the v0.7.0 shape, the new shape, text-only, and a malformed `text`;
the editor protocol keeps `pageSet.text`, parses `siteText` present/absent/null, and change
messages carry `siteText` and `textIssues`; Text panel row validation and scope writes; the
guard and registry tests (§6.6).

**Storefront (Playwright, mocked):** `e2e/mocks.ts` gains a `text` option for the pages route.
New `e2e/text.spec.ts`: a shared edit shows on all three layouts; a layout override shows on
one only; an override with an unknown placeholder falls back to the shared value; cart plural
at 1 and 2 items; checkout validation message edited; `de` + `de-DE` sets `<html lang="de">` and
German money/date output; 503 and an old-shape response render defaults.
`builder-editor.spec.ts` gains: open Text panel → edit a shared key → canvas updates → change
message carries `siteText`; edit a layout override; an unknown placeholder blocks with an issue.
The whole existing suite, `dom-parity.spec.ts` and the templates matrix pass unchanged.

**Backend:** §4.7. **Admin:** `npm run build`; lint against the pre-branch baseline; mocked
Playwright (page.route mocks + seeded JWT): both drafts load, a text edit PUTs the text draft,
the publish dialog shows the Site text group and the all-layouts warning, the publish body
carries `text.baseVersion`, the `SITETEXT_CONFLICT` banner, both version tabs, restore with and
without text.

No test touches a live database, bucket, bot or deployed storefront; live verification after
deploy is a named pending step.

## 11. Migration and deploy

1. **Backend first** — migration (new table + nullable column, no backfill), new module,
   additive public shape, additive publish/restore bodies. Old storefronts keep working (§4.6);
   the old admin publishes layouts without `text` exactly as before.
2. **Storefront** (released with the branch as v0.8.0; clients redeployed from the admin). With
   the old admin, the editor gets no `siteText` and offers layout overrides only.
3. **Admin SPA.**

Never reversed: an old backend would silently strip `PageSet.text` on save (its page-set root is
a non-strict `z.object`).

## 12. Non-goals

A shopper-facing language switcher or more than one active language; RTL layouts; machine
translation; translating backend-sent messages, bot texts or emails; data names; HTML or markdown
in strings; ICU syntax, select/gender forms; per-route (per-page) overrides — overrides are per
layout; click-on-canvas text editing; simulating error or empty states in the editor; the admin
and editor's own UI text; editing the kill-switch and boot screens.

## 13. Review focus — likely failure modes

1. **Parity drift from retyped defaults** — an ASCII apostrophe for `’`, a lost ` `, or JSX
   whitespace copied as source rather than as rendered. Only `dom-parity.spec.ts` catches most of
   these; nobody may regenerate a snapshot to "fix" one.
2. **Overrides stripped in transit** — the storefront `protocol.ts` `pageSetSchema`/`toPageSet`,
   the admin mirror, `diff.ts`, and the backend `pageSetSchema` must all carry `text`; one
   missing link silently drops every override on the next autosave.
3. **Lock order** — any new transaction that takes the layout lock before the text lock can
   deadlock against a publish. All both-lock paths go through one helper that takes them in
   order.
4. **Partial publish** — a text 409 after the layout insert must roll back the insert; the
   events must fire only after commit and only for what was inserted.
5. **Someone else's shared draft** — there is one shared draft per store, so publishing layout A
   publishes shared edits another admin made from layout B. The dialog's Site text diff is the
   only safeguard; it must list every shared change, not just this session's.
6. **Format profile leaks** — the module-level profile must be set before any child formats; a
   non-legacy profile must not reach `cutoffs.ts` or the template clock parsers, which would break
   cutoff and countdown maths.
7. **Plural parity** — `tp` must insert `String(count)`, not a grouped number, or "1000 items"
   becomes "1,000 items"; `Intl.PluralRules('en')` must match `=== 1` for every value used.
8. **Keys in module-scope data** — status maps and zod messages must hold keys, not resolved
   strings, or they freeze at import time in the default language and ignore edits.
9. **`msg()` ambiguity** — a backend message that happens to equal a key would be translated;
   keys contain no spaces and backend messages do, but the guard must keep keys out of anything
   the backend sends.
10. **Editor/admin version skew** — a new storefront under an old admin must not offer shared
    editing it cannot save; the absence of `siteText` in the load is the only signal.
11. **Pin rot** — text history keeps 20 versions for three layouts, so page versions' pins go
    stale; restore-with-text must fail cleanly (`TEXT_VERSION_GONE`) and the UI must disable the
    option rather than half-restore.
12. **Guard false negatives** — strings built in helpers (`lib/`, `api/`) and conditional
    branches are the likeliest to slip past; the orphan check and a manual sweep of `features/`
    after migration back the guard up.
