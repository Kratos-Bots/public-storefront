# Block styling — Plan 1: Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `ecommerce-backend` reject, with a 400 naming the path, any component whose `props.blockStyle` is not a plain object of at most 16 known style keys, each holding one of that key's exact enum strings — and change nothing else.

**Architecture:** `src/modules/storefront-pages/schemas.ts` gains a mirrored constant `BLOCK_STYLE_VALUES` (the storefront's `STYLE_KEYS`) and one function, `checkBlockStyle`, called from the existing structural walk (`walkComponent`) for every component — top-level, in slots, in zones, in the shell. Issues go through the walk's existing `report()` so they surface as ZodError issues → 400 `"path: message; …"` exactly like every other structural issue. The backend still knows no blocks: per-block allowlists stay a storefront concern. No DB migration, no HTTP/protocol change, no new limit.

**Tech Stack:** Express 5, Zod 4.3, Vitest 4, TypeScript 5.9 (target ES2022).

**Spec:** `ecommerce-storefront/docs/superpowers/specs/2026-09-30-block-styling-design.md` — this plan implements §2 #12, §3.1 (the value lists, mirrored), §10.3, the backend bullet of §12 and §13 step 1. Cross-stage rules: `ecommerce-storefront/docs/superpowers/specs/2026-09-30-puck-editable-overview.md`. House rules: `ecommerce-storefront/.superpowers/sdd/house-rules.md`.

All paths below are relative to `ecommerce-backend/` (the backend worktree on branch `feature/puck-editable`) unless they start with another repo name.

## Global Constraints

- Work only in the `feature/puck-editable` worktree of `ecommerce-backend/`. Never touch the main checkout, never push, never merge.
- **Never touch a database.** `.env` holds a copy of production. Do not run `npm run dev`, `npm run db:*`, `npm run seed` or any `scripts/*.ts`. This plan needs no migration (props are JSON).
- Backend conventions (`CLAUDE.md`): extensionless imports; validation failures on this route are **400** via controller-side `.parse()` (already wired — do not touch the controller); the error string is the ZodError rendering `"<path joined by '.'>: <message>; …"` from `src/middleware/error-handler.ts`.
- Stored values are **enum keys only** — no hex, no lengths, no free strings, and **no stored `inherit`** (spec §2 #3). Absent key = template default.
- The value lists are copied **verbatim** from spec §3.1 (see "Cross-plan contract assumptions"). `bg`/`fg`/`borderColor` take the 15 palette tokens **without `'none'`**; `'none'` is valid only for the spacing keys and `radius`.
- Issue messages (exact strings): `Unknown style setting`, `Invalid value for style setting` (spec §10.3); `Style settings must be an object`, `Style settings may have at most 16 keys` (this plan's choice for the two cases §10.3 names without wording).
- The backend never reorders, strips, defaults or rewrites `blockStyle`: a valid one is stored byte-for-byte as sent (spec §12 "accepted and stored unchanged"). Only a component's `props.blockStyle` is checked — not `root.props`, not keys on plain array items.
- Test gate: `npm test` (Vitest). `npx tsc --noEmit` skips `*.test.ts`, so run `npm test` too. Record the pass count before starting; it may only grow.
- Test patterns allowed (existing ones only): `pageSetSchema.safeParse` via the `problems()` helper in `schemas.test.ts`; the express-on-port-0 + `fetch` harness in `router.test.ts`. No real Postgres, no supertest.
- Commit by explicit pathspec only (`git commit -m "…" -- <paths>`). Never `git add -A`, `git stash`, reset or checkout others' files. Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4
  ```
- If a sibling's file breaks typecheck/tests, wait a minute and re-run; never edit it. Blocked → report BLOCKED / NEEDS_CONTEXT.
- No task in this plan runs Playwright.

## Review Focus

1. **Prototype-named keys** (`__proto__`, `constructor`, `toString`, `hasOwnProperty` — `JSON.parse` makes `__proto__` an own key) must be reported as `Unknown style setting`, never accepted via an inherited lookup and never throw. The lookup must be a `Map`, not `obj[key]`. (Task 1 test.)
2. **Non-string values that stringify to a valid one** (`['solid']`, `{ toString }`, the number `1` where a list has no numbers, `null`, `true`) must be `Invalid value for style setting` — a `.includes(String(v))`-style shortcut would let `['md']` through. (Task 1 test.)
3. **Plausible-but-foreign values** a future editor or a hand-edited body might send — `bg: 'none'` (valid palette-with-none token, invalid here), `radius: 'full'`, `padTop: '2rem'`, `bg: '#ffffff'`, `bg: 'var(--sf-bg)'`, `hide: 'both'`, casing (`'Surface'`), surrounding whitespace (`' md'`) — are all rejected. (Task 1 test.)
4. **A valid style survives the publish/restore re-parse unchanged** — `publish` and `restoreVersion` call `pageSetSchema.parse(stored)` again, so a style accepted on save must round-trip through `JSON.parse(JSON.stringify(parsed))` and a second parse to an equal object, key order included, or a saved draft would become unpublishable. (Task 1 test.)
5. **The check must not escape its scope** — a `blockStyle`-shaped object on `root.props` or on a plain (non-component) array item such as `FAQ.items[0]` is not a component style and must not be rejected, and every existing fixture in `schemas.test.ts` / `router.test.ts` must keep passing unedited. (Task 1 test + full suite.)

---

## File Structure

| File | Change | Owner |
|---|---|---|
| `src/modules/storefront-pages/schemas.ts` | + `BLOCK_STYLE_VALUES`, `BlockStyleKey`, `BLOCK_STYLE_MAX_KEYS`, private `BLOCK_STYLE_LOOKUP` + `checkBlockStyle`; one call in `walkComponent` | Task 1 |
| `src/modules/storefront-pages/schemas.test.ts` | + one `describe` block | Task 1 |
| `src/modules/storefront-pages/router.test.ts` | + two HTTP cases in `describe('drafts')` | Task 2 |
| `STOREFRONT.md` | §6.2 validation paragraph + §7.2 deploy note | Task 2 |
| `CLAUDE.md` | "Storefront page builder" bullet: one clause | Task 2 |
| `src/docs/registry.ts` | `PUT /storefront-pages/{layout}/draft` description: one clause | Task 2 |

**Waves:** Wave 1 = Task 1. Wave 2 = Task 2 (`Depends on: Task 1` — its HTTP test only passes once the check exists). Two tasks, disjoint files.

---

### Task 1: `blockStyle` validation in the structural walk

**Depends on:** nothing. **Wave 1.**

**Files:**
- Modify: `src/modules/storefront-pages/schemas.ts` (constants block after `URL_PROP_RE`, ~line 26; `walkComponent`, ~lines 101–123)
- Test: `src/modules/storefront-pages/schemas.test.ts` (new `describe` at the end of the file)

**Interfaces:**
- Consumes: existing private `isPlainObject`, `report`, `Path`, `WalkState` in `schemas.ts`.
- Produces (exported from `schemas.ts`, used by Task 2's test and by anyone mirroring the storefront list):
  ```ts
  export const BLOCK_STYLE_VALUES: {
    readonly bg: readonly [...15 palette tokens]; readonly fg: …; readonly padTop: readonly ['none','xs','sm','md','lg','xl']; …
  };                                             // 16 keys, spec §3.1 order
  export type BlockStyleKey = keyof typeof BLOCK_STYLE_VALUES;
  export const BLOCK_STYLE_MAX_KEYS: number;     // 16 = Object.keys(BLOCK_STYLE_VALUES).length
  ```
  Issue paths: `[…component path, 'props', 'blockStyle']` for the object-level issues, `[…, 'props', 'blockStyle', <key>]` for per-key issues.

- [ ] **Step 1: Record the baseline**

Run: `npm test 2>&1 | tail -5`
Expected: all passing. Note the file/test counts in your report.

- [ ] **Step 2: Write the failing tests**

Append to `src/modules/storefront-pages/schemas.test.ts`. First extend the existing import from `./schemas` (keep it alphabetical):

```ts
import {
  BLOCK_STYLE_VALUES,
  layoutParamSchema,
  pageSetSchema,
  publishBodySchema,
  restoreBodySchema,
  saveDraftBodySchema,
  versionParamSchema,
} from './schemas';
```

Then add at the end of the file:

```ts
describe('pageSetSchema — blockStyle (block-styling §10.3)', () => {
  const PALETTE = ['bg', 'bg-deep', 'surface', 'surface-2', 'surface-3', 'line', 'line-strong',
    'text', 'muted', 'faint', 'primary', 'primary-soft', 'success', 'warn', 'danger'];
  const SPACE = ['none', 'xs', 'sm', 'md', 'lg', 'xl'];
  const P = 'pages.catalog.content.0.props.blockStyle';

  it('mirrors the storefront STYLE_KEYS exactly (spec §3.1 — change both together, backend first)', () => {
    expect(BLOCK_STYLE_VALUES).toEqual({
      bg: PALETTE,
      fg: PALETTE,
      padTop: SPACE,
      padBottom: SPACE,
      padX: SPACE,
      marginTop: SPACE,
      marginBottom: SPACE,
      border: ['thin', 'medium', 'thick'],
      borderColor: PALETTE,
      borderStyle: ['solid', 'dashed', 'dotted'],
      radius: ['none', 'sm', 'md', 'lg', 'card', 'pill'],
      shadow: ['card', 'raised'],
      textSize: ['sm', 'lg', 'xl'],
      align: ['start', 'center', 'end'],
      maxWidth: ['narrow', 'text', 'wide'],
      hide: ['mobile', 'desktop'],
    });
    expect(Object.keys(BLOCK_STYLE_VALUES)).toEqual(['bg', 'fg', 'padTop', 'padBottom', 'padX', 'marginTop',
      'marginBottom', 'border', 'borderColor', 'borderStyle', 'radius', 'shadow', 'textSize', 'align', 'maxWidth', 'hide']);
  });

  it('accepts every value of every key', () => {
    const content = Object.entries(BLOCK_STYLE_VALUES).flatMap(([key, values]) =>
      (values as readonly string[]).map((v) => comp('Heading', { blockStyle: { [key]: v } })));
    expect(problems(catalogWith(...content))).toEqual([]);
  });

  it('accepts a fully styled block (all 16 keys) and stores it unchanged, key order included', () => {
    const style = {
      hide: 'desktop', bg: 'surface-2', fg: 'text', padTop: 'xl', padBottom: 'none', padX: 'lg', marginTop: 'xs',
      marginBottom: 'md', border: 'thick', borderColor: 'primary', borderStyle: 'dashed', radius: 'card',
      shadow: 'raised', textSize: 'lg', align: 'center', maxWidth: 'text',
    };
    const out = pageSetSchema.parse(catalogWith(comp('Heading', { text: 'Wholesale enquiries', blockStyle: style }))) as unknown as Loose;
    const stored = out.pages.catalog.content[0].props.blockStyle;
    expect(stored).toEqual(style);
    expect(Object.keys(stored as object)).toEqual(Object.keys(style));
  });

  it('accepts an empty blockStyle object (the storefront treats {} as absent)', () => {
    expect(problems(catalogWith(comp('Heading', { blockStyle: {} })))).toEqual([]);
  });

  it('round-trips through the publish/restore re-parse unchanged', () => {
    const saved = pageSetSchema.parse(catalogWith(
      comp('Section', { blockStyle: { padX: 'md', hide: 'mobile' }, children: [comp('Heading', { blockStyle: { bg: 'surface', radius: 'pill' } })] }),
    ));
    expect(pageSetSchema.parse(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it('rejects an unknown key with its path', () => {
    expect(problems(catalogWith(comp('Heading', { blockStyle: { bg: 'surface', color: 'primary' } }))))
      .toEqual([`${P}.color: Unknown style setting`]);
  });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', 'style', 'Bg', ''])(
    'rejects the key %j as unknown without throwing',
    (key) => {
      const blockStyle = JSON.parse(`{${JSON.stringify(key)}:"surface"}`) as Record<string, unknown>;
      const input = catalogWith(comp('Heading', { blockStyle }));
      expect(() => pageSetSchema.safeParse(input)).not.toThrow();
      expect(problems(input)).toEqual([`${P}.${key}: Unknown style setting`]);
    },
  );

  it.each([
    ['bg', 'inherit'], ['bg', 'none'], ['bg', '#ffffff'], ['bg', 'var(--sf-bg)'], ['bg', 'Surface'], ['fg', ''],
    ['padTop', '2rem'], ['padTop', ' md'], ['padX', 'xxl'], ['marginBottom', 'inherit'],
    ['border', '1px'], ['border', 'none'], ['borderColor', 'red'], ['borderStyle', 'double'],
    ['radius', 'full'], ['shadow', 'none'], ['textSize', 'md'], ['align', 'left'], ['maxWidth', 'full'],
    ['hide', 'both'], ['hide', 'toString'],
  ])('rejects %s = %j as an invalid value', (key, value) => {
    expect(problems(catalogWith(comp('Heading', { blockStyle: { [key]: value } }))))
      .toEqual([`${P}.${key}: Invalid value for style setting`]);
  });

  it.each([[1], [null], [true], [['md']], [{ toString: 'md' }]])('rejects the non-string value %j', (value) => {
    expect(problems(catalogWith(comp('Heading', { blockStyle: { padTop: value } }))))
      .toEqual([`${P}.padTop: Invalid value for style setting`]);
  });

  it('reports every bad key of one style, not just the first', () => {
    expect(problems(catalogWith(comp('Heading', { blockStyle: { bg: '#000', x: 'y', padTop: 'lg', hide: 'all' } })))).toEqual([
      `${P}.bg: Invalid value for style setting`,
      `${P}.x: Unknown style setting`,
      `${P}.hide: Invalid value for style setting`,
    ]);
  });

  it.each([['a string', 'surface'], ['an array', ['bg']], ['null', null], ['a number', 5]])(
    'rejects a blockStyle that is %s',
    (_label, blockStyle) => {
      expect(problems(catalogWith(comp('Heading', { blockStyle })))).toContain(`${P}: Style settings must be an object`);
    },
  );

  it('rejects 17 keys with the cap, once, instead of a per-key list', () => {
    const blockStyle = { ...Object.fromEntries(Object.keys(BLOCK_STYLE_VALUES).map((k) => [k, 'x'])), extra: 'x' };
    expect(problems(catalogWith(comp('Heading', { blockStyle })))).toEqual([`${P}: Style settings may have at most 16 keys`]);
  });

  it('checks a component nested in a slot, in zones and in the shell', () => {
    expect(problems(catalogWith(comp('Section', { children: [comp('Heading', { blockStyle: { bg: 'hotpink' } })] }))))
      .toEqual(['pages.catalog.content.0.props.children.0.props.blockStyle.bg: Invalid value for style setting']);
    expect(problems(set({ catalog: { ...doc(), zones: { 'a:b': [comp('Heading', { blockStyle: { nope: 'x' } })] } } })))
      .toEqual(['pages.catalog.zones.a:b.0.props.blockStyle.nope: Unknown style setting']);
    expect(problems(set({}, doc([comp('PageOutlet'), comp('Footer', { blockStyle: { shadow: 'huge' } })]))))
      .toEqual(['shell.content.1.props.blockStyle.shadow: Invalid value for style setting']);
  });

  it('checks only component props — root props and plain array items are left alone', () => {
    expect(problems(set({ catalog: doc([], { blockStyle: { anything: 'goes' } }) }))).toEqual([]);
    expect(problems(catalogWith(comp('FAQ', { items: [{ question: 'Q', blockStyle: { anything: 'goes' } }] })))).toEqual([]);
  });

  it('a request body with a bad style fails saveDraftBodySchema with the data. prefix', () => {
    const r = saveDraftBodySchema.safeParse({ data: catalogWith(comp('Heading', { blockStyle: { bg: 'inherit' } })), baseVersion: 0 });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => `${i.path.join('.')}: ${i.message}`))
      .toEqual([`data.${P}.bg: Invalid value for style setting`]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/modules/storefront-pages/schemas.test.ts`
Expected: FAIL — Vitest does not typecheck, so the missing export imports as `undefined`: the mirror test fails (`expected undefined to deeply equal {…}`), the tests that iterate `BLOCK_STYLE_VALUES` throw, and every rejection test fails because the set is accepted (`expected [] to equal [ '…Unknown style setting' ]`). The pre-existing tests stay green. That is the expected red.

- [ ] **Step 4: Implement**

In `src/modules/storefront-pages/schemas.ts`, insert after the `URL_PROP_RE` line (before `PAGESET_LIMITS`):

```ts
/** Per-block style values (block-styling spec §3.1, §10.3). A MIRROR of the
 *  storefront's `STYLE_KEYS` in `web/src/builder/style/model.ts` — the two
 *  must change together, backend FIRST: a value the storefront emits that is
 *  missing here makes every save a 400. Enum keys only: no hex, no lengths,
 *  no `inherit`; the palette keys take no `none`. The backend still knows no
 *  blocks — which keys a given block accepts is the storefront's concern. */
const STYLE_PALETTE = ['bg', 'bg-deep', 'surface', 'surface-2', 'surface-3', 'line', 'line-strong',
  'text', 'muted', 'faint', 'primary', 'primary-soft', 'success', 'warn', 'danger'] as const;
const STYLE_SPACE = ['none', 'xs', 'sm', 'md', 'lg', 'xl'] as const;
export const BLOCK_STYLE_VALUES = {
  bg: STYLE_PALETTE,
  fg: STYLE_PALETTE,
  padTop: STYLE_SPACE,
  padBottom: STYLE_SPACE,
  padX: STYLE_SPACE,
  marginTop: STYLE_SPACE,
  marginBottom: STYLE_SPACE,
  border: ['thin', 'medium', 'thick'],
  borderColor: STYLE_PALETTE,
  borderStyle: ['solid', 'dashed', 'dotted'],
  radius: ['none', 'sm', 'md', 'lg', 'card', 'pill'],
  shadow: ['card', 'raised'],
  textSize: ['sm', 'lg', 'xl'],
  align: ['start', 'center', 'end'],
  maxWidth: ['narrow', 'text', 'wide'],
  hide: ['mobile', 'desktop'],
} as const;
export type BlockStyleKey = keyof typeof BLOCK_STYLE_VALUES;
export const BLOCK_STYLE_MAX_KEYS = Object.keys(BLOCK_STYLE_VALUES).length;
/** A Map, never `BLOCK_STYLE_VALUES[key]`: a key such as `constructor` or
 *  `__proto__` must miss, not resolve through the prototype chain. */
const BLOCK_STYLE_LOOKUP: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  Object.entries(BLOCK_STYLE_VALUES).map(([k, values]) => [k, new Set<string>(values)]),
);
```

Then, after `report()` and before `walkValue()`, add:

```ts
/** `props.blockStyle` of one component: a plain object of at most 16 known
 *  keys, each holding exactly one of that key's strings. Never rewrites it. */
function checkBlockStyle(style: unknown, path: Path, w: WalkState): void {
  if (!isPlainObject(style)) {
    report(w, path, 'Style settings must be an object');
    return;
  }
  const entries = Object.entries(style);
  if (entries.length > BLOCK_STYLE_MAX_KEYS) {
    report(w, path, `Style settings may have at most ${BLOCK_STYLE_MAX_KEYS} keys`);
    return;
  }
  for (const [key, value] of entries) {
    const allowed = BLOCK_STYLE_LOOKUP.get(key);
    if (!allowed) report(w, [...path, key], 'Unknown style setting');
    else if (typeof value !== 'string' || !allowed.has(value)) report(w, [...path, key], 'Invalid value for style setting');
  }
}
```

In `walkComponent`, directly after the `props.id` check (before the `for (const [k, v] of Object.entries(item.props))` loop), add:

```ts
  if (item.props.blockStyle !== undefined) checkBlockStyle(item.props.blockStyle, [...path, 'props', 'blockStyle'], w);
```

(The existing generic walk still visits `blockStyle` afterwards; none of the 16 keys matches `HTML_PROP_RE` or `URL_PROP_RE`, so it adds nothing for a valid style.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/modules/storefront-pages/schemas.test.ts`
Expected: PASS — every pre-existing test plus the new `blockStyle` block. If `reports every bad key` fails on ordering, the loop is not in `Object.entries` order — fix the code, not the test.

- [ ] **Step 6: Full gate**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -5`
Expected: typecheck clean; test count = baseline + the new tests, all passing (`service.test.ts`, `router.test.ts` unchanged and green).

- [ ] **Step 7: Self-review, then commit**

Check: no fixture in the existing suite was edited; `BLOCK_STYLE_VALUES` matches spec §3.1 character for character; `checkBlockStyle` never mutates `style`.

```bash
git commit -m "feat(storefront-pages): validate component blockStyle keys and values (block styling §10.3)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- src/modules/storefront-pages/schemas.ts src/modules/storefront-pages/schemas.test.ts
```

---

### Task 2: HTTP contract test + docs

**Depends on:** Task 1. **Wave 2.**

**Files:**
- Test: `src/modules/storefront-pages/router.test.ts` (two cases inside `describe('drafts', …)`, after `'PUT draft with an invalid page set is a 400 naming the path'`)
- Modify: `STOREFRONT.md` (§6.2 "Validation (structural only …)" paragraph, ~line 1265; §7.2 after the "Editable text (storefront v0.8.0)" paragraph, ~line 1377)
- Modify: `CLAUDE.md` (the "**Storefront page builder**" bullet, ~line 107)
- Modify: `src/docs/registry.ts` (the `put` `/api/v1/storefront-pages/{layout}/draft` `description`, ~line 1694)

**Interfaces:**
- Consumes: Task 1's behaviour — messages `Unknown style setting` / `Invalid value for style setting` at `…props.blockStyle.<key>`; the existing `validSet()`, `call()` and `svc` in `router.test.ts`.
- Produces: nothing code-level; the documented contract other repos read.

- [ ] **Step 1: Write the HTTP tests**

In `router.test.ts`, inside `describe('drafts', …)`, after the `'PUT draft with an invalid page set is a 400 naming the path'` case:

```ts
  it('PUT draft passes a valid blockStyle through unchanged', async () => {
    svc.saveDraft.mockResolvedValue({ baseVersion: 0, updatedAt: '2026-09-30T00:00:00.000Z' });
    const good = validSet();
    const style = { bg: 'surface-2', padTop: 'lg', padBottom: 'lg', radius: 'card' };
    (good.pages.catalog.content[0].props as Record<string, unknown>).blockStyle = style;
    const res = await call('PUT', '/storefront-pages/menu/draft', { data: good, baseVersion: 0 });
    expect(res.status).toBe(200);
    expect(svc.saveDraft.mock.calls[0][1].data.pages.catalog.content[0].props.blockStyle).toEqual(style);
  });

  it('PUT draft with an invalid blockStyle is a 400 naming the key, never reaching the service', async () => {
    const bad = validSet();
    (bad.pages.catalog.content[0].props as Record<string, unknown>).blockStyle = { bg: 'inherit', colour: 'primary' };
    const res = await call('PUT', '/storefront-pages/menu/draft', { data: bad, baseVersion: 0 });
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toMatch(/data\.pages\.catalog\.content\.0\.props\.blockStyle\.bg: Invalid value for style setting/);
    expect(error).toMatch(/data\.pages\.catalog\.content\.0\.props\.blockStyle\.colour: Unknown style setting/);
    expect(svc.saveDraft).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/modules/storefront-pages/router.test.ts`
Expected: PASS (Task 1 is in). If the second case returns 200, Task 1 has not landed in this tree — stop and report NEEDS_CONTEXT, do not re-implement it here.

- [ ] **Step 3: `STOREFRONT.md` §6.2**

In the "**Validation (structural only — the backend never knows which blocks exist).**" paragraph, after the sentence ending `…(identical to the storefront's `isSafeHref`, so a saved link never renders inert).`, append:

```markdown
**Block styles** (storefront v0.8.0, spec `2026-09-30-block-styling-design.md` §10.3): a
component's `props.blockStyle`, when present, must be a plain object of at most 16 keys; every
key must be one of `bg fg padTop padBottom padX marginTop marginBottom border borderColor
borderStyle radius shadow textSize align maxWidth hide` and its value one of that key's exact
strings (palette keys `bg`/`fg`/`borderColor`: `bg bg-deep surface surface-2 surface-3 line
line-strong text muted faint primary primary-soft success warn danger` — no `none`; spacing keys:
`none xs sm md lg xl`; `border` `thin medium thick`; `borderStyle` `solid dashed dotted`; `radius`
`none sm md lg card pill`; `shadow` `card raised`; `textSize` `sm lg xl`; `align` `start center
end`; `maxWidth` `narrow text wide`; `hide` `mobile desktop`). Otherwise 400 at
`…props.blockStyle.<key>` (`Unknown style setting` / `Invalid value for style setting`) or at
`…props.blockStyle` (`Style settings must be an object` / `Style settings may have at most 16
keys`). A valid style is stored exactly as sent. The list mirrors the storefront's `STYLE_KEYS`
(`web/src/builder/style/model.ts`) and `BLOCK_STYLE_VALUES` in `storefront-pages/schemas.ts`;
they change together, **backend first**. Which keys a given block accepts is checked by the
storefront only — the backend still knows no blocks.
```

- [ ] **Step 4: `STOREFRONT.md` §7.2**

After the "**Editable text (storefront v0.8.0):** …" paragraph, add:

```markdown
**Block styling (storefront v0.8.0):** deploy the backend first — a validation change only (no
migration, no new endpoint). Not load-bearing in either direction: an older backend stores
`blockStyle` unchecked and the storefront's guard still cleans it; a storefront rolled back to
v0.7.0 ignores the prop and renders blocks unstyled. Adding a style value later: backend first,
or every save that uses it is a 400. Admin: nothing to deploy for this stage.
```

- [ ] **Step 5: `CLAUDE.md`**

In the "**Storefront page builder**" bullet, replace

`…and `*Url`/`*href`/`*src` props go through `isAllowedLink` (https/mailto/tel/`/path`, never `//`).`

with

`…and `*Url`/`*href`/`*src` props go through `isAllowedLink` (https/mailto/tel/`/path`, never `//`); a component's `props.blockStyle` must hold only the 16 known keys with their exact enum values (`BLOCK_STYLE_VALUES`, a mirror of the storefront's `STYLE_KEYS` — change both together, backend first; per-block allowlists stay storefront-side).`

- [ ] **Step 6: `src/docs/registry.ts`**

In the `put` `/api/v1/storefront-pages/{layout}/draft` entry's `description`, replace

`*Url/*href/*src props must be https:, mailto:, tel:, a /path or empty. Body limit 1 MB, page set ≤ 512 KB.`

with

`*Url/*href/*src props must be https:, mailto:, tel:, a /path or empty. A component props.blockStyle must be an object of known style keys with their exact enum values (STOREFRONT.md §6.2). Body limit 1 MB, page set ≤ 512 KB.`

- [ ] **Step 7: Full gate**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -5`
Expected: typecheck clean; all tests pass (Task 1's count + 2).

- [ ] **Step 8: Self-review, then commit**

Check: the §6.2 value lists match `BLOCK_STYLE_VALUES` exactly; no absolute paths or client names in any doc.

```bash
git commit -m "docs(storefront-pages): blockStyle validation contract, deploy note and HTTP 400 test

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- src/modules/storefront-pages/router.test.ts STOREFRONT.md CLAUDE.md src/docs/registry.ts
```

---

## Cross-plan contract assumptions

- **Prop name and place:** `blockStyle`, a flat object on a component's `props` (any component: top level, slot, zone, shell). Not checked on `root.props` or on plain array items.
- **Keys and values (verbatim from spec §3.1, canonical order):** `bg`, `fg`, `borderColor` = `bg bg-deep surface surface-2 surface-3 line line-strong text muted faint primary primary-soft success warn danger` (15, `PALETTE_TOKENS` without `none`); `padTop padBottom padX marginTop marginBottom` = `none xs sm md lg xl`; `border` = `thin medium thick`; `borderStyle` = `solid dashed dotted`; `radius` = `none sm md lg card pill`; `shadow` = `card raised`; `textSize` = `sm lg xl`; `align` = `start center end`; `maxWidth` = `narrow text wide`; `hide` = `mobile desktop`. If plan 2's `STYLE_KEYS` differs in any string, the storefront list must be brought back to this one (or both changed, backend first).
- **Error strings:** `Unknown style setting` and `Invalid value for style setting` (spec) at `…props.blockStyle.<key>`; chosen here: `Style settings must be an object` and `Style settings may have at most 16 keys` at `…props.blockStyle`. All arrive as the usual 400 ZodError string; nothing new for the admin to parse.
- **`{}` is accepted** by the backend (the storefront never emits it; its guard/normaliser drops it).
- **No HTTP, protocol, migration or admin change**; `protocol` stays `1`; the backend does not reorder keys (canonical order is the storefront normaliser's job).
