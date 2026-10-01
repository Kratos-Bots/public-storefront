# Product parts — Plan 1: Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `ecommerce-backend` accept, validate, sanitise, store, publish, restore and serve an optional `PageSet.cards` field (`{ tile?: PuckDoc, row?: PuckDoc }`), so a storefront v0.8.0 card design survives every save instead of being silently stripped by the page-set root.

**Architecture:** `src/modules/storefront-pages/schemas.ts` gains `cards: z.strictObject({ tile: puckDocSchema.optional(), row: puckDocSchema.optional() }).optional()` on `pageSetSchema`; `checkStructure` walks `cards.tile` / `cards.row` with the existing `walkDoc` (same component, type, id, depth, `blockStyle` and link rules, same shared 2 000-component budget, paths `['cards', kind, …]`); the sanitise transform runs `sanitizeHtmlProps` over `cards`; the raw and post-sanitise 512 KB gates already measure the whole set. The service needs **no code change** — publish and restore re-parse through `pageSetSchema` and the public read spreads the stored set minus `text` — so Task 2 only pins that with tests. `StoredPageSet` (a TS `jsonb` `$type`) gains `cards?`. No migration, no new route, no new limit, no protocol change.

**Tech Stack:** Express 5, Zod 4.3 (`z.strictObject`), Vitest 4, TypeScript 5.9.

**Spec:** `ecommerce-storefront/docs/superpowers/specs/2026-09-30-product-parts-design.md` — this plan implements §2 #6 and #12, §6.1 (storage shape), §10.1 and §14 step 1. Cross-stage rules: `ecommerce-storefront/docs/superpowers/specs/2026-09-30-puck-editable-overview.md`. House rules: `ecommerce-storefront/.superpowers/sdd/house-rules.md`.

All paths below are relative to `ecommerce-backend/` (the backend worktree on branch `feature/puck-editable`) unless they start with another repo name. The current HEAD already contains stage 1 (`text` in the page set) and stage 2 (`checkBlockStyle` in `walkComponent`); build on both, change neither.

## Global Constraints

- Work only in the `feature/puck-editable` worktree of `ecommerce-backend/`. Never touch the main checkout, never push, never merge.
- **Never touch a database.** `.env` holds a copy of production. Do not run `npm run dev`, `npm run db:push`, `npm run db:studio`, `npm run seed` or any `scripts/*.ts`. `npm run db:generate` only diffs local snapshot files (it does not connect) and is run once in Task 1 purely to prove there is **no** migration.
- Backend conventions (`CLAUDE.md`): extensionless imports; validation failures on this route are **400** via controller-side `.parse()` (already wired — do not touch the controller or router); the 400 `error` string is the ZodError rendering `"<path joined by '.'>: <message>; …"`.
- Exact shape (spec §6.1, §10.1): `cards` is **optional**; when present it is a **strict** object whose only keys are `tile` and `row`, each optional, each a page document of the same schema as `pages[*]` (`{ root: { props }, content, zones? }`). Absent kind = the storefront's built-in design. An unknown kind is a 400 (`cards: Unrecognized key: "<kind>"` — Zod 4.3's own message, verified).
- A card document is walked **exactly like a page**: component shape, `type` regex, `props.id` 1–64, slot depth ≤ 12, `blockStyle`, `*Url/*href/*src` link rule, `*Html` must be a string and is sanitised, every string ≤ 20 000 (before and after sanitising). Card components count toward the **one** 2 000-component budget of the set, and card bytes toward the **one** 512 KB cap. Issue paths start `cards.<kind>.` (with the `data.` prefix over HTTP).
- **No new limit** (spec §10.1), **no DB migration**, **no new route**, `protocol`/`schemaVersion` stay `1`. The shell-only rule (`chrome` must be `'shell'`) is **not** applied to card documents; their root props get the same defaults as a page's (`title: ''`, `description: ''`, `chrome: 'shell'`), which equal the storefront's `EMPTY_ROOT`.
- The backend never rewrites a valid `cards` beyond what it already does to pages: `*Html` sanitised, root-prop defaults filled, unknown `root` keys dropped. An absent `cards` must stay absent in the output (`'cards' in out === false`) — never `cards: undefined`, never `{}`.
- The backend still knows no blocks: it does not check that a card document holds a `CardTile`/`CardRow` frame, which parts it holds, or required parts — those are storefront rules (`exactly-one:CardTile`, `part-required:…`).
- Test gate: `npm test` (Vitest). `npx tsc --noEmit` skips `*.test.ts`, so run `npm test` too. Record the pass count before starting; it may only grow. Existing fixtures in `schemas.test.ts`, `service.test.ts`, `router.test.ts` are never edited.
- Test patterns allowed (existing ones only): the `problems()` / `set()` / `doc()` / `comp()` helpers in `schemas.test.ts`; the in-memory `./store` mock and `setWith()` / `pageRow()` / `draftRow()` helpers in `service.test.ts`; the express-on-port-0 + `fetch` harness (`call()`, `validSet()`, `svc`) in `router.test.ts`. No real Postgres, no supertest.
- Fixtures: "Northbound Supply" / `shop.example` only; no client brands, customer data or local paths in any committed file (the plan lives in the public storefront repo).
- Commit by explicit pathspec only (`git commit -m "…" -- <paths>`). Never `git add -A`, `git stash`, reset or checkout others' files. Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4
  ```
- If a sibling's file breaks typecheck/tests, wait a minute and re-run; never edit it. Blocked → report BLOCKED / NEEDS_CONTEXT.
- No task in this plan runs Playwright.

## Review Focus

1. **Stripped in transit (spec §16.3).** Anything that loses `cards` between request and response — the sanitise transform rebuilding the set without it, publish/restore re-parsing a stored draft, the public read's `withoutText` — silently discards an owner's card design on the next save or publish. Expect `cards` byte-equal (after root defaults) through PUT → publish → public read and through restore. (Task 1 round-trip test; Task 2 service tests; Task 3 HTTP test.)
2. **Absent vs empty.** A set without `cards` must come out without the key (not `cards: undefined`, which a later spread or `in` check would treat as present), and `cards: {}` / `cards: { row }` must come out with exactly the kinds sent — no invented `tile: undefined`. (Task 1 test.)
3. **Hostile or malformed `cards` bodies** — `null`, an array, a string, `{ tile: null }`, `{ tile: [] }`, a card doc with no `root`, the kind `__proto__` (an own key after `JSON.parse`), `constructor` — must be a clean 400, never a throw and never accepted through a prototype lookup. The walk iterates the fixed `CARD_KINDS` list, never `Object.entries(cards)`. (Task 1 test.)
4. **Budgets shared, not per document.** 2 000 components and 512 KB are per *set*: pages that fit on their own plus cards that fit on their own can together exceed either cap, and the error must be reported (at the first over-budget card component for the count; at the root for bytes). (Task 1 test.)
5. **Restoring an old version drops its absence faithfully.** Restoring a version published before any card design exists must produce a new version *without* `cards` (the built-in design), and restoring one with a design must bring that design back — the design versions with the layout (spec §6.1). A stored draft whose card design no longer validates must fail publish without writing anything. (Task 2 test.)

---

## File Structure

| File | Change | Owner |
|---|---|---|
| `src/modules/storefront-pages/schemas.ts` | + `CARD_KINDS`, `CardKind`; `cards` on `pageSetSchema`; walk in `checkStructure`; sanitise in the transform | Task 1 |
| `src/modules/storefront-pages/schemas.test.ts` | + one `describe` block at the end; one import name | Task 1 |
| `src/db/schema/storefront-pages.ts` | `StoredPageSet.cards?` (type only — `jsonb` `$type`, no SQL change) | Task 1 |
| `src/modules/storefront-pages/service.test.ts` | + one `describe` block at the end (publish / restore / public read carry `cards`) | Task 2 |
| `src/modules/storefront-pages/router.test.ts` | + one `describe` block at the end (HTTP: PUT keeps + sanitises, 400s, public read) | Task 3 |
| `STOREFRONT.md` | §3.11 public-read bullet; §6.2 "Card designs" paragraph; §7.2 deploy note | Task 3 |
| `CLAUDE.md` | "Storefront page builder" bullet: one clause | Task 3 |
| `src/docs/registry.ts` | `PUT /storefront-pages/{layout}/draft`: description clause + `cards` in the body schema | Task 3 |

**Waves:**
- **Wave 1:** Task 1.
- **Wave 2:** Task 2 and Task 3 in parallel (`Depends on: Task 1`; disjoint files).

`src/modules/storefront-pages/service.ts`, `controller.ts`, `router.ts` and `store.ts` are **not modified** by any task. If a Task 2/3 test can only pass by changing one of them, stop and report NEEDS_CONTEXT.

---

### Task 1: `cards` in the page-set schema — walked, blockStyle-checked, sanitised, size-capped

**Depends on:** nothing. **Wave 1.**

**Files:**
- Modify: `src/modules/storefront-pages/schemas.ts` (constants block after `CUSTOM_PAGE_KEY_RE`, ~line 21; `checkStructure`, ~lines 213–242; `pageSetSchema`, ~lines 300–319)
- Modify: `src/db/schema/storefront-pages.ts` (`StoredPageSet`, ~lines 18–24)
- Test: `src/modules/storefront-pages/schemas.test.ts` (import list + new `describe` at the end of the file)

**Interfaces:**
- Consumes: existing private `walkDoc(doc, path, w)`, `sanitizeHtmlProps(value, key)`, `isPlainObject`, `WalkState`, `puckDocSchema` in `schemas.ts`; stage 2's `checkBlockStyle` (already called from `walkComponent`, so reached through `walkDoc` with no extra wiring).
- Produces (exported from `schemas.ts`):
  ```ts
  export const CARD_KINDS: readonly ['tile', 'row'];
  export type CardKind = 'tile' | 'row';
  // pageSetSchema output gains:
  //   cards?: { tile?: PuckDocOut; row?: PuckDocOut }   (absent key when not sent)
  ```
  and in `src/db/schema/storefront-pages.ts`:
  ```ts
  export interface StoredPageSet { …; cards?: Partial<Record<'tile' | 'row', StoredPuckDoc>> }
  ```
  Issue paths: `cards` (shape / unknown kind), `cards.<kind>.…` (anything inside a card document).

- [ ] **Step 1: Record the baseline**

Run: `npm test 2>&1 | tail -5`
Expected: all passing. Note the file/test counts in your report.

- [ ] **Step 2: Write the failing tests**

In `src/modules/storefront-pages/schemas.test.ts`, extend the existing import from `./schemas` (keep it alphabetical):

```ts
import {
  BLOCK_STYLE_VALUES,
  CARD_KINDS,
  layoutParamSchema,
  pageSetSchema,
  publishBodySchema,
  restoreBodySchema,
  saveDraftBodySchema,
  versionParamSchema,
} from './schemas';
```

Then append at the end of the file:

```ts
describe('pageSetSchema — card designs (product-parts §6.1, §10.1)', () => {
  // The storefront's default arrangements (spec §5.3). The backend knows none
  // of these types — they are just well-formed components to it.
  const defaultTile = () => doc([comp('CardTile', {
    content: [
      comp('CardTileImage'),
      comp('CardTileGroup', { kind: 'body', items: [
        comp('CardTileName'),
        comp('CardTileFlags'),
        comp('CardTileGroup', { kind: 'foot', items: [comp('CardTilePrice'), comp('CardTileAdd')] }),
      ] }),
    ],
  })]);
  const defaultRow = () => doc([comp('CardRow', {
    content: [
      comp('CardRowGroup', { kind: 'text', items: [comp('CardRowName'), comp('CardRowMeta')] }),
      comp('CardRowPrice'),
      comp('CardRowAdd'),
    ],
  })]);
  const withCards = (cards: unknown, pages: Record<string, unknown> = {}) => ({ ...set(pages), cards });
  type WithCards = { cards?: Record<string, { root: { props: Record<string, unknown> }; content: Array<{ props: Record<string, unknown> }> }> };
  const LINK_MSG = 'Links must be https:, mailto:, tel: or a site path starting with /';

  it('exports the two card kinds (spec §6.1 CardKind)', () => {
    expect(CARD_KINDS).toEqual(['tile', 'row']);
  });

  it('keeps both card documents on the parsed output, unchanged', () => {
    const cards = { tile: defaultTile(), row: defaultRow() };
    const out = pageSetSchema.parse(withCards(cards)) as unknown as WithCards;
    expect(out.cards).toEqual(cards);
  });

  it('accepts one kind alone and an empty object, inventing no kind', () => {
    const one = pageSetSchema.parse(withCards({ row: defaultRow() })) as unknown as WithCards;
    expect(Object.keys(one.cards!)).toEqual(['row']);
    const none = pageSetSchema.parse(withCards({})) as unknown as WithCards;
    expect(none.cards).toEqual({});
  });

  it('does not invent `cards` when the set has none', () => {
    expect('cards' in pageSetSchema.parse(set())).toBe(false);
  });

  it('fills a card document\'s missing root props with the page defaults and drops unknown root keys', () => {
    const card = { root: { props: {}, stray: 1 }, content: [comp('CardTile')] };
    const out = pageSetSchema.parse(withCards({ tile: card })) as unknown as WithCards;
    expect(out.cards!.tile.root).toEqual({ props: { title: '', description: '', chrome: 'shell' } });
  });

  it('does not apply the shell\'s chrome rule to a card document', () => {
    expect(problems(withCards({ tile: doc([comp('CardTile')], { chrome: 'none' }) }))).toEqual([]);
  });

  it('round-trips through the publish/restore re-parse unchanged', () => {
    const saved = pageSetSchema.parse(withCards(
      { tile: defaultTile(), row: defaultRow() },
      { catalog: doc([comp('ProductGrid')]) },
    ));
    expect(pageSetSchema.parse(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it('keeps `text` and `cards` side by side', () => {
    const text = { strings: { en: { 'cart.drawer.title': 'Northbound basket' } } };
    const out = pageSetSchema.parse({ ...withCards({ tile: defaultTile() }), text }) as unknown as WithCards & { text: unknown };
    expect(out.text).toEqual(text);
    expect(Object.keys(out.cards!)).toEqual(['tile']);
    expect(out.cards!.tile.content).toHaveLength(1);
  });

  it('rejects an unknown card kind loudly (strict), naming it', () => {
    expect(problems(withCards({ tile: defaultTile(), grid: defaultTile() }))).toEqual(['cards: Unrecognized key: "grid"']);
  });

  it.each(['__proto__', 'constructor', 'Tile', 'tiles', ''])('rejects the kind %j without throwing', (kind) => {
    const input = JSON.parse(JSON.stringify(set()).replace(/}$/, `,"cards":{${JSON.stringify(kind)}:{"root":{"props":{}},"content":[]}}}`)) as unknown;
    expect(() => pageSetSchema.safeParse(input)).not.toThrow();
    expect(pageSetSchema.safeParse(input).success).toBe(false);
  });

  it.each([
    ['null', null], ['an array', []], ['a string', 'tile'], ['a number', 1],
    ['a null document', { tile: null }], ['an array document', { tile: [] }],
    ['a document without root', { tile: { content: [] } }], ['a document without content', { row: { root: { props: {} } } }],
  ])('rejects cards that is %s with a 400-style issue, never a throw', (_label, cards) => {
    const input = withCards(cards);
    expect(() => pageSetSchema.safeParse(input)).not.toThrow();
    const found = problems(input);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((p) => p.startsWith('cards'))).toBe(true);
  });

  it('walks a card document like a page: type, id, depth', () => {
    expect(problems(withCards({ tile: doc([{ type: 'cardTile', props: { id: 't' } }]) })))
      .toEqual(['cards.tile.content.0.type: Invalid component type']);
    expect(problems(withCards({ row: doc([{ type: 'CardRow', props: { id: 'r'.repeat(65) } }]) })))
      .toEqual(['cards.row.content.0.props.id: props.id must be a string of 1-64 characters']);
    expect(problems(withCards({ tile: doc([nest(13)]) })).join('\n'))
      .toMatch(/^cards\.tile\.content\.0\..*: Components may be nested at most 12 levels deep$/m);
    expect(problems(withCards({ tile: doc([comp('CardTile', { content: ['not a component'] })]) })))
      .toEqual([]); // a plain string inside an array is a prop value, not a component — same rule as pages
  });

  it('walks zones inside a card document', () => {
    const tile = { ...doc([comp('CardTile')]), zones: { 'CardTile-1:content': [{ type: 'bad type', props: { id: 'z' } }] } };
    expect(problems(withCards({ tile }))).toEqual(['cards.tile.zones.CardTile-1:content.0.type: Invalid component type']);
  });

  it('checks blockStyle on card components, including nested in a slot', () => {
    const tile = doc([comp('CardTile', { blockStyle: { radius: 'card' }, content: [comp('CardTilePrice', { blockStyle: { bg: 'hotpink', nope: 'x' } })] })]);
    expect(problems(withCards({ tile }))).toEqual([
      'cards.tile.content.0.props.content.0.props.blockStyle.bg: Invalid value for style setting',
      'cards.tile.content.0.props.content.0.props.blockStyle.nope: Unknown style setting',
    ]);
  });

  it('accepts every blockStyle value on a card component', () => {
    const content = Object.entries(BLOCK_STYLE_VALUES).flatMap(([key, values]) =>
      (values as readonly string[]).map((v) => comp('CardRowMeta', { blockStyle: { [key]: v } })));
    expect(problems(withCards({ row: doc(content) }))).toEqual([]);
  });

  it('applies the link rule inside a card document', () => {
    expect(problems(withCards({ row: doc([comp('CardRow', { href: 'javascript:alert(1)' })]) })))
      .toEqual([`cards.row.content.0.props.href: ${LINK_MSG}`]);
    expect(problems(withCards({ tile: doc([comp('CardTile', { content: [comp('CardTileName', { imageSrc: '//shop.example/x.png' })] })]) })))
      .toEqual([`cards.tile.content.0.props.content.0.props.imageSrc: ${LINK_MSG}`]);
    expect(problems(withCards({ tile: doc([comp('CardTile', { linkUrl: 'https://shop.example/p/1' })]) }))).toEqual([]);
  });

  it('rejects a non-string *Html prop inside a card document', () => {
    expect(problems(withCards({ tile: doc([comp('CardTile', { noteHtml: ['<p>x</p>'] })]) })))
      .toEqual(['cards.tile.content.0.props.noteHtml: Rich text must be an HTML string']);
  });

  it('sanitises *Html inside card documents (and still in pages)', () => {
    sanitizeSpy.calls = 0;
    const out = pageSetSchema.parse(withCards(
      { tile: doc([comp('CardTile', { content: [comp('CardTileNote', { bodyHtml: '<p onclick="x()">Hi</p>' })] })]) },
      { catalog: doc([comp('RichText', { bodyHtml: '<p onclick="y()">Shop</p>' })]) },
    )) as unknown as WithCards & Loose;
    const tileProps = out.cards!.tile.content[0].props as { content: Array<{ props: { bodyHtml: string } }> };
    expect(tileProps.content[0].props.bodyHtml).toBe('<p>Hi</p>');
    expect(out.pages.catalog.content[0].props.bodyHtml).toBe('<p>Shop</p>');
    expect(sanitizeSpy.calls).toBe(2);
  });

  it('re-applies the 20 000-char cap to sanitised richtext inside a card document', () => {
    const html = '<a href="https://shop.example">x</a>'.repeat(500); // 18 000 raw, ~31 000 once rel is forced
    expect(html.length).toBeLessThanOrEqual(20_000);
    expect(problems(withCards({ tile: doc([comp('CardTileNote', { bodyHtml: html })]) })).join('\n'))
      .toMatch(/cards\.tile\.content\.0\.props\.bodyHtml: Text is limited to 20000 characters/);
  });

  it('counts card components toward the one 2 000-component budget, reporting the first one over', () => {
    const pages = { catalog: doc(Array.from({ length: 1997 }, () => comp('Spacer'))) }; // + 1 PageOutlet in the shell = 1998
    expect(problems(withCards({ tile: doc([comp('CardTileName'), comp('CardTilePrice')]) }, pages))).toEqual([]);
    expect(problems(withCards({ tile: doc([comp('CardTileName'), comp('CardTilePrice'), comp('CardTileAdd')]) }, pages)))
      .toEqual(['cards.tile.content.2: A page set may contain at most 2000 components']);
  });

  it('counts card bytes toward the one 512 KB cap', () => {
    const heavy = (n: number) => doc(Array.from({ length: n }, () => comp('CardTileName', { text: 'x'.repeat(19_000) })));
    expect(problems(withCards({ tile: heavy(30) }))).toContain(': A page set may be at most 512 KB');
    expect(problems(withCards({ tile: heavy(20) }))).toEqual([]);
    // Pages and cards that each fit alone must not fit together.
    const pages = { catalog: doc(Array.from({ length: 15 }, () => comp('Heading', { text: 'x'.repeat(19_000) }))) };
    expect(problems(set(pages))).toEqual([]);
    expect(problems(withCards({ tile: heavy(15) }))).toEqual([]);
    expect(problems(withCards({ tile: heavy(15) }, pages))).toContain(': A page set may be at most 512 KB');
  });

  it('a request body with a bad card fails saveDraftBodySchema with the data. prefix', () => {
    const r = saveDraftBodySchema.safeParse({ data: withCards({ row: doc([comp('CardRowPrice', { blockStyle: { fg: 'inherit' } })]) }), baseVersion: 0 });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => `${i.path.join('.')}: ${i.message}`))
      .toEqual(['data.cards.row.content.0.props.blockStyle.fg: Invalid value for style setting']);
  });
});
```

A note for the implementer, not code to change:
- `CardTileNote` / `imageSrc` / `linkUrl` / `noteHtml` are not real storefront parts — they exist only to prove the backend walks every prop of every card component the same way it walks pages.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/modules/storefront-pages/schemas.test.ts`
Expected: FAIL — `CARD_KINDS` imports as `undefined` (mirror test fails); every "keeps" test fails because the non-strict root strips `cards` (`expected undefined to deeply equal {…}`); every rejection test inside `cards` fails with `expected [] to equal [...]` because nothing is walked. The pre-existing tests (including the stage-2 `blockStyle` block) stay green. That is the expected red — and it is exactly the production bug spec §10.1 warns about.

- [ ] **Step 4: Implement in `schemas.ts`**

(a) After the `CUSTOM_PAGE_KEY_RE` line, add:

```ts
/** Product card designs (product-parts spec §6.1): per layout, sparse like
 *  `pages`; an absent kind means the storefront's built-in design. Mirrors
 *  the storefront's `CardKind` — change both together, backend FIRST: an
 *  older backend strips `cards` on every save. */
export const CARD_KINDS = ['tile', 'row'] as const;
export type CardKind = (typeof CARD_KINDS)[number];
```

(b) Replace the `checkStructure` signature and add the card walk after the custom-page count check (before the final `for (const issue of w.issues)` loop):

```ts
function checkStructure(
  set: { shell: unknown; pages: Record<string, unknown>; cards?: Partial<Record<CardKind, unknown>> },
  ctx: z.RefinementCtx,
): void {
```

```ts
  // Card documents share the set's component budget and byte cap. The fixed
  // kind list — never Object.entries(set.cards) — so nothing but tile/row is
  // ever walked (unknown kinds are already a strict-object 400).
  if (set.cards) {
    for (const kind of CARD_KINDS) {
      if (set.cards[kind] !== undefined) walkDoc(set.cards[kind], ['cards', kind], w);
    }
  }
```

(c) Before `pageSetSchema`, add:

```ts
/** `PageSet.cards` (product-parts §10.1). STRICT: an unknown kind is a loud
 *  400 in autosave, never silently dropped. */
const cardsSchema = z.strictObject({
  tile: puckDocSchema.optional(),
  row: puckDocSchema.optional(),
});
```

(d) Replace the `pageSetSchema` definition (keep its doc comment, extending it by one sentence: "`cards` (card designs) is walked, sanitised and size-capped exactly like `pages`.") with:

```ts
export const pageSetSchema = z
  .object({
    schemaVersion: z.literal(1),
    shell: puckDocSchema,
    pages: z.record(z.string(), puckDocSchema),
    text: pageTextSchema.optional(),
    cards: cardsSchema.optional(),
  })
  .superRefine(checkStructure)
  .transform((set) => ({
    ...set,
    shell: sanitizeHtmlProps(set.shell, '') as typeof set.shell,
    pages: sanitizeHtmlProps(set.pages, '') as typeof set.pages,
    // Conditional spread: an absent `cards` must stay absent, never `cards: undefined`.
    ...(set.cards !== undefined ? { cards: sanitizeHtmlProps(set.cards, '') as typeof set.cards } : {}),
  }))
  .superRefine(checkSize);
```

`checkSize` and the raw-size gate at the top of `checkStructure` already serialise the whole set, so no change is needed there.

- [ ] **Step 5: Implement in `src/db/schema/storefront-pages.ts`**

In `StoredPageSet`, after `text?`, add:

```ts
  /** Product card designs per kind (product-parts §6.1). Absent kind = the
   *  storefront's built-in design. Validated like `pages`. */
  cards?: Partial<Record<'tile' | 'row', StoredPuckDoc>>;
```

(A string union, not an import of `CardKind`: `src/db/schema/` must not import from `src/modules/` — drizzle-kit loads these files on its own.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/modules/storefront-pages/schemas.test.ts`
Expected: PASS — every pre-existing test plus the new block. If the 2 000-component test reports a different path, check that the card walk runs **after** `pages` (walk order: shell, pages, cards) — fix the code, not the test.

- [ ] **Step 7: Prove there is no migration**

Run: `npm run db:generate`
Expected: drizzle-kit reports no schema changes and **no new file** appears under `drizzle/` (`git status --short drizzle/` prints nothing). If a migration file is generated, delete that file only, do not commit it, and report NEEDS_CONTEXT.

- [ ] **Step 8: Full gate**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -5`
Expected: typecheck clean (the zod output `cards` is assignable to `StoredPageSet['cards']` wherever the service stores `data`); test count = baseline + the new tests, all passing (`service.test.ts`, `router.test.ts` unchanged and green).

- [ ] **Step 9: Self-review, then commit**

Check: no existing fixture edited; `cards` absent in = absent out; the walk iterates `CARD_KINDS`; the shell chrome rule is untouched; `service.ts`/`controller.ts` untouched.

```bash
git commit -m "feat(storefront-pages): validate and store optional PageSet.cards card designs (product parts §10.1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- src/modules/storefront-pages/schemas.ts src/modules/storefront-pages/schemas.test.ts src/db/schema/storefront-pages.ts
```

---

### Task 2: publish, restore and the public read carry `cards` (service tests)

**Depends on:** Task 1. **Wave 2** (parallel with Task 3; disjoint files).

**Files:**
- Test: `src/modules/storefront-pages/service.test.ts` (new `describe` at the end of the file; no other line changes)

**Interfaces:**
- Consumes: Task 1's `pageSetSchema` keeping `cards`; existing test helpers `setWith(title)`, `pageRow(layout, version)`, `draftRow(layout)`, `publishedVersions(layout)`, `mem`, `service`, and `SaveDraftInput` in `service.test.ts`. Existing service functions `saveDraft`, `publish`, `restoreVersion`, `getVersion`, `getPublishedPageSet` (unchanged).
- Produces: nothing code-level — tests that pin spec §10.1 "publish/restore/public read carry it".

- [ ] **Step 1: Write the tests**

Append to `src/modules/storefront-pages/service.test.ts`:

```ts
describe('card designs travel with the layout (product-parts §6.1, §10.1)', () => {
  const root = { props: { title: '', description: '', chrome: 'shell' } };
  const tileDoc = (name: string) => ({
    root,
    content: [{ type: 'CardTile', props: { id: 'tile', content: [{ type: 'CardTileName', props: { id: `tile-${name}` } }] } }],
  });
  const rowDoc = { root, content: [{ type: 'CardRow', props: { id: 'row', content: [{ type: 'CardRowName', props: { id: 'row-name' } }] } }] };
  const withCards = (title: string, cards: unknown) => ({ ...setWith(title), cards });
  const cardsOf = (data: unknown) => (data as { cards?: unknown }).cards;

  it('publish re-validates the draft and stores its cards on the new version', async () => {
    const cards = { tile: tileDoc('a'), row: rowDoc };
    await service.saveDraft('storefront', { data: withCards('A', cards), baseVersion: 0 } as SaveDraftInput, 9);
    await service.publish('storefront', { baseVersion: 0 }, 9);
    expect(cardsOf(pageRow('storefront', 1).data)).toEqual(cards);
    expect((await service.getVersion('storefront', 1)).data).toHaveProperty('cards', cards);
  });

  it('a draft without cards publishes a version without the key (built-in designs)', async () => {
    await service.saveDraft('menu', { data: setWith('A'), baseVersion: 0 } as SaveDraftInput, 9);
    await service.publish('menu', { baseVersion: 0 }, 9);
    expect(pageRow('menu', 1).data).not.toHaveProperty('cards');
  });

  it('a stored draft whose card design no longer validates publishes nothing', async () => {
    // Seeded directly (bypassing the controller's parse), as if saved under older rules.
    const bad = withCards('A', { tile: { root, content: [{ type: 'CardTile', props: { id: 'tile', blockStyle: { bg: '#fff' } } }] } });
    mem.rows.push({ id: mem.nextId++, layout: 'menu', kind: 'draft', version: 0, data: bad, createdBy: 9, textVersion: null, createdAt: new Date(), updatedAt: new Date() });
    await expect(service.publish('menu', { baseVersion: 0 }, 9)).rejects.toBeInstanceOf(ZodError);
    expect(publishedVersions('menu')).toEqual([]);
  });

  it('restore brings back a version\'s card design, and restoring one from before any design removes it', async () => {
    await service.saveDraft('webapp', { data: setWith('plain'), baseVersion: 0 } as SaveDraftInput, 9);
    await service.publish('webapp', { baseVersion: 0 }, 9); // v1: no cards
    await service.saveDraft('webapp', { data: withCards('designed', { tile: tileDoc('v2') }), baseVersion: 1 } as SaveDraftInput, 9);
    await service.publish('webapp', { baseVersion: 1 }, 9); // v2: tile design

    await service.restoreVersion('webapp', 1, 9); // v3 = v1
    expect(pageRow('webapp', 3).data).not.toHaveProperty('cards');
    expect(draftRow('webapp')!.data).not.toHaveProperty('cards');

    await service.restoreVersion('webapp', 2, 9); // v4 = v2
    expect(cardsOf(pageRow('webapp', 4).data)).toEqual({ tile: tileDoc('v2') });
    expect(cardsOf(draftRow('webapp')!.data)).toEqual({ tile: tileDoc('v2') });
    expect(cardsOf(pageRow('webapp', 2).data)).toEqual({ tile: tileDoc('v2') }); // history untouched
  });

  it('the public read returns cards with the set (only text is stripped) without mutating the stored row', async () => {
    const cards = { row: rowDoc };
    const overrides = { strings: { en: { 'cart.drawer.title': 'Northbound basket' } } };
    mem.rows.push({ id: mem.nextId++, layout: 'menu', kind: 'published', version: 1, data: { ...withCards('A', cards), text: overrides }, createdBy: 9, textVersion: 0, createdAt: new Date(), updatedAt: new Date() });
    const pub = await service.getPublishedPageSet('menu');
    expect(pub!.data).toHaveProperty('cards', cards);
    expect(pub!.data).not.toHaveProperty('text');
    expect(pageRow('menu', 1).data).toHaveProperty('text', overrides);
  });

  it('the public read never serves a draft\'s card design', async () => {
    seedPublished('menu', [1]);
    await service.saveDraft('menu', { data: withCards('draft', { tile: tileDoc('draft') }), baseVersion: 1 } as SaveDraftInput, 9);
    expect((await service.getPublishedPageSet('menu'))!.data).not.toHaveProperty('cards');
  });
});
```

(`ZodError`, `seedPublished`, `publishedVersions`, `pageRow`, `draftRow`, `setWith`, `mem`, `service` and `SaveDraftInput` are already imported/defined at the top of this file.)

- [ ] **Step 2: Run them**

Run: `npx vitest run src/modules/storefront-pages/service.test.ts`
Expected: PASS with **no change to `service.ts`**. If the publish/restore tests lose `cards`, Task 1 has not landed in this tree (the non-strict root is still stripping it) — stop and report NEEDS_CONTEXT; do not edit `schemas.ts` or `service.ts` here.

- [ ] **Step 3: Full gate**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -5`
Expected: typecheck clean; all tests pass (Task 1's count + 6, plus Task 3's if it has landed).

- [ ] **Step 4: Self-review, then commit**

Check: no existing test or helper in the file edited; fixture copy uses "Northbound" only.

```bash
git commit -m "test(storefront-pages): publish, restore and public read carry PageSet.cards

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- src/modules/storefront-pages/service.test.ts
```

---

### Task 3: HTTP contract tests + docs

**Depends on:** Task 1. **Wave 2** (parallel with Task 2; disjoint files).

**Files:**
- Test: `src/modules/storefront-pages/router.test.ts` (new `describe` at the end of the file)
- Modify: `STOREFRONT.md` — §3.11 (the `data` bullet under `GET /public/storefront/pages/:layout`, ~line 858); §6.2 (after the "**Block styles** …" paragraph, ~line 1297); §7.2 (after the "**Block styling (storefront v0.8.0):** …" paragraph, ~line 1404)
- Modify: `CLAUDE.md` (the "**Storefront page builder**" bullet, ~line 107)
- Modify: `src/docs/registry.ts` (the `put` `/api/v1/storefront-pages/{layout}/draft` entry, ~line 1694)

**Interfaces:**
- Consumes: Task 1's behaviour — `cards` kept, unknown kind `cards: Unrecognized key: "<kind>"`, inner issues at `cards.<kind>.…`; the existing `call()`, `validSet()`, `svc` in `router.test.ts`.
- Produces: nothing code-level; the documented contract the storefront and admin plans read.

- [ ] **Step 1: Write the HTTP tests**

Append to `src/modules/storefront-pages/router.test.ts`:

```ts
describe('card designs over HTTP (product-parts §10.1)', () => {
  const root = { props: { title: '', description: '', chrome: 'shell' } };
  const tile = () => ({
    root,
    content: [{ type: 'CardTile', props: { id: 'tile', content: [
      { type: 'CardTileName', props: { id: 'tile-name' } },
      { type: 'CardTileNote', props: { id: 'tile-note', bodyHtml: '<p onclick="x()">Northbound</p>' } },
    ] } }],
  });

  it('PUT draft keeps cards and sanitises *Html inside them', async () => {
    svc.saveDraft.mockResolvedValue({ baseVersion: 0, updatedAt: '2026-09-30T00:00:00.000Z' });
    const res = await call('PUT', '/storefront-pages/storefront/draft', { data: { ...validSet(), cards: { tile: tile() } }, baseVersion: 0 });
    expect(res.status).toBe(200);
    const stored = svc.saveDraft.mock.calls[0][1].data.cards;
    expect(Object.keys(stored)).toEqual(['tile']);
    expect(stored.tile.content[0].props.content[0]).toEqual({ type: 'CardTileName', props: { id: 'tile-name' } });
    expect(stored.tile.content[0].props.content[1].props.bodyHtml).toBe('<p>Northbound</p>');
  });

  it('PUT draft without cards passes no cards key to the service', async () => {
    svc.saveDraft.mockResolvedValue({ baseVersion: 0, updatedAt: 'x' });
    await call('PUT', '/storefront-pages/menu/draft', { data: validSet(), baseVersion: 0 });
    expect(svc.saveDraft.mock.calls[0][1].data).not.toHaveProperty('cards');
  });

  it('an unknown card kind is a 400 naming it, never reaching the service', async () => {
    const res = await call('PUT', '/storefront-pages/menu/draft', { data: { ...validSet(), cards: { tile: tile(), list: tile() } }, baseVersion: 0 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/data\.cards: Unrecognized key: "list"/);
    expect(svc.saveDraft).not.toHaveBeenCalled();
  });

  it('a bad link and a bad blockStyle inside a card document are a 400 naming the path', async () => {
    const bad = tile();
    const inner = bad.content[0].props.content as Array<{ props: Record<string, unknown> }>;
    inner[0].props.href = 'javascript:alert(1)';
    inner[0].props.blockStyle = { shadow: 'huge' };
    const res = await call('PUT', '/storefront-pages/menu/draft', { data: { ...validSet(), cards: { tile: bad } }, baseVersion: 0 });
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toMatch(/data\.cards\.tile\.content\.0\.props\.content\.0\.props\.href: Links must be/);
    expect(error).toMatch(/data\.cards\.tile\.content\.0\.props\.content\.0\.props\.blockStyle\.shadow: Invalid value for style setting/);
    expect(svc.saveDraft).not.toHaveBeenCalled();
  });

  it('the public read returns cards verbatim', async () => {
    const body = { version: 4, data: { ...validSet(), cards: { row: { root, content: [{ type: 'CardRow', props: { id: 'row' } }] } } }, text: null };
    svc.getPublishedPageSet.mockResolvedValue(body);
    const res = await call('GET', '/public/storefront/pages/menu', undefined, { 'x-test-role': 'nobody' });
    expect(await res.json()).toEqual({ success: true, data: body, error: null });
  });
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/modules/storefront-pages/router.test.ts`
Expected: PASS. If the first case sees `cards` as `undefined`, Task 1 has not landed in this tree — stop and report NEEDS_CONTEXT; do not re-implement it here.

- [ ] **Step 3: `STOREFRONT.md` §3.11**

Replace the bullet

```markdown
- `data` is the published page set **without** its `text` field (its per-layout overrides arrive
  as `text.layout` instead), or `null` when this layout has never been published.
```

with

```markdown
- `data` is the published page set **without** its `text` field (its per-layout overrides arrive
  as `text.layout` instead), or `null` when this layout has never been published. It includes
  `cards` (storefront v0.8.0 card designs, §6.2) whenever the published set has it.
```

- [ ] **Step 4: `STOREFRONT.md` §6.2**

After the "**Block styles** …" paragraph (ending `…the backend still knows no blocks.`), add:

```markdown
**Card designs** (storefront v0.8.0, spec `2026-09-30-product-parts-design.md` §6.1, §10.1): a
page set may carry `cards: { tile?: PuckDoc, row?: PuckDoc }` — the layout's product-card and
product-row designs. `cards` is a **strict** object: any other key is a 400 at `cards`
(`Unrecognized key: "<kind>"`); an absent kind (or an absent `cards`) means the storefront's
built-in design, and the backend never invents one. Each card document has the same shape as a
page and is validated exactly like one (component shape, `type`, `props.id`, nesting, block
styles, links, `*Html` sanitised, 20 000-char strings), with issue paths under `cards.<kind>.…`;
its components count toward the set's one 2 000-component budget and its bytes toward the one
512 KB cap. The shell's `chrome: 'shell'` rule does not apply; missing root props get the page
defaults. Which blocks a card document may hold (its frame, its parts, required parts) is
checked by the storefront only. `cards` publishes, versions and restores with the layout
(restoring a version that has no `cards` returns every card to the built-in design) and is
served by the public read (§3.11). No migration: `data` is JSON.
```

- [ ] **Step 5: `STOREFRONT.md` §7.2**

After the "**Block styling (storefront v0.8.0):** …" paragraph, add:

```markdown
**Product parts and card designs (storefront v0.8.0):** deploy the backend first — a
validation change only (no migration, no new endpoint). **Never reverse the order:** an older
backend's page-set root is a non-strict object and silently strips `PageSet.cards` on every
autosave, discarding card designs. A storefront rolled back to v0.7.0 ignores `cards` (built-in
cards) and the part blocks it does not know. Then redeploy storefronts to v0.8.0, then the admin
SPA (an older admin publishes card-only edits only alongside a page edit).
```

- [ ] **Step 6: `CLAUDE.md`**

In the "**Storefront page builder**" bullet, replace

`…change both together, backend first; per-block allowlists stay storefront-side).`

with

`…change both together, backend first; per-block allowlists stay storefront-side); an optional strict `cards: { tile?, row? }` (product card designs, storefront v0.8.0) is walked, sanitised and size-capped exactly like `pages`, sharing the 2 000-component and 512 KB budgets — an older backend strips it, so backend deploys first.`

- [ ] **Step 7: `src/docs/registry.ts`**

In the `put` `/api/v1/storefront-pages/{layout}/draft` entry:

(a) in `description`, replace

`A component props.blockStyle must be an object of known style keys with their exact enum values (STOREFRONT.md §6.2). Body limit 1 MB, page set ≤ 512 KB.`

with

`A component props.blockStyle must be an object of known style keys with their exact enum values (STOREFRONT.md §6.2). Optional cards { tile?, row? } (strict) holds card-design documents validated like pages and sharing the set's limits. Body limit 1 MB, page set ≤ 512 KB.`

(b) in the request body schema, replace

`data: z.object({ schemaVersion: z.literal(1), shell: z.object({}).passthrough(), pages: z.record(z.string(), z.object({}).passthrough()) })`

with

`data: z.object({ schemaVersion: z.literal(1), shell: z.object({}).passthrough(), pages: z.record(z.string(), z.object({}).passthrough()), cards: z.object({ tile: z.object({}).passthrough().optional(), row: z.object({}).passthrough().optional() }).optional() })`

- [ ] **Step 8: Full gate**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -5`
Expected: typecheck clean; all tests pass (Task 1's count + 5, plus Task 2's if it has landed). The OpenAPI registry builds at import time, so a malformed edit there fails typecheck or the suite.

- [ ] **Step 9: Self-review, then commit**

Check: the documented shape matches `cardsSchema` exactly; no absolute paths, usernames or client names in any doc; the §7.2 order (backend → storefront → admin) matches spec §14.

```bash
git commit -m "docs(storefront-pages): PageSet.cards contract, deploy order and HTTP tests

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- src/modules/storefront-pages/router.test.ts STOREFRONT.md CLAUDE.md src/docs/registry.ts
```

---

## Cross-plan contract assumptions

- **Exact `cards` shape (spec §6.1, §10.1):** `PageSet.cards?: { tile?: PuckDoc; row?: PuckDoc }` — key `cards` on the page-set root, next to `schemaVersion`, `shell`, `pages`, `text`. Kinds are exactly `'tile'` and `'row'` (`CardKind`); the storefront's doc keys are `` `card:${kind}` `` (`card:tile`, `card:row`), which are **editor/storefront names only — never stored as keys** in `pages` or `cards`. Each value is a full page document `{ root: { props: { title, description, chrome } }, content: ComponentData[], zones? }`.
- **Strictness:** the backend's `cards` object is strict (`z.strictObject`): any key other than `tile`/`row` is a 400 `data.cards: Unrecognized key: "<kind>"`. The storefront's `toPageSet` and editor `protocol.ts` must send only those two keys; `cards: null` is a 400 (send the key absent, never `null`).
- **Absent vs empty:** absent `cards` stays absent in storage and in the public read; `cards: {}` is accepted and stored as `{}` (the storefront treats it as "no designs"). An absent kind = built-in design; the backend never adds either kind.
- **Root props of a card document:** the backend fills missing `title`/`description`/`chrome` with `''`/`''`/`'shell'` (= the storefront's `EMPTY_ROOT`) and drops unknown keys on `root` itself (keeps unknown keys on `root.props`); it does not enforce `chrome`. The storefront ignores card-document root props.
- **Limits:** none new. Card documents share the set's 2 000 components (walk order shell → pages → cards) and 512 KB; per-document nesting ≤ 12, `props.id` ≤ 64, strings ≤ 20 000. The storefront's own card-document guard (frame + family parts only, `exactly-one:CardTile`/`CardRow`, required/unique/requires parts) is not mirrored in the backend.
- **Publish / restore / public read:** unchanged endpoints and response shapes; `data.cards` rides along in `GET /:layout/draft`, `GET /:layout/versions/:version`, publish, restore and `GET /public/storefront/pages/:layout` (`data` minus `text` only). Restoring a version without `cards` produces a version without `cards`. No new socket event; `storefront-pages:published` covers card-only publishes.
- **Admin:** the admin's publish diff must treat `card:tile` / `card:row` as documents (spec §10.2) or a card-only draft shows no diff; the backend's publish accepts a draft that differs from the latest version only in `cards` (it never compares).
- **Deploy order:** backend first (an older backend strips `cards` on autosave), then storefront v0.8.0, then admin — documented in `STOREFRONT.md` §7.2.
