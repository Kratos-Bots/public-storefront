# Puck page builder — Plan 2: storefront renderer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every storefront page (all three layouts) renders from a Puck-format document through our own renderer: built-in default documents reproduce v0.6.0 exactly, a published page set from `GET /api/storefront/pages/:layout` replaces them page by page, and owners get content blocks and custom pages at `/pages/<slug>` — without the shopper bundle ever containing `@puckeditor/core`.

**Architecture:** `web/src/builder/` holds a small runtime (`types`, `define`, `guard`, `rules`, `registry`, `render`, `runtime`, `sanitize`, `mode`, `defaults/`) and one file per block under `builder/blocks/`. Functional blocks are thin wrappers that `lazy()`-load the existing feature pages, so route-level code splitting and every `data-sf-part` hook stay where they are. The three shells are split into exported parts (frame / header / main) that the shell blocks compose; `<PuckShell>` replaces `ShellSwitch`, `<PuckPage>` becomes every route element. A v0.6.0 DOM snapshot suite captured before any source change, plus the whole existing unit and e2e suite, is the parity gate that must pass before any content block is written.

**Tech Stack:** React 19, react-router 7 (data router), @tanstack/react-query 5, zod 4, Mantine 9, Vite 7, Vitest 4 (jsdom), Playwright (mocked), Cloudflare Worker (vitest-pool-workers), `dompurify` 3.

**Spec:** `docs/superpowers/specs/2026-09-29-puck-page-builder-design.md` — read §13 first; it overrides §1–12 (A1 own renderer, A2 `*Html` richtext, A3 media, A4 types, A7 module contract).

## Global Constraints

- Web imports use the `@/…` alias **with** `.ts`/`.tsx` extensions (`import { BLOCKS } from '@/builder/registry.ts'`). `verbatimModuleSyntax` is on: type-only imports use `import type`. `erasableSyntaxOnly` is on: no `enum`, no parameter properties.
- `@puckeditor/core` is never value-imported outside `web/src/builder/editor/`; `import type` from it is allowed anywhere. This plan does not add the package (Plan 3 does, pinned exactly `0.23.0`).
- Do not create or edit anything under `web/src/builder/editor/` — Plan 3 owns it. Do not write Puck `fields` or the Puck `Config`.
- A7 names and signatures are a cross-plan contract — implement them exactly: `defineBlock`, `BlockDef`, `BlockCategory`, `SlotRender`, `BlockRenderContext`, `BLOCKS`, `checkRules`, `validateDoc`, `defaultDoc`, `RenderDoc`, `usePageSet`, `PuckShell`, `PuckPage`, `PageSetOverrideProvider`, `useBuilderMode`, `PreviewAs`, `RICHTEXT_ALLOWED_TAGS`, `sanitizeRichtext`.
- Richtext props: key ends in `Html`, value is an HTML string (a `ReactNode` inside the editor); rendered only through `sanitizeRichtext` (allowlist tags `p h2 h3 h4 strong em u s a ul ol li blockquote br code`; `a[href]` only `https:`, `mailto:`, `tel:`, site-relative `/…`; `rel="noopener noreferrer"` forced on external links; no other attributes).
- Uploaded media URLs have exactly the form `/media/storefront-pages/media/<32 lowercase hex>.(png|jpg|webp|gif)`.
- Slots render **no wrapper element** unless the block passes `className`/`style`/`as` to the slot render (then exactly one element).
- A block's `render` never calls hooks itself — it returns JSX of an inner component (Puck may call `render` as a plain function inside the editor).
- New block styling: colours only as palette token names mapped to `var(--sf-*)` (no hex literals), spacing only from `SPACING`, CSS modules, every interactive element ≥ 44×44 px, no horizontal overflow at 360 px, `prefers-reduced-motion` honoured (docs/templates.md §7 mobile rules apply).
- Existing `data-sf-part` hooks, template slots and `useCoreOptions()` behaviour are preserved; existing tests are not edited except selector updates proven necessary, each justified in the commit message.
- The storefront repo is PUBLIC: fixtures, copy and screenshots use "Northbound Supply" / `shop.example` only — no real client names, products, customers or credentials.
- Every task that creates or changes UI says so in its first step: the implementer loads the `frontend-design:frontend-design` skill before writing UI code.
- Backend contract (Plan 1): the backend treats ANY array element that is an object with a string `type` and an object `props` as a component (slot child). Non-slot array props (FAQ items, nav links, …) must therefore never have items carrying both `type` and `props` keys. Every `*Html` prop value is a string (non-string → 400). The public page-set route answers 404 (old backend), 503 (kill switch) or network errors — all mean "no published set" ⇒ defaults.
- Prop naming is a contract with Plan 3's editor, which derives Puck fields from names: richtext props end in `Html`; link props are `href` or end in `Href`; image props are `src` or end in `Src`; palette-colour props end in `Token`; single product/category refs are `productId` / `categoryId` (numbers, nullable); hand-picked product lists are `items: Array<{ productId: number }>`.
- `routeBound: true` exactly on the §5.3 route blocks plus `PageOutlet` and `ProductDetail`. `defaultDoc` returns a document for `shell` and all 16 fixed route keys in every layout (`product` too in menu/webapp, where `ProductRoute` redirects to the sheet before it could render), each passing its own `checkRules`.
- Out of scope here, owned by Plan 3: the bundle check (no `@puckeditor/core` / tiptap / dnd-kit / `builder/editor/` code reachable from the entry), the `/__builder` route, and any change to `web/src/api/client.ts` (Plan 3 adds an interceptor seam — do not restructure that file).
- Default-document block ids are `` `${type}-default` ``; block type names match `^[A-Z][A-Za-z0-9]{0,40}$`; `props.id` ≤ 64 chars; slot nesting depth ≤ 12; ≤ 2 000 components per doc.
- Web version becomes `0.7.0` (Task 23 only).
- Tests: `npm test` at repo root runs web Vitest, worker Vitest and `node --test scripts/*.test.mjs`; `npm run test:e2e` runs mocked Playwright. Web-only: `npm --prefix web test -- <file>`.

## Review Focus

Things the spec implies but no feature test naturally hits — each has a pinning test in the task named.

1. **A stored document from a newer release with an unknown block nested inside a slot** (e.g. inside `Section.content`) — the unknown block alone disappears, its siblings and the rest of the page render. Pinned in Task 5 (`guard: drops an unknown block nested in a slot`).
2. **Duplicate `props.id`s in a stored document** (hand-edited JSON, a bad paste) — both blocks render; ids are re-keyed so React never collapses them. Pinned in Task 5 (`guard: re-keys duplicate ids`).
3. **A publish landing while a shopper is mid-checkout** — the page set is read once per page load (no refetch on window focus), so a half-filled checkout is never swapped out from under the shopper. Pinned in Task 7 (`usePageSet does not refetch on window focus`).
4. **Hostile richtext** — `javascript:` links, `<img onerror>`, `<script>`, `style=` and protocol-relative `//evil` hrefs are stripped client-side even if the backend let them through. Pinned in Task 2 (`sanitizeRichtext` cases).
5. **Custom page URLs that do not resolve** — an uppercase/invalid slug, or a valid slug missing from the published set, redirects to `/` exactly like today's catch-all; leaving a custom page restores the brand title. Pinned in Task 14 (`CustomPageRoute`) and Task 7 (`PuckPage restores the title`).

---

## File map

```
web/src/builder/
  types.ts            A4 types + CUSTOM_SLUG_RE, BLOCK_TYPE_RE, MAX_DEPTH, MAX_COMPONENTS, isRecord, isComponentLike, isFixedRouteKey, customPageKey, EMPTY_ROOT
  define.ts           defineBlock + BlockDef types, zod field helpers (slot, richtext, routeLink, mediaSrc, paletteToken, spacing, override), parseBlockProps, override→scope helpers
  mode.ts             BuilderModeProvider / useBuilderMode / PreviewAs
  sanitize.ts         RICHTEXT_ALLOWED_TAGS, sanitizeRichtext (dompurify)
  registry.ts         BLOCKS (import.meta.glob of ./blocks/*.tsx), collectBlocks
  rules.ts            PLACEMENT, SHELL_ONLY, countBlocks, allowedOn, checkRules
  guard.ts            validateDoc (memoised per doc object)
  render.tsx          RenderDoc, BlockBoundary, DocBoundary
  runtime.tsx         usePageSet, PageSetOverrideProvider, resolveDoc, PuckPage, PuckShell, useCurrentRouteKey
  blocks-manifest.ts  blocksManifest() → web/public/blocks.json (Task 23)
  defaults/index.ts   defaultDoc (import.meta.glob of ./groups/*.ts)
  defaults/helpers.ts block(), doc(), DefaultEntry
  defaults/groups/{shell,catalogue,commerce,account,post-order}.ts
  blocks/_shared/     CoreOptionsScope.tsx, SmartLink.tsx, RichHtml.tsx, cart-context.ts, lazy-pages.ts
  blocks/<Name>.tsx   one block per file (+ <Name>.module.css for new UI)
web/src/api/pages.ts              fetchPageSet, toPageSet
web/src/templates/core-scope.ts   CoreOptionsScopeContext (read by useCoreOptions + Slot)
web/src/layouts/*                 shells split into exported Frame / Header / Main parts (legacy XShell kept as parity oracle)
web/public/blocks.json            emitted to web/dist/blocks.json by Vite
worker/src/{proxy,media}.ts       pages edge cache, storefront-pages media rule
e2e/dom-parity.spec.ts            v0.6.0 DOM baseline (captured first) · e2e/builder.spec.ts published sets
docs/builder.md, README.md, web/package.json
```

## Parallelisation map

Tasks share one worktree; tasks listed in the same wave touch disjoint files and may run concurrently (max 5 subagents).

| Wave | Tasks (concurrent) | Waits for |
|---|---|---|
| A | 1 (DOM baseline), 2 (types/define/mode/sanitize), 3 (Worker) | — (Task 1 must be committed before Task 4 starts) |
| B | 4 (layout parts), 5 (registry/rules/guard), 6 (e2e `pages` fixture) | 4: Task 1 · 5, 6: Task 2 |
| C | 7 (renderer + runtime + core scope) | 5 |
| D | 8 (shell blocks + PuckShell), 9 (catalogue), 10 (catalogue extras), 11 (cart/checkout/login), 12 (account) — then 13 (post-order) as soon as one finishes | 8: 4 + 7 · 9–13: 7 (10 also 4) |
| E | 14 (router switch) → 15 (PARITY GATE) | 14: 3, 6, 8–13 · 15: 14 |
| F | 16, 17, 18, 19, 20 (content blocks) — then 21 (nav links, footer columns, custom catalogue intro) as a slot frees | 15 (21 also needs 8 and 10, done by then) |
| G | 22 (published-set e2e) → 23 (blocks.json, docs, version) | 22: 16–21 · 23: 22 |

---
## Phase 1 — Foundation

### Task 1: Capture the v0.6.0 DOM baseline (before any source change)

**Wave A.** Runs in parallel with Tasks 2 and 3 (they do not change rendered DOM). **Must be committed before Task 4 starts** — the baseline has to be pure v0.6.0.

**Files:**
- Create: `e2e/dom-parity.spec.ts`
- Create (generated): `e2e/__baseline__/dom-*.txt`

**Interfaces:**
- Consumes: `installMocks`, `ORDER_PATH`, `Layout` from `e2e/mocks.ts`; `FIXED_NOW` from `e2e/flows.ts`.
- Produces: a permanent DOM regression gate. Tasks 4, 14 and 15 run it; no later task may regenerate it without a per-snapshot justification in the commit message.

- [ ] **Step 1: Write the spec**

```ts
// e2e/dom-parity.spec.ts
import { expect, test, type Page } from '@playwright/test';
import { installMocks, ORDER_PATH, type Layout } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import type { StorefrontSettings } from '../web/src/types/settings.ts';

/**
 * v0.6.0's DOM for every route, captured BEFORE the page builder touched any source.
 * With no published page set, the builder's default documents must reproduce it
 * (spec §13 A1). A difference is a regression unless justified per snapshot in the
 * commit that regenerates it (`--update-snapshots -g "<test name>"`).
 */
interface RouteCase {
  name: string;
  path: string;
  layouts: Layout[];
  session: boolean;
  tweak?: (s: StorefrontSettings) => void;
}

const ALL: Layout[] = ['storefront', 'menu', 'webapp'];

const CASES: RouteCase[] = [
  { name: 'catalog', path: '/', layouts: ALL, session: true },
  { name: 'category', path: '/c/concentrates', layouts: ALL, session: true },
  { name: 'product', path: '/p/101', layouts: ['storefront'], session: true },
  { name: 'product-sheet', path: '/?p=101', layouts: ['menu', 'webapp'], session: true },
  { name: 'wholesale', path: '/', layouts: ALL, session: true, tweak: (s) => { s.features.wholesale = true; } },
  { name: 'cart', path: '/cart', layouts: ALL, session: true },
  { name: 'checkout', path: '/checkout', layouts: ALL, session: true },
  { name: 'login', path: '/login', layouts: ALL, session: false },
  { name: 'account-orders', path: '/account/orders', layouts: ALL, session: true },
  { name: 'account-order', path: '/account/orders/K4M2QP', layouts: ALL, session: true },
  { name: 'account-loyalty', path: '/account/loyalty', layouts: ALL, session: true },
  { name: 'account-referrals', path: '/account/referrals', layouts: ALL, session: true },
  { name: 'account-profile', path: '/account/profile', layouts: ALL, session: true },
  { name: 'order-status', path: ORDER_PATH, layouts: ALL, session: false },
  { name: 'payment-cancel', path: '/payment/cancel', layouts: ALL, session: false },
  { name: 'order-placed', path: '/order-placed', layouts: ALL, session: false },
  { name: 'tracking', path: '/tracking', layouts: ALL, session: false },
  { name: 'tracking-ref', path: '/tracking/E2E1', layouts: ALL, session: false },
  { name: 'verify', path: '/verify', layouts: ALL, session: false },
];

const WIDTHS = [390, 1280] as const;

/** Ids that React/Mantine derive from render order, and one tag per line so a diff reads. */
export function normalizeDom(html: string): string {
  return html
    .replace(/(mantine-)[a-z0-9]{5,}/gi, '$1ID')
    .replace(/«r[0-9a-z]+»|:r[0-9a-z]+:|_r_[0-9a-z]+_/g, 'RID')
    .replace(/></g, '>\n<');
}

async function snapshotOnce(page: Page): Promise<string> {
  return page.evaluate(() => {
    const body = document.body.cloneNode(true) as HTMLElement;
    body.querySelectorAll('script').forEach((s) => s.remove());
    return `title: ${document.title}\n${body.innerHTML}`;
  });
}

/** Settled DOM: no loading skeleton, no network, and two reads 300 ms apart agree (drawer/sheet transitions done). */
async function capture(page: Page): Promise<string> {
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('status', { name: 'Loading' })).toHaveCount(0);
  let prev = await snapshotOnce(page);
  for (let i = 0; i < 10; i += 1) {
    await page.waitForTimeout(300);
    const next = await snapshotOnce(page);
    if (next === prev) return normalizeDom(next);
    prev = next;
  }
  return normalizeDom(prev);
}

for (const c of CASES) {
  for (const layout of c.layouts) {
    for (const width of WIDTHS) {
      test(`dom · ${c.name} · ${layout} · ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
        await page.clock.setFixedTime(FIXED_NOW);
        await installMocks(page, { layout, session: c.session, tweakSettings: c.tweak });
        await page.goto(c.path);
        expect(await capture(page)).toMatchSnapshot(`dom-${c.name}-${layout}-${width}.txt`);
      });
    }
  }
}
```

- [ ] **Step 2: Capture the baseline on unmodified v0.6.0 source**

Run: `npx playwright test -c e2e/playwright.config.ts e2e/dom-parity.spec.ts --update-snapshots`
Expected: every test passes and `e2e/__baseline__/dom-*.txt` files appear (≈ 106 files). `git status` must show NO change under `web/src/` — if it does, stop: the baseline is only valid on untouched source.

- [ ] **Step 3: Prove the baseline is stable**

Run: `npx playwright test -c e2e/playwright.config.ts e2e/dom-parity.spec.ts --repeat-each=2`
Expected: all PASS. If a case flickers, find the time- or order-dependent attribute in the diff and add one targeted `.replace()` to `normalizeDom` (never drop a whole element), then re-run Step 2 and Step 3.

- [ ] **Step 4: Commit**

```bash
git add e2e/dom-parity.spec.ts e2e/__baseline__/dom-*.txt
git commit -m "test(e2e): capture the v0.6.0 DOM of every route as the page-builder parity baseline"
```

---

### Task 2: Builder types, block definition helpers, mode, richtext sanitiser

**Wave A.** Parallel with Tasks 1 and 3.

**Files:**
- Create: `web/src/builder/types.ts`, `web/src/builder/define.ts`, `web/src/builder/mode.ts`, `web/src/builder/sanitize.ts`
- Modify: `web/package.json`, `web/package-lock.json` (add `dompurify`)
- Test: `web/test/builder-types.test.ts`, `web/test/builder-define.test.ts`, `web/test/builder-sanitize.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (every later task imports these):
  - `types.ts`: `LayoutKind`, `FIXED_ROUTE_KEYS`, `FixedRouteKey`, `RouteKey`, `DocKey`, `ComponentData`, `PageRootProps`, `PuckDoc`, `PageSet`, `Issue` (exactly A4), plus `CUSTOM_SLUG_RE`, `BLOCK_TYPE_RE`, `MAX_DEPTH = 12`, `MAX_COMPONENTS = 2000`, `EMPTY_ROOT`, `isRecord(v)`, `isComponentLike(v)`, `isFixedRouteKey(k)`, `customPageKey(slug): RouteKey | null`.
  - `define.ts`: `BlockCategory`, `SlotRender`, `BlockRenderContext`, `SlotProps<P>`, `BlockDef<P>`, `defineBlock`, `parseBlockProps(def, raw)`, field helpers `slot()`, `richtext()`, `routeLink()`, `mediaSrc()`, `paletteToken()`, `spacing()`, `override()`, constants `PALETTE_TOKENS`, `SPACING`, `MEDIA_SRC_RE`, and `tokenVar(t)`, `isSafeHref(h)`, `boolOverride(o)`, `iconOverride(o)`, `compactScope(o)`; types `PaletteToken`, `SpacingKey`, `Override`.
  - `mode.ts`: `PreviewAs`, `BuilderMode`, `BuilderModeProvider`, `useBuilderMode()`.
  - `sanitize.ts`: `RICHTEXT_ALLOWED_TAGS`, `sanitizeRichtext(html)`.

- [ ] **Step 1: Add the dependency**

Run: `npm --prefix web install dompurify@^3`
Expected: `web/package.json` gains `"dompurify": "^3.x.y"` under `dependencies` (dompurify 3 ships its own types — do not add `@types/dompurify`).

- [ ] **Step 2: Write the failing tests**

```ts
// web/test/builder-types.test.ts
import { describe, expect, it } from 'vitest';
import { customPageKey, FIXED_ROUTE_KEYS, isComponentLike, isFixedRouteKey } from '@/builder/types.ts';

describe('builder types', () => {
  it('lists the 16 fixed route keys from the spec', () => {
    expect(FIXED_ROUTE_KEYS).toHaveLength(16);
    expect(isFixedRouteKey('account.order')).toBe(true);
    expect(isFixedRouteKey('page:about')).toBe(false);
  });
  it('builds custom page keys only from valid slugs', () => {
    expect(customPageKey('our-story')).toBe('page:our-story');
    expect(customPageKey('Our-Story')).toBeNull();
    expect(customPageKey('')).toBeNull();
    expect(customPageKey('a'.repeat(61))).toBeNull();
  });
  it('recognises component-shaped values', () => {
    expect(isComponentLike({ type: 'Heading', props: { id: 'h1' } })).toBe(true);
    expect(isComponentLike({ type: 'Heading', props: {} })).toBe(false);
    expect(isComponentLike({ type: 'Heading', props: { id: 'x'.repeat(65) } })).toBe(false);
    expect(isComponentLike(null)).toBe(false);
  });
});
```

```ts
// web/test/builder-define.test.ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  boolOverride, compactScope, defineBlock, iconOverride, isSafeHref, mediaSrc, override,
  paletteToken, parseBlockProps, routeLink, slot, tokenVar,
} from '@/builder/define.ts';
import type { ComponentData } from '@/builder/types.ts';

type P = { id: string; title: string; size: 'sm' | 'lg'; items: ComponentData[] };
const def = defineBlock<{ id: string; title: string; size: 'sm' | 'lg' }>({
  name: 'Probe', label: 'Probe', category: 'content', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({ title: z.string().max(10), size: z.enum(['sm', 'lg']) }),
  defaultProps: { title: 'Hello', size: 'sm' },
  render: () => null,
});

describe('parseBlockProps', () => {
  it('keeps valid props and strips unknown keys', () => {
    expect(parseBlockProps(def, { title: 'Hi', size: 'lg', extra: 1 })).toEqual({ title: 'Hi', size: 'lg' });
  });
  it('falls back field by field', () => {
    expect(parseBlockProps(def, { title: 'x'.repeat(11), size: 'lg' })).toEqual({ title: 'Hello', size: 'lg' });
    expect(parseBlockProps(def, {})).toEqual({ title: 'Hello', size: 'sm' });
  });
  it('does not share default objects between parses', () => {
    const withSlot = defineBlock<P>({
      name: 'Box', label: 'Box', category: 'content', layouts: 'all', routeBound: false, slots: ['items'],
      schema: z.object({ title: z.string(), size: z.enum(['sm', 'lg']), items: slot() }),
      defaultProps: { title: 't', size: 'sm', items: [] },
      render: () => null,
    });
    const a = parseBlockProps(withSlot, { items: 'nope' });
    (a.items as unknown[]).push(1);
    expect(parseBlockProps(withSlot, { items: 'nope' }).items).toEqual([]);
  });
});

describe('field helpers', () => {
  it('routeLink accepts site paths and safe schemes only', () => {
    for (const ok of ['', '/', '/pages/our-story', 'https://shop.example/x', 'mailto:hi@shop.example', 'tel:+441234']) expect(routeLink().safeParse(ok).success, ok).toBe(true);
    for (const bad of ['//evil.example', 'http://shop.example', 'javascript:alert(1)', 'pages/x', ' /x']) expect(routeLink().safeParse(bad).success, bad).toBe(false);
    expect(isSafeHref('/c/concentrates')).toBe(true);
  });
  it('mediaSrc accepts only uploaded storefront-page media', () => {
    expect(mediaSrc().safeParse('/media/storefront-pages/media/' + 'a'.repeat(32) + '.webp').success).toBe(true);
    expect(mediaSrc().safeParse('').success).toBe(true);
    expect(mediaSrc().safeParse('https://cdn.example/x.png').success).toBe(false);
    expect(mediaSrc().safeParse('/media/storefront-pages/media/' + 'A'.repeat(32) + '.png').success).toBe(false);
  });
  it('palette tokens map to --sf variables', () => {
    expect(paletteToken().safeParse('surface-2').success).toBe(true);
    expect(paletteToken().safeParse('#ff0000').success).toBe(false);
    expect(tokenVar('primary')).toBe('var(--sf-primary)');
    expect(tokenVar('none')).toBeUndefined();
  });
  it('overrides map onto core options, dropping inherit', () => {
    expect(override().safeParse('inherit').success).toBe(true);
    expect(boolOverride('show')).toBe(true);
    expect(boolOverride('hide')).toBe(false);
    expect(boolOverride('inherit')).toBeUndefined();
    expect(iconOverride('show')).toBe('all');
    expect(iconOverride('hide')).toBe('none');
    expect(compactScope({ showSku: false, showPageTitle: undefined })).toEqual({ showSku: false });
  });
});
```

```ts
// web/test/builder-sanitize.test.ts
import { describe, expect, it } from 'vitest';
import { RICHTEXT_ALLOWED_TAGS, sanitizeRichtext } from '@/builder/sanitize.ts';

describe('sanitizeRichtext', () => {
  it('keeps the allowlisted tags', () => {
    expect(RICHTEXT_ALLOWED_TAGS).toEqual(['p', 'h2', 'h3', 'h4', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'br', 'code']);
    expect(sanitizeRichtext('<p><strong>Hi</strong> <em>there</em></p>')).toBe('<p><strong>Hi</strong> <em>there</em></p>');
  });
  it('strips scripts, handlers, styles and unknown tags', () => {
    expect(sanitizeRichtext('<p style="color:red" onclick="x()">a</p><script>alert(1)</script>')).toBe('<p>a</p>');
    expect(sanitizeRichtext('<img src=x onerror=alert(1)><h1>Big</h1>')).toBe('Big');
  });
  it('allows only safe hrefs and forces rel on external links', () => {
    expect(sanitizeRichtext('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeRichtext('<a href="//evil.example">x</a>')).toBe('<a>x</a>');
    expect(sanitizeRichtext('<a href="/pages/our-story" rel="x" target="_blank">x</a>')).toBe('<a href="/pages/our-story">x</a>');
    expect(sanitizeRichtext('<a href="https://shop.example">x</a>')).toBe('<a href="https://shop.example" rel="noopener noreferrer">x</a>');
    expect(sanitizeRichtext('<a href="mailto:hi@shop.example">x</a>')).toBe('<a href="mailto:hi@shop.example">x</a>');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm --prefix web test -- test/builder-types.test.ts test/builder-define.test.ts test/builder-sanitize.test.ts`
Expected: FAIL — `Failed to resolve import "@/builder/types.ts"` (and the other two modules).

- [ ] **Step 4: Implement `types.ts`**

```ts
// web/src/builder/types.ts
/** Shared page-set types (spec §13 A4). The backend mirrors these in zod; Plan 3/4 import them. */
export type LayoutKind = 'storefront' | 'menu' | 'webapp';

export const FIXED_ROUTE_KEYS = ['catalog', 'product', 'cart', 'checkout', 'login', 'account.orders', 'account.order',
  'account.loyalty', 'account.referrals', 'account.profile', 'order-status', 'payment-success', 'payment-cancel',
  'order-placed', 'verify', 'tracking'] as const;
export type FixedRouteKey = typeof FIXED_ROUTE_KEYS[number];
export type RouteKey = FixedRouteKey | `page:${string}`; // slug /^[a-z0-9-]{1,60}$/
export type DocKey = RouteKey | 'shell';

export interface ComponentData { type: string; props: { id: string; [k: string]: unknown } }
export interface PageRootProps { title: string; description: string; chrome: 'shell' | 'none' }
export interface PuckDoc { root: { props: PageRootProps }; content: ComponentData[]; zones?: Record<string, ComponentData[]> }
export interface PageSet { schemaVersion: 1; shell: PuckDoc; pages: Partial<Record<RouteKey, PuckDoc>> }
export interface Issue { docKey: DocKey; rule: string; message: string; blockId?: string }

export const CUSTOM_SLUG_RE = /^[a-z0-9-]{1,60}$/;
export const BLOCK_TYPE_RE = /^[A-Z][A-Za-z0-9]{0,40}$/;
export const MAX_DEPTH = 12;
export const MAX_COMPONENTS = 2000;
export const EMPTY_ROOT: PageRootProps = { title: '', description: '', chrome: 'shell' };

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** `{ type, props: { id } }` with a string type and a string id of at most 64 chars. */
export function isComponentLike(v: unknown): v is ComponentData {
  return isRecord(v) && typeof v.type === 'string' && isRecord(v.props)
    && typeof v.props.id === 'string' && v.props.id.length > 0 && v.props.id.length <= 64;
}

export function isFixedRouteKey(k: string): k is FixedRouteKey {
  return (FIXED_ROUTE_KEYS as readonly string[]).includes(k);
}

export function customPageKey(slug: string | undefined): RouteKey | null {
  return slug !== undefined && CUSTOM_SLUG_RE.test(slug) ? `page:${slug}` : null;
}
```

- [ ] **Step 5: Implement `define.ts`**

```ts
// web/src/builder/define.ts
import type { CSSProperties, ElementType, ReactNode } from 'react';
import { z } from 'zod';
import type { CoreOptions } from '@/templates/hooks.ts';
import type { HeaderIconMode } from '@/templates/define.ts';
import { isComponentLike, type ComponentData, type DocKey, type LayoutKind } from '@/builder/types.ts';

// Runtime-safe: nothing here may value-import @puckeditor/core (spec §13 A1).

export type BlockCategory = 'shell' | 'catalogue' | 'product' | 'commerce' | 'post-order' | 'content';
/** A slot prop at render time. No argument (or none of the three keys) = the children with no wrapper. */
export type SlotRender = (p?: { className?: string; style?: CSSProperties; as?: ElementType }) => ReactNode;
export interface BlockRenderContext { editing: boolean; docKey: DocKey; layout: LayoutKind }
/** Slot props (typed `ComponentData[]` in P) arrive at render as `SlotRender`. */
export type SlotProps<P> = { [K in keyof P]: P[K] extends ComponentData[] ? SlotRender : P[K] };

export interface BlockDef<P extends Record<string, unknown>> {
  name: string;
  label: string;
  category: BlockCategory;
  layouts: LayoutKind[] | 'all';
  /** A §5.3 route block (+ PageOutlet, ProductDetail): required on its route, may only appear there, locked in the editor. */
  routeBound: boolean;
  /** Prop names holding ComponentData[]. */
  slots: readonly (keyof P & string)[];
  /** Every prop except `id`; slot props use `slot()`. Parse failures fall back per field. */
  schema: z.ZodType<Omit<P, 'id'>>;
  defaultProps: Omit<P, 'id'>;
  /**
   * Must not call hooks directly — return JSX of an inner component. The editor (Plan 3)
   * may invoke it as a plain function.
   */
  render(props: SlotProps<P> & { puck: BlockRenderContext }): ReactNode;
}

export function defineBlock<P extends Record<string, unknown>>(def: BlockDef<P>): BlockDef<P> {
  return def;
}

/** The block's props from stored data: whole-object parse, else field by field onto defaults. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseBlockProps(def: BlockDef<any>, raw: Record<string, unknown>): Record<string, unknown> {
  const whole = def.schema.safeParse(raw);
  if (whole.success) return whole.data as Record<string, unknown>;
  const out: Record<string, unknown> = structuredClone(def.defaultProps) as Record<string, unknown>;
  if (def.schema instanceof z.ZodObject) {
    const shape = def.schema.shape as Record<string, z.ZodType>;
    for (const key of Object.keys(shape)) {
      const r = shape[key]!.safeParse(raw[key]);
      if (r.success) out[key] = r.data;
    }
  }
  return out;
}

// ── field helpers ────────────────────────────────────────────────────────────

/** A slot: an array of component-shaped children (the guard validates each child). */
export const slot = () => z.array(z.custom<ComponentData>((v) => isComponentLike(v)));

/** Richtext is an HTML string (spec §13 A2); the prop key must end in `Html`. */
export const richtext = () => z.string().max(20_000);

/** `''`, a site-relative path (not `//`), or an https:/mailto:/tel: URL. */
export function isSafeHref(h: string): boolean {
  if (h === '') return true;
  if (h.startsWith('/')) return !h.startsWith('//');
  return /^(https:\/\/|mailto:|tel:)/i.test(h);
}
export const routeLink = () => z.string().max(2048).refine(isSafeHref, { message: 'Link must be a site path, https:, mailto: or tel:' });

export const MEDIA_SRC_RE = /^\/media\/storefront-pages\/media\/[a-f0-9]{32}\.(png|jpg|webp|gif)$/;
/** An uploaded image (spec §13 A3) or `''`. */
export const mediaSrc = () => z.string().regex(MEDIA_SRC_RE).or(z.literal(''));

export const PALETTE_TOKENS = ['none', 'bg', 'bg-deep', 'surface', 'surface-2', 'surface-3', 'line', 'line-strong',
  'text', 'muted', 'faint', 'primary', 'primary-soft', 'success', 'warn', 'danger'] as const;
export type PaletteToken = typeof PALETTE_TOKENS[number];
export const paletteToken = () => z.enum(PALETTE_TOKENS);
export function tokenVar(t: PaletteToken): string | undefined {
  return t === 'none' ? undefined : `var(--sf-${t})`;
}

export const SPACING = { none: '0', xs: '0.5rem', sm: '1rem', md: '1.5rem', lg: '2.5rem', xl: '4rem' } as const;
export type SpacingKey = keyof typeof SPACING;
export const spacing = () => z.enum(['none', 'xs', 'sm', 'md', 'lg', 'xl']);

export const OVERRIDES = ['inherit', 'show', 'hide'] as const;
export type Override = typeof OVERRIDES[number];
export const override = () => z.enum(OVERRIDES);
export function boolOverride(o: Override): boolean | undefined {
  return o === 'show' ? true : o === 'hide' ? false : undefined;
}
export function iconOverride(o: Override): HeaderIconMode | undefined {
  return o === 'show' ? 'all' : o === 'hide' ? 'none' : undefined;
}
/** Drops undefined keys, so `inherit` leaves the store-wide core option in charge. */
export function compactScope(o: { [K in keyof CoreOptions]?: CoreOptions[K] | undefined }): Partial<CoreOptions> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as Partial<CoreOptions>;
}
```

Note: the web package has no ESLint; delete the `eslint-disable` comment if you prefer — it is harmless. `import type { CoreOptions } from '@/templates/hooks.ts'` is type-only (erased), so `define.ts` stays free of runtime imports from the app.

- [ ] **Step 6: Implement `mode.ts` and `sanitize.ts`**

```ts
// web/src/builder/mode.ts
import { createContext, createElement, useContext, type ReactNode } from 'react';

export type PreviewAs = { session: 'signed-out' | 'signed-in' | 'signed-in-orders'; cart: 'empty' | 'items' };
export interface BuilderMode { editing: boolean; previewAs: PreviewAs | null }

const SHOPPER: BuilderMode = { editing: false, previewAs: null };
const BuilderModeContext = createContext<BuilderMode>(SHOPPER);

/** The editor (Plan 3) wraps its canvas in this; shoppers never see it. (`.ts`, so no JSX.) */
export function BuilderModeProvider({ value, children }: { value: BuilderMode; children: ReactNode }) {
  return createElement(BuilderModeContext.Provider, { value }, children);
}

export function useBuilderMode(): BuilderMode {
  return useContext(BuilderModeContext);
}
```

```ts
// web/src/builder/sanitize.ts
import DOMPurify from 'dompurify';

/** Same allowlist as the backend's isomorphic-dompurify config (spec §4.3). */
export const RICHTEXT_ALLOWED_TAGS: readonly string[] = ['p', 'h2', 'h3', 'h4', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'br', 'code'];
const SAFE_HREF = /^(?:https:\/\/|mailto:|tel:|\/(?!\/))/i;

let purifier: ReturnType<typeof DOMPurify> | null = null;

function instance(): ReturnType<typeof DOMPurify> {
  if (purifier) return purifier;
  const p = DOMPurify(window);
  p.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName !== 'A') return;
    const href = node.getAttribute('href');
    if (href !== null && !SAFE_HREF.test(href)) node.removeAttribute('href');
    const kept = node.getAttribute('href');
    if (kept !== null && /^https:/i.test(kept)) node.setAttribute('rel', 'noopener noreferrer');
  });
  purifier = p;
  return p;
}

/** Defence in depth: the backend sanitised this already; the storefront never trusts it. */
export function sanitizeRichtext(html: string): string {
  return instance().sanitize(html, {
    ALLOWED_TAGS: [...RICHTEXT_ALLOWED_TAGS],
    ALLOWED_ATTR: ['href'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm --prefix web test -- test/builder-types.test.ts test/builder-define.test.ts test/builder-sanitize.test.ts`
Expected: PASS. If `sanitizeRichtext('<img src=x onerror=alert(1)><h1>Big</h1>')` returns `'<h1>Big</h1>'`-less text with different whitespace, keep the assertion and fix the config (`h1` is not allowlisted, so DOMPurify keeps its text content only — `KEEP_CONTENT` defaults to true).

- [ ] **Step 8: Typecheck and commit**

Run: `npm --prefix web run typecheck`
Expected: exit 0.

```bash
git add web/package.json web/package-lock.json web/src/builder/types.ts web/src/builder/define.ts web/src/builder/mode.ts web/src/builder/sanitize.ts web/test/builder-types.test.ts web/test/builder-define.test.ts web/test/builder-sanitize.test.ts
git commit -m "feat(builder): page-set types, block definition helpers, builder mode and richtext sanitiser"
```

---

### Task 3: Worker — edge-cache the page set, proxy storefront-page media

**Wave A.** Parallel with anything (touches only `worker/`).

**Files:**
- Modify: `worker/src/proxy.ts` (`CACHE_RULES`), `worker/src/media.ts` (`RULES`)
- Test: `worker/test/proxy.test.ts`, `worker/test/media.test.ts` (append new `it` blocks only)

**Interfaces:**
- Produces: `GET /api/storefront/pages/(storefront|menu|webapp)` cached 30 s at the edge (anonymous GETs only, same as settings); `GET /media/storefront-pages/media/<32 hex>.(png|jpg|webp|gif)` → backend `api/v1/storefront-pages/media/<key>` with the existing 1-day media cache.

- [ ] **Step 1: Write the failing tests** (append inside the existing `describe` blocks)

```ts
// worker/test/proxy.test.ts — inside describe('allowlist')
  it('allows the page-set route', () => {
    expect(isAllowedApiPath('storefront/pages/menu')).toBe(true);
  });

// worker/test/proxy.test.ts — inside describe('cacheTtlFor')
  it('caches the published page set 30s per layout and nothing next to it', () => {
    expect(cacheTtlFor('storefront/pages/storefront')).toBe(30);
    expect(cacheTtlFor('storefront/pages/menu')).toBe(30);
    expect(cacheTtlFor('storefront/pages/webapp')).toBe(30);
    expect(cacheTtlFor('storefront/pages/other')).toBe(0);
    expect(cacheTtlFor('storefront/pages/menu/extra')).toBe(0);
  });
```

```ts
// worker/test/media.test.ts — inside describe('mediaTarget')
  it('maps storefront-page media keys', () => {
    const key = 'a'.repeat(32) + '.webp';
    expect(mediaTarget(`/media/storefront-pages/media/${key}`, '', 'https://b.test/')?.toString())
      .toBe(`https://b.test/api/v1/storefront-pages/media/${key}`);
  });
  it('rejects malformed storefront-page media keys', () => {
    for (const bad of ['A'.repeat(32) + '.png', 'a'.repeat(31) + '.png', 'a'.repeat(32) + '.svg', 'a'.repeat(32) + '.jpeg', '../x.png']) {
      expect(mediaTarget(`/media/storefront-pages/media/${bad}`, '', 'https://b.test/'), bad).toBeNull();
    }
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:worker`
Expected: FAIL — `cacheTtlFor('storefront/pages/storefront')` is `0`, and the media target is `null`.

- [ ] **Step 3: Implement**

```ts
// worker/src/proxy.ts
const CACHE_RULES: Array<[RegExp, number]> = [
  [/^storefront\/settings$/, 30],
  // The published page set — same 30 s as settings, so a publish shows within half a minute.
  [/^storefront\/pages\/(?:storefront|menu|webapp)$/, 30],
  [/^catalog$/, 60],
  [/^catalog\/products\/\d+$/, 60],
];
```

```ts
// worker/src/media.ts
const RULES: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^\/media\/products\/(\d+)\/image$/, (m) => `api/v1/products/${m[1]}/image`],
  [/^\/media\/settings\/branding\/(logo|favicon)$/, (m) => `api/v1/settings/branding/${m[1]}`],
  [/^\/media\/storefront-settings\/branding\/(logo|favicon)$/, (m) => `api/v1/storefront-settings/branding/${m[1]}`],
  // Page-builder uploads (spec §13 A3): a random 32-hex key, never a user-chosen name.
  [/^\/media\/storefront-pages\/media\/([a-f0-9]{32}\.(?:png|jpg|webp|gif))$/, (m) => `api/v1/storefront-pages/media/${m[1]}`],
];
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:worker && npx tsc --noEmit -p worker`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add worker/src/proxy.ts worker/src/media.ts worker/test/proxy.test.ts worker/test/media.test.ts
git commit -m "feat(worker): edge-cache the published page set 30s and proxy storefront-page media"
```

---
### Task 4: Split the three shells into composable parts (DOM unchanged)

**Wave B.** Needs Task 1 committed. Parallel with Tasks 5 and 6.

**Files:**
- Modify: `web/src/layouts/shell-context.ts`, `web/src/layouts/StorefrontShell.tsx`, `web/src/layouts/MenuShell.tsx`, `web/src/layouts/WebAppShell.tsx`
- Modify: `web/src/layouts/StorefrontShell.module.css`, `web/src/layouts/MenuShell.module.css`, `web/src/layouts/WebAppShell.module.css` (one new `.unstuck` class each)
- Create: `web/src/layouts/ShellFooter.tsx`
- Test: `web/test/shell-parts.test.tsx` (new); existing `web/test/shell-header-options.test.tsx`, `web/test/templates-parts.test.ts`, `web/test/chassis.test.ts` must pass **unchanged**

**Interfaces:**
- Consumes: nothing from the builder.
- Produces (Task 8's shell blocks and `PuckShell` import these):
  - `shell-context.ts`: `ShellSearchContext` (unchanged), `useShellSearch()` (unchanged), `ShellStateContext`, `useShellState(): ShellSearchContext`, `useShellStateValue(): ShellSearchContext`.
  - `StorefrontShell.tsx`: `ShellHeaderProps { topBar?: boolean; search?: boolean; sticky?: boolean; nav?: ReactNode }`, `StorefrontHeader(p: ShellHeaderProps)`, `StorefrontMain()`, `StorefrontFrame(p: { children: ReactNode; cartBar?: boolean })`, `StorefrontShell()` (legacy composition, kept as the parity oracle and for existing tests).
  - `MenuShell.tsx`: `MenuHeader(p: ShellHeaderProps)`, `MenuMain()`, `MenuFrame(p: { children: ReactNode; cartBar?: boolean })`, `MenuContactStrip(p: { catalogOnly?: boolean })`, `MenuShell()`.
  - `WebAppShell.tsx`: `WebAppHeader(p: Omit<ShellHeaderProps, 'topBar'>)`, `WebAppMain()`, `WebAppFrame(p: { children: ReactNode; cartBar?: boolean })` (`cartBar` accepted and ignored — the web app's foot is the primary action), `WebAppShell()`.
  - `ShellFooter.tsx`: `ShellFooter()` — the template `Footer` slot with `supportLinks` + `hasChat`.
  - CSS: `.unstuck { position: static; }` in each shell module.

- [ ] **Step 1: Load the design skill**

Implementer: load the `frontend-design:frontend-design` skill before writing UI code. This task must not change a single rendered element — the skill is for judging the part boundaries and the non-sticky variant, not for restyling.

- [ ] **Step 2: Write the failing test**

```tsx
// web/test/shell-parts.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ReactNode } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
vi.mock('@/components/Brand.tsx', () => ({ Brand: () => <span>brand</span> }));
vi.mock('@/components/ContactLinks.tsx', () => ({ ContactLinks: () => <i data-testid="contact" /> }));
vi.mock('@/features/notices/NoticeBanners.tsx', () => ({ NoticeBanners: () => null }));
vi.mock('@/features/notices/CutoffBar.tsx', () => ({ CutoffBar: () => null }));
vi.mock('@/features/auth/LoginModal.tsx', () => ({ LoginModal: () => null }));
vi.mock('@/features/cart/CartDrawer.tsx', () => ({ CartDrawer: () => null }));
vi.mock('@/features/cart/MobileCartBar.tsx', () => ({ MobileCartBar: () => <i data-testid="cart-bar" />, useMobileCartBar: () => false }));
vi.mock('@/features/webapp/PrimaryActionBar.tsx', () => ({ PrimaryActionBar: () => <i data-testid="primary-bar" />, usePrimaryBarShowing: () => false }));
vi.mock('@/features/webapp/useTelegramChrome.ts', () => ({ useTelegramChrome: () => {}, isFirstHistoryEntry: () => true }));
vi.mock('@/lib/telegram-webapp.ts', () => ({ isTelegramWebApp: () => false }));
vi.mock('@/templates/runtime.tsx', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/templates/runtime.tsx')>()),
  Slot: ({ name }: { name: string }) => <i data-slot={name} />,
}));

import { StorefrontFrame, StorefrontHeader, StorefrontMain } from '@/layouts/StorefrontShell.tsx';
import { MenuContactStrip } from '@/layouts/MenuShell.tsx';
import { WebAppFrame } from '@/layouts/WebAppShell.tsx';
import { ShellStateContext, useShellSearch } from '@/layouts/shell-context.ts';

function mount(element: ReactNode, path = '/') {
  state.settings = {
    currency: 'GBP', welcomeMessage: null, enabled: true, supportLinks: [], notices: [],
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: null, links: { whatsapp: null, telegram: null } },
    features: { layout: 'storefront', ordering: true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false },
  } as unknown as StorefrontSettings;
  const router = createMemoryRouter([{ path: '*', element }], { initialEntries: [path] });
  return render(<MantineProvider env="test"><RouterProvider router={router} /></MantineProvider>);
}

afterEach(cleanup);

describe('StorefrontHeader', () => {
  it('renders the TopBar slot, the search field and a sticky header by default', () => {
    const { container } = mount(<StorefrontHeader />);
    expect(container.querySelector('[data-slot="TopBar"]')).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Search products' })).toBeInTheDocument();
    expect(container.querySelector('header')!.className).not.toMatch(/unstuck/);
  });
  it('drops the top bar and search, unsticks, and places nav after the home link', () => {
    const { container } = mount(<StorefrontHeader topBar={false} search={false} sticky={false} nav={<a href="/pages/our-story">Our story</a>} />);
    expect(container.querySelector('[data-slot="TopBar"]')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Search products' })).toBeNull();
    expect(container.querySelector('header')!.className).toMatch(/unstuck/);
    const links = screen.getAllByRole('link').map((a) => a.textContent);
    expect(links.indexOf('Our story')).toBe(links.indexOf('brand') + 1);
  });
});

describe('StorefrontMain', () => {
  it('hands the shell search state to the routed page', () => {
    function Page() { return <p>{useShellSearch().search}</p>; }
    const router = createMemoryRouter([{ path: '/', element: <StorefrontMain />, children: [{ index: true, element: <Page /> }] }]);
    render(
      <MantineProvider env="test">
        <ShellStateContext.Provider value={{ search: 'balm', setSearch: () => {} }}>
          <RouterProvider router={router} />
        </ShellStateContext.Provider>
      </MantineProvider>,
    );
    expect(screen.getByText('balm')).toBeInTheDocument();
    expect(document.querySelector('main[data-sf-part="main"]')).not.toBeNull();
  });
});

describe('frames', () => {
  it('mounts the phone cart bar unless the document placed its own', () => {
    mount(<StorefrontFrame><p>doc</p></StorefrontFrame>);
    expect(screen.getByTestId('cart-bar')).toBeInTheDocument();
    cleanup();
    mount(<StorefrontFrame cartBar={false}><p>doc</p></StorefrontFrame>);
    expect(screen.queryByTestId('cart-bar')).toBeNull();
    expect(document.querySelector('[data-slot="Overlay"]')).not.toBeNull();
  });
  it('the web app frame keeps its layout marker and primary action', () => {
    const { container } = mount(<WebAppFrame><p>doc</p></WebAppFrame>);
    expect(container.querySelector('[data-sf-layout="webapp"]')).not.toBeNull();
    expect(screen.getByTestId('primary-bar')).toBeInTheDocument();
  });
});

describe('MenuContactStrip', () => {
  it('shows on the catalogue only, unless told otherwise', () => {
    mount(<MenuContactStrip />, '/cart');
    expect(screen.queryByTestId('contact')).toBeNull();
    cleanup();
    mount(<MenuContactStrip catalogOnly={false} />, '/cart');
    expect(screen.getByTestId('contact')).toBeInTheDocument();
    cleanup();
    mount(<MenuContactStrip />, '/c/concentrates');
    expect(screen.getByTestId('contact')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm --prefix web test -- test/shell-parts.test.tsx`
Expected: FAIL — `StorefrontFrame` / `ShellStateContext` are not exported.

- [ ] **Step 4: Extend `shell-context.ts`**

```ts
// web/src/layouts/shell-context.ts
import { createContext, useContext, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router';

export interface ShellSearchContext {
  search: string;
  setSearch: (value: string) => void;
}

/**
 * Search text lives in the shell (the field is part of the header chrome) and is
 * handed down through the router outlet. Catalog and wholesale pages read it here.
 */
export function useShellSearch(): ShellSearchContext {
  return useOutletContext<ShellSearchContext>();
}

const NO_SHELL: ShellSearchContext = { search: '', setSearch: () => undefined };

/** The same state for the chrome itself (header, page outlet, search blocks). Outside a shell: inert. */
export const ShellStateContext = createContext<ShellSearchContext>(NO_SHELL);

export function useShellState(): ShellSearchContext {
  return useContext(ShellStateContext);
}

/** Owns the state; called once by whatever renders a shell (the legacy shells, PuckShell). */
export function useShellStateValue(): ShellSearchContext {
  const [search, setSearch] = useState('');
  return useMemo(() => ({ search, setSearch }), [search]);
}
```

- [ ] **Step 5: Create `ShellFooter.tsx`**

```tsx
// web/src/layouts/ShellFooter.tsx
import { useSettings } from '@/app/settings.ts';
import { Slot } from '@/templates/runtime.tsx';

/** The template's Footer slot with what both shells hand it. */
export function ShellFooter() {
  const { brand, supportLinks } = useSettings();
  const hasChat = !!(brand.links.whatsapp || brand.links.telegram);
  return <Slot name="Footer" supportLinks={supportLinks} hasChat={hasChat} />;
}
```

- [ ] **Step 6: Rewrite `StorefrontShell.tsx` as parts + legacy composition**

```tsx
// web/src/layouts/StorefrontShell.tsx
import { Suspense, type ReactNode } from 'react';
import { Link, Outlet } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import { useCartStore, selectCount } from '@/stores/cart.ts';
import { Brand } from '@/components/Brand.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { BagIcon, UserIcon } from '@/components/icons.tsx';
import { NoticeBanners } from '@/features/notices/NoticeBanners.tsx';
import { CutoffBar } from '@/features/notices/CutoffBar.tsx';
import { LoginModal } from '@/features/auth/LoginModal.tsx';
import { CartDrawer } from '@/features/cart/CartDrawer.tsx';
import { MobileCartBar, useMobileCartBar } from '@/features/cart/MobileCartBar.tsx';
import { SearchField } from '@/layouts/SearchField.tsx';
import { ShellFooter } from '@/layouts/ShellFooter.tsx';
import { ShellStateContext, useShellState, useShellStateValue } from '@/layouts/shell-context.ts';
import { Slot } from '@/templates/runtime.tsx';
import { headerIconClass, useCoreOptions } from '@/templates/hooks.ts';
import classes from '@/layouts/StorefrontShell.module.css';

export interface ShellHeaderProps {
  /** The template TopBar slot above the header (default on). */
  topBar?: boolean;
  /** The centre search field (default on; CSS still hides it below 62em). */
  search?: boolean;
  /** Sticky to the top of the viewport (default on). */
  sticky?: boolean;
  /** Rendered between the home link and the search field — the Header block's nav slot. */
  nav?: ReactNode;
}

/** TopBar slot + the header bar. */
export function StorefrontHeader({ topBar = true, search: withSearch = true, sticky = true, nav }: ShellHeaderProps) {
  const { brand, features } = useSettings();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const cartCount = useCartStore(selectCount);
  const { search, setSearch } = useShellState();
  const { headerAccountIcon, headerCartIcon } = useCoreOptions();
  const accountClass = headerIconClass(headerAccountIcon);
  const cartClass = headerIconClass(headerCartIcon);

  return (
    <>
      {topBar ? <Slot name="TopBar" /> : null}
      <header className={sticky ? classes.header : `${classes.header} ${classes.unstuck}`} data-sf-part="header">
        <NoticeBanners pinned />
        <div className={classes.headerInner}>
          <Link to="/" className={classes.home} aria-label={`${brand.name} — home`}>
            <Brand size="md" />
          </Link>

          {nav}

          {withSearch ? <SearchField className={classes.search} value={search} onChange={setSearch} /> : null}

          <div className={classes.actions}>
            {features.accounts && accountClass !== null ? (
              loggedIn ? (
                <Link to="/account" className={`${classes.action} ${accountClass}`} aria-label="Your account">
                  <UserIcon size={18} />
                </Link>
              ) : (
                <Link to="/login" className={`${classes.signIn} ${accountClass}`}>
                  Sign in
                </Link>
              )
            ) : null}

            {features.ordering && cartClass !== null ? (
              <Link
                to="/cart"
                className={`${classes.action} ${cartClass}`}
                aria-label={`Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}
              >
                <BagIcon size={18} />
                {cartCount > 0 ? <span className={classes.count} data-sf-part="badge">{cartCount}</span> : null}
              </Link>
            ) : null}
          </div>
        </div>
      </header>
    </>
  );
}

/** The content column: the routed page, with the shell's search handed down as outlet context. */
export function StorefrontMain() {
  const outletContext = useShellState();
  return (
    <main className={classes.main} data-sf-part="main">
      <Suspense fallback={<PageSkeleton inline />}>
        <Outlet context={outletContext} />
      </Suspense>
    </main>
  );
}

/** The shell root and the system mounts that sit after the page chrome (spec §5.4). */
export function StorefrontFrame({ children, cartBar = true }: { children: ReactNode; cartBar?: boolean }) {
  const { features } = useSettings();
  // The tab is fixed to the foot of the phone; the shell owes it the clearance.
  const barShowing = useMobileCartBar();
  return (
    <div className={barShowing ? `${classes.shell} ${classes.withBar}` : classes.shell}>
      {children}

      {features.ordering ? (
        <>
          <CartDrawer />
          {cartBar ? <MobileCartBar /> : null}
        </>
      ) : null}

      {features.accounts ? <LoginModal /> : null}

      <Slot name="Overlay" />
    </div>
  );
}

/**
 * The image-led shell: header, notice + dispatch rails, content column, footer.
 * v0.6.0's composition, kept verbatim as the parity oracle for the builder's
 * default shell document (test/builder-shell.test.tsx) — production renders PuckShell.
 */
export function StorefrontShell() {
  const state = useShellStateValue();
  return (
    <ShellStateContext.Provider value={state}>
      <StorefrontFrame>
        <StorefrontHeader />
        <NoticeBanners />
        <CutoffBar />
        <StorefrontMain />
        <ShellFooter />
      </StorefrontFrame>
    </ShellStateContext.Provider>
  );
}
```

- [ ] **Step 7: Rewrite `MenuShell.tsx`**

```tsx
// web/src/layouts/MenuShell.tsx
import { Suspense, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import { useCartStore, selectCount } from '@/stores/cart.ts';
import { useUiStore } from '@/stores/ui.ts';
import { Brand } from '@/components/Brand.tsx';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { BagIcon, FilterIcon, UserIcon } from '@/components/icons.tsx';
import { NoticeBanners } from '@/features/notices/NoticeBanners.tsx';
import { CutoffBar } from '@/features/notices/CutoffBar.tsx';
import { LoginModal } from '@/features/auth/LoginModal.tsx';
import { CartDrawer } from '@/features/cart/CartDrawer.tsx';
import { MobileCartBar, useMobileCartBar } from '@/features/cart/MobileCartBar.tsx';
import { SearchField } from '@/layouts/SearchField.tsx';
import { ShellFooter } from '@/layouts/ShellFooter.tsx';
import type { ShellHeaderProps } from '@/layouts/StorefrontShell.tsx';
import { ShellStateContext, useShellState, useShellStateValue } from '@/layouts/shell-context.ts';
import { Slot } from '@/templates/runtime.tsx';
import { headerIconClass, useCoreOptions } from '@/templates/hooks.ts';
import classes from '@/layouts/MenuShell.module.css';

const onCatalogPath = (pathname: string) => pathname === '/' || pathname.startsWith('/c/');

/** TopBar slot + the one compact bar. */
export function MenuHeader({ topBar = true, search: withSearch = true, sticky = true, nav }: ShellHeaderProps) {
  const { brand, features } = useSettings();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const cartCount = useCartStore(selectCount);
  const openPanel = useUiStore((s) => s.open);
  const { pathname } = useLocation();
  const { search, setSearch } = useShellState();
  const onCatalog = onCatalogPath(pathname);
  // Only the catalogue body carries the sheet this button opens — wholesale replaces
  // it, so the button would have nothing to show.
  const { showCategoryPicker, headerAccountIcon, headerCartIcon } = useCoreOptions();
  const canFilter = onCatalog && !features.wholesale && showCategoryPicker;
  const accountClass = headerIconClass(headerAccountIcon);
  const cartClass = headerIconClass(headerCartIcon);
  // A category in the path is the only filter this layout has — the dot says one is on.
  const filtered = pathname.startsWith('/c/');

  return (
    <>
      {topBar ? <Slot name="TopBar" /> : null}
      <header className={sticky ? classes.bar : `${classes.bar} ${classes.unstuck}`} data-sf-part="header">
        <NoticeBanners pinned />
        <div className={classes.barInner}>
          <Link to="/" className={classes.home} aria-label={`${brand.name} — home`}>
            <Brand size="sm" />
          </Link>

          {nav}

          {withSearch ? <SearchField className={classes.search} value={search} onChange={setSearch} placeholder="Search" /> : null}

          <div className={classes.actions}>
            {canFilter ? (
              <button
                type="button"
                className={classes.action}
                onClick={() => openPanel('filterOpen')}
                aria-label={filtered ? 'Categories — one category selected' : 'Categories'}
              >
                <FilterIcon size={17} />
                {filtered ? <span className={classes.mark} aria-hidden /> : null}
              </button>
            ) : null}

            {features.accounts && accountClass !== null ? (
              <Link
                to={loggedIn ? '/account' : '/login'}
                className={`${classes.action} ${accountClass}`}
                aria-label={loggedIn ? 'Your account' : 'Sign in'}
              >
                <UserIcon size={17} />
              </Link>
            ) : null}

            {features.ordering && cartClass !== null ? (
              <Link
                to="/cart"
                className={`${classes.action} ${cartClass}`}
                aria-label={`Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}
              >
                <BagIcon size={17} />
                {cartCount > 0 ? <span className={classes.count} data-sf-part="badge">{cartCount}</span> : null}
              </Link>
            ) : null}
          </div>
        </div>
      </header>
    </>
  );
}

export function MenuMain() {
  const outletContext = useShellState();
  return (
    <main className={classes.main} data-sf-part="main">
      <Suspense fallback={<PageSkeleton inline />}>
        <Outlet context={outletContext} />
      </Suspense>
    </main>
  );
}

/**
 * The contact strip at the foot. A running tab claims the foot as soon as there is
 * something on the order — the wholesale sheet's own sticky tab, or the cart bar on a
 * phone — and both bands want `bottom: 0`. The tab wins, the way it replaces the
 * contact strip in the chat menu this layout is ported from.
 */
export function MenuContactStrip({ catalogOnly = true }: { catalogOnly?: boolean }) {
  const { features } = useSettings();
  const cartCount = useCartStore(selectCount);
  const { pathname } = useLocation();
  const barShowing = useMobileCartBar();
  const show = (!catalogOnly || onCatalogPath(pathname)) && !barShowing && !(features.wholesale && cartCount > 0);
  return show ? <ContactLinks variant="strip" /> : null;
}

export function MenuFrame({ children, cartBar = true }: { children: ReactNode; cartBar?: boolean }) {
  const { features } = useSettings();
  const barShowing = useMobileCartBar();
  return (
    <div className={barShowing ? `${classes.shell} ${classes.withBar}` : classes.shell}>
      {children}

      {features.ordering ? (
        <>
          <CartDrawer />
          {cartBar ? <MobileCartBar /> : null}
        </>
      ) : null}

      {features.accounts ? <LoginModal /> : null}

      <Slot name="Overlay" />
    </div>
  );
}

/** The dense shell — v0.6.0's composition, kept as the parity oracle. Production renders PuckShell. */
export function MenuShell() {
  const state = useShellStateValue();
  return (
    <ShellStateContext.Provider value={state}>
      <MenuFrame>
        <MenuHeader />
        <NoticeBanners />
        <CutoffBar />
        <MenuMain />
        <ShellFooter />
        <MenuContactStrip />
      </MenuFrame>
    </ShellStateContext.Provider>
  );
}
```

- [ ] **Step 8: Rewrite `WebAppShell.tsx`**

```tsx
// web/src/layouts/WebAppShell.tsx
import { Suspense, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import { useCartStore, selectCount } from '@/stores/cart.ts';
import { useUiStore } from '@/stores/ui.ts';
import { Brand } from '@/components/Brand.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { BagIcon, ChevronIcon, FilterIcon, UserIcon } from '@/components/icons.tsx';
import { NoticeBanners } from '@/features/notices/NoticeBanners.tsx';
import { CutoffBar } from '@/features/notices/CutoffBar.tsx';
import { LoginModal } from '@/features/auth/LoginModal.tsx';
import { PrimaryActionBar, usePrimaryBarShowing } from '@/features/webapp/PrimaryActionBar.tsx';
import { isFirstHistoryEntry, useTelegramChrome } from '@/features/webapp/useTelegramChrome.ts';
import { SearchField } from '@/layouts/SearchField.tsx';
import type { ShellHeaderProps } from '@/layouts/StorefrontShell.tsx';
import { ShellStateContext, useShellState, useShellStateValue } from '@/layouts/shell-context.ts';
import { isTelegramWebApp } from '@/lib/telegram-webapp.ts';
import { Slot } from '@/templates/runtime.tsx';
import { headerIconClass, useCoreOptions } from '@/templates/hooks.ts';
import classes from '@/layouts/WebAppShell.module.css';

/** Telegram owns the top chrome in this layout, so there is never a TopBar slot here. */
export function WebAppHeader({ search: withSearch = true, sticky = true, nav }: Omit<ShellHeaderProps, 'topBar'>) {
  const { brand, features } = useSettings();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const cartCount = useCartStore(selectCount);
  const openPanel = useUiStore((s) => s.open);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { search, setSearch } = useShellState();
  const native = isTelegramWebApp();

  const onCatalog = pathname === '/' || pathname.startsWith('/c/');
  const { showCategoryPicker, headerAccountIcon, headerCartIcon } = useCoreOptions();
  const canFilter = onCatalog && !features.wholesale && showCategoryPicker;
  const accountClass = headerIconClass(headerAccountIcon);
  const cartClass = headerIconClass(headerCartIcon);
  const filtered = pathname.startsWith('/c/');
  const showBack = !native && !onCatalog;

  return (
    <header className={sticky ? classes.bar : `${classes.bar} ${classes.unstuck}`} data-sf-part="header">
      <div className={classes.safeTop} />
      <NoticeBanners pinned />
      <div className={classes.barInner}>
        {showBack ? (
          <button
            type="button"
            className={`${classes.action} ${classes.back}`}
            // A deep link has nothing behind it in this tab: go home, not off the shop.
            onClick={() => (isFirstHistoryEntry() ? navigate('/', { replace: true }) : navigate(-1))}
            aria-label="Back"
          >
            <ChevronIcon size={17} />
          </button>
        ) : null}

        <Link to="/" className={classes.home} aria-label={`${brand.name} — home`}>
          <Brand size="sm" />
        </Link>

        {nav}

        {withSearch ? <SearchField className={classes.search} value={search} onChange={setSearch} placeholder="Search" /> : null}

        <div className={classes.actions}>
          {canFilter ? (
            <button
              type="button"
              className={classes.action}
              onClick={() => openPanel('filterOpen')}
              aria-label={filtered ? 'Categories — one category selected' : 'Categories'}
            >
              <FilterIcon size={17} />
              {filtered ? <span className={classes.mark} aria-hidden /> : null}
            </button>
          ) : null}

          {features.accounts && accountClass !== null ? (
            <Link
              to={loggedIn || native ? '/account' : '/login'}
              className={`${classes.action} ${accountClass}`}
              aria-label={loggedIn ? 'Your account' : 'Sign in'}
            >
              <UserIcon size={17} />
            </Link>
          ) : null}

          {features.ordering && cartClass !== null ? (
            <Link
              to="/cart"
              className={`${classes.action} ${cartClass}`}
              aria-label={`Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}
            >
              <BagIcon size={17} />
              {cartCount > 0 ? <span className={classes.count} data-sf-part="badge">{cartCount}</span> : null}
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export function WebAppMain() {
  const outletContext = useShellState();
  return (
    <main className={classes.main} data-sf-part="main">
      <Suspense fallback={<PageSkeleton inline />}>
        <Outlet context={outletContext} />
      </Suspense>
    </main>
  );
}

/**
 * The web app's root: Telegram chrome wiring, the primary action at the foot (it is
 * this layout's cart bar, so `cartBar` is accepted and ignored), the login modal
 * outside Telegram, and the Overlay slot.
 */
export function WebAppFrame({ children }: { children: ReactNode; cartBar?: boolean }) {
  const { features } = useSettings();
  const native = isTelegramWebApp();
  const barShowing = usePrimaryBarShowing();

  useTelegramChrome();

  const shellClass = [classes.shell, barShowing ? classes.withBar : '', native ? classes.native : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellClass} data-sf-layout="webapp">
      {children}

      <PrimaryActionBar />

      {features.accounts && !native ? <LoginModal /> : null}

      <Slot name="Overlay" />
    </div>
  );
}

/**
 * The `webapp` layout: always inside Telegram, and wherever a store picks it.
 * v0.6.0's composition, kept as the parity oracle. Production renders PuckShell.
 */
export function WebAppShell() {
  const state = useShellStateValue();
  return (
    <ShellStateContext.Provider value={state}>
      <WebAppFrame>
        <WebAppHeader />
        <NoticeBanners />
        <CutoffBar />
        <WebAppMain />
      </WebAppFrame>
    </ShellStateContext.Provider>
  );
}
```

- [ ] **Step 9: Add the `.unstuck` classes**

In `web/src/layouts/StorefrontShell.module.css`, directly after the `.header { … }` rule:

```css
/* Header block with `sticky` off: scrolls away with the page. */
.unstuck {
  position: static;
}
```

In `web/src/layouts/MenuShell.module.css`, directly after the `.bar { … }` rule: the same `.unstuck` rule.

In `web/src/layouts/WebAppShell.module.css`, after the `.main` compose line:

```css
.unstuck { composes: unstuck from './MenuShell.module.css'; }
```

- [ ] **Step 10: Run the new and the existing tests**

Run: `npm --prefix web test -- test/shell-parts.test.tsx test/shell-header-options.test.tsx test/templates-parts.test.ts test/chassis.test.ts`
Expected: PASS (the three existing files untouched).

- [ ] **Step 11: Prove the DOM did not move**

Run: `npm --prefix web run typecheck && npx playwright test -c e2e/playwright.config.ts e2e/dom-parity.spec.ts e2e/templates-baseline.spec.ts`
Expected: all PASS against the Task 1 baseline and the committed pixel baseline. Any diff here is a bug in this refactor — fix the part, never the snapshot.

- [ ] **Step 12: Commit**

```bash
git add web/src/layouts web/test/shell-parts.test.tsx
git commit -m "refactor(layouts): split the three shells into frame/header/main parts, DOM unchanged"
```

---

### Task 5: Block registry, required-block rules and the document guard

**Wave B.** Needs Task 2. Parallel with Tasks 4 and 6.

**Files:**
- Create: `web/src/builder/registry.ts`, `web/src/builder/rules.ts`, `web/src/builder/guard.ts`
- Create: `web/src/builder/blocks/_shared/.gitkeep` (empty; keeps the folder so the glob in `registry.ts` has a home)
- Test: `web/test/builder-registry.test.ts`, `web/test/builder-rules.test.ts`, `web/test/builder-guard.test.ts`

**Interfaces:**
- Consumes: `BlockDef`, `parseBlockProps`, `slot` from `define.ts`; A4 types + `isRecord`, `isComponentLike`, `MAX_DEPTH`, `MAX_COMPONENTS`, `EMPTY_ROOT`, `BLOCK_TYPE_RE` from `types.ts`.
- Produces:
  - `registry.ts`: `BLOCKS: Record<string, BlockDef<any>>` built from `import.meta.glob('./blocks/*.tsx', { eager: true })` — **every later block task just adds `web/src/builder/blocks/<Name>.tsx` exporting `block`; nobody edits the registry**. Also `collectBlocks(modules)` (pure, for tests).
  - `rules.ts`: `PLACEMENT: Record<string, readonly DocKey[]>` (where placement-restricted blocks may sit — every `routeBound` block plus `AccountNav`, which is restricted to `account.*` but not required, so `routeBound: false`), `SHELL_ONLY: readonly string[]`, `countBlocks(doc): Map<string, number>`, `allowedOn(type, docKey): boolean`, `checkRules(doc, docKey, layout): Issue[]` (A7). Plan 3's editor uses `allowedOn` to refuse drops and `BlockDef.routeBound` for lock icons.
  - `guard.ts`: `validateDoc(doc: unknown, docKey, layout): { doc: PuckDoc | null; issues: Issue[] }` (A7). `doc: null` ⇒ render the default. Issues whose `rule` starts with `drop:` are informational (a block was removed, the doc still renders).

- [ ] **Step 1: Write the failing tests**

```ts
// web/test/builder-registry.test.ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { collectBlocks } from '@/builder/registry.ts';
import { defineBlock } from '@/builder/define.ts';

const make = (name: string) => defineBlock<{ id: string }>({
  name, label: name, category: 'content', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({}), defaultProps: {}, render: () => null,
});

describe('collectBlocks', () => {
  it('keys blocks by name and requires the file name to match', () => {
    expect(Object.keys(collectBlocks({ './blocks/Heading.tsx': { block: make('Heading') } }))).toEqual(['Heading']);
    expect(() => collectBlocks({ './blocks/Heading.tsx': { block: make('Title') } })).toThrow(/Heading/);
  });
  it('rejects names outside the block-type pattern', () => {
    expect(() => collectBlocks({ './blocks/heading.tsx': { block: make('heading') } })).toThrow();
  });
});
```

```ts
// web/test/builder-rules.test.ts
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ComponentData, PuckDoc } from '@/builder/types.ts';

vi.mock('@/builder/registry.ts', async () => {
  const { defineBlock, slot } = await import('@/builder/define.ts');
  const b = (name: string, category: 'shell' | 'catalogue' | 'commerce' | 'content', routeBound = false, slots: string[] = [], layouts: 'all' | ('storefront' | 'menu' | 'webapp')[] = 'all') =>
    defineBlock<Record<string, unknown> & { id: string }>({
      name, label: name, category, layouts, routeBound, slots,
      schema: z.object(Object.fromEntries(slots.map((s) => [s, slot()]))) as never,
      defaultProps: Object.fromEntries(slots.map((s) => [s, []])), render: () => null,
    });
  return {
    BLOCKS: {
      PageOutlet: b('PageOutlet', 'shell', true), Header: b('Header', 'shell'), NoticeBanners: b('NoticeBanners', 'shell'),
      ProductGrid: b('ProductGrid', 'catalogue'), ProductList: b('ProductList', 'catalogue'),
      CheckoutFlow: b('CheckoutFlow', 'commerce', true), CartContents: b('CartContents', 'commerce', true, ['summary']),
      CartSummary: b('CartSummary', 'commerce', true), Heading: b('Heading', 'content'),
      Section: b('Section', 'content', false, ['content']), MenuOnly: b('MenuOnly', 'content', false, [], ['menu']),
    },
  };
});

import { allowedOn, checkRules, countBlocks } from '@/builder/rules.ts';

const c = (type: string, props: Record<string, unknown> = {}, id = `${type}-${Math.random()}`): ComponentData => ({ type, props: { id, ...props } });
const d = (content: ComponentData[]): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content });

describe('countBlocks', () => {
  it('counts through slots', () => {
    const counts = countBlocks(d([c('Section', { content: [c('Heading'), c('Section', { content: [c('Heading')] })] })]));
    expect(counts.get('Heading')).toBe(2);
    expect(counts.get('Section')).toBe(2);
  });
});

describe('checkRules', () => {
  it('shell: exactly one PageOutlet, no catalogue blocks', () => {
    expect(checkRules(d([c('Header'), c('PageOutlet')]), 'shell', 'storefront')).toEqual([]);
    expect(checkRules(d([c('Header')]), 'shell', 'storefront').map((i) => i.rule)).toEqual(['exactly-one:PageOutlet']);
    expect(checkRules(d([c('PageOutlet'), c('PageOutlet')]), 'shell', 'storefront').map((i) => i.rule)).toEqual(['exactly-one:PageOutlet']);
    expect(checkRules(d([c('PageOutlet'), c('ProductGrid')]), 'shell', 'storefront').map((i) => i.rule)).toEqual(['placement:ProductGrid']);
  });
  it('catalog: at least one list block', () => {
    expect(checkRules(d([c('Heading')]), 'catalog', 'storefront').map((i) => i.rule)).toEqual(['at-least-one:catalog']);
    expect(checkRules(d([c('Heading'), c('ProductList')]), 'catalog', 'menu')).toEqual([]);
  });
  it('cart: exactly one of each, found inside slots', () => {
    expect(checkRules(d([c('CartContents', { summary: [c('CartSummary')] })]), 'cart', 'storefront')).toEqual([]);
    expect(checkRules(d([c('CartContents')]), 'cart', 'storefront').map((i) => i.rule)).toEqual(['exactly-one:CartSummary']);
  });
  it('route-bound blocks stay on their own route; no page doc may hold PageOutlet or shell-only blocks', () => {
    expect(checkRules(d([c('CheckoutFlow'), c('ProductGrid')]), 'catalog', 'storefront').map((i) => i.rule)).toEqual(['placement:CheckoutFlow']);
    expect(checkRules(d([c('PageOutlet')]), 'page:about', 'storefront').map((i) => i.rule)).toEqual(['placement:PageOutlet']);
    expect(checkRules(d([c('Header')]), 'page:about', 'storefront').map((i) => i.rule)).toEqual(['placement:Header']);
    expect(checkRules(d([c('Heading'), c('NoticeBanners')]), 'page:about', 'storefront')).toEqual([]);
  });
  it('flags a block outside its layouts', () => {
    expect(checkRules(d([c('MenuOnly')]), 'page:about', 'storefront').map((i) => i.rule)).toEqual(['layout:MenuOnly']);
  });
  it('allowedOn answers the editor lock question', () => {
    expect(allowedOn('CheckoutFlow', 'checkout')).toBe(true);
    expect(allowedOn('CheckoutFlow', 'cart')).toBe(false);
    expect(allowedOn('Heading', 'shell')).toBe(true);
    expect(allowedOn('ProductGrid', 'shell')).toBe(false);
  });
});
```

```ts
// web/test/builder-guard.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@/builder/registry.ts', async () => {
  const { defineBlock, slot } = await import('@/builder/define.ts');
  return {
    BLOCKS: {
      Heading: defineBlock<{ id: string; text: string; level: 'h2' | 'h3' }>({
        name: 'Heading', label: 'Heading', category: 'content', layouts: 'all', routeBound: false, slots: [],
        schema: z.object({ text: z.string().max(20), level: z.enum(['h2', 'h3']) }),
        defaultProps: { text: 'Heading', level: 'h2' }, render: () => null,
      }),
      Section: defineBlock({
        name: 'Section', label: 'Section', category: 'content', layouts: 'all', routeBound: false, slots: ['content'],
        schema: z.object({ content: slot() }), defaultProps: { content: [] }, render: () => null,
      }),
      MenuOnly: defineBlock<{ id: string }>({
        name: 'MenuOnly', label: 'Menu only', category: 'content', layouts: ['menu'], routeBound: false, slots: [],
        schema: z.object({}), defaultProps: {}, render: () => null,
      }),
      CheckoutFlow: defineBlock<{ id: string }>({
        name: 'CheckoutFlow', label: 'Checkout flow', category: 'commerce', layouts: 'all', routeBound: true, slots: [],
        schema: z.object({}), defaultProps: {}, render: () => null,
      }),
    },
  };
});

import { validateDoc } from '@/builder/guard.ts';

const root = { props: { title: 'About', description: '', chrome: 'shell' } };
afterEach(() => vi.restoreAllMocks());

describe('validateDoc', () => {
  it('passes a valid doc through with parsed props', () => {
    const r = validateDoc({ root, content: [{ type: 'Heading', props: { id: 'h', text: 'Hi', level: 'h3' } }] }, 'page:about', 'storefront');
    expect(r.issues).toEqual([]);
    expect(r.doc!.content[0]).toEqual({ type: 'Heading', props: { id: 'h', text: 'Hi', level: 'h3' } });
    expect(r.doc!.root.props.title).toBe('About');
  });
  it('rejects a non-document', () => {
    expect(validateDoc('nope', 'page:about', 'storefront').doc).toBeNull();
    expect(validateDoc({ root, content: 'x' }, 'page:about', 'storefront').doc).toBeNull();
  });
  it('drops unknown block types with one warning per type', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = validateDoc({ root, content: [{ type: 'Carousel', props: { id: 'a' } }, { type: 'Carousel', props: { id: 'b' } }, { type: 'Heading', props: { id: 'h' } }] }, 'page:about', 'storefront');
    expect(r.doc!.content.map((x) => x.type)).toEqual(['Heading']);
    expect(r.issues.map((i) => i.rule)).toEqual(['drop:unknown-block', 'drop:unknown-block']);
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it('drops an unknown block nested in a slot and keeps its siblings', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = validateDoc({ root, content: [{ type: 'Section', props: { id: 's', content: [{ type: 'Gizmo', props: { id: 'g' } }, { type: 'Heading', props: { id: 'h', text: 'Kept' } }] } }] }, 'page:about', 'storefront');
    const section = r.doc!.content[0]!;
    expect((section.props.content as { type: string }[]).map((x) => x.type)).toEqual(['Heading']);
  });
  it('falls back per field on a bad prop', () => {
    const r = validateDoc({ root, content: [{ type: 'Heading', props: { id: 'h', text: 'x'.repeat(21), level: 'h3' } }] }, 'page:about', 'storefront');
    expect(r.doc!.content[0]!.props).toEqual({ id: 'h', text: 'Heading', level: 'h3' });
  });
  it('drops a block outside its layouts', () => {
    const r = validateDoc({ root, content: [{ type: 'MenuOnly', props: { id: 'm' } }] }, 'page:about', 'storefront');
    expect(r.doc!.content).toEqual([]);
    expect(r.issues[0]!.rule).toBe('drop:layout');
  });
  it('re-keys duplicate ids', () => {
    const r = validateDoc({ root, content: [{ type: 'Heading', props: { id: 'dup' } }, { type: 'Heading', props: { id: 'dup' } }] }, 'page:about', 'storefront');
    const ids = r.doc!.content.map((x) => x.props.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe('dup');
  });
  it('replaces the whole doc when a rule fails, naming the rule once', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = validateDoc({ root, content: [{ type: 'Heading', props: { id: 'h' } }] }, 'checkout', 'storefront');
    expect(r.doc).toBeNull();
    expect(r.issues.map((i) => i.rule)).toEqual(['exactly-one:CheckoutFlow']);
    expect(error).toHaveBeenCalledTimes(1);
  });
  it('bad root props fall back per field; a shell is always chrome "shell"', () => {
    const r = validateDoc({ root: { props: { title: 'x'.repeat(121), chrome: 'none' } }, content: [] }, 'page:about', 'storefront');
    expect(r.doc!.root.props).toEqual({ title: '', description: '', chrome: 'none' });
  });
  it('drops blocks nested deeper than 12', () => {
    let node: Record<string, unknown> = { type: 'Heading', props: { id: 'leaf' } };
    for (let i = 0; i < 13; i += 1) node = { type: 'Section', props: { id: `s${i}`, content: [node] } };
    const r = validateDoc({ root, content: [node] }, 'page:about', 'storefront');
    expect(JSON.stringify(r.doc)).not.toContain('"leaf"');
    expect(r.issues.some((i) => i.rule === 'drop:depth')).toBe(true);
  });
  it('memoises per doc object', () => {
    const doc = { root, content: [] };
    expect(validateDoc(doc, 'page:about', 'storefront')).toBe(validateDoc(doc, 'page:about', 'storefront'));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix web test -- test/builder-registry.test.ts test/builder-rules.test.ts test/builder-guard.test.ts`
Expected: FAIL — modules `@/builder/registry.ts`, `rules.ts`, `guard.ts` not found.

- [ ] **Step 3: Implement `registry.ts`**

```ts
// web/src/builder/registry.ts
import type { BlockDef } from '@/builder/define.ts';
import { BLOCK_TYPE_RE } from '@/builder/types.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBlock = BlockDef<any>;

/** One block per file: `blocks/<Name>.tsx` exporting `block` with `name === '<Name>'`. */
export function collectBlocks(modules: Record<string, { block?: AnyBlock }>): Record<string, AnyBlock> {
  const out: Record<string, AnyBlock> = {};
  for (const [path, mod] of Object.entries(modules)) {
    const file = path.slice(path.lastIndexOf('/') + 1).replace(/\.tsx$/, '');
    const def = mod.block;
    if (!def || def.name !== file) throw new Error(`[builder] ${path} must export \`block\` named "${file}"`);
    if (!BLOCK_TYPE_RE.test(def.name)) throw new Error(`[builder] block name "${def.name}" must match ${BLOCK_TYPE_RE}`);
    out[def.name] = def;
  }
  return out;
}

/** Eager: block modules are thin wrappers — every heavy component inside them is lazy(). */
export const BLOCKS: Record<string, AnyBlock> = collectBlocks(
  import.meta.glob<{ block?: AnyBlock }>('./blocks/*.tsx', { eager: true }),
);
```

- [ ] **Step 4: Implement `rules.ts`**

```ts
// web/src/builder/rules.ts
import { BLOCKS } from '@/builder/registry.ts';
import type { ComponentData, DocKey, FixedRouteKey, Issue, LayoutKind, PuckDoc } from '@/builder/types.ts';

const ACCOUNT: readonly DocKey[] = ['account.orders', 'account.order', 'account.loyalty', 'account.referrals', 'account.profile'];

/** Placement-restricted blocks and the doc(s) they may appear on: the §5.3 route blocks (routeBound) plus AccountNav. */
export const PLACEMENT: Record<string, readonly DocKey[]> = {
  PageOutlet: ['shell'],
  ProductDetail: ['product'],
  CartContents: ['cart'],
  CartSummary: ['cart'],
  CheckoutFlow: ['checkout'],
  LoginOptions: ['login'],
  AccountNav: ACCOUNT,
  OrdersList: ['account.orders'],
  OrderDetail: ['account.order'],
  Loyalty: ['account.loyalty'],
  Referrals: ['account.referrals'],
  Profile: ['account.profile'],
  OrderStatus: ['order-status'],
  PaymentSuccess: ['payment-success'],
  PaymentCancel: ['payment-cancel'],
  OrderPlaced: ['order-placed'],
  VerifyForm: ['verify'],
  TrackingLookup: ['tracking'],
};

/** Chrome that only makes sense in the shell document. */
export const SHELL_ONLY: readonly string[] = ['PageOutlet', 'Header', 'Footer', 'TopBar', 'MobileCartBar'];

const EXACTLY_ONE: Partial<Record<DocKey, readonly string[]>> = {
  shell: ['PageOutlet'],
  product: ['ProductDetail'],
  cart: ['CartContents', 'CartSummary'],
  checkout: ['CheckoutFlow'],
  login: ['LoginOptions'],
  'account.orders': ['OrdersList'],
  'account.order': ['OrderDetail'],
  'account.loyalty': ['Loyalty'],
  'account.referrals': ['Referrals'],
  'account.profile': ['Profile'],
  'order-status': ['OrderStatus'],
  'payment-success': ['PaymentSuccess'],
  'payment-cancel': ['PaymentCancel'],
  'order-placed': ['OrderPlaced'],
  verify: ['VerifyForm'],
  tracking: ['TrackingLookup'],
};

const AT_LEAST_ONE: Partial<Record<FixedRouteKey, readonly string[]>> = {
  catalog: ['ProductGrid', 'ProductList', 'WholesaleTable'],
};

/** Every component in the doc, depth-first through each block's declared slots. */
function walk(items: readonly ComponentData[], visit: (c: ComponentData) => void): void {
  for (const item of items) {
    visit(item);
    const def = BLOCKS[item.type];
    if (!def) continue;
    for (const s of def.slots) {
      const children = item.props[s];
      if (Array.isArray(children)) walk(children as ComponentData[], visit);
    }
  }
}

export function countBlocks(doc: PuckDoc): Map<string, number> {
  const counts = new Map<string, number>();
  walk(doc.content, (c) => counts.set(c.type, (counts.get(c.type) ?? 0) + 1));
  return counts;
}

/** Whether a block of `type` may sit in `docKey` (the editor shows a lock where it may not be removed/added). */
export function allowedOn(type: string, docKey: DocKey): boolean {
  const bound = PLACEMENT[type];
  if (bound) return bound.includes(docKey);
  if (SHELL_ONLY.includes(type)) return docKey === 'shell';
  if (docKey === 'shell') {
    const category = BLOCKS[type]?.category;
    return category === 'shell' || category === 'content';
  }
  return true;
}

const label = (type: string) => BLOCKS[type]?.label ?? type;

export function checkRules(doc: PuckDoc, docKey: DocKey, layout: LayoutKind): Issue[] {
  const issues: Issue[] = [];
  const flagged = new Set<string>();
  walk(doc.content, (c) => {
    const def = BLOCKS[c.type];
    if (def && def.layouts !== 'all' && !def.layouts.includes(layout) && !flagged.has(`layout:${c.type}`)) {
      flagged.add(`layout:${c.type}`);
      issues.push({ docKey, rule: `layout:${c.type}`, message: `${label(c.type)} is not available in the ${layout} layout.`, blockId: c.props.id });
    }
    if (!allowedOn(c.type, docKey) && !flagged.has(`placement:${c.type}`)) {
      flagged.add(`placement:${c.type}`);
      issues.push({ docKey, rule: `placement:${c.type}`, message: `${label(c.type)} can't be placed on this page.`, blockId: c.props.id });
    }
  });
  const counts = countBlocks(doc);
  for (const type of EXACTLY_ONE[docKey] ?? []) {
    if ((counts.get(type) ?? 0) !== 1) {
      issues.push({ docKey, rule: `exactly-one:${type}`, message: `This page needs exactly one ${label(type)} block.` });
    }
  }
  const anyOf = AT_LEAST_ONE[docKey as FixedRouteKey];
  if (anyOf && !anyOf.some((t) => (counts.get(t) ?? 0) > 0)) {
    issues.push({ docKey, rule: `at-least-one:${docKey}`, message: `This page needs a product grid, product list or trade list.` });
  }
  return issues;
}
```

- [ ] **Step 5: Implement `guard.ts`**

```ts
// web/src/builder/guard.ts
import { z } from 'zod';
import { parseBlockProps } from '@/builder/define.ts';
import { BLOCKS } from '@/builder/registry.ts';
import { checkRules } from '@/builder/rules.ts';
import {
  EMPTY_ROOT, isComponentLike, isRecord, MAX_COMPONENTS, MAX_DEPTH,
  type ComponentData, type DocKey, type Issue, type LayoutKind, type PageRootProps, type PuckDoc,
} from '@/builder/types.ts';

export interface GuardResult { doc: PuckDoc | null; issues: Issue[] }

const ROOT_SHAPE = {
  title: z.string().max(120),
  description: z.string().max(300),
  chrome: z.enum(['shell', 'none']),
} as const;

const warnedTypes = new Set<string>();
const memo = new WeakMap<object, Map<string, GuardResult>>();

interface Walk { docKey: DocKey; layout: LayoutKind; depth: number; drops: Issue[]; ids: Set<string>; budget: { left: number } }

function cleanItems(items: unknown, w: Walk): ComponentData[] {
  if (!Array.isArray(items)) return [];
  const out: ComponentData[] = [];
  for (const raw of items) {
    if (!isComponentLike(raw)) {
      w.drops.push({ docKey: w.docKey, rule: 'drop:shape', message: 'A malformed block was removed.' });
      continue;
    }
    const blockId = raw.props.id;
    const def = BLOCKS[raw.type];
    if (!def) {
      if (!warnedTypes.has(raw.type)) {
        warnedTypes.add(raw.type);
        console.warn(`[builder] unknown block "${raw.type}" dropped — saved by a newer release, or removed`);
      }
      w.drops.push({ docKey: w.docKey, rule: 'drop:unknown-block', message: `Unknown block "${raw.type}" was removed.`, blockId });
      continue;
    }
    if (def.layouts !== 'all' && !def.layouts.includes(w.layout)) {
      w.drops.push({ docKey: w.docKey, rule: 'drop:layout', message: `${def.label} is not available in this layout.`, blockId });
      continue;
    }
    if (w.depth > MAX_DEPTH) {
      w.drops.push({ docKey: w.docKey, rule: 'drop:depth', message: `${def.label} is nested too deeply.`, blockId });
      continue;
    }
    if (w.budget.left <= 0) {
      w.drops.push({ docKey: w.docKey, rule: 'drop:too-many', message: 'The page has too many blocks.', blockId });
      continue;
    }
    w.budget.left -= 1;
    const props: Record<string, unknown> = { ...raw.props };
    for (const s of def.slots) props[s] = cleanItems(raw.props[s], { ...w, depth: w.depth + 1 });
    const parsed = parseBlockProps(def, props);
    let id = blockId;
    for (let n = 2; w.ids.has(id); n += 1) id = `${blockId}~${n}`;
    w.ids.add(id);
    out.push({ type: raw.type, props: { ...parsed, id } });
  }
  return out;
}

function parseRoot(raw: unknown, docKey: DocKey): PageRootProps {
  const src = isRecord(raw) && isRecord(raw.props) ? raw.props : {};
  const out: PageRootProps = { ...EMPTY_ROOT };
  const title = ROOT_SHAPE.title.safeParse(src.title);
  if (title.success) out.title = title.data;
  const description = ROOT_SHAPE.description.safeParse(src.description);
  if (description.success) out.description = description.data;
  const chrome = ROOT_SHAPE.chrome.safeParse(src.chrome);
  if (chrome.success) out.chrome = chrome.data;
  if (docKey === 'shell') out.chrome = 'shell';
  return out;
}

function run(doc: Record<string, unknown>, docKey: DocKey, layout: LayoutKind): GuardResult {
  const drops: Issue[] = [];
  const content = cleanItems(doc.content, { docKey, layout, depth: 1, drops, ids: new Set(), budget: { left: MAX_COMPONENTS } });
  const cleaned: PuckDoc = { root: { props: parseRoot(doc.root, docKey) }, content, zones: {} };
  const broken = checkRules(cleaned, docKey, layout);
  if (broken.length > 0) {
    console.error(`[builder] "${docKey}" (${layout}) breaks ${broken.map((i) => i.rule).join(', ')} — rendering the default page`);
    return { doc: null, issues: [...drops, ...broken] };
  }
  return { doc: cleaned, issues: drops };
}

/** Spec §5.3. Memoised per doc object, so a published set is validated once per page load. */
export function validateDoc(doc: unknown, docKey: DocKey, layout: LayoutKind): GuardResult {
  if (!isRecord(doc) || !Array.isArray(doc.content)) {
    return { doc: null, issues: [{ docKey, rule: 'shape', message: 'This is not a page document.' }] };
  }
  const key = `${docKey}|${layout}`;
  let perDoc = memo.get(doc);
  const hit = perDoc?.get(key);
  if (hit) return hit;
  const result = run(doc, docKey, layout);
  if (!perDoc) { perDoc = new Map(); memo.set(doc, perDoc); }
  perDoc.set(key, result);
  return result;
}
```

- [ ] **Step 6: Run to verify pass**

Run: `npm --prefix web test -- test/builder-registry.test.ts test/builder-rules.test.ts test/builder-guard.test.ts && npm --prefix web run typecheck`
Expected: PASS; exit 0. (The "one warning per type" test relies on `warnedTypes` being module-level — if another test in the same file has already warned for `Carousel`, rename the type in the test rather than resetting module state.)

- [ ] **Step 7: Commit**

```bash
git add web/src/builder/registry.ts web/src/builder/rules.ts web/src/builder/guard.ts web/src/builder/blocks/_shared/.gitkeep web/test/builder-registry.test.ts web/test/builder-rules.test.ts web/test/builder-guard.test.ts
git commit -m "feat(builder): glob block registry, required-block rules and the document guard"
```

---

### Task 6: e2e mocks — a `pages` fixture (default `null`)

**Wave B.** Needs Task 2 (for the `PageSet` type). Parallel with Tasks 4 and 5.

**Files:**
- Modify: `e2e/mocks.ts`

**Interfaces:**
- Consumes: `PageSet` from `web/src/builder/types.ts`.
- Produces: `InstallMocksOptions.pages?: Partial<Record<Layout, PageSet | null>>`; `MockState.pages`; `GET storefront/pages/<layout>` answers `{ version: 1, data }` or `null`, behind the kill switch like every `storefront/*` route. Task 23 uses it.

- [ ] **Step 1: Add the option, the state and the route**

In the imports:

```ts
import type { PageSet } from '../web/src/builder/types.ts';
```

In `InstallMocksOptions`:

```ts
  /** Published page set per layout (`GET storefront/pages/:layout`). Omitted = `null` = no published set. */
  pages?: Partial<Record<Layout, PageSet | null>>;
```

In `MockState`:

```ts
  /** What `GET storefront/pages/:layout` serves. */
  pages: Partial<Record<Layout, PageSet | null>>;
```

In the `state` literal inside `installMocks`:

```ts
    pages: options.pages ?? {},
```

In the `/api/**` handler, directly after the `storefront/settings` branch:

```ts
    const pages = /^storefront\/pages\/(storefront|menu|webapp)$/.exec(path);
    if (pages && method === 'GET') {
      const set = state.pages[pages[1] as Layout] ?? null;
      await envelope(route, set ? { version: 1, data: set } : null);
      return;
    }
```

- [ ] **Step 2: Verify nothing regressed**

Run: `npx playwright test -c e2e/playwright.config.ts e2e/mocks-policy.spec.ts e2e/dom-parity.spec.ts -g "catalog · storefront"`
Expected: PASS (Playwright transpiles `mocks.ts`, so a syntax or import error fails here). The app does not call the route yet (Task 14 does), so no other spec is affected.

- [ ] **Step 3: Commit**

```bash
git add e2e/mocks.ts
git commit -m "test(e2e): serve a pages fixture from the mocks, null by default"
```

---
### Task 7: Renderer, page runtime, page-set loading and block-scoped core options

**Wave C.** Needs Task 5. Runs alone (everything in Wave D builds on it).

**Files:**
- Create: `web/src/builder/render.tsx`, `web/src/builder/runtime.tsx`, `web/src/builder/defaults/index.ts`, `web/src/builder/defaults/helpers.ts`, `web/src/api/pages.ts`, `web/src/templates/core-scope.ts`, `web/src/builder/blocks/_shared/CoreOptionsScope.tsx`, `web/src/builder/blocks/_shared/RichHtml.tsx`, `web/src/builder/blocks/_shared/SmartLink.tsx` (the last two are shared by several Wave-F content tasks, so they land here to keep those tasks disjoint)
- Modify: `web/src/templates/hooks.ts` (`useCoreOptions` reads the scope), `web/src/templates/runtime.tsx` (`Slot` reads the scope for `CatalogHero`/`SectionLabel`)
- Delete: `web/src/builder/blocks/_shared/.gitkeep` (the folder now has a real file)
- Test: `web/test/builder-render.test.tsx`, `web/test/builder-runtime.test.tsx`, `web/test/builder-defaults-table.test.ts`, `web/test/core-scope.test.tsx`, `web/test/builder-shared.test.tsx`

**Interfaces:**
- Consumes: `BLOCKS` (registry), `validateDoc` (guard), `useBuilderMode` (mode), types.
- Produces:
  - `render.tsx`: `RenderDoc({ doc, docKey, layout })` (A7); `BlockBoundary` (renders nothing on throw and logs once per block id; route-bound blocks rethrow to the page boundary); `DocBoundary({ docKey, fallback, children })`.
  - `runtime.tsx`: `pagesKey(layout)`, `PAGES_QUERY` (the query options), `PageSetOverrideProvider({ pageSet, children })`, `usePageSet(layout): { pageSet, isLoading }`, `resolveDoc(pageSet, docKey, layout): { doc; isDefault } | null`, `PuckPage({ routeKey })` (A7). Task 8 adds `PuckShell` and `useCurrentRouteKey` to this file.
  - `defaults/helpers.ts`: `DefaultEntry { docKey; layouts: readonly LayoutKind[] | 'all'; doc: PuckDoc }`, `block(type, props?, id?)` (fills the block's `defaultProps`; id defaults to `` `${type}-default` ``), `doc(content, root?)`.
  - `defaults/index.ts`: `defaultDoc(docKey, layout)` (A7) over `import.meta.glob('./groups/*.ts')` — **each Wave-D task adds its own `defaults/groups/<name>.ts` exporting `DEFAULTS: DefaultEntry[]`; nobody edits `index.ts`**. Also `buildDefaultTable(groups)`.
  - `api/pages.ts`: `toPageSet(body)`, `fetchPageSet(layout): Promise<PageSet | null>` — never rejects; 404/503/network/garbage ⇒ `null`.
  - `templates/core-scope.ts`: `CoreOptionsScopeContext` (`Partial<CoreOptions>`).
  - `blocks/_shared/CoreOptionsScope.tsx`: `CoreOptionsScope({ value, children })` — merges onto any outer scope.
  - `blocks/_shared/RichHtml.tsx`: `RichHtml({ value: unknown; className?; block? })` — a string is sanitised and set as HTML inside `<div data-sf-prose>`; anything else (a React node inside the editor) renders as children.
  - `blocks/_shared/SmartLink.tsx`: `SmartLink({ href, className, children })` — site paths through react-router's `NavLink` (so `aria-current` works), `https:` with `rel="noopener noreferrer"`, `mailto:`/`tel:` plain.

- [ ] **Step 1: Load the design skill**

Implementer: load the `frontend-design:frontend-design` skill before writing UI code (the renderer decides which wrapper elements exist on every page).

- [ ] **Step 2: Write the failing tests**

```tsx
// web/test/builder-render.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { z } from 'zod';
import type { ComponentData, PuckDoc } from '@/builder/types.ts';

vi.mock('@/builder/registry.ts', async () => {
  const { defineBlock, slot } = await import('@/builder/define.ts');
  const { useBuilderMode } = await import('@/builder/mode.ts');
  function Thrower(): never { throw new Error('boom'); }
  function Mode() { return <i>{useBuilderMode().editing ? 'editing' : 'live'}</i>; }
  const base = { category: 'content' as const, layouts: 'all' as const, routeBound: false };
  return {
    BLOCKS: {
      Text: defineBlock<{ id: string; text: string }>({ ...base, name: 'Text', label: 'Text', slots: [], schema: z.object({ text: z.string() }), defaultProps: { text: '' }, render: ({ text }) => <p>{text}</p> }),
      Bare: defineBlock({ ...base, name: 'Bare', label: 'Bare', slots: ['items'], schema: z.object({ items: slot() }), defaultProps: { items: [] }, render: ({ items }) => items() }),
      Box: defineBlock({ ...base, name: 'Box', label: 'Box', slots: ['items'], schema: z.object({ items: slot() }), defaultProps: { items: [] }, render: ({ items }) => items({ className: 'box', as: 'section' }) }),
      Boom: defineBlock<{ id: string }>({ ...base, name: 'Boom', label: 'Boom', slots: [], schema: z.object({}), defaultProps: {}, render: () => <Thrower /> }),
      BoundBoom: defineBlock<{ id: string }>({ ...base, routeBound: true, name: 'BoundBoom', label: 'Bound', slots: [], schema: z.object({}), defaultProps: {}, render: () => <Thrower /> }),
      Mode: defineBlock<{ id: string }>({ ...base, name: 'Mode', label: 'Mode', slots: [], schema: z.object({}), defaultProps: {}, render: () => <Mode /> }),
    },
  };
});

import { DocBoundary, RenderDoc } from '@/builder/render.tsx';
import { BuilderModeProvider } from '@/builder/mode.ts';

const c = (type: string, props: Record<string, unknown> = {}, id = type): ComponentData => ({ type, props: { id, ...props } });
const d = (content: ComponentData[]): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content });

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('RenderDoc', () => {
  it('renders slots with no wrapper element unless the block asks for one', () => {
    const { container } = render(<RenderDoc doc={d([c('Bare', { items: [c('Text', { text: 'a' }, 'a'), c('Text', { text: 'b' }, 'b')] })])} docKey="page:x" layout="storefront" />);
    expect(container.innerHTML).toBe('<p>a</p><p>b</p>');
    cleanup();
    const boxed = render(<RenderDoc doc={d([c('Box', { items: [c('Text', { text: 'a' }, 'a')] })])} docKey="page:x" layout="storefront" />);
    expect(boxed.container.innerHTML).toBe('<section class="box"><p>a</p></section>');
  });
  it('a crashing block renders nothing, logs once, and its siblings survive', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<RenderDoc doc={d([c('Text', { text: 'before' }, 't1'), c('Boom'), c('Text', { text: 'after' }, 't2')])} docKey="page:x" layout="storefront" />);
    expect(screen.getByText('before')).toBeInTheDocument();
    expect(screen.getByText('after')).toBeInTheDocument();
    expect(error.mock.calls.filter((call) => String(call[0]).includes('[builder] block Boom')).length).toBe(1);
  });
  it('a crashing route-bound block takes the page to its fallback', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <DocBoundary docKey="checkout" fallback={<p>default page</p>}>
        <RenderDoc doc={d([c('Text', { text: 'owner copy' }, 't'), c('BoundBoom')])} docKey="checkout" layout="storefront" />
      </DocBoundary>,
    );
    expect(screen.getByText('default page')).toBeInTheDocument();
    expect(screen.queryByText('owner copy')).toBeNull();
  });
  it('passes the builder mode through', () => {
    render(<BuilderModeProvider value={{ editing: true, previewAs: null }}><RenderDoc doc={d([c('Mode')])} docKey="page:x" layout="menu" /></BuilderModeProvider>);
    expect(screen.getByText('editing')).toBeInTheDocument();
  });
});
```

```tsx
// web/test/builder-runtime.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, Link, RouterProvider } from 'react-router';
import { z } from 'zod';
import type { ReactNode } from 'react';
import type { PageSet, PuckDoc } from '@/builder/types.ts';

const fetched = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('@/api/pages.ts', () => ({ fetchPageSet: fetched.fn }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({ brand: { name: 'Northbound Supply', title: 'Northbound Supply' } }) }));
vi.mock('@/app/layout.ts', () => ({ useEffectiveLayout: () => 'storefront' }));
vi.mock('@/builder/registry.ts', async () => {
  const { defineBlock } = await import('@/builder/define.ts');
  return {
    BLOCKS: {
      Text: defineBlock<{ id: string; text: string }>({ name: 'Text', label: 'Text', category: 'content', layouts: 'all', routeBound: false, slots: [], schema: z.object({ text: z.string() }), defaultProps: { text: '' }, render: ({ text }) => <p>{text}</p> }),
      CheckoutFlow: defineBlock<{ id: string }>({ name: 'CheckoutFlow', label: 'Checkout flow', category: 'commerce', layouts: 'all', routeBound: true, slots: [], schema: z.object({}), defaultProps: {}, render: () => <p>checkout flow</p> }),
    },
  };
});
const DEFAULT_CHECKOUT: PuckDoc = { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [{ type: 'CheckoutFlow', props: { id: 'CheckoutFlow-default' } }] };
vi.mock('@/builder/defaults/index.ts', () => ({ defaultDoc: (key: string) => (key === 'checkout' ? DEFAULT_CHECKOUT : null) }));

import { PageSetOverrideProvider, pagesKey, PuckPage, usePageSet } from '@/builder/runtime.tsx';
import type { RouteKey } from '@/builder/types.ts';

const root = (title = '') => ({ props: { title, description: '', chrome: 'shell' as const } });
const set = (pages: PageSet['pages']): PageSet => ({ schemaVersion: 1, shell: { root: root(), content: [] }, pages });

function mount(routeKey: RouteKey, pageSet: PageSet | null | undefined, extra: ReactNode = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([
    { path: '/', element: <p>home</p> },
    { path: '/x', element: <><PuckPage routeKey={routeKey} />{extra}<Link to="/">leave</Link></> },
  ], { initialEntries: ['/x'] });
  const tree = <RouterProvider router={router} />;
  render(
    <QueryClientProvider client={client}>
      {pageSet === undefined ? tree : <PageSetOverrideProvider pageSet={pageSet}>{tree}</PageSetOverrideProvider>}
    </QueryClientProvider>,
  );
  return { client, router };
}

afterEach(() => { cleanup(); fetched.fn.mockReset(); vi.restoreAllMocks(); document.title = ''; });

describe('PuckPage', () => {
  it('renders the default document when there is no published set', () => {
    mount('checkout', null);
    expect(screen.getByText('checkout flow')).toBeInTheDocument();
  });
  it('renders a valid published document', () => {
    mount('checkout', set({ checkout: { root: root(), content: [{ type: 'Text', props: { id: 't', text: 'Owner note' } }, { type: 'CheckoutFlow', props: { id: 'c' } }] } }));
    expect(screen.getByText('Owner note')).toBeInTheDocument();
    expect(screen.getByText('checkout flow')).toBeInTheDocument();
  });
  it('falls back to the default when the published document breaks a rule', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount('checkout', set({ checkout: { root: root(), content: [{ type: 'Text', props: { id: 't', text: 'No flow' } }] } }));
    expect(screen.queryByText('No flow')).toBeNull();
    expect(screen.getByText('checkout flow')).toBeInTheDocument();
  });
  it('redirects home for a custom page that is not in the set', async () => {
    mount('page:missing', set({}));
    expect(await screen.findByText('home')).toBeInTheDocument();
  });
  it('sets the root title and restores the brand title on the way out', async () => {
    const { router } = mount('page:our-story', set({ 'page:our-story': { root: root('Our story'), content: [{ type: 'Text', props: { id: 't', text: 'Since 2019' } }] } }));
    expect(screen.getByText('Since 2019')).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Our story'));
    await act(() => router.navigate('/'));
    expect(document.title).toBe('Northbound Supply');
  });
});

describe('usePageSet', () => {
  function Probe() {
    const { pageSet, isLoading } = usePageSet('storefront');
    return <p>{isLoading ? 'loading' : pageSet ? 'published' : 'none'}</p>;
  }
  it('fetches once per layout and reports the set', async () => {
    fetched.fn.mockResolvedValue(set({}));
    mount('checkout', undefined, <Probe />);
    expect(await screen.findByText('published')).toBeInTheDocument();
    expect(fetched.fn).toHaveBeenCalledWith('storefront');
  });
  it('treats a failed fetch as no published set', async () => {
    fetched.fn.mockResolvedValue(null);
    mount('checkout', undefined, <Probe />);
    expect(await screen.findByText('none')).toBeInTheDocument();
    expect(screen.getByText('checkout flow')).toBeInTheDocument();
  });
  it('never fetches under an override', () => {
    mount('checkout', null, <Probe />);
    expect(screen.getByText('none')).toBeInTheDocument();
    expect(fetched.fn).not.toHaveBeenCalled();
  });
  it('does not refetch on window focus (a publish must not swap a page mid-checkout)', async () => {
    fetched.fn.mockResolvedValue(set({}));
    const { client } = mount('checkout', undefined, <Probe />);
    await screen.findByText('published');
    const query = client.getQueryCache().find({ queryKey: pagesKey('storefront') })!;
    expect(query.observers[0]!.options.refetchOnWindowFocus).toBe(false);
  });
});
```

```ts
// web/test/builder-defaults-table.test.ts
import { describe, expect, it } from 'vitest';
import { buildDefaultTable } from '@/builder/defaults/index.ts';
import type { PuckDoc } from '@/builder/types.ts';
import { toPageSet } from '@/api/pages.ts';

const empty: PuckDoc = { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [] };

describe('buildDefaultTable', () => {
  it('expands "all" to the three layouts', () => {
    const t = buildDefaultTable({ './groups/a.ts': { DEFAULTS: [{ docKey: 'checkout', layouts: 'all', doc: empty }] } });
    expect([...t.keys()].sort()).toEqual(['menu|checkout', 'storefront|checkout', 'webapp|checkout']);
  });
  it('refuses two defaults for the same key', () => {
    expect(() => buildDefaultTable({
      './groups/a.ts': { DEFAULTS: [{ docKey: 'cart', layouts: ['menu'], doc: empty }] },
      './groups/b.ts': { DEFAULTS: [{ docKey: 'cart', layouts: 'all', doc: empty }] },
    })).toThrow(/menu\|cart/);
  });
});

describe('toPageSet', () => {
  it('accepts only a schema-1 set', () => {
    expect(toPageSet(null)).toBeNull();
    expect(toPageSet({ version: 3, data: { schemaVersion: 2, shell: {}, pages: {} } })).toBeNull();
    expect(toPageSet({ version: 3, data: { schemaVersion: 1, shell: empty, pages: {} } })).toEqual({ schemaVersion: 1, shell: empty, pages: {} });
  });
});
```

```tsx
// web/test/core-scope.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { StorefrontSettings } from '@/types/settings.ts';

vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({ brand: { name: 'Northbound Supply' }, features: { layout: 'storefront' }, theme: { scheme: 'dark' } }) as unknown as StorefrontSettings }));

import { useCoreOptions } from '@/templates/hooks.ts';
import { Slot } from '@/templates/runtime.tsx';
import { CoreOptionsScope } from '@/builder/blocks/_shared/CoreOptionsScope.tsx';

function Show() {
  const o = useCoreOptions();
  return <p>{`sku:${o.showSku} title:${o.showPageTitle} cart:${o.headerCartIcon}`}</p>;
}

afterEach(cleanup);

describe('CoreOptionsScope', () => {
  it('leaves the store-wide options alone when empty', () => {
    render(<CoreOptionsScope value={{}}><Show /></CoreOptionsScope>);
    expect(screen.getByText('sku:true title:true cart:all')).toBeInTheDocument();
  });
  it('overrides per block and merges nested scopes', () => {
    render(
      <CoreOptionsScope value={{ showSku: false }}>
        <CoreOptionsScope value={{ headerCartIcon: 'none' }}><Show /></CoreOptionsScope>
      </CoreOptionsScope>,
    );
    expect(screen.getByText('sku:false title:true cart:none')).toBeInTheDocument();
  });
  it('gates the CatalogHero slot', () => {
    const { container } = render(
      <CoreOptionsScope value={{ showCatalogIntro: false }}>
        <Slot name="CatalogHero" surface="grid" tagline="" welcomeMessage="Hello" productCount={1} categoryCount={1} />
      </CoreOptionsScope>,
    );
    expect(container.innerHTML).toBe('');
  });
});
```

```tsx
// web/test/builder-shared.test.tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { RichHtml } from '@/builder/blocks/_shared/RichHtml.tsx';
import { SmartLink } from '@/builder/blocks/_shared/SmartLink.tsx';

afterEach(cleanup);

describe('RichHtml', () => {
  it('sanitises strings and marks the prose container', () => {
    const { container } = render(<RichHtml value={'<p>ok</p><script>x()</script>'} block="RichText" />);
    expect(container.innerHTML).toBe('<div data-sf-prose="" data-sf-block="RichText"><p>ok</p></div>');
  });
  it('renders a React node as-is (inside the editor)', () => {
    render(<RichHtml value={<em>node</em>} />);
    expect(screen.getByText('node').tagName).toBe('EM');
  });
});

describe('SmartLink', () => {
  it('routes site paths, guards external links', () => {
    render(<MemoryRouter initialEntries={['/pages/a']}><SmartLink href="/pages/a">A</SmartLink><SmartLink href="https://shop.example">B</SmartLink><SmartLink href="tel:+440">C</SmartLink></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'A' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'B' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'C' })).not.toHaveAttribute('rel');
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm --prefix web test -- test/builder-render.test.tsx test/builder-runtime.test.tsx test/builder-defaults-table.test.ts test/core-scope.test.tsx test/builder-shared.test.tsx`
Expected: FAIL — `@/builder/render.tsx`, `@/builder/runtime.tsx`, `@/builder/defaults/index.ts`, `@/api/pages.ts`, `CoreOptionsScope` not found.

- [ ] **Step 4: Core-options scope (templates side)**

```ts
// web/src/templates/core-scope.ts
import { createContext } from 'react';
import type { CoreOptions } from '@/templates/hooks.ts';

/**
 * Block-level overrides of the store-wide core options (page builder, spec §5.5): a
 * ProductGrid block with `sku: hide` scopes `{ showSku: false }` over its subtree.
 * Empty = no override, which is every page outside the builder.
 */
export const CoreOptionsScopeContext = createContext<Partial<CoreOptions>>({});
```

In `web/src/templates/hooks.ts`: change the react import to `import { useContext, useMemo } from 'react';`, add `import { CoreOptionsScopeContext } from '@/templates/core-scope.ts';`, and replace `useCoreOptions` with:

```ts
/** The core options every template carries (define.ts CORE_OPTIONS). Only an explicit false (or
 *  a non-default choice) hides — outside a provider, or before settings resolve, everything shows.
 *  A page-builder block may override any of them for its own subtree (core-scope.ts). */
export function useCoreOptions(): CoreOptions {
  const o = useTemplateOptions();
  const scope = useContext(CoreOptionsScopeContext);
  return {
    showPageTitle: o.showPageTitle !== false,
    showCatalogIntro: o.showCatalogIntro !== false,
    showSectionLabels: o.showSectionLabels !== false,
    showSku: o.showSku !== false,
    showCategoryPicker: o.showCategoryPicker !== false,
    headerAccountIcon: iconMode(o.headerAccountIcon),
    headerCartIcon: iconMode(o.headerCartIcon),
    showCutoffBar: o.showCutoffBar !== false,
    cutoffMessage: typeof o.cutoffMessage === 'string' ? o.cutoffMessage.trim() : '',
    showCutoffCountdown: o.showCutoffCountdown !== false,
    ...scope,
  };
}
```

In `web/src/templates/runtime.tsx`: add `import { CoreOptionsScopeContext } from '@/templates/core-scope.ts';` and in `Slot`, replace the two gate lines with:

```tsx
  const scope = useContext(CoreOptionsScopeContext);
  // Core options (define.ts CORE_OPTIONS) gate these two slots for every template, custom or
  // default; a page-builder block may override them for its own subtree.
  const showIntro = scope.showCatalogIntro ?? options.showCatalogIntro !== false;
  const showLabels = scope.showSectionLabels ?? options.showSectionLabels !== false;
  if (name === 'CatalogHero' && !showIntro) return null;
  if (name === 'SectionLabel' && !showLabels) return null;
```

(`useContext` is already imported in `runtime.tsx`; the `scope` read sits after `const options = …` and before the early returns, so hook order is unconditional.)

- [ ] **Step 5: `CoreOptionsScope` component**

```tsx
// web/src/builder/blocks/_shared/CoreOptionsScope.tsx
import { useContext, useMemo, type ReactNode } from 'react';
import { CoreOptionsScopeContext } from '@/templates/core-scope.ts';
import type { CoreOptions } from '@/templates/hooks.ts';

/** Overrides core options for a block's subtree; renders no element. */
export function CoreOptionsScope({ value, children }: { value: Partial<CoreOptions>; children: ReactNode }) {
  const parent = useContext(CoreOptionsScopeContext);
  const key = JSON.stringify(value);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the serialised value; callers build a fresh object per render
  const merged = useMemo(() => ({ ...parent, ...value }), [parent, key]);
  if (key === '{}') return <>{children}</>;
  return <CoreOptionsScopeContext.Provider value={merged}>{children}</CoreOptionsScopeContext.Provider>;
}
```

- [ ] **Step 6: `render.tsx`**

```tsx
// web/src/builder/render.tsx
import { Component, useMemo, type ReactNode } from 'react';
import { BLOCKS } from '@/builder/registry.ts';
import { useBuilderMode } from '@/builder/mode.ts';
import type { BlockRenderContext, SlotRender } from '@/builder/define.ts';
import type { ComponentData, DocKey, LayoutKind, PuckDoc } from '@/builder/types.ts';

const logged = new Set<string>();

interface BlockBoundaryProps { name: string; blockId: string; rethrow: boolean; children: ReactNode }
interface BlockBoundaryState { failed: boolean; error: unknown }

/** Spec §5.6: a broken block renders nothing — unless it is a route-bound flow, which takes the page to its default. */
export class BlockBoundary extends Component<BlockBoundaryProps, BlockBoundaryState> {
  state: BlockBoundaryState = { failed: false, error: null };
  static getDerivedStateFromError(error: unknown): BlockBoundaryState {
    return { failed: true, error };
  }
  componentDidCatch(error: unknown) {
    const key = `${this.props.name} (${this.props.blockId})`;
    if (logged.has(key)) return;
    logged.add(key);
    console.error(`[builder] block ${key} failed to render`, error);
  }
  render() {
    if (this.state.failed) {
      if (this.props.rethrow) throw this.state.error;
      return null;
    }
    return this.props.children;
  }
}

interface DocBoundaryProps { docKey: DocKey; fallback: ReactNode; children: ReactNode }
interface DocBoundaryState { failed: boolean; forKey: DocKey }

/** Around a published document: on a throw, render the route's default instead (which may itself throw upward). */
export class DocBoundary extends Component<DocBoundaryProps, DocBoundaryState> {
  state: DocBoundaryState = { failed: false, forKey: this.props.docKey };
  static getDerivedStateFromError(): Partial<DocBoundaryState> {
    return { failed: true };
  }
  static getDerivedStateFromProps(props: DocBoundaryProps, state: DocBoundaryState): Partial<DocBoundaryState> | null {
    return props.docKey !== state.forKey ? { failed: false, forKey: props.docKey } : null;
  }
  componentDidCatch(error: unknown) {
    console.error(`[builder] "${this.props.docKey}" failed to render — showing the default page`, error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function renderItems(items: readonly ComponentData[], ctx: BlockRenderContext): ReactNode[] {
  return items.map((item) => <BlockNode key={`${item.type}:${item.props.id}`} item={item} ctx={ctx} />);
}

function slotRender(value: unknown, ctx: BlockRenderContext): SlotRender {
  const items = Array.isArray(value) ? (value as ComponentData[]) : [];
  return (p) => {
    const children = renderItems(items, ctx);
    if (!p || (p.className === undefined && p.style === undefined && p.as === undefined)) return <>{children}</>;
    const As = p.as ?? 'div';
    return <As className={p.className} style={p.style}>{children}</As>;
  };
}

function BlockBody({ item, ctx }: { item: ComponentData; ctx: BlockRenderContext }) {
  const def = BLOCKS[item.type]!;
  const props: Record<string, unknown> = { ...item.props, puck: ctx };
  for (const s of def.slots) props[s] = slotRender(item.props[s], ctx);
  return <>{def.render(props as never)}</>;
}

function BlockNode({ item, ctx }: { item: ComponentData; ctx: BlockRenderContext }) {
  const def = BLOCKS[item.type];
  if (!def) return null;
  return (
    <BlockBoundary name={item.type} blockId={item.props.id} rethrow={def.routeBound}>
      <BlockBody item={item} ctx={ctx} />
    </BlockBoundary>
  );
}

/** Our own renderer over Puck's Data format (spec §13 A1). Expects a guarded document. */
export function RenderDoc({ doc, docKey, layout }: { doc: PuckDoc; docKey: DocKey; layout: LayoutKind }): ReactNode {
  const { editing } = useBuilderMode();
  const ctx = useMemo<BlockRenderContext>(() => ({ editing, docKey, layout }), [editing, docKey, layout]);
  return <>{renderItems(doc.content, ctx)}</>;
}
```

- [ ] **Step 7: Defaults table + helpers, and the API module**

```ts
// web/src/builder/defaults/helpers.ts
import { BLOCKS } from '@/builder/registry.ts';
import { EMPTY_ROOT, type ComponentData, type DocKey, type LayoutKind, type PageRootProps, type PuckDoc } from '@/builder/types.ts';

export interface DefaultEntry { docKey: DocKey; layouts: readonly LayoutKind[] | 'all'; doc: PuckDoc }

/** A component with the block's full default props; ids are stable so React keeps state across routes. */
export function block(type: string, props: Record<string, unknown> = {}, id = `${type}-default`): ComponentData {
  const def = BLOCKS[type];
  if (!def) throw new Error(`[builder] a default document uses the unknown block "${type}"`);
  return { type, props: { ...(structuredClone(def.defaultProps) as Record<string, unknown>), ...props, id } };
}

export function doc(content: ComponentData[], root: Partial<PageRootProps> = {}): PuckDoc {
  return { root: { props: { ...EMPTY_ROOT, ...root } }, content, zones: {} };
}
```

```ts
// web/src/builder/defaults/index.ts
import type { DefaultEntry } from '@/builder/defaults/helpers.ts';
import type { DocKey, LayoutKind, PuckDoc } from '@/builder/types.ts';

const LAYOUTS: readonly LayoutKind[] = ['storefront', 'menu', 'webapp'];

export function buildDefaultTable(groups: Record<string, { DEFAULTS?: DefaultEntry[] }>): Map<string, PuckDoc> {
  const table = new Map<string, PuckDoc>();
  for (const [path, mod] of Object.entries(groups)) {
    for (const entry of mod.DEFAULTS ?? []) {
      for (const layout of entry.layouts === 'all' ? LAYOUTS : entry.layouts) {
        const key = `${layout}|${entry.docKey}`;
        if (table.has(key)) throw new Error(`[builder] two default documents for ${key} (${path})`);
        table.set(key, entry.doc);
      }
    }
  }
  return table;
}

/** One group file per concern: groups/{shell,catalogue,commerce,account,post-order}.ts. */
const TABLE = buildDefaultTable(import.meta.glob<{ DEFAULTS?: DefaultEntry[] }>('./groups/*.ts', { eager: true }));

/** The built-in document for a route (v0.6.0's page), or null for custom pages (spec §13 A7). */
export function defaultDoc(docKey: DocKey, layout: LayoutKind): PuckDoc | null {
  if (docKey.startsWith('page:')) return null;
  return TABLE.get(`${layout}|${docKey}`) ?? null;
}
```

```ts
// web/src/api/pages.ts
import { api, unwrap } from '@/api/client.ts';
import { isRecord, type LayoutKind, type PageSet } from '@/builder/types.ts';

/** `{ version, data }` from the public route → the set, or null for anything that is not a schema-1 set. */
export function toPageSet(body: unknown): PageSet | null {
  if (!isRecord(body) || !isRecord(body.data)) return null;
  const set = body.data;
  if (set.schemaVersion !== 1 || !isRecord(set.shell) || !isRecord(set.pages)) return null;
  return set as unknown as PageSet;
}

/**
 * The latest published set for a layout. Never rejects: a 404 (backend older than
 * v0.7.0), a 503 (kill switch), a network error or a malformed body all mean
 * "no published set", and every page renders its default document.
 */
export async function fetchPageSet(layout: LayoutKind): Promise<PageSet | null> {
  try {
    return toPageSet(await unwrap<unknown>(api.get(`storefront/pages/${layout}`)));
  } catch {
    return null;
  }
}
```

- [ ] **Step 7b: Shared content helpers**

```tsx
// web/src/builder/blocks/_shared/RichHtml.tsx
import type { ReactNode } from 'react';
import { sanitizeRichtext } from '@/builder/sanitize.ts';

/**
 * A richtext prop (spec §13 A2): stored as an HTML string and sanitised again here;
 * inside the editor Puck may hand over a React node instead, rendered as-is.
 * `data-sf-prose` marks inline text links, which are exempt from the 44px tap-target rule.
 */
export function RichHtml({ value, className, block }: { value: unknown; className?: string; block?: string }) {
  if (typeof value === 'string') {
    return <div className={className} data-sf-prose="" data-sf-block={block} dangerouslySetInnerHTML={{ __html: sanitizeRichtext(value) }} />;
  }
  return <div className={className} data-sf-prose="" data-sf-block={block}>{value as ReactNode}</div>;
}
```

```tsx
// web/src/builder/blocks/_shared/SmartLink.tsx
import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

/** A `routeLink` value as an anchor: site paths through the router, external links guarded. */
export function SmartLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  if (href.startsWith('/')) {
    return <NavLink to={href} end className={className}>{children}</NavLink>;
  }
  return <a href={href} className={className} rel={/^https:/i.test(href) ? 'noopener noreferrer' : undefined}>{children}</a>;
}
```

- [ ] **Step 8: `runtime.tsx` (pages half)**

```tsx
// web/src/builder/runtime.tsx
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useSettings } from '@/app/settings.ts';
import { useEffectiveLayout } from '@/app/layout.ts';
import { fetchPageSet } from '@/api/pages.ts';
import { validateDoc } from '@/builder/guard.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { DocBoundary, RenderDoc } from '@/builder/render.tsx';
import type { DocKey, LayoutKind, PageRootProps, PageSet, PuckDoc, RouteKey } from '@/builder/types.ts';

export const pagesKey = (layout: LayoutKind) => ['pages', layout] as const;

/**
 * Read once per page load: same 30 s stale time as settings, but never refetched on
 * window focus — a publish must not swap the page under a shopper mid-checkout.
 */
export const PAGES_QUERY = { staleTime: 30_000, refetchOnWindowFocus: false, retry: false } as const;

const PageSetOverrideContext = createContext<{ pageSet: PageSet | null } | null>(null);

/** The editor and preview frames inject a draft set; nothing inside fetches the published one. */
export function PageSetOverrideProvider({ pageSet, children }: { pageSet: PageSet | null; children: ReactNode }) {
  const value = useMemo(() => ({ pageSet }), [pageSet]);
  return <PageSetOverrideContext.Provider value={value}>{children}</PageSetOverrideContext.Provider>;
}

export function usePageSet(layout: LayoutKind): { pageSet: PageSet | null; isLoading: boolean } {
  const override = useContext(PageSetOverrideContext);
  const query = useQuery({
    queryKey: pagesKey(layout),
    queryFn: () => fetchPageSet(layout),
    ...PAGES_QUERY,
    enabled: override === null,
  });
  if (override) return { pageSet: override.pageSet, isLoading: false };
  return { pageSet: query.data ?? null, isLoading: query.isPending };
}

export interface ResolvedDoc { doc: PuckDoc; isDefault: boolean }

/** The published doc if it passes the guard, else the route's default; null only for an unknown custom page. */
export function resolveDoc(pageSet: PageSet | null, docKey: DocKey, layout: LayoutKind): ResolvedDoc | null {
  const stored = pageSet ? (docKey === 'shell' ? pageSet.shell : pageSet.pages[docKey]) : undefined;
  if (stored) {
    const { doc } = validateDoc(stored, docKey, layout);
    if (doc) return { doc, isDefault: false };
  }
  const fallback = defaultDoc(docKey, layout);
  return fallback ? { doc: fallback, isDefault: true } : null;
}

/** Root title/description of a page; '' leaves the app's own title and description alone. */
function usePageMeta(root: PageRootProps | null): void {
  const { brand } = useSettings();
  const title = root?.title ?? '';
  const description = root?.description ?? '';
  useEffect(() => {
    if (!title) return;
    document.title = title;
    return () => {
      document.title = brand.title;
    };
  }, [title, brand.title]);
  useEffect(() => {
    if (!description) return;
    let meta = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    const created = meta === null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    const previous = meta.content;
    meta.content = description;
    return () => {
      if (created) meta.remove();
      else meta.content = previous;
    };
  }, [description]);
}

/** Every route element (spec §5.1): the page's document — published, or v0.6.0's default. */
export function PuckPage({ routeKey }: { routeKey: RouteKey }) {
  const layout = useEffectiveLayout();
  const { pageSet } = usePageSet(layout);
  const resolved = resolveDoc(pageSet, routeKey, layout);
  usePageMeta(resolved ? resolved.doc.root.props : null);
  if (!resolved) return <Navigate to="/" replace />;
  const page = <RenderDoc doc={resolved.doc} docKey={routeKey} layout={layout} />;
  const fallback = resolved.isDefault ? null : defaultDoc(routeKey, layout);
  if (!fallback) return page;
  return (
    <DocBoundary docKey={routeKey} fallback={<RenderDoc doc={fallback} docKey={routeKey} layout={layout} />}>
      {page}
    </DocBoundary>
  );
}
```

- [ ] **Step 9: Run to verify pass, and nothing else moved**

Run: `npm --prefix web test -- test/builder-render.test.tsx test/builder-runtime.test.tsx test/builder-defaults-table.test.ts test/core-scope.test.tsx test/builder-shared.test.tsx test/core-options-views.test.tsx test/templates-runtime.test.tsx test/templates-hooks.test.ts && npm --prefix web run typecheck`
Expected: PASS; exit 0.

- [ ] **Step 10: Commit**

```bash
git rm web/src/builder/blocks/_shared/.gitkeep
git add web/src/builder/render.tsx web/src/builder/runtime.tsx web/src/builder/defaults web/src/api/pages.ts web/src/templates/core-scope.ts web/src/templates/hooks.ts web/src/templates/runtime.tsx web/src/builder/blocks/_shared/CoreOptionsScope.tsx web/src/builder/blocks/_shared/RichHtml.tsx web/src/builder/blocks/_shared/SmartLink.tsx web/test/builder-render.test.tsx web/test/builder-runtime.test.tsx web/test/builder-defaults-table.test.ts web/test/core-scope.test.tsx web/test/builder-shared.test.tsx
git commit -m "feat(builder): RenderDoc, PuckPage, page-set loading and block-scoped core options"
```

---

## Phase 2 — Shell and page blocks (default documents reproduce v0.6.0)

### Task 8: Shell blocks, default shell documents and `PuckShell`

**Wave D.** Needs Tasks 4 and 7. Parallel with Tasks 9–12 (disjoint files; this task is the only one touching `runtime.tsx` in Wave D).

**Files:**
- Create: `web/src/builder/blocks/PageOutlet.tsx`, `Header.tsx`, `Footer.tsx`, `TopBar.tsx`, `NoticeBanners.tsx`, `CutoffBar.tsx`, `ContactStrip.tsx`, `MobileCartBar.tsx` (all under `web/src/builder/blocks/`)
- Create: `web/src/builder/defaults/groups/shell.ts`
- Modify: `web/src/builder/runtime.tsx` (add `PuckShell`, `useCurrentRouteKey`)
- Test: `web/test/builder-shell.test.tsx`

**Interfaces:**
- Consumes: layout parts from Task 4 (`StorefrontFrame/Header/Main`, `MenuFrame/Header/Main/ContactStrip`, `WebAppFrame/Header/Main`, `ShellFooter`, `ShellStateContext`, `useShellStateValue`), `Chromeless` (unchanged), `countBlocks` (rules), `CoreOptionsScope`, `resolveDoc`/`usePageSet`/`DocBoundary`/`RenderDoc` (Task 7).
- Produces:
  - Blocks (name · category · layouts · routeBound · props): `PageOutlet` · shell · all · true · — ; `Header` · shell · all · false · `variant: 'auto'|'storefront'|'menu'|'webapp'`, `topBar`, `search`, `sticky` (booleans, default true), `accountIcon`, `cartIcon` (`Override`, default `inherit`), slot `nav`; `Footer` · shell · storefront, menu · false · `variant: 'template'` (Task 21 adds `columns`); `TopBar` · shell · storefront, menu · false · —; `NoticeBanners` · shell · all · false · `pinned: boolean` (false); `CutoffBar` · shell · all · false · —; `ContactStrip` · shell · all · false · `catalogOnly: boolean` (true); `MobileCartBar` · shell · storefront, menu · false · —.
  - `runtime.tsx`: `PuckShell()` (A7, replaces `ShellSwitch`), `useCurrentRouteKey(): RouteKey | null` — reads `handle.routeKey` from `useMatches()`; the value `'page'` means "custom page, slug in `params.slug`". **Task 14 must put `handle: { routeKey }` on every route.**
  - Default shells: storefront `[Header, NoticeBanners, CutoffBar, PageOutlet, Footer]`; menu `[Header, NoticeBanners, CutoffBar, PageOutlet, Footer, ContactStrip]`; webapp `[Header, NoticeBanners, CutoffBar, PageOutlet]`.

- [ ] **Step 1: Load the design skill**

Implementer: load the `frontend-design:frontend-design` skill before writing UI code.

- [ ] **Step 2: Write the failing test (parity with the legacy shells)**

```tsx
// web/test/builder-shell.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ComponentType } from 'react';
import type { StorefrontSettings, Theme } from '@/types/settings.ts';
import type { PageSet } from '@/builder/types.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
vi.mock('@/components/Brand.tsx', () => ({ Brand: () => <span>brand</span> }));
vi.mock('@/components/ContactLinks.tsx', () => ({ ContactLinks: () => <i data-mark="contact" /> }));
vi.mock('@/features/notices/NoticeBanners.tsx', () => ({ NoticeBanners: ({ pinned }: { pinned?: boolean }) => <i data-mark={pinned ? 'notices-pinned' : 'notices'} /> }));
vi.mock('@/features/notices/CutoffBar.tsx', () => ({ CutoffBar: () => <i data-mark="cutoff" /> }));
vi.mock('@/features/auth/LoginModal.tsx', () => ({ LoginModal: () => <i data-mark="login-modal" /> }));
vi.mock('@/features/cart/CartDrawer.tsx', () => ({ CartDrawer: () => <i data-mark="cart-drawer" /> }));
vi.mock('@/features/cart/MobileCartBar.tsx', () => ({ MobileCartBar: () => <i data-mark="cart-bar" />, useMobileCartBar: () => false }));
vi.mock('@/features/webapp/PrimaryActionBar.tsx', () => ({ PrimaryActionBar: () => <i data-mark="primary-bar" />, usePrimaryBarShowing: () => false }));
vi.mock('@/features/webapp/useTelegramChrome.ts', () => ({ useTelegramChrome: () => {}, isFirstHistoryEntry: () => true }));
vi.mock('@/lib/telegram-webapp.ts', () => ({ isTelegramWebApp: () => false }));

import { StorefrontShell } from '@/layouts/StorefrontShell.tsx';
import { MenuShell } from '@/layouts/MenuShell.tsx';
import { WebAppShell } from '@/layouts/WebAppShell.tsx';
import { PageSetOverrideProvider, PuckShell } from '@/builder/runtime.tsx';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { TemplateProvider } from '@/templates/runtime.tsx';
import { resolveTheme } from '@/templates/resolve.ts';
import { lookupManifest } from '@/templates/registry.ts';
import type { TemplateModule } from '@/templates/slots.ts';

const THEME: Theme = {
  scheme: 'dark',
  colors: { primary: '#ffffff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' },
  fonts: { heading: null, body: null, mono: null }, radius: 'none', density: 'comfortable', customCss: '',
};
const MODULE: TemplateModule = { slots: {} };

function settings(layout: 'storefront' | 'menu' | 'webapp') {
  state.settings = {
    currency: 'GBP', welcomeMessage: null, enabled: true, supportLinks: [], notices: [],
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: 'Small batches', links: { whatsapp: 'https://wa.me/440000000000', telegram: null } },
    features: { layout, ordering: true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false },
    theme: THEME,
  } as unknown as StorefrontSettings;
}

function mount(Shell: ComponentType, pageSet: PageSet | null, path = '/', childKey: string = 'catalog') {
  const client = new QueryClient();
  const router = createMemoryRouter([{
    path: '/', element: <Shell />,
    children: [
      { index: true, handle: { routeKey: childKey }, element: <p>page</p> },
      { path: 'pages/:slug', handle: { routeKey: 'page' }, element: <p>custom</p> },
    ],
  }], { initialEntries: [path] });
  const resolved = resolveTheme({ ...THEME, options: {} }, lookupManifest);
  return render(
    <QueryClientProvider client={client}>
      <PageSetOverrideProvider pageSet={pageSet}>
        <MantineProvider env="test">
          <TemplateProvider resolved={resolved} fallback={null} load={() => Promise.resolve(MODULE)} peek={() => MODULE}>
            <RouterProvider router={router} />
          </TemplateProvider>
        </MantineProvider>
      </PageSetOverrideProvider>
    </QueryClientProvider>,
  );
}

const normalize = (html: string) => html.replace(/(mantine-)[a-z0-9]{5,}/gi, '$1ID').replace(/«r[0-9a-z]+»|:r[0-9a-z]+:|_r_[0-9a-z]+_/g, 'RID');

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe.each<[string, 'storefront' | 'menu' | 'webapp', ComponentType]>([
  ['storefront', 'storefront', StorefrontShell],
  ['menu', 'menu', MenuShell],
  ['webapp', 'webapp', WebAppShell],
])('PuckShell default · %s', (_n, layout, Legacy) => {
  it('renders exactly the v0.6.0 shell DOM', () => {
    settings(layout);
    const legacy = normalize(mount(Legacy, null).container.innerHTML);
    cleanup();
    const puck = normalize(mount(PuckShell, null).container.innerHTML);
    expect(puck).toBe(legacy);
    expect(puck).toContain('<p>page</p>');
  });
  it('has a default shell document with exactly one PageOutlet', () => {
    const doc = defaultDoc('shell', layout)!;
    expect(doc.content.filter((c) => c.type === 'PageOutlet')).toHaveLength(1);
  });
});

const root = (chrome: 'shell' | 'none' = 'shell') => ({ props: { title: '', description: '', chrome } });

describe('PuckShell with a published set', () => {
  it('renders a page whose root says chrome: none without the shell', () => {
    settings('storefront');
    const set: PageSet = { schemaVersion: 1, shell: defaultDoc('shell', 'storefront')!, pages: { 'page:plain': { root: root('none'), content: [] } } };
    const { container } = mount(PuckShell, set, '/pages/plain');
    expect(screen.getByText('custom')).toBeInTheDocument();
    expect(container.querySelectorAll('header')).toHaveLength(1);
    expect(container.querySelector('[data-mark="cart-drawer"]')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Search products' })).toBeNull();
  });
  it('mounts the phone cart bar only once, wherever the document puts it', () => {
    settings('storefront');
    const set: PageSet = {
      schemaVersion: 1,
      shell: { root: root(), content: [{ type: 'MobileCartBar', props: { id: 'bar' } }, { type: 'PageOutlet', props: { id: 'out' } }] },
      pages: {},
    };
    const { container } = mount(PuckShell, set);
    expect(container.querySelectorAll('[data-mark="cart-bar"]')).toHaveLength(1);
    expect(container.querySelector('header')).toBeNull();
  });
  it('falls back to the default shell when the published one has no PageOutlet', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    settings('menu');
    const set: PageSet = { schemaVersion: 1, shell: { root: root(), content: [{ type: 'CutoffBar', props: { id: 'c' } }] }, pages: {} };
    mount(PuckShell, set);
    expect(screen.getByText('page')).toBeInTheDocument();
    expect(document.querySelector('[data-mark="contact"]')).not.toBeNull();
  });
  it('honours header props: no search, no top bar, account icon hidden', () => {
    settings('storefront');
    const set: PageSet = {
      schemaVersion: 1,
      shell: { root: root(), content: [
        { type: 'Header', props: { id: 'h', variant: 'auto', topBar: false, search: false, sticky: true, accountIcon: 'hide', cartIcon: 'inherit', nav: [] } },
        { type: 'PageOutlet', props: { id: 'out' } },
      ] },
      pages: {},
    };
    mount(PuckShell, set);
    expect(screen.queryByRole('textbox', { name: 'Search products' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(screen.getByRole('link', { name: /^Cart,/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm --prefix web test -- test/builder-shell.test.tsx`
Expected: FAIL — `PuckShell` is not exported from `@/builder/runtime.tsx`.

- [ ] **Step 4: Write the shell blocks**

```tsx
// web/src/builder/blocks/PageOutlet.tsx
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { StorefrontMain } from '@/layouts/StorefrontShell.tsx';
import { MenuMain } from '@/layouts/MenuShell.tsx';
import { WebAppMain } from '@/layouts/WebAppShell.tsx';

/** Where the routed page renders (the shell's <main>). Exactly one per shell document. */
export const block = defineBlock<{ id: string }>({
  name: 'PageOutlet', label: 'Page content', category: 'shell', layouts: 'all', routeBound: true, slots: [],
  schema: z.object({}), defaultProps: {},
  render: ({ puck }) => (puck.layout === 'storefront' ? <StorefrontMain /> : puck.layout === 'menu' ? <MenuMain /> : <WebAppMain />),
});
```

```tsx
// web/src/builder/blocks/Header.tsx
import { z } from 'zod';
import { compactScope, defineBlock, iconOverride, override, slot, type Override } from '@/builder/define.ts';
import type { ComponentData } from '@/builder/types.ts';
import { CoreOptionsScope } from '@/builder/blocks/_shared/CoreOptionsScope.tsx';
import { StorefrontHeader } from '@/layouts/StorefrontShell.tsx';
import { MenuHeader } from '@/layouts/MenuShell.tsx';
import { WebAppHeader } from '@/layouts/WebAppShell.tsx';

type Variant = 'auto' | 'storefront' | 'menu' | 'webapp';
type Props = {
  id: string; variant: Variant; topBar: boolean; search: boolean; sticky: boolean;
  accountIcon: Override; cartIcon: Override; nav: ComponentData[];
};

/** The layout's header bar. `auto` follows the layout; the Telegram-shaped `webapp` variant only exists inside the web app. */
export const block = defineBlock<Props>({
  name: 'Header', label: 'Header', category: 'shell', layouts: 'all', routeBound: false, slots: ['nav'],
  schema: z.object({
    variant: z.enum(['auto', 'storefront', 'menu', 'webapp']),
    topBar: z.boolean(), search: z.boolean(), sticky: z.boolean(),
    accountIcon: override(), cartIcon: override(), nav: slot(),
  }),
  defaultProps: { variant: 'auto', topBar: true, search: true, sticky: true, accountIcon: 'inherit', cartIcon: 'inherit', nav: [] },
  render: ({ variant, topBar, search, sticky, accountIcon, cartIcon, nav, puck }) => {
    const v = variant === 'auto' ? puck.layout : variant === 'webapp' && puck.layout !== 'webapp' ? 'menu' : variant;
    const scope = compactScope({ headerAccountIcon: iconOverride(accountIcon), headerCartIcon: iconOverride(cartIcon) });
    const navNode = nav();
    return (
      <CoreOptionsScope value={scope}>
        {v === 'storefront' ? (
          <StorefrontHeader topBar={topBar} search={search} sticky={sticky} nav={navNode} />
        ) : v === 'menu' ? (
          <MenuHeader topBar={topBar} search={search} sticky={sticky} nav={navNode} />
        ) : (
          <WebAppHeader search={search} sticky={sticky} nav={navNode} />
        )}
      </CoreOptionsScope>
    );
  },
});
```

```tsx
// web/src/builder/blocks/Footer.tsx
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ShellFooter } from '@/layouts/ShellFooter.tsx';

/** `template` = the active template's Footer slot (Task 21 adds the composable `columns` variant). */
export const block = defineBlock<{ id: string; variant: 'template' }>({
  name: 'Footer', label: 'Footer', category: 'shell', layouts: ['storefront', 'menu'], routeBound: false, slots: [],
  schema: z.object({ variant: z.enum(['template']) }),
  defaultProps: { variant: 'template' },
  render: () => <ShellFooter />,
});
```

```tsx
// web/src/builder/blocks/TopBar.tsx
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { Slot } from '@/templates/runtime.tsx';

/** The template's TopBar slot on its own — for a Header with `topBar` off that wants it elsewhere. */
export const block = defineBlock<{ id: string }>({
  name: 'TopBar', label: 'Template top bar', category: 'shell', layouts: ['storefront', 'menu'], routeBound: false, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <Slot name="TopBar" />,
});
```

```tsx
// web/src/builder/blocks/NoticeBanners.tsx
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { NoticeBanners } from '@/features/notices/NoticeBanners.tsx';

/** The store's notices (Admin → Storefront → Selling). The Header already carries the pinned ones. */
export const block = defineBlock<{ id: string; pinned: boolean }>({
  name: 'NoticeBanners', label: 'Notices', category: 'shell', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({ pinned: z.boolean() }), defaultProps: { pinned: false },
  render: ({ pinned }) => <NoticeBanners pinned={pinned} />,
});
```

```tsx
// web/src/builder/blocks/CutoffBar.tsx
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CutoffBar } from '@/features/notices/CutoffBar.tsx';

/** The dispatch cut-off rail; the template's core options still decide its copy and countdown. */
export const block = defineBlock<{ id: string }>({
  name: 'CutoffBar', label: 'Dispatch cut-off', category: 'shell', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <CutoffBar />,
});
```

```tsx
// web/src/builder/blocks/ContactStrip.tsx
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { MenuContactStrip } from '@/layouts/MenuShell.tsx';

/** The chat-links strip at the foot; stands down whenever a cart tab claims the foot. */
export const block = defineBlock<{ id: string; catalogOnly: boolean }>({
  name: 'ContactStrip', label: 'Contact strip', category: 'shell', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({ catalogOnly: z.boolean() }), defaultProps: { catalogOnly: true },
  render: ({ catalogOnly }) => <MenuContactStrip catalogOnly={catalogOnly} />,
});
```

```tsx
// web/src/builder/blocks/MobileCartBar.tsx
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { MobileCartBar } from '@/features/cart/MobileCartBar.tsx';

/**
 * The running cart tab on phones. Optional in the document: when a shell has none,
 * PuckShell mounts it anyway (spec §5.4) so checkout is always reachable.
 */
export const block = defineBlock<{ id: string }>({
  name: 'MobileCartBar', label: 'Phone cart bar', category: 'shell', layouts: ['storefront', 'menu'], routeBound: false, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <MobileCartBar />,
});
```

- [ ] **Step 5: Default shell documents**

```ts
// web/src/builder/defaults/groups/shell.ts
import { block, doc, type DefaultEntry } from '@/builder/defaults/helpers.ts';

// v0.6.0's StorefrontShell / MenuShell / WebAppShell, top to bottom (the frame adds the system mounts).
export const DEFAULTS: DefaultEntry[] = [
  { docKey: 'shell', layouts: ['storefront'], doc: doc([block('Header'), block('NoticeBanners'), block('CutoffBar'), block('PageOutlet'), block('Footer')]) },
  { docKey: 'shell', layouts: ['menu'], doc: doc([block('Header'), block('NoticeBanners'), block('CutoffBar'), block('PageOutlet'), block('Footer'), block('ContactStrip')]) },
  { docKey: 'shell', layouts: ['webapp'], doc: doc([block('Header'), block('NoticeBanners'), block('CutoffBar'), block('PageOutlet')]) },
];
```

- [ ] **Step 6: Add `PuckShell` and `useCurrentRouteKey` to `runtime.tsx`**

Add to the imports of `web/src/builder/runtime.tsx`:

```tsx
import type { ComponentType } from 'react';
import { useMatches } from 'react-router';
import { Chromeless } from '@/layouts/Chromeless.tsx';
import { StorefrontFrame } from '@/layouts/StorefrontShell.tsx';
import { MenuFrame } from '@/layouts/MenuShell.tsx';
import { WebAppFrame } from '@/layouts/WebAppShell.tsx';
import { ShellStateContext, useShellStateValue } from '@/layouts/shell-context.ts';
import { countBlocks } from '@/builder/rules.ts';
import { customPageKey, isFixedRouteKey } from '@/builder/types.ts';
```

(merge `useMatches` into the existing `react-router` import, `ComponentType` into the `react` type import, and the two value helpers into the existing `@/builder/types.ts` import.) Then append:

```tsx
/** The route key of the deepest matched route carrying `handle.routeKey` (router.tsx sets them). */
export function useCurrentRouteKey(): RouteKey | null {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const match = matches[i]!;
    const key = (match.handle as { routeKey?: string } | undefined)?.routeKey;
    if (key === 'page') return customPageKey(match.params.slug);
    if (key && isFixedRouteKey(key)) return key;
  }
  return null;
}

type Frame = ComponentType<{ children: ReactNode; cartBar?: boolean }>;
const FRAMES: Record<LayoutKind, Frame> = { storefront: StorefrontFrame, menu: MenuFrame, webapp: WebAppFrame };

/**
 * Replaces ShellSwitch (spec §5.1): the layout's frame + system mounts (§5.4) around its
 * shell document. A page whose root says `chrome: 'none'` gets the chromeless frame instead
 * (v0.6.0's shared-order-link page).
 */
export function PuckShell() {
  const layout = useEffectiveLayout();
  const { pageSet } = usePageSet(layout);
  const routeKey = useCurrentRouteKey();
  const shellState = useShellStateValue();

  const page = routeKey ? resolveDoc(pageSet, routeKey, layout) : null;
  if (page?.doc.root.props.chrome === 'none') return <Chromeless />;

  const shell = resolveDoc(pageSet, 'shell', layout);
  if (!shell) throw new Error(`[builder] no default shell document for the ${layout} layout`);
  const Frame = FRAMES[layout];
  const body = <RenderDoc doc={shell.doc} docKey="shell" layout={layout} />;
  const fallback = shell.isDefault ? null : defaultDoc('shell', layout);

  return (
    <ShellStateContext.Provider value={shellState}>
      {/* The phone cart bar is a block owners can place; if the shell has none, the frame mounts it. */}
      <Frame cartBar={!countBlocks(shell.doc).has('MobileCartBar')}>
        {fallback ? (
          <DocBoundary docKey="shell" fallback={<RenderDoc doc={fallback} docKey="shell" layout={layout} />}>{body}</DocBoundary>
        ) : (
          body
        )}
      </Frame>
    </ShellStateContext.Provider>
  );
}
```

- [ ] **Step 7: Run to verify pass**

Run: `npm --prefix web test -- test/builder-shell.test.tsx test/shell-parts.test.tsx test/shell-header-options.test.tsx && npm --prefix web run typecheck`
Expected: PASS. If the parity assertion fails, diff the two strings (`expect(puck).toBe(legacy)` prints both) and fix the block or the default doc — never the legacy shell.

- [ ] **Step 8: Commit**

```bash
git add web/src/builder/blocks/PageOutlet.tsx web/src/builder/blocks/Header.tsx web/src/builder/blocks/Footer.tsx web/src/builder/blocks/TopBar.tsx web/src/builder/blocks/NoticeBanners.tsx web/src/builder/blocks/CutoffBar.tsx web/src/builder/blocks/ContactStrip.tsx web/src/builder/blocks/MobileCartBar.tsx web/src/builder/defaults/groups/shell.ts web/src/builder/runtime.tsx web/test/builder-shell.test.tsx
git commit -m "feat(builder): shell blocks, default shell documents and PuckShell (DOM-identical to v0.6.0)"
```

---
### Task 9: Catalogue page blocks and the catalogue/product default documents

**Wave D.** Needs Task 7. Parallel with Tasks 8, 10, 11, 12 (and 13).

**Files:**
- Create: `web/src/builder/blocks/_shared/catalogue.tsx`, `web/src/builder/blocks/ProductGrid.tsx`, `ProductList.tsx`, `WholesaleTable.tsx`, `ProductDetail.tsx`
- Create: `web/src/builder/defaults/groups/catalogue.ts` (write it **after** the four block files exist — a group file that names a missing block breaks every other task's tests in the shared tree)
- Modify: `web/src/features/catalog/ProductDetailPage.tsx` (optional `sections` prop)
- Test: `web/test/builder-catalogue.test.tsx`

**Interfaces:**
- Consumes: `CoreOptionsScope`, `compactScope`, `boolOverride`, `override`, `block`/`doc` helpers.
- Produces:
  - `_shared/catalogue.tsx`: `CatalogueOverrides` (`categoryPicker`, `pageTitle`, `intro`, `sku`: `Override`), `catalogueOverrideShape`, `CATALOGUE_OVERRIDE_DEFAULTS`, `CatalogueBody({ body: 'grid' | 'list' | 'wholesale'; overrides })` — wholesale mode (`features.wholesale`) replaces the body under any block, exactly like v0.6.0's `CatalogPage`.
  - Blocks: `ProductGrid` · catalogue · all · false · overrides; `ProductList` · catalogue · all · false · overrides (includes the menu/web-app `ProductDetailSheet`, as `ProductList` always did); `WholesaleTable` · catalogue · all · false · overrides; `ProductDetail` · product · all · true · `gallery`, `bulkPricing`, `provenance`, `upsells` (booleans, true) + `sku: Override`.
  - `ProductDetailPage({ sections?: Partial<ProductDetailSections> })`, `ProductDetailSections { gallery; bulkPricing; provenance; upsells }` (all default true).
  - Defaults: `catalog` → storefront `[ProductGrid]`, menu/webapp `[ProductList]`; `product` → all layouts `[ProductDetail]`.

- [ ] **Step 1: Load the design skill**

Implementer: load the `frontend-design:frontend-design` skill before writing UI code.

- [ ] **Step 2: Write the failing test**

```tsx
// web/test/builder-catalogue.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { Suspense } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { Catalog, Product } from '@/types/catalog.ts';
import type { LayoutKind, PuckDoc } from '@/builder/types.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings, catalog: undefined as Catalog | undefined }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
vi.mock('@/features/catalog/use-catalog.ts', () => ({
  CATALOG_KEY: ['catalog'],
  useCatalog: () => ({ data: state.catalog, isPending: false, isError: false, refetch: () => {} }),
  useProduct: (id: number | null) => ({ data: id == null ? undefined : state.catalog?.products.find((p) => p.id === id), isPending: false, isError: false, refetch: () => {} }),
}));

import { RenderDoc } from '@/builder/render.tsx';
import { defaultDoc } from '@/builder/defaults/index.ts';

function product(id: number, name: string, extra: Partial<Product> = {}): Product {
  return {
    id, sku: `NB-${id}`, name, displayName: name, shortDisplayName: null, description: null, categoryId: 1, categoryName: 'Pantry',
    sortOrder: id, price: 12, inStock: true, lowStockAlert: false, isActive: true, isPreorder: false, preorderEta: null,
    pricingTiers: [], upsellProductIds: [], excludedFromFreeShipping: false, imageProductId: null, provenance: null,
    minOrderQuantity: null, maxOrderQuantity: null, ...extra,
  };
}
const CATALOG: Catalog = {
  categories: [{ id: 1, name: 'Pantry', slug: 'pantry', parentId: null, sortOrder: 0, emoji: null }],
  products: [product(7, 'Trail Oats 1kg', { imageProductId: 7 }), product(8, 'Cold Brew Kit')],
};

function mount(doc: PuckDoc, layout: LayoutKind, path = '/', features: Partial<StorefrontSettings['features']> = {}) {
  state.catalog = CATALOG;
  state.settings = {
    currency: 'GBP', welcomeMessage: null,
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: '', links: { whatsapp: null, telegram: null } },
    features: { layout, ordering: true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false, ...features },
  } as StorefrontSettings;
  const docKey = path.startsWith('/p/') ? 'product' : 'catalog';
  return render(
    <MantineProvider env="test">
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Outlet context={{ search: '', setSearch: () => {} }} />}>
            <Route path="/" element={<Suspense fallback={<p>loading</p>}><RenderDoc doc={doc} docKey={docKey} layout={layout} /></Suspense>} />
            <Route path="/p/:id" element={<Suspense fallback={<p>loading</p>}><RenderDoc doc={doc} docKey={docKey} layout={layout} /></Suspense>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

const withProps = (doc: PuckDoc, props: Record<string, unknown>): PuckDoc => ({ ...doc, content: [{ ...doc.content[0]!, props: { ...doc.content[0]!.props, ...props } }] });

afterEach(cleanup);

describe('catalogue default documents', () => {
  it('storefront: the product grid', async () => {
    const { container } = mount(defaultDoc('catalog', 'storefront')!, 'storefront');
    expect(await screen.findByRole('heading', { level: 1, name: 'All products' })).toBeInTheDocument();
    expect(container.querySelector('[data-sf-part="product-grid"]')).not.toBeNull();
  });
  it('menu and web app: the grouped list', async () => {
    for (const layout of ['menu', 'webapp'] as const) {
      const { container } = mount(defaultDoc('catalog', layout)!, layout);
      await screen.findByRole('heading', { level: 1, name: 'All products' });
      expect(container.querySelector('[data-sf-part="group-title"]')).not.toBeNull();
      cleanup();
    }
  });
  it('wholesale mode replaces the body under any list block', async () => {
    mount(defaultDoc('catalog', 'storefront')!, 'storefront', '/', { wholesale: true });
    expect(await screen.findByRole('heading', { level: 1, name: 'Trade list' })).toBeInTheDocument();
  });
  it('a block override hides the page title for its own subtree only', async () => {
    mount(withProps(defaultDoc('catalog', 'storefront')!, { pageTitle: 'hide' }), 'storefront');
    const h1 = await screen.findByRole('heading', { level: 1, name: 'All products' });
    expect(h1).toHaveClass('sf-visually-hidden');
  });
});

describe('ProductDetail', () => {
  it('shows the gallery by default and hides it when told', async () => {
    const shown = mount(defaultDoc('product', 'storefront')!, 'storefront', '/p/7');
    await screen.findByRole('heading', { level: 1, name: 'Trail Oats 1kg' });
    expect(shown.container.querySelector('img')).not.toBeNull();
    cleanup();
    const hidden = mount(withProps(defaultDoc('product', 'storefront')!, { gallery: false }), 'storefront', '/p/7');
    await screen.findByRole('heading', { level: 1, name: 'Trail Oats 1kg' });
    expect(hidden.container.querySelector('img')).toBeNull();
  });
  it('the sku override beats the store-wide option', async () => {
    mount(withProps(defaultDoc('product', 'storefront')!, { sku: 'hide' }), 'storefront', '/p/7');
    await screen.findByRole('heading', { level: 1, name: 'Trail Oats 1kg' });
    expect(screen.queryByText('NB-7')).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm --prefix web test -- test/builder-catalogue.test.tsx`
Expected: FAIL — `defaultDoc('catalog', 'storefront')` is `null` (TypeError reading `content`).

- [ ] **Step 4: Give `ProductDetailPage` optional sections**

In `web/src/features/catalog/ProductDetailPage.tsx`:

```tsx
/** Which optional parts the page shows — the ProductDetail block's toggles. All on by default. */
export interface ProductDetailSections { gallery: boolean; bulkPricing: boolean; provenance: boolean; upsells: boolean }
const ALL_SECTIONS: ProductDetailSections = { gallery: true, bulkPricing: true, provenance: true, upsells: true };

/** The single product page — the storefront layout's detail view. */
export function ProductDetailPage({ sections }: { sections?: Partial<ProductDetailSections> }) {
  const show = { ...ALL_SECTIONS, ...sections };
```

and change exactly these four expressions (nothing else in the file):

```tsx
  const hasImage = show.gallery && product.imageProductId !== null;
```
```tsx
          {show.bulkPricing && product.pricingTiers.length > 0 ? (
```
```tsx
          {show.provenance && product.provenance ? (
```
```tsx
      {show.upsells ? <Upsells product={product} /> : null}
```

(`hasImage` already drives both the media column and the `layoutNoImage` class, so hiding the gallery reflows exactly like an imageless product.)

- [ ] **Step 5: Shared catalogue body**

```tsx
// web/src/builder/blocks/_shared/catalogue.tsx
import { lazy } from 'react';
import { useSettings } from '@/app/settings.ts';
import { boolOverride, compactScope, override, type Override } from '@/builder/define.ts';
import { CoreOptionsScope } from '@/builder/blocks/_shared/CoreOptionsScope.tsx';

const ProductGrid = lazy(() => import('@/features/catalog/ProductGrid.tsx').then((m) => ({ default: m.ProductGrid })));
const ProductList = lazy(() => import('@/features/catalog/ProductList.tsx').then((m) => ({ default: m.ProductList })));
const WholesaleCatalogPage = lazy(() => import('@/features/wholesale/WholesaleCatalogPage.tsx').then((m) => ({ default: m.WholesaleCatalogPage })));

export interface CatalogueOverrides { categoryPicker: Override; pageTitle: Override; intro: Override; sku: Override }
export const catalogueOverrideShape = { categoryPicker: override(), pageTitle: override(), intro: override(), sku: override() };
export const CATALOGUE_OVERRIDE_DEFAULTS: CatalogueOverrides = { categoryPicker: 'inherit', pageTitle: 'inherit', intro: 'inherit', sku: 'inherit' };

/**
 * One catalogue body. Wholesale mode replaces the catalogue under any shell and any
 * list block — v0.6.0's CatalogPage rule — so a default document still shows the trade list.
 */
export function CatalogueBody({ body, overrides }: { body: 'grid' | 'list' | 'wholesale'; overrides: CatalogueOverrides }) {
  const { features } = useSettings();
  const which = features.wholesale ? 'wholesale' : body;
  const scope = compactScope({
    showCategoryPicker: boolOverride(overrides.categoryPicker),
    showPageTitle: boolOverride(overrides.pageTitle),
    showCatalogIntro: boolOverride(overrides.intro),
    showSku: boolOverride(overrides.sku),
  });
  return (
    <CoreOptionsScope value={scope}>
      {which === 'grid' ? <ProductGrid /> : which === 'list' ? <ProductList /> : <WholesaleCatalogPage />}
    </CoreOptionsScope>
  );
}
```

- [ ] **Step 6: The four blocks**

```tsx
// web/src/builder/blocks/ProductGrid.tsx
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CATALOGUE_OVERRIDE_DEFAULTS, CatalogueBody, catalogueOverrideShape, type CatalogueOverrides } from '@/builder/blocks/_shared/catalogue.tsx';

/** The storefront catalogue: hero, search, category rail/chips, card grid. */
export const block = defineBlock<{ id: string } & CatalogueOverrides>({
  name: 'ProductGrid', label: 'Product grid', category: 'catalogue', layouts: 'all', routeBound: false, slots: [],
  schema: z.object(catalogueOverrideShape), defaultProps: CATALOGUE_OVERRIDE_DEFAULTS,
  render: ({ categoryPicker, pageTitle, intro, sku }) => <CatalogueBody body="grid" overrides={{ categoryPicker, pageTitle, intro, sku }} />,
});
```

```tsx
// web/src/builder/blocks/ProductList.tsx
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CATALOGUE_OVERRIDE_DEFAULTS, CatalogueBody, catalogueOverrideShape, type CatalogueOverrides } from '@/builder/blocks/_shared/catalogue.tsx';

/** The dense manifest ruled by category, with the product and filter sheets over it. */
export const block = defineBlock<{ id: string } & CatalogueOverrides>({
  name: 'ProductList', label: 'Product list', category: 'catalogue', layouts: 'all', routeBound: false, slots: [],
  schema: z.object(catalogueOverrideShape), defaultProps: CATALOGUE_OVERRIDE_DEFAULTS,
  render: ({ categoryPicker, pageTitle, intro, sku }) => <CatalogueBody body="list" overrides={{ categoryPicker, pageTitle, intro, sku }} />,
});
```

```tsx
// web/src/builder/blocks/WholesaleTable.tsx
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CATALOGUE_OVERRIDE_DEFAULTS, CatalogueBody, catalogueOverrideShape, type CatalogueOverrides } from '@/builder/blocks/_shared/catalogue.tsx';

/** The trade list, whatever the store's wholesale flag says. */
export const block = defineBlock<{ id: string } & CatalogueOverrides>({
  name: 'WholesaleTable', label: 'Trade list', category: 'catalogue', layouts: 'all', routeBound: false, slots: [],
  schema: z.object(catalogueOverrideShape), defaultProps: CATALOGUE_OVERRIDE_DEFAULTS,
  render: ({ categoryPicker, pageTitle, intro, sku }) => <CatalogueBody body="wholesale" overrides={{ categoryPicker, pageTitle, intro, sku }} />,
});
```

```tsx
// web/src/builder/blocks/ProductDetail.tsx
import { lazy } from 'react';
import { z } from 'zod';
import { boolOverride, compactScope, defineBlock, override, type Override } from '@/builder/define.ts';
import { CoreOptionsScope } from '@/builder/blocks/_shared/CoreOptionsScope.tsx';

const ProductDetailPage = lazy(() => import('@/features/catalog/ProductDetailPage.tsx').then((m) => ({ default: m.ProductDetailPage })));

type Props = { id: string; gallery: boolean; bulkPricing: boolean; provenance: boolean; upsells: boolean; sku: Override };

/** The product page body (storefront layout; menu and web app open a sheet from the list instead). */
export const block = defineBlock<Props>({
  name: 'ProductDetail', label: 'Product detail', category: 'product', layouts: 'all', routeBound: true, slots: [],
  schema: z.object({ gallery: z.boolean(), bulkPricing: z.boolean(), provenance: z.boolean(), upsells: z.boolean(), sku: override() }),
  defaultProps: { gallery: true, bulkPricing: true, provenance: true, upsells: true, sku: 'inherit' },
  render: ({ gallery, bulkPricing, provenance, upsells, sku }) => (
    <CoreOptionsScope value={compactScope({ showSku: boolOverride(sku) })}>
      <ProductDetailPage sections={{ gallery, bulkPricing, provenance, upsells }} />
    </CoreOptionsScope>
  ),
});
```

- [ ] **Step 7: Default documents**

```ts
// web/src/builder/defaults/groups/catalogue.ts
import { block, doc, type DefaultEntry } from '@/builder/defaults/helpers.ts';

// v0.6.0's CatalogPage (grid for storefront, list for menu/webapp; wholesale swaps in inside the block) and ProductDetailPage.
export const DEFAULTS: DefaultEntry[] = [
  { docKey: 'catalog', layouts: ['storefront'], doc: doc([block('ProductGrid')]) },
  { docKey: 'catalog', layouts: ['menu', 'webapp'], doc: doc([block('ProductList')]) },
  { docKey: 'product', layouts: 'all', doc: doc([block('ProductDetail')]) },
];
```

- [ ] **Step 8: Run to verify pass**

Run: `npm --prefix web test -- test/builder-catalogue.test.tsx test/product-detail-page.test.tsx test/product-detail-sku.test.tsx test/core-options-views.test.tsx && npm --prefix web run typecheck`
Expected: PASS (the two existing product-detail tests unchanged — `sections` is optional).

- [ ] **Step 9: Commit**

```bash
git add web/src/builder/blocks/_shared/catalogue.tsx web/src/builder/blocks/ProductGrid.tsx web/src/builder/blocks/ProductList.tsx web/src/builder/blocks/WholesaleTable.tsx web/src/builder/blocks/ProductDetail.tsx web/src/builder/defaults/groups/catalogue.ts web/src/features/catalog/ProductDetailPage.tsx web/test/builder-catalogue.test.tsx
git commit -m "feat(builder): catalogue and product blocks with their default documents"
```

---

### Task 10: Catalogue extras — CatalogHero (template), CategoryNav, SearchField, Upsells

**Wave D.** Needs Tasks 4 and 7. Parallel with Tasks 8, 9, 11, 12.

**Files:**
- Create: `web/src/builder/blocks/CatalogHero.tsx`, `CategoryNav.tsx`, `SearchField.tsx`, `SearchField.module.css`, `Upsells.tsx`
- Test: `web/test/builder-catalogue-extras.test.tsx`

**Interfaces:**
- Consumes: `useShellState` (Task 4), `useCatalogStats` (`@/templates/hooks.ts`), `useCatalog`/`useProduct`, `buildCategoryTree`, `categoryCounts`, `findCategoryBySlugOrId`, `Slot`.
- Produces (not used by any default document; available to owners):
  - `CatalogHero` · catalogue · all · false · `variant: 'template'`, `surface: 'auto' | 'grid' | 'list' | 'wholesale'` (Task 21 adds the `custom` variant and its fields).
  - `CategoryNav` · catalogue · all · false · — (the existing component: chips on phones, rail from 62em).
  - `SearchField` · catalogue · all · false · `placeholder: string` (≤ 60, default `'Search products'`). Typing anywhere but the catalogue sends the shopper to `/` with the query kept (the shell owns the search state).
  - `Upsells` · catalogue · all · false · `productId: number | null` (null = the product in the URL).

- [ ] **Step 1: Load the design skill**

Implementer: load the `frontend-design:frontend-design` skill before writing UI code.

- [ ] **Step 2: Write the failing test**

```tsx
// web/test/builder-catalogue-extras.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { Suspense, type ReactNode } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { Catalog, Product } from '@/types/catalog.ts';
import type { ComponentData } from '@/builder/types.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings, catalog: undefined as Catalog | undefined }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
vi.mock('@/features/catalog/use-catalog.ts', () => ({
  CATALOG_KEY: ['catalog'],
  useCatalog: () => ({ data: state.catalog, isPending: false, isError: false, refetch: () => {} }),
  useProduct: (id: number | null) => ({ data: id == null ? undefined : state.catalog?.products.find((p) => p.id === id), isPending: false, isError: false, refetch: () => {} }),
}));

import { RenderDoc } from '@/builder/render.tsx';
import { ShellStateContext, useShellStateValue, useShellState } from '@/layouts/shell-context.ts';

function product(id: number, name: string, extra: Partial<Product> = {}): Product {
  return {
    id, sku: `NB-${id}`, name, displayName: name, shortDisplayName: null, description: null, categoryId: 1, categoryName: 'Pantry',
    sortOrder: id, price: 12, inStock: true, lowStockAlert: false, isActive: true, isPreorder: false, preorderEta: null,
    pricingTiers: [], upsellProductIds: [], excludedFromFreeShipping: false, imageProductId: null, provenance: null,
    minOrderQuantity: null, maxOrderQuantity: null, ...extra,
  };
}

function ShellState({ children }: { children: ReactNode }) {
  const value = useShellStateValue();
  return <ShellStateContext.Provider value={value}>{children}</ShellStateContext.Provider>;
}
function SearchEcho() { return <output>{`q=${useShellState().search}`}</output>; }

function mount(content: ComponentData[], path = '/') {
  state.catalog = {
    categories: [{ id: 1, name: 'Pantry', slug: 'pantry', parentId: null, sortOrder: 0, emoji: null }],
    products: [product(7, 'Trail Oats 1kg', { upsellProductIds: [8] }), product(8, 'Cold Brew Kit')],
  };
  state.settings = {
    currency: 'GBP', welcomeMessage: 'Packed to order in Leeds',
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: 'Small batches', links: { whatsapp: null, telegram: null } },
    features: { layout: 'storefront', ordering: true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: true },
  } as StorefrontSettings;
  const page = <Suspense fallback={null}><RenderDoc doc={{ root: { props: { title: '', description: '', chrome: 'shell' } }, content }} docKey="page:x" layout="storefront" /><SearchEcho /></Suspense>;
  const router = createMemoryRouter([{ path: '/', element: <p>catalogue</p> }, { path: '*', element: page }], { initialEntries: [path] });
  return render(<MantineProvider env="test"><ShellState><RouterProvider router={router} /></ShellState></MantineProvider>);
}

const c = (type: string, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id: type, ...props } });

afterEach(cleanup);

describe('catalogue extras', () => {
  it('CatalogHero renders the template hero with the store copy', () => {
    mount([c('CatalogHero', { variant: 'template', surface: 'grid' })], '/pages/x');
    expect(screen.getByText('Packed to order in Leeds')).toBeInTheDocument();
    expect(screen.getByText(/2 products/)).toBeInTheDocument();
  });
  it('CategoryNav lists the categories', async () => {
    mount([c('CategoryNav')], '/pages/x');
    expect((await screen.findAllByRole('navigation', { name: 'Categories' })).length).toBeGreaterThan(0);
  });
  it('SearchField typed away from the catalogue goes to the catalogue with the query', () => {
    mount([c('SearchField', { placeholder: 'Find it' })], '/pages/x');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search products' }), { target: { value: 'oats' } });
    expect(screen.getByText('catalogue')).toBeInTheDocument();
  });
  it('Upsells follows the product in the URL', async () => {
    mount([c('Upsells', { productId: null })], '/p/7');
    expect(await screen.findByText('Cold Brew Kit')).toBeInTheDocument();
  });
  it('Upsells renders nothing without a product', () => {
    const { container } = mount([c('Upsells', { productId: null })], '/pages/x');
    expect(container.querySelector('section')).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm --prefix web test -- test/builder-catalogue-extras.test.tsx`
Expected: FAIL — the blocks are not registered (nothing renders; `getByText('Packed to order in Leeds')` throws).

- [ ] **Step 4: Implement the blocks**

```tsx
// web/src/builder/blocks/CatalogHero.tsx
import { z } from 'zod';
import { useSettings } from '@/app/settings.ts';
import { defineBlock } from '@/builder/define.ts';
import { useCatalogStats } from '@/templates/hooks.ts';
import { Slot } from '@/templates/runtime.tsx';
import type { LayoutKind } from '@/builder/types.ts';

type Surface = 'grid' | 'list' | 'wholesale';
type Props = { id: string; variant: 'template'; surface: 'auto' | Surface };

const autoSurface = (layout: LayoutKind): Surface => (layout === 'storefront' ? 'grid' : 'list');

function TemplateHero({ surface }: { surface: Surface }) {
  const { brand, welcomeMessage } = useSettings();
  const { productCount, categoryCount } = useCatalogStats();
  return <Slot name="CatalogHero" surface={surface} tagline={brand.tagline} welcomeMessage={welcomeMessage} productCount={productCount ?? 0} categoryCount={categoryCount ?? 0} />;
}

/** The template's catalogue intro on its own (the list blocks already carry one; `intro: hide` there + this block moves it). */
export const block = defineBlock<Props>({
  name: 'CatalogHero', label: 'Catalogue intro', category: 'catalogue', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({ variant: z.enum(['template']), surface: z.enum(['auto', 'grid', 'list', 'wholesale']) }),
  defaultProps: { variant: 'template', surface: 'auto' },
  render: ({ surface, puck }) => <TemplateHero surface={surface === 'auto' ? autoSurface(puck.layout) : surface} />,
});
```

```tsx
// web/src/builder/blocks/CategoryNav.tsx
import { lazy, useMemo } from 'react';
import { useParams } from 'react-router';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { useCatalog } from '@/features/catalog/use-catalog.ts';
import { buildCategoryTree } from '@/features/catalog/category-tree.ts';
import { categoryCounts, findCategoryBySlugOrId } from '@/features/catalog/filter.ts';

const CategoryNav = lazy(() => import('@/features/catalog/CategoryNav.tsx').then((m) => ({ default: m.CategoryNav })));

function CategoryNavView() {
  const catalog = useCatalog();
  const { categorySlug } = useParams();
  const products = useMemo(() => catalog.data?.products ?? [], [catalog.data]);
  const categories = useMemo(() => catalog.data?.categories ?? [], [catalog.data]);
  const tree = useMemo(() => buildCategoryTree(categories, categoryCounts(products)), [categories, products]);
  if (!catalog.data) return null;
  const active = categorySlug ? findCategoryBySlugOrId(categories, categorySlug) : undefined;
  return <CategoryNav tree={tree} total={products.length} activeId={active?.id ?? null} />;
}

/** The category chips (phones) and rail (from 62em). */
export const block = defineBlock<{ id: string }>({
  name: 'CategoryNav', label: 'Categories', category: 'catalogue', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <CategoryNavView />,
});
```

```tsx
// web/src/builder/blocks/SearchField.tsx
import { useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { SearchField } from '@/layouts/SearchField.tsx';
import { useShellState } from '@/layouts/shell-context.ts';
import classes from '@/builder/blocks/SearchField.module.css';

function SearchFieldView({ placeholder }: { placeholder: string }) {
  const { search, setSearch } = useShellState();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const onCatalog = pathname === '/' || pathname.startsWith('/c/');
  return (
    <div className={classes.root} data-sf-block="SearchField">
      <SearchField
        className={classes.field}
        value={search}
        placeholder={placeholder}
        onChange={(value) => {
          setSearch(value);
          // The shell keeps the query across the navigation, so the catalogue opens filtered.
          if (!onCatalog) navigate('/');
        }}
      />
    </div>
  );
}

export const block = defineBlock<{ id: string; placeholder: string }>({
  name: 'SearchField', label: 'Search field', category: 'catalogue', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({ placeholder: z.string().min(1).max(60) }), defaultProps: { placeholder: 'Search products' },
  render: ({ placeholder }) => <SearchFieldView placeholder={placeholder} />,
});
```

```css
/* web/src/builder/blocks/SearchField.module.css */
/* A search field placed in a page, not the header: its own hairline row, a thumb tall. */
.root {
  padding-block: 0.75rem;
}

.field {
  max-width: 32rem;
  min-height: 44px;
  border-bottom: 1px solid var(--sf-line-strong);
}
```

```tsx
// web/src/builder/blocks/Upsells.tsx
import { lazy } from 'react';
import { useParams } from 'react-router';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { useProduct } from '@/features/catalog/use-catalog.ts';

const Upsells = lazy(() => import('@/features/catalog/Upsells.tsx').then((m) => ({ default: m.Upsells })));

function UpsellsView({ productId }: { productId: number | null }) {
  const { id } = useParams();
  const fromUrl = id !== undefined && /^\d+$/.test(id) ? Number(id) : null;
  const query = useProduct(productId ?? fromUrl);
  if (!query.data) return null;
  return <Upsells product={query.data} />;
}

/** "Goes with" rail for one product — the one in the URL unless a product is picked. Silent when nothing is curated. */
export const block = defineBlock<{ id: string; productId: number | null }>({
  name: 'Upsells', label: 'Goes with', category: 'catalogue', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({ productId: z.number().int().positive().nullable() }), defaultProps: { productId: null },
  render: ({ productId }) => <UpsellsView productId={productId} />,
});
```

- [ ] **Step 5: Run to verify pass**

Run: `npm --prefix web test -- test/builder-catalogue-extras.test.tsx && npm --prefix web run typecheck`
Expected: PASS. (`useProduct(null)` is disabled in `use-catalog.ts` — `enabled: id !== null && Number.isFinite(id)` — so a page with no product in the URL fires no request.)

- [ ] **Step 6: Commit**

```bash
git add web/src/builder/blocks/CatalogHero.tsx web/src/builder/blocks/CategoryNav.tsx web/src/builder/blocks/SearchField.tsx web/src/builder/blocks/SearchField.module.css web/src/builder/blocks/Upsells.tsx web/test/builder-catalogue-extras.test.tsx
git commit -m "feat(builder): catalogue intro, category nav, search field and upsell blocks"
```

---

### Task 11: Cart, checkout and login blocks

**Wave D.** Needs Task 7. Parallel with Tasks 8, 9, 10, 12.

**Files:**
- Create: `web/src/builder/blocks/_shared/cart-context.ts`, `web/src/builder/blocks/CartContents.tsx`, `CartSummary.tsx`, `CheckoutFlow.tsx`, `LoginOptions.tsx`
- Create: `web/src/builder/defaults/groups/commerce.ts` (after the blocks exist)
- Modify: `web/src/features/cart/CartPage.tsx` (optional `foot` render prop)
- Test: `web/test/builder-commerce.test.tsx`

**Interfaces:**
- Produces:
  - `CartPage({ foot?: (ctx: { blocked: boolean; className: string }) => ReactNode })` — without `foot` it renders exactly as today.
  - `CartBlockedContext` (`boolean | null`).
  - Blocks: `CartContents` · commerce · all · true · slot `summary` (rendered into the cart's foot column); `CartSummary` · commerce · all · true · — (reads `blocked` from `CartContents`, or computes it when placed outside); `CheckoutFlow` · commerce · all · true · —; `LoginOptions` · commerce · all · true · — (the whole sign-in page body: heading, lede, the ways in, the Telegram error state).
  - Defaults: `cart` → `[CartContents{ summary: [CartSummary] }]`; `checkout` → `[CheckoutFlow]`; `login` → `[LoginOptions]` (all layouts).

- [ ] **Step 1: Load the design skill**

Implementer: load the `frontend-design:frontend-design` skill before writing UI code.

- [ ] **Step 2: Write the failing test**

```tsx
// web/test/builder-commerce.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { Suspense, type ReactNode } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { Product } from '@/types/catalog.ts';

vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({
    currency: 'GBP', enabled: true,
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', links: { whatsapp: null, telegram: null } },
    features: { layout: 'storefront', ordering: true, guestCheckout: true, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false },
  }) as unknown as StorefrontSettings,
}));
vi.mock('@/features/checkout/CheckoutPage.tsx', () => ({ CheckoutPage: () => <p>checkout page</p> }));
vi.mock('@/features/auth/LoginPage.tsx', () => ({ LoginPage: () => <p>login page</p> }));

import { RenderDoc } from '@/builder/render.tsx';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { CartPage } from '@/features/cart/CartPage.tsx';
import { useCartStore } from '@/stores/cart.ts';

const oats: Product = {
  id: 7, sku: 'NB-7', name: 'Trail Oats 1kg', displayName: 'Trail Oats 1kg', shortDisplayName: null, description: null, categoryId: 1, categoryName: 'Pantry',
  sortOrder: 0, price: 12, inStock: true, lowStockAlert: false, isActive: true, isPreorder: false, preorderEta: null,
  pricingTiers: [], upsellProductIds: [], excludedFromFreeShipping: false, imageProductId: null, provenance: null, minOrderQuantity: null, maxOrderQuantity: null,
};

const wrap = (node: ReactNode) => render(<MantineProvider env="test"><MemoryRouter><Suspense fallback={<p>loading</p>}>{node}</Suspense></MemoryRouter></MantineProvider>);
const normalize = (html: string) => html.replace(/(mantine-)[a-z0-9]{5,}/gi, '$1ID').replace(/«r[0-9a-z]+»|:r[0-9a-z]+:|_r_[0-9a-z]+_/g, 'RID');

afterEach(() => { cleanup(); useCartStore.getState().clear(); });

describe('cart default document', () => {
  it('renders the v0.6.0 cart page DOM, summary inside the foot', async () => {
    useCartStore.getState().add(oats, 2);
    const legacy = wrap(<CartPage />);
    await screen.findByRole('heading', { name: 'Your cart' });
    const expected = normalize(legacy.container.innerHTML);
    cleanup();
    const puck = wrap(<RenderDoc doc={defaultDoc('cart', 'storefront')!} docKey="cart" layout="storefront" />);
    await screen.findByRole('heading', { name: 'Your cart' });
    expect(normalize(puck.container.innerHTML)).toBe(expected);
  });
  it('the empty cart keeps its empty state and no summary', async () => {
    wrap(<RenderDoc doc={defaultDoc('cart', 'menu')!} docKey="cart" layout="menu" />);
    expect(await screen.findByText('Nothing on the order yet')).toBeInTheDocument();
  });
});

describe('checkout and login default documents', () => {
  it('render their feature pages', async () => {
    wrap(<RenderDoc doc={defaultDoc('checkout', 'webapp')!} docKey="checkout" layout="webapp" />);
    expect(await screen.findByText('checkout page')).toBeInTheDocument();
    cleanup();
    wrap(<RenderDoc doc={defaultDoc('login', 'storefront')!} docKey="login" layout="storefront" />);
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm --prefix web test -- test/builder-commerce.test.tsx`
Expected: FAIL — `defaultDoc('cart', 'storefront')` is `null`.

- [ ] **Step 4: Give `CartPage` a `foot` render prop**

In `web/src/features/cart/CartPage.tsx`: add `type ReactNode` to the react import, then:

```tsx
export interface CartPageProps {
  /** The page builder's CartContents block renders its `summary` slot here; omitted = v0.6.0's foot. */
  foot?: (ctx: { blocked: boolean; className: string }) => ReactNode;
}

export function CartPage({ foot }: CartPageProps) {
```

and replace the foot element with:

```tsx
      {foot ? (
        foot({ blocked, className: classes.foot })
      ) : (
        <div className={classes.foot}>
          <CartSummary blocked={blocked} />
        </div>
      )}
```

- [ ] **Step 5: Blocks and defaults**

```ts
// web/src/builder/blocks/_shared/cart-context.ts
import { createContext } from 'react';

/** Set by CartContents around its `summary` slot; null outside it. */
export const CartBlockedContext = createContext<boolean | null>(null);
```

```tsx
// web/src/builder/blocks/CartContents.tsx
import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import type { ComponentData } from '@/builder/types.ts';
import { CartBlockedContext } from '@/builder/blocks/_shared/cart-context.ts';

const CartPage = lazy(() => import('@/features/cart/CartPage.tsx').then((m) => ({ default: m.CartPage })));

/** The cart's lines (and empty state); its `summary` slot is the totals column. */
export const block = defineBlock<{ id: string; summary: ComponentData[] }>({
  name: 'CartContents', label: 'Cart lines', category: 'commerce', layouts: 'all', routeBound: true, slots: ['summary'],
  schema: z.object({ summary: slot() }), defaultProps: { summary: [] },
  render: ({ summary }) => (
    <CartPage
      foot={({ blocked, className }) => (
        <CartBlockedContext.Provider value={blocked}>{summary({ className })}</CartBlockedContext.Provider>
      )}
    />
  ),
});
```

```tsx
// web/src/builder/blocks/CartSummary.tsx
import { lazy, useContext } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { useServerCart } from '@/features/cart/useServerCart.ts';
import { CartBlockedContext } from '@/builder/blocks/_shared/cart-context.ts';

const CartSummary = lazy(() => import('@/features/cart/CartSummary.tsx').then((m) => ({ default: m.CartSummary })));

function CartSummaryView() {
  const fromContents = useContext(CartBlockedContext);
  const { issues } = useServerCart();
  const blocked = fromContents ?? issues.some((i) => i.inactive || i.belowMin || i.aboveMax);
  return <CartSummary blocked={blocked} />;
}

/** Subtotal and the way on to checkout. */
export const block = defineBlock<{ id: string }>({
  name: 'CartSummary', label: 'Cart summary', category: 'commerce', layouts: 'all', routeBound: true, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <CartSummaryView />,
});
```

```tsx
// web/src/builder/blocks/CheckoutFlow.tsx
import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const CheckoutPage = lazy(() => import('@/features/checkout/CheckoutPage.tsx').then((m) => ({ default: m.CheckoutPage })));

/** Contact → address → shipping → payment → review. Self-contained; not rearrangeable (spec non-goal). */
export const block = defineBlock<{ id: string }>({
  name: 'CheckoutFlow', label: 'Checkout', category: 'commerce', layouts: 'all', routeBound: true, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <CheckoutPage />,
});
```

```tsx
// web/src/builder/blocks/LoginOptions.tsx
import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const LoginPage = lazy(() => import('@/features/auth/LoginPage.tsx').then((m) => ({ default: m.LoginPage })));

/** The sign-in page body: heading, the ways in, the returnTo hand-off and the Telegram error state. */
export const block = defineBlock<{ id: string }>({
  name: 'LoginOptions', label: 'Sign-in options', category: 'commerce', layouts: 'all', routeBound: true, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <LoginPage />,
});
```

```ts
// web/src/builder/defaults/groups/commerce.ts
import { block, doc, type DefaultEntry } from '@/builder/defaults/helpers.ts';

export const DEFAULTS: DefaultEntry[] = [
  { docKey: 'cart', layouts: 'all', doc: doc([block('CartContents', { summary: [block('CartSummary')] })]) },
  { docKey: 'checkout', layouts: 'all', doc: doc([block('CheckoutFlow')]) },
  { docKey: 'login', layouts: 'all', doc: doc([block('LoginOptions')]) },
];
```

- [ ] **Step 6: Run to verify pass**

Run: `npm --prefix web test -- test/builder-commerce.test.tsx test/cart-line.test.tsx test/checkout-page.test.tsx && npm --prefix web run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/builder/blocks/_shared/cart-context.ts web/src/builder/blocks/CartContents.tsx web/src/builder/blocks/CartSummary.tsx web/src/builder/blocks/CheckoutFlow.tsx web/src/builder/blocks/LoginOptions.tsx web/src/builder/defaults/groups/commerce.ts web/src/features/cart/CartPage.tsx web/test/builder-commerce.test.tsx
git commit -m "feat(builder): cart, checkout and sign-in blocks with their default documents"
```

---

### Task 12: Account blocks

**Wave D.** Needs Task 7. Parallel with Tasks 8, 9, 10, 11.

**Files:**
- Create: `web/src/builder/blocks/AccountNav.tsx`, `OrdersList.tsx`, `OrderDetail.tsx`, `Loyalty.tsx`, `Referrals.tsx`, `Profile.tsx`
- Create: `web/src/builder/defaults/groups/account.ts` (after the blocks exist)
- Modify: `web/src/features/account/AccountLayout.tsx` (optional `children` instead of `<Outlet />`)
- Test: `web/test/builder-account.test.tsx`

**Interfaces:**
- Produces:
  - `AccountLayout({ children?: ReactNode })` — with no children it still renders `<Outlet />`.
  - Blocks: `AccountNav` · commerce · all · **false** (not a §5.3 required block, so owners may remove it; `rules.ts` `PLACEMENT` still keeps it on the five `account.*` routes) · slot `body` (the letterhead, the section rail, then the body inside the keyed fade); `OrdersList`, `OrderDetail`, `Loyalty`, `Referrals`, `Profile` · commerce · all · true.
  - Defaults: `account.<x>` → `[AccountNav{ body: [<Block>] }]`. The `AccountNav` id is `AccountNav-default` in all five, so switching tabs keeps the letterhead mounted exactly as v0.6.0's nested route did.

- [ ] **Step 1: Load the design skill**

Implementer: load the `frontend-design:frontend-design` skill before writing UI code.

- [ ] **Step 2: Write the failing test**

```tsx
// web/test/builder-account.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { Suspense, type ReactNode } from 'react';

vi.mock('@/features/account/queries.ts', () => ({
  useProfile: () => ({ data: undefined, isPending: true, isError: false }),
  useOrders: () => ({ data: undefined, isPending: true, isError: false }),
  useOrder: () => ({ data: undefined, isPending: true, isError: false }),
  useRedeemOptions: () => ({ data: undefined, isPending: true, isError: false }),
}));
vi.mock('@/features/account/OrdersPage.tsx', () => ({ OrdersPage: () => <p>orders page</p> }));
vi.mock('@/features/account/OrderDetailPage.tsx', () => ({ OrderDetailPage: () => <p>order detail page</p> }));
vi.mock('@/features/account/LoyaltyPage.tsx', () => ({ LoyaltyPage: () => <p>loyalty page</p> }));
vi.mock('@/features/account/ReferralsPage.tsx', () => ({ ReferralsPage: () => <p>referrals page</p> }));
vi.mock('@/features/account/ProfilePage.tsx', () => ({ ProfilePage: () => <p>profile page</p> }));

import { RenderDoc } from '@/builder/render.tsx';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { AccountLayout } from '@/features/account/AccountLayout.tsx';
import type { FixedRouteKey } from '@/builder/types.ts';

function mountAt(element: ReactNode, path = '/account/orders') {
  const router = createMemoryRouter([{ path: '/account', element, children: [{ path: '*', element: <p>body</p> }] }], { initialEntries: [path] });
  return render(<MantineProvider env="test"><Suspense fallback={null}><RouterProvider router={router} /></Suspense></MantineProvider>);
}
const normalize = (html: string) => html.replace(/(mantine-)[a-z0-9]{5,}/gi, '$1ID');

afterEach(cleanup);

describe('AccountNav', () => {
  it('wraps its body exactly where the v0.6.0 outlet was', () => {
    const legacy = normalize(mountAt(<AccountLayout />).container.innerHTML);
    cleanup();
    const withChildren = normalize(mountAt(<AccountLayout><p>body</p></AccountLayout>).container.innerHTML);
    expect(withChildren).toBe(legacy);
  });
  it.each<[FixedRouteKey, string]>([
    ['account.orders', 'orders page'], ['account.order', 'order detail page'], ['account.loyalty', 'loyalty page'],
    ['account.referrals', 'referrals page'], ['account.profile', 'profile page'],
  ])('%s default renders its page inside the account rail', async (key, text) => {
    const doc = defaultDoc(key, 'storefront')!;
    expect(doc.content[0]!.props.id).toBe('AccountNav-default');
    mountAt(<RenderDoc doc={doc} docKey={key} layout="storefront" />);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Account sections' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm --prefix web test -- test/builder-account.test.tsx`
Expected: the five default-document cases FAIL (`defaultDoc(...)` is `null`). The first test already passes — it pins that the `children` change in Step 4 is DOM-neutral, and must still pass after it.

- [ ] **Step 4: `AccountLayout` children**

In `web/src/features/account/AccountLayout.tsx`: `import type { ReactNode } from 'react';`, change the signature to `export function AccountLayout({ children }: { children?: ReactNode })` and replace `<Outlet />` with `{children ?? <Outlet />}`. Add to the doc comment: "The page builder's AccountNav block passes the section as `children`; a route that nests under it still uses the outlet."

- [ ] **Step 5: Blocks and defaults**

```tsx
// web/src/builder/blocks/AccountNav.tsx
import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import type { ComponentData } from '@/builder/types.ts';

const AccountLayout = lazy(() => import('@/features/account/AccountLayout.tsx').then((m) => ({ default: m.AccountLayout })));

/** The account letterhead and section rail; `body` is the section's own block. */
export const block = defineBlock<{ id: string; body: ComponentData[] }>({
  name: 'AccountNav', label: 'Account header', category: 'commerce', layouts: 'all', routeBound: false, slots: ['body'],
  schema: z.object({ body: slot() }), defaultProps: { body: [] },
  render: ({ body }) => <AccountLayout>{body()}</AccountLayout>,
});
```

Five near-identical page blocks — write each in full:

```tsx
// web/src/builder/blocks/OrdersList.tsx
import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const OrdersPage = lazy(() => import('@/features/account/OrdersPage.tsx').then((m) => ({ default: m.OrdersPage })));

export const block = defineBlock<{ id: string }>({
  name: 'OrdersList', label: 'Order history', category: 'commerce', layouts: 'all', routeBound: true, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <OrdersPage />,
});
```

```tsx
// web/src/builder/blocks/OrderDetail.tsx
import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const OrderDetailPage = lazy(() => import('@/features/account/OrderDetailPage.tsx').then((m) => ({ default: m.OrderDetailPage })));

export const block = defineBlock<{ id: string }>({
  name: 'OrderDetail', label: 'Order detail', category: 'commerce', layouts: 'all', routeBound: true, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <OrderDetailPage />,
});
```

```tsx
// web/src/builder/blocks/Loyalty.tsx
import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const LoyaltyPage = lazy(() => import('@/features/account/LoyaltyPage.tsx').then((m) => ({ default: m.LoyaltyPage })));

export const block = defineBlock<{ id: string }>({
  name: 'Loyalty', label: 'Loyalty points', category: 'commerce', layouts: 'all', routeBound: true, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <LoyaltyPage />,
});
```

```tsx
// web/src/builder/blocks/Referrals.tsx
import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const ReferralsPage = lazy(() => import('@/features/account/ReferralsPage.tsx').then((m) => ({ default: m.ReferralsPage })));

export const block = defineBlock<{ id: string }>({
  name: 'Referrals', label: 'Referrals', category: 'commerce', layouts: 'all', routeBound: true, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <ReferralsPage />,
});
```

```tsx
// web/src/builder/blocks/Profile.tsx
import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const ProfilePage = lazy(() => import('@/features/account/ProfilePage.tsx').then((m) => ({ default: m.ProfilePage })));

export const block = defineBlock<{ id: string }>({
  name: 'Profile', label: 'Profile', category: 'commerce', layouts: 'all', routeBound: true, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <ProfilePage />,
});
```

```ts
// web/src/builder/defaults/groups/account.ts
import { block, doc, type DefaultEntry } from '@/builder/defaults/helpers.ts';
import type { FixedRouteKey } from '@/builder/types.ts';

const section = (docKey: FixedRouteKey, type: string): DefaultEntry => ({
  docKey, layouts: 'all', doc: doc([block('AccountNav', { body: [block(type)] })]),
});

// v0.6.0's AccountLayout with each section in its outlet.
export const DEFAULTS: DefaultEntry[] = [
  section('account.orders', 'OrdersList'),
  section('account.order', 'OrderDetail'),
  section('account.loyalty', 'Loyalty'),
  section('account.referrals', 'Referrals'),
  section('account.profile', 'Profile'),
];
```

- [ ] **Step 6: Run to verify pass**

Run: `npm --prefix web test -- test/builder-account.test.tsx test/profile-telegram.test.tsx && npm --prefix web run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/builder/blocks/AccountNav.tsx web/src/builder/blocks/OrdersList.tsx web/src/builder/blocks/OrderDetail.tsx web/src/builder/blocks/Loyalty.tsx web/src/builder/blocks/Referrals.tsx web/src/builder/blocks/Profile.tsx web/src/builder/defaults/groups/account.ts web/src/features/account/AccountLayout.tsx web/test/builder-account.test.tsx
git commit -m "feat(builder): account blocks with their default documents"
```

---

### Task 13: Post-order blocks

**Wave D** (starts when any of Tasks 8–12 finishes, to stay within 5 concurrent). Needs Task 7.

**Files:**
- Create: `web/src/builder/blocks/OrderStatus.tsx`, `PaymentSuccess.tsx`, `PaymentCancel.tsx`, `OrderPlaced.tsx`, `VerifyForm.tsx`, `TrackingLookup.tsx`
- Create: `web/src/builder/defaults/groups/post-order.ts` (after the blocks exist)
- Test: `web/test/builder-post-order.test.tsx`

**Interfaces:**
- Produces: six blocks · post-order · all · true, no props; defaults: `order-status` → `[OrderStatus]` with root `chrome: 'none'` (PuckShell then renders the chromeless frame, reproducing v0.6.0's `Chromeless` route); `payment-success` → `[PaymentSuccess]`; `payment-cancel` → `[PaymentCancel]`; `order-placed` → `[OrderPlaced]`; `verify` → `[VerifyForm]`; `tracking` → `[TrackingLookup]` (covers `/tracking` and `/tracking/:reference`).

- [ ] **Step 1: Load the design skill**

Implementer: load the `frontend-design:frontend-design` skill before writing UI code.

- [ ] **Step 2: Write the failing test**

```tsx
// web/test/builder-post-order.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Suspense } from 'react';

vi.mock('@/features/order-status/OrderStatusPage.tsx', () => ({ OrderStatusPage: () => <p>order status page</p> }));
vi.mock('@/features/payment-redirect/PaymentSuccessPage.tsx', () => ({ PaymentSuccessPage: () => <p>payment success page</p> }));
vi.mock('@/features/payment-redirect/PaymentCancelPage.tsx', () => ({ PaymentCancelPage: () => <p>payment cancel page</p> }));
vi.mock('@/features/payment-redirect/OrderPlacedPage.tsx', () => ({ OrderPlacedPage: () => <p>order placed page</p> }));
vi.mock('@/features/verify/VerifyPage.tsx', () => ({ VerifyPage: () => <p>verify page</p> }));
vi.mock('@/features/tracking/TrackingPage.tsx', () => ({ TrackingPage: () => <p>tracking page</p> }));

import { RenderDoc } from '@/builder/render.tsx';
import { defaultDoc } from '@/builder/defaults/index.ts';
import type { FixedRouteKey } from '@/builder/types.ts';

afterEach(cleanup);

describe('post-order default documents', () => {
  it.each<[FixedRouteKey, string]>([
    ['order-status', 'order status page'], ['payment-success', 'payment success page'], ['payment-cancel', 'payment cancel page'],
    ['order-placed', 'order placed page'], ['verify', 'verify page'], ['tracking', 'tracking page'],
  ])('%s renders its page', async (key, text) => {
    render(<MemoryRouter><Suspense fallback={null}><RenderDoc doc={defaultDoc(key, 'menu')!} docKey={key} layout="menu" /></Suspense></MemoryRouter>);
    expect(await screen.findByText(text)).toBeInTheDocument();
  });
  it('the order-status page is chromeless, the others keep the shell', () => {
    expect(defaultDoc('order-status', 'storefront')!.root.props.chrome).toBe('none');
    expect(defaultDoc('tracking', 'storefront')!.root.props.chrome).toBe('shell');
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm --prefix web test -- test/builder-post-order.test.tsx`
Expected: FAIL — `defaultDoc('order-status', 'menu')` is `null`.

- [ ] **Step 4: Blocks — each in full**

```tsx
// web/src/builder/blocks/OrderStatus.tsx
import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const OrderStatusPage = lazy(() => import('@/features/order-status/OrderStatusPage.tsx').then((m) => ({ default: m.OrderStatusPage })));

/** The shared order link's page: status, payment, items, address, shipments. */
export const block = defineBlock<{ id: string }>({
  name: 'OrderStatus', label: 'Order status', category: 'post-order', layouts: 'all', routeBound: true, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <OrderStatusPage />,
});
```

```tsx
// web/src/builder/blocks/PaymentSuccess.tsx
import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const PaymentSuccessPage = lazy(() => import('@/features/payment-redirect/PaymentSuccessPage.tsx').then((m) => ({ default: m.PaymentSuccessPage })));

export const block = defineBlock<{ id: string }>({
  name: 'PaymentSuccess', label: 'Payment received', category: 'post-order', layouts: 'all', routeBound: true, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <PaymentSuccessPage />,
});
```

```tsx
// web/src/builder/blocks/PaymentCancel.tsx
import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const PaymentCancelPage = lazy(() => import('@/features/payment-redirect/PaymentCancelPage.tsx').then((m) => ({ default: m.PaymentCancelPage })));

export const block = defineBlock<{ id: string }>({
  name: 'PaymentCancel', label: 'Payment cancelled', category: 'post-order', layouts: 'all', routeBound: true, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <PaymentCancelPage />,
});
```

```tsx
// web/src/builder/blocks/OrderPlaced.tsx
import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const OrderPlacedPage = lazy(() => import('@/features/payment-redirect/OrderPlacedPage.tsx').then((m) => ({ default: m.OrderPlacedPage })));

export const block = defineBlock<{ id: string }>({
  name: 'OrderPlaced', label: 'Order placed', category: 'post-order', layouts: 'all', routeBound: true, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <OrderPlacedPage />,
});
```

```tsx
// web/src/builder/blocks/VerifyForm.tsx
import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const VerifyPage = lazy(() => import('@/features/verify/VerifyPage.tsx').then((m) => ({ default: m.VerifyPage })));

export const block = defineBlock<{ id: string }>({
  name: 'VerifyForm', label: 'Product verification', category: 'post-order', layouts: 'all', routeBound: true, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <VerifyPage />,
});
```

```tsx
// web/src/builder/blocks/TrackingLookup.tsx
import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const TrackingPage = lazy(() => import('@/features/tracking/TrackingPage.tsx').then((m) => ({ default: m.TrackingPage })));

/** The lookup form, or a tracked order when the URL carries a reference. */
export const block = defineBlock<{ id: string }>({
  name: 'TrackingLookup', label: 'Order tracking', category: 'post-order', layouts: 'all', routeBound: true, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <TrackingPage />,
});
```

```ts
// web/src/builder/defaults/groups/post-order.ts
import { block, doc, type DefaultEntry } from '@/builder/defaults/helpers.ts';

export const DEFAULTS: DefaultEntry[] = [
  // Reached from a chat link, not from browsing — no shop chrome (v0.6.0's Chromeless route).
  { docKey: 'order-status', layouts: 'all', doc: doc([block('OrderStatus')], { chrome: 'none' }) },
  { docKey: 'payment-success', layouts: 'all', doc: doc([block('PaymentSuccess')]) },
  { docKey: 'payment-cancel', layouts: 'all', doc: doc([block('PaymentCancel')]) },
  { docKey: 'order-placed', layouts: 'all', doc: doc([block('OrderPlaced')]) },
  { docKey: 'verify', layouts: 'all', doc: doc([block('VerifyForm')]) },
  { docKey: 'tracking', layouts: 'all', doc: doc([block('TrackingLookup')]) },
];
```

- [ ] **Step 5: Run to verify pass**

Run: `npm --prefix web test -- test/builder-post-order.test.tsx && npm --prefix web run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/builder/blocks/OrderStatus.tsx web/src/builder/blocks/PaymentSuccess.tsx web/src/builder/blocks/PaymentCancel.tsx web/src/builder/blocks/OrderPlaced.tsx web/src/builder/blocks/VerifyForm.tsx web/src/builder/blocks/TrackingLookup.tsx web/src/builder/defaults/groups/post-order.ts web/test/builder-post-order.test.tsx
git commit -m "feat(builder): post-order blocks with their default documents"
```

---
## Phase 3 — Switch the router, then the parity gate

### Task 14: Route every page through `PuckShell` / `PuckPage`

**Wave E.** Needs Tasks 3, 6, 8–13. Runs alone.

**Files:**
- Create: `web/src/app/routes.tsx` (the route table, exported for tests and for Plan 3's `/__builder` route)
- Modify: `web/src/app/router.tsx` (becomes `createBrowserRouter(routes)`), `web/src/app/App.tsx` (start the page-set fetch as soon as settings resolve)
- Test: `web/test/builder-defaults-complete.test.ts`, `web/test/builder-routes.test.tsx`

**Interfaces:**
- Consumes: `PuckShell`, `PuckPage`, `pagesKey`, `PAGES_QUERY`, `fetchPageSet`, `customPageKey`, `defaultDoc`, `validateDoc`, `checkRules`, `BLOCKS`.
- Produces: `routes: RouteObject[]` — a single `/` route whose element is `<PuckShell />`; **every child that renders a page carries `handle: { routeKey }`** (`'page'` for `/pages/:slug`); `/order/:ref/:accessKey` moves under it. `CustomPageRoute`, `ProductRoute`, `CartRoute` exported. Plan 3 prepends its `/__builder` route to `routes` (outside the shell).

- [ ] **Step 1: Load the design skill**

Implementer: load the `frontend-design:frontend-design` skill before writing UI code (routing decides what renders where).

- [ ] **Step 2: Write the failing tests**

```ts
// web/test/builder-defaults-complete.test.ts
import { describe, expect, it } from 'vitest';
import { BLOCKS } from '@/builder/registry.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { validateDoc } from '@/builder/guard.ts';
import { checkRules, countBlocks } from '@/builder/rules.ts';
import { FIXED_ROUTE_KEYS, isRecord, type ComponentData, type DocKey, type LayoutKind } from '@/builder/types.ts';

const LAYOUTS: LayoutKind[] = ['storefront', 'menu', 'webapp'];
const KEYS: DocKey[] = ['shell', ...FIXED_ROUTE_KEYS];
const ROUTE_BLOCKS = ['PageOutlet', 'ProductDetail', 'CartContents', 'CartSummary', 'CheckoutFlow', 'LoginOptions', 'OrdersList', 'OrderDetail',
  'Loyalty', 'Referrals', 'Profile', 'OrderStatus', 'PaymentSuccess', 'PaymentCancel', 'OrderPlaced', 'VerifyForm', 'TrackingLookup'];

function ids(items: ComponentData[], out: string[] = []): string[] {
  for (const c of items) {
    out.push(c.props.id);
    for (const s of BLOCKS[c.type]!.slots) ids(c.props[s] as ComponentData[], out);
  }
  return out;
}

/** The backend treats any {type, props} object inside an array as a component (Plan 1 contract). */
function looksLikeComponent(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(looksLikeComponent);
  if (!isRecord(value)) return false;
  if (typeof value.type === 'string' && isRecord(value.props)) return true;
  return Object.values(value).some(looksLikeComponent);
}

describe('default documents', () => {
  it.each(LAYOUTS)('%s: every route has one, it passes its own rules and survives the guard unchanged', (layout) => {
    for (const key of KEYS) {
      const doc = defaultDoc(key, layout);
      expect(doc, `${layout}/${key}`).not.toBeNull();
      expect(checkRules(doc!, key, layout), `${layout}/${key}`).toEqual([]);
      const guarded = validateDoc(structuredClone(doc), key, layout);
      expect(guarded.issues, `${layout}/${key}`).toEqual([]);
      expect(guarded.doc, `${layout}/${key}`).toEqual(doc);
      const all = ids(doc!.content);
      expect(new Set(all).size, `${layout}/${key} ids`).toBe(all.length);
    }
  });
  it('a shell never holds a MobileCartBar by default (the frame mounts it — v0.6.0 order)', () => {
    for (const layout of LAYOUTS) expect(countBlocks(defaultDoc('shell', layout)!).has('MobileCartBar')).toBe(false);
  });
});

describe('every block', () => {
  it('round-trips its default props through its schema', () => {
    for (const def of Object.values(BLOCKS)) {
      const parsed = def.schema.safeParse(def.defaultProps);
      expect(parsed.success, def.name).toBe(true);
      expect(parsed.data, def.name).toEqual(def.defaultProps);
    }
  });
  it('is routeBound exactly when it is a §5.3 route block, PageOutlet or ProductDetail', () => {
    const bound = Object.values(BLOCKS).filter((b) => b.routeBound).map((b) => b.name).sort();
    expect(bound).toEqual([...ROUTE_BLOCKS].sort());
  });
  it('never puts a {type, props} object in a non-slot prop', () => {
    for (const def of Object.values(BLOCKS)) {
      for (const [key, value] of Object.entries(def.defaultProps as Record<string, unknown>)) {
        if ((def.slots as readonly string[]).includes(key)) continue;
        expect(looksLikeComponent(value), `${def.name}.${key}`).toBe(false);
      }
    }
  });
  it('names richtext props *Html and keeps them strings', () => {
    for (const def of Object.values(BLOCKS)) {
      for (const [key, value] of Object.entries(def.defaultProps as Record<string, unknown>)) {
        if (key.endsWith('Html')) expect(typeof value, `${def.name}.${key}`).toBe('string');
      }
    }
  });
});
```

```tsx
// web/test/builder-routes.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import type { PageSet } from '@/builder/types.ts';

vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({ brand: { name: 'Northbound Supply', title: 'Northbound Supply' }, features: { layout: 'storefront' } }) }));
vi.mock('@/lib/telegram-webapp.ts', () => ({ isTelegramWebApp: () => false }));

import { CustomPageRoute, routes } from '@/app/routes.tsx';
import { PageSetOverrideProvider } from '@/builder/runtime.tsx';
import { FIXED_ROUTE_KEYS } from '@/builder/types.ts';

const SET: PageSet = {
  schemaVersion: 1,
  shell: { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [] },
  pages: { 'page:our-story': { root: { props: { title: 'Our story · Northbound Supply', description: '', chrome: 'shell' } }, content: [] } },
};

function mount(path: string) {
  const router = createMemoryRouter([
    { path: '/', element: <p>home</p> },
    { path: '/pages/:slug', handle: { routeKey: 'page' }, element: <CustomPageRoute /> },
  ], { initialEntries: [path] });
  render(<QueryClientProvider client={new QueryClient()}><PageSetOverrideProvider pageSet={SET}><RouterProvider router={router} /></PageSetOverrideProvider></QueryClientProvider>);
}

afterEach(() => { cleanup(); document.title = ''; });

describe('CustomPageRoute', () => {
  it('renders a published custom page with its title', async () => {
    mount('/pages/our-story');
    await waitFor(() => expect(document.title).toBe('Our story · Northbound Supply'));
    expect(screen.queryByText('home')).toBeNull();
  });
  it.each(['/pages/Our-Story', '/pages/missing', '/pages/a_b'])('%s goes home', async (path) => {
    mount(path);
    expect(await screen.findByText('home')).toBeInTheDocument();
  });
});

describe('route table', () => {
  function handles(list: RouteObject[], out: string[] = []): string[] {
    for (const r of list) {
      const key = (r.handle as { routeKey?: string } | undefined)?.routeKey;
      if (key) out.push(key);
      if (r.children) handles(r.children, out);
    }
    return out;
  }
  it('tags every fixed route and the custom-page route', () => {
    const tagged = new Set(handles(routes));
    for (const key of FIXED_ROUTE_KEYS) expect(tagged.has(key), key).toBe(true);
    expect(tagged.has('page')).toBe(true);
  });
  it('renders the shared order link under the shell route (PuckShell swaps in the chromeless frame)', () => {
    const shell = routes.find((r) => r.path === '/')!;
    expect(shell.children!.some((r) => r.path === 'order/:ref/:accessKey')).toBe(true);
    expect(routes.some((r) => r.path === '/order/:ref/:accessKey')).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm --prefix web test -- test/builder-defaults-complete.test.ts test/builder-routes.test.tsx`
Expected: `builder-routes` FAILS (`@/app/routes.tsx` does not exist). `builder-defaults-complete` should already PASS if Tasks 8–13 are complete — if it fails, that is a Wave-D bug: fix the named block/default before continuing.

- [ ] **Step 4: Create `routes.tsx`**

```tsx
// web/src/app/routes.tsx
import { useEffect } from 'react';
import { Navigate, Outlet, useParams, type RouteObject } from 'react-router';
import { useMediaQuery } from '@mantine/hooks';
import { useEffectiveLayout } from '@/app/layout.ts';
import { Guard } from '@/app/guards.tsx';
import { PuckPage, PuckShell } from '@/builder/runtime.tsx';
import { customPageKey, type FixedRouteKey } from '@/builder/types.ts';
import { useUiStore } from '@/stores/ui.ts';

/** Mantine's `md` breakpoint — the point at which the cart becomes a drawer instead of a page. */
const DESKTOP = '(min-width: 62em)';

/** In the list layouts (menu, web app) a product opens as a bottom sheet over the list, so /p/:id becomes /?p=id. */
export function ProductRoute() {
  const layout = useEffectiveLayout();
  const { id } = useParams();
  if (layout !== 'storefront') return <Navigate to={`/?p=${encodeURIComponent(id ?? '')}`} replace />;
  return <PuckPage routeKey="product" />;
}

/**
 * The cart is a page on a phone and a drawer on a desktop — /cart hands off to the
 * drawer there. The web app has no drawer at any width: it is phone-first, and its
 * primary action goes to this page.
 */
export function CartRoute() {
  const layout = useEffectiveLayout();
  // Resolve the match synchronously: with the default deferred read the first render
  // is always `false`, so a desktop visitor sees the cart page flash before the redirect.
  const desktop = useMediaQuery(DESKTOP, false, { getInitialValueInEffect: false });
  const drawer = desktop && layout !== 'webapp';
  const openPanel = useUiStore((s) => s.open);
  useEffect(() => {
    if (drawer) openPanel('cartOpen');
  }, [drawer, openPanel]);
  if (drawer) return <Navigate to="/" replace />;
  return <PuckPage routeKey="cart" />;
}

/** `/pages/<slug>`: an owner's page if the published set has it; anything else goes home, like the catch-all. */
export function CustomPageRoute() {
  const { slug } = useParams();
  const key = customPageKey(slug);
  return key ? <PuckPage routeKey={key} /> : <Navigate to="/" replace />;
}

const page = (routeKey: FixedRouteKey) => ({ handle: { routeKey }, element: <PuckPage routeKey={routeKey} /> });

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <PuckShell />,
    children: [
      { index: true, ...page('catalog') },
      { path: 'c/:categorySlug', ...page('catalog') },
      { path: 'p/:id', handle: { routeKey: 'product' }, element: <ProductRoute /> },
      {
        path: 'cart',
        handle: { routeKey: 'cart' },
        element: (
          <Guard spec={{ feature: 'ordering' }}>
            <CartRoute />
          </Guard>
        ),
      },
      {
        path: 'checkout',
        handle: { routeKey: 'checkout' },
        element: (
          <Guard spec={{ feature: 'ordering', sessionOrGuest: true }}>
            <PuckPage routeKey="checkout" />
          </Guard>
        ),
      },
      {
        path: 'login',
        handle: { routeKey: 'login' },
        element: (
          <Guard spec={{ feature: 'accounts' }}>
            <PuckPage routeKey="login" />
          </Guard>
        ),
      },
      {
        path: 'account',
        element: (
          <Guard spec={{ session: true }}>
            <Outlet />
          </Guard>
        ),
        children: [
          { index: true, element: <Navigate to="/account/orders" replace /> },
          { path: 'orders', ...page('account.orders') },
          { path: 'orders/:ref', ...page('account.order') },
          { path: 'loyalty', ...page('account.loyalty') },
          { path: 'referrals', ...page('account.referrals') },
          { path: 'profile', ...page('account.profile') },
        ],
      },
      // Reached from a chat link: its default document says chrome: 'none', so PuckShell
      // renders v0.6.0's Chromeless frame around it.
      { path: 'order/:ref/:accessKey', ...page('order-status') },
      { path: 'payment/success', ...page('payment-success') },
      { path: 'payment/cancel', ...page('payment-cancel') },
      { path: 'order-placed', ...page('order-placed') },
      {
        path: 'verify',
        handle: { routeKey: 'verify' },
        element: (
          <Guard spec={{ feature: 'verify' }}>
            <PuckPage routeKey="verify" />
          </Guard>
        ),
      },
      {
        path: 'tracking',
        handle: { routeKey: 'tracking' },
        element: (
          <Guard spec={{ feature: 'tracking' }}>
            <PuckPage routeKey="tracking" />
          </Guard>
        ),
      },
      {
        path: 'tracking/:reference',
        handle: { routeKey: 'tracking' },
        element: (
          <Guard spec={{ feature: 'tracking' }}>
            <PuckPage routeKey="tracking" />
          </Guard>
        ),
      },
      { path: 'pages/:slug', handle: { routeKey: 'page' }, element: <CustomPageRoute /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];
```

- [ ] **Step 5: Replace `router.tsx`**

```tsx
// web/src/app/router.tsx
import { createBrowserRouter } from 'react-router';
import { routes } from '@/app/routes.tsx';

/** Every page is a page-builder document (spec §5.1); the table lives in routes.tsx. */
export const router = createBrowserRouter(routes);
```

(The per-page `lazy()` imports that lived here now live inside the blocks — `CatalogPage.tsx` stays in the tree, unused by routing, because `test/core-options-views.test.tsx` and friends import the bodies it chose between.)

- [ ] **Step 6: Start the page-set fetch with the theme, not after it**

In `web/src/app/App.tsx`, add imports:

```tsx
import { useQueryClient } from '@tanstack/react-query';   // merge into the existing react-query import
import { effectiveLayout } from '@/app/layout.ts';
import { isTelegramWebApp } from '@/lib/telegram-webapp.ts';
import { fetchPageSet } from '@/api/pages.ts';
import { PAGES_QUERY, pagesKey } from '@/builder/runtime.tsx';
```

and in `ThemedApp`, before the `return`:

```tsx
  // The page set rides alongside the template chunk: the layout is only known once settings
  // are in, and TemplateProvider may still be holding the router back on its fallback.
  const client = useQueryClient();
  const layout = effectiveLayout(settings.features?.layout, isTelegramWebApp());
  useEffect(() => {
    void client.prefetchQuery({ queryKey: pagesKey(layout), queryFn: () => fetchPageSet(layout), staleTime: PAGES_QUERY.staleTime });
  }, [client, layout]);
```

- [ ] **Step 7: Run the unit suite**

Run: `npm --prefix web test && npm --prefix web run typecheck`
Expected: every web test PASSES (≈ 973 existing + the builder tests) with no existing test edited.

- [ ] **Step 8: Commit**

```bash
git add web/src/app/routes.tsx web/src/app/router.tsx web/src/app/App.tsx web/test/builder-defaults-complete.test.ts web/test/builder-routes.test.tsx
git commit -m "feat(builder): route every page through PuckShell/PuckPage; custom pages at /pages/:slug"
```

---

### Task 15: PARITY GATE — the whole existing suite, unchanged

**Wave E.** Needs Task 14. Nothing in Phase 4 may start until this task's commit exists.

**Files:**
- Modify: only what a failure proves wrong in `web/src/builder/**`, `web/src/layouts/**` or `web/src/app/routes.tsx`. Existing tests and snapshots are not edited, except a selector update proven necessary by a wrapper (spec §2.1), justified line by line in the commit message.

**Interfaces:**
- Consumes: everything above. Produces: a green baseline that Phase 4 builds on.

- [ ] **Step 1: Load the design skill**

Implementer: load the `frontend-design:frontend-design` skill before touching any UI file while fixing a failure.

- [ ] **Step 2: Unit, worker and script suites**

Run: `npm test`
Expected: web Vitest, worker Vitest and `node --test scripts/*.test.mjs` all PASS.

- [ ] **Step 3: Typecheck and production build**

Run: `npm run typecheck && npm run build`
Expected: exit 0. In the build output, the lazy page chunks still exist as separate files (`CheckoutPage-*.js`, `ProductDetailPage-*.js`, `OrderStatusPage-*.js`, …) — route-level code splitting is intact.

- [ ] **Step 4: The DOM parity baseline**

Run: `npx playwright test -c e2e/playwright.config.ts e2e/dom-parity.spec.ts`
Expected: all PASS against the v0.6.0 snapshots from Task 1. For any failure: read the diff Playwright prints, find the block/default doc/frame that produced the extra or missing node, fix it, re-run. Use `superpowers:systematic-debugging`; never re-baseline to make it pass.

- [ ] **Step 5: The whole e2e suite, including the template matrix and the pixel baseline**

Run: `npm run test:e2e`
Expected: every spec PASSES unchanged — `storefront.spec.ts`, `telegram-webapp.spec.ts`, `templates.spec.ts` (template × preset × layout × viewport), `templates-baseline*.spec.ts` (committed pixels), `templates-decor.spec.ts`, `core-options.spec.ts`, `quantity-limits.spec.ts`, `wholesale-row.spec.ts`, `template-previews.spec.ts`, `mocks-policy.spec.ts`, `dom-parity.spec.ts`.

- [ ] **Step 6: Confirm the page-set request is harmless**

Run: `npx playwright test -c e2e/playwright.config.ts e2e/storefront.spec.ts -g "1 ·"` and check (temporarily, via `console.log(mocks.requests())` in a scratch copy — do not commit) that `GET storefront/pages/<layout>` appears once per page load and that the mocks answered it with `null` (not the `Unmocked route` 404).

- [ ] **Step 7: Commit the gate**

If nothing needed fixing:

```bash
git commit --allow-empty -m "test: page-builder parity gate — unit, worker, scripts, dom-parity, e2e and pixel baselines all green with no published set"
```

Otherwise commit the fixes with a message that lists each failure and its cause, and — only if a test selector had to change — the exact wrapper that forced it.

---
## Phase 4 — Content blocks (only after the Task 15 commit exists)

Every block in this phase: `layouts: 'all'`, `routeBound: false`, `category: 'content'` — except `FeaturedProducts` (`'catalogue'`, as spec §7 lists it) and `NavLinks` (`'shell'`); its root element carries `data-sf-block="<Name>"` (e2e and template CSS hook); colours only via `var(--sf-*)`/`tokenVar()`; spacing only from `SPACING`; interactive elements ≥ 44×44; `min-width: 0` on grid/flex children so nothing overflows 360 px; transitions wrapped for `prefers-reduced-motion`. All five Wave-F tasks share the test harness below — each task writes its own copy into its own test file (no shared test helper file, so the tasks stay disjoint).

```tsx
// Harness used at the top of each content-block test file.
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { Suspense } from 'react';
import { render } from '@testing-library/react';
import { RenderDoc } from '@/builder/render.tsx';
import { BuilderModeProvider } from '@/builder/mode.ts';
import type { ComponentData } from '@/builder/types.ts';

const c = (type: string, props: Record<string, unknown> = {}, id = type): ComponentData => ({ type, props: { id, ...props } });
function mount(content: ComponentData[], editing = false) {
  return render(
    <MantineProvider env="test">
      <MemoryRouter>
        <BuilderModeProvider value={{ editing, previewAs: null }}>
          <Suspense fallback={null}>
            <RenderDoc doc={{ root: { props: { title: '', description: '', chrome: 'shell' } }, content }} docKey="page:test" layout="storefront" />
          </Suspense>
        </BuilderModeProvider>
      </MemoryRouter>
    </MantineProvider>,
  );
}
```

Blocks are stored after the guard, so tests pass complete props (the guard fills defaults for stored docs; `RenderDoc` itself does not).

### Task 16: Heading, RichText, Spacer, Divider

**Wave F.** Needs Task 15. Parallel with Tasks 17–20.

**Files:**
- Create: `web/src/builder/blocks/Heading.tsx`, `Heading.module.css`, `RichText.tsx`, `RichText.module.css`, `Spacer.tsx`, `Divider.tsx`, `Divider.module.css`
- Test: `web/test/builder-content-text.test.tsx`

**Interfaces:**
- Consumes: `RichHtml` (`_shared/RichHtml.tsx`, Task 7), `SPACING`, `spacing()`, `richtext()`.
- Produces: `Heading` {`text` ≤ 200 (min 1), `eyebrow` ≤ 60, `level: 'h2'|'h3'|'h4'`, `align: 'start'|'center'`}; `RichText` {`bodyHtml`, `width: 'narrow'|'full'`}; `Spacer` {`size: SpacingKey`}; `Divider` {`spacing: SpacingKey`, `tone: 'line'|'line-strong'`}.

- [ ] **Step 1: Load the design skill**

Implementer: load the `frontend-design:frontend-design` skill before writing UI code. The content blocks must read as part of whichever template is active: they inherit `--sf-font-heading`, `--sf-heading-*`, `--sf-card-*` tokens rather than inventing a look.

- [ ] **Step 2: Write the failing test** (harness above, then)

```tsx
// web/test/builder-content-text.test.tsx  (after the harness)
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';

afterEach(cleanup);

describe('text blocks', () => {
  it('Heading renders its level, eyebrow and alignment', () => {
    const { container } = mount([c('Heading', { text: 'Small batches', eyebrow: 'Since 2019', level: 'h3', align: 'center' })]);
    expect(screen.getByRole('heading', { level: 3, name: 'Small batches' })).toBeInTheDocument();
    expect(screen.getByText('Since 2019')).toBeInTheDocument();
    expect(container.querySelector('[data-sf-block="Heading"]')!.className).toMatch(/center/);
  });
  it('RichText sanitises its HTML', () => {
    const { container } = mount([c('RichText', { bodyHtml: '<p>Packed <strong>to order</strong><script>x()</script></p><a href="javascript:x">bad</a>', width: 'narrow' })]);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('strong')!.textContent).toBe('to order');
    expect(container.querySelector('a')!.hasAttribute('href')).toBe(false);
    expect(container.querySelector('[data-sf-prose]')).not.toBeNull();
  });
  it('RichText accepts a React node inside the editor', () => {
    mount([c('RichText', { bodyHtml: <em>live edit</em>, width: 'full' })], true);
    expect(screen.getByText('live edit')).toBeInTheDocument();
  });
  it('Spacer and Divider use the spacing scale', () => {
    const { container } = mount([c('Spacer', { size: 'lg' }), c('Divider', { spacing: 'sm', tone: 'line-strong' })]);
    expect((container.querySelector('[data-sf-block="Spacer"]') as HTMLElement).style.height).toBe('2.5rem');
    const hr = container.querySelector('hr') as HTMLElement;
    expect(hr.style.getPropertyValue('--rule-space')).toBe('1rem');
    expect(hr.style.getPropertyValue('--rule-color')).toBe('var(--sf-line-strong)');
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm --prefix web test -- test/builder-content-text.test.tsx`
Expected: FAIL — no heading rendered (blocks not registered).

- [ ] **Step 4: Implement**

```tsx
// web/src/builder/blocks/Heading.tsx
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import classes from '@/builder/blocks/Heading.module.css';

type Props = { id: string; text: string; eyebrow: string; level: 'h2' | 'h3' | 'h4'; align: 'start' | 'center' };

export const block = defineBlock<Props>({
  name: 'Heading', label: 'Heading', category: 'content', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({ text: z.string().min(1).max(200), eyebrow: z.string().max(60), level: z.enum(['h2', 'h3', 'h4']), align: z.enum(['start', 'center']) }),
  defaultProps: { text: 'A heading', eyebrow: '', level: 'h2', align: 'start' },
  render: ({ text, eyebrow, level, align }) => {
    const Tag = level;
    return (
      <div className={align === 'center' ? `${classes.root} ${classes.center}` : classes.root} data-sf-block="Heading">
        {eyebrow ? <p className={classes.eyebrow}>{eyebrow}</p> : null}
        <Tag className={classes[level]}>{text}</Tag>
      </div>
    );
  },
});
```

```css
/* web/src/builder/blocks/Heading.module.css */
/* Headings speak in the template's heading voice (family, weight, tracking, case). */
.root {
  padding-block: 0.75rem 0.25rem;
  min-width: 0;
}

.center {
  text-align: center;
}

.eyebrow {
  margin: 0 0 0.5rem;
  font-family: var(--sf-font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--sf-faint);
}

.h2,
.h3,
.h4 {
  margin: 0;
  font-family: var(--sf-font-heading);
  font-weight: var(--sf-heading-weight);
  letter-spacing: var(--sf-heading-tracking);
  text-transform: var(--sf-heading-transform);
  color: var(--sf-text);
  overflow-wrap: anywhere;
  text-wrap: balance;
}

.h2 { font-size: clamp(1.5rem, 1.2rem + 1.4vw, 2.25rem); line-height: 1.12; }
.h3 { font-size: clamp(1.2rem, 1.05rem + 0.7vw, 1.6rem); line-height: 1.2; }
.h4 { font-size: 1.05rem; line-height: 1.3; }
```

```tsx
// web/src/builder/blocks/RichText.tsx
import { z } from 'zod';
import { defineBlock, richtext } from '@/builder/define.ts';
import { RichHtml } from '@/builder/blocks/_shared/RichHtml.tsx';
import classes from '@/builder/blocks/RichText.module.css';

type Props = { id: string; bodyHtml: string; width: 'narrow' | 'full' };

export const block = defineBlock<Props>({
  name: 'RichText', label: 'Text', category: 'content', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({ bodyHtml: richtext(), width: z.enum(['narrow', 'full']) }),
  defaultProps: { bodyHtml: '<p>Tell shoppers something worth knowing.</p>', width: 'narrow' },
  render: ({ bodyHtml, width }) => (
    <RichHtml value={bodyHtml} block="RichText" className={width === 'narrow' ? `${classes.prose} ${classes.narrow}` : classes.prose} />
  ),
});
```

```css
/* web/src/builder/blocks/RichText.module.css */
.prose {
  min-width: 0;
  padding-block: 0.5rem;
  color: var(--sf-muted);
  font-size: 0.9375rem;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.narrow {
  max-width: 68ch;
}

.prose :where(p, ul, ol, blockquote) {
  margin: 0 0 1em;
}

.prose :where(h2, h3, h4) {
  margin: 1.4em 0 0.5em;
  font-family: var(--sf-font-heading);
  font-weight: var(--sf-heading-weight);
  letter-spacing: var(--sf-heading-tracking);
  text-transform: var(--sf-heading-transform);
  color: var(--sf-text);
  line-height: 1.25;
}

.prose :where(strong) {
  color: var(--sf-text);
}

.prose :where(a) {
  color: var(--sf-primary);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.prose :where(a):focus-visible {
  outline: 2px solid var(--sf-primary);
  outline-offset: 2px;
}

.prose :where(blockquote) {
  padding-inline-start: 1rem;
  border-inline-start: 2px solid var(--sf-line-strong);
}

.prose :where(code) {
  font-family: var(--sf-font-mono);
  font-size: 0.875em;
  padding: 0.1em 0.3em;
  background: var(--sf-surface);
  border-radius: 2px;
}

.prose > :last-child {
  margin-bottom: 0;
}
```

```tsx
// web/src/builder/blocks/Spacer.tsx
import { z } from 'zod';
import { defineBlock, spacing, SPACING, type SpacingKey } from '@/builder/define.ts';

export const block = defineBlock<{ id: string; size: SpacingKey }>({
  name: 'Spacer', label: 'Spacer', category: 'content', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({ size: spacing() }), defaultProps: { size: 'md' },
  render: ({ size }) => <div aria-hidden data-sf-block="Spacer" style={{ height: SPACING[size] }} />,
});
```

```tsx
// web/src/builder/blocks/Divider.tsx
import type { CSSProperties } from 'react';
import { z } from 'zod';
import { defineBlock, spacing, SPACING, tokenVar, type SpacingKey } from '@/builder/define.ts';
import classes from '@/builder/blocks/Divider.module.css';

type Props = { id: string; spacing: SpacingKey; tone: 'line' | 'line-strong' };

export const block = defineBlock<Props>({
  name: 'Divider', label: 'Divider', category: 'content', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({ spacing: spacing(), tone: z.enum(['line', 'line-strong']) }),
  defaultProps: { spacing: 'md', tone: 'line' },
  render: ({ spacing: space, tone }) => (
    <hr className={classes.rule} data-sf-block="Divider" style={{ '--rule-space': SPACING[space], '--rule-color': tokenVar(tone) } as CSSProperties} />
  ),
});
```

```css
/* web/src/builder/blocks/Divider.module.css */
/* Dynamic values arrive as custom properties so the rule itself stays in the module. */
.rule {
  border: 0;
  border-top: 1px solid var(--rule-color, var(--sf-line));
  margin: var(--rule-space, 1.5rem) 0;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm --prefix web test -- test/builder-content-text.test.tsx test/builder-defaults-complete.test.ts && npm --prefix web run typecheck`
Expected: PASS (the completeness test now also covers these four blocks' schemas).

- [ ] **Step 6: Commit**

```bash
git add web/src/builder/blocks/Heading.tsx web/src/builder/blocks/Heading.module.css web/src/builder/blocks/RichText.tsx web/src/builder/blocks/RichText.module.css web/src/builder/blocks/Spacer.tsx web/src/builder/blocks/Divider.tsx web/src/builder/blocks/Divider.module.css web/test/builder-content-text.test.tsx
git commit -m "feat(builder): Heading, RichText, Spacer and Divider content blocks"
```

---

### Task 17: Button, Image, Video

**Wave F.** Needs Task 15. Parallel with Tasks 16, 18–20.

**Files:**
- Create: `web/src/builder/blocks/Button.tsx`, `Button.module.css`, `Image.tsx`, `Image.module.css`, `Video.tsx`, `Video.module.css`
- Test: `web/test/builder-content-media.test.tsx`

**Interfaces:**
- Consumes: `SmartLink` (Task 7), `routeLink()`, `mediaSrc()`, `useBuilderMode`.
- Produces: `Button` {`label` 1–60, `href` (routeLink, default `/`), `variant: 'filled'|'default'|'subtle'`, `align: 'start'|'center'|'stretch'`} — carries `data-sf-part="button"` so template button CSS applies; `Image` {`src` (uploaded media or `''`), `alt` ≤ 300, `caption` ≤ 300, `width: 'narrow'|'rail'|'full'`, `aspect: 'auto'|'1/1'|'4/3'|'16/9'`} — renders nothing (a hint in the editor) until both `src` and `alt` are set; `Video` {`provider: 'youtube'|'vimeo'`, `videoId`, `title` ≤ 120} — `youtube-nocookie.com` / `player.vimeo.com` iframe, lazy, 16:9; invalid id ⇒ nothing.

- [ ] **Step 1: Load the design skill**

Implementer: load the `frontend-design:frontend-design` skill before writing UI code.

- [ ] **Step 2: Write the failing test** (harness, then)

```tsx
// web/test/builder-content-media.test.tsx  (after the harness)
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';

const KEY = '/media/storefront-pages/media/' + '0123456789abcdef'.repeat(2) + '.webp';
afterEach(cleanup);

describe('Button', () => {
  it('links internally through the router and carries the template button hook', () => {
    mount([c('Button', { label: 'Shop now', href: '/c/pantry', variant: 'filled', align: 'start' })]);
    const link = screen.getByRole('link', { name: 'Shop now' });
    expect(link).toHaveAttribute('href', '/c/pantry');
    expect(link).toHaveAttribute('data-sf-part', 'button');
    expect(link).toHaveAttribute('data-variant', 'filled');
  });
  it('opens external https links with rel noopener', () => {
    mount([c('Button', { label: 'Wholesale form', href: 'https://shop.example/trade', variant: 'default', align: 'center' })]);
    expect(screen.getByRole('link', { name: 'Wholesale form' })).toHaveAttribute('rel', 'noopener noreferrer');
  });
  it('renders nothing without a link', () => {
    const { container } = mount([c('Button', { label: 'Nowhere', href: '', variant: 'filled', align: 'start' })]);
    expect(container.querySelector('a')).toBeNull();
  });
});

describe('Image', () => {
  it('renders an uploaded image with its alt text, lazily', () => {
    mount([c('Image', { src: KEY, alt: 'Oats in a jar', caption: 'Our oats', width: 'rail', aspect: '4/3' })]);
    const img = screen.getByRole('img', { name: 'Oats in a jar' });
    expect(img).toHaveAttribute('src', KEY);
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(screen.getByText('Our oats')).toBeInTheDocument();
  });
  it('without alt text shows nothing to shoppers and a hint in the editor', () => {
    const shopper = mount([c('Image', { src: KEY, alt: ' ', caption: '', width: 'rail', aspect: 'auto' })]);
    expect(shopper.container.querySelector('img')).toBeNull();
    cleanup();
    mount([c('Image', { src: '', alt: '', caption: '', width: 'rail', aspect: 'auto' })], true);
    expect(screen.getByText('Upload an image and describe it for screen readers.')).toBeInTheDocument();
  });
});

describe('Video', () => {
  it('embeds YouTube via youtube-nocookie, lazily', () => {
    const { container } = mount([c('Video', { provider: 'youtube', videoId: 'aB3_dE-fG9h', title: 'How we pack' })]);
    const frame = container.querySelector('iframe')!;
    expect(frame.src).toBe('https://www.youtube-nocookie.com/embed/aB3_dE-fG9h');
    expect(frame.getAttribute('loading')).toBe('lazy');
    expect(frame.title).toBe('How we pack');
  });
  it('embeds Vimeo with do-not-track', () => {
    const { container } = mount([c('Video', { provider: 'vimeo', videoId: '76979871', title: 'Tour' })]);
    expect(container.querySelector('iframe')!.src).toBe('https://player.vimeo.com/video/76979871?dnt=1');
  });
  it('refuses an id that is not an id', () => {
    const { container } = mount([c('Video', { provider: 'youtube', videoId: 'x"><script>', title: 'Bad' })]);
    expect(container.querySelector('iframe')).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm --prefix web test -- test/builder-content-media.test.tsx`
Expected: FAIL — no link/img/iframe rendered.

- [ ] **Step 4: Implement**

```tsx
// web/src/builder/blocks/Button.tsx
import { Button } from '@mantine/core';
import { Link } from 'react-router';
import { z } from 'zod';
import { defineBlock, routeLink } from '@/builder/define.ts';
import classes from '@/builder/blocks/Button.module.css';

type Props = { id: string; label: string; href: string; variant: 'filled' | 'default' | 'subtle'; align: 'start' | 'center' | 'stretch' };

function ButtonView({ label, href, variant, align }: Omit<Props, 'id'>) {
  if (!href) return null;
  const shared = { variant, size: 'md' as const, fullWidth: align === 'stretch', className: classes.button, 'data-sf-part': 'button' };
  return (
    <div className={classes[align]} data-sf-block="Button">
      {href.startsWith('/') ? (
        <Button component={Link} to={href} {...shared}>{label}</Button>
      ) : (
        <Button component="a" href={href} rel={/^https:/i.test(href) ? 'noopener noreferrer' : undefined} {...shared}>{label}</Button>
      )}
    </div>
  );
}

export const block = defineBlock<Props>({
  name: 'Button', label: 'Button', category: 'content', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({ label: z.string().min(1).max(60), href: routeLink(), variant: z.enum(['filled', 'default', 'subtle']), align: z.enum(['start', 'center', 'stretch']) }),
  defaultProps: { label: 'Shop now', href: '/', variant: 'filled', align: 'start' },
  render: ({ label, href, variant, align }) => <ButtonView label={label} href={href} variant={variant} align={align} />,
});
```

```css
/* web/src/builder/blocks/Button.module.css */
.start,
.center,
.stretch {
  display: flex;
  padding-block: 0.5rem;
  min-width: 0;
}
.center { justify-content: center; }

/* Mantine's md button is 42px — a thumb needs 44. */
.button {
  min-height: 44px;
  max-width: 100%;
}
```

```tsx
// web/src/builder/blocks/Image.tsx
import { z } from 'zod';
import { defineBlock, mediaSrc } from '@/builder/define.ts';
import { useBuilderMode } from '@/builder/mode.ts';
import classes from '@/builder/blocks/Image.module.css';

type Aspect = 'auto' | '1/1' | '4/3' | '16/9';
type Props = { id: string; src: string; alt: string; caption: string; width: 'narrow' | 'rail' | 'full'; aspect: Aspect };

function ImageView({ src, alt, caption, width, aspect }: Omit<Props, 'id'>) {
  const { editing } = useBuilderMode();
  if (!src || !alt.trim()) {
    return editing ? <p className={classes.hint} data-sf-block="Image">Upload an image and describe it for screen readers.</p> : null;
  }
  return (
    <figure className={`${classes.figure} ${classes[width]}`} data-sf-block="Image">
      <img className={classes.img} src={src} alt={alt} loading="lazy" decoding="async" style={aspect === 'auto' ? undefined : { aspectRatio: aspect }} />
      {caption ? <figcaption className={classes.caption}>{caption}</figcaption> : null}
    </figure>
  );
}

/** Uploaded images only (spec §13 A3); alt text is required before it shows. */
export const block = defineBlock<Props>({
  name: 'Image', label: 'Image', category: 'content', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({ src: mediaSrc(), alt: z.string().max(300), caption: z.string().max(300), width: z.enum(['narrow', 'rail', 'full']), aspect: z.enum(['auto', '1/1', '4/3', '16/9']) }),
  defaultProps: { src: '', alt: '', caption: '', width: 'rail', aspect: 'auto' },
  render: ({ src, alt, caption, width, aspect }) => <ImageView src={src} alt={alt} caption={caption} width={width} aspect={aspect} />,
});
```

```css
/* web/src/builder/blocks/Image.module.css */
.figure {
  margin: 0;
  padding-block: 0.5rem;
  min-width: 0;
}
.narrow { max-width: 36rem; }
.rail { max-width: 100%; }
/* Full bleed escapes the content column's own inset (published by every shell). */
.full { margin-inline: calc(-1 * var(--sf-main-pad, 1rem)); }

.img {
  display: block;
  width: 100%;
  height: auto;
  object-fit: cover;
  border-radius: var(--sf-card-radius);
  background: var(--sf-surface);
}
.full .img { border-radius: 0; }

.caption {
  margin-top: 0.5rem;
  font-size: 0.8125rem;
  color: var(--sf-faint);
}

.hint {
  margin: 0;
  padding: 1rem;
  border: 1px dashed var(--sf-line-strong);
  border-radius: var(--sf-card-radius);
  color: var(--sf-muted);
  font-size: 0.875rem;
}
```

```tsx
// web/src/builder/blocks/Video.tsx
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import classes from '@/builder/blocks/Video.module.css';

type Props = { id: string; provider: 'youtube' | 'vimeo'; videoId: string; title: string };

const ID = { youtube: /^[A-Za-z0-9_-]{11}$/, vimeo: /^\d{6,12}$/ } as const;

export function embedUrl(provider: Props['provider'], videoId: string): string | null {
  if (!ID[provider].test(videoId)) return null;
  return provider === 'youtube' ? `https://www.youtube-nocookie.com/embed/${videoId}` : `https://player.vimeo.com/video/${videoId}?dnt=1`;
}

/** An id, never a URL: the embed host is fixed here, so an owner can't point an iframe anywhere else. */
export const block = defineBlock<Props>({
  name: 'Video', label: 'Video', category: 'content', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({ provider: z.enum(['youtube', 'vimeo']), videoId: z.string().max(20), title: z.string().min(1).max(120) }),
  defaultProps: { provider: 'youtube', videoId: '', title: 'Video' },
  render: ({ provider, videoId, title }) => {
    const src = embedUrl(provider, videoId);
    if (!src) return null;
    return (
      <div className={classes.frame} data-sf-block="Video">
        <iframe
          className={classes.player}
          src={src}
          title={title}
          loading="lazy"
          allow="encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        />
      </div>
    );
  },
});
```

```css
/* web/src/builder/blocks/Video.module.css */
.frame {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  margin-block: 0.5rem;
  border-radius: var(--sf-card-radius);
  overflow: hidden;
  background: var(--sf-bg-deep);
}

.player {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm --prefix web test -- test/builder-content-media.test.tsx test/builder-defaults-complete.test.ts && npm --prefix web run typecheck`
Expected: PASS. (`Video.tsx` exports `embedUrl` besides `block` — `collectBlocks` only reads `block`, so the extra export is fine.)

- [ ] **Step 6: Commit**

```bash
git add web/src/builder/blocks/Button.tsx web/src/builder/blocks/Button.module.css web/src/builder/blocks/Image.tsx web/src/builder/blocks/Image.module.css web/src/builder/blocks/Video.tsx web/src/builder/blocks/Video.module.css web/test/builder-content-media.test.tsx
git commit -m "feat(builder): Button, Image and Video content blocks"
```

---

### Task 18: Columns and Section

**Wave F.** Needs Task 15. Parallel with Tasks 16, 17, 19, 20.

**Files:**
- Create: `web/src/builder/blocks/Columns.tsx`, `Columns.module.css`, `Section.tsx`, `Section.module.css`
- Test: `web/test/builder-content-layout.test.tsx`

**Interfaces:**
- Produces: `Columns` {`columns: '2'|'3'|'4'`, `stackBelow: 'sm'|'md'|'lg'` (36em / 48em / 62em), `gap: SpacingKey`, slots `col1`–`col4`} — one wrapper per visible column, a single column below the breakpoint; `Section` {`padding: SpacingKey`, `backgroundToken: PaletteToken`, `textToken: PaletteToken`, `width: 'rail'|'full'`, slot `content`}.

- [ ] **Step 1: Load the design skill**

Implementer: load the `frontend-design:frontend-design` skill before writing UI code.

- [ ] **Step 2: Write the failing test** (harness, then)

```tsx
// web/test/builder-content-layout.test.tsx  (after the harness)
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';

afterEach(cleanup);
const text = (t: string, id: string) => c('RichText', { bodyHtml: `<p>${t}</p>`, width: 'full' }, id);

describe('Columns', () => {
  it('renders one wrapper per visible column and drops the rest', () => {
    const { container } = mount([c('Columns', { columns: '2', stackBelow: 'md', gap: 'md', col1: [text('left', 'l')], col2: [text('right', 'r')], col3: [text('hidden', 'h')], col4: [] })]);
    const grid = container.querySelector('[data-sf-block="Columns"]') as HTMLElement;
    expect(grid.children).toHaveLength(2);
    expect(grid.style.getPropertyValue('--cols')).toBe('2');
    expect(screen.queryByText('hidden')).toBeNull();
    expect(grid.className).toMatch(/stackMd/);
  });
});

describe('Section', () => {
  it('paints palette tokens only and wraps its content once', () => {
    const { container } = mount([c('Section', { padding: 'lg', backgroundToken: 'surface', textToken: 'text', width: 'rail', content: [text('inside', 'i')] })]);
    const section = container.querySelector('[data-sf-block="Section"]') as HTMLElement;
    expect(section.tagName).toBe('SECTION');
    expect(section.style.getPropertyValue('--section-bg')).toBe('var(--sf-surface)');
    expect(section.style.getPropertyValue('--section-fg')).toBe('var(--sf-text)');
    expect(section.style.getPropertyValue('--section-pad')).toBe('2.5rem');
    expect(section).toHaveTextContent('inside');
    expect(section.querySelectorAll(':scope > div > p')).toHaveLength(1);
  });
  it('"none" leaves the colours to the page', () => {
    const { container } = mount([c('Section', { padding: 'none', backgroundToken: 'none', textToken: 'none', width: 'full', content: [] })]);
    const section = container.querySelector('[data-sf-block="Section"]') as HTMLElement;
    expect(section.style.getPropertyValue('--section-bg')).toBe('transparent');
    expect(section.className).toMatch(/full/);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm --prefix web test -- test/builder-content-layout.test.tsx`
Expected: FAIL — `[data-sf-block="Columns"]` is null.

- [ ] **Step 4: Implement**

```tsx
// web/src/builder/blocks/Columns.tsx
import type { CSSProperties } from 'react';
import { z } from 'zod';
import { defineBlock, slot, spacing, SPACING, type SpacingKey } from '@/builder/define.ts';
import type { ComponentData } from '@/builder/types.ts';
import classes from '@/builder/blocks/Columns.module.css';

type Props = {
  id: string; columns: '2' | '3' | '4'; stackBelow: 'sm' | 'md' | 'lg'; gap: SpacingKey;
  col1: ComponentData[]; col2: ComponentData[]; col3: ComponentData[]; col4: ComponentData[];
};
const STACK = { sm: classes.stackSm, md: classes.stackMd, lg: classes.stackLg } as const;

export const block = defineBlock<Props>({
  name: 'Columns', label: 'Columns', category: 'content', layouts: 'all', routeBound: false, slots: ['col1', 'col2', 'col3', 'col4'],
  schema: z.object({ columns: z.enum(['2', '3', '4']), stackBelow: z.enum(['sm', 'md', 'lg']), gap: spacing(), col1: slot(), col2: slot(), col3: slot(), col4: slot() }),
  defaultProps: { columns: '2', stackBelow: 'md', gap: 'md', col1: [], col2: [], col3: [], col4: [] },
  render: ({ columns, stackBelow, gap, col1, col2, col3, col4 }) => {
    const n = Number(columns);
    const style = { '--cols': columns, '--gap': SPACING[gap] } as CSSProperties;
    return (
      <div className={`${classes.grid} ${STACK[stackBelow]}`} style={style} data-sf-block="Columns">
        {[col1, col2, col3, col4].slice(0, n).map((col, i) => (
          <div key={i} className={classes.col}>{col()}</div>
        ))}
      </div>
    );
  },
});
```

(Each column is rendered through its own `div` rather than `col({ className })` so the React key sits on a stable element; the slot adds no second wrapper.)

```css
/* web/src/builder/blocks/Columns.module.css */
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--gap);
  padding-block: 0.5rem;
}

.col {
  min-width: 0;
}

@media (min-width: 36em) {
  .stackSm { grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); }
}
@media (min-width: 48em) {
  .stackMd { grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); }
}
@media (min-width: 62em) {
  .stackLg { grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); }
}
```

```tsx
// web/src/builder/blocks/Section.tsx
import type { CSSProperties } from 'react';
import { z } from 'zod';
import { defineBlock, paletteToken, slot, spacing, SPACING, tokenVar, type PaletteToken, type SpacingKey } from '@/builder/define.ts';
import type { ComponentData } from '@/builder/types.ts';
import classes from '@/builder/blocks/Section.module.css';

type Props = { id: string; padding: SpacingKey; backgroundToken: PaletteToken; textToken: PaletteToken; width: 'rail' | 'full'; content: ComponentData[] };

/**
 * A band: palette-token colours, a padding step, rail or full bleed. It renders its own
 * <section> (it needs `data-sf-block`, which a slot wrapper cannot carry — A7 slot renders
 * take only className/style/as), and calls the slot with no wrapper inside it.
 */
export const block = defineBlock<Props>({
  name: 'Section', label: 'Section', category: 'content', layouts: 'all', routeBound: false, slots: ['content'],
  schema: z.object({ padding: spacing(), backgroundToken: paletteToken(), textToken: paletteToken(), width: z.enum(['rail', 'full']), content: slot() }),
  defaultProps: { padding: 'lg', backgroundToken: 'none', textToken: 'none', width: 'rail', content: [] },
  render: ({ padding, backgroundToken, textToken, width, content }) => (
    <section
      className={`${classes.section} ${classes[width]} ${backgroundToken === 'none' ? '' : classes.filled}`.trim()}
      style={{
        '--section-pad': SPACING[padding],
        '--section-bg': tokenVar(backgroundToken) ?? 'transparent',
        '--section-fg': tokenVar(textToken) ?? 'inherit',
      } as CSSProperties}
      data-sf-block="Section"
    >
      {content()}
    </section>
  ),
});
```

```css
/* web/src/builder/blocks/Section.module.css */
.section {
  min-width: 0;
  margin-block: 0.5rem;
  padding-block: var(--section-pad);
  background: var(--section-bg);
  color: var(--section-fg);
}

/* A tinted rail band gets the card corners and an inset so text never touches the tint. */
.rail.filled {
  padding-inline: 1rem;
  border-radius: var(--sf-card-radius);
}

/* Full bleed: escape the content column's inset (every shell publishes --sf-main-pad), keep it as padding. */
.full {
  margin-inline: calc(-1 * var(--sf-main-pad, 1rem));
  padding-inline: var(--sf-main-pad, 1rem);
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm --prefix web test -- test/builder-content-layout.test.tsx test/builder-defaults-complete.test.ts && npm --prefix web run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/builder/blocks/Columns.tsx web/src/builder/blocks/Columns.module.css web/src/builder/blocks/Section.tsx web/src/builder/blocks/Section.module.css web/test/builder-content-layout.test.tsx
git commit -m "feat(builder): Columns and Section layout blocks"
```

---

### Task 19: FAQ and Testimonial

**Wave F.** Needs Task 15. Parallel with Tasks 16, 17, 18, 20.

**Files:**
- Create: `web/src/builder/blocks/FAQ.tsx`, `FAQ.module.css`, `Testimonial.tsx`, `Testimonial.module.css`
- Test: `web/test/builder-content-faq.test.tsx`

**Interfaces:**
- Produces: `FAQ` {`title` ≤ 120, `items: Array<{ question: string (1–200); answerHtml: string }>` ≤ 30} — native `<details>`/`<summary>` accordion (works without JS, keyboard-accessible, 44 px summaries); `Testimonial` {`quote` 1–600, `author` ≤ 80, `detail` ≤ 120}. Item objects never carry `type`/`props` keys (Plan 1 contract).

- [ ] **Step 1: Load the design skill**

Implementer: load the `frontend-design:frontend-design` skill before writing UI code.

- [ ] **Step 2: Write the failing test** (harness, then)

```tsx
// web/test/builder-content-faq.test.tsx  (after the harness)
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';

afterEach(cleanup);

describe('FAQ', () => {
  it('renders each item as a disclosure with a sanitised answer', () => {
    const { container } = mount([c('FAQ', { title: 'Questions', items: [
      { question: 'How fast do you ship?', answerHtml: '<p>Same <em>working</em> day.</p><img src=x onerror=alert(1)>' },
      { question: 'Do you ship abroad?', answerHtml: '<p>Across Europe.</p>' },
    ] })]);
    expect(screen.getByRole('heading', { name: 'Questions' })).toBeInTheDocument();
    expect(container.querySelectorAll('details')).toHaveLength(2);
    expect(container.querySelector('img')).toBeNull();
    // Native disclosure: the question is the <summary>; opening it is the browser's job (e2e clicks it).
    const first = container.querySelector('details')!;
    expect(first.querySelector('summary')!.textContent).toBe('How fast do you ship?');
    expect(first.open).toBe(false);
    expect(first.querySelector('em')!.textContent).toBe('working');
  });
});

describe('Testimonial', () => {
  it('renders the quote as a blockquote with its attribution', () => {
    mount([c('Testimonial', { quote: 'The oats arrived the next morning.', author: 'Sam', detail: 'Leeds' })]);
    expect(screen.getByText('The oats arrived the next morning.').closest('blockquote')).not.toBeNull();
    expect(screen.getByText('Sam')).toBeInTheDocument();
    expect(screen.getByText('Leeds')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm --prefix web test -- test/builder-content-faq.test.tsx`
Expected: FAIL — no heading "Questions".

- [ ] **Step 4: Implement**

```tsx
// web/src/builder/blocks/FAQ.tsx
import { z } from 'zod';
import { defineBlock, richtext } from '@/builder/define.ts';
import { RichHtml } from '@/builder/blocks/_shared/RichHtml.tsx';
import classes from '@/builder/blocks/FAQ.module.css';

type Item = { question: string; answerHtml: string };
type Props = { id: string; title: string; items: Item[] };

export const block = defineBlock<Props>({
  name: 'FAQ', label: 'FAQ', category: 'content', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({
    title: z.string().max(120),
    items: z.array(z.object({ question: z.string().min(1).max(200), answerHtml: richtext() })).max(30),
  }),
  defaultProps: {
    title: 'Questions',
    items: [{ question: 'How fast do you ship?', answerHtml: '<p>Most orders leave the same working day.</p>' }],
  },
  render: ({ title, items }) => (
    <section className={classes.root} data-sf-block="FAQ">
      {title ? <h2 className={classes.title}>{title}</h2> : null}
      {items.map((item, i) => (
        <details key={i} className={classes.item}>
          <summary className={classes.q}>{item.question}</summary>
          <RichHtml value={item.answerHtml} className={classes.a} />
        </details>
      ))}
    </section>
  ),
});
```

```css
/* web/src/builder/blocks/FAQ.module.css */
.root {
  min-width: 0;
  padding-block: 0.5rem;
}

.title {
  margin: 0 0 0.75rem;
  font-family: var(--sf-font-heading);
  font-weight: var(--sf-heading-weight);
  letter-spacing: var(--sf-heading-tracking);
  text-transform: var(--sf-heading-transform);
  font-size: clamp(1.2rem, 1.05rem + 0.7vw, 1.6rem);
  color: var(--sf-text);
}

.item {
  border-bottom: 1px solid var(--sf-line);
}
.item:first-of-type {
  border-top: 1px solid var(--sf-line);
}

.q {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 44px;
  padding-block: 0.75rem;
  cursor: pointer;
  list-style: none;
  font-weight: 600;
  color: var(--sf-text);
  overflow-wrap: anywhere;
}
.q::-webkit-details-marker { display: none; }
.q::after {
  content: '+';
  flex: none;
  font-family: var(--sf-font-mono);
  color: var(--sf-muted);
  transition: transform 150ms ease;
}
.item[open] .q::after { transform: rotate(45deg); }
.q:focus-visible {
  outline: 2px solid var(--sf-primary);
  outline-offset: 2px;
}

.a {
  padding-bottom: 1rem;
  color: var(--sf-muted);
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.a :where(p) { margin: 0 0 0.75em; }
.a :where(a) { color: var(--sf-primary); text-decoration: underline; text-underline-offset: 3px; }

@media (prefers-reduced-motion: reduce) {
  .q::after { transition: none; }
}
```

```tsx
// web/src/builder/blocks/Testimonial.tsx
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import classes from '@/builder/blocks/Testimonial.module.css';

type Props = { id: string; quote: string; author: string; detail: string };

export const block = defineBlock<Props>({
  name: 'Testimonial', label: 'Testimonial', category: 'content', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({ quote: z.string().min(1).max(600), author: z.string().max(80), detail: z.string().max(120) }),
  defaultProps: { quote: 'Arrived the next morning, packed like it mattered.', author: 'A happy customer', detail: '' },
  render: ({ quote, author, detail }) => (
    <figure className={classes.card} data-sf-block="Testimonial">
      <blockquote className={classes.quote}><p>{quote}</p></blockquote>
      {author || detail ? (
        <figcaption className={classes.by}>
          {author ? <span className={classes.author}>{author}</span> : null}
          {detail ? <span className={classes.detail}>{detail}</span> : null}
        </figcaption>
      ) : null}
    </figure>
  ),
});
```

```css
/* web/src/builder/blocks/Testimonial.module.css */
/* The storefront card recipe: hairline, 40% surface, the template's radius and shadow. */
.card {
  margin: 0.5rem 0;
  padding: 1.25rem;
  min-width: 0;
  border: var(--sf-card-border);
  border-radius: var(--sf-card-radius);
  background: color-mix(in srgb, var(--sf-surface) 40%, transparent);
  box-shadow: var(--sf-card-shadow);
}

.quote {
  margin: 0;
}
.quote p {
  margin: 0;
  font-family: var(--sf-font-heading);
  font-size: 1.125rem;
  line-height: 1.45;
  color: var(--sf-text);
  overflow-wrap: anywhere;
}

.by {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.75rem;
  margin-top: 0.9rem;
  font-family: var(--sf-font-mono);
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}
.author { color: var(--sf-text); }
.detail { color: var(--sf-faint); }
```

(`border: var(--sf-card-border)` is the same declaration `OrderStatus.module.css` `.card` uses — the vocabulary test pins that recipe for the feature cards, and this block matches it.)

- [ ] **Step 5: Run to verify pass**

Run: `npm --prefix web test -- test/builder-content-faq.test.tsx test/builder-defaults-complete.test.ts && npm --prefix web run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/builder/blocks/FAQ.tsx web/src/builder/blocks/FAQ.module.css web/src/builder/blocks/Testimonial.tsx web/src/builder/blocks/Testimonial.module.css web/test/builder-content-faq.test.tsx
git commit -m "feat(builder): FAQ and Testimonial content blocks"
```

---

### Task 20: FeaturedProducts

**Wave F.** Needs Task 15. Parallel with Tasks 16–19.

**Files:**
- Create: `web/src/builder/blocks/_shared/featured.ts`, `web/src/builder/blocks/FeaturedProducts.tsx`, `FeaturedProducts.module.css`
- Test: `web/test/builder-featured.test.tsx`

**Interfaces:**
- Produces: `pickFeatured(products, categories, { source, items, categoryId, limit }): Product[]`; `FeaturedProducts` (category `catalogue` per spec §7 — so it may not sit in the shell document) {`title` ≤ 120, `source: 'picked'|'category'`, `items: Array<{ productId: number }>` ≤ 24, `categoryId: number | null` (null = the whole catalogue), `limit` 1–24} — the storefront `ProductCard` in a responsive grid; a picked id no longer in the catalogue is skipped; nothing to show ⇒ nothing (a hint in the editor).

- [ ] **Step 1: Load the design skill**

Implementer: load the `frontend-design:frontend-design` skill before writing UI code.

- [ ] **Step 2: Write the failing test**

```tsx
// web/test/builder-featured.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { Suspense } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { Catalog, Category, Product } from '@/types/catalog.ts';
import type { ComponentData } from '@/builder/types.ts';

const state = vi.hoisted(() => ({ catalog: undefined as Catalog | undefined }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({ currency: 'GBP', brand: { name: 'Northbound Supply' }, features: { layout: 'storefront', ordering: true, upsell: false } }) as unknown as StorefrontSettings }));
vi.mock('@/features/catalog/use-catalog.ts', () => ({
  CATALOG_KEY: ['catalog'],
  useCatalog: () => ({ data: state.catalog, isPending: false, isError: false, refetch: () => {} }),
  useProduct: () => ({ data: undefined, isPending: false, isError: false, refetch: () => {} }),
}));

import { RenderDoc } from '@/builder/render.tsx';
import { pickFeatured } from '@/builder/blocks/_shared/featured.ts';

function product(id: number, name: string, categoryId: number): Product {
  return {
    id, sku: `NB-${id}`, name, displayName: name, shortDisplayName: null, description: null, categoryId, categoryName: '',
    sortOrder: id, price: 10, inStock: true, lowStockAlert: false, isActive: true, isPreorder: false, preorderEta: null,
    pricingTiers: [], upsellProductIds: [], excludedFromFreeShipping: false, imageProductId: id, provenance: null, minOrderQuantity: null, maxOrderQuantity: null,
  };
}
const CATEGORIES: Category[] = [
  { id: 1, name: 'Pantry', slug: 'pantry', parentId: null, sortOrder: 0, emoji: null },
  { id: 2, name: 'Grains', slug: 'grains', parentId: 1, sortOrder: 0, emoji: null },
  { id: 3, name: 'Kit', slug: 'kit', parentId: null, sortOrder: 1, emoji: null },
];
const PRODUCTS = [product(1, 'Trail Oats 1kg', 2), product(2, 'Cold Brew Kit', 3), product(3, 'Rye Flakes', 2), product(4, 'Sea Salt', 1)];

afterEach(cleanup);

describe('pickFeatured', () => {
  it('keeps the picked order, skipping ids that left the catalogue', () => {
    expect(pickFeatured(PRODUCTS, CATEGORIES, { source: 'picked', items: [{ productId: 3 }, { productId: 99 }, { productId: 1 }], categoryId: null, limit: 4 }).map((p) => p.id)).toEqual([3, 1]);
  });
  it('takes a category including its subcategories, capped at the limit', () => {
    expect(pickFeatured(PRODUCTS, CATEGORIES, { source: 'category', items: [], categoryId: 1, limit: 2 }).map((p) => p.id)).toEqual([1, 3]);
  });
});

describe('FeaturedProducts', () => {
  it('renders product cards under its title', async () => {
    state.catalog = { categories: CATEGORIES, products: PRODUCTS };
    const content: ComponentData[] = [{ type: 'FeaturedProducts', props: { id: 'f', title: 'Staff picks', source: 'picked', items: [{ productId: 2 }], categoryId: null, limit: 4 } }];
    render(<MantineProvider env="test"><MemoryRouter><Suspense fallback={null}><RenderDoc doc={{ root: { props: { title: '', description: '', chrome: 'shell' } }, content }} docKey="page:x" layout="storefront" /></Suspense></MemoryRouter></MantineProvider>);
    expect(screen.getByRole('heading', { name: 'Staff picks' })).toBeInTheDocument();
    expect(await screen.findByText('Cold Brew Kit')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-sf-part="product-card"]')).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm --prefix web test -- test/builder-featured.test.tsx`
Expected: FAIL — `@/builder/blocks/_shared/featured.ts` not found.

- [ ] **Step 4: Implement**

```ts
// web/src/builder/blocks/_shared/featured.ts
import { bySortOrder, filterProducts } from '@/features/catalog/filter.ts';
import type { Category, Product } from '@/types/catalog.ts';

export interface FeaturedQuery { source: 'picked' | 'category'; items: Array<{ productId: number }>; categoryId: number | null; limit: number }

export function pickFeatured(products: Product[], categories: Category[], q: FeaturedQuery): Product[] {
  if (q.source === 'picked') {
    const byId = new Map(products.map((p) => [p.id, p]));
    return q.items.map((i) => byId.get(i.productId)).filter((p): p is Product => p !== undefined).slice(0, q.limit);
  }
  if (q.categoryId === null) return [...products].sort(bySortOrder).slice(0, q.limit);
  return filterProducts(products, categories, { categoryId: q.categoryId, search: '' }).slice(0, q.limit);
}
```

```tsx
// web/src/builder/blocks/FeaturedProducts.tsx
import { lazy, useMemo } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { useBuilderMode } from '@/builder/mode.ts';
import { useCatalog } from '@/features/catalog/use-catalog.ts';
import { pickFeatured, type FeaturedQuery } from '@/builder/blocks/_shared/featured.ts';
import classes from '@/builder/blocks/FeaturedProducts.module.css';

const ProductCard = lazy(() => import('@/features/catalog/ProductCard.tsx').then((m) => ({ default: m.ProductCard })));

type Props = { id: string; title: string } & FeaturedQuery;

function FeaturedView({ title, ...query }: Omit<Props, 'id'>) {
  const catalog = useCatalog();
  const { editing } = useBuilderMode();
  const picked = useMemo(
    () => (catalog.data ? pickFeatured(catalog.data.products, catalog.data.categories, query) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the query is plain data; serialise it
    [catalog.data, JSON.stringify(query)],
  );
  if (picked.length === 0) {
    return editing ? <p className={classes.hint} data-sf-block="FeaturedProducts">Pick products, or a category with products in it.</p> : null;
  }
  const siblingImages = picked.some((p) => p.imageProductId !== null);
  return (
    <section className={classes.root} data-sf-block="FeaturedProducts" aria-label={title || 'Featured products'}>
      {title ? <h2 className={classes.title}>{title}</h2> : null}
      <div className={classes.grid}>
        {picked.map((product, i) => (
          <ProductCard key={product.id} product={product} index={i} hasSiblingImages={siblingImages} />
        ))}
      </div>
    </section>
  );
}

export const block = defineBlock<Props>({
  name: 'FeaturedProducts', label: 'Featured products', category: 'catalogue', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({
    title: z.string().max(120),
    source: z.enum(['picked', 'category']),
    items: z.array(z.object({ productId: z.number().int().positive() })).max(24),
    categoryId: z.number().int().positive().nullable(),
    limit: z.number().int().min(1).max(24),
  }),
  defaultProps: { title: 'Featured', source: 'category', items: [], categoryId: null, limit: 4 },
  render: ({ title, source, items, categoryId, limit }) => <FeaturedView title={title} source={source} items={items} categoryId={categoryId} limit={limit} />,
});
```

```css
/* web/src/builder/blocks/FeaturedProducts.module.css */
.root {
  min-width: 0;
  padding-block: 0.75rem;
}

.title {
  margin: 0 0 0.9rem;
  font-family: var(--sf-font-heading);
  font-weight: var(--sf-heading-weight);
  letter-spacing: var(--sf-heading-tracking);
  text-transform: var(--sf-heading-transform);
  font-size: clamp(1.2rem, 1.05rem + 0.7vw, 1.6rem);
  color: var(--sf-text);
}

/* Two cards across a phone, as many ~11rem columns as fit above. */
.grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
@media (min-width: 48em) {
  .grid { grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 1rem; }
}

.hint {
  margin: 0;
  padding: 1rem;
  border: 1px dashed var(--sf-line-strong);
  border-radius: var(--sf-card-radius);
  color: var(--sf-muted);
  font-size: 0.875rem;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm --prefix web test -- test/builder-featured.test.tsx test/builder-defaults-complete.test.ts && npm --prefix web run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/builder/blocks/_shared/featured.ts web/src/builder/blocks/FeaturedProducts.tsx web/src/builder/blocks/FeaturedProducts.module.css web/test/builder-featured.test.tsx
git commit -m "feat(builder): FeaturedProducts content block"
```

---

### Task 21: NavLinks, the Footer `columns` variant, the CatalogHero `custom` variant

**Wave F** (after any of Tasks 16–20 frees a slot). Needs Task 15.

**Files:**
- Create: `web/src/builder/blocks/NavLinks.tsx`, `NavLinks.module.css`, `Footer.module.css`, `CatalogHero.module.css`
- Modify: `web/src/builder/blocks/Footer.tsx`, `web/src/builder/blocks/CatalogHero.tsx`
- Test: `web/test/builder-nav-footer.test.tsx`

**Interfaces:**
- Consumes: `SmartLink`, `RichHtml` (Task 7).
- Produces: `NavLinks` · shell · all · false {`links: Array<{ label: string (1–40); href: string }>` ≤ 12, `ariaLabel` 1–40 (default `Site`), `direction: 'row'|'column'`} — fits the Header's `nav` slot (a row that scrolls sideways rather than overflowing) or a footer column (`column`); `Footer` gains `variant: 'columns'` with `columns: '1'|'2'|'3'|'4'`, slots `col1`–`col4`, `colophon: boolean`; `CatalogHero` gains `variant: 'custom'` with `title` ≤ 120, `bodyHtml`, `imageSrc` (uploaded media or `''`), `imageAlt` ≤ 300, `align: 'start'|'center'`. The `template` variants and their default props are unchanged, so the default documents and their DOM stay exactly as the gate left them.

- [ ] **Step 1: Load the design skill**

Implementer: load the `frontend-design:frontend-design` skill before writing UI code.

- [ ] **Step 2: Write the failing test**

```tsx
// web/test/builder-nav-footer.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { ComponentData } from '@/builder/types.ts';

vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({ brand: { name: 'Northbound Supply', tagline: '', links: { whatsapp: null, telegram: null } }, supportLinks: [], welcomeMessage: null, features: { layout: 'storefront' } }) as unknown as StorefrontSettings }));

import { RenderDoc } from '@/builder/render.tsx';

const c = (type: string, props: Record<string, unknown> = {}, id = type): ComponentData => ({ type, props: { id, ...props } });
function mount(content: ComponentData[], path = '/') {
  return render(<MantineProvider env="test"><MemoryRouter initialEntries={[path]}><RenderDoc doc={{ root: { props: { title: '', description: '', chrome: 'shell' } }, content }} docKey="shell" layout="storefront" /></MemoryRouter></MantineProvider>);
}
const KEY = '/media/storefront-pages/media/' + 'ab'.repeat(16) + '.jpg';

afterEach(cleanup);

describe('NavLinks', () => {
  it('renders internal links through the router, marks the current page, and keeps external links safe', () => {
    mount([c('NavLinks', { ariaLabel: 'Site', direction: 'row', links: [{ label: 'Our story', href: '/pages/our-story' }, { label: 'Trade', href: 'https://shop.example/trade' }] })], '/pages/our-story');
    const nav = screen.getByRole('navigation', { name: 'Site' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Our story' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Trade' })).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

describe('Footer columns', () => {
  it('renders the chosen number of columns and the colophon', () => {
    const { container } = mount([c('Footer', {
      variant: 'columns', columns: '2', colophon: true,
      col1: [c('NavLinks', { ariaLabel: 'Shop', direction: 'column', links: [{ label: 'All products', href: '/' }] }, 'n1')],
      col2: [c('NavLinks', { ariaLabel: 'Help', direction: 'column', links: [{ label: 'Tracking', href: '/tracking' }] }, 'n2')],
      col3: [c('NavLinks', { ariaLabel: 'Hidden', direction: 'column', links: [{ label: 'Hidden', href: '/' }] }, 'n3')],
      col4: [],
    })]);
    const footer = container.querySelector('footer[data-sf-part="footer"]') as HTMLElement;
    expect(footer).not.toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Hidden' })).toBeNull();
    expect(footer).toHaveTextContent('Northbound Supply');
  });
});

describe('CatalogHero custom', () => {
  it('renders owner copy and an uploaded image', () => {
    mount([c('CatalogHero', { variant: 'custom', surface: 'auto', title: 'Autumn range', bodyHtml: '<p>Fresh <strong>rye</strong>.</p>', imageSrc: KEY, imageAlt: 'Rye field', align: 'center' })]);
    expect(screen.getByRole('heading', { name: 'Autumn range' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Rye field' })).toHaveAttribute('src', KEY);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm --prefix web test -- test/builder-nav-footer.test.tsx`
Expected: FAIL — no `Site` navigation (NavLinks missing); Footer/CatalogHero still template-only (their `columns`/`custom` props fail the schema and fall back).

- [ ] **Step 4: NavLinks**

```tsx
// web/src/builder/blocks/NavLinks.tsx
import { z } from 'zod';
import { defineBlock, routeLink } from '@/builder/define.ts';
import { SmartLink } from '@/builder/blocks/_shared/SmartLink.tsx';
import classes from '@/builder/blocks/NavLinks.module.css';

type Link = { label: string; href: string };
type Props = { id: string; links: Link[]; ariaLabel: string; direction: 'row' | 'column' };

export const block = defineBlock<Props>({
  name: 'NavLinks', label: 'Links', category: 'shell', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({
    links: z.array(z.object({ label: z.string().min(1).max(40), href: routeLink() })).max(12),
    ariaLabel: z.string().min(1).max(40),
    direction: z.enum(['row', 'column']),
  }),
  defaultProps: { links: [{ label: 'Shop', href: '/' }], ariaLabel: 'Site', direction: 'row' },
  render: ({ links, ariaLabel, direction }) => (
    <nav className={`${classes.nav} ${classes[direction]}`} aria-label={ariaLabel} data-sf-block="NavLinks">
      <ul className={classes.list}>
        {links.filter((l) => l.href).map((l, i) => (
          <li key={i}>
            <SmartLink href={l.href} className={classes.link}>{l.label}</SmartLink>
          </li>
        ))}
      </ul>
    </nav>
  ),
});
```

```css
/* web/src/builder/blocks/NavLinks.module.css */
/* In the header bar it shares one row with the brand, search and icons: it may
   shrink and scroll sideways, never push the row wider than the phone. */
.nav {
  min-width: 0;
}
.row {
  flex: 0 1 auto;
  overflow-x: auto;
  scrollbar-width: none;
}
.row::-webkit-scrollbar { display: none; }

.list {
  display: flex;
  gap: 0.125rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.column .list {
  flex-direction: column;
  align-items: flex-start;
}

.link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  min-width: 44px;
  padding: 0 0.6rem;
  font-family: var(--sf-font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--sf-muted);
  text-decoration: none;
  border-radius: var(--sf-card-radius);
  transition: color 120ms ease, background-color 120ms ease;
}
.column .link { padding-inline: 0; }
.link:hover,
.link[aria-current='page'] { color: var(--sf-text); }
.link:hover { background: var(--sf-surface); }
.column .link:hover { background: none; text-decoration: underline; text-underline-offset: 3px; }
.link:focus-visible {
  outline: 2px solid var(--sf-primary);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .link { transition: none; }
}
```

- [ ] **Step 5: Footer `columns` variant**

Replace `web/src/builder/blocks/Footer.tsx` with:

```tsx
// web/src/builder/blocks/Footer.tsx
import type { CSSProperties } from 'react';
import { z } from 'zod';
import { useSettings } from '@/app/settings.ts';
import { defineBlock, slot, type SlotRender } from '@/builder/define.ts';
import type { ComponentData } from '@/builder/types.ts';
import { ShellFooter } from '@/layouts/ShellFooter.tsx';
import classes from '@/builder/blocks/Footer.module.css';

type Props = {
  id: string; variant: 'template' | 'columns'; columns: '1' | '2' | '3' | '4'; colophon: boolean;
  col1: ComponentData[]; col2: ComponentData[]; col3: ComponentData[]; col4: ComponentData[];
};

function ColumnsFooter({ columns, colophon, cols }: { columns: Props['columns']; colophon: boolean; cols: SlotRender[] }) {
  const { brand } = useSettings();
  const n = Number(columns);
  return (
    <footer className={classes.footer} data-sf-part="footer">
      <div className={classes.grid} style={{ '--cols': columns } as CSSProperties}>
        {cols.slice(0, n).map((col, i) => (
          <div key={i} className={classes.col}>{col()}</div>
        ))}
      </div>
      {colophon ? <p className={classes.colophon}>© {new Date().getFullYear()} {brand.name}</p> : null}
    </footer>
  );
}

/** `template` = the active template's Footer slot (the default); `columns` = owner-composed columns. */
export const block = defineBlock<Props>({
  name: 'Footer', label: 'Footer', category: 'shell', layouts: ['storefront', 'menu'], routeBound: false, slots: ['col1', 'col2', 'col3', 'col4'],
  schema: z.object({
    variant: z.enum(['template', 'columns']), columns: z.enum(['1', '2', '3', '4']), colophon: z.boolean(),
    col1: slot(), col2: slot(), col3: slot(), col4: slot(),
  }),
  defaultProps: { variant: 'template', columns: '3', colophon: true, col1: [], col2: [], col3: [], col4: [] },
  render: ({ variant, columns, colophon, col1, col2, col3, col4 }) =>
    variant === 'template' ? <ShellFooter /> : <ColumnsFooter columns={columns} colophon={colophon} cols={[col1, col2, col3, col4]} />,
});
```

```css
/* web/src/builder/blocks/Footer.module.css */
/* The owner-composed footer: the same quiet band as modern's, columns from the page builder. */
.footer {
  margin-top: 3rem;
  border-top: 1px solid var(--sf-line);
  background: var(--sf-bg-deep);
}

.grid {
  display: grid;
  gap: 2rem;
  grid-template-columns: minmax(0, 1fr);
  max-width: var(--sf-rail-max, 1200px);
  margin: 0 auto;
  padding: 2rem var(--sf-main-pad, 1rem);
}
@media (min-width: 48em) {
  .grid { grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); }
}

.col { min-width: 0; }

.colophon {
  max-width: var(--sf-rail-max, 1200px);
  margin: 0 auto;
  padding: 0.9rem var(--sf-main-pad, 1rem) calc(0.9rem + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--sf-line);
  font-family: var(--sf-font-mono);
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--sf-faint);
}
```

The default shell documents store `Footer` with `variant: 'template'` and — after this change — the extra default props (`columns: '3'`, `colophon: true`, empty slots). The template variant ignores them, so the Task 1 DOM baseline still holds; Step 7 proves it.

- [ ] **Step 6: CatalogHero `custom` variant**

Replace `web/src/builder/blocks/CatalogHero.tsx` with:

```tsx
// web/src/builder/blocks/CatalogHero.tsx
import { z } from 'zod';
import { useSettings } from '@/app/settings.ts';
import { defineBlock, mediaSrc, richtext } from '@/builder/define.ts';
import { RichHtml } from '@/builder/blocks/_shared/RichHtml.tsx';
import { useCatalogStats } from '@/templates/hooks.ts';
import { Slot } from '@/templates/runtime.tsx';
import type { LayoutKind } from '@/builder/types.ts';
import classes from '@/builder/blocks/CatalogHero.module.css';

type Surface = 'grid' | 'list' | 'wholesale';
type Props = {
  id: string; variant: 'template' | 'custom'; surface: 'auto' | Surface;
  title: string; bodyHtml: string; imageSrc: string; imageAlt: string; align: 'start' | 'center';
};

const autoSurface = (layout: LayoutKind): Surface => (layout === 'storefront' ? 'grid' : 'list');

function TemplateHero({ surface }: { surface: Surface }) {
  const { brand, welcomeMessage } = useSettings();
  const { productCount, categoryCount } = useCatalogStats();
  return <Slot name="CatalogHero" surface={surface} tagline={brand.tagline} welcomeMessage={welcomeMessage} productCount={productCount ?? 0} categoryCount={categoryCount ?? 0} />;
}

function CustomHero({ title, bodyHtml, imageSrc, imageAlt, align }: Pick<Props, 'title' | 'bodyHtml' | 'imageSrc' | 'imageAlt' | 'align'>) {
  const image = imageSrc && imageAlt.trim() ? imageSrc : '';
  return (
    <section className={`${classes.hero} ${align === 'center' ? classes.center : ''} ${image ? classes.withImage : ''}`.trim()} data-sf-block="CatalogHero">
      <div className={classes.text}>
        {title ? <h2 className={classes.title}>{title}</h2> : null}
        <RichHtml value={bodyHtml} className={classes.body} />
      </div>
      {image ? <img className={classes.image} src={image} alt={imageAlt} loading="lazy" decoding="async" /> : null}
    </section>
  );
}

/** The catalogue intro: the template's own (`template`), or owner copy and an image (`custom`). */
export const block = defineBlock<Props>({
  name: 'CatalogHero', label: 'Catalogue intro', category: 'catalogue', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({
    variant: z.enum(['template', 'custom']), surface: z.enum(['auto', 'grid', 'list', 'wholesale']),
    title: z.string().max(120), bodyHtml: richtext(), imageSrc: mediaSrc(), imageAlt: z.string().max(300), align: z.enum(['start', 'center']),
  }),
  defaultProps: { variant: 'template', surface: 'auto', title: '', bodyHtml: '', imageSrc: '', imageAlt: '', align: 'start' },
  render: ({ variant, surface, title, bodyHtml, imageSrc, imageAlt, align, puck }) =>
    variant === 'template'
      ? <TemplateHero surface={surface === 'auto' ? autoSurface(puck.layout) : surface} />
      : <CustomHero title={title} bodyHtml={bodyHtml} imageSrc={imageSrc} imageAlt={imageAlt} align={align} />,
});
```

```css
/* web/src/builder/blocks/CatalogHero.module.css */
.hero {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  margin-block: 1rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--sf-line);
}
@media (min-width: 48em) {
  .withImage { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); }
}
.center { text-align: center; justify-items: center; }

.text { min-width: 0; }

.title {
  margin: 0 0 0.5rem;
  font-family: var(--sf-font-heading);
  font-weight: var(--sf-heading-weight);
  letter-spacing: var(--sf-heading-tracking);
  text-transform: var(--sf-heading-transform);
  font-size: clamp(1.5rem, 1.2rem + 1.4vw, 2.25rem);
  line-height: 1.12;
  color: var(--sf-text);
  overflow-wrap: anywhere;
}

.body {
  max-width: 60ch;
  color: var(--sf-muted);
  line-height: 1.6;
}
.body :where(p) { margin: 0 0 0.75em; }
.body :where(a) { color: var(--sf-primary); text-decoration: underline; text-underline-offset: 3px; }

.image {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: var(--sf-card-radius);
  background: var(--sf-surface);
}
```

- [ ] **Step 7: Run to verify pass — and that the defaults did not move**

Run: `npm --prefix web test -- test/builder-nav-footer.test.tsx test/builder-shell.test.tsx test/builder-catalogue-extras.test.tsx test/builder-defaults-complete.test.ts && npm --prefix web run typecheck && npx playwright test -c e2e/playwright.config.ts e2e/dom-parity.spec.ts`
Expected: all PASS — the shell parity test and the DOM baseline are unaffected by the new variants.

- [ ] **Step 8: Commit**

```bash
git add web/src/builder/blocks/NavLinks.tsx web/src/builder/blocks/NavLinks.module.css web/src/builder/blocks/Footer.tsx web/src/builder/blocks/Footer.module.css web/src/builder/blocks/CatalogHero.tsx web/src/builder/blocks/CatalogHero.module.css web/test/builder-nav-footer.test.tsx
git commit -m "feat(builder): NavLinks, composable footer columns and a custom catalogue intro"
```

---
## Phase 5 — Published sets end to end, then the release

### Task 22: Published-set e2e — reordered catalogue, content, custom pages, fallback, template matrix

**Wave G.** Needs Tasks 16–21. Runs alone.

**Files:**
- Create: `e2e/page-sets.ts` (fixture builders — not a spec, so specs may import it), `e2e/builder.spec.ts`

**Interfaces:**
- Consumes: `installMocks({ pages })` (Task 6), `presetTheme` (`e2e/template-theme.ts`), `FIXED_NOW`, `openProduct`, `addFirstToCart`, `openCart`, `onlyVisible`, `fillCheckout` (`e2e/flows.ts`), every block name and prop from Tasks 8–21.
- Produces: `storySet(layout)`, `everyBlockSet(layout)`, `checkoutWithoutFlowSet()`.

- [ ] **Step 1: Fixture builders**

```ts
// e2e/page-sets.ts
import type { ComponentData, PageSet, PuckDoc } from '../web/src/builder/types.ts';
import type { Layout } from './mocks.ts';

/** Sparse props on purpose: the guard fills every missing field from the block's defaults. */
const c = (type: string, props: Record<string, unknown> = {}, id = `${type}-e2e`): ComponentData => ({ type, props: { id, ...props } });
const doc = (content: ComponentData[], title = '', chrome: 'shell' | 'none' = 'shell'): PuckDoc => ({ root: { props: { title, description: '', chrome } }, content });

const listBlock = (layout: Layout) => (layout === 'storefront' ? c('ProductGrid') : c('ProductList'));

function shell(layout: Layout, footer: ComponentData | null): PuckDoc {
  const nav = c('NavLinks', { ariaLabel: 'Site', direction: 'row', links: [{ label: 'Our story', href: '/pages/our-story' }] });
  return doc([
    c('Header', { nav: [nav] }),
    c('NoticeBanners'),
    c('CutoffBar'),
    c('PageOutlet'),
    ...(layout !== 'webapp' && footer ? [footer] : []),
    ...(layout === 'menu' ? [c('ContactStrip')] : []),
  ]);
}

const STORY = doc([
  c('Heading', { text: 'Our story', level: 'h2' }),
  c('RichText', { bodyHtml: '<p>Northbound Supply started in a shed with one oven.</p>' }),
  c('Button', { label: 'Back to the shop', href: '/' }),
], 'Our story · Northbound Supply');

/** Content above the (re-ordered) list, a custom page, and a nav link to it. */
export function storySet(layout: Layout): PageSet {
  return {
    schemaVersion: 1,
    shell: shell(layout, c('Footer')),
    pages: {
      catalog: doc([
        c('Section', { padding: 'md', backgroundToken: 'surface', content: [
          c('Heading', { text: 'Small batches, shipped fast' }, 'hero-heading'),
          c('RichText', { bodyHtml: '<p>Packed to order at Northbound Supply.</p>' }, 'hero-text'),
        ] }),
        listBlock(layout),
      ]),
      'page:our-story': STORY,
    },
  };
}

const IMAGE = `/media/storefront-pages/media/${'a'.repeat(32)}.png`;

/** Every content block (plus nav + composed footer) on the catalogue page. */
export function everyBlockSet(layout: Layout): PageSet {
  const footer = c('Footer', {
    variant: 'columns', columns: '2', colophon: true,
    col1: [c('NavLinks', { ariaLabel: 'Shop', direction: 'column', links: [{ label: 'All products', href: '/' }] }, 'f1')],
    col2: [c('NavLinks', { ariaLabel: 'Help', direction: 'column', links: [{ label: 'Track an order', href: '/tracking' }] }, 'f2')],
  });
  return {
    schemaVersion: 1,
    shell: shell(layout, footer),
    pages: {
      catalog: doc([
        c('Heading', { text: 'This week at Northbound Supply', eyebrow: 'New in' }),
        c('RichText', { bodyHtml: '<p>Everything is packed to order. <a href="/pages/our-story">Read our story</a>.</p>' }),
        c('Image', { src: IMAGE, alt: 'Oats in a jar', caption: 'Trail oats, freshly rolled', width: 'rail', aspect: '16/9' }),
        c('Button', { label: 'Shop the pantry', href: '/c/concentrates', variant: 'filled', align: 'stretch' }),
        c('Columns', { columns: '3', stackBelow: 'md', col1: [c('Heading', { text: 'Fast', level: 'h3' }, 'k1')], col2: [c('Heading', { text: 'Fresh', level: 'h3' }, 'k2')], col3: [c('Heading', { text: 'Fair', level: 'h3' }, 'k3')] }),
        c('Section', { backgroundToken: 'surface-2', width: 'full', content: [c('Testimonial', { quote: 'Arrived the next morning, packed like it mattered.', author: 'Sam', detail: 'Leeds' }, 't1')] }),
        c('Spacer', { size: 'sm' }),
        c('Divider'),
        c('FAQ', { title: 'Questions', items: [{ question: 'How fast do you ship?', answerHtml: '<p>Same working day.</p>' }, { question: 'Can I collect?', answerHtml: '<p>Not yet.</p>' }] }),
        c('Video', { provider: 'youtube', videoId: 'aB3_dE-fG9h', title: 'How we pack' }),
        c('FeaturedProducts', { title: 'Staff picks', source: 'picked', items: [{ productId: 101 }, { productId: 102 }] }),
        listBlock(layout),
      ]),
      'page:our-story': STORY,
    },
  };
}

/** A checkout document missing its CheckoutFlow — must fall back to the default. */
export function checkoutWithoutFlowSet(): PageSet {
  return { schemaVersion: 1, shell: shell('storefront', c('Footer')), pages: { checkout: doc([c('Heading', { text: 'Almost there' })]) } };
}
```

- [ ] **Step 2: Write the spec**

```ts
// e2e/builder.spec.ts
import { expect, test, type Page } from '@playwright/test';
import { installMocks, type Layout } from './mocks.ts';
import { addFirstToCart, FIXED_NOW, fillCheckout, onlyVisible, openCart, openProduct, productOpener } from './flows.ts';
import { presetTheme } from './template-theme.ts';
import { checkoutWithoutFlowSet, everyBlockSet, storySet } from './page-sets.ts';

/** Same cases as templates.spec.ts (a spec may not import another spec). Guarded below. */
const CASES: Array<[string, string]> = [
  ['modern', 'default'], ['dark-luxury', 'gold'], ['cyber-brutalism', 'acid-dark'],
  ['cyber-brutalism', 'purple-light'], ['bento', 'tech-dark'], ['bento', 'fashion-light'],
];

async function noOverflow(page: Page, where: string) {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  expect(o.sw, `horizontal overflow on ${where}`).toBeLessThanOrEqual(o.w);
}

/** Block-owned tap targets under 44×44 (inline prose links and the existing product cards excluded). */
async function smallBlockTargets(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-sf-block] a, [data-sf-block] button, [data-sf-block] summary')]
      .filter((el) => {
        if (el.closest('[data-sf-prose]') || el.closest('[data-sf-part="product-card"]')) return false;
        const cs = getComputedStyle(el);
        const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
        if (!visible || cs.pointerEvents === 'none') return false;
        const r = el.getBoundingClientRect();
        return r.width < 44 || r.height < 44;
      })
      .map((el) => el.outerHTML.slice(0, 100)),
  );
}

test('every template in the catalog has a content-block case', async ({ page }) => {
  const res = await page.request.get('/templates.json');
  const cat = (await res.json()) as { templates: Array<{ id: string }> };
  const covered = new Set(CASES.map(([t]) => t));
  expect(cat.templates.map((t) => t.id).filter((id) => !covered.has(id))).toEqual([]);
});

for (const layout of ['storefront', 'menu', 'webapp'] as const satisfies readonly Layout[]) {
  test(`published set · ${layout} · content above the list, a custom page from the nav`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(FIXED_NOW);
    await installMocks(page, { layout, session: true, pages: { [layout]: storySet(layout) } });
    await page.goto('/');

    const hero = page.getByRole('heading', { name: 'Small batches, shipped fast' });
    await expect(hero).toBeVisible();
    const firstProduct = productOpener(page, layout, 'Alpine Extract 10ml');
    await expect(firstProduct).toBeVisible();
    expect((await hero.boundingBox())!.y).toBeLessThan((await firstProduct.boundingBox())!.y);
    await noOverflow(page, 'catalog');

    await onlyVisible(page.getByRole('link', { name: 'Our story' })).click();
    await expect(page).toHaveURL(/\/pages\/our-story$/);
    await expect(page.getByRole('heading', { name: 'Our story' })).toBeVisible();
    await expect(page).toHaveTitle('Our story · Northbound Supply');
    await noOverflow(page, 'custom page');

    await page.getByRole('link', { name: 'Back to the shop' }).click();
    await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
    await expect(page).not.toHaveTitle('Our story · Northbound Supply');
  });
}

test('an unknown custom page goes home', async ({ page }) => {
  await installMocks(page, { layout: 'storefront', pages: { storefront: storySet('storefront') } });
  await page.goto('/pages/not-a-page');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
});

test('a checkout document without CheckoutFlow falls back, and checkout still reaches Review', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.setFixedTime(FIXED_NOW);
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const mocks = await installMocks(page, { layout: 'storefront', session: true, pages: { storefront: checkoutWithoutFlowSet() } });
  await page.goto('/');
  await openProduct(page, 'storefront', 'Alpine Extract 10ml');
  await addFirstToCart(page, 'storefront', mocks);
  await openCart(page, 'desktop');
  await onlyVisible(page.getByRole('link', { name: 'Checkout' })).click();
  await fillCheckout(page);
  await expect(page.getByRole('heading', { name: 'Almost there' })).toHaveCount(0);
  expect(errors.some((e) => e.includes('exactly-one:CheckoutFlow'))).toBe(true);
});

const MATRIX: Array<[Layout, number]> = [['storefront', 360], ['storefront', 1280], ['menu', 390], ['webapp', 390]];

for (const [template, preset] of CASES) {
  for (const [layout, width] of MATRIX) {
    test(`every content block · ${template}/${preset} · ${layout} · ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.clock.setFixedTime(FIXED_NOW);
      const tweak = await presetTheme(page, template, preset);
      await installMocks(page, { layout, session: true, tweakSettings: tweak, pages: { [layout]: everyBlockSet(layout) } });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-sf-template', template);
      await expect(page.getByRole('img', { name: 'Oats in a jar' })).toBeVisible();
      await expect(page.locator('[data-sf-block="FeaturedProducts"] [data-sf-part="product-card"]')).toHaveCount(2);

      const faq = page.locator('[data-sf-block="FAQ"] details').first();
      await faq.locator('summary').click();
      await expect(faq).toHaveAttribute('open', '');

      await page.evaluate(() => document.fonts.ready);
      await noOverflow(page, `${template}/${preset} ${layout} ${width}`);
      expect(await smallBlockTargets(page), 'block tap targets under 44px').toEqual([]);
    });
  }
}
```

- [ ] **Step 3: Run it**

Run: `npx playwright test -c e2e/playwright.config.ts e2e/builder.spec.ts`
Expected: all PASS (≈ 30 tests). This spec is written after the blocks, so it passes on first run if Tasks 16–21 are right; a failure is a block bug (overflow, a tap target, a missing hook) — fix the block, not the spec. If `productOpener` is not exported from `e2e/flows.ts`, it is (`export function productOpener`) — do not duplicate it.

- [ ] **Step 4: The whole suite still holds**

Run: `npm test && npm run test:e2e`
Expected: all PASS, including `dom-parity.spec.ts` and the pixel baselines (no published set there).

- [ ] **Step 5: Commit**

```bash
git add e2e/page-sets.ts e2e/builder.spec.ts
git commit -m "test(e2e): published page sets per layout, custom pages, checkout fallback, content blocks across the template matrix"
```

---

### Task 23: `blocks.json`, `docs/builder.md`, README release note, web `0.7.0`

**Wave G.** Needs Task 22. Runs alone.

**Files:**
- Create: `web/src/builder/blocks-manifest.ts`, `web/public/blocks.json` (generated), `docs/builder.md`
- Modify: `README.md`, `web/package.json` + `web/package-lock.json` (version)
- Test: `web/test/blocks-manifest.test.ts`

**Interfaces:**
- Produces: `blocksManifest(): { schemaVersion: 1; blocks: Array<{ name; category; layouts: LayoutKind[]; routeBound }> }` (sorted by name; `'all'` expanded to the three layouts); `web/public/blocks.json` is copied by Vite to `web/dist/blocks.json` on every build (spec §8 — documentation and a future admin use; the backend does not consume it).

- [ ] **Step 1: Write the failing test**

```ts
// web/test/blocks-manifest.test.ts
/// <reference types="node" />
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { blocksManifest } from '@/builder/blocks-manifest.ts';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(testDir, '../public/blocks.json');

describe('blocks.json', () => {
  it('lists every block with its category, layouts and route binding', () => {
    const m = blocksManifest();
    expect(m.schemaVersion).toBe(1);
    expect(m.blocks.find((b) => b.name === 'CheckoutFlow')).toEqual({ name: 'CheckoutFlow', category: 'commerce', layouts: ['storefront', 'menu', 'webapp'], routeBound: true });
    expect(m.blocks.find((b) => b.name === 'Footer')!.layouts).toEqual(['storefront', 'menu']);
    expect(m.blocks.map((b) => b.name)).toEqual([...m.blocks.map((b) => b.name)].sort((a, b) => a.localeCompare(b)));
  });
  it('the committed web/public/blocks.json is current (UPDATE_BLOCKS_JSON=1 npm --prefix web test -- test/blocks-manifest.test.ts regenerates it)', () => {
    const expected = `${JSON.stringify(blocksManifest(), null, 2)}\n`;
    if (process.env.UPDATE_BLOCKS_JSON === '1') writeFileSync(FILE, expected);
    expect(readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n')).toBe(expected);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix web test -- test/blocks-manifest.test.ts`
Expected: FAIL — `@/builder/blocks-manifest.ts` not found.

- [ ] **Step 3: Implement and generate**

```ts
// web/src/builder/blocks-manifest.ts
import { BLOCKS } from '@/builder/registry.ts';
import type { BlockCategory } from '@/builder/define.ts';
import type { LayoutKind } from '@/builder/types.ts';

const ALL: LayoutKind[] = ['storefront', 'menu', 'webapp'];

export interface BlocksManifest {
  schemaVersion: 1;
  blocks: Array<{ name: string; category: BlockCategory; layouts: LayoutKind[]; routeBound: boolean }>;
}

/** What this release's storefront can render — emitted as web/dist/blocks.json (spec §8). */
export function blocksManifest(): BlocksManifest {
  return {
    schemaVersion: 1,
    blocks: Object.values(BLOCKS)
      .map((b) => ({ name: b.name, category: b.category, layouts: b.layouts === 'all' ? [...ALL] : [...b.layouts], routeBound: b.routeBound }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
```

Run: `UPDATE_BLOCKS_JSON=1 npm --prefix web test -- test/blocks-manifest.test.ts` (PowerShell: `$env:UPDATE_BLOCKS_JSON='1'; npm --prefix web test -- test/blocks-manifest.test.ts; Remove-Item Env:UPDATE_BLOCKS_JSON`)
Then: `npm --prefix web test -- test/blocks-manifest.test.ts`
Expected: PASS; `web/public/blocks.json` lists 45 blocks.

- [ ] **Step 4: Confirm the build emits it**

Run: `npm --prefix web run build`
Expected: exit 0 and `web/dist/blocks.json` exists with the same content.

- [ ] **Step 5: Write `docs/builder.md` (renderer half)**

Create `docs/builder.md` with exactly these sections, written from the code as it now stands (like `docs/templates.md`: when doc and code disagree, trust `web/src/builder/{types,define,guard,rules,render,runtime}.ts(x)`):

1. **What the page builder is** — two paragraphs: templates own the look, page documents own structure; every page (all three layouts) renders from a Puck-format document through the storefront's own renderer; no published set ⇒ the built-in defaults, which reproduce v0.6.0's DOM (proven by `e2e/dom-parity.spec.ts`).
2. **Data model** — the A4 type block verbatim from `web/src/builder/types.ts`; sparse sets; `page:<slug>` keys; root `title` / `description` / `chrome`.
3. **How a page renders** — `usePageSet(layout)` (public route through the Worker, 30 s edge cache, read once per page load, any failure ⇒ defaults) → `validateDoc` (unknown types dropped, props parsed field by field, depth ≤ 12, ≤ 2 000 blocks, duplicate ids re-keyed, rules ⇒ whole-doc fallback; memoised) → `RenderDoc` (no wrapper elements; per-block boundary renders nothing, route blocks escalate to the page boundary, which renders the default). `PuckShell`: layout frame + system mounts (§5.4 list: theme/first paint, `CartDrawer`, `LoginModal`, Telegram chrome and `PrimaryActionBar`, the phone cart bar when the shell document has none, preview listener, template `Overlay` slot, per-route title) and the `chrome: 'none'` swap to the chromeless frame.
4. **The block contract** — `defineBlock` fields; conventions (render returns JSX of an inner component, never hooks; slot renders and the `className`/`style`/`as` rule; prop naming: `*Html` richtext strings sanitised by `sanitizeRichtext`, `href`/`*Href` route links, `src`/`*Src` uploaded media only, `*Token` palette colours, `productId`/`categoryId`, `items: Array<{ productId }>`; no `{ type, props }` objects in non-slot arrays; `data-sf-block` on content roots; heavy components behind `lazy()`; mobile rules from docs/templates.md §7). "Adding a block": create `web/src/builder/blocks/<Name>.tsx` exporting `block` — the registry globs it; add a test; regenerate `blocks.json`.
5. **Block library** — one table generated by hand from `web/public/blocks.json` (name · category · layouts · route-bound · props), all 45 blocks, grouped Shell / Catalogue / Product / Commerce / Post-order / Content.
6. **Rules** — the `EXACTLY_ONE` / `AT_LEAST_ONE` / `PLACEMENT` / `SHELL_ONLY` tables from `rules.ts`, with the rule ids (`exactly-one:<Block>`, `at-least-one:catalog`, `placement:<Block>`, `layout:<Block>`, and the informational `drop:*` ids).
7. **Default documents** — per layout, the shell composition and each route's document (from `defaults/groups/*.ts`), and how `CatalogueBody` swaps in the trade list under wholesale mode.
8. **Core options per block** — `CoreOptionsScope`, the `inherit`/`show`/`hide` overrides on Header, ProductGrid, ProductList, WholesaleTable and ProductDetail.
9. **Media and the Worker** — upload path form, `/media/storefront-pages/media/<key>` Worker rule, `storefront/pages/:layout` 30 s edge cache.
10. **Testing** — `dom-parity.spec.ts` (how to regenerate a single snapshot and the rule that each regeneration is justified in its commit), `builder.spec.ts`, the unit files `test/builder-*.test.ts(x)`.
11. **The editor** — one paragraph: the `/__builder` editor (Plan 3) renders these same blocks inside `<Puck>` via `BuilderModeProvider` and `PageSetOverrideProvider`, speaks the admin postMessage protocol of spec §13 A6, and owns the bundle check that keeps `@puckeditor/core` out of the shopper bundle; its details live in `web/src/builder/editor/`.

- [ ] **Step 6: README**

In `README.md`:

a) After the `## Templates` section, add:

```markdown
## Page builder

Every page of every layout is a page-builder document rendered by the storefront's own
renderer (`web/src/builder/`). Owners compose pages in Admin → Storefront → Pages; with nothing
published, the built-in default documents reproduce the pre-builder storefront exactly. Block
contract, rules, default documents and the editor protocol: [`docs/builder.md`](docs/builder.md).
The build emits `web/dist/blocks.json`, the list of blocks this release can render.
```

b) In "What the Worker does", change the cache sentence to: "GET responses are edge-cached via the Cache API when the request is unauthenticated: `storefront/settings` and `storefront/pages/:layout` for 30s, `catalog` and `catalog/products/:id` for 60s; everything else bypasses the cache." and the media bullet to: "**`/media/*`** — a second, narrower proxy for public images (product photos, storefront/settings branding, page-builder uploads under `/media/storefront-pages/media/<key>`) with a 1-day edge cache and `Set-Cookie` stripped."

c) Add as the first bullet under `## Releases`:

```markdown
- v0.7.0 — Page builder. Every page (catalogue, product, cart, checkout, sign-in, account, order status, payment pages, tracking, verification) in every layout is now a page document the store can recompose in Admin → Storefront → Pages: reorder and hide sections, add headings, text, images, buttons, columns, sections, FAQs, testimonials, videos and featured products, link custom pages at `/pages/<slug>` from the header, and restyle the footer as columns — all in the store's own template. Checkout, cart, sign-in and account flows are self-contained blocks that cannot be broken by an edit: a page that fails its rules falls back to the built-in version. With nothing published the storefront looks and behaves exactly as v0.6.0. Deploy the backend first (it stores and serves page sets), then redeploy each client from the admin (this release), then the admin SPA. Nothing has been verified against a deployed client yet.
```

- [ ] **Step 7: Version**

Run: `npm --prefix web version 0.7.0 --no-git-tag-version`
Expected: `web/package.json` and `web/package-lock.json` read `0.7.0`.

- [ ] **Step 8: Final verification**

Run: `npm test && npm run typecheck && npm run build && npm run test:e2e`
Expected: all PASS; `web/dist/blocks.json` present.

- [ ] **Step 9: Commit**

```bash
git add web/src/builder/blocks-manifest.ts web/public/blocks.json web/test/blocks-manifest.test.ts docs/builder.md README.md web/package.json web/package-lock.json
git commit -m "docs(builder): blocks.json, docs/builder.md and the v0.7.0 release note; web 0.7.0"
```
