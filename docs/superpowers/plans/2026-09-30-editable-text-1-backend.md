# Editable text — Plan 1: Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `ecommerce-backend` a per-store **Site text** document (draft / publish / last-20 history / restore), carry per-layout text overrides inside page sets, publish both documents in one transaction, pin the live text version on every page version, and serve both text layers for the active locale in the existing public page-set read.

**Architecture:** A new `storefront_site_text` table (the page-set table's shape without `layout`) behind a new `src/modules/storefront-text/` module built exactly like `storefront-pages` (router / controller / service / schemas + a `store.ts` query seam, service tested against an in-memory fake). `storefront-pages` gains a nullable `text_version` pin, an optional `text` field in `pageSetSchema`, a publish body with `text.baseVersion`, a restore body with `withText`, and a public read that returns `{ version, data, text }`. Every transaction that holds both locks takes them through one helper, `lockTextThenLayout()`, in the order text → layout.

**Tech Stack:** Express 5, Drizzle ORM on Postgres (drizzle-kit 0.31), Zod 4.3, Vitest 4.

**Spec:** `ecommerce-storefront/docs/superpowers/specs/2026-09-30-editable-text-design.md` — this plan implements §3 (data model, backend mirror), §4 (all of it) and §11 step 1 (backend deploy notes). Cross-stage rules: `ecommerce-storefront/docs/superpowers/specs/2026-09-30-puck-editable-overview.md`. House rules: `ecommerce-storefront/.superpowers/sdd/house-rules.md`.

All paths below are relative to `ecommerce-backend/` (the backend worktree on branch `feature/puck-editable`) unless they start with another repo name.

## Global Constraints

- Work only in the `feature/puck-editable` worktree of `ecommerce-backend/`. Never touch the main checkout, never push, never merge.
- **Never touch a database.** `.env` holds a copy of production. Do not run `npm run dev`, `npm run db:push`, `npm run db:migrate`, `npm run seed`, any `scripts/*.ts`, or anything else that opens a Postgres connection. `npm run db:generate` is allowed (it diffs snapshots offline; the config's fallback URL is never contacted). Migrations apply on the next deploy's startup.
- Backend conventions (`CLAUDE.md`): strict `router.ts` / `controller.ts` / `service.ts` / `schemas.ts` per module plus helper files as in `storefront-pages/`; **extensionless imports everywhere**; throw `AppError` subclasses from `src/utils/errors.ts`; responses through `sendSuccess`; the envelope's `error` string **is** the code (`{ success: false, data: null, error: 'SITETEXT_CONFLICT' }`). Controllers `.parse()` bodies/params themselves (a ZodError → 400 via `errorHandler`, rendered `"path: message; …"`), exactly as `storefront-pages/controller.ts` does — not `validate()` (422).
- Non-DB side effects (`emitEvent`) run only **after** the transaction commits, and only for what was inserted.
- Test gate: `npm test` (Vitest). Baseline before this plan: **155 files / 2121 tests, all passing**. `npx tsc --noEmit` and `npm run build` skip `*.test.ts`, so run `npm test` too.
- Test patterns allowed (existing ones only): `vi.mock` of a store seam with an in-memory fake (`storefront-pages/service.test.ts`), an express app on port 0 hit with `fetch` (`storefront-pages/router.test.ts`), `.toSQL()` / `PgDialect().sqlToQuery()` pinning with no connection (`storefront-pages/store.test.ts`), `getTableConfig` on a Drizzle table. No real Postgres, no supertest.
- Commit by explicit pathspec only; new files need `git add <paths>` first. Never `git add -A`, `git stash`, reset or checkout others' files. Every commit message ends with these two lines (house rule 6):
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4
  ```
- If a sibling task's file breaks typecheck/tests, wait a minute and re-run; never edit it. Blocked → report BLOCKED / NEEDS_CONTEXT.
- No task in this plan runs Playwright.

**HTTP contract (spec §4.2, §4.4–4.6 — fixed, the admin and storefront plans depend on it; all under `/api/v1`, admin JWT `authenticate, authorize('admin')` unless noted):**

| Method + path | Request | `data` |
|---|---|---|
| `GET /storefront-text/draft` | — | `{ source: 'draft'\|'published'\|'none', data: SiteText\|null, baseVersion, latestPublishedVersion, updatedAt: string\|null }` |
| `PUT /storefront-text/draft` | `{ data: SiteText, baseVersion }` | `{ baseVersion, updatedAt }`; `409 SITETEXT_CONFLICT` if `baseVersion < latestPublishedVersion` |
| `DELETE /storefront-text/draft` | — | `{ discarded: boolean }` |
| `GET /storefront-text/versions` | — | `Array<{ version, createdAt, createdBy: { id, name } \| null }>`, newest first |
| `GET /storefront-text/versions/:version` | — | `{ version, createdAt, data: SiteText }` |
| `POST /storefront-text/versions/:version/restore` | — | `{ version }` (new version; draft reset to it) |
| `POST /storefront-pages/:layout/publish` | `{ baseVersion, text?: { baseVersion } }` | `{ version, publishedAt, pagesPublished, textVersion, textPublished }` |
| `GET /storefront-pages/:layout/versions` | — | each row adds `textVersion: number \| null` |
| `GET /storefront-pages/:layout/versions/:version` | — | adds `textVersion: number \| null` |
| `POST /storefront-pages/:layout/versions/:version/restore` | optional `{ withText?: boolean }` (default `false`) | `{ version, textVersion, textRestored }`; `409 TEXT_VERSION_GONE` |
| `GET /public/storefront/pages/:layout` (no auth, kill switch) | — | `null` \| `{ version, data: PageSet-without-text \| null, text: { version, locale, formatLocale, shared, layout } \| null }` |

- Error strings: `SITETEXT_CONFLICT` (409), `PAGESET_CONFLICT` (409), `NO_DRAFT` (400), `TEXT_VERSION_GONE` (409).
- Socket event `storefront-text:published` `{ version }` → `role:admin`, after any text publish or text restore that **inserted** a version. `storefront-pages:published` `{ layout, version }` unchanged, only when a page version was inserted.
- Lock SQL: text `select pg_advisory_xact_lock(hashtext($1))` with `$1 = 'storefront_text'` (`textLockSql()`); layout lock unchanged (`'storefront_pages:<layout>'`). Publish and page restore always take **text, then layout** via `lockTextThenLayout()`; text-only writes take only the text lock; page draft save/discard only the layout lock.
- Validation limits (spec §4.3, verbatim): `TEXT_LIMITS = { locales: 10, keysPerLocale: 3000, key: 100, value: 1000, placeholders: 10, docBytes: 256 * 1024 }`; locale `^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|\d{3}))?$` **and** `Intl.getCanonicalLocales(x)[0] === x`; control chars `/[\u0000-\u0009\u000B-\u001F\u007F]/` rejected; placeholders `\{[A-Za-z][A-Za-z0-9]{0,31}\}`, no other `{`/`}`; plural keys ⊆ `zero one two few many other`, `other` required; `siteTextSchema`/`pageTextSchema` are **strict**; a page set's `text` counts toward its 512 KB cap and is never sanitised or link-checked.
- Deploy order (spec §11): **backend first**, then storefront v0.8.0, then the admin SPA. Never reversed.

## Review Focus

Five inputs the spec implies but no spec-listed test names — each is pinned by a test in the owning task:

1. **A text key that ends in `Html`/`Url`/`Src` inside a page set's `text`** (e.g. `promo.bannerHtml` = `<b>Sale</b>`): today's `sanitizeHtmlProps` transform walks the whole set, so it would silently rewrite owner text. Expected: stored verbatim, never sanitised or link-checked. Test in Task 4.
2. **An older admin publishing (`{ baseVersion }` only) while another admin has an unpublished shared text draft**: expected the text draft stays unpublished and the new page version pins the *current* published text version. Test in Task 7.
3. **A page restore from an older admin, POSTed with no body and no content type** (Express 5 leaves `req.body` undefined): expected a normal `withText: false` restore, not a 400. Test in Task 9.
4. **A real-size Site text document (≈ 200 KB) against the global 100 KB JSON parser**: expected it reaches validation (and a ≈ 300 KB one gets the 400 naming the 256 KB cap), never a 413. Test in Task 8 (router) and Task 8 (`app.mounts.test.ts`).
5. **An active store language with no strings stored for it** (owner switched to `fr`, only `en` wording saved): expected empty `shared`/`layout` layers — never another locale's strings and never an inherited object property. Test in Task 7.

---

## File map

| File | Task | Responsibility |
|---|---|---|
| `src/modules/storefront-text/schemas.ts` (new) | 1 | `TEXT_LIMITS`, regexes, `isCanonicalLocale`, `textStringProblem`, `textValueProblems`, `siteTextSchema`, `pageTextSchema`, request schemas, TS types |
| `src/modules/storefront-text/schemas.test.ts` (new) | 1 | every §4.3 accept/reject rule |
| `src/db/schema/storefront-text.ts` (new) | 2 | `storefrontSiteText` table + `Stored*` text types |
| `src/db/schema/storefront-pages.ts` | 2 | `text_version` column; `StoredPageSet.text?` |
| `src/db/schema/index.ts` | 2 | export the new schema |
| `src/db/schema/storefront-text.test.ts` (new) | 2 | pins table shape + that migration 0046 exists |
| `drizzle/0046_*.sql`, `drizzle/meta/0046_snapshot.json`, `drizzle/meta/_journal.json` | 2 | generated migration |
| `src/modules/storefront-text/store.ts` (new) | 3 | every Site text query + `textLockSql` / `lockText` |
| `src/modules/storefront-text/store.test.ts` (new) | 3 | SQL pins |
| `src/modules/storefront-pages/schemas.ts` | 4 | `text` in `pageSetSchema`, sanitise only `shell`/`pages`, `publishBodySchema.text`, `restoreBodySchema` |
| `src/modules/storefront-pages/schemas.test.ts` | 4 | text in page sets, request bodies |
| `src/modules/storefront-text/service.ts` (new) | 5 | draft/versions/restore + in-transaction helpers for publish/restore |
| `src/modules/storefront-text/store.fake.ts` (new) | 5 | in-memory fake of the text store, shared by two service tests |
| `src/modules/storefront-text/service.test.ts` (new) | 5 | service behaviour |
| `src/modules/storefront-pages/store.ts` | 6 | `lockTextThenLayout`, `textVersion` on writes and version lists |
| `src/modules/storefront-pages/store.test.ts` | 6 | lock order, SQL pins |
| `src/modules/storefront-pages/service.ts` | 7 | two-document publish, restore `withText`, pins, public read |
| `src/modules/storefront-pages/service.test.ts` | 7 | all §4.7 service cases for pages |
| `src/modules/storefront-text/controller.ts`, `router.ts`, `router.test.ts` (new) | 8 | HTTP layer |
| `src/app.ts`, `src/app.mounts.test.ts` | 8 | mount + scoped 1 MB parser |
| `src/config/modules.ts`, `src/lib/permissions.test.ts` | 8 | `storefront-text` domain in the Storefront module |
| `src/modules/storefront-pages/controller.ts`, `router.test.ts` | 9 | restore body, publish/public shapes over HTTP |
| `STOREFRONT.md`, `CLAUDE.md`, `docs/websocket-guide.md`, `src/docs/registry.ts` | 10 | docs + OpenAPI + deploy notes |

## Waves

| Wave | Tasks (parallel, disjoint files) |
|---|---|
| 1 | Task 1 (text schemas), Task 2 (DB schema + migration) |
| 2 | Task 3 (text store; needs 2), Task 4 (page-set schemas; needs 1, 2) |
| 3 | Task 5 (text service; needs 1, 3), Task 6 (pages store; needs 2, 3) |
| 4 | Task 7 (pages service; needs 4, 5, 6), Task 8 (text HTTP + mounts; needs 5) |
| 5 | Task 9 (pages controller/router; needs 4, 7), Task 10 (docs; needs 7, 8) |

After wave 5 the controller runs the final gate (end of this plan).

---

### Task 1: Site text validation schemas

**Depends on:** none. **Wave 1.**

**Files:**
- Create: `src/modules/storefront-text/schemas.ts`
- Test: `src/modules/storefront-text/schemas.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exact names later tasks import from `./schemas` / `../storefront-text/schemas`):
  - `TEXT_LIMITS` `{ locales: 10, keysPerLocale: 3000, key: 100, value: 1000, placeholders: 10, docBytes: 262144 }`
  - `TEXT_VERSION_MAX = 2_147_483_647`
  - types `PluralForms`, `TextValue`, `LocaleStrings`, `TextLanguage`, `SiteText`, `PageText`
  - `isCanonicalLocale(x: string): boolean`, `textStringProblem(s: string): string | null`, `textValueProblems(v: unknown): string[]`
  - `siteTextSchema` (output `SiteText`), `pageTextSchema` (output `PageText`)
  - `saveTextDraftBodySchema` → `SaveTextDraftInput = { data: SiteText; baseVersion: number }`
  - `textVersionParamSchema` → `{ version: number }`

- [ ] **Step 1: Write the failing test**

Create `src/modules/storefront-text/schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  TEXT_LIMITS,
  isCanonicalLocale,
  pageTextSchema,
  saveTextDraftBodySchema,
  siteTextSchema,
  textVersionParamSchema,
} from './schemas';

const doc = (strings: Record<string, unknown> = {}, language: Record<string, unknown> = { locale: 'en', formatLocale: '' }) => ({
  schemaVersion: 1,
  language,
  strings,
});
const en = (entries: Record<string, unknown>) => doc({ en: entries });

function problems(schema: z.ZodType, input: unknown): string[] {
  const r = schema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}
const siteProblems = (input: unknown) => problems(siteTextSchema, input);

describe('isCanonicalLocale', () => {
  it.each(['en', 'de', 'pt-BR', 'zh-Hant', 'sr-Latn-RS', 'es-419', 'fil'])('accepts %s', (tag) => {
    expect(isCanonicalLocale(tag)).toBe(true);
  });
  it.each(['EN', 'en_US', 'en-us', 'english', 'iw', 'en-', '', 'x-private'])('rejects %j', (tag) => {
    expect(isCanonicalLocale(tag)).toBe(false);
  });
});

describe('siteTextSchema — accepts', () => {
  it('an empty document', () => {
    expect(siteProblems(doc())).toEqual([]);
  });

  it('several locales, a plural value, a newline, placeholders and an explicit format locale', () => {
    const input = doc(
      {
        en: {
          'cart.drawer.title': 'Your basket',
          'cart.summary.items': { one: '{count} item', other: '{count} items' },
          'checkout.notes.help': 'Line one\nLine two',
          'cart.errors.stock': 'Only {available} left of {name1}',
        },
        'pt-BR': { 'cart.drawer.title': 'Seu carrinho' },
        'zh-Hant': { 'cart.drawer.title': '購物車' },
      },
      { locale: 'de', formatLocale: 'de-DE' },
    );
    expect(siteProblems(input)).toEqual([]);
    expect(siteTextSchema.parse(input)).toEqual(input);
  });

  it('every plural category', () => {
    const forms = { zero: 'z', one: 'o', two: 't', few: 'f', many: 'm', other: 'x' };
    expect(siteProblems(en({ 'cart.summary.items': forms }))).toEqual([]);
  });

  it('template keys with hyphens and six segments', () => {
    expect(siteProblems(en({ 'templates.dark-luxury.hero.title': 'x', 'a.b.c.d.e.f': 'y' }))).toEqual([]);
  });

  it('exactly 10 distinct placeholders', () => {
    const value = Array.from({ length: 10 }, (_, i) => `{p${i}}`).join(' ');
    expect(siteProblems(en({ 'cart.x.y': value }))).toEqual([]);
  });

  it('exactly the caps: 10 locales, 3 000 keys, 1 000 chars', () => {
    const locales = ['en', 'de', 'fr', 'es', 'it', 'nl', 'pl', 'pt', 'sv', 'da'];
    expect(siteProblems(doc(Object.fromEntries(locales.map((l) => [l, {}]))))).toEqual([]);
    const many = Object.fromEntries(Array.from({ length: 3000 }, (_, i) => [`cart.k.k${i}`, 'x']));
    expect(siteProblems(en(many))).toEqual([]);
    expect(siteProblems(en({ 'cart.x.y': 'x'.repeat(1000) }))).toEqual([]);
  });
});

describe('siteTextSchema — rejects', () => {
  it('names the key path in the message', () => {
    expect(siteProblems(en({ 'checkout.errors.paymentMissing': 'Pay {' }))).toEqual([
      'strings.en["checkout.errors.paymentMissing"]: A { or } is only allowed around a placeholder such as {name}',
    ]);
  });

  it.each([
    ['upper-case first segment', 'Cart.title'],
    ['one segment', 'cart'],
    ['seven segments', 'a.b.c.d.e.f.g'],
    ['empty segment', 'cart..x'],
    ['segment starting with a hyphen', 'cart.-x'],
    ['a space', 'cart.drawer title'],
    ['over 100 chars', `cart.${'x'.repeat(100)}`],
  ])('a key with %s', (_label, key) => {
    expect(siteProblems(en({ [key]: 'x' }))).toEqual([`strings.en[${JSON.stringify(key)}]: Invalid text key (expected area.part.name)`]);
  });

  it.each([
    ['empty', '', 'Text must not be empty (clear the line to reset it)'],
    ['1 001 chars', 'x'.repeat(1001), 'Text is limited to 1000 characters'],
    ['a bell', 'a\u0007b', 'Text may not contain control characters other than a line break'],
    ['a tab', 'a\tb', 'Text may not contain control characters other than a line break'],
    ['a carriage return', 'a\r\nb', 'Text may not contain control characters other than a line break'],
    ['DEL', 'a\u007Fb', 'Text may not contain control characters other than a line break'],
    ['a stray {', 'Hi {', 'A { or } is only allowed around a placeholder such as {name}'],
    ['a stray }', 'Hi }', 'A { or } is only allowed around a placeholder such as {name}'],
    ['a placeholder starting with a digit', '{1abc}', 'A { or } is only allowed around a placeholder such as {name}'],
    ['a hyphenated placeholder', '{a-b}', 'A { or } is only allowed around a placeholder such as {name}'],
    ['doubled braces', '{{name}}', 'A { or } is only allowed around a placeholder such as {name}'],
    ['a 33-char placeholder', `{a${'b'.repeat(32)}}`, 'A { or } is only allowed around a placeholder such as {name}'],
    ['11 distinct placeholders', Array.from({ length: 11 }, (_, i) => `{p${i}}`).join(' '), 'At most 10 different placeholders'],
  ])('a string value that is %s', (_label, value, message) => {
    expect(siteProblems(en({ 'cart.x.y': value }))).toEqual([`strings.en["cart.x.y"]: ${message}`]);
  });

  it.each([
    ['without other', { one: 'x' }, ['Plural forms need an "other" form']],
    ['with an unknown form', { other: 'x', dual: 'y' }, ['Unknown plural form "dual"']],
    ['with a non-string form', { other: 5 }, ['Plural form "other" must be text']],
    ['with an empty form', { one: '', other: 'x' }, ['Plural form "one": Text must not be empty (clear the line to reset it)']],
    ['with a bad brace in a form', { one: '{', other: 'x' }, ['Plural form "one": A { or } is only allowed around a placeholder such as {name}']],
    ['as an array', ['x'], ['Expected text or plural forms']],
    ['as a number', 5, ['Expected text or plural forms']],
    ['as null', null, ['Expected text or plural forms']],
  ])('a plural value %s', (_label, value, messages) => {
    expect(siteProblems(en({ 'cart.summary.items': value }))).toEqual(messages.map((m) => `strings.en["cart.summary.items"]: ${m}`));
  });

  it('counts placeholders across all plural forms', () => {
    const one = Array.from({ length: 6 }, (_, i) => `{a${i}}`).join(' ');
    const other = Array.from({ length: 6 }, (_, i) => `{b${i}}`).join(' ');
    expect(siteProblems(en({ 'cart.summary.items': { one, other } }))).toEqual([
      'strings.en["cart.summary.items"]: At most 10 different placeholders',
    ]);
  });

  it('a non-canonical locale key in strings', () => {
    expect(siteProblems(doc({ EN: {} }))).toEqual(['strings.EN: Invalid language tag (expected a canonical tag such as en, de or pt-BR)']);
    expect(siteProblems(doc({ iw: {} }))).toHaveLength(1);
  });

  it.each([
    [{ locale: 'EN', formatLocale: '' }, 'language.locale'],
    [{ locale: 'en', formatLocale: 'de_DE' }, 'language.formatLocale'],
    [{ locale: 'en' }, 'language.formatLocale'],
    [{ locale: 'en', formatLocale: '', dir: 'rtl' }, 'language'],
  ])('a bad language %j', (language, path) => {
    const out = siteProblems(doc({}, language));
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].startsWith(path)).toBe(true);
  });

  it('11 locales', () => {
    const locales = ['en', 'de', 'fr', 'es', 'it', 'nl', 'pl', 'pt', 'sv', 'da', 'fi'];
    expect(siteProblems(doc(Object.fromEntries(locales.map((l) => [l, {}]))))).toEqual(['strings: At most 10 languages']);
  });

  it('3 001 keys in one locale (reported once, not per key)', () => {
    const many = Object.fromEntries(Array.from({ length: 3001 }, (_, i) => [`cart.k.k${i}`, 'x']));
    expect(siteProblems(en(many))).toEqual(['strings.en: At most 3000 lines per language']);
  });

  it('a document over 256 KB', () => {
    const big = Object.fromEntries(Array.from({ length: 270 }, (_, i) => [`cart.k.k${i}`, 'x'.repeat(1000)]));
    expect(siteProblems(en(big))).toEqual([': Site text may be at most 256 KB']);
  });

  it('an unknown top-level field (strict — never silently stripped)', () => {
    expect(siteProblems({ ...doc(), theme: 'dark' }).length).toBeGreaterThan(0);
  });

  it('schemaVersion 2', () => {
    expect(siteProblems({ ...doc(), schemaVersion: 2 }).length).toBeGreaterThan(0);
  });

  it('reports at most 20 issues', () => {
    const bad = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`cart.k.k${i}`, '{']));
    expect(siteProblems(en(bad))).toHaveLength(20);
  });

  it('TEXT_LIMITS is the spec value', () => {
    expect(TEXT_LIMITS).toEqual({ locales: 10, keysPerLocale: 3000, key: 100, value: 1000, placeholders: 10, docBytes: 256 * 1024 });
  });
});

describe('pageTextSchema', () => {
  it('accepts overrides and an empty strings map', () => {
    expect(problems(pageTextSchema, { strings: {} })).toEqual([]);
    expect(problems(pageTextSchema, { strings: { en: { 'shell.nav.ariaLabel': 'Menu' } } })).toEqual([]);
  });

  it('is strict and validates values like the site text', () => {
    expect(problems(pageTextSchema, { strings: {}, language: { locale: 'en', formatLocale: '' } }).length).toBeGreaterThan(0);
    expect(problems(pageTextSchema, { strings: { en: { 'cart.x.y': '}' } } })).toEqual([
      'strings.en["cart.x.y"]: A { or } is only allowed around a placeholder such as {name}',
    ]);
  });
});

describe('request schemas', () => {
  it('saveTextDraftBodySchema', () => {
    expect(saveTextDraftBodySchema.safeParse({ data: doc(), baseVersion: 0 }).success).toBe(true);
    expect(saveTextDraftBodySchema.safeParse({ data: doc(), baseVersion: -1 }).success).toBe(false);
    expect(saveTextDraftBodySchema.safeParse({ data: doc(), baseVersion: 2_147_483_648 }).success).toBe(false);
    expect(saveTextDraftBodySchema.safeParse({ data: doc() }).success).toBe(false);
  });

  it('textVersionParamSchema coerces a positive integer', () => {
    expect(textVersionParamSchema.parse({ version: '3' })).toEqual({ version: 3 });
    expect(textVersionParamSchema.safeParse({ version: '0' }).success).toBe(false);
    expect(textVersionParamSchema.safeParse({ version: 'abc' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/storefront-text/schemas.test.ts`
Expected: FAIL — `Failed to resolve import "./schemas"`.

- [ ] **Step 3: Write the implementation**

Create `src/modules/storefront-text/schemas.ts`:

```ts
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Site text (spec 2026-09-30 editable-text §3, §4.3) — STRUCTURAL validation
// only. The storefront release owns which keys exist and which placeholders a
// key accepts; the backend never knows.
// Mirrors ecommerce-storefront web/src/text/types.ts.
// ---------------------------------------------------------------------------

export const TEXT_LIMITS = {
  locales: 10,
  keysPerLocale: 3000,
  key: 100,
  value: 1000,
  placeholders: 10,
  docBytes: 256 * 1024,
} as const;

/** Postgres int4 max: versions are `integer` columns. */
export const TEXT_VERSION_MAX = 2_147_483_647;

export type PluralForms = Partial<Record<'zero' | 'one' | 'two' | 'few' | 'many', string>> & { other: string };
export type TextValue = string | PluralForms;
/** Sparse: only keys the owner set. */
export type LocaleStrings = Record<string, TextValue>;
export interface TextLanguage {
  locale: string;
  /** '' = built-in formatting for `locale`. */
  formatLocale: string;
}
export interface SiteText {
  schemaVersion: 1;
  language: TextLanguage;
  strings: Record<string, LocaleStrings>;
}
export interface PageText {
  strings: Record<string, LocaleStrings>;
}

export const LOCALE_RE = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|\d{3}))?$/;
/** 2–6 dot-separated segments; first lower-case letters; later ones start with
 *  a letter or digit (hyphens allowed for template ids like `dark-luxury`). */
export const TEXT_KEY_RE = /^[a-z]+(?:\.[A-Za-z0-9][A-Za-z0-9_-]*){1,5}$/;
/** Global: only ever used with replace()/matchAll(), never test(). */
const PLACEHOLDER_RE = /\{[A-Za-z][A-Za-z0-9]{0,31}\}/g;
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\u0000-\u0009\u000B-\u001F\u007F]/;
export const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;
const PLURAL_CATEGORY_SET: ReadonlySet<string> = new Set(PLURAL_CATEGORIES);

const MAX_REPORTED_ISSUES = 20;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** BCP 47 in canonical form, language[-Script][-REGION]. */
export function isCanonicalLocale(x: string): boolean {
  if (!LOCALE_RE.test(x)) return false;
  try {
    return Intl.getCanonicalLocales(x)[0] === x;
  } catch {
    return false;
  }
}

function placeholderNames(s: string): string[] {
  return [...s.matchAll(PLACEHOLDER_RE)].map((m) => m[0].slice(1, -1));
}

/** Why one string (a whole value or one plural form) is invalid, or null. */
export function textStringProblem(s: string): string | null {
  if (s.length === 0) return 'Text must not be empty (clear the line to reset it)';
  if (s.length > TEXT_LIMITS.value) return `Text is limited to ${TEXT_LIMITS.value} characters`;
  if (CONTROL_CHAR_RE.test(s)) return 'Text may not contain control characters other than a line break';
  if (/[{}]/.test(s.replace(PLACEHOLDER_RE, ''))) return 'A { or } is only allowed around a placeholder such as {name}';
  return null;
}

function placeholderCapProblems(forms: string[]): string[] {
  const names = new Set(forms.flatMap(placeholderNames));
  return names.size > TEXT_LIMITS.placeholders ? [`At most ${TEXT_LIMITS.placeholders} different placeholders`] : [];
}

/** Every problem with one stored value (a string or plural forms). */
export function textValueProblems(value: unknown): string[] {
  if (typeof value === 'string') {
    const p = textStringProblem(value);
    return p ? [p] : placeholderCapProblems([value]);
  }
  if (!isPlainObject(value)) return ['Expected text or plural forms'];
  const out: string[] = [];
  for (const [form, v] of Object.entries(value)) {
    if (!PLURAL_CATEGORY_SET.has(form)) {
      out.push(`Unknown plural form "${form}"`);
      continue;
    }
    if (typeof v !== 'string') {
      out.push(`Plural form "${form}" must be text`);
      continue;
    }
    const p = textStringProblem(v);
    if (p) out.push(`Plural form "${form}": ${p}`);
  }
  if (!Object.prototype.hasOwnProperty.call(value, 'other')) out.push('Plural forms need an "other" form');
  return out.length > 0 ? out : placeholderCapProblems(Object.values(value) as string[]);
}

/** One path element so errorHandler renders `strings.en["cart.drawer.title"]`. */
const keyPath = (locale: string, key: string) => `${locale}[${JSON.stringify(key)}]`;

function checkStrings(strings: Record<string, Record<string, unknown>>, ctx: z.RefinementCtx): void {
  let reported = 0;
  const add = (path: string[], message: string) => {
    if (reported++ < MAX_REPORTED_ISSUES) ctx.addIssue({ code: 'custom', message, path });
  };
  const locales = Object.keys(strings);
  if (locales.length > TEXT_LIMITS.locales) add([], `At most ${TEXT_LIMITS.locales} languages`);
  for (const locale of locales) {
    if (!isCanonicalLocale(locale)) {
      add([locale], 'Invalid language tag (expected a canonical tag such as en, de or pt-BR)');
      continue;
    }
    const entries = Object.entries(strings[locale]);
    if (entries.length > TEXT_LIMITS.keysPerLocale) {
      add([locale], `At most ${TEXT_LIMITS.keysPerLocale} lines per language`);
      continue;
    }
    for (const [key, value] of entries) {
      if (key.length > TEXT_LIMITS.key || !TEXT_KEY_RE.test(key)) {
        add([keyPath(locale, key)], 'Invalid text key (expected area.part.name)');
        continue;
      }
      for (const problem of textValueProblems(value)) add([keyPath(locale, key)], problem);
    }
  }
}

const localeSchema = z.string().refine(isCanonicalLocale, 'Expected a canonical language tag such as en, de or pt-BR');

export const textLanguageSchema = z.strictObject({
  locale: localeSchema,
  formatLocale: z.union([z.literal(''), localeSchema]),
});

const textStringsSchema = z
  .record(z.string(), z.record(z.string(), z.unknown()))
  .superRefine(checkStrings)
  .transform((s) => s as Record<string, LocaleStrings>);

/** The shared Site text document. Strict: an unknown field from a newer
 *  editor is a loud 400 in autosave, never a silent strip. */
export const siteTextSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    language: textLanguageSchema,
    strings: textStringsSchema,
  })
  .superRefine((doc, ctx) => {
    if (Buffer.byteLength(JSON.stringify(doc), 'utf8') > TEXT_LIMITS.docBytes) {
      ctx.addIssue({ code: 'custom', message: `Site text may be at most ${TEXT_LIMITS.docBytes / 1024} KB`, path: [] });
    }
  });

/** Per-layout overrides inside a PageSet (`PageSet.text`). Counts toward the
 *  page set's 512 KB cap (checked by storefront-pages). */
export const pageTextSchema = z.strictObject({ strings: textStringsSchema });

// ---------------------------------------------------------------------------
// Request schemas (the controller calls .parse(): validation failures are 400).
// ---------------------------------------------------------------------------

export const saveTextDraftBodySchema = z.object({
  data: siteTextSchema,
  baseVersion: z.number().int().min(0).max(TEXT_VERSION_MAX),
});
export type SaveTextDraftInput = z.output<typeof saveTextDraftBodySchema>;

export const textVersionParamSchema = z.object({
  version: z.coerce.number().int().positive().max(TEXT_VERSION_MAX),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/storefront-text/schemas.test.ts`
Expected: PASS. If the `': Site text may be at most 256 KB'` expectation fails because Zod renders a root path differently, check the actual issue path is `[]` (the join of an empty path is `''`) and keep the assertion as `': Site text …'`.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/modules/storefront-text/schemas.ts src/modules/storefront-text/schemas.test.ts
git commit -m "feat(storefront-text): structural validation for Site text and page text overrides" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- src/modules/storefront-text/schemas.ts src/modules/storefront-text/schemas.test.ts
```

---

### Task 2: `storefront_site_text` table, `text_version` pin, migration 0046

**Depends on:** none. **Wave 1.**

**Files:**
- Create: `src/db/schema/storefront-text.ts`
- Modify: `src/db/schema/storefront-pages.ts`
- Modify: `src/db/schema/index.ts` (after the `export * from './storefront-pages';` line)
- Create (generated): `drizzle/0046_<generated>.sql`, `drizzle/meta/0046_snapshot.json`; Modify (generated): `drizzle/meta/_journal.json`
- Test: `src/db/schema/storefront-text.test.ts`

**Interfaces:**
- Produces: `storefrontSiteText` table; types `StorefrontSiteTextKind`, `StoredPluralForms`, `StoredTextValue`, `StoredLocaleStrings`, `StoredTextLanguage`, `StoredSiteText`, `StoredPageText`, `StorefrontSiteTextRow`; `storefrontPageSets.textVersion` (`integer('text_version')`, nullable); `StoredPageSet.text?: StoredPageText`.

- [ ] **Step 1: Write the failing test**

Create `src/db/schema/storefront-text.test.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { storefrontSiteText } from './storefront-text';
import { storefrontPageSets } from './storefront-pages';

describe('storefront_site_text', () => {
  const cfg = getTableConfig(storefrontSiteText);

  it('is the page-set table shape without layout', () => {
    expect(cfg.name).toBe('storefront_site_text');
    expect(cfg.columns.map((c) => c.name).sort()).toEqual(
      ['created_at', 'created_by', 'data', 'id', 'kind', 'updated_at', 'version'],
    );
  });

  it('allows at most one draft and unique published versions', () => {
    expect(cfg.indexes.map((i) => i.config.name).sort()).toEqual(
      ['storefront_site_text_draft_uq', 'storefront_site_text_published_uq'],
    );
    expect(cfg.indexes.every((i) => i.config.unique)).toBe(true);
    expect(cfg.checks.map((c) => c.name).sort()).toEqual(
      ['storefront_site_text_kind_check', 'storefront_site_text_version_check'],
    );
  });
});

describe('storefront_page_sets.text_version', () => {
  it('is a nullable integer', () => {
    const col = getTableConfig(storefrontPageSets).columns.find((c) => c.name === 'text_version');
    expect(col).toBeDefined();
    expect(col!.notNull).toBe(false);
    expect(col!.columnType).toBe('PgInteger');
  });
});

describe('migration 0046', () => {
  it('creates the table and adds the pin column, with no backfill', () => {
    const root = join(__dirname, '../../../drizzle');
    const journal = JSON.parse(readFileSync(join(root, 'meta/_journal.json'), 'utf8')) as { entries: { idx: number; tag: string }[] };
    const entry = journal.entries.find((e) => e.idx === 46);
    expect(entry?.tag).toMatch(/^0046_/);
    const sql = readFileSync(join(root, `${entry!.tag}.sql`), 'utf8');
    expect(sql).toContain('CREATE TABLE "storefront_site_text"');
    expect(sql).toMatch(/ALTER TABLE "storefront_page_sets" ADD COLUMN "text_version" integer;/);
    expect(sql).toContain('"storefront_site_text_draft_uq"');
    expect(sql).toContain('"storefront_site_text_published_uq"');
    expect(sql).not.toMatch(/\bUPDATE\b/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/schema/storefront-text.test.ts`
Expected: FAIL — cannot resolve `./storefront-text`.

- [ ] **Step 3: Write the schema**

Create `src/db/schema/storefront-text.ts`:

```ts
import { pgTable, integer, text, jsonb, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { timestamps } from './_helpers';
import { users } from './users';

export type StorefrontSiteTextKind = 'draft' | 'published';

/** Stored shape of the Site text document (spec 2026-09-30 editable-text §3).
 *  Validated on every write by modules/storefront-text/schemas
 *  (siteTextSchema); the storefront release owns which keys exist. */
export type StoredPluralForms = Partial<Record<'zero' | 'one' | 'two' | 'few' | 'many', string>> & { other: string };
export type StoredTextValue = string | StoredPluralForms;
export type StoredLocaleStrings = Record<string, StoredTextValue>;
export interface StoredTextLanguage {
  locale: string;
  formatLocale: string;
}
export interface StoredSiteText {
  schemaVersion: 1;
  language: StoredTextLanguage;
  strings: Record<string, StoredLocaleStrings>;
}
/** Per-layout overrides stored inside a page set (`StoredPageSet.text`). */
export interface StoredPageText {
  strings: Record<string, StoredLocaleStrings>;
}

/**
 * The store's shared Site text (spec §4.1): at most one `draft` row
 * (`version` = the published version it is based on, 0 if none) and the
 * newest 20 `published` rows (`version` 1, 2, 3…; history never rewritten).
 */
export const storefrontSiteText = pgTable('storefront_site_text', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  kind: text('kind').$type<StorefrontSiteTextKind>().notNull(),
  version: integer('version').notNull(),
  data: jsonb('data').$type<StoredSiteText>().notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
}, (table) => [
  uniqueIndex('storefront_site_text_draft_uq').on(table.kind).where(sql`kind = 'draft'`),
  uniqueIndex('storefront_site_text_published_uq').on(table.version).where(sql`kind = 'published'`),
  check('storefront_site_text_kind_check', sql`${table.kind} in ('draft', 'published')`),
  check('storefront_site_text_version_check', sql`${table.version} >= 0`),
]);

export type StorefrontSiteTextRow = typeof storefrontSiteText.$inferSelect;
```

Modify `src/db/schema/storefront-pages.ts`:

1. Add after the existing imports:

```ts
import type { StoredPageText } from './storefront-text';
```

2. Replace the `StoredPageSet` interface with:

```ts
export interface StoredPageSet {
  schemaVersion: 1;
  shell: StoredPuckDoc;
  pages: Record<string, StoredPuckDoc>;
  /** Per-layout text overrides (editable-text §3). Absent = none. */
  text?: StoredPageText;
}
```

3. In the `storefrontPageSets` column list, add after `createdBy`:

```ts
  /** Published rows only: the Site text version live right after this
   *  version was published/restored (0 = none existed). Null on drafts and
   *  on rows published before migration 0046. */
  textVersion: integer('text_version'),
```

Modify `src/db/schema/index.ts` — add directly after `export * from './storefront-pages';`:

```ts
export * from './storefront-text';
```

- [ ] **Step 4: Generate the migration (offline)**

Run: `npm run db:generate`
Expected: drizzle-kit reports one new migration `drizzle/0046_<adjective>_<name>.sql` with `drizzle/meta/0046_snapshot.json` and a new `_journal.json` entry `idx: 46`. It must not ask any rename question (a new table and a new nullable column only); if it does, answer "create" for both. Do **not** run `db:migrate` or `db:push`.

Open the generated SQL and confirm it contains exactly: `CREATE TABLE "storefront_site_text"` (with both checks), the `created_by` FK `ON DELETE set null`, the two partial unique indexes, and `ALTER TABLE "storefront_page_sets" ADD COLUMN "text_version" integer;` — nothing touching other tables.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/db/schema/storefront-text.test.ts src/modules/storefront-pages`
Expected: PASS (existing storefront-pages tests unaffected).
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema/storefront-text.ts src/db/schema/storefront-text.test.ts src/db/schema/storefront-pages.ts src/db/schema/index.ts drizzle/0046_*.sql drizzle/meta/0046_snapshot.json drizzle/meta/_journal.json
git commit -m "feat(db): storefront_site_text table and storefront_page_sets.text_version (migration 0046)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- src/db/schema/storefront-text.ts src/db/schema/storefront-text.test.ts src/db/schema/storefront-pages.ts src/db/schema/index.ts drizzle/0046_*.sql drizzle/meta/0046_snapshot.json drizzle/meta/_journal.json
```

---

### Task 3: Site text store (query seam)

**Depends on:** Task 2. **Wave 2.**

**Files:**
- Create: `src/modules/storefront-text/store.ts`
- Test: `src/modules/storefront-text/store.test.ts`

**Interfaces:**
- Consumes: `storefrontSiteText`, `StorefrontSiteTextRow`, `StoredSiteText` (Task 2).
- Produces (all exported from `src/modules/storefront-text/store.ts`):
  - `type SiteTextRow = StorefrontSiteTextRow`
  - `interface TextVersionListRow { version: number; createdAt: Date; createdById: number | null; createdByName: string | null }`
  - `interface SiteTextWrite { version: number; data: StoredSiteText; createdBy: number | null }`
  - `inTransaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T>`
  - `textLockSql(): SQL`, `lockText(tx: Executor): Promise<void>`
  - `findTextDraft(ex?: Executor): Promise<SiteTextRow | null>`
  - `latestPublishedTextQuery(ex?)`, `findLatestPublishedText(ex?: Executor): Promise<SiteTextRow | null>`
  - `findPublishedText(version: number, ex?: Executor): Promise<SiteTextRow | null>`
  - `listPublishedTextQuery(ex?)`, `listPublishedText(ex?: Executor): Promise<TextVersionListRow[]>`
  - `upsertTextDraft(tx: Executor, input: SiteTextWrite): Promise<SiteTextRow>`
  - `deleteTextDraft(ex?: Executor): Promise<boolean>`
  - `insertPublishedText(tx: Executor, input: SiteTextWrite): Promise<SiteTextRow>`
  - `setTextDraftVersion(tx: Executor, version: number): Promise<void>`
  - `pruneTextQuery(belowVersion: number, ex?)`, `prunePublishedTextBelow(tx: Executor, belowVersion: number): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `src/modules/storefront-text/store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { latestPublishedTextQuery, listPublishedTextQuery, pruneTextQuery, textLockSql, upsertTextDraft } from './store';
import type { Executor } from '../../db/client';

// toSQL() needs no database connection: these pin the SQL the service relies on.

describe('storefront-text store SQL', () => {
  it('takes one store-wide transaction-scoped advisory lock', () => {
    const q = new PgDialect().sqlToQuery(textLockSql());
    expect(q.sql).toBe('select pg_advisory_xact_lock(hashtext($1))');
    expect(q.params).toEqual(['storefront_text']);
  });

  it('reads the latest published row', () => {
    const q = latestPublishedTextQuery().toSQL();
    expect(q.sql).toContain('"storefront_site_text"."kind" = $1');
    expect(q.sql).toContain('order by "storefront_site_text"."version" desc');
    expect(q.sql).toMatch(/limit \$2|limit 1/);
    expect(q.params[0]).toBe('published');
  });

  it('lists published versions newest first with the author left-joined', () => {
    const q = listPublishedTextQuery().toSQL();
    expect(q.sql).toContain('left join "users" on "users"."id" = "storefront_site_text"."created_by"');
    expect(q.sql).toContain('order by "storefront_site_text"."version" desc');
    expect(q.params).toEqual(['published']);
  });

  it('prunes only PUBLISHED rows below a version — never the draft', () => {
    const q = pruneTextQuery(6).toSQL();
    expect(q.sql).toMatch(/^delete from "storefront_site_text" where/);
    expect(q.sql).toContain('"storefront_site_text"."kind" = $1');
    expect(q.sql).toContain('"storefront_site_text"."version" < $2');
    expect(q.params).toEqual(['published', 6]);
  });
});

describe('upsertTextDraft', () => {
  function fakeTx(existing: object | null, updated: object[]) {
    const inserted: object[] = [];
    const chain = (result: unknown) => {
      const c: Record<string, unknown> = {};
      for (const m of ['from', 'where', 'limit', 'set']) c[m] = () => c;
      c.returning = async () => result;
      c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
      return c;
    };
    const tx = {
      select: () => chain(existing ? [existing] : []),
      update: () => chain(updated),
      insert: () => ({
        values: (v: object) => ({ returning: async () => { inserted.push(v); return [{ id: 99, ...v }]; } }),
      }),
    };
    return { tx: tx as unknown as Executor, inserted };
  }
  const write = { version: 3, data: {} as never, createdBy: 9 };

  it('updates the existing draft in place', async () => {
    const { tx, inserted } = fakeTx({ id: 1 }, [{ id: 1, version: 3 }]);
    await expect(upsertTextDraft(tx, write)).resolves.toEqual({ id: 1, version: 3 });
    expect(inserted).toEqual([]);
  });

  it('falls through to an insert when the draft vanished between select and update', async () => {
    const { tx, inserted } = fakeTx({ id: 1 }, []);
    const row = await upsertTextDraft(tx, write);
    expect(row).toMatchObject({ id: 99, version: 3, kind: 'draft' });
    expect(inserted).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/storefront-text/store.test.ts`
Expected: FAIL — cannot resolve `./store`.

- [ ] **Step 3: Write the implementation**

Create `src/modules/storefront-text/store.ts`:

```ts
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { db, type Executor } from '../../db/client';
import {
  storefrontSiteText as t,
  type StorefrontSiteTextRow,
  type StoredSiteText,
} from '../../db/schema/storefront-text';
import { users } from '../../db/schema/users';

// Every query of the storefront-text module lives here so service.ts can be
// unit-tested against an in-memory fake (store.fake.ts). Nothing in this
// file decides anything.

export type SiteTextRow = StorefrontSiteTextRow;

export interface TextVersionListRow {
  version: number;
  createdAt: Date;
  createdById: number | null;
  createdByName: string | null;
}

export interface SiteTextWrite {
  version: number;
  data: StoredSiteText;
  createdBy: number | null;
}

export function inTransaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
  return db.transaction((tx) => fn(tx));
}

/** Serialises every Site text write for the rest of the transaction.
 *  Any transaction that also needs a layout lock takes THIS one first —
 *  only via storefront-pages/store.ts lockTextThenLayout(). */
export function textLockSql() {
  return sql`select pg_advisory_xact_lock(hashtext(${'storefront_text'}))`;
}

export async function lockText(tx: Executor): Promise<void> {
  await tx.execute(textLockSql());
}

export async function findTextDraft(ex: Executor = db): Promise<SiteTextRow | null> {
  const rows = await ex.select().from(t).where(eq(t.kind, 'draft')).limit(1);
  return rows[0] ?? null;
}

export function latestPublishedTextQuery(ex: Executor = db) {
  return ex.select().from(t).where(eq(t.kind, 'published')).orderBy(desc(t.version)).limit(1);
}

export async function findLatestPublishedText(ex: Executor = db): Promise<SiteTextRow | null> {
  return (await latestPublishedTextQuery(ex))[0] ?? null;
}

export async function findPublishedText(version: number, ex: Executor = db): Promise<SiteTextRow | null> {
  const rows = await ex.select().from(t)
    .where(and(eq(t.kind, 'published'), eq(t.version, version)))
    .limit(1);
  return rows[0] ?? null;
}

export function listPublishedTextQuery(ex: Executor = db) {
  return ex
    .select({
      version: t.version,
      createdAt: t.createdAt,
      createdById: users.id,
      createdByName: users.name,
    })
    .from(t)
    .leftJoin(users, eq(users.id, t.createdBy))
    .where(eq(t.kind, 'published'))
    .orderBy(desc(t.version));
}

export async function listPublishedText(ex: Executor = db): Promise<TextVersionListRow[]> {
  return listPublishedTextQuery(ex);
}

/** Caller must hold the text lock (so select-then-write cannot race). */
export async function upsertTextDraft(tx: Executor, input: SiteTextWrite): Promise<SiteTextRow> {
  const existing = await findTextDraft(tx);
  if (existing) {
    const [row] = await tx.update(t)
      .set({ version: input.version, data: input.data, createdBy: input.createdBy })
      .where(eq(t.id, existing.id))
      .returning();
    if (row) return row;
    // Vanished between select and update: create it afresh.
  }
  const [row] = await tx.insert(t).values({ ...input, kind: 'draft' }).returning();
  return row;
}

export async function deleteTextDraft(ex: Executor = db): Promise<boolean> {
  const rows = await ex.delete(t).where(eq(t.kind, 'draft')).returning({ id: t.id });
  return rows.length > 0;
}

export async function insertPublishedText(tx: Executor, input: SiteTextWrite): Promise<SiteTextRow> {
  const [row] = await tx.insert(t).values({ ...input, kind: 'published' }).returning();
  return row;
}

export async function setTextDraftVersion(tx: Executor, version: number): Promise<void> {
  await tx.update(t).set({ version }).where(eq(t.kind, 'draft'));
}

export function pruneTextQuery(belowVersion: number, ex: Executor = db) {
  return ex.delete(t).where(and(eq(t.kind, 'published'), lt(t.version, belowVersion)));
}

export async function prunePublishedTextBelow(tx: Executor, belowVersion: number): Promise<void> {
  await pruneTextQuery(belowVersion, tx);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/storefront-text/store.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/modules/storefront-text/store.ts src/modules/storefront-text/store.test.ts
git commit -m "feat(storefront-text): query seam with store-wide advisory lock" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- src/modules/storefront-text/store.ts src/modules/storefront-text/store.test.ts
```

---

### Task 4: Page sets carry `text`; publish and restore request bodies

**Depends on:** Task 1, Task 2. **Wave 2.**

**Files:**
- Modify: `src/modules/storefront-pages/schemas.ts`
- Test: `src/modules/storefront-pages/schemas.test.ts` (append)

**Interfaces:**
- Consumes: `pageTextSchema` from `../storefront-text/schemas` (Task 1); `StoredPageSet.text?` (Task 2) so the service's typed writes still compile.
- Produces:
  - `pageSetSchema` output gains `text?: PageText` (kept verbatim, never sanitised or link-checked; counted in the 512 KB cap).
  - `publishBodySchema` → `PublishInput = { baseVersion: number; text?: { baseVersion: number } }`
  - `restoreBodySchema` → `RestoreInput = { withText?: boolean }`

- [ ] **Step 1: Write the failing tests**

In `src/modules/storefront-pages/schemas.test.ts`, extend the import from `./schemas` to also import `restoreBodySchema`, then append:

```ts
describe('pageSetSchema — per-layout text overrides (editable-text §3, §4.3)', () => {
  const overrides = { strings: { en: { 'cart.drawer.title': 'Menu basket', 'cart.summary.items': { one: '{count} dish', other: '{count} dishes' } } } };

  it('keeps `text` on the parsed output (otherwise every autosave would strip the overrides)', () => {
    const out = pageSetSchema.parse({ ...set(), text: overrides });
    expect(out.text).toEqual(overrides);
  });

  it('accepts a set without `text` and does not invent one', () => {
    expect('text' in pageSetSchema.parse(set())).toBe(false);
  });

  it('never sanitises or link-checks text values, whatever the key ends with', () => {
    const text = { strings: { en: { 'promo.bannerHtml': '<p onclick="x()">Sale</p>', 'promo.heroUrl': 'javascript:alert(1)', 'promo.logoSrc': '//evil.example' } } };
    sanitizeSpy.calls = 0;
    const out = pageSetSchema.parse({ ...set(), text });
    expect(out.text).toEqual(text);
    expect(sanitizeSpy.calls).toBe(0);
  });

  it('still sanitises *Html props in shell and pages', () => {
    const out = pageSetSchema.parse({ ...catalogWith(comp('RichText', { bodyHtml: '<p onclick="x()">Hi</p>' })), text: overrides }) as unknown as Loose;
    expect(out.pages.catalog.content[0].props.bodyHtml).toBe('<p>Hi</p>');
  });

  it('rejects an invalid override with the key path', () => {
    expect(problems({ ...set(), text: { strings: { en: { 'cart.drawer.title': 'Hi {' } } } })).toEqual([
      'text.strings.en["cart.drawer.title"]: A { or } is only allowed around a placeholder such as {name}',
    ]);
  });

  it('rejects an unknown field inside `text` (strict)', () => {
    expect(problems({ ...set(), text: { strings: {}, language: { locale: 'en', formatLocale: '' } } }).length).toBeGreaterThan(0);
  });

  it('counts `text` toward the 512 KB page-set cap', () => {
    const big = Object.fromEntries(Array.from({ length: 600 }, (_, i) => [`cart.pad.k${i}`, 'x'.repeat(1000)]));
    expect(problems({ ...set(), text: { strings: { en: big } } })).toContain(': A page set may be at most 512 KB');
    const fits = Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`cart.pad.k${i}`, 'x'.repeat(1000)]));
    expect(problems({ ...set(), text: { strings: { en: fits } } })).toEqual([]);
  });
});

describe('publishBodySchema with shared text', () => {
  it('accepts { baseVersion } (older admin) and { baseVersion, text: { baseVersion } }', () => {
    expect(publishBodySchema.parse({ baseVersion: 2 })).toEqual({ baseVersion: 2 });
    expect(publishBodySchema.parse({ baseVersion: 2, text: { baseVersion: 0 } })).toEqual({ baseVersion: 2, text: { baseVersion: 0 } });
  });

  it.each([[{ baseVersion: 2, text: {} }], [{ baseVersion: 2, text: { baseVersion: -1 } }], [{ baseVersion: 2, text: { baseVersion: 2_147_483_648 } }], [{ baseVersion: 2, text: 3 }]])(
    'rejects %j',
    (body) => {
      expect(publishBodySchema.safeParse(body).success).toBe(false);
    },
  );
});

describe('restoreBodySchema', () => {
  it('defaults to no text restore', () => {
    expect(restoreBodySchema.parse({})).toEqual({});
    expect(restoreBodySchema.parse({ withText: true })).toEqual({ withText: true });
    expect(restoreBodySchema.parse({ withText: false })).toEqual({ withText: false });
  });

  it('rejects a non-boolean withText', () => {
    expect(restoreBodySchema.safeParse({ withText: 'yes' }).success).toBe(false);
  });
});
```

(`set`, `comp`, `catalogWith`, `problems`, `Loose` and `sanitizeSpy` already exist at the top of this file.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/storefront-pages/schemas.test.ts`
Expected: FAIL — `restoreBodySchema` is not exported; `out.text` is `undefined`.

- [ ] **Step 3: Write the implementation**

In `src/modules/storefront-pages/schemas.ts`:

1. Add after `import { isAllowedLink, sanitizeRichtext } from './richtext';`:

```ts
import { pageTextSchema } from '../storefront-text/schemas';
```

2. Replace the `pageSetSchema` definition with:

```ts
/** A `PageSet` (spec §13 A4 + editable-text §3): raw size + structural
 *  checks → `*Html` sanitised in `shell`/`pages` only → string and size caps
 *  re-checked on the sanitised output. `text` (per-layout overrides) is
 *  validated by pageTextSchema, counted in the size cap, and never walked,
 *  sanitised or link-checked — it is rendered as plain text.
 *  The parsed output is exactly what gets stored. */
export const pageSetSchema = z
  .object({
    schemaVersion: z.literal(1),
    shell: puckDocSchema,
    pages: z.record(z.string(), puckDocSchema),
    text: pageTextSchema.optional(),
  })
  .superRefine(checkStructure)
  .transform((set) => ({
    ...set,
    shell: sanitizeHtmlProps(set.shell, '') as typeof set.shell,
    pages: sanitizeHtmlProps(set.pages, '') as typeof set.pages,
  }))
  .superRefine(checkSize);
```

(`checkStructure` already walks only `shell` and `pages`, and its raw-size gate serialises the whole set, so `text` counts toward 512 KB with no further change.)

3. Replace `publishBodySchema` / `PublishInput` with:

```ts
export const publishBodySchema = z.object({
  baseVersion: z.number().int().min(0).max(PAGESET_LIMITS.version),
  /** Sent whenever the editor session holds shared text (editable-text §4.4). */
  text: z.object({ baseVersion: z.number().int().min(0).max(PAGESET_LIMITS.version) }).optional(),
});
export type PublishInput = z.output<typeof publishBodySchema>;

/** Optional body of POST /:layout/versions/:version/restore (§4.5). */
export const restoreBodySchema = z.object({
  withText: z.boolean().optional(),
});
export type RestoreInput = z.output<typeof restoreBodySchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/storefront-pages`
Expected: PASS (the whole existing storefront-pages suite too — the sanitise change must not alter any existing expectation).
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(storefront-pages): page sets carry per-layout text; publish/restore bodies for shared text" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- src/modules/storefront-pages/schemas.ts src/modules/storefront-pages/schemas.test.ts
```

---

### Task 5: Site text service (+ shared in-memory store fake)

**Depends on:** Task 1, Task 3. **Wave 3.**

**Files:**
- Create: `src/modules/storefront-text/service.ts`
- Create: `src/modules/storefront-text/store.fake.ts`
- Test: `src/modules/storefront-text/service.test.ts`

**Interfaces:**
- Consumes: Task 3 store functions (exact names above); `siteTextSchema`, `SaveTextDraftInput` (Task 1).
- Produces (from `src/modules/storefront-text/service.ts`):
  - constants `SITETEXT_CONFLICT = 'SITETEXT_CONFLICT'`, `TEXT_HISTORY_LIMIT = 20`, `TEXT_PUBLISHED_EVENT = 'storefront-text:published'`, `DEFAULT_LOCALE = 'en'`
  - `getDraft(): Promise<TextDraftView>`; `saveDraft(input: SaveTextDraftInput, userId: number): Promise<{ baseVersion: number; updatedAt: string }>`; `discardDraft(): Promise<{ discarded: boolean }>`
  - `listVersions(): Promise<TextVersionSummary[]>`; `getVersion(version: number): Promise<TextVersionDetail>`; `restoreVersion(version: number, userId: number): Promise<{ version: number }>`
  - `notifyTextPublished(version: number): void`
  - `stableJson(value: unknown): string`
  - in-transaction helpers (caller holds the text lock): `latestTextVersion(ex?: Executor): Promise<number>`; `findTextDraft(ex: Executor): Promise<SiteTextRow | null>`; `publishTextDraftInTx(tx: Executor, draft: SiteTextRow, latest: number, userId: number): Promise<TextPublishStep>` with `TextPublishStep = { textVersion: number; textPublished: boolean; publishedAt: Date | null }`; `restorePinnedTextInTx(tx: Executor, pin: number, userId: number): Promise<{ textVersion: number; textRestored: boolean } | null>` (null = pinned version gone)
  - `getLatestPublishedText(): Promise<SiteTextRow | null>`
- Produces (from `store.fake.ts`, used by Task 7's test): `createTextStoreFake(state: TextFakeState)`, `interface FakeTextRow`, `interface TextFakeState { text: FakeTextRow[]; nextId: number; calls: string[]; users: Record<number, string> }`. The fake records `'lock:text'`, `'latest:text'`, `'delete:text:tx'|'delete:text:db'` in `state.calls`, and its `inTransaction` restores `state.text` when the callback throws.

- [ ] **Step 1: Write the shared fake**

Create `src/modules/storefront-text/store.fake.ts` (not a test file; no vitest import):

```ts
import type { StoredSiteText } from '../../db/schema/storefront-text';

/** In-memory stand-in for ./store, used through vi.mock by the storefront-text
 *  and storefront-pages service tests. Records lock/read order in
 *  `state.calls`; `inTransaction` restores `state.text` if the callback
 *  throws, like a real rollback. */
export interface FakeTextRow {
  id: number;
  kind: 'draft' | 'published';
  version: number;
  data: StoredSiteText;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TextFakeState {
  text: FakeTextRow[];
  nextId: number;
  calls: string[];
  users: Record<number, string>;
}

type Write = { version: number; data: StoredSiteText; createdBy: number | null };

export function createTextStoreFake(state: TextFakeState) {
  const draft = () => state.text.find((r) => r.kind === 'draft') ?? null;
  const published = () => state.text.filter((r) => r.kind === 'published').sort((a, b) => b.version - a.version);
  const insert = (row: Omit<FakeTextRow, 'id' | 'createdAt' | 'updatedAt'>): FakeTextRow => {
    const now = new Date();
    const r = { ...row, id: state.nextId++, createdAt: now, updatedAt: now };
    state.text.push(r);
    return r;
  };
  return {
    inTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const snapshot = structuredClone(state.text);
      try {
        return await fn('tx');
      } catch (e) {
        state.text = snapshot;
        throw e;
      }
    },
    textLockSql: () => 'text-lock',
    lockText: async () => { state.calls.push('lock:text'); },
    findTextDraft: async () => draft(),
    findLatestPublishedText: async () => {
      state.calls.push('latest:text');
      return published()[0] ?? null;
    },
    findPublishedText: async (version: number) => published().find((r) => r.version === version) ?? null,
    listPublishedText: async () =>
      published().map((r) => {
        const name = r.createdBy !== null ? state.users[r.createdBy] ?? null : null;
        return { version: r.version, createdAt: r.createdAt, createdById: name ? r.createdBy : null, createdByName: name };
      }),
    upsertTextDraft: async (_tx: unknown, input: Write) => {
      const d = draft();
      if (d) {
        Object.assign(d, { ...input, updatedAt: new Date() });
        return d;
      }
      return insert({ ...input, kind: 'draft' });
    },
    deleteTextDraft: async (ex?: unknown) => {
      state.calls.push(`delete:text:${ex === 'tx' ? 'tx' : 'db'}`);
      const before = state.text.length;
      state.text = state.text.filter((r) => r.kind !== 'draft');
      return state.text.length < before;
    },
    insertPublishedText: async (_tx: unknown, input: Write) => {
      if (published().some((r) => r.version === input.version)) {
        throw new Error('duplicate key value violates unique constraint "storefront_site_text_published_uq"');
      }
      return insert({ ...input, kind: 'published' });
    },
    setTextDraftVersion: async (_tx: unknown, version: number) => {
      const d = draft();
      if (d) d.version = version;
    },
    prunePublishedTextBelow: async (_tx: unknown, below: number) => {
      state.text = state.text.filter((r) => !(r.kind === 'published' && r.version < below));
    },
  };
}
```

- [ ] **Step 2: Write the failing test**

Create `src/modules/storefront-text/service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import type { FakeTextRow } from './store.fake';

const { mem, emitEvent } = vi.hoisted(() => ({
  mem: { text: [] as FakeTextRow[], nextId: 1, calls: [] as string[], users: { 9: 'Ada Admin' } as Record<number, string> },
  emitEvent: vi.fn(),
}));

vi.mock('../../lib/emitter', () => ({ emitEvent }));
vi.mock('./store', async () => {
  const { createTextStoreFake } = await import('./store.fake');
  return createTextStoreFake(mem);
});

import * as service from './service';
import type { SaveTextDraftInput } from './schemas';
import { ConflictError, NotFoundError } from '../../utils/errors';

const siteText = (title: string) => ({
  schemaVersion: 1 as const,
  language: { locale: 'en', formatLocale: '' },
  strings: { en: { 'cart.drawer.title': title } },
});
const input = (title: string, baseVersion: number) => ({ data: siteText(title), baseVersion }) as SaveTextDraftInput;
const titleOf = (row: { data: { strings: Record<string, Record<string, unknown>> } } | null | undefined) => row?.data.strings.en['cart.drawer.title'];

function seed(versions: number[], createdBy: number | null = 9) {
  for (const version of versions) {
    const now = new Date(Date.UTC(2026, 8, version));
    mem.text.push({ id: mem.nextId++, kind: 'published', version, data: siteText(`t${version}`), createdBy, createdAt: now, updatedAt: now });
  }
}
const versions = () => mem.text.filter((r) => r.kind === 'published').map((r) => r.version).sort((a, b) => a - b);
const draft = () => mem.text.find((r) => r.kind === 'draft');
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

beforeEach(() => {
  mem.text = [];
  mem.nextId = 1;
  mem.calls = [];
  emitEvent.mockClear();
});

describe('getDraft', () => {
  it('reports none when nothing exists', async () => {
    await expect(service.getDraft()).resolves.toEqual({ source: 'none', data: null, baseVersion: 0, latestPublishedVersion: 0, updatedAt: null });
  });

  it('falls back to the latest published text', async () => {
    seed([1, 2]);
    const view = await service.getDraft();
    expect(view).toMatchObject({ source: 'published', baseVersion: 2, latestPublishedVersion: 2 });
    expect(view.data?.strings.en['cart.drawer.title']).toBe('t2');
    expect(typeof view.updatedAt).toBe('string');
  });

  it('prefers the draft', async () => {
    seed([1]);
    await service.saveDraft(input('Draft', 1), 9);
    const view = await service.getDraft();
    expect(view).toMatchObject({ source: 'draft', baseVersion: 1, latestPublishedVersion: 1 });
    expect(view.data?.strings.en['cart.drawer.title']).toBe('Draft');
  });
});

describe('saveDraft', () => {
  it('creates the draft based on the latest published version (0 when none)', async () => {
    const res = await service.saveDraft(input('A', 0), 9);
    expect(res.baseVersion).toBe(0);
    expect(draft()).toMatchObject({ version: 0, createdBy: 9 });
  });

  it('updates the single draft in place', async () => {
    await service.saveDraft(input('A', 0), 9);
    await service.saveDraft(input('B', 0), 9);
    expect(mem.text.filter((r) => r.kind === 'draft')).toHaveLength(1);
    expect(titleOf(draft())).toBe('B');
  });

  it('takes the text lock before reading the latest version', async () => {
    await service.saveDraft(input('A', 0), 9);
    expect(mem.calls.slice(0, 2)).toEqual(['lock:text', 'latest:text']);
  });

  it('refuses a stale baseVersion with 409 SITETEXT_CONFLICT and writes nothing', async () => {
    seed([1, 2]);
    const err = await service.saveDraft(input('A', 1), 9).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err).toMatchObject({ message: 'SITETEXT_CONFLICT', statusCode: 409 });
    expect(draft()).toBeUndefined();
  });
});

describe('discardDraft', () => {
  it('reports whether a draft was removed, under the text lock', async () => {
    await service.saveDraft(input('A', 0), 9);
    mem.calls = [];
    await expect(service.discardDraft()).resolves.toEqual({ discarded: true });
    expect(mem.calls).toEqual(['lock:text', 'delete:text:tx']);
    await expect(service.discardDraft()).resolves.toEqual({ discarded: false });
  });
});

describe('versions', () => {
  it('lists newest first with the author, null when the author is gone', async () => {
    seed([1], null);
    seed([2], 9);
    const list = await service.listVersions();
    expect(list.map((v) => v.version)).toEqual([2, 1]);
    expect(list[0].createdBy).toEqual({ id: 9, name: 'Ada Admin' });
    expect(list[1].createdBy).toBeNull();
    expect(typeof list[0].createdAt).toBe('string');
  });

  it('returns one version or 404s', async () => {
    seed([1]);
    const v = await service.getVersion(1);
    expect(v).toMatchObject({ version: 1 });
    expect(v.data.strings.en['cart.drawer.title']).toBe('t1');
    await expect(service.getVersion(2)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('restoreVersion (shared text only)', () => {
  it('copies an old version into a NEW version, resets the draft to it and emits', async () => {
    seed([1, 2]);
    await service.saveDraft(input('unsaved', 2), 9);
    await expect(service.restoreVersion(1, 9)).resolves.toEqual({ version: 3 });
    expect(versions()).toEqual([1, 2, 3]);
    expect(titleOf(mem.text.find((r) => r.kind === 'published' && r.version === 3))).toBe('t1');
    expect(draft()).toMatchObject({ version: 3 });
    expect(titleOf(draft())).toBe('t1');
    expect(emitEvent).toHaveBeenCalledWith('storefront-text:published', { version: 3 }, { target: 'role:admin' });
    expect(mem.calls[0]).toBe('lock:text');
  });

  it('404s an unknown version and emits nothing', async () => {
    seed([1]);
    await expect(service.restoreVersion(7, 9)).rejects.toBeInstanceOf(NotFoundError);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('keeps only the newest 20 versions', async () => {
    seed(range(1, 20));
    await service.restoreVersion(20, 9);
    expect(versions()).toEqual(range(2, 21));
  });
});

describe('publishTextDraftInTx', () => {
  it('inserts latest+1 and re-bases the draft when the draft differs', async () => {
    seed([1]);
    await service.saveDraft(input('new', 1), 9);
    const step = await service.publishTextDraftInTx('tx' as never, draft()! as never, 1, 9);
    expect(step).toMatchObject({ textVersion: 2, textPublished: true });
    expect(step.publishedAt).toBeInstanceOf(Date);
    expect(versions()).toEqual([1, 2]);
    expect(draft()!.version).toBe(2);
    expect(emitEvent).not.toHaveBeenCalled(); // the caller emits after commit
  });

  it('inserts version 1 when nothing was ever published', async () => {
    await service.saveDraft(input('first', 0), 9);
    await expect(service.publishTextDraftInTx('tx' as never, draft()! as never, 0, 9)).resolves.toMatchObject({ textVersion: 1, textPublished: true });
  });

  it('identical text (stable JSON, key order ignored): no new version, draft re-based to latest', async () => {
    seed([1]);
    const reordered = { strings: { en: { 'cart.drawer.title': 't1' } }, language: { formatLocale: '', locale: 'en' }, schemaVersion: 1 as const };
    mem.text.push({ id: mem.nextId++, kind: 'draft', version: 0, data: reordered, createdBy: 9, createdAt: new Date(), updatedAt: new Date() });
    const step = await service.publishTextDraftInTx('tx' as never, draft()! as never, 1, 9);
    expect(step).toEqual({ textVersion: 1, textPublished: false, publishedAt: null });
    expect(versions()).toEqual([1]);
    expect(draft()!.version).toBe(1);
  });

  it('re-validates the stored draft (ZodError, nothing inserted)', async () => {
    mem.text.push({ id: mem.nextId++, kind: 'draft', version: 0, data: siteText('Hi {'), createdBy: 9, createdAt: new Date(), updatedAt: new Date() });
    await expect(service.publishTextDraftInTx('tx' as never, draft()! as never, 0, 9)).rejects.toBeInstanceOf(ZodError);
    expect(versions()).toEqual([]);
  });

  it('keeps only the newest 20 versions across 25 publishes', async () => {
    for (let i = 0; i < 25; i++) {
      await service.saveDraft(input(`p${i}`, i), 9);
      await service.publishTextDraftInTx('tx' as never, draft()! as never, i, 9);
    }
    expect(versions()).toEqual(range(6, 25));
    expect(draft()!.version).toBe(25);
  });
});

describe('restorePinnedTextInTx', () => {
  it('returns null when the pinned version is gone', async () => {
    seed([5]);
    await expect(service.restorePinnedTextInTx('tx' as never, 1, 9)).resolves.toBeNull();
    expect(versions()).toEqual([5]);
  });

  it('appends an older pin as a new version and resets the draft to it', async () => {
    seed([1, 2]);
    await expect(service.restorePinnedTextInTx('tx' as never, 1, 9)).resolves.toEqual({ textVersion: 3, textRestored: true });
    expect(titleOf(mem.text.find((r) => r.kind === 'published' && r.version === 3))).toBe('t1');
    expect(draft()).toMatchObject({ version: 3 });
  });

  it('skips the insert when the pin is the latest, but still resets the draft', async () => {
    seed([1, 2]);
    await service.saveDraft(input('unsaved', 2), 9);
    await expect(service.restorePinnedTextInTx('tx' as never, 2, 9)).resolves.toEqual({ textVersion: 2, textRestored: false });
    expect(versions()).toEqual([1, 2]);
    expect(titleOf(draft())).toBe('t2');
    expect(draft()!.version).toBe(2);
  });
});

describe('stableJson', () => {
  it('ignores key order at every depth but not array order', () => {
    expect(service.stableJson({ b: 1, a: { d: [1, 2], c: 'x' } })).toBe(service.stableJson({ a: { c: 'x', d: [1, 2] }, b: 1 }));
    expect(service.stableJson([1, 2])).not.toBe(service.stableJson([2, 1]));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/modules/storefront-text/service.test.ts`
Expected: FAIL — cannot resolve `./service`.

- [ ] **Step 4: Write the implementation**

Create `src/modules/storefront-text/service.ts`:

```ts
import * as store from './store';
import type { SiteTextRow } from './store';
import { siteTextSchema, type SaveTextDraftInput, type SiteText } from './schemas';
import type { StoredSiteText } from '../../db/schema/storefront-text';
import type { Executor } from '../../db/client';
import { emitEvent } from '../../lib/emitter';
import { ConflictError, NotFoundError } from '../../utils/errors';

/** Envelope `error` strings — the envelope carries no separate code. */
export const SITETEXT_CONFLICT = 'SITETEXT_CONFLICT';
export const TEXT_HISTORY_LIMIT = 20;
export const TEXT_PUBLISHED_EVENT = 'storefront-text:published';
/** The store language when no Site text was ever published. */
export const DEFAULT_LOCALE = 'en';

export interface TextDraftView {
  source: 'draft' | 'published' | 'none';
  data: StoredSiteText | null;
  baseVersion: number;
  latestPublishedVersion: number;
  updatedAt: string | null;
}

export interface TextVersionSummary {
  version: number;
  createdAt: string;
  createdBy: { id: number; name: string } | null;
}

export interface TextVersionDetail {
  version: number;
  createdAt: string;
  data: StoredSiteText;
}

export interface TextPublishStep {
  textVersion: number;
  textPublished: boolean;
  publishedAt: Date | null;
}

export function notifyTextPublished(version: number): void {
  emitEvent(TEXT_PUBLISHED_EVENT, { version }, { target: 'role:admin' });
}

/** JSON with object keys sorted at every depth, for "did anything change". */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Re-validate stored data: rules may have tightened since it was saved.
 *  A ZodError here is a 400 and rolls the transaction back. */
function parseStored(data: unknown): SiteText {
  return siteTextSchema.parse(data);
}

async function appendVersion(tx: Executor, data: SiteText, latest: number, userId: number): Promise<SiteTextRow> {
  const version = latest + 1;
  const row = await store.insertPublishedText(tx, { version, data, createdBy: userId });
  await store.prunePublishedTextBelow(tx, version - TEXT_HISTORY_LIMIT + 1);
  return row;
}

// ---------------------------------------------------------------------------
// Standalone routes (/storefront-text/*). Text lock only.
// ---------------------------------------------------------------------------

export async function getDraft(): Promise<TextDraftView> {
  const [draft, latest] = await Promise.all([store.findTextDraft(), store.findLatestPublishedText()]);
  const latestPublishedVersion = latest?.version ?? 0;
  if (draft) {
    return { source: 'draft', data: draft.data, baseVersion: draft.version, latestPublishedVersion, updatedAt: draft.updatedAt.toISOString() };
  }
  if (latest) {
    return { source: 'published', data: latest.data, baseVersion: latest.version, latestPublishedVersion, updatedAt: latest.updatedAt.toISOString() };
  }
  return { source: 'none', data: null, baseVersion: 0, latestPublishedVersion: 0, updatedAt: null };
}

/** Autosave. 409 when someone published text since this editor loaded. */
export async function saveDraft(input: SaveTextDraftInput, userId: number) {
  return store.inTransaction(async (tx) => {
    await store.lockText(tx);
    const latest = (await store.findLatestPublishedText(tx))?.version ?? 0;
    if (input.baseVersion < latest) throw new ConflictError(SITETEXT_CONFLICT);
    const row = await store.upsertTextDraft(tx, { version: latest, data: input.data, createdBy: userId });
    return { baseVersion: row.version, updatedAt: row.updatedAt.toISOString() };
  });
}

export async function discardDraft() {
  return store.inTransaction(async (tx) => {
    await store.lockText(tx);
    return { discarded: await store.deleteTextDraft(tx) };
  });
}

export async function listVersions(): Promise<TextVersionSummary[]> {
  const rows = await store.listPublishedText();
  return rows.map((r) => ({
    version: r.version,
    createdAt: r.createdAt.toISOString(),
    createdBy: r.createdById !== null ? { id: r.createdById, name: r.createdByName ?? '' } : null,
  }));
}

export async function getVersion(version: number): Promise<TextVersionDetail> {
  const row = await store.findPublishedText(version);
  if (!row) throw new NotFoundError('Site text version');
  return { version: row.version, createdAt: row.createdAt.toISOString(), data: row.data };
}

/** Restores only the shared text: page sets and their pins are untouched
 *  (a pin records history, it is not a live link). Always appends. */
export async function restoreVersion(version: number, userId: number) {
  const result = await store.inTransaction(async (tx) => {
    await store.lockText(tx);
    const source = await store.findPublishedText(version, tx);
    if (!source) throw new NotFoundError('Site text version');
    const latest = (await store.findLatestPublishedText(tx))?.version ?? source.version;
    const data = parseStored(source.data);
    const row = await appendVersion(tx, data, latest, userId);
    await store.upsertTextDraft(tx, { version: row.version, data, createdBy: userId });
    return { version: row.version };
  });
  notifyTextPublished(result.version);
  return result;
}

// ---------------------------------------------------------------------------
// In-transaction helpers for storefront-pages publish/restore. The caller
// holds the text lock (lockTextThenLayout) and emits events after commit.
// ---------------------------------------------------------------------------

export async function latestTextVersion(ex?: Executor): Promise<number> {
  return (await store.findLatestPublishedText(ex))?.version ?? 0;
}

export function findTextDraft(ex: Executor): Promise<SiteTextRow | null> {
  return store.findTextDraft(ex);
}

/** Publishes `draft` unless it equals the latest published text (stable JSON
 *  compare), in which case only the draft is re-based. */
export async function publishTextDraftInTx(tx: Executor, draft: SiteTextRow, latest: number, userId: number): Promise<TextPublishStep> {
  const data = parseStored(draft.data);
  const current = latest > 0 ? await store.findPublishedText(latest, tx) : null;
  if (current && stableJson(current.data) === stableJson(data)) {
    await store.setTextDraftVersion(tx, latest);
    return { textVersion: latest, textPublished: false, publishedAt: null };
  }
  const row = await appendVersion(tx, data, latest, userId);
  await store.setTextDraftVersion(tx, row.version);
  return { textVersion: row.version, textPublished: true, publishedAt: row.createdAt };
}

/** Restore-with-text: the pinned version becomes a new version (skipped when
 *  it already is the latest) and the draft is reset to it. null = pin gone. */
export async function restorePinnedTextInTx(tx: Executor, pin: number, userId: number): Promise<{ textVersion: number; textRestored: boolean } | null> {
  const source = await store.findPublishedText(pin, tx);
  if (!source) return null;
  const data = parseStored(source.data);
  const latest = await latestTextVersion(tx);
  if (pin === latest) {
    await store.upsertTextDraft(tx, { version: latest, data, createdBy: userId });
    return { textVersion: latest, textRestored: false };
  }
  const row = await appendVersion(tx, data, latest, userId);
  await store.upsertTextDraft(tx, { version: row.version, data, createdBy: userId });
  return { textVersion: row.version, textRestored: true };
}

/** For the public page-set read. */
export function getLatestPublishedText(): Promise<SiteTextRow | null> {
  return store.findLatestPublishedText();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/modules/storefront-text`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/storefront-text/service.ts src/modules/storefront-text/service.test.ts src/modules/storefront-text/store.fake.ts
git commit -m "feat(storefront-text): draft, history, restore and in-transaction publish helpers" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- src/modules/storefront-text/service.ts src/modules/storefront-text/service.test.ts src/modules/storefront-text/store.fake.ts
```

---

### Task 6: Page-set store — both-lock helper and `textVersion`

**Depends on:** Task 2, Task 3. **Wave 3.**

**Files:**
- Modify: `src/modules/storefront-pages/store.ts`
- Test: `src/modules/storefront-pages/store.test.ts` (append)

**Interfaces:**
- Consumes: `textLockSql()` from `../storefront-text/store` (Task 3); `storefrontPageSets.textVersion` (Task 2).
- Produces:
  - `lockTextThenLayout(tx: Executor, layout: StorefrontPageLayout): Promise<void>` — **the only** code path that holds both locks.
  - `PageSetWrite` gains `textVersion?: number | null`.
  - `VersionListRow` gains `textVersion: number | null`; `listPublishedQuery` selects it.
  - `PageSetRow` (row type) now has `textVersion: number | null`.

- [ ] **Step 1: Write the failing tests**

Append to `src/modules/storefront-pages/store.test.ts` (extend the `./store` import with `insertPublished` and `lockTextThenLayout`):

```ts
describe('lockTextThenLayout', () => {
  it('takes the text lock first, then the layout lock — the only order any both-lock path may use', async () => {
    const executed: unknown[][] = [];
    const tx = { execute: async (q: Parameters<PgDialect['sqlToQuery']>[0]) => { executed.push(new PgDialect().sqlToQuery(q).params); } };
    await lockTextThenLayout(tx as unknown as Executor, 'menu');
    expect(executed).toEqual([['storefront_text'], ['storefront_pages:menu']]);
  });
});

describe('text version pin', () => {
  it('lists published versions with their text_version pin', () => {
    const q = listPublishedQuery('menu').toSQL();
    expect(q.sql).toContain('"storefront_page_sets"."text_version"');
  });

  it('writes the pin on a published row', async () => {
    const inserted: object[] = [];
    const tx = { insert: () => ({ values: (v: object) => ({ returning: async () => { inserted.push(v); return [{ id: 1, ...v }]; } }) }) };
    await insertPublished(tx as unknown as Executor, { layout: 'menu', version: 4, data: {} as never, createdBy: 9, textVersion: 3 });
    expect(inserted[0]).toMatchObject({ kind: 'published', version: 4, textVersion: 3 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/storefront-pages/store.test.ts`
Expected: FAIL — `lockTextThenLayout` is not exported; the list SQL has no `text_version`.

- [ ] **Step 3: Write the implementation**

In `src/modules/storefront-pages/store.ts`:

1. Add after the existing imports:

```ts
import { textLockSql } from '../storefront-text/store';
```

2. Replace `VersionListRow` and `PageSetWrite` with:

```ts
export interface VersionListRow {
  version: number;
  createdAt: Date;
  createdById: number | null;
  createdByName: string | null;
  /** Site text version pinned by this page version (null before 0046). */
  textVersion: number | null;
}

export interface PageSetWrite {
  layout: StorefrontPageLayout;
  version: number;
  data: StoredPageSet;
  createdBy: number | null;
  /** Published rows only: the pinned Site text version (0 = none). */
  textVersion?: number | null;
}
```

3. Add after `lockLayout`:

```ts
/** The ONLY way to hold both the Site text lock and a layout lock (editable
 *  text §4.4 step 1): text first, then layout. Text-only writes take only
 *  the text lock and page-only writes only the layout lock, so no two
 *  transactions can wait on each other in opposite orders. */
export async function lockTextThenLayout(tx: Executor, layout: StorefrontPageLayout): Promise<void> {
  await tx.execute(textLockSql());
  await tx.execute(layoutLockSql(layout));
}
```

4. In `listPublishedQuery`, add `textVersion: t.textVersion,` to the selected fields (after `createdByName: users.name,`).

(`insertPublished` already spreads `input` into `values`, so `textVersion` is written. `upsertDraft` is never passed `textVersion`, so drafts keep `null`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/storefront-pages/store.test.ts`
Expected: PASS (existing SQL pins unchanged — the existing `listPublishedQuery` params assertion `['webapp', 'published']` still holds).
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(storefront-pages): lockTextThenLayout and the text_version pin in the store" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- src/modules/storefront-pages/store.ts src/modules/storefront-pages/store.test.ts
```

---

### Task 7: Page-set service — one-transaction publish, restore with text, public read

**Depends on:** Task 4, Task 5, Task 6. **Wave 4.**

**Files:**
- Modify: `src/modules/storefront-pages/service.ts`
- Test: `src/modules/storefront-pages/service.test.ts`

**Interfaces:**
- Consumes: `store.lockTextThenLayout`, `PageSetWrite.textVersion`, `VersionListRow.textVersion` (Task 6); `PublishInput`, `RestoreInput`, `pageSetSchema` (Task 4); from `../storefront-text/service` (Task 5): `SITETEXT_CONFLICT`, `DEFAULT_LOCALE`, `latestTextVersion`, `findTextDraft`, `publishTextDraftInTx`, `restorePinnedTextInTx`, `notifyTextPublished`, `getLatestPublishedText`; `createTextStoreFake`, `FakeTextRow` (Task 5, tests only).
- Produces (used by Task 9's controller):
  - `publish(layout, input: PublishInput, userId): Promise<PublishResult>` — `PublishResult = { version: number; publishedAt: string; pagesPublished: boolean; textVersion: number; textPublished: boolean }`
  - `restoreVersion(layout, version, userId, opts?: RestoreInput): Promise<RestoreResult>` — `RestoreResult = { version: number; textVersion: number; textRestored: boolean }`
  - `TEXT_VERSION_GONE = 'TEXT_VERSION_GONE'`
  - `VersionSummary.textVersion`, `VersionDetail.textVersion` (`number | null`)
  - `getPublishedPageSet(layout): Promise<PublishedPages | null>` — `PublishedPages = { version: number; data: StoredPageSet | null; text: PublishedText | null }`, `PublishedText = { version: number; locale: string; formatLocale: string; shared: StoredLocaleStrings; layout: StoredLocaleStrings }`

- [ ] **Step 1: Update the test harness (fake stores)**

In `src/modules/storefront-pages/service.test.ts`, replace everything from the first line down to (and including) the closing `});` of the existing `vi.mock('./store', …)` block with:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import type { FakeTextRow } from '../storefront-text/store.fake';

type Row = {
  id: number; layout: string; kind: 'draft' | 'published'; version: number;
  data: unknown; createdBy: number | null; textVersion?: number | null; createdAt: Date; updatedAt: Date;
};

// In-memory stand-ins for ./store and ../storefront-text/store (the seams
// every query goes through), so the service is tested without Postgres.
// `calls` records lock/read order; inTransaction rolls BOTH tables back when
// the callback throws, like a real transaction.
const { mem, emitEvent } = vi.hoisted(() => ({
  mem: {
    rows: [] as Row[],
    text: [] as FakeTextRow[],
    nextId: 1,
    calls: [] as string[],
    users: { 9: 'Ada Admin' } as Record<number, string>,
  },
  emitEvent: vi.fn(),
}));

vi.mock('../../lib/emitter', () => ({ emitEvent }));

vi.mock('../storefront-text/store', async () => {
  const { createTextStoreFake } = await import('../storefront-text/store.fake');
  return createTextStoreFake(mem);
});

vi.mock('./store', () => {
  const draftOf = (layout: string) => mem.rows.find((r) => r.layout === layout && r.kind === 'draft') ?? null;
  const publishedOf = (layout: string) =>
    mem.rows.filter((r) => r.layout === layout && r.kind === 'published').sort((a, b) => b.version - a.version);
  const insert = (row: Omit<Row, 'id' | 'createdAt' | 'updatedAt'>): Row => {
    const now = new Date();
    const r = { ...row, id: mem.nextId++, createdAt: now, updatedAt: now };
    mem.rows.push(r);
    return r;
  };
  type Write = { layout: string; version: number; data: unknown; createdBy: number | null; textVersion?: number | null };
  return {
    inTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const rows = structuredClone(mem.rows);
      const text = structuredClone(mem.text);
      try {
        return await fn('tx');
      } catch (e) {
        mem.rows = rows;
        mem.text = text;
        throw e;
      }
    },
    lockLayout: async (_tx: unknown, layout: string) => { mem.calls.push(`lock:${layout}`); },
    lockTextThenLayout: async (_tx: unknown, layout: string) => { mem.calls.push('lock:text', `lock:${layout}`); },
    findDraft: async (layout: string) => draftOf(layout),
    findLatestPublished: async (layout: string) => {
      mem.calls.push(`latest:${layout}`);
      return publishedOf(layout)[0] ?? null;
    },
    findPublished: async (layout: string, version: number) =>
      publishedOf(layout).find((r) => r.version === version) ?? null,
    listPublished: async (layout: string) =>
      publishedOf(layout).map((r) => {
        const name = r.createdBy !== null ? mem.users[r.createdBy] ?? null : null;
        return { version: r.version, createdAt: r.createdAt, createdById: name ? r.createdBy : null, createdByName: name, textVersion: r.textVersion ?? null };
      }),
    upsertDraft: async (_tx: unknown, input: Write) => {
      const existing = draftOf(input.layout);
      if (existing) {
        Object.assign(existing, { version: input.version, data: input.data, createdBy: input.createdBy, updatedAt: new Date() });
        return existing;
      }
      return insert({ ...input, textVersion: null, kind: 'draft' });
    },
    deleteDraft: async (layout: string, ex?: unknown) => {
      mem.calls.push(`delete:${layout}:${ex === 'tx' ? 'tx' : 'db'}`);
      const before = mem.rows.length;
      mem.rows = mem.rows.filter((r) => !(r.layout === layout && r.kind === 'draft'));
      return mem.rows.length < before;
    },
    insertPublished: async (_tx: unknown, input: Write) => {
      if (publishedOf(input.layout).some((r) => r.version === input.version)) {
        throw new Error('duplicate key value violates unique constraint "storefront_page_sets_published_uq"');
      }
      return insert({ ...input, textVersion: input.textVersion ?? null, kind: 'published' });
    },
    setDraftVersion: async (_tx: unknown, layout: string, version: number) => {
      const d = draftOf(layout);
      if (d) d.version = version;
    },
    prunePublishedBelow: async (_tx: unknown, layout: string, below: number) => {
      mem.rows = mem.rows.filter((r) => !(r.layout === layout && r.kind === 'published' && r.version < below));
    },
  };
});
```

Then, in the same file:

1. Change the imports below the mocks to:

```ts
import * as service from './service';
import * as textService from '../storefront-text/service';
import type { SaveDraftInput } from './schemas';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
```

2. In `seedPublished`, add `textVersion: null` to the pushed row.

3. Append these helpers after `draftRow`:

```ts
const siteText = (title: string) => ({
  schemaVersion: 1 as const,
  language: { locale: 'en', formatLocale: '' },
  strings: { en: { 'cart.drawer.title': title } },
});
function seedText(versions: number[]) {
  for (const version of versions) {
    const now = new Date(Date.UTC(2026, 8, version));
    mem.text.push({ id: mem.nextId++, kind: 'published', version, data: siteText(`t${version}`), createdBy: 9, createdAt: now, updatedAt: now });
  }
}
function seedTextDraft(title: string, version: number) {
  mem.text.push({ id: mem.nextId++, kind: 'draft', version, data: siteText(title), createdBy: 9, createdAt: new Date(), updatedAt: new Date() });
}
const textVersions = () => mem.text.filter((r) => r.kind === 'published').map((r) => r.version).sort((a, b) => a - b);
const textDraft = () => mem.text.find((r) => r.kind === 'draft');
const textTitle = (row: FakeTextRow | undefined) => row?.data.strings.en['cart.drawer.title'];
const pageRow = (layout: string, version: number) => mem.rows.find((r) => r.layout === layout && r.kind === 'published' && r.version === version)!;
const lockCalls = () => mem.calls.filter((c) => c.startsWith('lock:'));
```

4. In `beforeEach`, add `mem.text = [];`.

5. In the existing `restoreVersion` test `copies an old version into a NEW version and resets the draft to it`, change
   `await expect(service.restoreVersion('menu', 1, 9)).resolves.toEqual({ version: 3 });` to
   `await expect(service.restoreVersion('menu', 1, 9)).resolves.toEqual({ version: 3, textVersion: 0, textRestored: false });`.

- [ ] **Step 2: Write the failing tests**

Append to `src/modules/storefront-pages/service.test.ts`:

```ts
describe('publish — pages and shared text in one transaction (editable-text §4.4)', () => {
  it('page draft only and no `text` in the body (older admin): pins the current text version and leaves the text draft unpublished', async () => {
    seedText([1, 2, 3]);
    seedTextDraft('someone else’s edit', 3);
    await service.saveDraft('menu', draftInput('A', 0), 9);
    const res = await service.publish('menu', { baseVersion: 0 }, 9);
    expect(res).toMatchObject({ version: 1, pagesPublished: true, textVersion: 3, textPublished: false });
    expect(typeof res.publishedAt).toBe('string');
    expect(pageRow('menu', 1).textVersion).toBe(3);
    expect(textVersions()).toEqual([1, 2, 3]);
    expect(textTitle(textDraft())).toBe('someone else’s edit');
    expect(emitEvent).toHaveBeenCalledTimes(1);
    expect(emitEvent).toHaveBeenCalledWith('storefront-pages:published', { layout: 'menu', version: 1 }, { target: 'role:admin' });
  });

  it('pins 0 when no Site text was ever published', async () => {
    await service.saveDraft('menu', draftInput('A', 0), 9);
    await expect(service.publish('menu', { baseVersion: 0, text: { baseVersion: 0 } }, 9)).resolves.toMatchObject({ textVersion: 0, textPublished: false });
    expect(pageRow('menu', 1).textVersion).toBe(0);
  });

  it('text draft only: publishes the text, no page version, only the text event', async () => {
    seedPublished('menu', [1, 2]);
    seedText([1]);
    seedTextDraft('new', 1);
    const res = await service.publish('menu', { baseVersion: 2, text: { baseVersion: 1 } }, 9);
    expect(res).toMatchObject({ version: 2, pagesPublished: false, textVersion: 2, textPublished: true });
    expect(publishedVersions('menu')).toEqual([1, 2]);
    expect(textVersions()).toEqual([1, 2]);
    expect(textDraft()!.version).toBe(2);
    expect(emitEvent).toHaveBeenCalledTimes(1);
    expect(emitEvent).toHaveBeenCalledWith('storefront-text:published', { version: 2 }, { target: 'role:admin' });
  });

  it('both drafts: the new page version pins the NEW text version; both events after commit', async () => {
    seedText([1]);
    seedTextDraft('new', 1);
    await service.saveDraft('menu', draftInput('A', 0), 9);
    const res = await service.publish('menu', { baseVersion: 0, text: { baseVersion: 1 } }, 9);
    expect(res).toMatchObject({ version: 1, pagesPublished: true, textVersion: 2, textPublished: true });
    expect(pageRow('menu', 1).textVersion).toBe(2);
    expect(emitEvent).toHaveBeenCalledWith('storefront-pages:published', { layout: 'menu', version: 1 }, { target: 'role:admin' });
    expect(emitEvent).toHaveBeenCalledWith('storefront-text:published', { version: 2 }, { target: 'role:admin' });
  });

  it.each([
    ['no text in the body, no drafts', { baseVersion: 0 }],
    ['text in the body, no drafts', { baseVersion: 0, text: { baseVersion: 0 } }],
  ])('neither draft (%s) → 400 NO_DRAFT', async (_label, body) => {
    const err = await service.publish('menu', body, 9).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestError);
    expect(err).toMatchObject({ message: 'NO_DRAFT', statusCode: 400 });
  });

  it('a text draft with no `text` in the body does not count as a draft → NO_DRAFT', async () => {
    seedTextDraft('x', 0);
    await expect(service.publish('menu', { baseVersion: 0 }, 9)).rejects.toMatchObject({ message: 'NO_DRAFT' });
    expect(textVersions()).toEqual([]);
  });

  it('identical shared text: no new text version, draft re-based, no text event', async () => {
    seedText([1]);
    seedTextDraft('t1', 0);
    await service.saveDraft('menu', draftInput('A', 0), 9);
    const res = await service.publish('menu', { baseVersion: 0, text: { baseVersion: 1 } }, 9);
    expect(res).toMatchObject({ pagesPublished: true, textVersion: 1, textPublished: false });
    expect(textVersions()).toEqual([1]);
    expect(textDraft()!.version).toBe(1);
    expect(emitEvent).toHaveBeenCalledTimes(1);
  });

  it('a text 409 rolls back EVERYTHING and emits nothing', async () => {
    seedText([1, 2]);
    seedTextDraft('stale', 1);
    await service.saveDraft('menu', draftInput('A', 0), 9);
    const err = await service.publish('menu', { baseVersion: 0, text: { baseVersion: 1 } }, 9).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err).toMatchObject({ message: 'SITETEXT_CONFLICT', statusCode: 409 });
    expect(publishedVersions('menu')).toEqual([]);
    expect(draftRow('menu')!.version).toBe(0);
    expect(textVersions()).toEqual([1, 2]);
    expect(textDraft()!.version).toBe(1);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('a layout 409 publishes no text either', async () => {
    seedPublished('menu', [1, 2]);
    seedTextDraft('new', 0);
    mem.rows.push({ id: mem.nextId++, layout: 'menu', kind: 'draft', version: 2, data: setWith('D'), createdBy: 9, textVersion: null, createdAt: new Date(), updatedAt: new Date() });
    await expect(service.publish('menu', { baseVersion: 1, text: { baseVersion: 0 } }, 9)).rejects.toMatchObject({ message: 'PAGESET_CONFLICT' });
    expect(textVersions()).toEqual([]);
  });

  it('a page draft failing re-validation leaves the text history untouched', async () => {
    seedTextDraft('new', 0);
    mem.rows.push({
      id: mem.nextId++, layout: 'menu', kind: 'draft', version: 0,
      data: { ...setWith('bad'), pages: { nope: setWith('x').pages.catalog } },
      createdBy: 9, textVersion: null, createdAt: new Date(), updatedAt: new Date(),
    });
    await expect(service.publish('menu', { baseVersion: 0, text: { baseVersion: 0 } }, 9)).rejects.toBeInstanceOf(ZodError);
    expect(textVersions()).toEqual([]);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('a text draft failing re-validation publishes no page version', async () => {
    mem.text.push({ id: mem.nextId++, kind: 'draft', version: 0, data: siteText('Hi {'), createdBy: 9, createdAt: new Date(), updatedAt: new Date() });
    await service.saveDraft('menu', draftInput('A', 0), 9);
    await expect(service.publish('menu', { baseVersion: 0, text: { baseVersion: 0 } }, 9)).rejects.toBeInstanceOf(ZodError);
    expect(publishedVersions('menu')).toEqual([]);
  });

  it('takes the text lock, then the layout lock, first and only', async () => {
    seedTextDraft('new', 0);
    await service.saveDraft('menu', draftInput('A', 0), 9);
    mem.calls = [];
    await service.publish('menu', { baseVersion: 0, text: { baseVersion: 0 } }, 9);
    expect(mem.calls.slice(0, 2)).toEqual(['lock:text', 'lock:menu']);
    expect(lockCalls()).toEqual(['lock:text', 'lock:menu']);
  });
});

describe('restoreVersion with and without shared text (§4.5)', () => {
  /** page v1 pins text v1 ('first'); page v2 pins text v2 ('second'). */
  async function twoPageVersionsWithText() {
    seedTextDraft('first', 0);
    await service.saveDraft('menu', draftInput('A', 0), 9);
    await service.publish('menu', { baseVersion: 0, text: { baseVersion: 0 } }, 9);
    textDraft()!.data = siteText('second');
    await service.saveDraft('menu', draftInput('B', 1), 9);
    await service.publish('menu', { baseVersion: 1, text: { baseVersion: 1 } }, 9);
    expect([pageRow('menu', 1).textVersion, pageRow('menu', 2).textVersion]).toEqual([1, 2]);
    emitEvent.mockClear();
    mem.calls = [];
  }

  it('withText false (default): shared text untouched; the new page version pins the CURRENT text', async () => {
    await twoPageVersionsWithText();
    await expect(service.restoreVersion('menu', 1, 9)).resolves.toEqual({ version: 3, textVersion: 2, textRestored: false });
    expect(textVersions()).toEqual([1, 2]);
    expect(textTitle(textDraft())).toBe('second');
    expect(pageRow('menu', 3).textVersion).toBe(2);
    expect(emitEvent).toHaveBeenCalledTimes(1);
    expect(lockCalls()).toEqual(['lock:text', 'lock:menu']);
  });

  it('restores the per-layout overrides with the page set', async () => {
    const overrides = { strings: { en: { 'cart.drawer.title': 'Menu basket' } } };
    mem.rows.push({ id: mem.nextId++, layout: 'menu', kind: 'published', version: 1, data: { ...setWith('A'), text: overrides }, createdBy: 9, textVersion: 0, createdAt: new Date(), updatedAt: new Date() });
    seedPublished('menu', [2]);
    await service.restoreVersion('menu', 1, 9, { withText: false });
    expect((pageRow('menu', 3).data as { text?: unknown }).text).toEqual(overrides);
    expect((draftRow('menu')!.data as { text?: unknown }).text).toEqual(overrides);
  });

  it('withText true: the pinned text becomes a new text version, the text draft is reset, the page pins it', async () => {
    await twoPageVersionsWithText();
    await expect(service.restoreVersion('menu', 1, 9, { withText: true })).resolves.toEqual({ version: 3, textVersion: 3, textRestored: true });
    expect(textVersions()).toEqual([1, 2, 3]);
    expect(textTitle(mem.text.find((r) => r.kind === 'published' && r.version === 3))).toBe('first');
    expect(textDraft()).toMatchObject({ version: 3 });
    expect(textTitle(textDraft())).toBe('first');
    expect(pageRow('menu', 3).textVersion).toBe(3);
    expect(emitEvent).toHaveBeenCalledWith('storefront-pages:published', { layout: 'menu', version: 3 }, { target: 'role:admin' });
    expect(emitEvent).toHaveBeenCalledWith('storefront-text:published', { version: 3 }, { target: 'role:admin' });
    expect(lockCalls()).toEqual(['lock:text', 'lock:menu']);
  });

  it('withText true when the pin is already the latest: no new text version, draft reset, no text event', async () => {
    await twoPageVersionsWithText();
    textDraft()!.data = siteText('unsaved');
    await expect(service.restoreVersion('menu', 2, 9, { withText: true })).resolves.toEqual({ version: 3, textVersion: 2, textRestored: false });
    expect(textVersions()).toEqual([1, 2]);
    expect(textTitle(textDraft())).toBe('second');
    expect(emitEvent).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['null (published before text existed)', null],
    ['0 (no text existed then)', 0],
    ['pruned', 1],
  ])('withText true with a pin that is %s → 409 TEXT_VERSION_GONE, nothing changes', async (_label, pin) => {
    seedPublished('menu', [1]);
    pageRow('menu', 1).textVersion = pin;
    seedText([5]);
    const before = structuredClone({ rows: mem.rows, text: mem.text });
    const err = await service.restoreVersion('menu', 1, 9, { withText: true }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err).toMatchObject({ message: 'TEXT_VERSION_GONE', statusCode: 409 });
    expect(mem.rows).toEqual(before.rows);
    expect(mem.text).toEqual(before.text);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('an unknown page version is still a 404 when withText is set', async () => {
    await expect(service.restoreVersion('menu', 9, 9, { withText: true })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('restoring shared text on its own leaves every page set and its pin untouched', async () => {
    seedPublished('menu', [1]);
    seedPublished('storefront', [1]);
    seedText([1, 2]);
    const before = structuredClone(mem.rows);
    await expect(textService.restoreVersion(1, 9)).resolves.toEqual({ version: 3 });
    expect(mem.rows).toEqual(before);
  });
});

describe('versions carry the text pin', () => {
  it('in the list and in one version', async () => {
    seedPublished('menu', [1, 2]);
    pageRow('menu', 2).textVersion = 4;
    const list = await service.listVersions('menu');
    expect(list.map((v) => v.textVersion)).toEqual([4, null]);
    await expect(service.getVersion('menu', 2)).resolves.toMatchObject({ version: 2, textVersion: 4 });
    await expect(service.getVersion('menu', 1)).resolves.toMatchObject({ textVersion: null });
  });
});

describe('getPublishedPageSet — both text layers for the active locale (§4.6)', () => {
  it('null when nothing is published (drafts never count)', async () => {
    seedTextDraft('draft', 0);
    await service.saveDraft('menu', draftInput('draft only', 0), 9);
    await expect(service.getPublishedPageSet('menu')).resolves.toBeNull();
  });

  it('text only: version 0, data null, the shared layer', async () => {
    seedText([1]);
    await expect(service.getPublishedPageSet('menu')).resolves.toEqual({
      version: 0,
      data: null,
      text: { version: 1, locale: 'en', formatLocale: '', shared: { 'cart.drawer.title': 't1' }, layout: {} },
    });
  });

  it('pages only, no overrides: text is null', async () => {
    seedPublished('menu', [1]);
    const pub = await service.getPublishedPageSet('menu');
    expect(pub).toMatchObject({ version: 1, text: null });
    expect(titleOf(pub!.data)).toBe('v1');
  });

  it('strips data.text and serves this layout’s overrides as the layout layer', async () => {
    const overrides = { strings: { en: { 'cart.drawer.title': 'Menu basket' } } };
    mem.rows.push({ id: mem.nextId++, layout: 'menu', kind: 'published', version: 1, data: { ...setWith('A'), text: overrides }, createdBy: 9, textVersion: 0, createdAt: new Date(), updatedAt: new Date() });
    const pub = await service.getPublishedPageSet('menu');
    expect(pub!.data).not.toHaveProperty('text');
    expect(pub!.text).toEqual({ version: 0, locale: 'en', formatLocale: '', shared: {}, layout: { 'cart.drawer.title': 'Menu basket' } });
    expect((pageRow('menu', 1).data as { text?: unknown }).text).toEqual(overrides); // stored row not mutated
  });

  it('sends only the active locale’s layers', async () => {
    mem.text.push({
      id: mem.nextId++, kind: 'published', version: 1, createdBy: 9, createdAt: new Date(), updatedAt: new Date(),
      data: { schemaVersion: 1, language: { locale: 'de', formatLocale: 'de-DE' }, strings: { en: { 'cart.drawer.title': 'Your basket' }, de: { 'cart.drawer.title': 'Warenkorb' } } },
    });
    mem.rows.push({ id: mem.nextId++, layout: 'menu', kind: 'published', version: 1, data: { ...setWith('A'), text: { strings: { en: { 'cart.drawer.close': 'Close' }, de: { 'cart.drawer.close': 'Schließen' } } } }, createdBy: 9, textVersion: 1, createdAt: new Date(), updatedAt: new Date() });
    await expect(service.getPublishedPageSet('menu')).resolves.toMatchObject({
      text: { version: 1, locale: 'de', formatLocale: 'de-DE', shared: { 'cart.drawer.title': 'Warenkorb' }, layout: { 'cart.drawer.close': 'Schließen' } },
    });
  });

  it('an active locale with no stored strings gives empty layers — never another locale’s', async () => {
    mem.text.push({
      id: mem.nextId++, kind: 'published', version: 1, createdBy: 9, createdAt: new Date(), updatedAt: new Date(),
      data: { schemaVersion: 1, language: { locale: 'fr', formatLocale: '' }, strings: { en: { 'cart.drawer.title': 'Your basket' } } },
    });
    await expect(service.getPublishedPageSet('menu')).resolves.toMatchObject({ text: { locale: 'fr', shared: {}, layout: {} } });
  });
});
```

Also update the existing `versions and public read` test `serves only the latest published set — never the draft — and null when none` — it keeps passing unchanged (`pub!.version`, `titleOf(pub!.data)`); do not edit it.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/modules/storefront-pages/service.test.ts`
Expected: FAIL — publish returns `{ version, publishedAt }` only; `restoreVersion` ignores `withText`; no `textVersion` on versions; the public read has no `text`.

- [ ] **Step 4: Write the implementation**

Replace `src/modules/storefront-pages/service.ts` with:

```ts
import * as store from './store';
import {
  pageSetSchema,
  type PageLayout,
  type PublishInput,
  type RestoreInput,
  type SaveDraftInput,
} from './schemas';
import type { StoredPageSet } from '../../db/schema/storefront-pages';
import type { StoredLocaleStrings } from '../../db/schema/storefront-text';
import * as textService from '../storefront-text/service';
import { emitEvent } from '../../lib/emitter';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';

/** Envelope `error` strings (spec §13 A5 — the envelope carries no `code`). */
export const PAGESET_CONFLICT = 'PAGESET_CONFLICT';
export const NO_DRAFT = 'NO_DRAFT';
export const TEXT_VERSION_GONE = 'TEXT_VERSION_GONE';
export const PUBLISHED_HISTORY_LIMIT = 20;
export const PAGES_PUBLISHED_EVENT = 'storefront-pages:published';

export interface DraftView {
  layout: PageLayout;
  source: 'draft' | 'published' | 'none';
  data: StoredPageSet | null;
  baseVersion: number;
  latestPublishedVersion: number;
  updatedAt: string | null;
}

export interface VersionSummary {
  version: number;
  createdAt: string;
  createdBy: { id: number; name: string } | null;
  textVersion: number | null;
}

export interface VersionDetail {
  version: number;
  createdAt: string;
  data: StoredPageSet;
  textVersion: number | null;
}

export interface PublishResult {
  /** The layout's latest version afterwards (unchanged when pagesPublished is false). */
  version: number;
  publishedAt: string;
  pagesPublished: boolean;
  textVersion: number;
  textPublished: boolean;
}

export interface RestoreResult {
  version: number;
  textVersion: number;
  textRestored: boolean;
}

export interface PublishedText {
  version: number;
  locale: string;
  formatLocale: string;
  shared: StoredLocaleStrings;
  layout: StoredLocaleStrings;
}

export interface PublishedPages {
  version: number;
  data: StoredPageSet | null;
  text: PublishedText | null;
}

function notifyPublished(layout: PageLayout, version: number): void {
  emitEvent(PAGES_PUBLISHED_EVENT, { layout, version }, { target: 'role:admin' });
}

export async function getDraft(layout: PageLayout): Promise<DraftView> {
  const [draft, latest] = await Promise.all([store.findDraft(layout), store.findLatestPublished(layout)]);
  const latestPublishedVersion = latest?.version ?? 0;
  if (draft) {
    return { layout, source: 'draft', data: draft.data, baseVersion: draft.version, latestPublishedVersion, updatedAt: draft.updatedAt.toISOString() };
  }
  if (latest) {
    return { layout, source: 'published', data: latest.data, baseVersion: latest.version, latestPublishedVersion, updatedAt: latest.updatedAt.toISOString() };
  }
  return { layout, source: 'none', data: null, baseVersion: 0, latestPublishedVersion: 0, updatedAt: null };
}

/** Autosave. 409 when someone published since this editor loaded. The
 *  stored draft is always based on the current latest version. Layout lock only. */
export async function saveDraft(layout: PageLayout, input: SaveDraftInput, userId: number) {
  return store.inTransaction(async (tx) => {
    await store.lockLayout(tx, layout);
    const latest = (await store.findLatestPublished(layout, tx))?.version ?? 0;
    if (input.baseVersion < latest) throw new ConflictError(PAGESET_CONFLICT);
    const row = await store.upsertDraft(tx, { layout, version: latest, data: input.data, createdBy: userId });
    return { baseVersion: row.version, updatedAt: row.updatedAt.toISOString() };
  });
}

export async function discardDraft(layout: PageLayout) {
  return store.inTransaction(async (tx) => {
    await store.lockLayout(tx, layout);
    return { discarded: await store.deleteDraft(layout, tx) };
  });
}

/**
 * Publishes the layout draft and (when `input.text` is given) the shared Site
 * text draft in ONE transaction (editable-text §4.4). Every check and every
 * re-validation happens before the first write; any throw rolls back both.
 * Events fire after commit, only for what was inserted.
 */
export async function publish(layout: PageLayout, input: PublishInput, userId: number): Promise<PublishResult> {
  const result = await store.inTransaction(async (tx) => {
    await store.lockTextThenLayout(tx, layout);
    const latest = (await store.findLatestPublished(layout, tx))?.version ?? 0;
    if (input.baseVersion < latest) throw new ConflictError(PAGESET_CONFLICT);
    const latestText = await textService.latestTextVersion(tx);
    if (input.text && input.text.baseVersion < latestText) throw new ConflictError(textService.SITETEXT_CONFLICT);

    const draft = await store.findDraft(layout, tx);
    const textDraft = input.text ? await textService.findTextDraft(tx) : null;
    if (!draft && !textDraft) throw new BadRequestError(NO_DRAFT);
    const pageData = draft ? pageSetSchema.parse(draft.data) : null;

    const text = textDraft
      ? await textService.publishTextDraftInTx(tx, textDraft, latestText, userId)
      : { textVersion: latestText, textPublished: false, publishedAt: null };

    if (!pageData) {
      return {
        version: latest,
        publishedAt: (text.publishedAt ?? new Date()).toISOString(),
        pagesPublished: false,
        textVersion: text.textVersion,
        textPublished: text.textPublished,
      };
    }
    const version = latest + 1;
    const row = await store.insertPublished(tx, { layout, version, data: pageData, createdBy: userId, textVersion: text.textVersion });
    await store.setDraftVersion(tx, layout, version);
    await store.prunePublishedBelow(tx, layout, version - PUBLISHED_HISTORY_LIMIT + 1);
    return {
      version,
      publishedAt: row.createdAt.toISOString(),
      pagesPublished: true,
      textVersion: text.textVersion,
      textPublished: text.textPublished,
    };
  });
  if (result.pagesPublished) notifyPublished(layout, result.version);
  if (result.textPublished) textService.notifyTextPublished(result.textVersion);
  return result;
}

export async function listVersions(layout: PageLayout): Promise<VersionSummary[]> {
  const rows = await store.listPublished(layout);
  return rows.map((r) => ({
    version: r.version,
    createdAt: r.createdAt.toISOString(),
    createdBy: r.createdById !== null ? { id: r.createdById, name: r.createdByName ?? '' } : null,
    textVersion: r.textVersion ?? null,
  }));
}

export async function getVersion(layout: PageLayout, version: number): Promise<VersionDetail> {
  const row = await store.findPublished(layout, version);
  if (!row) throw new NotFoundError('Page set version');
  return { version: row.version, createdAt: row.createdAt.toISOString(), data: row.data, textVersion: row.textVersion ?? null };
}

/** History is never rewritten: the old data (including its per-layout text
 *  overrides) becomes a NEW version and the draft is reset to it. With
 *  `withText`, the version's pinned Site text is restored in the same
 *  transaction (§4.5); a missing pin is 409 TEXT_VERSION_GONE and nothing
 *  changes. */
export async function restoreVersion(layout: PageLayout, version: number, userId: number, opts: RestoreInput = {}): Promise<RestoreResult> {
  const result = await store.inTransaction(async (tx) => {
    await store.lockTextThenLayout(tx, layout);
    const source = await store.findPublished(layout, version, tx);
    if (!source) throw new NotFoundError('Page set version');
    const latest = (await store.findLatestPublished(layout, tx))?.version ?? source.version;
    const data = pageSetSchema.parse(source.data);

    let textVersion: number;
    let textRestored = false;
    if (opts.withText) {
      const pin = source.textVersion;
      const step = pin ? await textService.restorePinnedTextInTx(tx, pin, userId) : null;
      if (!step) throw new ConflictError(TEXT_VERSION_GONE);
      ({ textVersion, textRestored } = step);
    } else {
      textVersion = await textService.latestTextVersion(tx);
    }

    const next = latest + 1;
    await store.insertPublished(tx, { layout, version: next, data, createdBy: userId, textVersion });
    await store.upsertDraft(tx, { layout, version: next, data, createdBy: userId });
    await store.prunePublishedBelow(tx, layout, next - PUBLISHED_HISTORY_LIMIT + 1);
    return { version: next, textVersion, textRestored };
  });
  notifyPublished(layout, result.version);
  if (result.textRestored) textService.notifyTextPublished(result.textVersion);
  return result;
}

/** Own-property lookup: a locale is data, never a path into Object.prototype. */
function stringsFor(strings: Record<string, StoredLocaleStrings> | undefined, locale: string): StoredLocaleStrings {
  return strings && Object.prototype.hasOwnProperty.call(strings, locale) ? strings[locale] : {};
}

function withoutText(set: StoredPageSet): StoredPageSet {
  const { text: _overrides, ...rest } = set;
  return rest;
}

/**
 * Public read (storefront): the latest published set — never a draft — plus
 * both text layers for the active locale only, sent separately so the
 * storefront can reject a bad override per key and fall back to the shared
 * value (editable-text §4.6). `data.text` is stripped so the overrides are
 * not sent twice. `text` is null only when there is no published Site text
 * and no override for the active locale.
 */
export async function getPublishedPageSet(layout: PageLayout): Promise<PublishedPages | null> {
  const [latest, siteText] = await Promise.all([store.findLatestPublished(layout), textService.getLatestPublishedText()]);
  if (!latest && !siteText) return null;
  const locale = siteText?.data.language.locale ?? textService.DEFAULT_LOCALE;
  const formatLocale = siteText?.data.language.formatLocale ?? '';
  const layoutStrings = stringsFor(latest?.data.text?.strings, locale);
  const hasText = siteText !== null || Object.keys(layoutStrings).length > 0;
  return {
    version: latest?.version ?? 0,
    data: latest ? withoutText(latest.data) : null,
    text: hasText
      ? { version: siteText?.version ?? 0, locale, formatLocale, shared: stringsFor(siteText?.data.strings, locale), layout: layoutStrings }
      : null,
  };
}
```

If the backend's ESLint/tsc config flags the unused `_overrides` binding, replace the body of `withoutText` with `const rest = { ...set }; delete rest.text; return rest;`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/modules/storefront-pages src/modules/storefront-text`
Expected: PASS (router tests still pass: they stub the service).
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(storefront-pages): publish pages and shared text in one transaction; restore with text; text layers in the public read" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- src/modules/storefront-pages/service.ts src/modules/storefront-pages/service.test.ts
```

---

### Task 8: `/api/v1/storefront-text` HTTP layer, mount, body parser, permission domain

**Depends on:** Task 5. **Wave 4.**

**Files:**
- Create: `src/modules/storefront-text/controller.ts`, `src/modules/storefront-text/router.ts`
- Test: `src/modules/storefront-text/router.test.ts`
- Modify: `src/app.ts` (imports near line 39; scoped parser near line 83; mount after the `storefront-pages` mount near line 123)
- Modify: `src/app.mounts.test.ts`
- Modify: `src/config/modules.ts` (`DOMAINS` and `MODULES.storefront.primary`)
- Modify: `src/lib/permissions.test.ts`

**Interfaces:**
- Consumes: text service functions (Task 5); `saveTextDraftBodySchema`, `textVersionParamSchema` (Task 1).
- Produces: `storefrontTextRouter` (mounted at `/api/v1/storefront-text`, domain tag `storefront-text`); permission domain `'storefront-text'` granted by the Storefront module.

- [ ] **Step 1: Write the failing tests**

Create `src/modules/storefront-text/router.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

// Real router, controller and schemas; the service stubbed. `x-test-role`
// drives the authorize stub so the admin gate is exercised on every route.
const { svc } = vi.hoisted(() => ({
  svc: {
    getDraft: vi.fn(), saveDraft: vi.fn(), discardDraft: vi.fn(),
    listVersions: vi.fn(), getVersion: vi.fn(), restoreVersion: vi.fn(),
  },
}));

vi.mock('./service', () => svc);
vi.mock('../../middleware/authenticate', () => ({
  authenticate: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { id: 9, role: 'admin' };
    next();
  },
}));
vi.mock('../../middleware/authorize', async () => {
  const { ForbiddenError } = await import('../../utils/errors');
  return {
    authorize: (...roles: string[]) =>
      (req: { headers: Record<string, string | undefined> }, _res: unknown, next: (err?: unknown) => void) =>
        roles.includes(req.headers['x-test-role'] ?? 'admin') ? next() : next(new ForbiddenError('Insufficient permissions')),
  };
});

import { storefrontTextRouter } from './router';
import { errorHandler } from '../../middleware/error-handler';
import { ConflictError, NotFoundError } from '../../utils/errors';

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  // Mirrors app.ts: the scoped 1 MB parser first, then the global 100 KB one.
  app.use('/storefront-text', express.json({ limit: '1mb' }));
  app.use(express.json());
  app.use('/storefront-text', storefrontTextRouter);
  app.use(errorHandler);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  vi.clearAllMocks();
});

function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const siteText = (strings: Record<string, Record<string, unknown>> = { en: { 'cart.drawer.title': 'Your basket' } }) => ({
  schemaVersion: 1,
  language: { locale: 'en', formatLocale: '' },
  strings,
});
/** A valid document of roughly `kb` KB (1 000-char values). */
const paddedText = (kb: number) =>
  siteText({ en: Object.fromEntries(Array.from({ length: kb }, (_, i) => [`cart.pad.k${i}`, 'x'.repeat(1000)])) });

describe('admin gate', () => {
  it.each([
    ['GET', '/storefront-text/draft'],
    ['PUT', '/storefront-text/draft'],
    ['DELETE', '/storefront-text/draft'],
    ['GET', '/storefront-text/versions'],
    ['GET', '/storefront-text/versions/1'],
    ['POST', '/storefront-text/versions/1/restore'],
  ])('%s %s refuses a non-admin', async (method, path) => {
    const res = await call(method, path, method === 'PUT' ? { data: siteText(), baseVersion: 0 } : undefined, { 'x-test-role': 'staff' });
    expect(res.status).toBe(403);
    for (const fn of Object.values(svc)) expect(fn).not.toHaveBeenCalled();
  });
});

describe('draft', () => {
  it('GET returns the service view', async () => {
    svc.getDraft.mockResolvedValue({ source: 'none', data: null, baseVersion: 0, latestPublishedVersion: 0, updatedAt: null });
    const res = await call('GET', '/storefront-text/draft');
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ source: 'none', data: null, baseVersion: 0, latestPublishedVersion: 0, updatedAt: null });
  });

  it('PUT validates and passes the body and user id', async () => {
    svc.saveDraft.mockResolvedValue({ baseVersion: 2, updatedAt: '2026-09-30T00:00:00.000Z' });
    const res = await call('PUT', '/storefront-text/draft', { data: siteText(), baseVersion: 2 });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ baseVersion: 2, updatedAt: '2026-09-30T00:00:00.000Z' });
    expect(svc.saveDraft).toHaveBeenCalledWith({ data: siteText(), baseVersion: 2 }, 9);
  });

  it('PUT with a bad value is a 400 naming the key path', async () => {
    const res = await call('PUT', '/storefront-text/draft', { data: siteText({ en: { 'checkout.errors.paymentMissing': 'Pay {' } }), baseVersion: 0 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      'data.strings.en["checkout.errors.paymentMissing"]: A { or } is only allowed around a placeholder such as {name}',
    );
    expect(svc.saveDraft).not.toHaveBeenCalled();
  });

  it('PUT with an unknown field is a 400, never a silent strip', async () => {
    const res = await call('PUT', '/storefront-text/draft', { data: { ...siteText(), theme: 'dark' }, baseVersion: 0 });
    expect(res.status).toBe(400);
    expect(svc.saveDraft).not.toHaveBeenCalled();
  });

  it('PUT surfaces the conflict as 409 SITETEXT_CONFLICT', async () => {
    svc.saveDraft.mockRejectedValue(new ConflictError('SITETEXT_CONFLICT'));
    const res = await call('PUT', '/storefront-text/draft', { data: siteText(), baseVersion: 0 });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ success: false, data: null, error: 'SITETEXT_CONFLICT' });
  });

  it('DELETE', async () => {
    svc.discardDraft.mockResolvedValue({ discarded: true });
    const res = await call('DELETE', '/storefront-text/draft');
    expect((await res.json()).data).toEqual({ discarded: true });
  });
});

describe('body size (scoped 1 MB parser ahead of the 100 KB global one)', () => {
  it('a ~200 KB Site text (over 100 KB, under 256 KB) reaches the service', async () => {
    svc.saveDraft.mockResolvedValue({ baseVersion: 0, updatedAt: 'x' });
    const res = await call('PUT', '/storefront-text/draft', { data: paddedText(200), baseVersion: 0 });
    expect(res.status).toBe(200);
    expect(svc.saveDraft).toHaveBeenCalledTimes(1);
  });

  it('a ~300 KB Site text reaches the validator (400 naming the 256 KB cap), not a 413', async () => {
    const res = await call('PUT', '/storefront-text/draft', { data: paddedText(300), baseVersion: 0 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Site text may be at most 256 KB/);
    expect(svc.saveDraft).not.toHaveBeenCalled();
  });
});

describe('versions and restore', () => {
  it('lists versions', async () => {
    svc.listVersions.mockResolvedValue([{ version: 2, createdAt: 'x', createdBy: null }]);
    expect((await (await call('GET', '/storefront-text/versions')).json()).data).toEqual([{ version: 2, createdAt: 'x', createdBy: null }]);
  });

  it('gets one version with a coerced number; 400 for a non-number or 0; 404 passes through', async () => {
    svc.getVersion.mockResolvedValue({ version: 4, createdAt: 'x', data: siteText() });
    expect((await call('GET', '/storefront-text/versions/4')).status).toBe(200);
    expect(svc.getVersion).toHaveBeenCalledWith(4);
    expect((await call('GET', '/storefront-text/versions/abc')).status).toBe(400);
    expect((await call('GET', '/storefront-text/versions/0')).status).toBe(400);
    svc.getVersion.mockRejectedValue(new NotFoundError('Site text version'));
    expect((await call('GET', '/storefront-text/versions/9')).status).toBe(404);
  });

  it('restore passes the version and user', async () => {
    svc.restoreVersion.mockResolvedValue({ version: 5 });
    const res = await call('POST', '/storefront-text/versions/2/restore');
    expect((await res.json()).data).toEqual({ version: 5 });
    expect(svc.restoreVersion).toHaveBeenCalledWith(2, 9);
  });

  it('there is no standalone text publish route', async () => {
    expect((await call('POST', '/storefront-text/publish', {})).status).toBe(404);
  });
});
```

Note on the last test: the test app has no `notFound` handler, so Express 5's default 404 answers — that is what it asserts.

In `src/app.mounts.test.ts`:
- change `const BODY_PARSER_MOUNTS = [/^\/label-templates$/, /^\/storefront-pages$/];` to `const BODY_PARSER_MOUNTS = [/^\/label-templates$/, /^\/storefront-pages$/, /^\/storefront-text$/];`
- append inside the `describe`:

```ts
  it('scopes a 1 MB JSON parser to storefront-text ahead of the global parser (Site text is up to 256 KB)', () => {
    const scoped = source.indexOf("app.use('/api/v1/storefront-text', express.json({ limit: '1mb' }));");
    const global = source.indexOf('app.use(express.json({');
    expect(scoped).toBeGreaterThan(-1);
    expect(scoped).toBeLessThan(global);
  });
```

In `src/lib/permissions.test.ts`, append inside the `describe` that holds `grants the page-builder domain with the Storefront module`:

```ts
  it('grants the site-text domain with the Storefront module', () => {
    expect(expandToDomains({ storefront: 'write' })['storefront-text']).toBe('write');
    expect(expandToDomains({ storefront: 'read' })['storefront-text']).toBe('read');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/storefront-text/router.test.ts src/app.mounts.test.ts src/lib/permissions.test.ts`
Expected: FAIL — `./router` missing; the scoped parser line is absent; `storefront-text` domain undefined.

- [ ] **Step 3: Write the implementation**

Create `src/modules/storefront-text/controller.ts`:

```ts
import type { Request, Response } from 'express';
import * as storefrontTextService from './service';
import { saveTextDraftBodySchema, textVersionParamSchema } from './schemas';
import { sendSuccess } from '../../utils/response';

// Bodies and params are parsed here, not with validate(): the cross-repo
// contract fixes validation failures at 400 (errorHandler's ZodError answer),
// exactly as storefront-pages does.

export async function getDraft(_req: Request, res: Response) {
  sendSuccess(res, await storefrontTextService.getDraft());
}

export async function saveDraft(req: Request, res: Response) {
  const body = saveTextDraftBodySchema.parse(req.body);
  sendSuccess(res, await storefrontTextService.saveDraft(body, req.user!.id));
}

export async function discardDraft(_req: Request, res: Response) {
  sendSuccess(res, await storefrontTextService.discardDraft());
}

export async function listVersions(_req: Request, res: Response) {
  sendSuccess(res, await storefrontTextService.listVersions());
}

export async function getVersion(req: Request, res: Response) {
  const { version } = textVersionParamSchema.parse(req.params);
  sendSuccess(res, await storefrontTextService.getVersion(version));
}

export async function restoreVersion(req: Request, res: Response) {
  const { version } = textVersionParamSchema.parse(req.params);
  sendSuccess(res, await storefrontTextService.restoreVersion(version, req.user!.id));
}
```

Create `src/modules/storefront-text/router.ts`:

```ts
import { Router } from 'express';
import * as storefrontTextController from './controller';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';

/**
 * The store's shared Site text (spec 2026-09-30 editable-text §4.2), mounted
 * at `/api/v1/storefront-text`. Admin JWT only. There is deliberately NO
 * publish route: text is published through `POST /storefront-pages/:layout/publish`
 * so the owner always sees the "goes live on all 3 layouts" warning.
 */
export const storefrontTextRouter = Router();

storefrontTextRouter.get('/draft', authenticate, authorize('admin'), storefrontTextController.getDraft);
storefrontTextRouter.put('/draft', authenticate, authorize('admin'), storefrontTextController.saveDraft);
storefrontTextRouter.delete('/draft', authenticate, authorize('admin'), storefrontTextController.discardDraft);
storefrontTextRouter.get('/versions', authenticate, authorize('admin'), storefrontTextController.listVersions);
storefrontTextRouter.get('/versions/:version', authenticate, authorize('admin'), storefrontTextController.getVersion);
storefrontTextRouter.post('/versions/:version/restore', authenticate, authorize('admin'), storefrontTextController.restoreVersion);
```

In `src/app.ts`:
1. After `import { storefrontPagesRouter } from './modules/storefront-pages/router';` add
   `import { storefrontTextRouter } from './modules/storefront-text/router';`
2. After `app.use('/api/v1/storefront-pages', express.json({ limit: '1mb' }));` add:

```ts
// Site text is up to 256 KB serialized (storefront-text TEXT_LIMITS.docBytes);
// same reason and ordering as storefront-pages above.
app.use('/api/v1/storefront-text', express.json({ limit: '1mb' }));
```

3. After ``app.use(`${v1}/storefront-pages`, tagDomain('storefront-pages'), storefrontPagesRouter);`` add:

```ts
app.use(`${v1}/storefront-text`, tagDomain('storefront-text'), storefrontTextRouter);
```

In `src/config/modules.ts`:
- in `DOMAINS`, change `'storefront-settings', 'storefront-deploy', 'storefront-pages',` to `'storefront-settings', 'storefront-deploy', 'storefront-pages', 'storefront-text',`
- in `MODULES.storefront`, change `primary: ['storefront-settings', 'storefront-deploy', 'storefront-pages'],` to `primary: ['storefront-settings', 'storefront-deploy', 'storefront-pages', 'storefront-text'],`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/storefront-text src/app.mounts.test.ts src/lib/permissions.test.ts src/config`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/modules/storefront-text/controller.ts src/modules/storefront-text/router.ts src/modules/storefront-text/router.test.ts
git commit -m "feat(storefront-text): admin routes at /api/v1/storefront-text with a scoped 1 MB parser and permission domain" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- src/modules/storefront-text/controller.ts src/modules/storefront-text/router.ts src/modules/storefront-text/router.test.ts src/app.ts src/app.mounts.test.ts src/config/modules.ts src/lib/permissions.test.ts
```

---

### Task 9: Page-set HTTP layer — restore body, publish/public shapes

**Depends on:** Task 4, Task 7. **Wave 5.**

**Files:**
- Modify: `src/modules/storefront-pages/controller.ts` (`restoreVersion`)
- Test: `src/modules/storefront-pages/router.test.ts`

**Interfaces:**
- Consumes: `restoreBodySchema` (Task 4); `restoreVersion(layout, version, userId, opts)`, `PublishResult`, `PublishedPages` (Task 7).
- Produces: the HTTP contract rows for publish / restore / versions / public read in Global Constraints.

- [ ] **Step 1: Write the failing tests**

In `src/modules/storefront-pages/router.test.ts`:

1. In the existing `restore` test, change `expect(svc.restoreVersion).toHaveBeenCalledWith('menu', 2, 9);` to `expect(svc.restoreVersion).toHaveBeenCalledWith('menu', 2, 9, {});`.
2. Append:

```ts
describe('editable text over HTTP (editable-text §4.4–4.6)', () => {
  it('publish passes text.baseVersion through and returns the two-document result', async () => {
    const result = { version: 3, publishedAt: '2026-09-30T00:00:00.000Z', pagesPublished: true, textVersion: 5, textPublished: true };
    svc.publish.mockResolvedValue(result);
    const res = await call('POST', '/storefront-pages/menu/publish', { baseVersion: 2, text: { baseVersion: 4 } });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(result);
    expect(svc.publish).toHaveBeenCalledWith('menu', { baseVersion: 2, text: { baseVersion: 4 } }, 9);
  });

  it('publish rejects a malformed text base with 400', async () => {
    const res = await call('POST', '/storefront-pages/menu/publish', { baseVersion: 2, text: { baseVersion: -1 } });
    expect(res.status).toBe(400);
    expect(svc.publish).not.toHaveBeenCalled();
  });

  it('publish surfaces 409 SITETEXT_CONFLICT', async () => {
    svc.publish.mockRejectedValue(new ConflictError('SITETEXT_CONFLICT'));
    const res = await call('POST', '/storefront-pages/menu/publish', { baseVersion: 2, text: { baseVersion: 1 } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ success: false, data: null, error: 'SITETEXT_CONFLICT' });
  });

  it('restore with NO body and no content type (older admin) is a plain restore', async () => {
    svc.restoreVersion.mockResolvedValue({ version: 5, textVersion: 2, textRestored: false });
    const res = await fetch(`${base}/storefront-pages/menu/versions/2/restore`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ version: 5, textVersion: 2, textRestored: false });
    expect(svc.restoreVersion).toHaveBeenCalledWith('menu', 2, 9, {});
  });

  it('restore passes withText', async () => {
    svc.restoreVersion.mockResolvedValue({ version: 5, textVersion: 6, textRestored: true });
    await call('POST', '/storefront-pages/menu/versions/2/restore', { withText: true });
    expect(svc.restoreVersion).toHaveBeenCalledWith('menu', 2, 9, { withText: true });
  });

  it('restore rejects a non-boolean withText with 400', async () => {
    const res = await call('POST', '/storefront-pages/menu/versions/2/restore', { withText: 'yes' });
    expect(res.status).toBe(400);
    expect(svc.restoreVersion).not.toHaveBeenCalled();
  });

  it('restore surfaces 409 TEXT_VERSION_GONE', async () => {
    svc.restoreVersion.mockRejectedValue(new ConflictError('TEXT_VERSION_GONE'));
    const res = await call('POST', '/storefront-pages/menu/versions/2/restore', { withText: true });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('TEXT_VERSION_GONE');
  });

  it('PUT draft keeps the per-layout text overrides', async () => {
    svc.saveDraft.mockResolvedValue({ baseVersion: 0, updatedAt: 'x' });
    const text = { strings: { en: { 'cart.drawer.title': 'Menu basket' } } };
    await call('PUT', '/storefront-pages/menu/draft', { data: { ...validSet(), text }, baseVersion: 0 });
    expect(svc.saveDraft.mock.calls[0][1].data.text).toEqual(text);
  });

  it('the public read returns { version, data, text } verbatim, including the text-only shape', async () => {
    const body = { version: 0, data: null, text: { version: 1, locale: 'en', formatLocale: '', shared: { 'cart.drawer.title': 'Your basket' }, layout: {} } };
    svc.getPublishedPageSet.mockResolvedValue(body);
    const res = await call('GET', '/public/storefront/pages/menu', undefined, { 'x-test-role': 'nobody' });
    expect(await res.json()).toEqual({ success: true, data: body, error: null });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/storefront-pages/router.test.ts`
Expected: FAIL — `restoreVersion` is called with three arguments; `{ withText: 'yes' }` is not rejected.

- [ ] **Step 3: Write the implementation**

In `src/modules/storefront-pages/controller.ts`:
1. Extend the `./schemas` import to include `restoreBodySchema`.
2. Replace `restoreVersion` with:

```ts
export async function restoreVersion(req: Request, res: Response) {
  const { layout, version } = versionParamSchema.parse(req.params);
  // Optional body: an older admin POSTs nothing, and Express 5 then leaves
  // req.body undefined — that is a plain restore, not a 400.
  const body = restoreBodySchema.parse(req.body ?? {});
  sendSuccess(res, await storefrontPagesService.restoreVersion(layout, version, req.user!.id, body));
}
```

(`publish` already parses with `publishBodySchema` and passes the whole body, so `text` flows through unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/storefront-pages`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(storefront-pages): optional restore body with withText; text-aware publish over HTTP" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- src/modules/storefront-pages/controller.ts src/modules/storefront-pages/router.test.ts
```

---

### Task 10: Docs, OpenAPI and deploy notes

**Depends on:** Task 7, Task 8 (documents their final shapes). **Wave 5.**

**Files:**
- Modify: `STOREFRONT.md` (§3.11, §6.2, new §6.3, §7.2)
- Modify: `CLAUDE.md` (the "Storefront page builder" bullet; add a "Site text" bullet after it)
- Modify: `docs/websocket-guide.md` (the "Storefront Pages" section and the event table)
- Modify: `src/docs/registry.ts` (Storefront Pages entries + new Storefront Text entries)

**Interfaces:** none (docs only). The OpenAPI registry is compiled by `npm run build`, which is this task's test.

- [ ] **Step 1: `STOREFRONT.md` §3.11**

Replace the JSON example and the paragraph after it (from the ```` ```json ```` line through "…validates structure only (§6.2).") with:

````markdown
```json
{
  "version": 7,
  "data": { "schemaVersion": 1, "shell": { "root": { "props": { "title": "", "description": "", "chrome": "shell" } }, "content": [] }, "pages": {} },
  "text": {
    "version": 3,
    "locale": "en",
    "formatLocale": "",
    "shared": { "cart.drawer.title": "Your basket" },
    "layout": { "cart.drawer.title": "Your order" }
  }
}
```

- `data` is the published page set **without** its `text` field (its per-layout overrides arrive
  as `text.layout` instead), or `null` when this layout has never been published.
- `text` carries the **active store language only**: `locale` / `formatLocale` from the published
  Site text (`'en'` / `''` when none), `shared` = that Site text's strings for `locale`, `layout` =
  this layout's published overrides for `locale` (`{}` when none). `version` is the Site text
  version (0 if none). The two layers are sent separately so the storefront can reject a bad
  override per key and fall back to the shared value. `text` is `null` when there is no
  published Site text and no override for the locale.
- The whole body is `null` only when nothing is published at all (no page set **and** no Site
  text) — the storefront then renders its built-in defaults.

A v0.7.0 storefront reads only `version`/`data` and ignores `text`. The storefront reaches the
route as `GET /api/storefront/pages/:layout` through its Worker, edge-cached 30 s like
`/settings`. The document formats are owned by the storefront release
(`ecommerce-storefront/docs/builder.md`); the backend validates structure only (§6.2, §6.3).
````

- [ ] **Step 2: `STOREFRONT.md` §6.2**

1. In the endpoint table replace three rows:

```markdown
| POST | `/:layout/publish` | `{ baseVersion, text?: { baseVersion } }` | `{ version, publishedAt, pagesPublished, textVersion, textPublished }` |
| GET | `/:layout/versions` | — | `[{ version, createdAt, createdBy: { id, name } \| null, textVersion: number \| null }]`, newest first |
| GET | `/:layout/versions/:version` | — | `{ version, createdAt, data, textVersion }` |
| POST | `/:layout/versions/:version/restore` | optional `{ withText?: boolean }` | `{ version, textVersion, textRestored }` |
```

2. Append after the **Versions.** paragraph:

```markdown
**Publishing with shared text (storefront v0.8.0).** `publish` also publishes the store's Site
text draft (§6.3) when the body carries `text` — in **one transaction**: it takes the Site text
lock, then the layout lock (every both-lock path uses `lockTextThenLayout()` in `store.ts`), checks
`baseVersion` (409 `PAGESET_CONFLICT`) and `text.baseVersion` (409 `SITETEXT_CONFLICT`), then
re-validates both drafts before writing anything; either 409 rolls back everything. No layout
draft and (no `text` or no text draft) is 400 `NO_DRAFT`. A text draft identical to the latest
published text (stable JSON compare) re-bases the draft without a new version. The response's
`version` is the layout's latest version afterwards (unchanged when `pagesPublished` is false).
A body without `text` (an older admin) publishes the layout exactly as before and never the text
draft. Each published page version stores `textVersion`, the Site text version live right after
it (0 when none; `null` on rows published before migration `0046`). `storefront-pages:published`
fires only when a page version was inserted, `storefront-text:published` only when a text
version was inserted, both after commit.

**Restore with text.** `withText` (default `false`) restores the version's page set including its
per-layout text overrides; shared text is untouched and the new version pins the current text
version. With `withText: true` the pinned Site text is restored in the same transaction as a new
text version (skipped when it already is the latest) and the text draft is reset to it; a pin
that is `null`, `0` or pruned is **409 `TEXT_VERSION_GONE`** and nothing changes. A restore POST
with no body is a plain `withText: false` restore.

**Per-layout text overrides.** A page set may carry `text: { strings: { <locale>: { <key>: value } } }`
(validated with the §6.3 rules, strict). It counts toward the 512 KB cap and is never sanitised
or link-checked — the storefront renders it as plain text.
```

- [ ] **Step 3: `STOREFRONT.md` new §6.3** — insert before `## 7. Ops`:

```markdown
### 6.3 Site text (`/api/v1/storefront-text`)

The store's shared shopper-facing wording (spec
`ecommerce-storefront/docs/superpowers/specs/2026-09-30-editable-text-design.md`). Table
`storefront_site_text` (migration `0046` — **must be applied at deploy**, see §7.2): one `draft`
row and the newest 20 `published` rows. Admin JWT only (`authorize('admin')`; permission domain
`storefront-text`, granted by the Storefront module). The route has a scoped 1 MB JSON parser.

| Method | Path | Body | `data` |
|---|---|---|---|
| GET | `/draft` | — | `{ source: 'draft'\|'published'\|'none', data: SiteText\|null, baseVersion, latestPublishedVersion, updatedAt }` |
| PUT | `/draft` | `{ data: SiteText, baseVersion }` | `{ baseVersion, updatedAt }` — 409 `SITETEXT_CONFLICT` when `baseVersion` is below the latest published text version |
| DELETE | `/draft` | — | `{ discarded }` |
| GET | `/versions` | — | `[{ version, createdAt, createdBy: { id, name } \| null }]`, newest first |
| GET | `/versions/:version` | — | `{ version, createdAt, data }` |
| POST | `/versions/:version/restore` | — | `{ version }` — copied into a **new** version; the draft is reset to it |

There is **no** publish route: text is published through `POST /storefront-pages/:layout/publish`
(§6.2) so the owner always sees the admin's "goes live on all 3 layouts" warning. Every write
takes `pg_advisory_xact_lock(hashtext('storefront_text'))`. Publish and restore emit
`storefront-text:published` `{ version }` to `role:admin`.

`SiteText = { schemaVersion: 1, language: { locale, formatLocale }, strings: { <locale>: { <key>: string | { zero?, one?, two?, few?, many?, other } } } }`.
**Validation (structural only — the storefront release owns which keys and placeholders exist):**
strict objects (an unknown field is a 400); `locale`, `formatLocale` (or `''`) and every
`strings` locale are canonical BCP 47 `language[-Script][-REGION]`
(`^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|\d{3}))?$` and
`Intl.getCanonicalLocales(x)[0] === x`); ≤ 10 locales, ≤ 3 000 keys per locale; keys are 2–6
dot-separated segments (`^[a-z]+(?:\.[A-Za-z0-9][A-Za-z0-9_-]*){1,5}$`, ≤ 100 chars); every
string and plural form is 1–1 000 characters, has no control character except `\n`, uses
placeholders only as `{name}` (`\{[A-Za-z][A-Za-z0-9]{0,31}\}`, ≤ 10 distinct) with no other
`{`/`}`; a plural value's forms ⊆ `zero one two few many other` with `other` required;
serialised ≤ 256 KB. A 400 names the key: `"data.strings.en[\"checkout.errors.paymentMissing\"]: …"`.
Text is plain text, never HTML.
```

- [ ] **Step 4: `STOREFRONT.md` §7.2** — append after the **Page builder (storefront v0.7.0)** paragraph:

```markdown
**Editable text (storefront v0.8.0):** deploy the backend first — migration `0046` (new table
`storefront_site_text`, nullable `storefront_page_sets.text_version`, no backfill) applies on
startup. All contract changes are additive: an old storefront ignores the public read's `text`,
an old admin publishes layouts without `text` exactly as before and restores without a body.
Then redeploy storefronts to v0.8.0 from the admin, then the admin SPA. **Never reverse the
order:** an older backend would silently strip `PageSet.text` on every autosave (its page-set
root is a non-strict object). Live verification after deploy (publish a shared edit, check all
three layouts) is a pending manual step.
```

- [ ] **Step 5: `CLAUDE.md`**

Leave the existing "Storefront page builder" bullet as it is and add this new bullet directly after it:

```markdown
- **Storefront Site text** (editable text, storefront v0.8.0): `storefront_site_text` (migration `0046`) holds the store's one `draft` row and newest 20 `published` rows of shared shopper wording; module `src/modules/storefront-text/` (admin JWT, domain `storefront-text` under the Storefront module, scoped 1 MB parser). Validation is **structural only** (`schemas.ts`: canonical BCP 47 locales, `area.part.name` keys, `{name}` placeholders, plural forms, caps; strict objects). No standalone publish: `POST /storefront-pages/:layout/publish` with `text: { baseVersion }` publishes layout + text in **one transaction**; both-lock paths go through `lockTextThenLayout()` (text lock **then** layout lock — never the reverse). Page sets carry per-layout overrides in `text` (never sanitised) and published rows pin `text_version`; restore takes `{ withText }` (`409 TEXT_VERSION_GONE`). `409 SITETEXT_CONFLICT`; `storefront-text:published { version }` → `role:admin`. Public read `GET /public/storefront/pages/:layout` returns `{ version, data (without text), text: { version, locale, formatLocale, shared, layout } | null }` for the active locale only. Contract: `STOREFRONT.md` §3.11 / §6.2 / §6.3.
```

- [ ] **Step 6: `docs/websocket-guide.md`**

After the `storefront-pages:published` code block in the "Storefront Pages" section, append:

````markdown
| Event | Payload | When |
|---|---|---|
| `storefront-text:published` | `{ version }` | A new Site text version was published (through a layout publish) or restored |

```ts
socket.on("storefront-text:published", (data) => {
  // data = { version: 4 }
  // Invalidate GET /api/v1/storefront-text/versions and the text draft query —
  // an editor still on an older text baseVersion will now get 409 SITETEXT_CONFLICT.
});
```

`storefront-pages:published` now fires only when a page version was inserted: a publish that
only changed shared text emits `storefront-text:published` alone.
````

In the event table near the end, add after the `storefront-pages:published` row:

```markdown
| `storefront-text:published` | `{ version }` | `role:admin` |
```

- [ ] **Step 7: `src/docs/registry.ts`**

Replace the four `registry.registerPath` lines for `post /api/v1/storefront-pages/{layout}/publish`, `get …/{layout}/versions`, `get …/{layout}/versions/{version}`, `post …/{layout}/versions/{version}/restore`, and the `get /api/v1/public/storefront/pages/{layout}` line with:

```ts
registry.registerPath({ method: 'post', path: '/api/v1/storefront-pages/{layout}/publish', tags: ['Storefront Pages'], summary: 'Publish the layout draft (and, with `text`, the shared Site text draft) in one transaction', security: bearerAuth, description: 'Takes the Site text lock, then the layout lock. 409 PAGESET_CONFLICT / SITETEXT_CONFLICT roll back everything. Without `text` (older admin) the text draft is never published. The new page version pins textVersion. Emits storefront-pages:published when a page version was inserted and storefront-text:published when a text version was inserted.', request: { params: storefrontPageLayoutParam, body: { content: { 'application/json': { schema: z.object({ baseVersion: z.number().int().min(0), text: z.object({ baseVersion: z.number().int().min(0) }).optional() }) } } } }, responses: { 200: { description: '{ version, publishedAt, pagesPublished, textVersion, textPublished }' }, 400: { description: "Validation failed, or error = 'NO_DRAFT'" }, 409: { description: "error = 'PAGESET_CONFLICT' or 'SITETEXT_CONFLICT'" } } });
registry.registerPath({ method: 'get', path: '/api/v1/storefront-pages/{layout}/versions', tags: ['Storefront Pages'], summary: 'Published versions, newest first (max 20)', security: bearerAuth, request: { params: storefrontPageLayoutParam }, responses: { 200: { description: '[{ version, createdAt, createdBy: { id, name } | null, textVersion: number | null }]' } } });
registry.registerPath({ method: 'get', path: '/api/v1/storefront-pages/{layout}/versions/{version}', tags: ['Storefront Pages'], summary: 'One published version', security: bearerAuth, request: { params: storefrontPageVersionParams }, responses: { 200: { description: '{ version, createdAt, data: PageSet, textVersion: number | null }' }, 404: { description: 'Unknown version' } } });
registry.registerPath({ method: 'post', path: '/api/v1/storefront-pages/{layout}/versions/{version}/restore', tags: ['Storefront Pages'], summary: 'Restore a version as a NEW published version', security: bearerAuth, description: 'History is never rewritten. The draft is reset to the new version (including its per-layout text overrides). withText: true also restores the pinned Site text as a new text version. Emits storefront-pages:published (and storefront-text:published when text was restored).', request: { params: storefrontPageVersionParams, body: { content: { 'application/json': { schema: z.object({ withText: z.boolean().optional() }) } } } }, responses: { 200: { description: '{ version, textVersion, textRestored }' }, 400: { description: 'The old data fails current validation, or a bad body' }, 404: { description: 'Unknown version' }, 409: { description: "error = 'TEXT_VERSION_GONE' — the pin is null, 0 or pruned" } } });
registry.registerPath({ method: 'get', path: '/api/v1/public/storefront/pages/{layout}', tags: ['Storefront (public)'], summary: 'Latest published page set and text layers for a layout', description: 'Never returns a draft. data is the page set without its text field; text holds the active locale only (shared Site text + this layout\'s overrides). Behind the storefront kill switch. Edge-cached 30 s by the storefront Worker.', request: { params: storefrontPageLayoutParam }, responses: { 200: { description: '{ version, data: PageSet | null, text: { version, locale, formatLocale, shared, layout } | null } | null' }, 400: { description: 'Unknown layout' }, 503: { description: 'Storefront disabled (kill switch)' } } });
```

Then add after the last Storefront Pages entry:

```ts
const siteTextBody = z.object({ schemaVersion: z.literal(1), language: z.object({ locale: z.string(), formatLocale: z.string() }), strings: z.record(z.string(), z.record(z.string(), z.unknown())) });
const siteTextVersionParam = z.object({ version: z.number().int().positive() });
registry.registerPath({ method: 'get', path: '/api/v1/storefront-text/draft', tags: ['Storefront Text'], summary: 'Current Site text draft (or latest published)', security: bearerAuth, responses: { 200: { description: "{ source: 'draft'|'published'|'none', data: SiteText|null, baseVersion, latestPublishedVersion, updatedAt: string|null }" } } });
registry.registerPath({ method: 'put', path: '/api/v1/storefront-text/draft', tags: ['Storefront Text'], summary: 'Autosave the Site text draft', security: bearerAuth, description: 'Structural validation only (strict objects; canonical locales; area.part.name keys; {name} placeholders; plural forms; ≤ 256 KB). Body limit 1 MB.', request: { body: { content: { 'application/json': { schema: z.object({ data: siteTextBody, baseVersion: z.number().int().min(0) }) } } } }, responses: { 200: { description: '{ baseVersion, updatedAt }' }, 400: { description: 'Validation failed ("data.strings.en[\\"key\\"]: message; …")' }, 409: { description: "error = 'SITETEXT_CONFLICT'" } } });
registry.registerPath({ method: 'delete', path: '/api/v1/storefront-text/draft', tags: ['Storefront Text'], summary: 'Discard the Site text draft', security: bearerAuth, responses: { 200: { description: '{ discarded: boolean }' } } });
registry.registerPath({ method: 'get', path: '/api/v1/storefront-text/versions', tags: ['Storefront Text'], summary: 'Published Site text versions, newest first (max 20)', security: bearerAuth, responses: { 200: { description: '[{ version, createdAt, createdBy: { id, name } | null }]' } } });
registry.registerPath({ method: 'get', path: '/api/v1/storefront-text/versions/{version}', tags: ['Storefront Text'], summary: 'One published Site text version', security: bearerAuth, request: { params: siteTextVersionParam }, responses: { 200: { description: '{ version, createdAt, data: SiteText }' }, 404: { description: 'Unknown version' } } });
registry.registerPath({ method: 'post', path: '/api/v1/storefront-text/versions/{version}/restore', tags: ['Storefront Text'], summary: 'Restore a Site text version as a NEW version (all layouts)', security: bearerAuth, description: 'Page sets and their pins are untouched. The draft is reset to the new version. Emits storefront-text:published.', request: { params: siteTextVersionParam }, responses: { 200: { description: '{ version }' }, 400: { description: 'The old data fails current validation' }, 404: { description: 'Unknown version' } } });
```

- [ ] **Step 8: Verify**

Run: `npm run build`
Expected: exit 0 (compiles `registry.ts`).
Run: `npm test`
Expected: all files pass.

- [ ] **Step 9: Commit**

```bash
git commit -m "docs(storefront-text): contract, OpenAPI, websocket event and deploy order for editable text" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- STOREFRONT.md CLAUDE.md docs/websocket-guide.md src/docs/registry.ts
```

---

## Final gate (controller, after wave 5)

- [ ] `npm test` → all files pass (baseline 155 files / 2121 tests plus this plan's additions; no existing test deleted — only the two call-shape updates named in Tasks 7 and 9).
- [ ] `npm run build` → exit 0.
- [ ] `git log --oneline` shows the ten task commits; `git status` clean for every file in the file map.
- [ ] `drizzle/meta/_journal.json` has exactly one new entry (`idx: 46`); no migration was applied anywhere.
- [ ] Pending manual step after deploy (not part of this plan): with the storefront v0.8.0 and the new admin, publish a shared edit and confirm it on all three layouts.

## Cross-plan contract assumptions

- **Key shape:** `^[a-z]+(?:\.[A-Za-z0-9][A-Za-z0-9_-]*){1,5}$`, ≤ 100 chars — later segments may contain `-` and `_` (template ids such as `dark-luxury` in `templates.<templateId>.<name>`). The storefront registry must not generate keys outside this.
- **Length unit:** the 1–1 000 char cap counts UTF-16 code units (`String.length`), the same unit the storefront's `max` should use.
- **Validation error format:** ZodError string with key paths rendered `data.strings.en["cart.drawer.title"]: <message>` (Site text PUT) and `data.text.strings.en["…"]: <message>` (page-set PUT). Messages are the exact strings in Task 1 (e.g. `A { or } is only allowed around a placeholder such as {name}`).
- **Public read `text: null`:** only when there is no published Site text AND this layout's published overrides for the active locale are empty/absent; otherwise `text` is an object (`version: 0` when no Site text).
- **Publish result when no page draft:** `version` = the layout's current latest (0 if none), `pagesPublished: false`; `publishedAt` = the new text version's `createdAt`, or the request time when nothing was inserted.
- **Publish always takes both locks** (text then layout), even without `text` in the body, so the pin is read under the text lock.
- **Restore `withText: true` when the pin equals the latest text version:** no new text version, the text draft is still reset to the pinned data (discarding unpublished shared edits), `textRestored: false`, no text event.
- **Standalone text restore always appends** a new version (even when restoring the latest), mirroring page restore; response is `{ version }` only.
- **Text draft GET has no `layout` field** (shape `{ source, data, baseVersion, latestPublishedVersion, updatedAt }`); version detail `{ version, createdAt, data }` has no `createdBy`.
- **404 message** for an unknown text version: `Site text version not found`.
- **Permission domain** `storefront-text`, granted by the existing Storefront module (no admin-SPA change needed; the routes are `authorize('admin')` anyway).
- **Scoped body parser** `express.json({ limit: '1mb' })` on `/api/v1/storefront-text`.
