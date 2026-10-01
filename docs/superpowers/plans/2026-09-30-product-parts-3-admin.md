# Product Parts — Plan 3: Admin SPA (card designs in types, protocol, publish diff, preview) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin's Storefront Settings → **Pages** tab carry, diff and label a layout's product card designs (`PageSet.cards`), so a card-only edit in the editor shows up in the publish dialog and can be published, and version previews show the cards that version had.

**Architecture:**
- `PageSet.cards?: Partial<Record<CardKind, PuckDoc>>` and `CardKey` (`card:tile` / `card:row`) join the admin's type mirror; `DocKey` grows `CardKey`.
- `labels.ts` names the two card documents ("Product card", "Product row"). `diff.ts`'s `docsOf` lists them and `rank` puts them after the fixed routes and before custom pages. Card rows get their own notes ("Custom design" / "Built-in design" / "Edited").
- `protocol.ts`'s `pageSetSchema` (a `looseObject`, which already keeps `cards`) gains an explicit, structural `cards` entry, so a malformed card set is refused and a check can prove `cards` travels. `parseBuilderMessage` keeps forwarding the frame's own objects.
- No component changes: `PublishDialog` already renders whatever `diffPageSets` returns in its Added/Changed/Removed groups; `PagesTab`'s issue banner already uses `docLabel`; version previews already post the version's whole `data`. The last task proves all three in a mocked browser pass.

**Tech Stack:** React 19, @tanstack/react-query 5, ky via `@/lib/api-client.ts`, zod 4. Scratch checks run on Node 22 with built-in type stripping (the admin has no unit test runner). The browser pass is a throwaway Playwright script that borrows the storefront worktree's installed `playwright`.

**Spec:** `ecommerce-storefront/docs/superpowers/specs/2026-09-30-product-parts-design.md`.
- **§10.2 is this plan's section.** Also read §6.1 (storage shape), §10.1 (backend: strict `cards`, public read), §10.3 (storefront transport), §14 item 3 (delivery), §16 item 3 ("stripped in transit").
- Also read the overview `ecommerce-storefront/docs/superpowers/specs/2026-09-30-puck-editable-overview.md` (cross-stage rules).

## Global Constraints

- **Where to work:** the `feature/puck-editable` worktree of `ecommerce-admin-frontend/`. Its HEAD already includes the stage-1 Site text work in `src/features/storefront-settings/pages/`. Never create a branch, never touch the main checkout. Run every `npm`/`npx`/`node` command from that repo's root. The sibling worktree `ecommerce-storefront/` sits next to it (`../ecommerce-storefront`).
- **Commits:** by explicit pathspec only: `git commit -m "…" -- <paths>`. This plan creates no repo files, so no `git add` is needed. Never `git add -A`, `git stash`, reset, or checkout someone else's files — other implementers share this worktree. Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4
  ```
- **Never push or merge.** Never touch live systems: no live backend, DB, S3, Telegram, Cloudflare or Bird. Every API call in this plan's checks is mocked.
- **Shape (spec §6.1), verbatim:**
  ```ts
  export type CardKind = 'tile' | 'row';
  export type CardKey = `card:${CardKind}`;
  export type DocKey = RouteKey | 'shell' | CardKey;
  export interface PageSet { schemaVersion: 1; shell: PuckDoc; pages: …; text?: PageText; cards?: Partial<Record<CardKind, PuckDoc>> }
  ```
  Absent kind = the built-in design. A card document's root props are ignored by the storefront; the admin never reads them.
- **Labels and notes (asserted by Task 3):** `card:tile` → **"Product card"**, `card:row` → **"Product row"**. In the publish diff a card document that appears → note **"Custom design"**, disappears → **"Built-in design"**, differs → **"Edited"**. Order: `shell`, fixed routes (existing order), `card:tile`, `card:row`, then custom pages (alphabetical).
- **Protocol:** `protocol` stays `1`. `cards` inside `sf-builder-change.pageSet` is checked structurally only (an object whose `tile`/`row`, when present, are documents); unknown kinds pass (the backend's strict schema is the validator of record and 400s them). The forwarded `pageSet` is the frame's own object, never a parsed copy.
- **Imports:** `@/…` with explicit `.ts`/`.tsx` extensions; files inside `pages/` import each other as `./x.ts`. `labels.ts`, `diff.ts` and `protocol.ts` stay React-free: only `import type` from `@/…`, value imports limited to `zod` and `./labels.ts`, so `node` loads them directly.
- **Copy is literal English** in `src/features/storefront-settings/` (no `useTranslation`, no locale keys — `npm run build` runs `scripts/check-locale-parity.mjs`).
- **Lint is a regression gate** (it already fails on main). Baseline: **43 errors / 25 warnings** repo-wide. Every task must leave totals ≤ baseline and add **zero** problems in files it touched. Use the gate script below.
- **Scratch folder** (never committed): `$SCRATCH` is a folder named `product-parts-admin` inside the session scratchpad directory named in your system prompt. Set it in every shell, e.g. `SCRATCH="<scratchpad>/product-parts-admin"; mkdir -p "$SCRATCH"`. No scratch path ever goes into a committed file.
- **Lint gate script** — `$SCRATCH/lint-gate.mjs`. If it is missing, write it with exactly this content (Tasks 1 and 2 may both write it in parallel; identical content makes that harmless):
  ```js
  // Usage (from the admin repo root): node "$SCRATCH/lint-gate.mjs" <path-substring> [...]
  // Fails if repo-wide totals exceed the baseline, or any file matching a substring has a problem.
  import { execSync } from 'node:child_process';
  const BASE_E = Number(process.env.LINT_BASE_E ?? 43);
  const BASE_W = Number(process.env.LINT_BASE_W ?? 25);
  let out;
  try { out = execSync('npx eslint . -f json', { cwd: process.cwd(), maxBuffer: 64 << 20 }).toString(); }
  catch (e) { out = e.stdout.toString(); }
  const now = JSON.parse(out);
  const [ne, nw] = now.reduce((a, f) => [a[0] + f.errorCount, a[1] + f.warningCount], [0, 0]);
  const subs = process.argv.slice(2);
  const touched = now.filter((f) => subs.some((s) => f.filePath.replace(/\\/g, '/').includes(s)) && f.messages.length > 0);
  console.log(`baseline ${BASE_E}e/${BASE_W}w  now ${ne}e/${nw}w`);
  for (const f of touched) for (const m of f.messages) console.log(`${f.filePath}:${m.line} ${m.ruleId} ${m.message}`);
  if (ne > BASE_E || nw > BASE_W || touched.length > 0) { console.error('LINT GATE FAILED'); process.exit(1); }
  console.log('LINT GATE OK');
  ```
  Run it once **before your first edit**. If the totals already differ from 43/25 (the tree drifts), note the observed numbers in your report and export them as `LINT_BASE_E` / `LINT_BASE_W` for the rest of your task.
- **Deploy order** (spec §14): backend → storefront v0.8.0 → **admin last**. An old admin against the new storefront publishes cards only alongside a page edit; nothing here assumes an old backend.
- **Fixtures:** "Northbound Supply" / `shop.example` only.

## Parallelisation map

| Wave | Tasks | Depends on |
|---|---|---|
| 1 | **T1** types, labels, diff (`types/storefront-pages.ts`, `labels.ts`, `diff.ts`) · **T2** protocol (`protocol.ts`) | — (disjoint files) |
| 2 | **T3** mocked Playwright pass + final gates (**the only task that runs Playwright**, port 5299) | T1, T2 |

T2 only needs the `PageSet` type to compile, and the optional `cards` field is additive, so T2 builds before or after T1 lands. If `npm run build` in T2 fails in a T1 file, wait a minute and re-run (house rule 12); never edit it.

## Review Focus

1. **A card-only edit must be publishable.** Editing only the tile design (no page touched) must list "Product card · Edited" in the dialog and leave its Publish button enabled — not "Nothing to publish". (T1 check; T3 step R3.)
2. **`cards` silently dropped on the way.** Frame → autosave PUT → publish dialog → version preview must all carry the exact object; a parse-and-rebuild anywhere would strip it. (T2 identity checks; T3 R2 PUT body, R6 preview load.)
3. **Removing a design is a change, empty is not.** A kind that disappears is "Removed · Built-in design"; `cards: {}`, `cards` absent and `cards: null` (never sent, but tolerated) compare equal. (T1 check.)
4. **Issue banner labels for card documents.** An editor issue with `docKey: 'card:tile'` reads "Product card: …", never the raw key; a hostile or unknown key like `card:constructor` falls back to the raw key, never `Object.prototype` junk. (T1 check; T3 R4.)
5. **Deterministic order.** Card rows sort after all fixed routes and before custom pages, tile before row, regardless of object key order. (T1 check.)

---

### Task 1: Types, labels and publish diff for card designs

**Files:**
- Modify: `src/types/storefront-pages.ts` (the `DocKey` line and `PageSet`)
- Modify: `src/features/storefront-settings/pages/labels.ts`
- Modify: `src/features/storefront-settings/pages/diff.ts` (`docsOf`, `rank`, `diffPageSets`)
- Scratch: `$SCRATCH/t1.check.mjs`

**Depends on:** nothing (wave 1, parallel with Task 2).

**Interfaces:**
- Consumes: existing `PuckDoc`, `RouteKey`, `FixedRouteKey`, `FIXED_ROUTE_ORDER`, `docLabel`, `stableStringify`.
- Produces:
  ```ts
  // @/types/storefront-pages.ts
  export type CardKind = 'tile' | 'row';
  export type CardKey = `card:${CardKind}`;
  export type DocKey = RouteKey | 'shell' | CardKey;
  // PageSet gains: cards?: Partial<Record<CardKind, PuckDoc>>;
  // ./labels.ts
  export const CARD_LABELS: Record<CardKind, string>;          // { tile: 'Product card', row: 'Product row' }
  export const CARD_KINDS: readonly CardKind[];                 // ['tile', 'row'] — also the diff order
  export function cardKey(kind: CardKind): CardKey;             // 'card:tile'
  export function cardKindOf(key: string): CardKind | null;     // 'card:row' → 'row'; anything else → null
  docLabel(key: DocKey, doc?: PuckDoc | null): string           // unchanged signature; card keys → CARD_LABELS
  // ./diff.ts — unchanged signatures; DiffEntry.key may now be a CardKey
  diffPageSets(published: PageSet | null, draft: PageSet | null): PageSetDiff
  ```

- [ ] **Step 1: Set up scratch and check the lint baseline**

```bash
SCRATCH="<scratchpad>/product-parts-admin"   # see Global Constraints
mkdir -p "$SCRATCH"
git status --short                 # note anything already dirty; never stage it
```

Write `$SCRATCH/lint-gate.mjs` from Global Constraints if it is missing, then run `node "$SCRATCH/lint-gate.mjs" storefront-settings/pages/labels.ts`. Expected: `baseline 43e/25w  now 43e/25w` and `LINT GATE OK` (see Global Constraints if the totals drifted).

- [ ] **Step 2: Write the failing check** — `$SCRATCH/t1.check.mjs`

```js
// Run from the admin repo root: node "$SCRATCH/t1.check.mjs"
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const load = (p) => import(pathToFileURL(resolve(p)).href);
const L = await load('src/features/storefront-settings/pages/labels.ts');
const d = await load('src/features/storefront-settings/pages/diff.ts');

// ---- labels ----
assert.equal(L.docLabel('card:tile'), 'Product card');
assert.equal(L.docLabel('card:row'), 'Product row');
assert.equal(L.docLabel('card:constructor'), 'card:constructor', 'prototype names are not labels');
assert.equal(L.docLabel('card:'), 'card:');
assert.equal(L.docLabel('product'), 'Product', 'routes unchanged');
assert.equal(L.docLabel('shell'), 'Site shell (header & footer)');
assert.deepEqual([...L.CARD_KINDS], ['tile', 'row']);
assert.equal(L.cardKey('row'), 'card:row');
assert.equal(L.cardKindOf('card:tile'), 'tile');
assert.equal(L.cardKindOf('card:toString'), null);
assert.equal(L.cardKindOf('page:card-tile'), null);

// ---- fixtures (Northbound Supply) ----
const doc = (types, title = '') => ({
  root: { props: { title, description: '', chrome: 'shell' } },
  content: types.map((type, i) => ({ type, props: { id: `${type}-${i}` } })),
});
const SHELL = doc(['Header', 'PageOutlet', 'Footer']);
const TILE_A = doc(['CardTile']);
const TILE_B = { ...doc(['CardTile']), content: [{ type: 'CardTile', props: { id: 'CardTile-0', content: [{ type: 'CardTilePrice', props: { id: 'p' } }] } }] };
const ROW_A = doc(['CardRow']);
const set = (extra = {}) => ({ schemaVersion: 1, shell: SHELL, pages: {}, ...extra });
const rows = (diff) => ({
  added: diff.added.map((e) => [e.key, e.label, e.note]),
  changed: diff.changed.map((e) => [e.key, e.label, e.note]),
  removed: diff.removed.map((e) => [e.key, e.label, e.note]),
});

// card-only add: listed, and the diff is not empty (Publish stays enabled)
let diff = d.diffPageSets(set(), set({ cards: { tile: TILE_A } }));
assert.deepEqual(rows(diff), { added: [['card:tile', 'Product card', 'Custom design']], changed: [], removed: [] });
assert.equal(d.diffIsEmpty(diff), false);

// card-only edit
diff = d.diffPageSets(set({ cards: { tile: TILE_A } }), set({ cards: { tile: TILE_B } }));
assert.deepEqual(rows(diff), { added: [], changed: [['card:tile', 'Product card', 'Edited']], removed: [] });

// removing a design = back to the built-in one
diff = d.diffPageSets(set({ cards: { row: ROW_A } }), set({ cards: {} }));
assert.deepEqual(rows(diff), { added: [], changed: [], removed: [['card:row', 'Product row', 'Built-in design']] });

// empty, absent and null cards are all "no designs"
assert.equal(d.diffIsEmpty(d.diffPageSets(set(), set({ cards: {} }))), true);
assert.equal(d.diffIsEmpty(d.diffPageSets(set({ cards: {} }), set())), true);
assert.equal(d.diffIsEmpty(d.diffPageSets(set({ cards: null }), set())), true);
// key order inside a card document never reads as a change
const TILE_A_REORDERED = { content: TILE_A.content, root: { props: { chrome: 'shell', description: '', title: '' } } };
assert.equal(d.diffIsEmpty(d.diffPageSets(set({ cards: { tile: TILE_A } }), set({ cards: { tile: TILE_A_REORDERED } }))), true);
// unknown kinds are ignored (the backend refuses them; they never reach a stored draft)
assert.equal(d.diffIsEmpty(d.diffPageSets(set(), set({ cards: { grid: TILE_A } }))), true);
// nothing published yet: a first publish with only a card design lists it
assert.deepEqual(rows(d.diffPageSets(null, set({ cards: { row: ROW_A } }))).added, [
  ['shell', 'Site shell (header & footer)', 'Customised'],
  ['card:row', 'Product row', 'Custom design'],
]);

// order: shell, fixed routes, card:tile, card:row, custom pages — whatever the object key order
diff = d.diffPageSets(null, set({
  pages: { 'page:about': doc(['Heading'], 'About'), product: doc(['ProductDetail']), catalog: doc(['ProductGrid']) },
  cards: { row: ROW_A, tile: TILE_A },
}));
assert.deepEqual(diff.added.map((e) => e.key), ['shell', 'catalog', 'product', 'card:tile', 'card:row', 'page:about']);
// routes and custom pages keep their notes
assert.deepEqual(diff.added.map((e) => e.note), ['Customised', 'Customised', 'Customised', 'Custom design', 'Custom design', 'New page']);
// the page diff still never looks at text
assert.equal(d.diffIsEmpty(d.diffPageSets(set({ text: { strings: { en: { a: 'x' } } } }), set({ text: { strings: { en: { a: 'y' } } } }))), true);
console.log('T1 CHECK OK');
```

- [ ] **Step 3: Run it to see it fail**

Run: `node "$SCRATCH/t1.check.mjs"`. Expected: FAIL at the first assertion (`'card:tile'` is returned instead of `'Product card'`).

- [ ] **Step 4: Types** — in `src/types/storefront-pages.ts`, replace the `DocKey` line and extend `PageSet`:

```ts
/** Product card designs (product-parts spec §6.1): one optional document per kind, per layout. */
export type CardKind = 'tile' | 'row';
export type CardKey = `card:${CardKind}`;
export type DocKey = RouteKey | 'shell' | CardKey;
```

and inside `interface PageSet`, after `text?: PageText;`:

```ts
  /**
   * This layout's product card designs (product-parts spec §6.1). Sparse like `pages`: an absent
   * kind renders the built-in card. A card document's root props are ignored by the storefront.
   */
  cards?: Partial<Record<CardKind, PuckDoc>>;
```

- [ ] **Step 5: Labels** — in `labels.ts`, change the type import and add the card names; `docLabel` gains the card branch:

```ts
import type { CardKey, CardKind, DocKey, FixedRouteKey, LayoutKind, PuckDoc } from '@/types/storefront-pages.ts';
```

After `LAYOUT_LABELS`:

```ts
/** Product card designs (product-parts spec §10.2), in the order the diff summary lists them. */
export const CARD_LABELS: Record<CardKind, string> = {
  tile: 'Product card',
  row: 'Product row',
};
export const CARD_KINDS = Object.keys(CARD_LABELS) as readonly CardKind[];

export function cardKey(kind: CardKind): CardKey {
  return `card:${kind}`;
}

/** 'card:tile' → 'tile'; null for anything that is not a known card document key. */
export function cardKindOf(key: string): CardKind | null {
  if (!key.startsWith('card:')) return null;
  const kind = key.slice('card:'.length);
  return Object.hasOwn(CARD_LABELS, kind) ? (kind as CardKind) : null;
}
```

In `docLabel`, before the final `return`:

```ts
  if (key.startsWith('card:')) {
    const kind = cardKindOf(key);
    return kind ? CARD_LABELS[kind] : key;
  }
```

- [ ] **Step 6: Diff** — in `diff.ts`, import the card helpers, and replace `docsOf`, `rank` and the three push lines of `diffPageSets`:

```ts
import { CARD_KINDS, cardKey, cardKindOf, docLabel, FIXED_ROUTE_ORDER } from './labels.ts';
```

```ts
function docsOf(set: PageSet | null): Map<DocKey, PuckDoc> {
  const docs = new Map<DocKey, PuckDoc>();
  if (!set) return docs;
  docs.set('shell', set.shell);
  for (const [key, doc] of Object.entries(set.pages ?? {})) if (doc) docs.set(key as RouteKey, doc);
  // Only the known kinds: the backend refuses any other, so a stored draft never holds one.
  const cards = set.cards ?? null;
  if (cards) for (const kind of CARD_KINDS) {
    const doc = Object.hasOwn(cards, kind) ? cards[kind] : undefined;
    if (doc) docs.set(cardKey(kind), doc);
  }
  return docs;
}

/** shell, fixed routes (spec order), card designs (tile, row), then custom pages. */
function rank(key: DocKey): number {
  if (key === 'shell') return -1;
  const i = FIXED_ROUTE_ORDER.indexOf(key as FixedRouteKey);
  if (i !== -1) return i;
  const kind = cardKindOf(key);
  if (kind) return FIXED_ROUTE_ORDER.length + CARD_KINDS.indexOf(kind);
  return FIXED_ROUTE_ORDER.length + CARD_KINDS.length;
}
```

Inside `diffPageSets`, replace the `custom` line and the three pushes:

```ts
    const custom = key.startsWith('page:');
    const card = cardKindOf(key) !== null;
    const addedNote = custom ? 'New page' : card ? 'Custom design' : 'Customised';
    const removedNote = custom ? 'Deleted' : card ? 'Built-in design' : 'Reset to default';
    if (!was && now) out.added.push({ key, label: docLabel(key, now), note: addedNote });
    else if (was && !now) out.removed.push({ key, label: docLabel(key, was), note: removedNote });
    else if (was && now && stableStringify(was) !== stableStringify(now)) out.changed.push({ key, label: docLabel(key, now), note: 'Edited' });
```

Extend the module comment at the top of `diff.ts` with one sentence: `Card designs (PageSet.cards, product-parts spec §10.2) diff like documents: a kind that disappears means "back to the built-in design".`

- [ ] **Step 7: Run the check**

Run: `node "$SCRATCH/t1.check.mjs"`. Expected: `T1 CHECK OK`.

- [ ] **Step 8: Build and lint**

```bash
npm run build 2>&1 | tail -3        # success
node "$SCRATCH/lint-gate.mjs" types/storefront-pages.ts storefront-settings/pages/labels.ts storefront-settings/pages/diff.ts
```

Expected: build succeeds; `LINT GATE OK`.

- [ ] **Step 9: Commit**

```bash
git commit -m "feat(storefront-pages): publish diff lists and labels product card designs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- src/types/storefront-pages.ts src/features/storefront-settings/pages/labels.ts src/features/storefront-settings/pages/diff.ts
```

---

### Task 2: Protocol carries card designs

**Files:**
- Modify: `src/features/storefront-settings/pages/protocol.ts` (`pageSetSchema` only)
- Scratch: `$SCRATCH/t2.check.mjs`

**Depends on:** nothing (wave 1, parallel with Task 1).

**Interfaces:**
- Consumes: the existing `docSchema`, `parseBuilderMessage(data: unknown): BuilderInbound | null`, `loadMessage(loadId, layout, pageSet, theme, readOnly, siteText?)`.
- Produces: no new exports. Behaviour: an `sf-builder-change` whose `pageSet.cards` is present but not an object of documents parses to `null`; a valid one is forwarded as the frame's own object (`result.pageSet === msg.pageSet`); unknown kinds pass.

- [ ] **Step 1: Set up scratch and check the lint baseline** — same as Task 1 Step 1 (write `$SCRATCH/lint-gate.mjs` if missing), then `node "$SCRATCH/lint-gate.mjs" storefront-settings/pages/protocol.ts`. Expected: `LINT GATE OK`.

- [ ] **Step 2: Write the failing check** — `$SCRATCH/t2.check.mjs`

```js
// Run from the admin repo root: node "$SCRATCH/t2.check.mjs"
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const p = await import(pathToFileURL(resolve('src/features/storefront-settings/pages/protocol.ts')).href);

const doc = (types) => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content: types.map((type, i) => ({ type, props: { id: `${type}-${i}` } })) });
const set = (extra = {}) => ({ schemaVersion: 1, shell: doc(['Header', 'PageOutlet', 'Footer']), pages: {}, ...extra });
const change = (pageSet) => ({ type: 'sf-builder-change', loadId: 'load-1', pageSet, issues: [], textIssues: [] });

// valid cards travel, as the frame's own objects
const withCards = set({ cards: { tile: doc(['CardTile']), row: doc(['CardRow']) } });
const msg = change(withCards);
const parsed = p.parseBuilderMessage(msg);
assert.ok(parsed, 'valid cards parse');
assert.equal(parsed.pageSet, withCards, 'forwarded, not rebuilt');
assert.equal(parsed.pageSet.cards, withCards.cards);
assert.deepEqual(Object.keys(parsed.pageSet.cards), ['tile', 'row']);

// absent, empty, one kind
assert.ok(p.parseBuilderMessage(change(set())));
assert.ok(p.parseBuilderMessage(change(set({ cards: {} }))));
assert.ok(p.parseBuilderMessage(change(set({ cards: { row: doc(['CardRow']) } }))));
// unknown kinds pass: the backend's strict schema is the validator of record
assert.ok(p.parseBuilderMessage(change(set({ cards: { grid: doc(['CardTile']) } }))));

// malformed card sets are refused
assert.equal(p.parseBuilderMessage(change(set({ cards: 'tile' }))), null, 'string');
assert.equal(p.parseBuilderMessage(change(set({ cards: null }))), null, 'null is not "absent"');
assert.equal(p.parseBuilderMessage(change(set({ cards: [doc(['CardTile'])] }))), null, 'array');
assert.equal(p.parseBuilderMessage(change(set({ cards: { tile: { content: 'x' } } }))), null, 'tile not a document');
assert.equal(p.parseBuilderMessage(change(set({ cards: { row: { root: { props: {} } } } }))), null, 'row without content');

// loads (editing and read-only previews) carry the page set untouched
const theme = { template: 'modern', preset: 'default', options: {}, scheme: 'dark', colors: {}, fonts: {}, radius: 'none', density: 'comfortable' };
const load = p.loadMessage('load-2', 'menu', withCards, theme, true);
assert.equal(load.pageSet, withCards);
assert.equal(load.readOnly, true);
console.log('T2 CHECK OK');
```

- [ ] **Step 3: Run it to see it fail**

Run: `node "$SCRATCH/t2.check.mjs"`. Expected: FAIL with `string` (a `looseObject` currently lets `cards: 'tile'` through).

- [ ] **Step 4: Implement** — in `protocol.ts`, add `cards` to `pageSetSchema`:

```ts
const pageSetSchema = z.looseObject({
  schemaVersion: z.literal(1),
  shell: docSchema,
  pages: z.record(z.string(), docSchema),
  // Explicit so a malformed override set is refused, and a test can see `text` is carried.
  text: pageTextSchema.optional(),
  // Product card designs (product-parts spec §10.2). Same reason as `text`; unknown kinds pass
  // (loose) because the backend's strict schema is the validator of record.
  cards: z.looseObject({ tile: docSchema.optional(), row: docSchema.optional() }).optional(),
});
```

Nothing else changes: `parseBuilderMessage` already forwards `raw.pageSet`.

- [ ] **Step 5: Run the check**

Run: `node "$SCRATCH/t2.check.mjs"`. Expected: `T2 CHECK OK`.

- [ ] **Step 6: Build and lint**

```bash
npm run build 2>&1 | tail -3        # success (if a Task 1 file fails to compile, wait a minute and re-run)
node "$SCRATCH/lint-gate.mjs" storefront-settings/pages/protocol.ts
```

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(storefront-pages): builder protocol checks and carries product card designs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- src/features/storefront-settings/pages/protocol.ts
```

---

### Task 3: Mocked Playwright pass and final gates (owns Playwright)

**Files:**
- Scratch only (never committed): `$SCRATCH/cards-pass.mjs`, screenshots in `$SCRATCH/shots/`.
- No repo file changes unless the pass finds a bug. Then fix it in the owning task's file, re-run that task's check and lint gate, and commit it as `fix(storefront-pages): …` with the trailer, by pathspec. Load `frontend-design:frontend-design` first if the fix touches a component.

**Depends on:** Task 1, Task 2.

**Interfaces:**
- Consumes: the whole feature through the browser; `playwright` from `../ecommerce-storefront/node_modules/playwright` (Chromium already installed there).
- Produces: a pass/fail report and screenshots.

- [ ] **Step 1: Start Vite against a dead API port** (background)

```bash
VITE_API_BASE_URL=http://localhost:3999/api/v1 VITE_WS_URL=http://localhost:3999 npx vite --port 5299 --strictPort
```

Run it with `run_in_background`. Port 5299 because the storefront's e2e owns 5199. Nothing listens on 3999; `page.route` answers every call. Wait until `curl -s -o /dev/null -w '%{http_code}' http://localhost:5299/` prints `200`.

- [ ] **Step 2: Write the pass** — `$SCRATCH/cards-pass.mjs`

```js
// Run from the admin repo root: SCRATCH=… node "$SCRATCH/cards-pass.mjs"
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(resolve('../ecommerce-storefront/package.json'));
const { chromium } = require('playwright');
const SCRATCH = process.env.SCRATCH;
assert.ok(SCRATCH, 'set SCRATCH');
mkdirSync(`${SCRATCH}/shots`, { recursive: true });
const APP = 'http://localhost:5299';
const API = 'http://localhost:3999';
const SF = 'https://shop.example';
const WIDTH = Number(process.env.PASS_WIDTH ?? 1440);
const HEIGHT = Number(process.env.PASS_HEIGHT ?? 900);

// ---------- fixtures (Northbound Supply / shop.example only) ----------
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = `x.${b64({ sub: 1, exp: Math.floor(Date.now() / 1000) + 3600 })}.y`;
const USER = { id: 1, username: 'owner', name: 'Northbound Owner', role: 'admin', isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const OWNER = { id: 1, name: 'Northbound Owner' };
const at = (d) => `2026-09-${String(d).padStart(2, '0')}T10:00:00.000Z`;
const doc = (types) => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content: types.map((type, i) => ({ type, props: { id: `${type}-${i}` } })) });
const SHELL = doc(['Header', 'PageOutlet', 'Footer']);
const ROW_A = doc(['CardRow']);
const TILE_A = doc(['CardTile']);
const TILE_B = { ...TILE_A, content: [{ type: 'CardTile', props: { id: 'CardTile-0', content: [{ type: 'CardTilePrice', props: { id: 'CardTile-0-price' } }, { type: 'CardTileName', props: { id: 'CardTile-0-name' } }] } }] };
const PAGES = { catalog: doc(['CatalogHero', 'ProductGrid']) };
const P2 = { schemaVersion: 1, shell: SHELL, pages: PAGES };                            // no card designs
const P3 = { schemaVersion: 1, shell: SHELL, pages: PAGES, cards: { row: ROW_A } };     // live: a row design
const P_TILE = { ...P3, cards: { tile: TILE_A } };                                      // card-only: tile added, row removed
const P_TILE_B = { ...P3, cards: { tile: TILE_B } };                                    // card-only: tile edited
const T1 = { schemaVersion: 1, language: { locale: 'en', formatLocale: '' }, strings: { en: {} } };
const CARD_ISSUE = { docKey: 'card:tile', rule: 'part-requires:CardTileAdd.CardTilePrice', message: 'A product card with an add button must also show the price.', blockId: 'CardTile-0' };

const THEME = {
  template: 'modern', preset: 'default', options: {}, scheme: 'dark',
  colors: { primary: '#ffffff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' },
  fonts: { heading: null, body: null, mono: null }, radius: 'none', density: 'comfortable', customCss: '',
};
const days = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, { enabled: true, cutoff: '14:00', shipsOn: 'today' }]));
const SETTINGS = {
  enabled: true, closedMessage: '', welcomeMessage: null, notices: [], cutoffs: { timezone: 'Europe/London', days },
  paymentSlotCard: null, paymentSlotCrypto: null, whatsappDisplayNumber: null, supportLinks: [],
  brand: { name: 'Northbound Supply', shortName: 'Northbound', tagline: '', title: 'Northbound Supply', description: '', logoHeight: 32, links: { whatsapp: null, telegram: null } },
  features: { layout: 'storefront', ordering: true, guestCheckout: true, accounts: true, verify: true, tracking: true, wholesale: false, upsell: false },
  theme: THEME, guestCheckoutEnabled: true, turnstileSiteKey: null, turnstileSecretSet: false,
  trackingApiUrl: null, trackingApiKeySet: false, branding: { logoUrl: null, faviconUrl: null },
};
const MODERN = {
  id: 'modern', name: 'Modern', version: '1.0.0', description: 'The default storefront look.', author: 'Built-in', schemes: ['dark', 'light'],
  presets: [{ id: 'default', name: 'Default', scheme: 'dark', colors: THEME.colors, fonts: { heading: null, body: null, mono: null }, radius: 'none' }],
  defaultPreset: 'default', editable: { colors: Object.keys(THEME.colors), fonts: true, radius: true, density: true }, options: [], preview: null, builtIn: true,
};

// A stand-in for the storefront's /__builder that speaks the protocol.
const FAKE_BUILDER = `<!doctype html><html><body style="margin:0"><h1>Fake builder</h1><script>
  window.__received = [];
  let adminOrigin = null;
  window.__loadId = null;
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent) return;
    window.__received.push({ origin: e.origin, data: e.data });
    if (e.data && e.data.type === 'sf-builder-load') { if (!adminOrigin) adminOrigin = e.origin; window.__loadId = e.data.loadId; }
  });
  window.__send = (msg) => window.parent.postMessage({ ...msg, loadId: msg.loadId || window.__loadId }, adminOrigin || '*');
  window.parent.postMessage({ type: 'sf-builder-ready', protocol: 1 }, '*');
</script></body></html>`;

// ---------- mock backend ----------
function freshState() {
  return {
    calls: [],
    layouts: {
      storefront: { draft: P3, source: 'published', baseVersion: 3, versions: [
        { version: 3, data: P3, textVersion: 1, createdAt: at(28), createdBy: OWNER },
        { version: 2, data: P2, textVersion: 1, createdAt: at(20), createdBy: OWNER },
      ] },
      menu: { draft: null, source: 'none', baseVersion: 0, versions: [] },
      webapp: { draft: null, source: 'none', baseVersion: 0, versions: [] },
    },
    text: { draft: T1, source: 'published', baseVersion: 1, versions: [{ version: 1, data: T1, createdAt: at(15), createdBy: OWNER }] },
  };
}

async function handle(state, route) {
  const req = route.request();
  const path = req.url().replace(/^[^?]*\/api\/v1\//, '').replace(/\?.*$/, '');
  const method = req.method();
  const json = (req.headers()['content-type'] ?? '').includes('application/json') ? req.postDataJSON() : null;
  state.calls.push({ method, path, json });
  const ok = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data, error: null }) });
  const fail = (status, error) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: false, data: null, error }) });
  const T = state.text;
  const tLatest = T.versions[0]?.version ?? 0;
  let m;

  if (path === 'account/me') {
    return ok({ ...USER, email: null, avatarUrl: null, twoFactorRequired: false, totpEnabled: false, recoveryCodesRemaining: 0, passkeys: [],
      permissions: { modules: { dashboard: 'read', storefront: 'write', settings: 'write' }, landingModule: 'dashboard' } });
  }
  if (path === 'storefront-settings') return ok(SETTINGS);
  if (path === 'storefront-settings/templates') return ok({ source: 'live', tag: null, baseUrl: SF, templates: [MODERN] });
  if (path === 'storefront-deploy/target') return ok(null);

  if (path.startsWith('storefront-text/')) {
    const rest = path.slice('storefront-text/'.length);
    if (rest === 'draft' && method === 'GET') return ok({ source: T.source, data: T.draft, baseVersion: T.baseVersion, latestPublishedVersion: tLatest, updatedAt: null });
    if (rest === 'draft' && method === 'PUT') { T.draft = json.data; T.source = 'draft'; T.baseVersion = json.baseVersion; return ok({ baseVersion: json.baseVersion, updatedAt: at(30) }); }
    if (rest === 'versions' && method === 'GET') return ok(T.versions.map(({ version, createdAt, createdBy }) => ({ version, createdAt, createdBy })));
    if ((m = rest.match(/^versions\/(\d+)$/)) && method === 'GET') {
      const v = T.versions.find((x) => x.version === Number(m[1]));
      return v ? ok({ version: v.version, createdAt: v.createdAt, data: v.data }) : fail(404, 'Not found');
    }
  }

  if ((m = path.match(/^storefront-pages\/(storefront|menu|webapp)\/(.+)$/))) {
    const L = state.layouts[m[1]];
    const rest = m[2];
    const latest = L.versions[0]?.version ?? 0;
    if (rest === 'draft' && method === 'GET') {
      return ok({ layout: m[1], source: L.draft ? L.source : 'none', data: L.draft, baseVersion: L.baseVersion, latestPublishedVersion: latest, updatedAt: null });
    }
    if (rest === 'draft' && method === 'PUT') {
      if (json.baseVersion < latest) return fail(409, 'PAGESET_CONFLICT');
      L.draft = json.data; L.source = 'draft'; L.baseVersion = json.baseVersion;
      return ok({ baseVersion: json.baseVersion, updatedAt: at(30) });
    }
    if (rest === 'publish' && method === 'POST') {
      if (json.baseVersion < latest) return fail(409, 'PAGESET_CONFLICT');
      if (L.source !== 'draft') return fail(400, 'NO_DRAFT');
      const version = latest + 1;
      L.versions.unshift({ version, data: L.draft, textVersion: tLatest, createdAt: at(30), createdBy: OWNER });
      L.source = 'published'; L.baseVersion = version;
      return ok({ version, publishedAt: at(30), pagesPublished: true, textVersion: tLatest, textPublished: false });
    }
    if (rest === 'versions' && method === 'GET') {
      return ok(L.versions.map(({ version, createdAt, createdBy, textVersion }) => ({ version, createdAt, createdBy, textVersion })));
    }
    if ((m = rest.match(/^versions\/(\d+)$/)) && method === 'GET') {
      const v = L.versions.find((x) => x.version === Number(m[1]));
      return v ? ok({ version: v.version, createdAt: v.createdAt, data: v.data, textVersion: v.textVersion }) : fail(404, 'Not found');
    }
  }
  return route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, data: [], error: null, meta: { page: 1, limit: 20, totalItems: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false } }) });
}

async function openApp(state) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
  await context.addInitScript(({ token, u, app }) => {
    if (location.origin !== app) return;
    localStorage.setItem('access_token', token);
    localStorage.setItem('refresh_token', 'r');
    localStorage.setItem('auth_user', JSON.stringify(u));
  }, { token: TOKEN, u: USER, app: APP });
  await context.route(`${SF}/**`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: FAKE_BUILDER }));
  await context.route(`${API}/socket.io/**`, (route) => route.abort());
  await context.route(`${API}/api/v1/**`, (route) => handle(state, route));
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(`${APP}/storefront-settings?section=pages`);
  return { browser, page, pageErrors };
}

// ---------- helpers ----------
const frameOf = (page) => page.frames().find((f) => f.url().startsWith(SF));
async function until(page, fn, what, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`timed out waiting for ${what}`);
}
const loads = async (page) => (await frameOf(page).evaluate(() => window.__received)).filter((x) => x.data.type === 'sf-builder-load');
const lastLoad = async (page) => (await loads(page)).at(-1).data;
const send = (page, msg) => frameOf(page).evaluate((mm) => window.__send(mm), msg);
const change = (pageSet, issues = []) => ({ type: 'sf-builder-change', pageSet, issues, textIssues: [], siteText: T1 });
const callsTo = (state, method, path) => state.calls.filter((c) => c.method === method && c.path === path);
const pagePuts = (state) => callsTo(state, 'PUT', 'storefront-pages/storefront/draft');
const toolbar = (page) => page.getByRole('group', { name: 'Page builder toolbar' });
const publishBtn = (page) => toolbar(page).getByRole('button', { name: 'Publish' });
const dialogWith = (page, text) => page.getByRole('dialog').filter({ hasText: text });
const drawer = (page) => page.getByRole('dialog', { name: 'Published versions · Storefront' });
const shot = (page, name) => page.screenshot({ path: `${SCRATCH}/shots/${name}-${WIDTH}.png`, fullPage: true });
const step = (name) => console.log(`- ${name}`);
async function ready(page, count = 1) {
  await until(page, async () => frameOf(page) && (await loads(page)).length >= count, `load #${count}`);
}
/**
 * Elements inside `locator` whose content spills sideways (the root never scrolls; check each element).
 * Only `overflow-x: visible` boxes count: `truncate` (hidden) and scroll areas clip on purpose.
 */
const overflowing = (locator) => locator.evaluate((root) =>
  [root, ...root.querySelectorAll('*')].filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible').map((el) => el.className || el.tagName));

// ================= Run: card designs end to end =================
{
  const state = freshState();
  const { browser, page, pageErrors } = await openApp(state);
  try {
    step('R1 the load carries the live card designs');
    await ready(page);
    assert.deepEqual((await lastLoad(page)).pageSet.cards, P3.cards);
    await send(page, change(P3)); // baseline echo
    await page.waitForTimeout(1300);
    assert.equal(pagePuts(state).length, 0, 'baseline never saved');

    step('R2 a card-only edit autosaves with cards intact');
    await send(page, change(P_TILE));
    await until(page, async () => pagePuts(state).length === 1, 'page PUT');
    assert.deepEqual(pagePuts(state)[0].json, { data: P_TILE, baseVersion: 3 });

    step('R3 publish dialog lists the card changes and can publish');
    await until(page, async () => !(await publishBtn(page).isDisabled()), 'Publish enabled');
    await publishBtn(page).click();
    let pub = dialogWith(page, 'Publish Storefront pages');
    await pub.waitFor();
    await pub.getByRole('region', { name: 'Added' }).getByText('Product card').waitFor();
    assert.ok((await pub.getByRole('region', { name: 'Added' }).textContent()).includes('Custom design'));
    assert.ok((await pub.getByRole('region', { name: 'Removed' }).textContent()).includes('Product row'));
    assert.ok((await pub.getByRole('region', { name: 'Removed' }).textContent()).includes('Built-in design'));
    assert.equal(await pub.getByText(/Nothing to publish/).count(), 0);
    assert.equal(await pub.getByText('card:tile').count(), 0, 'no raw keys');
    assert.deepEqual(await overflowing(pub), [], 'dialog has no horizontal overflow');
    await shot(page, 'r3-publish-card-only');
    const confirmBtn = pub.getByRole('button', { name: 'Publish', exact: true });
    assert.equal(await confirmBtn.isDisabled(), false, 'a card-only edit is publishable');
    await confirmBtn.click();
    await until(page, async () => callsTo(state, 'POST', 'storefront-pages/storefront/publish').length === 1, 'publish POST');
    assert.equal(callsTo(state, 'POST', 'storefront-pages/storefront/publish')[0].json.baseVersion, 3);
    await page.getByText(/Published Storefront pages version 4/).waitFor();
    assert.deepEqual(state.layouts.storefront.versions[0].data.cards, P_TILE.cards, 'v4 stores the tile design');

    step('R4 a card document issue is labelled and blocks Publish');
    await send(page, change(P_TILE, [CARD_ISSUE]));
    await until(page, async () => publishBtn(page).isDisabled(), 'Publish disabled');
    await page.getByText('Product card: A product card with an add button must also show the price.').waitFor();
    assert.equal(await page.getByText(/card:tile/).count(), 0, 'no raw key in the banner');
    await shot(page, 'r4-card-issue');

    step('R5 editing the published tile shows as Edited');
    await send(page, change(P_TILE_B));
    await until(page, async () => pagePuts(state).some((c) => c.json.baseVersion === 4 && JSON.stringify(c.json.data.cards) === JSON.stringify(P_TILE_B.cards)), 'tile edit saved against v4');
    await until(page, async () => !(await publishBtn(page).isDisabled()), 'Publish re-enabled');
    await publishBtn(page).click();
    pub = dialogWith(page, 'Publish Storefront pages');
    await pub.waitFor();
    await pub.getByRole('region', { name: 'Changed' }).getByText('Product card').waitFor();
    assert.ok((await pub.getByRole('region', { name: 'Changed' }).textContent()).includes('Edited'));
    assert.equal(await pub.getByRole('region', { name: 'Added' }).count(), 0);
    assert.equal(await pub.getByRole('region', { name: 'Removed' }).count(), 0);
    await pub.getByRole('button', { name: 'Cancel' }).click();

    step('R6 previewing an older version posts its cards read-only; Back to draft restores the draft cards');
    await toolbar(page).getByRole('button', { name: 'Versions' }).click();
    await drawer(page).waitFor();
    const before = (await loads(page)).length;
    await drawer(page).getByRole('button', { name: 'Preview version 3' }).click();
    await ready(page, before + 1);
    let load = await lastLoad(page);
    assert.equal(load.readOnly, true);
    assert.deepEqual(load.pageSet.cards, P3.cards, 'v3 had only the row design');
    await page.getByText(/Previewing version 3/).waitFor();
    await page.getByRole('button', { name: 'Back to draft' }).click();
    await ready(page, before + 2);
    load = await lastLoad(page);
    assert.equal(load.readOnly, false);
    assert.deepEqual(load.pageSet.cards, P_TILE_B.cards, 'the saved draft cards come back');

    assert.deepEqual(pageErrors, [], 'no page errors');
    console.log('RUN OK');
  } finally {
    await browser.close();
  }
}
console.log('CARDS PASS OK');
```

- [ ] **Step 3: Run the pass (desktop, then phone width)**

```bash
node "$SCRATCH/cards-pass.mjs"
PASS_WIDTH=390 PASS_HEIGHT=844 node "$SCRATCH/cards-pass.mjs"
```

Expected: `RUN OK` and `CARDS PASS OK` both times.

Before blaming the code for a failure, check these known quirks:
- Seeded `auth_user` needs `name` and `updatedAt`; `/account/me` needs `permissions.modules`.
- Every tab of the settings page mounts, so an under-shaped mock crashes the shared error boundary. Look at `pageErrors` first.
- `PublishDialog`'s groups are `<section aria-label="Added|Changed|Removed">`; Playwright exposes a labelled `section` as role `region`. If that lookup misses, switch the script to `pub.locator('section[aria-label="Added"]')` — a script fix, not a code fix.
- The R5 PUT may be preceded by a PUT of the issue-bearing change from R4 (same page set, so usually deduped). Match on the tile content, as the script does, not on the PUT count.
- A selector miss on **"Product card"**, **"Product row"**, **"Custom design"**, **"Built-in design"** or **"Edited"** means Task 1 changed an asserted string. Restore it; never loosen the assertion.

Look at every screenshot in `$SCRATCH/shots/` (Read tool): the dialog lists read "Product card · Custom design" / "Product row · Built-in design" legibly, and the issue banner reads as a sentence at both widths.

- [ ] **Step 4: Final gates**

```bash
npm run build 2>&1 | tail -3        # success
node "$SCRATCH/lint-gate.mjs" types/storefront-pages.ts storefront-settings/pages/labels.ts storefront-settings/pages/diff.ts storefront-settings/pages/protocol.ts
node "$SCRATCH/t1.check.mjs" && node "$SCRATCH/t2.check.mjs"
git status --short                  # none of this plan's files left modified
git log --oneline -4
```

Stop Vite: `netstat -ano | grep :5299`, then `taskkill //PID <pid> //F //T`.

- [ ] **Step 5: Report**
  - Build result, lint numbers (baseline vs now), both check outputs, both pass outputs.
  - The screenshot list.
  - Any fix commits.
  - Named pending step: **live verification after deploy** (backend → storefront v0.8.0 → admin). In a test layout, edit only the product card design, confirm the publish dialog lists "Product card", publish, and check the grid under two templates. Nothing in this plan touched a live system.

---

## Self-review notes

- Spec §10.2 coverage: `PageSet.cards?` + `CardKey` in `DocKey` (T1 Step 4); `docsOf` adds `card:tile`/`card:row` (T1 Step 6); labels "Product card"/"Product row", ranked after the fixed routes (T1 Steps 5–6); protocol carries `cards` (T2); gates = build, lint vs baseline, mocked pass with a card-only edit enabling Publish (T3 R3).
- Not changed, by design: `PublishDialog.tsx`, `PagesTab.tsx`, `VersionsDrawer.tsx`, `use-pages-editor.ts` — they consume `diffPageSets` / `docLabel` / whole `PageSet` objects, which T3 proves end to end. The `product` document keeps the label "Product" in the menu and web-app publish dialogs, although the editor calls it "Product sheet" there (spec §11); the spec limits the admin to card labels, so this stays a known copy gap.

## Cross-plan contract assumptions

- **Keys:** card documents are `PageSet.cards.tile` / `PageSet.cards.row`, and editor issues about them carry `docKey: 'card:tile'` / `'card:row'` (spec §6.1, §4). No other kind exists this stage.
- **No designs = absent:** the storefront editor omits `cards` (or sends `{}`) when a layout has no card design; it never sends `cards: null` (the admin protocol refuses `null`, dropping that change). The admin treats `{}` and absent alike.
- **Backend passes `cards` through untouched** on draft GET, version detail GET (`storefront-pages/:layout/versions/:version` → `data.cards`), and restore; the admin forwards `data` verbatim into previews and loads.
- **Unknown kinds:** the admin protocol lets an unknown `cards` kind through (loose) and the diff ignores it; the backend's strict `cards` schema 400s it on autosave, which the admin shows as a save error as today.
- **Admin-only copy:** diff notes "Custom design" / "Built-in design" / "Edited" and labels "Product card" / "Product row" live only in the admin; the editor's own picker copy (spec §11: "Product cards" group, "Product card", "Product row") matches the labels.
- **Protocol version:** stays `1`; no new message types or fields beyond `pageSet.cards`.
- **Card document root props** are never read by the admin (`docLabel` ignores `root.props.title` for card keys).
