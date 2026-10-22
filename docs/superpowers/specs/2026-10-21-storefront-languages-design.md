# Storefront languages — FR / IT / ES built-in packs and a shopper switcher

Date: 2026-10-21. Repos: `ecommerce-storefront` (most of it), `ecommerce-backend` (public read + schema),
`ecommerce-admin-frontend` (publish diff). Builds on the editable-text spec (2026-09-30), whose §12
listed "a shopper-facing language switcher or more than one active language" as a non-goal — this spec
lifts that non-goal and nothing else.

## 1. Decisions (made with the user — binding)

| Question | Decision |
|---|---|
| Meaning of "localisations" | **Built-in translation packs** for `fr`, `it`, `es` covering every registry key, **plus** a shopper language switcher (more than one active language per store). |
| Form of address | FR **vous**, IT **tu**, ES **tú**. Shared nouns follow `ecommerce-admin-frontend/docs/i18n-glossary.md` (cart, order, coupon, refund, tracking number, store credit, loyalty points…), in shopper register. |
| Switcher placement | **Both**: a system mount in the phone header menu panel (every header carries it, no owner action), **and** an optional placeable `HeaderLanguage` header part for desktop/any header. |
| Switching behaviour | Save the choice, **reload the page**. No live swap. |

## 2. Resolution order

Per key, the first valid candidate wins:

`layout override (locale) → shared (locale) → built-in pack (locale's language) → built-in English`

- A pack is chosen by the locale's primary language subtag: `fr`, `fr-CA`, `fr-BE` → `fr` pack.
- English never goes through the pack machinery. With no published text the DOM is byte-identical to
  today (editable-text §9 parity still holds).
- Plural form selection: a value from a stored layer **or a pack** uses the store locale's plural rules;
  only the English fallback uses `en` rules. `Resolved.builtIn(key)` becomes
  `Resolved.rulesLocale(key)`.
- Packs **skip `fixed` keys** (`closed.*`, `boot.*`): they render before the published read, so the
  store language is unknown there, and `checkValue` rejects any candidate for a fixed key.

## 3. Packs (`web/src/text/packs/`)

- `packs/{fr,it,es}/<area>.ts` — one file per non-fixed registry area, default export typed against
  that area's English entries (`AreaPack<typeof cart>`: every key required, a string for a string key,
  `PluralForms` for a plural key), so a missing, unknown or mistyped key fails `tsc`. `packs/{fr,it,es}/index.ts` spreads the areas into one frozen `Pack`.
- `packs/index.ts`: `PACK_LANGUAGES = ['fr', 'it', 'es']`, `packLanguage(locale): string | null`,
  `loadPack(locale): Promise<void>` (dynamic `import()` — one lazy chunk per language, never in the
  English bundle), `packFor(locale): Pack | undefined` (sync, module registry), `preloadPacks()`.
- The shopper app loads the pack **inside `pageSetQueryFn`**, after the read and before resolving
  the query, so the first `TextLayerProvider` render already has it (the resolver and `createTextApi`
  memoise on layers identity — a pack arriving later would leave a stale English resolution). A failed
  chunk load falls back to English silently.
- The resolver's memo key includes whether the pack was present, so a resolution made before a load
  is never reused after it.
- `text-guard.test.ts` excludes `text/packs/**` (as it does `text/keys/**`).
- **Gate** (`web/test/text-packs.test.ts`): every pack covers every non-fixed registry key; no unknown or fixed keys;
  every value passes `checkValue` (type match, no unknown placeholder, no stray brace, within `max`);
  every placeholder of the English default appears in the translation — for a plural value, in the
  union of its forms ("Un article" is fine for `one`) — dropping one is legal for an owner, not for a
  built-in; plural values have `one` and `other`. A translation over `max` is fixed
  by raising the key's `max` (≤ 1000), never by truncating.

## 4. Data model and backend

`TextLanguage` gains an optional list of extra languages shoppers may switch to:

```ts
interface TextLanguage { locale: Locale; formatLocale: '' | Locale; offered?: Locale[] }
```

- `locale` stays the **default** language (what a shopper with no matching preference sees, and the
  language of backend-sent messages as today).
- `offered`: canonical tags, unique, never containing `locale`, at most `TEXT_LIMITS.locales - 1`.
  Absent ≡ `[]`. The editor omits it when empty, so existing documents round-trip byte-identically and
  a no-op publish stays a no-op.
- `formatLocale` applies to the default language only; offered languages use built-in formatting.

**Public read** `GET /api/v1/public/storefront/pages/:layout?locale=<tags>`:

- `locale` is optional: up to 5 comma-separated tags in preference order; invalid tags are ignored.
- The served language: for each requested tag in order, an exact match in
  `languages = [locale, ...offered]`, else the first language with the same primary subtag; if no tag
  matches, the default.
- `text` gains `languages: Locale[]` (default first). `text.locale` is the served language;
  `formatLocale` is the document's value when serving the default, else `''`. Both layers are for the
  served language. With no published Site text, behaviour is unchanged (`languages: ['en']` when text
  is non-null because of layout overrides).
- Compatible both ways: an old storefront ignores `languages`; a new storefront on an old backend gets
  no `languages` (treated as `[locale]`) and its `?locale` is ignored. The strict `siteTextSchema`
  means a new editor posting `offered` to an old backend is a 400: **deploy the backend first.**
- `src/docs/registry.ts` documents the param and field.

## 5. Shopper preference (`web/src/text/preference.ts`)

- Order: `?lang=` query param (also stored) → `localStorage['sf.lang']` → `navigator.languages`.
  Sent as the read's `locale` param (stored/URL choice first, then up to 3 browser tags).
- Never sent in the builder canvas or previews (they show the editor's text).
- `?lang=` is stored, so a shared link with `?lang=` switches that shopper until they pick again
  (accepted).
- `chooseLanguage(locale)`: store it (try/catch; on failure set `?lang=` on the URL instead) and
  `location.reload()`.
- `TextLayers` / `TextApi` gain `languages: readonly Locale[]` (default `[locale]`).

## 6. Switcher UI

- Native names via `Intl.DisplayNames([tag])` (data, like the editor's `nativeName`), capitalised.
- **Phone menu** (`layouts/HeaderMenu.tsx`): when `languages.length > 1`, a "Language" group at the
  end of the panel listing each language; the current one marked `aria-current`.
- **`HeaderLanguage` part** (header family, `layouts: 'all'`, unique, not in any default slot): a
  compact button showing the current language code (`FR`) opening a Mantine `Menu` of native names.
  Hidden for shoppers when only one language is served; in the builder canvas it renders with the
  editor's languages so the owner can see and place it.
- New keys (area `shell`): `shell.language.label` ("Language"), `shell.language.change`
  ("Change language — {language}"). Listed in the block's `text` and in `SITE_WIDE_TEXT`.

## 7. Editor (`/__builder`)

- **Language section**: "Store language" (default) unchanged; new **Shopper languages** checklist
  (from `LANGUAGES`, minus the default; languages with a built-in pack say "Built-in translation").
  Offering a language never deletes wording; un-offering keeps it (the existing clear-language action
  deletes it).
- **Editing language** select at the top of the Text panel (`[locale, ...offered]`, default = the
  store language), held in the Text UI store. Rows, counters, plural inputs (`pluralFormsFor`), room
  checks and the canvas preview all use the editing language; the canvas renders that language
  (`formatLocale` only when it is the default).
- A row's "Built-in:" shows the pack value for the editing language when one exists.
- Counter: "… — the rest show the built-in Français" for pack languages, "built-in English" otherwise.
- The editor calls `preloadPacks()` before text becomes ready (editor bundle size is not a concern).
- When the editor seeds its language from the public read (`text/hooks.ts`), `offered` is
  `languages.slice(1)` of that read (the read itself is made without a `locale` param, so it serves the
  default).

Product consequence (accepted with "Both"): desktop shoppers see a switcher only where the owner places
`HeaderLanguage`; phone shoppers only while the header menu core option is on. Browser-language
selection works everywhere.

## 8. Admin

Publish diff (`storefront-settings/pages/diff.ts`): a "Shopper languages" language change when
`offered` differs; `types/storefront-pages.ts` gains `offered?`. Copy stays literal English (no locale
keys).

## 9. Non-goals

Translating backend-sent messages, bot texts, emails or data names (products, categories, payment and
shipping methods); locale-prefixed URLs, `hreflang`, SEO per language; per-language `formatLocale`;
RTL; machine translation at runtime; recording the shopper's language on orders.
