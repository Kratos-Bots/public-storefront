# Block styling — storefront (stage 2 of "everything editable") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every block gets an optional, typed, token-only `blockStyle` prop — validated by the storefront guard, rendered as `data-sf-style` / `data-sfs-*` attributes against one generated static stylesheet, edited from a collapsible **Style** group in the block's sidebar — with zero DOM change for unstyled blocks.

**Architecture:** A runtime-safe `web/src/builder/style/` module owns the value model (`model.ts`), row labels (`labels.ts`), the stylesheet generator (`css.ts` → checked-in `block-style.css`) and the one render helper (`apply.tsx`: `styleAttrs` + `renderBlock`). `define.ts` gains `BlockDef.style` (optional during the build-out, required in Task 12) and parses `blockStyle` beside the schema; `guard.ts` reports style issues as `field:` issues; `rules.ts` gains `hidden-required:<Block>`. Every block declares its target (`root` / `wrap` / `pass`) and allowed keys. The editor appends a `blockStyle` custom field after every stylable block's fields and normalises the prop in `prepare.ts`.

**Tech Stack:** React 19, TypeScript 5.9, zod 4, Vite, Vitest + Testing Library (jsdom), Playwright (mocked backend, port 5199), `@puckeditor/core` 0.23.0 (editor only).

**Spec:** `docs/superpowers/specs/2026-09-30-block-styling-design.md` (binding), with `docs/superpowers/specs/2026-09-30-puck-editable-overview.md`. Read §3–§12 of the block-styling spec before starting any task. Stage 1 (editable text) is already on the branch: read `docs/builder.md` → "Text layer".

## Global Constraints

- Work only in the `ecommerce-storefront/` worktree on `feature/puck-editable`. Never push, merge, or touch another checkout. The repo is **public**: fixtures and docs use "Northbound Supply" / `shop.example`; no local paths, usernames, client names or credentials.
- House rules (`.superpowers/sdd/house-rules.md`) apply: TDD (failing test first), commit **by explicit pathspec only** (`git add -- <paths>` then `git commit -m … -- <paths>`), never `git add -A` / `git stash` / reset others' files; every commit message ends with the two trailer lines:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4`.
- Any task touching React components or CSS loads the `frontend-design:frontend-design` skill first.
- Imports are `@/…` with `.ts` / `.tsx` extensions. `@puckeditor/core` **value** imports only under `web/src/builder/editor/**`; everything under `web/src/builder/style/` is runtime-safe (shopper bundle).
- Stored style values are **enum keys only** (palette token names, scale steps) — no hex, no lengths, no free strings. Absent key = template default; there is no stored `inherit`. Nothing ever *emits* `blockStyle: {}` — an empty result removes the key.
- Rendering is **attribute-only**: `data-sf-style="<BlockName>"` plus `data-sfs-<bg|fg|pt|pb|px|mt|mb|border|bc|bs|radius|shadow|text|align|max|hide|ghost>="<value>"`. No inline `style`, no `className` changes, no per-block CSS variables written by the renderer.
- **Parity:** with no `blockStyle` anywhere the DOM is byte-identical to today. `e2e/dom-parity.spec.ts` and `e2e/templates-baseline*.spec.ts` must pass **without regenerating any snapshot** (never pass `--update-snapshots`).
- Every generated stylesheet selector has specificity exactly **(0,4,0)**; the sheet has no `transition` / `animation`.
- Breakpoints: `hide` at **62em** (`max-width: 61.99em` / `min-width: 62em`, as `.sf-hide-mobile` / `.sf-hide-desktop` in `web/src/styles/global.css`); automatic phone caps below **48em** (`max-width: 47.99em`).
- Template mobile rules: 44×44 tap targets, no horizontal overflow at 360 px, 16 px inputs (no `textSize` on any block containing an input), `prefers-reduced-motion`.
- Shop CSS colours only via `--sf-*` tokens; editor UI colours via the neutral `--sfb-*` tokens (as `custom-fields/fields.module.css` / `EditorBlock.module.css`).
- **Allowlists only grow**: a key, once offered by a block, is never removed.
- `STYLE_KEYS` (storefront) must equal the backend's `BLOCK_STYLE_VALUES` exactly (keys, order, values) — the backend plan owns the mirror.
- No protocol change (`protocol: 1`), no admin change, no DB migration, no stored-document migration.
- Web tests: `npm --prefix web test -- <files>` from the storefront root. Typecheck: `npm --prefix web run typecheck` (includes `web/test`). Never run `npm run install:web`; use `npm ci` inside `web/` if dependencies are missing.
- If a sibling task's file breaks typecheck/tests, wait a minute and re-run; never edit it. Blocked → report BLOCKED / NEEDS_CONTEXT.

## Review Focus

1. **Hostile / odd stored keys** — `__proto__`, `constructor`, `toString`, arrays, numbers, `null` values, or `undefined` values inside a stored `blockStyle` → silently dropped (unknown key) or reported (known key, bad value); never prototype pollution, never a thrown guard. Test: Task 1 Step 1 (`parseBlockStyle` hostile-input cases).
2. **A styled block whose own render returns nothing** (a blank Heading, a Button with no safe link, a Video with a bad id) → no marker and no empty padded box on the shop. Tests: Task 4 Step 1 (Heading), Task 5 Step 1 (Button, Video).
3. **Colours the contrast hint can't parse** (`oklch()`, `color-mix()`, translucent `rgba`, an unset custom property resolving to `""`) → no hint at all; never "NaN : 1". Test: Task 10 Step 1 (`parseCssColor` cases) and Step 1's component case.
4. **Puck leaving `blockStyle: undefined` or `{}` in its state** after Reset or after clearing the last key → the emitted document has no `blockStyle` key, and an already-clean props object keeps its identity (no spurious change posted). Test: Task 11 Step 1.
5. **A styled wrap block that renders nothing on the editor canvas** (a styled `Upsells` with nothing curated) → the canvas still shows the "has nothing to show yet" placeholder so the block stays selectable (the stylesheet's `:empty` rule would otherwise make it invisible). Test: Task 3 Step 1 (EditorBlock case).

---

## File Structure

**Create**
- `web/src/builder/style/model.ts` — `STYLE_KEYS`, `STYLE_TOKENS`, `STYLE_SPACE`, key groups `BOX`/`TEXT`/`VIS`, `StyleKey`, `BlockStyle`, `StyleTarget`, `StyleSupport`, `styleSupport()`, `STYLE_ATTR`, `isStyleKey`, `isStyleValue`, `parseBlockStyle`. No imports.
- `web/src/builder/style/labels.ts` — `STYLE_LABELS` (editor row labels; used by guard messages and the Style panel).
- `web/src/builder/style/css.ts` — `renderBlockStyleCss()`.
- `web/src/builder/style/block-style.css` — generated, checked in.
- `web/src/builder/style/apply.tsx` — `styleAttrs`, `renderBlock`.
- `web/src/builder/editor/custom-fields/style-model.ts` — pure editor helpers (groups, options, `setStyleKey`, contrast maths).
- `web/src/builder/editor/custom-fields/style.tsx` — `styleField(def)` and the Style panel.
- `web/src/builder/editor/custom-fields/style.module.css` — Style panel CSS.
- `web/src/builder/editor/style-ghost.css` — canvas ghost for hidden blocks.
- Tests: `web/test/builder-style.test.ts`, `web/test/block-style-css.test.ts`, `web/test/builder-style-content-text.test.tsx`, `web/test/builder-style-content-media.test.tsx`, `web/test/builder-style-wrap.test.tsx`, `web/test/builder-editor-style-field.test.tsx`, `web/test/builder-editor-style-prepare.test.ts`, `web/test/builder-style-contract.test.tsx`, `e2e/block-style.spec.ts`.

**Modify**
- `web/src/builder/define.ts` (types, `parseBlockPropsDetailed`), `guard.ts` (messages), `render.tsx` and `editor/EditorBlock.tsx` (`renderBlock`), `rules.ts` (`hidden-required`), `blocks-manifest.ts`, `web/public/blocks.json`, `web/src/main.tsx` (stylesheet import).
- All 45 `web/src/builder/blocks/*.tsx`; `_shared/RichHtml.tsx`; module CSS of Heading, RichText, Testimonial, FAQ, NavLinks.
- `web/src/layouts/StorefrontShell.tsx`, `MenuShell.tsx`, `WebAppShell.tsx` (header `styleAttrs`).
- `web/src/builder/editor/prepare.ts`, `editor/derive-fields.ts`.
- Tests: `builder-guard.test.ts`, `builder-render.test.tsx`, `builder-rules.test.ts`, `builder-shell.test.tsx`, `builder-catalogue-extras.test.tsx`, `builder-editor-fields.test.ts`, `blocks-manifest.test.ts`, test mocks in `builder-define`, `builder-registry`, `builder-runtime`, `builder-shell-fallback` tests, `text-guard.allow.ts`.
- Docs: `docs/builder.md`, `docs/templates.md`.
- e2e: `e2e/page-sets.ts`, `e2e/builder-editor.spec.ts`.

## Waves (parallel execution)

| Wave | Tasks (disjoint files within a wave) | Depends on |
|---|---|---|
| 1 | Task 1 (model + labels) | — |
| 2 | Task 2 (stylesheet) ‖ Task 3 (define/guard/apply/render) | 1 |
| 3 | Task 4 (content text blocks) ‖ Task 5 (content media blocks) ‖ Task 6 (catalogue blocks) ‖ Task 7 (wrap + route blocks) ‖ Task 8 (Header + non-stylable) ‖ Task 9 (`hidden-required`) ‖ Task 10 (Style panel UI) | 3 (Task 10 also 1) |
| 4 | Task 11 (editor wiring) ‖ Task 12 (contract flip, manifest, parity, docs) | 11 ← 10; 12 ← 2, 4–9 |
| 5 | Task 13 (e2e + full verification) — **the only Playwright owner** | all |

No task before Task 13 runs Playwright.

---

### Task 1: Style value model and labels

**Depends on:** none. **Wave 1.**

**Files:**
- Create: `web/src/builder/style/model.ts`
- Create: `web/src/builder/style/labels.ts`
- Create: `web/test/builder-style.test.ts`
- Modify: `web/test/text-guard.allow.ts` (one entry)

**Interfaces:**
- Consumes: nothing (model.ts imports nothing — `define.ts` will import it, so it must not import `define.ts`).
- Produces (exact names, used by every later task):
  - `STYLE_TOKENS: readonly ['bg','bg-deep','surface','surface-2','surface-3','line','line-strong','text','muted','faint','primary','primary-soft','success','warn','danger']`
  - `STYLE_SPACE: readonly ['none','xs','sm','md','lg','xl']`
  - `STYLE_KEYS` (spec §3.1, that key order), `type StyleKey`, `type BlockStyle`, `STYLE_KEY_ORDER: StyleKey[]`
  - `BOX`, `TEXT`, `VIS` (readonly `StyleKey[]` groups, spec §4)
  - `type StyleTarget = 'root' | 'wrap' | 'pass'`, `interface StyleSupport { target: StyleTarget; keys: readonly StyleKey[] }`
  - `styleSupport(target, include, exclude = []): StyleSupport` — keys in canonical order
  - `STYLE_ATTR: Record<StyleKey, string>` (attribute suffixes)
  - `isStyleKey(k: string): k is StyleKey`, `isStyleValue(key: StyleKey, v: unknown): boolean`
  - `interface ParsedStyle { style?: BlockStyle; issues: string[] }`, `parseBlockStyle(support: StyleSupport | false, raw: unknown): ParsedStyle` — issues are `'blockStyle'` or `` `blockStyle.${key}` ``
  - `STYLE_LABELS: Record<StyleKey, string>` (labels.ts)

- [ ] **Step 1: Write the failing test**

Create `web/test/builder-style.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PALETTE_TOKENS, SPACING } from '@/builder/define.ts';
import {
  BOX, parseBlockStyle, STYLE_ATTR, STYLE_KEY_ORDER, STYLE_KEYS, STYLE_SPACE, STYLE_TOKENS, styleSupport, TEXT, VIS,
  type StyleSupport,
} from '@/builder/style/model.ts';
import { STYLE_LABELS } from '@/builder/style/labels.ts';

const ALL: StyleSupport = styleSupport('root', [...BOX, ...TEXT, ...VIS]);
const HEADING: StyleSupport = styleSupport('root', [...BOX, 'fg', 'textSize', ...VIS]);

describe('style model', () => {
  it('has the spec §3.1 keys in canonical order, 16 of them', () => {
    expect(STYLE_KEY_ORDER).toEqual(['bg', 'fg', 'padTop', 'padBottom', 'padX', 'marginTop', 'marginBottom', 'border',
      'borderColor', 'borderStyle', 'radius', 'shadow', 'textSize', 'align', 'maxWidth', 'hide']);
    expect(Object.keys(STYLE_KEYS)).toEqual(STYLE_KEY_ORDER);
  });
  it('colour tokens are the palette without none; spacing steps are SPACING keys', () => {
    expect([...STYLE_TOKENS]).toEqual(PALETTE_TOKENS.filter((t) => t !== 'none'));
    expect([...STYLE_SPACE]).toEqual(Object.keys(SPACING));
  });
  it('groups cover every key exactly once', () => {
    expect([...BOX, ...TEXT, ...VIS].sort()).toEqual([...STYLE_KEY_ORDER].sort());
    expect(new Set([...BOX, ...TEXT, ...VIS]).size).toBe(16);
  });
  it('styleSupport keeps canonical order and applies exclusions', () => {
    expect(styleSupport('wrap', ['hide', 'bg', 'padTop'])).toEqual({ target: 'wrap', keys: ['bg', 'padTop', 'hide'] });
    expect(styleSupport('root', [...BOX], ['bg', 'maxWidth']).keys).not.toContain('bg');
  });
  it('every key has an attribute suffix and a label', () => {
    for (const k of STYLE_KEY_ORDER) {
      expect(STYLE_ATTR[k]).toMatch(/^[a-z]+$/);
      expect(STYLE_LABELS[k].length).toBeGreaterThan(0);
    }
    expect(STYLE_ATTR).toMatchObject({ padTop: 'pt', padBottom: 'pb', padX: 'px', marginTop: 'mt', marginBottom: 'mb', borderColor: 'bc', borderStyle: 'bs', textSize: 'text', maxWidth: 'max' });
  });
});

describe('parseBlockStyle (spec §10.1)', () => {
  it('absent → nothing, no issue', () => {
    expect(parseBlockStyle(ALL, undefined)).toEqual({ issues: [] });
  });
  it.each([null, 'surface', 3, true, [], [{ bg: 'surface' }]])('not a plain object (%j) → issue on blockStyle', (raw) => {
    expect(parseBlockStyle(ALL, raw)).toEqual({ issues: ['blockStyle'] });
  });
  it('unknown keys are dropped silently', () => {
    expect(parseBlockStyle(ALL, { bg: 'surface', glow: 'lots' })).toEqual({ style: { bg: 'surface' }, issues: [] });
  });
  it('a key the block does not accept is dropped with an issue', () => {
    expect(parseBlockStyle(HEADING, { align: 'center', bg: 'surface' })).toEqual({ style: { bg: 'surface' }, issues: ['blockStyle.align'] });
  });
  it('an invalid value is dropped with an issue', () => {
    expect(parseBlockStyle(ALL, { bg: '#ff0000', padTop: 'inherit', radius: 'card' })).toEqual({ style: { radius: 'card' }, issues: ['blockStyle.bg', 'blockStyle.padTop'] });
  });
  it('nothing left → no blockStyle; {} → no blockStyle and no issue', () => {
    expect(parseBlockStyle(HEADING, { align: 'end' })).toEqual({ issues: ['blockStyle.align'] });
    expect(parseBlockStyle(ALL, {})).toEqual({ issues: [] });
  });
  it('support false: every known key is an issue', () => {
    expect(parseBlockStyle(false, { bg: 'surface', hide: 'mobile', other: 'x' })).toEqual({ issues: ['blockStyle.bg', 'blockStyle.hide'] });
  });
  it('writes keys in canonical order', () => {
    const { style } = parseBlockStyle(ALL, { hide: 'mobile', radius: 'card', bg: 'surface-2', padTop: 'lg' });
    expect(Object.keys(style!)).toEqual(['bg', 'padTop', 'radius', 'hide']);
  });
  it('treats an undefined value as absent', () => {
    expect(parseBlockStyle(ALL, { bg: undefined, fg: 'text' })).toEqual({ style: { fg: 'text' }, issues: [] });
  });
  // Review Focus 1: hostile input never pollutes or throws.
  it('ignores __proto__ / constructor / toString keys and non-string values', () => {
    const raw = JSON.parse('{"__proto__":{"polluted":"yes"},"constructor":"x","toString":"y","bg":"surface","padTop":2,"radius":null,"shadow":["card"]}');
    const out = parseBlockStyle(ALL, raw);
    expect(out).toEqual({ style: { bg: 'surface' }, issues: ['blockStyle.padTop', 'blockStyle.radius', 'blockStyle.shadow'] });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(out.style)).toBe(Object.prototype);
  });
  it('accepts a null-prototype object', () => {
    const raw = Object.assign(Object.create(null) as Record<string, unknown>, { bg: 'surface' });
    expect(parseBlockStyle(ALL, raw)).toEqual({ style: { bg: 'surface' }, issues: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web test -- test/builder-style.test.ts`
Expected: FAIL — cannot resolve `@/builder/style/model.ts`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/builder/style/model.ts`:

```ts
/**
 * Block styling (spec 2026-09-30-block-styling §3): the stored `blockStyle` prop. Runtime-safe and
 * import-free — define.ts imports this module, so it must never import define.ts back.
 * Mirrored by the backend's BLOCK_STYLE_VALUES (storefront-pages/schemas.ts): change both, backend first.
 */

/** PALETTE_TOKENS without 'none' (a test pins the equality). */
export const STYLE_TOKENS = ['bg', 'bg-deep', 'surface', 'surface-2', 'surface-3', 'line', 'line-strong',
  'text', 'muted', 'faint', 'primary', 'primary-soft', 'success', 'warn', 'danger'] as const;
/** = keys of define.ts SPACING (a test pins the equality). */
export const STYLE_SPACE = ['none', 'xs', 'sm', 'md', 'lg', 'xl'] as const;

export const STYLE_KEYS = {
  bg: STYLE_TOKENS,
  fg: STYLE_TOKENS,
  padTop: STYLE_SPACE,
  padBottom: STYLE_SPACE,
  padX: STYLE_SPACE,
  marginTop: STYLE_SPACE,
  marginBottom: STYLE_SPACE,
  border: ['thin', 'medium', 'thick'],
  borderColor: STYLE_TOKENS,
  borderStyle: ['solid', 'dashed', 'dotted'],
  radius: ['none', 'sm', 'md', 'lg', 'card', 'pill'],
  shadow: ['card', 'raised'],
  textSize: ['sm', 'lg', 'xl'],
  align: ['start', 'center', 'end'],
  maxWidth: ['narrow', 'text', 'wide'],
  hide: ['mobile', 'desktop'],
} as const;

export type StyleKey = keyof typeof STYLE_KEYS;
export type BlockStyle = { [K in StyleKey]?: (typeof STYLE_KEYS)[K][number] };
/** Canonical key order: the guard and the editor write keys in this order so diffs stay quiet. */
export const STYLE_KEY_ORDER = Object.keys(STYLE_KEYS) as StyleKey[];

export const BOX: readonly StyleKey[] = ['bg', 'padTop', 'padBottom', 'padX', 'marginTop', 'marginBottom', 'border',
  'borderColor', 'borderStyle', 'radius', 'shadow', 'maxWidth'];
export const TEXT: readonly StyleKey[] = ['fg', 'textSize', 'align'];
export const VIS: readonly StyleKey[] = ['hide'];

/** Where a block's style attributes land (spec §4/§5.1). */
export type StyleTarget = 'root' | 'wrap' | 'pass';
export interface StyleSupport { target: StyleTarget; keys: readonly StyleKey[] }

export function styleSupport(target: StyleTarget, include: readonly StyleKey[], exclude: readonly StyleKey[] = []): StyleSupport {
  return { target, keys: STYLE_KEY_ORDER.filter((k) => include.includes(k) && !exclude.includes(k)) };
}

/** `data-sfs-<suffix>`; `hide` becomes `data-sfs-ghost` on the editor canvas (apply.tsx). */
export const STYLE_ATTR: Record<StyleKey, string> = {
  bg: 'bg', fg: 'fg', padTop: 'pt', padBottom: 'pb', padX: 'px', marginTop: 'mt', marginBottom: 'mb', border: 'border',
  borderColor: 'bc', borderStyle: 'bs', radius: 'radius', shadow: 'shadow', textSize: 'text', align: 'align', maxWidth: 'max', hide: 'hide',
};

export const isStyleKey = (k: string): k is StyleKey => Object.hasOwn(STYLE_KEYS, k);

export function isStyleValue(key: StyleKey, v: unknown): boolean {
  return typeof v === 'string' && (STYLE_KEYS[key] as readonly string[]).includes(v);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

export interface ParsedStyle { style?: BlockStyle; issues: string[] }

/**
 * Spec §10.1. Unknown keys drop silently (forward compatibility); a known key the block doesn't
 * accept, or a value outside the key's list, drops with an issue (`blockStyle.<key>`); a non-object
 * is one issue (`blockStyle`). Nothing left ⇒ no `style`. Output keys are in canonical order.
 */
export function parseBlockStyle(support: StyleSupport | false, raw: unknown): ParsedStyle {
  if (raw === undefined) return { issues: [] };
  if (!isPlainObject(raw)) return { issues: ['blockStyle'] };
  const allowed = support ? support.keys : [];
  const out: Record<string, string> = {};
  const issues: string[] = [];
  for (const key of STYLE_KEY_ORDER) {
    if (!Object.hasOwn(raw, key)) continue;
    const value = raw[key];
    if (value === undefined) continue;
    if (!allowed.includes(key) || !isStyleValue(key, value)) {
      issues.push(`blockStyle.${key}`);
      continue;
    }
    out[key] = value as string;
  }
  return Object.keys(out).length > 0 ? { style: out as BlockStyle, issues } : { issues };
}
```

Create `web/src/builder/style/labels.ts`:

```ts
import type { StyleKey } from '@/builder/style/model.ts';

/** Editor row labels for the Style group; also named in the guard's issue messages. Editor UI, not shop text. */
export const STYLE_LABELS: Record<StyleKey, string> = {
  bg: 'Background',
  fg: 'Text colour',
  padTop: 'Padding top',
  padBottom: 'Padding bottom',
  padX: 'Padding sides',
  marginTop: 'Space above',
  marginBottom: 'Space below',
  border: 'Border width',
  borderColor: 'Border colour',
  borderStyle: 'Border style',
  radius: 'Corners',
  shadow: 'Shadow',
  textSize: 'Text size',
  align: 'Alignment',
  maxWidth: 'Max width',
  hide: 'Visibility',
};
```

Add to the array in `web/test/text-guard.allow.ts`, next to the `builder/guard.ts` entry:

```ts
  { file: 'builder/style/labels.ts', text: '*', reason: 'editor-only Style row labels (Style panel and editor issue messages)' },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix web test -- test/builder-style.test.ts test/text-guard.test.ts`
Expected: PASS (the text guard stays green: `model.ts` holds only enum values).

- [ ] **Step 5: Typecheck and commit**

Run: `npm --prefix web run typecheck` — Expected: no errors.

```bash
git add -- web/src/builder/style/model.ts web/src/builder/style/labels.ts web/test/builder-style.test.ts web/test/text-guard.allow.ts
git commit -m "feat(builder): block style value model and parser" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/style/model.ts web/src/builder/style/labels.ts web/test/builder-style.test.ts web/test/text-guard.allow.ts
```

---

### Task 2: Generated block stylesheet

**Depends on:** Task 1. **Wave 2** (parallel with Task 3).

**Files:**
- Create: `web/src/builder/style/css.ts`
- Create (generated): `web/src/builder/style/block-style.css`
- Create: `web/test/block-style-css.test.ts`
- Modify: `web/src/main.tsx` (one import line)
- Maybe modify: `web/test/text-guard.allow.ts` (only if Step 4's guard run flags `css.ts`)

**Interfaces:**
- Consumes: `STYLE_ATTR`, `STYLE_KEY_ORDER`, `STYLE_KEYS`, `type StyleKey` (Task 1); `SPACING` from `@/builder/define.ts` (existing).
- Produces: `renderBlockStyleCss(): string`; the checked-in `block-style.css`, loaded once from `main.tsx` (so it is in the main bundle, ahead of any template CSS, for shop and editor alike).

- [ ] **Step 1: Write the failing test**

Create `web/test/block-style-css.test.ts`:

```ts
/// <reference types="node" />
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderBlockStyleCss } from '@/builder/style/css.ts';
import { STYLE_ATTR, STYLE_KEY_ORDER, STYLE_KEYS } from '@/builder/style/model.ts';
import { cssRules } from './helpers/css-rules.ts';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(testDir, '../src/builder/style/block-style.css');

/** [ids, classes/attributes/pseudo-classes, elements] for the selector shapes the generator writes. */
function specificity(selector: string): [number, number, number] {
  let s = selector;
  let b = 0;
  s = s.replace(/:not\(([^)]*)\)/g, (_m, inner: string) => {
    b += Math.max(...inner.split(',').map((x) => specificity(x.trim())[1]));
    return '';
  });
  b += (s.match(/\[[^\]]*\]/g) ?? []).length;
  s = s.replace(/\[[^\]]*\]/g, '');
  b += (s.match(/:(?!:)[a-z-]+/g) ?? []).length;
  const c = (s.replace(/:[a-z-]+/g, '').match(/(^|[\s>+~])[a-z]+/g) ?? []).length;
  return [0, b, c];
}

describe('block-style.css (spec §5.2)', () => {
  const css = renderBlockStyleCss();
  const rules = cssRules(css);

  it('the committed file is current (UPDATE_BLOCK_STYLE_CSS=1 npm --prefix web test -- test/block-style-css.test.ts rewrites it)', () => {
    if (process.env.UPDATE_BLOCK_STYLE_CSS === '1') writeFileSync(FILE, css);
    expect(readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n')).toBe(css);
  });

  it('has a rule for every key × value', () => {
    for (const key of STYLE_KEY_ORDER) {
      for (const value of STYLE_KEYS[key]) expect(css, `${key}=${value}`).toContain(`[data-sfs-${STYLE_ATTR[key]}="${value}"]`);
    }
  });

  it('every selector is (0,4,0)', () => {
    for (const r of rules) for (const sel of r.selector.split(/,(?![^(]*\))/)) expect(specificity(sel.trim()), sel).toEqual([0, 4, 0]);
  });

  it('has no motion', () => {
    expect(css).not.toMatch(/transition|animation/);
  });

  it('resets the private border variables on every marker, before any key rule', () => {
    const first = rules.findIndex((r) => /--sfs-bc:\s*initial/.test(r.body) && /--sfs-bs:\s*initial/.test(r.body));
    const firstKey = rules.findIndex((r) => r.selector.includes('[data-sfs-'));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(firstKey);
    expect(rules[first]!.body).toMatch(/box-sizing:\s*border-box/);
    expect(rules[first]!.body).toMatch(/min-width:\s*0/);
  });

  it('writes the §3.2 declarations', () => {
    const body = (sel: string) => rules.find((r) => r.atRule === null && r.selector.endsWith(sel))?.body ?? '';
    expect(body('[data-sfs-bg="surface-2"]')).toMatch(/background:\s*var\(--sf-surface-2\)/);
    expect(body('[data-sfs-fg="muted"]')).toMatch(/--sf-block-fg:\s*var\(--sf-muted\)/);
    expect(body('[data-sfs-pt="lg"]')).toMatch(/padding-block-start:\s*2\.5rem/);
    expect(body('[data-sfs-border="thin"]')).toMatch(/border:\s*1px var\(--sfs-bs, solid\) var\(--sfs-bc, var\(--sf-line\)\)/);
    expect(body('[data-sfs-bc="primary"]')).toMatch(/--sfs-bc:\s*var\(--sf-primary\)/);
    expect(body('[data-sfs-radius="card"]')).toMatch(/border-radius:\s*var\(--sf-card-radius\)/);
    expect(body('[data-sfs-shadow="raised"]')).toMatch(/box-shadow:\s*var\(--sf-card-shadow-hover\)/);
    expect(body('[data-sfs-text="lg"]')).toMatch(/--sf-text-scale:\s*1\.125/);
    expect(body('[data-sfs-max="text"]')).toMatch(/max-width:\s*min\(68ch, 100%\)/);
  });

  it('bg alone insets the text (never on the header part); align places a max-width box', () => {
    expect(rules.some((r) => r.selector.includes('[data-sfs-bg]:not([data-sfs-px], [data-sf-part])') && /padding-inline:\s*1rem/.test(r.body))).toBe(true);
    expect(rules.some((r) => r.selector.includes('[data-sfs-max][data-sfs-align="center"]') && /margin-inline:\s*auto/.test(r.body))).toBe(true);
    expect(rules.some((r) => r.selector.includes('[data-sfs-max][data-sfs-align="end"]') && /margin-inline-start:\s*auto/.test(r.body))).toBe(true);
  });

  it('hides at the 62em breakpoint, with !important', () => {
    expect(rules.some((r) => r.atRule === '@media (max-width: 61.99em)' && r.selector.includes('[data-sfs-hide="mobile"]') && /display:\s*none !important/.test(r.body))).toBe(true);
    expect(rules.some((r) => r.atRule === '@media (min-width: 62em)' && r.selector.includes('[data-sfs-hide="desktop"]') && /display:\s*none !important/.test(r.body))).toBe(true);
  });

  it('caps large steps on phones and zeroes the third nested side padding, last', () => {
    const phone = rules.filter((r) => r.atRule === '@media (max-width: 47.99em)');
    const find = (sel: string) => phone.find((r) => r.selector.endsWith(sel))?.body ?? '';
    expect(find('[data-sfs-pt="lg"]')).toMatch(/1\.5rem/);
    expect(find('[data-sfs-mb="xl"]')).toMatch(/2\.5rem/);
    expect(find('[data-sfs-px="md"]')).toMatch(/padding-inline:\s*1rem/);
    expect(find('[data-sfs-px="xl"]')).toMatch(/padding-inline:\s*1rem/);
    expect(find('[data-sfs-text="xl"]')).toMatch(/--sf-text-scale:\s*1\.125/);
    const nested = phone.at(-1)!;
    expect(nested.selector).toBe(':root [data-sfs-px] [data-sfs-px] [data-sfs-px]');
    expect(nested.body).toMatch(/padding-inline:\s*0/);
  });

  it('an empty wrapper (a marker with no block of its own) shows no box', () => {
    expect(rules.some((r) => r.selector === ':root [data-sf-style]:not([data-sf-block]):empty' && /display:\s*none/.test(r.body))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web test -- test/block-style-css.test.ts`
Expected: FAIL — cannot resolve `@/builder/style/css.ts`.

- [ ] **Step 3: Write the generator, generate the file, import it**

Create `web/src/builder/style/css.ts`:

```ts
import { SPACING } from '@/builder/define.ts';
import { STYLE_ATTR, STYLE_KEY_ORDER, STYLE_KEYS, type StyleKey } from '@/builder/style/model.ts';

/*
 * Spec §3.2 / §5.2 / §7: the static sheet keyed on data-sfs-* attributes. Every selector is (0,4,0):
 * above module classes and template part rules (0,3,0); a template's escape hatch at equal
 * specificity wins only because template CSS loads after the main bundle.
 */

const ON = ':root:root [data-sf-style]';
const sel = (key: StyleKey, value: string) => `${ON}[data-sfs-${STYLE_ATTR[key]}="${value}"]`;
const BORDER_WIDTH: Record<string, string> = { thin: '1px', medium: '2px', thick: '4px' };
const RADIUS: Record<string, string> = {
  none: '0', sm: 'var(--mantine-radius-sm)', md: 'var(--mantine-radius-md)', lg: 'var(--mantine-radius-lg)',
  card: 'var(--sf-card-radius)', pill: 'var(--sf-pill-radius)',
};
const SHADOW: Record<string, string> = { card: 'var(--sf-card-shadow)', raised: 'var(--sf-card-shadow-hover)' };
const TEXT_SCALE: Record<string, string> = { sm: '0.875', lg: '1.125', xl: '1.25' };
const MAX_WIDTH: Record<string, string> = { narrow: '36rem', text: '68ch', wide: '60rem' };
const SPACE = SPACING as Record<string, string>;
const BLOCK_PROP: Partial<Record<StyleKey, string>> = {
  padTop: 'padding-block-start', padBottom: 'padding-block-end', marginTop: 'margin-block-start', marginBottom: 'margin-block-end',
};

function declarations(key: StyleKey, value: string): string[] {
  const prop = BLOCK_PROP[key];
  if (prop) return [`${prop}: ${SPACE[value]}`];
  switch (key) {
    case 'bg': return [`background: var(--sf-${value})`];
    case 'fg': return [`color: var(--sf-${value})`, `--sf-block-fg: var(--sf-${value})`];
    case 'padX': return [`padding-inline: ${SPACE[value]}`];
    case 'border': return [`border: ${BORDER_WIDTH[value]} var(--sfs-bs, solid) var(--sfs-bc, var(--sf-line))`];
    case 'borderColor': return [`--sfs-bc: var(--sf-${value})`];
    case 'borderStyle': return [`--sfs-bs: ${value}`];
    case 'radius': return [`border-radius: ${RADIUS[value]}`];
    case 'shadow': return [`box-shadow: ${SHADOW[value]}`];
    case 'textSize': return [`--sf-text-scale: ${TEXT_SCALE[value]}`];
    case 'align': return [`text-align: ${value}`];
    case 'maxWidth': return [`max-width: min(${MAX_WIDTH[value]}, 100%)`];
    default: return [];
  }
}

const rule = (selector: string, lines: string[], indent = '') =>
  `${indent}${selector} {\n${lines.map((l) => `${indent}  ${l};`).join('\n')}\n${indent}}\n`;
const media = (query: string, body: string[]) => `@media ${query} {\n${body.join('')}}\n`;

export function renderBlockStyleCss(): string {
  const out: string[] = [
    '/* Generated by renderBlockStyleCss() in css.ts. Do not edit: UPDATE_BLOCK_STYLE_CSS=1 npm --prefix web test -- test/block-style-css.test.ts rewrites it. */\n',
    rule(`${ON}[data-sf-style]`, ['box-sizing: border-box', 'min-width: 0', '--sfs-bc: initial', '--sfs-bs: initial']),
    rule(':root [data-sf-style]:not([data-sf-block]):empty', ['display: none']),
  ];
  for (const key of STYLE_KEY_ORDER) {
    if (key === 'hide') continue;
    for (const value of STYLE_KEYS[key]) out.push(rule(sel(key, value), declarations(key, value)));
  }
  out.push(rule(':root [data-sf-style][data-sfs-bg]:not([data-sfs-px], [data-sf-part])', ['padding-inline: 1rem']));
  out.push(rule(':root [data-sf-style][data-sfs-max][data-sfs-align="center"]', ['margin-inline: auto']));
  out.push(rule(':root [data-sf-style][data-sfs-max][data-sfs-align="end"]', ['margin-inline-start: auto']));
  out.push(media('(max-width: 61.99em)', [rule(sel('hide', 'mobile'), ['display: none !important'], '  ')]));
  out.push(media('(min-width: 62em)', [rule(sel('hide', 'desktop'), ['display: none !important'], '  ')]));
  const phone: string[] = [];
  for (const key of ['padTop', 'padBottom', 'marginTop', 'marginBottom'] as const) {
    phone.push(rule(sel(key, 'lg'), [`${BLOCK_PROP[key]}: 1.5rem`], '  '));
    phone.push(rule(sel(key, 'xl'), [`${BLOCK_PROP[key]}: 2.5rem`], '  '));
  }
  for (const value of ['md', 'lg', 'xl']) phone.push(rule(sel('padX', value), ['padding-inline: 1rem'], '  '));
  phone.push(rule(sel('textSize', 'xl'), ['--sf-text-scale: 1.125'], '  '));
  phone.push(rule(':root [data-sfs-px] [data-sfs-px] [data-sfs-px]', ['padding-inline: 0'], '  '));
  out.push(media('(max-width: 47.99em)', phone));
  return out.join('');
}
```

Generate the file:

Run: `UPDATE_BLOCK_STYLE_CSS=1 npm --prefix web test -- test/block-style-css.test.ts` (PowerShell: `$env:UPDATE_BLOCK_STYLE_CSS='1'; npm --prefix web test -- test/block-style-css.test.ts; Remove-Item Env:UPDATE_BLOCK_STYLE_CSS`)
Expected: `web/src/builder/style/block-style.css` is written (~160 rules). Check `git diff --numstat` shows LF line endings (no CRLF blow-up).

In `web/src/main.tsx`, add after `import '@/styles/mantine.css';`:

```ts
// Block styling (builder): owner styles at (0,4,0), in the main bundle so template CSS loads after it.
import '@/builder/style/block-style.css';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix web test -- test/block-style-css.test.ts test/text-guard.test.ts`
Expected: PASS. If the text guard reports a literal in `builder/style/css.ts`, add `{ file: 'builder/style/css.ts', text: '*', reason: 'CSS source generated at test time; never rendered as text' }` to `web/test/text-guard.allow.ts` and re-run; otherwise leave the allow list alone (a stale entry fails the guard).

- [ ] **Step 5: Commit**

```bash
git add -- web/src/builder/style/css.ts web/src/builder/style/block-style.css web/test/block-style-css.test.ts web/src/main.tsx
git commit -m "feat(builder): generated block style sheet" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/style/css.ts web/src/builder/style/block-style.css web/test/block-style-css.test.ts web/src/main.tsx
```
(Add `web/test/text-guard.allow.ts` to both path lists only if you changed it.)

---

### Task 3: Block contract, guard, and the one render path

**Depends on:** Task 1. **Wave 2** (parallel with Task 2).

**Files:**
- Modify: `web/src/builder/define.ts`
- Modify: `web/src/builder/guard.ts:31-37` (`fieldMessage`)
- Create: `web/src/builder/style/apply.tsx`
- Modify: `web/src/builder/render.tsx:77-82` (`BlockBody`)
- Modify: `web/src/builder/editor/EditorBlock.tsx:71-78` (`BlockBody`, `isEmpty`)
- Modify: `web/test/builder-style.test.ts` (append), `web/test/builder-guard.test.ts`, `web/test/builder-render.test.tsx`
- Create: `web/test/builder-editor-style-canvas.test.tsx`

**Interfaces:**
- Consumes: Task 1's `parseBlockStyle`, `STYLE_ATTR`, `STYLE_KEY_ORDER`, `isStyleValue`, `isStyleKey`, `STYLE_LABELS`, `StyleSupport`, `StyleTarget`, `StyleKey`.
- Produces:
  - `define.ts`: `export type StyleAttrs = Readonly<Record<\`data-sf${string}\`, string>>`; `BlockRenderContext { editing; docKey; layout; style?: StyleAttrs }`; `BlockDef.style?: StyleSupport | false` (made required in Task 12 — until then *absent means `false`*); `export type AnyBlock = BlockDef<any>`; re-exports `type StyleKey, StyleSupport, StyleTarget`. `parseBlockPropsDetailed` returns `props.blockStyle` (guarded, canonical) when any key survives, and appends style issues (`blockStyle`, `blockStyle.<key>`) to `fallbacks`.
  - `guard.ts`: issue `field:<Block>.blockStyle` / `field:<Block>.blockStyle.<key>` with the §10.1 message.
  - `apply.tsx`: `styleAttrs(def: AnyBlock, style: unknown, editing: boolean): StyleAttrs | null`; `renderBlock(def: AnyBlock, props: Record<string, unknown>, ctx: BlockRenderContext): ReactNode` — never passes `blockStyle` to `def.render`; unstyled ⇒ `def.render({ ...props, puck: ctx })` with the **same** `ctx` reference; `root`/`pass` ⇒ `puck: { ...ctx, style: attrs }`; `wrap` ⇒ `<div {...attrs}>…</div>`.
  - Block authors (Tasks 4–8) spread `{...puck.style}` on their root (or pass it as `styleAttrs` to the inner component that owns it).

- [ ] **Step 1: Write the failing tests**

Append to `web/test/builder-style.test.ts` (move the new imports up to the file's import block):

```ts
import { isValidElement, type ReactElement } from 'react';
import { z } from 'zod';
import { defineBlock, parseBlockPropsDetailed, type BlockRenderContext } from '@/builder/define.ts';
import { renderBlock, styleAttrs } from '@/builder/style/apply.tsx';

const ctx: BlockRenderContext = { editing: false, docKey: 'page:x', layout: 'storefront' };
const rootDef = defineBlock<{ id: string; text: string }>({
  name: 'RootBox', label: 'Root box', category: 'content', layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', ['bg', 'padTop', 'hide']),
  schema: z.object({ text: z.string() }), defaultProps: { text: '' }, render: () => null,
});
const wrapDef = { ...rootDef, name: 'WrapBox', style: styleSupport('wrap', ['bg', 'hide']) };
const offDef = { ...rootDef, name: 'Off', style: false as const };

describe('styleAttrs (spec §5.1)', () => {
  it.each([undefined, null, {}, { align: 'center' }, { bg: 'hotpink' }, 'bg'])('null for %j', (s) => {
    expect(styleAttrs(rootDef, s, false)).toBeNull();
  });
  it('null when the block is not stylable', () => {
    expect(styleAttrs(offDef, { bg: 'surface' }, false)).toBeNull();
  });
  it('marker first, one attribute per allowed key, canonical order', () => {
    expect(Object.entries(styleAttrs(rootDef, { hide: 'mobile', padTop: 'lg', bg: 'surface' }, false)!)).toEqual([
      ['data-sf-style', 'RootBox'], ['data-sfs-bg', 'surface'], ['data-sfs-pt', 'lg'], ['data-sfs-hide', 'mobile'],
    ]);
  });
  it('hide becomes ghost while editing', () => {
    expect(styleAttrs(rootDef, { hide: 'desktop' }, true)).toEqual({ 'data-sf-style': 'RootBox', 'data-sfs-ghost': 'desktop' });
  });
});

describe('renderBlock (spec §5.1, §6)', () => {
  function spy(def: typeof rootDef) {
    const calls: Array<Record<string, unknown>> = [];
    return { calls, def: { ...def, render: (p: Record<string, unknown>) => { calls.push(p); return 'body'; } } as unknown as typeof rootDef };
  }
  it('unstyled: the exact call made today, same ctx reference, no blockStyle prop', () => {
    const { calls, def } = spy(rootDef);
    for (const blockStyle of [undefined, {}, { align: 'end' }]) {
      const props: Record<string, unknown> = { id: 'a', text: 't', ...(blockStyle ? { blockStyle } : {}) };
      expect(renderBlock(def, props, ctx)).toBe('body');
    }
    for (const p of calls) {
      expect(p.puck).toBe(ctx);
      expect(p).toEqual({ id: 'a', text: 't', puck: ctx });
    }
  });
  it('root: attributes arrive as puck.style', () => {
    const { calls, def } = spy(rootDef);
    renderBlock(def, { id: 'a', text: 't', blockStyle: { bg: 'surface' } }, ctx);
    expect(calls[0]!.puck).toEqual({ ...ctx, style: { 'data-sf-style': 'RootBox', 'data-sfs-bg': 'surface' } });
    expect('blockStyle' in calls[0]!).toBe(false);
  });
  it('wrap: one div carrying the attributes around the unchanged render', () => {
    const { calls, def } = spy(wrapDef as typeof rootDef);
    const out = renderBlock(def, { id: 'a', text: 't', blockStyle: { bg: 'surface', padTop: 'lg' } }, ctx) as ReactElement<Record<string, unknown>>;
    expect(isValidElement(out) && out.type).toBe('div');
    expect(out.props).toMatchObject({ 'data-sf-style': 'WrapBox', 'data-sfs-bg': 'surface', children: 'body' });
    expect(out.props['data-sfs-pt']).toBeUndefined();
    expect(calls[0]!.puck).toBe(ctx);
  });
});

describe('parseBlockPropsDetailed with blockStyle', () => {
  it('keeps the guarded style beside the schema props and reports dropped keys', () => {
    expect(parseBlockPropsDetailed(rootDef, { text: 'x', blockStyle: { bg: 'surface', fg: 'text', zz: 1 } })).toEqual({
      props: { text: 'x', blockStyle: { bg: 'surface' } }, fallbacks: ['blockStyle.fg'],
    });
  });
  it('no blockStyle key when nothing survives; an absent style changes nothing', () => {
    expect(parseBlockPropsDetailed(rootDef, { text: 'x', blockStyle: {} })).toEqual({ props: { text: 'x' }, fallbacks: [] });
    expect(parseBlockPropsDetailed(rootDef, { text: 'x' })).toEqual({ props: { text: 'x' }, fallbacks: [] });
  });
  it('a block with no style declaration treats every style key as not accepted', () => {
    const bare = { ...rootDef, style: undefined };
    expect(parseBlockPropsDetailed(bare, { text: 'x', blockStyle: { bg: 'surface' } }).fallbacks).toEqual(['blockStyle.bg']);
  });
});
```

In `web/test/builder-guard.test.ts`, give the mocked `Heading` a style declaration — add this property to its `defineBlock({...})` object:

```ts
        style: { target: 'root', keys: ['bg', 'padTop', 'hide'] },
```

and append:

```ts
describe('validateDoc · blockStyle (block-styling spec §10.1)', () => {
  const doc = (blockStyle: unknown) => ({ root, content: [{ type: 'Heading', props: { id: 'h', text: 'Hi', level: 'h2', blockStyle } }] });
  it('keeps valid keys, drops the rest with field issues that name the row', () => {
    const r = validateDoc(doc({ bg: 'surface', padTop: 'huge', align: 'center', glow: 'x' }), 'page:about', 'storefront');
    expect(r.doc!.content[0]!.props.blockStyle).toEqual({ bg: 'surface' });
    expect(r.issues.map((i) => i.rule)).toEqual(['field:Heading.blockStyle.padTop', 'field:Heading.blockStyle.align']);
    expect(r.issues[0]!.message).toBe('Heading: the style setting "Padding top" is not valid here and was left at its default.');
    expect(r.issues[0]!.blockId).toBe('h');
  });
  it('a non-object style is one issue and no blockStyle', () => {
    const r = validateDoc(doc('surface'), 'page:about', 'storefront');
    expect(r.doc!.content[0]!.props).not.toHaveProperty('blockStyle');
    expect(r.issues.map((i) => i.rule)).toEqual(['field:Heading.blockStyle']);
    expect(r.issues[0]!.message).toBe('Heading: the style settings are not valid and were left at their defaults.');
  });
  it('{} is removed silently', () => {
    const r = validateDoc(doc({}), 'page:about', 'storefront');
    expect(r.doc!.content[0]!.props).not.toHaveProperty('blockStyle');
    expect(r.issues).toEqual([]);
  });
});
```

In `web/test/builder-render.test.tsx`, add to the mocked `BLOCKS` object (inside the `vi.mock` factory):

```tsx
      RootBox: defineBlock<{ id: string; text: string }>({ ...base, name: 'RootBox', label: 'Root box', slots: [], style: { target: 'root', keys: ['bg', 'hide'] }, schema: z.object({ text: z.string() }), defaultProps: { text: '' }, render: ({ text, puck }) => <p data-sf-block="RootBox" {...puck.style}>{text}</p> }),
      WrapBox: defineBlock<{ id: string; text: string }>({ ...base, name: 'WrapBox', label: 'Wrap box', slots: [], style: { target: 'wrap', keys: ['bg', 'padTop'] }, schema: z.object({ text: z.string() }), defaultProps: { text: '' }, render: ({ text }) => (text ? <p>{text}</p> : null) }),
```

and append:

```tsx
describe('RenderDoc · block styles', () => {
  const html = (content: ComponentData[], editing = false) => {
    const out = render(<BuilderModeProvider value={{ editing, previewAs: null }}><RenderDoc doc={d(content)} docKey="page:x" layout="storefront" /></BuilderModeProvider>).container.innerHTML;
    cleanup();
    return out;
  };
  it('absent, {} and disallowed-only styles render byte-identical DOM', () => {
    const plain = html([c('RootBox', { text: 'a' })]);
    expect(plain).toBe('<p data-sf-block="RootBox">a</p>');
    expect(html([c('RootBox', { text: 'a', blockStyle: {} })])).toBe(plain);
    expect(html([c('RootBox', { text: 'a', blockStyle: { padTop: 'lg' } })])).toBe(plain);
  });
  it('root: attributes on the block root', () => {
    expect(html([c('RootBox', { text: 'a', blockStyle: { bg: 'surface', hide: 'mobile' } })]))
      .toBe('<p data-sf-block="RootBox" data-sf-style="RootBox" data-sfs-bg="surface" data-sfs-hide="mobile">a</p>');
  });
  it('hide is a ghost on the editor canvas', () => {
    expect(html([c('RootBox', { text: 'a', blockStyle: { hide: 'mobile' } })], true)).toContain('data-sfs-ghost="mobile"');
  });
  it('wrap: one added div', () => {
    expect(html([c('WrapBox', { text: 'a', blockStyle: { bg: 'surface', padTop: 'lg' } })]))
      .toBe('<div data-sf-style="WrapBox" data-sfs-bg="surface" data-sfs-pt="lg"><p>a</p></div>');
  });
});
```

Create `web/test/builder-editor-style-canvas.test.tsx` (Review Focus 5):

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { EditorBlock } from '@/builder/editor/EditorBlock.tsx';

afterEach(cleanup);

const empty = defineBlock<{ id: string }>({
  name: 'Quiet', label: 'Quiet', category: 'catalogue', layouts: 'all', routeBound: false, slots: [],
  style: { target: 'wrap', keys: ['bg', 'padTop'] }, schema: z.object({}), defaultProps: {}, render: () => null,
});

describe('EditorBlock · styles', () => {
  it('a styled wrap block that renders nothing still gets the canvas placeholder', () => {
    const { container } = render(<EditorBlock def={empty} props={{ id: 'q', blockStyle: { bg: 'surface', padTop: 'xl' } }} docKey="catalog" layout="storefront" />);
    expect(container.querySelector('[data-sf-style="Quiet"]')).not.toBeNull();
    expect(container.querySelector('[data-sf-builder-empty]')).not.toBeNull();
  });
  it('hide renders as a ghost, never a real hide, on the canvas', () => {
    const shown = defineBlock<{ id: string }>({ ...empty, name: 'Shown', style: { target: 'root', keys: ['hide'] }, render: ({ puck }) => <p data-sf-block="Shown" {...puck.style}>x</p> });
    const { container } = render(<EditorBlock def={shown} props={{ id: 's', blockStyle: { hide: 'mobile' } }} docKey="catalog" layout="storefront" />);
    const p = container.querySelector('[data-sf-block="Shown"]')!;
    expect(p.getAttribute('data-sfs-ghost')).toBe('mobile');
    expect(p.hasAttribute('data-sfs-hide')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix web test -- test/builder-style.test.ts test/builder-guard.test.ts test/builder-render.test.tsx test/builder-editor-style-canvas.test.tsx`
Expected: FAIL — `@/builder/style/apply.tsx` missing; `style` not a known `defineBlock` property; guard ignores `blockStyle`.

- [ ] **Step 3: Implement**

`web/src/builder/define.ts` — add after the existing imports:

```ts
import { parseBlockStyle, type StyleSupport } from '@/builder/style/model.ts';
export type { StyleKey, StyleSupport, StyleTarget } from '@/builder/style/model.ts';

/** `data-sf-style` + `data-sfs-*` attributes for a styled block (block-styling spec §5.1). */
export type StyleAttrs = Readonly<Record<`data-sf${string}`, string>>;
```

Replace `export interface BlockRenderContext { editing: boolean; docKey: DocKey; layout: LayoutKind }` with:

```ts
export interface BlockRenderContext {
  editing: boolean; docKey: DocKey; layout: LayoutKind;
  /** A `root`/`pass` block spreads this onto the element it owns (`{...puck.style}`); absent when unstyled. */
  style?: StyleAttrs;
}
```

Add to `BlockDef<P>` (after `textProps`):

```ts
  /**
   * Which `blockStyle` keys the block accepts and where they land (block-styling spec §4): `root` (its
   * own root element), `wrap` (a div renderBlock adds), `pass` (forwarded to a named inner element).
   * `false` = not stylable. Keys may be added in a later release, never removed.
   */
  style?: StyleSupport | false;
```

After `defineBlock`:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyBlock = BlockDef<any>;
```

Rename the current body of `parseBlockPropsDetailed` to a private `parseSchemaProps` (same signature and code), and add:

```ts
/**
 * The block's props from stored data: whole-object parse, else field by field. An array field keeps
 * its valid items (each invalid one is reported as `key[i]`) before the whole field falls back.
 * `blockStyle` is parsed beside the schema (a plain z.object would strip it): kept when any key
 * survives, each dropped key reported as `blockStyle.<key>` (block-styling spec §10.1).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseBlockPropsDetailed(def: BlockDef<any>, raw: Record<string, unknown>, fallback: FieldFallback = 'neutral'): ParsedBlockProps {
  const base = parseSchemaProps(def, raw, fallback);
  const styled = parseBlockStyle(def.style ?? false, raw.blockStyle);
  if (!styled.style && styled.issues.length === 0) return base;
  return {
    props: styled.style ? { ...base.props, blockStyle: styled.style } : base.props,
    fallbacks: [...base.fallbacks, ...styled.issues],
  };
}
```

`web/src/builder/guard.ts` — add imports and extend `fieldMessage`:

```ts
import { STYLE_LABELS } from '@/builder/style/labels.ts';
import { isStyleKey } from '@/builder/style/model.ts';
```

```ts
/** `items[2]` → an item that was left out; `title` → a field that was left empty; `blockStyle.<key>` → a style row left at its default. */
function fieldMessage(label: string, f: string): string {
  if (f === 'blockStyle') return `${label}: the style settings are not valid and were left at their defaults.`;
  if (f.startsWith('blockStyle.')) {
    const key = f.slice('blockStyle.'.length);
    return `${label}: the style setting "${isStyleKey(key) ? STYLE_LABELS[key] : key}" is not valid here and was left at its default.`;
  }
  const item = /^(.+)\[(\d+)\]$/.exec(f);
  return item
    ? `${label}: item ${Number(item[2]) + 1} of "${item[1]}" is not valid and is left out.`
    : `${label}: the "${f}" field is not valid and is left blank (or at its default).`;
}
```

Create `web/src/builder/style/apply.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { AnyBlock, BlockRenderContext, StyleAttrs } from '@/builder/define.ts';
import { isStyleValue, STYLE_ATTR, STYLE_KEY_ORDER } from '@/builder/style/model.ts';

/**
 * Block-styling spec §5.1. null when nothing applies — the caller must then add nothing at all.
 * `style` is untrusted (the editor canvas hands props the guard never saw), so the block's
 * allowlist and each value are re-checked here. `hide` is a ghost on the editor canvas.
 */
export function styleAttrs(def: AnyBlock, style: unknown, editing: boolean): StyleAttrs | null {
  const support = def.style;
  if (!support || typeof style !== 'object' || style === null || Array.isArray(style)) return null;
  const src = style as Record<string, unknown>;
  const out: Record<string, string> = {};
  let marked = false;
  for (const key of STYLE_KEY_ORDER) {
    if (!support.keys.includes(key) || !Object.hasOwn(src, key) || !isStyleValue(key, src[key])) continue;
    if (!marked) {
      out['data-sf-style'] = def.name;
      marked = true;
    }
    out[`data-sfs-${key === 'hide' && editing ? 'ghost' : STYLE_ATTR[key]}`] = src[key] as string;
  }
  return marked ? (out as StyleAttrs) : null;
}

/** The only caller of `def.render` (shop, exact preview and editor canvas), so the three never disagree. */
export function renderBlock(def: AnyBlock, props: Record<string, unknown>, ctx: BlockRenderContext): ReactNode {
  const attrs = styleAttrs(def, props.blockStyle, ctx.editing);
  let rest = props;
  if (Object.hasOwn(props, 'blockStyle')) {
    rest = { ...props };
    delete rest.blockStyle;
  }
  if (attrs === null || !def.style) return def.render({ ...rest, puck: ctx } as never);
  if (def.style.target === 'wrap') return <div {...attrs}>{def.render({ ...rest, puck: ctx } as never)}</div>;
  return def.render({ ...rest, puck: { ...ctx, style: attrs } } as never);
}
```

`web/src/builder/render.tsx` — import `import { renderBlock } from '@/builder/style/apply.tsx';` and replace `BlockBody`:

```tsx
function BlockBody({ item, ctx }: { item: ComponentData; ctx: BlockRenderContext }) {
  const def = blockDef(item.type)!;
  const props: Record<string, unknown> = { ...item.props };
  for (const s of def.slots) props[s] = slotRender(item.props[s], ctx);
  return <>{renderBlock(def, props, ctx)}</>;
}
```

`web/src/builder/editor/EditorBlock.tsx` — import `renderBlock` the same way; replace `BlockBody`'s return with `return <>{renderBlock(def, props, ctx)}</>;` and `isEmpty` with:

```tsx
/**
 * Nothing a person could see or click: no element and no text — or only a style wrapper around
 * nothing (a styled wrap block that rendered null; the stylesheet's :empty rule hides it).
 */
const isEmpty = (el: HTMLElement): boolean => {
  const first = el.firstElementChild;
  const onlyEmptyWrapper = first !== null && first === el.lastElementChild
    && first.matches('[data-sf-style]:not([data-sf-block])') && first.childElementCount === 0;
  return (first === null || onlyEmptyWrapper) && !(el.textContent ?? '').trim();
};
```

If TypeScript rejects spreading `StyleAttrs` onto an intrinsic element, keep the type and cast at the spread site (`{...(attrs as Record<string, string>)}`) — do not widen `StyleAttrs`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix web test -- test/builder-style.test.ts test/builder-guard.test.ts test/builder-render.test.tsx test/builder-editor-style-canvas.test.tsx test/builder-content-text.test.tsx test/builder-shell.test.tsx test/text-guard.test.ts`
Expected: PASS (the last three are unchanged-behaviour checks).

- [ ] **Step 5: Typecheck and commit**

Run: `npm --prefix web run typecheck` — Expected: no errors.

```bash
git add -- web/src/builder/define.ts web/src/builder/guard.ts web/src/builder/style/apply.tsx web/src/builder/render.tsx web/src/builder/editor/EditorBlock.tsx web/test/builder-style.test.ts web/test/builder-guard.test.ts web/test/builder-render.test.tsx web/test/builder-editor-style-canvas.test.tsx
git commit -m "feat(builder): blockStyle guard, style attributes and one render path" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/define.ts web/src/builder/guard.ts web/src/builder/style/apply.tsx web/src/builder/render.tsx web/src/builder/editor/EditorBlock.tsx web/test/builder-style.test.ts web/test/builder-guard.test.ts web/test/builder-render.test.tsx web/test/builder-editor-style-canvas.test.tsx
```

---

### Task 4: Content text blocks (root + TEXT keys)

**Depends on:** Task 3. **Wave 3.** Load `frontend-design:frontend-design` first.

**Files:**
- Modify: `web/src/builder/blocks/Heading.tsx`, `RichText.tsx`, `Testimonial.tsx`, `FAQ.tsx`, `NavLinks.tsx`, `Columns.tsx`
- Modify: `web/src/builder/blocks/_shared/RichHtml.tsx`
- Modify: `web/src/builder/blocks/Heading.module.css`, `RichText.module.css`, `Testimonial.module.css`, `FAQ.module.css`, `NavLinks.module.css`
- Create: `web/test/builder-style-content-text.test.tsx`

**Interfaces:**
- Consumes: `BOX`, `TEXT`, `VIS`, `styleSupport` from `@/builder/style/model.ts`; `StyleAttrs`, `puck.style` from Task 3.
- Produces: `RichHtml` gains optional `attrs?: StyleAttrs` (spread after its own attributes). Declarations (spec §4):
  - `Heading`: `styleSupport('root', [...BOX, 'fg', 'textSize', ...VIS])`
  - `RichText`: `styleSupport('root', [...BOX, ...TEXT, ...VIS], ['maxWidth'])`
  - `Columns`, `FAQ`, `Testimonial`, `NavLinks`: `styleSupport('root', [...BOX, ...TEXT, ...VIS])`

- [ ] **Step 1: Write the failing test**

Create `web/test/builder-style-content-text.test.tsx`:

```tsx
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { Suspense } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { RenderDoc } from '@/builder/render.tsx';
import { BuilderModeProvider } from '@/builder/mode.ts';
import type { ComponentData } from '@/builder/types.ts';

const c = (type: string, props: Record<string, unknown> = {}, id = type): ComponentData => ({ type, props: { id, ...props } });
function html(content: ComponentData[]) {
  const out = render(
    <MantineProvider env="test"><MemoryRouter><BuilderModeProvider value={{ editing: false, previewAs: null }}>
      <Suspense fallback={null}><RenderDoc doc={{ root: { props: { title: '', description: '', chrome: 'shell' } }, content }} docKey="page:test" layout="storefront" /></Suspense>
    </BuilderModeProvider></MemoryRouter></MantineProvider>,
  ).container;
  const snapshot = { html: out.innerHTML, markers: [...out.querySelectorAll('[data-sf-style]')] };
  cleanup();
  return snapshot;
}
afterEach(cleanup);

const FIXTURES: Record<string, Record<string, unknown>> = {
  Heading: { text: 'Small batches', eyebrow: 'New', level: 'h2', align: 'start' },
  RichText: { bodyHtml: '<p>Packed to order.</p>', width: 'narrow' },
  Testimonial: { quote: 'Arrived next morning.', author: 'Sam', detail: 'Leeds' },
  FAQ: { title: 'Questions', items: [{ question: 'How fast?', answerHtml: '<p>Same day.</p>' }] },
  NavLinks: { items: [{ label: 'Shop', href: '/' }], ariaLabel: 'Site', direction: 'row' },
  Columns: { columns: '2', stackBelow: 'md', gap: 'md', col1: [c('Heading', { text: 'Inner' }, 'in1')], col2: [], col3: [], col4: [] },
};
/** A key each block does NOT accept (Columns accepts all 16, so it has none). */
const DISALLOWED: Record<string, Record<string, string> | null> = {
  Heading: { align: 'center' }, RichText: { maxWidth: 'text' }, Testimonial: null, FAQ: null, NavLinks: null, Columns: null,
};

describe.each(Object.keys(FIXTURES))('%s · block styles', (name) => {
  it('absent, {} and disallowed-only styles leave the DOM byte-identical', () => {
    const plain = html([c(name, FIXTURES[name])]).html;
    expect(plain).not.toContain('data-sf-style');
    expect(html([c(name, { ...FIXTURES[name], blockStyle: {} })]).html).toBe(plain);
    const dis = DISALLOWED[name];
    if (dis) expect(html([c(name, { ...FIXTURES[name], blockStyle: dis })]).html).toBe(plain);
  });
  it('a style lands once, on the element carrying data-sf-block', () => {
    const { markers } = html([c(name, { ...FIXTURES[name], blockStyle: { bg: 'surface', textSize: 'lg', hide: 'mobile' } })]);
    expect(markers).toHaveLength(1);
    expect(markers[0]!.getAttribute('data-sf-block')).toBe(name);
    expect(markers[0]!.getAttribute('data-sf-style')).toBe(name);
    expect(markers[0]!.getAttribute('data-sfs-bg')).toBe('surface');
    expect(markers[0]!.getAttribute('data-sfs-text')).toBe('lg');
    expect(markers[0]!.getAttribute('data-sfs-hide')).toBe('mobile');
  });
});

// Review Focus 2: a styled block that renders nothing leaves nothing behind.
it('a blank Heading with a style renders nothing at all', () => {
  expect(html([c('Heading', { text: '   ', blockStyle: { bg: 'surface', padTop: 'xl' } })]).html).toBe('');
});

describe('text blocks read the style variables (spec §4, §8)', () => {
  const css = (n: string) => readFileSync(resolve(__dirname, `../src/builder/blocks/${n}.module.css`), 'utf8');
  it.each(['Heading', 'RichText', 'Testimonial', 'FAQ', 'NavLinks'])('%s colour falls back to its token and size scales', (n) => {
    expect(css(n)).toMatch(/color:\s*var\(--sf-block-fg, var\(--sf-[a-z-]+\)\)/);
    expect(css(n)).toMatch(/font-size:\s*calc\([^;]*\* var\(--sf-text-scale, 1\)\)/);
  });
  it('Heading keeps its clamp inside the scale', () => {
    expect(css('Heading')).toContain('font-size: calc(clamp(1.5rem, 1.2rem + 1.4vw, 2.25rem) * var(--sf-text-scale, 1))');
  });
  it('tap targets keep min-height 44px independent of the scale', () => {
    expect(css('FAQ')).toMatch(/\.q \{[^}]*min-height: 44px/);
    expect(css('NavLinks')).toMatch(/\.link \{[^}]*min-height: 44px/);
  });
  it('NavLinks and Testimonial honour align in their flex rows', () => {
    expect(css('NavLinks')).toContain(".nav[data-sfs-align='center'] .list");
    expect(css('Testimonial')).toContain(".card[data-sfs-align='center'] .by");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web test -- test/builder-style-content-text.test.tsx`
Expected: FAIL — no `data-sf-style` rendered; CSS assertions fail.

- [ ] **Step 3: Implement**

`Heading.tsx`: import `import { BOX, styleSupport, VIS } from '@/builder/style/model.ts';`, add `style: styleSupport('root', [...BOX, 'fg', 'textSize', ...VIS]),` after `slots: [],`, destructure `puck` in render, and spread on the root: `<div className={…} data-sf-block="Heading" {...puck.style}>`.

`_shared/RichHtml.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { StyleAttrs } from '@/builder/define.ts';
import { sanitizeRichtext } from '@/builder/sanitize.ts';

/** (existing doc comment kept) `attrs`: a styled RichText's style attributes, spread last. */
export function RichHtml({ value, className, block, attrs }: { value: unknown; className?: string; block?: string; attrs?: StyleAttrs }) {
  if (typeof value === 'string') {
    return <div className={className} data-sf-prose="" data-sf-block={block} {...attrs} dangerouslySetInnerHTML={{ __html: sanitizeRichtext(value) }} />;
  }
  return <div className={className} data-sf-prose="" data-sf-block={block} {...attrs}>{value as ReactNode}</div>;
}
```

`RichText.tsx`: `style: styleSupport('root', [...BOX, ...TEXT, ...VIS], ['maxWidth']),`; render `({ bodyHtml, width, puck }) => … <RichHtml … attrs={puck.style} />`.

`Testimonial.tsx`, `FAQ.tsx`: `style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),`; destructure `puck`; spread `{...puck.style}` on `<figure data-sf-block="Testimonial">` / `<section data-sf-block="FAQ">`.

`Columns.tsx`: same declaration; spread on the grid `<div … data-sf-block="Columns" {...puck.style}>`.

`NavLinks.tsx`: same declaration; `NavLinksView` gains `styleAttrs?: StyleAttrs` and spreads it on `<nav … data-sf-block="NavLinks" {...styleAttrs}>`; render passes `styleAttrs={puck.style}`.

CSS (each change computes to today's value when the variables are unset):

`Heading.module.css`:
```css
.eyebrow { /* … */ font-size: calc(0.625rem * var(--sf-text-scale, 1)); /* colour stays --sf-faint */ }
.h2, .h3, .h4 { /* … */ color: var(--sf-block-fg, var(--sf-text)); }
.h2 { font-size: calc(clamp(1.5rem, 1.2rem + 1.4vw, 2.25rem) * var(--sf-text-scale, 1)); line-height: 1.12; }
.h3 { font-size: calc(clamp(1.2rem, 1.05rem + 0.7vw, 1.6rem) * var(--sf-text-scale, 1)); line-height: 1.2; }
.h4 { font-size: calc(1.05rem * var(--sf-text-scale, 1)); line-height: 1.3; }
```

`RichText.module.css`: `.prose` → `color: var(--sf-block-fg, var(--sf-muted)); font-size: calc(0.9375rem * var(--sf-text-scale, 1));`; `.prose :where(h2, h3, h4)` and `.prose :where(strong)` → `color: var(--sf-block-fg, var(--sf-text));` (links keep `--sf-primary`).

`Testimonial.module.css`: `.quote p` → `font-size: calc(1.125rem * var(--sf-text-scale, 1)); color: var(--sf-block-fg, var(--sf-text));`; `.by` → `font-size: calc(10px * var(--sf-text-scale, 1));`; `.author` → `color: var(--sf-block-fg, var(--sf-text));` (`.detail` keeps `--sf-faint`); append:
```css
/* An owner's Alignment (block style) reaches the flex byline too. */
.card[data-sfs-align='center'] .by { justify-content: center; }
.card[data-sfs-align='end'] .by { justify-content: flex-end; }
```

`FAQ.module.css`: `.title` → `font-size: calc(clamp(1.2rem, 1.05rem + 0.7vw, 1.6rem) * var(--sf-text-scale, 1)); color: var(--sf-block-fg, var(--sf-text));`; `.q` → `color: var(--sf-block-fg, var(--sf-text));` plus `font-size: calc(1em * var(--sf-text-scale, 1));` (its `min-height: 44px` stays); `.a` → `font-size: calc(1em * var(--sf-text-scale, 1));` (colour stays `--sf-muted`).

`NavLinks.module.css`: `.link` → `font-size: calc(10px * var(--sf-text-scale, 1)); color: var(--sf-block-fg, var(--sf-muted));` (hover/current stay `--sf-text`; `min-height`/`min-width: 44px` stay); append:
```css
/* An owner's Alignment (block style) moves the links, not just their text. */
.nav[data-sfs-align='center'] .list { justify-content: center; }
.nav[data-sfs-align='end'] .list { justify-content: flex-end; }
.column[data-sfs-align='center'] .list { align-items: center; }
.column[data-sfs-align='end'] .list { align-items: flex-end; }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix web test -- test/builder-style-content-text.test.tsx test/builder-content-text.test.tsx test/builder-content-faq.test.tsx test/builder-content-layout.test.tsx test/builder-nav-footer.test.tsx test/text-guard.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npm --prefix web run typecheck` — Expected: no errors.

```bash
git add -- web/src/builder/blocks/Heading.tsx web/src/builder/blocks/RichText.tsx web/src/builder/blocks/Testimonial.tsx web/src/builder/blocks/FAQ.tsx web/src/builder/blocks/NavLinks.tsx web/src/builder/blocks/Columns.tsx web/src/builder/blocks/_shared/RichHtml.tsx web/src/builder/blocks/Heading.module.css web/src/builder/blocks/RichText.module.css web/src/builder/blocks/Testimonial.module.css web/src/builder/blocks/FAQ.module.css web/src/builder/blocks/NavLinks.module.css web/test/builder-style-content-text.test.tsx
git commit -m "feat(builder): style support for text blocks" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/blocks/Heading.tsx web/src/builder/blocks/RichText.tsx web/src/builder/blocks/Testimonial.tsx web/src/builder/blocks/FAQ.tsx web/src/builder/blocks/NavLinks.tsx web/src/builder/blocks/Columns.tsx web/src/builder/blocks/_shared/RichHtml.tsx web/src/builder/blocks/Heading.module.css web/src/builder/blocks/RichText.module.css web/src/builder/blocks/Testimonial.module.css web/src/builder/blocks/FAQ.module.css web/src/builder/blocks/NavLinks.module.css web/test/builder-style-content-text.test.tsx
```

---

### Task 5: Content media and layout blocks

**Depends on:** Task 3. **Wave 3.** Load `frontend-design:frontend-design` first.

**Files:**
- Modify: `web/src/builder/blocks/Section.tsx`, `Image.tsx`, `Button.tsx`, `Divider.tsx`, `Spacer.tsx`, `Video.tsx`
- Create: `web/test/builder-style-content-media.test.tsx`

**Interfaces:**
- Consumes: as Task 4.
- Produces (spec §4):
  - `Section`: `styleSupport('root', [...BOX, 'textSize', 'align', ...VIS], ['bg', 'padTop', 'padBottom', 'maxWidth'])`
  - `Image`: `styleSupport('root', [...BOX, ...VIS], ['maxWidth'])`
  - `Button`: `styleSupport('root', [...BOX, ...VIS])`
  - `Divider`: `styleSupport('root', ['maxWidth', 'align', ...VIS])`
  - `Spacer`: `styleSupport('root', [...VIS])`
  - `Video`: `styleSupport('root', [...BOX, ...VIS])`

- [ ] **Step 1: Write the failing test**

Create `web/test/builder-style-content-media.test.tsx` with the same imports, `c` and `html` helpers as Task 4's test file (copy them verbatim — `html` renders under `MantineProvider` + `MemoryRouter` + `BuilderModeProvider`, takes an optional `editing` flag here):

```tsx
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { Suspense } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { RenderDoc } from '@/builder/render.tsx';
import { BuilderModeProvider } from '@/builder/mode.ts';
import type { ComponentData } from '@/builder/types.ts';

const IMAGE = `/media/storefront-pages/media/${'a'.repeat(32)}.png`;
const c = (type: string, props: Record<string, unknown> = {}, id = type): ComponentData => ({ type, props: { id, ...props } });
function html(content: ComponentData[], editing = false) {
  const out = render(
    <MantineProvider env="test"><MemoryRouter><BuilderModeProvider value={{ editing, previewAs: null }}>
      <Suspense fallback={null}><RenderDoc doc={{ root: { props: { title: '', description: '', chrome: 'shell' } }, content }} docKey="page:test" layout="storefront" /></Suspense>
    </BuilderModeProvider></MemoryRouter></MantineProvider>,
  ).container;
  const snapshot = { html: out.innerHTML, markers: [...out.querySelectorAll('[data-sf-style]')] };
  cleanup();
  return snapshot;
}
afterEach(cleanup);

const FIXTURES: Record<string, Record<string, unknown>> = {
  Section: { padding: 'md', backgroundToken: 'surface', textToken: 'none', width: 'rail', content: [c('Heading', { text: 'In' }, 'in')] },
  Image: { src: IMAGE, alt: 'Oats in a jar', caption: 'Trail oats', width: 'rail', aspect: '16/9' },
  Button: { label: 'Shop now', href: '/', variant: 'filled', align: 'start' },
  Divider: { spacing: 'md', toneToken: 'line' },
  Spacer: { size: 'md' },
  Video: { provider: 'youtube', videoId: 'aB3_dE-fG9h', title: 'How we pack' },
};
/** An allowed style and a disallowed-only style per block. */
const STYLES: Record<string, { ok: Record<string, string>; bad: Record<string, string> }> = {
  Section: { ok: { padX: 'sm', border: 'thin', textSize: 'lg', hide: 'mobile' }, bad: { bg: 'surface', padTop: 'lg', maxWidth: 'wide' } },
  Image: { ok: { bg: 'surface', radius: 'card', hide: 'desktop' }, bad: { maxWidth: 'narrow', fg: 'text' } },
  Button: { ok: { padTop: 'sm', shadow: 'card' }, bad: { textSize: 'xl', align: 'center' } },
  Divider: { ok: { maxWidth: 'narrow', align: 'center' }, bad: { bg: 'surface', border: 'thick' } },
  Spacer: { ok: { hide: 'mobile' }, bad: { bg: 'surface', padTop: 'xl' } },
  Video: { ok: { border: 'thin', radius: 'lg' }, bad: { fg: 'text', textSize: 'sm' } },
};

describe.each(Object.keys(FIXTURES))('%s · block styles', (name) => {
  it('absent, {} and disallowed-only styles leave the DOM byte-identical', () => {
    const plain = html([c(name, FIXTURES[name])]).html;
    expect(plain).not.toContain('data-sf-style');
    expect(html([c(name, { ...FIXTURES[name], blockStyle: {} })]).html).toBe(plain);
    expect(html([c(name, { ...FIXTURES[name], blockStyle: STYLES[name]!.bad })]).html).toBe(plain);
  });
  it('an allowed style lands once, on the element carrying data-sf-block, and keeps its inline vars', () => {
    const { markers } = html([c(name, { ...FIXTURES[name], blockStyle: STYLES[name]!.ok })]);
    expect(markers).toHaveLength(1);
    expect(markers[0]!.getAttribute('data-sf-block')).toBe(name);
    expect(markers[0]!.getAttribute('data-sf-style')).toBe(name);
  });
});

it('Section keeps its own --section-* variables and classes when styled', () => {
  const plain = html([c('Section', FIXTURES.Section)]).html;
  const styled = html([c('Section', { ...FIXTURES.Section, blockStyle: { padX: 'sm' } })]).html;
  expect(styled.replace(/ data-sf-style="Section" data-sfs-px="sm"/, '')).toBe(plain);
});

it('the Image editor hint carries the style too (its root while editing)', () => {
  const { markers } = html([c('Image', { src: '', alt: '', caption: '', width: 'rail', aspect: 'auto', blockStyle: { bg: 'surface' } })], true);
  expect(markers).toHaveLength(1);
  expect(markers[0]!.tagName).toBe('P');
});

// Review Focus 2: blocks that render nothing leave nothing behind, styled or not.
it.each([
  ['Button', { label: 'Go', href: 'javascript:alert(1)', variant: 'filled', align: 'start' }],
  ['Button', { label: '  ', href: '/', variant: 'filled', align: 'start' }],
  ['Video', { provider: 'youtube', videoId: 'nope', title: 'x' }],
])('%s with nothing to show renders nothing even when styled', (name, props) => {
  expect(html([c(name, { ...props, blockStyle: { bg: 'surface', padTop: 'xl', border: 'thick' } })]).html).toBe('');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web test -- test/builder-style-content-media.test.tsx`
Expected: FAIL — no markers.

- [ ] **Step 3: Implement**

Add `import { BOX, styleSupport, VIS } from '@/builder/style/model.ts';` (and `import type { StyleAttrs } from '@/builder/define.ts';` where an inner view takes it) and:

- `Section.tsx`: `style: styleSupport('root', [...BOX, 'textSize', 'align', ...VIS], ['bg', 'padTop', 'padBottom', 'maxWidth']),`; render destructures `puck`; `<section className=… style=… data-sf-block="Section" {...puck.style}>`. Do not touch `className`/`style`.
- `Image.tsx`: `style: styleSupport('root', [...BOX, ...VIS], ['maxWidth']),`; `ImageView` takes `styleAttrs?: StyleAttrs` and spreads it on both the hint `<p … data-sf-block="Image" {...styleAttrs}>` and `<figure … data-sf-block="Image" {...styleAttrs}>`; render passes `styleAttrs={puck.style}`.
- `Button.tsx`: `style: styleSupport('root', [...BOX, ...VIS]),`; `ButtonView` takes `styleAttrs` and spreads it on `<div className={classes[align]} data-sf-block="Button" {...styleAttrs}>`.
- `Divider.tsx`: `style: styleSupport('root', ['maxWidth', 'align', ...VIS]),`; `<hr … data-sf-block="Divider" style=… {...puck.style} />`.
- `Spacer.tsx`: `style: styleSupport('root', [...VIS]),`; `<div aria-hidden data-sf-block="Spacer" style=… {...puck.style} />`.
- `Video.tsx`: `style: styleSupport('root', [...BOX, ...VIS]),`; `VideoView` takes `styleAttrs` and spreads it on `<div className={classes.frame} data-sf-block="Video" {...styleAttrs}>`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix web test -- test/builder-style-content-media.test.tsx test/builder-content-media.test.tsx test/builder-content-layout.test.tsx test/builder-content-text.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npm --prefix web run typecheck`.

```bash
git add -- web/src/builder/blocks/Section.tsx web/src/builder/blocks/Image.tsx web/src/builder/blocks/Button.tsx web/src/builder/blocks/Divider.tsx web/src/builder/blocks/Spacer.tsx web/src/builder/blocks/Video.tsx web/test/builder-style-content-media.test.tsx
git commit -m "feat(builder): style support for layout and media blocks" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/blocks/Section.tsx web/src/builder/blocks/Image.tsx web/src/builder/blocks/Button.tsx web/src/builder/blocks/Divider.tsx web/src/builder/blocks/Spacer.tsx web/src/builder/blocks/Video.tsx web/test/builder-style-content-media.test.tsx
```

---

### Task 6: Catalogue root blocks

**Depends on:** Task 3. **Wave 3.**

**Files:**
- Modify: `web/src/builder/blocks/CatalogHero.tsx`, `CategoryNav.tsx`, `SearchField.tsx`, `FeaturedProducts.tsx`
- Modify: `web/test/builder-catalogue-extras.test.tsx` (append)

**Interfaces:**
- Consumes: as Task 4.
- Produces: all four `styleSupport('root', [...BOX, ...VIS])` (no TEXT: template slots / inputs stay 16 px). **CatalogHero's template variant owns no root** (it renders the template's `CatalogHero` slot), so when — and only when — it is styled it renders `<div {...puck.style}>` around the slot; the custom variant spreads on its own `<section>` / editor hint. (Refines spec §4's "root" for that one variant; the `:empty` rule hides the div when the slot renders nothing.)

- [ ] **Step 1: Write the failing test**

Append to `web/test/builder-catalogue-extras.test.tsx` (reuses its `mount`, `c`, `screen` and mocks):

```tsx
describe('catalogue blocks · block styles', () => {
  const markers = (container: HTMLElement) => [...container.querySelectorAll('[data-sf-style]')];
  it('CatalogHero custom: style on its section; unstyled DOM unchanged', () => {
    const props = { variant: 'custom', surface: 'grid', title: 'Fresh this week', bodyHtml: '<p>Rolled Monday.</p>', imageSrc: '', imageAlt: '', align: 'start' };
    const plain = mount([c('CatalogHero', props)], '/pages/x').container.innerHTML;
    cleanup();
    expect(mount([c('CatalogHero', { ...props, blockStyle: {} })], '/pages/x').container.innerHTML).toBe(plain);
    cleanup();
    const { container } = mount([c('CatalogHero', { ...props, blockStyle: { bg: 'surface-2', radius: 'card' } })], '/pages/x');
    expect(markers(container)).toHaveLength(1);
    expect(markers(container)[0]!.getAttribute('data-sf-block')).toBe('CatalogHero');
  });
  it('CatalogHero template: one added div only when styled', () => {
    const plain = mount([c('CatalogHero', { variant: 'template', surface: 'grid' })], '/pages/x').container.innerHTML;
    cleanup();
    const { container } = mount([c('CatalogHero', { variant: 'template', surface: 'grid', blockStyle: { padTop: 'lg' } })], '/pages/x');
    const m = markers(container);
    expect(m).toHaveLength(1);
    expect(m[0]!.tagName).toBe('DIV');
    expect(m[0]!.getAttribute('data-sfs-pt')).toBe('lg');
    // The wrapped content is exactly the unstyled hero.
    expect(m[0]!.innerHTML.length).toBeGreaterThan(0);
    expect(plain).toContain(m[0]!.innerHTML);
  });
  it('CategoryNav, SearchField and FeaturedProducts: style on the data-sf-block element', async () => {
    const { container } = mount([
      c('CategoryNav', { blockStyle: { border: 'thin' } }),
      { type: 'SearchField', props: { id: 's', placeholder: '', blockStyle: { padX: 'sm', textSize: 'xl' } } },
      { type: 'FeaturedProducts', props: { id: 'f', title: 'Staff picks', source: 'picked', items: [{ productId: 7 }], categoryId: null, limit: 4, blockStyle: { shadow: 'card' } } },
    ], '/pages/x');
    await screen.findAllByRole('navigation', { name: 'Categories' });
    const byName = Object.fromEntries(markers(container).map((m) => [m.getAttribute('data-sf-style'), m]));
    expect(Object.keys(byName).sort()).toEqual(['CategoryNav', 'FeaturedProducts', 'SearchField']);
    for (const [name, el] of Object.entries(byName)) expect(el.getAttribute('data-sf-block')).toBe(name);
    // Inputs stay 16px: SearchField accepts no textSize.
    expect(byName.SearchField!.hasAttribute('data-sfs-text')).toBe(false);
  });
});
```

(If `cleanup` isn't imported at the top of the file yet, add it to the existing `@testing-library/react` import.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web test -- test/builder-catalogue-extras.test.tsx`
Expected: FAIL — no markers.

- [ ] **Step 3: Implement**

Add `import { BOX, styleSupport, VIS } from '@/builder/style/model.ts';` and `import type { StyleAttrs } from '@/builder/define.ts';`; each block gets `style: styleSupport('root', [...BOX, ...VIS]),`.

- `CatalogHero.tsx`: `CustomHero` takes `styleAttrs?: StyleAttrs` and spreads it on the hint `<p … data-sf-block="CatalogHero" {...styleAttrs}>` and on `<section … data-sf-block="CatalogHero" {...styleAttrs}>`. Render:
  ```tsx
  render: ({ variant, surface, title, bodyHtml, imageSrc, imageAlt, align, puck }) => {
    if (variant === 'custom') return <CustomHero title={title} bodyHtml={bodyHtml} imageSrc={imageSrc} imageAlt={imageAlt} align={align} styleAttrs={puck.style} />;
    const hero = <TemplateHero surface={surface === 'auto' ? autoSurface(puck.layout) : surface} />;
    // The template slot owns no element we can mark: a styled template intro gets one div (spec §4 note).
    return puck.style ? <div {...puck.style}>{hero}</div> : hero;
  },
  ```
- `CategoryNav.tsx`: `CategoryNavView({ styleAttrs }: { styleAttrs?: StyleAttrs })` spreads on `<div className={classes.wrap} data-sf-block="CategoryNav" {...styleAttrs}>`; `render: ({ puck }) => <CategoryNavView styleAttrs={puck.style} />`.
- `SearchField.tsx`: `SearchFieldView` takes `styleAttrs` → `<div className={classes.root} data-sf-block="SearchField" {...styleAttrs}>`.
- `FeaturedProducts.tsx`: `FeaturedView` takes `styleAttrs` → spread on the hint `<p>` and on `<section … data-sf-block="FeaturedProducts">`; render passes `styleAttrs={puck.style}`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix web test -- test/builder-catalogue-extras.test.tsx test/builder-catalogue.test.tsx test/builder-featured.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
git add -- web/src/builder/blocks/CatalogHero.tsx web/src/builder/blocks/CategoryNav.tsx web/src/builder/blocks/SearchField.tsx web/src/builder/blocks/FeaturedProducts.tsx web/test/builder-catalogue-extras.test.tsx
git commit -m "feat(builder): style support for catalogue blocks" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/blocks/CatalogHero.tsx web/src/builder/blocks/CategoryNav.tsx web/src/builder/blocks/SearchField.tsx web/src/builder/blocks/FeaturedProducts.tsx web/test/builder-catalogue-extras.test.tsx
```

---

### Task 7: Wrap-mode blocks (shell pieces, route-bound flows, AccountNav)

**Depends on:** Task 3. **Wave 3.**

**Files:**
- Modify (one declaration line + import each): `web/src/builder/blocks/Upsells.tsx`, `TopBar.tsx`, `NoticeBanners.tsx`, `CutoffBar.tsx`, `ContactStrip.tsx`, `Footer.tsx`; `ProductGrid.tsx`, `ProductList.tsx`, `WholesaleTable.tsx`, `ProductDetail.tsx`, `CartContents.tsx`, `CartSummary.tsx`, `CheckoutFlow.tsx`, `LoginOptions.tsx`, `OrdersList.tsx`, `OrderDetail.tsx`, `Loyalty.tsx`, `Referrals.tsx`, `Profile.tsx`, `OrderStatus.tsx`, `PaymentSuccess.tsx`, `PaymentCancel.tsx`, `OrderPlaced.tsx`, `VerifyForm.tsx`, `TrackingLookup.tsx`, `AccountNav.tsx`
- Create: `web/test/builder-style-wrap.test.tsx`

**Interfaces:**
- Consumes: `renderBlock` (Task 3), `BOX`, `VIS`, `styleSupport`.
- Produces: `Upsells`, `TopBar`, `NoticeBanners`, `CutoffBar`, `ContactStrip`, `Footer` → `styleSupport('wrap', [...BOX, ...VIS])`; the 19 route-bound blocks and `AccountNav` → `styleSupport('wrap', [...BOX])` (never `hide`, never TEXT — spec §2 #6, #8). Render functions are **not** changed.

- [ ] **Step 1: Write the failing test**

Create `web/test/builder-style-wrap.test.tsx`:

```tsx
import { isValidElement, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { BLOCKS } from '@/builder/registry.ts';
import { renderBlock } from '@/builder/style/apply.tsx';
import { BOX } from '@/builder/style/model.ts';
import type { BlockRenderContext } from '@/builder/define.ts';

const SHELL_WRAP = ['Upsells', 'TopBar', 'NoticeBanners', 'CutoffBar', 'ContactStrip', 'Footer'];
const FLOWS = ['ProductGrid', 'ProductList', 'WholesaleTable', 'ProductDetail', 'CartContents', 'CartSummary', 'CheckoutFlow',
  'LoginOptions', 'OrdersList', 'OrderDetail', 'Loyalty', 'Referrals', 'Profile', 'OrderStatus', 'PaymentSuccess',
  'PaymentCancel', 'OrderPlaced', 'VerifyForm', 'TrackingLookup', 'AccountNav'];
const ctx: BlockRenderContext = { editing: false, docKey: 'catalog', layout: 'storefront' };

/** The block's default props with every slot as a render function (renders call slots eagerly). */
function props(name: string, blockStyle?: Record<string, string>) {
  const def = BLOCKS[name]!;
  const p: Record<string, unknown> = { id: 'x', ...def.defaultProps };
  for (const s of def.slots) p[s] = () => null;
  return blockStyle ? { ...p, blockStyle } : p;
}

describe.each([...SHELL_WRAP, ...FLOWS])('%s · wrap target', (name) => {
  it('declares wrap', () => {
    expect(BLOCKS[name]!.style).toMatchObject({ target: 'wrap' });
  });
  it('unstyled: no wrapper', () => {
    const out = renderBlock(BLOCKS[name]!, props(name), ctx) as ReactElement;
    expect(isValidElement(out) && out.type === 'div' && (out.props as Record<string, unknown>)['data-sf-style']).toBeFalsy();
  });
  it('styled: one div with the marker around the unchanged render', () => {
    const out = renderBlock(BLOCKS[name]!, props(name, { bg: 'surface', padTop: 'md' }), ctx) as ReactElement<Record<string, unknown>>;
    expect(isValidElement(out) && out.type).toBe('div');
    expect(out.props).toMatchObject({ 'data-sf-style': name, 'data-sfs-bg': 'surface', 'data-sfs-pt': 'md' });
  });
});

describe('flows can never be hidden or given text controls (spec §2 #6, #8)', () => {
  it.each(FLOWS)('%s accepts exactly BOX', (name) => {
    const style = BLOCKS[name]!.style;
    expect(style && [...style.keys]).toEqual([...BOX]);
  });
  it.each(SHELL_WRAP)('%s accepts BOX and hide', (name) => {
    const style = BLOCKS[name]!.style;
    expect(style && [...style.keys]).toEqual([...BOX, 'hide']);
  });
  it('a hide on a flow never reaches the DOM', () => {
    const out = renderBlock(BLOCKS.CheckoutFlow!, props('CheckoutFlow', { hide: 'mobile' }), ctx) as ReactElement<Record<string, unknown>>;
    expect(isValidElement(out) && out.type === 'div').toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web test -- test/builder-style-wrap.test.tsx`
Expected: FAIL — `style` undefined.

- [ ] **Step 3: Implement**

In each of the six shell-wrap files: add `import { BOX, styleSupport, VIS } from '@/builder/style/model.ts';` and, after `slots: …,` in the `defineBlock` object, `style: styleSupport('wrap', [...BOX, ...VIS]),`.

In each of the 20 flow files (19 route-bound + `AccountNav`): add `import { BOX, styleSupport } from '@/builder/style/model.ts';` and `style: styleSupport('wrap', [...BOX]),`.

Before committing, open each block's render and confirm none of the wrap blocks' roots is `position: sticky/fixed` relative to the wrapper's parent (spec §15.2) — the list above is exactly spec §4's; do not add blocks to it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix web test -- test/builder-style-wrap.test.tsx test/builder-commerce.test.tsx test/builder-account.test.tsx test/builder-post-order.test.tsx test/builder-nav-footer.test.tsx test/builder-shell.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
git add -- web/src/builder/blocks/Upsells.tsx web/src/builder/blocks/TopBar.tsx web/src/builder/blocks/NoticeBanners.tsx web/src/builder/blocks/CutoffBar.tsx web/src/builder/blocks/ContactStrip.tsx web/src/builder/blocks/Footer.tsx web/src/builder/blocks/ProductGrid.tsx web/src/builder/blocks/ProductList.tsx web/src/builder/blocks/WholesaleTable.tsx web/src/builder/blocks/ProductDetail.tsx web/src/builder/blocks/CartContents.tsx web/src/builder/blocks/CartSummary.tsx web/src/builder/blocks/CheckoutFlow.tsx web/src/builder/blocks/LoginOptions.tsx web/src/builder/blocks/OrdersList.tsx web/src/builder/blocks/OrderDetail.tsx web/src/builder/blocks/Loyalty.tsx web/src/builder/blocks/Referrals.tsx web/src/builder/blocks/Profile.tsx web/src/builder/blocks/OrderStatus.tsx web/src/builder/blocks/PaymentSuccess.tsx web/src/builder/blocks/PaymentCancel.tsx web/src/builder/blocks/OrderPlaced.tsx web/src/builder/blocks/VerifyForm.tsx web/src/builder/blocks/TrackingLookup.tsx web/src/builder/blocks/AccountNav.tsx web/test/builder-style-wrap.test.tsx
git commit -m "feat(builder): wrap-mode style support for shell pieces and flows" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/blocks/Upsells.tsx web/src/builder/blocks/TopBar.tsx web/src/builder/blocks/NoticeBanners.tsx web/src/builder/blocks/CutoffBar.tsx web/src/builder/blocks/ContactStrip.tsx web/src/builder/blocks/Footer.tsx web/src/builder/blocks/ProductGrid.tsx web/src/builder/blocks/ProductList.tsx web/src/builder/blocks/WholesaleTable.tsx web/src/builder/blocks/ProductDetail.tsx web/src/builder/blocks/CartContents.tsx web/src/builder/blocks/CartSummary.tsx web/src/builder/blocks/CheckoutFlow.tsx web/src/builder/blocks/LoginOptions.tsx web/src/builder/blocks/OrdersList.tsx web/src/builder/blocks/OrderDetail.tsx web/src/builder/blocks/Loyalty.tsx web/src/builder/blocks/Referrals.tsx web/src/builder/blocks/Profile.tsx web/src/builder/blocks/OrderStatus.tsx web/src/builder/blocks/PaymentSuccess.tsx web/src/builder/blocks/PaymentCancel.tsx web/src/builder/blocks/OrderPlaced.tsx web/src/builder/blocks/VerifyForm.tsx web/src/builder/blocks/TrackingLookup.tsx web/src/builder/blocks/AccountNav.tsx web/test/builder-style-wrap.test.tsx
```

---

### Task 8: Header (pass target) and the two non-stylable blocks

**Depends on:** Task 3. **Wave 3.**

**Files:**
- Modify: `web/src/builder/blocks/Header.tsx`, `PageOutlet.tsx`, `MobileCartBar.tsx`
- Modify: `web/src/layouts/StorefrontShell.tsx` (`ShellHeaderProps`, `StorefrontHeader`), `web/src/layouts/MenuShell.tsx` (`MenuHeader`), `web/src/layouts/WebAppShell.tsx` (`WebAppHeader`)
- Modify: `web/test/builder-shell.test.tsx` (append)

**Interfaces:**
- Consumes: Task 3's `puck.style`, `StyleAttrs`.
- Produces: `Header.style = styleSupport('pass', ['bg', 'shadow', ...VIS])`; `ShellHeaderProps.styleAttrs?: StyleAttrs` spread on `<header data-sf-part="header">` (after its existing attributes; `data-sf-part` stays). `PageOutlet.style = false`, `MobileCartBar.style = false`.

- [ ] **Step 1: Write the failing test**

Append to `web/test/builder-shell.test.tsx` (reuses its `settings`, `mount`, `root`, `defaultDoc`, `PuckShell`):

```tsx
describe('PuckShell · a styled Header (block-styling spec §4 pass target)', () => {
  it.each(['storefront', 'menu', 'webapp'] as const)('%s: attributes land on <header data-sf-part="header"> only', (layout) => {
    settings(layout);
    const shell = defaultDoc('shell', layout)!;
    const content = shell.content.map((b) => (b.type === 'Header'
      ? { ...b, props: { ...b.props, blockStyle: { bg: 'surface-2', shadow: 'raised', padTop: 'lg' } } }
      : b));
    const { container } = mount(PuckShell, { schemaVersion: 1, shell: { ...shell, content }, pages: {} });
    const marked = [...container.querySelectorAll('[data-sf-style]')];
    expect(marked).toHaveLength(1);
    expect(marked[0]!.tagName).toBe('HEADER');
    expect(marked[0]!.getAttribute('data-sf-part')).toBe('header');
    expect(marked[0]!.getAttribute('data-sfs-bg')).toBe('surface-2');
    expect(marked[0]!.getAttribute('data-sfs-shadow')).toBe('raised');
    expect(marked[0]!.hasAttribute('data-sfs-pt')).toBe(false);
  });
  it('an unstyled published Header renders exactly the default shell', () => {
    settings('storefront');
    const plain = normalize(mount(PuckShell, null).container.innerHTML);
    cleanup();
    const shell = defaultDoc('shell', 'storefront')!;
    const content = shell.content.map((b) => (b.type === 'Header' ? { ...b, props: { ...b.props, blockStyle: {} } } : b));
    expect(normalize(mount(PuckShell, { schemaVersion: 1, shell: { ...shell, content }, pages: {} }).container.innerHTML)).toBe(plain);
  });
  it('PageOutlet and MobileCartBar are not stylable', async () => {
    const { BLOCKS } = await import('@/builder/registry.ts');
    expect(BLOCKS.PageOutlet!.style).toBe(false);
    expect(BLOCKS.MobileCartBar!.style).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web test -- test/builder-shell.test.tsx`
Expected: FAIL — no `[data-sf-style]`; `style` undefined.

- [ ] **Step 3: Implement**

`web/src/layouts/StorefrontShell.tsx`: add `import type { StyleAttrs } from '@/builder/define.ts';` and to `ShellHeaderProps`:

```ts
  /** A styled Header block's attributes (block-styling spec §4 `pass`), spread onto <header>. */
  styleAttrs?: StyleAttrs;
```

`StorefrontHeader({ topBar = true, search: withSearch = true, sticky = true, nav, styleAttrs }: ShellHeaderProps)` and `<header className={…} data-sf-part="header" {...styleAttrs}>`. Same for `MenuHeader` in `MenuShell.tsx` and `WebAppHeader` in `WebAppShell.tsx` (its prop type `Omit<ShellHeaderProps, 'topBar'>` already carries `styleAttrs`).

`web/src/builder/blocks/Header.tsx`: `import { styleSupport, VIS } from '@/builder/style/model.ts';`; `style: styleSupport('pass', ['bg', 'shadow', ...VIS]),` (a wrapper would end `position: sticky`; padding/border would change `--sf-bar-h`); pass `styleAttrs={puck.style}` to each of `StorefrontHeader`, `MenuHeader`, `WebAppHeader`.

`PageOutlet.tsx` and `MobileCartBar.tsx`: add `style: false,` after `slots: [],`, with a one-line comment each — PageOutlet: `// It is the page: hiding it hides every route; padding doubles <main>'s.`; MobileCartBar: `// Fixed-position, and the phone checkout path: never wrapped, never hidden.`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix web test -- test/builder-shell.test.tsx test/shell-header-options.test.tsx test/shell-parts.test.tsx test/builder-shell-fallback.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
git add -- web/src/builder/blocks/Header.tsx web/src/builder/blocks/PageOutlet.tsx web/src/builder/blocks/MobileCartBar.tsx web/src/layouts/StorefrontShell.tsx web/src/layouts/MenuShell.tsx web/src/layouts/WebAppShell.tsx web/test/builder-shell.test.tsx
git commit -m "feat(builder): Header style pass-through; PageOutlet and MobileCartBar not stylable" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/blocks/Header.tsx web/src/builder/blocks/PageOutlet.tsx web/src/builder/blocks/MobileCartBar.tsx web/src/layouts/StorefrontShell.tsx web/src/layouts/MenuShell.tsx web/src/layouts/WebAppShell.tsx web/test/builder-shell.test.tsx
```

---

### Task 9: `hidden-required` rule

**Depends on:** Task 3. **Wave 3.**

**Files:**
- Modify: `web/src/builder/rules.ts`
- Modify: `web/test/builder-rules.test.ts`

**Interfaces:**
- Consumes: `BlockDef.style` (Task 3); existing `EXACTLY_ONE`, `AT_LEAST_ONE`, `walk`, `shownSlots`, `label`, `blockDef` in `rules.ts`.
- Produces: `checkRules` issue `{ rule: 'hidden-required:<HiddenBlockType>', message, blockId: <hidden block id> }` — one per hidden block that holds (through **visible** slots, any depth) a block in the doc's `EXACTLY_ONE` list, its `AT_LEAST_ONE` list, `PageOutlet` or `MobileCartBar`. `hide` counts only when the block's `style` accepts `hide` and the value is `mobile`/`desktop`. Message: `"<Label> is hidden below 992 px but holds the <Required label>, which every shopper must see."` (`from 992 px` for desktop). Stages 3–5 extend the required set by extending the same tables.

- [ ] **Step 1: Write the failing test**

In `web/test/builder-rules.test.ts`, change the mock helper `b` to accept a style and add blocks — replace the `b` definition and the `BLOCKS` object with:

```ts
  const b = (name: string, category: 'shell' | 'catalogue' | 'commerce' | 'content', routeBound = false, slots: string[] = [], layouts: 'all' | ('storefront' | 'menu' | 'webapp')[] = 'all', style: false | { target: 'root' | 'wrap'; keys: string[] } = false) =>
    defineBlock<Record<string, unknown> & { id: string }>({
      name, label: name === 'ProductGrid' ? 'Product grid' : name, category, layouts, routeBound, slots, style: style as never,
      schema: z.object(Object.fromEntries(slots.map((s) => [s, slot()]))) as never,
      defaultProps: Object.fromEntries(slots.map((s) => [s, []])), render: () => null,
      ...(name === 'Columns' ? { visibleSlots: (p: Record<string, unknown>) => ['col1', 'col2', 'col3'].slice(0, p.columns === '3' ? 3 : 2) } : {}),
    });
  const hideable = { target: 'root' as const, keys: ['bg', 'hide'] };
  return {
    BLOCKS: {
      PageOutlet: b('PageOutlet', 'shell', true), Header: b('Header', 'shell'), NoticeBanners: b('NoticeBanners', 'shell'),
      MobileCartBar: b('MobileCartBar', 'shell'),
      ProductGrid: b('ProductGrid', 'catalogue'), ProductList: b('ProductList', 'catalogue'),
      WholesaleTable: b('WholesaleTable', 'catalogue'),
      CheckoutFlow: b('CheckoutFlow', 'commerce', true), CartContents: b('CartContents', 'commerce', true, ['summary']),
      CartSummary: b('CartSummary', 'commerce', true), Heading: b('Heading', 'content', false, [], 'all', hideable),
      Section: b('Section', 'content', false, ['content'], 'all', hideable), MenuOnly: b('MenuOnly', 'content', false, [], ['menu']),
      Columns: b('Columns', 'content', false, ['col1', 'col2', 'col3'], 'all', hideable),
      Boxed: b('Boxed', 'content', false, ['content'], 'all', { target: 'wrap', keys: ['bg'] }),
    },
  };
```

and append:

```ts
describe('hidden-required (block-styling spec §10.2)', () => {
  const rules = (doc: PuckDoc, key: Parameters<typeof checkRules>[1]) => checkRules(doc, key, 'storefront').map((i) => i.rule);
  it('a hidden Section holding the catalogue grid breaks the catalogue', () => {
    const issues = checkRules(d([c('Section', { blockStyle: { hide: 'mobile' }, content: [c('ProductGrid')] }, 's1')]), 'catalog', 'storefront');
    expect(issues.map((i) => i.rule)).toEqual(['hidden-required:Section']);
    expect(issues[0]!.message).toBe('Section is hidden below 992 px but holds the Product grid, which every shopper must see.');
    expect(issues[0]!.blockId).toBe('s1');
  });
  it('desktop wording, and a nested hidden container', () => {
    const issues = checkRules(d([c('Section', { content: [c('Section', { blockStyle: { hide: 'desktop' }, content: [c('ProductList')] }, 'inner')] })]), 'catalog', 'storefront');
    expect(issues.map((i) => i.message)).toEqual(['Section is hidden from 992 px but holds the ProductList, which every shopper must see.']);
  });
  it('Columns hiding the PageOutlet on the shell', () => {
    expect(rules(d([c('Columns', { columns: '2', blockStyle: { hide: 'mobile' }, col1: [c('PageOutlet')] })]), 'shell')).toEqual(['hidden-required:Columns']);
  });
  it('a hidden Section holding the MobileCartBar', () => {
    expect(rules(d([c('PageOutlet'), c('Section', { blockStyle: { hide: 'desktop' }, content: [c('MobileCartBar')] })]), 'shell')).toEqual(['hidden-required:Section']);
  });
  it('a hidden Heading, or a hidden Section with only content, passes', () => {
    expect(rules(d([c('Heading', { blockStyle: { hide: 'mobile' } }), c('ProductGrid')]), 'catalog')).toEqual([]);
    expect(rules(d([c('Section', { blockStyle: { hide: 'mobile' }, content: [c('Heading')] }), c('ProductGrid')]), 'catalog')).toEqual([]);
  });
  it('a required block in a non-rendered column is exactly-one only, never hidden-required', () => {
    expect(rules(d([c('Columns', { columns: '2', blockStyle: { hide: 'mobile' }, col3: [c('PageOutlet')] })]), 'shell')).toEqual(['exactly-one:PageOutlet']);
  });
  it('a hide the block does not accept (or an unknown value) counts for nothing', () => {
    expect(rules(d([c('Boxed', { blockStyle: { hide: 'mobile' }, content: [c('ProductGrid')] })]), 'catalog')).toEqual([]);
    expect(rules(d([c('Section', { blockStyle: { hide: 'always' }, content: [c('ProductGrid')] })]), 'catalog')).toEqual([]);
  });
  it('the cart: a hidden Section around CartContents', () => {
    expect(rules(d([c('Section', { blockStyle: { hide: 'mobile' }, content: [c('CartContents', { summary: [c('CartSummary')] })] })]), 'cart')).toEqual(['hidden-required:Section']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web test -- test/builder-rules.test.ts`
Expected: FAIL — the new cases return `[]`.

- [ ] **Step 3: Implement**

In `web/src/builder/rules.ts` add `isRecord` to the `@/builder/types.ts` import and add above `checkRules`:

```ts
/** Blocks a shopper must always be able to reach, whatever the doc (spec §10.2). */
const ALWAYS_REQUIRED: readonly string[] = ['PageOutlet', 'MobileCartBar'];

function requiredOn(docKey: DocKey): ReadonlySet<string> {
  const anyOf = own(AT_LEAST_ONE as Readonly<Record<string, readonly string[]>>, docKey) ?? [];
  return new Set([...(own(EXACTLY_ONE, docKey) ?? []), ...anyOf, ...ALWAYS_REQUIRED]);
}

/** The block's own (allowed, valid) `hide`, or null. `props` is untrusted. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hiddenAs(def: BlockDef<any>, props: Record<string, unknown>): 'mobile' | 'desktop' | null {
  const style = props.blockStyle;
  if (!def.style || !def.style.keys.includes('hide') || !isRecord(style)) return null;
  return style.hide === 'mobile' || style.hide === 'desktop' ? style.hide : null;
}

/** The first required block inside `item`'s visible slots, at any depth. */
function requiredInside(item: ComponentData, required: ReadonlySet<string>): string | null {
  const def = blockDef(item.type);
  if (!def) return null;
  const hits: string[] = [];
  for (const s of shownSlots(def, item.props)) {
    const children = item.props[s];
    if (Array.isArray(children)) walk(children as ComponentData[], (c) => { if (required.has(c.type)) hits.push(c.type); });
  }
  return hits[0] ?? null;
}
```

In `checkRules`, after the `anyOf` block and before `return issues;`:

```ts
  // A hidden block may not hold anything a shopper must see (spec §10.2): walk what renders.
  const required = requiredOn(docKey);
  walk(doc.content, (c) => {
    const def = blockDef(c.type);
    const hide = def ? hiddenAs(def, c.props) : null;
    if (!def || !hide) return;
    const inner = requiredInside(c, required);
    if (inner === null) return;
    issues.push({
      docKey,
      rule: `hidden-required:${c.type}`,
      message: `${label(c.type)} is hidden ${hide === 'mobile' ? 'below' : 'from'} 992 px but holds the ${label(inner)}, which every shopper must see.`,
      blockId: c.props.id,
    });
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix web test -- test/builder-rules.test.ts test/builder-guard.test.ts test/builder-visible-slots.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
git add -- web/src/builder/rules.ts web/test/builder-rules.test.ts
git commit -m "feat(builder): hidden-required rule — a hidden block may not hold a required one" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/rules.ts web/test/builder-rules.test.ts
```

---

### Task 10: Editor Style panel (UI only)

**Depends on:** Tasks 1, 3. **Wave 3.** Load `frontend-design:frontend-design` first.

**Files:**
- Create: `web/src/builder/editor/custom-fields/style-model.ts`
- Create: `web/src/builder/editor/custom-fields/style.tsx`
- Create: `web/src/builder/editor/custom-fields/style.module.css`
- Create: `web/src/builder/editor/style-ghost.css`
- Create: `web/test/builder-editor-style-field.test.tsx`

**Interfaces:**
- Consumes: `STYLE_KEYS`, `STYLE_KEY_ORDER`, `STYLE_TOKENS`, `STYLE_SPACE`, `BlockStyle`, `StyleKey`, `StyleSupport` (Task 1); `STYLE_LABELS`; `AnyBlock` (Task 3); existing `tokenLabel` (`palette-token.tsx`), `onRadioGroupKeyDown`, `radioTabIndex` (`roving.ts`), `fields.module.css` classes `field`, `label`, `swatches`, `swatch`.
- Produces:
  - `style-model.ts`: `STYLE_GROUPS`, `groupsFor(support)`, `interface StyleOption { value: string | undefined; label: string; title?: string }`, `optionsFor(key: StyleKey): StyleOption[]`, `setStyleKey(style, key, value, support): BlockStyle | undefined`, `countSet(style, support): number`, `type Rgb = [number, number, number]`, `parseCssColor(s: string): Rgb | null`, `contrastRatio(a: Rgb, b: Rgb): number`, `formatRatio(r: number): string`.
  - `style.tsx`: `styleField(def: AnyBlock): CustomField<BlockStyle | undefined>` (throws for a non-stylable def). Panel root `<details data-sf-style-panel="">`; each row a `role="radiogroup"` named by its `STYLE_LABELS` label; row reset buttons `aria-label="Reset <label>"`; header button **Reset style**. Imports `style-ghost.css` (so the canvas ghost ships with the editor chunk only).

- [ ] **Step 1: Write the failing test**

Create `web/test/builder-editor-style-field.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { BOX, styleSupport, TEXT, VIS, type StyleSupport } from '@/builder/style/model.ts';
import { contrastRatio, countSet, formatRatio, optionsFor, parseCssColor, setStyleKey } from '@/builder/editor/custom-fields/style-model.ts';
import { styleField } from '@/builder/editor/custom-fields/style.tsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const make = (name: string, style: StyleSupport | false) => defineBlock<{ id: string }>({
  name, label: name, category: 'content', layouts: 'all', routeBound: false, slots: [], style,
  schema: z.object({}), defaultProps: {}, render: () => null,
});
const heading = make('Heading', styleSupport('root', [...BOX, 'fg', 'textSize', ...VIS]));
const flow = make('CheckoutFlow', styleSupport('wrap', [...BOX]));

function show(def: ReturnType<typeof make>, value: unknown, onChange = vi.fn()) {
  const field = styleField(def);
  render(<>{field.render({ field, name: 'blockStyle', id: 'f', value, onChange, readOnly: false } as never)}</>);
  const summary = document.querySelector('[data-sf-style-panel] > summary') as HTMLElement;
  if (!(summary.parentElement as HTMLDetailsElement).open) fireEvent.click(summary);
  return onChange;
}

describe('style-model', () => {
  const s = styleSupport('root', [...BOX, ...TEXT, ...VIS]);
  it('setStyleKey writes canonical order, drops disallowed, returns undefined when empty', () => {
    expect(Object.keys(setStyleKey({ hide: 'mobile' }, 'bg', 'surface', s)!)).toEqual(['bg', 'hide']);
    expect(setStyleKey({ bg: 'surface' }, 'bg', undefined, s)).toBeUndefined();
    expect(setStyleKey({ bg: 'surface' }, 'align', 'center', styleSupport('root', ['bg']))).toEqual({ bg: 'surface' });
  });
  it('countSet counts allowed keys only', () => {
    expect(countSet({ bg: 'surface', align: 'end' }, styleSupport('root', ['bg']))).toBe(1);
    expect(countSet(undefined, s)).toBe(0);
  });
  it('spacing chips say the size and the phone cap', () => {
    const lg = optionsFor('padTop').find((o) => o.value === 'lg')!;
    expect(lg).toMatchObject({ label: 'L', title: 'L — 40 px, 24 px on phones' });
    expect(optionsFor('padX').find((o) => o.value === 'xl')!.title).toBe('XL — 64 px, 16 px on phones');
    expect(optionsFor('padTop')[0]).toEqual({ value: undefined, label: 'Default', title: 'Default — the template decides' });
  });
  it('visibility options are labelled honestly', () => {
    expect(optionsFor('hide').map((o) => o.label)).toEqual(['Shown everywhere', 'Hide below 992 px (phones and tablets)', 'Hide from 992 px (desktop)']);
  });
  // Review Focus 3: unparseable colours give no ratio.
  it.each([
    ['rgb(29, 36, 51)', [29, 36, 51]], ['rgb(29 36 51)', [29, 36, 51]], ['rgba(29, 36, 51, 1)', [29, 36, 51]],
    ['color(srgb 1 0.5 0)', [255, 127.5, 0]],
  ])('parses %s', (s, rgb) => expect(parseCssColor(s)).toEqual(rgb));
  it.each(['', 'oklch(0.7 0.1 200)', 'color-mix(in srgb, red 50%, blue)', 'rgba(0, 0, 0, 0.5)', 'rgb(0 0 0 / 40%)', 'transparent', 'var(--sf-bg)'])('refuses %j', (s) => {
    expect(parseCssColor(s)).toBeNull();
  });
  it('WCAG contrast maths', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5);
    expect(formatRatio(4.4999)).toBe('4.4 : 1');
    expect(formatRatio(3.14)).toBe('3.1 : 1');
  });
});

describe('styleField', () => {
  it('throws for a block that is not stylable', () => {
    expect(() => styleField(make('PageOutlet', false))).toThrow();
  });
  it('is collapsed by default and says how many settings are set', () => {
    // Open state is remembered per block type for the session: use a type no other test opens.
    const field = styleField(make('Fresh', styleSupport('root', [...BOX])));
    render(<>{field.render({ field, name: 'blockStyle', id: 'f', value: { bg: 'surface', padTop: 'lg' }, onChange: vi.fn(), readOnly: false } as never)}</>);
    const details = document.querySelector('[data-sf-style-panel]') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')!.textContent).toBe('Style · 2 set');
  });
  it('shows only the rows the block accepts', () => {
    show(heading, undefined);
    expect(screen.getByRole('radiogroup', { name: 'Background' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Visibility' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Alignment' })).toBeNull();
    cleanup();
    show(flow, undefined);
    expect(screen.queryByRole('radiogroup', { name: 'Visibility' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Text size' })).toBeNull();
  });
  it('every row starts at Default; picking a swatch changes one key', () => {
    const onChange = show(heading, { padTop: 'lg' });
    const bg = screen.getByRole('radiogroup', { name: 'Background' });
    expect(within(bg).getByRole('radio', { name: 'Default' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(bg).getByRole('radio', { name: 'Surface 2' }));
    expect(onChange).toHaveBeenLastCalledWith({ bg: 'surface-2', padTop: 'lg' });
  });
  it('a row reset clears one key; Reset style clears all in one change', () => {
    const onChange = show(heading, { bg: 'surface', padTop: 'lg' });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Padding top' }));
    expect(onChange).toHaveBeenLastCalledWith({ bg: 'surface' });
    onChange.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Reset style' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
  it('border colour and style wait for a width', () => {
    show(heading, undefined);
    for (const r of within(screen.getByRole('radiogroup', { name: 'Border colour' })).getAllByRole('radio')) expect(r).toBeDisabled();
    cleanup();
    show(heading, { border: 'thin' });
    expect(within(screen.getByRole('radiogroup', { name: 'Border colour' })).getAllByRole('radio')[1]).toBeEnabled();
  });
  it('arrow keys move through a chip row and select', () => {
    const onChange = show(heading, { padTop: 'sm' });
    const row = screen.getByRole('radiogroup', { name: 'Padding top' });
    fireEvent.keyDown(row, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith({ padTop: 'md' });
  });
  it('warns about low contrast from the resolved colours, and says nothing when a colour cannot be read', () => {
    // jsdom resolves no var(): the probe names its token in data-sf-probe, and the stub answers per token.
    const COLOURS: Record<string, string> = { 'surface-2': 'rgb(40, 40, 40)', muted: 'rgb(70, 70, 70)', primary: 'oklch(0.5 0 0)' };
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => ({
      color: COLOURS[(el as HTMLElement).dataset.sfProbe ?? ''] ?? '',
    }) as unknown as CSSStyleDeclaration);
    show(heading, { bg: 'surface-2', fg: 'muted' });
    expect(screen.getByText(/^Low contrast \(\d\.\d : 1\)$/)).toBeInTheDocument();
    cleanup();
    show(heading, { bg: 'primary', fg: 'muted' });
    expect(screen.queryByText(/Low contrast/)).toBeNull();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web test -- test/builder-editor-style-field.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

Create `web/src/builder/editor/custom-fields/style-model.ts`:

```ts
import { STYLE_KEY_ORDER, STYLE_KEYS, STYLE_SPACE, STYLE_TOKENS, type BlockStyle, type StyleKey, type StyleSupport } from '@/builder/style/model.ts';

/** Spec §9.1 row groups, in panel order. */
export const STYLE_GROUPS: ReadonlyArray<{ title: string; keys: readonly StyleKey[] }> = [
  { title: 'Colours', keys: ['bg', 'fg'] },
  { title: 'Spacing', keys: ['padTop', 'padBottom', 'padX', 'marginTop', 'marginBottom'] },
  { title: 'Border', keys: ['border', 'borderColor', 'borderStyle'] },
  { title: 'Shape', keys: ['radius', 'shadow'] },
  { title: 'Text', keys: ['textSize', 'align'] },
  { title: 'Width', keys: ['maxWidth'] },
  { title: 'Visibility', keys: ['hide'] },
];

export function groupsFor(support: StyleSupport) {
  return STYLE_GROUPS.map((g) => ({ ...g, keys: g.keys.filter((k) => support.keys.includes(k)) })).filter((g) => g.keys.length > 0);
}

export interface StyleOption { value: string | undefined; label: string; title?: string }

const DEFAULT: StyleOption = { value: undefined, label: 'Default', title: 'Default — the template decides' };
const SHORT: Record<string, string> = { none: '0', xs: 'XS', sm: 'S', md: 'M', lg: 'L', xl: 'XL' };
const PX: Record<string, number> = { none: 0, xs: 8, sm: 16, md: 24, lg: 40, xl: 64 };
/** Phone caps (spec §7), below 48em. */
const PHONE_BLOCK: Record<string, number> = { lg: 24, xl: 40 };
const PHONE_X: Record<string, number> = { md: 16, lg: 16, xl: 16 };
const SPACE_KEYS: ReadonlySet<StyleKey> = new Set(['padTop', 'padBottom', 'padX', 'marginTop', 'marginBottom']);
const COLOUR_KEYS: ReadonlySet<StyleKey> = new Set(['bg', 'fg', 'borderColor']);

const FIXED: Partial<Record<StyleKey, StyleOption[]>> = {
  border: [{ value: 'thin', label: 'Thin', title: '1 px' }, { value: 'medium', label: 'Medium', title: '2 px' }, { value: 'thick', label: 'Thick', title: '4 px' }],
  borderStyle: [{ value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' }],
  radius: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'S' }, { value: 'md', label: 'M' }, { value: 'lg', label: 'L' }, { value: 'card', label: 'Card', title: 'The template’s card corners' }, { value: 'pill', label: 'Pill', title: 'The template’s pill corners' }],
  shadow: [{ value: 'card', label: 'Card', title: 'The template’s card shadow' }, { value: 'raised', label: 'Raised', title: 'The template’s hover shadow' }],
  textSize: [{ value: 'sm', label: 'Small' }, { value: 'lg', label: 'Large' }, { value: 'xl', label: 'Extra large', title: 'Extra large (large on phones)' }],
  align: [{ value: 'start', label: 'Start' }, { value: 'center', label: 'Centre' }, { value: 'end', label: 'End' }],
  maxWidth: [{ value: 'narrow', label: 'Narrow', title: '36 rem' }, { value: 'text', label: 'Text', title: '68 characters' }, { value: 'wide', label: 'Wide', title: '60 rem' }],
};

export function optionsFor(key: StyleKey): StyleOption[] {
  if (key === 'hide') {
    return [
      { value: undefined, label: 'Shown everywhere' },
      { value: 'mobile', label: 'Hide below 992 px (phones and tablets)' },
      { value: 'desktop', label: 'Hide from 992 px (desktop)' },
    ];
  }
  if (SPACE_KEYS.has(key)) {
    return [DEFAULT, ...STYLE_SPACE.map((step) => {
      const phone = key === 'padX' ? PHONE_X[step] : PHONE_BLOCK[step];
      const title = `${SHORT[step]} — ${PX[step]} px${phone === undefined ? '' : `, ${phone} px on phones`}`;
      return { value: step, label: SHORT[step]!, title };
    })];
  }
  if (COLOUR_KEYS.has(key)) return [DEFAULT, ...STYLE_TOKENS.map((t) => ({ value: t, label: t }))];
  return [DEFAULT, ...(FIXED[key] ?? [])];
}

/** One key changed; allowed keys only, canonical order; an empty result is `undefined` (never `{}`). */
export function setStyleKey(style: BlockStyle | undefined, key: StyleKey, value: string | undefined, support: StyleSupport): BlockStyle | undefined {
  const next: Record<string, string> = {};
  for (const k of STYLE_KEY_ORDER) {
    if (!support.keys.includes(k)) continue;
    const v = k === key ? value : style?.[k];
    if (v !== undefined && (STYLE_KEYS[k] as readonly string[]).includes(v)) next[k] = v;
  }
  return Object.keys(next).length > 0 ? (next as BlockStyle) : undefined;
}

export const countSet = (style: BlockStyle | undefined, support: StyleSupport): number =>
  support.keys.filter((k) => style?.[k] !== undefined).length;

export type Rgb = [number, number, number];

/** An opaque sRGB colour as getComputedStyle reports it, else null (no hint beats a wrong one). */
export function parseCssColor(s: string): Rgb | null {
  const t = s.trim();
  const opaque = (a: string | undefined) => a === undefined || (a.endsWith('%') ? Number.parseFloat(a) >= 100 : Number(a) >= 1);
  let m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i.exec(t);
  if (m) return opaque(m[4]) ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/i.exec(t);
  if (m) return opaque(m[4]) ? [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255] : null;
  return null;
}

function luminance([r, g, b]: Rgb): number {
  const f = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Rounded down, so 4.49 never reads as a passing 4.5. */
export const formatRatio = (r: number): string => `${(Math.floor(r * 10) / 10).toFixed(1)} : 1`;
```

Create `web/src/builder/editor/custom-fields/style.tsx`:

```tsx
import { useMemo, useState, type CSSProperties } from 'react';
import type { CustomField } from '@puckeditor/core';
import type { AnyBlock } from '@/builder/define.ts';
import type { BlockStyle, StyleKey, StyleSupport } from '@/builder/style/model.ts';
import { STYLE_LABELS } from '@/builder/style/labels.ts';
import { tokenLabel } from '@/builder/editor/custom-fields/palette-token.tsx';
import { onRadioGroupKeyDown, radioTabIndex } from '@/builder/editor/custom-fields/roving.ts';
import {
  contrastRatio, countSet, formatRatio, groupsFor, optionsFor, parseCssColor, setStyleKey, type Rgb, type StyleOption,
} from '@/builder/editor/custom-fields/style-model.ts';
import fieldStyles from '@/builder/editor/custom-fields/fields.module.css';
import styles from '@/builder/editor/custom-fields/style.module.css';
import '@/builder/editor/style-ghost.css';

const COLOURS: ReadonlySet<StyleKey> = new Set(['bg', 'fg', 'borderColor']);
const NEEDS_WIDTH: ReadonlySet<StyleKey> = new Set(['borderColor', 'borderStyle']);
const SIDE: Partial<Record<StyleKey, 'top' | 'bottom' | 'x' | 'above' | 'below'>> = {
  padTop: 'top', padBottom: 'bottom', padX: 'x', marginTop: 'above', marginBottom: 'below',
};
const RADIUS_PREVIEW: Record<string, string> = {
  none: '0', sm: 'var(--mantine-radius-sm)', md: 'var(--mantine-radius-md)', lg: 'var(--mantine-radius-lg)', card: 'var(--sf-card-radius)', pill: 'var(--sf-pill-radius)',
};
const SHADOW_PREVIEW: Record<string, string> = { card: 'var(--sf-card-shadow)', raised: 'var(--sf-card-shadow-hover)' };
const TEXT_PREVIEW: Record<string, string> = { sm: '0.8rem', lg: '1.05rem', xl: '1.2rem' };

/** Open/closed per block type, for this editor session only (spec §9.1). */
const openByType = new Map<string, boolean>();

/** A token's colour as the shop resolves it right now (a probe element: custom properties read raw). */
function resolveToken(token: string): Rgb | null {
  if (typeof document === 'undefined') return null;
  const probe = document.createElement('span');
  probe.style.color = `var(--sf-${token})`;
  probe.dataset.sfProbe = token;
  probe.hidden = true;
  document.body.appendChild(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return parseCssColor(colour ?? '');
}

function chipStyle(key: StyleKey, value: string | undefined): CSSProperties | undefined {
  if (value === undefined) return undefined;
  if (key === 'radius') return { borderRadius: RADIUS_PREVIEW[value] };
  if (key === 'shadow') return { boxShadow: SHADOW_PREVIEW[value] };
  if (key === 'textSize') return { fontSize: TEXT_PREVIEW[value] };
  return undefined;
}

function SideDiagram({ side }: { side: NonNullable<(typeof SIDE)[StyleKey]> }) {
  const lines = {
    top: <line x1="6" y1="7" x2="22" y2="7" />, bottom: <line x1="6" y1="21" x2="22" y2="21" />,
    x: <><line x1="7" y1="6" x2="7" y2="22" /><line x1="21" y1="6" x2="21" y2="22" /></>,
    above: <line x1="4" y1="2" x2="24" y2="2" />, below: <line x1="4" y1="26" x2="24" y2="26" />,
  }[side];
  return (
    <svg className={styles.diagram} viewBox="0 0 28 28" aria-hidden="true">
      <rect x="4" y="4" width="20" height="20" rx="2" className={styles.diagramBox} />
      <g className={styles.diagramSide}>{lines}</g>
    </svg>
  );
}

interface RowProps { styleKey: StyleKey; value: string | undefined; disabled: boolean; onPick: (v: string | undefined) => void }

function Row({ styleKey, value, disabled, onPick }: RowProps) {
  const label = STYLE_LABELS[styleKey];
  const options: StyleOption[] = optionsFor(styleKey);
  const checked = options.findIndex((o) => o.value === value);
  const colour = COLOURS.has(styleKey);
  const side = SIDE[styleKey];
  return (
    <div className={styles.row}>
      <div className={styles.rowHead}>
        <span className={fieldStyles.label}>{label}</span>
        {value !== undefined && styleKey !== 'hide' ? (
          <button type="button" className={styles.reset} aria-label={`Reset ${label}`} title={`Reset ${label}`} onClick={() => onPick(undefined)}>×</button>
        ) : null}
      </div>
      <div className={styles.control}>
        {side ? <SideDiagram side={side} /> : null}
        <div
          role="radiogroup"
          aria-label={label}
          aria-disabled={disabled || undefined}
          className={colour ? fieldStyles.swatches : styleKey === 'hide' ? styles.stack : styles.chips}
          onKeyDown={(e) => { if (!disabled) onRadioGroupKeyDown(e, options.length, checked, (i) => onPick(options[i]!.value)); }}
        >
          {options.map((o, i) => {
            const name = colour ? (o.value === undefined ? 'Default' : tokenLabel(o.value)) : o.label;
            return (
              <button
                key={o.value ?? 'default'}
                type="button"
                role="radio"
                aria-checked={i === checked}
                aria-label={colour ? name : undefined}
                title={o.title ?? name}
                tabIndex={radioTabIndex(i, checked)}
                disabled={disabled}
                className={colour ? fieldStyles.swatch : styles.chip}
                data-empty={colour && o.value === undefined ? '' : undefined}
                style={colour ? (o.value === undefined ? undefined : { background: `var(--sf-${o.value})` }) : chipStyle(styleKey, o.value)}
                onClick={() => onPick(o.value)}
              >
                {colour ? null : styleKey === 'textSize' && o.value !== undefined ? (
                  <><span aria-hidden="true">A</span><span className={styles.visuallyHidden}>{o.label}</span></>
                ) : o.label}
              </button>
            );
          })}
        </div>
      </div>
      {disabled ? <p className={styles.note}>Pick a border width first.</p> : null}
    </div>
  );
}

function ContrastHint({ bg, fg }: { bg?: string; fg?: string }) {
  const ratio = useMemo(() => {
    if (!fg) return null;
    const a = resolveToken(bg ?? 'bg');
    const b = resolveToken(fg);
    return a && b ? contrastRatio(a, b) : null;
  }, [bg, fg]);
  if (ratio === null || !Number.isFinite(ratio) || ratio >= 4.5) return null;
  return <p className={styles.warn} role="status">{`Low contrast (${formatRatio(ratio)})`}</p>;
}

interface PanelProps { id: string; name: string; support: StyleSupport; value: BlockStyle | undefined; onChange: (v: BlockStyle | undefined) => void; readOnly: boolean }

function StylePanel({ id, name, support, value, onChange, readOnly }: PanelProps) {
  const [open, setOpen] = useState(() => openByType.get(name) ?? false);
  const count = countSet(value, support);
  const pick = (key: StyleKey) => (v: string | undefined) => onChange(setStyleKey(value, key, v, support));
  // Controlled: React owns `open` (Enter/Space on a summary fire click too), remembered per block type.
  const toggle = () => { const next = !open; openByType.set(name, next); setOpen(next); };
  return (
    <details className={`${fieldStyles.field} ${styles.panel}`} id={id} data-sf-style-panel="" open={open}>
      <summary className={styles.summary} onClick={(e) => { e.preventDefault(); toggle(); }}>
        {count > 0 ? `Style · ${count} set` : 'Style'}
      </summary>
      <fieldset className={styles.body} disabled={readOnly}>
        <div className={styles.bar}>
          <span className={styles.barNote}>Template default unless set</span>
          {count > 0 ? <button type="button" className={styles.resetAll} onClick={() => onChange(undefined)}>Reset style</button> : null}
        </div>
        {groupsFor(support).map((g) => (
          <section key={g.title} className={styles.group} aria-label={g.title}>
            <h4 className={styles.groupTitle}>{g.title}</h4>
            {g.keys.map((k) => (
              <Row key={k} styleKey={k} value={value?.[k]} disabled={NEEDS_WIDTH.has(k) && value?.border === undefined} onPick={pick(k)} />
            ))}
            {g.title === 'Colours' ? <ContrastHint bg={value?.bg} fg={value?.fg} /> : null}
          </section>
        ))}
      </fieldset>
    </details>
  );
}

/** Spec §9.1: the Style group, appended last by blockFields for every stylable block. */
export function styleField(def: AnyBlock): CustomField<BlockStyle | undefined> {
  const support = def.style;
  if (!support) throw new Error(`[builder] ${def.name} is not stylable`);
  return {
    type: 'custom',
    label: 'Style',
    render: ({ id, value, onChange, readOnly }) => (
      <StylePanel id={id} name={def.name} support={support} value={value} onChange={onChange} readOnly={Boolean(readOnly)} />
    ),
  };
}
```

Chip accessible names equal the option label ("L", "Card", "Large", "Hide below 992 px (phones and tablets)"); text-size chips show an "A" glyph at their scale with the label visually hidden. `import { useMemo, useState, type CSSProperties } from 'react';` is all the React the file needs.

Create `web/src/builder/editor/custom-fields/style.module.css` — editor tokens only (`--sfb-*`, inherited from `fields.module.css`'s `.field`); the one exception is chip *previews* (radius/shadow/swatches) which show the shop's own tokens by design:

```css
.panel { display: block; }
.summary { cursor: pointer; font-weight: 600; color: var(--sfb-ink); min-block-size: 32px; display: flex; align-items: center; }
.body { border: 0; margin: 0; padding: 8px 0 0; display: grid; gap: 14px; min-inline-size: 0; }
.bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.barNote { color: var(--sfb-muted); font-size: 12px; }
.resetAll, .reset {
  border: 1px solid var(--sfb-line-strong); background: transparent; color: var(--sfb-ink);
  border-radius: var(--sfb-radius); cursor: pointer; font: inherit;
}
.resetAll { padding: 4px 10px; font-size: 12px; }
.reset { inline-size: 24px; block-size: 24px; line-height: 1; }
.group { display: grid; gap: 10px; }
.groupTitle { margin: 0; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--sfb-muted); }
.row { display: grid; gap: 6px; }
.rowHead { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.control { display: flex; align-items: flex-start; gap: 8px; min-inline-size: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; min-inline-size: 0; }
.stack { display: grid; gap: 4px; inline-size: 100%; }
.chip {
  min-block-size: 32px; min-inline-size: 32px; padding: 0 8px; font: inherit; font-size: 12px;
  color: var(--sfb-ink); background: var(--sfb-surface, #fff); border: 1px solid var(--sfb-line-strong);
  border-radius: var(--sfb-radius); cursor: pointer; text-align: start;
}
.chip[aria-checked='true'] { border-color: var(--sfb-accent); box-shadow: inset 0 0 0 1px var(--sfb-accent); }
.chip:disabled { opacity: 0.45; cursor: not-allowed; }
.chip:focus-visible, .reset:focus-visible, .resetAll:focus-visible { outline: 2px solid var(--sfb-accent); outline-offset: 2px; }
.diagram { flex: none; inline-size: 28px; block-size: 28px; }
.diagramBox { fill: none; stroke: var(--sfb-line-strong); }
.diagramSide { stroke: var(--sfb-accent); stroke-width: 2.5; stroke-linecap: round; }
.note { margin: 0; font-size: 12px; color: var(--sfb-muted); }
.warn { margin: 0; font-size: 12px; color: var(--sfb-warn-ink, #6b4a00); }
.visuallyHidden { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (pointer: coarse) {
  /* Every chip, swatch and reset is a 44 px target on touch (spec §9.1), swatches included. */
  .chip, .reset, .resetAll, .summary, .panel [role='radio'] { min-block-size: 44px; min-inline-size: 44px; }
}
```

If `fields.module.css` lacks a `--sfb-surface` / `--sfb-accent` / `--sfb-warn-ink` token, use the fallbacks shown or the nearest existing `--sfb-*` token — never `--sf-*` colours for editor chrome. Do not edit `fields.module.css` or `palette-token.tsx`; the Style panel reuses their classes and helpers as they are.

Create `web/src/builder/editor/style-ghost.css` (plain CSS, editor chunk only — attribute selectors, neutral editor colours, never `--sf-*`):

```css
/*
 * Editor canvas only (block-styling spec §9.1): a block hidden at this width stays visible, ghosted,
 * so it can still be selected. Exact previews and the shop emit data-sfs-hide instead and hide for real.
 */
@media (max-width: 61.99em) {
  [data-sf-style][data-sfs-ghost='mobile'] { opacity: 0.4; outline: 2px dashed #5b6475; outline-offset: -2px; }
  [data-sf-style][data-sfs-ghost='mobile']:not([data-sf-part]) { position: relative; }
  [data-sf-style][data-sfs-ghost='mobile']::after {
    content: 'Hidden on this width'; position: absolute; inset-block-start: 4px; inset-inline-end: 4px; z-index: 1;
    padding: 2px 6px; font: 600 11px/1.4 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    color: #1d2433; background: #f3f5f8; border: 1px solid #b8bfcc; border-radius: 4px; pointer-events: none;
  }
}
@media (min-width: 62em) {
  [data-sf-style][data-sfs-ghost='desktop'] { opacity: 0.4; outline: 2px dashed #5b6475; outline-offset: -2px; }
  [data-sf-style][data-sfs-ghost='desktop']:not([data-sf-part]) { position: relative; }
  [data-sf-style][data-sfs-ghost='desktop']::after {
    content: 'Hidden on this width'; position: absolute; inset-block-start: 4px; inset-inline-end: 4px; z-index: 1;
    padding: 2px 6px; font: 600 11px/1.4 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    color: #1d2433; background: #f3f5f8; border: 1px solid #b8bfcc; border-radius: 4px; pointer-events: none;
  }
}
```

(`position: relative` is skipped on `[data-sf-part]` — the Header — because it would end `position: sticky`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix web test -- test/builder-editor-style-field.test.tsx test/builder-editor-custom-fields.test.tsx test/builder-isolation-plugin.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
git add -- web/src/builder/editor/custom-fields/style-model.ts web/src/builder/editor/custom-fields/style.tsx web/src/builder/editor/custom-fields/style.module.css web/src/builder/editor/style-ghost.css web/test/builder-editor-style-field.test.tsx
git commit -m "feat(editor): Style panel with swatches, chips, resets and contrast hint" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/editor/custom-fields/style-model.ts web/src/builder/editor/custom-fields/style.tsx web/src/builder/editor/custom-fields/style.module.css web/src/builder/editor/style-ghost.css web/test/builder-editor-style-field.test.tsx
```

---

### Task 11: Editor wiring — fields and normalisation

**Depends on:** Task 10 (and 3). **Wave 4** (parallel with Task 12).

**Files:**
- Modify: `web/src/builder/editor/derive-fields.ts` (`blockFields`)
- Modify: `web/src/builder/editor/prepare.ts` (`prepareProps`)
- Modify: `web/test/builder-editor-fields.test.ts` (append)
- Create: `web/test/builder-editor-style-prepare.test.ts`

**Interfaces:**
- Consumes: `styleField(def)` (Task 10), `parseBlockStyle` (Task 1), `blockDef` (rules.ts).
- Produces: every stylable block's fields end with `blockStyle` (after overrides); `prepareProps(name, props)` normalises `blockStyle` for every block (drop unknown/disallowed/invalid, canonical order, `{}`/`undefined` → key removed) and returns the **same object** when nothing changes.

- [ ] **Step 1: Write the failing tests**

Append to `web/test/builder-editor-fields.test.ts` (inside the top-level `describe` or as a new one; `byName` and `BLOCKS` are in scope):

```ts
describe('the Style group (block-styling spec §9.1)', () => {
  it.each(Object.keys(BLOCKS))('%s: fields end with blockStyle exactly when the block is stylable', (name) => {
    const keys = Object.keys(byName[name]!);
    if (BLOCKS[name]!.style) expect(keys.at(-1)).toBe('blockStyle');
    else expect(keys).not.toContain('blockStyle');
  });
  it('blockStyle is a custom field and is never a schema key', () => {
    expect(byName.Heading!.blockStyle).toMatchObject({ type: 'custom', label: 'Style' });
    for (const def of Object.values(BLOCKS)) expect(schemaKeys(def)).not.toContain('blockStyle');
  });
});
```

Create `web/test/builder-editor-style-prepare.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { prepareDoc, prepareProps } from '@/builder/editor/prepare.ts';
import type { PuckDoc } from '@/builder/types.ts';

describe('prepareProps · blockStyle (spec §9.2)', () => {
  it('leaves props without blockStyle untouched (same object)', () => {
    const p = { id: 'h', text: 'Hi' };
    expect(prepareProps('Heading', p)).toBe(p);
  });
  it('keeps an already-clean style by identity', () => {
    const p = { id: 'h', text: 'Hi', blockStyle: { bg: 'surface', padTop: 'lg' } };
    expect(prepareProps('Heading', p)).toBe(p);
  });
  // Review Focus 4: Puck's leftovers never reach the admin.
  it.each([undefined, {}, { bg: undefined }, { align: 'center' }, { bg: '#fff' }, 'surface', null])('removes %j', (blockStyle) => {
    const out = prepareProps('Heading', { id: 'h', text: 'Hi', blockStyle });
    expect(out).toEqual({ id: 'h', text: 'Hi' });
    expect(Object.hasOwn(out, 'blockStyle')).toBe(false);
  });
  it('drops unknown / disallowed / invalid keys and writes canonical order', () => {
    const out = prepareProps('Heading', { id: 'h', text: 'Hi', blockStyle: { hide: 'mobile', zz: 1, align: 'end', bg: 'surface', radius: 'huge' } });
    expect(out.blockStyle).toEqual({ bg: 'surface', hide: 'mobile' });
    expect(Object.keys(out.blockStyle as object)).toEqual(['bg', 'hide']);
  });
  it('a non-stylable block loses any style', () => {
    expect(prepareProps('PageOutlet', { id: 'o', blockStyle: { bg: 'surface' } })).toEqual({ id: 'o' });
  });
  it('still runs the per-block clean-up first (FeaturedProducts rows)', () => {
    const out = prepareProps('FeaturedProducts', { id: 'f', items: [{}], blockStyle: {} });
    expect(out).toEqual({ id: 'f', items: [] });
  });
  it('prepareDoc reaches styles in slots and keeps an unchanged doc by identity', () => {
    const clean: PuckDoc = { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [
      { type: 'Section', props: { id: 's', content: [{ type: 'Heading', props: { id: 'h', text: 'Hi', blockStyle: { bg: 'surface' } } }] } },
    ] };
    expect(prepareDoc(clean)).toBe(clean);
    const dirty: PuckDoc = { ...clean, content: [{ type: 'Section', props: { id: 's', content: [{ type: 'Heading', props: { id: 'h', text: 'Hi', blockStyle: {} } }] } }] };
    expect(JSON.stringify(prepareDoc(dirty))).not.toContain('blockStyle');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix web test -- test/builder-editor-fields.test.ts test/builder-editor-style-prepare.test.ts`
Expected: FAIL — no `blockStyle` field; `prepareProps` keeps `{}`.

- [ ] **Step 3: Implement**

`web/src/builder/editor/derive-fields.ts` — import `import { styleField } from '@/builder/editor/custom-fields/style.tsx';` and end `blockFields` with:

```ts
  const out: Fields = { ...fields, ...overrides };
  // The Style group always comes last, after any overrides (block-styling spec §9.1).
  if (def.style) out.blockStyle = styleField(def) as Field;
  return out;
```

(Update the doc comment of `blockFields` to mention the Style group.)

`web/src/builder/editor/prepare.ts` — add imports `import { parseBlockStyle, type BlockStyle } from '@/builder/style/model.ts';` and replace `prepareProps`:

```ts
/** Same keys, same order, same values: the stored style is already what the guard would keep. */
function sameStyle(raw: unknown, style: BlockStyle): boolean {
  if (typeof raw !== 'object' || raw === null) return false;
  const a = Object.entries(raw);
  const b = Object.entries(style);
  return a.length === b.length && a.every(([k, v], i) => b[i]![0] === k && b[i]![1] === v);
}

/**
 * Block-styling spec §9.2: drop unknown / disallowed / invalid keys, canonical order, `{}` or
 * `undefined` → the key is removed. The same object when nothing changes (no spurious change).
 */
function prepareStyle(name: string, props: Props): Props {
  if (!Object.hasOwn(props, 'blockStyle')) return props;
  const def = blockDef(name);
  // An unregistered type never reaches the admin (the guard drops it); leave its props alone.
  if (!def) return props;
  const { style } = parseBlockStyle(def.style ?? false, props.blockStyle);
  if (style && sameStyle(props.blockStyle, style)) return props;
  const next: Props = { ...props };
  if (style) next.blockStyle = style;
  else delete next.blockStyle;
  return next;
}

export function prepareProps(name: string, props: Props): Props {
  const fn = Object.hasOwn(PREPARE, name) ? PREPARE[name] : undefined;
  return prepareStyle(name, fn ? fn(props) : props);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix web test -- test/builder-editor-fields.test.ts test/builder-editor-style-prepare.test.ts test/builder-editor-config.test.ts test/builder-editor-derive-fields.test.ts test/builder-editor-session.test.ts test/builder-editor-use-issues.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
git add -- web/src/builder/editor/derive-fields.ts web/src/builder/editor/prepare.ts web/test/builder-editor-fields.test.ts web/test/builder-editor-style-prepare.test.ts
git commit -m "feat(editor): Style group on every stylable block; normalise blockStyle before posting" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/editor/derive-fields.ts web/src/builder/editor/prepare.ts web/test/builder-editor-fields.test.ts web/test/builder-editor-style-prepare.test.ts
```

---

### Task 12: Contract flip, manifest, parity, docs

**Depends on:** Tasks 2, 4, 5, 6, 7, 8, 9. **Wave 4** (parallel with Task 11).

**Files:**
- Modify: `web/src/builder/define.ts` (`style` required; `parseBlockPropsDetailed` uses `def.style`)
- Modify (add `style: false` to every mock `defineBlock` that lacks one — find them with typecheck): `web/test/builder-define.test.ts`, `builder-registry.test.ts`, `builder-guard.test.ts`, `builder-render.test.tsx`, `builder-runtime.test.tsx`, `builder-shell-fallback.test.tsx`, `builder-style.test.ts` (its `bare` case becomes `style: false`), and any other file typecheck names
- Modify: `web/src/builder/blocks-manifest.ts`, `web/public/blocks.json` (regenerated), `web/test/blocks-manifest.test.ts`
- Create: `web/test/builder-style-contract.test.tsx`
- Modify: `docs/builder.md`, `docs/templates.md`

**Interfaces:**
- Consumes: every block's `style` declaration (Tasks 4–8); `renderBlock` (Task 3); `cssRules` helper (`web/test/helpers/css-rules.ts`).
- Produces: `BlockDef.style: StyleSupport | false` **required** (stages 3–5 sub-blocks cannot compile without it); `blocks.json` entries gain `style: false | { target, keys }`.

- [ ] **Step 1: Write the failing test**

Create `web/test/builder-style-contract.test.tsx`:

```tsx
/// <reference types="node" />
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { Suspense } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { BLOCKS } from '@/builder/registry.ts';
import { RenderDoc } from '@/builder/render.tsx';
import { renderBlock } from '@/builder/style/apply.tsx';
import { BOX, STYLE_KEY_ORDER, STYLE_KEYS, TEXT, VIS, type StyleKey, type StyleTarget } from '@/builder/style/model.ts';
import type { AnyBlock, BlockRenderContext } from '@/builder/define.ts';
import type { ComponentData } from '@/builder/types.ts';
import { cssRules } from './helpers/css-rules.ts';

afterEach(cleanup);

const minus = (keys: readonly StyleKey[], drop: readonly StyleKey[]) => keys.filter((k) => !drop.includes(k));
const ALLTEXT = [...BOX, ...TEXT, ...VIS];
const ROUTE = ['ProductGrid', 'ProductList', 'WholesaleTable', 'ProductDetail', 'CartContents', 'CartSummary', 'CheckoutFlow',
  'LoginOptions', 'OrdersList', 'OrderDetail', 'Loyalty', 'Referrals', 'Profile', 'OrderStatus', 'PaymentSuccess',
  'PaymentCancel', 'OrderPlaced', 'VerifyForm', 'TrackingLookup'];

/**
 * Spec §4 as a FLOOR. Allowlists only grow: a later release may add keys (update this table by
 * adding), never remove them — removing turns stored styles into blocking issues in every store.
 */
const FLOOR: Record<string, { target: StyleTarget; keys: readonly StyleKey[] } | false> = {
  Section: { target: 'root', keys: [...minus(BOX, ['bg', 'padTop', 'padBottom', 'maxWidth']), 'textSize', 'align', 'hide'] },
  Heading: { target: 'root', keys: [...BOX, 'fg', 'textSize', 'hide'] },
  RichText: { target: 'root', keys: minus(ALLTEXT, ['maxWidth']) },
  Image: { target: 'root', keys: [...minus(BOX, ['maxWidth']), 'hide'] },
  Button: { target: 'root', keys: [...BOX, 'hide'] },
  Divider: { target: 'root', keys: ['maxWidth', 'align', 'hide'] },
  Spacer: { target: 'root', keys: ['hide'] },
  Columns: { target: 'root', keys: ALLTEXT }, FAQ: { target: 'root', keys: ALLTEXT },
  Testimonial: { target: 'root', keys: ALLTEXT }, NavLinks: { target: 'root', keys: ALLTEXT },
  Video: { target: 'root', keys: [...BOX, 'hide'] }, CatalogHero: { target: 'root', keys: [...BOX, 'hide'] },
  CategoryNav: { target: 'root', keys: [...BOX, 'hide'] }, SearchField: { target: 'root', keys: [...BOX, 'hide'] },
  FeaturedProducts: { target: 'root', keys: [...BOX, 'hide'] },
  Upsells: { target: 'wrap', keys: [...BOX, 'hide'] }, TopBar: { target: 'wrap', keys: [...BOX, 'hide'] },
  NoticeBanners: { target: 'wrap', keys: [...BOX, 'hide'] }, CutoffBar: { target: 'wrap', keys: [...BOX, 'hide'] },
  ContactStrip: { target: 'wrap', keys: [...BOX, 'hide'] }, Footer: { target: 'wrap', keys: [...BOX, 'hide'] },
  Header: { target: 'pass', keys: ['bg', 'shadow', 'hide'] },
  ...Object.fromEntries([...ROUTE, 'AccountNav'].map((n) => [n, { target: 'wrap' as const, keys: [...BOX] }])),
  PageOutlet: false,
  MobileCartBar: false,
};

describe('style support contract (spec §4, §12)', () => {
  it('every registered block declares style, and the table covers them all', () => {
    expect(Object.keys(FLOOR).sort()).toEqual(Object.keys(BLOCKS).sort());
    for (const def of Object.values(BLOCKS)) expect(def.style, def.name).not.toBeUndefined();
  });
  it('false exactly for PageOutlet and MobileCartBar', () => {
    expect(Object.values(BLOCKS).filter((d) => d.style === false).map((d) => d.name).sort()).toEqual(['MobileCartBar', 'PageOutlet']);
  });
  it.each(Object.keys(FLOOR))('%s: target and key floor', (name) => {
    const want = FLOOR[name]!;
    const got = BLOCKS[name]!.style;
    if (want === false) return expect(got).toBe(false);
    expect(got && got.target).toBe(want.target);
    expect(got && [...got.keys]).toEqual(expect.arrayContaining([...want.keys]));
    expect(got && [...got.keys]).toEqual(STYLE_KEY_ORDER.filter((k) => got && got.keys.includes(k)));
  });
  it('route-bound blocks and AccountNav: box keys only, never hide (spec §2 #6)', () => {
    for (const def of Object.values(BLOCKS).filter((d) => d.routeBound || d.name === 'AccountNav')) {
      if (def.style === false) continue; // PageOutlet
      for (const k of def.style!.keys) expect(BOX, `${def.name}.${k}`).toContain(k);
    }
  });
  it('no block containing an input accepts textSize', () => {
    for (const name of ['SearchField', ...ROUTE]) expect((BLOCKS[name]!.style || { keys: [] }).keys).not.toContain('textSize');
  });
  it('every block offering fg / textSize (and owning its text) reads the variables in real rules', () => {
    for (const def of Object.values(BLOCKS)) {
      if (!def.style || def.slots.length > 0) continue; // containers set the variables for their children
      const file = resolve(__dirname, `../src/builder/blocks/${def.name}.module.css`);
      const rules = existsSync(file) ? cssRules(readFileSync(file, 'utf8')) : [];
      if (def.style.keys.includes('fg')) expect(rules.some((r) => /(^|;|\s)color:\s*var\(--sf-block-fg,/.test(r.body)), `${def.name} fg`).toBe(true);
      if (def.style.keys.includes('textSize')) expect(rules.some((r) => /font-size:\s*calc\([^;]*var\(--sf-text-scale, 1\)/.test(r.body)), `${def.name} textSize`).toBe(true);
    }
  });
});

describe('parity (spec §6)', () => {
  const ctx: BlockRenderContext = { editing: false, docKey: 'page:x', layout: 'storefront' };
  /** A valid value for a key the block does NOT accept, or null when it accepts all 16. */
  function disallowed(def: AnyBlock): Record<string, string> | null {
    const keys = def.style ? def.style.keys : [];
    const k = STYLE_KEY_ORDER.find((x) => !keys.includes(x));
    return k ? { [k]: STYLE_KEYS[k][0] } : null;
  }
  it.each(Object.keys(BLOCKS))('%s: absent, {} and disallowed-only styles make the identical render call', (name) => {
    const def = BLOCKS[name]!;
    const calls: Array<Record<string, unknown>> = [];
    const spy = { ...def, render: (p: Record<string, unknown>) => { calls.push(p); return 'out'; } } as unknown as AnyBlock;
    const base: Record<string, unknown> = { id: 'b', ...def.defaultProps };
    for (const s of def.slots) base[s] = () => null;
    const dis = disallowed(def);
    const outs = [renderBlock(spy, base, ctx), renderBlock(spy, { ...base, blockStyle: {} }, ctx), ...(dis ? [renderBlock(spy, { ...base, blockStyle: dis }, ctx)] : [])];
    for (const o of outs) expect(o).toBe('out');
    for (const p of calls) {
      expect(p.puck).toBe(ctx);
      expect(p).toEqual(calls[0]);
      expect(Object.hasOwn(p, 'blockStyle')).toBe(false);
    }
  });

  const c = (type: string, props: Record<string, unknown>, id = type): ComponentData => ({ type, props: { id, ...props } });
  const IMAGE = `/media/storefront-pages/media/${'a'.repeat(32)}.png`;
  const CONTENT: ComponentData[] = [
    c('Heading', { text: 'Small batches', eyebrow: 'New', level: 'h2', align: 'start' }),
    c('RichText', { bodyHtml: '<p>Packed to order.</p>', width: 'narrow' }),
    c('Image', { src: IMAGE, alt: 'Oats', caption: 'Trail oats', width: 'rail', aspect: '16/9' }),
    c('Button', { label: 'Shop now', href: '/', variant: 'filled', align: 'start' }),
    c('Columns', { columns: '2', stackBelow: 'md', gap: 'md', col1: [c('Heading', { text: 'Fast' }, 'k1')], col2: [], col3: [], col4: [] }),
    c('Section', { padding: 'md', backgroundToken: 'surface', textToken: 'none', width: 'rail', content: [c('Heading', { text: 'In' }, 'k2')] }),
    c('Spacer', { size: 'sm' }), c('Divider', { spacing: 'md', toneToken: 'line' }),
    c('FAQ', { title: 'Questions', items: [{ question: 'How fast?', answerHtml: '<p>Same day.</p>' }] }),
    c('Testimonial', { quote: 'Arrived next morning.', author: 'Sam', detail: 'Leeds' }),
    c('NavLinks', { items: [{ label: 'Shop', href: '/' }], ariaLabel: 'Site', direction: 'row' }),
    c('Video', { provider: 'youtube', videoId: 'aB3_dE-fG9h', title: 'How we pack' }),
  ];
  const withStyle = (items: ComponentData[], style: (type: string) => unknown): ComponentData[] => items.map((it) => {
    const props: Record<string, unknown> = { ...it.props, blockStyle: style(it.type) };
    for (const s of BLOCKS[it.type]!.slots) if (Array.isArray(props[s])) props[s] = withStyle(props[s] as ComponentData[], style);
    return { ...it, props: props as ComponentData['props'] };
  });
  const markup = (content: ComponentData[]) => {
    const html = render(<MantineProvider env="test"><MemoryRouter><Suspense fallback={null}>
      <RenderDoc doc={{ root: { props: { title: '', description: '', chrome: 'shell' } }, content }} docKey="page:x" layout="storefront" />
    </Suspense></MemoryRouter></MantineProvider>).container.innerHTML;
    cleanup();
    return html;
  };
  it('content blocks: identical markup for absent, {} and disallowed-only styles', () => {
    const plain = markup(CONTENT);
    expect(markup(withStyle(CONTENT, () => ({})))).toBe(plain);
    expect(markup(withStyle(CONTENT, (t) => disallowed(BLOCKS[t]!) ?? {}))).toBe(plain);
  });
});
```

Update `web/test/blocks-manifest.test.ts`'s CheckoutFlow expectation to:

```ts
    expect(m.blocks.find((b) => b.name === 'CheckoutFlow')).toEqual({ name: 'CheckoutFlow', category: 'commerce', layouts: ['storefront', 'menu', 'webapp'], routeBound: true,
      style: { target: 'wrap', keys: ['bg', 'padTop', 'padBottom', 'padX', 'marginTop', 'marginBottom', 'border', 'borderColor', 'borderStyle', 'radius', 'shadow', 'maxWidth'] } });
    expect(m.blocks.find((b) => b.name === 'PageOutlet')!.style).toBe(false);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix web test -- test/builder-style-contract.test.tsx test/blocks-manifest.test.ts`
Expected: the contract file passes most cases if Tasks 4–8 landed (it is the gate that they did); `blocks-manifest.test.ts` FAILS (no `style` in the manifest).

- [ ] **Step 3: Implement**

`web/src/builder/define.ts`: in `BlockDef`, change `style?: StyleSupport | false;` to `style: StyleSupport | false;` (update the comment: "Required: …"), and in `parseBlockPropsDetailed` use `parseBlockStyle(def.style, raw.blockStyle)`.

Run `npm --prefix web run typecheck`; for every error "Property 'style' is missing" in a **test** mock, add `style: false,` to that `defineBlock({...})` (in `builder-render.test.tsx` put it on the shared `base` object; in `builder-rules.test.ts` the helper already passes `style`). In `web/test/builder-style.test.ts` change the `bare` case to `{ ...rootDef, style: false as const }`. Do not change any production block — they all declare `style` already; a production error means a Task 4–8 block was missed: report it (BLOCKED) rather than adding `false`.

`web/src/builder/blocks-manifest.ts`:

```ts
import type { BlockCategory, StyleKey, StyleTarget } from '@/builder/define.ts';
// …
export interface BlocksManifest {
  schemaVersion: 1;
  blocks: Array<{ name: string; category: BlockCategory; layouts: LayoutKind[]; routeBound: boolean; style: false | { target: StyleTarget; keys: StyleKey[] } }>;
}
// in the map:
      .map((b) => ({
        name: b.name, category: b.category, layouts: b.layouts === 'all' ? [...ALL] : [...b.layouts], routeBound: b.routeBound,
        style: b.style ? { target: b.style.target, keys: [...b.style.keys] } : (false as const),
      }))
```

Regenerate: `UPDATE_BLOCKS_JSON=1 npm --prefix web test -- test/blocks-manifest.test.ts` (PowerShell: `$env:UPDATE_BLOCKS_JSON='1'; …; Remove-Item Env:UPDATE_BLOCKS_JSON`). Check LF endings with `git diff --numstat -- web/public/blocks.json`.

Docs — `docs/builder.md`:
1. In "## The block contract", add a bullet: "`style` (**required**): `false`, or `{ target: 'root' | 'wrap' | 'pass', keys }` — see *Block styling*. Build it with `styleSupport(target, include, exclude)` from `@/builder/style/model.ts`."
2. In "## Rules", add a table row: `` | `hidden-required:<Block>` | a block with `blockStyle.hide` holds (through visible slots, any depth) a block the document requires — its `EXACTLY_ONE` / `AT_LEAST_ONE` blocks, `PageOutlet` or `MobileCartBar` | ``.
3. Add a new section "## Block styling" after "## Text layer (editable text)" covering, in prose and tables: the `blockStyle` prop (16 keys and values from spec §3.1, tokens only, absent = template default, `none` is a real value, never `{}`); what each value means (spec §3.2 table, including the `bg` inset, `--sfs-bc`/`--sfs-bs` reset, inherited `--sf-block-fg` / `--sf-text-scale`); targets (`root` / `wrap` / `pass`) and the per-block table (spec §4, plus the CatalogHero template-variant note from Task 6); rendering (`renderBlock` is the only caller of `def.render`, attribute names, `data-sfs-ghost` on the canvas); the generated stylesheet (`style/css.ts` → `style/block-style.css`, `UPDATE_BLOCK_STYLE_CSS=1`, imported in `main.tsx`, every selector (0,4,0)); phone caps and the 62em hide; the guard (`field:<Block>.blockStyle[.<key>]`) and `hidden-required`; the editor Style group; "Text blocks read `var(--sf-block-fg, <token>)` and `calc(<size> * var(--sf-text-scale, 1))`"; "Allowlists only grow"; "`STYLE_KEYS` is mirrored by the backend's `BLOCK_STYLE_VALUES` — change both, backend first."

`docs/templates.md`:
1. In "### Supported hooks outside the parts table", add: "**Block styles (escape hatch).** Owners style blocks with `data-sf-style` / `data-sfs-*` attributes at specificity (0,4,0). A template whose design genuinely breaks under an owner value may override at equal specificity in its `template.css` (which loads after the main bundle, so it wins), e.g. `:root[data-sf-template="<id>"] [data-sf-style="Header"][data-sfs-bg] { … }`. This is the only supported style hook; use it sparingly — the owner chose that value."
2. In "## 4. Parts (`data-sf-part`)", add the rule: "Never use a direct-child combinator under `[data-sf-part="main"]` (or any part): a styled block adds a wrapper `<div>` around wrap-mode blocks."

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix web test` (full web suite) and `npm --prefix web run typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add -- web/src/builder/define.ts web/src/builder/blocks-manifest.ts web/public/blocks.json web/test/blocks-manifest.test.ts web/test/builder-style-contract.test.tsx web/test/builder-define.test.ts web/test/builder-registry.test.ts web/test/builder-guard.test.ts web/test/builder-render.test.tsx web/test/builder-runtime.test.tsx web/test/builder-shell-fallback.test.tsx web/test/builder-style.test.ts docs/builder.md docs/templates.md
git commit -m "feat(builder): style is required on every block; manifest, parity contract and docs" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/define.ts web/src/builder/blocks-manifest.ts web/public/blocks.json web/test/blocks-manifest.test.ts web/test/builder-style-contract.test.tsx web/test/builder-define.test.ts web/test/builder-registry.test.ts web/test/builder-guard.test.ts web/test/builder-render.test.tsx web/test/builder-runtime.test.tsx web/test/builder-shell-fallback.test.tsx web/test/builder-style.test.ts docs/builder.md docs/templates.md
```
(Add any other test file typecheck made you touch to both path lists.)

---

### Task 13: End-to-end (Playwright owner) and full verification

**Depends on:** all previous tasks. **Wave 5.** The only task that runs Playwright.

**Files:**
- Modify: `e2e/page-sets.ts` (new exports; `shell()` gains a header-props parameter)
- Create: `e2e/block-style.spec.ts`
- Modify: `e2e/builder-editor.spec.ts` (new `describe`)

**Interfaces:**
- Consumes: the whole feature; e2e helpers `installMocks`, `FIXED_NOW`, `fillCheckout`, `addFirstToCart`, `openProduct`, `openCart`, `onlyVisible`, `presetTheme`; editor spec helpers `openFramed`, `load`, `loadAndWait`, `addBlock`, `lastPage`, `messages`, `expectAdminAccepts`.
- Produces: `page-sets.ts` exports `styledCatalogSet(layout)`, `styledHeaderSet(layout)`, `styledFlowSet(layout)`, `maximumStyleSet(layout)`, `hiddenGridSet(layout)`, `editorStyleSet()`.

- [ ] **Step 1: Add the page sets**

In `e2e/page-sets.ts`, change `shell` to take header props (default `{}`), keeping every existing caller unchanged:

```ts
function shell(layout: Layout, footer: ComponentData | null, navItems: NavItem[] = [STORY_LINK], extra: ComponentData[] = [], header: Record<string, unknown> = {}): PuckDoc {
  const nav = c('NavLinks', { ariaLabel: 'Site', direction: 'row', items: navItems });
  return doc([
    c('Header', { nav: [nav], ...header }),
    // … unchanged
```

Append:

```ts
// ---- block styling (spec 2026-09-30-block-styling §12) ---------------------------------------

/** Every key at its largest that the block accepts. */
const MAX_BOX = { padX: 'xl', marginTop: 'xl', marginBottom: 'xl', border: 'thick', borderColor: 'primary', borderStyle: 'dashed', radius: 'pill', shadow: 'raised' };
const MAX_SECTION = { ...MAX_BOX, textSize: 'xl', align: 'end' };
const MAX_FULL = { bg: 'surface', fg: 'text', padTop: 'xl', padBottom: 'xl', ...MAX_BOX, textSize: 'xl', align: 'end', maxWidth: 'wide' };
const MAX_HEADING = { bg: 'surface-2', fg: 'text', padTop: 'xl', padBottom: 'xl', ...MAX_BOX, textSize: 'xl', maxWidth: 'wide' };
const MAX_FLOW = { bg: 'surface', padTop: 'xl', padBottom: 'xl', ...MAX_BOX, maxWidth: 'wide' };

export function styledCatalogSet(layout: Layout): PageSet {
  return {
    schemaVersion: 1,
    shell: shell(layout, c('Footer')),
    pages: {
      catalog: doc([
        c('Heading', { text: 'Styled heading', level: 'h2', blockStyle: { bg: 'surface-2', padTop: 'lg', border: 'thin', borderColor: 'primary', radius: 'card', textSize: 'lg' } }, 'styled-heading'),
        c('Heading', { text: 'Plain heading', level: 'h2' }, 'plain-heading'),
        c('Section', { content: [c('Heading', { text: 'Only from 992 px' }, 'desk-h')], blockStyle: { hide: 'mobile' } }, 'hide-mobile'),
        c('Section', { content: [c('Heading', { text: 'Only below 992 px' }, 'phone-h')], blockStyle: { hide: 'desktop' } }, 'hide-desktop'),
        c('Upsells', { blockStyle: { bg: 'surface', padTop: 'xl', padBottom: 'xl', border: 'thick' } }, 'empty-upsells'),
        listBlock(layout),
      ]),
    },
  };
}

export function styledHeaderSet(layout: Layout): PageSet {
  return {
    schemaVersion: 1,
    shell: shell(layout, c('Footer'), [STORY_LINK], [], { blockStyle: { bg: 'surface-3', shadow: 'raised' } }),
    pages: { catalog: doc([...Array.from({ length: 12 }, (_, i) => c('Spacer', { size: 'xl' }, `sp-${i}`)), listBlock(layout)]) },
  };
}

export function styledFlowSet(layout: Layout): PageSet {
  return {
    schemaVersion: 1,
    shell: shell(layout, c('Footer')),
    pages: {
      checkout: doc([c('CheckoutFlow', { blockStyle: { bg: 'surface', padTop: 'md', padBottom: 'md', padX: 'sm', border: 'thin', radius: 'card' } }, 'styled-flow')]),
      cart: doc([c('CartContents', { summary: [c('CartSummary', { blockStyle: { bg: 'surface-2', padTop: 'sm', border: 'thin' } }, 'styled-summary')], blockStyle: { padTop: 'md', border: 'thin' } }, 'styled-lines')]),
    },
  };
}

/** Section › Columns › Section › Heading, every key at its largest, plus a styled flow. */
export function maximumStyleSet(layout: Layout): PageSet {
  const nest = (id: string) => c('Section', { blockStyle: MAX_SECTION, content: [
    c('Columns', { columns: '2', stackBelow: 'md', blockStyle: MAX_FULL, col1: [
      c('Section', { width: 'full', backgroundToken: 'surface-2', blockStyle: MAX_SECTION, content: [c('Heading', { text: 'Deep and wide', blockStyle: MAX_HEADING }, `${id}-h`)] }, `${id}-inner`),
    ], col2: [c('RichText', { bodyHtml: `<p>${LONG_LABEL}</p>`, blockStyle: { ...MAX_FULL, maxWidth: undefined } }, `${id}-rt`)] }, `${id}-cols`),
  ] }, `${id}-outer`);
  return {
    schemaVersion: 1,
    shell: shell(layout, c('Footer')),
    pages: {
      catalog: doc([nest('cat'), listBlock(layout)]),
      checkout: doc([nest('co'), c('CheckoutFlow', { blockStyle: MAX_FLOW }, 'max-flow')]),
    },
  };
}

/** The catalogue grid inside a hidden Section: must fall back to the default catalogue. */
export function hiddenGridSet(layout: Layout): PageSet {
  return {
    schemaVersion: 1,
    shell: shell(layout, c('Footer')),
    pages: { catalog: doc([c('Section', { blockStyle: { hide: 'mobile' }, content: [listBlock(layout)] }, 'hidden-grid'), c('Heading', { text: 'Should not render' }, 'hg-h')]) },
  };
}

/** For the editor: a Heading hidden below 992 px and a locked ProductGrid with a known id. */
export function editorStyleSet(): PageSet {
  return {
    schemaVersion: 1,
    shell: shell('storefront', c('Footer')),
    pages: { catalog: doc([c('Heading', { text: 'Ghost heading', blockStyle: { hide: 'mobile' } }, 'ghost-h'), c('ProductGrid', {}, 'grid-1')]) },
  };
}
```

(`JSON.stringify` drops the `maxWidth: undefined` on the RichText, which does not accept `maxWidth`.)

- [ ] **Step 2: Write the e2e spec**

Create `e2e/block-style.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { installMocks, type Layout } from './mocks.ts';
import { addFirstToCart, FIXED_NOW, fillCheckout, onlyVisible, openProduct } from './flows.ts';
import { presetTheme } from './template-theme.ts';
import { hiddenGridSet, maximumStyleSet, styledCatalogSet, styledFlowSet, styledHeaderSet } from './page-sets.ts';

/** Same cases as templates.spec.ts / builder.spec.ts (a spec may not import another spec). */
const CASES: Array<[string, string]> = [
  ['modern', 'default'], ['dark-luxury', 'gold'], ['cyber-brutalism', 'acid-dark'],
  ['cyber-brutalism', 'purple-light'], ['bento', 'tech-dark'], ['bento', 'fashion-light'],
];

/** A token's colour as the page resolves it (custom properties read raw, so paint a probe). */
function tokenColour(page: Page, token: string): Promise<string> {
  return page.evaluate((t) => {
    const el = document.createElement('div');
    el.style.background = `var(--sf-${t})`;
    document.body.append(el);
    const v = getComputedStyle(el).backgroundColor;
    el.remove();
    return v;
  }, token);
}
const cs = (page: Page, selector: string, prop: string) =>
  page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
async function noOverflow(page: Page, where: string) {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  expect(o.sw, `horizontal overflow on ${where}`).toBeLessThanOrEqual(o.w);
}

test('every template in the catalog has a block-style case', async ({ page }) => {
  const cat = (await (await page.request.get('/templates.json')).json()) as { templates: Array<{ id: string }> };
  const covered = new Set(CASES.map(([t]) => t));
  expect(cat.templates.map((t) => t.id).filter((id) => !covered.has(id))).toEqual([]);
});

for (const width of [390, 1280]) {
  test(`computed styles at ${width} resolve to the template's variables`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(FIXED_NOW);
    await installMocks(page, { layout: 'storefront', session: true, pages: { storefront: styledCatalogSet('storefront') } });
    await page.goto('/');
    const styled = '[data-sf-style="Heading"]';
    await expect(page.locator(styled)).toBeVisible();
    expect(await cs(page, styled, 'background-color')).toBe(await tokenColour(page, 'surface-2'));
    expect(await cs(page, styled, 'border-top-color')).toBe(await tokenColour(page, 'primary'));
    expect(await cs(page, styled, 'border-top-width')).toBe('1px');
    const radius = await page.evaluate(() => { const el = document.createElement('div'); el.style.borderRadius = 'var(--sf-card-radius)'; document.body.append(el); const v = getComputedStyle(el).borderTopLeftRadius; el.remove(); return v; });
    expect(await cs(page, styled, 'border-top-left-radius')).toBe(radius);
    // Phone cap: lg (40 px) is 24 px below 48em.
    expect(await cs(page, styled, 'padding-top')).toBe(width < 768 ? '24px' : '40px');
    // Text size lg scales the heading's own size by 1.125 against an unstyled twin.
    const size = (sel: string) => page.locator(sel).first().evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    const ratio = (await size(`${styled} h2`)) / (await size('[data-sf-block="Heading"]:not([data-sf-style]) h2'));
    expect(ratio).toBeCloseTo(1.125, 2);
    // bg with no padX: the inset keeps text off the tint.
    expect(await cs(page, styled, 'padding-left')).toBe('16px');
    // hide at the 62em breakpoint.
    const onPhone = width < 992;
    await expect(page.getByRole('heading', { name: 'Only from 992 px' })).toBeVisible({ visible: !onPhone });
    await expect(page.getByRole('heading', { name: 'Only below 992 px' })).toBeVisible({ visible: onPhone });
    // Empty wrap: a styled Upsells with nothing curated leaves no visible box.
    const box = await page.locator('[data-sf-style="Upsells"]').boundingBox();
    expect(box === null || box.height === 0).toBe(true);
    await noOverflow(page, `catalog at ${width}`);
  });
}

for (const [template, preset] of CASES) {
  test(`owner beats template · ${template}/${preset}: styled Header background, still sticky`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const tweak = await presetTheme(page, template, preset);
    await installMocks(page, { layout: 'storefront', session: true, tweakSettings: tweak, pages: { storefront: styledHeaderSet('storefront') } });
    await page.goto('/');
    const header = 'header[data-sf-part="header"][data-sf-style="Header"]';
    await expect(page.locator(header)).toBeVisible();
    expect(await cs(page, header, 'background-color')).toBe(await tokenColour(page, 'surface-3'));
    await page.mouse.wheel(0, 2500);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
    const top = await page.locator(header).evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(top)).toBeLessThanOrEqual(1);
  });

  test(`maximum styles · ${template}/${preset}: no overflow at 360; bg follows the template`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const tweak = await presetTheme(page, template, preset);
    await installMocks(page, { layout: 'storefront', session: true, tweakSettings: tweak, pages: { storefront: maximumStyleSet('storefront') } });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Deep and wide' })).toBeVisible();
    expect(await cs(page, '[data-sf-style="Columns"]', 'background-color')).toBe(await tokenColour(page, 'surface'));
    await noOverflow(page, `catalog · ${template}/${preset}`);
    // Whatever /checkout renders for this session (the styled set, or a redirect for an empty cart), it must not overflow.
    await page.goto('/checkout');
    await page.waitForLoadState('networkidle');
    if (new URL(page.url()).pathname === '/checkout') await expect(page.getByRole('heading', { name: 'Deep and wide' })).toBeVisible();
    await noOverflow(page, `checkout · ${template}/${preset}`);
  });
}

test('flows survive styling: checkout reaches Review through a styled CheckoutFlow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.setFixedTime(FIXED_NOW);
  const mocks = await installMocks(page, { layout: 'storefront', session: true, pages: { storefront: styledFlowSet('storefront') } });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await openProduct(page, 'storefront', 'Alpine Extract 10ml');
  await addFirstToCart(page, 'storefront', mocks);
  await page.goto('/cart');
  // CartContents keeps its summary column beside the lines, styled.
  await expect(page.locator('[data-sf-style="CartContents"]')).toBeVisible();
  const summary = page.locator('[data-sf-style="CartSummary"]');
  await expect(summary).toBeVisible();
  const lines = await page.locator('[data-sf-style="CartContents"]').boundingBox();
  const col = await summary.boundingBox();
  expect(col!.x).toBeGreaterThan(lines!.x + lines!.width / 2);
  await onlyVisible(page.getByRole('link', { name: 'Checkout' })).click();
  await expect(page.locator('[data-sf-style="CheckoutFlow"]')).toBeVisible();
  await fillCheckout(page);
});

for (const layout of ['storefront', 'menu'] as const satisfies readonly Layout[]) {
  test(`hidden-required · ${layout}: a grid inside a hidden Section renders the default catalogue`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await installMocks(page, { layout, session: true, pages: { [layout]: hiddenGridSet(layout) } });
    await page.goto('/');
    await expect(page.getByText('Alpine Extract 10ml').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Should not render' })).toHaveCount(0);
    expect(errors.some((e) => e.includes('hidden-required:Section'))).toBe(true);
  });
}
```

(If a full navigation to `/cart` loses the cart line in the mocks, reach the cart the way `builder.spec.ts`'s checkout test does — `openCart(page, 'desktop')` from `./flows.ts` — and then navigate to `/cart` by the drawer's link.)

Append to `e2e/builder-editor.spec.ts` (and add `editorStyleSet` to its `./page-sets.ts` import):

```ts
test.describe('page builder editor · style', () => {
  const panel = (frame: FrameLocator) => frame.locator('[data-sf-style-panel]');

  test('a swatch restyles the canvas and posts blockStyle; Reset style removes it', async ({ page }) => {
    const { frame } = await openFramed(page);
    const msg = load();
    await loadAndWait(page, frame, msg);
    await addBlock(frame, 'Heading');
    await panel(frame).locator('summary').click();
    await panel(frame).getByRole('radiogroup', { name: 'Background' }).getByRole('radio', { name: 'Surface 2' }).click();
    await expect(frame.locator('[data-sf-builder-canvas] [data-sf-style="Heading"][data-sfs-bg="surface-2"]')).toBeVisible();
    await expect.poll(() => lastPage(page, msg.loadId, 'catalog')).toContain('"blockStyle":{"bg":"surface-2"}');
    await panel(frame).getByRole('button', { name: 'Reset style' }).click();
    await expect(frame.locator('[data-sf-builder-canvas] [data-sf-style="Heading"]')).toHaveCount(0);
    await expect.poll(() => lastPage(page, msg.loadId, 'catalog')).not.toContain('blockStyle');
    await expectAdminAccepts(page);
  });

  test('a route block offers box styles but no Visibility row', async ({ page }) => {
    const { frame } = await openFramed(page);
    const msg = load({ pageSet: editorStyleSet() });
    await loadAndWait(page, frame, msg);
    await frame.locator('[data-sf-builder-canvas] [data-puck-component="grid-1"]').click();
    await panel(frame).locator('summary').click();
    await expect(panel(frame).getByRole('radiogroup', { name: 'Padding top' })).toBeVisible();
    await expect(panel(frame).getByRole('radiogroup', { name: 'Visibility' })).toHaveCount(0);
  });

  test('a hidden block is ghosted in Fit and gone in the Phone exact preview', async ({ page }) => {
    const { frame } = await openFramed(page, 900);
    const msg = load({ pageSet: editorStyleSet() });
    await loadAndWait(page, frame, msg);
    const ghost = frame.locator('[data-sf-builder-canvas] [data-sfs-ghost="mobile"]');
    await expect(ghost).toBeVisible();
    expect(await ghost.evaluate((el) => getComputedStyle(el).opacity)).toBe('0.4');
    await frame.getByRole('group', { name: 'Preview width' }).getByRole('button', { name: 'Phone' }).click();
    const preview = frame.locator('[data-sf-builder-exact="360"]');
    await expect(preview).toBeVisible();
    await expect(preview.locator('[data-sfs-hide="mobile"]')).toHaveCount(1);
    await expect(preview.getByRole('heading', { name: 'Ghost heading' })).toBeHidden();
    await frame.getByRole('button', { name: 'Back to editing' }).click();
  });
});
```

- [ ] **Step 3: Run the new e2e and fix what fails**

Run: `npm run test:e2e -- block-style.spec.ts` then `npm run test:e2e -- builder-editor.spec.ts -g "style"`
Expected: PASS. A failure is a product bug in an earlier task's area (or a selector assumption here) — diagnose with `superpowers:systematic-debugging`; fix product code only if the fix is small and inside this feature, else report BLOCKED naming the task. Never weaken an assertion to pass (especially "owner beats template" and "no overflow at 360").

- [ ] **Step 4: Parity gates — no snapshot may change**

Run: `npm run test:e2e -- dom-parity.spec.ts templates-baseline.spec.ts templates-baseline-imageless.spec.ts`
Expected: PASS **without** `--update-snapshots`. If any fails, the unstyled DOM or CSS changed: find the leak (spec §15.1: a `{}` default, a copied `puck`, a `className` built instead of attributes, a CSS rewrite not computing to today's value) and fix it at its source.

Then the rest of the builder e2e and the full unit suite:

Run: `npm run test:e2e -- builder.spec.ts builder-editor.spec.ts templates.spec.ts text.spec.ts` and `npm --prefix web test` and `npm run typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -- e2e/page-sets.ts e2e/block-style.spec.ts e2e/builder-editor.spec.ts
git commit -m "test(e2e): block styling — computed styles, owner beats template, flows, hidden-required, editor" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- e2e/page-sets.ts e2e/block-style.spec.ts e2e/builder-editor.spec.ts
```

Do not commit e2e screenshots or `test-results/`.

---

## Spec coverage map

| Spec § | Task(s) |
|---|---|
| §3.1 prop, canonical order, no `{}` | 1, 3, 10, 11 |
| §3.2 value → CSS, resets, inheritance | 2, 4 |
| §4 per-block support, text variables, allowlists only grow | 4–8, 12 |
| §5.1 `styleAttrs` / `renderBlock`, `:empty` | 2, 3 |
| §5.2 generated stylesheet, (0,4,0), no motion | 2 |
| §6 parity | 3, 4, 5, 8, 12, 13 |
| §7 mobile rules | 2, 5, 6, 10, 13 |
| §8 templates (tokens, escape hatch, no child combinator) | 12 (docs), 13 (owner beats template) |
| §9 editor Style group, ghost, contrast, touch | 3, 10, 11, 13 |
| §10.1 guard | 1, 3 |
| §10.2 `hidden-required` | 9, 13 |
| §10.3 backend | backend plan (not here) |
| §10.4 protocol/admin unchanged | nothing to do (Global Constraints) |
| §11 text interplay | 1 (text guard), 4 (scaled text reads the same variables for edited text) |
| §12 tests | every task; e2e 13 |
| §13 docs, blocks.json | 12 |

## Deviations from the spec (deliberate, small)

- The stylesheet is imported once in `web/src/main.tsx` (next to `global.css`) rather than in `render.tsx`, so Task 2 and Task 3 touch disjoint files; the effect (main bundle, before template CSS, shop and editor alike) is the same.
- `styleAttrs` takes `style: unknown` (not `BlockStyle | undefined`) because the editor canvas hands unguarded props; it re-checks allowlist and values.
- `CatalogHero`'s template variant owns no root element, so when styled it renders one `<div>` around the template slot (Task 6); unstyled it is unchanged.
- `NavLinks` and `Testimonial` add `[data-sfs-align]` module rules so Alignment moves their flex rows (otherwise a control that does nothing — spec §15.6).
- The empty-wrapper rule is `:root [data-sf-style]:not([data-sf-block]):empty` (still (0,4,0)) so a root-mode block that is legitimately empty (a `Spacer` is an empty `<div>`) is never hidden by it.
- The `bg` inset rule skips `[data-sf-part]` elements (the Header), which accepts no padding (spec §4).

## Cross-plan contract assumptions

- Backend `BLOCK_STYLE_VALUES` equals `STYLE_KEYS` exactly: the 16 keys in the §3.1 order, the 15 palette tokens (no `none`) for `bg`/`fg`/`borderColor`, `none|xs|sm|md|lg|xl` for spacing, and the §3.1 lists for the rest.
- Backend rejects a bad `blockStyle` with 400 at path `[…, 'props', 'blockStyle', <key>]` ("Unknown style setting" / "Invalid value for style setting"), max 16 keys; the storefront never relies on those strings.
- Storefront issue rule ids are `field:<Block>.blockStyle`, `field:<Block>.blockStyle.<key>` and `hidden-required:<Block>`; they travel in the existing `issues` array of `sf-builder-change` (protocol stays `1`); the admin needs no change.
- `web/public/blocks.json` entries gain `style: false | { target, keys }`; no backend or admin code reads that file today.
- The editor attribute `data-sf-style-panel` and radiogroup names equal to `STYLE_LABELS` are internal to the storefront e2e; nothing cross-repo depends on them.
