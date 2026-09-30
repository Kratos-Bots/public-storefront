# Editable text — Plan 2: storefront text runtime and extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every shopper-visible string in `ecommerce-storefront/web` goes through a typed, hand-written text registry whose English defaults are byte-identical to today's literals; published Site text and per-layout overrides arriving in the existing `storefront/pages/:layout` response replace them per key, and the store language drives `<html lang>` and every shopper formatter.

**Architecture:** A small shopper-side runtime under `web/src/text/` (types, `defineTextArea`, one registry file per area, a per-key validating resolver, plural rules, a format profile, `TextProvider`/`useText`/`textSnapshot`). The page-set query now holds `{ pageSet, text }` from one request; the provider listens to it without ever starting it. Extraction is split into nine parallel per-area tasks with disjoint files; a TypeScript-AST guard (per area while extracting, global at the end) plus a frozen inventory of v0.7.0 literals prove nothing was missed or retyped, and the unchanged DOM parity snapshots prove the rendered bytes.

**Tech Stack:** React 19, @tanstack/react-query 5, zod 4, Mantine 9, Vite 7, Vitest 4 (jsdom), the `typescript` compiler API (already a dev dependency) for the guard, Playwright (mocked).

**Spec:** `docs/superpowers/specs/2026-09-30-editable-text-design.md` (§5, §6, §9 and the storefront parts of §10 are this plan) and `docs/superpowers/specs/2026-09-30-puck-editable-overview.md` (cross-stage rules). Builds on `docs/builder.md`.

## Global Constraints

- House rules: `.superpowers/sdd/house-rules.md` (worktree only, commit by explicit pathspec, trailer lines, no live systems, TDD, no subagents). Commit with `git commit -m "<msg>" -- <paths>`; every message ends with the two trailer lines from the house rules.
- Imports use `@/…` **with** `.ts`/`.tsx` extensions. `verbatimModuleSyntax`: type-only imports use `import type`. `erasableSyntaxOnly`: no `enum`, no parameter properties.
- `@puckeditor/core` is never value-imported outside `web/src/builder/editor/**`. This plan creates or edits nothing under `web/src/builder/editor/**` (the editor plan owns it).
- **Byte-identical defaults (overview rule 1, spec Guarantee 1).** With no published text, the DOM is identical to v0.7.0. `e2e/dom-parity.spec.ts` must pass **with no snapshot regenerated**. Every other existing Vitest and Playwright test passes **unedited** — the only permitted test edits are the ones this plan names (Task 3's `vi.mock` factories, Task 13's one NavLinks assertion), each justified in its commit message.
- **Defaults are the rendered string** (spec §9): HTML entities decoded (`&rsquo;` → `’`, `&gt;` → `>`), JSX whitespace collapsed exactly as React does (a line break plus indentation between words becomes one space; leading/trailing whitespace-only lines vanish), `{' '}` kept, typographic characters (`’ — – … ← ·` and U+00A0) copied, never retyped. Copy values from `web/test/helpers/text-inventory.json` (Task 4), which already holds the rendered form.
- **Text is never markup** (spec Guarantee 3): resolved strings reach the DOM only as React text children or attribute values — never `dangerouslySetInnerHTML`, `href`, `src`, `style`.
- **No extra shopper request** (Guarantee 4): text rides in the existing `GET storefront/pages/:layout` response; `PAGES_QUERY` is unchanged (read once per page load).
- Key shape: 2–6 dot-separated segments, first segment lower-case letters (the area), later segments start with a letter or digit and use `[A-Za-z0-9-]` (camelCase; `-` only inside template ids), total ≤ 100 chars. `KEY_RE = /^[a-z]+(?:\.[A-Za-z0-9][A-Za-z0-9-]*){1,5}$/`.
- Entry fields: `en` (the default), `note?`, `label?`, `max?` (default `200`, never above `1000`), `fixed?`. Placeholders match `\{[A-Za-z][A-Za-z0-9]{0,31}\}`; no other `{` / `}` in a default; ≤ 10 distinct placeholder names per key.
- Areas (spec §6.1), exactly these 19, one file each under `web/src/text/keys/`: `common`, `shell`, `catalog`, `product`, `cart`, `checkout`, `auth`, `account`, `order`, `payment`, `tracking`, `verify`, `wholesale`, `webapp`, `notices`, `errors`, `templates`, `closed`, `boot`. `closed.*` and `boot.*` keys are all `fixed: true`; no other key is.
- Formatting: locale `en` with `formatLocale: ''` keeps the legacy per-call-site locales exactly (money `'en'`, `formatDate` `'en-GB'`, `formatDateTime` viewer locale, integers viewer locale, tracking stamps `'en-GB'`, verify dates `'en-GB'`, country names `['en']`); any other language uses `formatLocale || locale` for all of them. `lib/cutoffs.ts` (`'en-US'` parts parser) and the `templates/hooks.ts` clock/offset helpers are never localised. `index.html` keeps `lang="en"`; `dir` is never set.
- Out of scope (spec §1, §12): messages the backend sends and the storefront shows verbatim; data names (product, category, payment-method, shipping-method names); owner content (brand name, closed message, notices, support-link labels, block props such as `Button` "Shop now"); the editor's and admin's own UI text.
- Public repo: fixtures and examples use "Northbound Supply" / `shop.example` only; no local paths or usernames in committed files.
- UI rule (house rule 4): a task that changes components loads `frontend-design:frontend-design` before editing. Extraction changes no visuals — the skill load is still required by the house rules, and its guidance is "change nothing visible".
- Playwright: only **Task 16** runs `npm run test:e2e` (port 5199). Every other task runs Vitest and typecheck only.
- Commands (from the storefront repo root): `npm --prefix web test -- <file…>`, `npm --prefix web test`, `npm --prefix web run typecheck` (also type-checks `web/test/**`), `npm --prefix web run build` (includes the builder-isolation check). Never `npm run install:web`.
- If a sibling task's file breaks the typecheck or a test you did not touch: wait a minute and re-run; never edit it (house rule 12).

## Extraction playbook (binding for Tasks 6–14)

Each extraction task owns a disjoint set of source files and one or more `web/src/text/keys/<area>.ts` files. It never edits another task's files, `web/test/text-guard.allow.ts`, `registry.ts`, or any `keys/*.ts` it does not own. Reading other areas' keys (including the seeds Task 4 wrote) is fine.

1. **Key names.** `<area>.<part>.<name>`: `part` is the component or screen (`cart.drawer.title`, `checkout.errors.paymentMissing`, `order.hero.pendingDetail`). camelCase segments. Every key gets a `note` saying where the line appears in shopper words ("Heading of the slide-out cart"; for error/empty states say when it shows). Buttons and labels that must stay short get `max: 40`–`80`; long help text keeps the default `200` or gets a `max` ≥ its length.
2. **One key per meaning.** Reuse the Task 4 seeds (below) wherever the same wording is used for the same purpose. A cross-area wording that is not seeded is registered in your own area and listed in your task report ("candidate for common") — never add it to `common.ts` yourself (Task 13 owns it).
3. **Copy defaults from the inventory**, never retype: `web/test/helpers/text-inventory.json` has every v0.7.0 literal of your files in rendered form. Template-literal holes appear there as `${}`; they become named placeholders (`Cart, ${}` → `'Cart, {count}'`).
4. **JSX.** `<h2>Your cart</h2>` → `<h2>{t('cart.drawer.title')}</h2>`. Attribute text (`aria-label`, `title`, `placeholder`, `alt`, `label`, `eyebrow`, `description`, …) → `aria-label={t('…')}`. Get `t`/`tp`/`tn`/`msg` from `const { t } = useText();` at the top of the component (never inside a block's `render`, which must not call hooks — call it in the inner view component).
5. **Sentences with values are one key with placeholders.** `` `Remove ${line.displayName}` `` → `t('common.qty.remove', { name: line.displayName })`. JSX text around `{value}` expressions → one key: `We can&rsquo;t ship to {countryName(c) || 'that country'} yet.` → `t('checkout.shipping.unserviceable', { country: countryName(c) || t('checkout.shipping.thatCountry') })`. If the sentence embeds an **element** (a `<Link>`, `<strong>`, a `<Money>` component), use `tn(key, { name: <element/> })` — it returns strings and keyed fragments, so the serialised DOM is unchanged.
6. **Plurals.** Only a ternary on exactly `n === 1` (or `n !== 1` inverted) becomes a plural key, and `{n} {n === 1 ? 'item' : 'items'}` becomes `{ one: '{count} item', other: '{count} items' }` read with `tp(key, n)`. A ternary with no number in the string (`{n === 1 ? 'line' : 'lines'}`) becomes `{ one: 'line', other: 'lines' }` with `tp(key, n)`. Any other condition (`> 1`, `=== 0`, `< 5`) stays two string keys behind the same condition. `tp` inserts `String(count)` — if today's code prints a formatted number (`formatInteger(n)`), keep a string key with a named param (`'{points} points to go'`) instead.
7. **Component state that holds a message** (`setErrors`, `setError`, local `useState<string>` error text): store a key with `textKey('…')` and render the field with `msg(value)`. `msg` passes anything that is not a registered string key through verbatim, so backend messages stored in the same state still show unchanged.
8. **Pure helper modules** (`status.ts`, `default-action.ts`, `schemas.ts`, `errors.ts`, `chat-links.ts`, …) **whose return values existing tests assert in English**: resolve at *call time* through `textSnapshot().t(…)` / `.tp(…)` — never at import time, never a module-level resolved string. Module-scope maps/arrays hold keys (`textKey('…')`) so the registry's orphan check sees each key literal. If an existing test reads a module constant directly (e.g. `ROUTE_STEPS[i] === 'Received'`), keep that export as registry-derived English (`ROUTE_STEP_KEYS.map(defaultText)`) and render from the key twin.
9. **zod messages** resolve at parse time with zod 4's function form: `.min(1, { error: () => textSnapshot().t('checkout.errors.required') })`, `z.number({ error: () => … })`, `.refine(fn, { error: () => …, path })`, and inside `superRefine` call `textSnapshot().t(…)` directly. Existing tests then still read English messages, and a mounted provider's edits apply.
10. **`errorMessage(err, fallback)`**: pass the fallback as `t('<area>.errors.<name>')` (or `textSnapshot().t(…)` outside components). The backend message path (`err.message`) is untouched.
11. **Toasts and mutation callbacks**: capture `t` from `useText()` in the component; call it inside the callback.
12. **`document.title` fragments** built in features become keys with placeholders (`'Order {reference} — {shop}'`).
13. **Not text** (leave as is): class names, `data-*` values, route paths, enum-like state strings (`'checking'`), CSS values, brand/product/category/method names from data, owner content from settings, numbers, punctuation-only strings. Something the guard flags that is genuinely not shopper text goes into your guard file's `allow` list with a one-line `reason`.
14. **Existing tests stay unedited.** Before editing a helper, `grep -rn "<helper name>" web/test` and keep every asserted output. Components rendered in tests without a provider get the English defaults automatically.
15. **Template slot components** (Task 14) import `useText` from `@/templates/contract.ts` (external templates may only import the contract).

**Seeded keys (Task 4) — use these, do not duplicate them:** `common.actions.tryAgain` "Try again", `common.actions.copy` "Copy", `common.actions.copied` "Copied", `common.actions.browseCatalogue` "Browse the catalogue", `common.actions.backToShop` "← Back to shop", `common.actions.close` "Close", `common.actions.signIn` "Sign in", `common.status.loading` "Loading", `common.status.checking` "Checking…", `common.product.preorder` "Pre-order", `common.qty.fewer` "One fewer {name}", `common.qty.more` "One more {name}", `common.qty.remove` "Remove {name}", `common.totals.subtotal` "Subtotal", `common.totals.total` "Total", `common.totals.discount` "Discount", `common.totals.shipping` "Shipping", `common.totals.paymentFee` "Payment fee", `common.totals.storeCredit` "Store credit", `common.nav.yourAccount` "Your account", `common.list.loadFailed` "We couldn't load the products", `common.list.categoryMissing` "That category isn't here", `common.list.noMatches` `Nothing matches "{query}"`, `common.list.clearSearch` "Clear search", `common.list.emptyCategory` "Nothing stocked here yet", `common.contact.whatsapp` "WhatsApp", `common.contact.telegram` "Telegram", `cart.summary.items` {one "{count} item", other "{count} items"}, `checkout.errors.required` "Required", `checkout.errors.paymentMissing` "Choose how you’d like to pay", `catalog.search.placeholder` / `catalog.search.ariaLabel` "Search products", `product.stock.in` "In Stock", `product.stock.low` "Low Stock", `product.stock.out` "Out of Stock", `shell.nav.ariaLabel` "Site".

**Per-task verification (every extraction task):**
- `npm --prefix web test -- test/text-guard-<slug>.test.tsx` — PASS (no unallowed findings, every inventory literal survives in a default, the override tests pass).
- `npm --prefix web test -- <the area's existing tests listed in the task>` — PASS, unedited.
- `npm --prefix web run typecheck` — PASS.
- `npm --prefix web test` — PASS (a failure in a file another running task owns: wait and re-run, house rule 12).

## Review Focus

The five uncovered failure modes most likely to bite a shopper or owner, each pinned by a test in the named task.

1. **A key whose English default was retyped** (ASCII `'` for `’`, a lost `{' '}`, a word boundary eaten when JSX text around an expression was merged) — the page reads subtly different and nobody notices. Pinned by the frozen inventory check in every per-area guard file (Task 4 builds it, Tasks 6–14 run it, Task 15 makes it global) and by the unchanged `dom-parity.spec.ts` run in Task 16.
2. **A published store language whose formatter locale is garbage or valid-but-unsupported** (`formatLocale: 'xx-ZZ'`) — money and dates must still render, falling back to the legacy profile rather than throwing a `RangeError` mid-render. Pinned in Task 2 (`formatProfileFor falls back to the legacy profile for a locale Intl rejects`) and Task 3 (`toPublishedText rejects a non-canonical locale`).
3. **Plural counts outside 0/1/2** (1000 items, 1.5, a Polish `many` count with no `many` form stored) — "1000 items", never "1,000 items"; a missing category uses that value's own `other`. Pinned in Task 1 (`pluralCategory`) and Task 5 (`tp inserts String(count)`, `tp falls back to the same value's other`).
4. **An edited validation message after a zod schema was built before the provider mounted** (module-level `addressSchema`) — the shopper must see the owner's wording, not English frozen at import. Pinned in Task 6 (`addressSchema reports the owner's wording for Required`).
5. **A backend error message that happens to look like a key, or a key-shaped string that is not registered** — shown verbatim, never swallowed or translated. Pinned in Task 5 (`msg passes unregistered and backend strings through`).

## Spec conflicts resolved in this plan (for the controller)

1. **Tests that `vi.mock('@/api/pages.ts')`** (six `builder-*` files) mock only `fetchPageSet`; the runtime must call `fetchPublished` (spec §5). Their mock factories gain a `fetchPublished` derived from their existing mock — no assertion changes (Task 3). `fetchPageSet` stays exported so `builder-fetch-page-set.test.ts` passes unedited.
2. **`builder-neutral-fallbacks.test.tsx` "an invalid NavLinks ariaLabel falls back to none"** contradicts spec §6.4 (`''` is now valid and renders `t('shell.nav.ariaLabel')`). Task 13 updates that one assertion to the spec behaviour.
3. **Spec §6.4 says zod messages and `default-action.ts` return keys**, but `checkout-schemas.test.ts`, `default-action.test.ts`, `order-status.test.ts`, `tracking-status.test.ts`, `format.test.ts` and `public-order-api.test.ts` assert English return values. Playbook rules 8–9 resolve at call/parse time via `textSnapshot()` instead: tests stay unedited and nothing freezes at import time (the concern of spec §13.8).
4. **Guard stricter than spec §6.6**: more text attributes (`eyebrow`, `description`, `labelText`, `hint`, `message`, `ariaLabel`), `errorMessage` calls under rule (d), and a rule (e) for sentence-like literals anywhere (spec §13.12's helper blind spot). Structural exemptions: the `label` and `defaultProps` of a `defineBlock({...})` call (editor palette label, owner starter content); file-level allowlist entries for editor/admin-only modules.

---

## File Structure

```
web/src/text/
  types.ts            Locale, PluralForms, TextValue, LocaleStrings, TextLanguage, SiteText, PageText,
                      TextLayers, PublishedText, EditorText, TEXT_LIMITS, DEFAULT_MAX, LOCALE_RE, KEY_RE,
                      isLocale(), isTextValue(), isPluralForms()                               (Task 1)
  define.ts           TextEntry, TextArea, defineTextArea(), placeholdersIn(), hasBadBrace(),
                      placeholdersOf(), ParamsOf<S>, EntryParams<E>                            (Task 1)
  plural.ts           pluralCategory(), categoriesFor()                                        (Task 1)
  resolve.ts          TextRule, TextCheck, Resolved, createResolver(), checkValue(), resolveText() (Task 1)
  registry.ts         TEXT, TEXT_ENTRIES, TEXT_AREAS, TextKey/StringKey/PluralKey, ParamArgs, NodeParams,
                      TextKeyPattern, isTextKey(), isStringKey(), isPluralKey(), defaultText(),
                      textLabel(), matchesTextPattern()                                        (Task 1)
  keys/<area>.ts      19 area files; stubs in Task 1, seeds in Task 4, filled by Tasks 6–14
  format-profile.ts   FormatProfile, LEGACY_PROFILE, formatProfileFor()                        (Task 2)
  runtime.tsx         TextApi, createTextApi(), TextLayerProvider, TextProvider, useText(),
                      textSnapshot(), textKey()                                                (Task 5)
  site-wide.ts        SITE_WIDE_TEXT: the Text panel's Site-wide group                         (Task 15)
web/src/api/pages.ts        Published, fetchPublished(), toPublished(), toPublishedText()     (Task 3)
web/src/builder/published.ts pagesKey, PAGES_QUERY, pageSetQueryFn (moved out of runtime.tsx)  (Task 3)
web/src/builder/types.ts    PageSet gains `text?: PageText`                                    (Task 3)
web/src/builder/runtime.tsx query holds Published; PageSetOverrideProvider `text?` prop        (Tasks 3, 5)
web/src/builder/define.ts   BlockDef gains `text?` and `textProps?`                            (Task 5)
web/src/lib/format.ts       profile-aware formatters, formatInteger(), regionName(), dateTimeFormat() (Task 2)
web/src/app/App.tsx         <TextProvider> mounted in ThemedApp                                 (Task 5)
web/test/helpers/text-scan.ts        the guard's scanner (rules a–e), inventory helpers        (Task 4)
web/test/helpers/text-area-guard.ts  describeAreaGuard() for the per-area guard files          (Task 4)
web/test/helpers/text-inventory.json frozen v0.7.0 literal inventory (rendered form)           (Task 4)
web/test/text-guard.allow.ts         global allowlist { file, text, reason }                   (Tasks 4, 15)
web/test/text-guard-<slug>.test.tsx  per-area guard + override tests                           (Tasks 6–14)
web/test/text-guard.test.ts, text-registry.test.ts, text-inventory.test.ts                     (Task 15)
e2e/mocks.ts (`text` option), e2e/text.spec.ts                                                  (Task 16)
docs/builder.md  "Text layer" section                                                           (Task 15)
```

## Waves

| Wave | Tasks (parallel within a wave; disjoint files) | Depends on |
|---|---|---|
| 1 | Task 1 — text core | — |
| 2 | Task 2 — format profile · Task 3 — loading · Task 4 — guard scanner, inventory, seeds | 1 |
| 3 | Task 5 — text runtime and provider | 2, 3, 4 |
| 4 | Tasks 6–14 — extraction: checkout · account · order+payment · tracking+verify · catalog+product · cart+wholesale · auth+webapp+notices · shell+system · templates | 5 |
| 5 | Task 15 — guard switched on, registry integrity, block text patterns, docs | 6–14 |
| 6 | Task 16 — e2e: mocks `text` option, `text.spec.ts`, full Playwright incl. dom-parity (**owns Playwright**) | 15 |

---

### Task 1: Text core — types, `defineTextArea`, plurals, resolver, registry skeleton

**Depends on:** nothing. **Wave 1.**

**Files:**
- Create: `web/src/text/types.ts`, `web/src/text/define.ts`, `web/src/text/plural.ts`, `web/src/text/resolve.ts`, `web/src/text/registry.ts`
- Create (stubs): `web/src/text/keys/{common,shell,catalog,product,cart,checkout,auth,account,order,payment,tracking,verify,wholesale,webapp,notices,errors,templates,closed,boot}.ts`
- Test: `web/test/text-define.test.ts`, `web/test/text-plural.test.ts`, `web/test/text-resolve.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exact names used by every later task and by the editor plan):
  - `types.ts`: `Locale`, `PluralCategory`, `PLURAL_CATEGORIES`, `PluralForms`, `TextValue`, `LocaleStrings`, `TextLanguage`, `SiteText`, `PageText`, `TextLayers { locale; formatLocale; shared; layout }`, `PublishedText = TextLayers & { version: number }`, `EditorText = TextLayers`, `TEXT_LIMITS`, `DEFAULT_MAX = 200`, `LOCALE_RE`, `KEY_RE`, `isLocale(x: unknown): x is Locale`, `isPluralForms(v: unknown): v is PluralForms`, `isTextValue(v: unknown): v is TextValue`.
  - `define.ts`: `TextEntry`, `TextArea<A, E>`, `defineTextArea<const A, const E>(area, entries)`, `formsOf(v: TextValue): string[]`, `placeholdersIn(s): string[]`, `hasBadBrace(s): boolean`, `placeholdersOf(entry): ReadonlySet<string>`, `ParamsOf<S>`, `EntryParams<E>`.
  - `plural.ts`: `pluralCategory(locale: Locale, n: number): PluralCategory`, `categoriesFor(locale: Locale): PluralCategory[]` (`other` last).
  - `resolve.ts`: `TextRule`, `TextCheck`, `Resolved { locale; value(key: string): TextValue }`, `createResolver(entries)`, `checkValue(key: string, value: unknown): TextCheck`, `resolveText(layers: { layout: LocaleStrings; shared: LocaleStrings }, locale: Locale): Resolved`.
  - `registry.ts`: `TEXT`, `TEXT_ENTRIES`, `TEXT_AREAS`, `TextKey`, `StringKey`, `PluralKey`, `ParamName<K>`, `ParamArgs<K, Omit>`, `NodeParams<K>`, `TextKeyPattern`, `isTextKey`, `isStringKey`, `isPluralKey`, `defaultText(key: StringKey): string`, `textLabel(key: string): string`, `matchesTextPattern(key: string, pattern: string): boolean`.

- [ ] **Step 1: Write the failing tests**

`web/test/text-define.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from 'vitest';
import { defineTextArea, hasBadBrace, placeholdersIn, placeholdersOf, type ParamsOf } from '@/text/define.ts';
import { isLocale, isTextValue, KEY_RE } from '@/text/types.ts';

const area = defineTextArea('cart', {
  'drawer.title': { en: 'Your cart', note: 'Heading of the slide-out cart' },
  'summary.items': { en: { one: '{count} item', other: '{count} items' } },
  'errors.stock': { en: 'Only {available} left of {name}', max: 80 },
  'units': { en: { one: 'line', other: 'lines' } },
});

describe('defineTextArea', () => {
  it('prefixes every key with the area', () => {
    expect(area.area).toBe('cart');
    expect(Object.keys(area.entries)).toEqual(['cart.drawer.title', 'cart.summary.items', 'cart.errors.stock', 'cart.units']);
    expect(area.entries['cart.errors.stock'].max).toBe(80);
  });
  it('infers full keys and placeholder names at the type level', () => {
    expectTypeOf<keyof typeof area.entries>().toEqualTypeOf<'cart.drawer.title' | 'cart.summary.items' | 'cart.errors.stock' | 'cart.units'>();
    expectTypeOf<ParamsOf<'Only {available} left'>>().toEqualTypeOf<{ available: string | number }>();
    expectTypeOf<ParamsOf<'No holes'>>().toEqualTypeOf<{}>();
  });
});

describe('placeholders', () => {
  it('lists unique names in order', () => {
    expect(placeholdersIn('{a} and {b} and {a}')).toEqual(['a', 'b']);
    expect(placeholdersIn('none')).toEqual([]);
  });
  it('a plural key always accepts count, even when no form uses it', () => {
    expect([...placeholdersOf(area.entries['cart.units'])]).toEqual(['count']);
    expect([...placeholdersOf(area.entries['cart.errors.stock'])]).toEqual(['available', 'name']);
  });
  it('flags braces that are not placeholders', () => {
    expect(hasBadBrace('{ok}')).toBe(false);
    expect(hasBadBrace('a { b')).toBe(true);
    expect(hasBadBrace('{1bad}')).toBe(true);
    expect(hasBadBrace('}{')).toBe(true);
  });
});

describe('shapes', () => {
  it('accepts canonical locales only', () => {
    for (const ok of ['en', 'de', 'pt-BR', 'zh-Hant', 'es-419']) expect(isLocale(ok), ok).toBe(true);
    for (const bad of ['EN', 'en_GB', 'en-gb', 'english', '', 'zh-hant']) expect(isLocale(bad), bad).toBe(false);
  });
  it('accepts strings and plural objects with other', () => {
    expect(isTextValue('x')).toBe(true);
    expect(isTextValue({ one: 'a', other: 'b' })).toBe(true);
    expect(isTextValue({ one: 'a' })).toBe(false);
    expect(isTextValue({ other: 'b', lots: 'c' })).toBe(false);
    expect(isTextValue({ other: 3 })).toBe(false);
    expect(isTextValue(['a'])).toBe(false);
  });
  it('key shape', () => {
    for (const ok of ['cart.drawer.title', 'templates.cyber-brutalism.footer.status', 'a.b']) expect(KEY_RE.test(ok), ok).toBe(true);
    for (const bad of ['cart', 'Cart.title', 'cart..x', 'cart.-x', 'a.b.c.d.e.f.g', 'cart.title ']) expect(KEY_RE.test(bad), bad).toBe(false);
  });
});
```

`web/test/text-plural.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { categoriesFor, pluralCategory } from '@/text/plural.ts';

describe('pluralCategory', () => {
  it('English is `one` exactly when n === 1 (today\'s ternaries)', () => {
    expect([0, 1, 2, 1.5, 1000].map((n) => pluralCategory('en', n))).toEqual(['other', 'one', 'other', 'other', 'other']);
    for (const n of [0, 2, 3, 11, 21, 100, 1000]) expect(pluralCategory('en', n) === 'one').toBe(n === 1);
  });
  it('Polish has one / few / many', () => {
    expect([1, 2, 5, 22, 25].map((n) => pluralCategory('pl', n))).toEqual(['one', 'few', 'many', 'few', 'many']);
  });
  it('an invalid locale reads as English instead of throwing', () => {
    expect(pluralCategory('not a locale', 1)).toBe('one');
  });
});

describe('categoriesFor', () => {
  it('lists the locale\'s categories with other last', () => {
    expect(categoriesFor('en')).toEqual(['one', 'other']);
    expect(categoriesFor('pl')).toEqual(['one', 'few', 'many', 'other']);
  });
});
```

`web/test/text-resolve.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineTextArea } from '@/text/define.ts';
import { createResolver } from '@/text/resolve.ts';

const entries = {
  ...defineTextArea('cart', {
    'drawer.title': { en: 'Your cart' },
    'summary.items': { en: { one: '{count} item', other: '{count} items' } },
    'errors.stock': { en: 'Only {available} left', max: 20 },
  }).entries,
  ...defineTextArea('closed', { 'eyebrow': { en: 'Currently closed', fixed: true } }).entries,
};
const { checkValue, resolveText } = createResolver(entries);
const none = {};
afterEach(() => vi.restoreAllMocks());

describe('checkValue', () => {
  it.each([
    ['nope.key', 'x', 'unknown-key'],
    ['cart.drawer.title', { one: 'a', other: 'b' }, 'type-mismatch'],
    ['cart.summary.items', 'items', 'type-mismatch'],
    ['cart.summary.items', { one: 'a' }, 'type-mismatch'],
    ['cart.errors.stock', 'Only {count} left', 'unknown-placeholder'],
    ['cart.errors.stock', 'Only { left', 'bad-brace'],
    ['cart.errors.stock', 'x'.repeat(21), 'too-long'],
    ['cart.drawer.title', '', 'empty'],
    ['cart.drawer.title', '   ', 'empty'],
    ['cart.summary.items', { one: '', other: 'x' }, 'empty'],
    ['closed.eyebrow', 'Back soon', 'fixed'],
  ])('%s = %j → %s', (key, value, rule) => {
    const r = checkValue(key, value);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.rule).toBe(rule); expect(r.message.length).toBeGreaterThan(0); }
  });
  it('accepts a dropped placeholder and a plural without count', () => {
    expect(checkValue('cart.errors.stock', 'Nearly gone')).toEqual({ ok: true });
    expect(checkValue('cart.summary.items', { one: 'one thing', other: 'several things' })).toEqual({ ok: true });
  });
});

describe('resolveText', () => {
  it('prefers the layout override, then shared, then the default', () => {
    const r = resolveText({ layout: { 'cart.drawer.title': 'Menu basket' }, shared: { 'cart.drawer.title': 'Basket', 'cart.errors.stock': 'Few left' } }, 'en');
    expect(r.value('cart.drawer.title')).toBe('Menu basket');
    expect(r.value('cart.errors.stock')).toBe('Few left');
    expect(r.value('cart.summary.items')).toEqual({ one: '{count} item', other: '{count} items' });
  });
  it('falls back per key: a bad override yields the shared value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = resolveText({ layout: { 'cart.errors.stock': 'Only {oops} left' }, shared: { 'cart.errors.stock': 'Few left' } }, 'en');
    expect(r.value('cart.errors.stock')).toBe('Few left');
    r.value('cart.errors.stock');
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it('ignores stored values for fixed keys and unknown keys (one warning each per load)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = resolveText({ layout: {}, shared: { 'closed.eyebrow': 'Open!', 'gone.key': 'x' } }, 'en');
    expect(r.value('closed.eyebrow')).toBe('Currently closed');
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('gone.key'))).toHaveLength(1);
  });
  it('is memoised per layers object and locale', () => {
    const layers = { layout: none, shared: none };
    expect(resolveText(layers, 'en')).toBe(resolveText(layers, 'en'));
    expect(resolveText(layers, 'de')).not.toBe(resolveText(layers, 'en'));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix web test -- test/text-define.test.ts test/text-plural.test.ts test/text-resolve.test.ts`
Expected: FAIL — `Failed to resolve import "@/text/define.ts"`.

- [ ] **Step 3: Write `web/src/text/types.ts`**

```ts
/** Shared text types (editable-text spec §3). The backend mirrors these in zod; the editor imports them. */

/** BCP 47, canonical form, language[-Script][-REGION]: 'en', 'de', 'pt-BR', 'zh-Hant'. */
export type Locale = string;
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
export const PLURAL_CATEGORIES: readonly PluralCategory[] = ['zero', 'one', 'two', 'few', 'many', 'other'];
/** One key's value in one locale. A plural value has `other` plus any other CLDR categories. */
export type PluralForms = Partial<Record<Exclude<PluralCategory, 'other'>, string>> & { other: string };
export type TextValue = string | PluralForms;
/** Sparse: only keys the owner set. */
export type LocaleStrings = Record<string, TextValue>;

export interface TextLanguage {
  locale: Locale;
  /** '' = built-in formatting for `locale` (spec §6.5); else used for every formatter. */
  formatLocale: '' | Locale;
}
export interface SiteText { schemaVersion: 1; language: TextLanguage; strings: Record<Locale, LocaleStrings> }
export interface PageText { strings: Record<Locale, LocaleStrings> }

/** The two stored layers for the active locale, plus the language (the public read's `text`, spec §4.6). */
export interface TextLayers { locale: Locale; formatLocale: '' | Locale; shared: LocaleStrings; layout: LocaleStrings }
export interface PublishedText extends TextLayers { version: number }
/** What the editor and the version preview inject through `PageSetOverrideProvider`'s `text` prop. */
export type EditorText = TextLayers;

export const TEXT_LIMITS = { locales: 10, keysPerLocale: 3000, key: 100, value: 1000, placeholders: 10, docBytes: 256 * 1024 } as const;
export const DEFAULT_MAX = 200;
export const LOCALE_RE = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|\d{3}))?$/;
export const KEY_RE = /^[a-z]+(?:\.[A-Za-z0-9][A-Za-z0-9-]*){1,5}$/;

export function isLocale(x: unknown): x is Locale {
  if (typeof x !== 'string' || !LOCALE_RE.test(x)) return false;
  try { return Intl.getCanonicalLocales(x)[0] === x; } catch { return false; }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isPluralForms(v: unknown): v is PluralForms {
  if (!isPlainObject(v) || typeof v.other !== 'string') return false;
  return Object.entries(v).every(([k, s]) => (PLURAL_CATEGORIES as readonly string[]).includes(k) && typeof s === 'string');
}

export function isTextValue(v: unknown): v is TextValue {
  return typeof v === 'string' || isPluralForms(v);
}
```

- [ ] **Step 4: Write `web/src/text/define.ts`**

```ts
import { isPluralForms, type TextValue } from '@/text/types.ts';

export interface TextEntry {
  /** The built-in default — the rendered English of v0.7.0, character for character. */
  readonly en: TextValue;
  /** Where the line appears, in shopper words; shown in the editor's Text panel. */
  readonly note?: string;
  /** Short name; else derived from the last key segment (textLabel). */
  readonly label?: string;
  /** Max length of every form (default DEFAULT_MAX, never above TEXT_LIMITS.value). */
  readonly max?: number;
  /** Goes through useText but is never editable (closed.*, boot.* — spec §6.2). */
  readonly fixed?: boolean;
}

export interface TextArea<A extends string, E> {
  readonly area: A;
  readonly entries: { readonly [K in keyof E & string as `${A}.${K}`]: E[K] };
}

/** One registry file per area (spec §6.1). `const` type parameters keep every key and default literal. */
export function defineTextArea<const A extends string, const E extends Record<string, TextEntry>>(area: A, entries: E): TextArea<A, E> {
  const out: Record<string, TextEntry> = {};
  for (const [k, v] of Object.entries(entries)) out[`${area}.${k}`] = v;
  return { area, entries: out as TextArea<A, E>['entries'] };
}

const PLACEHOLDER_RE = /\{([A-Za-z][A-Za-z0-9]{0,31})\}/g;

export function placeholdersIn(s: string): string[] {
  const names: string[] = [];
  for (const m of s.matchAll(PLACEHOLDER_RE)) if (!names.includes(m[1]!)) names.push(m[1]!);
  return names;
}

/** A `{` or `}` left once every valid placeholder is removed — there is no escape syntax. */
export function hasBadBrace(s: string): boolean {
  return /[{}]/.test(s.replace(PLACEHOLDER_RE, ''));
}

export function formsOf(v: TextValue): string[] {
  return typeof v === 'string' ? [v] : Object.values(v).filter((f): f is string => typeof f === 'string');
}

/** The union of names in every default form; a plural key always accepts `count`. */
export function placeholdersOf(entry: TextEntry): ReadonlySet<string> {
  const names = new Set(formsOf(entry.en).flatMap(placeholdersIn));
  if (isPluralForms(entry.en)) names.add('count');
  return names;
}

// ── type helpers ────────────────────────────────────────────────────────────
type Holes<S> = S extends `${string}{${infer N}}${infer R}` ? N | Holes<R> : never;
/** `ParamsOf<'Only {available} left'>` → `{ available: string | number }`. */
export type ParamsOf<S extends string> = { [N in Holes<S>]: string | number };
/** Placeholder names of an entry type: string default → its holes; plural → holes of every form + 'count'. */
export type EntryParams<E> = E extends { readonly en: infer V }
  ? V extends string ? Holes<V> : Holes<V[keyof V] & string> | 'count'
  : never;
```

- [ ] **Step 5: Write `web/src/text/plural.ts`**

```ts
import type { Locale, PluralCategory } from '@/text/types.ts';

const rules = new Map<Locale, Intl.PluralRules>();

function rulesFor(locale: Locale): Intl.PluralRules {
  let r = rules.get(locale);
  if (!r) {
    try { r = new Intl.PluralRules(locale); } catch { r = new Intl.PluralRules('en'); }
    rules.set(locale, r);
  }
  return r;
}

/** `Intl.PluralRules(locale).select(n)`, memoised per locale. For 'en' this is `one` exactly when n === 1. */
export function pluralCategory(locale: Locale, n: number): PluralCategory {
  return rulesFor(locale).select(n) as PluralCategory;
}

/** The categories a locale uses, `other` last — the Text panel shows one input per category. */
export function categoriesFor(locale: Locale): PluralCategory[] {
  const cats = rulesFor(locale).resolvedOptions().pluralCategories as PluralCategory[];
  return [...cats.filter((c) => c !== 'other'), 'other'];
}
```

(Before committing, confirm `categoriesFor('pl')` returns `['one', 'few', 'many', 'other']` in Node — CLDR order from `resolvedOptions()` is `one few many other`; if the runtime orders differently, sort by `PLURAL_CATEGORIES` index and keep the test.)

- [ ] **Step 6: Write `web/src/text/resolve.ts`**

```ts
import { formsOf, hasBadBrace, placeholdersIn, placeholdersOf, type TextEntry } from '@/text/define.ts';
import { TEXT_ENTRIES } from '@/text/registry.ts';
import { DEFAULT_MAX, isPluralForms, type Locale, type LocaleStrings, type TextValue } from '@/text/types.ts';

// Rule messages are editor UI (spec §12: the editor's own text is not translated).
export type TextRule = 'unknown-key' | 'type-mismatch' | 'unknown-placeholder' | 'bad-brace' | 'too-long' | 'empty' | 'fixed';
export type TextCheck = { ok: true } | { ok: false; rule: TextRule; message: string };
export interface Resolved { readonly locale: Locale; value(key: string): TextValue }
export interface TextResolver {
  checkValue(key: string, value: unknown): TextCheck;
  resolveText(layers: { layout: LocaleStrings; shared: LocaleStrings }, locale: Locale): Resolved;
}

const OK: TextCheck = { ok: true };
const fail = (rule: TextRule, message: string): TextCheck => ({ ok: false, rule, message });
const warned = new Set<string>();
function warnOnce(id: string, message: string): void {
  if (warned.has(id)) return;
  warned.add(id);
  console.warn(`[text] ${message}`);
}

export function createResolver(entries: Readonly<Record<string, TextEntry>>): TextResolver {
  function checkValue(key: string, value: unknown): TextCheck {
    const entry = Object.hasOwn(entries, key) ? entries[key] : undefined;
    if (!entry) return fail('unknown-key', 'This line is not used by this version of the shop.');
    if (entry.fixed) return fail('fixed', 'This line cannot be edited.');
    const plural = isPluralForms(entry.en);
    if (typeof value === 'string' ? plural : !(isPluralForms(value) && plural)) {
      return fail('type-mismatch', plural ? 'This line needs one wording per count.' : 'This line takes a single wording.');
    }
    const allowed = placeholdersOf(entry);
    const max = entry.max ?? DEFAULT_MAX;
    for (const form of formsOf(value as TextValue)) {
      if (!form.trim()) return fail('empty', 'A wording cannot be empty — clear the box to use the default.');
      if (hasBadBrace(form)) return fail('bad-brace', 'Curly braces are only for placeholders such as {name}.');
      const unknown = placeholdersIn(form).find((n) => !allowed.has(n));
      if (unknown) {
        const names = [...allowed].map((n) => `{${n}}`).join(', ');
        return fail('unknown-placeholder', `{${unknown}} is not available here${names ? ` — use ${names}` : ''}.`);
      }
      if (form.length > max) return fail('too-long', `Keep it to ${max} characters.`);
    }
    return OK;
  }

  const memo = new WeakMap<object, Map<Locale, Resolved>>();

  function resolveText(layers: { layout: LocaleStrings; shared: LocaleStrings }, locale: Locale): Resolved {
    let byLocale = memo.get(layers);
    if (!byLocale) { byLocale = new Map(); memo.set(layers, byLocale); }
    const hit = byLocale.get(locale);
    if (hit) return hit;
    for (const layer of [layers.layout, layers.shared]) {
      for (const key of Object.keys(layer)) {
        if (!Object.hasOwn(entries, key)) warnOnce(`unknown:${key}`, `ignoring "${key}": not a key of this release`);
      }
    }
    const cache = new Map<string, TextValue>();
    const resolved: Resolved = {
      locale,
      value(key) {
        const cached = cache.get(key);
        if (cached !== undefined) return cached;
        const entry = entries[key];
        let v: TextValue = entry ? entry.en : key;
        if (entry) {
          for (const [scope, layer] of [['layout', layers.layout], ['shared', layers.shared]] as const) {
            if (!Object.hasOwn(layer, key)) continue;
            const c = checkValue(key, layer[key]);
            if (c.ok) { v = layer[key]!; break; }
            warnOnce(`${scope}:${key}:${c.rule}`, `ignoring the ${scope} value of "${key}" (${c.rule})`);
          }
        }
        cache.set(key, v);
        return v;
      },
    };
    byLocale.set(locale, resolved);
    return resolved;
  }

  return { checkValue, resolveText };
}

const shared = createResolver(TEXT_ENTRIES);
/** Also used by the editor to turn rejections into issues (spec §6.3, §7.2). */
export const checkValue = shared.checkValue;
export const resolveText = shared.resolveText;
```

- [ ] **Step 7: Write the 19 area stubs and `web/src/text/registry.ts`**

Each stub, e.g. `web/src/text/keys/cart.ts` (same shape for all 19, with its own area name):

```ts
import { defineTextArea } from '@/text/define.ts';

/** Area `cart` (editable-text spec §6.1). Seeded by Task 4, filled by its extraction task. */
export default defineTextArea('cart', {});
```

`web/src/text/registry.ts`:

```ts
import type { ReactNode } from 'react';
import type { EntryParams, TextEntry } from '@/text/define.ts';
import common from '@/text/keys/common.ts';
import shell from '@/text/keys/shell.ts';
import catalog from '@/text/keys/catalog.ts';
import product from '@/text/keys/product.ts';
import cart from '@/text/keys/cart.ts';
import checkout from '@/text/keys/checkout.ts';
import auth from '@/text/keys/auth.ts';
import account from '@/text/keys/account.ts';
import order from '@/text/keys/order.ts';
import payment from '@/text/keys/payment.ts';
import tracking from '@/text/keys/tracking.ts';
import verify from '@/text/keys/verify.ts';
import wholesale from '@/text/keys/wholesale.ts';
import webapp from '@/text/keys/webapp.ts';
import notices from '@/text/keys/notices.ts';
import errors from '@/text/keys/errors.ts';
import templates from '@/text/keys/templates.ts';
import closed from '@/text/keys/closed.ts';
import boot from '@/text/keys/boot.ts';

/** Every key of this release. The running release's registry decides which stored keys exist. */
export const TEXT = {
  ...common.entries, ...shell.entries, ...catalog.entries, ...product.entries, ...cart.entries, ...checkout.entries,
  ...auth.entries, ...account.entries, ...order.entries, ...payment.entries, ...tracking.entries, ...verify.entries,
  ...wholesale.entries, ...webapp.entries, ...notices.entries, ...errors.entries, ...templates.entries,
  ...closed.entries, ...boot.entries,
};
export const TEXT_ENTRIES: Readonly<Record<string, TextEntry>> = TEXT;
/** Areas in Text-panel order. */
export const TEXT_AREAS = [common, shell, catalog, product, cart, checkout, auth, account, order, payment, tracking,
  verify, wholesale, webapp, notices, errors, templates, closed, boot].map((a) => a.area);

type Registry = typeof TEXT;
export type TextKey = keyof Registry & string;
export type StringKey = { [K in TextKey]: Registry[K]['en'] extends string ? K : never }[TextKey];
export type PluralKey = Exclude<TextKey, StringKey>;
export type ParamName<K extends TextKey> = EntryParams<Registry[K]>;
/** Params are required exactly when the key has placeholders (minus `Omit`, e.g. tp's 'count'). */
export type ParamArgs<K extends TextKey, Omit extends string = never> = [Exclude<ParamName<K>, Omit>] extends [never]
  ? []
  : [params: { [N in Exclude<ParamName<K>, Omit>]: string | number }];
export type NodeParams<K extends TextKey> = { [N in Exclude<ParamName<K>, K extends PluralKey ? 'count' : never>]: ReactNode };
/** An exact key or an `area.part.*` prefix (BlockDef.text, SITE_WIDE_TEXT). */
export type TextKeyPattern = TextKey | `${string}.*`;

export function isTextKey(k: string): k is TextKey { return Object.hasOwn(TEXT, k); }
export function isStringKey(k: string): k is StringKey { return isTextKey(k) && typeof TEXT_ENTRIES[k]!.en === 'string'; }
export function isPluralKey(k: string): k is PluralKey { return isTextKey(k) && typeof TEXT_ENTRIES[k]!.en !== 'string'; }
/** The English default — for compatibility exports that existing tests read (playbook rule 8). */
export function defaultText(key: StringKey): string { return TEXT_ENTRIES[key]!.en as string; }
/** `label`, else the last segment split from camelCase: 'cart.drawer.closeLabel' → 'Close label'. */
export function textLabel(key: string): string {
  const entry = TEXT_ENTRIES[key];
  if (entry?.label) return entry.label;
  const last = key.slice(key.lastIndexOf('.') + 1).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/-/g, ' ').toLowerCase();
  return last.charAt(0).toUpperCase() + last.slice(1);
}
export function matchesTextPattern(key: string, pattern: string): boolean {
  return pattern.endsWith('.*') ? key.startsWith(pattern.slice(0, -1)) : key === pattern;
}
```

Import-cycle note: `resolve.ts` imports `registry.ts`; `registry.ts` must never import `resolve.ts` or `runtime.tsx`.

- [ ] **Step 8: Run the tests and the typecheck**

Run: `npm --prefix web test -- test/text-define.test.ts test/text-plural.test.ts test/text-resolve.test.ts` → PASS.
Run: `npm --prefix web run typecheck` → PASS (this is what checks the `expectTypeOf` lines).

- [ ] **Step 9: Commit**

```bash
git add web/src/text web/test/text-define.test.ts web/test/text-plural.test.ts web/test/text-resolve.test.ts
git commit -m "feat(text): text core — types, defineTextArea, plurals, per-key resolver, registry skeleton" -- web/src/text web/test/text-define.test.ts web/test/text-plural.test.ts web/test/text-resolve.test.ts
```
(Message ends with the house-rules trailer lines.)

---

### Task 2: Format profile and profile-aware formatters

**Depends on:** Task 1. **Wave 2** (parallel with Tasks 3 and 4).

**Files:**
- Create: `web/src/text/format-profile.ts`
- Modify: `web/src/lib/format.ts`, `web/src/features/checkout/CountrySelect.tsx`, `web/src/features/checkout/PhoneField.tsx`, `web/src/features/tracking/status.ts` (only `stampFmt`/`formatStamp`'s formatter), `web/src/features/verify/VerifyPage.tsx` (only `dateFmt`), `web/src/features/account/LoyaltyPage.tsx` (only the five `.toLocaleString()` calls)
- Test: `web/test/text-format-profile.test.ts`

**Interfaces:**
- Consumes: `TextLanguage`, `isLocale` (Task 1).
- Produces: `FormatProfile { money; date; dateTime; number; regions; collation }` (each `string | undefined`, `regions: string[] | undefined`), `LEGACY_PROFILE`, `formatProfileFor(language: TextLanguage): FormatProfile`; in `lib/format.ts`: `setFormatProfile(p)`, `getFormatProfile()`, `dateTimeFormat(slot: 'date' | 'dateTime', options): Intl.DateTimeFormat`, `formatInteger(n: number): string`, `regionName(iso: string): string`, `compareNames(a: string, b: string): number`; in `CountrySelect.tsx`: `countryOptions()` (and `COUNTRY_OPTIONS`, `regionName` re-export, `countryName` kept); in `PhoneField.tsx`: `prefixOptions()`. Every existing export of `lib/format.ts` keeps its signature.

- [ ] **Step 1: Write the failing test** — `web/test/text-format-profile.test.ts`

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { formatProfileFor, LEGACY_PROFILE } from '@/text/format-profile.ts';
import { formatDate, formatDateTime, formatInteger, formatMoney, formatAmountPlain, regionName, setFormatProfile } from '@/lib/format.ts';
import { countryOptions } from '@/features/checkout/CountrySelect.tsx';
import { formatStamp } from '@/features/tracking/status.ts';
import { nextCutoff } from '@/lib/cutoffs.ts';
import { formatClock } from '@/templates/hooks.ts';
import type { Cutoffs } from '@/types/settings.ts';

const ISO = '2026-07-07T10:00:00.000Z';
afterEach(() => setFormatProfile(LEGACY_PROFILE));

describe('formatProfileFor', () => {
  it('English with built-in formatting is the legacy per-call-site profile', () => {
    expect(formatProfileFor({ locale: 'en', formatLocale: '' })).toBe(LEGACY_PROFILE);
    expect(LEGACY_PROFILE).toEqual({ money: 'en', date: 'en-GB', dateTime: undefined, number: undefined, regions: ['en'], collation: undefined });
  });
  it('any other language uses formatLocale || locale everywhere', () => {
    const l = 'de-DE';
    expect(formatProfileFor({ locale: 'de', formatLocale: l })).toEqual({ money: l, date: l, dateTime: l, number: l, regions: [l], collation: l });
    expect(formatProfileFor({ locale: 'fr', formatLocale: '' }).money).toBe('fr');
    expect(formatProfileFor({ locale: 'en', formatLocale: 'en-GB' }).money).toBe('en-GB');
  });
  it('falls back to the legacy profile for a locale Intl rejects', () => {
    expect(formatProfileFor({ locale: 'en', formatLocale: 'xx-ZZ-bad' })).toBe(LEGACY_PROFILE);
    expect(formatProfileFor({ locale: 'not a tag', formatLocale: '' })).toBe(LEGACY_PROFILE);
  });
});

describe('legacy profile produces exactly today\'s output', () => {
  it('money, dates, integers, regions, stamps', () => {
    expect(formatMoney(4.5, 'GBP')).toBe('£4.50');
    expect(formatMoney(4.5, 'USD')).toBe('$4.50');
    expect(formatDate(ISO)).toBe('7 July 2026');
    expect(formatDateTime(ISO)).toBe(new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ISO)));
    expect(formatInteger(1234567)).toBe((1234567).toLocaleString());
    expect(regionName('DE')).toBe('Germany');
    expect(formatStamp(ISO)).toBe(new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ISO)));
    expect(countryOptions().find((c) => c.iso === 'DE')?.name).toBe('Germany');
  });
});

describe('a non-English profile switches every shopper formatter', () => {
  it('de-DE', () => {
    setFormatProfile(formatProfileFor({ locale: 'de', formatLocale: 'de-DE' }));
    expect(formatMoney(4.5, 'EUR')).toBe(new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(4.5));
    expect(formatDate(ISO)).toBe(new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ISO)));
    expect(formatInteger(1234567)).toBe('1.234.567');
    expect(regionName('DE')).toBe('Deutschland');
    expect(countryOptions().find((c) => c.iso === 'DE')?.name).toBe('Deutschland');
    expect(formatAmountPlain(1234.5, 'GBP')).toBe('1234.50'); // machine format, never localised
  });
  it('en-GB explicitly accepts US$ (why the legacy profile exists)', () => {
    setFormatProfile(formatProfileFor({ locale: 'en', formatLocale: 'en-GB' }));
    expect(formatMoney(4.5, 'USD')).toBe('US$4.50');
  });
  it('never reaches cutoffs.ts or the template clock', () => {
    const cutoffs: Cutoffs = { timezone: 'Europe/London', days: { mon: { enabled: true, cutoff: '15:00', shipsOn: 'same day' }, tue: { enabled: true, cutoff: '15:00', shipsOn: 'same day' }, wed: { enabled: true, cutoff: '15:00', shipsOn: 'same day' }, thu: { enabled: true, cutoff: '15:00', shipsOn: 'same day' }, fri: { enabled: true, cutoff: '15:00', shipsOn: 'same day' }, sat: { enabled: false, cutoff: '12:00', shipsOn: '' }, sun: { enabled: false, cutoff: '12:00', shipsOn: '' } } };
    const now = new Date('2026-08-25T09:00:00Z');
    const legacy = nextCutoff(cutoffs, now);
    const clock = formatClock(now, 'Europe/London');
    setFormatProfile(formatProfileFor({ locale: 'ar', formatLocale: 'ar-EG' }));
    expect(nextCutoff(cutoffs, now)).toEqual(legacy);
    expect(formatClock(now, 'Europe/London')).toBe(clock);
  });
});
```

Check `nextCutoff`'s real signature in `web/src/lib/cutoffs.ts` / `web/test/cutoffs.test.ts` before running and call it the same way those tests do (the second argument may be a server/client time pair).

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix web test -- test/text-format-profile.test.ts` → FAIL (`@/text/format-profile.ts` missing).

- [ ] **Step 3: Write `web/src/text/format-profile.ts`**

```ts
import { isLocale, type TextLanguage } from '@/text/types.ts';

/** Intl locale argument per formatter kind; `undefined` = the viewer's own locale (spec §6.5). */
export interface FormatProfile {
  money: string | undefined;
  date: string | undefined;
  dateTime: string | undefined;
  number: string | undefined;
  regions: string[] | undefined;
  /** Sorting of country names; undefined = today's `localeCompare(b)` with no locale. */
  collation: string | undefined;
}

/** English with built-in formatting: every call site's v0.7.0 locale, unchanged. */
export const LEGACY_PROFILE: FormatProfile = Object.freeze({
  money: 'en', date: 'en-GB', dateTime: undefined, number: undefined, regions: ['en'], collation: undefined,
}) as FormatProfile;

function supported(tag: string): boolean {
  if (!isLocale(tag)) return false;
  try { return Intl.NumberFormat.supportedLocalesOf([tag]).length > 0 || Intl.DateTimeFormat.supportedLocalesOf([tag]).length > 0; } catch { return false; }
}

export function formatProfileFor(language: TextLanguage): FormatProfile {
  if (language.locale === 'en' && language.formatLocale === '') return LEGACY_PROFILE;
  const l = language.formatLocale || language.locale;
  if (!supported(l)) return LEGACY_PROFILE;
  return { money: l, date: l, dateTime: l, number: l, regions: [l], collation: l };
}
```

- [ ] **Step 4: Make `web/src/lib/format.ts` profile-aware** (keep every exported signature and the comments that explain the legacy locales)

Replace the three module-level formatters with:

```ts
import { LEGACY_PROFILE, type FormatProfile } from '@/text/format-profile.ts';

// The active profile. TextLayerProvider sets it synchronously during render (idempotent), before any
// child formats; caches are keyed by locale so switching profiles never reuses a wrong formatter.
let profile: FormatProfile = LEGACY_PROFILE;
export function setFormatProfile(p: FormatProfile): void { profile = p; }
export function getFormatProfile(): FormatProfile { return profile; }

const priceFmts = new Map<string, Intl.NumberFormat>();
function priceFmt(currency: string, locale: string | undefined = profile.money): Intl.NumberFormat {
  const k = `${locale ?? ''}|${currency}`;
  let fmt = priceFmts.get(k);
  if (!fmt) { fmt = new Intl.NumberFormat(locale, { style: 'currency', currency }); priceFmts.set(k, fmt); }
  return fmt;
}
export function formatMoney(amount: number, currency: string): string { return priceFmt(currency).format(amount); }
/** Machine format for a banking app's amount field — never localised (always 'en' digits). */
export function formatAmountPlain(amount: number, currency: string): string {
  const digits = priceFmt(currency, 'en').resolvedOptions().maximumFractionDigits ?? 2;
  return amount.toFixed(digits);
}

const dtfs = new Map<string, Intl.DateTimeFormat>();
/** A cached DateTimeFormat for the profile's `date` or `dateTime` locale. */
export function dateTimeFormat(slot: 'date' | 'dateTime', options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const locale = profile[slot];
  const k = `${locale ?? ''}|${JSON.stringify(options)}`;
  let fmt = dtfs.get(k);
  if (!fmt) { fmt = new Intl.DateTimeFormat(locale, options); dtfs.set(k, fmt); }
  return fmt;
}
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dateTimeFormat('date', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dateTimeFormat('dateTime', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

const intFmts = new Map<string, Intl.NumberFormat>();
/** Replaces `n.toLocaleString()` (legacy: the viewer's locale). */
export function formatInteger(n: number): string {
  const k = profile.number ?? '';
  let fmt = intFmts.get(k);
  if (!fmt) { fmt = new Intl.NumberFormat(profile.number); intFmts.set(k, fmt); }
  return fmt.format(n);
}

// Built lazily per locale behind a try/catch: `Intl.DisplayNames` is absent on a few old WebViews and
// throws on construction there — a missing formatter degrades to bare ISO codes.
const regionFmts = new Map<string, Intl.DisplayNames | null>();
export function regionName(iso: string): string {
  const k = (profile.regions ?? []).join(',');
  if (!regionFmts.has(k)) {
    try { regionFmts.set(k, new Intl.DisplayNames(profile.regions, { type: 'region' })); } catch { regionFmts.set(k, null); }
  }
  try { return regionFmts.get(k)?.of(iso) ?? iso; } catch { return iso; }
}
/** Country-name sort: legacy keeps `a.localeCompare(b)` exactly. */
export function compareNames(a: string, b: string): number {
  return profile.collation === undefined ? a.localeCompare(b) : a.localeCompare(b, profile.collation);
}
```

- [ ] **Step 5: Move the call sites onto the profile**

- `CountrySelect.tsx`: delete `regionDisplay` and the local `regionName`; `export { regionName } from '@/lib/format.ts';` (PhoneField and ReviewStep keep importing from here). Add

```ts
const optionsByLocale = new Map<string, Array<{ iso: string; name: string }>>();
/** Every ISO-3166-1 alpha-2 the app knows, sorted by name in the active format profile. */
export function countryOptions(): Array<{ iso: string; name: string }> {
  const k = (getFormatProfile().regions ?? []).join(',');
  let list = optionsByLocale.get(k);
  if (!list) {
    list = Object.keys(DIAL_CODES).map((iso) => ({ iso, name: regionName(iso) })).sort((a, b) => compareNames(a.name, b.name));
    optionsByLocale.set(k, list);
  }
  return list;
}
/** v0.7.0 export, still read by dial-codes.test.ts; render paths call countryOptions(). */
export const COUNTRY_OPTIONS = countryOptions();
```
  and render `countryOptions().map(…)` in `CountrySelect`. Keep the existing doc comment above `countryOptions`.
- `PhoneField.tsx`: `PREFIX_OPTIONS` → a `prefixOptions()` memoised the same way (`Object.entries(DIAL_CODES).map(([iso, dial]) => ({ iso, name: regionName(iso), dial })).sort((a, b) => compareNames(a.name, b.name))`), called in render.
- `tracking/status.ts`: delete `stampFmt`; `formatStamp` uses `dateTimeFormat('date', { dateStyle: 'medium', timeStyle: 'short' }).format(d)` (legacy `date` locale is `'en-GB'`, today's stamp locale). Leave its `'Date unknown'` literal for Task 9.
- `verify/VerifyPage.tsx`: delete the module `dateFmt`; the local `formatDate` uses `dateTimeFormat('date', { day: '2-digit', month: 'short', year: 'numeric' })`.
- `account/LoyaltyPage.tsx`: every `x.toLocaleString()` → `formatInteger(x)` (lines 49, 86, 120, 139, 174). Change nothing else in that file.

- [ ] **Step 6: Run the tests**

Run: `npm --prefix web test -- test/text-format-profile.test.ts test/format.test.ts test/dial-codes.test.ts test/tracking-status.test.ts test/verify.test.tsx test/cutoffs.test.ts test/templates-hooks.test.ts` → PASS (all but the first unedited).
Run: `npm --prefix web run typecheck` → PASS.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(text): format profile — legacy per-call-site locales for English, one locale otherwise" -- web/src/text/format-profile.ts web/src/lib/format.ts web/src/features/checkout/CountrySelect.tsx web/src/features/checkout/PhoneField.tsx web/src/features/tracking/status.ts web/src/features/verify/VerifyPage.tsx web/src/features/account/LoyaltyPage.tsx web/test/text-format-profile.test.ts
```

---

### Task 3: Loading — `fetchPublished`, the page-set query holds `{ pageSet, text }`

**Depends on:** Task 1. **Wave 2.**

**Files:**
- Modify: `web/src/api/pages.ts`, `web/src/builder/runtime.tsx`, `web/src/builder/types.ts`
- Create: `web/src/builder/published.ts`
- Modify (mock factories only — spec conflict 1): `web/test/builder-runtime.test.tsx`, `web/test/builder-routes.test.tsx`, `web/test/builder-prefetch.test.tsx`, `web/test/builder-prefetch-skip.test.tsx`, `web/test/builder-fixture-guards.test.tsx`, `web/test/builder-shell.test.tsx`
- Test: `web/test/text-fetch-published.test.ts`

**Interfaces:**
- Consumes: `PublishedText`, `PageText`, `LocaleStrings`, `isLocale`, `isTextValue` (Task 1).
- Produces: `Published { pageSet: PageSet | null; text: PublishedText | null }`, `fetchPublished(layout): Promise<Published>` (never rejects), `toPublished(body: unknown): Published`, `toPublishedText(raw: unknown): PublishedText | null` in `api/pages.ts`; `fetchPageSet` and `toPageSet` unchanged; `builder/published.ts` exports `pagesKey`, `PAGES_QUERY`, `pageSetQueryFn(client, layout): () => Promise<Published>`; `builder/runtime.tsx` re-exports those three; `usePageSet(layout)` keeps its signature; `PageSet.text?: PageText`.

- [ ] **Step 1: Write the failing test** — `web/test/text-fetch-published.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPublished, toPublished, toPublishedText } from '@/api/pages.ts';

const SET = { schemaVersion: 1, shell: { root: { props: {} }, content: [] }, pages: {} };
const TEXT = { version: 4, locale: 'en', formatLocale: '', shared: { 'common.totals.subtotal': 'Sub-total' }, layout: {} };
const respond = (data: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data, error: null }), { status: 200, headers: { 'content-type': 'application/json' } })));
afterEach(() => vi.unstubAllGlobals());

describe('fetchPublished', () => {
  it('parses the v0.7.0 shape (no text)', async () => {
    respond({ version: 3, data: SET });
    expect(await fetchPublished('menu')).toEqual({ pageSet: SET, text: null });
  });
  it('parses the new shape', async () => {
    respond({ version: 3, data: SET, text: TEXT });
    expect(await fetchPublished('menu')).toEqual({ pageSet: SET, text: TEXT });
  });
  it('parses text only (no published page set)', async () => {
    respond({ version: 0, data: null, text: TEXT });
    expect(await fetchPublished('storefront')).toEqual({ pageSet: null, text: TEXT });
  });
  it('drops a malformed text without dropping the page set', async () => {
    respond({ version: 3, data: SET, text: { version: 'x', locale: 'en' } });
    expect(await fetchPublished('storefront')).toEqual({ pageSet: SET, text: null });
  });
  it('null, 503 and network errors mean nothing published', async () => {
    respond(null);
    expect(await fetchPublished('webapp')).toEqual({ pageSet: null, text: null });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    expect(await fetchPublished('webapp')).toEqual({ pageSet: null, text: null });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await fetchPublished('webapp')).toEqual({ pageSet: null, text: null });
  });
});

describe('toPublishedText', () => {
  it('rejects a non-canonical locale or formatLocale', () => {
    expect(toPublishedText({ ...TEXT, locale: 'EN' })).toBeNull();
    expect(toPublishedText({ ...TEXT, formatLocale: 'de_DE' })).toBeNull();
  });
  it('drops individual malformed values but keeps the rest', () => {
    const t = toPublishedText({ ...TEXT, shared: { a: 'ok', b: 3, c: { one: 'x' } }, layout: { d: { one: 'x', other: 'y' } } });
    expect(t).toEqual({ ...TEXT, shared: { a: 'ok' }, layout: { d: { one: 'x', other: 'y' } } });
  });
  it('requires both layers to be objects', () => {
    expect(toPublishedText({ ...TEXT, layout: [] })).toBeNull();
  });
  it('toPublished ignores a non-object body', () => {
    expect(toPublished('nope')).toEqual({ pageSet: null, text: null });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix web test -- test/text-fetch-published.test.ts` → FAIL (`fetchPublished` is not exported).

- [ ] **Step 3: Implement `web/src/api/pages.ts`** (keep `toPageSet`, `PAGE_SET_TIMEOUT_MS`, `PAGE_SET_REQUEST` and their comments as they are)

```ts
import { isLocale, isTextValue, type LocaleStrings, type PublishedText } from '@/text/types.ts';

/** One read of `storefront/pages/:layout` (spec §5): the layout's published set and the active locale's two text layers. */
export interface Published { pageSet: PageSet | null; text: PublishedText | null }
const NOTHING: Published = Object.freeze({ pageSet: null, text: null }) as Published;

function toLocaleStrings(v: unknown): LocaleStrings | null {
  if (!isRecord(v)) return null;
  const out: LocaleStrings = {};
  // A malformed value is dropped per key; the resolver re-checks everything else against this release.
  for (const [k, val] of Object.entries(v)) if (isTextValue(val)) out[k] = val;
  return out;
}

export function toPublishedText(raw: unknown): PublishedText | null {
  if (!isRecord(raw)) return null;
  const { version, locale, formatLocale } = raw;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) return null;
  if (!isLocale(locale)) return null;
  if (formatLocale !== '' && !isLocale(formatLocale)) return null;
  const shared = toLocaleStrings(raw.shared);
  const layout = toLocaleStrings(raw.layout);
  if (!shared || !layout) return null;
  return { version, locale, formatLocale: formatLocale as PublishedText['formatLocale'], shared, layout };
}

/** `data` of the public read → Published. A v0.7.0 backend sends no `text`; a malformed `text` alone is dropped. */
export function toPublished(body: unknown): Published {
  if (!isRecord(body)) return NOTHING;
  return { pageSet: toPageSet(body), text: toPublishedText(body.text) };
}

/** Never rejects: 404, 503, a timeout, a network error or a malformed body all mean "nothing published". */
export async function fetchPublished(layout: LayoutKind): Promise<Published> {
  try {
    return toPublished(await unwrap<unknown>(api.get(`storefront/pages/${layout}`, PAGE_SET_REQUEST)));
  } catch {
    return NOTHING;
  }
}

/** v0.7.0's entry point, kept for callers that only need the set. */
export async function fetchPageSet(layout: LayoutKind): Promise<PageSet | null> {
  return (await fetchPublished(layout)).pageSet;
}
```

Keep the existing doc comment of `fetchPageSet` on `fetchPublished` (the 404/503/retry explanation).

- [ ] **Step 4: Create `web/src/builder/published.ts` and rewire `runtime.tsx`**

`builder/published.ts` imports **only** `fetchPublished` (and types) from `@/api/pages.ts` — six test files mock that module with a factory, and any other value import would throw there.

```ts
import type { QueryClient } from '@tanstack/react-query';
import { fetchPublished, type Published } from '@/api/pages.ts';
import type { LayoutKind } from '@/builder/types.ts';

export const pagesKey = (layout: LayoutKind) => ['pages', layout] as const;

/**
 * Read once per page load and never again: nothing (a remount, focus, a reconnect, time) refetches
 * it — a publish must not swap the page or its wording under a shopper mid-checkout.
 */
export const PAGES_QUERY = {
  staleTime: Infinity, refetchOnMount: false, refetchOnReconnect: false, refetchOnWindowFocus: false, retry: false,
} as const;

const NOTHING: Published = { pageSet: null, text: null };

/** fetchPublished resolves "nothing" on any failure; should the query run again, a failed read keeps what this page load has. */
export function pageSetQueryFn(client: QueryClient, layout: LayoutKind): () => Promise<Published> {
  return async () => {
    const next = await fetchPublished(layout);
    if (next.pageSet !== null || next.text !== null) return next;
    return client.getQueryData<Published>(pagesKey(layout)) ?? NOTHING;
  };
}
```

In `builder/runtime.tsx`: delete the local `pagesKey`, `PAGES_QUERY`, `pageSetQueryFn` and the `fetchPageSet` import; add `export { pagesKey, PAGES_QUERY, pageSetQueryFn } from '@/builder/published.ts';` plus a value import of the same three for local use. `usePageSet` returns `{ pageSet: query.data?.pageSet ?? null, isLoading: query.isPending }` under no override. `app/App.tsx` needs no change (same names, same key).

In `builder/types.ts`: `import type { PageText } from '@/text/types.ts';` and `export interface PageSet { schemaVersion: 1; shell: PuckDoc; pages: Partial<Record<RouteKey, PuckDoc>>; /** Per-layout text overrides (text spec §3); absent or empty = none. */ text?: PageText }`.

- [ ] **Step 5: Give the six `vi.mock('@/api/pages.ts')` factories a `fetchPublished`** (spec conflict 1 — mock plumbing only, no assertion changes)

- `builder-runtime.test.tsx`: `vi.mock('@/api/pages.ts', () => ({ fetchPageSet: fetched.fn, fetchPublished: async (layout: string) => ({ pageSet: (await fetched.fn(layout)) ?? null, text: null }) }));`
- `builder-routes.test.tsx`: `vi.mock('@/api/pages.ts', () => ({ fetchPageSet: (layout: string) => state.fetchPageSet!(layout), fetchPublished: async (layout: string) => ({ pageSet: (await state.fetchPageSet!(layout)) ?? null, text: null }) }));`
- `builder-prefetch.test.tsx` and `builder-prefetch-skip.test.tsx`: add beside `fetchPageSet` — `fetchPublished: (layout: string) => { state.calls.push(layout); return Promise.resolve({ pageSet: null, text: null }); },`
- `builder-fixture-guards.test.tsx`: `vi.mock('@/api/pages.ts', () => ({ fetchPageSet: (layout: string) => { g.pageFetches.push(layout); return Promise.resolve(null); }, fetchPublished: (layout: string) => { g.pageFetches.push(layout); return Promise.resolve({ pageSet: null, text: null }); } }));`
- `builder-shell.test.tsx`: `vi.mock('@/api/pages.ts', () => ({ fetchPageSet: () => new Promise(() => {}), fetchPublished: () => new Promise(() => {}) }));`

- [ ] **Step 6: Run the tests**

Run: `npm --prefix web test -- test/text-fetch-published.test.ts test/builder-fetch-page-set.test.ts test/builder-runtime.test.tsx test/builder-routes.test.tsx test/builder-prefetch.test.tsx test/builder-prefetch-skip.test.tsx test/builder-fixture-guards.test.tsx test/builder-shell.test.tsx test/builder-shell-fallback.test.tsx test/builder-defaults-table.test.ts` → PASS.
Run: `npm --prefix web run typecheck` → PASS.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(text): one read carries the page set and the active locale's text layers

The six builder tests that vi.mock('@/api/pages.ts') only gain a fetchPublished beside
their fetchPageSet mock (the runtime reads through it now); no assertion changed." -- web/src/api/pages.ts web/src/builder/published.ts web/src/builder/runtime.tsx web/src/builder/types.ts web/test/text-fetch-published.test.ts web/test/builder-runtime.test.tsx web/test/builder-routes.test.tsx web/test/builder-prefetch.test.tsx web/test/builder-prefetch-skip.test.tsx web/test/builder-fixture-guards.test.tsx web/test/builder-shell.test.tsx
```

---

### Task 4: Guard scanner, frozen inventory, allowlist, per-area guard helper, seeded keys

**Depends on:** Task 1. **Wave 2.** Must finish before any extraction task starts (the inventory is taken from the v0.7.0 literals; Task 2's edits in the same wave change no literal).

**Files:**
- Create: `web/test/helpers/text-scan.ts`, `web/test/helpers/text-area-guard.ts`, `web/test/helpers/text-inventory.json` (generated), `web/test/text-guard.allow.ts`, `web/test/text-scan.test.ts`
- Modify (seeds): `web/src/text/keys/common.ts`, `cart.ts`, `checkout.ts`, `catalog.ts`, `product.ts`, `shell.ts`

**Interfaces:**
- Consumes: `TEXT_ENTRIES`, `formsOf` (Task 1).
- Produces: `scanSource(file: string, code: string): Finding[]`, `scanFiles(files: string[]): Finding[]`, `sourceFiles(): string[]` (paths relative to `web/src`, `/`-separated, excluding `builder/editor/**` and `text/keys/**`), `unallowed(findings, allow)`, `staleEntries(findings, allow)`, `inventoryOf(findings)`, `readInventory(): Record<string, string[]>`, `missingFromDefaults(texts: string[]): string[]`, `renderedJsxText(raw)`, `decodeEntities(s)`, types `Finding`, `GuardRule`, `AllowEntry { file; text; reason }`; `describeAreaGuard(name: string, prefixes: string[], opts?: { allow?: AllowEntry[] })`; `TEXT_GUARD_ALLOW: AllowEntry[]`; the seeded keys listed in the playbook.

**Guard rules** (spec §6.6, plus conflict 4): (a) `jsx-text` — JSX text whose rendered form contains a letter (`/\p{L}/u`); (b) `text-attr` — a letter-bearing string literal / template (directly, in `{…}`, or as a conditional/`||`/`??`/`&&` branch) in JSX attributes `aria-label aria-description aria-roledescription aria-valuetext placeholder title alt label eyebrow description labelText hint message ariaLabel`; (c) `jsx-child` — the same as a JSX child expression; (d) `text-call` / `text-prop` — a letter-bearing literal anywhere inside the arguments of `setErrors`, `setError`, `errorMessage`, `notifications.show`, a zod-style `.min/.max/.length/.email/.url/.regex/.nonempty/.refine/.superRefine` call, or the value of an object property named `message title label description placeholder hint ariaLabel eyebrow`; (e) `sentence` — any other string literal or template containing two letter-runs of ≥ 2 letters separated by a space/NBSP, or a `’`, outside import/export/type positions, `console.*` / `new …Error(…)` / `super(…)` / `throw` arguments, non-text JSX attributes and non-text properties (`className classNames style styles key id href to src type name variant size color component rel target role autoComplete inputMode position radius transition`), and not code-like (`var(--`, `{`, `}`, `;`, `=`, `://`). Exempt everywhere: inside a `defineBlock({...})` argument, the `label` property and the whole `defaultProps` subtree. A literal is reported once (first matching rule). Template literals report their text with each hole as `${}`.

- [ ] **Step 1: Write the failing scanner tests** — `web/test/text-scan.test.ts`

```ts
/// <reference types="node" />
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INVENTORY_FILE, inventoryOf, readInventory, renderedJsxText, scanFiles, scanSource, sourceFiles, staleEntries, unallowed } from './helpers/text-scan.ts';
import { TEXT_GUARD_ALLOW } from './text-guard.allow.ts';
import { TEXT_ENTRIES } from '@/text/registry.ts';

const rules = (code: string) => scanSource('features/x/X.tsx', code).map((f) => `${f.rule}:${f.text}`);

describe('scanSource', () => {
  it('(a) JSX text, rendered as React renders it', () => {
    expect(rules(`const a = <p>\n  Your cart\n  is empty&rsquo;s\n</p>;`)).toEqual(['jsx-text:Your cart is empty’s']);
    expect(rules(`const a = <p>{' '}·{' '}</p>;`)).toEqual([]);
  });
  it('(b) text attributes, including branches and templates', () => {
    expect(rules(`const a = <X aria-label="Close" title={ok ? 'Yes' : \`No \${n}\`} className="big card" />;`))
      .toEqual(['text-attr:Close', 'text-attr:Yes', 'text-attr:No ${}']);
  });
  it('(c) literal JSX children', () => {
    expect(rules(`const a = <p>{busy ? 'Starting…' : label}</p>;`)).toEqual(['jsx-child:Starting…']);
  });
  it('(d) messages passed to setErrors, errorMessage, zod and message-like properties', () => {
    expect(rules(`setErrors({ method: 'Choose one' }); errorMessage(e, "We couldn't"); z.string().min(1, 'Required'); const o = { title: 'Hi' };`))
      .toEqual(['text-call:Choose one', "text-call:We couldn't", 'text-call:Required', 'text-prop:Hi']);
  });
  it('(e) sentence-like literals in helpers, not code', () => {
    expect(rules(`export function f(){ return \`Shopping with \${b}? Use my code\`; } const c = 'sf-hide-mobile'; console.warn('not this one'); throw new Error('nor this one'); const v = 'var(--sf-x) solid';`))
      .toEqual(['sentence:Shopping with ${}? Use my code']);
  });
  it('exempts defineBlock palette labels and starter content, and non-text attributes', () => {
    expect(rules(`export const block = defineBlock({ name: 'Button', label: 'Button', defaultProps: { label: 'Shop now', title: 'Hi there' } }); const a = <a rel="noopener noreferrer" className="a b" />;`)).toEqual([]);
  });
});

describe('renderedJsxText', () => {
  it('collapses line breaks with indentation to one space and drops blank edge lines', () => {
    expect(renderedJsxText('\n    Subtotal\n    ')).toBe('Subtotal');
    expect(renderedJsxText(' points')).toBe(' points');
    expect(renderedJsxText('A\n   B &gt; C')).toBe('A B > C');
  });
});

describe('allowlist', () => {
  it('has a reason on every entry', () => {
    for (const e of TEXT_GUARD_ALLOW) expect(e.reason.length, e.file).toBeGreaterThan(10);
  });
  it('reports stale entries', () => {
    expect(staleEntries([], [{ file: 'a.ts', text: 'x', reason: 'because it is fine' }])).toHaveLength(1);
    expect(unallowed([{ file: 'a.ts', line: 1, rule: 'sentence', text: 'x y' }], [{ file: 'a.ts', text: '*', reason: 'whole file is editor text' }])).toEqual([]);
  });
});

describe('inventory', () => {
  it('is a non-empty record of rendered v0.7.0 literals', () => {
    const inv = readInventory();
    expect(Object.keys(inv).length).toBeGreaterThan(100);
    expect(inv['features/cart/CartDrawer.tsx']).toContain('Your cart');
  });
  it('every seeded default occurs verbatim in the inventory', () => {
    const all = new Set(Object.values(readInventory()).flat());
    // The Task 4 seeds only (later tasks merge sentences, so their defaults are checked by missingFromDefaults instead).
    // shell.nav.ariaLabel is left out: it is NavLinks' old defaultProps value, never a v0.7.0 render.
    const seeds = [
      ...['actions.tryAgain', 'actions.copy', 'actions.copied', 'actions.browseCatalogue', 'actions.backToShop', 'actions.close', 'actions.signIn',
        'status.loading', 'status.checking', 'product.preorder', 'qty.fewer', 'qty.more', 'qty.remove', 'totals.subtotal', 'totals.total',
        'totals.discount', 'totals.shipping', 'totals.paymentFee', 'totals.storeCredit', 'nav.yourAccount', 'list.loadFailed',
        'list.categoryMissing', 'list.noMatches', 'list.clearSearch', 'list.emptyCategory', 'contact.whatsapp', 'contact.telegram'].map((k) => `common.${k}`),
      'cart.summary.items', 'checkout.errors.required', 'checkout.errors.paymentMissing', 'catalog.search.placeholder', 'catalog.search.ariaLabel',
      'product.stock.in', 'product.stock.low', 'product.stock.out',
    ];
    for (const key of seeds) {
      const entry = TEXT_ENTRIES[key]!;
      const forms = typeof entry.en === 'string' ? [entry.en] : ['item', 'items'];
      for (const f of forms) expect(all.has(f.replace(/\{[A-Za-z][A-Za-z0-9]*\}/g, '${}')), `${key}: ${f}`).toBe(true);
    }
  });
  it.runIf(process.env.TEXT_INVENTORY_WRITE === '1')('writes the v0.7.0 inventory (run once, in Task 4)', () => {
    writeFileSync(INVENTORY_FILE, `${JSON.stringify(inventoryOf(unallowed(scanFiles(sourceFiles()), TEXT_GUARD_ALLOW)), null, 2)}\n`);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix web test -- test/text-scan.test.ts` → FAIL (`./helpers/text-scan.ts` missing).

- [ ] **Step 3: Write `web/test/helpers/text-scan.ts`**

```ts
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { formsOf } from '@/text/define.ts';
import { TEXT_ENTRIES } from '@/text/registry.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SRC_ROOT = path.resolve(here, '../../src');
export const INVENTORY_FILE = path.resolve(here, 'text-inventory.json');

export type GuardRule = 'jsx-text' | 'text-attr' | 'jsx-child' | 'text-call' | 'text-prop' | 'sentence';
export interface Finding { file: string; line: number; rule: GuardRule; text: string }
/** `text: '*'` allows every finding in `file`. */
export interface AllowEntry { file: string; text: string; reason: string }

const EXCLUDED = [/^builder\/editor\//, /^text\/keys\//, /\.d\.ts$/];
const TEXT_ATTRS = new Set(['aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'placeholder', 'title', 'alt', 'label', 'eyebrow', 'description', 'labelText', 'hint', 'message', 'ariaLabel']);
const TEXT_PROPS = new Set(['message', 'title', 'label', 'description', 'placeholder', 'hint', 'ariaLabel', 'eyebrow']);
const TEXT_CALLS = new Set(['setErrors', 'setError', 'errorMessage', 'notifications.show']);
const ZOD_CALLS = new Set(['min', 'max', 'length', 'email', 'url', 'regex', 'nonempty', 'refine', 'superRefine']);
const NON_TEXT_PROPS = new Set(['className', 'classNames', 'style', 'styles', 'key', 'id', 'href', 'to', 'src', 'type', 'name', 'variant', 'size', 'color', 'component', 'rel', 'target', 'role', 'autoComplete', 'inputMode', 'position', 'radius', 'transition']);
const LETTER = /\p{L}/u;
const SENTENCE = /\p{L}{2,}[  ]+\p{L}{2,}|’/u;
const CODEISH = /var\(--|[{};=]|:\/\//;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', middot: '·', larr: '←', rarr: '→', times: '×' };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** JSX text as React renders it: per line, trim the indentation side(s); drop empty lines; join with one space. */
export function renderedJsxText(raw: string): string {
  const lines = raw.split(/\r\n|\n|\r/);
  const kept: string[] = [];
  lines.forEach((line, i) => {
    let s = line;
    if (i !== 0) s = s.replace(/^[ \t]+/, '');
    if (i !== lines.length - 1) s = s.replace(/[ \t]+$/, '');
    if (s) kept.push(s);
  });
  return decodeEntities(kept.join(' '));
}

function templateText(e: ts.TemplateExpression): string {
  return e.head.text + e.templateSpans.map((s) => `\${}${s.literal.text}`).join('');
}

/** String-ish leaves of an expression, following ?:, ||, ??, &&, parens and casts. */
function leaves(e: ts.Expression): Array<{ node: ts.Node; text: string }> {
  if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e)) return leaves(e.expression);
  if (ts.isConditionalExpression(e)) return [...leaves(e.whenTrue), ...leaves(e.whenFalse)];
  if (ts.isBinaryExpression(e) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(e.operatorToken.kind)) {
    return [...leaves(e.left), ...leaves(e.right)];
  }
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [{ node: e, text: e.text }];
  if (ts.isTemplateExpression(e)) return [{ node: e, text: templateText(e) }];
  return [];
}

/** leaves(), plus object-literal values and array elements, recursively (call arguments). */
function deepLeaves(e: ts.Expression): Array<{ node: ts.Node; text: string }> {
  if (ts.isObjectLiteralExpression(e)) {
    return e.properties.flatMap((p) => (ts.isPropertyAssignment(p) ? deepLeaves(p.initializer) : []));
  }
  if (ts.isArrayLiteralExpression(e)) return e.elements.flatMap((x) => deepLeaves(x));
  return leaves(e);
}

function calleeName(c: ts.CallExpression): string {
  const x = c.expression;
  if (ts.isIdentifier(x)) return x.text;
  if (ts.isPropertyAccessExpression(x)) return ts.isIdentifier(x.expression) && x.expression.text === 'notifications' ? `notifications.${x.name.text}` : x.name.text;
  return '';
}

const isJsxBoundary = (n: ts.Node) => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n);

/** True inside defineBlock({ label, defaultProps }) — the palette label and owner starter content. */
function inDefineBlockExempt(n: ts.Node): boolean {
  for (let p: ts.Node | undefined = n; p; p = p.parent) {
    if (ts.isPropertyAssignment(p) && (p.name.getText() === 'label' || p.name.getText() === 'defaultProps')) {
      const obj = p.parent;
      const call = obj?.parent;
      if (obj && ts.isObjectLiteralExpression(obj) && call && ts.isCallExpression(call) && call.expression.getText() === 'defineBlock') return true;
    }
  }
  return false;
}

/** Contexts rule (e) never reports: code positions and non-text JSX attributes/properties (up to a JSX boundary). */
function sentenceExempt(n: ts.Node): boolean {
  for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
    if (isJsxBoundary(p)) return false;
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isImportTypeNode(p) || ts.isLiteralTypeNode(p) || ts.isThrowStatement(p)) return true;
    if (ts.isJsxAttribute(p)) return !TEXT_ATTRS.has(p.name.getText());
    if (ts.isPropertyAssignment(p) && p.name === n) return true;
    if (ts.isPropertyAssignment(p) && NON_TEXT_PROPS.has(p.name.getText())) return true;
    if (ts.isNewExpression(p) && /Error$/.test(p.expression.getText())) return true;
    if (ts.isCallExpression(p) && (/^console\./.test(p.expression.getText()) || p.expression.kind === ts.SyntaxKind.SuperKeyword)) return true;
  }
  return false;
}

export function scanSource(file: string, code: string): Finding[] {
  const src = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Finding[] = [];
  const seen = new Set<ts.Node>();
  const line = (n: ts.Node) => src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1;
  const report = (rule: GuardRule, node: ts.Node, text: string) => {
    if (seen.has(node) || !LETTER.test(text) || inDefineBlockExempt(node)) return;
    seen.add(node);
    out.push({ file, line: line(node), rule, text });
  };
  const visit = (n: ts.Node): void => {
    if (ts.isJsxText(n)) {
      report('jsx-text', n, renderedJsxText(n.text));
    } else if (ts.isJsxAttribute(n) && TEXT_ATTRS.has(n.name.getText()) && n.initializer) {
      const init = n.initializer;
      if (ts.isStringLiteral(init)) report('text-attr', init, decodeEntities(init.text));
      else if (ts.isJsxExpression(init) && init.expression) for (const l of leaves(init.expression)) report('text-attr', l.node, l.text);
    } else if (ts.isJsxExpression(n) && n.expression && n.parent && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) {
      for (const l of leaves(n.expression)) report('jsx-child', l.node, l.text);
    } else if (ts.isCallExpression(n)) {
      const name = calleeName(n);
      if (TEXT_CALLS.has(name) || (ZOD_CALLS.has(name) && ts.isPropertyAccessExpression(n.expression))) {
        for (const a of n.arguments) for (const l of deepLeaves(a)) report('text-call', l.node, l.text);
      }
    } else if (ts.isPropertyAssignment(n) && TEXT_PROPS.has(n.name.getText())) {
      for (const l of leaves(n.initializer)) report('text-prop', l.node, l.text);
    }
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) && !seen.has(n)) {
      const text = ts.isTemplateExpression(n) ? templateText(n) : n.text;
      if (SENTENCE.test(text) && !CODEISH.test(text) && !sentenceExempt(n)) report('sentence', n, text);
      if (ts.isTemplateExpression(n)) { n.templateSpans.forEach((s) => visit(s.expression)); return; }
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  return out;
}

export function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, name.name);
      if (name.isDirectory()) walk(abs);
      else if (/\.(ts|tsx)$/.test(name.name)) files.push(path.relative(SRC_ROOT, abs).split(path.sep).join('/'));
    }
  };
  walk(SRC_ROOT);
  return files.filter((f) => !EXCLUDED.some((re) => re.test(f))).sort();
}

export function scanFiles(files: string[]): Finding[] {
  return files.flatMap((f) => scanSource(f, readFileSync(path.join(SRC_ROOT, f), 'utf8')));
}

const allows = (e: AllowEntry, f: Finding) => e.file === f.file && (e.text === '*' || e.text === f.text);
export function unallowed(findings: Finding[], allow: AllowEntry[]): Finding[] {
  return findings.filter((f) => !allow.some((e) => allows(e, f)));
}
export function staleEntries(findings: Finding[], allow: AllowEntry[]): AllowEntry[] {
  return allow.filter((e) => !findings.some((f) => allows(e, f)));
}

export function inventoryOf(findings: Finding[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const f of findings) {
    const list = (out[f.file] ??= []);
    if (!list.includes(f.text)) list.push(f.text);
  }
  return out;
}
export function readInventory(): Record<string, string[]> {
  return JSON.parse(readFileSync(INVENTORY_FILE, 'utf8')) as Record<string, string[]>;
}

const collapse = (s: string) => s.replace(/[ \t\r\n]+/g, ' ').trim();
let corpus: string[] | null = null;
/** Inventory texts some chunk of which (split at `${}` holes) is not a substring of any built-in default. */
export function missingFromDefaults(texts: string[]): string[] {
  corpus ??= Object.values(TEXT_ENTRIES).flatMap((e) => formsOf(e.en)).map(collapse);
  return texts.filter((t) => t.split('${}').map(collapse).filter((c) => LETTER.test(c)).some((c) => !corpus!.some((d) => d.includes(c))));
}
```

- [ ] **Step 4: Write `web/test/text-guard.allow.ts`** (initial; Task 15 finalises it)

```ts
import type { AllowEntry } from './helpers/text-scan.ts';

/** Reviewed exceptions to the text guard (spec §6.6). A stale entry fails text-guard.test.ts. */
export const TEXT_GUARD_ALLOW: AllowEntry[] = [
  { file: 'builder/guard.ts', text: '*', reason: 'editor issue messages — the editor\'s own UI text is a non-goal (spec §12)' },
  { file: 'builder/rules.ts', text: '*', reason: 'editor issue messages — the editor\'s own UI text is a non-goal (spec §12)' },
  { file: 'builder/define.ts', text: '*', reason: 'zod messages surfaced only as editor field issues' },
  { file: 'text/resolve.ts', text: '*', reason: 'checkValue messages are editor issues (spec §7.2), not shopper text' },
  { file: 'templates/define.ts', text: '*', reason: 'template option labels shown only in the admin theme panel' },
  { file: 'templates/modern/manifest.ts', text: '*', reason: 'template gallery metadata shown only in the admin' },
  { file: 'templates/bento/manifest.ts', text: '*', reason: 'template gallery metadata shown only in the admin' },
  { file: 'templates/cyber-brutalism/manifest.ts', text: '*', reason: 'template gallery metadata shown only in the admin' },
  { file: 'templates/dark-luxury/manifest.ts', text: '*', reason: 'template gallery metadata shown only in the admin' },
  { file: 'app/theme-bootstrap.ts', text: '*', reason: 'an inline first-paint script string, not text' },
  { file: 'app/theme-bridge.ts', text: '*', reason: 'CSS values (font stacks, borders), not text' },
  { file: 'api/catalog.ts', text: 'Route not found', reason: 'compared against the backend\'s 404 body, never shown' },
  { file: 'builder/blocks/CatalogHero.tsx', text: 'Describe the image for screen readers so it shows.', reason: 'editor-only canvas hint (rendered only while editing)' },
  { file: 'builder/blocks/FeaturedProducts.tsx', text: 'Pick products, or a category with products in it.', reason: 'editor-only canvas hint (rendered only while editing)' },
  { file: 'builder/blocks/Image.tsx', text: 'Upload an image and describe it for screen readers.', reason: 'editor-only canvas hint (rendered only while editing)' },
];
```

Run `npm --prefix web test -- test/text-scan.test.ts -t scanSource` and then list every finding outside the area prefixes of Tasks 6–14 (`builder/**` other than the block files those tasks own, `app/**` other than `App.tsx` and `telegram-session.ts`, `api/**` other than `client.ts` and `public-order.ts`, `stores/**`, `lib/**` other than `errors.ts`/`chat-links.ts`/`format.ts`, `templates/*.ts`, `main.tsx`, `types/**`) with a throw-away `console.log` in a scratch test (do not commit it). For each one that is editor/admin/code text, add an entry here with a reason; leave genuine shopper text for Task 15.

- [ ] **Step 5: Write `web/test/helpers/text-area-guard.ts`**

```tsx
/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { missingFromDefaults, readInventory, scanFiles, sourceFiles, staleEntries, unallowed, type AllowEntry } from './text-scan.ts';
import { TEXT_GUARD_ALLOW } from '../text-guard.allow.ts';

/**
 * The text guard for one extraction area (Tasks 6–14). `prefixes` are paths under web/src; a prefix
 * ending in '/' matches a directory, anything else one file. Task 15 replaces these with the global guard.
 */
export function describeAreaGuard(name: string, prefixes: string[], opts: { allow?: AllowEntry[] } = {}): void {
  const files = sourceFiles().filter((f) => prefixes.some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p)));
  const allow = [...TEXT_GUARD_ALLOW, ...(opts.allow ?? [])];
  describe(`text guard · ${name}`, () => {
    it('covers at least one source file per prefix', () => {
      for (const p of prefixes) expect(files.some((f) => (p.endsWith('/') ? f.startsWith(p) : f === p)), p).toBe(true);
    });
    it('leaves no shopper text outside the registry', () => {
      expect(unallowed(scanFiles(files), allow).map((f) => `${f.file}:${f.line} ${f.rule} ${JSON.stringify(f.text)}`)).toEqual([]);
    });
    it('has no stale area allow entries', () => {
      expect(staleEntries(scanFiles(files), opts.allow ?? [])).toEqual([]);
    });
    it('keeps every v0.7.0 literal, character-exact, inside some built-in default', () => {
      const inv = readInventory();
      const allowed = (f: string, t: string) => allow.some((e) => e.file === f && (e.text === '*' || e.text === t));
      const missing = files.flatMap((f) => missingFromDefaults((inv[f] ?? []).filter((t) => !allowed(f, t))).map((t) => `${f}: ${t}`));
      expect(missing).toEqual([]);
    });
  });
}
```

- [ ] **Step 6: Seed the shared keys** (exact values; the seed test checks each against the inventory)

`web/src/text/keys/common.ts`:

```ts
import { defineTextArea } from '@/text/define.ts';

/** Area `common`: the same wording for the same purpose in several areas (spec §6.1 "one key per meaning"). */
export default defineTextArea('common', {
  'actions.tryAgain': { en: 'Try again', note: 'Retry button on error screens across the shop', max: 40 },
  'actions.copy': { en: 'Copy', note: 'Copy-to-clipboard button', max: 30 },
  'actions.copied': { en: 'Copied', note: 'Copy button, just after copying', max: 30 },
  'actions.browseCatalogue': { en: 'Browse the catalogue', note: 'Button on the empty cart, empty checkout and empty order history', max: 60 },
  'actions.backToShop': { en: '← Back to shop', note: 'Link back to the catalogue on order, payment and verification pages', max: 60 },
  'actions.close': { en: 'Close', note: 'Screen-reader label of the close (×) button on drawers and sheets', max: 40 },
  'actions.signIn': { en: 'Sign in', note: 'Sign-in button, and the header account button when signed out', max: 40 },
  'status.loading': { en: 'Loading', note: 'Screen-reader label while a page or list loads', max: 40 },
  'status.checking': { en: 'Checking…', note: 'Button label while a code, reference or transaction is being checked', max: 40 },
  'product.preorder': { en: 'Pre-order', note: 'Tag on pre-order products, cart lines and order items', max: 30 },
  'qty.fewer': { en: 'One fewer {name}', note: 'Screen-reader label of the − quantity button; {name} is the product', max: 120 },
  'qty.more': { en: 'One more {name}', note: 'Screen-reader label of the + quantity button; {name} is the product', max: 120 },
  'qty.remove': { en: 'Remove {name}', note: 'Screen-reader label of a line\'s remove button; {name} is the product', max: 120 },
  'totals.subtotal': { en: 'Subtotal', note: 'Row label in the cart, checkout, order and account totals', max: 40 },
  'totals.total': { en: 'Total', note: 'Row label for the order total', max: 40 },
  'totals.discount': { en: 'Discount', note: 'Row label for a discount in order totals', max: 40 },
  'totals.shipping': { en: 'Shipping', note: 'Row label for shipping in order totals', max: 40 },
  'totals.paymentFee': { en: 'Payment fee', note: 'Row label for a payment-method fee', max: 40 },
  'totals.storeCredit': { en: 'Store credit', note: 'Row label for store credit applied or held', max: 40 },
  'nav.yourAccount': { en: 'Your account', note: 'Header account button when signed in, and the account page heading fallback', max: 40 },
  'list.loadFailed': { en: "We couldn't load the products", note: 'Catalogue and trade list, when the product list fails to load', max: 80 },
  'list.categoryMissing': { en: "That category isn't here", note: 'Catalogue and trade list, for an unknown category link', max: 80 },
  'list.noMatches': { en: 'Nothing matches "{query}"', note: 'Catalogue and trade list, when a search finds nothing', max: 80 },
  'list.clearSearch': { en: 'Clear search', note: 'Button under "Nothing matches"', max: 40 },
  'list.emptyCategory': { en: 'Nothing stocked here yet', note: 'Catalogue and trade list, for a category with no products', max: 80 },
  'contact.whatsapp': { en: 'WhatsApp', note: 'Contact-link and sign-in channel name', max: 30 },
  'contact.telegram': { en: 'Telegram', note: 'Contact-link and sign-in channel name', max: 30 },
});
```

Replace the stubs of the other five seeded files with:

```ts
// keys/cart.ts
export default defineTextArea('cart', {
  'summary.items': { en: { one: '{count} item', other: '{count} items' }, note: 'Item count in the cart drawer, cart page, cart summary, phone cart bar and checkout summary', max: 40 },
});
// keys/checkout.ts
export default defineTextArea('checkout', {
  'errors.required': { en: 'Required', note: 'Under a checkout (or verification) field left empty', max: 60 },
  'errors.paymentMissing': { en: 'Choose how you’d like to pay', note: 'Checkout payment step, when Continue is pressed with no method chosen', max: 80 },
});
// keys/catalog.ts
export default defineTextArea('catalog', {
  'search.placeholder': { en: 'Search products', note: 'Placeholder of the header search box (a Search field block may set its own)', max: 60 },
  'search.ariaLabel': { en: 'Search products', note: 'Screen-reader label of the header search box', max: 60 },
});
// keys/product.ts
export default defineTextArea('product', {
  'stock.in': { en: 'In Stock', note: 'Stock chip on product cards and pages', max: 30 },
  'stock.low': { en: 'Low Stock', note: 'Stock chip when stock is low', max: 30 },
  'stock.out': { en: 'Out of Stock', note: 'Stock chip when sold out', max: 30 },
});
// keys/shell.ts
export default defineTextArea('shell', {
  'nav.ariaLabel': { en: 'Site', note: 'Screen-reader name of a Links block left without its own label', max: 40 },
});
```

(Each file keeps the `import { defineTextArea } from '@/text/define.ts';` line and a one-line doc comment naming its area.)

- [ ] **Step 7: Generate the inventory, then run the tests**

Run: `TEXT_INVENTORY_WRITE=1 npm --prefix web test -- test/text-scan.test.ts` (Git Bash) → writes `web/test/helpers/text-inventory.json`.
Open the JSON and spot-check: `features/checkout/CheckoutPage.tsx` contains `"Choose how you’d like to pay"` (curly), `features/auth/WhatsappLogin.tsx` contains `…you’re ready to send it.` (decoded from `&rsquo;`), `features/cart/CartSummary.tsx` contains `"Subtotal"`, `"item"`, `"items"`. None of the allowlisted texts appear.
Run: `npm --prefix web test -- test/text-scan.test.ts` → PASS.
Run: `npm --prefix web run typecheck` → PASS.

- [ ] **Step 8: Commit**

```bash
git commit -m "test(text): text guard scanner, frozen v0.7.0 literal inventory, per-area guard helper, seeded shared keys" -- web/test/helpers/text-scan.ts web/test/helpers/text-area-guard.ts web/test/helpers/text-inventory.json web/test/text-guard.allow.ts web/test/text-scan.test.ts web/src/text/keys/common.ts web/src/text/keys/cart.ts web/src/text/keys/checkout.ts web/src/text/keys/catalog.ts web/src/text/keys/product.ts web/src/text/keys/shell.ts
```

---

### Task 5: Text runtime — `TextProvider`, `useText`, `textSnapshot`, editor override, block text fields

**Depends on:** Tasks 2, 3, 4. **Wave 3.**

**Files:**
- Create: `web/src/text/runtime.tsx`
- Modify: `web/src/app/App.tsx` (mount only), `web/src/builder/runtime.tsx` (`PageSetOverrideProvider` `text?`), `web/src/builder/define.ts` (`BlockDef.text?`, `BlockDef.textProps?`)
- Test: `web/test/text-runtime.test.tsx`, `web/test/text-types.test.ts`

**Interfaces:**
- Consumes: Task 1 registry/resolver/plural/types; Task 2 `formatProfileFor`, `LEGACY_PROFILE`, `setFormatProfile`; Task 3 `pagesKey`, `PAGES_QUERY`, `pageSetQueryFn` from `@/builder/published.ts`, `Published`; Task 4 seeds (`common.qty.more`, `common.actions.tryAgain`, `cart.summary.items`).
- Produces (used by Tasks 6–16 and the editor plan):

```ts
export interface TextApi {
  locale: Locale;
  t<K extends StringKey>(key: K, ...p: ParamArgs<K>): string;
  tp<K extends PluralKey>(key: K, count: number, ...p: ParamArgs<K, 'count'>): string;
  tn<K extends TextKey>(key: K, params: NodeParams<K>, count?: number): ReactNode;
  msg(value: string): string;
}
export function createTextApi(layers: TextLayers): TextApi;            // memoised per layers object
export const DEFAULT_TEXT_LAYERS: TextLayers;                         // en, '', {}, {}
export function TextLayerProvider(props: { text: TextLayers | null; children: ReactNode }): JSX.Element;
export function TextProvider(props: { children: ReactNode }): JSX.Element;   // app level
export function useText(): TextApi;                                   // defaults outside any provider
export function textSnapshot(): TextApi;                              // the mounted provider's API
export function textKey<K extends StringKey>(key: K): K;
```
  `PageSetOverrideProvider({ pageSet, text?, children })` — when `text` is given (an `EditorText`), children are wrapped in `TextLayerProvider`. `BlockDef<P>` gains `text?: readonly TextKeyPattern[]` and `textProps?: Partial<Record<keyof P & string, StringKey>>`.

- [ ] **Step 1: Write the failing tests**

`web/test/text-runtime.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createTextApi, DEFAULT_TEXT_LAYERS, TextLayerProvider, textSnapshot, useText } from '@/text/runtime.tsx';
import { formatMoney, getFormatProfile } from '@/lib/format.ts';
import { LEGACY_PROFILE } from '@/text/format-profile.ts';
import type { TextLayers } from '@/text/types.ts';

const layers = (over: Partial<TextLayers> = {}): TextLayers => ({ locale: 'en', formatLocale: '', shared: {}, layout: {}, ...over });
afterEach(() => { cleanup(); vi.restoreAllMocks(); document.documentElement.lang = 'en'; });

function Probe() {
  const { t, tp } = useText();
  return <p>{t('common.actions.tryAgain')}|{tp('cart.summary.items', 2)}|{formatMoney(1, 'EUR')}</p>;
}

describe('useText', () => {
  it('outside any provider resolves the built-in defaults', () => {
    render(<Probe />);
    expect(screen.getByText('Try again|2 items|€1.00')).toBeInTheDocument();
  });
  it('a shared value and a layout override apply per key', () => {
    render(<TextLayerProvider text={layers({ shared: { 'common.actions.tryAgain': 'Retry', 'cart.summary.items': { one: '{count} thing', other: '{count} things' } }, layout: { 'common.actions.tryAgain': 'Once more' } })}><Probe /></TextLayerProvider>);
    expect(screen.getByText('Once more|2 things|€1.00')).toBeInTheDocument();
  });
  it('sets the format profile before any child formats (first render)', () => {
    render(<TextLayerProvider text={layers({ locale: 'de', formatLocale: 'de-DE' })}><Probe /></TextLayerProvider>);
    expect(screen.getByText(`Try again|2 items|${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(1)}`)).toBeInTheDocument();
  });
  it('restores the legacy profile and default snapshot on unmount', () => {
    const view = render(<TextLayerProvider text={layers({ locale: 'de', shared: { 'common.actions.tryAgain': 'Nochmal' } })}><Probe /></TextLayerProvider>);
    expect(textSnapshot().t('common.actions.tryAgain')).toBe('Nochmal');
    view.unmount();
    expect(textSnapshot().t('common.actions.tryAgain')).toBe('Try again');
    expect(getFormatProfile()).toBe(LEGACY_PROFILE);
  });
});

describe('<html lang>', () => {
  it('is left alone when it already matches', () => {
    const seen: MutationRecord[] = [];
    const mo = new MutationObserver((r) => seen.push(...r));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    render(<TextLayerProvider text={null}><Probe /></TextLayerProvider>);
    mo.disconnect();
    expect(seen).toHaveLength(0);
  });
  it('follows the store language', () => {
    render(<TextLayerProvider text={layers({ locale: 'de' })}><Probe /></TextLayerProvider>);
    expect(document.documentElement.lang).toBe('de');
  });
});

describe('TextApi', () => {
  const api = createTextApi(DEFAULT_TEXT_LAYERS);
  it('tp inserts String(count), never a grouped number', () => {
    expect(api.tp('cart.summary.items', 1000)).toBe('1000 items');
    expect(api.tp('cart.summary.items', 1)).toBe('1 item');
    expect([0, 2, 1.5].map((n) => api.tp('cart.summary.items', n))).toEqual(['0 items', '2 items', '1.5 items']);
  });
  it('tp falls back to the same value\'s other for a category it lacks', () => {
    const pl = createTextApi(layers({ locale: 'pl', shared: { 'cart.summary.items': { one: '{count} rzecz', few: '{count} rzeczy', other: '{count} rz.' } } }));
    expect([1, 2, 5].map((n) => pl.tp('cart.summary.items', n))).toEqual(['1 rzecz', '2 rzeczy', '5 rz.']);
  });
  it('t fills placeholders; a dropped placeholder is fine', () => {
    expect(api.t('common.qty.more', { name: 'Oats' })).toBe('One more Oats');
    expect(createTextApi(layers({ shared: { 'common.qty.more': 'Add another' } })).t('common.qty.more', { name: 'Oats' })).toBe('Add another');
  });
  it('tn embeds elements as keyed fragments', () => {
    const { container } = render(<p>{api.tn('common.qty.more', { name: <strong>Oats</strong> })}</p>);
    expect(container.innerHTML).toBe('<p>One more <strong>Oats</strong></p>');
  });
  it('msg passes unregistered and backend strings through', () => {
    expect(api.msg('common.actions.tryAgain')).toBe('Try again');
    expect(api.msg('That transaction has already been used')).toBe('That transaction has already been used');
    expect(api.msg('not.a.key')).toBe('not.a.key');
    expect(api.msg('cart.summary.items')).toBe('cart.summary.items'); // plural keys are not messages
  });
  it('is memoised per layers object', () => {
    expect(createTextApi(DEFAULT_TEXT_LAYERS)).toBe(api);
  });
});
```

`web/test/text-types.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createTextApi, DEFAULT_TEXT_LAYERS, textKey } from '@/text/runtime.tsx';
import type { ParamArgs, PluralKey, StringKey } from '@/text/registry.ts';

// Compile-time checks: `npm --prefix web run typecheck` fails if any @ts-expect-error line compiles.
function typeOnly() {
  const { t, tp } = createTextApi(DEFAULT_TEXT_LAYERS);
  t('common.actions.tryAgain');
  t('common.qty.more', { name: 'Oats' });
  tp('cart.summary.items', 2);
  // @ts-expect-error a missing param
  t('common.qty.more');
  // @ts-expect-error a misspelled param
  t('common.qty.more', { nmae: 'Oats' });
  // @ts-expect-error params on a key without placeholders
  t('common.actions.tryAgain', { x: 1 });
  // @ts-expect-error t() on a plural key
  t('cart.summary.items');
  // @ts-expect-error tp() on a string key
  tp('common.actions.tryAgain', 1);
  // @ts-expect-error not a key
  textKey('cart.nope');
  expectTypeOf<ParamArgs<'common.qty.more'>>().toEqualTypeOf<[params: { name: string | number }]>();
  expectTypeOf<ParamArgs<'cart.summary.items', 'count'>>().toEqualTypeOf<[]>();
  expectTypeOf<'cart.summary.items' extends PluralKey ? true : false>().toEqualTypeOf<true>();
  expectTypeOf<'common.actions.tryAgain' extends StringKey ? true : false>().toEqualTypeOf<true>();
}

describe('text API types', () => {
  it('compile (see typecheck)', () => expect(typeof typeOnly).toBe('function'));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm --prefix web test -- test/text-runtime.test.tsx test/text-types.test.ts` → FAIL (`@/text/runtime.tsx` missing).

- [ ] **Step 3: Write `web/src/text/runtime.tsx`**

```tsx
import { createContext, Fragment, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffectiveLayout } from '@/app/layout.ts';
import { PAGES_QUERY, pageSetQueryFn, pagesKey } from '@/builder/published.ts';
import { setFormatProfile } from '@/lib/format.ts';
import { formatProfileFor, LEGACY_PROFILE } from '@/text/format-profile.ts';
import { pluralCategory } from '@/text/plural.ts';
import { isStringKey, type NodeParams, type ParamArgs, type PluralKey, type StringKey, type TextKey } from '@/text/registry.ts';
import { resolveText } from '@/text/resolve.ts';
import type { Locale, LocaleStrings, PluralForms, TextLayers, TextValue } from '@/text/types.ts';

export interface TextApi {
  locale: Locale;
  t<K extends StringKey>(key: K, ...p: ParamArgs<K>): string;
  tp<K extends PluralKey>(key: K, count: number, ...p: ParamArgs<K, 'count'>): string;
  tn<K extends TextKey>(key: K, params: NodeParams<K>, count?: number): ReactNode;
  /** A registered string key → t(key); anything else (a backend message) verbatim. */
  msg(value: string): string;
}

const EMPTY = Object.freeze({}) as LocaleStrings;
export const DEFAULT_TEXT_LAYERS: TextLayers = Object.freeze({ locale: 'en', formatLocale: '', shared: EMPTY, layout: EMPTY }) as TextLayers;
const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]{0,31})\}/g;

function fill(s: string, params: Readonly<Record<string, unknown>>): string {
  return s.replace(PLACEHOLDER, (m, name: string) => (Object.hasOwn(params, name) ? String(params[name]) : m));
}

const apis = new WeakMap<TextLayers, TextApi>();

export function createTextApi(layers: TextLayers): TextApi {
  const hit = apis.get(layers);
  if (hit) return hit;
  const resolved = resolveText(layers, layers.locale);
  const pick = (v: TextValue, count: number | undefined): string => {
    if (typeof v === 'string') return v;
    const forms = v as PluralForms;
    return count === undefined ? forms.other : (forms[pluralCategory(layers.locale, count) as keyof PluralForms] ?? forms.other);
  };
  const api: TextApi = {
    locale: layers.locale,
    t: ((key: string, params: Record<string, unknown> = {}) => fill(pick(resolved.value(key), undefined), params)) as TextApi['t'],
    tp: ((key: string, count: number, params: Record<string, unknown> = {}) =>
      fill(pick(resolved.value(key), count), { ...params, count: String(count) })) as TextApi['tp'],
    tn: ((key: string, params: Record<string, ReactNode>, count?: number) => {
      const s = pick(resolved.value(key), count);
      const all: Record<string, ReactNode> = count === undefined ? params : { ...params, count: String(count) };
      const out: ReactNode[] = [];
      let last = 0;
      let i = 0;
      for (const m of s.matchAll(PLACEHOLDER)) {
        if (m.index > last) out.push(s.slice(last, m.index));
        out.push(Object.hasOwn(all, m[1]!) ? <Fragment key={i++}>{all[m[1]!]}</Fragment> : m[0]);
        last = m.index + m[0].length;
      }
      if (last < s.length) out.push(s.slice(last));
      return out;
    }) as TextApi['tn'],
    msg: (value) => (isStringKey(value) ? fill(pick(resolved.value(value), undefined), {}) : value),
  };
  apis.set(layers, api);
  return api;
}

const DEFAULT_API = createTextApi(DEFAULT_TEXT_LAYERS);
const TextContext = createContext<TextApi>(DEFAULT_API);
let snapshot: TextApi = DEFAULT_API;

/** Components. Outside any provider (boot screens, unit tests) this is the built-in English. */
export function useText(): TextApi { return useContext(TextContext); }
/** Non-React code (lib/errors.ts, zod messages, status helpers): the mounted provider's text, read at call time. */
export function textSnapshot(): TextApi { return snapshot; }
/** Marks a key held in module-scope data or component state (zod messages, status maps, setErrors). */
export function textKey<K extends StringKey>(key: K): K { return key; }

/** Resolves one set of layers for its subtree: sets the format profile and the snapshot, and `<html lang>`. */
export function TextLayerProvider({ text, children }: { text: TextLayers | null; children: ReactNode }) {
  const layers = text ?? DEFAULT_TEXT_LAYERS;
  const api = createTextApi(layers);
  // Synchronous, during render, before any child formats (spec §6.5, review focus 6). Idempotent.
  setFormatProfile(formatProfileFor(layers));
  snapshot = api;
  useEffect(() => {
    const el = document.documentElement;
    if (el.lang !== api.locale) el.lang = api.locale;
  }, [api.locale]);
  useEffect(() => {
    // Re-assert after StrictMode's mount → unmount → mount (main.tsx renders under StrictMode).
    snapshot = api;
    setFormatProfile(formatProfileFor(layers));
    return () => {
      if (snapshot === api) { snapshot = DEFAULT_API; setFormatProfile(LEGACY_PROFILE); }
    };
  }, [api, layers]);
  return <TextContext.Provider value={api}>{children}</TextContext.Provider>;
}

/**
 * App level (spec §6.4): the published text of the effective layout. It never starts the read itself
 * (`enabled: false`) — PuckShell/PuckPage and the App prefetch own it, and nothing may fetch behind the
 * closed page or in the builder. While the read is pending it resolves the built-in defaults.
 */
export function TextProvider({ children }: { children: ReactNode }) {
  const layout = useEffectiveLayout();
  const client = useQueryClient();
  const query = useQuery({ queryKey: pagesKey(layout), queryFn: pageSetQueryFn(client, layout), ...PAGES_QUERY, enabled: false });
  return <TextLayerProvider text={query.data?.text ?? null}>{children}</TextLayerProvider>;
}
```

`text/runtime.tsx` must not import `@/builder/runtime.tsx` (that module imports the shells, which will import `useText` — a cycle).

- [ ] **Step 4: Mount it, add the editor override and the block fields**

- `app/App.tsx` `ThemedApp`: wrap `ClosedGate` in `<TextProvider>` inside `TemplateProvider` (Notifications stays outside):

```tsx
      <TemplateProvider resolved={resolved} fallback={<PageSkeleton />}>
        <Notifications position="top-center" />
        <TextProvider>
          <ClosedGate>
            <RouterProvider router={router} />
          </ClosedGate>
        </TextProvider>
      </TemplateProvider>
```
- `builder/runtime.tsx`:

```tsx
/** The editor and preview frames inject a draft set (and, with `text`, the edited words); nothing inside fetches the published one. */
export function PageSetOverrideProvider({ pageSet, text, children }: { pageSet: PageSet | null; text?: EditorText; children: ReactNode }) {
  const value = useMemo(() => ({ pageSet }), [pageSet]);
  const inner = <PageSetOverrideContext.Provider value={value}>{children}</PageSetOverrideContext.Provider>;
  return text === undefined ? inner : <TextLayerProvider text={text}>{inner}</TextLayerProvider>;
}
```
- `builder/define.ts` `BlockDef<P>` (type imports from `@/text/registry.ts`):

```ts
  /** Site-text keys this block renders — exact keys or `area.part.*` prefixes (text spec §7.3). Set in Task 15. */
  text?: readonly TextKeyPattern[];
  /** Owner props that fall back to a site-text key when blank: render uses `prop.trim() || t(key)` (text spec §6.4). */
  textProps?: Partial<Record<keyof P & string, StringKey>>;
```

- [ ] **Step 5: Add a provider test to `web/test/text-runtime.test.tsx`** for the override path, then run everything

```tsx
import { PageSetOverrideProvider } from '@/builder/runtime.tsx';
// …
describe('PageSetOverrideProvider text', () => {
  it('applies the editor\'s layers to its subtree only', () => {
    render(<><PageSetOverrideProvider pageSet={null} text={layers({ shared: { 'common.actions.tryAgain': 'Draft retry' } })}><Probe /></PageSetOverrideProvider></>);
    expect(screen.getByText('Draft retry|2 items|€1.00')).toBeInTheDocument();
  });
});
```

Run: `npm --prefix web test -- test/text-runtime.test.tsx test/text-types.test.ts test/closed-gate.test.tsx test/builder-prefetch.test.tsx test/builder-prefetch-skip.test.tsx test/builder-fixture-guards.test.tsx test/builder-runtime.test.tsx test/builder-editor-contract.test.ts` → PASS.
Run: `npm --prefix web run typecheck && npm --prefix web test` → PASS.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(text): TextProvider, useText/tp/tn/msg, textSnapshot, editor text override, BlockDef text fields" -- web/src/text/runtime.tsx web/src/app/App.tsx web/src/builder/runtime.tsx web/src/builder/define.ts web/test/text-runtime.test.tsx web/test/text-types.test.ts
```

---

### Task 6: Extract checkout

**Depends on:** Task 5. **Wave 4** (parallel with Tasks 7–14). Follow the **Extraction playbook** — it is part of this task's requirements.

**Files:**
- Modify: every file under `web/src/features/checkout/` (incl. `steps/`, `schemas.ts`, `CountrySelect.tsx`, `PhoneField.tsx`, `CouponField.tsx`, `QuoteSummary.tsx`, `GuestTurnstile.tsx`, `CryptoComboPicker.tsx`, `Field.tsx`)
- Modify: `web/src/text/keys/checkout.ts` (keep the two seeds)
- Create: `web/test/text-guard-checkout.test.tsx`
- Existing tests that must stay green unedited: `checkout-page.test.tsx`, `checkout-schemas.test.ts`, `checkout-outcome.test.ts`, `use-quote.test.tsx`, `transfer-settlement.test.tsx`, `core-options-views.test.tsx`, `quantity limits` unit tests touching checkout, `dial-codes.test.ts`, `text-format-profile.test.ts`.

**Interfaces:**
- Consumes: `useText`, `textSnapshot`, `textKey` (Task 5); seeds `checkout.errors.required`, `checkout.errors.paymentMissing`, `cart.summary.items`, `common.*`.
- Produces: `checkout.*` keys, including the pinned `checkout.errors.required` (every `'Required'` zod message) and `checkout.errors.paymentMissing` (the `setErrors({ method })` at `CheckoutPage.tsx` "Choose how you’d like to pay"), and `checkout.shipping.thatCountry` ("that country", `ShippingStep.tsx`). Task 16's e2e edits `checkout.errors.required`.

- [ ] **Step 1: Load `frontend-design:frontend-design`** (house rule 4; this task changes no visuals).

- [ ] **Step 2: Write the failing guard + override test** — `web/test/text-guard-checkout.test.tsx`

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { describeAreaGuard } from './helpers/text-area-guard.ts';
import { TextLayerProvider } from '@/text/runtime.tsx';
import { addressSchema, buildContactSchema } from '@/features/checkout/schemas.ts';

describeAreaGuard('checkout', ['features/checkout/']);

afterEach(cleanup);
const edited = { locale: 'en', formatLocale: '', shared: { 'checkout.errors.required': 'Please fill this in' }, layout: {} } as const;

describe('checkout wording follows published text', () => {
  it('addressSchema (built at import) reports the owner\'s wording for Required', () => {
    render(<TextLayerProvider text={edited}><span /></TextLayerProvider>);
    const r = addressSchema.safeParse({ addressLine1: '', city: 'Leeds', zip: 'LS1', country: 'GB' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Please fill this in');
  });
  it('without a provider the schemas keep today\'s English', () => {
    const r = buildContactSchema({ emailMode: 'optional', phoneMode: 'optional' } as never, { guest: true }).safeParse({ firstName: 'A', surname: 'B', email: '', phone: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.message === 'Email or phone is required')).toBe(true);
  });
});
```

(Adjust the `ContactModes` literal to the real type in `web/src/types/settings.ts` if its field values differ.)

- [ ] **Step 3: Run it to verify it fails**

Run: `npm --prefix web test -- test/text-guard-checkout.test.tsx` → FAIL: the guard lists every checkout literal (≈ 130), and the override test shows "Required".

- [ ] **Step 4: Extract, file by file, per the playbook.** Checkout-specific rules:
  - `schemas.ts` (playbook 9): every message becomes `{ error: () => textSnapshot().t('checkout.errors.<name>') }`; `'Required'` → `checkout.errors.required`; `'Valid email required'` → `checkout.errors.emailInvalid`; `'Select your country'` → `checkout.errors.countryMissing`; `'Choose a shipping method'` → `checkout.errors.shippingMissing`; `'Choose a coin and network'` → `checkout.errors.coinMissing`; the `superRefine` `ctx.addIssue({ message })` → `message: textSnapshot().t('checkout.errors.contactMissing')` ("Email or phone is required").
  - `CheckoutPage.tsx` `setErrors({...})` values (playbook 7): `textKey('checkout.errors.paymentMissing')`, `textKey('checkout.errors.stillPricing')` ("Still pricing your order — one moment", used twice — one key), `textKey('checkout.errors.shippingStale')`, `textKey('checkout.errors.methodStale')`, `textKey('checkout.errors.comboStale')`; every place that renders an `errors.*` value renders `msg(error)` (find them in `Field.tsx` and the step components — the `error` prop reaches `Field`, so `Field` renders `msg(error)` once). `firstIssues(...)` results are already resolved strings; `msg` passes them through.
  - The module-level `STEPS` array (`{ label: 'Address', title: 'Delivery address' }`, …) holds `textKey(...)` for both fields; the step header renders `t(step.label)` / `t(step.title)`.
  - `CountrySelect.tsx` default `label = 'Country'` → the component reads `label ?? t('checkout.address.country')` (make the prop optional without a literal default); `'Choose a country'` option → key.
  - `ShippingStep.tsx` "We can’t ship to {country} yet. Choose another …" is one key with `{country}`; the fallback "that country" is `checkout.shipping.thatCountry`.
  - `QuoteSummary.tsx`: `{count} {count === 1 ? 'item' : 'items'}` → `tp('cart.summary.items', count)`; "Subtotal"/"Store credit"/"Payment fee"/"Discount"/"Total"/"Shipping" → `common.totals.*`; `{feeLabel || 'Payment fee'}{' '}` → `{feeLabel || t('common.totals.paymentFee')}{' '}` (keep the `{' '}`); "Pre-order" → `common.product.preorder`.
  - `errorMessage(err, "We couldn't …")` → `errorMessage(err, t('checkout.errors.<name>'))`; `GuestTurnstile.tsx`'s module constant message → a key read at use time.
  - The Place-order button (`'Place order · ' + total`, `'Placing order…'`, `'Place order'`) → `checkout.actions.placeOrderTotal` ("Place order · {total}"), `checkout.actions.placing`, `checkout.actions.placeOrder`.

- [ ] **Step 5: Run the checks** — the per-task verification list (playbook) with this task's tests. Expected: all PASS; `checkout-schemas.test.ts` still reads "Email or phone is required" and "Choose a shipping method".

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(text): checkout strings move into the text registry" -- web/src/features/checkout web/src/text/keys/checkout.ts web/test/text-guard-checkout.test.tsx
```

---

### Task 7: Extract account

**Depends on:** Task 5. **Wave 4.** Follow the **Extraction playbook**.

**Files:**
- Modify: every file under `web/src/features/account/` (`AccountLayout`, `LoyaltyPage`, `OrderDetailPage`, `OrdersPage`, `ProfilePage`, `ReferralsPage`, `StatusPill`, `referral-share.ts`, `queries.ts`)
- Modify: `web/src/text/keys/account.ts`
- Create: `web/test/text-guard-account.test.tsx`
- Existing tests, unedited: `builder-account.test.tsx`, `loyalty-reach.test.ts`, `profile-telegram.test.tsx`, `referral-share.test.ts`, `saved-orders.test.ts`.

**Interfaces:**
- Consumes: Task 5 API; seeds `common.*` (Try again, Browse the catalogue, Copy/Copied, totals, Your account, WhatsApp/Telegram).
- Produces: `account.*` keys (`account.loyalty.*`, `account.orders.*`, `account.order.*`, `account.profile.*`, `account.referrals.*`, `account.nav.*`).

- [ ] **Step 1: Load `frontend-design:frontend-design`.**

- [ ] **Step 2: Write the failing guard + override test** — `web/test/text-guard-account.test.tsx`

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { describeAreaGuard } from './helpers/text-area-guard.ts';
import { TextLayerProvider } from '@/text/runtime.tsx';
import { referralShareText } from '@/features/account/referral-share.ts';

describeAreaGuard('account', ['features/account/']);

afterEach(cleanup);
describe('account wording follows published text', () => {
  it('referralShareText resolves at call time', () => {
    expect(referralShareText('K4M2', 'Northbound Supply')).toBe('Shopping with Northbound Supply? Use my referral code K4M2 on your first order.');
    render(<TextLayerProvider text={{ locale: 'en', formatLocale: '', shared: { 'account.referrals.shareText': 'Try {shop} with code {code}' }, layout: {} }}><span /></TextLayerProvider>);
    expect(referralShareText('K4M2', 'Northbound Supply')).toBe('Try Northbound Supply with code K4M2');
  });
});
```

- [ ] **Step 3: Run it to verify it fails** — `npm --prefix web test -- test/text-guard-account.test.tsx` → FAIL.

- [ ] **Step 4: Extract per the playbook.** Account-specific rules:
  - `referral-share.ts` (playbook 8): `referralShareText(code, brandName)` returns `textSnapshot().t('account.referrals.shareText', { shop: brandName, code })` with default `'Shopping with {shop}? Use my referral code {code} on your first order.'`.
  - `LoyaltyPage.tsx` toast (line ≈ 49): one key `account.loyalty.redeemedToast` = `'{credit} credit added — you now have {points} points and {balance} in credit.'` with `formatMoney(...)`/`formatInteger(...)` values as params (Task 2 already switched to `formatInteger`). The confirmation sentence (line ≈ 174) is all strings: one key `account.loyalty.confirmBody` = `'{reward} costs {points} points, and adds {credit} of credit to your account. Credit is spent at checkout.'` (rendered text is identical — check the inventory for the exact chunks). `'{n} points to go'` stays a string key with `{points}` (the number is formatted); `{n} pts` likewise.
  - `OrderDetailPage.tsx` `{data.items.length} {data.items.length === 1 ? 'line' : 'lines'}` → plural `account.order.lines` `{ one: '{count} line', other: '{count} lines' }`.
  - `OrdersPage.tsx` "Load more"/"Loading" button: "Loading" here is a button state, a different purpose from the screen-reader `common.status.loading` — own key `account.orders.loadingMore`.
  - `ProfilePage.tsx` / `ReferralsPage.tsx` `errorMessage(err, …)`, `setError(...)` → playbook 7/10; the toast `` `You're now referred by ${nickname}.` `` → key with `{name}`.

- [ ] **Step 5: Run the checks** (playbook verification + this task's tests) → PASS.

- [ ] **Step 6: Commit** — `git commit -m "feat(text): account strings move into the text registry" -- web/src/features/account web/src/text/keys/account.ts web/test/text-guard-account.test.tsx`

---

### Task 8: Extract order status and payment redirect

**Depends on:** Task 5. **Wave 4.** Follow the **Extraction playbook**.

**Files:**
- Modify: every file under `web/src/features/order-status/` and `web/src/features/payment-redirect/`; `web/src/lib/chat-links.ts`; `web/src/api/public-order.ts` (only if a shown string lives there — its two `Error` messages are internal, leave them)
- Modify: `web/src/text/keys/order.ts`, `web/src/text/keys/payment.ts`
- Create: `web/test/text-guard-order.test.tsx`
- Existing tests, unedited: `order-status.test.ts`, `public-order-api.test.ts`, `redirect-pages.test.tsx`, `chat-links.test.ts`, `builder-post-order.test.tsx`, `server-clock.test.tsx`.

**Interfaces:**
- Consumes: Task 5 API; seeds `common.*`.
- Produces: `order.*` (order-status page: `order.hero.*`, `order.steps.*`, `order.crypto.*`, `order.method.*`, `order.items.*`, `order.shipment.*`, `order.address.*`, `order.chat.*`, `order.documentTitle`), `payment.*` (payment success / cancel / order placed / missing reference / reference row).

- [ ] **Step 1: Load `frontend-design:frontend-design`.**

- [ ] **Step 2: Write the failing guard + override test** — `web/test/text-guard-order.test.tsx`

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { describeAreaGuard } from './helpers/text-area-guard.ts';
import { TextLayerProvider } from '@/text/runtime.tsx';
import { statusView } from '@/features/order-status/status.ts';
import { orderChatMessage } from '@/lib/chat-links.ts';
import type { PublicOrder } from '@/types/public-order.ts';

describeAreaGuard('order + payment', ['features/order-status/', 'features/payment-redirect/', 'lib/chat-links.ts']);

afterEach(cleanup);
const order = { status: 'pending' } as unknown as PublicOrder;
describe('order wording follows published text', () => {
  it('statusView resolves at call time (defaults without a provider)', () => {
    expect(statusView(order).headline).toBe('Order received');
    render(<TextLayerProvider text={{ locale: 'en', formatLocale: '', shared: { 'order.hero.pendingHeadline': 'Got it!' }, layout: {} }}><span /></TextLayerProvider>);
    expect(statusView(order).headline).toBe('Got it!');
  });
  it('the chat prefill is a key with {reference}', () => {
    expect(orderChatMessage('E2E1')).toBe("I've just placed an order, here is my Order ID: E2E1. I'd like to pay.");
  });
});
```

(If `statusView` needs more order fields to reach the `pending` branch, copy the `order()` fixture helper shape from `web/test/order-status.test.ts`.)

- [ ] **Step 3: Run it to verify it fails** → FAIL.

- [ ] **Step 4: Extract per the playbook.** Area-specific rules:
  - `status.ts` (playbook 8): `statusView()` builds `eyebrow/headline/detail` with `textSnapshot().t(...)` per branch (keys `order.hero.eyebrow`, `order.hero.<status>Headline`, `order.hero.<status>Detail`); `ROUTE_STEPS` stays exported as `ROUTE_STEP_KEYS.map(defaultText)` (read by `order-status.test.ts`) and a new `ROUTE_STEP_KEYS = [textKey('order.steps.received'), …] as const`; `StatusHero.tsx` renders `t(key)` from `ROUTE_STEP_KEYS`. Any label map in `status.ts` / `payment-state.ts` (`card: 'Card'`, `crypto: 'Crypto'`) holds keys; `slotLabel()` keeps returning English through `textSnapshot()` (`order-status.test.ts` asserts `'Crypto (5% discount)'`).
  - `CopyRow.tsx` / `ReferenceRow.tsx`: `` copied ? `${label} copied` : `Copy ${label.toLowerCase()}` `` → `t('order.copy.copiedNamed', { name: label })` / `t('order.copy.copyNamed', { name: label.toLowerCase() })` (keep the `toLowerCase()` for parity); visible "Copy"/"Copied" → `common.actions.*`. `ReferenceRow` uses the same two keys (one meaning).
  - `chat-links.ts`: `orderChatMessage` / `orderInquiryMessage` → `textSnapshot().t('order.chat.payRequest', { reference })` / `('order.chat.inquiry', { reference })`, defaults copied from the inventory (`I've` with ASCII apostrophe, `Hi — checking in …`).
  - `OrderStatusPage.tsx` `document.title` → `t('order.documentTitle', { reference, shop: brand.name })` = `'Order {reference} — {shop}'`.
  - "← Back to shop" → `common.actions.backToShop`; PaymentCancel's "Back to shop" without the arrow is its own `payment.cancel.backToShop`.
  - `errorMessage(x.error, '…')` fallbacks in `CryptoPaymentCard.tsx` / `MethodPicker.tsx` → `t('order.errors.<name>')`.

- [ ] **Step 5: Run the checks** → PASS.

- [ ] **Step 6: Commit** — `git commit -m "feat(text): order-status and payment-redirect strings move into the text registry" -- web/src/features/order-status web/src/features/payment-redirect web/src/lib/chat-links.ts web/src/text/keys/order.ts web/src/text/keys/payment.ts web/test/text-guard-order.test.tsx` (add `web/src/api/public-order.ts` only if you changed it).

---

### Task 9: Extract tracking and verify

**Depends on:** Task 5. **Wave 4.** Follow the **Extraction playbook**.

**Files:**
- Modify: every file under `web/src/features/tracking/` and `web/src/features/verify/`
- Modify: `web/src/text/keys/tracking.ts`, `web/src/text/keys/verify.ts`
- Create: `web/test/text-guard-tracking.test.tsx`
- Existing tests, unedited: `tracking-status.test.ts`, `verify.test.tsx`, `text-format-profile.test.ts`.

**Interfaces:**
- Consumes: Task 5 API; seeds (`common.status.checking`, `common.actions.tryAgain`, `common.actions.backToShop`, `checkout.errors.required` for verify's "Required").
- Produces: `tracking.*` (`tracking.lookup.*`, `tracking.hero.*`, `tracking.parcel.*`, `tracking.timeline.*`, `tracking.status.*`, `tracking.time.*`, `tracking.refresh.*`, `tracking.states.*`), `verify.*`.

- [ ] **Step 1: Load `frontend-design:frontend-design`.**

- [ ] **Step 2: Write the failing guard + override test** — `web/test/text-guard-tracking.test.tsx`

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { describeAreaGuard } from './helpers/text-area-guard.ts';
import { TextLayerProvider } from '@/text/runtime.tsx';
import { formatRelative, formatStamp } from '@/features/tracking/status.ts';

describeAreaGuard('tracking + verify', ['features/tracking/', 'features/verify/']);

afterEach(cleanup);
const now = Date.parse('2026-07-07T12:00:00Z');
const ago = (ms: number) => new Date(now - ms).toISOString();
describe('tracking wording follows published text', () => {
  it('relative times keep today\'s English and follow edits', () => {
    expect(formatRelative(ago(12 * 60_000), now)).toBe('12 min ago');
    expect(formatStamp(null)).toBe('Date unknown');
    render(<TextLayerProvider text={{ locale: 'en', formatLocale: '', shared: { 'tracking.time.minutesAgo': '{minutes} minutes ago' }, layout: {} }}><span /></TextLayerProvider>);
    expect(formatRelative(ago(12 * 60_000), now)).toBe('12 minutes ago');
  });
});
```

- [ ] **Step 3: Run it to verify it fails** → FAIL.

- [ ] **Step 4: Extract per the playbook.** Area-specific rules:
  - `status.ts`: `formatRelative` branches → `textSnapshot()` keys `tracking.time.justNow` ("just now"), `tracking.time.minutesAgo` ("{minutes} min ago"), `tracking.time.hoursAgo` ("{hours}h ago"), and the days branch — read the source: if it is a `days === 1` ternary it becomes plural `tracking.time.daysAgo` `{ one: '{count} day ago', other: '{count} days ago' }` via `tp`, else keep its exact condition (playbook 6). `formatStamp`'s "Date unknown" → `tracking.time.unknown`. `PARCEL_LABEL` becomes `Record<string, StringKey>` of `textKey(...)` values; `parcelLabel()` keeps its exported signature and return value (resolved through `textSnapshot()`) because `tracking-status.test.ts` imports this module — check what it asserts before choosing, and render from the key map in components.
  - `OrderHero.tsx` detail rows built as data (`{ label: 'Last scan', value: … }`, `{ label: 'Type', value: 'Pre-order' }`) → labels `t(...)`; "Pre-order" → `common.product.preorder`; `'Heading to …'`, `'… parcels dispatched'` → keys with placeholders (plural only if the source ternary is `=== 1`).
  - `RefreshButton.tsx` `busy ? 'Checking…' : waiting ? countdown : 'Refresh'` → `common.status.checking` / `countdown` (data) / `tracking.refresh.label`.
  - `VerifyPage.tsx` field errors (`setErrors`) → keys + `msg()`; "Required" → `checkout.errors.required`; the dash for an unparseable date stays (no letters).

- [ ] **Step 5: Run the checks** → PASS.

- [ ] **Step 6: Commit** — `git commit -m "feat(text): tracking and verify strings move into the text registry" -- web/src/features/tracking web/src/features/verify web/src/text/keys/tracking.ts web/src/text/keys/verify.ts web/test/text-guard-tracking.test.tsx`

---

### Task 10: Extract catalog, product and the search field

**Depends on:** Task 5. **Wave 4.** Follow the **Extraction playbook**.

**Files:**
- Modify: every file under `web/src/features/catalog/`; `web/src/layouts/SearchField.tsx`; `web/src/builder/blocks/SearchField.tsx`; `web/src/builder/blocks/FeaturedProducts.tsx`; `web/src/lib/format.ts` (only `stockLabel`)
- Modify: `web/src/text/keys/catalog.ts`, `web/src/text/keys/product.ts` (keep the seeds)
- Create: `web/test/text-guard-catalog.test.tsx`
- Existing tests, unedited: `add-to-cart.test.tsx`, `builder-catalogue.test.tsx`, `builder-catalogue-extras.test.tsx`, `builder-featured.test.tsx`, `catalog-fallback.test.ts`, `catalog-filter.test.ts`, `category-tree.test.ts`, `product-card.test.tsx`, `product-detail-page.test.tsx`, `product-detail-sku.test.tsx`, `product-grid.test.tsx`, `product-list.test.tsx`, `product-row.test.tsx`, `provenance.test.tsx`, `format.test.ts`, `shell-header-options.test.tsx`, `blocks-manifest.test.ts`.

**Interfaces:**
- Consumes: Task 5 API and `BlockDef.textProps`; seeds `catalog.search.*`, `product.stock.*`, `common.list.*`, `common.qty.*`, `common.product.preorder`, `common.actions.close`, `common.status.loading`.
- Produces: `catalog.*` (grid, list, category nav, filters, hero, featured), `product.*` (detail page, sheet, add to cart, bulk pricing, provenance, upsells, image alt fallbacks). `SearchField` block: `textProps: { placeholder: 'catalog.search.placeholder' }`, schema `placeholder: z.string().max(60)` (allows `''`), `defaultProps: { placeholder: '' }`.

- [ ] **Step 1: Load `frontend-design:frontend-design`.**

- [ ] **Step 2: Write the failing guard + override test** — `web/test/text-guard-catalog.test.tsx`

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describeAreaGuard } from './helpers/text-area-guard.ts';
import { TextLayerProvider } from '@/text/runtime.tsx';
import { SearchField } from '@/layouts/SearchField.tsx';
import { stockLabel } from '@/lib/format.ts';
import { block as searchBlock } from '@/builder/blocks/SearchField.tsx';

describeAreaGuard('catalog + product', ['features/catalog/', 'layouts/SearchField.tsx', 'builder/blocks/SearchField.tsx', 'builder/blocks/FeaturedProducts.tsx', 'lib/format.ts']);

afterEach(cleanup);
describe('catalog wording follows published text', () => {
  it('the header search box reads the shared placeholder and label', () => {
    render(<MantineProvider env="test"><TextLayerProvider text={{ locale: 'en', formatLocale: '', shared: { 'catalog.search.placeholder': 'Find oats…', 'catalog.search.ariaLabel': 'Search the shop' }, layout: {} }}><SearchField value="" onChange={() => {}} /></TextLayerProvider></MantineProvider>);
    expect(screen.getByRole('textbox', { name: 'Search the shop' })).toHaveAttribute('placeholder', 'Find oats…');
  });
  it('stockLabel keeps today\'s English without a provider', () => {
    expect(stockLabel('low')).toBe('Low Stock');
  });
  it('the Search field block defaults to blank and falls back to site text', () => {
    expect(searchBlock.defaultProps.placeholder).toBe('');
    expect(searchBlock.schema.safeParse({ placeholder: '' }).success).toBe(true);
    expect(searchBlock.textProps).toEqual({ placeholder: 'catalog.search.placeholder' });
  });
});
```

- [ ] **Step 3: Run it to verify it fails** → FAIL.

- [ ] **Step 4: Extract per the playbook.** Area-specific rules:
  - `layouts/SearchField.tsx`: drop the `placeholder = 'Search products'` default; render `placeholder={placeholder ?? t('catalog.search.placeholder')}` and `aria-label={t('catalog.search.ariaLabel')}`.
  - `builder/blocks/SearchField.tsx` (spec §6.4): schema `z.object({ placeholder: z.string().max(60) })`, `defaultProps: { placeholder: '' }`, `textProps: { placeholder: 'catalog.search.placeholder' }`; the view passes `placeholder.trim() || undefined` exactly as today (the layout component supplies the site text). A stored document with the old explicit `'Search products'` keeps it.
  - `FeaturedProducts.tsx` `aria-label={title || 'Featured products'}` → `title || t('catalog.featured.ariaLabel')` (the editor-only hint is allowlisted; leave it).
  - `lib/format.ts` `stockLabel` → `textSnapshot().t(status === 'in' ? 'product.stock.in' : status === 'low' ? 'product.stock.low' : 'product.stock.out')` (`format.test.ts` asserts English). Touch nothing else in `lib/format.ts`.
  - `ProductDetailPage.tsx` / `ProductDetailSheet.tsx` `document.title = \`${displayName} — ${brand.name}\`` has no letters of its own — leave it. `` eta ? `Pre-order · ships ${eta}` : 'Pre-order' `` → `product.detail.preorderShips` ("Pre-order · ships {eta}") / `common.product.preorder`; the sheet's `` `Ships ${eta}` `` → `product.sheet.ships`.
  - `ProductGrid.tsx` / `ProductList.tsx` empty and error states → `common.list.*` (seeded, shared with wholesale).
  - `AddToCart.tsx`/`ProductRow.tsx` `product.isPreorder ? 'Pre-order' : 'Add'` verbs and `` `${verb} ${displayName}` `` aria-labels → keys (`product.add.verb`, `product.add.ariaLabel` "{verb} {name}"), "Out of stock — {name}" → key.
  - The ask-a-question chat prefill (`` `Hi — a question about ${name}` ``) → `product.ask.prefill`.

- [ ] **Step 5: Run the checks** → PASS. Also `npm --prefix web test -- test/blocks-manifest.test.ts` (unchanged `web/public/blocks.json`: the manifest lists no props).

- [ ] **Step 6: Commit** — `git commit -m "feat(text): catalogue, product and search strings move into the text registry; Search field falls back to site text" -- web/src/features/catalog web/src/layouts/SearchField.tsx web/src/builder/blocks/SearchField.tsx web/src/builder/blocks/FeaturedProducts.tsx web/src/lib/format.ts web/src/text/keys/catalog.ts web/src/text/keys/product.ts web/test/text-guard-catalog.test.tsx`

---

### Task 11: Extract cart and wholesale

**Depends on:** Task 5. **Wave 4.** Follow the **Extraction playbook**.

**Files:**
- Modify: every file under `web/src/features/cart/` and `web/src/features/wholesale/`
- Modify: `web/src/text/keys/cart.ts` (keep the seed), `web/src/text/keys/wholesale.ts`
- Create: `web/test/text-guard-cart.test.tsx`
- Existing tests, unedited: `cart-line.test.tsx`, `cart-store.test.ts`, `use-server-cart.test.tsx`, `builder-commerce.test.tsx`, `wholesale.test.ts`, `wholesale-row.test.tsx`, `primary-action.test.tsx`.

**Interfaces:**
- Consumes: Task 5 API; seeds `cart.summary.items`, `common.qty.*`, `common.list.*`, `common.totals.subtotal`, `common.actions.*`, `common.product.preorder`.
- Produces: `cart.*` (drawer, page, line, summary, mobile bar, sync errors), `wholesale.*` (table, bar, tier ladder, rows). Task 16 relies on `cart.summary.items` (drawer sub, cart page sub, summary ledger, phone bar) and `common.totals.subtotal` (summary ledger).

- [ ] **Step 1: Load `frontend-design:frontend-design`.**

- [ ] **Step 2: Write the failing guard + override test** — `web/test/text-guard-cart.test.tsx`

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describeAreaGuard } from './helpers/text-area-guard.ts';
import { TextLayerProvider } from '@/text/runtime.tsx';

vi.mock('@/app/settings.ts', async (orig) => ({ ...(await orig<typeof import('@/app/settings.ts')>()), useSettings: () => ({ currency: 'GBP', features: { guestCheckout: true, layout: 'storefront' } }) }));
import { CartSummary } from '@/features/cart/CartSummary.tsx';
import { useCartStore } from '@/stores/cart.ts';

describeAreaGuard('cart + wholesale', ['features/cart/', 'features/wholesale/']);

afterEach(cleanup);
describe('cart wording follows published text', () => {
  it('the summary ledger uses the plural and subtotal keys', () => {
    useCartStore.setState({ lines: [{ productId: 1, quantity: 1, unitPrice: 2, displayName: 'Oats' }] as never });
    render(<MemoryRouter><TextLayerProvider text={{ locale: 'en', formatLocale: '', shared: { 'common.totals.subtotal': 'Sub-total', 'cart.summary.items': { one: '{count} thing', other: '{count} things' } }, layout: {} }}><CartSummary blocked={false} /></TextLayerProvider></MemoryRouter>);
    expect(screen.getByText('Sub-total')).toBeInTheDocument();
    expect(screen.getByText('1 thing')).toBeInTheDocument();
  });
});
```

(Build the cart line fixture from `web/src/types/cart.ts` and the way `cart-store.test.ts` seeds the store; the `useSettings` mock must carry every field `CartSummary` reads.)

- [ ] **Step 3: Run it to verify it fails** → FAIL.

- [ ] **Step 4: Extract per the playbook.** Area-specific rules:
  - Every `{count} {count === 1 ? 'item' : 'items'}` (drawer, page, summary) and `MobileCartBar`'s `` `${count} ${count === 1 ? 'item' : 'items'}` `` → `tp('cart.summary.items', count)`; `` `View cart — ${items}` `` → `cart.bar.viewCartLabel` ("View cart — {items}").
  - `WholesaleBar.tsx` `lines`/`units` ternaries → plurals `wholesale.bar.lines` `{ one: '{count} line', other: '{count} lines' }` and `wholesale.bar.units`; the long aria-label → one key `wholesale.bar.ariaLabel` = `'View basket — {lines}, {units}, {subtotal}'` fed with the two `tp(...)` results and `formatMoney(...)`. `WholesaleCatalogPage.tsx` `{products.length === 1 ? 'line' : 'lines'}` → plural `wholesale.tally.unit` `{ one: 'line', other: 'lines' }`.
  - Empty/error states shared with the catalogue → `common.list.*`; "/ea" has letters → `wholesale.row.perUnit` ("/ea"), also used in `CartLine.tsx`? — one meaning, one key: register it as `cart.line.perUnit` and use it in both (you own both areas).
  - `useServerCart.ts` toasts (`'Please sign in again'`, `errorMessage(err, "We couldn't update your cart")`) are in a hook: get `t` from `useText()` inside the hook (it is called from components) and use it in the callbacks.

- [ ] **Step 5: Run the checks** → PASS.

- [ ] **Step 6: Commit** — `git commit -m "feat(text): cart and wholesale strings move into the text registry" -- web/src/features/cart web/src/features/wholesale web/src/text/keys/cart.ts web/src/text/keys/wholesale.ts web/test/text-guard-cart.test.tsx`

---

### Task 12: Extract auth, Telegram web-app actions and notices

**Depends on:** Task 5. **Wave 4.** Follow the **Extraction playbook**.

**Files:**
- Modify: every file under `web/src/features/auth/`, `web/src/features/webapp/`, `web/src/features/notices/`; `web/src/app/telegram-session.ts`
- Modify: `web/src/text/keys/auth.ts`, `web/src/text/keys/webapp.ts`, `web/src/text/keys/notices.ts`
- Create: `web/test/text-guard-auth.test.tsx`
- Existing tests, unedited: `use-login-success.test.tsx`, `use-whatsapp-login.test.tsx`, `telegram-session.test.ts`, `telegram-webapp.test.ts`, `default-action.test.ts`, `primary-action.test.tsx`, `notice-banners.test.tsx`, `cutoff-bar.test.tsx`, `guards.test.tsx`.

**Interfaces:**
- Consumes: Task 5 API; seeds `common.actions.*`, `common.contact.*`.
- Produces: `auth.*` (login page, card, options, WhatsApp flow, Telegram login and sign-in error), `webapp.*` (MainButton default actions: `webapp.action.checkout` "Checkout · {subtotal}", `webapp.action.viewCart` "View cart · {subtotal}"), `notices.*` (banners, cut-off bar).

- [ ] **Step 1: Load `frontend-design:frontend-design`.**

- [ ] **Step 2: Write the failing guard + override test** — `web/test/text-guard-auth.test.tsx`

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { describeAreaGuard } from './helpers/text-area-guard.ts';
import { TextLayerProvider } from '@/text/runtime.tsx';
import { defaultPrimaryAction } from '@/features/webapp/default-action.ts';

describeAreaGuard('auth + webapp + notices', ['features/auth/', 'features/webapp/', 'features/notices/', 'app/telegram-session.ts']);

afterEach(cleanup);
const base = { pathname: '/', count: 2, subtotalLabel: '£24.00', checkoutTo: '/checkout', ordering: true, blocked: false };
describe('Telegram MainButton labels follow published text', () => {
  it('default-action resolves at call time', () => {
    expect(defaultPrimaryAction(base)?.label).toBe('View cart · £24.00');
    render(<TextLayerProvider text={{ locale: 'en', formatLocale: '', shared: { 'webapp.action.viewCart': 'Basket ({subtotal})' }, layout: {} }}><span /></TextLayerProvider>);
    expect(defaultPrimaryAction(base)?.label).toBe('Basket (£24.00)');
  });
});
```

- [ ] **Step 3: Run it to verify it fails** → FAIL.

- [ ] **Step 4: Extract per the playbook.** Area-specific rules:
  - `default-action.ts` (spec conflict 3): labels via `textSnapshot().t('webapp.action.checkout' | 'webapp.action.viewCart', { subtotal: subtotalLabel })`; `PrimaryActionBar.tsx` recomputes on every render already, so an edit applies.
  - `WhatsappLogin.tsx` `&rsquo;` texts: copy the decoded `’` from the inventory. `` `Or send this code to ${number}` `` / "Or send this code to us on WhatsApp" → two keys; "Copy the code {code}" aria-label → key; visible Copy/Copied → `common.actions.*`.
  - `useWhatsappLogin.ts`, `LoginOptions.tsx`, `useLoginSuccess.ts` `errorMessage(err, …)` / toasts → playbook 7/10/11 (hooks take `t` from `useText()`).
  - `app/telegram-session.ts` (non-React): `auth.setStatus('failed', …)` messages → `textSnapshot().t('auth.telegram.noAccount')` and `errorMessage(err, textSnapshot().t('auth.telegram.signInFailed'))`.
  - `NoticeBanners.tsx` aria-labels ("Pinned store notices", "Store notices", "Dismiss notice") → keys; the notices' own text is owner content — leave it. `CutoffBar.tsx` "Order by … for … dispatch" wording → one key per sentence shape with placeholders (keep the elements via `tn` if the time is wrapped in an element).

- [ ] **Step 5: Run the checks** → PASS.

- [ ] **Step 6: Commit** — `git commit -m "feat(text): sign-in, Telegram action and notice strings move into the text registry" -- web/src/features/auth web/src/features/webapp web/src/features/notices web/src/app/telegram-session.ts web/src/text/keys/auth.ts web/src/text/keys/webapp.ts web/src/text/keys/notices.ts web/test/text-guard-auth.test.tsx`

---

### Task 13: Extract the shells and system screens (shell, boot, closed, errors, common)

**Depends on:** Task 5. **Wave 4.** Follow the **Extraction playbook**.

**Files:**
- Modify: every file under `web/src/layouts/` **except** `SearchField.tsx`; every file under `web/src/components/`; `web/src/features/NotFoundPage.tsx`; `web/src/features/closed/ClosedPage.tsx`; `web/src/app/App.tsx` (boot screen strings only); `web/src/lib/errors.ts`; `web/src/api/client.ts` (fallback messages only — do not restructure the file); `web/src/builder/blocks/NavLinks.tsx`; `web/src/builder/blocks/Video.tsx`
- Modify: `web/src/text/keys/shell.ts` (keep the seed), `boot.ts`, `closed.ts`, `errors.ts`, `common.ts` (owner of `common` in this wave; keep every seed)
- Modify (spec conflict 2 — one assertion): `web/test/builder-neutral-fallbacks.test.tsx`
- Create: `web/test/text-guard-shell.test.tsx`
- Existing tests, unedited: `shell-parts.test.tsx`, `shell-header-options.test.tsx`, `builder-shell.test.tsx`, `builder-nav-footer.test.tsx`, `builder-content-media.test.tsx`, `closed-gate.test.tsx`, `closed-exempt.test.ts`, `api-client.test.ts`, `api-interceptor.test.ts`, `public-order-api.test.ts`, `api-orders.test.ts`, `document-theme.test.tsx`.

**Interfaces:**
- Consumes: Task 5 API and `BlockDef.textProps`; seeds `shell.nav.ariaLabel`, `common.*`.
- Produces: `shell.*` (headers of the three shells, webapp back/search/categories, cart button "Cart, {count}", footer, not-found page `shell.notFound.*`), `boot.*` and `closed.*` (every key `fixed: true`), `errors.*` (`errors.generic` "Something went wrong", `errors.rateLimited`, `errors.unavailable`, `errors.requestFailed` "Request failed", `errors.timeout` "The request timed out"), extra `common.*` (e.g. `common.video.title` "Video"). `NavLinks` block: `textProps: { ariaLabel: 'shell.nav.ariaLabel' }`, schema `ariaLabel: z.string().max(40)`, `defaultProps.ariaLabel: ''`.

- [ ] **Step 1: Load `frontend-design:frontend-design`.**

- [ ] **Step 2: Write the failing guard + override test** — `web/test/text-guard-shell.test.tsx`

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { describeAreaGuard } from './helpers/text-area-guard.ts';
import { TextLayerProvider, textSnapshot } from '@/text/runtime.tsx';
import { ApiError, errorMessage } from '@/lib/errors.ts';
import { checkValue } from '@/text/resolve.ts';
import { TEXT_ENTRIES } from '@/text/registry.ts';

describeAreaGuard('shell + system', ['layouts/StorefrontShell.tsx', 'layouts/MenuShell.tsx', 'layouts/WebAppShell.tsx', 'layouts/ShellFooter.tsx', 'layouts/Chromeless.tsx', 'components/', 'features/NotFoundPage.tsx', 'features/closed/', 'app/App.tsx', 'lib/errors.ts', 'api/client.ts', 'builder/blocks/NavLinks.tsx', 'builder/blocks/Video.tsx']);

afterEach(cleanup);
describe('system wording', () => {
  it('errorMessage fallbacks resolve at call time', () => {
    expect(errorMessage(new Error('x'))).toBe('Something went wrong');
    expect(errorMessage(new ApiError(429, 'x'))).toBe('Too many attempts — please wait a moment and try again');
    render(<TextLayerProvider text={{ locale: 'en', formatLocale: '', shared: { 'errors.generic': 'Oops' }, layout: {} }}><span /></TextLayerProvider>);
    expect(errorMessage(new Error('x'))).toBe('Oops');
    expect(errorMessage(new ApiError(400, 'Backend says no'))).toBe('Backend says no');
  });
  it('closed.* and boot.* are fixed and never take a stored value', () => {
    const fixed = Object.keys(TEXT_ENTRIES).filter((k) => k.startsWith('closed.') || k.startsWith('boot.'));
    expect(fixed.length).toBeGreaterThan(3);
    for (const k of fixed) {
      expect(TEXT_ENTRIES[k]!.fixed, k).toBe(true);
      expect(checkValue(k, 'x')).toMatchObject({ ok: false, rule: 'fixed' });
    }
    expect(textSnapshot()).toBeDefined();
  });
});
```

- [ ] **Step 3: Run it to verify it fails** → FAIL.

- [ ] **Step 4: Extract per the playbook.** Area-specific rules:
  - `lib/errors.ts` (non-React, 8 tests import it): `errorMessage(err, fallback?)` — default fallback `textSnapshot().t('errors.generic')`, 429 → `errors.rateLimited`, 502 → `errors.unavailable`; the `ApiError` class is unchanged.
  - `api/client.ts` `toApiError`: `'Request failed'` / `'The request timed out'` → `textSnapshot().t('errors.requestFailed' | 'errors.timeout')` at throw time. `'STOREFRONT_DISABLED'` comparisons are codes, untouched.
  - `App.tsx` `SettingsBoundary` error screen (renders above `TextProvider`): `boot.eyebrow` "Connection", `boot.titleNamed` "We can't reach {shop}", `boot.title` "We can't reach the shop", `boot.description`, `boot.retry` "Try again" — all `fixed: true` (a fixed key may repeat a common wording; spec §6.2 keeps boot screens out of the editor). `useText()` there returns the defaults.
  - `ClosedPage.tsx`: `closed.eyebrow` "Currently closed", `closed.message` "{shop} isn't taking orders right now. Check back shortly." (only when `closedMessage` is empty — owner text wins as today), `closed.supportAriaLabel` "Support" — all `fixed: true`.
  - Shell headers: "Your account"/"Sign in" → `common.nav.yourAccount` / `common.actions.signIn`; `` `Cart, ${…}` `` → `shell.header.cartAriaLabel` with the same value it prints today (if the source text is `Cart, ${count} items`-shaped with its own ternary, follow playbook 6); "Categories — one category selected" / "Categories" → keys; WebAppShell `aria-label="Back"` → `shell.webapp.back` (spec §6.4 example).
  - `components/PageSkeleton.tsx` `aria-label="Loading"` → `common.status.loading`; `ContactLinks.tsx` channel names → `common.contact.*`.
  - `NavLinks.tsx` (spec §6.4): schema `ariaLabel: z.string().max(40)`, `defaultProps.ariaLabel: ''`, `textProps: { ariaLabel: 'shell.nav.ariaLabel' }`; render a small inner view component that calls `useText()` and sets `aria-label={ariaLabel.trim() || t('shell.nav.ariaLabel')}` (a block's `render` must not call hooks). NavLinks is in no default document, so parity is unaffected.
  - `builder-neutral-fallbacks.test.tsx` (spec conflict 2): the test "an invalid NavLinks ariaLabel falls back to none rather than the "Site" placeholder" becomes "an empty NavLinks ariaLabel uses the shell.nav.ariaLabel site text": `expect(container.querySelector('nav')!.getAttribute('aria-label')).toBe('Site')`. Change nothing else in that file.
  - `Video.tsx` `title={title.trim() || 'Video'}` → inner view `t('common.video.title')`.

- [ ] **Step 5: Run the checks** → PASS (including `builder-neutral-fallbacks.test.tsx` with the one updated assertion).

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(text): shells, boot and closed screens, error fallbacks move into the text registry; Links falls back to site text

builder-neutral-fallbacks: an empty NavLinks ariaLabel now renders the shell.nav.ariaLabel
site text (editable-text spec §6.4) instead of no label — the one assertion updated." -- web/src/layouts/StorefrontShell.tsx web/src/layouts/MenuShell.tsx web/src/layouts/WebAppShell.tsx web/src/layouts/ShellFooter.tsx web/src/layouts/Chromeless.tsx web/src/layouts/shell-context.ts web/src/components web/src/features/NotFoundPage.tsx web/src/features/closed web/src/app/App.tsx web/src/lib/errors.ts web/src/api/client.ts web/src/builder/blocks/NavLinks.tsx web/src/builder/blocks/Video.tsx web/src/text/keys/shell.ts web/src/text/keys/boot.ts web/src/text/keys/closed.ts web/src/text/keys/errors.ts web/src/text/keys/common.ts web/test/builder-neutral-fallbacks.test.tsx web/test/text-guard-shell.test.tsx
```
(Only list the `layouts/*` files you actually changed.)

---

### Task 14: Extract template slot copy

**Depends on:** Task 5. **Wave 4.** Follow the **Extraction playbook**.

**Files:**
- Modify: `web/src/templates/contract.ts` (export `useText`), every file under `web/src/templates/defaults/`, `web/src/templates/bento/slots/`, `web/src/templates/cyber-brutalism/slots/`, `web/src/templates/dark-luxury/slots/`
- Modify: `web/src/text/keys/templates.ts`
- Create: `web/test/text-guard-templates.test.tsx`
- Existing tests, unedited: `template-bento.test.tsx`, `template-cyber-brutalism.test.tsx`, `template-dark-luxury.test.tsx`, `template-imports.test.ts`, `templates-*.test.ts(x)`, `core-scope.test.tsx`, `builder-content-layout.test.tsx`.

**Interfaces:**
- Consumes: Task 5 API.
- Produces: `templates.<id>.*` keys — `templates.default.*` for `templates/defaults/**` (the built-in slots every template without its own slot uses), `templates.bento.*`, `templates.cyber-brutalism.*`, `templates.dark-luxury.*`. `useText` exported from `@/templates/contract.ts`.

- [ ] **Step 1: Load `frontend-design:frontend-design`.**

- [ ] **Step 2: Write the failing guard + override test** — `web/test/text-guard-templates.test.tsx`

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { describeAreaGuard } from './helpers/text-area-guard.ts';
import { TEXT_ENTRIES } from '@/text/registry.ts';
import { readoutLines } from '@/templates/cyber-brutalism/slots/readout.ts';
import * as contract from '@/templates/contract.ts';

describeAreaGuard('templates', ['templates/defaults/', 'templates/bento/slots/', 'templates/cyber-brutalism/slots/', 'templates/dark-luxury/slots/', 'templates/contract.ts']);

afterEach(cleanup);
describe('template copy', () => {
  it('the contract exports useText for external templates', () => {
    expect(typeof contract.useText).toBe('function');
  });
  it('keys are per template id (the default slots use templates.default.*)', () => {
    expect(TEXT_ENTRIES['templates.default.footer.support']?.en).toBe('Support');
    expect(TEXT_ENTRIES['templates.bento.footer.support']?.en).toBe('Support');
  });
  it('readout lines keep today\'s wording', () => {
    expect(readoutLines({ productCount: 12, cutoff: null, accepting: true })).toEqual(['ITEMS 12', 'ORDERING ONLINE']);
  });
});
```

(`templates.default.footer.support` and `templates.bento.footer.support` are pinned names; choose the rest freely.)

- [ ] **Step 3: Run it to verify it fails** → FAIL.

- [ ] **Step 4: Extract per the playbook.** Area-specific rules:
  - Slot components import `useText` from `@/templates/contract.ts` (playbook 15); add `export { useText } from '@/text/runtime.tsx';` there (`template-cyber-brutalism.test.tsx` mocks the contract with `importOriginal`, so the new export passes through).
  - `DefaultCatalogHero.tsx` `{productCount} products{categoryCount > 0 ? \` · ${categoryCount} categories\` : ''}` has no `=== 1` ternary: keep two string keys with placeholders (`templates.default.hero.products` "{count} products", `templates.default.hero.categories` " · {count} categories") under the same condition — the rendered bytes must not change.
  - `readout.ts` `readoutLines()` (pure, tested): `textSnapshot().t('templates.cyber-brutalism.readout.cutoff', { cutoff })` etc.; `DEFAULT_NODE = 'NODE_01'` is an owner-overridable data default with no space — leave it.
  - Cyber strings (`CONNECTION SECURE`, `&gt; ACCESS GRANTED_`, `SYS.TIME`, `NODE:`, `SKU:`, `//SCN_01`) are template copy → keys (decode `&gt;` to `>`); Luxury `[ACCEPTING ORDERS]` etc. and Bento "Order by … today … for … dispatch" likewise, one key per sentence shape.
  - Identical wordings in different templates stay separate keys (`templates.bento.footer.support`, `templates.default.footer.support`): the Text panel shows only the active template's group (spec §7.2).

- [ ] **Step 5: Run the checks** → PASS.

- [ ] **Step 6: Commit** — `git commit -m "feat(text): template slot copy moves into the text registry (templates.<id>.*)" -- web/src/templates/contract.ts web/src/templates/defaults web/src/templates/bento/slots web/src/templates/cyber-brutalism/slots web/src/templates/dark-luxury/slots web/src/text/keys/templates.ts web/test/text-guard-templates.test.tsx`

---

### Task 15: Switch the guard on; registry integrity; block text patterns; docs

**Depends on:** Tasks 6–14. **Wave 5.**

**Files:**
- Create: `web/test/text-guard.test.ts`, `web/test/text-registry.test.ts`, `web/test/text-inventory.test.ts`, `web/src/text/site-wide.ts`
- Modify: `web/test/text-guard.allow.ts` (merge every per-area `allow` entry), `web/test/text-guard-*.test.tsx` (remove the `describeAreaGuard(...)` call and its import only — keep their override tests), `web/test/text-scan.test.ts` (remove the `TEXT_INVENTORY_WRITE` writer), every `web/src/builder/blocks/*.tsx` that renders site text (add `text: [...]`), any leftover source file the global guard flags, `web/src/text/keys/common.ts` (only to consolidate "candidate for common" duplicates reported by Tasks 6–14, updating their call sites), `docs/builder.md`
- Delete: `web/test/helpers/text-area-guard.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `SITE_WIDE_TEXT: readonly TextKeyPattern[]` (the Text panel's Site-wide group: cart drawer, login modal, phone cart bar safety net, Telegram chrome, not-found page, error fallbacks — spec §7.3); `text` on every block whose render shows site text (e.g. `CheckoutFlow: ['checkout.*']`, `Header: ['shell.header.*', 'catalog.search.*', 'common.nav.*', 'common.actions.signIn']`, `CartSummary: ['cart.summary.*', 'common.totals.subtotal']`, `Footer`/`TopBar`/`CatalogHero`: their `templates.default.*` and `templates.<id>.*` prefixes).

- [ ] **Step 1: Write the failing tests**

`web/test/text-guard.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { scanFiles, sourceFiles, staleEntries, unallowed } from './helpers/text-scan.ts';
import { TEXT_GUARD_ALLOW } from './text-guard.allow.ts';

describe('text guard (spec §6.6)', () => {
  const findings = scanFiles(sourceFiles());
  it('no shopper text outside the registry', () => {
    expect(unallowed(findings, TEXT_GUARD_ALLOW).map((f) => `${f.file}:${f.line} ${f.rule} ${JSON.stringify(f.text)}`)).toEqual([]);
  });
  it('no stale allowlist entry', () => {
    expect(staleEntries(findings, TEXT_GUARD_ALLOW)).toEqual([]);
  });
});
```

`web/test/text-inventory.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { missingFromDefaults, readInventory } from './helpers/text-scan.ts';
import { TEXT_GUARD_ALLOW } from './text-guard.allow.ts';

describe('v0.7.0 wording survives in the defaults', () => {
  it('every inventory literal occurs character-exact in some built-in default', () => {
    const out: string[] = [];
    for (const [file, texts] of Object.entries(readInventory())) {
      const kept = texts.filter((t) => !TEXT_GUARD_ALLOW.some((e) => e.file === file && (e.text === '*' || e.text === t)));
      for (const t of missingFromDefaults(kept)) out.push(`${file}: ${t}`);
    }
    expect(out).toEqual([]);
  });
});
```

`web/test/text-registry.test.ts`:

```ts
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SRC_ROOT } from './helpers/text-scan.ts';
import { formsOf, placeholdersOf } from '@/text/define.ts';
import { checkValue } from '@/text/resolve.ts';
import { matchesTextPattern, TEXT_AREAS, TEXT_ENTRIES } from '@/text/registry.ts';
import { SITE_WIDE_TEXT } from '@/text/site-wide.ts';
import { BLOCKS } from '@/builder/registry.ts';
import { DEFAULT_MAX, KEY_RE, TEXT_LIMITS } from '@/text/types.ts';
import { readdirSync } from 'node:fs';

const keys = Object.keys(TEXT_ENTRIES);
const srcFiles = (dir = SRC_ROOT): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const abs = path.join(dir, d.name);
  if (d.isDirectory()) return abs.includes(`${path.sep}text${path.sep}keys`) ? [] : srcFiles(abs);
  return /\.(ts|tsx)$/.test(d.name) ? [abs] : [];
});

describe('text registry (spec §6.6)', () => {
  it('keys are well-formed and belong to a known area', () => {
    for (const k of keys) {
      expect(KEY_RE.test(k) && k.length <= TEXT_LIMITS.key, k).toBe(true);
      expect(TEXT_AREAS, k).toContain(k.slice(0, k.indexOf('.')));
    }
  });
  it('fixed exactly for closed.* and boot.*', () => {
    for (const k of keys) expect(Boolean(TEXT_ENTRIES[k]!.fixed), k).toBe(k.startsWith('closed.') || k.startsWith('boot.'));
  });
  it('every default passes checkValue (fixed keys: shape only) and fits its max', () => {
    for (const k of keys) {
      const e = TEXT_ENTRIES[k]!;
      const max = e.max ?? DEFAULT_MAX;
      expect(max <= TEXT_LIMITS.value, k).toBe(true);
      for (const f of formsOf(e.en)) expect(f.length <= max, `${k}: ${f.length} > ${max}`).toBe(true);
      expect(placeholdersOf(e).size <= TEXT_LIMITS.placeholders, k).toBe(true);
      if (!e.fixed) expect(checkValue(k, e.en), k).toEqual({ ok: true });
      expect(e.note && e.note.length > 5, `${k} needs a note`).toBe(true);
    }
  });
  it('no orphans: every non-fixed key is referenced as a literal under web/src (outside text/keys)', () => {
    const corpus = srcFiles().map((f) => readFileSync(f, 'utf8')).join('\n');
    const orphans = keys.filter((k) => !TEXT_ENTRIES[k]!.fixed && !corpus.includes(`'${k}'`) && !corpus.includes(`"${k}"`));
    expect(orphans).toEqual([]);
  });
  it('every non-fixed key is covered by a block\'s text patterns or the site-wide group', () => {
    const patterns = [...SITE_WIDE_TEXT, ...Object.values(BLOCKS).flatMap((b) => b.text ?? [])];
    expect(keys.filter((k) => !TEXT_ENTRIES[k]!.fixed && !patterns.some((p) => matchesTextPattern(k, p)))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm --prefix web test -- test/text-guard.test.ts test/text-registry.test.ts test/text-inventory.test.ts` → FAIL (`@/text/site-wide.ts` missing; coverage and any leftovers listed).

- [ ] **Step 3: Make them pass**
  - Move every per-area `allow` entry into `TEXT_GUARD_ALLOW` (keep the reason), then remove `describeAreaGuard` from the nine `text-guard-*.test.tsx` files; delete `helpers/text-area-guard.ts`; remove the inventory writer from `text-scan.test.ts`.
  - Fix every leftover global finding: shopper text → a key in the right area (you may edit any area file now — no extraction task is running); editor/admin/code text → an allowlist entry with a reason.
  - **Manual sweep** (spec §13.12): `grep -rnE "['\`\"][A-Z][a-z]+( [a-z’']+)+" web/src/features web/src/layouts web/src/components web/src/lib web/src/templates` — every hit is a key, a data/owner value, or allowlisted.
  - Consolidate the "candidate for common" duplicates Tasks 6–14 reported (one key per meaning), updating call sites.
  - Create `web/src/text/site-wide.ts`:

```ts
import type { TextKeyPattern } from '@/text/registry.ts';

/**
 * Keys of system mounts that belong to no block (spec §7.3): cart drawer, login modal, the phone cart bar
 * safety net, Telegram chrome, the not-found page and error fallbacks. The editor's Text panel shows them
 * as the "Site-wide" group.
 */
export const SITE_WIDE_TEXT: readonly TextKeyPattern[] = [
  'cart.drawer.*', 'cart.bar.*', 'auth.modal.*', 'webapp.*', 'shell.notFound.*', 'shell.webapp.*', 'errors.*', 'common.*',
];
```
  (Adjust the prefixes to the real key names the extraction tasks chose; keep the list to genuinely block-less mounts plus `common.*`.)
  - Add `text: [...]` to every block in `web/src/builder/blocks/` that renders site text — route blocks name their area (`OrderStatus: ['order.*']`, `PaymentSuccess: ['payment.success.*', 'common.actions.backToShop']`, `ProductGrid: ['catalog.grid.*', 'common.list.*', 'product.stock.*', …]`), shell blocks their parts; template-slot blocks (`Footer`, `TopBar`, `CatalogHero`, `Header` icons) list `templates.default.<part>.*` and each template's `templates.<id>.<part>.*`.

- [ ] **Step 4: Document the text layer in `docs/builder.md`** — a new `## Text layer (editable text)` section after "Block library": the registry (one file per area, entry fields, key shape), `useText`/`t`/`tp`/`tn`/`msg`/`textKey`/`textSnapshot` with the playbook rules 4–12 condensed, resolution order and rejection rules, fixed keys, the format profile, the guard and its allowlist, `BlockDef.text`/`textProps`, and "how to add a string" (add the key with a note, call `t`, run `test/text-guard.test.ts`). Example keys only; `shop.example` for any URL.

- [ ] **Step 5: Run everything**

Run: `npm --prefix web test` → PASS. `npm --prefix web run typecheck` → PASS. `npm --prefix web run build` → PASS (builder-isolation check unchanged). `npm test` (repo root: web, worker, scripts) → PASS.

- [ ] **Step 6: Commit**

```bash
git commit -m "test(text): text guard, registry integrity and v0.7.0 inventory checks on for all of web/src; block text patterns; docs" -- web/test web/src/text web/src/builder/blocks docs/builder.md <any leftover source files you changed>
```
(List the leftover source files explicitly; `web/test` and `web/src/text` as directories are fine because no other task is running in this wave.)

---

### Task 16: End-to-end — published text in the mocked Playwright suite; full parity run

**Depends on:** Task 15. **Wave 6.** **Owns Playwright** (the only task that runs `npm run test:e2e`).

**Files:**
- Modify: `e2e/mocks.ts` (a `text` option for the pages route)
- Create: `e2e/text.spec.ts`
- Modify only if a parity diff proves it necessary: the `web/src/text/keys/*.ts` default or the call site that drifted (never a snapshot)

**Interfaces:**
- Consumes: pinned keys `common.totals.subtotal`, `cart.summary.items`, `checkout.errors.required`; the public-read shape of spec §4.6.
- Produces: `InstallMocksOptions.text?: MockText` (exported `MockText`) where

```ts
export interface MockText {
  version?: number;                 // default 1
  locale?: string;                  // default 'en'
  formatLocale?: string;            // default ''
  shared?: Record<string, unknown>; // active-locale shared strings
  layout?: Partial<Record<Layout, Record<string, unknown>>>; // per-layout overrides
}
```
  With `text` unset the pages route keeps serving exactly today's body (`null`, or `{ version: 1, data: set }`) — spec §9.

- [ ] **Step 1: Extend `e2e/mocks.ts`** — add `text?: MockText` to the options and `text: MockText | null` to `MockState` (`options.text ?? null`), and in the pages route:

```ts
      const set = state.pages[pages[1] as Layout] ?? null;
      if (!state.text) {
        await envelope(route, set ? { version: 1, data: set } : null);
        return;
      }
      await envelope(route, {
        version: set ? 1 : 0,
        data: set,
        text: {
          version: state.text.version ?? 1,
          locale: state.text.locale ?? 'en',
          formatLocale: state.text.formatLocale ?? '',
          shared: state.text.shared ?? {},
          layout: state.text.layout?.[pages[1] as Layout] ?? {},
        },
      });
      return;
```

- [ ] **Step 2: Write `e2e/text.spec.ts`**

Each scenario installs its mocks once (routes registered later win in Playwright, so a second `installMocks` in one test is avoided). `Alpine Extract 10ml` is the product the existing specs add; `onlyVisible` picks the visible copy of controls both shells keep in the DOM.

```ts
import { expect, test, type Page } from '@playwright/test';
import { installMocks, type Layout, type MockHandle, type MockText } from './mocks.ts';
import { addFirstToCart, FIXED_NOW, onlyVisible, openProduct } from './flows.ts';

const PRODUCT = 'Alpine Extract 10ml';

/** Signed in, one Alpine Extract in the cart, then the cart page. */
async function cartWithOne(page: Page, layout: Layout, text?: MockText): Promise<MockHandle> {
  await page.clock.setFixedTime(FIXED_NOW);
  const mocks = await installMocks(page, { layout, session: true, text });
  await page.goto('/');
  await openProduct(page, layout, PRODUCT);
  await addFirstToCart(page, layout, mocks);
  await page.goto('/cart');
  return mocks;
}

const subtotalLabel = (page: Page, label: string) => onlyVisible(page.getByText(label, { exact: true }));

test.describe('published site text', () => {
  for (const layout of ['storefront', 'menu', 'webapp'] as const) {
    test(`a shared edit shows on the ${layout} layout`, async ({ page }) => {
      await cartWithOne(page, layout, { shared: { 'common.totals.subtotal': 'Sub-total' } });
      await expect(subtotalLabel(page, 'Sub-total')).toBeVisible();
      await expect(page.getByText('Subtotal', { exact: true })).toHaveCount(0);
    });
  }

  test('a layout override shows on its layout', async ({ page }) => {
    await cartWithOne(page, 'menu', { shared: { 'common.totals.subtotal': 'Sub-total' }, layout: { menu: { 'common.totals.subtotal': 'Menu total' } } });
    await expect(subtotalLabel(page, 'Menu total')).toBeVisible();
  });

  test('another layout\'s override does not leak', async ({ page }) => {
    await cartWithOne(page, 'storefront', { shared: { 'common.totals.subtotal': 'Sub-total' }, layout: { menu: { 'common.totals.subtotal': 'Menu total' } } });
    await expect(subtotalLabel(page, 'Sub-total')).toBeVisible();
    await expect(page.getByText('Menu total')).toHaveCount(0);
  });

  test('an override with an unknown placeholder falls back to the shared value', async ({ page }) => {
    await cartWithOne(page, 'storefront', { shared: { 'common.totals.subtotal': 'Sub-total' }, layout: { storefront: { 'common.totals.subtotal': 'Total {oops}' } } });
    await expect(subtotalLabel(page, 'Sub-total')).toBeVisible();
    await expect(page.getByText('Total {oops}')).toHaveCount(0);
  });

  test('cart plural at 1 and 2 items', async ({ page }) => {
    await cartWithOne(page, 'storefront', { shared: { 'cart.summary.items': { one: '{count} thing', other: '{count} things' } } });
    await expect(onlyVisible(page.getByText('1 thing', { exact: true }))).toBeVisible();
    await onlyVisible(page.getByRole('button', { name: `One more ${PRODUCT}` })).click();
    await expect(onlyVisible(page.getByText('2 things', { exact: true }))).toBeVisible();
  });

  test('an edited checkout validation message', async ({ page }) => {
    await cartWithOne(page, 'storefront', { shared: { 'checkout.errors.required': 'Please fill this in' } });
    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
    await page.getByRole('textbox', { name: 'First name' }).fill('');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(onlyVisible(page.getByText('Please fill this in', { exact: true }))).toBeVisible();
  });

  test('de + de-DE sets <html lang> and German money', async ({ page }) => {
    const mocks = await cartWithOne(page, 'storefront', { locale: 'de', formatLocale: 'de-DE' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: mocks.state.settings.currency }).format(mocks.state.cart.subtotal);
    await expect(onlyVisible(page.getByText(money, { exact: true }))).toBeVisible();
  });

  test('de-DE dates on the account order page', async ({ page }) => {
    await page.clock.setFixedTime(FIXED_NOW);
    const mocks = await installMocks(page, { layout: 'storefront', session: true, text: { locale: 'de', formatLocale: 'de-DE' } });
    await page.goto('/account/orders/K4M2QP');
    const date = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(mocks.state.orderDetail.createdAt));
    await expect(onlyVisible(page.getByText(date, { exact: false }))).toBeVisible();
  });

  test('a 503 renders the defaults', async ({ page }) => {
    await page.clock.setFixedTime(FIXED_NOW);
    await installMocks(page, { layout: 'storefront', session: true, pagesFail: 503, text: { shared: { 'common.totals.subtotal': 'Sub-total' } } });
    await page.goto('/');
    await expect(onlyVisible(page.getByRole('link', { name: /^Cart, / }))).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('an old-shape response renders the defaults', async ({ page }) => {
    await cartWithOne(page, 'storefront');
    await expect(subtotalLabel(page, 'Subtotal')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});
```

Export `MockText` from `e2e/mocks.ts`. If `mocks.state.cart.subtotal` or `mocks.state.orderDetail.createdAt` is named differently in `e2e/mocks.ts` / `web/src/types/*`, use the real field — the assertion stays "the value formatted with `de-DE`". Under a 503 the add-to-cart flow still works (the pages route is the only failing one), but the 503 scenario only needs a rendered page, so it stays on `/`.

- [ ] **Step 3: Run the new spec** — `npm run test:e2e -- text.spec.ts` → PASS.

- [ ] **Step 4: Run the whole mocked suite** — `npm run test:e2e` → PASS, including `dom-parity.spec.ts` (**no `--update-snapshots`**), `templates.spec.ts`, `templates-baseline*.spec.ts`, `builder.spec.ts`, `builder-editor.spec.ts`, `telegram-webapp.spec.ts`. A parity diff means a default drifted: find the key whose default differs from the snapshot text (apostrophe, space, dash, a merged word boundary), fix the default or the call site, and re-run. A snapshot is never regenerated without the user's explicit OK (overview rule 1).

- [ ] **Step 5: Final gates** — `npm test` (repo root), `npm --prefix web run typecheck`, `npm --prefix web run build` → PASS.

- [ ] **Step 6: Commit**

```bash
git commit -m "test(e2e): published site text — shared, per-layout, fallback, plurals, validation, language and formatting" -- e2e/mocks.ts e2e/text.spec.ts <any key file or call site fixed for parity>
```

---

## Cross-plan contract assumptions

- `EditorText` = `TextLayers` = `{ locale, formatLocale, shared: LocaleStrings, layout: LocaleStrings }` (active locale only); `PageSetOverrideProvider({ pageSet, text?: EditorText, children })`; the editor may also mount `TextLayerProvider` (`@/text/runtime.tsx`) directly. The editor must pass a memoised `text` object (resolution is memoised per object identity).
- `checkValue(key: string, value: unknown): { ok: true } | { ok: false; rule: TextRule; message: string }` with `TextRule` exactly the spec §6.3 ids; the editor builds `TextIssue { scope, key, rule, message }` from it and drops `unknown-key` from blocking issues.
- Registry exports for the editor: `TEXT_ENTRIES`, `TEXT_AREAS` (panel group order), `textLabel(key)`, `matchesTextPattern(key, pattern)`, `isPluralKey`, `placeholdersOf(entry)` (`@/text/define.ts`), `categoriesFor(locale)` (`@/text/plural.ts`), `isLocale`, `LOCALE_RE`, `KEY_RE`, `TEXT_LIMITS`, `isTextValue` (`@/text/types.ts`).
- This plan adds `BlockDef.text?: readonly TextKeyPattern[]` and `BlockDef.textProps?` (Task 5 types, Task 15 values) and `SITE_WIDE_TEXT` in `web/src/text/site-wide.ts`; the editor plan consumes them and does not re-declare them.
- This plan adds `PageSet.text?: PageText` to `web/src/builder/types.ts` (Task 3); the editor plan adds `text` to `protocol.ts`'s strict `pageSetSchema` and `toPageSet`.
- Key regex allows `-` in later segments (template ids such as `cyber-brutalism`): the backend's key check must accept `^[a-z]+(\.[A-Za-z0-9][A-Za-z0-9-]*){1,5}$` (≤ 100 chars).
- Template keys: `templates.default.*` for the built-in default slots, `templates.<templateId>.*` per template; the Text panel's templates group shows `templates.default.*` plus the active template's keys.
- Public read shape exactly spec §4.6 (`data: null | { version, data, text: { version, locale, formatLocale, shared, layout } | null }`); the storefront treats a missing `text`, `text: null`, or a malformed `text` as "no text".
- `closed.*` and `boot.*` keys are `fixed: true` and hidden from the Text panel; the editor filters them with `TEXT_ENTRIES[k].fixed`.
