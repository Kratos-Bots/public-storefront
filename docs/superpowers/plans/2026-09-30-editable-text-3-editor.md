# Editable text — Plan 3: the editor (`/__builder`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The page builder edits every shopper-facing line of text: a **Text** panel (language, search, filters, groups, per-key rows with scope, plural forms, placeholder chips, issues), a **Text in this block** section under the selected block's fields, text issues in the header, text edits in the same undo/redo as block edits, and the additive protocol fields (`siteText`, `pageSet.text`, `textIssues`) that carry it all to the admin.

**Architecture:** Pure modules first (`editor/text/model.ts`, `catalog.ts`, `languages.ts`, `history.ts`, `issues.ts`), then the protocol/bridge, then the store + session (which own the draft `siteText` and `pageText` and post them), then React hooks and the canvas text scope (`PageSetOverrideProvider`'s `text` prop), then the UI (Text panel as a Puck left-sidebar plugin on wide frames and an overlay on narrow ones; "Text in this block" through Puck's `overrides.fields`). Every value that would fail the backend's structural validation is kept locally (and raised as a blocking issue) but never posted, so a half-typed `{` can never 400 an autosave.

**Tech Stack:** React 19, zustand 5, zod 4, `@puckeditor/core` 0.23.0 (plugins, `overrides.fields`, `history`), `@tanstack/react-query` 5, Vitest (jsdom), Playwright (mocked).

**Spec:** `ecommerce-storefront/docs/superpowers/specs/2026-09-30-editable-text-design.md` — this plan implements §7 (all of it) and the editor parts of §10. Read §3, §6.3, §6.4 and §13 too. Initiative rules: `ecommerce-storefront/docs/superpowers/specs/2026-09-30-puck-editable-overview.md`. House rules: `ecommerce-storefront/.superpowers/sdd/house-rules.md`.

**Runs after:** the core wave of Plan 2 (`2026-09-30-editable-text-2-runtime.md`) = Plan 2 **Tasks 1–5** committed: `web/src/text/{types,registry,resolve,plural,runtime,site-wide}.ts(x)` (`site-wide.ts` provisional until Plan 2 Task 15), the Task 4 seeds (incl. one fixed key, `closed.eyebrow`), `PageSet.text`, `fetchPublished`, `BlockDef.text`, and `PageSetOverrideProvider`'s `text` prop must exist. Task 12 additionally runs after Plan 2 **Task 16** (pre-flight: both own Playwright on port 5199 and both edit `docs/builder.md`). Plan 2's migration waves (feature files, block files) may run concurrently with this plan: **this plan never edits a file under `web/src/features/`, `web/src/layouts/`, `web/src/builder/blocks/`, `web/src/text/` or `web/src/builder/{define,runtime,types}.ts(x)`.**

All paths below are relative to `ecommerce-storefront/`; commands run in `ecommerce-storefront/web/` unless stated.

## Global Constraints

- Protocol stays `protocol: 1`; every new field is optional/additive (spec §7.1, overview rule 7).
- `sf-builder-load` gains `siteText?: SiteText | null`: **absent** = the admin cannot save shared text (edit this layout's overrides only; shared values read-only, from the public read); `null` = none stored yet (the editor starts from `{ schemaVersion: 1, language: { locale: 'en', formatLocale: '' }, strings: {} }`).
- `sf-builder-change`: `pageSet` carries `text` (omitted when no override is set); `siteText?: SiteText` present iff the load carried the key, always the full doc; `textIssues: TextIssue[]` (`{ scope: 'shared' | 'layout', key, rule, message }`), ≤ 500, blocking rules only (never `unknown-key`).
- The load-identity rules (`loadId`, exactly one change right after a load, none when read-only) cover `siteText` unchanged.
- Plain text only; never `dangerouslySetInnerHTML` for a text value (spec Guarantee 3).
- Backend structural limits, copied verbatim (spec §4.3): value and every plural form 1–1 000 chars; reject `/[\u0000-\u0009\u000B-\u001F\u007F]/`; placeholders `\{[A-Za-z][A-Za-z0-9]{0,31}\}`, no other `{`/`}`; ≤ 10 distinct placeholder names; plural keys ⊆ `zero one two few many other` with `other` required; locale `^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|\d{3}))?$` and `Intl.getCanonicalLocales(x)[0] === x`.
- Clearing a text box resets that key at that scope; an empty string is never stored (spec §1 decision 6).
- `fixed: true` keys (`closed.*`, `boot.*`) never appear as editable rows.
- Only posting is debounced (500 ms, `CHANGE_DEBOUNCE_MS`, unchanged); the canvas re-resolves on every keystroke.
- `@puckeditor/core` value imports only under `web/src/builder/editor/**`; the builder-isolation build check stays green.
- Editor chrome colours come from the editor's own neutral `--sfb-*` tokens (as `Editor.module.css` / `custom-fields/fields.module.css` do), never `--sf-*` and never the shop's palette. 44 × 44 is a shop rule; editor controls follow the existing `--sfb-control-h: 32px`. Honour `prefers-reduced-motion` (no smooth scroll under it).
- Imports use `@/…` with `.ts`/`.tsx` extensions. Commit by explicit pathspec with the house-rules trailer. Never regenerate a Playwright snapshot.
- Public repo: fixtures and examples use "Northbound Supply" / `shop.example` only.
- Every UI task (Tasks 9, 10, 11) loads the `frontend-design:frontend-design` skill before writing components or CSS.

## Review Focus

1. **Overrides stripped in transit** — a load whose `pageSet` carries `text` must produce a baseline change carrying the same `text`; today's strict `pageSetSchema` and `changeMessage` both drop it. Pinned in Task 5 (protocol + change message) and Task 7 (session baseline).
2. **A half-typed placeholder sitting past the debounce** (`"Only {avail"`) — the backend would 400 the autosave. It must stay in the editor with a blocking issue but be left out of the posted doc. Pinned in Task 1 (`isPostable`) and Task 7 (session posts without it, `textIssues` carries it).
3. **Old admin / bad `siteText`** — a load without `siteText`, or with a malformed one, must never post `siteText` (which would overwrite the store's shared text with nothing); shared inputs are disabled; layout overrides still post. Pinned in Task 5 (malformed → absent), Task 7 (no `siteText` in any change) and Task 9 (disabled "All layouts").
4. **Ctrl/⌘+Z while typing in the Text panel** — Puck's document-level hotkey would undo a (possibly unseen) block edit instead of the text. The unified history must undo in true order across text and block edits. Pinned in Task 4 (pure step decisions) and Task 10 (hotkey in a Text input, Undo button).
5. **Switching language to a many-category locale** — after `setLanguage({ locale: 'pl' })` the plural rows show `one few many other`, the counter names "polski", and `en` strings are kept (not served). Pinned in Task 7 (store keeps other locales) and Task 9 (Polish plural inputs).

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `web/src/builder/editor/text/model.ts` | Pure value/doc helpers: `TextScope`, `TextIssue`, empty docs, `cleanInput`, `normalizeValue`, `withValue`, backend-structural `isPostable`, `postableSiteText`, `postablePageText` | 1 |
| `web/src/builder/editor/text/catalog.ts` | Registry → editor rows (`TextRowDef`), labels, areas, groups (Site-wide first), block patterns, template filter, search match | 2 |
| `web/test/helpers/text-keys.ts` | Picks real registry keys of each kind for tests (plain, placeholder, plural, fixed) | 2 |
| `web/src/builder/editor/text/languages.ts` | Curated LTR language list, regional variants, locale validation, native names, plural samples | 3 |
| `web/src/builder/editor/text/history.ts` | Pure unified-undo decisions over Puck's history + text stack; the Puck anchor source | 4 |
| `web/src/builder/editor/protocol.ts`, `bridge.ts` | `siteText` on load, `pageSet.text` both ways, `siteText` + `textIssues` on change | 5 |
| `web/src/builder/editor/text/issues.ts` | `ruleFor`, messages, `textIssues()`, `resolveCell()`, `unusedEntries()` | 6 |
| `web/src/builder/editor/store.ts`, `page-set.ts`, `session.ts` | Draft `siteText` / `pageText`, text history, language, published fallback; `toPageSet` writes `text`; session posts text | 7 |
| `web/src/builder/editor/text/hooks.ts`, `text/ui-store.ts`, `text/scope.tsx`, `icons.tsx`, `EditorCanvas.tsx`, `ExactPreview.tsx` | React hooks, panel UI state, the canvas text scope, published-text sync, two icons | 8 |
| `web/src/builder/editor/text/TextRow.tsx`, `TextPanel.tsx`, `LanguageSection.tsx`, `Text.module.css` | The Text panel UI | 9 |
| `web/src/builder/editor/EditorHeader.tsx` | Text button, text issues in the issue list, unified Undo/Redo + hotkeys, anchor source | 10 |
| `web/src/builder/editor/text/BlockText.tsx`, `text/TextOverlay.tsx`, `text/plugin.tsx`, `EditorCanvas.tsx`, `EditorHeader.tsx` | "Text in this block", plugin placement on wide frames, overlay on narrow frames | 11 |
| `e2e/builder-editor.spec.ts`, `docs/builder.md` | Playwright pass + docs | 12 |

## Waves

| Wave | Tasks (disjoint files) | Needs |
|---|---|---|
| 1 | 1, 2, 3, 4 | Plan 2 core wave |
| 2 | 5, 6 | 1, 2, 3 |
| 3 | 7 | 1, 4, 5, 6 |
| 4 | 8 | 7 |
| 5 | 9, 10 | 8 |
| 6 | 11 | 9, 10 |
| 7 | 12 (**owns Playwright**) | all |

No task before Task 12 runs Playwright. Every task runs its own Vitest file(s); Tasks 7, 8, 10, 11 also run the whole editor Vitest set (`npx vitest run test/builder-editor`) because they touch shared editor files.

---

### Task 1: Text value model (pure)

**Depends on:** Plan 2 core wave (`@/text/types.ts`).

**Files:**
- Create: `web/src/builder/editor/text/model.ts`
- Test: `web/test/builder-editor-text-model.test.ts`

**Interfaces:**
- Consumes: `Locale, LocaleStrings, PageText, PluralForms, SiteText, TextLanguage, TextValue, TEXT_LIMITS` from `@/text/types.ts`.
- Produces:
  - `type TextScope = 'shared' | 'layout'`
  - `interface TextIssue { scope: TextScope; key: string; rule: string; message: string }`
  - `type StringsByLocale = Record<Locale, LocaleStrings>`
  - `PLURAL_FORMS: readonly ['zero','one','two','few','many','other']`, `type PluralForm`
  - `DEFAULT_LANGUAGE: TextLanguage` (`{ locale: 'en', formatLocale: '' }`)
  - `emptySiteText(): SiteText`, `emptyPageText(): PageText`
  - `cleanInput(text: string): string`
  - `normalizeValue(value: TextValue | null | undefined): TextValue | null`
  - `withValue(strings: StringsByLocale, locale: Locale, key: string, value: TextValue | null): StringsByLocale` (same object when unchanged)
  - `isPostable(value: unknown): boolean`
  - `postableSiteText(doc: SiteText): SiteText`, `postablePageText(doc: PageText): PageText | undefined`
  - `hasStrings(strings: StringsByLocale): boolean`
  - `valueStrings(value: TextValue | undefined): string[]`

- [ ] **Step 1: Write the failing test**

```ts
// web/test/builder-editor-text-model.test.ts
import { describe, expect, it } from 'vitest';
import {
  cleanInput, emptyPageText, emptySiteText, hasStrings, isPostable, normalizeValue, postablePageText, postableSiteText,
  valueStrings, withValue,
} from '@/builder/editor/text/model.ts';

describe('text model', () => {
  it('empty docs', () => {
    expect(emptySiteText()).toEqual({ schemaVersion: 1, language: { locale: 'en', formatLocale: '' }, strings: {} });
    expect(emptyPageText()).toEqual({ strings: {} });
    expect(emptySiteText()).not.toBe(emptySiteText());
  });

  it('cleanInput drops control characters, keeps newlines, turns tabs into spaces', () => {
    expect(cleanInput('a\u0000b\tc\nd\u007F')).toBe('ab c\nd');
  });

  it('normalizeValue: empty string and empty forms reset', () => {
    expect(normalizeValue('')).toBeNull();
    expect(normalizeValue(null)).toBeNull();
    expect(normalizeValue('Your basket')).toBe('Your basket');
    expect(normalizeValue({ one: '', other: '' })).toBeNull();
    expect(normalizeValue({ other: '{count} items', one: '' })).toEqual({ other: '{count} items' });
    // Forms come out in CLDR order whatever order they were typed in.
    expect(Object.keys(normalizeValue({ other: 'x', one: 'y', few: 'z' }) as object)).toEqual(['one', 'few', 'other']);
    // A plural without `other` is kept (the owner is mid-edit); it is not postable.
    expect(normalizeValue({ one: '1 item' })).toEqual({ one: '1 item' });
  });

  it('withValue sets, replaces and resets, dropping empty locale maps; unchanged returns the same object', () => {
    const a = {};
    const b = withValue(a, 'en', 'cart.drawer.title', 'Your basket');
    expect(b).toEqual({ en: { 'cart.drawer.title': 'Your basket' } });
    expect(withValue(b, 'en', 'cart.drawer.title', 'Your basket')).toBe(b);
    const c = withValue(b, 'de', 'cart.drawer.title', 'Warenkorb');
    expect(c).toEqual({ en: { 'cart.drawer.title': 'Your basket' }, de: { 'cart.drawer.title': 'Warenkorb' } });
    expect(withValue(c, 'en', 'cart.drawer.title', '')).toEqual({ de: { 'cart.drawer.title': 'Warenkorb' } });
    expect(withValue(a, 'en', 'cart.drawer.title', null)).toBe(a);
  });

  it('isPostable mirrors the backend structural rules', () => {
    expect(isPostable('Only {available} left')).toBe(true);
    expect(isPostable('Line one\nLine two')).toBe(true);
    expect(isPostable('')).toBe(false);
    expect(isPostable('x'.repeat(1000))).toBe(true);
    expect(isPostable('x'.repeat(1001))).toBe(false);
    expect(isPostable('Only {avail')).toBe(false);          // half-typed placeholder
    expect(isPostable('Braces } alone')).toBe(false);
    expect(isPostable('{1bad}')).toBe(false);
    expect(isPostable(`{${'a'.repeat(33)}}`)).toBe(false);  // name over 32 chars
    expect(isPostable('tab\there')).toBe(false);
    const eleven = Array.from({ length: 11 }, (_, i) => `{p${i}}`).join(' ');
    expect(isPostable(eleven)).toBe(false);
    expect(isPostable({ one: '{count} item', other: '{count} items' })).toBe(true);
    expect(isPostable({ one: '{count} item' })).toBe(false);  // no other
    expect(isPostable({ other: 'x', lots: 'y' })).toBe(false);
    expect(isPostable({ other: '' })).toBe(false);
    expect(isPostable(42)).toBe(false);
  });

  it('postable docs leave out what the backend would refuse, and keep other locales', () => {
    const doc = {
      schemaVersion: 1 as const,
      language: { locale: 'de', formatLocale: 'de-AT' },
      strings: { en: { 'a.b': 'Hi' }, de: { 'a.b': 'Hallo {nam', 'a.c': 'Gut' } },
    };
    expect(postableSiteText(doc)).toEqual({ schemaVersion: 1, language: { locale: 'de', formatLocale: 'de-AT' }, strings: { en: { 'a.b': 'Hi' }, de: { 'a.c': 'Gut' } } });
    expect(postablePageText({ strings: { en: { 'a.b': '{' } } })).toBeUndefined();
    expect(postablePageText({ strings: { en: { 'a.b': 'Ok' } } })).toEqual({ strings: { en: { 'a.b': 'Ok' } } });
    expect(hasStrings({ en: {} })).toBe(false);
  });

  it('valueStrings flattens a value for search', () => {
    expect(valueStrings(undefined)).toEqual([]);
    expect(valueStrings('a')).toEqual(['a']);
    expect(valueStrings({ one: 'x', other: 'y' })).toEqual(['x', 'y']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/builder-editor-text-model.test.ts`
Expected: FAIL — `Failed to resolve import "@/builder/editor/text/model.ts"`.

- [ ] **Step 3: Implement**

```ts
// web/src/builder/editor/text/model.ts
import { TEXT_LIMITS, type Locale, type LocaleStrings, type PageText, type PluralForms, type SiteText, type TextLanguage, type TextValue } from '@/text/types.ts';

/**
 * The editor's view of text values (spec §3, §7.4). Pure: no store, no registry. What the backend
 * refuses on autosave (spec §4.3) is mirrored in `isPostable`, so the editor can keep a half-typed
 * value on screen — with an issue — without ever posting it.
 */

export type TextScope = 'shared' | 'layout';
/** One blocking text problem, as posted in sf-builder-change `textIssues` (spec §7.1). */
export interface TextIssue { scope: TextScope; key: string; rule: string; message: string }
export type StringsByLocale = Record<Locale, LocaleStrings>;

export const PLURAL_FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;
export type PluralForm = (typeof PLURAL_FORMS)[number];
export const DEFAULT_LANGUAGE: TextLanguage = { locale: 'en', formatLocale: '' };

export const emptySiteText = (): SiteText => ({ schemaVersion: 1, language: { ...DEFAULT_LANGUAGE }, strings: {} });
export const emptyPageText = (): PageText => ({ strings: {} });

const CONTROL_RE = /[\u0000-\u0009\u000B-\u001F\u007F]/;
const CONTROL_RE_G = /[\u0000-\u0009\u000B-\u001F\u007F]/g;
const PLACEHOLDER_RE_G = /\{[A-Za-z][A-Za-z0-9]{0,31}\}/g;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** What can be typed or pasted: control characters go (a tab becomes a space); newlines stay. */
export function cleanInput(text: string): string {
  return text.replace(CONTROL_RE_G, (c) => (c === '\t' ? ' ' : ''));
}

/** '' → null (reset). A plural keeps its non-empty forms in CLDR order; none left → null. */
export function normalizeValue(value: TextValue | null | undefined): TextValue | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const s = cleanInput(value);
    return s === '' ? null : s;
  }
  const out: Partial<Record<PluralForm, string>> = {};
  for (const form of PLURAL_FORMS) {
    const v = (value as Partial<Record<PluralForm, unknown>>)[form];
    if (typeof v === 'string') {
      const s = cleanInput(v);
      if (s !== '') out[form] = s;
    }
  }
  return Object.keys(out).length === 0 ? null : (out as PluralForms);
}

const sameValue = (a: TextValue, b: TextValue): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Set (or with null/'' reset) one key in one locale. Returns `strings` itself when nothing changed. */
export function withValue(strings: StringsByLocale, locale: Locale, key: string, value: TextValue | null): StringsByLocale {
  const next = normalizeValue(value);
  const current = strings[locale]?.[key];
  if (next === null ? current === undefined : current !== undefined && sameValue(current, next)) return strings;
  const map: LocaleStrings = { ...(strings[locale] ?? {}) };
  if (next === null) delete map[key];
  else map[key] = next;
  const out: StringsByLocale = { ...strings };
  if (Object.keys(map).length === 0) delete out[locale];
  else out[locale] = map;
  return out;
}

function isPostableString(s: unknown): s is string {
  if (typeof s !== 'string' || s.length < 1 || s.length > TEXT_LIMITS.value) return false;
  if (CONTROL_RE.test(s)) return false;
  if (/[{}]/.test(s.replace(PLACEHOLDER_RE_G, ''))) return false;
  return new Set(s.match(PLACEHOLDER_RE_G) ?? []).size <= TEXT_LIMITS.placeholders;
}

/** Would the backend's `siteTextSchema` accept this value (spec §4.3)? Registry rules are not checked here. */
export function isPostable(value: unknown): boolean {
  if (typeof value === 'string') return isPostableString(value);
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (!keys.includes('other')) return false;
  return keys.every((k) => (PLURAL_FORMS as readonly string[]).includes(k) && isPostableString(value[k]));
}

function postableStrings(strings: StringsByLocale): StringsByLocale {
  const out: StringsByLocale = {};
  for (const [locale, map] of Object.entries(strings)) {
    const kept: LocaleStrings = {};
    for (const [key, v] of Object.entries(map)) if (isPostable(v)) kept[key] = v;
    if (Object.keys(kept).length > 0) out[locale] = kept;
  }
  return out;
}

export const hasStrings = (strings: StringsByLocale): boolean => Object.values(strings).some((m) => Object.keys(m).length > 0);

export function postableSiteText(doc: SiteText): SiteText {
  return { schemaVersion: 1, language: { locale: doc.language.locale, formatLocale: doc.language.formatLocale }, strings: postableStrings(doc.strings) };
}

/** undefined = nothing to send: `toPageSet` then omits `text`. */
export function postablePageText(doc: PageText): PageText | undefined {
  const strings = postableStrings(doc.strings);
  return hasStrings(strings) ? { strings } : undefined;
}

export function valueStrings(value: TextValue | undefined): string[] {
  if (value === undefined) return [];
  return typeof value === 'string' ? [value] : Object.values(value).filter((v): v is string => typeof v === 'string');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/builder-editor-text-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(builder): editor text value model — normalise, reset, backend-postable filter

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/editor/text/model.ts web/test/builder-editor-text-model.test.ts
```
(Stage new files first with `git add -- <the same paths>`; the same applies to every commit below.)

---

### Task 2: Text catalogue (registry → editor rows)

**Depends on:** Plan 2 core wave (`TEXT`, `TextKey` in `@/text/registry.ts`; `SITE_WIDE_TEXT` in `@/text/site-wide.ts`; `BlockDef.text` — see Cross-plan contract assumptions).

**Files:**
- Create: `web/src/builder/editor/text/catalog.ts`
- Create: `web/test/helpers/text-keys.ts`
- Test: `web/test/builder-editor-text-catalog.test.ts`

**Interfaces:**
- Consumes: `TEXT`, `type TextKey` (`@/text/registry.ts`); `SITE_WIDE_TEXT: readonly TextKeyPattern[]` (`@/text/site-wide.ts`; read as `readonly string[]`); `BLOCKS` (`@/builder/registry.ts`) with `def.text?: readonly TextKeyPattern[]`; `TextValue` (`@/text/types.ts`).
- Produces:
  - `interface TextRowDef { key: TextKey; area: string; label: string; note: string; def: TextValue; max: number; plural: boolean; placeholders: readonly string[]; multiline: boolean }`
  - `DEFAULT_MAX = 200`, `MULTILINE_OVER = 60`, `AREA_TITLES: Record<string, string>`, `SITE_WIDE_GROUP = 'site-wide'`
  - `allRows(): readonly TextRowDef[]` (non-fixed, registry order), `rowFor(key: string): TextRowDef | null`, `isFixedKey(key: string): boolean`
  - `labelFromKey(key: string): string`, `placeholdersOf(def: TextValue, plural: boolean): string[]`
  - `matchesPattern(key: string, pattern: string): boolean`, `isForTemplate(key: string, templateId: string): boolean`
  - `rowsMatching(patterns: readonly string[], templateId: string): TextRowDef[]`, `blockTextRows(blockName: string, templateId: string): TextRowDef[]`
  - `interface TextGroup { id: string; title: string; rows: TextRowDef[] }`, `textGroups(templateId: string): TextGroup[]`
  - `rowMatches(row: TextRowDef, query: string, extra?: readonly string[]): boolean`
  - Test helper `web/test/helpers/text-keys.ts`: `plainKey(): string`, `placeholderKey(): { key: string; name: string }`, `pluralKey(): string`, `fixedKey(): string`, `defaultOf(key: string): TextValue`

- [ ] **Step 1: Write the test helper and the failing test**

```ts
// web/test/helpers/text-keys.ts — real registry keys of each kind, so editor tests never hard-code
// a key Plan 2 might name differently.
import { TEXT } from '@/text/registry.ts';
import type { TextValue } from '@/text/types.ts';

interface Entry { en: TextValue; fixed?: boolean }
const entries = Object.entries(TEXT as unknown as Record<string, Entry>);
const PH = /\{([A-Za-z][A-Za-z0-9]{0,31})\}/;

function pick(what: string, pred: (key: string, e: Entry) => boolean): string {
  const hit = entries.find(([k, e]) => pred(k, e));
  if (!hit) throw new Error(`The text registry has no ${what} yet — Plan 2's core wave must land first (report BLOCKED)`);
  return hit[0];
}
const editable = (k: string, e: Entry) => !e.fixed && !k.startsWith('templates.');

export const plainKey = () => pick('plain string key', (k, e) => editable(k, e) && typeof e.en === 'string' && !PH.test(e.en) && e.en.length <= 60);
export function placeholderKey(): { key: string; name: string } {
  const key = pick('string key with a placeholder', (k, e) => editable(k, e) && typeof e.en === 'string' && PH.test(e.en));
  return { key, name: PH.exec((TEXT as unknown as Record<string, Entry>)[key]!.en as string)![1]! };
}
export const pluralKey = () => pick('plural key', (k, e) => editable(k, e) && typeof e.en !== 'string');
export const fixedKey = () => pick('fixed key', (_k, e) => e.fixed === true);
export const defaultOf = (key: string): TextValue => (TEXT as unknown as Record<string, Entry>)[key]!.en;
```

```ts
// web/test/builder-editor-text-catalog.test.ts
import { describe, expect, it } from 'vitest';
import { TEXT } from '@/text/registry.ts';
import {
  allRows, blockTextRows, isFixedKey, isForTemplate, labelFromKey, matchesPattern, placeholdersOf, rowFor, rowMatches,
  textGroups, SITE_WIDE_GROUP,
} from '@/builder/editor/text/catalog.ts';
import { defaultOf, fixedKey, placeholderKey, plainKey, pluralKey } from './helpers/text-keys.ts';

describe('text catalogue', () => {
  it('has one row per non-fixed registry key, in registry order', () => {
    const keys = Object.keys(TEXT);
    const rows = allRows();
    expect(rows.map((r) => r.key)).toEqual(keys.filter((k) => !isFixedKey(k)));
    expect(rowFor(fixedKey())).toBeNull();
    expect(rowFor('nope.nope')).toBeNull();
  });

  it('a row carries default, area, max, plural and placeholders', () => {
    const plain = rowFor(plainKey())!;
    expect(plain.def).toBe(defaultOf(plain.key));
    expect(plain.area).toBe(plain.key.split('.')[0]);
    expect(plain.max).toBeGreaterThanOrEqual((plain.def as string).length);
    expect(plain.plural).toBe(false);
    expect(plain.placeholders).toEqual([]);
    const { key, name } = placeholderKey();
    expect(rowFor(key)!.placeholders).toContain(name);
    const plural = rowFor(pluralKey())!;
    expect(plural.plural).toBe(true);
    expect(plural.placeholders).toContain('count');
  });

  it('placeholders are the union over forms; a plural always takes count', () => {
    expect(placeholdersOf({ one: 'One {thing}', other: '{count} {thing}s by {who}' }, true)).toEqual(['count', 'thing', 'who']);
    expect(placeholdersOf({ one: 'One', other: 'Many' }, true)).toEqual(['count']);
    expect(placeholdersOf('Hi {name}', false)).toEqual(['name']);
  });

  it('labels come from the last key segment', () => {
    expect(labelFromKey('checkout.errors.paymentMissing')).toBe('Payment missing');
    expect(labelFromKey('cart.drawer.title')).toBe('Title');
  });

  it('patterns: exact keys and area.part.* prefixes', () => {
    expect(matchesPattern('cart.summary.items', 'cart.summary.*')).toBe(true);
    expect(matchesPattern('cart.summaryx.items', 'cart.summary.*')).toBe(false);
    expect(matchesPattern('cart.summary', 'cart.summary.*')).toBe(false);
    expect(matchesPattern('cart.drawer.title', 'cart.drawer.title')).toBe(true);
    expect(matchesPattern('cart.drawer.titles', 'cart.drawer.title')).toBe(false);
  });

  it('template keys show only for the active template, plus the built-in default slots', () => {
    expect(isForTemplate('templates.bento.heroTitle', 'bento')).toBe(true);
    expect(isForTemplate('templates.bento.heroTitle', 'modern')).toBe(false);
    expect(isForTemplate('cart.drawer.title', 'modern')).toBe(true);
    // Plan 2: templates.default.* are the built-in slots every template without its own slot renders.
    expect(isForTemplate('templates.default.footer.support', 'modern')).toBe(true);
    expect(isForTemplate('templates.default.footer.support', 'bento')).toBe(true);
  });

  it('groups: Site-wide first, then areas; no key twice; only the active template', () => {
    const groups = textGroups('modern');
    const keys = groups.flatMap((g) => g.rows.map((r) => r.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k) => isForTemplate(k, 'modern'))).toBe(true);
    if (groups.some((g) => g.id === SITE_WIDE_GROUP)) expect(groups[0]!.id).toBe(SITE_WIDE_GROUP);
    expect(groups.every((g) => g.rows.length > 0 && g.title !== '')).toBe(true);
  });

  it('block rows follow the block definition patterns (unknown block → none)', () => {
    expect(blockTextRows('NoSuchBlock', 'modern')).toEqual([]);
  });

  it('search matches key, label, note, default and extra values, case-insensitively', () => {
    const row = rowFor(plainKey())!;
    expect(rowMatches(row, '')).toBe(true);
    expect(rowMatches(row, row.key.toUpperCase())).toBe(true);
    expect(rowMatches(row, (row.def as string).slice(0, 4).toLowerCase())).toBe(true);
    expect(rowMatches(row, 'zzqq-no-such')).toBe(false);
    expect(rowMatches(row, 'northbound', ['Northbound wording'])).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/builder-editor-text-catalog.test.ts`
Expected: FAIL — cannot resolve `@/builder/editor/text/catalog.ts`. (If it fails inside `helpers/text-keys.ts` with "Plan 2's core wave must land first", stop and report BLOCKED.)

- [ ] **Step 3: Implement**

```ts
// web/src/builder/editor/text/catalog.ts
import { TEXT, type TextKey } from '@/text/registry.ts';
import { SITE_WIDE_TEXT } from '@/text/site-wide.ts';
import { BLOCKS } from '@/builder/registry.ts';
import type { TextValue } from '@/text/types.ts';

/** The registry (Plan 2, spec §6.1) as the editor lists it: one row per key an owner may edit. */

interface Entry { en: TextValue; note?: string; label?: string; max?: number; fixed?: boolean }

export interface TextRowDef {
  key: TextKey;
  area: string;
  label: string;
  note: string;
  def: TextValue;
  max: number;
  plural: boolean;
  placeholders: readonly string[];
  /** A textarea instead of a one-line input (spec §7.2: default over 60 chars). */
  multiline: boolean;
}

export const DEFAULT_MAX = 200;
export const MULTILINE_OVER = 60;
export const SITE_WIDE_GROUP = 'site-wide';

/** Spec §6.1 areas, in Text panel order. `closed` and `boot` are fixed and never listed. */
export const AREA_TITLES: Record<string, string> = {
  common: 'Common',
  shell: 'Header, footer and menus',
  catalog: 'Catalogue',
  product: 'Product page',
  cart: 'Cart',
  checkout: 'Checkout',
  auth: 'Sign-in',
  account: 'Account',
  order: 'Order status',
  payment: 'Payment and order placed',
  tracking: 'Tracking',
  verify: 'Product check',
  wholesale: 'Wholesale',
  webapp: 'Telegram buttons',
  notices: 'Notices',
  errors: 'Error messages',
  templates: 'Template',
};
const AREA_ORDER = Object.keys(AREA_TITLES);

const REGISTRY = TEXT as unknown as Record<string, Entry>;
const NAME_RE = /\{([A-Za-z][A-Za-z0-9]{0,31})\}/g;

const forms = (v: TextValue): string[] => (typeof v === 'string' ? [v] : Object.values(v).filter((s): s is string => typeof s === 'string'));

export function placeholdersOf(def: TextValue, plural: boolean): string[] {
  const names = new Set<string>(plural ? ['count'] : []);
  for (const f of forms(def)) for (const m of f.matchAll(NAME_RE)) names.add(m[1]!);
  return [...names];
}

export function labelFromKey(key: string): string {
  const last = key.slice(key.lastIndexOf('.') + 1);
  const words = last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

let rows: TextRowDef[] | null = null;
let byKey: Map<string, TextRowDef> | null = null;

export function allRows(): readonly TextRowDef[] {
  if (rows) return rows;
  rows = [];
  for (const [key, e] of Object.entries(REGISTRY)) {
    if (e.fixed) continue;
    const plural = typeof e.en !== 'string';
    rows.push({
      key: key as TextKey,
      area: key.slice(0, key.indexOf('.')),
      label: e.label ?? labelFromKey(key),
      note: e.note ?? '',
      def: e.en,
      max: e.max ?? DEFAULT_MAX,
      plural,
      placeholders: placeholdersOf(e.en, plural),
      multiline: Math.max(...forms(e.en).map((f) => f.length)) > MULTILINE_OVER,
    });
  }
  byKey = new Map(rows.map((r) => [r.key, r]));
  return rows;
}

export function rowFor(key: string): TextRowDef | null {
  allRows();
  return byKey!.get(key) ?? null;
}

export const isFixedKey = (key: string): boolean => Object.hasOwn(REGISTRY, key) && REGISTRY[key]!.fixed === true;

/** Exact key, or `area.part.*` = every key starting with `area.part.` (spec §7.3). */
export function matchesPattern(key: string, pattern: string): boolean {
  return pattern.endsWith('.*') ? key.startsWith(pattern.slice(0, -1)) : key === pattern;
}

/**
 * `templates.<id>.*` keys belong to one template; the panel shows only the active one's, plus
 * `templates.default.*` — Plan 2's built-in slots, rendered by every template without its own slot.
 */
export const isForTemplate = (key: string, templateId: string): boolean =>
  !key.startsWith('templates.') || key.startsWith('templates.default.') || key.startsWith(`templates.${templateId}.`);

export function rowsMatching(patterns: readonly string[], templateId: string): TextRowDef[] {
  return allRows().filter((r) => isForTemplate(r.key, templateId) && patterns.some((p) => matchesPattern(r.key, p)));
}

export function blockTextRows(blockName: string, templateId: string): TextRowDef[] {
  const patterns = Object.hasOwn(BLOCKS, blockName) ? BLOCKS[blockName]!.text : undefined;
  return patterns ? rowsMatching(patterns, templateId) : [];
}

export interface TextGroup { id: string; title: string; rows: TextRowDef[] }

/** Site-wide (system mounts, spec §7.3) first; then one group per area. A key appears once. */
export function textGroups(templateId: string): TextGroup[] {
  const siteWide = rowsMatching(SITE_WIDE_TEXT, templateId);
  const taken = new Set<string>(siteWide.map((r) => r.key));
  const byArea = new Map<string, TextRowDef[]>();
  for (const r of allRows()) {
    if (taken.has(r.key) || !isForTemplate(r.key, templateId)) continue;
    const list = byArea.get(r.area) ?? [];
    list.push(r);
    byArea.set(r.area, list);
  }
  const areas = [...AREA_ORDER, ...[...byArea.keys()].filter((a) => !AREA_ORDER.includes(a))];
  const groups: TextGroup[] = [{ id: SITE_WIDE_GROUP, title: 'Site-wide', rows: siteWide }];
  for (const area of areas) groups.push({ id: area, title: AREA_TITLES[area] ?? labelFromKey(area), rows: byArea.get(area) ?? [] });
  return groups.filter((g) => g.rows.length > 0);
}

export function rowMatches(row: TextRowDef, query: string, extra: readonly string[] = []): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [row.key, row.label, row.note, ...forms(row.def), ...extra].some((s) => s.toLowerCase().includes(q));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/builder-editor-text-catalog.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(builder): editor text catalogue — rows, groups, block patterns, template filter

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/editor/text/catalog.ts web/test/helpers/text-keys.ts web/test/builder-editor-text-catalog.test.ts
```

---

### Task 3: Languages and formats (pure)

**Depends on:** Plan 2 core wave (`@/text/plural.ts`).

**Files:**
- Create: `web/src/builder/editor/text/languages.ts`
- Test: `web/test/builder-editor-text-languages.test.ts`

**Interfaces:**
- Consumes: `pluralCategory(locale: string, n: number): string`, `categoriesFor(locale: string): readonly string[]` from `@/text/plural.ts`.
- Produces:
  - `interface LanguageOption { code: string; regions: readonly string[] }`, `LANGUAGES: readonly LanguageOption[]`
  - `LOCALE_RE`, `isStoreLocale(tag: string): boolean`, `canonicalTag(input: string): string | null`
  - `nativeName(code: string): string`, `variantLabel(tag: string): string`, `formatSample(tag: string): string`
  - `formatOptions(locale: string): Array<{ value: string; label: string }>` (first is `''` = built-in)
  - `pluralFormsFor(locale: string): string[]` (`other` last), `sampleCount(locale: string, category: string): number`, `fillExample(form: string, n: number): string`

- [ ] **Step 1: Write the failing test**

```ts
// web/test/builder-editor-text-languages.test.ts
import { describe, expect, it } from 'vitest';
import {
  LANGUAGES, canonicalTag, fillExample, formatOptions, isStoreLocale, nativeName, pluralFormsFor, sampleCount, variantLabel,
} from '@/builder/editor/text/languages.ts';

const RTL = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'yi', 'dv', 'sd', 'ug', 'ckb']);

describe('store languages', () => {
  it('offers ~40 left-to-right languages, every tag in canonical store form', () => {
    expect(LANGUAGES.length).toBeGreaterThanOrEqual(38);
    expect(LANGUAGES[0]!.code).toBe('en');
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const l of LANGUAGES) {
      expect(RTL.has(l.code.split('-')[0]!)).toBe(false);
      expect(isStoreLocale(l.code), l.code).toBe(true);
      for (const r of l.regions) {
        expect(isStoreLocale(r), r).toBe(true);
        expect(r.startsWith(`${l.code}-`), r).toBe(true);
      }
    }
  });

  it('validates tags like the backend: shape and canonical form', () => {
    expect(isStoreLocale('en')).toBe(true);
    expect(isStoreLocale('pt-BR')).toBe(true);
    expect(isStoreLocale('zh-Hant')).toBe(true);
    expect(isStoreLocale('es-419')).toBe(true);
    expect(isStoreLocale('en-gb')).toBe(false);
    expect(isStoreLocale('EN')).toBe(false);
    expect(isStoreLocale('en-GB-oxendict')).toBe(false);
    expect(isStoreLocale('')).toBe(false);
    expect(canonicalTag(' en-gb ')).toBe('en-GB');
    expect(canonicalTag('zh-hant-tw')).toBe('zh-Hant-TW');
    expect(canonicalTag('not a tag')).toBeNull();
    expect(canonicalTag('en-GB-oxendict')).toBeNull();
  });

  it('names languages in themselves', () => {
    expect(nativeName('de')).toBe('Deutsch');
    expect(nativeName('en')).toBe('English');
    expect(nativeName('fr')).toBe('Français');
    expect(variantLabel('de-AT')).toMatch(/^Deutsch \(Österreich\)/);
  });

  it('format options start with the built-in choice', () => {
    const opts = formatOptions('de');
    expect(opts[0]).toEqual({ value: '', label: 'Built-in for Deutsch' });
    expect(opts.map((o) => o.value)).toContain('de-AT');
    expect(formatOptions('xx')).toEqual([{ value: '', label: 'Built-in for xx' }]);
  });

  it('plural forms per locale, other last, with a live example count', () => {
    expect(pluralFormsFor('en')).toEqual(['one', 'other']);
    expect(pluralFormsFor('pl')).toEqual(['one', 'few', 'many', 'other']);
    expect(sampleCount('en', 'one')).toBe(1);
    expect(sampleCount('en', 'other')).toBe(5);
    expect(sampleCount('pl', 'many')).toBe(5);
    expect(sampleCount('pl', 'few')).toBe(2);
    expect(fillExample('{count} items', 5)).toBe('5 items');
    expect(fillExample('{count} of {count}', 1000)).toBe('1000 of 1000');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/builder-editor-text-languages.test.ts`
Expected: FAIL — cannot resolve `@/builder/editor/text/languages.ts`.

- [ ] **Step 3: Implement**

```ts
// web/src/builder/editor/text/languages.ts
import { categoriesFor, pluralCategory } from '@/text/plural.ts';

/**
 * The store language picker (spec §7.2): left-to-right languages only (RTL is a non-goal, §6.5),
 * each with its common regional variants for "Numbers and dates". Every tag must pass the
 * backend's locale rule (spec §4.3); the test pins that.
 */

export interface LanguageOption { code: string; regions: readonly string[] }

export const LANGUAGES: readonly LanguageOption[] = [
  { code: 'en', regions: ['en-US', 'en-GB', 'en-IE', 'en-AU', 'en-CA', 'en-NZ', 'en-IN', 'en-ZA'] },
  { code: 'de', regions: ['de-DE', 'de-AT', 'de-CH'] },
  { code: 'fr', regions: ['fr-FR', 'fr-BE', 'fr-CH', 'fr-CA'] },
  { code: 'es', regions: ['es-ES', 'es-MX', 'es-AR', 'es-CO', 'es-US'] },
  { code: 'it', regions: ['it-IT', 'it-CH'] },
  { code: 'pt', regions: ['pt-PT', 'pt-BR'] },
  { code: 'nl', regions: ['nl-NL', 'nl-BE'] },
  { code: 'sv', regions: ['sv-SE', 'sv-FI'] },
  { code: 'da', regions: ['da-DK'] },
  { code: 'nb', regions: ['nb-NO'] },
  { code: 'fi', regions: ['fi-FI'] },
  { code: 'is', regions: ['is-IS'] },
  { code: 'pl', regions: ['pl-PL'] },
  { code: 'cs', regions: ['cs-CZ'] },
  { code: 'sk', regions: ['sk-SK'] },
  { code: 'hu', regions: ['hu-HU'] },
  { code: 'ro', regions: ['ro-RO', 'ro-MD'] },
  { code: 'bg', regions: ['bg-BG'] },
  { code: 'hr', regions: ['hr-HR'] },
  { code: 'sl', regions: ['sl-SI'] },
  { code: 'sr-Latn', regions: ['sr-Latn-RS'] },
  { code: 'et', regions: ['et-EE'] },
  { code: 'lv', regions: ['lv-LV'] },
  { code: 'lt', regions: ['lt-LT'] },
  { code: 'el', regions: ['el-GR', 'el-CY'] },
  { code: 'uk', regions: ['uk-UA'] },
  { code: 'ru', regions: ['ru-RU'] },
  { code: 'tr', regions: ['tr-TR'] },
  { code: 'ca', regions: ['ca-ES'] },
  { code: 'ga', regions: ['ga-IE'] },
  { code: 'mt', regions: ['mt-MT'] },
  { code: 'id', regions: ['id-ID'] },
  { code: 'ms', regions: ['ms-MY'] },
  { code: 'vi', regions: ['vi-VN'] },
  { code: 'th', regions: ['th-TH'] },
  { code: 'ja', regions: ['ja-JP'] },
  { code: 'ko', regions: ['ko-KR'] },
  { code: 'zh-Hans', regions: ['zh-Hans-CN', 'zh-Hans-SG'] },
  { code: 'zh-Hant', regions: ['zh-Hant-TW', 'zh-Hant-HK'] },
  { code: 'hi', regions: ['hi-IN'] },
  { code: 'fil', regions: ['fil-PH'] },
  { code: 'sw', regions: ['sw-KE', 'sw-TZ'] },
];

/** Backend rule (spec §4.3), copied verbatim. */
export const LOCALE_RE = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|\d{3}))?$/;

export function isStoreLocale(tag: string): boolean {
  if (!LOCALE_RE.test(tag)) return false;
  try {
    return Intl.getCanonicalLocales(tag)[0] === tag;
  } catch {
    return false;
  }
}

/** What the owner typed → the canonical tag, or null when the backend would refuse it. */
export function canonicalTag(input: string): string | null {
  try {
    const tag = Intl.getCanonicalLocales(input.trim())[0];
    return tag && isStoreLocale(tag) ? tag : null;
  } catch {
    return null;
  }
}

const capitalise = (name: string, locale: string) => name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);

function displayName(tag: string): string {
  try {
    const name = new Intl.DisplayNames([tag], { type: 'language' }).of(tag);
    return name && name !== tag ? capitalise(name, tag) : tag;
  } catch {
    return tag;
  }
}

/** "Deutsch", "Français" — a language named in itself. */
export const nativeName = (code: string): string => displayName(code);

/** "Deutsch (Österreich) · 1.234,5 · 30.09.2026" */
export function variantLabel(tag: string): string {
  return `${displayName(tag)} · ${formatSample(tag)}`;
}

const SAMPLE_DATE = new Date(Date.UTC(2026, 8, 30, 12));
export function formatSample(tag: string): string {
  try {
    return `${new Intl.NumberFormat(tag).format(1234.5)} · ${new Intl.DateTimeFormat(tag, { timeZone: 'UTC' }).format(SAMPLE_DATE)}`;
  } catch {
    return tag;
  }
}

export function formatOptions(locale: string): Array<{ value: string; label: string }> {
  const lang = LANGUAGES.find((l) => l.code === locale);
  return [
    { value: '', label: `Built-in for ${nativeName(locale)}` },
    ...(lang?.regions ?? []).map((r) => ({ value: r, label: variantLabel(r) })),
  ];
}

/** The forms an owner fills for a plural key in this locale (spec §7.2), `other` last. */
export function pluralFormsFor(locale: string): string[] {
  return [...categoriesFor(locale).filter((c) => c !== 'other'), 'other'];
}

// 1 and 5 first, so English reads "1 item" / "5 items" (spec §7.2); the rest reach every CLDR category.
const SAMPLES = [1, 5, 2, 3, 4, 0, 6, 7, 11, 12, 21, 22, 25, 100, 101, 102, 1_000_000, 1.5];
/** The smallest count that picks this category, for the live example ("1 item" / "5 items"). */
export function sampleCount(locale: string, category: string): number {
  for (const n of SAMPLES) if (pluralCategory(locale, n) === category) return n;
  return 5;
}

/** `{count}` as `tp()` inserts it: String(n), never a grouped number (spec §6.4). */
export const fillExample = (form: string, n: number): string => form.replace(/\{count\}/g, String(n));
```

If a listed tag fails `isStoreLocale` on the test machine's ICU, drop that tag from the list (do not loosen the rule).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/builder-editor-text-languages.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(builder): store language list, locale validation and plural samples for the Text panel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/editor/text/languages.ts web/test/builder-editor-text-languages.test.ts
```

---

### Task 4: Unified undo decisions (pure)

**Depends on:** nothing.

**Files:**
- Create: `web/src/builder/editor/text/history.ts`
- Test: `web/test/builder-editor-text-history.test.ts`

**Interfaces:**
- Produces:
  - `interface TextHistoryEntry<S> { snap: S; anchor: string | null }`
  - `interface PuckHistoryView { anchor: string | null; hasPast: boolean; hasFuture: boolean; anchors: readonly (string | null)[]; index: number }`
  - `puckHistoryView(h: { histories: ReadonlyArray<{ id?: string }>; index: number; hasPast: boolean; hasFuture: boolean }): PuckHistoryView`
  - `undoStep(top: { anchor: string | null } | undefined, puck: PuckHistoryView): 'text' | 'doc' | null`
  - `redoStep(top: { anchor: string | null } | undefined, puck: PuckHistoryView): 'text' | 'doc' | 'discard' | null`
  - `COALESCE_MS = 1000`, `TEXT_HISTORY_MAX = 100`
  - `setAnchorSource(fn: (() => string | null) | null): void`, `currentAnchor(): string | null`

**Model.** Puck owns block history (entries with ids, an index). A text edit records the id of Puck's *current* entry (its anchor). Undo: text first when the top text edit's anchor is Puck's current entry (nothing happened on the canvas since), or when Puck has nothing left; otherwise step Puck back. Redo mirrors it; a text redo whose anchor is now *behind* Puck's position (a block edit branched the history) is discarded.

- [ ] **Step 1: Write the failing test**

```ts
// web/test/builder-editor-text-history.test.ts
import { describe, expect, it } from 'vitest';
import { currentAnchor, puckHistoryView, redoStep, setAnchorSource, undoStep } from '@/builder/editor/text/history.ts';

const view = (ids: string[], index: number) =>
  puckHistoryView({ histories: ids.map((id) => ({ id })), index, hasPast: index > 0, hasFuture: index < ids.length - 1 });

describe('unified undo', () => {
  it('replays D1, T(at D1), D2 backwards and forwards in true order', () => {
    // Undo 1: a block edit came after the text edit → Puck back.
    expect(undoStep({ anchor: 'd1' }, view(['d0', 'd1', 'd2'], 2))).toBe('doc');
    // Undo 2: Puck is where the text edit happened → the text.
    expect(undoStep({ anchor: 'd1' }, view(['d0', 'd1', 'd2'], 1))).toBe('text');
    // Undo 3: no text left → Puck back.
    expect(undoStep(undefined, view(['d0', 'd1', 'd2'], 1))).toBe('doc');
    // Redo 1: the text redo is anchored at d1, Puck is at d0 → forward first.
    expect(redoStep({ anchor: 'd1' }, view(['d0', 'd1', 'd2'], 0))).toBe('doc');
    // Redo 2: at d1 → the text.
    expect(redoStep({ anchor: 'd1' }, view(['d0', 'd1', 'd2'], 1))).toBe('text');
    // Redo 3: nothing in the text future → Puck forward.
    expect(redoStep(undefined, view(['d0', 'd1', 'd2'], 1))).toBe('doc');
  });

  it('undoes text when Puck has no past (a fresh canvas after a page switch)', () => {
    expect(undoStep({ anchor: 'old-mount' }, view(['n0'], 0))).toBe('text');
    expect(undoStep(undefined, view(['n0'], 0))).toBeNull();
  });

  it('redo: a text edit anchored behind a new block edit is discarded; one from another mount is redone', () => {
    expect(redoStep({ anchor: 'd0' }, view(['d0', 'd3'], 1))).toBe('discard');
    expect(redoStep({ anchor: 'gone' }, view(['n0'], 0))).toBe('text');
    expect(redoStep(undefined, view(['n0'], 0))).toBeNull();
  });

  it('an empty Puck history has a null anchor', () => {
    expect(puckHistoryView({ histories: [], index: -1, hasPast: false, hasFuture: false }).anchor).toBeNull();
  });

  it('anchor source: null until a live canvas registers one', () => {
    expect(currentAnchor()).toBeNull();
    setAnchorSource(() => 'h-7');
    expect(currentAnchor()).toBe('h-7');
    setAnchorSource(null);
    expect(currentAnchor()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/builder-editor-text-history.test.ts`
Expected: FAIL — cannot resolve `@/builder/editor/text/history.ts`.

- [ ] **Step 3: Implement**

```ts
// web/src/builder/editor/text/history.ts

/**
 * Text edits share the canvas's undo/redo (spec §7.4). Puck keeps block history per canvas mount
 * (entries with ids, an index); the store keeps text snapshots. Each text snapshot records the id
 * of the Puck entry that was current when it was made (its anchor), which is enough to replay
 * both in the order the owner made them.
 */

export interface TextHistoryEntry<S> { snap: S; anchor: string | null }

export interface PuckHistoryView {
  anchor: string | null;
  hasPast: boolean;
  hasFuture: boolean;
  anchors: readonly (string | null)[];
  index: number;
}

export const COALESCE_MS = 1000;
export const TEXT_HISTORY_MAX = 100;

export function puckHistoryView(h: { histories: ReadonlyArray<{ id?: string }>; index: number; hasPast: boolean; hasFuture: boolean }): PuckHistoryView {
  const anchors = h.histories.map((e) => e.id ?? null);
  return { anchor: anchors[h.index] ?? null, hasPast: h.hasPast, hasFuture: h.hasFuture, anchors, index: h.index };
}

export function undoStep(top: { anchor: string | null } | undefined, puck: PuckHistoryView): 'text' | 'doc' | null {
  if (top && (top.anchor === puck.anchor || !puck.hasPast)) return 'text';
  if (puck.hasPast) return 'doc';
  return null;
}

export function redoStep(top: { anchor: string | null } | undefined, puck: PuckHistoryView): 'text' | 'doc' | 'discard' | null {
  if (top && top.anchor === puck.anchor) return 'text';
  if (top) {
    const at = puck.anchors.indexOf(top.anchor);
    if (at > puck.index) return puck.hasFuture ? 'doc' : 'text';
    if (at === -1) return puck.hasFuture ? 'doc' : 'text';
    return 'discard';
  }
  return puck.hasFuture ? 'doc' : null;
}

let anchorSource: (() => string | null) | null = null;
/** The live canvas (EditorHeader) registers how to read Puck's current history id. */
export function setAnchorSource(fn: (() => string | null) | null): void {
  anchorSource = fn;
}
export function currentAnchor(): string | null {
  return anchorSource ? anchorSource() : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/builder-editor-text-history.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(builder): unified undo/redo decisions across block and text edits

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/editor/text/history.ts web/test/builder-editor-text-history.test.ts
```

---

### Task 5: Protocol and bridge carry text

**Depends on:** Task 1 (`TextIssue`), Task 3 (`isStoreLocale`), Plan 2 core wave (`PageSet.text`, `SiteText`, `PageText`).

**Files:**
- Modify: `web/src/builder/editor/protocol.ts`
- Modify: `web/src/builder/editor/bridge.ts`
- Test: `web/test/builder-editor-protocol-text.test.ts` (new file; existing protocol/bridge tests stay unedited and must still pass)

**Interfaces:**
- Consumes: `TextIssue` (`@/builder/editor/text/model.ts`); `isStoreLocale` (`@/builder/editor/text/languages.ts`); `SiteText`, `PageText` (`@/text/types.ts`); `PageSet` with `text?: PageText` (`@/builder/types.ts`).
- Produces:
  - `LoadMessage` gains `siteText?: SiteText | null` (undefined = absent).
  - `ChangeMessage` gains `siteText?: SiteText; textIssues?: TextIssue[]`.
  - `interface ChangeText { siteText?: SiteText; textIssues: TextIssue[] }`
  - `changeMessage(loadId, pageSet, issues, text?: ChangeText)` — `pageSet.text` always copied when present; `siteText`/`textIssues` added only when `text` is given (≤ 500 issues).
  - `Bridge.postChange(pageSet, issues, text?: ChangeText)`.

**Rules pinned here:** a malformed `pageSet.text` rejects the whole load (like any malformed page set — dropping it would erase every override on the next autosave); a malformed `siteText` is treated as **absent** (page editing continues; shared text becomes read-only; nothing is ever posted over the stored shared text).

- [ ] **Step 1: Write the failing test**

```ts
// web/test/builder-editor-protocol-text.test.ts
import { describe, expect, it, vi } from 'vitest';
import { changeMessage, MAX_CHANGE_ISSUES, parseInbound } from '@/builder/editor/protocol.ts';
import { createBridge, CHANGE_DEBOUNCE_MS } from '@/builder/editor/bridge.ts';
import type { PageSet } from '@/builder/types.ts';
import type { TextIssue } from '@/builder/editor/text/model.ts';
import { THEME } from './helpers/builder-theme.ts';

const doc = { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [] };
const LOAD = { type: 'sf-builder-load', protocol: 1, loadId: 'load-1', layout: 'storefront', pageSet: null, theme: THEME, readOnly: false };
const SITE = { schemaVersion: 1, language: { locale: 'de', formatLocale: 'de-AT' }, strings: { de: { 'cart.drawer.title': 'Warenkorb', 'cart.summary.items': { one: '{count} Artikel', other: '{count} Artikel' } } } };
const TEXT = { strings: { en: { 'cart.drawer.title': 'Your basket' } } };

const asLoad = (m: ReturnType<typeof parseInbound>) => {
  if (m?.type !== 'sf-builder-load') throw new Error('not a load');
  return m;
};

describe('protocol: text on load', () => {
  it('keeps pageSet.text (overrides are never stripped in transit)', () => {
    const msg = asLoad(parseInbound({ ...LOAD, pageSet: { schemaVersion: 1, shell: doc, pages: {}, text: TEXT } }));
    expect(msg.pageSet!.text).toEqual(TEXT);
  });

  it('a page set without text has no text key', () => {
    const msg = asLoad(parseInbound({ ...LOAD, pageSet: { schemaVersion: 1, shell: doc, pages: {} } }));
    expect('text' in msg.pageSet!).toBe(false);
  });

  it('rejects a load whose pageSet.text is malformed', () => {
    expect(parseInbound({ ...LOAD, pageSet: { schemaVersion: 1, shell: doc, pages: {}, text: { strings: 'nope' } } })).toBeNull();
  });

  it('siteText: present, null, absent', () => {
    expect(asLoad(parseInbound({ ...LOAD, siteText: SITE })).siteText).toEqual(SITE);
    expect(asLoad(parseInbound({ ...LOAD, siteText: null })).siteText).toBeNull();
    expect(asLoad(parseInbound(LOAD)).siteText).toBeUndefined();
    expect('siteText' in asLoad(parseInbound(LOAD))).toBe(false);
  });

  it('a malformed siteText is treated as absent, not as a reason to drop the load', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const bad of [{ schemaVersion: 2, language: SITE.language, strings: {} }, { ...SITE, language: { locale: 'en-gb', formatLocale: '' } }, { ...SITE, strings: { en: { k: 5 } } }, 'x']) {
      const msg = asLoad(parseInbound({ ...LOAD, siteText: bad }));
      expect(msg.siteText).toBeUndefined();
    }
    warn.mockRestore();
  });
});

describe('protocol: text on change', () => {
  const set: PageSet = { schemaVersion: 1, shell: doc as PageSet['shell'], pages: {}, text: TEXT };

  it('copies pageSet.text even without a text argument (older callers)', () => {
    expect(changeMessage('l', set, []).pageSet.text).toEqual(TEXT);
    expect('siteText' in changeMessage('l', set, [])).toBe(false);
    expect('textIssues' in changeMessage('l', set, [])).toBe(false);
  });

  it('carries siteText and textIssues when given, capped at 500 issues', () => {
    const issue: TextIssue = { scope: 'shared', key: 'cart.drawer.title', rule: 'too-long', message: 'Keep this line to 40 characters.' };
    const msg = changeMessage('l', set, [], { siteText: SITE as never, textIssues: Array.from({ length: 600 }, () => issue) });
    expect(msg.siteText).toEqual(SITE);
    expect(msg.textIssues).toHaveLength(MAX_CHANGE_ISSUES);
    const noShared = changeMessage('l', set, [], { textIssues: [] });
    expect('siteText' in noShared).toBe(false);
    expect(noShared.textIssues).toEqual([]);
  });

  it('the bridge posts text with the debounced change', () => {
    vi.useFakeTimers();
    const parent = { postMessage: vi.fn() };
    const listeners: Array<(e: MessageEvent) => void> = [];
    const win = { parent, addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.push(fn), removeEventListener() {}, document: undefined } as unknown as Window;
    const bridge = createBridge(win, { onLoad() {}, onTheme() {}, onSelectPage() {} });
    listeners.forEach((fn) => fn({ data: LOAD, source: parent, origin: 'https://admin.shop.example' } as unknown as MessageEvent));
    bridge.postChange(set, [], { siteText: SITE as never, textIssues: [] });
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    const change = parent.postMessage.mock.calls.map(([m]) => m).find((m) => m.type === 'sf-builder-change');
    expect(change).toMatchObject({ loadId: 'load-1', siteText: SITE, textIssues: [], pageSet: { text: TEXT } });
    bridge.dispose();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/builder-editor-protocol-text.test.ts`
Expected: FAIL — `msg.pageSet!.text` is `undefined` (stripped by the strict schema), and `changeMessage` has no `text` argument.

- [ ] **Step 3: Implement — `protocol.ts`**

Add imports:

```ts
import type { PageText, SiteText } from '@/text/types.ts';
import type { TextIssue } from '@/builder/editor/text/model.ts';
import { isStoreLocale } from '@/builder/editor/text/languages.ts';
```

After `docSchema`, add the text shapes and give `pageSetSchema` its optional `text`:

```ts
// Structural only, like the docs: registry rules (unknown keys, placeholders, caps) are the
// editor's issues, not reasons to refuse a load. Locales must be real tags — Intl would throw.
const localeSchema = z.string().refine(isStoreLocale);
const textValueSchema = z.union([z.string(), z.record(z.string(), z.string())]);
const stringsSchema = z.record(localeSchema, z.record(z.string(), textValueSchema));
const pageTextSchema = z.object({ strings: stringsSchema });
const siteTextSchema = z.object({
  schemaVersion: z.literal(1),
  language: z.object({ locale: localeSchema, formatLocale: z.union([z.literal(''), localeSchema]) }),
  strings: stringsSchema,
});
const pageSetSchema = z.object({
  schemaVersion: z.literal(1),
  shell: docSchema,
  pages: z.record(z.string(), docSchema),
  // Spec §7.1: dropping this would erase every layout override on the next autosave.
  text: pageTextSchema.optional(),
});
```

In `loadSchema` add `siteText: z.unknown().optional(),`. In `LoadMessage` add:

```ts
  /**
   * Spec §7.1. undefined (absent) = the admin can't save shared text: layout overrides only, shared
   * read-only. null = none stored yet. A malformed doc is treated as absent, never as "none".
   */
  siteText?: SiteText | null;
```

Change `ChangeMessage` and add `ChangeText`:

```ts
export interface ChangeText { siteText?: SiteText; textIssues: TextIssue[] }
export type ChangeMessage = {
  type: 'sf-builder-change'; loadId: string; pageSet: PageSet; issues: Issue[];
  siteText?: SiteText; textIssues?: TextIssue[];
};
```

In `toPageSet(raw)` return:

```ts
  return { schemaVersion: 1, shell: raw.shell as unknown as PuckDoc, pages, ...(raw.text ? { text: raw.text as PageText } : {}) };
```

Add the siteText reader and use it in `parseInbound`'s load branch:

```ts
function siteTextOf(raw: unknown): SiteText | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const parsed = siteTextSchema.safeParse(raw);
  if (parsed.success) return parsed.data as SiteText;
  if (import.meta.env.DEV) console.warn('[builder] ignored a malformed siteText; shared text is read-only for this load', parsed.error.issues[0]);
  return undefined;
}
```

```ts
    case 'sf-builder-load': {
      const { siteText: rawSiteText, ...rest } = msg;
      const siteText = siteTextOf(rawSiteText);
      return {
        ...rest,
        protocol: BUILDER_PROTOCOL,
        theme: toTheme(msg.theme),
        pageSet: msg.pageSet ? toPageSet(msg.pageSet) : null,
        ...(siteText === undefined ? {} : { siteText }),
      };
    }
```

(The `console.warn` must run in tests too, where `import.meta.env.DEV` is true; the test spies on it.)

Replace `changeMessage`:

```ts
export function changeMessage(loadId: string, pageSet: PageSet, issues: Issue[], text?: ChangeText): ChangeMessage {
  const pages: PageSet['pages'] = {};
  for (const [key, doc] of Object.entries(pageSet.pages) as Array<[keyof PageSet['pages'], PuckDoc | undefined]>) {
    if (doc) pages[key] = outboundDoc(doc);
  }
  const out: PageSet = { schemaVersion: 1, shell: outboundDoc(pageSet.shell), pages };
  if (pageSet.text) out.text = plain(pageSet.text) as PageText;
  return {
    type: 'sf-builder-change',
    loadId,
    pageSet: out,
    // drop:* guard issues are informational — the doc still renders — and would block Publish.
    issues: issues.filter((i) => !i.rule.startsWith('drop:')).slice(0, MAX_CHANGE_ISSUES),
    ...(text?.siteText ? { siteText: plain(text.siteText) as SiteText } : {}),
    ...(text ? { textIssues: text.textIssues.slice(0, MAX_CHANGE_ISSUES) } : {}),
  };
}
```

- [ ] **Step 4: Implement — `bridge.ts`**

Import `type ChangeText` from protocol; change the interface line to
`postChange(pageSet: PageSet, issues: Issue[], text?: ChangeText): void;` and the implementation:

```ts
    postChange(pageSet, issues, text) {
      if (!current || current.readOnly || disposed) return;
      // Stamped now, so the message always carries the load it was produced from.
      pending = changeMessage(current.loadId, pageSet, issues, text);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flushChange, CHANGE_DEBOUNCE_MS);
    },
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run test/builder-editor-protocol-text.test.ts test/builder-editor-protocol.test.ts test/builder-editor-bridge.test.ts`
Expected: PASS (the two existing files unedited).

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(builder): protocol carries siteText, pageSet.text and textIssues (additive, protocol 1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/editor/protocol.ts web/src/builder/editor/bridge.ts web/test/builder-editor-protocol-text.test.ts
```

---

### Task 6: Text issues and cell resolution (pure)

**Depends on:** Task 1, Task 2, Plan 2 core wave (`checkValue`).

**Files:**
- Create: `web/src/builder/editor/text/issues.ts`
- Test: `web/test/builder-editor-text-issues.test.ts`

**Interfaces:**
- Consumes: `checkValue(key: string, value: unknown): TextCheck` (`{ ok: true } | { ok: false; rule: TextRule; message: string }`) and `type TextRule` from `@/text/resolve.ts` (Plan 2's shape — pre-flight ruling); `rowFor`, `TextRowDef` (Task 2); `TextIssue`, `TextScope` (Task 1).
- Produces:
  - `NON_BLOCKING: ReadonlySet<string>` (`unknown-key`)
  - `ruleFor(key: string, value: unknown): string | null` — `checkValue`, plus `'empty'` for a plural without a usable `other` (the one shape the editor can hold that the backend refuses and `checkValue` may not flag)
  - `textIssueMessage(rule: string, key: string, value: unknown): string`
  - `textIssues(input: { shared: LocaleStrings | null; layout: LocaleStrings }): TextIssue[]` (shared first; `null` shared = not editable, not checked)
  - `interface ResolvedCell { value: TextValue; from: 'layout' | 'shared' | 'default' }`, `resolveCell(key: string, layers: { layout?: TextValue; shared?: TextValue }): ResolvedCell`
  - `interface UnusedEntry { scope: TextScope; key: string; rule: 'unknown-key' | 'fixed'; value: TextValue }`, `unusedEntries(input: { shared: LocaleStrings | null; layout: LocaleStrings }): UnusedEntry[]`

- [ ] **Step 1: Write the failing test**

```ts
// web/test/builder-editor-text-issues.test.ts
import { describe, expect, it } from 'vitest';
import { resolveCell, ruleFor, textIssueMessage, textIssues, unusedEntries } from '@/builder/editor/text/issues.ts';
import { rowFor } from '@/builder/editor/text/catalog.ts';
import { defaultOf, fixedKey, placeholderKey, plainKey, pluralKey } from './helpers/text-keys.ts';

describe('text issues', () => {
  const plain = plainKey();
  const { key: withPh, name } = placeholderKey();
  const plural = pluralKey();

  it('valid values raise nothing', () => {
    expect(ruleFor(plain, 'Northbound wording')).toBeNull();
    expect(ruleFor(withPh, `Only {${name}}`)).toBeNull();
    expect(ruleFor(withPh, 'Dropped the placeholder')).toBeNull();
    expect(ruleFor(plural, { one: '{count} thing', other: '{count} things' })).toBeNull();
  });

  it('flags every rule the editor can meet', () => {
    expect(ruleFor(plain, 'Hi {nope}')).toBe('unknown-placeholder');
    expect(ruleFor(plain, 'Hi {')).toBe('bad-brace');
    expect(ruleFor(plain, 'x'.repeat(rowFor(plain)!.max + 1))).toBe('too-long');
    expect(ruleFor(plain, { one: 'a', other: 'b' })).toBe('type-mismatch');
    expect(ruleFor(plural, 'just a string')).toBe('type-mismatch');
    expect(ruleFor(plural, { one: '{count} thing' })).toBe('empty');
    expect(ruleFor('zz.never.registered', 'x')).toBe('unknown-key');
    expect(ruleFor(fixedKey(), 'x')).toBe('fixed');
  });

  it('messages name the placeholders an owner may use', () => {
    expect(textIssueMessage('unknown-placeholder', withPh, 'Hi {nope}')).toContain('{nope}');
    expect(textIssueMessage('unknown-placeholder', withPh, 'Hi {nope}')).toContain(`{${name}}`);
    expect(textIssueMessage('unknown-placeholder', plain, 'Hi {nope}')).toContain('takes no placeholders');
    expect(textIssueMessage('too-long', plain, '')).toBe(`Keep this line to ${rowFor(plain)!.max} characters.`);
    expect(textIssueMessage('empty', plural, { one: 'a' })).toContain('“Other”');
  });

  it('textIssues: shared first, unknown keys never block, null shared is skipped', () => {
    const issues = textIssues({ shared: { [plain]: 'Hi {', 'zz.never.registered': 'x' }, layout: { [plain]: 'Hi {nope}' } });
    expect(issues.map((i) => [i.scope, i.key, i.rule])).toEqual([
      ['shared', plain, 'bad-brace'],
      ['layout', plain, 'unknown-placeholder'],
    ]);
    expect(issues.every((i) => i.message.length > 0)).toBe(true);
    expect(textIssues({ shared: null, layout: {} })).toEqual([]);
  });

  it('resolveCell: first valid of layout → shared → default, per key', () => {
    expect(resolveCell(plain, {})).toEqual({ value: defaultOf(plain), from: 'default' });
    expect(resolveCell(plain, { shared: 'Shared' })).toEqual({ value: 'Shared', from: 'shared' });
    expect(resolveCell(plain, { shared: 'Shared', layout: 'Mine' })).toEqual({ value: 'Mine', from: 'layout' });
    // A bad override falls back to the shared value, not to the default.
    expect(resolveCell(plain, { shared: 'Shared', layout: 'Bad {nope}' })).toEqual({ value: 'Shared', from: 'shared' });
  });

  it('unusedEntries lists unknown and fixed stored keys with their scope', () => {
    const fixed = fixedKey();
    expect(unusedEntries({ shared: { 'zz.never.registered': 'x', [plain]: 'ok' }, layout: { [fixed]: 'y' } })).toEqual([
      { scope: 'shared', key: 'zz.never.registered', rule: 'unknown-key', value: 'x' },
      { scope: 'layout', key: fixed, rule: 'fixed', value: 'y' },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/builder-editor-text-issues.test.ts`
Expected: FAIL — cannot resolve `@/builder/editor/text/issues.ts`.

- [ ] **Step 3: Implement**

```ts
// web/src/builder/editor/text/issues.ts
import { checkValue, type TextRule } from '@/text/resolve.ts';
import type { LocaleStrings, TextValue } from '@/text/types.ts';
import { rowFor } from '@/builder/editor/text/catalog.ts';
import type { TextIssue, TextScope } from '@/builder/editor/text/model.ts';

/**
 * Text problems as the editor shows and posts them (spec §6.3, §7.1, §7.2). The rules are the
 * shopper resolver's own (`checkValue`), so a value the editor accepts is one shoppers will see.
 */

export const NON_BLOCKING: ReadonlySet<string> = new Set(['unknown-key']);

const NAME_RE = /\{([A-Za-z][A-Za-z0-9]{0,31})\}/g;
const isForms = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The rule id of Plan 2's `checkValue` result, or null when the value is valid. */
function checkedRule(key: string, value: unknown): TextRule | null {
  const c = checkValue(key, value);
  return c.ok ? null : c.rule;
}

export function ruleFor(key: string, value: unknown): string | null {
  // The editor keeps a plural whose `other` is blank while the owner types; the backend refuses it
  // (Plan 2's checkValue would call it `type-mismatch`; the editor reports `empty`).
  if (isForms(value) && rowFor(key)?.plural && (typeof value.other !== 'string' || value.other === '')) return 'empty';
  return checkedRule(key, value);
}

const list = (names: readonly string[]) => names.map((n) => `{${n}}`).join(', ');

export function textIssueMessage(rule: string, key: string, value: unknown): string {
  const row = rowFor(key);
  switch (rule) {
    case 'unknown-placeholder': {
      const used = [...new Set((isForms(value) ? Object.values(value) : [value]).flatMap((v) => (typeof v === 'string' ? [...v.matchAll(NAME_RE)].map((m) => m[1]!) : [])))];
      const unknown = used.filter((n) => !row?.placeholders.includes(n));
      const lead = `${list(unknown)} isn’t available in this line.`;
      return row && row.placeholders.length > 0 ? `${lead} You can use ${list(row.placeholders)}.` : `${lead} This line takes no placeholders.`;
    }
    case 'bad-brace':
      return row && row.placeholders.length > 0
        ? `Curly braces only go around a placeholder, like {${row.placeholders[0]}}. Remove the stray brace.`
        : 'Remove the curly brace — this line takes no placeholders.';
    case 'too-long':
      return `Keep this line to ${row?.max ?? 200} characters.`;
    case 'type-mismatch':
      return row?.plural
        ? 'This line needs one wording per count. Reset it and fill in the forms again.'
        : 'This line takes a single wording. Reset it and type it again.';
    case 'empty':
      return isForms(value)
        ? 'Fill in the “Other” form — it’s used for every count without a form of its own.'
        : 'Type some wording, or reset the line.';
    case 'fixed':
      return 'This line can’t be changed here. Delete the saved wording.';
    case 'unknown-key':
      return 'This line is no longer used by the shop.';
    default:
      return 'This wording can’t be used. Reset it and try again.';
  }
}

export function textIssues(input: { shared: LocaleStrings | null; layout: LocaleStrings }): TextIssue[] {
  const out: TextIssue[] = [];
  const scan = (scope: TextScope, strings: LocaleStrings) => {
    for (const [key, value] of Object.entries(strings)) {
      const rule = ruleFor(key, value);
      if (rule && !NON_BLOCKING.has(rule)) out.push({ scope, key, rule, message: textIssueMessage(rule, key, value) });
    }
  };
  if (input.shared) scan('shared', input.shared);
  scan('layout', input.layout);
  return out;
}

export interface ResolvedCell { value: TextValue; from: 'layout' | 'shared' | 'default' }

/** One key as the canvas shows it: the first valid layer (spec §6.3). */
export function resolveCell(key: string, layers: { layout?: TextValue; shared?: TextValue }): ResolvedCell {
  if (layers.layout !== undefined && ruleFor(key, layers.layout) === null) return { value: layers.layout, from: 'layout' };
  if (layers.shared !== undefined && ruleFor(key, layers.shared) === null) return { value: layers.shared, from: 'shared' };
  return { value: rowFor(key)?.def ?? '', from: 'default' };
}

export interface UnusedEntry { scope: TextScope; key: string; rule: 'unknown-key' | 'fixed'; value: TextValue }

/** Stored wording this release can't show (spec §7.2 "Unused" group): delete-only. */
export function unusedEntries(input: { shared: LocaleStrings | null; layout: LocaleStrings }): UnusedEntry[] {
  const out: UnusedEntry[] = [];
  const scan = (scope: TextScope, strings: LocaleStrings) => {
    for (const [key, value] of Object.entries(strings)) {
      const rule = checkedRule(key, value);
      if (rule === 'unknown-key' || rule === 'fixed') out.push({ scope, key, rule, value });
    }
  };
  if (input.shared) scan('shared', input.shared);
  scan('layout', input.layout);
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/builder-editor-text-issues.test.ts`
Expected: PASS. If `checkValue` returns a rule for `'zz.never.registered'` other than `'unknown-key'` or checks `fixed` before `unknown-key` differently, the contract with Plan 2 is broken — report NEEDS_CONTEXT, do not adapt the test.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(builder): text issues, per-key resolution and the unused list for the editor

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/editor/text/issues.ts web/test/builder-editor-text-issues.test.ts
```

---

### Task 7: Store, page set and session hold and post text

**Depends on:** Tasks 1, 3, 4, 5, 6.

**Files:**
- Modify: `web/src/builder/editor/store.ts`
- Modify: `web/src/builder/editor/page-set.ts` (`toPageSet` only)
- Modify: `web/src/builder/editor/session.ts`
- Test: `web/test/builder-editor-store-text.test.ts`, `web/test/builder-editor-session-text.test.ts` (new; existing store/session tests stay unedited)

**Interfaces:**
- Consumes: Tasks 1, 3, 4, 5, 6 exports; `LoadMessage.siteText`.
- Produces (store):
  - `EditorState` gains: `siteText: SiteText | null`, `sharedEditable: boolean`, `pageText: PageText`, `published: PublishedShared | null`, `textPast: TextHistoryEntry<TextSnap>[]`, `textFuture: TextHistoryEntry<TextSnap>[]`
  - `interface TextSnap { siteText: SiteText | null; pageText: PageText }`, `interface PublishedShared { language: TextLanguage; shared: LocaleStrings }`
  - `load(input: { layout; pageSet; readOnly; siteText?: SiteText | null })`
  - `setText(scope: TextScope, key: string, value: TextValue | null, anchor: string | null): boolean`
  - `setLanguage(patch: Partial<TextLanguage>, anchor: string | null): boolean`
  - `undoText(): boolean`, `redoText(): boolean`, `discardTextFuture(): void`, `setPublishedText(p: PublishedShared): void`
  - `TEXT_INITIAL` (for test resets), `textLanguage(s): TextLanguage`, `isTextReady(s): boolean`, `textIssuesOf(s): TextIssue[]` (memoised)
- Produces (page-set): `toPageSet(docs: DocMap, layout: LayoutKind, text?: PageText): PageSet` — writes `text` when given and non-empty.
- Produces (session): every change is `postChange(pageSet with postable text, issues, { siteText?: postable full doc iff sharedEditable, textIssues })`.

- [ ] **Step 1: Write the failing store test**

```ts
// web/test/builder-editor-store-text.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREVIEW_AS, TEXT_INITIAL, isTextReady, textIssuesOf, textLanguage, useEditorStore } from '@/builder/editor/store.ts';
import { plainKey, pluralKey } from './helpers/text-keys.ts';

const reset = () => useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null, ...TEXT_INITIAL });
const S = () => useEditorStore.getState();
const SITE = { schemaVersion: 1 as const, language: { locale: 'en', formatLocale: '' }, strings: { en: { 'zz.kept.unknown': 'kept' } } };

describe('editor store: text', () => {
  beforeEach(() => { reset(); vi.useRealTimers(); });
  const key = plainKey();

  it('load: siteText absent → not editable; null → an empty doc; a doc → itself; pageSet.text → pageText', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false });
    expect(S().sharedEditable).toBe(false);
    expect(S().siteText).toBeNull();
    expect(isTextReady(S())).toBe(false);
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    expect(S().sharedEditable).toBe(true);
    expect(S().siteText).toEqual({ schemaVersion: 1, language: { locale: 'en', formatLocale: '' }, strings: {} });
    expect(isTextReady(S())).toBe(true);
    const shell = { root: { props: { title: '', description: '', chrome: 'shell' as const } }, content: [] };
    S().load({ layout: 'menu', pageSet: { schemaVersion: 1, shell, pages: {}, text: { strings: { en: { [key]: 'Menu words' } } } }, readOnly: false, siteText: SITE });
    expect(S().siteText).toEqual(SITE);
    expect(S().pageText).toEqual({ strings: { en: { [key]: 'Menu words' } } });
    expect(S().textPast).toEqual([]);
  });

  it('setText writes the chosen scope; clearing resets; shared refused when not editable', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    expect(S().setText('shared', key, 'Shared words', null)).toBe(true);
    expect(S().siteText!.strings.en![key]).toBe('Shared words');
    expect(S().setText('layout', key, 'Mine', null)).toBe(true);
    expect(S().pageText.strings.en![key]).toBe('Mine');
    S().setText('layout', key, '', null);
    expect(S().pageText.strings).toEqual({});
    S().load({ layout: 'storefront', pageSet: null, readOnly: false });
    expect(S().setText('shared', key, 'x', null)).toBe(false);
    expect(S().setText('layout', key, 'x', null)).toBe(true);
    expect(S().setText('layout', 'zz.not.a.key', 'x', null)).toBe(false);
    expect(S().setText('layout', 'zz.not.a.key', null, null)).toBe(true);   // deleting an unused key is fine
  });

  it('read-only loads refuse every text edit', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: true, siteText: null });
    expect(S().setText('shared', key, 'x', null)).toBe(false);
    expect(S().setLanguage({ locale: 'de' }, null)).toBe(false);
  });

  it('typing into one key coalesces into one undo step; another key or a pause starts a new one', () => {
    vi.useFakeTimers();
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    S().setText('shared', key, 'N', 'a');
    S().setText('shared', key, 'No', 'a');
    S().setText('shared', key, 'Nor', 'a');
    expect(S().textPast).toHaveLength(1);
    vi.advanceTimersByTime(1500);
    S().setText('shared', key, 'Nort', 'a');
    expect(S().textPast).toHaveLength(2);
    S().setText('layout', key, 'L', 'a');
    expect(S().textPast).toHaveLength(3);
    expect(S().undoText()).toBe(true);
    expect(S().pageText.strings).toEqual({});
    expect(S().undoText()).toBe(true);
    expect(S().siteText!.strings.en![key]).toBe('Nor');
    expect(S().redoText()).toBe(true);
    expect(S().siteText!.strings.en![key]).toBe('Nort');
    expect(S().textFuture).toHaveLength(1);
    S().setText('shared', key, 'New branch', 'a');
    expect(S().textFuture).toEqual([]);
  });

  it('setLanguage: validates tags, resets the format on a language change, keeps other locales', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: { ...SITE, language: { locale: 'en', formatLocale: 'en-GB' } } });
    S().setText('shared', key, 'English words', null);
    expect(S().setLanguage({ locale: 'en-gb' }, null)).toBe(false);
    expect(S().setLanguage({ locale: 'pl' }, null)).toBe(true);
    expect(textLanguage(S())).toEqual({ locale: 'pl', formatLocale: '' });
    expect(S().siteText!.strings.en![key]).toBe('English words');
    S().setText('shared', key, 'Polskie słowa', null);
    expect(S().siteText!.strings.pl![key]).toBe('Polskie słowa');
    expect(S().setLanguage({ formatLocale: 'pl-PL' }, null)).toBe(true);
    expect(textLanguage(S()).formatLocale).toBe('pl-PL');
    S().undoText();
    expect(textLanguage(S()).formatLocale).toBe('');
  });

  it('without siteText the language comes from the published read', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false });
    expect(textLanguage(S())).toEqual({ locale: 'en', formatLocale: '' });
    S().setPublishedText({ language: { locale: 'de', formatLocale: '' }, shared: { [key]: 'Geteilt' } });
    expect(isTextReady(S())).toBe(true);
    expect(textLanguage(S()).locale).toBe('de');
    S().setText('layout', key, 'Nur hier', null);
    expect(S().pageText.strings.de![key]).toBe('Nur hier');
  });

  it('textIssuesOf covers both scopes and is memoised', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    S().setText('shared', key, 'Hi {', null);
    S().setText('layout', pluralKey(), { one: '{count} x' }, null);
    const a = textIssuesOf(S());
    expect(a.map((i) => [i.scope, i.rule])).toEqual([['shared', 'bad-brace'], ['layout', 'empty']]);
    expect(textIssuesOf(S())).toBe(a);
  });
});
```

- [ ] **Step 2: Write the failing session test**

```ts
// web/test/builder-editor-session-text.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

vi.mock('@/app/builder-gate.ts', async (orig) => ({ ...(await orig<typeof import('@/app/builder-gate.ts')>()), isBuilderMode: () => true }));

import { startBuilderSession } from '@/builder/editor/session.ts';
import { DEFAULT_PREVIEW_AS, TEXT_INITIAL, useEditorStore } from '@/builder/editor/store.ts';
import { builderOverrides } from '@/app/builder-gate.ts';
import { CHANGE_DEBOUNCE_MS } from '@/builder/editor/bridge.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { THEME } from './helpers/builder-theme.ts';
import { plainKey } from './helpers/text-keys.ts';

const ADMIN = 'https://admin.shop.example';
function fakeWindow() {
  const listeners: Array<(e: MessageEvent) => void> = [];
  const parent = { postMessage: vi.fn() };
  const win = { parent, addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.push(fn), removeEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.splice(listeners.indexOf(fn), 1) } as unknown as Window;
  const send = (data: unknown) => [...listeners].forEach((fn) => fn({ data, source: parent, origin: ADMIN } as unknown as MessageEvent));
  const changes = () => parent.postMessage.mock.calls.filter(([m]) => m.type === 'sf-builder-change').map(([m]) => m);
  return { win, send, changes };
}
let seq = 0;
const load = (extra: Record<string, unknown> = {}) => ({ type: 'sf-builder-load', protocol: 1, loadId: `t-${++seq}`, layout: 'storefront', pageSet: null, theme: THEME, readOnly: false, ...extra });
const shell = () => defaultDoc('shell', 'storefront')!;

describe('builder session: text', () => {
  const key = plainKey();
  beforeEach(() => {
    vi.useFakeTimers();
    useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null, ...TEXT_INITIAL });
    builderOverrides.setState({ theme: null, layout: null });
  });
  afterEach(() => vi.useRealTimers());

  it('siteText null: the baseline carries a full empty doc and no text issues', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load({ siteText: null }));
    expect(changes()).toHaveLength(1);
    expect(changes()[0].siteText).toEqual({ schemaVersion: 1, language: { locale: 'en', formatLocale: '' }, strings: {} });
    expect(changes()[0].textIssues).toEqual([]);
    expect('text' in changes()[0].pageSet).toBe(false);
    stop();
  });

  it('siteText absent: no change ever carries siteText, layout overrides still go out', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load());
    expect('siteText' in changes()[0]).toBe(false);
    useEditorStore.getState().setPublishedText({ language: { locale: 'en', formatLocale: '' }, shared: {} });
    useEditorStore.getState().setText('layout', key, 'Only here', null);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    const last = changes().at(-1);
    expect('siteText' in last).toBe(false);
    expect(last.pageSet.text).toEqual({ strings: { en: { [key]: 'Only here' } } });
    stop();
  });

  it('overrides loaded with the page set survive into the baseline unchanged', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    const text = { strings: { en: { [key]: 'Kept' }, de: { [key]: 'Behalten' } } };
    send(load({ pageSet: { schemaVersion: 1, shell: shell(), pages: {}, text }, siteText: null }));
    expect(changes()[0].pageSet.text).toEqual(text);
    stop();
  });

  it('a half-typed placeholder is an issue but is not posted (the backend would refuse the autosave)', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load({ siteText: null }));
    useEditorStore.getState().setText('shared', key, 'Only {avail', null);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    const last = changes().at(-1);
    expect(last.siteText.strings).toEqual({});
    expect(last.textIssues).toEqual([expect.objectContaining({ scope: 'shared', key, rule: 'bad-brace' })]);
    useEditorStore.getState().setText('shared', key, 'Only {avail}', null);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    // Unknown placeholder: structurally fine, so posted — and still blocks Publish.
    expect(changes().at(-1).siteText.strings.en[key]).toBe('Only {avail}');
    expect(changes().at(-1).textIssues[0].rule).toBe('unknown-placeholder');
    stop();
  });

  it('read-only loads post nothing, text included', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load({ readOnly: true, siteText: null }));
    useEditorStore.getState().setText('shared', key, 'x', null);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS * 2);
    expect(changes()).toEqual([]);
    stop();
  });

  it('a text-only edit is posted; an identical re-edit is not', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load({ siteText: null }));
    useEditorStore.getState().setText('shared', key, 'Once', null);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    const n = changes().length;
    useEditorStore.getState().setText('shared', key, 'Once', null);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    expect(changes()).toHaveLength(n);
    stop();
  });
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npx vitest run test/builder-editor-store-text.test.ts test/builder-editor-session-text.test.ts`
Expected: FAIL — `TEXT_INITIAL` is not exported; `setText` is not a function.

- [ ] **Step 4: Implement — `page-set.ts`**

```ts
import type { PageText } from '@/text/types.ts';
```

```ts
/** `text` = this layout's overrides as they should be sent; omitted when undefined or empty (spec §7.4). */
export function toPageSet(docs: DocMap, layout: LayoutKind, text?: PageText): PageSet {
  const pages: PageSet['pages'] = {};
  for (const [key, doc] of Object.entries(docs)) {
    if (key !== 'shell' && doc) pages[key as keyof PageSet['pages']] = doc;
  }
  const set: PageSet = { schemaVersion: 1, shell: docs.shell ?? defaultFor('shell', layout)!, pages };
  if (text && Object.values(text.strings).some((m) => Object.keys(m).length > 0)) set.text = text;
  return set;
}
```

- [ ] **Step 5: Implement — `store.ts`**

Add imports:

```ts
import type { LocaleStrings, PageText, SiteText, TextLanguage, TextValue } from '@/text/types.ts';
import { DEFAULT_LANGUAGE, emptyPageText, emptySiteText, withValue, type TextIssue, type TextScope } from '@/builder/editor/text/model.ts';
import { rowFor } from '@/builder/editor/text/catalog.ts';
import { isStoreLocale } from '@/builder/editor/text/languages.ts';
import { textIssues } from '@/builder/editor/text/issues.ts';
import { COALESCE_MS, TEXT_HISTORY_MAX, type TextHistoryEntry } from '@/builder/editor/text/history.ts';
```

Add types and fields to `EditorState` (document each, as the file does):

```ts
export interface TextSnap { siteText: SiteText | null; pageText: PageText }
export interface PublishedShared { language: TextLanguage; shared: LocaleStrings }

// in EditorState:
  /** The shared Site text draft (spec §7.4); null when the load carried no siteText (not editable). */
  siteText: SiteText | null;
  /** The load carried `siteText` (object or null): shared text can be edited and is posted. */
  sharedEditable: boolean;
  /** This layout's overrides (PageSet.text). */
  pageText: PageText;
  /** Without siteText: the published shared layer and language, read-only (hooks.ts fills it). */
  published: PublishedShared | null;
  textPast: TextHistoryEntry<TextSnap>[];
  textFuture: TextHistoryEntry<TextSnap>[];
  load(input: { layout: LayoutKind; pageSet: PageSet | null; readOnly: boolean; siteText?: SiteText | null }): void;
  /** One key at one scope in the active locale; null or '' resets. `anchor` = Puck's current history id. */
  setText(scope: TextScope, key: string, value: TextValue | null, anchor: string | null): boolean;
  setLanguage(patch: Partial<TextLanguage>, anchor: string | null): boolean;
  undoText(): boolean;
  redoText(): boolean;
  discardTextFuture(): void;
  setPublishedText(p: PublishedShared): void;
```

Module-level helpers (exported):

```ts
export const TEXT_INITIAL = {
  siteText: null, sharedEditable: false, pageText: emptyPageText(), published: null, textPast: [], textFuture: [],
} satisfies Partial<EditorState>;

type TextState = Pick<EditorState, 'sharedEditable' | 'siteText' | 'published'>;

export function textLanguage(s: TextState): TextLanguage {
  if (s.sharedEditable && s.siteText) return s.siteText.language;
  return s.published?.language ?? DEFAULT_LANGUAGE;
}

/** Text can be edited once we know the language: from siteText, or from the published read. */
export const isTextReady = (s: TextState): boolean => s.sharedEditable || s.published !== null;

let issueMemo: { inputs: unknown[]; issues: TextIssue[] } | null = null;
/** Every blocking text issue (spec §7.1) — the header and the posted change use this one list. */
export function textIssuesOf(s: Pick<EditorState, 'sharedEditable' | 'siteText' | 'published' | 'pageText'>): TextIssue[] {
  const { locale } = textLanguage(s);
  const inputs = [s.sharedEditable, s.siteText, s.pageText, locale];
  if (issueMemo && inputs.every((v, i) => v === issueMemo!.inputs[i])) return issueMemo.issues;
  const issues = textIssues({
    shared: s.sharedEditable && s.siteText ? s.siteText.strings[locale] ?? {} : null,
    layout: s.pageText.strings[locale] ?? {},
  });
  issueMemo = { inputs, issues };
  return issues;
}

/** Consecutive keystrokes into one field are one undo step. */
let lastTextEdit: { target: string; at: number; anchor: string | null } | null = null;
```

In the `create` initialiser spread `...TEXT_INITIAL,`. Replace `load`:

```ts
  load({ layout, pageSet, readOnly, siteText }) {
    const docs = docsFromPageSet(pageSet, layout);
    const current = get().docKey;
    const keep = !(isCustomKey(current) && !docs[current]) && isShownIn(current, layout);
    lastTextEdit = null;
    const editable = siteText !== undefined;
    set((s) => ({
      status: 'ready', layout, readOnly, docs, docKey: keep ? current : 'catalog', epoch: s.epoch + 1,
      siteText: editable ? siteText ?? emptySiteText() : null,
      sharedEditable: editable,
      pageText: pageSet?.text ? { strings: pageSet.text.strings } : emptyPageText(),
      published: null,
      textPast: [],
      textFuture: [],
    }));
  },
```

Add the text actions:

```ts
  setText(scope, key, value, anchor) {
    const s = get();
    if (s.readOnly || s.status !== 'ready') return false;
    if (scope === 'shared' && (!s.sharedEditable || !s.siteText)) return false;
    if (value !== null && value !== '' && !rowFor(key)) return false;
    const { locale } = textLanguage(s);
    let patch: Partial<EditorState>;
    if (scope === 'shared') {
      const strings = withValue(s.siteText!.strings, locale, key, value);
      if (strings === s.siteText!.strings) return true;
      patch = { siteText: { ...s.siteText!, strings } };
    } else {
      const strings = withValue(s.pageText.strings, locale, key, value);
      if (strings === s.pageText.strings) return true;
      patch = { pageText: { strings } };
    }
    const target = `${scope}:${key}`;
    const now = Date.now();
    const coalesce = lastTextEdit !== null && lastTextEdit.target === target && lastTextEdit.anchor === anchor
      && now - lastTextEdit.at < COALESCE_MS && s.textPast.length > 0;
    lastTextEdit = { target, at: now, anchor };
    const past = coalesce ? s.textPast : [...s.textPast, { snap: { siteText: s.siteText, pageText: s.pageText }, anchor }].slice(-TEXT_HISTORY_MAX);
    set({ ...patch, textPast: past, textFuture: [] });
    return true;
  },

  setLanguage(patch, anchor) {
    const s = get();
    if (s.readOnly || s.status !== 'ready' || !s.sharedEditable || !s.siteText) return false;
    const cur = s.siteText.language;
    const locale = patch.locale ?? cur.locale;
    const formatLocale = patch.formatLocale !== undefined ? patch.formatLocale : locale !== cur.locale ? '' : cur.formatLocale;
    if (!isStoreLocale(locale) || (formatLocale !== '' && !isStoreLocale(formatLocale))) return false;
    if (locale === cur.locale && formatLocale === cur.formatLocale) return true;
    lastTextEdit = null;
    set({
      siteText: { ...s.siteText, language: { locale, formatLocale } },
      textPast: [...s.textPast, { snap: { siteText: s.siteText, pageText: s.pageText }, anchor }].slice(-TEXT_HISTORY_MAX),
      textFuture: [],
    });
    return true;
  },

  undoText() {
    const s = get();
    const top = s.textPast.at(-1);
    if (!top || s.readOnly) return false;
    lastTextEdit = null;
    set({
      siteText: top.snap.siteText, pageText: top.snap.pageText,
      textPast: s.textPast.slice(0, -1),
      textFuture: [...s.textFuture, { snap: { siteText: s.siteText, pageText: s.pageText }, anchor: top.anchor }],
    });
    return true;
  },

  redoText() {
    const s = get();
    const top = s.textFuture.at(-1);
    if (!top || s.readOnly) return false;
    lastTextEdit = null;
    set({
      siteText: top.snap.siteText, pageText: top.snap.pageText,
      textFuture: s.textFuture.slice(0, -1),
      textPast: [...s.textPast, { snap: { siteText: s.siteText, pageText: s.pageText }, anchor: top.anchor }],
    });
    return true;
  },

  discardTextFuture() {
    if (get().textFuture.length > 0) set({ textFuture: [] });
  },

  setPublishedText(published) {
    set({ published });
  },
```

- [ ] **Step 6: Implement — `session.ts`**

Imports:

```ts
import { postablePageText, postableSiteText } from '@/builder/editor/text/model.ts';
import { textIssuesOf, useEditorStore, type EditorState } from '@/builder/editor/store.ts';
import type { ChangeText } from '@/builder/editor/protocol.ts';
```

(merge with the existing `useEditorStore` import). Replace `postDocs`:

```ts
/**
 * What the admin receives: the sparse set (editor-only leftovers removed) with this layout's
 * overrides, its issues, and — iff the load carried siteText — the full shared doc. Text values the
 * backend would refuse (a half-typed `{`) stay in the editor as issues and are left out (spec §4.3).
 * Returns the change's signature; nothing is posted when it equals `last`.
 */
function postDocs(bridge: Bridge, s: EditorState, last: string | null): string {
  const emitted = prepareDocs(s.docs);
  const pageSet = toPageSet(emitted, s.layout, postablePageText(s.pageText));
  const issues = collectIssues(emitted, s.layout);
  const text: ChangeText = {
    textIssues: textIssuesOf(s),
    ...(s.sharedEditable && s.siteText ? { siteText: postableSiteText(s.siteText) } : {}),
  };
  const signature = stableStringify({ pageSet, issues, text });
  if (signature !== last) bridge.postChange(pageSet, issues, text);
  return signature;
}
```

In `onLoad`: pass `siteText` through and call the new `postDocs`:

```ts
        useEditorStore.getState().load({
          layout: msg.layout, pageSet: msg.pageSet, readOnly: msg.readOnly,
          ...(msg.siteText === undefined ? {} : { siteText: msg.siteText }),
        });
```

```ts
        lastPosted = postDocs(bridge, useEditorStore.getState(), null);
```

In the store subscription replace the tail:

```ts
    const backToEditing = prev.viewport !== null;
    const textChanged = s.siteText !== prev.siteText || s.pageText !== prev.pageText || s.published !== prev.published;
    if (s.docs === prev.docs && !textChanged && !backToEditing) return;
    lastPosted = postDocs(bridge, s, lastPosted);
```

Update the file's header comment to mention text ("Right after each accepted load exactly one change goes out, built from the loaded docs and text").

- [ ] **Step 7: Run the tests**

Run: `npx vitest run test/builder-editor-store-text.test.ts test/builder-editor-session-text.test.ts`
Expected: PASS.

Run: `npx vitest run test/builder-editor`
Expected: PASS — every existing editor test unedited.

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(builder): editor store holds site text and layout overrides; session posts them

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/editor/store.ts web/src/builder/editor/page-set.ts web/src/builder/editor/session.ts web/test/builder-editor-store-text.test.ts web/test/builder-editor-session-text.test.ts
```

---

### Task 8: Hooks, panel UI state, and the canvas text scope

**Depends on:** Task 7; Plan 2 core wave (`fetchPublished`, `PageSetOverrideProvider` `text` prop, `EditorText`, `useText`).

**Files:**
- Create: `web/src/builder/editor/text/hooks.ts`
- Create: `web/src/builder/editor/text/ui-store.ts`
- Create: `web/src/builder/editor/text/scope.tsx`
- Modify: `web/src/builder/editor/icons.tsx` (add `TextIcon`, `CloseIcon`)
- Modify: `web/src/builder/editor/EditorCanvas.tsx` (wrap Puck and the read-only render in `CanvasTextScope`; mount `usePublishedTextSync`)
- Modify: `web/src/builder/editor/ExactPreview.tsx` (`ExactRuntime` passes `text` and the overrides)
- Test: `web/test/builder-editor-text-hooks.test.tsx`

**Interfaces:**
- Consumes: store (Task 7); `resolveCell` (Task 6); `fetchPublished(layout): Promise<{ pageSet; text: PublishedText | null }>` (`@/api/pages.ts`); `PageSetOverrideProvider({ pageSet, text?, children })` (`@/builder/runtime.tsx`); `EditorText` (`@/text/types.ts`); `useText` (`@/text/runtime.tsx`, test only).
- Produces:
  - hooks.ts: `useTextLanguage(): TextLanguage`, `useEditorText(): EditorText`, `usePublishedTextSync(): void`, `useTextIssues(): TextIssue[]`, `useTextCell(key: string): TextCell`, `applyText(scope, key, value): boolean`, `applyLanguage(patch): boolean`
  - `interface TextCell { shared: TextValue | undefined; layout: TextValue | undefined; sharedEditable: boolean; effective: ResolvedCell; below: ResolvedCell; issues: TextIssue[] }` (`shared` = the editable draft value, or the published value when read-only; `below` = what shows if this layout's override is cleared)
  - ui-store.ts: `type TextFilter = 'all' | 'edited' | 'layout' | 'issues'`; `useTextUi` (zustand) with `open: boolean; filter: TextFilter; query: string; focus: { key: string; seq: number } | null; show(opts?: { key?: string; filter?: TextFilter; query?: string }): void; hide(): void; setFilter(f): void; setQuery(q): void`
  - scope.tsx: `CanvasTextScope({ children })` — `PageSetOverrideProvider` with the prepared draft set (including overrides) and the editor text
  - icons.tsx: `TextIcon`, `CloseIcon`

- [ ] **Step 1: Write the failing test**

```tsx
// web/test/builder-editor-text-hooks.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/api/pages.ts', async (orig) => ({
  ...(await orig<typeof import('@/api/pages.ts')>()),
  fetchPublished: vi.fn(async () => ({ pageSet: null, text: { version: 3, locale: 'de', formatLocale: '', shared: {}, layout: {} } })),
}));

import { DEFAULT_PREVIEW_AS, TEXT_INITIAL, useEditorStore } from '@/builder/editor/store.ts';
import { applyText, useEditorText, usePublishedTextSync, useTextCell, useTextIssues } from '@/builder/editor/text/hooks.ts';
import { useTextUi } from '@/builder/editor/text/ui-store.ts';
import { CanvasTextScope } from '@/builder/editor/text/scope.tsx';
import { setAnchorSource } from '@/builder/editor/text/history.ts';
import { useText } from '@/text/runtime.tsx';
import { defaultOf, plainKey } from './helpers/text-keys.ts';

const S = () => useEditorStore.getState();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

describe('editor text hooks', () => {
  const key = plainKey();
  beforeEach(() => {
    useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null, ...TEXT_INITIAL });
    useTextUi.setState({ open: false, filter: 'all', query: '', focus: null });
  });
  afterEach(() => { cleanup(); setAnchorSource(null); });

  it('useEditorText gives both layers for the active locale; stable until text changes', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    const { result, rerender } = renderHook(() => useEditorText());
    const first = result.current;
    expect(first).toEqual({ locale: 'en', formatLocale: '', shared: {}, layout: {} });
    rerender();
    expect(result.current).toBe(first);
    act(() => { applyText('shared', key, 'Shared'); applyText('layout', key, 'Mine'); });
    expect(result.current.shared[key]).toBe('Shared');
    expect(result.current.layout[key]).toBe('Mine');
  });

  it('applyText stamps the Puck anchor', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    setAnchorSource(() => 'h-3');
    applyText('shared', key, 'x');
    expect(S().textPast.at(-1)!.anchor).toBe('h-3');
  });

  it('useTextCell: effective value, layer, fallback below the override, issues', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    const { result } = renderHook(() => useTextCell(key));
    expect(result.current.effective).toEqual({ value: defaultOf(key), from: 'default' });
    act(() => { applyText('shared', key, 'Shared'); applyText('layout', key, 'Bad {nope}'); });
    expect(result.current.effective).toEqual({ value: 'Shared', from: 'shared' });
    expect(result.current.below).toEqual({ value: 'Shared', from: 'shared' });
    expect(result.current.issues.map((i) => i.scope)).toEqual(['layout']);
    const issues = renderHook(() => useTextIssues()).result.current;
    expect(issues).toHaveLength(1);
  });

  it('without siteText, the published shared layer and language are fetched once and shown read-only', async () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false });
    renderHook(() => usePublishedTextSync(), { wrapper });
    await vi.waitFor(() => expect(S().published).toEqual({ language: { locale: 'de', formatLocale: '' }, shared: {} }));
    expect(renderHook(() => useEditorText()).result.current.locale).toBe('de');
  });

  it('the canvas scope makes useText() read the draft wording on every keystroke', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    function Probe() { return <p data-testid="probe">{useText().t(key as never)}</p>; }
    render(<CanvasTextScope><Probe /></CanvasTextScope>, { wrapper });
    expect(screen.getByTestId('probe')).toHaveTextContent(String(defaultOf(key)));
    act(() => { applyText('shared', key, 'Northbound wording'); });
    expect(screen.getByTestId('probe')).toHaveTextContent('Northbound wording');
    act(() => { applyText('layout', key, 'Only here'); });
    expect(screen.getByTestId('probe')).toHaveTextContent('Only here');
  });

  it('ui store: show with a key bumps focus; hide closes', () => {
    useTextUi.getState().show({ key, filter: 'issues' });
    const a = useTextUi.getState().focus!;
    expect(useTextUi.getState()).toMatchObject({ open: true, filter: 'issues', focus: { key } });
    useTextUi.getState().show({ key });
    expect(useTextUi.getState().focus!.seq).toBeGreaterThan(a.seq);
    useTextUi.getState().hide();
    expect(useTextUi.getState().open).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/builder-editor-text-hooks.test.tsx`
Expected: FAIL — cannot resolve `@/builder/editor/text/hooks.ts`.

- [ ] **Step 3: Implement `ui-store.ts`**

```ts
// web/src/builder/editor/text/ui-store.ts
import { create } from 'zustand';

/** Text panel UI state: never posted, never in undo history. */
export type TextFilter = 'all' | 'edited' | 'layout' | 'issues';

interface TextUiState {
  open: boolean;
  filter: TextFilter;
  query: string;
  /** A row to scroll to and focus; `seq` changes on every request, even for the same key. */
  focus: { key: string; seq: number } | null;
  show(opts?: { key?: string; filter?: TextFilter; query?: string }): void;
  hide(): void;
  setFilter(filter: TextFilter): void;
  setQuery(query: string): void;
}

let seq = 0;
export const useTextUi = create<TextUiState>()((set) => ({
  open: false,
  filter: 'all',
  query: '',
  focus: null,
  show(opts = {}) {
    set((s) => ({
      open: true,
      filter: opts.filter ?? s.filter,
      query: opts.query ?? (opts.key ? '' : s.query),
      focus: opts.key ? { key: opts.key, seq: ++seq } : s.focus,
    }));
  },
  hide() { set({ open: false }); },
  setFilter(filter) { set({ filter }); },
  setQuery(query) { set({ query }); },
}));
```

- [ ] **Step 4: Implement `hooks.ts`**

```ts
// web/src/builder/editor/text/hooks.ts
import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchPublished } from '@/api/pages.ts';
import type { EditorText, LocaleStrings, TextLanguage, TextValue } from '@/text/types.ts';
import { isTextReady, textIssuesOf, textLanguage, useEditorStore } from '@/builder/editor/store.ts';
import { DEFAULT_LANGUAGE, type TextIssue, type TextScope } from '@/builder/editor/text/model.ts';
import { resolveCell, type ResolvedCell } from '@/builder/editor/text/issues.ts';
import { currentAnchor } from '@/builder/editor/text/history.ts';

const EMPTY: LocaleStrings = Object.freeze({}) as LocaleStrings;

export function useTextLanguage(): TextLanguage {
  const sharedEditable = useEditorStore((s) => s.sharedEditable);
  const siteText = useEditorStore((s) => s.siteText);
  const published = useEditorStore((s) => s.published);
  return useMemo(() => textLanguage({ sharedEditable, siteText, published }), [sharedEditable, siteText, published]);
}

/** What the canvas resolves text from (PageSetOverrideProvider `text`, spec §7.2). */
export function useEditorText(): EditorText {
  const language = useTextLanguage();
  const sharedEditable = useEditorStore((s) => s.sharedEditable);
  const siteText = useEditorStore((s) => s.siteText);
  const published = useEditorStore((s) => s.published);
  const pageText = useEditorStore((s) => s.pageText);
  return useMemo(() => ({
    locale: language.locale,
    formatLocale: language.formatLocale,
    shared: (sharedEditable ? siteText?.strings[language.locale] : published?.shared) ?? EMPTY,
    layout: pageText.strings[language.locale] ?? EMPTY,
  }), [language, sharedEditable, siteText, published, pageText]);
}

/**
 * An admin that sends no siteText (spec §7.1 "absent") still shows shared wording, read-only: the
 * public read the shop itself uses (fixture mode lets it through).
 */
export function usePublishedTextSync(): void {
  const layout = useEditorStore((s) => s.layout);
  const enabled = useEditorStore((s) => s.status === 'ready' && !s.sharedEditable);
  const missing = useEditorStore((s) => s.published === null);
  const query = useQuery({
    queryKey: ['sf-builder', 'published-text', layout],
    queryFn: () => fetchPublished(layout),
    enabled,
    staleTime: Infinity,
    retry: false,
  });
  useEffect(() => {
    if (!enabled || !missing || !query.isSuccess) return;
    const t = query.data.text;
    useEditorStore.getState().setPublishedText(
      t ? { language: { locale: t.locale, formatLocale: t.formatLocale }, shared: t.shared } : { language: DEFAULT_LANGUAGE, shared: {} },
    );
  }, [enabled, missing, query.isSuccess, query.data]);
}

export function useTextIssues(): TextIssue[] {
  const sharedEditable = useEditorStore((s) => s.sharedEditable);
  const siteText = useEditorStore((s) => s.siteText);
  const published = useEditorStore((s) => s.published);
  const pageText = useEditorStore((s) => s.pageText);
  return useMemo(() => textIssuesOf({ sharedEditable, siteText, published, pageText }), [sharedEditable, siteText, published, pageText]);
}

export const useTextReady = (): boolean => useEditorStore(isTextReady);

export interface TextCell {
  shared: TextValue | undefined;
  layout: TextValue | undefined;
  sharedEditable: boolean;
  effective: ResolvedCell;
  /** What shows when this layout's override is cleared. */
  below: ResolvedCell;
  issues: TextIssue[];
}

export function useTextCell(key: string): TextCell {
  const text = useEditorText();
  const sharedEditable = useEditorStore((s) => s.sharedEditable);
  const issues = useTextIssues();
  const shared = text.shared[key];
  const layout = text.layout[key];
  return useMemo(() => ({
    shared, layout, sharedEditable,
    effective: resolveCell(key, { layout, shared }),
    below: resolveCell(key, { shared }),
    issues: issues.filter((i) => i.key === key),
  }), [key, shared, layout, sharedEditable, issues]);
}

/** Every text write from the UI goes through here, stamped with Puck's current history entry. */
export function applyText(scope: TextScope, key: string, value: TextValue | null): boolean {
  return useEditorStore.getState().setText(scope, key, value, currentAnchor());
}

export function applyLanguage(patch: Partial<TextLanguage>): boolean {
  return useEditorStore.getState().setLanguage(patch, currentAnchor());
}
```

- [ ] **Step 5: Implement `scope.tsx`**

```tsx
// web/src/builder/editor/text/scope.tsx
import { useMemo, type ReactNode } from 'react';
import { PageSetOverrideProvider } from '@/builder/runtime.tsx';
import { toPageSet } from '@/builder/editor/page-set.ts';
import { prepareDocs } from '@/builder/editor/prepare.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import { useEditorText } from '@/builder/editor/text/hooks.ts';

/**
 * Everything on the canvas resolves text from the editor's drafts, re-resolved on every keystroke
 * (spec §7.2). It subscribes to the store itself so the Puck element passed as `children` keeps its
 * identity and is not re-rendered by an edit — only text consumers update.
 */
export function CanvasTextScope({ children }: { children: ReactNode }) {
  const docs = useEditorStore((s) => s.docs);
  const layout = useEditorStore((s) => s.layout);
  const pageText = useEditorStore((s) => s.pageText);
  const text = useEditorText();
  const pageSet = useMemo(() => toPageSet(prepareDocs(docs), layout, pageText), [docs, layout, pageText]);
  return <PageSetOverrideProvider pageSet={pageSet} text={text}>{children}</PageSetOverrideProvider>;
}
```

- [ ] **Step 6: Wire the canvas**

`EditorCanvas.tsx`: import `CanvasTextScope` and `usePublishedTextSync`. In `EditorCanvas()` call `usePublishedTextSync();` as the first hook (before the `readOnly` early return). Wrap the `<Puck …/>` element: `<CanvasTextScope><Puck … /></CanvasTextScope>` inside `.puckHost`. In `ReadOnlyView`, wrap `<PageGround>…</PageGround>` in `<CanvasTextScope>`.

`ExactPreview.tsx` `ExactRuntime`: read `pageText` and `useEditorText()`; build the set with the overrides and pass the text:

```tsx
  const pageText = useEditorStore((s) => s.pageText);
  const text = useEditorText();
  const pageSet = useMemo(() => toPageSet(prepareDocs(docs), layout, pageText), [docs, layout, pageText]);
  // …
      <PageSetOverrideProvider pageSet={pageSet} text={text}>
```

`icons.tsx`: append

```tsx
export const TextIcon = () => (
  <Icon><path d="M2.5 4V2.5h7V4" /><path d="M6 2.5v11" /><path d="M4.5 13.5h3" /><path d="M10 8.5h4" /><path d="M12 8.5v5" /></Icon>
);
export const CloseIcon = () => (
  <Icon><path d="m4 4 8 8" /><path d="m12 4-8 8" /></Icon>
);
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run test/builder-editor-text-hooks.test.tsx`
Expected: PASS.

Run: `npx vitest run test/builder-editor`
Expected: PASS (existing canvas/exact-preview tests unedited).

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(builder): editor text hooks, panel UI state and a canvas text scope

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/editor/text/hooks.ts web/src/builder/editor/text/ui-store.ts web/src/builder/editor/text/scope.tsx web/src/builder/editor/icons.tsx web/src/builder/editor/EditorCanvas.tsx web/src/builder/editor/ExactPreview.tsx web/test/builder-editor-text-hooks.test.tsx
```

---

### Task 9: The Text panel UI

**Depends on:** Task 8 (and through it 1–7).

**Load `frontend-design:frontend-design` first.** Design direction: this is the editor's own tool, sitting in Puck's ~280 px left column (or a 360 px overlay). Match the existing editor chrome exactly — neutral `--sfb-*` tokens redeclared on the panel root (as `custom-fields/fields.module.css` does), 13 px system type, 32 px controls, 6 px radius, `--sfb-accent` only for the active filter/scope and focus rings. Rows are dense but calm: label in ink, note and built-in default in `--sfb-muted`, the layer badge as a small outlined pill. Issues use `--sfb-danger` text with the existing warn glyph. No motion beyond a 120 ms disclosure transition, removed under `prefers-reduced-motion`.

**Files:**
- Create: `web/src/builder/editor/text/TextRow.tsx`
- Create: `web/src/builder/editor/text/LanguageSection.tsx`
- Create: `web/src/builder/editor/text/TextPanel.tsx`
- Create: `web/src/builder/editor/text/Text.module.css`
- Test: `web/test/builder-editor-text-panel.test.tsx`

**Interfaces:**
- Consumes: hooks, ui-store (Task 8); catalog (Task 2); languages (Task 3); issues (Task 6); `LAYOUT_LABELS` (`page-catalog.ts`); `useTemplateContext` (`@/templates/runtime.tsx`); `cssString` (`resting-marks.ts`); `CloseIcon`, `WarnIcon` (`icons.tsx`).
- Produces:
  - `TextRow({ row, compact? }: { row: TextRowDef; compact?: boolean })` — root `<div data-text-key={row.key} data-sfb-text="">`
  - `TextPanel({ onClose? }: { onClose?: () => void })` — root `<section data-sfb-text="" aria-labelledby=…>` named **"Site text"**
  - `LanguageSection()`
  - Accessible names the e2e relies on: region "Site text"; searchbox "Search text"; filter group "Show" with buttons "All", "Edited", "This layout", "Issues"; per row a scope group "Applies to" with buttons "All layouts" and "Only {Layout}"; the value input labelled by the row label; plural inputs labelled "{label} — {category}"; button "Reset"; placeholder chips named `Insert {name}`; selects "Store language" and "Numbers and dates".

**Row behaviour (spec §7.2):** default scope is "Only {Layout}" when the key already has an override (or shared is not editable), else "All layouts". The box shows the stored value at the chosen scope (empty = not set there) with the value that would otherwise show as its placeholder. Clearing the box resets. Plural keys show one input per `pluralFormsFor(locale)` with a live example ("1 item" / "5 items"). Chips insert `{name}` at the caret of the last focused input of the row. The count reads `n / max` and flags over-max. Inline issues list this key's issues (prefixed with the scope when it isn't the chosen one). Shared editing disabled (not hidden) when `sharedEditable` is false, with the reason as `title` and one note at the top of the panel.

- [ ] **Step 1: Write the failing test**

```tsx
// web/test/builder-editor-text-panel.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DEFAULT_PREVIEW_AS, TEXT_INITIAL, useEditorStore } from '@/builder/editor/store.ts';
import { useTextUi } from '@/builder/editor/text/ui-store.ts';
import { TextRow } from '@/builder/editor/text/TextRow.tsx';
import { TextPanel } from '@/builder/editor/text/TextPanel.tsx';
import { rowFor } from '@/builder/editor/text/catalog.ts';
import { defaultOf, placeholderKey, plainKey, pluralKey } from './helpers/text-keys.ts';

const S = () => useEditorStore.getState();
const ready = (siteText: 'editable' | 'absent' = 'editable') => {
  useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null, ...TEXT_INITIAL });
  S().load({ layout: 'storefront', pageSet: null, readOnly: false, ...(siteText === 'editable' ? { siteText: null } : {}) });
  if (siteText === 'absent') S().setPublishedText({ language: { locale: 'en', formatLocale: '' }, shared: {} });
};

describe('Text panel rows', () => {
  beforeEach(() => useTextUi.setState({ open: true, filter: 'all', query: '', focus: null }));
  afterEach(cleanup);

  it('typing writes the shared draft; the placeholder shows the built-in default; clearing resets', () => {
    ready();
    const key = plainKey();
    render(<TextRow row={rowFor(key)!} />);
    const input = screen.getByRole('textbox', { name: rowFor(key)!.label });
    expect(input).toHaveAttribute('placeholder', String(defaultOf(key)));
    expect(screen.getByRole('button', { name: 'All layouts' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(input, { target: { value: 'Northbound words' } });
    expect(S().siteText!.strings.en![key]).toBe('Northbound words');
    expect(screen.getByText('Shared', { exact: true })).toBeInTheDocument();   // layer badge
    fireEvent.change(input, { target: { value: '' } });
    expect(S().siteText!.strings).toEqual({});
  });

  it('"Only Storefront" writes this layout, shows the shared value underneath, Reset clears only that scope', () => {
    ready();
    const key = plainKey();
    act(() => { S().setText('shared', key, 'Shared words', null); });
    render(<TextRow row={rowFor(key)!} />);
    fireEvent.click(screen.getByRole('button', { name: 'Only Storefront' }));
    const input = screen.getByRole('textbox', { name: rowFor(key)!.label });
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', 'Shared words');
    fireEvent.change(input, { target: { value: 'Storefront words' } });
    expect(S().pageText.strings.en![key]).toBe('Storefront words');
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(S().pageText.strings).toEqual({});
    expect(S().siteText!.strings.en![key]).toBe('Shared words');
  });

  it('an unknown placeholder shows an inline issue and marks the input invalid', () => {
    ready();
    const key = plainKey();
    render(<TextRow row={rowFor(key)!} />);
    const input = screen.getByRole('textbox', { name: rowFor(key)!.label });
    fireEvent.change(input, { target: { value: 'Hi {nope}' } });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/\{nope\} isn’t available in this line/)).toBeInTheDocument();
  });

  it('placeholder chips insert at the caret', () => {
    ready();
    const { key, name } = placeholderKey();
    render(<TextRow row={rowFor(key)!} />);
    const input = screen.getByRole('textbox', { name: rowFor(key)!.label }) as HTMLInputElement | HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Only  left' } });
    fireEvent.focus(input);
    input.setSelectionRange(5, 5);
    fireEvent.select(input);
    fireEvent.click(screen.getByRole('button', { name: `Insert {${name}}` }));
    expect(S().siteText!.strings.en![key]).toBe(`Only {${name}} left`);
  });

  it('without siteText the shared scope is disabled and edits go to this layout', () => {
    ready('absent');
    const key = plainKey();
    render(<TextRow row={rowFor(key)!} />);
    expect(screen.getByRole('button', { name: 'All layouts' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Only Storefront' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByRole('textbox', { name: rowFor(key)!.label }), { target: { value: 'Mine' } });
    expect(S().pageText.strings.en![key]).toBe('Mine');
    expect(S().siteText).toBeNull();
  });

  it('plural keys: one input per category of the store language, with a live example', () => {
    ready();
    const key = pluralKey();
    const label = rowFor(key)!.label;
    const { unmount } = render(<TextRow row={rowFor(key)!} />);
    expect(screen.getAllByRole('textbox').map((el) => el.getAttribute('aria-label'))).toEqual([`${label} — one`, `${label} — other`]);
    fireEvent.change(screen.getByRole('textbox', { name: `${label} — other` }), { target: { value: '{count} crates' } });
    expect(screen.getByText('5 crates', { exact: false })).toBeInTheDocument();
    unmount();
    act(() => { S().setLanguage({ locale: 'pl' }, null); });
    render(<TextRow row={rowFor(key)!} />);
    expect(screen.getAllByRole('textbox').map((el) => el.getAttribute('aria-label'))).toEqual(
      ['one', 'few', 'many', 'other'].map((c) => `${label} — ${c}`),
    );
  });
});

describe('Text panel', () => {
  beforeEach(() => useTextUi.setState({ open: true, filter: 'all', query: '', focus: null }));
  afterEach(cleanup);

  it('search and the Issues filter narrow the rows; Unused lists unknown keys with Delete', () => {
    ready();
    const key = plainKey();
    act(() => {
      S().setText('shared', key, 'Hi {', null);
      useEditorStore.setState({ siteText: { ...S().siteText!, strings: { en: { ...S().siteText!.strings.en, 'zz.gone.key': 'old' } } } });
    });
    render(<TextPanel />);
    const panel = screen.getByRole('region', { name: 'Site text' });
    fireEvent.click(within(panel).getByRole('button', { name: /^Issues/ }));   // "Issues 1" carries the count
    const rows = panel.querySelectorAll('[data-text-key]');
    expect([...rows].map((r) => r.getAttribute('data-text-key'))).toContain(key);
    expect([...rows].every((r) => r.getAttribute('data-text-key') === key || r.closest('[data-unused]'))).toBe(true);
    fireEvent.click(within(panel).getByRole('button', { name: 'All' }));
    fireEvent.change(within(panel).getByRole('searchbox', { name: 'Search text' }), { target: { value: 'zzqq-nothing' } });
    expect(within(panel).getByText('No lines match.')).toBeInTheDocument();
    const unused = panel.querySelector('[data-unused]') as HTMLElement;
    expect(within(unused).getByText('zz.gone.key')).toBeInTheDocument();
    fireEvent.click(within(unused).getByRole('button', { name: 'Delete zz.gone.key' }));
    expect(S().siteText!.strings.en!['zz.gone.key']).toBeUndefined();
  });

  it('language: changing the store language edits the shared draft and the counter names it', () => {
    ready();
    render(<TextPanel />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Store language' }), { target: { value: 'de' } });
    expect(S().siteText!.language).toEqual({ locale: 'de', formatLocale: '' });
    expect(screen.getByText(/of \d+ lines set in Deutsch — the rest show the built-in English/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Numbers and dates' }), { target: { value: 'de-AT' } });
    expect(S().siteText!.language.formatLocale).toBe('de-AT');
  });

  it('language controls are disabled without siteText, with the reason shown', () => {
    ready('absent');
    render(<TextPanel />);
    expect(screen.getByRole('combobox', { name: 'Store language' })).toBeDisabled();
    expect(screen.getByText(/can’t be changed from this version of the admin/)).toBeInTheDocument();
  });

  it('a focus request opens the row’s group and focuses its input', async () => {
    ready();
    const key = plainKey();
    useTextUi.getState().show({ key });
    render(<TextPanel />);
    await vi.waitFor(() => expect(document.activeElement?.closest('[data-text-key]')?.getAttribute('data-text-key')).toBe(key));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/builder-editor-text-panel.test.tsx`
Expected: FAIL — cannot resolve `@/builder/editor/text/TextRow.tsx`.

- [ ] **Step 3: Implement `TextRow.tsx`**

```tsx
// web/src/builder/editor/text/TextRow.tsx
import { useId, useRef, useState } from 'react';
import type { PluralForms, TextValue } from '@/text/types.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import { LAYOUT_LABELS } from '@/builder/editor/page-catalog.ts';
import { applyText, useTextCell, useTextLanguage } from '@/builder/editor/text/hooks.ts';
import type { TextScope } from '@/builder/editor/text/model.ts';
import type { TextRowDef } from '@/builder/editor/text/catalog.ts';
import { fillExample, pluralFormsFor, sampleCount } from '@/builder/editor/text/languages.ts';
import styles from '@/builder/editor/text/Text.module.css';

const domId = (reactId: string) => reactId.replace(/[^A-Za-z0-9_-]/g, '');
export const SHARED_LOCKED = 'Shared wording can’t be changed from this version of the admin.';

/** The form a plural shows when a category has none of its own (spec §6.3: its own `other`). */
const formOf = (value: TextValue, category: string): string =>
  typeof value === 'string' ? value : (value as Record<string, string | undefined>)[category] ?? value.other ?? '';
export const summary = (value: TextValue): string => formOf(value, 'other');

type Field = HTMLInputElement | HTMLTextAreaElement;

export function TextRow({ row, compact = false }: { row: TextRowDef; compact?: boolean }) {
  const cell = useTextCell(row.key);
  const layout = useEditorStore((s) => s.layout);
  const { locale } = useTextLanguage();
  const id = domId(useId());
  const [scope, setScope] = useState<TextScope>(() => (cell.layout !== undefined || !cell.sharedEditable ? 'layout' : 'shared'));
  const last = useRef<{ el: Field; form: string | null } | null>(null);
  const [focusLen, setFocusLen] = useState<number | null>(null);

  const layoutLabel = LAYOUT_LABELS[layout];
  const stored = scope === 'shared' ? cell.shared : cell.layout;
  const under = scope === 'layout' ? cell.below.value : row.def;
  const locked = scope === 'shared' && !cell.sharedEditable;
  const scopeIssues = cell.issues.filter((i) => i.scope === scope);
  const fromLabel = cell.effective.from === 'default' ? 'Default' : cell.effective.from === 'shared' ? 'Shared' : layoutLabel;
  const forms = row.plural ? pluralFormsFor(locale) : [];
  const storedForms: Partial<PluralForms> = stored !== undefined && typeof stored !== 'string' ? stored : {};

  const write = (value: TextValue | null) => { applyText(scope, row.key, value); };
  const writeForm = (form: string, text: string) => write({ ...storedForms, [form]: text } as PluralForms);
  const track = (el: Field, form: string | null) => { last.current = { el, form }; setFocusLen(el.value.length); };

  const insert = (name: string) => {
    const target = last.current;
    const token = `{${name}}`;
    const current = target ? target.el.value : row.plural ? storedForms.other ?? '' : typeof stored === 'string' ? stored : '';
    const at = target?.el.selectionStart ?? current.length;
    const end = target?.el.selectionEnd ?? at;
    const next = current.slice(0, at) + token + current.slice(end);
    if (row.plural) writeForm(target?.form ?? 'other', next);
    else write(next);
    const el = target?.el;
    if (el) requestAnimationFrame(() => { el.focus(); el.setSelectionRange(at + token.length, at + token.length); });
  };

  const described = `${id}-note ${id}-issues`;
  const Input = row.multiline ? 'textarea' : 'input';
  const length = focusLen ?? (typeof stored === 'string' ? stored.length : summary(stored ?? '').length);

  return (
    <div className={styles.row} data-text-key={row.key} data-compact={compact ? '' : undefined} data-sfb-text="">
      <div className={styles.rowHead}>
        <label className={styles.rowLabel} htmlFor={row.plural ? undefined : `${id}-v`}>{row.label}</label>
        <span className={styles.layer} data-from={cell.effective.from}>{fromLabel}</span>
      </div>
      <p id={`${id}-note`} className={styles.note}>
        {row.note && <span>{row.note}. </span>}
        <span className={styles.builtIn}>Built-in: {summary(row.def)}</span>
      </p>
      <div className={styles.scope} role="group" aria-label="Applies to">
        <button type="button" aria-pressed={scope === 'shared'} disabled={!cell.sharedEditable} title={cell.sharedEditable ? undefined : SHARED_LOCKED} onClick={() => setScope('shared')}>
          All layouts
        </button>
        <button type="button" aria-pressed={scope === 'layout'} onClick={() => setScope('layout')}>
          Only {layoutLabel}
        </button>
      </div>
      {row.plural ? (
        <div className={styles.forms}>
          {forms.map((form) => {
            const value = storedForms[form as keyof PluralForms] ?? '';
            const n = sampleCount(locale, form);
            return (
              <label key={form} className={styles.form}>
                <span className={styles.formName}>{form}</span>
                <input
                  aria-label={`${row.label} — ${form}`}
                  aria-describedby={described}
                  aria-invalid={scopeIssues.length > 0 || undefined}
                  value={value}
                  placeholder={formOf(under, form)}
                  readOnly={locked}
                  onFocus={(e) => track(e.currentTarget, form)}
                  onSelect={(e) => track(e.currentTarget, form)}
                  onChange={(e) => { writeForm(form, e.target.value); setFocusLen(e.target.value.length); }}
                />
                <span className={styles.example}>e.g. {fillExample(value || formOf(cell.effective.value, form), n)}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <Input
          id={`${id}-v`}
          className={styles.input}
          aria-describedby={described}
          aria-invalid={scopeIssues.length > 0 || undefined}
          value={typeof stored === 'string' ? stored : ''}
          placeholder={summary(under)}
          readOnly={locked}
          rows={row.multiline ? 3 : undefined}
          onFocus={(e) => track(e.currentTarget, null)}
          onSelect={(e) => track(e.currentTarget, null)}
          onChange={(e) => { write(e.target.value); setFocusLen(e.target.value.length); }}
        />
      )}
      <div className={styles.rowFoot}>
        <span className={styles.chips}>
          {row.placeholders.map((name) => (
            <button key={name} type="button" className={styles.chip} aria-label={`Insert {${name}}`} disabled={locked} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(name)}>
              {`{${name}}`}
            </button>
          ))}
        </span>
        <span className={styles.count} data-over={length > row.max ? '' : undefined}>{length} / {row.max}</span>
        <button type="button" className={styles.reset} disabled={stored === undefined || locked} onClick={() => write(null)}>Reset</button>
      </div>
      <ul id={`${id}-issues`} className={styles.rowIssues}>
        {cell.issues.map((i) => (
          <li key={`${i.scope}-${i.rule}`}>{i.scope !== scope ? `${i.scope === 'shared' ? 'All layouts' : `Only ${layoutLabel}`}: ` : ''}{i.message}</li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Implement `LanguageSection.tsx`**

```tsx
// web/src/builder/editor/text/LanguageSection.tsx
import { useId, useMemo, useState } from 'react';
import { useEditorStore } from '@/builder/editor/store.ts';
import { applyLanguage, useEditorText, useTextLanguage } from '@/builder/editor/text/hooks.ts';
import { allRows } from '@/builder/editor/text/catalog.ts';
import { canonicalTag, formatOptions, LANGUAGES, nativeName } from '@/builder/editor/text/languages.ts';
import { SHARED_LOCKED } from '@/builder/editor/text/TextRow.tsx';
import styles from '@/builder/editor/text/Text.module.css';

const OTHER = '__other__';

export function LanguageSection() {
  const { locale, formatLocale } = useTextLanguage();
  const text = useEditorText();
  const editable = useEditorStore((s) => s.sharedEditable && !s.readOnly);
  const id = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const [typing, setTyping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const languages = useMemo(() => {
    const list = LANGUAGES.map((l) => ({ value: l.code, label: nativeName(l.code) }));
    return list.some((l) => l.value === locale) ? list : [{ value: locale, label: nativeName(locale) }, ...list];
  }, [locale]);
  const formats = useMemo(() => {
    const list = formatOptions(locale);
    return formatLocale && !list.some((o) => o.value === formatLocale) ? [...list, { value: formatLocale, label: formatLocale }] : list;
  }, [locale, formatLocale]);

  const rows = allRows();
  const set = rows.filter((r) => text.shared[r.key] !== undefined || text.layout[r.key] !== undefined).length;
  const counter = locale === 'en'
    ? `${set} of ${rows.length} lines changed from the built-in wording`
    : `${set} of ${rows.length} lines set in ${nativeName(locale)} — the rest show the built-in English`;

  const commitTag = () => {
    if (typing === null) return;
    const tag = canonicalTag(typing);
    if (!tag) { setError('Use a language tag like en-GB or pt-BR.'); return; }
    applyLanguage({ formatLocale: tag });
    setTyping(null);
    setError(null);
  };

  return (
    <section className={styles.language} aria-labelledby={`${id}-lang`}>
      <h3 id={`${id}-lang`} className={styles.sectionTitle}>Language</h3>
      {!editable && <p className={styles.locked}>{SHARED_LOCKED} Update the admin to change it; this layout’s wording still saves.</p>}
      <label className={styles.field}>
        <span>Store language</span>
        <select value={locale} disabled={!editable} onChange={(e) => applyLanguage({ locale: e.target.value })}>
          {languages.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </label>
      <label className={styles.field}>
        <span>Numbers and dates</span>
        <select
          value={typing !== null ? OTHER : formatLocale}
          disabled={!editable}
          onChange={(e) => {
            if (e.target.value === OTHER) { setTyping(''); return; }
            setTyping(null);
            setError(null);
            applyLanguage({ formatLocale: e.target.value });
          }}
        >
          {formats.map((o) => <option key={o.value || 'builtin'} value={o.value}>{o.label}</option>)}
          <option value={OTHER}>Another language tag…</option>
        </select>
      </label>
      {typing !== null && (
        <label className={styles.field}>
          <span>Language tag</span>
          <input
            value={typing}
            placeholder="en-GB"
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-tagerr`}
            onChange={(e) => { setTyping(e.target.value); setError(null); }}
            onBlur={commitTag}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitTag(); } }}
          />
          <span id={`${id}-tagerr`} className={styles.error} role={error ? 'alert' : undefined}>{error}</span>
        </label>
      )}
      <p className={styles.counter}>{counter}</p>
    </section>
  );
}
```

- [ ] **Step 5: Implement `TextPanel.tsx`**

```tsx
// web/src/builder/editor/text/TextPanel.tsx
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTemplateContext } from '@/templates/runtime.tsx';
import { useEditorStore } from '@/builder/editor/store.ts';
import { applyText, useEditorText, useTextIssues, useTextReady } from '@/builder/editor/text/hooks.ts';
import { useTextUi, type TextFilter } from '@/builder/editor/text/ui-store.ts';
import { rowMatches, textGroups, type TextRowDef } from '@/builder/editor/text/catalog.ts';
import { unusedEntries } from '@/builder/editor/text/issues.ts';
import { valueStrings } from '@/builder/editor/text/model.ts';
import { LAYOUT_LABELS } from '@/builder/editor/page-catalog.ts';
import { cssString } from '@/builder/editor/resting-marks.ts';
import { CloseIcon } from '@/builder/editor/icons.tsx';
import { LanguageSection } from '@/builder/editor/text/LanguageSection.tsx';
import { TextRow, summary } from '@/builder/editor/text/TextRow.tsx';
import styles from '@/builder/editor/text/Text.module.css';

const FILTERS: Array<{ id: TextFilter; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'edited', label: 'Edited' }, { id: 'layout', label: 'This layout' }, { id: 'issues', label: 'Issues' },
];

export function TextPanel({ onClose }: { onClose?: () => void }) {
  const id = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const templateId = useTemplateContext().resolved?.templateId ?? 'modern';
  const groups = useMemo(() => textGroups(templateId), [templateId]);
  const filter = useTextUi((s) => s.filter);
  const query = useTextUi((s) => s.query);
  const focus = useTextUi((s) => s.focus);
  const text = useEditorText();
  const issues = useTextIssues();
  const ready = useTextReady();
  const sharedEditable = useEditorStore((s) => s.sharedEditable);
  const layout = useEditorStore((s) => s.layout);
  const root = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const issueKeys = useMemo(() => new Set(issues.map((i) => i.key)), [issues]);
  const edited = (r: TextRowDef) => text.shared[r.key] !== undefined || text.layout[r.key] !== undefined;
  const keep = (r: TextRowDef) => {
    if (filter === 'edited' && !edited(r)) return false;
    if (filter === 'layout' && text.layout[r.key] === undefined) return false;
    if (filter === 'issues' && !issueKeys.has(r.key)) return false;
    return rowMatches(r, query, [...valueStrings(text.shared[r.key]), ...valueStrings(text.layout[r.key])]);
  };
  const unused = useMemo(() => unusedEntries({ shared: sharedEditable ? text.shared : null, layout: text.layout }), [sharedEditable, text]);
  const narrowed = query.trim() !== '' || filter !== 'all';
  const focusGroup = focus ? groups.find((g) => g.rows.some((r) => r.key === focus.key))?.id : undefined;

  useEffect(() => {
    if (!focus) return;
    if (focusGroup) setExpanded((s) => new Set(s).add(focusGroup));
    const raf = requestAnimationFrame(() => {
      const row = root.current?.querySelector(`[data-text-key="${cssString(focus.key)}"]`);
      const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      row?.scrollIntoView?.({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
      row?.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [focus, focusGroup]);

  const shown = groups.map((g) => ({ g, rows: g.rows.filter(keep) })).filter((x) => x.rows.length > 0);

  return (
    <section ref={root} className={styles.root} data-sfb-text="" aria-labelledby={`${id}-title`}>
      <header className={styles.head}>
        <h2 id={`${id}-title`} className={styles.title}>Site text</h2>
        {onClose && <button type="button" className={styles.iconButton} aria-label="Close text panel" onClick={onClose}><CloseIcon /></button>}
      </header>
      {!ready ? (
        <p className={styles.loading} role="status">Loading the shop’s wording…</p>
      ) : (
        <>
          <LanguageSection />
          <div className={styles.tools}>
            <input type="search" className={styles.search} aria-label="Search text" placeholder="Search text" value={query} onChange={(e) => useTextUi.getState().setQuery(e.target.value)} />
            <div className={styles.filters} role="group" aria-label="Show">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => useTextUi.getState().setFilter(f.id)}>
                  {f.id === 'layout' ? `This layout (${LAYOUT_LABELS[layout]})` : f.label}
                  {f.id === 'issues' && issues.length > 0 ? ` ${issues.length}` : ''}
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 && <p className={styles.empty}>No lines match.</p>}
          {shown.map(({ g, rows }) => {
            const open = narrowed || expanded.has(g.id);
            const count = g.rows.filter(edited).length;
            return (
              <div key={g.id} className={styles.group}>
                <button
                  type="button"
                  className={styles.groupToggle}
                  aria-expanded={open}
                  aria-controls={`${id}-${g.id}`}
                  onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })}
                >
                  <span>{g.title}</span>
                  <span className={styles.groupCount}>{count > 0 ? `${count} edited` : `${g.rows.length}`}</span>
                </button>
                {open && <div id={`${id}-${g.id}`} className={styles.groupBody}>{rows.map((r) => <TextRow key={r.key} row={r} />)}</div>}
              </div>
            );
          })}
          {unused.length > 0 && (
            <div className={styles.group} data-unused="">
              <h3 className={styles.sectionTitle}>Unused</h3>
              <p className={styles.note}>Saved wording this version of the shop no longer shows. It doesn’t block publishing, except lines that can’t be changed.</p>
              <ul className={styles.unused}>
                {unused.map((u) => (
                  <li key={`${u.scope}:${u.key}`}>
                    <code>{u.key}</code>
                    <span className={styles.note}>{summary(u.value)}</span>
                    <button type="button" className={styles.reset} aria-label={`Delete ${u.key}`} onClick={() => applyText(u.scope, u.key, null)}>Delete</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Implement `Text.module.css`**

Write the stylesheet for the classes used above (`root head title iconButton loading language sectionTitle locked field error counter tools search filters empty group groupToggle groupCount groupBody unused row rowHead rowLabel layer note builtIn scope forms form formName example input rowFoot chips chip count reset rowIssues`). Required properties, whatever else the design pass adds:

```css
/* The Text panel is the admin's tool, not the shop: neutral --sfb-* tokens (as fields.module.css). */
.root {
  --sfb-ink: #1d2433;
  --sfb-muted: #5b6475;
  --sfb-line: #d9dde5;
  --sfb-line-strong: #b8bfcc;
  --sfb-surface: #ffffff;
  --sfb-wash: #f3f5f8;
  --sfb-accent: #3355ff;
  --sfb-accent-wash: #eef1ff;
  --sfb-on-accent: #ffffff;
  --sfb-danger: #b3261e;
  --sfb-radius: 6px;
  --sfb-control-h: 32px;

  box-sizing: border-box;
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 12px;
  min-inline-size: 0;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  color: var(--sfb-ink);
  background: var(--sfb-surface);
}
.root * { box-sizing: border-box; }
.input, .search, .forms input, .field select, .field input {
  inline-size: 100%;
  min-block-size: var(--sfb-control-h);
  border: 1px solid var(--sfb-line-strong);
  border-radius: var(--sfb-radius);
  padding: 6px 8px;
  font: inherit;
  color: var(--sfb-ink);
  background: var(--sfb-surface);
}
.input:focus-visible, .search:focus-visible, .forms input:focus-visible, .root button:focus-visible, .field select:focus-visible, .field input:focus-visible {
  outline: 2px solid var(--sfb-accent);
  outline-offset: 1px;
}
.input[aria-invalid='true'], .forms input[aria-invalid='true'] { border-color: var(--sfb-danger); }
.rowIssues { margin: 0; padding: 0; list-style: none; color: var(--sfb-danger); }
.rowIssues:empty { display: none; }
.count[data-over] { color: var(--sfb-danger); font-weight: 600; }
.scope button[aria-pressed='true'], .filters button[aria-pressed='true'] { background: var(--sfb-accent); color: var(--sfb-on-accent); border-color: var(--sfb-accent); }
.scope button:disabled { opacity: 0.5; cursor: not-allowed; }
.note, .builtIn, .example, .groupCount, .counter { color: var(--sfb-muted); }
.row { display: grid; gap: 6px; padding-block: 10px; border-block-end: 1px solid var(--sfb-line); }
.row[data-compact] { padding-block: 8px; }
@media (prefers-reduced-motion: no-preference) {
  .groupBody { animation: sfb-text-open 120ms ease-out; }
}
@keyframes sfb-text-open { from { opacity: 0; } to { opacity: 1; } }
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run test/builder-editor-text-panel.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(builder): Text panel — language, search, filters, groups, rows with scope, plurals and issues

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/editor/text/TextRow.tsx web/src/builder/editor/text/LanguageSection.tsx web/src/builder/editor/text/TextPanel.tsx web/src/builder/editor/text/Text.module.css web/test/builder-editor-text-panel.test.tsx
```

---

### Task 10: Header — Text button, text issues, unified Undo/Redo and hotkeys

**Depends on:** Task 8 (runs in the same wave as Task 9; disjoint files).

**Load `frontend-design:frontend-design` first.** Reuse the header's existing classes (`styles.button`, `styles.panelItem`, `styles.panelTitle`…); the Text button sits next to "Add block" and uses `aria-pressed` like the panel toggles.

**Files:**
- Modify: `web/src/builder/editor/EditorHeader.tsx`
- Test: `web/test/builder-editor-text-header.test.tsx`

**Interfaces:**
- Consumes: `useTextIssues` (Task 8), `useTextUi` (Task 8), `TextIcon` (Task 8), `puckHistoryView`, `undoStep`, `redoStep`, `setAnchorSource` (Task 4), `rowFor` (Task 2), `LAYOUT_LABELS`.
- Produces:
  - Header button **"Text"** (`aria-pressed` = panel open) toggling `useTextUi`.
  - IssuesMenu: the count and summary include text issues; a **"Text"** section lists them (label, scope, message); clicking one closes the menu and calls `useTextUi.getState().show({ key, filter: 'issues' })`.
  - `useUnifiedHistory(): { undo(): void; redo(): void; canUndo: boolean; canRedo: boolean }` (module-internal) driving the Undo/Redo buttons.
  - A window capture-phase keydown handler: Ctrl/⌘+Z, Shift+Ctrl/⌘+Z, Ctrl/⌘+Y are taken over when focus is inside `[data-sfb-text]` **or** the next step is a text step; otherwise left to Puck. Never while an exact preview shows (`viewport !== null`).
  - `setAnchorSource(() => current Puck history id)` registered for the header's lifetime.

- [ ] **Step 1: Write the failing test**

```tsx
// web/test/builder-editor-text-header.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';

vi.hoisted(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
vi.mock('@/app/builder-gate.ts', async (orig) => ({ ...(await orig<typeof import('@/app/builder-gate.ts')>()), isBuilderMode: () => true }));

import { DEFAULT_PREVIEW_AS, TEXT_INITIAL, useEditorStore } from '@/builder/editor/store.ts';
import { EditorCanvas } from '@/builder/editor/EditorCanvas.tsx';
import { useTextUi } from '@/builder/editor/text/ui-store.ts';
import { applyText } from '@/builder/editor/text/hooks.ts';
import { plainKey } from './helpers/text-keys.ts';

function renderCanvas() {
  const router = createMemoryRouter([{ path: '/__builder/*', element: <EditorCanvas /> }], { initialEntries: ['/__builder/doc/catalog'] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}
async function puckShown() {
  await vi.waitFor(() => expect(document.querySelector('[data-sf-builder-header]')).not.toBeNull());
  for (const el of document.querySelectorAll<HTMLElement>('.Puck')) el.style.visibility = 'visible';
}
const S = () => useEditorStore.getState();

describe('editor header: text', () => {
  const key = plainKey();
  beforeEach(() => {
    useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null, ...TEXT_INITIAL });
    useTextUi.setState({ open: false, filter: 'all', query: '', focus: null });
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
  });
  afterEach(cleanup);

  it('the Text button toggles the panel state', async () => {
    renderCanvas();
    await puckShown();
    const button = screen.getByRole('button', { name: 'Text' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(useTextUi.getState().open).toBe(true);
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('text issues count, list under Text, and jump to their row', async () => {
    renderCanvas();
    await puckShown();
    act(() => { applyText('shared', key, 'Hi {'); });
    const issues = screen.getByRole('button', { name: /^Issues/ });
    expect(issues).toHaveAccessibleName('Issues 1 issue, publishing is blocked');
    fireEvent.click(issues);
    const panel = screen.getByRole('dialog', { name: 'Fix these to publish' });
    const section = within(panel).getByRole('region', { name: 'Text' });
    fireEvent.click(within(section).getByRole('button', { name: /All layouts/ }));
    expect(useTextUi.getState()).toMatchObject({ open: true, filter: 'issues', focus: { key } });
  });

  it('Undo and Redo cover text edits', async () => {
    renderCanvas();
    await puckShown();
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).toBeDisabled();
    act(() => { applyText('shared', key, 'Northbound'); });
    expect(undo).toBeEnabled();
    fireEvent.click(undo);
    expect(S().siteText!.strings).toEqual({});
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(S().siteText!.strings.en![key]).toBe('Northbound');
  });

  it('Ctrl+Z inside a text field undoes the text edit, not a block', async () => {
    renderCanvas();
    await puckShown();
    const field = document.createElement('input');
    const holder = document.createElement('div');
    holder.setAttribute('data-sfb-text', '');
    holder.appendChild(field);
    document.body.appendChild(holder);
    act(() => { applyText('shared', key, 'Typed'); });
    field.focus();
    const event = new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true });
    act(() => { field.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(S().siteText!.strings).toEqual({});
    holder.remove();
  });

  it('while an exact preview shows, the keys are left to the preview guard', async () => {
    renderCanvas();
    await puckShown();
    act(() => { applyText('shared', key, 'Typed'); S().setViewport(768); });
    const event = new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true });
    act(() => { document.body.dispatchEvent(event); });
    expect(S().siteText!.strings.en![key]).toBe('Typed');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/builder-editor-text-header.test.tsx`
Expected: FAIL — no button named "Text".

- [ ] **Step 3: Implement**

In `EditorHeader.tsx` add imports:

```ts
import { useTextIssues } from '@/builder/editor/text/hooks.ts';
import { useTextUi } from '@/builder/editor/text/ui-store.ts';
import { puckHistoryView, redoStep, setAnchorSource, undoStep } from '@/builder/editor/text/history.ts';
import { rowFor } from '@/builder/editor/text/catalog.ts';
import { LAYOUT_LABELS } from '@/builder/editor/page-catalog.ts';
import { TextIcon } from '@/builder/editor/icons.tsx';
```

(merge `TextIcon` into the existing icons import, `LAYOUT_LABELS` into the page-catalog import).

Replace `History`:

```tsx
/**
 * One timeline for block and text edits (spec §7.4): Puck owns block history, the store owns text
 * snapshots anchored to Puck's entries (text/history.ts decides which to step).
 */
function useUnifiedHistory() {
  const getPuck = useGetPuck();
  const hasPast = usePuck((s) => s.history.hasPast);
  const hasFuture = usePuck((s) => s.history.hasFuture);
  const textPast = useEditorStore((s) => s.textPast.length > 0);
  const textFuture = useEditorStore((s) => s.textFuture.length > 0);
  const view = () => puckHistoryView(getPuck().history);
  const undo = () => {
    const s = useEditorStore.getState();
    const step = undoStep(s.textPast.at(-1), view());
    if (step === 'text') s.undoText();
    else if (step === 'doc') getPuck().history.back();
  };
  const redo = () => {
    const s = useEditorStore.getState();
    const step = redoStep(s.textFuture.at(-1), view());
    if (step === 'text') s.redoText();
    else if (step === 'doc') getPuck().history.forward();
    else if (step === 'discard') s.discardTextFuture();
  };
  return { undo, redo, view, canUndo: hasPast || textPast, canRedo: hasFuture || textFuture };
}

function History() {
  const getPuck = useGetPuck();
  const { undo, redo, view, canUndo, canRedo } = useUnifiedHistory();
  // Text edits are stamped with the Puck entry that was current when they were made.
  useEffect(() => {
    setAnchorSource(() => puckHistoryView(getPuck().history).anchor);
    return () => setAnchorSource(null);
  }, [getPuck]);
  // Puck's own hotkeys listen on document and would undo a block while the owner types in a text
  // field. Take the keys first when focus is in the text UI or the next step is a text step.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      const isUndo = (key === 'z' || e.code === 'KeyZ') && !e.shiftKey;
      const isRedo = ((key === 'z' || e.code === 'KeyZ') && e.shiftKey) || key === 'y' || e.code === 'KeyY';
      if (!isUndo && !isRedo) return;
      const s = useEditorStore.getState();
      if (s.viewport !== null) return;   // the exact preview's guard owns these keys (preview-keys.ts)
      const inText = (e.target as Element | null)?.closest?.('[data-sfb-text]') != null;
      const step = isUndo ? undoStep(s.textPast.at(-1), view()) : redoStep(s.textFuture.at(-1), view());
      if (!inText && step !== 'text') return;
      e.preventDefault();
      e.stopPropagation();
      if (isUndo) undo(); else redo();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
  return (
    <span className={styles.pair}>
      <button type="button" className={styles.iconButton} aria-label="Undo" title="Undo" disabled={!canUndo} onClick={undo}>
        <UndoIcon />
      </button>
      <button type="button" className={styles.iconButton} aria-label="Redo" title="Redo" disabled={!canRedo} onClick={redo}>
        <RedoIcon />
      </button>
    </span>
  );
}

function TextButton() {
  const open = useTextUi((s) => s.open);
  return (
    <button type="button" className={styles.button} aria-pressed={open} onClick={() => (open ? useTextUi.getState().hide() : useTextUi.getState().show())}>
      <TextIcon />
      Text
    </button>
  );
}
```

In `IssuesMenu`: after `const issues = useIssues();` add `const textIssues = useTextIssues();` and `const layout = useEditorStore((s) => s.layout);`. Change the count to `const count = issues.length + textIssues.length;`. In the panel, render the page list only when `issues.length > 0`, keep the "Every page in this layout passes its checks." text only when `count === 0`, and add after the page section:

```tsx
        {textIssues.length > 0 && (
          <section aria-labelledby={`${id}-text`} className={styles.panelTips}>
            <h2 id={`${id}-text`} className={styles.panelTitle}>Text</h2>
            <ul className={styles.panelList}>
              {textIssues.map((issue) => (
                <li key={`${issue.scope}-${issue.key}-${issue.rule}`}>
                  <button
                    type="button"
                    className={styles.panelItem}
                    data-kind="issue"
                    onClick={() => { setOpen(false); useTextUi.getState().show({ key: issue.key, filter: 'issues' }); }}
                  >
                    <WarnIcon />
                    <span className={styles.panelItemBody}>
                      <span className={styles.panelWhere}>
                        <span>{rowFor(issue.key)?.label ?? issue.key}</span>
                        <span className={styles.panelPart}>{issue.scope === 'shared' ? 'All layouts' : `Only ${LAYOUT_LABELS[layout]}`}</span>
                      </span>
                      <span>{issue.message}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
```

In `EditorHeader`, place `<TextButton />` right after `<AddBlock />`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/builder-editor-text-header.test.tsx`
Expected: PASS.

Run: `npx vitest run test/builder-editor`
Expected: PASS — including the unedited `builder-editor-ui.test.tsx` (its "Issues No issues", Undo/Redo disabled and issue-list assertions still hold).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(builder): header Text button, text issues in the issue list, one undo for blocks and text

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/editor/EditorHeader.tsx web/test/builder-editor-text-header.test.tsx
```

---

### Task 11: Panel placement and "Text in this block"

**Depends on:** Tasks 9 and 10.

**Load `frontend-design:frontend-design` first.** The block section sits under Puck's fields in the ~260 px right column: a hairline divider, a small-caps section title "Text in this block", compact rows. The narrow-frame overlay is a 360 px (max 100 %) sheet pinned under the editor header on the left, above the canvas, with `--sfb-shadow-pop`-style elevation, Escape to close and focus returned to the Text button.

**Files:**
- Create: `web/src/builder/editor/text/plugin.tsx`
- Create: `web/src/builder/editor/text/BlockText.tsx`
- Create: `web/src/builder/editor/text/TextOverlay.tsx`
- Modify: `web/src/builder/editor/text/Text.module.css` (add `.blockText`, `.overlay`)
- Modify: `web/src/builder/editor/EditorCanvas.tsx` (`plugins={[TEXT_PLUGIN]}`, `overrides.fields`)
- Modify: `web/src/builder/editor/EditorHeader.tsx` (`useTextPanelPlacement()`, render `TextOverlay`)
- Test: `web/test/builder-editor-text-placement.test.tsx`

**Interfaces:**
- Consumes: `TextPanel`, `TextRow` (Task 9); `useTextUi`; `blockTextRows`, `rowMatches` (Task 2); `WIDE_FRAME_QUERY` (`panels.ts`); `usePuck`, `useGetPuck`.
- Produces:
  - `TEXT_PLUGIN: Plugin` (`name: 'text'`, `label: 'Site text'`, `icon: <TextIcon/>`; its body mounts `TextPanel` only while open on a wide frame), `useWideFrame(): boolean`
  - `FieldsWithText(props: { children: ReactNode; isLoading: boolean; itemSelector?: ItemSelector | null })` for `overrides.fields`
  - `BLOCK_TEXT_SEARCH_OVER = 20`
  - `TextOverlay({ onClose }: { onClose: () => void })`
  - `useTextPanelPlacement(): { overlay: boolean }` (in `EditorHeader.tsx`)

**Placement (spec §7.2):** at `WIDE_FRAME_QUERY` the Text panel is Puck's `text` plugin in the left sidebar (Blocks and Outline come back when it closes): opening sets `ui.plugin.current = 'text'` and `leftSideBarVisible: true`; closing returns to `blocks`; picking another rail tab or hiding the left sidebar closes it. Below that width it is the overlay.

- [ ] **Step 1: Write the failing test**

```tsx
// web/test/builder-editor-text-placement.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';

vi.hoisted(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
vi.mock('@/app/builder-gate.ts', async (orig) => ({ ...(await orig<typeof import('@/app/builder-gate.ts')>()), isBuilderMode: () => true }));

import { DEFAULT_PREVIEW_AS, TEXT_INITIAL, useEditorStore } from '@/builder/editor/store.ts';
import { EditorCanvas } from '@/builder/editor/EditorCanvas.tsx';
import { useTextUi } from '@/builder/editor/text/ui-store.ts';
import { BLOCKS } from '@/builder/registry.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';

function renderCanvas() {
  const router = createMemoryRouter([{ path: '/__builder/*', element: <EditorCanvas /> }], { initialEntries: ['/__builder/doc/shell'] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}
async function puckShown() {
  await vi.waitFor(() => expect(document.querySelector('[data-sf-builder-header]')).not.toBeNull());
  for (const el of document.querySelectorAll<HTMLElement>('.Puck')) el.style.visibility = 'visible';
}

describe('Text panel placement and block text', () => {
  beforeEach(() => {
    useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'shell', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null, ...TEXT_INITIAL });
    useTextUi.setState({ open: false, filter: 'all', query: '', focus: null });
    useEditorStore.getState().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    useEditorStore.getState().selectDoc('shell');
  });
  afterEach(cleanup);

  it('in a narrow frame the Text button opens the overlay; Escape closes it and focus returns', async () => {
    renderCanvas();
    await puckShown();
    const button = screen.getByRole('button', { name: 'Text' });
    fireEvent.click(button);
    const panel = await screen.findByRole('region', { name: 'Site text' });
    expect(panel.closest('[data-sfb-text-overlay]')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Site text' })).toBeNull();
    expect(button).toHaveFocus();
  });

  it('selecting a block with text patterns shows "Text in this block" under its fields', async () => {
    const header = defaultDoc('shell', 'storefront')!.content.find((b) => b.type === 'Header')!;
    expect(BLOCKS.Header!.text?.length ?? 0).toBeGreaterThan(0);
    renderCanvas();
    await puckShown();
    const el = document.querySelector(`[data-puck-component="${header.props.id}"]`) as HTMLElement;
    await act(async () => { fireEvent.click(el); });
    const section = await screen.findByRole('region', { name: 'Text in this block' });
    expect(section.querySelectorAll('[data-text-key]').length).toBeGreaterThan(0);
    if (section.querySelectorAll('[data-text-key]').length > 20) {
      expect(within(section).getByRole('searchbox', { name: 'Search this block’s text' })).toBeInTheDocument();
      expect(within(section).getByRole('button', { name: 'Open in Text panel' })).toBeInTheDocument();
    }
  });
});
```

(`BLOCKS.Header.text` is filled by Plan 2's migration of `Header`. If it is still empty when this task runs, wait for that Plan 2 task rather than editing the block file.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/builder-editor-text-placement.test.tsx`
Expected: FAIL — no region "Site text" after clicking Text.

- [ ] **Step 3: Implement `plugin.tsx`, `BlockText.tsx`, `TextOverlay.tsx`**

```tsx
// web/src/builder/editor/text/plugin.tsx
import { useEffect, useState } from 'react';
import type { Plugin } from '@puckeditor/core';
import { TextIcon } from '@/builder/editor/icons.tsx';
import { WIDE_FRAME_QUERY } from '@/builder/editor/panels.ts';
import { useTextUi } from '@/builder/editor/text/ui-store.ts';
import { TextPanel } from '@/builder/editor/text/TextPanel.tsx';

export function useWideFrame(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia?.(WIDE_FRAME_QUERY).matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.(WIDE_FRAME_QUERY);
    if (!query) return;
    const onChange = () => setWide(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return wide;
}

/**
 * Puck mounts every plugin tab's body all the time (hidden by CSS). The panel mounts only while it
 * is the open, wide-frame panel, so there is never a second, hidden copy (narrow frames use
 * TextOverlay instead).
 */
function TextPluginBody() {
  const open = useTextUi((s) => s.open);
  const wide = useWideFrame();
  return open && wide ? <TextPanel /> : <></>;
}

/**
 * The Text panel as a left-sidebar tab (spec §7.2): Blocks and Outline come back when it closes.
 * Labelled "Site text" so the rail item never shares a name with the header's "Text" button.
 */
export const TEXT_PLUGIN: Plugin = { name: 'text', label: 'Site text', icon: <TextIcon />, render: () => <TextPluginBody /> };
```

```tsx
// web/src/builder/editor/text/BlockText.tsx
import { useId, useMemo, useState, type ReactNode } from 'react';
import type { ItemSelector } from '@puckeditor/core';
import { useTemplateContext } from '@/templates/runtime.tsx';
import { usePuck } from '@/builder/editor/use-puck.ts';
import { blockTextRows, rowMatches } from '@/builder/editor/text/catalog.ts';
import { useTextUi } from '@/builder/editor/text/ui-store.ts';
import { TextRow } from '@/builder/editor/text/TextRow.tsx';
import styles from '@/builder/editor/text/Text.module.css';

export const BLOCK_TEXT_SEARCH_OVER = 20;

/** Puck `overrides.fields`: the block's own fields, then the text it shows (spec §7.3). */
export function FieldsWithText({ children }: { children: ReactNode; isLoading: boolean; itemSelector?: ItemSelector | null }) {
  const type = usePuck((s) => s.selectedItem?.type ?? null);
  const templateId = useTemplateContext().resolved?.templateId ?? 'modern';
  const rows = useMemo(() => (type ? blockTextRows(type, templateId) : []), [type, templateId]);
  return (
    <>
      {children}
      {rows.length > 0 && <BlockTextSection key={type} rows={rows} />}
    </>
  );
}

function BlockTextSection({ rows }: { rows: ReturnType<typeof blockTextRows> }) {
  const id = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const [query, setQuery] = useState('');
  const many = rows.length > BLOCK_TEXT_SEARCH_OVER;
  const shown = many ? rows.filter((r) => rowMatches(r, query)) : rows;
  return (
    <section className={`${styles.root} ${styles.blockText}`} data-sfb-text="" aria-labelledby={`${id}-t`}>
      <h3 id={`${id}-t`} className={styles.sectionTitle}>Text in this block</h3>
      {many && (
        <div className={styles.tools}>
          <input type="search" className={styles.search} aria-label="Search this block’s text" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button type="button" className={styles.reset} onClick={() => useTextUi.getState().show({ query })}>Open in Text panel</button>
        </div>
      )}
      {shown.map((r) => <TextRow key={r.key} row={r} compact />)}
    </section>
  );
}
```

```tsx
// web/src/builder/editor/text/TextOverlay.tsx
import { useEffect, useRef } from 'react';
import { TextPanel } from '@/builder/editor/text/TextPanel.tsx';
import styles from '@/builder/editor/text/Text.module.css';

/** Below WIDE_FRAME_PX the Text panel overlays the canvas instead of squeezing it (spec §7.2). */
export function TextOverlay({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input, select, button')?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div ref={box} className={styles.overlay} data-sfb-text-overlay="">
      <TextPanel onClose={onClose} />
    </div>
  );
}
```

Add to `Text.module.css`:

```css
.blockText { padding: 12px 0 0; border-block-start: 1px solid var(--sfb-line); }
.overlay {
  position: fixed;
  inset-block: 56px 0;
  inset-inline-start: 0;
  inline-size: min(360px, 100%);
  overflow: auto;
  z-index: 20;
  background: #ffffff;
  box-shadow: 0 12px 32px rgb(29 36 51 / 0.16), 0 2px 6px rgb(29 36 51 / 0.08);
}
```

(Set `inset-block-start` to the measured header height of `.bar`; 56 px is the starting value — check it against the rendered header at 768 px in Task 12's screenshot.)

- [ ] **Step 4: Wire the canvas and the header**

`EditorCanvas.tsx`: import `TEXT_PLUGIN` and `FieldsWithText`; extend `OVERRIDES` with `fields: FieldsWithText`; add a module constant `const PLUGINS = [TEXT_PLUGIN];` and pass `plugins={PLUGINS}` to `<Puck>`.

`EditorHeader.tsx` (`WIDE_FRAME_QUERY` is already imported there; `useWideFrame` now comes from `plugin.tsx`): add

```tsx
import { TextOverlay } from '@/builder/editor/text/TextOverlay.tsx';
import { useWideFrame } from '@/builder/editor/text/plugin.tsx';

/** Wide: the Text panel is Puck's `text` sidebar tab. Narrow: an overlay. Keeps the two in step. */
function useTextPanelPlacement(): { overlay: boolean } {
  const wide = useWideFrame();
  const open = useTextUi((s) => s.open);
  const dispatch = usePuck((s) => s.dispatch);
  const current = usePuck((s) => s.appState.ui.plugin?.current ?? null);
  const leftVisible = usePuck((s) => s.appState.ui.leftSideBarVisible);
  useEffect(() => {
    if (!wide) return;
    if (open && (current !== 'text' || !leftVisible)) {
      dispatch({ type: 'setUi', ui: { plugin: { current: 'text' }, leftSideBarVisible: true }, recordHistory: false });
    } else if (!open && current === 'text') {
      dispatch({ type: 'setUi', ui: { plugin: { current: 'blocks' } }, recordHistory: false });
    }
    // Only when the owner asks (open changes) or the width class flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, wide]);
  useEffect(() => {
    if (!wide) return;
    const ui = useTextUi.getState();
    const showing = current === 'text' && leftVisible;
    if (showing && !ui.open) ui.show();
    if (!showing && ui.open) ui.hide();
  }, [current, leftVisible, wide]);
  return { overlay: open && !wide };
}
```

In `EditorHeader`, call `const { overlay } = useTextPanelPlacement();`, give `TextButton` a ref (`forwardRef` not needed — keep a module `useRef` in `EditorHeader` and pass it as a `buttonRef` prop), and render after `</header>`… — the header returns one `<header>` today; return a fragment:

```tsx
  const textButton = useRef<HTMLButtonElement>(null);
  const closeOverlay = useCallback(() => { useTextUi.getState().hide(); textButton.current?.focus(); }, []);
  return (
    <>
      <header className={styles.bar} data-sf-builder-header="">
        {/* …groups as before, with <TextButton buttonRef={textButton} /> after <AddBlock /> */}
      </header>
      {overlay && <TextOverlay onClose={closeOverlay} />}
    </>
  );
```

and change `TextButton` to accept `{ buttonRef }: { buttonRef: RefObject<HTMLButtonElement | null> }` and put `ref={buttonRef}` on its button. Add `useCallback`, `type RefObject` to the React import and `WIDE_FRAME_QUERY` is already imported.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run test/builder-editor-text-placement.test.tsx`
Expected: PASS.

Run: `npx vitest run test/builder-editor`
Expected: PASS.

Run (from `ecommerce-storefront/`): `npm --prefix web run build`
Expected: build succeeds, including the builder-isolation check (`@puckeditor/core` is imported only from `web/src/builder/editor/text/plugin.tsx` and `BlockText.tsx`, both under `builder/editor/`).

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(builder): Text panel as a sidebar tab or overlay; Text in this block under a block's fields

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/editor/text/plugin.tsx web/src/builder/editor/text/BlockText.tsx web/src/builder/editor/text/TextOverlay.tsx web/src/builder/editor/text/Text.module.css web/src/builder/editor/EditorCanvas.tsx web/src/builder/editor/EditorHeader.tsx web/test/builder-editor-text-placement.test.tsx
```

---

### Task 12: Playwright pass and docs (owns Playwright)

**Depends on:** Tasks 1–11; Plan 2's migration of the storefront header search field (the key below); **Plan 2 Task 16 committed** (pre-flight: Playwright on port 5199 and `docs/builder.md` are shared with it — never run the two at once).

**Files:**
- Modify: `e2e/builder-editor.spec.ts`
- Modify: `docs/builder.md`

**Interfaces:**
- Consumes: everything above. The admin mirror in the spec file gains the new change fields.
- Key used: `catalog.search.placeholder` (spec §6.4), default `Search products`, rendered by the storefront `Header` in the default shell doc. Before writing the test, confirm the key's name and default in `web/src/text/keys/catalog.ts`; if Plan 2 named it differently, use Plan 2's name (report the difference in the task summary; do not rename Plan 2's key).

- [ ] **Step 1: Extend the admin mirror and message type**

In `e2e/builder-editor.spec.ts`:

```ts
const textIssueSchema = z.object({ scope: z.enum(['shared', 'layout']), key: z.string(), rule: z.string(), message: z.string() });
const siteTextSchema = z.looseObject({
  schemaVersion: z.literal(1),
  language: z.looseObject({ locale: z.string(), formatLocale: z.string() }),
  strings: z.record(z.string(), z.record(z.string(), z.unknown())),
});
```

and in the `sf-builder-change` member of `adminInbound` add `siteText: siteTextSchema.optional(), textIssues: z.array(textIssueSchema).max(500),`. Extend `type Msg` with `siteText?: { strings: Record<string, Record<string, unknown>> }; textIssues?: Array<{ scope: string; key: string; rule: string }>;` and `PageSetMsg` with `text?: { strings: Record<string, Record<string, unknown>> }`.

- [ ] **Step 2: Write the failing e2e tests**

```ts
test.describe('page builder editor · text', () => {
  const KEY = 'catalog.search.placeholder';
  const DEFAULT = 'Search products';
  const canvasSearch = (frame: FrameLocator, placeholder: string) =>
    frame.locator(`[data-sf-builder-canvas] input[placeholder="${placeholder}"]`).first();

  async function openText(frame: FrameLocator) {
    await frame.getByLabel('Page', { exact: true }).selectOption('shell');
    await expect(canvasSearch(frame, DEFAULT)).toBeVisible();
    await frame.getByRole('button', { name: 'Text', exact: true }).click();
    const panel = frame.getByRole('region', { name: 'Site text' });
    await panel.getByRole('searchbox', { name: 'Search text' }).fill(KEY);
    return panel.locator(`[data-text-key="${KEY}"]`);
  }

  test('a shared edit re-renders the canvas at once and goes out as siteText', async ({ page }) => {
    const { frame } = await openFramed(page);
    const msg = load({ siteText: null });
    await loadAndWait(page, frame, msg);
    const baseline = (await changesFor(page, msg.loadId))[0]!;
    expect(baseline.siteText).toEqual({ schemaVersion: 1, language: { locale: 'en', formatLocale: '' }, strings: {} });
    expect(baseline.textIssues).toEqual([]);
    const row = await openText(frame);
    await row.getByRole('textbox').fill('Find a Northbound product');
    await expect(canvasSearch(frame, 'Find a Northbound product')).toBeVisible();
    await expect.poll(async () => (await changesFor(page, msg.loadId)).at(-1)?.siteText?.strings.en?.[KEY]).toBe('Find a Northbound product');
    await expectAdminAccepts(page);
  });

  test('an override for this layout goes into pageSet.text and leaves shared text alone', async ({ page }) => {
    const { frame } = await openFramed(page);
    const msg = load({ siteText: null });
    await loadAndWait(page, frame, msg);
    const row = await openText(frame);
    await row.getByRole('button', { name: 'Only Storefront' }).click();
    await row.getByRole('textbox').fill('Search the storefront');
    await expect(canvasSearch(frame, 'Search the storefront')).toBeVisible();
    await expect.poll(async () => (await changesFor(page, msg.loadId)).at(-1)?.pageSet?.text?.strings.en?.[KEY]).toBe('Search the storefront');
    expect((await changesFor(page, msg.loadId)).at(-1)?.siteText?.strings).toEqual({});
    await expectAdminAccepts(page);
  });

  test('an unknown placeholder is a blocking issue and the canvas keeps the built-in wording', async ({ page }) => {
    const { frame } = await openFramed(page);
    const msg = load({ siteText: null });
    await loadAndWait(page, frame, msg);
    const row = await openText(frame);
    await row.getByRole('textbox').fill('Search {nope}');
    await expect(row.getByText(/\{nope\} isn’t available/)).toBeVisible();
    await expect(frame.getByRole('button', { name: /^Issues/ })).toContainText('1 issue');
    await expect(canvasSearch(frame, DEFAULT)).toBeVisible();
    await expect.poll(async () => (await changesFor(page, msg.loadId)).at(-1)?.textIssues).toEqual([
      expect.objectContaining({ scope: 'shared', key: KEY, rule: 'unknown-placeholder' }),
    ]);
    await expectAdminAccepts(page);
  });

  test('an older admin (no siteText): shared text is read-only and never posted', async ({ page }) => {
    const { frame } = await openFramed(page);
    const msg = load();
    await loadAndWait(page, frame, msg);
    const row = await openText(frame);
    await expect(row.getByRole('button', { name: 'All layouts' })).toBeDisabled();
    await row.getByRole('textbox').fill('Only on this layout');
    await expect.poll(async () => (await changesFor(page, msg.loadId)).at(-1)?.pageSet?.text?.strings.en?.[KEY]).toBe('Only on this layout');
    expect((await changesFor(page, msg.loadId)).every((m) => !('siteText' in m))).toBe(true);
    await expectAdminAccepts(page);
  });

  test('overrides that arrive with the page set leave in the baseline unchanged', async ({ page }) => {
    const { frame } = await openFramed(page);
    const text = { strings: { en: { [KEY]: 'Kept wording' }, de: { [KEY]: 'Behalten' } } };
    const msg = load({ pageSet: { ...checkoutWithoutFlowSet, text }, siteText: null });
    await loadAndWait(page, frame, msg);
    expect((await changesFor(page, msg.loadId))[0]!.pageSet!.text).toEqual(text);
  });
});
```

(If `checkoutWithoutFlowSet` is not a full `PageSet` value, build the set from the spec file's existing helpers the same way the "issues and chrome" describe does.)

- [ ] **Step 3: Run the new tests to see them pass (the feature is already built)**

Run (from `ecommerce-storefront/`): `npm run test:e2e -- builder-editor.spec.ts -g "text"`
Expected: PASS. A failure here is a real integration bug in Tasks 5–11 — fix it in the owning file and note which task's code changed.

- [ ] **Step 4: Run the whole gate**

Run (from `ecommerce-storefront/`): `npm --prefix web test`, then `npm --prefix web run build`, then `npm run test:e2e`.
Expected: all PASS, `dom-parity.spec.ts` and the templates matrix included, **no snapshot regenerated**. If `dom-parity` fails, the cause is in Plan 2's defaults, not here — report it, do not regenerate.

- [ ] **Step 5: Update `docs/builder.md`**

In "### Protocol (spec §13 A6)" replace the load and change rows:

```md
| admin → storefront | `sf-builder-load { protocol: 1, loadId, layout, pageSet \| null, theme, readOnly, siteText? }` — `pageSet.text` = this layout's text overrides; `siteText` absent = the admin can't save shared text (overrides only, shared read-only), `null` = none stored yet |
| storefront → admin | `sf-builder-change { loadId, pageSet, issues, siteText?, textIssues }` (500 ms debounce, flushed at once when the frame blurs, is hidden or unloads; never when read-only). `pageSet.text` carries overrides; `siteText` (the full shared doc) is present iff the load carried it; `textIssues` lists blocking text problems `{ scope, key, rule, message }` |
```

and add, after "### Fields", a new section:

```md
### Text

Every shopper-facing line is edited from the **Text** button (spec 2026-09-30 editable text §7).
On a wide frame the Text panel is a left-sidebar tab (Blocks and Outline come back when it
closes); below 1024 px it overlays the canvas. It has the store language and "Numbers and
dates" at the top (editing the shared draft), search, filters (All / Edited / This layout /
Issues), one group per area with Site-wide first, and an Unused group for saved wording this
release no longer shows. Each row edits one key at a scope — **All layouts** (shared Site text)
or **Only {layout}** (this layout's override) — with the built-in default, the layer the canvas
currently shows, placeholder chips, a length count and Reset; clearing the box resets. Plural
keys get one box per plural category of the store language, with a live example.

Selecting a block shows **Text in this block** under its fields (from the block's `text`
patterns). The canvas re-resolves on every keystroke; only posting is debounced. Text edits share
Undo/Redo with block edits (`editor/text/history.ts` anchors each text step to Puck's history
entry). Ctrl/⌘+Z in a Text field undoes text, never a hidden block.

A value the backend would refuse (a half-typed `{`, a plural without "other") stays on screen
with a blocking issue but is left out of the posted change, so an autosave never fails on it.
Issues show on the row and under "Text" in the header's issue list, and block Publish. Without
`siteText` in the load (an older admin), "All layouts" is disabled and shared wording is read
from the public page-set read.
```

- [ ] **Step 6: Commit**

```bash
git commit -m "test(builder): e2e for editor text (shared, override, issue, old admin, transit); docs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- e2e/builder-editor.spec.ts docs/builder.md
```

---

## Self-review

- **Spec coverage.** §7.1 protocol → Tasks 5, 7, 12. §7.2 Text panel: placement → 11; language + counter → 9; search/filters/groups/templates filter → 2, 9; row (label, note, default, effective + layer, scope switch, textarea over 60, chips, count, Reset, clear = reset, plural categories + example) → 2, 3, 9; issues inline + header "Text" section + block Publish → 6, 7, 10; Unused group with delete → 6, 9. §7.3 → 2, 11 (Site-wide group → 2). §7.4 store + `toPageSet` + shared undo → 4, 7, 10. §10 editor Vitest items (protocol keeps `pageSet.text`, `siteText` present/absent/null, change carries `siteText`/`textIssues`, row validation and scope writes) → 5, 7, 9; §10 `builder-editor.spec.ts` items → 12. "Exact previews and fixture mode show the edited text too" → Task 8 (`ExactRuntime`).
- **Not in this plan (other plans):** `BlockDef.text`/`textProps`, the per-block patterns and `SITE_WIDE_TEXT` (Plan 2), `e2e/text.spec.ts` and `e2e/mocks.ts` `text` option (Plan 2), backend and admin.
- **Known limitation (documented, not built):** no editor check for the 256 KB Site text cap; a doc that large 400s the text autosave in the admin, which reports it.

## Cross-plan contract assumptions

- `@/text/types.ts` exports `Locale, PluralForms, TextValue, LocaleStrings, TextLanguage, SiteText, PageText, TEXT_LIMITS` exactly as spec §3/§4.3 (TEXT_LIMITS has `value: 1000` and `placeholders: 10`), **and** `EditorText = { locale: Locale; formatLocale: '' | Locale; shared: LocaleStrings; layout: LocaleStrings }` (the name spec §5 uses without a shape).
- `@/text/registry.ts` exports `TEXT` as a record keyed by full key whose entries keep the `defineTextArea` fields `{ en, note?, label?, max?, fixed? }` (max absent = 200), plus `type TextKey`.
- `@/text/resolve.ts` exports `checkValue(key: string, value: unknown): TextCheck` = `{ ok: true } | { ok: false; rule: TextRule; message: string }` with the spec §6.3 rule ids (`unknown-key` for unregistered keys, checked before `fixed` for stored values of fixed keys) and `type TextRule` — **reconciled to Plan 2's shape**; `issues.ts` maps it to `TextRule | null` locally.
- `@/text/plural.ts` exports `pluralCategory(locale, n): PluralCategory` and `categoriesFor(locale): PluralCategory[]` (`other` last) — assignable to the `string` / `readonly string[]` this plan reads.
- `@/text/site-wide.ts` (**reconciled** from `coverage.ts`) exports `SITE_WIDE_TEXT: readonly TextKeyPattern[]` (the §7.3 Site-wide group's key patterns; provisional from Plan 2 Task 5, final in Task 15), and `BlockDef` (`@/builder/define.ts`) gains `text?: readonly TextKeyPattern[]` (exact keys or `area.part.*`), both owned and populated by Plan 2 (its §6.6 registry test needs them). Plan 3 only reads them.
- Template keys: `templates.default.*` (built-in slots) plus `templates.<activeTemplateId>.*` are shown (Plan 2's convention; reconciled in `isForTemplate`).
- `PageSetOverrideProvider({ pageSet, text?, children })` (`@/builder/runtime.tsx`): when `text` is given, every `useText()` below it resolves from that `EditorText` (layout → shared → default via `checkValue`), whatever `pageSet` is.
- `@/api/pages.ts` exports `fetchPublished(layout): Promise<{ pageSet: PageSet | null; text: PublishedText | null }>` with `PublishedText = { version, locale, formatLocale, shared, layout }` (spec §4.6/§5).
- `PageSet` (`@/builder/types.ts`) has `text?: PageText` (spec §3).
- Protocol field names are the spec's: `siteText`, `pageSet.text`, `textIssues` with `{ scope: 'shared' | 'layout', key, rule, message }`; `textIssues` is present on every change the session posts. For the admin plan: a plural missing `other` is reported as rule `empty`; values the backend would refuse are never in the posted `siteText` / `pageSet.text`.
- The header search field's key is `catalog.search.placeholder` (spec §6.4), rendered by the default storefront shell's `Header`.

## Reconciled contracts (pre-flight)

Checked against Plans 1, 2 and 4. Changes made to this plan (Plan 2 produces the storefront TS exports, so its names win):

- **`SITE_WIDE_TEXT`** is imported from `@/text/site-wide.ts` (was `@/text/coverage.ts`) — Task 2 depends/consumes lines and `catalog.ts` import. Plan 2 now creates it in its Task 5, inside the core wave.
- **`checkValue`** returns Plan 2's `TextCheck` (`{ ok: true } | { ok: false; rule; message }`), not `TextRule | null`. Task 6's `issues.ts` gains a local `checkedRule()` used by `ruleFor` and `unusedEntries`; the tests are unchanged.
- **Template filter** — `isForTemplate` also admits `templates.default.*` (Plan 2's built-in slots, rendered by every template without its own slot; without this the default template's slot copy could never be edited). Task 2 test gains two assertions.
- **Core wave** = Plan 2 Tasks 1–5 (incl. provisional `site-wide.ts` and a fixed seed `closed.eyebrow`, which `helpers/text-keys.ts` `fixedKey()` needs).
- **Task 12** runs after Plan 2 Task 16 (both use Playwright on port 5199 and edit `docs/builder.md`).
- Unchanged and confirmed: protocol fields and the admin's parser (Plan 4 Task 2) agree — `siteText` absent/null/doc on load, `siteText` only when present and never `null` on change, `textIssues` always sent, `{ scope, key, rule, message }`, ≤ 500; `fetchPublished`, `EditorText`, `PageSetOverrideProvider` `text` prop, plural helpers.
