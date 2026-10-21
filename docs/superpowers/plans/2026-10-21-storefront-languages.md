# Storefront languages — implementation plan

Spec: `docs/superpowers/specs/2026-10-21-storefront-languages-design.md` (read it first; it is binding).
Branch `feature/storefront-languages` exists in `ecommerce-storefront`, `ecommerce-backend`,
`ecommerce-admin-frontend`. Commit after each task in the repo(s) it touches, Conventional Commits
(`feat(text): …`), ending with the `Co-Authored-By` line the controller gives you. Never push.

**Order:** 1 → 2 → 4 → 3 (fan-out) ‖ 5 → 6 → 7. Task 4 adds the only new shopper keys, so the key set
is frozen before translation. Fixed keys (`closed.*`, `boot.*`) get no pack entries.

Baseline on `main`: storefront web `vitest run` = 2 failing files before any change (see controller
notes); a failure outside those is yours.

Conventions: storefront `web/` uses `@/…` imports with `.ts`/`.tsx` extensions, vitest (`npx vitest run
<file>` from `web/`), `npx tsc -b --noEmit` from `web/`. Backend: extensionless imports, 4-file module
structure, vitest. Admin: no test runner; `npm run build` + `npm run lint` (lint already fails on main —
the error count must not rise).

## Task 1 — Backend: `offered` + language-aware public read (`ecommerce-backend`)

1. `src/modules/storefront-text/schemas.ts`: `textLanguageSchema` gains `offered: z.array(localeSchema).optional()`
   with a refine: unique, no entry equal to `locale`, length ≤ `TEXT_LIMITS.locales - 1`. Update the
   `TextLanguage` interface and `src/db/schema/storefront-text.ts`'s stored type (`offered?: string[]`).
2. `src/modules/storefront-pages/service.ts` `getPublishedPageSet(layout, requested: string[] = [])`:
   `languages = [locale, ...(offered ?? [])]`; served = per requested tag: exact match, else first
   language with equal primary subtag (`tag.split('-')[0]`); else default. Layers for the served
   language; `formatLocale` only when served === default, else `''`; add `languages` to the `text` object
   and its type (`PublishedPages`).
3. Controller: parse `req.query.locale` — string, split on `,`, trim, keep ≤ 5 tags that pass
   `isCanonicalLocale` after `Intl.getCanonicalLocales` (wrap in try/catch); anything else → `[]`.
4. Tests: schema (offered valid / duplicate / contains default / too many / non-canonical; absent OK),
   service (exact, primary-subtag, preference order, unknown → default, formatLocale blanked, languages
   listed, no Site text unchanged), router/controller (garbage param ignored, not a 400).
5. `src/docs/registry.ts`: `siteTextBody.language.offered`, the `locale` query param and `text.languages`.
   Update root/backend docs that describe the public pages read if they list its fields.
6. `npm test` (or the repo's vitest script) for the touched modules + `npm run build`. Commit.

## Task 2 — Storefront text core (`ecommerce-storefront/web`)

1. `text/types.ts`: `TextLanguage.offered?: Locale[]`; `TextLayers` gains `languages?: readonly Locale[]`.
2. `api/pages.ts`: `toPublished` keeps `languages` (validated: array of `isLocale`, else `[locale]`);
   `fetchPublished(layout, prefer?: string[])` adds `?locale=` (comma-joined, URL-encoded) when non-empty.
3. `text/packs/index.ts` per spec §3 (`PACK_LANGUAGES`, `packLanguage`, `loadPack`, `packFor`,
   `preloadPacks`, type `Pack = Readonly<Partial<Record<TextKey, TextValue>>>`, `PackArea` likewise).
   Type `AreaPack<A>` = for area `A` (a `TextArea`), `{ [K in keyof A['entries']]: A['entries'][K]['en'] extends string ? string : PluralForms }`
   keyed by the full key. Generate a stub `text/packs/{fr,it,es}/<area>.ts` for every **non-fixed**
   area, each exporting the English values as a placeholder `satisfies AreaPack<typeof area>` with a
   `// TODO(translate)` header line, and wire `index.ts` to spread them. (English placeholders keep
   `tsc` green; the gate's `TODO(translate)` check — see 9 — keeps them from shipping.)
4. `text/resolve.ts`: chain layout → shared → `packFor(locale)?.[key]` (only used when it passes
   `checkValue`) → `entry.en`. Replace `builtIn(key)` with `rulesLocale(key): Locale` ('en' only for the
   English fallback). Memo per layers+locale+pack-presence. Update `snapshot.ts` `pick` accordingly.
   `TextApi` gains `languages: readonly Locale[]` (from layers, default `[layers.locale]`).
5. `builder/published.ts` `pageSetQueryFn` (the only shopper caller; `App.tsx` prefetch uses it;
   the editor's `text/hooks.ts` read stays locale-less): pass `preferredLocales()` (Task 2.6) unless builder/preview
   mode; after the read, `await loadPack(next.text.locale)` when `next.text` (catch → ignore).
6. `text/preference.ts` per spec §5: `preferredLocales(): string[]` (`?lang=` → storage `sf.lang` →
   `navigator.languages`, canonicalised via `Intl.getCanonicalLocales` in try/catch, deduped, ≤ 5) and
   `chooseLanguage(locale)`. All storage access in try/catch. `?lang=` read also writes storage.
7. New English keys in `text/keys/shell.ts`: `'language.label': { en: 'Language', max: 40 }`,
   `'language.change': { en: 'Change language — {language}', max: 80 }`; notes in `text/notes/shell.ts`;
   add `'shell.language.*'` to `SITE_WIDE_TEXT`. (The registry orphan test needs a literal reference —
   Task 4 adds it; if the test fails before Task 4, add the references there, not a stub.)
8. `test/text-guard.test.ts`: exclude `text/packs/**` like `text/keys/**`.
9. `test/text-packs.test.ts` per spec §3 gate, iterating `PACK_LANGUAGES` and importing each pack
   statically: coverage of non-fixed keys, validity, placeholder union, plural `one`+`other`. Plus a
   "translated" check — no file still carries `TODO(translate)` — as `it.skip` with a `// Task 3`
   comment; Task 3 unskips it.
10. Tests: resolve chain incl. pack, rulesLocale (fr pack plural "0 article" uses fr rules → `one`),
    preference parsing, toPublished languages, pageSetQueryFn loads the pack before resolving (mock).
    Update existing tests that used `builtIn`. Full `npx vitest run` + `npx tsc -b --noEmit`. Commit.

## Task 3 — Translations (fan-out, `web/src/text/packs/{fr,it,es}/<area>.ts`)

One worker per (language × area-half). Each gets: the English area files, the spec's tone rules, the
glossary path, and the output file pattern. Rules: keep every `{placeholder}` exactly; plural keys get
`one` + `other` (add `many` only if natural); keep brand-neutral symbols, `/ea`-style abbreviations get a
natural local equivalent; never change English; if a translation exceeds `max`, report the key — the
controller raises `max` in the registry. Template slot copy (`templates.*`) is marketing copy:
translate idiomatically, same length class. Validate with `npx vitest run test/text-packs.test.ts`.
Afterwards the controller wires areas into each `index.ts`, unskips completeness, fixes `max`, commits.

## Task 4 — Switcher UI (`web/`)

1. `components/LanguageList` (or in `layouts/`): native-name helper (`Intl.DisplayNames`, capitalised
   in its own locale), list of `useText().languages`, current marked, click → `chooseLanguage`.
2. `layouts/HeaderMenu.tsx`: group at the end of the panel when `languages.length > 1`
   (heading `t('shell.language.label')`).
3. `builder/blocks/HeaderLanguage.tsx` + `builder/editor/fields/HeaderLanguage.ts` + view in
   `layouts/header-parts.tsx` `HEADER_VIEWS` + `unique` list in `_shared/header-container.ts`
   (not in default slots). Mantine `Menu`; button label = upper-case primary subtag, `aria-label`
   `t('shell.language.change', { language: nativeName })`. Hidden when one language, except in builder
   mode. `text: ['shell.language.*']`. Follow existing part conventions (style support, VIS).
4. Run the block-registry/manifest/text-registry/guard tests; update snapshot-like fixtures that list
   blocks (e.g. blocks.json expectations) as the tests demand. Commit.

## Task 5 — Editor (`web/src/builder/editor/`)

Per spec §7: `offered` in the store's `setLanguage` (validation as backend), `postableSiteText` keeps
`offered` only when non-empty, Shopper-languages checklist in `LanguageSection`, editing-language select
in `TextPanel` (UI store `editLocale`, reset when it leaves `[locale, ...offered]`), every
`textLanguage(s).locale` use that means "language being edited" switched to the editing language,
`EditorText.languages`, catalog "Built-in" per editing language, counters, `preloadPacks()` before text
ready. `text/hooks.ts:54` seeds `language` from the public read — set `offered: languages.slice(1)`
there. Tests for each. Commit.

## Task 6 — Admin (`ecommerce-admin-frontend`)

Spec §8. `npm run build`, lint count not higher. Commit.

## Task 7 — Docs and verification

`docs/builder.md` (text section: packs, languages, preference), editable-text spec §6.1 line "the only
built-in language" → pointer to this spec; repo `CLAUDE.md` workspace note if it describes text.
Full: storefront `npm run typecheck`, `npm test`; backend tests + build; admin build. Update
`e2e/mocks.ts` pages response with `languages`; run `e2e/text.spec.ts` and
`e2e/builder-editor.spec.ts` (Task 5 adds a select at the top of the Text panel). Browser check of the
storefront with mocked API in fr and with the switcher. Code review.
