# Editable Text — Plan 4: Admin SPA (site text load, save, publish, history) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach the admin's Storefront Settings → **Pages** tab about the shared **Site text** document. It loads the text draft next to the layout draft and autosaves it separately. Publish shows a Site text diff and the all-layouts warning, and sends `text.baseVersion`. History gains a **Site text** tab and an optional "also restore the site text". Discard gains an optional "also discard site text".

**Architecture:**
- React-free modules hold the logic. The admin has no test runner, so each is checked by a scratch `node` script using Node 22 type stripping:
  - `src/api/storefront-error-codes.ts`: error-code predicates.
  - `autosaver.ts`: made generic, so one instance saves the page set and a second saves Site text.
  - `protocol.ts`: `siteText` / `textIssues` / `pageSet.text`.
  - `diff.ts`: the Site text diff.
  - `text-restore.ts`: the "also restore the site text" option.
- `use-pages-editor.ts` orchestrates both documents:
  - one load posts both drafts;
  - two autosavers share the `loadId` gate and the held-edit gate;
  - one publish request carries both documents;
  - restore, discard, preview and the socket each gain a text path.
- The presentational components (`PublishDialog`, `VersionsDrawer`, `PagesTab`) sit on top. `ConfirmDialog` gains optional `children` for the checkboxes.
- The last task runs a mocked Playwright pass against the whole tab.

**Tech Stack:** React 19, @tanstack/react-query 5, ky via `@/lib/api-client.ts`, zod 4, Tailwind v4 theme tokens, lucide-react, react-hot-toast, socket.io-client via `useSocket()`. Scratch checks run on Node 22.19 with built-in type stripping. The browser pass is a throwaway Playwright script that borrows the storefront worktree's installed `playwright`.

**Spec:** `ecommerce-storefront/docs/superpowers/specs/2026-09-30-editable-text-design.md`.
- **§8 is this plan's section.** Also read §3 (data model), §4.2 (text routes), §4.4 (publish), §4.5 (restore/pins), §7.1 (protocol), and the admin lines of §10 and §11.
- Also read the overview, `ecommerce-storefront/docs/superpowers/specs/2026-09-30-puck-editable-overview.md`. Its cross-stage rules 7–9 bind this plan.

## Global Constraints

- **Where to work:** the `feature/puck-editable` worktree of `ecommerce-admin-frontend/` (already checked out; never create a branch, never touch the main checkout). Run every `npm`/`npx`/`node` command from that repo's root. The sibling worktrees `ecommerce-storefront/` and `ecommerce-backend/` sit next to it (`../ecommerce-storefront`).
- **Commits:** commit by explicit pathspec only: `git commit -m "…" -- <paths>`. A pathspec commit ignores untracked files, so run `git add -- <new paths>` first for files a task creates (Task 1: `src/api/storefront-error-codes.ts`, `src/api/storefront-text.ts`; Task 4: `src/features/storefront-settings/pages/text-restore.ts`). Never `git add -A`, `git stash`, reset, or checkout someone else's files. Other implementers share this worktree. Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4
  ```
- **Never push or merge.** Never touch live systems: no live backend, DB, S3, Telegram, Cloudflare or Bird. Every API call in this plan's checks is mocked.
- **UI tasks** (Tasks 4, 6, 7, and Task 8 if it has to fix UI) must load the `frontend-design:frontend-design` skill before writing UI code.
  - The code in those tasks is the **functional contract**. Markup, spacing and styling may be refined.
  - Keep every prop, handler, data flow, `aria-*`/`role`, and every string marked **(asserted)**, because Task 8's script matches on them.
- **Imports:**
  - Use `@/…` with explicit `.ts`/`.tsx` extensions, never `../../`. Files inside `pages/` import each other as `./x.ts`, as today.
  - React-free modules (`storefront-error-codes.ts`, `autosaver.ts`, `protocol.ts`, `diff.ts`, `labels.ts`, `text-restore.ts`) may only use `import type` from `@/…`. Their value imports are limited to `zod` and `./labels.ts`, so `node` can load them directly.
- **Copy is literal English** in `src/features/storefront-settings/` (no `useTranslation`). Add no locale keys: `npm run build` runs `scripts/check-locale-parity.mjs`.
- **UI primitives** from `src/components/ui/`: `Button`, `Badge` (`default | accent | success | warning | error | info`), `Modal`, `Drawer`, `ConfirmDialog`, `Tabs`, `Spinner`, `EmptyState`. Colours come only through theme tokens (`text-text-primary`, `bg-bg-surface`, `border-warning/30`, `bg-warning-muted`, `text-accent`…); no hex. Tap targets are `max-lg:min-h-11`.
- **HTTP contract** (spec §4.2, §4.4, §4.5). Paths are relative to ky's `prefixUrl` (`…/api/v1`), and every response is the `{ success, data, error }` envelope unwrapped by `unwrapResponse`.
  - Site text draft:
    - `GET storefront-text/draft` → `{ source: 'draft'|'published'|'none', data: SiteText|null, baseVersion, latestPublishedVersion, updatedAt }`
    - `PUT storefront-text/draft` with `{ data: SiteText, baseVersion }` → `{ baseVersion, updatedAt }`. Returns `409 SITETEXT_CONFLICT` when `baseVersion < latestPublishedVersion`.
    - `DELETE storefront-text/draft` → `{ discarded: boolean }`
  - Site text history:
    - `GET storefront-text/versions` → `Array<{ version, createdAt, createdBy: { id, name } | null }>`, newest first
    - `GET storefront-text/versions/:version` → `{ version, createdAt, data: SiteText }`
    - `POST storefront-text/versions/:version/restore` → `{ version }`
  - Layout publish: `POST storefront-pages/:layout/publish` with body `{ baseVersion, text?: { baseVersion } }`. Send `text` **whenever this session holds shared text**, and omit the key otherwise. Returns `{ version, publishedAt, pagesPublished, textVersion, textPublished }`.
  - Layout history:
    - `GET storefront-pages/:layout/versions` and `…/versions/:version` add `textVersion: number | null`.
    - `POST storefront-pages/:layout/versions/:version/restore` takes body `{ withText: boolean }` and returns `{ version, textVersion, textRestored }`.
- **Error codes** are envelope `error` strings. `extractApiError` turns them into the thrown `Error`'s `message` and keeps `status`.
  - `PAGESET_CONFLICT` (409), `SITETEXT_CONFLICT` (409), `TEXT_VERSION_GONE` (409), `NO_DRAFT` (400).
  - A bare 409 counts as a page-set conflict **only when** its message is not one of the two text codes.
- **Protocol** (spec §7.1, additive, `protocol` stays `1`):
  - `sf-builder-load` gains `siteText?: SiteText | null`. The key is **absent** (never `undefined`) when the text GET failed, and `null` when nothing is stored yet.
  - `sf-builder-change` gains `siteText?: SiteText` and `textIssues: TextIssue[]` (`{ scope: 'shared' | 'layout', key, rule, message }`, ≤ 500). `pageSet` may carry `text`.
  - Changes whose `loadId` is stale are dropped for both documents.
- **Autosave:**
  - Site text gets its own `createAutosaver` with its own baseline and generation, and the same 1 000 ms debounce, saving to `PUT storefront-text/draft`.
  - The first change after every load is the baseline for **both** documents.
  - `SITETEXT_CONFLICT` stops only the text autosaver and disables Publish. Page autosave continues.
- **Exact copy (asserted):**
  - Publish warning: **"Shared text changes go live on all 3 layouts."**
  - Conflict banner starts with **"Someone published site text since you opened this — reload"**.
  - Restore option: **"Also restore the site text from then (v{n}) — changes all 3 layouts"**.
  - Text restore confirm contains **"Restores the shared text on all 3 layouts; page layouts are not changed"**.
  - Discard option: **"Also discard unpublished site text changes (all layouts)"**.
- **Socket:** `storefront-text:published` (`{ version }`) invalidates the text versions query only. `storefront-pages:published` is handled as today.
- **Role gate:** unchanged. The Pages section stays admin-only (`sectionGroupsFor` + `RoleGate allow={['admin']}`).
- **Lint is a regression gate** (it already fails on main). Task 1 records a JSON baseline. Every task must leave repo totals ≤ baseline and add **zero** problems in files it created or touched.
- **Scratch folder** (never committed): `$SCRATCH` is a folder named `editable-text-admin` inside the session scratchpad directory named in your system prompt. Set it in every shell, e.g. `SCRATCH="<scratchpad>/editable-text-admin"`. No scratch path ever goes into a committed file.
- **Deploy order** (spec §11): backend → storefront v0.8.0 → **admin last**. The plan never assumes an old backend. It does tolerate an old storefront: `textIssues` missing in a change is read as `[]`.
- **Fixtures:** "Northbound Supply" / `shop.example` only.

## Parallelisation map

All tasks share one worktree, so tasks in the same wave touch disjoint files. At most 3 tasks run at once.

| Wave | Tasks (parallel within a wave) | Needs |
|---|---|---|
| 1 | **T1** types, API modules, error codes, generic autosaver, lint baseline | — |
| 2 | **T2** protocol + bridge · **T3** diff · **T4** VersionsDrawer + ConfirmDialog + text-restore (UI) | T1 |
| 3 | **T5** `use-pages-editor.ts` (+ a 2-line PagesTab compile fix) · **T6** PublishDialog (UI) | T5: T1–T3 · T6: T1, T3 |
| 4 | **T7** PagesTab wiring (UI) | T4, T5, T6 |
| 5 | **T8** mocked Playwright pass + final gates (**the only task that runs Playwright**) | T7 |

While a sibling in the same wave is mid-edit, `npm run build` (`tsc -b` over the whole repo) can fail on the sibling's file. If a build error names a file outside your task, wait a minute and re-run. Never edit a sibling's file (house rule 12).

Every task keeps `npm run build` green at its end. New props are optional and changed callbacks only gain parameters, so no task breaks a caller written by a later task.

## Review Focus

1. **A text 409 misread as a page conflict.**
   - Before this plan `isPageSetConflict` accepted any bare 409. `SITETEXT_CONFLICT` from publish, or `TEXT_VERSION_GONE` from a restore, would then freeze *page* autosave and tell the owner the wrong thing.
   - Expected: only the text autosaver pauses, and a gone pin shows its own message.
   - Pinned in Task 1 (`storefront-error-codes` check) and Task 8 (Run A step A10: chip not "Autosave paused"; Run B: page PUTs continue).
2. **A text edit made while publish, discard or restore is in flight.**
   - Expected: it is held, then saved afterwards against the new text `baseVersion`. It is never raced into a false 409 and never silently dropped, unless the request replaced the text draft.
   - Pinned in Task 5 (`withEditsHeld` holds text too, and `replaces.text` decides) and Task 8 (A6: an edit sent during a delayed publish PUTs afterwards with `baseVersion: 3`).
3. **The text GET fails, or the frame is an older storefront.**
   - Expected: page editing and publishing work unchanged, a toast explains, and the load carries **no** `siteText` key. A change's `siteText` is ignored, publish sends no `text`, and a change without `textIssues` still parses.
   - Pinned in Task 2 (parser + `'siteText' in load` checks) and Task 8 (Run C).
4. **Another admin's shared draft.**
   - Publishing from this layout publishes shared edits someone else made (spec §13 item 5). Expected: the dialog diffs the text draft **as the backend stores it**, not this session's copy, and lists every changed key.
   - Pinned in Task 5 (`preparePublish` reads `GET storefront-text/draft`) and Task 8 (A6: a key only the server-side draft holds is listed).
5. **Pin rot.**
   - A page version whose pin is `null`, `0`, pruned or already live must not offer a half-working restore. Expected: the checkbox is disabled with the reason, and a `TEXT_VERSION_GONE` race shows a clear toast with nothing changed.
   - Pinned in Task 4 (`text-restore` check covers all four states + loading/error) and Task 8 (A9, A10).

---

### Task 1: Types, API modules, error codes, generic autosaver, lint baseline

**Files:**
- Modify: `src/types/storefront-pages.ts`
- Create: `src/api/storefront-error-codes.ts`
- Create: `src/api/storefront-text.ts`
- Modify: `src/api/storefront-pages.ts`
- Modify: `src/features/storefront-settings/pages/autosaver.ts`
- Scratch: `$SCRATCH/lint-baseline.json`, `$SCRATCH/lint-gate.mjs`, `$SCRATCH/t1.check.mjs`

**Interfaces:**
- Consumes: `api`, `unwrapResponse` from `@/lib/api-client.ts`.
- Produces:
  - New types from `@/types/storefront-pages.ts`: `Locale`, `PluralForms`, `TextValue`, `LocaleStrings`, `TextLanguage`, `SiteText`, `PageText`, `TextIssue`, `SiteTextDraft`, `SaveSiteTextResult`, `SiteTextVersionSummary`, `SiteTextVersion`.
  - Changed types:
    - `PageSet.text?: PageText`
    - `PublishResult` gains `pagesPublished`, `textVersion`, `textPublished`.
    - `PageSetVersionSummary.textVersion` and `PageSetVersion.textVersion` are `number | null`.
    - `RestoreResult` gains `textVersion`, `textRestored`.
  - From `@/api/storefront-error-codes.ts` (also re-exported by both API modules):
    ```ts
    isPageSetConflict(err: unknown): boolean  // 'PAGESET_CONFLICT', or a 409 whose message is not a text code
    isNoDraft(err: unknown): boolean          // 'NO_DRAFT'
    isSiteTextConflict(err: unknown): boolean // 'SITETEXT_CONFLICT'
    isTextVersionGone(err: unknown): boolean  // 'TEXT_VERSION_GONE'
    ```
  - From `@/api/storefront-text.ts`:
    ```ts
    storefrontTextKeys.all | .draft() | .versions() | .version(version)
    getSiteTextDraft(): Promise<SiteTextDraft>
    saveSiteTextDraft(body: { data: SiteText; baseVersion: number }): Promise<SaveSiteTextResult>
    discardSiteTextDraft(): Promise<{ discarded: boolean }>
    listSiteTextVersions(): Promise<SiteTextVersionSummary[]>
    getSiteTextVersion(version: number): Promise<SiteTextVersion>
    restoreSiteTextVersion(version: number): Promise<{ version: number }>
    ```
  - From `@/api/storefront-pages.ts` (changed):
    ```ts
    publishPageSet(layout: LayoutKind, baseVersion: number, textBaseVersion?: number): Promise<PublishResult>
    restorePageSetVersion(layout: LayoutKind, version: number, opts?: { withText: boolean }): Promise<RestoreResult>
    ```
  - From `./autosaver.ts`: `createAutosaver<T = PageSet>(opts: AutosaverOptions<T>): Autosaver<T>`. Existing callers compile unchanged.

- [ ] **Step 1: Record the build and lint baselines**

```bash
SCRATCH="<scratchpad>/editable-text-admin"   # see Global Constraints
mkdir -p "$SCRATCH"
git status --short                 # note anything already dirty; never stage it
npm run build 2>&1 | tail -3       # must succeed before any change
npx eslint . -f json -o "$SCRATCH/lint-baseline.json"; \
node -e "const r=require(process.argv[1]);let e=0,w=0;for(const f of r){e+=f.errorCount;w+=f.warningCount}console.log('BASELINE errors',e,'warnings',w)" "$SCRATCH/lint-baseline.json"
```

Expected: the build succeeds and the script prints `BASELINE errors N warnings M`. Put those numbers in your report. Later tasks compare against the file.

- [ ] **Step 2: Write the lint gate** — `$SCRATCH/lint-gate.mjs`

```js
// Usage (from the admin repo root): SCRATCH=… node "$SCRATCH/lint-gate.mjs" <path-substring> [...]
// Fails if repo-wide totals exceed lint-baseline.json, or any file matching a substring has a problem.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const dir = process.env.SCRATCH;
if (!dir) throw new Error('set SCRATCH');
const base = JSON.parse(readFileSync(`${dir}/lint-baseline.json`, 'utf8'));
let out;
try { out = execSync('npx eslint . -f json', { cwd: process.cwd(), maxBuffer: 64 << 20 }).toString(); }
catch (e) { out = e.stdout.toString(); }
const now = JSON.parse(out);
const sum = (r) => r.reduce((a, f) => [a[0] + f.errorCount, a[1] + f.warningCount], [0, 0]);
const [be, bw] = sum(base), [ne, nw] = sum(now);
const subs = process.argv.slice(2);
const touched = now.filter((f) => subs.some((s) => f.filePath.replace(/\\/g, '/').includes(s)) && f.messages.length > 0);
console.log(`baseline ${be}e/${bw}w  now ${ne}e/${nw}w`);
for (const f of touched) for (const m of f.messages) console.log(`${f.filePath}:${m.line} ${m.ruleId} ${m.message}`);
if (ne > be || nw > bw || touched.length > 0) { console.error('LINT GATE FAILED'); process.exit(1); }
console.log('LINT GATE OK');
```

Run: `node "$SCRATCH/lint-gate.mjs" storefront-error-codes`. Expected: `LINT GATE OK`.

- [ ] **Step 3: Write the failing check** — `$SCRATCH/t1.check.mjs`

```js
// Run from the admin repo root: node "$SCRATCH/t1.check.mjs"
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const load = (p) => import(pathToFileURL(resolve(p)).href);

const codes = await load('src/api/storefront-error-codes.ts');
const err = (message, status) => Object.assign(new Error(message), status ? { status } : {});
// page-set conflict
assert.equal(codes.isPageSetConflict(err('PAGESET_CONFLICT', 409)), true);
assert.equal(codes.isPageSetConflict(err('Conflict', 409)), true, 'bare 409 still counts');
assert.equal(codes.isPageSetConflict(err('SITETEXT_CONFLICT', 409)), false, 'text conflict is not a page conflict');
assert.equal(codes.isPageSetConflict(err('TEXT_VERSION_GONE', 409)), false, 'gone pin is not a page conflict');
assert.equal(codes.isPageSetConflict(err('NO_DRAFT', 400)), false);
assert.equal(codes.isPageSetConflict(null), false);
assert.equal(codes.isPageSetConflict('PAGESET_CONFLICT'), false, 'strings are not errors');
// text codes
assert.equal(codes.isSiteTextConflict(err('SITETEXT_CONFLICT', 409)), true);
assert.equal(codes.isSiteTextConflict(err('PAGESET_CONFLICT', 409)), false);
assert.equal(codes.isSiteTextConflict(err('Conflict', 409)), false, 'no bare-409 fallback for text');
assert.equal(codes.isTextVersionGone(err('TEXT_VERSION_GONE', 409)), true);
assert.equal(codes.isTextVersionGone(err('SITETEXT_CONFLICT', 409)), false);
assert.equal(codes.isNoDraft(err('NO_DRAFT', 400)), true);
assert.equal(codes.isNoDraft(undefined), false);

// generic autosaver: a non-PageSet value round-trips
const { createAutosaver } = await load('src/features/storefront-settings/pages/autosaver.ts');
const saved = [];
const statuses = [];
const saver = createAutosaver({
  delayMs: 10,
  isConflict: codes.isSiteTextConflict,
  save: async (v) => { saved.push(v); },
  onStatus: (s) => statuses.push(s),
});
const A = { schemaVersion: 1, language: { locale: 'en', formatLocale: '' }, strings: {} };
const B = { ...A, strings: { en: { 'cart.drawer.title': 'Your bag' } } };
saver.setBaseline(A);
saver.schedule(A);
assert.equal(await saver.flush(), true);
assert.equal(saved.length, 0, 'equal to server state → never sent');
saver.schedule(B);
assert.equal(await saver.flush(), true);
assert.deepEqual(saved, [B]);
assert.deepEqual(saver.current(), B);
// conflict via the text predicate stops the saver
const c = createAutosaver({ delayMs: 10, isConflict: codes.isSiteTextConflict, save: async () => { throw err('SITETEXT_CONFLICT', 409); }, onStatus: (s) => statuses.push(s) });
c.setBaseline(A);
c.schedule(B);
assert.equal(await c.flush(), false);
assert.equal(statuses.at(-1), 'conflict');
c.schedule(A);
assert.equal(c.hasUnsaved(), false, 'conflict ignores new edits');
console.log('T1 CHECK OK');
```

Run: `node "$SCRATCH/t1.check.mjs"`. Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `storefront-error-codes.ts`.

- [ ] **Step 4: Create `src/api/storefront-error-codes.ts`**

```ts
/**
 * Backend error codes for the page-builder routes. The envelope's `error` is a string, which
 * extractApiError (lib/api-client.ts) turns into the thrown Error's `message`, keeping the HTTP
 * `status`. Import-free so a scratch `node` script can check it.
 */
interface ApiErrorLike { message?: unknown; status?: unknown }

function fields(err: unknown): ApiErrorLike | null {
  return typeof err === 'object' && err !== null ? (err as ApiErrorLike) : null;
}

/** 409 codes that are NOT a page-set conflict, even though they share the status. */
const TEXT_409_CODES: readonly unknown[] = ['SITETEXT_CONFLICT', 'TEXT_VERSION_GONE'];

/**
 * 409 `PAGESET_CONFLICT` from PUT draft / publish: someone published this layout since the editor
 * loaded. A bare 409 also counts, unless its message is one of the text codes (spec stage-1 §4.4:
 * publish and restore can now also 409 for text reasons).
 */
export function isPageSetConflict(err: unknown): boolean {
  const e = fields(err);
  if (!e) return false;
  if (e.message === 'PAGESET_CONFLICT') return true;
  return e.status === 409 && !TEXT_409_CODES.includes(e.message);
}

/** Publish with neither a layout draft nor a text draft: 400 `NO_DRAFT`. */
export function isNoDraft(err: unknown): boolean {
  return fields(err)?.message === 'NO_DRAFT';
}

/** 409 `SITETEXT_CONFLICT` from PUT storefront-text/draft or publish: someone published site text since this editor loaded. */
export function isSiteTextConflict(err: unknown): boolean {
  return fields(err)?.message === 'SITETEXT_CONFLICT';
}

/** 409 `TEXT_VERSION_GONE` from a page restore with `withText`: the pinned text version is null, 0 or pruned. */
export function isTextVersionGone(err: unknown): boolean {
  return fields(err)?.message === 'TEXT_VERSION_GONE';
}
```

- [ ] **Step 5: Make the autosaver generic** — replace `src/features/storefront-settings/pages/autosaver.ts` with:

```ts
import type { PageSet } from '@/types/storefront-pages.ts';

/**
 * Debounced, serialised draft saver (spec §9: "debounced (1 s) PUT …/draft"). Generic over the
 * document it saves: the Pages tab runs one for the layout's page set and one for the shared Site
 * text (editable-text spec §8). React-free so a scratch `node` script can check it.
 *
 * - One request in flight at a time; the newest value always wins.
 * - A value equal to the server state is never sent.
 * - A conflict stops everything until setBaseline() (a reload).
 * - A plain failure keeps the value and waits for the next edit or flush(); there is no retry loop.
 * - cancel() and setBaseline() bump a generation, so a response that lands afterwards is ignored.
 */
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';

export interface AutosaverOptions<T> {
  delayMs: number;
  save: (value: T) => Promise<void>;
  isConflict: (err: unknown) => boolean;
  onStatus: (status: SaveStatus, error: string | null) => void;
}

export interface Autosaver<T = PageSet> {
  setBaseline(value: T | null): void;
  schedule(value: T): void;
  flush(): Promise<boolean>;
  cancel(): void;
  markConflict(): void;
  current(): T | null;
  hasUnsaved(): boolean;
}

export function createAutosaver<T = PageSet>(opts: AutosaverOptions<T>): Autosaver<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: T | null = null;
  let inflight: Promise<void> | null = null;
  let server: T | null = null;
  let serverJson: string | null = null;
  let everSaved = false;
  let conflict = false;
  let generation = 0;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const arm = () => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, opts.delayMs);
  };

  async function run(): Promise<void> {
    clearTimer();
    while (inflight) await inflight;
    clearTimer();
    if (conflict || pending === null) return;
    const next = pending;
    pending = null;
    const json = JSON.stringify(next);
    if (json === serverJson) {
      opts.onStatus(everSaved ? 'saved' : 'idle', null);
      return;
    }
    const gen = generation;
    opts.onStatus('saving', null);
    inflight = (async () => {
      try {
        await opts.save(next);
        if (gen !== generation) return;
        server = next;
        serverJson = json;
        everSaved = true;
        opts.onStatus(pending !== null ? 'pending' : 'saved', null);
      } catch (err) {
        if (gen !== generation) return;
        if (opts.isConflict(err)) {
          conflict = true;
          pending = null;
          clearTimer();
          opts.onStatus('conflict', null);
        } else {
          pending ??= next;
          opts.onStatus('error', err instanceof Error && err.message ? err.message : 'Save failed');
        }
      }
    })();
    try {
      await inflight;
    } finally {
      inflight = null;
    }
  }

  return {
    setBaseline(value) {
      generation++;
      clearTimer();
      pending = null;
      conflict = false;
      everSaved = false;
      server = value;
      serverJson = value ? JSON.stringify(value) : null;
      opts.onStatus('idle', null);
    },
    schedule(value) {
      if (conflict) return;
      pending = value;
      opts.onStatus('pending', null);
      arm();
    },
    async flush() {
      if (timer !== null || pending !== null) await run();
      while (inflight) await inflight;
      return !conflict && pending === null;
    },
    cancel() {
      generation++;
      clearTimer();
      pending = null;
    },
    markConflict() {
      generation++;
      clearTimer();
      pending = null;
      conflict = true;
      opts.onStatus('conflict', null);
    },
    current: () => server,
    hasUnsaved: () => timer !== null || pending !== null || inflight !== null,
  };
}
```

- [ ] **Step 6: Run the check**

Run: `node "$SCRATCH/t1.check.mjs"`. Expected: `T1 CHECK OK`.

- [ ] **Step 7: Extend `src/types/storefront-pages.ts`**

Replace the `PageSet` interface and everything from `/** POST /storefront-pages/:layout/publish */` to the end of the file with the code below. Keep `LayoutKind` … `PuckDoc`, `BuilderIssue`, `PageSetSource`, `PageSetDraft` and `SaveDraftResult` as they are.

```ts
/** Sparse: a fixed route missing from `pages` renders its built-in default. */
export interface PageSet {
  schemaVersion: 1;
  shell: PuckDoc;
  pages: Partial<Record<RouteKey, PuckDoc>>;
  /** This layout's text overrides (editable-text spec §3); absent or empty = none. */
  text?: PageText;
}
```

```ts
// ---- Site text (editable-text spec §3; mirrors the storefront's web/src/text/types.ts) ----

/** BCP 47, canonical form: 'en', 'de', 'pt-BR', 'zh-Hant'. */
export type Locale = string;
/** One key's plural value: `other` plus any other CLDR categories. */
export type PluralForms = Partial<Record<'zero' | 'one' | 'two' | 'few' | 'many', string>> & { other: string };
export type TextValue = string | PluralForms;
/** Sparse: only keys the owner set. */
export type LocaleStrings = Record<string, TextValue>;
export interface TextLanguage {
  locale: Locale;
  /** '' = built-in formatting for `locale`. */
  formatLocale: '' | Locale;
}
/** The shared Site text document — one per store. The admin stores, diffs and forwards it; it never validates keys. */
export interface SiteText {
  schemaVersion: 1;
  language: TextLanguage;
  strings: Record<Locale, LocaleStrings>;
}
/** Per-layout overrides inside a PageSet. */
export interface PageText { strings: Record<Locale, LocaleStrings> }
/** A text problem that blocks publishing, reported by the editor in sf-builder-change. */
export interface TextIssue { scope: 'shared' | 'layout'; key: string; rule: string; message: string }

/** POST /storefront-pages/:layout/publish */
export interface PublishResult {
  /** The layout's latest version afterwards (unchanged when pagesPublished is false). */
  version: number;
  publishedAt: string;
  pagesPublished: boolean;
  /** Latest Site text version afterwards (0 = none). */
  textVersion: number;
  textPublished: boolean;
}
/** GET /storefront-pages/:layout/versions (newest first) */
export interface PageSetVersionSummary {
  version: number;
  createdAt: string;
  createdBy: { id: number; name: string } | null;
  /** The Site text version live right after this version (0 = none; null = published before text existed). */
  textVersion: number | null;
}
/** GET /storefront-pages/:layout/versions/:version */
export interface PageSetVersion { version: number; createdAt: string; data: PageSet; textVersion: number | null }
/** POST /storefront-pages/:layout/versions/:version/restore — the NEW version */
export interface RestoreResult { version: number; textVersion: number; textRestored: boolean }

/** GET /storefront-text/draft */
export interface SiteTextDraft {
  source: PageSetSource;
  data: SiteText | null;
  baseVersion: number;
  latestPublishedVersion: number;
  updatedAt: string | null;
}
/** PUT /storefront-text/draft */
export interface SaveSiteTextResult { baseVersion: number; updatedAt: string }
/** GET /storefront-text/versions (newest first) */
export interface SiteTextVersionSummary {
  version: number;
  createdAt: string;
  createdBy: { id: number; name: string } | null;
}
/** GET /storefront-text/versions/:version */
export interface SiteTextVersion { version: number; createdAt: string; data: SiteText }
```

Also update the file's header comment: "Mirrors the storefront's web/src/builder/types.ts and web/src/text/types.ts…".

- [ ] **Step 8: Create `src/api/storefront-text.ts`**

```ts
import { api, unwrapResponse } from '@/lib/api-client.ts';
import type {
  SaveSiteTextResult,
  SiteText,
  SiteTextDraft,
  SiteTextVersion,
  SiteTextVersionSummary,
} from '@/types/storefront-pages.ts';

export { isSiteTextConflict, isTextVersionGone } from '@/api/storefront-error-codes.ts';

/** The store-wide Site text document (editable-text spec §4.2). All routes are admin-only. */
export const storefrontTextKeys = {
  all: ['storefront-text'] as const,
  draft: () => ['storefront-text', 'draft'] as const,
  versions: () => ['storefront-text', 'versions'] as const,
  version: (version: number) => ['storefront-text', 'versions', version] as const,
};

export async function getSiteTextDraft() {
  return unwrapResponse<SiteTextDraft>(api.get('storefront-text/draft'));
}

/** No ky retry: the autosaver owns retries (same as savePageSetDraft). */
export async function saveSiteTextDraft(body: { data: SiteText; baseVersion: number }) {
  return unwrapResponse<SaveSiteTextResult>(api.put('storefront-text/draft', { json: body, retry: 0 }));
}

export async function discardSiteTextDraft() {
  return unwrapResponse<{ discarded: boolean }>(api.delete('storefront-text/draft'));
}

export async function listSiteTextVersions() {
  return unwrapResponse<SiteTextVersionSummary[]>(api.get('storefront-text/versions'));
}

export async function getSiteTextVersion(version: number) {
  return unwrapResponse<SiteTextVersion>(api.get(`storefront-text/versions/${version}`));
}

/** Copies `version` into a NEW published text version and resets the text draft to it. */
export async function restoreSiteTextVersion(version: number) {
  return unwrapResponse<{ version: number }>(api.post(`storefront-text/versions/${version}/restore`));
}
```

- [ ] **Step 9: Update `src/api/storefront-pages.ts`**

Replace `publishPageSet` and `restorePageSetVersion` with:

```ts
/**
 * `textBaseVersion` is sent whenever the editor session holds shared text (editable-text spec §4.4):
 * the backend then publishes the layout AND any Site text draft in one transaction.
 */
export async function publishPageSet(layout: LayoutKind, baseVersion: number, textBaseVersion?: number) {
  const json = textBaseVersion === undefined ? { baseVersion } : { baseVersion, text: { baseVersion: textBaseVersion } };
  return unwrapResponse<PublishResult>(api.post(`storefront-pages/${layout}/publish`, { json }));
}
```

```ts
/** `withText` also restores the Site text version this page version pinned (all 3 layouts). */
export async function restorePageSetVersion(layout: LayoutKind, version: number, opts: { withText: boolean } = { withText: false }) {
  return unwrapResponse<RestoreResult>(
    api.post(`storefront-pages/${layout}/versions/${version}/restore`, { json: { withText: opts.withText } }),
  );
}
```

Delete the local `isPageSetConflict` and `isNoDraft` functions and their doc comments at the end of the file. Add this re-export under the imports, so every existing import site keeps working:

```ts
export { isNoDraft, isPageSetConflict } from '@/api/storefront-error-codes.ts';
```

- [ ] **Step 10: Build, check and lint**

```bash
npm run build 2>&1 | tail -3        # expect success (existing callers use the defaults)
node "$SCRATCH/t1.check.mjs"        # T1 CHECK OK
node "$SCRATCH/lint-gate.mjs" storefront-error-codes storefront-text.ts api/storefront-pages.ts types/storefront-pages.ts pages/autosaver.ts
```

Expected: build OK, `T1 CHECK OK`, `LINT GATE OK`.

- [ ] **Step 11: Commit**

```bash
git commit -m "feat(storefront-text): site text types, API module, text error codes, generic autosaver

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- src/types/storefront-pages.ts src/api/storefront-error-codes.ts src/api/storefront-text.ts src/api/storefront-pages.ts src/features/storefront-settings/pages/autosaver.ts
```

---

### Task 2: Protocol and bridge carry Site text

**Files:**
- Modify: `src/features/storefront-settings/pages/protocol.ts`
- Modify: `src/features/storefront-settings/pages/use-builder-bridge.ts`
- Scratch: `$SCRATCH/t2.check.mjs`

**Depends on:** Task 1.

**Interfaces:**
- Consumes: `SiteText`, `TextIssue`, `PageSet` types (Task 1).
- Produces (from `./protocol.ts`):
  ```ts
  interface BuilderLoadMessage { …; siteText?: SiteText | null }
  loadMessage(loadId, layout, pageSet, theme, readOnly, siteText?: SiteText | null): BuilderLoadMessage  // key omitted when undefined
  interface BuilderChangeText { siteText?: SiteText; textIssues: TextIssue[] }
  BuilderInbound change variant: { type: 'sf-builder-change'; loadId; pageSet; issues } & BuilderChangeText
  ```
- Produces (from `./use-builder-bridge.ts`): `BuilderBridgeHandlers.onChange(loadId: string, pageSet: PageSet, issues: BuilderIssue[], text: BuilderChangeText): void`. The existing 3-parameter handler in `use-pages-editor.ts` stays assignable until Task 5.

- [ ] **Step 1: Write the failing check** — `$SCRATCH/t2.check.mjs`

```js
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { loadMessage, parseBuilderMessage } = await import(pathToFileURL(resolve('src/features/storefront-settings/pages/protocol.ts')).href);

const doc = (types) => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content: types.map((type, i) => ({ type, props: { id: `${type}-${i}` } })) });
const SET = { schemaVersion: 1, shell: doc(['Header', 'PageOutlet']), pages: {} };
const SET_TEXT = { ...SET, text: { strings: { en: { 'shell.nav.ariaLabel': 'Main menu' } } } };
const SITE = { schemaVersion: 1, language: { locale: 'en', formatLocale: '' }, strings: { en: { 'cart.drawer.title': 'Your bag', 'cart.summary.items': { one: '{count} thing', other: '{count} things' } } } };
const THEME = { template: 'modern' };

// load: siteText key absent / null / doc
assert.equal('siteText' in loadMessage('l1', 'storefront', SET, THEME, false), false, 'no key when undefined');
assert.equal('siteText' in loadMessage('l1', 'storefront', SET, THEME, false, undefined), false, 'explicit undefined still omits the key');
assert.equal(loadMessage('l1', 'storefront', SET, THEME, false, null).siteText, null);
assert.equal(loadMessage('l1', 'storefront', SET_TEXT, THEME, true, SITE).siteText, SITE);
assert.equal(loadMessage('l1', 'storefront', SET_TEXT, THEME, false).pageSet.text, SET_TEXT.text, 'pageSet.text passes through');

// change: text fields
const base = { type: 'sf-builder-change', loadId: 'l1', pageSet: SET_TEXT, issues: [] };
const issue = { scope: 'shared', key: 'cart.drawer.title', rule: 'unknown-placeholder', message: 'Unknown placeholder {nme}' };
let m = parseBuilderMessage({ ...base, siteText: SITE, textIssues: [issue] });
assert.ok(m && m.type === 'sf-builder-change');
assert.equal(m.pageSet, SET_TEXT, 'frame object forwarded');
assert.equal(m.pageSet.text, SET_TEXT.text, 'overrides are NOT stripped');
assert.equal(m.siteText, SITE, 'siteText forwarded as the frame object');
assert.deepEqual(m.textIssues, [issue]);
m = parseBuilderMessage(base);
assert.ok(m, 'an older storefront (no textIssues, no siteText) still parses');
assert.deepEqual(m.textIssues, []);
assert.equal('siteText' in m, false);
m = parseBuilderMessage({ ...base, siteText: null });
assert.ok(m, 'siteText: null is tolerated');
assert.equal('siteText' in m, false, 'null reads as absent');
// malformed text → the whole message is ignored
assert.equal(parseBuilderMessage({ ...base, siteText: { ...SITE, schemaVersion: 2 } }), null, 'newer site text schema');
assert.equal(parseBuilderMessage({ ...base, siteText: { ...SITE, language: 'en' } }), null, 'language not an object');
assert.equal(parseBuilderMessage({ ...base, siteText: { ...SITE, strings: { en: { k: 5 } } } }), null, 'value not text');
assert.equal(parseBuilderMessage({ ...base, siteText: { ...SITE, strings: { en: { k: { one: 'x' } } } } }), null, 'plural without other');
assert.equal(parseBuilderMessage({ ...base, pageSet: { ...SET, text: { strings: 'x' } } }), null, 'bad overrides');
assert.equal(parseBuilderMessage({ ...base, textIssues: [{ ...issue, scope: 'page' }] }), null, 'unknown scope');
assert.equal(parseBuilderMessage({ ...base, textIssues: Array(501).fill(issue) }), null, 'over 500 text issues');
assert.ok(parseBuilderMessage({ ...base, textIssues: Array(500).fill(issue) }), '500 text issues ok');
console.log('T2 CHECK OK');
```

Run: `node "$SCRATCH/t2.check.mjs"`. Expected: FAIL (`'siteText' in` load with null → the assertion on `.siteText` fails, or `textIssues` is undefined).

- [ ] **Step 2: Update `protocol.ts`**

Change the type import:

```ts
import type { BuilderIssue, LayoutKind, PageSet, SiteText, TextIssue } from '@/types/storefront-pages.ts';
```

Add the field to `BuilderLoadMessage` (after `readOnly`):

```ts
  /**
   * The shared Site text draft (editable-text spec §7.1). ABSENT = this admin can't save shared text
   * (its GET failed): the editor then edits this layout's overrides only. null = none stored yet.
   */
  siteText?: SiteText | null;
```

Replace `loadMessage`:

```ts
export function loadMessage(
  loadId: string,
  layout: LayoutKind,
  pageSet: PageSet | null,
  theme: PreviewTheme,
  readOnly: boolean,
  siteText?: SiteText | null,
): BuilderLoadMessage {
  if (loadId.length < 1 || loadId.length > LOAD_ID_MAX) throw new Error('loadId must be 1-64 characters');
  const message: BuilderLoadMessage = { type: 'sf-builder-load', protocol: BUILDER_PROTOCOL, loadId, layout, pageSet, theme: withoutCustomCss(theme), readOnly };
  // Key presence is the signal (spec §7.1): never post `siteText: undefined`.
  if (siteText !== undefined) message.siteText = siteText;
  return message;
}
```

Replace the `BuilderInbound` union's change member and add `BuilderChangeText`:

```ts
/** The text half of an sf-builder-change (editable-text spec §7.1). */
export interface BuilderChangeText {
  /** Present iff the load carried `siteText`; always the full shared document. */
  siteText?: SiteText;
  /** Text problems that block publishing (≤ 500). An older storefront sends none: read as []. */
  textIssues: TextIssue[];
}

export type BuilderInbound =
  | { type: 'sf-builder-ready'; protocol: typeof BUILDER_PROTOCOL }
  | ({ type: 'sf-builder-change'; loadId: string; pageSet: PageSet; issues: BuilderIssue[] } & BuilderChangeText)
  | { type: 'sf-builder-upload-request'; requestId: string; file: File }
  | { type: 'sf-builder-viewport'; width: BuilderViewport };
```

Replace the schemas from `const pageSetSchema` through `inboundSchema`:

```ts
// Text shapes — structural only; the backend and the storefront registry validate content.
const textValueSchema = z.union([z.string(), z.looseObject({ other: z.string() })]);
const stringsSchema = z.record(z.string(), z.record(z.string(), textValueSchema));
const pageTextSchema = z.looseObject({ strings: stringsSchema });
const siteTextSchema = z.looseObject({
  schemaVersion: z.literal(1),
  language: z.looseObject({ locale: z.string().min(1), formatLocale: z.string() }),
  strings: stringsSchema,
});
const pageSetSchema = z.looseObject({
  schemaVersion: z.literal(1),
  shell: docSchema,
  pages: z.record(z.string(), docSchema),
  // Explicit so a malformed override set is refused, and a test can see `text` is carried.
  text: pageTextSchema.optional(),
});
const issueSchema = z.looseObject({
  docKey: z.string(),
  rule: z.string(),
  message: z.string(),
  blockId: z.string().optional(),
});
const textIssueSchema = z.looseObject({
  scope: z.enum(['shared', 'layout']),
  key: z.string(),
  rule: z.string(),
  message: z.string(),
});
const inboundSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('sf-builder-ready'), protocol: z.literal(BUILDER_PROTOCOL) }),
  z.object({
    type: z.literal('sf-builder-change'),
    loadId: z.string().min(1).max(LOAD_ID_MAX),
    pageSet: pageSetSchema,
    issues: z.array(issueSchema).max(500),
    siteText: siteTextSchema.nullable().optional(),
    textIssues: z.array(textIssueSchema).max(500).optional(),
  }),
  z.object({ type: z.literal('sf-builder-upload-request'), requestId: z.string().min(1).max(100), file: z.instanceof(File) }),
  z.object({ type: z.literal('sf-builder-viewport'), width: z.union([z.literal(360), z.literal(768), z.literal(1280), z.null()]) }),
]);
```

Replace the change branch in `parseBuilderMessage`:

```ts
  if (result.data.type === 'sf-builder-change') {
    // Forward the frame's own objects: the backend must see exactly what the editor produced.
    const raw = data as { pageSet: PageSet; issues: BuilderIssue[]; siteText?: SiteText | null; textIssues?: TextIssue[] };
    const change: Extract<BuilderInbound, { type: 'sf-builder-change' }> = {
      type: 'sf-builder-change',
      loadId: result.data.loadId,
      pageSet: raw.pageSet,
      issues: raw.issues,
      textIssues: raw.textIssues ?? [],
    };
    if (raw.siteText) change.siteText = raw.siteText;
    return change;
  }
```

- [ ] **Step 3: Update `use-builder-bridge.ts`**

```ts
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { PreviewTarget } from '@/features/storefront-settings/template-form.ts';
import type { BuilderIssue, PageSet } from '@/types/storefront-pages.ts';
import { parseBuilderMessage, type BuilderChangeText, type BuilderViewport } from './protocol.ts';

export interface BuilderBridgeHandlers {
  onReady: () => void;
  /** `text` carries the shared Site text (when the load did) and the text issues. */
  onChange: (loadId: string, pageSet: PageSet, issues: BuilderIssue[], text: BuilderChangeText) => void;
  onUploadRequest: (requestId: string, file: File) => void;
  onViewport: (width: BuilderViewport) => void;
}
```

In the message handler, replace the `onChange` call:

```ts
      } else if (msg.type === 'sf-builder-change') {
        const text: BuilderChangeText = { textIssues: msg.textIssues };
        if (msg.siteText) text.siteText = msg.siteText;
        handlersRef.current.onChange(msg.loadId, msg.pageSet, msg.issues, text);
```

Keep the rest of the file unchanged.

- [ ] **Step 4: Run the checks**

```bash
node "$SCRATCH/t2.check.mjs"                 # T2 CHECK OK
npm run build 2>&1 | tail -3                  # success
node "$SCRATCH/lint-gate.mjs" pages/protocol.ts pages/use-builder-bridge.ts
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(storefront-pages): builder protocol carries siteText, textIssues and page-set text

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- src/features/storefront-settings/pages/protocol.ts src/features/storefront-settings/pages/use-builder-bridge.ts
```

---

### Task 3: Site text diff

**Files:**
- Modify: `src/features/storefront-settings/pages/diff.ts`
- Scratch: `$SCRATCH/t3.check.mjs`

**Depends on:** Task 1.

**Interfaces:**
- Consumes: `SiteText`, `PageSet`, `TextValue`, `TextLanguage`, `LocaleStrings`, `Locale` types.
- Produces (from `./diff.ts`; the existing `stableStringify`, `diffPageSets`, `diffIsEmpty`, `DiffEntry`, `PageSetDiff` are unchanged):
  ```ts
  type TextChangeKind = 'added' | 'changed' | 'reset' | 'removed'
  interface TextChange { locale: Locale; key: string; kind: TextChangeKind; note: string; before: TextValue | null; after: TextValue | null }
  interface LanguageChange { field: 'locale' | 'formatLocale'; label: string; before: string; after: string }
  interface SiteTextDiff { shared: TextChange[]; language: LanguageChange[] }
  DEFAULT_TEXT_LANGUAGE: TextLanguage                       // { locale: 'en', formatLocale: '' }
  diffSiteText(published: SiteText | null, draft: SiteText | null): SiteTextDiff
  diffPageText(published: PageSet | null, draft: PageSet | null): TextChange[]   // this layout's overrides
  sharedTextChanged(diff: SiteTextDiff | null): boolean
  formatTextValue(value: TextValue | null, emptyLabel: string): string
  describeLocale(tag: string): string                        // 'German (de)'
  describeFormatLocale(tag: string): string                  // '' → 'Built-in for the store language'
  ```
- Notes (asserted in Task 8): shared `added` → `Set`, `changed` → `Changed`, `reset` → `Reset to default`; layout `added` → `Override added`, `changed` → `Override changed`, `removed` → `Override removed`.

- [ ] **Step 1: Write the failing check** — `$SCRATCH/t3.check.mjs`

```js
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const d = await import(pathToFileURL(resolve('src/features/storefront-settings/pages/diff.ts')).href);

const lang = { locale: 'en', formatLocale: '' };
const site = (en, language = lang, extra = {}) => ({ schemaVersion: 1, language, strings: { en, ...extra } });
const PUB = site({ 'cart.drawer.title': 'Your basket', 'catalog.search.placeholder': 'Search', 'cart.summary.items': { one: '{count} item', other: '{count} items' } });

// nothing published, empty default draft → no changes
assert.deepEqual(d.diffSiteText(null, site({})), { shared: [], language: [] });
assert.deepEqual(d.diffSiteText(null, null), { shared: [], language: [] });
// key order and plural-form order never read as a change
assert.deepEqual(d.diffSiteText(PUB, site({ 'cart.summary.items': { other: '{count} items', one: '{count} item' }, 'catalog.search.placeholder': 'Search', 'cart.drawer.title': 'Your basket' })).shared, []);

// added / changed / reset, sorted by locale then key
const DRAFT = site(
  { 'cart.drawer.title': 'Your bag', 'cart.summary.items': { one: '{count} item', other: '{count} items' }, 'checkout.errors.emailRequired': 'We need your email' },
  lang,
  { de: { 'cart.drawer.title': 'Dein Korb' } },
);
const diff = d.diffSiteText(PUB, DRAFT);
assert.deepEqual(diff.shared.map((c) => [c.locale, c.key, c.kind, c.note]), [
  ['de', 'cart.drawer.title', 'added', 'Set'],
  ['en', 'cart.drawer.title', 'changed', 'Changed'],
  ['en', 'catalog.search.placeholder', 'reset', 'Reset to default'],
  ['en', 'checkout.errors.emailRequired', 'added', 'Set'],
]);
assert.equal(diff.shared[1].before, 'Your basket');
assert.equal(diff.shared[1].after, 'Your bag');
assert.equal(diff.shared[2].after, null);
assert.equal(diff.language.length, 0);
assert.equal(d.sharedTextChanged(diff), true);
assert.equal(d.sharedTextChanged(null), false);
assert.equal(d.sharedTextChanged({ shared: [], language: [] }), false);

// plural edit is 'changed'
assert.deepEqual(d.diffSiteText(PUB, site({ ...PUB.strings.en, 'cart.summary.items': { one: '{count} thing', other: '{count} things' } })).shared.map((c) => c.kind), ['changed']);

// language: against the built-in default when nothing is published
const de = d.diffSiteText(null, site({}, { locale: 'de', formatLocale: 'de-DE' }));
assert.deepEqual(de.language.map((l) => [l.field, l.label]), [['locale', 'Store language'], ['formatLocale', 'Numbers and dates']]);
assert.equal(de.language[0].before, 'English (en)');
assert.equal(de.language[0].after, 'German (de)');
assert.equal(de.language[1].before, 'Built-in for the store language');
assert.equal(de.language[1].after, 'German (Germany) (de-DE)');
assert.equal(d.sharedTextChanged(de), true, 'a language-only change is a shared change');
assert.equal(d.describeLocale('xx-Fake'), 'xx-Fake', 'unknown tags fall back to the tag');

// layout overrides
const doc = { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [] };
const set = (text) => ({ schemaVersion: 1, shell: doc, pages: {}, ...(text ? { text } : {}) });
assert.deepEqual(d.diffPageText(set(null), set(null)), []);
assert.deepEqual(d.diffPageText(null, set({ strings: {} })), []);
const ov = d.diffPageText(
  set({ strings: { en: { 'shell.nav.ariaLabel': 'Main menu', 'cart.drawer.title': 'Bag' } } }),
  set({ strings: { en: { 'shell.nav.ariaLabel': 'Shop menu', 'catalog.search.placeholder': 'Find' } } }),
);
assert.deepEqual(ov.map((c) => [c.key, c.kind, c.note]), [
  ['cart.drawer.title', 'removed', 'Override removed'],
  ['catalog.search.placeholder', 'added', 'Override added'],
  ['shell.nav.ariaLabel', 'changed', 'Override changed'],
]);
// the page diff never counts text as a document change
assert.equal(d.diffIsEmpty(d.diffPageSets(set({ strings: { en: { a: 'x' } } }), set({ strings: { en: { a: 'y' } } }))), true);

// prototype-looking keys are data, not inherited properties
assert.deepEqual(d.diffSiteText(site({}), site({ constructor: 'x' })).shared.map((c) => c.kind), ['added']);
assert.deepEqual(d.diffSiteText(site({ toString: 'x' }), site({})).shared.map((c) => c.kind), ['reset']);

// formatting
assert.equal(d.formatTextValue(null, 'Built-in default'), 'Built-in default');
assert.equal(d.formatTextValue('Your bag', '-'), '“Your bag”');
assert.equal(d.formatTextValue({ other: '{count} things', one: '{count} thing' }, '-'), 'one: “{count} thing” · other: “{count} things”');
console.log('T3 CHECK OK');
```

Run: `node "$SCRATCH/t3.check.mjs"`. Expected: FAIL with `d.diffSiteText is not a function`.

- [ ] **Step 2: Implement** — in `diff.ts`, change the type import and append the text diff:

```ts
import type {
  DocKey, FixedRouteKey, Locale, LocaleStrings, PageSet, PuckDoc, RouteKey, SiteText, TextLanguage, TextValue,
} from '@/types/storefront-pages.ts';
```

Append after `diffIsEmpty`:

```ts
// ---- Site text (editable-text spec §8 "Publish dialog") ------------------------------------

export type TextChangeKind = 'added' | 'changed' | 'reset' | 'removed';
export interface TextChange {
  locale: Locale;
  key: string;
  kind: TextChangeKind;
  /** Human note for the dialog row. */
  note: string;
  /** null = no value at this scope (the next layer / the built-in default shows). */
  before: TextValue | null;
  after: TextValue | null;
}
export interface LanguageChange { field: 'locale' | 'formatLocale'; label: string; before: string; after: string }
export interface SiteTextDiff { shared: TextChange[]; language: LanguageChange[] }

/** What a store with no published Site text runs on (spec §3 default). */
export const DEFAULT_TEXT_LANGUAGE: TextLanguage = { locale: 'en', formatLocale: '' };

const SHARED_NOTES: Record<TextChangeKind, string> = { added: 'Set', changed: 'Changed', reset: 'Reset to default', removed: 'Reset to default' };
const LAYOUT_NOTES: Record<TextChangeKind, string> = { added: 'Override added', changed: 'Override changed', reset: 'Override removed', removed: 'Override removed' };

function valueAt(strings: LocaleStrings, key: string): TextValue | undefined {
  return Object.hasOwn(strings, key) ? strings[key] : undefined;
}

function diffStrings(
  before: Record<Locale, LocaleStrings> | undefined,
  after: Record<Locale, LocaleStrings> | undefined,
  scope: 'shared' | 'layout',
): TextChange[] {
  const notes = scope === 'shared' ? SHARED_NOTES : LAYOUT_NOTES;
  const out: TextChange[] = [];
  const locales = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();
  for (const locale of locales) {
    const b = (before && Object.hasOwn(before, locale) ? before[locale] : undefined) ?? {};
    const a = (after && Object.hasOwn(after, locale) ? after[locale] : undefined) ?? {};
    const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort();
    for (const key of keys) {
      const was = valueAt(b, key);
      const now = valueAt(a, key);
      let kind: TextChangeKind | null = null;
      if (was === undefined && now !== undefined) kind = 'added';
      else if (was !== undefined && now === undefined) kind = scope === 'shared' ? 'reset' : 'removed';
      else if (was !== undefined && now !== undefined && stableStringify(was) !== stableStringify(now)) kind = 'changed';
      if (kind) out.push({ locale, key, kind, note: notes[kind], before: was ?? null, after: now ?? null });
    }
  }
  return out;
}

/** English display name of a BCP 47 tag, e.g. 'German (de)'; the bare tag when Intl doesn't know it. */
export function describeLocale(tag: string): string {
  let name: string | undefined;
  try {
    name = new Intl.DisplayNames(['en'], { type: 'language' }).of(tag);
  } catch {
    name = undefined;
  }
  return name && name !== tag ? `${name} (${tag})` : tag;
}

export function describeFormatLocale(tag: string): string {
  return tag === '' ? 'Built-in for the store language' : describeLocale(tag);
}

/**
 * Shared Site text: the draft as the BACKEND stores it (which may include another admin's edits —
 * spec §13 item 5) against the newest published version. `published === null` = nothing published,
 * so the language compares against the built-in default.
 */
export function diffSiteText(published: SiteText | null, draft: SiteText | null): SiteTextDiff {
  if (draft === null) return { shared: [], language: [] };
  const was = published?.language ?? DEFAULT_TEXT_LANGUAGE;
  const now = draft.language;
  const language: LanguageChange[] = [];
  if (was.locale !== now.locale) {
    language.push({ field: 'locale', label: 'Store language', before: describeLocale(was.locale), after: describeLocale(now.locale) });
  }
  if (was.formatLocale !== now.formatLocale) {
    language.push({ field: 'formatLocale', label: 'Numbers and dates', before: describeFormatLocale(was.formatLocale), after: describeFormatLocale(now.formatLocale) });
  }
  return { shared: diffStrings(published?.strings, draft.strings, 'shared'), language };
}

/** This layout's overrides (PageSet.text) against the newest published page set. */
export function diffPageText(published: PageSet | null, draft: PageSet | null): TextChange[] {
  return diffStrings(published?.text?.strings, draft?.text?.strings, 'layout');
}

export function sharedTextChanged(diff: SiteTextDiff | null): boolean {
  return diff !== null && diff.shared.length + diff.language.length > 0;
}

const PLURAL_ORDER = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

/** Display form of a value: “text”, plural forms as `one: “…” · other: “…”`, or `emptyLabel` for none. */
export function formatTextValue(value: TextValue | null, emptyLabel: string): string {
  if (value === null) return emptyLabel;
  if (typeof value === 'string') return `“${value}”`;
  return PLURAL_ORDER.filter((c) => value[c] !== undefined).map((c) => `${c}: “${value[c]}”`).join(' · ');
}
```

Also extend the file's header comment with one sentence: "Text diffs (`diffSiteText`, `diffPageText`) cover the Site text document and this layout's overrides; `diffPageSets` never looks at `text`."

- [ ] **Step 3: Run the checks**

```bash
node "$SCRATCH/t3.check.mjs"          # T3 CHECK OK
npm run build 2>&1 | tail -3
node "$SCRATCH/lint-gate.mjs" pages/diff.ts
```

If `describeLocale('de-DE')` prints a different English name on this Node build (ICU data differs), fix the **check**, not the code. Keep the `Name (tag)` shape.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(storefront-pages): site text and layout override diff for the publish dialog

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- src/features/storefront-settings/pages/diff.ts
```

---

### Task 4: VersionsDrawer tabs, text restore option, ConfirmDialog children (UI)

Implementer: load the `frontend-design:frontend-design` skill before writing UI code.

**Files:**
- Create: `src/features/storefront-settings/pages/text-restore.ts`
- Modify: `src/features/storefront-settings/pages/VersionsDrawer.tsx`
- Modify: `src/components/ui/ConfirmDialog.tsx`
- Scratch: `$SCRATCH/t4.check.mjs`

**Depends on:** Task 1.

**Interfaces:**
- Consumes:
  - `listPageSetVersions`, `storefrontPagesKeys` (existing).
  - `listSiteTextVersions`, `storefrontTextKeys` (Task 1).
  - `PageSetVersionSummary.textVersion` (Task 1).
- Produces:
  - `textRestoreOption(pin: number | null, history: TextHistoryState): TextRestoreOption` from `./text-restore.ts`, where:
    - `TextHistoryState = { status: 'pending' | 'error' | 'success'; versions: readonly { version: number }[] }`
    - `TextRestoreOption = { enabled: boolean; label: string; reason: string | null }`
  - `VersionsDrawer` props. New props are optional and `onRestore` only gains a parameter, so today's `PagesTab` still compiles:
    ```ts
    open: boolean; onClose: () => void; layout: LayoutKind;
    previewing: number | null;                 // page version being previewed
    previewingText?: number | null;            // site text version being previewed
    onPreview: (version: number) => void;
    onRestore: (version: number, withText: boolean) => Promise<void>;
    onPreviewText?: (version: number) => void; // the Site text tab shows only when both text callbacks are given
    onRestoreText?: (version: number) => Promise<void>;
    ```
  - `ConfirmDialog` gains `children?: ReactNode`, rendered between the message and the buttons.

- [ ] **Step 1: Write the failing check** — `$SCRATCH/t4.check.mjs`

```js
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { textRestoreOption } = await import(pathToFileURL(resolve('src/features/storefront-settings/pages/text-restore.ts')).href);

const ok = (versions) => ({ status: 'success', versions: versions.map((version) => ({ version })) });
const LABEL = (n) => `Also restore the site text from then (v${n}) — changes all 3 layouts`;

let o = textRestoreOption(1, ok([3, 2, 1]));
assert.deepEqual(o, { enabled: true, label: LABEL(1), reason: null });

o = textRestoreOption(null, ok([3, 2, 1]));
assert.equal(o.enabled, false);
assert.equal(o.reason, 'No site text was recorded with this version.');
assert.equal(o.label, 'Also restore the site text from then — changes all 3 layouts');
assert.equal(textRestoreOption(0, ok([3])).reason, 'No site text was recorded with this version.', 'pin 0 = none existed');

o = textRestoreOption(3, ok([3, 2, 1]));
assert.equal(o.enabled, false);
assert.equal(o.reason, 'Site text v3 is already live.');

o = textRestoreOption(4, ok([30, 29, 11]));
assert.equal(o.enabled, false);
assert.equal(o.reason, 'Site text v4 is no longer kept — only the last 20 versions are.');

assert.equal(textRestoreOption(2, { status: 'pending', versions: [] }).reason, 'Loading the site text history…');
assert.equal(textRestoreOption(2, { status: 'error', versions: [] }).reason, 'Couldn’t load the site text history.');
assert.equal(textRestoreOption(2, { status: 'pending', versions: [] }).enabled, false);
console.log('T4 CHECK OK');
```

Run: `node "$SCRATCH/t4.check.mjs"`. Expected: FAIL (`ERR_MODULE_NOT_FOUND`).

- [ ] **Step 2: Create `text-restore.ts`**

```ts
/**
 * "Also restore the site text from then" on a page-version restore (editable-text spec §4.5, §8).
 * The option is offered only when the version's pinned text version still exists and isn't
 * already live — otherwise the backend answers TEXT_VERSION_GONE or restores nothing. React-free
 * so a scratch `node` script can check it.
 */
export interface TextHistoryState {
  status: 'pending' | 'error' | 'success';
  /** Newest first, as GET /storefront-text/versions returns it. */
  versions: readonly { version: number }[];
}
export interface TextRestoreOption { enabled: boolean; label: string; reason: string | null }

export function textRestoreOption(pin: number | null, history: TextHistoryState): TextRestoreOption {
  const label = pin
    ? `Also restore the site text from then (v${pin}) — changes all 3 layouts`
    : 'Also restore the site text from then — changes all 3 layouts';
  let reason: string | null = null;
  if (!pin) reason = 'No site text was recorded with this version.';
  else if (history.status === 'pending') reason = 'Loading the site text history…';
  else if (history.status === 'error') reason = 'Couldn’t load the site text history.';
  else if (!history.versions.some((v) => v.version === pin)) reason = `Site text v${pin} is no longer kept — only the last 20 versions are.`;
  else if (history.versions[0]?.version === pin) reason = `Site text v${pin} is already live.`;
  return { enabled: reason === null, label, reason };
}
```

Run: `node "$SCRATCH/t4.check.mjs"`. Expected: `T4 CHECK OK`.

- [ ] **Step 3: `ConfirmDialog` children** — in `src/components/ui/ConfirmDialog.tsx`:

```tsx
import type { ReactNode } from 'react';
```

Add to `ConfirmDialogProps`:

```ts
  /** Extra controls (e.g. an opt-in checkbox) shown between the message and the buttons. */
  children?: ReactNode;
```

Destructure `children` and render it after the message:

```tsx
      <p className="text-sm text-text-secondary mb-6">{message}</p>
      {children ? <div className="-mt-3 mb-6">{children}</div> : null}
```

No other change. Every existing caller passes no children and renders exactly as before.

- [ ] **Step 4: Rewrite `VersionsDrawer.tsx`**

```tsx
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { listPageSetVersions, storefrontPagesKeys } from '@/api/storefront-pages.ts';
import { listSiteTextVersions, storefrontTextKeys } from '@/api/storefront-text.ts';
import Badge from '@/components/ui/Badge.tsx';
import Button from '@/components/ui/Button.tsx';
import ConfirmDialog from '@/components/ui/ConfirmDialog.tsx';
import Drawer from '@/components/ui/Drawer.tsx';
import Spinner from '@/components/ui/Spinner.tsx';
import Tabs from '@/components/ui/Tabs.tsx';
import { formatDateTime } from '@/lib/format.ts';
import type { LayoutKind } from '@/types/storefront-pages.ts';
import { LAYOUT_LABELS } from './labels.ts';
import { textRestoreOption } from './text-restore.ts';

interface VersionsDrawerProps {
  open: boolean;
  onClose: () => void;
  layout: LayoutKind;
  previewing: number | null;
  previewingText?: number | null;
  onPreview: (version: number) => void;
  onRestore: (version: number, withText: boolean) => Promise<void>;
  onPreviewText?: (version: number) => void;
  onRestoreText?: (version: number) => Promise<void>;
}

type HistoryTab = 'pages' | 'text';

/**
 * Published history (spec §9 "Versions drawer", editable-text §8): a **Pages** tab for this layout
 * (each row shows the Site text version it pinned) and a **Site text** tab for the store-wide text.
 * Both list queries share their keys with usePagesEditor, and the socket events invalidate them,
 * so this drawer never refetches on its own.
 */
export default function VersionsDrawer({
  open, onClose, layout, previewing, previewingText = null, onPreview, onRestore, onPreviewText, onRestoreText,
}: VersionsDrawerProps) {
  const textEnabled = onPreviewText !== undefined && onRestoreText !== undefined;
  const [tab, setTab] = useState<HistoryTab>('pages');
  const activeTab: HistoryTab = textEnabled ? tab : 'pages';

  const versionsQuery = useQuery({ queryKey: storefrontPagesKeys.versions(layout), queryFn: () => listPageSetVersions(layout) });
  const textVersionsQuery = useQuery({ queryKey: storefrontTextKeys.versions(), queryFn: listSiteTextVersions, enabled: textEnabled });
  const versions = versionsQuery.data ?? [];
  const textVersions = textVersionsQuery.data ?? [];

  const [confirmVersion, setConfirmVersion] = useState<number | null>(null);
  const [withText, setWithText] = useState(false);
  const [confirmTextVersion, setConfirmTextVersion] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);
  const reasonId = useId();

  const confirming = versions.find((v) => v.version === confirmVersion) ?? null;
  const option = textRestoreOption(confirming?.textVersion ?? null, { status: textVersionsQuery.status, versions: textVersions });

  function askRestore(version: number) {
    setWithText(false);
    setConfirmVersion(version);
  }

  async function restore(version: number) {
    setRestoring(true);
    try {
      await onRestore(version, textEnabled && withText && option.enabled);
      setConfirmVersion(null);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setRestoring(false);
    }
  }

  async function restoreText(version: number) {
    if (!onRestoreText) return;
    setRestoring(true);
    try {
      await onRestoreText(version);
      setConfirmTextVersion(null);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setRestoring(false);
    }
  }

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={`Published versions · ${LAYOUT_LABELS[layout]}`}
        width="sm"
        footer={
          <p className="text-[11px] text-text-tertiary">
            {activeTab === 'pages'
              ? 'The last 20 published versions are kept. Restoring publishes a copy as a new version.'
              : 'Site text is shared by all 3 layouts. The last 20 versions are kept; restoring publishes a copy as a new version.'}
          </p>
        }
      >
        {textEnabled && (
          <Tabs
            tabs={[{ id: 'pages', label: 'Pages' }, { id: 'text', label: 'Site text' }]}
            active={activeTab}
            onChange={(id) => setTab(id === 'text' ? 'text' : 'pages')}
          />
        )}

        {activeTab === 'pages' ? (
          versionsQuery.isLoading ? (
            <div className="flex justify-center py-10" role="status" aria-label="Loading versions"><Spinner /></div>
          ) : versionsQuery.isError ? (
            <div className="space-y-3 px-5 py-6 text-[13px] text-text-secondary">
              <p>Couldn’t load the published versions.</p>
              <Button variant="secondary" size="sm" className="max-lg:min-h-11" onClick={() => versionsQuery.refetch()}>Try again</Button>
            </div>
          ) : versions.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-text-secondary">
              Nothing published yet for this layout. Until you publish, shoppers see the built-in pages.
            </p>
          ) : (
            <ol className="divide-y divide-border-subtle" aria-label="Published versions">
              {versions.map((v, i) => (
                <li key={v.version} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-text-primary">
                      Version {v.version}
                      {i === 0 && <Badge color="success">Live</Badge>}
                      {previewing === v.version && <Badge color="info">Previewing</Badge>}
                      {/* (asserted) "Text v{n}" when this version pinned a Site text version */}
                      {v.textVersion ? <Badge color="default">Text v{v.textVersion}</Badge> : null}
                    </p>
                    <p className="truncate text-[11px] text-text-tertiary">
                      {formatDateTime(v.createdAt)} · {v.createdBy ? v.createdBy.name : 'a removed user'}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="max-lg:min-h-11" aria-label={`Preview version ${v.version}`} onClick={() => { onClose(); onPreview(v.version); }}>
                    <Eye className="h-3.5 w-3.5" /> Preview
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="max-lg:min-h-11"
                    aria-label={`Restore version ${v.version}`}
                    disabled={i === 0 || restoring}
                    title={i === 0 ? 'Already live' : undefined}
                    onClick={() => askRestore(v.version)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Restore
                  </Button>
                </li>
              ))}
            </ol>
          )
        ) : textVersionsQuery.isLoading ? (
          <div className="flex justify-center py-10" role="status" aria-label="Loading site text versions"><Spinner /></div>
        ) : textVersionsQuery.isError ? (
          <div className="space-y-3 px-5 py-6 text-[13px] text-text-secondary">
            <p>Couldn’t load the site text versions.</p>
            <Button variant="secondary" size="sm" className="max-lg:min-h-11" onClick={() => textVersionsQuery.refetch()}>Try again</Button>
          </div>
        ) : textVersions.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-text-secondary">
            No site text published yet. Until you publish some, shoppers see the built-in wording.
          </p>
        ) : (
          <ol className="divide-y divide-border-subtle" aria-label="Published site text versions">
            {textVersions.map((v, i) => (
              <li key={v.version} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[13px] font-medium text-text-primary">
                    Site text v{v.version}
                    {i === 0 && <Badge color="success">Live</Badge>}
                    {previewingText === v.version && <Badge color="info">Previewing</Badge>}
                  </p>
                  <p className="truncate text-[11px] text-text-tertiary">
                    {formatDateTime(v.createdAt)} · {v.createdBy ? v.createdBy.name : 'a removed user'}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="max-lg:min-h-11" aria-label={`Preview site text version ${v.version}`} onClick={() => { onClose(); onPreviewText?.(v.version); }}>
                  <Eye className="h-3.5 w-3.5" /> Preview
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="max-lg:min-h-11"
                  aria-label={`Restore site text version ${v.version}`}
                  disabled={i === 0 || restoring}
                  title={i === 0 ? 'Already live' : undefined}
                  onClick={() => setConfirmTextVersion(v.version)}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Restore
                </Button>
              </li>
            ))}
          </ol>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmVersion !== null}
        onClose={() => { if (!restoring) setConfirmVersion(null); }}
        onConfirm={() => { if (confirmVersion !== null) void restore(confirmVersion); }}
        title={`Restore version ${confirmVersion ?? ''}?`}
        message={`This publishes version ${confirmVersion ?? ''} again as a new version, so shoppers see it within about 30 seconds. Your current draft is replaced by it. Shared site text is not changed unless you tick the box below.`}
        confirmLabel="Restore"
        variant="primary"
        loading={restoring}
        loadingLabel="Restoring…"
      >
        {textEnabled && (
          <label className="flex items-start gap-2 text-[13px] text-text-secondary max-lg:min-h-11">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-accent disabled:opacity-50"
              checked={withText && option.enabled}
              disabled={!option.enabled || restoring}
              aria-describedby={option.reason ? reasonId : undefined}
              onChange={(e) => setWithText(e.target.checked)}
            />
            <span>
              {option.label}
              {option.reason && <span id={reasonId} className="mt-0.5 block text-[11px] text-text-tertiary">{option.reason}</span>}
            </span>
          </label>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmTextVersion !== null}
        onClose={() => { if (!restoring) setConfirmTextVersion(null); }}
        onConfirm={() => { if (confirmTextVersion !== null) void restoreText(confirmTextVersion); }}
        title={`Restore site text v${confirmTextVersion ?? ''}?`}
        message="Restores the shared text on all 3 layouts; page layouts are not changed. It is published again as a new version, so shoppers see it within about 30 seconds, and unpublished shared text edits are replaced."
        confirmLabel="Restore"
        variant="primary"
        loading={restoring}
        loadingLabel="Restoring…"
      />
    </>
  );
}
```

Asserted strings in this file:
- `Text v{n}`, `Site text v{n}`, and the tab labels `Pages` / `Site text`.
- aria-labels `Restore version {n}`, `Preview site text version {n}`, `Restore site text version {n}`.
- Every `textRestoreOption` string.
- The text restore message.

- [ ] **Step 5: Build, check, lint**

```bash
node "$SCRATCH/t4.check.mjs"
npm run build 2>&1 | tail -3
node "$SCRATCH/lint-gate.mjs" pages/VersionsDrawer.tsx pages/text-restore.ts ui/ConfirmDialog.tsx
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(storefront-pages): versions drawer Site text tab, text pins, optional text restore

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- src/features/storefront-settings/pages/VersionsDrawer.tsx src/features/storefront-settings/pages/text-restore.ts src/components/ui/ConfirmDialog.tsx
```

---

### Task 5: `usePagesEditor` — two documents, one session

**Files:**
- Modify: `src/features/storefront-settings/pages/use-pages-editor.ts` (full replacement below)
- Modify: `src/features/storefront-settings/pages/PagesTab.tsx` (two compile-fix edits only, Step 3)

**Depends on:** Tasks 1, 2, 3.

**Interfaces:**
- Consumes:
  - Task 1: the text API, `isSiteTextConflict`, `createAutosaver<SiteText>`, `publishPageSet(…, textBaseVersion?)`, `restorePageSetVersion(…, { withText })`.
  - Task 2: `loadMessage(…, siteText?)`, `BuilderChangeText`, the 4-parameter `onChange`.
  - Task 3: `stableStringify`.
- Produces: `PagesEditor` (Task 7 relies on every name):
  ```ts
  interface PublishPreparation { pages: PageSet | null; text: SiteText | null | undefined }  // text undefined = no text session
  interface PagesEditor {
    layout; ready; loading; loadError; status; saveError; issues; hasDraft; baseVersion; viewport;  // unchanged
    previewing: number | null;          // page version previewed (unchanged meaning)
    previewingText: number | null;      // site text version previewed with the live pages
    textAvailable: boolean;             // this load holds a shared text session
    textStatus: SaveStatus; textSaveError: string | null;
    textIssues: TextIssue[];
    hasTextDraft: boolean;
    latestVersion: number; latestTextVersion: number;
    publishBlockedBy: string | null;
    switchLayout(next, force?): Promise<boolean>;
    reload(): Promise<void>;
    flush(): Promise<boolean>;
    currentPageSet(): PageSet | null;
    preparePublish(): Promise<PublishPreparation | null>;
    publish(): Promise<PublishResult>;
    discard(alsoText?: boolean): Promise<void>;
    restore(version: number, withText?: boolean): Promise<RestoreResult>;
    restoreText(version: number): Promise<number>;       // the NEW text version
    previewVersion(version: number): Promise<void>;
    previewTextVersion(version: number): Promise<void>;
    textDraftDiffers(): Promise<boolean>;                 // stored text draft ≠ newest published text
  }
  ```
  `PublishStaleError`, `isPublishStale` and `AUTOSAVE_DELAY_MS` are unchanged.

There is no unit harness for hooks. This task is verified by `npm run build`, the lint gate, and Task 8's browser pass. Read the whole replacement before pasting it: every text path mirrors an existing page path, and the comments say which.

- [ ] **Step 1: Replace `use-pages-editor.ts`**

```ts
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  discardPageSetDraft,
  getPageSetDraft,
  getPageSetVersion,
  isPageSetConflict,
  listPageSetVersions,
  publishPageSet,
  restorePageSetVersion,
  savePageSetDraft,
  storefrontPagesKeys,
  uploadStorefrontPageMedia,
} from '@/api/storefront-pages.ts';
import {
  discardSiteTextDraft,
  getSiteTextDraft,
  getSiteTextVersion,
  isSiteTextConflict,
  listSiteTextVersions,
  restoreSiteTextVersion,
  saveSiteTextDraft,
  storefrontTextKeys,
} from '@/api/storefront-text.ts';
import {
  buildPreviewMessage,
  findTemplate,
  toForm,
  type PreviewTarget,
  type PreviewTheme,
} from '@/features/storefront-settings/template-form.ts';
import { useSocket } from '@/hooks/use-socket.ts';
import type { StorefrontTemplateCatalog, StorefrontTheme } from '@/types/storefront-settings.ts';
import type {
  BuilderIssue,
  LayoutKind,
  PageSet,
  PublishResult,
  RestoreResult,
  SiteText,
  TextIssue,
} from '@/types/storefront-pages.ts';
import { createAutosaver, type Autosaver, type SaveStatus } from './autosaver.ts';
import { stableStringify } from './diff.ts';
import {
  checkUpload,
  isLayoutKind,
  loadMessage,
  themeMessage,
  uploadResultMessage,
  type AdminToBuilderMessage,
  type BuilderChangeText,
  type BuilderViewport,
} from './protocol.ts';
import { useBuilderBridge } from './use-builder-bridge.ts';

export const AUTOSAVE_DELAY_MS = 1000;

const UNSAVED_PREVIEW_MESSAGE = 'Your latest changes aren’t saved yet. Resolve the save problem above, then preview the version.';
const TEXT_LOAD_TOAST_ID = 'site-text-load';

/**
 * publish() refused before sending anything: the stored draft is no longer the one the Publish
 * dialog diffed (an edit was saved while it was open), an edit couldn't be saved, or no draft is loaded.
 */
export class PublishStaleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublishStaleError';
  }
}

export function isPublishStale(err: unknown): err is PublishStaleError {
  return err instanceof PublishStaleError;
}

/** A fresh sf-builder-load identity (spec §13 A6: 1–64 chars). */
function newLoadId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** The saved theme as the storefront renders it (locks enforced), minus customCss — same as the Appearance preview. */
function builderTheme(theme: StorefrontTheme, catalog: StorefrontTemplateCatalog): PreviewTheme {
  const form = toForm(theme);
  return buildPreviewMessage(form, findTemplate(catalog, form.template)).theme;
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export interface PublishPreparation {
  /** The layout draft as the backend stores it (the published set when there is no draft; null when neither exists). */
  pages: PageSet | null;
  /** The shared Site text draft as stored; null = none stored; undefined = no text session, so no text is published. */
  text: SiteText | null | undefined;
}

type PreviewState = { kind: 'pages' | 'text'; version: number };

/** Which drafts a held-edits request replaced on success (their held edits are dropped, not saved). */
interface Replaces { pages: boolean; text: boolean }

export interface PagesEditorOptions {
  frameRef: RefObject<HTMLIFrameElement | null>;
  target: PreviewTarget;
  initialLayout: LayoutKind;
  theme: StorefrontTheme;
  catalog: StorefrontTemplateCatalog;
}

export interface PagesEditor {
  layout: LayoutKind;
  ready: boolean;
  loading: boolean;
  loadError: string | null;
  status: SaveStatus;
  saveError: string | null;
  issues: BuilderIssue[];
  hasDraft: boolean;
  baseVersion: number;
  /** Page version shown read-only, or null. */
  previewing: number | null;
  /** Site text version shown read-only with this layout's live pages, or null. */
  previewingText: number | null;
  viewport: BuilderViewport;
  /** True when this load holds a shared Site text session (its GET succeeded). */
  textAvailable: boolean;
  textStatus: SaveStatus;
  textSaveError: string | null;
  textIssues: TextIssue[];
  hasTextDraft: boolean;
  /** Newest published version of the current layout from a RESOLVED versions list (0 = never published). */
  latestVersion: number;
  /** Newest published Site text version (0 = none). */
  latestTextVersion: number;
  /** Why Publish is disabled right now, or null when it may be opened. */
  publishBlockedBy: string | null;
  switchLayout(next: LayoutKind, force?: boolean): Promise<boolean>;
  reload(): Promise<void>;
  flush(): Promise<boolean>;
  currentPageSet(): PageSet | null;
  /**
   * Flushes both autosavers, then reads both drafts as the BACKEND stores them for the publish
   * diff. Resolves null when unsaved edits couldn't be saved; rejects if a draft GET fails.
   */
  preparePublish(): Promise<PublishPreparation | null>;
  publish(): Promise<PublishResult>;
  /** `alsoText` also discards the shared Site text draft (all layouts). */
  discard(alsoText?: boolean): Promise<void>;
  /** `withText` also restores the Site text version this page version pinned. */
  restore(version: number, withText?: boolean): Promise<RestoreResult>;
  /** Restores a Site text version as a new version; page sets are untouched. Resolves the new version. */
  restoreText(version: number): Promise<number>;
  previewVersion(version: number): Promise<void>;
  previewTextVersion(version: number): Promise<void>;
  /** Whether the stored Site text draft differs from the newest published text (Discard's opt-in). */
  textDraftDiffers(): Promise<boolean>;
}

/**
 * Orchestrates the Pages tab (spec §9; editable-text spec §8). Two documents, one session:
 * - ready → GET the layout draft AND GET /storefront-text/draft in parallel → one sf-builder-load
 *   (with `siteText` only when the text GET succeeded; a failure toasts and leaves page editing alone)
 * - every load posts a fresh loadId; a change echoing any other loadId is ignored for BOTH documents
 * - change → debounced PUT of the page set and, separately, of the Site text (own baseline,
 *   generation, baseVersion); the first change after each load is the baseline for both
 * - PAGESET_CONFLICT pauses page autosave; SITETEXT_CONFLICT pauses only text autosave and blocks Publish
 * - publish sends text.baseVersion whenever a text session exists (one backend transaction)
 * - discard (optionally the text draft too), restore (optionally with the pinned text), text restore,
 *   version previews (with the pinned text / a text version over the live pages)
 * - socket storefront-pages:published / storefront-text:published → invalidate that history
 * - beforeunload while either document is unsaved → browser prompt
 *
 * Every state change happens in an event handler or a promise callback, never synchronously in an
 * effect body. Refs are read only inside handlers and effects, never during render.
 */
export function usePagesEditor({ frameRef, target, initialLayout, theme, catalog }: PagesEditorOptions): PagesEditor {
  const qc = useQueryClient();
  const socket = useSocket();

  const [layout, setLayout] = useState<LayoutKind>(initialLayout);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [issues, setIssues] = useState<BuilderIssue[]>([]);
  const [hasDraft, setHasDraft] = useState(false);
  const [baseVersion, setBaseVersion] = useState(0);
  const [previewing, setPreviewing] = useState<number | null>(null);
  const [previewingText, setPreviewingText] = useState<number | null>(null);
  const [viewport, setViewport] = useState<BuilderViewport>(null);
  // Site text session
  const [textAvailable, setTextAvailable] = useState(false);
  const [textStatus, setTextStatus] = useState<SaveStatus>('idle');
  const [textSaveError, setTextSaveError] = useState<string | null>(null);
  const [textIssues, setTextIssues] = useState<TextIssue[]>([]);
  const [hasTextDraft, setHasTextDraft] = useState(false);

  const layoutRef = useRef<LayoutKind>(initialLayout);
  const baseVersionRef = useRef(0);
  const previewingRef = useRef<PreviewState | null>(null);
  /** The first sf-builder-change after a load is the frame echoing what it loaded — the baseline (both documents). */
  const awaitingBaselineRef = useRef(false);
  /** False from the start of a load until its sf-builder-load is posted; changes in between are ignored. */
  const loadedRef = useRef(false);
  const loadSeqRef = useRef(0);
  /** loadId of the last sf-builder-load posted (null while a load is being fetched). Changes must echo it. */
  const loadIdRef = useRef<string | null>(null);
  /** Counts successful PUTs of EITHER document; preparePublish snapshots it so publish() can tell a diffed draft changed. */
  const saveSeqRef = useRef(0);
  const publishSnapshotRef = useRef<number | null>(null);
  /** Bumped whenever the server-side page draft is replaced under its autosaver. */
  const generationRef = useRef(0);
  const autosaverRef = useRef<Autosaver | null>(null);
  /** The Site text session (mirrors the page refs above). */
  const textAvailableRef = useRef(false);
  const textBaseVersionRef = useRef(0);
  const textGenerationRef = useRef(0);
  const textConflictRef = useRef(false);
  const textSaverRef = useRef<Autosaver<SiteText> | null>(null);
  /**
   * True while a publish / discard / restore request is out. Edits made meanwhile are held here
   * instead of being scheduled, so no PUT races the request. See withEditsHeld.
   */
  const mutatingRef = useRef(false);
  const heldRef = useRef<PageSet | null>(null);
  const heldTextRef = useRef<SiteText | null>(null);

  const currentTheme = useMemo(() => builderTheme(theme, catalog), [theme, catalog]);
  const themeRef = useRef(currentTheme);

  const versionsQuery = useQuery({
    queryKey: storefrontPagesKeys.versions(layout),
    queryFn: () => listPageSetVersions(layout),
  });
  const latestVersion = versionsQuery.data?.[0]?.version ?? 0;
  const textVersionsQuery = useQuery({ queryKey: storefrontTextKeys.versions(), queryFn: listSiteTextVersions });
  const latestTextVersion = textVersionsQuery.data?.[0]?.version ?? 0;

  const post = useCallback(
    (message: AdminToBuilderMessage) => {
      frameRef.current?.contentWindow?.postMessage(message, target.origin);
    },
    [frameRef, target],
  );

  // Page autosaver (unchanged). Created in an effect so the save closure's ref reads never run in render.
  useEffect(() => {
    const saver = createAutosaver<PageSet>({
      delayMs: AUTOSAVE_DELAY_MS,
      isConflict: isPageSetConflict,
      save: async (pageSet) => {
        const gen = generationRef.current;
        try {
          const result = await savePageSetDraft(layoutRef.current, { data: pageSet, baseVersion: baseVersionRef.current });
          if (gen !== generationRef.current) return;
          baseVersionRef.current = result.baseVersion;
          saveSeqRef.current++;
          setBaseVersion(result.baseVersion);
          setHasDraft(true);
        } catch (err) {
          if (gen !== generationRef.current) throw new Error('Superseded save');
          throw err;
        }
      },
      onStatus: (next, error) => {
        setStatus(next);
        setSaveError(error);
      },
    });
    autosaverRef.current = saver;
    return () => {
      void saver.flush();
    };
  }, []);

  // Site text autosaver: own baseline, generation and baseVersion (editable-text spec §8 "Autosave").
  useEffect(() => {
    const saver = createAutosaver<SiteText>({
      delayMs: AUTOSAVE_DELAY_MS,
      isConflict: isSiteTextConflict,
      save: async (siteText) => {
        const gen = textGenerationRef.current;
        try {
          const result = await saveSiteTextDraft({ data: siteText, baseVersion: textBaseVersionRef.current });
          if (gen !== textGenerationRef.current) return;
          textBaseVersionRef.current = result.baseVersion;
          saveSeqRef.current++;
          setHasTextDraft(true);
        } catch (err) {
          if (gen !== textGenerationRef.current) throw new Error('Superseded save');
          throw err;
        }
      },
      onStatus: (next, error) => {
        textConflictRef.current = next === 'conflict';
        setTextStatus(next);
        setTextSaveError(error);
      },
    });
    textSaverRef.current = saver;
    return () => {
      void saver.flush();
    };
  }, []);

  /** Both savers; a text session already paused by a conflict has nothing left to save and doesn't count as a failure. */
  const flush = useCallback(async () => {
    const pages = autosaverRef.current ? await autosaverRef.current.flush() : true;
    const text = textSaverRef.current ? await textSaverRef.current.flush() : true;
    return pages && (text || textConflictRef.current);
  }, []);

  const loadDraft = useCallback(
    async (forLayout: LayoutKind) => {
      const seq = ++loadSeqRef.current;
      generationRef.current++;
      autosaverRef.current?.cancel();
      loadedRef.current = false;
      loadIdRef.current = null;
      heldRef.current = null; // an edit held for the old draft must never be saved onto this one
      heldTextRef.current = null;
      awaitingBaselineRef.current = false;
      previewingRef.current = null;
      setPreviewing(null);
      setPreviewingText(null);
      setHasDraft(false);
      setLoading(true);
      setLoadError(null);
      try {
        // Shared text is not replaced by a page load: save any pending shared edit before re-reading it.
        await textSaverRef.current?.flush();
        if (seq !== loadSeqRef.current) return;
        textGenerationRef.current++;
        textSaverRef.current?.cancel();
        const [pageResult, textResult] = await Promise.allSettled([
          qc.fetchQuery({ queryKey: storefrontPagesKeys.draft(forLayout), queryFn: () => getPageSetDraft(forLayout), staleTime: 0 }),
          qc.fetchQuery({ queryKey: storefrontTextKeys.draft(), queryFn: getSiteTextDraft, staleTime: 0 }),
        ]);
        if (seq !== loadSeqRef.current) return; // superseded by a newer load
        if (pageResult.status === 'rejected') throw pageResult.reason;
        const draft = pageResult.value;
        baseVersionRef.current = draft.baseVersion;
        setBaseVersion(draft.baseVersion);
        setHasDraft(draft.source === 'draft');
        setIssues([]);
        setTextIssues([]);
        autosaverRef.current?.setBaseline(draft.data);

        let siteText: SiteText | null | undefined;
        if (textResult.status === 'fulfilled') {
          const text = textResult.value;
          textBaseVersionRef.current = text.baseVersion;
          textSaverRef.current?.setBaseline(text.data);
          textAvailableRef.current = true;
          setTextAvailable(true);
          setHasTextDraft(text.source === 'draft');
          siteText = text.data;
        } else {
          textSaverRef.current?.setBaseline(null);
          textAvailableRef.current = false;
          setTextAvailable(false);
          setHasTextDraft(false);
          toast.error(
            `Couldn’t load the site text (${errorText(textResult.reason, 'unknown error')}). You can still edit this layout; shared text is read-only until you reload.`,
            { id: TEXT_LOAD_TOAST_ID },
          );
        }

        awaitingBaselineRef.current = true;
        loadedRef.current = true;
        const loadId = newLoadId();
        loadIdRef.current = loadId;
        post(loadMessage(loadId, forLayout, draft.data, themeRef.current, false, siteText));
      } catch (err) {
        if (seq === loadSeqRef.current) setLoadError(errorText(err, 'Could not load the draft'));
      } finally {
        if (seq === loadSeqRef.current) setLoading(false);
      }
    },
    [qc, post],
  );

  const onReady = useCallback(() => {
    // Also runs if the frame reloads itself: save what we have first, then hand it the server state.
    setViewport(null);
    void (async () => {
      await flush();
      await loadDraft(layoutRef.current);
    })();
  }, [flush, loadDraft]);

  const onChange = useCallback((loadId: string, pageSet: PageSet, nextIssues: BuilderIssue[], text: BuilderChangeText) => {
    // Only changes produced from the current load count, for both documents (spec §13 A6 load identity).
    if (loadId !== loadIdRef.current || !loadedRef.current || previewingRef.current !== null) return;
    setIssues(nextIssues);
    setTextIssues(text.textIssues);
    // Without a text session the frame shouldn't send siteText; if it does, it is never saved.
    const siteText = textAvailableRef.current ? text.siteText : undefined;
    if (awaitingBaselineRef.current) {
      awaitingBaselineRef.current = false;
      autosaverRef.current?.setBaseline(pageSet);
      if (siteText) textSaverRef.current?.setBaseline(siteText);
      return;
    }
    if (mutatingRef.current) {
      heldRef.current = pageSet;
      if (siteText) heldTextRef.current = siteText;
      return;
    }
    autosaverRef.current?.schedule(pageSet);
    if (siteText) textSaverRef.current?.schedule(siteText);
  }, []);

  /**
   * Runs a request with edits to BOTH documents held back (see mutatingRef). Settles any
   * in-flight/pending PUT first so none can land after the request; `request` receives whether
   * that flush saved everything. On success, a held edit is dropped only for a document the request
   * replaced (`replaces(result)`); otherwise it is scheduled. On failure both are scheduled. A load
   * clears the held refs, so an edit held across a layout switch belongs to the new layout.
   */
  const withEditsHeld = useCallback(
    async <T,>(request: (saved: boolean) => Promise<T>, replaces: (result: T) => Replaces): Promise<T> => {
      const startLayout = layoutRef.current;
      mutatingRef.current = true;
      heldRef.current = null;
      heldTextRef.current = null;
      try {
        const pagesSaved = autosaverRef.current ? await autosaverRef.current.flush() : true;
        const textSaved = textSaverRef.current ? await textSaverRef.current.flush() : true;
        const result = await request(pagesSaved && textSaved);
        const replaced = replaces(result);
        const held = heldRef.current;
        const heldText = heldTextRef.current;
        heldRef.current = null;
        heldTextRef.current = null;
        if (held && (!replaced.pages || layoutRef.current !== startLayout)) autosaverRef.current?.schedule(held);
        if (heldText && !replaced.text) textSaverRef.current?.schedule(heldText);
        return result;
      } catch (err) {
        const held = heldRef.current;
        const heldText = heldTextRef.current;
        heldRef.current = null;
        heldTextRef.current = null;
        if (held) autosaverRef.current?.schedule(held);
        if (heldText) textSaverRef.current?.schedule(heldText);
        throw err;
      } finally {
        mutatingRef.current = false;
      }
    },
    [],
  );

  const onUploadRequest = useCallback(
    (requestId: string, file: File) => {
      const problem = checkUpload(file);
      if (problem) {
        post(uploadResultMessage(requestId, { error: problem }));
        return;
      }
      uploadStorefrontPageMedia(file).then(
        (result) => post(uploadResultMessage(requestId, { url: result.url })),
        (err: unknown) => post(uploadResultMessage(requestId, { error: errorText(err, 'Upload failed') })),
      );
    },
    [post],
  );

  const onViewport = useCallback((width: BuilderViewport) => setViewport(width), []);

  const ready = useBuilderBridge(frameRef, target, { onReady, onChange, onUploadRequest, onViewport });

  // Appearance saves while the editor is open → push the new theme (spec §6 sf-builder-theme).
  useEffect(() => {
    themeRef.current = currentTheme;
    if (ready && loadedRef.current) post(themeMessage(currentTheme));
  }, [currentTheme, ready, post]);

  // Someone (maybe us) published or restored: refresh that history. Nothing else is touched — if it
  // was another admin, our next PUT/publish gets a 409 and the conflict path runs.
  useEffect(() => {
    if (!socket) return;
    const onPublished = (payload: unknown) => {
      const published = (payload as { layout?: unknown } | null)?.layout;
      void qc.invalidateQueries({ queryKey: isLayoutKind(published) ? storefrontPagesKeys.versions(published) : storefrontPagesKeys.all });
    };
    const onTextPublished = () => {
      void qc.invalidateQueries({ queryKey: storefrontTextKeys.versions() });
    };
    socket.on('storefront-pages:published', onPublished);
    socket.on('storefront-text:published', onTextPublished);
    return () => {
      socket.off('storefront-pages:published', onPublished);
      socket.off('storefront-text:published', onTextPublished);
    };
  }, [socket, qc]);

  // Closing the tab inside either debounce window would silently drop the last edit.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (autosaverRef.current?.hasUnsaved() || textSaverRef.current?.hasUnsaved()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const switchLayout = useCallback(
    async (next: LayoutKind, force = false) => {
      if (next === layoutRef.current) return true;
      const saved = await flush();
      if (!saved && !force) return false;
      layoutRef.current = next;
      setLayout(next);
      await loadDraft(next);
      return true;
    },
    [flush, loadDraft],
  );

  const reload = useCallback(() => loadDraft(layoutRef.current), [loadDraft]);

  const currentPageSet = useCallback(() => autosaverRef.current?.current() ?? null, []);

  const preparePublish = useCallback(async (): Promise<PublishPreparation | null> => {
    const forLayout = layoutRef.current;
    if (!(await flush())) return null;
    // Snapshot BEFORE the GETs: a save of either document landing during or after them makes publish() refuse.
    const snapshot = saveSeqRef.current;
    publishSnapshotRef.current = null;
    const withText = textAvailableRef.current;
    const [draft, text] = await Promise.all([
      qc.fetchQuery({ queryKey: storefrontPagesKeys.draft(forLayout), queryFn: () => getPageSetDraft(forLayout), staleTime: 0 }),
      // The text draft as STORED — it may hold another admin's shared edits (spec §13 item 5).
      withText ? qc.fetchQuery({ queryKey: storefrontTextKeys.draft(), queryFn: getSiteTextDraft, staleTime: 0 }) : Promise.resolve(undefined),
    ]);
    // Another admin may have discarded a draft since we loaded; reflect that. baseVersions are
    // deliberately NOT adopted: a publish by someone else must still 409.
    if (forLayout === layoutRef.current) setHasDraft(draft.source === 'draft');
    if (text) setHasTextDraft(text.source === 'draft');
    publishSnapshotRef.current = snapshot;
    return { pages: draft.data, text: text === undefined ? undefined : text.data };
  }, [qc, flush]);

  const publish = useCallback(async () => {
    const forLayout = layoutRef.current;
    if (!loadedRef.current || previewingRef.current !== null) {
      throw new PublishStaleError('The draft isn’t loaded. Close this dialog, reload the page editor, then publish again.');
    }
    const snapshot = publishSnapshotRef.current;
    const withText = textAvailableRef.current;
    const textGen = textGenerationRef.current;
    try {
      const result = await withEditsHeld(async (saved) => {
        if (!saved) {
          throw new PublishStaleError('Your latest changes couldn’t be saved, so nothing was published. Close this dialog and resolve the save problem first.');
        }
        if (snapshot === null || snapshot !== saveSeqRef.current || forLayout !== layoutRef.current) {
          throw new PublishStaleError('The draft changed while this dialog was open, so nothing was published. Close it and open Publish again to review the latest changes.');
        }
        return publishPageSet(forLayout, baseVersionRef.current, withText ? textBaseVersionRef.current : undefined);
      }, () => ({ pages: false, text: false }));
      if (forLayout === layoutRef.current) {
        baseVersionRef.current = result.version;
        setBaseVersion(result.version);
        if (result.pagesPublished) setHasDraft(true);
      }
      // The text draft's version is now the latest text version: later text PUTs are based on it.
      if (withText && textGen === textGenerationRef.current) textBaseVersionRef.current = result.textVersion;
      void qc.invalidateQueries({ queryKey: storefrontPagesKeys.versions(forLayout) });
      if (result.textPublished) void qc.invalidateQueries({ queryKey: storefrontTextKeys.versions() });
      return result;
    } catch (err) {
      if (isSiteTextConflict(err)) textSaverRef.current?.markConflict();
      else if (isPageSetConflict(err) && forLayout === layoutRef.current) autosaverRef.current?.markConflict();
      throw err;
    }
  }, [qc, withEditsHeld]);

  const discard = useCallback(
    async (alsoText = false) => {
      const forLayout = layoutRef.current;
      let textError: unknown = null;
      await withEditsHeld(
        async () => {
          await discardPageSetDraft(forLayout);
          if (alsoText) {
            try {
              await discardSiteTextDraft();
            } catch (err) {
              textError = err;
            }
          }
        },
        () => ({ pages: true, text: alsoText && textError === null }),
      );
      if (alsoText && textError === null) {
        textGenerationRef.current++;
        textSaverRef.current?.cancel();
      }
      // A layout switch meanwhile already replaced the page draft under the autosaver; only a
      // discarded text draft still needs re-reading then.
      if (forLayout === layoutRef.current) {
        generationRef.current++;
        autosaverRef.current?.cancel();
        await loadDraft(forLayout);
      } else if (alsoText && textError === null) {
        await autosaverRef.current?.flush();
        await loadDraft(layoutRef.current);
      }
      if (textError !== null) {
        throw new Error(`The page draft was discarded, but the site text draft couldn’t be: ${errorText(textError, 'unknown error')}`);
      }
    },
    [withEditsHeld, loadDraft],
  );

  const restore = useCallback(
    async (version: number, withText = false) => {
      const forLayout = layoutRef.current;
      const result = await withEditsHeld(
        () => restorePageSetVersion(forLayout, version, { withText }),
        (r) => ({ pages: true, text: r.textRestored }),
      );
      void qc.invalidateQueries({ queryKey: storefrontPagesKeys.versions(forLayout) });
      if (result.textRestored) {
        void qc.invalidateQueries({ queryKey: storefrontTextKeys.versions() });
        textGenerationRef.current++;
        textSaverRef.current?.cancel();
      }
      if (forLayout !== layoutRef.current) {
        if (result.textRestored) {
          await autosaverRef.current?.flush();
          await loadDraft(layoutRef.current);
        }
        return result;
      }
      generationRef.current++;
      autosaverRef.current?.cancel();
      // Contract: the restored (new) version is the baseVersion for later PUTs; loadDraft re-reads it too.
      baseVersionRef.current = result.version;
      setBaseVersion(result.version);
      await loadDraft(forLayout);
      return result;
    },
    [qc, withEditsHeld, loadDraft],
  );

  const restoreText = useCallback(
    async (version: number) => {
      const result = await withEditsHeld(() => restoreSiteTextVersion(version), () => ({ pages: false, text: true }));
      void qc.invalidateQueries({ queryKey: storefrontTextKeys.versions() });
      textGenerationRef.current++;
      textSaverRef.current?.cancel();
      // The page draft is untouched: save any held page edit before the reload re-reads both.
      await autosaverRef.current?.flush();
      await loadDraft(layoutRef.current);
      return result.version;
    },
    [qc, withEditsHeld, loadDraft],
  );

  /** A pinned text version's document, or undefined when it is none, pruned or unreadable. */
  const pinnedText = useCallback(
    async (pin: number | null): Promise<SiteText | undefined> => {
      if (!pin) return undefined;
      try {
        const text = await qc.fetchQuery({ queryKey: storefrontTextKeys.version(pin), queryFn: () => getSiteTextVersion(pin), staleTime: Infinity });
        return text.data;
      } catch {
        return undefined;
      }
    },
    [qc],
  );

  /** Posts a read-only load for a preview (both preview kinds end here). */
  const postPreview = useCallback(
    (forLayout: LayoutKind, state: PreviewState, pageSet: PageSet | null, siteText: SiteText | undefined) => {
      setLoading(false);
      setLoadError(null);
      previewingRef.current = state;
      setPreviewing(state.kind === 'pages' ? state.version : null);
      setPreviewingText(state.kind === 'text' ? state.version : null);
      awaitingBaselineRef.current = false;
      loadedRef.current = true;
      const loadId = newLoadId();
      loadIdRef.current = loadId;
      post(loadMessage(loadId, forLayout, pageSet, themeRef.current, true, siteText));
    },
    [post],
  );

  const previewVersion = useCallback(
    async (version: number) => {
      const forLayout = layoutRef.current;
      const seq = ++loadSeqRef.current;
      let published: Awaited<ReturnType<typeof getPageSetVersion>>;
      let siteText: SiteText | undefined;
      try {
        if (!(await flush())) throw new Error(UNSAVED_PREVIEW_MESSAGE);
        published = await qc.fetchQuery({
          queryKey: storefrontPagesKeys.version(forLayout, version),
          queryFn: () => getPageSetVersion(forLayout, version),
          staleTime: Infinity,
        });
        // The words the page had when it was published (spec §4.5), when that text version still exists.
        siteText = await pinnedText(published.textVersion);
      } catch (err) {
        if (seq === loadSeqRef.current && !loadedRef.current) void loadDraft(forLayout);
        throw err;
      }
      if (seq !== loadSeqRef.current || forLayout !== layoutRef.current) return;
      postPreview(forLayout, { kind: 'pages', version }, published.data, siteText);
    },
    [qc, flush, pinnedText, postPreview, loadDraft],
  );

  const previewTextVersion = useCallback(
    async (version: number) => {
      const forLayout = layoutRef.current;
      const seq = ++loadSeqRef.current;
      let siteText: SiteText;
      let pageSet: PageSet | null = null;
      try {
        if (!(await flush())) throw new Error(UNSAVED_PREVIEW_MESSAGE);
        siteText = (await qc.fetchQuery({ queryKey: storefrontTextKeys.version(version), queryFn: () => getSiteTextVersion(version), staleTime: Infinity })).data;
        // "The current layout's published pages with that text" (spec §8); null = built-in pages.
        const versions = await qc.fetchQuery({ queryKey: storefrontPagesKeys.versions(forLayout), queryFn: () => listPageSetVersions(forLayout) });
        const live = versions[0]?.version ?? 0;
        if (live > 0) {
          pageSet = (await qc.fetchQuery({ queryKey: storefrontPagesKeys.version(forLayout, live), queryFn: () => getPageSetVersion(forLayout, live), staleTime: Infinity })).data;
        }
      } catch (err) {
        if (seq === loadSeqRef.current && !loadedRef.current) void loadDraft(forLayout);
        throw err;
      }
      if (seq !== loadSeqRef.current || forLayout !== layoutRef.current) return;
      postPreview(forLayout, { kind: 'text', version }, pageSet, siteText);
    },
    [qc, flush, postPreview, loadDraft],
  );

  const textDraftDiffers = useCallback(async () => {
    if (!textAvailableRef.current) return false;
    await textSaverRef.current?.flush();
    const draft = await qc.fetchQuery({ queryKey: storefrontTextKeys.draft(), queryFn: getSiteTextDraft, staleTime: 0 });
    if (draft.source !== 'draft' || draft.data === null) return false;
    if (draft.latestPublishedVersion === 0) return true;
    const latest = draft.latestPublishedVersion;
    const published = await qc.fetchQuery({ queryKey: storefrontTextKeys.version(latest), queryFn: () => getSiteTextVersion(latest), staleTime: Infinity });
    return stableStringify(published.data) !== stableStringify(draft.data);
  }, [qc]);

  const conflict = status === 'conflict';
  const textConflict = textStatus === 'conflict';
  const issueCount = issues.length + textIssues.length;
  const historyLoading =
    versionsQuery.isPending || versionsQuery.isError || (textAvailable && (textVersionsQuery.isPending || textVersionsQuery.isError));
  const publishBlockedBy =
    !ready ? 'Waiting for the page builder'
      : loading ? 'Loading the draft'
      : loadError ? 'Load the draft first'
      : previewing !== null || previewingText !== null ? 'Leave the version preview first'
        : conflict || textConflict ? 'Reload first'
          : historyLoading ? 'Loading version history'
            : issueCount > 0 ? `Fix ${issueCount} issue${issueCount === 1 ? '' : 's'} first`
              : !hasDraft && !hasTextDraft ? 'No unpublished changes'
                : null;

  return {
    layout, ready, loading, loadError, status, saveError, issues, hasDraft, baseVersion, previewing, previewingText, viewport,
    textAvailable, textStatus, textSaveError, textIssues, hasTextDraft,
    latestVersion, latestTextVersion, publishBlockedBy,
    switchLayout, reload, flush, currentPageSet, preparePublish, publish, discard, restore, restoreText,
    previewVersion, previewTextVersion, textDraftDiffers,
  };
}
```

- [ ] **Step 2: Build to find the callers that broke**

Run: `npm run build 2>&1 | tail -15`. Expected: errors in `PagesTab.tsx` only:
- `openPublish` passes a `PublishPreparation` where a `PageSet` is expected;
- the restore toast now gets a `RestoreResult` where it expects a version number.

- [ ] **Step 3: Minimal `PagesTab.tsx` compile fix** (Task 7 rewrites the file; change nothing else)

In `openPublish`, replace the lines from `const draft = await editor.preparePublish();` through `setPublishDraft(draft);`:

```ts
      const prepared = await editor.preparePublish();
      if (!prepared) {
        toast.error('There’s nothing saved to publish yet. Resolve any save problem shown above, then try again.');
        return;
      }
      publishMutation.reset();
      setPublishDraft(prepared.pages);
```

In the `VersionsDrawer` `onRestore` prop, replace the body:

```tsx
        onRestore={async (version) => {
          const restored = await editor.restore(version);
          toast.success(`Version ${version} restored as version ${restored.version}. Shoppers see it within about 30 seconds.`);
        }}
```

- [ ] **Step 4: Build and lint**

```bash
npm run build 2>&1 | tail -3        # success
node "$SCRATCH/lint-gate.mjs" pages/use-pages-editor.ts pages/PagesTab.tsx
```

The `react-hooks` plugin may flag `withEditsHeld`'s generic arrow or a dependency list. Fix it in this file, the same way the existing code does (`useCallback` with an explicit deps array, and no ref reads during render). Do not disable the rule.

- [ ] **Step 5: Self-review against the spec** — confirm by reading, and write each one in your report:
  - (a) every load posts at most one `sf-builder-load`, whose `siteText` key is absent iff the text GET failed;
  - (b) the baseline echo sets **both** baselines;
  - (c) `SITETEXT_CONFLICT` never calls the page saver's `markConflict`;
  - (d) the publish body carries `text` iff `textAvailableRef.current`;
  - (e) the discard, restore and restoreText paths each cancel the text saver exactly when the text draft was replaced.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(storefront-pages): editor session loads, autosaves and publishes shared site text

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- src/features/storefront-settings/pages/use-pages-editor.ts src/features/storefront-settings/pages/PagesTab.tsx
```

---

### Task 6: PublishDialog — Site text group and the all-layouts warning (UI)

Implementer: load the `frontend-design:frontend-design` skill before writing UI code.

**Files:**
- Modify: `src/features/storefront-settings/pages/PublishDialog.tsx` (full replacement)

**Depends on:** Tasks 1, 3.

**Interfaces:**
- Consumes:
  - Task 3: `diffPageSets`, `diffIsEmpty`, `diffPageText`, `diffSiteText`, `sharedTextChanged`, `formatTextValue`, and the types `DiffEntry`, `TextChange`, `LanguageChange`.
  - Task 1: `getSiteTextVersion`, `storefrontTextKeys`, `isSiteTextConflict`, `isNoDraft`, `isPageSetConflict`, `getPageSetVersion`.
  - `isPublishStale` from `./use-pages-editor.ts`, which already exists.
- Produces: `PublishDialog` props. The new ones are optional, so today's `PagesTab` still compiles:
  ```ts
  open; layout; draft: PageSet | null; latestVersion; publishing; error?; onClose; onConfirm;   // unchanged
  textDraft?: SiteText | null;      // undefined = no text session (no shared diff, no text published); null = none stored
  latestTextVersion?: number;       // default 0
  hasPageDraft?: boolean;           // default true; false → only text would be published
  ```

- [ ] **Step 1: Replace `PublishDialog.tsx`**

```tsx
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, UploadCloud } from 'lucide-react';
import { getPageSetVersion, isNoDraft, isPageSetConflict, storefrontPagesKeys } from '@/api/storefront-pages.ts';
import { getSiteTextVersion, isSiteTextConflict, storefrontTextKeys } from '@/api/storefront-text.ts';
import Badge from '@/components/ui/Badge.tsx';
import Button from '@/components/ui/Button.tsx';
import Modal from '@/components/ui/Modal.tsx';
import Spinner from '@/components/ui/Spinner.tsx';
import type { LayoutKind, PageSet, SiteText } from '@/types/storefront-pages.ts';
import {
  diffIsEmpty,
  diffPageSets,
  diffPageText,
  diffSiteText,
  formatTextValue,
  sharedTextChanged,
  type DiffEntry,
  type LanguageChange,
  type TextChange,
} from './diff.ts';
import { isPublishStale } from './use-pages-editor.ts';
import { LAYOUT_LABELS } from './labels.ts';

interface PublishDialogProps {
  open: boolean;
  layout: LayoutKind;
  /** The layout draft as stored by the backend (read after flushing autosave), never the frame's local copy. */
  draft: PageSet | null;
  /** Newest published layout version from a RESOLVED versions list; 0 only when nothing was ever published. */
  latestVersion: number;
  publishing: boolean;
  error?: unknown;
  onClose: () => void;
  onConfirm: () => void;
  /** The shared Site text draft as stored. undefined = this session holds no text (nothing shared is published); null = none stored. */
  textDraft?: SiteText | null;
  /** Newest published Site text version (0 = none). */
  latestTextVersion?: number;
  /** False when the layout has no page draft, so the publish carries only text. */
  hasPageDraft?: boolean;
}

const GROUPS = [
  { key: 'added', title: 'Added', color: 'success' },
  { key: 'changed', title: 'Changed', color: 'info' },
  { key: 'removed', title: 'Removed', color: 'warning' },
] as const;

function errorCopy(error: unknown): string {
  if (isSiteTextConflict(error)) return 'Someone published site text while you were editing, so nothing was published. Close this dialog, reload the page editor to pick up their text, then publish again.';
  if (isPageSetConflict(error)) return 'Someone published a newer version while you were editing. Close this dialog, reload the page editor to pick up their changes, then publish again.';
  if (isPublishStale(error)) return error.message;
  if (isNoDraft(error)) return 'There is no saved draft to publish. Make an edit, wait for it to save, then try again.';
  return 'Publishing failed. Your draft is safe; try again.';
}

/**
 * Confirm step for publishing (spec §9; editable-text §8): what the layout draft adds, changes and
 * removes, plus a **Site text** group — shared keys, language, and this layout's overrides — with
 * the all-layouts warning whenever shared text changes.
 */
export default function PublishDialog({
  open, layout, draft, latestVersion, publishing, error, onClose, onConfirm,
  textDraft, latestTextVersion = 0, hasPageDraft = true,
}: PublishDialogProps) {
  const publishedQuery = useQuery({
    queryKey: storefrontPagesKeys.version(layout, latestVersion),
    queryFn: () => getPageSetVersion(layout, latestVersion),
    enabled: open && latestVersion > 0,
    staleTime: Infinity, // published versions are immutable
  });
  const textSession = textDraft !== undefined;
  const publishedTextQuery = useQuery({
    queryKey: storefrontTextKeys.version(latestTextVersion),
    queryFn: () => getSiteTextVersion(latestTextVersion),
    enabled: open && textSession && latestTextVersion > 0,
    staleTime: Infinity,
  });
  const waiting = latestVersion > 0 && publishedQuery.isLoading;
  const baseFailed = latestVersion > 0 && publishedQuery.isError;
  const textWaiting = textSession && latestTextVersion > 0 && publishedTextQuery.isLoading;
  const textBaseFailed = textSession && latestTextVersion > 0 && publishedTextQuery.isError;

  const publishedSet = latestVersion > 0 ? (publishedQuery.data?.data ?? null) : null;
  const publishedText = latestTextVersion > 0 ? (publishedTextQuery.data?.data ?? null) : null;

  const diff = useMemo(
    () => (waiting || baseFailed ? null : diffPageSets(publishedSet, draft)),
    [waiting, baseFailed, publishedSet, draft],
  );
  const layoutText = useMemo(
    () => (waiting || baseFailed ? null : diffPageText(publishedSet, draft)),
    [waiting, baseFailed, publishedSet, draft],
  );
  const siteText = useMemo(
    () => (!textSession || textWaiting || textBaseFailed ? null : diffSiteText(publishedText, textDraft ?? null)),
    [textSession, textWaiting, textBaseFailed, publishedText, textDraft],
  );

  const sharedChanged = sharedTextChanged(siteText);
  const textCount = (siteText ? siteText.shared.length + siteText.language.length : 0) + (layoutText?.length ?? 0);
  const pagesUnchanged = diff !== null && diffIsEmpty(diff);
  const textUnchanged = layoutText !== null && layoutText.length === 0 && (!textSession || (siteText !== null && !sharedChanged));
  const nothingChanged = pagesUnchanged && textUnchanged;
  const nothingToSend = draft === null && (textDraft ?? null) === null;
  const activeLocale = textDraft?.language.locale ?? 'en';
  // Retrying can't succeed until the editor reloads (conflicts) or the dialog is reopened (stale).
  const retryBlocked = isPageSetConflict(error) || isSiteTextConflict(error) || isPublishStale(error);

  return (
    <Modal open={open} onClose={onClose} title={`Publish ${LAYOUT_LABELS[layout]} pages`} size="md" dismissible={!publishing}>
      <div className="space-y-4 text-[13px] text-text-secondary">
        <p>
          {!hasPageDraft
            ? `The ${LAYOUT_LABELS[layout]} pages have no unpublished changes, so only site text is published.`
            : latestVersion > 0
              ? `This replaces live version ${latestVersion} for the ${LAYOUT_LABELS[layout]} layout with version ${latestVersion + 1}.`
              : `This is the first publish for the ${LAYOUT_LABELS[layout]} layout. Pages you haven’t touched keep their built-in design.`}
        </p>

        {(waiting || textWaiting) && (
          <div className="flex items-center gap-2 text-text-tertiary" role="status"><Spinner size="sm" /> Comparing with the live version…</div>
        )}
        {baseFailed && (
          <p className="rounded-lg border border-border-subtle bg-bg-surface px-3 py-2" role="alert">
            Couldn’t load the live version to compare. You can still publish.
          </p>
        )}
        {textBaseFailed && (
          <p className="rounded-lg border border-border-subtle bg-bg-surface px-3 py-2" role="alert">
            Couldn’t load the live site text to compare. You can still publish; any shared text changes go live on all 3 layouts.
          </p>
        )}

        {nothingChanged && <p className="text-text-primary">Nothing has changed since version {latestVersion}.</p>}

        {diff && !pagesUnchanged && (
          <div className="space-y-3">
            {GROUPS.map(({ key, title, color }) =>
              diff[key].length > 0 ? (
                <section key={key} aria-label={title}>
                  <h3 className="mb-1 flex items-center gap-2 text-[12px] font-semibold text-text-tertiary">
                    {title} <Badge color={color}>{diff[key].length}</Badge>
                  </h3>
                  <ul className="space-y-0.5">
                    {diff[key].map((entry: DiffEntry) => (
                      <li key={entry.key} className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-text-primary">{entry.label}</span>
                        <span className="shrink-0 text-[11px] text-text-tertiary">{entry.note}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null,
            )}
          </div>
        )}

        {textCount > 0 && (
          <section aria-label="Site text" className="space-y-2">
            <h3 className="flex items-center gap-2 text-[12px] font-semibold text-text-tertiary">
              Site text <Badge color="info">{textCount}</Badge>
            </h3>
            {sharedChanged && (
              // (asserted) exact copy
              <p role="note" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-muted px-3 py-2 text-text-primary">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                <span>Shared text changes go live on all 3 layouts.</span>
              </p>
            )}
            {siteText && siteText.language.length > 0 && <LanguageChanges changes={siteText.language} />}
            {siteText && siteText.shared.length > 0 && (
              <TextChanges title="Shared text (all layouts)" changes={siteText.shared} activeLocale={activeLocale} emptyLabel="Built-in default" />
            )}
            {layoutText && layoutText.length > 0 && (
              <TextChanges title={`${LAYOUT_LABELS[layout]} only`} changes={layoutText} activeLocale={activeLocale} emptyLabel="Shared or built-in" />
            )}
          </section>
        )}

        {error != null && !publishing && (
          <p className="rounded-lg border border-border-subtle bg-bg-surface px-3 py-2 text-error" role="alert">{errorCopy(error)}</p>
        )}

        <p className="text-[11px] text-text-tertiary">Shoppers see the new pages within about 30 seconds (edge cache).</p>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={publishing}>Cancel</Button>
          <Button onClick={onConfirm} disabled={publishing || waiting || textWaiting || nothingChanged || nothingToSend || retryBlocked}>
            {publishing ? <><Spinner size="sm" /> Publishing…</> : <><UploadCloud className="h-4 w-4" /> Publish</>}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function LanguageChanges({ changes }: { changes: LanguageChange[] }) {
  return (
    <ul className="space-y-1 rounded-lg border border-border-subtle bg-bg-surface px-3 py-2" aria-label="Language">
      {changes.map((c) => (
        <li key={c.field} className="text-[12px]">
          <span className="font-medium text-text-primary">{c.label}:</span>{' '}
          <span className="text-text-tertiary">{c.before}</span> <span aria-hidden="true">→</span>
          <span className="sr-only"> becomes </span> <span className="text-text-primary">{c.after}</span>
        </li>
      ))}
    </ul>
  );
}

/** One expandable group; the list is complete (never truncated) — spec §13 item 5. */
function TextChanges({ title, changes, activeLocale, emptyLabel }: { title: string; changes: TextChange[]; activeLocale: string; emptyLabel: string }) {
  return (
    <details className="rounded-lg border border-border-subtle bg-bg-surface" open={changes.length <= 5}>
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[12px] font-semibold text-text-tertiary max-lg:min-h-11">
        {title} <Badge>{changes.length}</Badge>
      </summary>
      <ul className="max-h-64 space-y-2 overflow-y-auto px-3 pb-3">
        {changes.map((c) => (
          <li key={`${c.locale}:${c.key}`} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <code className="truncate text-[12px] text-text-primary">
                {c.locale !== activeLocale ? `[${c.locale}] ` : ''}{c.key}
              </code>
              <span className="shrink-0 text-[11px] text-text-tertiary">{c.note}</span>
            </div>
            <p className="whitespace-pre-wrap break-words text-[12px]">
              <span className="text-text-tertiary">{formatTextValue(c.before, emptyLabel)}</span>{' '}
              <span aria-hidden="true">→</span><span className="sr-only"> becomes </span>{' '}
              <span className="text-text-primary">{formatTextValue(c.after, emptyLabel)}</span>
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}
```

Asserted strings in this file:
- The `aria-label="Site text"` section and the warning sentence.
- The group titles `Shared text (all layouts)` and `{Layout} only`.
- The key ids rendered as text, and the values rendered through `formatTextValue` (`“…”`).

- [ ] **Step 2: Build and lint**

```bash
npm run build 2>&1 | tail -3
node "$SCRATCH/lint-gate.mjs" pages/PublishDialog.tsx
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(storefront-pages): publish dialog lists site text changes and warns about all layouts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- src/features/storefront-settings/pages/PublishDialog.tsx
```

---

### Task 7: PagesTab wiring — banners, publish, discard, versions (UI)

Implementer: load the `frontend-design:frontend-design` skill before writing UI code.

**Files:**
- Modify: `src/features/storefront-settings/pages/PagesTab.tsx`

**Depends on:** Tasks 4, 5, 6.

**Interfaces:**
- Consumes:
  - The full `PagesEditor` (Task 5).
  - The optional props on `PublishDialog` (Task 6) and `VersionsDrawer` (Task 4).
  - `ConfirmDialog` `children` (Task 4).
  - `isTextVersionGone` (Task 1).
- Produces: the finished tab. Nothing downstream imports from it except `StorefrontSettingsPage`, whose use of the default export is unchanged.

- [ ] **Step 1: Edit `PagesTab.tsx`**

Only `PagesEditorView`, `SaveChip`, and the imports change. `PagesTab`, `LayoutSwitcher` and `Banner` stay as they are.

Imports — add or replace:

```tsx
import { isTextVersionGone } from '@/api/storefront-text.ts';
import type { LayoutKind, PageSet, PublishResult, SiteText } from '@/types/storefront-pages.ts';
```

Add module-level helpers above `PagesEditorView`:

```tsx
function publishedToast(layout: LayoutKind, result: PublishResult): string {
  const parts: string[] = [];
  if (result.pagesPublished) parts.push(`${LAYOUT_LABELS[layout]} pages version ${result.version}`);
  if (result.textPublished) parts.push(`site text v${result.textVersion}`);
  const what = parts.length > 0 ? parts.join(' and ') : `version ${result.version}`;
  return `Published ${what}. Shoppers see it within about 30 seconds (edge cache).`;
}

const TEXT_GONE_MESSAGE = 'The site text from then is no longer kept, so nothing was restored. Restore without the site text, or pick a newer version.';
```

Replace `PagesEditorView` with:

```tsx
function PagesEditorView({ target, theme, catalog, browserLayout }: PagesEditorViewProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const editor = usePagesEditor({ frameRef, target, initialLayout: browserLayout, theme, catalog });

  const [publishOpen, setPublishOpen] = useState(false);
  const [publishDraft, setPublishDraft] = useState<PageSet | null>(null);
  const [publishText, setPublishText] = useState<SiteText | null | undefined>(undefined);
  const [preparing, setPreparing] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [textDiffers, setTextDiffers] = useState(false);
  const [discardText, setDiscardText] = useState(false);
  const dialog = useConfirm();

  const publishMutation = useMutation({
    mutationFn: () => editor.publish(),
    onSuccess: (result) => {
      setPublishOpen(false);
      toast.success(publishedToast(editor.layout, result));
    },
    // Errors stay in the dialog. A 409 has also switched the matching autosaver into conflict, so the banner behind it says to reload.
  });

  async function openPublish() {
    setPreparing(true);
    try {
      // Flushes both autosavers, then reads both drafts as the backend stores them; null = nothing safe to publish.
      const prepared = await editor.preparePublish();
      if (!prepared) {
        toast.error('There’s nothing saved to publish yet. Resolve any save problem shown above, then try again.');
        return;
      }
      publishMutation.reset();
      setPublishDraft(prepared.pages);
      setPublishText(prepared.text);
      setPublishOpen(true);
    } catch (err) {
      toast.error(`Couldn’t load the draft to publish: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setPreparing(false);
    }
  }

  function closePublish() {
    if (publishMutation.isPending) return;
    setPublishOpen(false);
    publishMutation.reset();
  }

  async function chooseLayout(next: LayoutKind) {
    const switched = await editor.switchLayout(next);
    if (switched) return;
    dialog.confirm({
      title: 'Switch without saving?',
      message: `Your latest changes on the ${LAYOUT_LABELS[editor.layout]} layout couldn’t be saved. Switch anyway and lose them?`,
      confirmLabel: 'Switch anyway',
      variant: 'danger',
      onConfirm: () => {
        dialog.close();
        void editor.switchLayout(next, true);
      },
    });
  }

  function openDiscard() {
    setDiscardText(false);
    setTextDiffers(false);
    setDiscardOpen(true);
    // The opt-in shows only when a text draft differs from the published text (spec §8).
    // If the check fails, offer it anyway: it is unchecked by default.
    editor.textDraftDiffers().then(setTextDiffers, () => setTextDiffers(editor.textAvailable));
  }

  async function confirmDiscard() {
    const alsoText = textDiffers && discardText;
    setDiscarding(true);
    try {
      await editor.discard(alsoText);
      setDiscardOpen(false);
      toast.success(alsoText ? 'Draft and unpublished site text discarded' : 'Draft discarded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t discard the draft');
    } finally {
      setDiscarding(false);
    }
  }

  const conflict = editor.status === 'conflict';
  const textConflict = editor.textStatus === 'conflict';
  const inPreview = editor.previewing !== null || editor.previewingText !== null;
  const publishBlockedBy = editor.publishBlockedBy;
  const publishReasonId = useId();
  const issueLines = [
    ...editor.issues.map((issue, i) => ({ id: `p-${issue.docKey}-${issue.rule}-${i}`, text: `${docLabel(issue.docKey)}: ${issue.message}` })),
    ...editor.textIssues.map((issue, i) => ({
      id: `t-${issue.scope}-${issue.key}-${i}`,
      text: `${issue.scope === 'shared' ? 'Site text' : `Text (${LAYOUT_LABELS[editor.layout]} only)`} · ${issue.key}: ${issue.message}`,
    })),
  ];

  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-label="Page builder toolbar"
        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border-subtle bg-bg-raised px-2 py-1.5"
      >
        <LayoutSwitcher value={editor.layout} live={browserLayout} disabled={editor.loading || preparing} onChange={(l) => void chooseLayout(l)} />
        <SaveChip status={editor.status} textStatus={editor.textStatus} />
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button variant="ghost" size="sm" className="max-lg:min-h-11" onClick={() => setVersionsOpen(true)}>
            <History className="h-3.5 w-3.5" /> Versions
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="max-lg:min-h-11"
            onClick={openDiscard}
            disabled={!(editor.hasDraft || editor.hasTextDraft) || !editor.ready || editor.loading || editor.loadError !== null || inPreview || discarding}
          >
            <Trash2 className="h-3.5 w-3.5" /> Discard draft
          </Button>
          <Button
            size="sm"
            className="max-lg:min-h-11"
            onClick={() => void openPublish()}
            disabled={publishBlockedBy !== null || preparing}
            title={publishBlockedBy ?? undefined}
            aria-describedby={publishBlockedBy !== null ? publishReasonId : undefined}
          >
            {preparing ? <Spinner size="sm" /> : <UploadCloud className="h-3.5 w-3.5" />} Publish
          </Button>
          {publishBlockedBy !== null && <span id={publishReasonId} className="sr-only">{publishBlockedBy}</span>}
        </div>
      </div>

      {conflict && (
        <Banner tone="warning" action={<Button size="sm" variant="secondary" onClick={() => void editor.reload()}>Reload</Button>}>
          Someone published since you opened this — reload to continue. Autosave is paused, and reloading drops changes made since the last save.
        </Banner>
      )}
      {textConflict && (
        // (asserted) starts with the spec's sentence
        <Banner tone="warning" action={<Button size="sm" variant="secondary" onClick={() => void editor.reload()}>Reload</Button>}>
          Someone published site text since you opened this — reload to keep editing it. Shared text autosave is paused and Publish is off until you reload; page edits are still being saved.
        </Banner>
      )}
      {editor.previewing !== null && (
        <Banner tone="info" action={<Button size="sm" variant="secondary" onClick={() => void editor.reload()}><Eye className="h-3.5 w-3.5" /> Back to draft</Button>}>
          Previewing version {editor.previewing} (read-only). Nothing you do here is saved.
        </Banner>
      )}
      {editor.previewingText !== null && (
        <Banner tone="info" action={<Button size="sm" variant="secondary" onClick={() => void editor.reload()}><Eye className="h-3.5 w-3.5" /> Back to draft</Button>}>
          Previewing site text v{editor.previewingText} with the live {LAYOUT_LABELS[editor.layout]} pages (read-only). Nothing you do here is saved.
        </Banner>
      )}
      {editor.loadError && (
        <Banner tone="error" action={<Button size="sm" variant="secondary" onClick={() => void editor.reload()}>Try again</Button>}>
          Couldn’t load the draft: {editor.loadError}
        </Banner>
      )}
      {editor.status === 'error' && (
        <Banner tone="error" action={<Button size="sm" variant="secondary" onClick={() => void editor.flush()}>Retry now</Button>}>
          Couldn’t save: {editor.saveError ?? 'unknown error'}. It will retry on your next change.
        </Banner>
      )}
      {editor.textStatus === 'error' && (
        <Banner tone="error" action={<Button size="sm" variant="secondary" onClick={() => void editor.flush()}>Retry now</Button>}>
          Couldn’t save the site text: {editor.textSaveError ?? 'unknown error'}. It will retry on your next change.
        </Banner>
      )}
      {editor.ready && !editor.loading && editor.loadError === null && !inPreview && !editor.textAvailable && (
        <Banner tone="info" action={<Button size="sm" variant="secondary" onClick={() => void editor.reload()}>Reload</Button>}>
          Shared site text couldn’t be loaded, so only this layout’s own text can be edited and published right now.
        </Banner>
      )}
      {issueLines.length > 0 && !inPreview && (
        <Banner tone="warning">
          <p>Publishing is blocked until these are fixed in the editor:</p>
          <ul className="mt-1 list-disc pl-5">
            {issueLines.slice(0, 5).map((line) => <li key={line.id}>{line.text}</li>)}
            {issueLines.length > 5 && <li>…and {issueLines.length - 5} more</li>}
          </ul>
        </Banner>
      )}

      <p className="text-[11px] text-text-tertiary lg:hidden">The page builder works best on a desktop-width screen.</p>
      <BuilderFrame frameRef={frameRef} target={target} ready={editor.ready} width={editor.viewport} />

      <PublishDialog
        open={publishOpen}
        layout={editor.layout}
        draft={publishDraft}
        latestVersion={editor.latestVersion}
        textDraft={publishText}
        latestTextVersion={editor.latestTextVersion}
        hasPageDraft={editor.hasDraft}
        publishing={publishMutation.isPending}
        error={publishMutation.error}
        onClose={closePublish}
        onConfirm={() => publishMutation.mutate()}
      />
      <VersionsDrawer
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        layout={editor.layout}
        previewing={editor.previewing}
        previewingText={editor.previewingText}
        onPreview={(version) => { editor.previewVersion(version).catch((err: Error) => toast.error(err.message)); }}
        onRestore={async (version, withText) => {
          try {
            const restored = await editor.restore(version, withText);
            toast.success(
              restored.textRestored
                ? `Version ${version} restored as version ${restored.version}, with site text v${restored.textVersion} on all 3 layouts. Shoppers see it within about 30 seconds.`
                : `Version ${version} restored as version ${restored.version}. Shoppers see it within about 30 seconds.`,
            );
          } catch (err) {
            throw isTextVersionGone(err) ? new Error(TEXT_GONE_MESSAGE) : err;
          }
        }}
        onPreviewText={(version) => { editor.previewTextVersion(version).catch((err: Error) => toast.error(err.message)); }}
        onRestoreText={async (version) => {
          const created = await editor.restoreText(version);
          toast.success(`Site text v${version} restored as v${created}. It is live on all 3 layouts within about 30 seconds.`);
        }}
      />
      <ConfirmDialog
        open={discardOpen}
        onClose={() => { if (!discarding) setDiscardOpen(false); }}
        onConfirm={() => void confirmDiscard()}
        title="Discard draft?"
        message={`This throws away every unpublished change to the ${LAYOUT_LABELS[editor.layout]} pages and reloads the live version. It can’t be undone.`}
        confirmLabel="Discard draft"
        variant="danger"
        loading={discarding}
        loadingLabel="Discarding…"
      >
        {textDiffers && (
          <label className="flex items-start gap-2 text-[13px] text-text-secondary max-lg:min-h-11">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
              checked={discardText}
              disabled={discarding}
              onChange={(e) => setDiscardText(e.target.checked)}
            />
            {/* (asserted) exact copy */}
            <span>Also discard unpublished site text changes (all layouts)</span>
          </label>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog.open}
        onClose={dialog.close}
        onConfirm={dialog.onConfirm}
        title={dialog.title}
        message={dialog.message}
        confirmLabel={dialog.confirmLabel}
        variant={dialog.variant}
      />
    </div>
  );
}
```

Replace `CHIP` and `SaveChip` with:

```tsx
type Chip = { label: string; color: 'default' | 'success' | 'error' | 'warning' };

/** One chip for both autosavers: page conflict > any error > any saving > text paused > saved. */
function chipFor(status: SaveStatus, textStatus: SaveStatus): Chip | null {
  if (status === 'conflict') return { label: 'Autosave paused', color: 'warning' };
  if (status === 'error' || textStatus === 'error') return { label: 'Error', color: 'error' };
  if ([status, textStatus].some((s) => s === 'pending' || s === 'saving')) return { label: 'Saving…', color: 'default' };
  if (textStatus === 'conflict') return { label: 'Text autosave paused', color: 'warning' };
  if (status === 'saved' || textStatus === 'saved') return { label: 'Saved', color: 'success' };
  return null;
}

function SaveChip({ status, textStatus }: { status: SaveStatus; textStatus: SaveStatus }) {
  const chip = chipFor(status, textStatus);
  return (
    <span role="status" aria-live="polite" className="min-w-16">
      {chip && <Badge color={chip.color}>{chip.label}</Badge>}
    </span>
  );
}
```

- [ ] **Step 2: Build and lint**

```bash
npm run build 2>&1 | tail -3
node "$SCRATCH/lint-gate.mjs" pages/PagesTab.tsx
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(storefront-pages): pages tab shows site text state, conflicts, discard and restore options

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- src/features/storefront-settings/pages/PagesTab.tsx
```

---

### Task 8: Mocked Playwright pass and final gates (owns Playwright)

**Files:**
- Scratch only (never committed): `$SCRATCH/text-pass.mjs`, and screenshots in `$SCRATCH/shots/`.
- No repo file changes unless the pass finds a bug. In that case fix it in the owning task's file, re-run that task's gate, and commit it as `fix(storefront-pages): …` with the trailer. Load `frontend-design:frontend-design` first if the fix is UI.

**Depends on:** Task 7.

**Interfaces:**
- Consumes: the whole feature through the browser. `playwright` comes from the sibling worktree's `../ecommerce-storefront/node_modules/playwright`, with its Chromium already installed.
- Produces: a pass/fail report and screenshots.

- [ ] **Step 1: Start Vite against a dead API port** (background)

```bash
VITE_API_BASE_URL=http://localhost:3999/api/v1 VITE_WS_URL=http://localhost:3999 npx vite --port 5299 --strictPort
```

Run it with `run_in_background`. Port 5299 is used because the storefront's e2e owns 5199. Nothing listens on 3999; `page.route` answers every call. Wait until `curl -s -o /dev/null -w '%{http_code}' http://localhost:5299/` prints `200`.

- [ ] **Step 2: Write the pass** — `$SCRATCH/text-pass.mjs`

```js
// Run from the admin repo root: SCRATCH=… node "$SCRATCH/text-pass.mjs"
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

// ---------- fixtures (Northbound Supply / shop.example only) ----------
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = `x.${b64({ sub: 1, exp: Math.floor(Date.now() / 1000) + 3600 })}.y`;
const USER = { id: 1, username: 'owner', name: 'Northbound Owner', role: 'admin', isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const OWNER = { id: 1, name: 'Northbound Owner' };
const at = (d) => `2026-09-${String(d).padStart(2, '0')}T10:00:00.000Z`;
const doc = (types) => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content: types.map((type, i) => ({ type, props: { id: `${type}-${i}` } })) });
const SHELL = doc(['Header', 'PageOutlet', 'Footer']);
const P2 = { schemaVersion: 1, shell: SHELL, pages: {} };
const P3 = { schemaVersion: 1, shell: SHELL, pages: { catalog: doc(['CatalogHero', 'ProductGrid']) }, text: { strings: { en: { 'shell.nav.ariaLabel': 'Main menu' } } } };
const P3_OVERRIDE = { ...P3, text: { strings: { en: { 'shell.nav.ariaLabel': 'Shop menu', 'cart.drawer.title': 'Your trolley' } } } };
const lang = { locale: 'en', formatLocale: '' };
const T1 = { schemaVersion: 1, language: lang, strings: { en: { 'cart.drawer.title': 'Your basket' } } };
const T2 = { schemaVersion: 1, language: lang, strings: { en: { 'cart.drawer.title': 'Your basket', 'catalog.search.placeholder': 'Search Northbound Supply' } } };
const T_EDIT = { schemaVersion: 1, language: lang, strings: { en: { 'cart.drawer.title': 'Your bag', 'catalog.search.placeholder': 'Search Northbound Supply', 'cart.summary.items': { one: '{count} thing', other: '{count} things' } } } };
const T_OTHER_ADMIN = { ...T_EDIT, strings: { en: { ...T_EDIT.strings.en, 'checkout.errors.emailRequired': 'We need your email' } } };
const T_LATER = { ...T_EDIT, strings: { en: { ...T_EDIT.strings.en, 'cart.drawer.title': 'Your sack' } } };
const ISSUE = { scope: 'shared', key: 'cart.drawer.title', rule: 'unknown-placeholder', message: 'Unknown placeholder {nme}' };

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
function freshState(over = {}) {
  return {
    calls: [], textGetFails: false, restoreError: null, publishDelayMs: 0,
    layouts: {
      storefront: { draft: P3, source: 'draft', baseVersion: 3, versions: [
        { version: 3, data: P3, textVersion: 2, createdAt: at(28), createdBy: OWNER },
        { version: 2, data: P2, textVersion: 1, createdAt: at(20), createdBy: OWNER },
        { version: 1, data: P2, textVersion: null, createdAt: at(10), createdBy: null },
      ] },
      menu: { draft: null, source: 'none', baseVersion: 0, versions: [] },
      webapp: { draft: null, source: 'none', baseVersion: 0, versions: [] },
    },
    text: { draft: T2, source: 'published', baseVersion: 2, versions: [
      { version: 2, data: T2, createdAt: at(27), createdBy: OWNER },
      { version: 1, data: T1, createdAt: at(15), createdBy: null },
    ] },
    ...over,
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
    if (rest === 'draft' && method === 'GET') {
      if (state.textGetFails) return fail(500, 'Internal server error');
      return ok({ source: T.draft ? T.source : 'none', data: T.draft, baseVersion: T.baseVersion, latestPublishedVersion: tLatest, updatedAt: null });
    }
    if (rest === 'draft' && method === 'PUT') {
      if (json.baseVersion < tLatest) return fail(409, 'SITETEXT_CONFLICT');
      T.draft = json.data; T.source = 'draft'; T.baseVersion = json.baseVersion;
      return ok({ baseVersion: json.baseVersion, updatedAt: at(30) });
    }
    if (rest === 'draft' && method === 'DELETE') {
      const had = T.source === 'draft';
      T.draft = T.versions[0]?.data ?? null; T.source = tLatest ? 'published' : 'none'; T.baseVersion = tLatest;
      return ok({ discarded: had });
    }
    if (rest === 'versions' && method === 'GET') return ok(T.versions.map(({ version, createdAt, createdBy }) => ({ version, createdAt, createdBy })));
    if ((m = rest.match(/^versions\/(\d+)$/)) && method === 'GET') {
      const v = T.versions.find((x) => x.version === Number(m[1]));
      return v ? ok({ version: v.version, createdAt: v.createdAt, data: v.data }) : fail(404, 'Not found');
    }
    if ((m = rest.match(/^versions\/(\d+)\/restore$/)) && method === 'POST') {
      const v = T.versions.find((x) => x.version === Number(m[1]));
      if (!v) return fail(404, 'Not found');
      const version = tLatest + 1;
      T.versions.unshift({ version, data: v.data, createdAt: at(30), createdBy: OWNER });
      T.draft = v.data; T.source = 'draft'; T.baseVersion = version;
      return ok({ version });
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
    if (rest === 'draft' && method === 'DELETE') {
      L.draft = L.versions[0]?.data ?? null; L.source = latest ? 'published' : 'none'; L.baseVersion = latest;
      return ok({ discarded: true });
    }
    if (rest === 'publish' && method === 'POST') {
      if (state.publishDelayMs) await new Promise((r) => setTimeout(r, state.publishDelayMs));
      if (json.baseVersion < latest) return fail(409, 'PAGESET_CONFLICT');
      if (json.text && json.text.baseVersion < tLatest) return fail(409, 'SITETEXT_CONFLICT');
      const pageDraft = L.source === 'draft';
      const textDraft = Boolean(json.text) && T.source === 'draft';
      if (!pageDraft && !textDraft) return fail(400, 'NO_DRAFT');
      let textVersion = tLatest, textPublished = false;
      if (textDraft) {
        if (JSON.stringify(T.draft) !== JSON.stringify(T.versions[0]?.data)) {
          textVersion = tLatest + 1; textPublished = true;
          T.versions.unshift({ version: textVersion, data: T.draft, createdAt: at(30), createdBy: OWNER });
        }
        T.baseVersion = textVersion;
      }
      let version = latest, pagesPublished = false;
      if (pageDraft) {
        version = latest + 1; pagesPublished = true;
        L.versions.unshift({ version, data: L.draft, textVersion, createdAt: at(30), createdBy: OWNER });
        L.baseVersion = version;
      }
      return ok({ version, publishedAt: at(30), pagesPublished, textVersion, textPublished });
    }
    if (rest === 'versions' && method === 'GET') {
      return ok(L.versions.map(({ version, createdAt, createdBy, textVersion }) => ({ version, createdAt, createdBy, textVersion })));
    }
    if ((m = rest.match(/^versions\/(\d+)$/)) && method === 'GET') {
      const v = L.versions.find((x) => x.version === Number(m[1]));
      return v ? ok({ version: v.version, createdAt: v.createdAt, data: v.data, textVersion: v.textVersion }) : fail(404, 'Not found');
    }
    if ((m = rest.match(/^versions\/(\d+)\/restore$/)) && method === 'POST') {
      if (state.restoreError) { const e = state.restoreError; state.restoreError = null; return fail(409, e); }
      const v = L.versions.find((x) => x.version === Number(m[1]));
      let textVersion = tLatest, textRestored = false;
      if (json && json.withText) {
        const tv = v.textVersion ? T.versions.find((x) => x.version === v.textVersion) : null;
        if (!tv) return fail(409, 'TEXT_VERSION_GONE');
        if (tv.version !== tLatest) {
          textVersion = tLatest + 1; textRestored = true;
          T.versions.unshift({ version: textVersion, data: tv.data, createdAt: at(30), createdBy: OWNER });
        }
        T.draft = tv.data; T.source = 'draft'; T.baseVersion = textVersion;
      }
      const version = latest + 1;
      L.versions.unshift({ version, data: v.data, textVersion, createdAt: at(30), createdBy: OWNER });
      L.draft = v.data; L.source = 'draft'; L.baseVersion = version;
      return ok({ version, textVersion, textRestored });
    }
  }
  return route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, data: [], error: null, meta: { page: 1, limit: 20, totalItems: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false } }) });
}

async function openApp(state) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
const change = (pageSet, siteText, textIssues = [], issues = []) => ({ type: 'sf-builder-change', pageSet, issues, textIssues, ...(siteText ? { siteText } : {}) });
const callsTo = (state, method, path) => state.calls.filter((c) => c.method === method && c.path === path);
const textPuts = (state) => callsTo(state, 'PUT', 'storefront-text/draft');
const pagePuts = (state) => callsTo(state, 'PUT', 'storefront-pages/storefront/draft');
const toolbar = (page) => page.getByRole('group', { name: 'Page builder toolbar' });
const publishBtn = (page) => toolbar(page).getByRole('button', { name: 'Publish' });
const dialogWith = (page, text) => page.getByRole('dialog').filter({ hasText: text });
const drawer = (page) => page.getByRole('dialog', { name: 'Published versions · Storefront' });
const shot = (page, name) => page.screenshot({ path: `${SCRATCH}/shots/${name}.png`, fullPage: true });
const step = (name) => console.log(`- ${name}`);
async function ready(page, count = 1) {
  await until(page, async () => frameOf(page) && (await loads(page)).length >= count, `load #${count}`);
}

// ================= Run A: the main path =================
{
  const state = freshState();
  const { browser, page, pageErrors } = await openApp(state);
  try {
    step('A1 both drafts load; the load carries siteText');
    await ready(page);
    let load = await lastLoad(page);
    assert.ok(callsTo(state, 'GET', 'storefront-pages/storefront/draft').length >= 1);
    assert.ok(callsTo(state, 'GET', 'storefront-text/draft').length >= 1);
    assert.deepEqual(load.siteText, T2);
    assert.deepEqual(load.pageSet.text, P3.text, 'overrides reach the frame');
    await shot(page, 'a1-loaded');

    step('A2 the baseline echo saves nothing');
    await send(page, change(P3, T2));
    await page.waitForTimeout(1500);
    assert.equal(textPuts(state).length, 0);
    assert.equal(pagePuts(state).length, 0);

    step('A3 a text edit PUTs the text draft only');
    await send(page, change(P3, T_EDIT));
    await until(page, async () => textPuts(state).length === 1, 'text PUT');
    assert.deepEqual(textPuts(state)[0].json, { data: T_EDIT, baseVersion: 2 });
    await page.waitForTimeout(1300);
    assert.equal(pagePuts(state).length, 0, 'unchanged page set never PUT');

    step('A4 a text issue blocks Publish and is listed');
    await send(page, change(P3, T_EDIT, [ISSUE]));
    await until(page, async () => publishBtn(page).isDisabled(), 'Publish disabled');
    assert.equal(await publishBtn(page).getAttribute('title'), 'Fix 1 issue first');
    await page.getByText(/Site text · cart\.drawer\.title: Unknown placeholder/).waitFor();
    await send(page, change(P3, T_EDIT));
    await until(page, async () => !(await publishBtn(page).isDisabled()), 'Publish re-enabled');

    step('A5 a layout override edit PUTs the page draft with text');
    await send(page, change(P3_OVERRIDE, T_EDIT));
    await until(page, async () => pagePuts(state).length === 1, 'page PUT');
    assert.deepEqual(pagePuts(state)[0].json.data.text, P3_OVERRIDE.text);

    step('A6 publish dialog: Site text group, warning, another admin’s key; body carries text.baseVersion; held edit saved after');
    state.text.draft = T_OTHER_ADMIN; // another admin's shared edit, saved from another layout
    await publishBtn(page).click();
    const pub = dialogWith(page, 'Publish Storefront pages');
    await pub.waitFor();
    await pub.getByText('Shared text changes go live on all 3 layouts.').waitFor();
    const body = await pub.textContent();
    for (const needle of ['Site text', 'Shared text (all layouts)', 'Storefront only', 'cart.drawer.title', 'cart.summary.items',
      'checkout.errors.emailRequired', 'shell.nav.ariaLabel', '“Your basket”', '“Your bag”', 'Override added', 'Override changed']) {
      assert.ok(body.includes(needle), `publish dialog lists ${needle}`);
    }
    await shot(page, 'a6-publish-dialog');
    state.publishDelayMs = 800;
    await pub.getByRole('button', { name: 'Publish', exact: true }).click();
    await send(page, change(P3_OVERRIDE, T_LATER)); // made while the publish is out
    await page.getByText(/Published .*site text v3.*30 seconds/).waitFor();
    state.publishDelayMs = 0;
    const pubCall = callsTo(state, 'POST', 'storefront-pages/storefront/publish').at(-1);
    assert.deepEqual(pubCall.json, { baseVersion: 3, text: { baseVersion: 2 } });
    await until(page, async () => textPuts(state).some((c) => JSON.stringify(c.json.data) === JSON.stringify(T_LATER)), 'held text edit saved');
    assert.equal(textPuts(state).at(-1).json.baseVersion, 3, 'saved against the new text version');

    step('A7 versions drawer: Pages rows show their text pin; Site text tab lists text versions');
    await toolbar(page).getByRole('button', { name: 'Versions' }).click();
    await drawer(page).waitFor();
    assert.ok((await drawer(page).getByRole('listitem').filter({ hasText: 'Version 4' }).textContent()).includes('Text v3'));
    await drawer(page).getByRole('button', { name: 'Site text' }).click();
    await drawer(page).getByText('Site text v3').waitFor();
    await shot(page, 'a7-text-history');
    await drawer(page).getByRole('button', { name: 'Pages' }).click();

    step('A8 restore a page version WITH its site text');
    await drawer(page).getByRole('button', { name: 'Restore version 2' }).click();
    let confirm = dialogWith(page, 'Restore version 2?');
    const box = confirm.getByRole('checkbox', { name: /Also restore the site text from then \(v1\) — changes all 3 layouts/ });
    assert.equal(await box.isDisabled(), false);
    await box.check();
    await confirm.getByRole('button', { name: 'Restore', exact: true }).click();
    await until(page, async () => callsTo(state, 'POST', 'storefront-pages/storefront/versions/2/restore').length === 1, 'restore POST');
    assert.deepEqual(callsTo(state, 'POST', 'storefront-pages/storefront/versions/2/restore')[0].json, { withText: true });
    await page.getByText(/with site text v4 on all 3 layouts/).waitFor();
    await ready(page, 2);

    step('A9 a version with no pin: option disabled with the reason; restore sends withText false');
    await send(page, change((await lastLoad(page)).pageSet, (await lastLoad(page)).siteText)); // baseline
    await toolbar(page).getByRole('button', { name: 'Versions' }).click();
    await drawer(page).getByRole('button', { name: 'Restore version 1' }).click();
    confirm = dialogWith(page, 'Restore version 1?');
    assert.equal(await confirm.getByRole('checkbox').isDisabled(), true);
    await confirm.getByText('No site text was recorded with this version.').waitFor();
    await confirm.getByRole('button', { name: 'Restore', exact: true }).click();
    await until(page, async () => callsTo(state, 'POST', 'storefront-pages/storefront/versions/1/restore').length === 1, 'restore v1');
    assert.deepEqual(callsTo(state, 'POST', 'storefront-pages/storefront/versions/1/restore')[0].json, { withText: false });
    await ready(page, 3);

    step('A10 TEXT_VERSION_GONE shows its own message and pauses nothing');
    await send(page, change((await lastLoad(page)).pageSet, (await lastLoad(page)).siteText));
    state.restoreError = 'TEXT_VERSION_GONE';
    await toolbar(page).getByRole('button', { name: 'Versions' }).click();
    await drawer(page).getByRole('button', { name: 'Restore version 2' }).click();
    confirm = dialogWith(page, 'Restore version 2?');
    await confirm.getByRole('checkbox').check();
    await confirm.getByRole('button', { name: 'Restore', exact: true }).click();
    await page.getByText(/no longer kept, so nothing was restored/).waitFor();
    assert.equal(await toolbar(page).getByText('Autosave paused', { exact: true }).count(), 0, 'not read as a page conflict');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    step('A11 restore a site text version (shared only)');
    if (!(await drawer(page).isVisible())) await toolbar(page).getByRole('button', { name: 'Versions' }).click();
    await drawer(page).getByRole('button', { name: 'Site text' }).click();
    await drawer(page).getByRole('button', { name: 'Restore site text version 2' }).click();
    confirm = dialogWith(page, 'Restore site text v2?');
    await confirm.getByText(/Restores the shared text on all 3 layouts; page layouts are not changed/).waitFor();
    const pagePostsBefore = state.calls.filter((c) => c.method === 'POST' && c.path.startsWith('storefront-pages/')).length;
    await confirm.getByRole('button', { name: 'Restore', exact: true }).click();
    await until(page, async () => callsTo(state, 'POST', 'storefront-text/versions/2/restore').length === 1, 'text restore POST');
    assert.equal(state.calls.filter((c) => c.method === 'POST' && c.path.startsWith('storefront-pages/')).length, pagePostsBefore, 'no page write');
    await ready(page, 4);

    step('A12 preview a site text version over the live pages (read-only)');
    await send(page, change((await lastLoad(page)).pageSet, (await lastLoad(page)).siteText));
    await toolbar(page).getByRole('button', { name: 'Versions' }).click();
    await drawer(page).getByRole('button', { name: 'Site text' }).click();
    await drawer(page).getByRole('button', { name: 'Preview site text version 1' }).click();
    await ready(page, 5);
    load = await lastLoad(page);
    assert.equal(load.readOnly, true);
    assert.deepEqual(load.siteText, T1);
    assert.deepEqual(load.pageSet, state.layouts.storefront.versions[0].data, 'the live pages');
    await page.getByText(/Previewing site text v1 with the live Storefront pages/).waitFor();
    assert.equal(await publishBtn(page).isDisabled(), true);
    await shot(page, 'a12-text-preview');
    await page.getByRole('button', { name: 'Back to draft' }).click();
    await ready(page, 6);
    load = await lastLoad(page);
    assert.equal(load.readOnly, false);
    assert.ok('siteText' in load);

    step('A13 discard can also discard the site text draft');
    await send(page, change(load.pageSet, load.siteText));
    await send(page, change(load.pageSet, T_EDIT));
    await until(page, async () => textPuts(state).some((c) => JSON.stringify(c.json.data) === JSON.stringify(T_EDIT) && c.json.baseVersion >= 5), 'text edit saved');
    await toolbar(page).getByRole('button', { name: 'Discard draft' }).click();
    confirm = dialogWith(page, 'Discard draft?');
    const discardBox = confirm.getByRole('checkbox', { name: 'Also discard unpublished site text changes (all layouts)' });
    await discardBox.waitFor();
    assert.equal(await discardBox.isChecked(), false, 'unchecked by default');
    await discardBox.check();
    await confirm.getByRole('button', { name: 'Discard draft' }).click();
    await until(page, async () => callsTo(state, 'DELETE', 'storefront-text/draft').length === 1, 'text DELETE');
    assert.equal(callsTo(state, 'DELETE', 'storefront-pages/storefront/draft').length, 1);
    await page.getByText('Draft and unpublished site text discarded').waitFor();

    assert.deepEqual(pageErrors, [], 'no page errors');
    console.log('RUN A OK');
  } finally {
    await browser.close();
  }
}

// ================= Run B: SITETEXT_CONFLICT pauses only text =================
{
  const state = freshState();
  const { browser, page, pageErrors } = await openApp(state);
  try {
    step('B1 another admin publishes site text; our text PUT 409s');
    await ready(page);
    await send(page, change(P3, T2));
    state.text.versions.unshift({ version: 3, data: T_LATER, createdAt: at(30), createdBy: OWNER });
    await send(page, change(P3, T_EDIT));
    await page.getByText(/^Someone published site text since you opened this — reload/).waitFor();
    assert.equal(await publishBtn(page).isDisabled(), true);
    assert.equal(await publishBtn(page).getAttribute('title'), 'Reload first');
    await shot(page, 'b1-text-conflict');

    step('B2 page autosave continues');
    await send(page, change(P3_OVERRIDE, T_EDIT));
    await until(page, async () => pagePuts(state).length === 1, 'page PUT during text conflict');

    step('B3 Reload re-reads both drafts and clears the banner');
    const textGets = callsTo(state, 'GET', 'storefront-text/draft').length;
    await page.getByRole('alert').filter({ hasText: 'Someone published site text' }).getByRole('button', { name: 'Reload' }).click();
    await ready(page, 2);
    assert.equal(callsTo(state, 'GET', 'storefront-text/draft').length, textGets + 1);
    assert.equal(await page.getByText(/Someone published site text/).count(), 0);
    assert.deepEqual(pageErrors, []);
    console.log('RUN B OK');
  } finally {
    await browser.close();
  }
}

// ================= Run C: the text GET fails =================
{
  const state = freshState({ textGetFails: true });
  const { browser, page, pageErrors } = await openApp(state);
  try {
    step('C1 toast; the load has NO siteText key; page editing still works');
    await ready(page);
    await page.getByText(/Couldn’t load the site text/).first().waitFor();
    const load = await lastLoad(page);
    assert.equal('siteText' in load, false);
    await send(page, change(P3));
    await send(page, change(P3_OVERRIDE, T_EDIT)); // a siteText from the frame is ignored without a session
    await until(page, async () => pagePuts(state).length === 1, 'page PUT');
    await page.waitForTimeout(1500);
    assert.equal(textPuts(state).length, 0, 'no text PUT without a text session');

    step('C2 publish sends no text');
    await until(page, async () => !(await publishBtn(page).isDisabled()), 'Publish enabled');
    await publishBtn(page).click();
    const pub = dialogWith(page, 'Publish Storefront pages');
    await pub.waitFor();
    assert.equal(await pub.getByText('Shared text changes go live on all 3 layouts.').count(), 0);
    await pub.getByRole('button', { name: 'Publish', exact: true }).click();
    await until(page, async () => callsTo(state, 'POST', 'storefront-pages/storefront/publish').length === 1, 'publish');
    assert.deepEqual(callsTo(state, 'POST', 'storefront-pages/storefront/publish')[0].json, { baseVersion: 3 });
    assert.deepEqual(pageErrors, []);
    console.log('RUN C OK');
  } finally {
    await browser.close();
  }
}
console.log('TEXT PASS OK');
```

- [ ] **Step 3: Run the pass**

Run: `node "$SCRATCH/text-pass.mjs"`. Expected: `RUN A OK`, `RUN B OK`, `RUN C OK`, `TEXT PASS OK`.

Before blaming the code for a failure, check these known quirks:
- Seeded `auth_user` needs `name` and `updatedAt`.
- `/account/me` needs `permissions.modules`.
- Every tab of the settings page mounts, so an under-shaped mock crashes the shared error boundary. Look at `pageErrors` first.
- A selector miss after a UI refinement means a UI task changed an **asserted** string. Restore the string; do not loosen the assertion.
- Escape key presses in A10 close the confirm and the drawer. If the Modal ignores Escape, click its close button instead. That is a script fix, not a code fix.

Look at every screenshot in `$SCRATCH/shots/` (Read tool).
- The publish dialog must show the warning callout and a readable before → after list.
- The drawer tabs must not overflow at 1440 px.
- Re-run A6 and A7 at `viewport: { width: 390, height: 844 }` (edit `openApp` temporarily). The dialog and drawer must have no horizontal scroll: check each element's `scrollWidth <= clientWidth`, not the root's.

- [ ] **Step 4: Final gates**

```bash
npm run build 2>&1 | tail -3        # success
node "$SCRATCH/lint-gate.mjs" storefront-settings/pages/ api/storefront-text.ts api/storefront-error-codes.ts api/storefront-pages.ts types/storefront-pages.ts ui/ConfirmDialog.tsx
for c in t1 t2 t3 t4; do node "$SCRATCH/$c.check.mjs" || exit 1; done
git status --short                  # only files this plan touched are committed; nothing of ours left unstaged
git log --oneline -9
```

Stop Vite: `netstat -ano | grep :5299`, then `taskkill //PID <pid> //F //T`.

- [ ] **Step 5: Report**
  - Build result, the lint numbers (baseline vs now), the four check outputs, and the pass output.
  - The screenshot list.
  - Any fix commits.
  - Named pending step: **live verification after deploy.** Deploy order is backend → storefront v0.8.0 → admin. Open Pages, edit shared text, confirm the publish dialog warning, publish, and check that another layout shows the wording. Nothing in this plan touched a live system.

---

## Cross-plan contract assumptions

These are names and shapes the spec leaves open or implies. This plan assumes each one, and the controller should reconcile them with Plans 1–3.

- **Backend, text GET for a pinned page version:** `GET storefront-pages/:layout/versions/:version` returns `data` **including** the page set's `text` field (only the public read strips it), plus `textVersion`.
- **Backend, text draft GET:** `GET storefront-text/draft` has **no** `layout` field. With nothing stored it returns `{ source: 'none', data: null, baseVersion: 0, latestPublishedVersion: 0, updatedAt: null }`, as a non-null envelope `data`.
- **Backend, restore body:** the admin always sends `{ withText: boolean }`, with an explicit `false`. The backend must accept `false` and a missing body alike.
- **Backend, publish body:** the admin omits the `text` key entirely when it has no text session. It never sends `text: null`.
- **Backend, `RestoreResult.textVersion`:** always a number (the current latest text version when nothing was restored, `0` if none), never `null`.
- **Backend, text restore response:** `POST storefront-text/versions/:version/restore` returns `{ version }`, the new version.
- **Backend, pruned text version read:** `GET storefront-text/versions/:version` for a pruned version is any non-2xx (404 assumed). The admin treats any failure as "gone".
- **Backend, socket:** `storefront-text:published` carries `{ version }` on the admin namespace. The admin ignores the payload and invalidates `['storefront-text','versions']`.
- **Storefront, missing `textIssues`:** the admin parses a `sf-builder-change` without `textIssues` as `textIssues: []`, and `siteText: null` in a change as absent. The storefront plan should always send `textIssues` and never send `siteText: null`.
- **Storefront, text issue `scope`:** the admin's issue banner labels scope `'layout'` as "Text ({Layout} only)". `message` is shown verbatim.
- **Storefront, read-only preview with no `siteText`:** a page-version preview whose pin is `null`, `0` or pruned is posted **without** a `siteText` key. The editor then shows shared values as it does for any load without `siteText`.
- **Storefront, text-version preview:** "Preview" of a text version posts `readOnly: true` with that version's `siteText` and the layout's newest published page set (`null` when none).
- **Error-code strings:** exactly `PAGESET_CONFLICT`, `SITETEXT_CONFLICT`, `TEXT_VERSION_GONE`, `NO_DRAFT`, each as the envelope's `error` string.

## Reconciled contracts (pre-flight)

Checked against Plans 1–3. **No contract change was needed**: every assumption above matches the backend plan (endpoints, bodies, results, error strings, `storefront-text:published`, version detail carrying `data.text`, `restore` accepting `{ withText: false }` or no body, pruned text version = 404) and the editor plan (protocol fields, `textIssues` always sent, `siteText` never `null` in a change, read-only previews without `siteText`). Change made: Global Constraints now say to `git add -- <new paths>` before a pathspec commit (Tasks 1 and 4 create files).
