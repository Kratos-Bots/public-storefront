# Puck Page Builder — Plan 4: Admin SPA "Pages" Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a **Pages** section to the admin's Storefront Settings. It frames the deployed storefront's `/__builder` editor, autosaves the draft page set, publishes it with a diff summary, shows published versions (preview and restore), discards the draft, and uploads images for the editor.

**Architecture:**
- The decision logic lives in three React-free modules under `src/features/storefront-settings/pages/`, each checked by a scratch `node` script (the admin has no test runner):
  - `protocol.ts`: the A6 message shapes, inbound parsing, outbound builders, frame URL, upload checks.
  - `diff.ts`: the publish diff summary.
  - `autosaver.ts`: the debounced, serialised draft saver with conflict and error states.
- Two hooks wire that logic to React:
  - `use-builder-bridge.ts` receives frame messages. It trusts only the iframe's `contentWindow` and the storefront origin.
  - `use-pages-editor.ts` is the orchestrator: load, autosave, publish, discard, restore, version preview, uploads, the theme push, and the socket event.
- Presentational components sit on top: `PagesTab`, `BuilderFrame`, `PublishDialog`, `VersionsDrawer`.
- The admin talks only to the A5 HTTP routes and the A6 protocol. The whole plan can be built and browser-checked against mocks before Plans 1–3 land.

**Tech Stack:** React 19, @tanstack/react-query 5, ky (via `@/lib/api-client.ts`), zod 4, Tailwind v4 theme tokens, lucide-react, react-hot-toast, socket.io-client (via `useSocket()`). Scratch checks use Node 22.19 built-in type stripping. The browser pass is a throwaway Playwright script that borrows the storefront repo's installed `playwright`.

**Spec:** `T:/Projects/ecommerce/.worktrees/puck-builder/ecommerce-storefront/docs/superpowers/specs/2026-09-29-puck-page-builder-design.md`.
- §9 is this plan's section.
- §13 overrides everything before it. A5 is the exact HTTP contract, A6 the exact postMessage protocol, A3 the media upload.
- Read §9, §13 A3–A6 and §6 before starting.

## Global Constraints

- **Repo and branch:** `T:/Projects/ecommerce/.worktrees/puck-builder/ecommerce-admin-frontend`, branch `feature/puck-builder` (already checked out; do not create a branch). Run every `npm`/`npx` command from there.
- **Never stage `.env`.** The worktree has an unrelated ` M .env`. Always `git add` explicit paths, never `git add -A` / `git add .`. Another session may commit in the same tree, so run `git status --short` before every commit and stage only this task's files.
- **All frontend work goes to a frontend subagent** (user preference). Every UI task carries the line "Implementer: load the `frontend-design:frontend-design` skill before writing UI code".
  - In those tasks the code is the **functional contract**. The subagent may refine markup, spacing and styling, but must keep every prop, handler, data flow, `aria-*`/`role` attribute and every user-visible string that Task 8's script asserts on. Those strings are marked **(asserted)**.
- **Imports:**
  - Use the `@/` alias with explicit `.ts`/`.tsx` extensions (`from '@/api/storefront-pages.ts'`), never `../../`.
  - Files in the same `pages/` folder import each other as `./x.ts`, matching the existing storefront-settings files.
  - Pure modules (`labels.ts`, `protocol.ts`, `diff.ts`, `autosaver.ts`) may only have `import type` from `@/…`. Their value imports are limited to `zod` and `./labels.ts`, so `node` can run them directly.
- **Copy** in `src/features/storefront-settings/` is literal English (no `useTranslation`). Add no locale keys: `npm run build` runs `scripts/check-locale-parity.mjs`.
- **UI primitives:** reuse `src/components/ui/`:
  - `Button` (variants `primary | secondary | ghost | danger`, sizes `sm | md | lg`)
  - `Badge` (colors `default | accent | success | warning | error | info`)
  - `Modal` (`size`, `dismissible`), `Drawer` (`width`, `footer`), `ConfirmDialog`, `EmptyState`, `Spinner`, `Skeleton`
  - plus `useConfirm()` and `formatDateTime` from `@/lib/format.ts`.
  - Colours only through theme tokens (`text-text-primary`, `bg-bg-surface`, `border-border-subtle`, `text-accent`, `bg-success`…). No hex literals.
- **HTTP contract (A5):** paths are relative to ky's `prefixUrl` (`…/api/v1`).
  - Reads: `GET storefront-pages/:layout/draft`, `GET storefront-pages/:layout/versions`, `GET storefront-pages/:layout/versions/:version`.
  - Draft writes: `PUT storefront-pages/:layout/draft` with `{ data, baseVersion }`, `DELETE storefront-pages/:layout/draft`.
  - Publishing: `POST storefront-pages/:layout/publish` with `{ baseVersion }`, `POST storefront-pages/:layout/versions/:version/restore`.
  - Media: `POST storefront-pages/media` (multipart field **`file`**).
  - Every response uses the `{ success, data, error }` envelope and is unwrapped with `unwrapResponse`.
- **Error contract (confirmed against the finished backend plan):**
  - The envelope's `error` is a **string**, with no `code` field (`ecommerce-backend/src/middleware/error-handler.ts`). `extractApiError` turns it into the thrown `Error`'s `message` and keeps the HTTP `status`.
  - Conflict = HTTP 409 with `error === 'PAGESET_CONFLICT'` (PUT draft and publish). `isPageSetConflict` compares the string, and accepts a bare 409 as a fallback, since only those two routes return 409.
  - Publish with no draft = 400 `error === 'NO_DRAFT'`. PagesTab maps it to friendly copy.
  - PUT validation failure = 400 with a message like `data.pages.x.content.0.type: …`. It shows in the "Couldn't save" banner and does not loop.
  - Media errors = 422 (wrong type, not an image, > 5 MB, no file). The message is forwarded to the frame as `sf-builder-upload-result.error`.
- **baseVersion:**
  - After every successful PUT, adopt the returned `baseVersion`.
  - After the admin's own publish or restore, the returned `version` becomes the `baseVersion` for later PUTs.
- **postMessage protocol (A6), exactly:**
  - Admin → frame:
    - `{ type: 'sf-builder-load', protocol: 1, layout, pageSet: PageSet | null, theme, readOnly }`
    - `{ type: 'sf-builder-theme', theme }`
    - `{ type: 'sf-builder-upload-result', requestId, url: string | null, error: string | null }`
  - Frame → admin:
    - `{ type: 'sf-builder-ready', protocol: 1 }`
    - `{ type: 'sf-builder-change', pageSet, issues }`
    - `{ type: 'sf-builder-upload-request', requestId, file: File }`
    - `{ type: 'sf-builder-viewport', width: 360 | 768 | 1280 | null }`. This was added to A6 by coordinator decision. The admin sizes the iframe *element* to that pixel width, centred in the panel, with horizontal scroll when the panel is narrower. `null` = fill the panel.
  - Admin posts only with `targetOrigin = storefront origin`, never `'*'`. It accepts a message only when `event.source === iframe.contentWindow` **and** `event.origin === storefront origin`. Unknown or malformed messages are ignored.
  - `theme` never carries `customCss`.
  - This plan never sends `sf-builder-select-page`, because §9 has no UI for it and the editor ignores it anyway (coordinator-confirmed).
- **Frame URL:** `new URL('/__builder?sf-builder=1', catalog.baseUrl)`, where `catalog` is the same `GET storefront-settings/templates` query the Appearance tab uses.
  - A storefront on the admin's own origin is refused (no iframe), exactly like `LivePreview`, because the sandbox grants `allow-scripts allow-same-origin`.
  - Sandbox: `allow-scripts allow-same-origin allow-forms allow-popups allow-modals`.
- **Autosave:** 1 000 ms debounce after the last `sf-builder-change`, one request in flight at a time, latest state wins.
  - The **first** `sf-builder-change` after every load is the baseline. It is never saved, because A6 says the frame sends one change right after load.
  - A 409 stops autosave until the user reloads.
- **Publish:**
  - Disabled while the editor reports issues, while a version preview is shown, while in conflict, before the frame is ready, and while no draft exists.
  - The diff is computed client-side against the newest published version (`versions[0]`).
  - The success toast mentions the ~30 s edge cache.
- **Role gate:** the Pages section exists only for `role === 'admin'` (backend routes are `authorize('admin')`). It is filtered out of the rail for other roles *and* wrapped in `<RoleGate allow={['admin']}>`.
- **Socket:** the backend emits `storefront-pages:published` `{ layout, version }` to `role:admin` after both publish and restore. It invalidates that layout's versions query and nothing else.
- **Lint is a regression gate.** `npm run lint` already fails on this branch (43 errors, 25 warnings at `fd4e512`; see `T:/Projects/ecommerce/.worktrees/puck-builder/admin-baseline.log`). Task 1 records a JSON baseline. Every task must leave repo totals ≤ baseline and add **zero** problems in files it created or touched.
- **Scratch folder** (never committed): `C:/Users/Nobody/AppData/Local/Temp/claude/T--Projects-ecommerce/7574e00a-109d-46fb-a87b-812ac6c5bd8f/scratchpad/puck-admin`, written `$SCRATCH` below. In Git Bash, set it with `SCRATCH=/c/Users/Nobody/AppData/Local/Temp/claude/T--Projects-ecommerce/7574e00a-109d-46fb-a87b-812ac6c5bd8f/scratchpad/puck-admin`.
- **Commit messages** end with a blank line, then `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Nothing is pushed or merged without the user's OK.
- **Deploy order:** the admin ships **last** (backend → storefront v0.7.0 → admin). Against an older storefront the frame never says ready, and the tab shows the "may predate the page builder" hint after 8 s.
- **Fixtures** use "Northbound Supply" / `shop.example` only.

## Parallelisation map

All tasks share one worktree, so tasks in the same wave touch disjoint files. There are at most 3 concurrent tasks, under the limit of 5.

| Wave | Tasks (parallel within a wave) | Needs |
|---|---|---|
| 1 | **T1** types, API module, labels, baselines | — |
| 2 | **T2** protocol + diff · **T3** autosaver · **T4** VersionsDrawer (UI) | T1 |
| 3 | **T5** bridge + editor hooks · **T6** PublishDialog (UI) | T5: T2, T3 · T6: T2 |
| 4 | **T7** PagesTab, BuilderFrame, section wiring (UI) | T4, T5, T6 |
| 5 | **T8** mocked Playwright pass + final gates | T7 |

While a sibling task in the same wave is still editing, `npm run build` (`tsc -b` over the whole repo) can fail on the sibling's half-written file. If a build error names a file outside your task, wait for that sibling to report and re-run. Never edit a sibling's file.

## Review Focus

1. **Tab closed or section left within the 1 s debounce.** A reasonable person expects not to lose their last edit silently. Expected behaviour: `beforeunload` warns while `hasUnsaved()`, and unmount flushes. Pinned in Task 3 (`hasUnsaved` check) and Task 8 (S13: `page.close({ runBeforeUnload: true })` raises a `beforeunload` dialog).
2. **Layout switch right after an edit, or a stale `sf-builder-change` from the previous layout's doc arriving after the new load.** One layout's doc must never be written into another layout's draft. Expected behaviour: flush before switching, and the stale message is absorbed as the new baseline. Pinned in Task 5 (switch flushes first) and Task 8 (S9).
3. **A save that fails for a non-conflict reason** (500, network). Expected behaviour: the status chip shows Error, there is no retry loop hammering the API, the save retries on the next edit or on "Retry now", and Publish refuses to open until the save succeeds. Pinned in Task 3 (error → no auto-retry; `flush()` retries) and Task 8 (S7b).
4. **Messages that are not from our frame, malformed, or from a newer protocol** (another window, another origin, `protocol: 2`, `schemaVersion: 2`, `file` not a File). Expected behaviour: all ignored, and nothing is saved. Pinned in Task 2 (parser checks) and Task 8 (S3: a message posted from the admin window itself triggers no PUT).
5. **Publishing when nothing changed, or when the published version can't be fetched for the diff.** Expected behaviour: "Nothing has changed since version N" with the confirm button disabled, or a warning with publish still allowed. Pinned in Task 2 (`diffIsEmpty` on key-order-shuffled equal sets) and Task 8 (S5, second Publish).

---

### Task 1: Baselines, types, API module, labels

**Files:**
- Create: `src/types/storefront-pages.ts`
- Create: `src/api/storefront-pages.ts`
- Create: `src/features/storefront-settings/pages/labels.ts`
- Scratch: `$SCRATCH/lint-baseline.json`, `$SCRATCH/lint-gate.mjs`

**Interfaces:**
- Consumes: `api`, `unwrapResponse` from `@/lib/api-client.ts`.
- Produces:
  - Types from `@/types/storefront-pages.ts`: `LayoutKind`, `FixedRouteKey`, `RouteKey`, `DocKey`, `ComponentData`, `PageRootProps`, `PuckDoc`, `PageSet`, `BuilderIssue`, `PageSetSource`, `PageSetDraft`, `SaveDraftResult`, `PublishResult`, `PageSetVersionSummary`, `PageSetVersion`, `RestoreResult`.
  - Functions and keys from `@/api/storefront-pages.ts`:
    ```ts
    storefrontPagesKeys.all | .draft(layout) | .versions(layout) | .version(layout, version)
    getPageSetDraft(layout: LayoutKind): Promise<PageSetDraft>
    savePageSetDraft(layout: LayoutKind, body: { data: PageSet; baseVersion: number }): Promise<SaveDraftResult>
    discardPageSetDraft(layout: LayoutKind): Promise<{ discarded: boolean }>
    publishPageSet(layout: LayoutKind, baseVersion: number): Promise<PublishResult>
    listPageSetVersions(layout: LayoutKind): Promise<PageSetVersionSummary[]>
    getPageSetVersion(layout: LayoutKind, version: number): Promise<PageSetVersion>
    restorePageSetVersion(layout: LayoutKind, version: number): Promise<RestoreResult>
    uploadStorefrontPageMedia(file: File): Promise<{ url: string }>
    isPageSetConflict(err: unknown): boolean   // message 'PAGESET_CONFLICT' or status 409
    isNoDraft(err: unknown): boolean           // message 'NO_DRAFT'
    ```
  - From `./labels.ts`: `ROUTE_LABELS: Record<FixedRouteKey, string>`, `FIXED_ROUTE_ORDER: readonly FixedRouteKey[]`, `LAYOUT_LABELS: Record<LayoutKind, string>`, `docLabel(key: DocKey, doc?: PuckDoc | null): string`.

- [ ] **Step 1: Record the build and lint baselines**

```bash
cd /t/Projects/ecommerce/.worktrees/puck-builder/ecommerce-admin-frontend
SCRATCH=/c/Users/Nobody/AppData/Local/Temp/claude/T--Projects-ecommerce/7574e00a-109d-46fb-a87b-812ac6c5bd8f/scratchpad/puck-admin
mkdir -p "$SCRATCH"
git status --short                 # expect only " M .env" (plus nothing of ours)
npm run build 2>&1 | tail -3       # must succeed before any change
npx eslint . -f json -o "$SCRATCH/lint-baseline.json"; \
node -e "const r=require(process.argv[1]);let e=0,w=0;for(const f of r){e+=f.errorCount;w+=f.warningCount}console.log('BASELINE errors',e,'warnings',w)" "$SCRATCH/lint-baseline.json"
```

Expected: build succeeds; `BASELINE errors 43 warnings 25` (or whatever it prints — write the printed numbers into your report; later tasks compare against the file, not these numbers).

- [ ] **Step 2: Write the lint gate** — `$SCRATCH/lint-gate.mjs`

```js
// Usage: node lint-gate.mjs <path-substring> [<path-substring> ...]
// Fails if repo-wide error/warning totals exceed lint-baseline.json, or if any
// file whose path contains one of the substrings reports any problem.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const dir = 'C:/Users/Nobody/AppData/Local/Temp/claude/T--Projects-ecommerce/7574e00a-109d-46fb-a87b-812ac6c5bd8f/scratchpad/puck-admin';
const repo = 'T:/Projects/ecommerce/.worktrees/puck-builder/ecommerce-admin-frontend';
const base = JSON.parse(readFileSync(`${dir}/lint-baseline.json`, 'utf8'));
let out;
try { out = execSync('npx eslint . -f json', { cwd: repo, maxBuffer: 64 << 20 }).toString(); }
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

Run: `node "$SCRATCH/lint-gate.mjs" storefront-pages` → `LINT GATE OK` (nothing exists yet; proves the script works).

- [ ] **Step 3: Create `src/types/storefront-pages.ts`**

```ts
/**
 * Storefront page sets for the Puck page builder. Mirrors the storefront's
 * web/src/builder/types.ts and the backend's zod shapes (spec §13 A4/A5).
 * The admin never inspects blocks: it stores, diffs and forwards documents.
 */
export type LayoutKind = 'storefront' | 'menu' | 'webapp';

export type FixedRouteKey =
  | 'catalog' | 'product' | 'cart' | 'checkout' | 'login'
  | 'account.orders' | 'account.order' | 'account.loyalty' | 'account.referrals' | 'account.profile'
  | 'order-status' | 'payment-success' | 'payment-cancel' | 'order-placed'
  | 'verify' | 'tracking';
/** Custom pages are `page:<slug>`, slug /^[a-z0-9-]{1,60}$/. */
export type RouteKey = FixedRouteKey | `page:${string}`;
export type DocKey = RouteKey | 'shell';

export interface ComponentData { type: string; props: { id: string; [k: string]: unknown } }
export interface PageRootProps { title: string; description: string; chrome: 'shell' | 'none' }
export interface PuckDoc {
  root: { props: PageRootProps };
  content: ComponentData[];
  zones?: Record<string, ComponentData[]>;
}
/** Sparse: a fixed route missing from `pages` renders its built-in default. */
export interface PageSet {
  schemaVersion: 1;
  shell: PuckDoc;
  pages: Partial<Record<RouteKey, PuckDoc>>;
}
export interface BuilderIssue { docKey: DocKey; rule: string; message: string; blockId?: string }

export type PageSetSource = 'draft' | 'published' | 'none';

/** GET /storefront-pages/:layout/draft */
export interface PageSetDraft {
  layout: LayoutKind;
  source: PageSetSource;
  data: PageSet | null;
  baseVersion: number;
  latestPublishedVersion: number;
  updatedAt: string | null;
}
/** PUT /storefront-pages/:layout/draft */
export interface SaveDraftResult { baseVersion: number; updatedAt: string }
/** POST /storefront-pages/:layout/publish */
export interface PublishResult { version: number; publishedAt: string }
/** GET /storefront-pages/:layout/versions (newest first) */
export interface PageSetVersionSummary {
  version: number;
  createdAt: string;
  createdBy: { id: number; name: string } | null;
}
/** GET /storefront-pages/:layout/versions/:version */
export interface PageSetVersion { version: number; createdAt: string; data: PageSet }
/** POST /storefront-pages/:layout/versions/:version/restore — the NEW version */
export interface RestoreResult { version: number }
```

- [ ] **Step 4: Create `src/api/storefront-pages.ts`**

```ts
import { api, unwrapResponse } from '@/lib/api-client.ts';
import type {
  LayoutKind,
  PageSet,
  PageSetDraft,
  PageSetVersion,
  PageSetVersionSummary,
  PublishResult,
  RestoreResult,
  SaveDraftResult,
} from '@/types/storefront-pages.ts';

export const storefrontPagesKeys = {
  all: ['storefront-pages'] as const,
  draft: (layout: LayoutKind) => ['storefront-pages', layout, 'draft'] as const,
  versions: (layout: LayoutKind) => ['storefront-pages', layout, 'versions'] as const,
  version: (layout: LayoutKind, version: number) => ['storefront-pages', layout, 'versions', version] as const,
};

export async function getPageSetDraft(layout: LayoutKind) {
  return unwrapResponse<PageSetDraft>(api.get(`storefront-pages/${layout}/draft`));
}

/** No ky retry: the autosaver owns retries, and the status chip must reflect a failure promptly. */
export async function savePageSetDraft(layout: LayoutKind, body: { data: PageSet; baseVersion: number }) {
  return unwrapResponse<SaveDraftResult>(api.put(`storefront-pages/${layout}/draft`, { json: body, retry: 0 }));
}

export async function discardPageSetDraft(layout: LayoutKind) {
  return unwrapResponse<{ discarded: boolean }>(api.delete(`storefront-pages/${layout}/draft`));
}

export async function publishPageSet(layout: LayoutKind, baseVersion: number) {
  return unwrapResponse<PublishResult>(api.post(`storefront-pages/${layout}/publish`, { json: { baseVersion } }));
}

export async function listPageSetVersions(layout: LayoutKind) {
  return unwrapResponse<PageSetVersionSummary[]>(api.get(`storefront-pages/${layout}/versions`));
}

export async function getPageSetVersion(layout: LayoutKind, version: number) {
  return unwrapResponse<PageSetVersion>(api.get(`storefront-pages/${layout}/versions/${version}`));
}

export async function restorePageSetVersion(layout: LayoutKind, version: number) {
  return unwrapResponse<RestoreResult>(api.post(`storefront-pages/${layout}/versions/${version}/restore`));
}

/** Multipart field `file` (spec §13 A3). Up to 5 MB, so allow longer than ky's 10 s default. */
export async function uploadStorefrontPageMedia(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return unwrapResponse<{ url: string }>(api.post('storefront-pages/media', { body: formData, timeout: 60_000 }));
}

/**
 * 409 `error: 'PAGESET_CONFLICT'` from PUT draft / publish: someone published since this editor
 * loaded. The envelope's `error` is a string, which extractApiError turns into the Error's message
 * (and keeps the HTTP status). Compare the string; a bare 409 also counts, since only these two
 * routes return 409.
 */
export function isPageSetConflict(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { message?: unknown; status?: unknown };
  return e.message === 'PAGESET_CONFLICT' || e.status === 409;
}

/** Publish with no draft row: 400 `error: 'NO_DRAFT'`. */
export function isNoDraft(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { message?: unknown }).message === 'NO_DRAFT';
}
```

- [ ] **Step 5: Create `src/features/storefront-settings/pages/labels.ts`**

```ts
import type { DocKey, FixedRouteKey, LayoutKind, PuckDoc } from '@/types/storefront-pages.ts';

/**
 * Human names for page-set documents and layouts. React-free with type-only
 * imports, so the scratch node checks can load it.
 */
export const ROUTE_LABELS: Record<FixedRouteKey, string> = {
  catalog: 'Catalogue',
  product: 'Product',
  cart: 'Cart',
  checkout: 'Checkout',
  login: 'Sign in',
  'account.orders': 'Account · Orders',
  'account.order': 'Account · Order detail',
  'account.loyalty': 'Account · Loyalty',
  'account.referrals': 'Account · Referrals',
  'account.profile': 'Account · Profile',
  'order-status': 'Order status',
  'payment-success': 'Payment success',
  'payment-cancel': 'Payment cancelled',
  'order-placed': 'Order placed',
  verify: 'Verify',
  tracking: 'Tracking',
};

/** Spec §3 order — the order the diff summary lists fixed routes in. */
export const FIXED_ROUTE_ORDER = Object.keys(ROUTE_LABELS) as readonly FixedRouteKey[];

export const LAYOUT_LABELS: Record<LayoutKind, string> = {
  storefront: 'Storefront',
  menu: 'Menu',
  webapp: 'Telegram',
};

export function docLabel(key: DocKey, doc?: PuckDoc | null): string {
  if (key === 'shell') return 'Site shell (header & footer)';
  if (key.startsWith('page:')) {
    const path = `/pages/${key.slice('page:'.length)}`;
    const title = doc?.root?.props?.title?.trim();
    return title ? `${title} (${path})` : path;
  }
  return ROUTE_LABELS[key as FixedRouteKey] ?? key;
}
```

- [ ] **Step 6: Build and lint gate**

```bash
cd /t/Projects/ecommerce/.worktrees/puck-builder/ecommerce-admin-frontend
npm run build 2>&1 | tail -3
node "$SCRATCH/lint-gate.mjs" types/storefront-pages.ts api/storefront-pages.ts storefront-settings/pages/
```

Expected: build succeeds; `LINT GATE OK`.

- [ ] **Step 7: Commit**

```bash
git status --short
git add src/types/storefront-pages.ts src/api/storefront-pages.ts src/features/storefront-settings/pages/labels.ts
git commit -m "feat(storefront-pages): page-set types, API module and labels

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Protocol and diff modules (pure, node-checked)

**Files:**
- Create: `src/features/storefront-settings/pages/protocol.ts`
- Create: `src/features/storefront-settings/pages/diff.ts`
- Scratch: `$SCRATCH/protocol.check.ts`

**Interfaces:**
- Consumes: types from Task 1; `docLabel`, `FIXED_ROUTE_ORDER` from `./labels.ts`; `import type { PreviewTarget, PreviewTheme } from '@/features/storefront-settings/template-form.ts'` (existing: `PreviewTarget = { origin: string; src: string }`, `PreviewTheme` = the stored theme minus `customCss`).
- Produces (`./protocol.ts`):
  ```ts
  BUILDER_PROTOCOL: 1
  LAYOUT_KINDS: readonly ['storefront', 'menu', 'webapp']
  isLayoutKind(v: unknown): v is LayoutKind
  type BuilderLoadMessage, BuilderThemeMessage, BuilderUploadResultMessage, AdminToBuilderMessage
  type BuilderViewport = 360 | 768 | 1280 | null
  BUILDER_VIEWPORTS: readonly [360, 768, 1280]
  type BuilderInbound = ready | change | upload-request | viewport (see code)
  parseBuilderMessage(data: unknown): BuilderInbound | null
  loadMessage(layout, pageSet: PageSet | null, theme: PreviewTheme, readOnly: boolean): BuilderLoadMessage
  themeMessage(theme: PreviewTheme): BuilderThemeMessage
  uploadResultMessage(requestId: string, result: { url: string } | { error: string }): BuilderUploadResultMessage
  builderTarget(baseUrl: string | null, adminOrigin: string): PreviewTarget | null
  MEDIA_TYPES, MAX_MEDIA_BYTES, checkUpload(file: File): string | null
  ```
- Produces (`./diff.ts`):
  ```ts
  interface DiffEntry { key: DocKey; label: string; note: string }
  interface PageSetDiff { added: DiffEntry[]; changed: DiffEntry[]; removed: DiffEntry[] }
  stableStringify(v: unknown): string
  diffPageSets(published: PageSet | null, draft: PageSet | null): PageSetDiff
  diffIsEmpty(d: PageSetDiff): boolean
  ```

- [ ] **Step 1: Write the failing check script** — `$SCRATCH/protocol.check.ts`

```ts
import assert from 'node:assert/strict';
import {
  builderTarget, checkUpload, isLayoutKind, loadMessage, MAX_MEDIA_BYTES, parseBuilderMessage,
  themeMessage, uploadResultMessage,
} from 'file:///T:/Projects/ecommerce/.worktrees/puck-builder/ecommerce-admin-frontend/src/features/storefront-settings/pages/protocol.ts';
import { diffIsEmpty, diffPageSets, stableStringify } from 'file:///T:/Projects/ecommerce/.worktrees/puck-builder/ecommerce-admin-frontend/src/features/storefront-settings/pages/diff.ts';
import { docLabel } from 'file:///T:/Projects/ecommerce/.worktrees/puck-builder/ecommerce-admin-frontend/src/features/storefront-settings/pages/labels.ts';

const doc = (title: string, types: string[]) => ({
  root: { props: { title, description: '', chrome: 'shell' } },
  content: types.map((type, i) => ({ type, props: { id: `${type}-${i}` } })),
});
const SET = { schemaVersion: 1, shell: doc('', ['Header', 'PageOutlet', 'Footer']), pages: { catalog: doc('', ['CatalogHero', 'ProductGrid']) } };

// --- parseBuilderMessage ---
assert.deepEqual(parseBuilderMessage({ type: 'sf-builder-ready', protocol: 1 }), { type: 'sf-builder-ready', protocol: 1 });
assert.equal(parseBuilderMessage({ type: 'sf-builder-ready', protocol: 2 }), null, 'newer protocol ignored');
assert.equal(parseBuilderMessage({ type: 'sf-preview-ready' }), null, 'theme-preview message is not ours');
assert.equal(parseBuilderMessage('sf-builder-ready'), null);
assert.equal(parseBuilderMessage(null), null);
assert.equal(parseBuilderMessage(undefined), null);

const change = { type: 'sf-builder-change', pageSet: SET, issues: [{ docKey: 'catalog', rule: 'catalog.listing', message: 'needs a grid' }] };
const parsed = parseBuilderMessage(change);
assert.ok(parsed && parsed.type === 'sf-builder-change');
assert.equal(parsed.pageSet, SET, 'forwards the frame\'s own object, not a zod copy');
assert.equal(parsed.issues.length, 1);
assert.equal(parseBuilderMessage({ ...change, pageSet: { ...SET, schemaVersion: 2 } }), null, 'schemaVersion 2 ignored');
assert.equal(parseBuilderMessage({ ...change, pageSet: { schemaVersion: 1, pages: {} } }), null, 'missing shell');
assert.equal(parseBuilderMessage({ ...change, pageSet: { ...SET, pages: { catalog: 'x' } } }), null, 'page not a doc');
assert.equal(parseBuilderMessage({ ...change, issues: 'none' }), null, 'issues not an array');

const file = new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' });
const up = parseBuilderMessage({ type: 'sf-builder-upload-request', requestId: 'r1', file });
assert.ok(up && up.type === 'sf-builder-upload-request' && up.file === file && up.requestId === 'r1');
assert.equal(parseBuilderMessage({ type: 'sf-builder-upload-request', requestId: 'r1', file: 'hero.png' }), null);
assert.equal(parseBuilderMessage({ type: 'sf-builder-upload-request', requestId: '', file }), null);

assert.deepEqual(parseBuilderMessage({ type: 'sf-builder-viewport', width: 360 }), { type: 'sf-builder-viewport', width: 360 });
assert.deepEqual(parseBuilderMessage({ type: 'sf-builder-viewport', width: 1280 }), { type: 'sf-builder-viewport', width: 1280 });
assert.deepEqual(parseBuilderMessage({ type: 'sf-builder-viewport', width: null }), { type: 'sf-builder-viewport', width: null });
assert.equal(parseBuilderMessage({ type: 'sf-builder-viewport', width: 500 }), null, 'only the three toggle widths');
assert.equal(parseBuilderMessage({ type: 'sf-builder-viewport', width: '360' }), null);
assert.equal(parseBuilderMessage({ type: 'sf-builder-viewport' }), null, 'width is required (null, not absent)');

// --- outbound builders never carry customCss ---
const theme = { template: 'modern', preset: 'default', options: {}, scheme: 'dark', colors: {}, fonts: {}, radius: 'none', density: 'comfortable', customCss: 'body{}' } as never;
const load = loadMessage('menu', null, theme, true);
assert.deepEqual(Object.keys(load).sort(), ['layout', 'pageSet', 'protocol', 'readOnly', 'theme', 'type']);
assert.equal(load.type, 'sf-builder-load');
assert.equal(load.protocol, 1);
assert.equal(load.layout, 'menu');
assert.equal(load.pageSet, null);
assert.equal(load.readOnly, true);
assert.equal('customCss' in load.theme, false);
assert.equal('customCss' in themeMessage(theme).theme, false);
assert.equal(themeMessage(theme).type, 'sf-builder-theme');
assert.deepEqual(uploadResultMessage('r1', { url: '/media/x.png' }), { type: 'sf-builder-upload-result', requestId: 'r1', url: '/media/x.png', error: null });
assert.deepEqual(uploadResultMessage('r2', { error: 'too big' }), { type: 'sf-builder-upload-result', requestId: 'r2', url: null, error: 'too big' });

// --- builderTarget ---
const admin = 'http://localhost:5199';
assert.deepEqual(builderTarget('https://shop.example', admin), { origin: 'https://shop.example', src: 'https://shop.example/__builder?sf-builder=1' });
assert.deepEqual(builderTarget('https://shop.example/some/path?x=1', admin), { origin: 'https://shop.example', src: 'https://shop.example/__builder?sf-builder=1' });
assert.equal(builderTarget(null, admin), null);
assert.equal(builderTarget('javascript:alert(1)', admin), null);
assert.equal(builderTarget('not a url', admin), null);
assert.equal(builderTarget('http://localhost:5199', admin), null, 'same-origin framing refused');

// --- checkUpload ---
assert.equal(checkUpload(file), null);
assert.match(checkUpload(new File(['hi'], 'a.txt', { type: 'text/plain' })) ?? '', /PNG, JPEG, WebP or GIF/);
assert.match(checkUpload(new File([new Uint8Array(MAX_MEDIA_BYTES + 1)], 'big.png', { type: 'image/png' })) ?? '', /5 MB/);
assert.match(checkUpload(new File([], 'empty.png', { type: 'image/png' })) ?? '', /empty/);

assert.equal(isLayoutKind('webapp'), true);
assert.equal(isLayoutKind('shop'), false);
assert.equal(isLayoutKind(undefined), false);

// --- labels ---
assert.equal(docLabel('shell'), 'Site shell (header & footer)');
assert.equal(docLabel('account.orders'), 'Account · Orders');
assert.equal(docLabel('page:about', doc('About us', []) as never), 'About us (/pages/about)');
assert.equal(docLabel('page:faq', doc('  ', []) as never), '/pages/faq');

// --- diff ---
assert.equal(stableStringify({ b: 1, a: [2, { d: 3, c: 4 }] }), stableStringify({ a: [2, { c: 4, d: 3 }], b: 1 }));
assert.notEqual(stableStringify([1, 2]), stableStringify([2, 1]), 'array order matters');

const shuffled = JSON.parse(JSON.stringify({ pages: SET.pages, shell: SET.shell, schemaVersion: 1 }));
assert.ok(diffIsEmpty(diffPageSets(SET as never, shuffled)), 'key order alone is not a change');

const first = diffPageSets(null, SET as never);
assert.deepEqual(first.added.map((e) => [e.key, e.note]), [['shell', 'Customised'], ['catalog', 'Customised']]);

const draft = {
  schemaVersion: 1,
  shell: SET.shell,
  pages: {
    catalog: doc('', ['ProductGrid', 'CatalogHero']),
    verify: doc('', ['VerifyForm']),
    checkout: doc('', ['CheckoutFlow']),
    'page:about': doc('About us', ['Heading']),
  },
};
const d = diffPageSets(SET as never, draft as never);
assert.deepEqual(d.changed, [{ key: 'catalog', label: 'Catalogue', note: 'Edited' }]);
assert.deepEqual(d.added.map((e) => e.key), ['checkout', 'verify', 'page:about'], 'fixed routes in spec order, then custom pages');
assert.deepEqual(d.added.at(-1), { key: 'page:about', label: 'About us (/pages/about)', note: 'New page' });
assert.deepEqual(d.removed, []);

const back = diffPageSets(draft as never, SET as never);
assert.deepEqual(back.removed.map((e) => [e.key, e.note]), [['checkout', 'Reset to default'], ['verify', 'Reset to default'], ['page:about', 'Deleted']]);
assert.equal(back.removed.at(-1)?.label, 'About us (/pages/about)', 'removed entries are labelled from the published doc');

console.log('protocol + diff checks OK');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node "$SCRATCH/protocol.check.ts"`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `protocol.ts`.

- [ ] **Step 3: Create `src/features/storefront-settings/pages/protocol.ts`**

```ts
import { z } from 'zod';
import type { PreviewTarget, PreviewTheme } from '@/features/storefront-settings/template-form.ts';
import type { BuilderIssue, LayoutKind, PageSet } from '@/types/storefront-pages.ts';

/**
 * Admin side of the page-builder postMessage protocol (spec §13 A6). React-free;
 * its only value import is zod, so a scratch `node` script can check it.
 * Source/origin checks happen in use-builder-bridge.ts; this module only
 * decides whether a message is well-formed.
 */
export const BUILDER_PROTOCOL = 1 as const;

export const LAYOUT_KINDS = ['storefront', 'menu', 'webapp'] as const satisfies readonly LayoutKind[];

export function isLayoutKind(value: unknown): value is LayoutKind {
  return typeof value === 'string' && (LAYOUT_KINDS as readonly string[]).includes(value);
}

// ---- admin → storefront -------------------------------------------------------

export interface BuilderLoadMessage {
  type: 'sf-builder-load';
  protocol: typeof BUILDER_PROTOCOL;
  layout: LayoutKind;
  pageSet: PageSet | null;
  theme: PreviewTheme;
  readOnly: boolean;
}
export interface BuilderThemeMessage { type: 'sf-builder-theme'; theme: PreviewTheme }
export interface BuilderUploadResultMessage {
  type: 'sf-builder-upload-result';
  requestId: string;
  url: string | null;
  error: string | null;
}
export type AdminToBuilderMessage = BuilderLoadMessage | BuilderThemeMessage | BuilderUploadResultMessage;

/** Belt and braces: PreviewTheme has no customCss, but never let one reach the frame (spec §6). */
function withoutCustomCss(theme: PreviewTheme): PreviewTheme {
  const copy = { ...theme } as Record<string, unknown>;
  delete copy.customCss;
  return copy as PreviewTheme;
}

export function loadMessage(layout: LayoutKind, pageSet: PageSet | null, theme: PreviewTheme, readOnly: boolean): BuilderLoadMessage {
  return { type: 'sf-builder-load', protocol: BUILDER_PROTOCOL, layout, pageSet, theme: withoutCustomCss(theme), readOnly };
}

export function themeMessage(theme: PreviewTheme): BuilderThemeMessage {
  return { type: 'sf-builder-theme', theme: withoutCustomCss(theme) };
}

export function uploadResultMessage(requestId: string, result: { url: string } | { error: string }): BuilderUploadResultMessage {
  return 'url' in result
    ? { type: 'sf-builder-upload-result', requestId, url: result.url, error: null }
    : { type: 'sf-builder-upload-result', requestId, url: null, error: result.error };
}

// ---- storefront → admin -------------------------------------------------------

export type BuilderInbound =
  | { type: 'sf-builder-ready'; protocol: typeof BUILDER_PROTOCOL }
  | { type: 'sf-builder-change'; pageSet: PageSet; issues: BuilderIssue[] }
  | { type: 'sf-builder-upload-request'; requestId: string; file: File }
  | { type: 'sf-builder-viewport'; width: BuilderViewport };

/** Editor viewport widths (spec §6 toggle); null = fill the panel. */
export const BUILDER_VIEWPORTS = [360, 768, 1280] as const;
export type BuilderViewport = (typeof BUILDER_VIEWPORTS)[number] | null;

// Structural only — the backend is the validator of record for page sets.
const docSchema = z.looseObject({
  root: z.looseObject({ props: z.record(z.string(), z.unknown()) }),
  content: z.array(z.unknown()),
});
const pageSetSchema = z.looseObject({
  schemaVersion: z.literal(1),
  shell: docSchema,
  pages: z.record(z.string(), docSchema),
});
const issueSchema = z.looseObject({
  docKey: z.string(),
  rule: z.string(),
  message: z.string(),
  blockId: z.string().optional(),
});
const inboundSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('sf-builder-ready'), protocol: z.literal(BUILDER_PROTOCOL) }),
  z.object({ type: z.literal('sf-builder-change'), pageSet: pageSetSchema, issues: z.array(issueSchema).max(500) }),
  z.object({ type: z.literal('sf-builder-upload-request'), requestId: z.string().min(1).max(100), file: z.instanceof(File) }),
  z.object({ type: z.literal('sf-builder-viewport'), width: z.union([z.literal(360), z.literal(768), z.literal(1280), z.null()]) }),
]);

export function parseBuilderMessage(data: unknown): BuilderInbound | null {
  const result = inboundSchema.safeParse(data);
  if (!result.success) return null;
  if (result.data.type === 'sf-builder-change') {
    // Forward the frame's own objects: the backend must see exactly what the editor produced.
    const raw = data as { pageSet: PageSet; issues: BuilderIssue[] };
    return { type: 'sf-builder-change', pageSet: raw.pageSet, issues: raw.issues };
  }
  return result.data as BuilderInbound;
}

// ---- frame address -------------------------------------------------------------

/**
 * The editor lives at /__builder?sf-builder=1 on the deployed storefront. The iframe's sandbox grants
 * allow-scripts + allow-same-origin, which is only safe cross-origin (a same-origin frame could read
 * this app's tokens from localStorage), so a storefront on the admin's own origin gets no frame —
 * the same rule LivePreview applies.
 */
export function builderTarget(baseUrl: string | null, adminOrigin: string): PreviewTarget | null {
  if (!baseUrl) return null;
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }
  if (base.protocol !== 'https:' && base.protocol !== 'http:') return null;
  if (base.origin === adminOrigin) return null;
  return { origin: base.origin, src: new URL('/__builder?sf-builder=1', base).href };
}

// ---- uploads (spec §13 A3) -----------------------------------------------------

export const MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

/** Client-side pre-check so an obviously bad file never costs an upload; the backend re-checks. */
export function checkUpload(file: File): string | null {
  if (!(MEDIA_TYPES as readonly string[]).includes(file.type)) return 'Images must be PNG, JPEG, WebP or GIF.';
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_MEDIA_BYTES) return 'Images must be 5 MB or smaller.';
  return null;
}
```

- [ ] **Step 4: Create `src/features/storefront-settings/pages/diff.ts`**

```ts
import type { DocKey, FixedRouteKey, PageSet, PuckDoc, RouteKey } from '@/types/storefront-pages.ts';
import { docLabel, FIXED_ROUTE_ORDER } from './labels.ts';

/**
 * Client-side publish summary (spec §9): which documents the draft adds, changes
 * or removes relative to the newest published version. Page sets are sparse, so
 * a fixed route that disappears means "reset to default", and a custom page that
 * disappears means "deleted".
 */
export interface DiffEntry { key: DocKey; label: string; note: string }
export interface PageSetDiff { added: DiffEntry[]; changed: DiffEntry[]; removed: DiffEntry[] }

/** JSON with object keys sorted (arrays keep their order), so key order alone never reads as a change. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function docsOf(set: PageSet | null): Map<DocKey, PuckDoc> {
  const docs = new Map<DocKey, PuckDoc>();
  if (!set) return docs;
  docs.set('shell', set.shell);
  for (const [key, doc] of Object.entries(set.pages ?? {})) if (doc) docs.set(key as RouteKey, doc);
  return docs;
}

function rank(key: DocKey): number {
  if (key === 'shell') return -1;
  const i = FIXED_ROUTE_ORDER.indexOf(key as FixedRouteKey);
  return i === -1 ? FIXED_ROUTE_ORDER.length : i;
}

export function diffPageSets(published: PageSet | null, draft: PageSet | null): PageSetDiff {
  const before = docsOf(published);
  const after = docsOf(draft);
  const keys = [...new Set<DocKey>([...before.keys(), ...after.keys()])].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const out: PageSetDiff = { added: [], changed: [], removed: [] };
  for (const key of keys) {
    const was = before.get(key);
    const now = after.get(key);
    const custom = key.startsWith('page:');
    if (!was && now) out.added.push({ key, label: docLabel(key, now), note: custom ? 'New page' : 'Customised' });
    else if (was && !now) out.removed.push({ key, label: docLabel(key, was), note: custom ? 'Deleted' : 'Reset to default' });
    else if (was && now && stableStringify(was) !== stableStringify(now)) out.changed.push({ key, label: docLabel(key, now), note: 'Edited' });
  }
  return out;
}

export function diffIsEmpty(diff: PageSetDiff): boolean {
  return diff.added.length === 0 && diff.changed.length === 0 && diff.removed.length === 0;
}
```

- [ ] **Step 5: Run the check to verify it passes**

Run: `node "$SCRATCH/protocol.check.ts"`
Expected: `protocol + diff checks OK` (an `ExperimentalWarning` about type stripping is fine).

- [ ] **Step 6: Build and lint gate**

```bash
cd /t/Projects/ecommerce/.worktrees/puck-builder/ecommerce-admin-frontend
npm run build 2>&1 | tail -3
node "$SCRATCH/lint-gate.mjs" storefront-settings/pages/protocol.ts storefront-settings/pages/diff.ts
```

Expected: build succeeds; `LINT GATE OK`.

- [ ] **Step 7: Commit**

```bash
git status --short
git add src/features/storefront-settings/pages/protocol.ts src/features/storefront-settings/pages/diff.ts
git commit -m "feat(storefront-pages): builder protocol parsing and publish diff

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Autosaver (pure, node-checked)

**Files:**
- Create: `src/features/storefront-settings/pages/autosaver.ts`
- Scratch: `$SCRATCH/autosaver.check.ts`

**Interfaces:**
- Consumes: `PageSet` type (Task 1).
- Produces:
  ```ts
  type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';
  interface AutosaverOptions {
    delayMs: number;
    save: (pageSet: PageSet) => Promise<void>;       // rejects on failure
    isConflict: (err: unknown) => boolean;
    onStatus: (status: SaveStatus, error: string | null) => void;
  }
  interface Autosaver {
    setBaseline(pageSet: PageSet | null): void;  // server state; drops pending; clears conflict; status 'idle'
    schedule(pageSet: PageSet): void;            // debounce; no-op while in conflict
    flush(): Promise<boolean>;                   // save now, await all; true = nothing unsaved and no conflict
    cancel(): void;                              // drop pending; ignore any in-flight result
    markConflict(): void;                        // stop autosave; status 'conflict'
    current(): PageSet | null;                   // last known server state (baseline or last successful save)
    hasUnsaved(): boolean;                       // a timer, a pending value or a request in flight
  }
  createAutosaver(opts: AutosaverOptions): Autosaver
  ```

- [ ] **Step 1: Write the failing check script** — `$SCRATCH/autosaver.check.ts`

```ts
import assert from 'node:assert/strict';
import { createAutosaver, type SaveStatus } from 'file:///T:/Projects/ecommerce/.worktrees/puck-builder/ecommerce-admin-frontend/src/features/storefront-settings/pages/autosaver.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const set = (n: number) => ({
  schemaVersion: 1,
  shell: { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [{ type: 'Heading', props: { id: `h${n}` } }] },
  pages: {},
}) as never;

function harness(impl?: (call: number) => Promise<void>) {
  const calls: unknown[] = [];
  const statuses: SaveStatus[] = [];
  let lastError: string | null = null;
  const saver = createAutosaver({
    delayMs: 20,
    isConflict: (e) => (e as { status?: number } | null)?.status === 409,
    save: async (ps) => { calls.push(ps); if (impl) await impl(calls.length); },
    onStatus: (s, e) => { statuses.push(s); lastError = e; },
  });
  return { saver, calls, statuses, error: () => lastError, last: () => statuses.at(-1) };
}

// 1. debounce: two quick changes → one save of the latest
{
  const h = harness();
  h.saver.setBaseline(set(0));
  h.saver.schedule(set(1));
  h.saver.schedule(set(2));
  assert.equal(h.last(), 'pending');
  assert.equal(h.saver.hasUnsaved(), true);
  await sleep(60);
  assert.deepEqual(h.calls, [set(2)]);
  assert.equal(h.last(), 'saved');
  assert.equal(h.saver.hasUnsaved(), false);
  assert.deepEqual(h.saver.current(), set(2));
}
// 2. unchanged from baseline → no request
{
  const h = harness();
  h.saver.setBaseline(set(5));
  h.saver.schedule(set(5));
  await sleep(60);
  assert.equal(h.calls.length, 0);
  assert.equal(h.last(), 'idle');
}
// 3. conflict stops autosave until the next baseline
{
  const h = harness(async () => { throw Object.assign(new Error('PAGESET_CONFLICT'), { status: 409 }); });
  h.saver.setBaseline(set(0));
  h.saver.schedule(set(1));
  await sleep(60);
  assert.equal(h.last(), 'conflict');
  h.saver.schedule(set(2));
  await sleep(60);
  assert.equal(h.calls.length, 1, 'no save attempted while in conflict');
  assert.equal(await h.saver.flush(), false);
  h.saver.setBaseline(set(9));
  assert.equal(h.last(), 'idle');
}
// 4. non-conflict error: no retry loop; the next edit or flush() retries
{
  let fail = true;
  const h = harness(async () => { if (fail) throw new Error('boom'); });
  h.saver.setBaseline(set(0));
  h.saver.schedule(set(1));
  await sleep(60);
  assert.equal(h.last(), 'error');
  assert.equal(h.error(), 'boom');
  await sleep(80);
  assert.equal(h.calls.length, 1, 'no automatic retry');
  assert.equal(h.saver.hasUnsaved(), true, 'the failed value is still unsaved');
  assert.equal(await h.saver.flush(), false, 'still failing');
  fail = false;
  assert.equal(await h.saver.flush(), true);
  assert.equal(h.calls.length, 3);
  assert.deepEqual(h.saver.current(), set(1));
}
// 5. a change during an in-flight save is saved afterwards, never concurrently
{
  let active = 0, maxActive = 0;
  const h = harness(async () => { active++; maxActive = Math.max(maxActive, active); await sleep(50); active--; });
  h.saver.setBaseline(set(0));
  h.saver.schedule(set(1));
  await sleep(30);                   // first save now in flight
  h.saver.schedule(set(2));
  assert.equal(await h.saver.flush(), true);
  assert.deepEqual(h.calls, [set(1), set(2)]);
  assert.equal(maxActive, 1);
}
// 6. cancel drops the pending value
{
  const h = harness();
  h.saver.setBaseline(set(0));
  h.saver.schedule(set(1));
  h.saver.cancel();
  await sleep(60);
  assert.equal(h.calls.length, 0);
  assert.equal(h.saver.hasUnsaved(), false);
}
// 7. markConflict (publish 409) stops autosave
{
  const h = harness();
  h.saver.setBaseline(set(0));
  h.saver.schedule(set(1));
  h.saver.markConflict();
  await sleep(60);
  assert.equal(h.calls.length, 0);
  assert.equal(h.last(), 'conflict');
}
// 8. a result that lands after setBaseline is ignored (reload mid-save)
{
  const h = harness(async () => { await sleep(40); });
  h.saver.setBaseline(set(0));
  h.saver.schedule(set(1));
  await sleep(30);                   // in flight
  h.saver.setBaseline(set(7));
  await sleep(40);
  assert.deepEqual(h.saver.current(), set(7));
  assert.equal(h.last(), 'idle');
}
console.log('autosaver checks OK');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node "$SCRATCH/autosaver.check.ts"`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `autosaver.ts`.

- [ ] **Step 3: Create `src/features/storefront-settings/pages/autosaver.ts`**

```ts
import type { PageSet } from '@/types/storefront-pages.ts';

/**
 * Debounced, serialised draft saver (spec §9: "debounced (1 s) PUT …/draft").
 * React-free so a scratch `node` script can check it.
 *
 * - One request in flight at a time; the newest value always wins.
 * - A value equal to the server state is never sent.
 * - A conflict stops everything until setBaseline() (a reload).
 * - A plain failure keeps the value and waits for the next edit or flush(); there is no retry loop.
 * - cancel() and setBaseline() bump a generation, so a response that lands afterwards is ignored.
 */
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';

export interface AutosaverOptions {
  delayMs: number;
  save: (pageSet: PageSet) => Promise<void>;
  isConflict: (err: unknown) => boolean;
  onStatus: (status: SaveStatus, error: string | null) => void;
}

export interface Autosaver {
  setBaseline(pageSet: PageSet | null): void;
  schedule(pageSet: PageSet): void;
  flush(): Promise<boolean>;
  cancel(): void;
  markConflict(): void;
  current(): PageSet | null;
  hasUnsaved(): boolean;
}

export function createAutosaver(opts: AutosaverOptions): Autosaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: PageSet | null = null;
  let inflight: Promise<void> | null = null;
  let server: PageSet | null = null;
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
    setBaseline(pageSet) {
      generation++;
      clearTimer();
      pending = null;
      conflict = false;
      everSaved = false;
      server = pageSet;
      serverJson = pageSet ? JSON.stringify(pageSet) : null;
      opts.onStatus('idle', null);
    },
    schedule(pageSet) {
      if (conflict) return;
      pending = pageSet;
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

- [ ] **Step 4: Run the check to verify it passes**

Run: `node "$SCRATCH/autosaver.check.ts"`
Expected: `autosaver checks OK`.

- [ ] **Step 5: Build and lint gate**

```bash
cd /t/Projects/ecommerce/.worktrees/puck-builder/ecommerce-admin-frontend
npm run build 2>&1 | tail -3
node "$SCRATCH/lint-gate.mjs" storefront-settings/pages/autosaver.ts
```

Expected: build succeeds; `LINT GATE OK`.

- [ ] **Step 6: Commit**

```bash
git status --short
git add src/features/storefront-settings/pages/autosaver.ts
git commit -m "feat(storefront-pages): debounced, serialised draft autosaver

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: VersionsDrawer (UI)

**Files:**
- Create: `src/features/storefront-settings/pages/VersionsDrawer.tsx`

**Interfaces:**
- Consumes: `listPageSetVersions`, `storefrontPagesKeys` (Task 1); `LAYOUT_LABELS` (Task 1 `labels.ts`); `Drawer`, `Button`, `Badge`, `ConfirmDialog`, `Spinner`, `formatDateTime`.
- Produces: `export default function VersionsDrawer(props: VersionsDrawerProps)` where
  ```ts
  interface VersionsDrawerProps {
    open: boolean;
    onClose: () => void;
    layout: LayoutKind;
    previewing: number | null;                      // version currently shown read-only in the frame
    onPreview: (version: number) => void;           // parent closes nothing; drawer closes itself first
    onRestore: (version: number) => Promise<void>;  // rejects with Error on failure
  }
  ```

- [ ] **Step 1: Load the design skill**

Implementer: load the `frontend-design:frontend-design` skill before writing UI code. Keep the existing admin language: the `Drawer` primitive, theme tokens, 13 px body copy, `max-lg:min-h-11` tap targets.

- [ ] **Step 2: Create `VersionsDrawer.tsx`**

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { listPageSetVersions, storefrontPagesKeys } from '@/api/storefront-pages.ts';
import Badge from '@/components/ui/Badge.tsx';
import Button from '@/components/ui/Button.tsx';
import ConfirmDialog from '@/components/ui/ConfirmDialog.tsx';
import Drawer from '@/components/ui/Drawer.tsx';
import Spinner from '@/components/ui/Spinner.tsx';
import { formatDateTime } from '@/lib/format.ts';
import type { LayoutKind } from '@/types/storefront-pages.ts';
import { LAYOUT_LABELS } from './labels.ts';

interface VersionsDrawerProps {
  open: boolean;
  onClose: () => void;
  layout: LayoutKind;
  previewing: number | null;
  onPreview: (version: number) => void;
  onRestore: (version: number) => Promise<void>;
}

/**
 * Published history for one layout (spec §9 "Versions drawer"). The list query shares its key with
 * PagesTab (which needs versions[0] for the publish diff), and the socket event
 * storefront-pages:published invalidates it — so this drawer never refetches on its own.
 */
export default function VersionsDrawer({ open, onClose, layout, previewing, onPreview, onRestore }: VersionsDrawerProps) {
  const versionsQuery = useQuery({
    queryKey: storefrontPagesKeys.versions(layout),
    queryFn: () => listPageSetVersions(layout),
  });
  const [confirmVersion, setConfirmVersion] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);
  const versions = versionsQuery.data ?? [];

  async function restore(version: number) {
    setRestoring(true);
    try {
      await onRestore(version);
      setConfirmVersion(null);
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
        footer={<p className="text-[11px] text-text-tertiary">The last 20 published versions are kept. Restoring publishes a copy as a new version.</p>}
      >
        {versionsQuery.isLoading ? (
          <div className="flex justify-center py-10" role="status" aria-label="Loading versions"><Spinner /></div>
        ) : versionsQuery.isError ? (
          <div className="space-y-3 px-5 py-6 text-[13px] text-text-secondary">
            <p>Couldn’t load the published versions.</p>
            <Button variant="secondary" size="sm" onClick={() => versionsQuery.refetch()}>Try again</Button>
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
                  <p className="flex items-center gap-2 text-[13px] font-medium text-text-primary">
                    Version {v.version}
                    {i === 0 && <Badge color="success">Live</Badge>}
                    {previewing === v.version && <Badge color="info">Previewing</Badge>}
                  </p>
                  <p className="truncate text-[11px] text-text-tertiary">
                    {formatDateTime(v.createdAt)} · {v.createdBy ? v.createdBy.name : 'a removed user'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Preview version ${v.version}`}
                  onClick={() => { onClose(); onPreview(v.version); }}
                >
                  <Eye className="h-3.5 w-3.5" /> Preview
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`Restore version ${v.version}`}
                  disabled={i === 0}
                  title={i === 0 ? 'Already live' : undefined}
                  onClick={() => setConfirmVersion(v.version)}
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
        message={`This publishes version ${confirmVersion ?? ''} again as a new version, so shoppers see it within about 30 seconds. Your current draft is replaced by it.`}
        confirmLabel="Restore"
        variant="primary"
        loading={restoring}
        loadingLabel="Restoring…"
      />
    </>
  );
}
```

Strings **(asserted)**: `Published versions · Storefront` (drawer label), `Version N`, `aria-label="Preview version N"`, `aria-label="Restore version N"`, confirm title `Restore version N?`, and the confirm button `Restore`.

- [ ] **Step 3: Build and lint gate**

```bash
cd /t/Projects/ecommerce/.worktrees/puck-builder/ecommerce-admin-frontend
npm run build 2>&1 | tail -3
node "$SCRATCH/lint-gate.mjs" storefront-settings/pages/VersionsDrawer.tsx
```

Expected: build succeeds; `LINT GATE OK`. The drawer is not mounted anywhere yet. Task 8 renders it in the browser.

- [ ] **Step 4: Commit**

```bash
git status --short
git add src/features/storefront-settings/pages/VersionsDrawer.tsx
git commit -m "feat(storefront-pages): published versions drawer with preview and restore

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Bridge and editor hooks

**Files:**
- Create: `src/features/storefront-settings/pages/use-builder-bridge.ts`
- Create: `src/features/storefront-settings/pages/use-pages-editor.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–3, plus these existing functions:
  - `buildPreviewMessage`, `findTemplate`, `toForm`, and the `PreviewTarget` / `PreviewTheme` types from `@/features/storefront-settings/template-form.ts`
  - `useSocket()` from `@/hooks/use-socket.ts`
- Produces:
  ```ts
  // use-builder-bridge.ts
  interface BuilderBridgeHandlers {
    onReady: () => void;
    onChange: (pageSet: PageSet, issues: BuilderIssue[]) => void;
    onUploadRequest: (requestId: string, file: File) => void;
    onViewport: (width: BuilderViewport) => void;
  }
  useBuilderBridge(frameRef: RefObject<HTMLIFrameElement | null>, target: PreviewTarget | null, handlers: BuilderBridgeHandlers): boolean  // ready

  // use-pages-editor.ts
  AUTOSAVE_DELAY_MS = 1000
  interface PagesEditorOptions { frameRef; target: PreviewTarget; initialLayout: LayoutKind; theme: StorefrontTheme; catalog: StorefrontTemplateCatalog }
  interface PagesEditor {
    layout: LayoutKind; ready: boolean; loading: boolean; loadError: string | null;
    status: SaveStatus; saveError: string | null; issues: BuilderIssue[];
    hasDraft: boolean; baseVersion: number; previewing: number | null;
    viewport: BuilderViewport;               // last sf-builder-viewport width (null = fill)
    switchLayout(next: LayoutKind, force?: boolean): Promise<boolean>;  // false = unsaved changes blocked it
    reload(): Promise<void>;
    flush(): Promise<boolean>;
    currentPageSet(): PageSet | null;
    publish(): Promise<PublishResult>;       // rejects; a 409 also switches to conflict
    discard(): Promise<void>;
    restore(version: number): Promise<number>;   // resolves to the NEW version
    previewVersion(version: number): Promise<void>;
  }
  usePagesEditor(opts: PagesEditorOptions): PagesEditor
  ```

- [ ] **Step 1: Create `use-builder-bridge.ts`**

```ts
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { PreviewTarget } from '@/features/storefront-settings/template-form.ts';
import type { BuilderIssue, PageSet } from '@/types/storefront-pages.ts';
import { parseBuilderMessage, type BuilderViewport } from './protocol.ts';

export interface BuilderBridgeHandlers {
  onReady: () => void;
  onChange: (pageSet: PageSet, issues: BuilderIssue[]) => void;
  onUploadRequest: (requestId: string, file: File) => void;
  onViewport: (width: BuilderViewport) => void;
}

/**
 * Inbound half of the builder protocol (spec §13 A6). Accepts a message only when it comes from
 * this iframe's window AND the storefront origin, and only when parseBuilderMessage accepts its
 * shape. Everything else is ignored. Readiness is keyed on the target object that said ready (as
 * in useStorefrontPreview), so a new target reads as not-ready without a synchronous reset.
 */
export function useBuilderBridge(
  frameRef: RefObject<HTMLIFrameElement | null>,
  target: PreviewTarget | null,
  handlers: BuilderBridgeHandlers,
): boolean {
  const [readyFor, setReadyFor] = useState<PreviewTarget | null>(null);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!target) return;
    const onMessage = (e: MessageEvent) => {
      const win = frameRef.current?.contentWindow;
      if (!win || e.source !== win || e.origin !== target.origin) return;
      const msg = parseBuilderMessage(e.data);
      if (!msg) return;
      if (msg.type === 'sf-builder-ready') {
        setReadyFor(target);
        handlersRef.current.onReady();
      } else if (msg.type === 'sf-builder-change') {
        handlersRef.current.onChange(msg.pageSet, msg.issues);
      } else if (msg.type === 'sf-builder-upload-request') {
        handlersRef.current.onUploadRequest(msg.requestId, msg.file);
      } else {
        handlersRef.current.onViewport(msg.width);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [target, frameRef]);

  return readyFor !== null && readyFor === target;
}
```

- [ ] **Step 2: Create `use-pages-editor.ts`**

```ts
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  discardPageSetDraft,
  getPageSetDraft,
  getPageSetVersion,
  isPageSetConflict,
  publishPageSet,
  restorePageSetVersion,
  savePageSetDraft,
  storefrontPagesKeys,
  uploadStorefrontPageMedia,
} from '@/api/storefront-pages.ts';
import {
  buildPreviewMessage,
  findTemplate,
  toForm,
  type PreviewTarget,
  type PreviewTheme,
} from '@/features/storefront-settings/template-form.ts';
import { useSocket } from '@/hooks/use-socket.ts';
import type { StorefrontTemplateCatalog, StorefrontTheme } from '@/types/storefront-settings.ts';
import type { BuilderIssue, LayoutKind, PageSet, PublishResult } from '@/types/storefront-pages.ts';
import { createAutosaver, type Autosaver, type SaveStatus } from './autosaver.ts';
import {
  checkUpload,
  isLayoutKind,
  loadMessage,
  themeMessage,
  uploadResultMessage,
  type AdminToBuilderMessage,
  type BuilderViewport,
} from './protocol.ts';
import { useBuilderBridge } from './use-builder-bridge.ts';

export const AUTOSAVE_DELAY_MS = 1000;

/** The saved theme as the storefront renders it (locks enforced), minus customCss — same as the Appearance preview. */
function builderTheme(theme: StorefrontTheme, catalog: StorefrontTemplateCatalog): PreviewTheme {
  const form = toForm(theme);
  return buildPreviewMessage(form, findTemplate(catalog, form.template)).theme;
}

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
  previewing: number | null;
  viewport: BuilderViewport;
  switchLayout(next: LayoutKind, force?: boolean): Promise<boolean>;
  reload(): Promise<void>;
  flush(): Promise<boolean>;
  currentPageSet(): PageSet | null;
  publish(): Promise<PublishResult>;
  discard(): Promise<void>;
  restore(version: number): Promise<number>;
  previewVersion(version: number): Promise<void>;
}

/**
 * Orchestrates the Pages tab (spec §9):
 * - ready → GET draft → sf-builder-load
 * - change → debounced PUT
 * - 409 → conflict (autosave stops)
 * - publish, discard, restore, version preview (readOnly load)
 * - upload requests → POST media → sf-builder-upload-result
 * - saved-theme changes → sf-builder-theme
 * - sf-builder-viewport → the iframe element's width (BuilderFrame)
 *
 * Every state change happens in an event handler or a promise callback, never synchronously in an
 * effect body. Refs are read only inside handlers, never during render.
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
  /** The editor's viewport toggle (sf-builder-viewport); null = the frame fills the panel. */
  const [viewport, setViewport] = useState<BuilderViewport>(null);

  const layoutRef = useRef<LayoutKind>(initialLayout);
  const baseVersionRef = useRef(0);
  const previewingRef = useRef<number | null>(null);
  /** The first sf-builder-change after a load is the frame echoing what it loaded — the baseline. */
  const awaitingBaselineRef = useRef(false);
  /** False from the start of a load until its sf-builder-load is posted; changes in between are ignored. */
  const loadedRef = useRef(false);
  const loadSeqRef = useRef(0);
  const autosaverRef = useRef<Autosaver | null>(null);

  const currentTheme = useMemo(() => builderTheme(theme, catalog), [theme, catalog]);
  const themeRef = useRef(currentTheme);

  const post = useCallback(
    (message: AdminToBuilderMessage) => {
      frameRef.current?.contentWindow?.postMessage(message, target.origin);
    },
    [frameRef, target],
  );

  // Created in an effect (not during render) so the save closure's ref reads can never run in render.
  // The cleanup flushes: leaving the page saves the last edit instead of dropping it.
  useEffect(() => {
    const saver = createAutosaver({
      delayMs: AUTOSAVE_DELAY_MS,
      isConflict: isPageSetConflict,
      save: async (pageSet) => {
        const result = await savePageSetDraft(layoutRef.current, { data: pageSet, baseVersion: baseVersionRef.current });
        baseVersionRef.current = result.baseVersion;
        setBaseVersion(result.baseVersion);
        setHasDraft(true);
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

  const loadDraft = useCallback(
    async (forLayout: LayoutKind) => {
      const seq = ++loadSeqRef.current;
      autosaverRef.current?.cancel();
      loadedRef.current = false;
      awaitingBaselineRef.current = false;
      previewingRef.current = null;
      setPreviewing(null);
      setLoading(true);
      setLoadError(null);
      try {
        const draft = await qc.fetchQuery({
          queryKey: storefrontPagesKeys.draft(forLayout),
          queryFn: () => getPageSetDraft(forLayout),
          staleTime: 0,
        });
        if (seq !== loadSeqRef.current) return; // superseded by a newer load
        baseVersionRef.current = draft.baseVersion;
        setBaseVersion(draft.baseVersion);
        setHasDraft(draft.source === 'draft');
        setIssues([]);
        autosaverRef.current?.setBaseline(draft.data);
        awaitingBaselineRef.current = true;
        loadedRef.current = true;
        post(loadMessage(forLayout, draft.data, themeRef.current, false));
      } catch (err) {
        if (seq === loadSeqRef.current) setLoadError(err instanceof Error ? err.message : 'Could not load the draft');
      } finally {
        if (seq === loadSeqRef.current) setLoading(false);
      }
    },
    [qc, post],
  );

  const onReady = useCallback(() => {
    // Also runs if the frame reloads itself: save what we have first, then hand it the server state.
    void (async () => {
      await autosaverRef.current?.flush();
      await loadDraft(layoutRef.current);
    })();
  }, [loadDraft]);

  const onChange = useCallback((pageSet: PageSet, nextIssues: BuilderIssue[]) => {
    if (!loadedRef.current || previewingRef.current !== null) return;
    setIssues(nextIssues);
    if (awaitingBaselineRef.current) {
      awaitingBaselineRef.current = false;
      autosaverRef.current?.setBaseline(pageSet);
      return;
    }
    autosaverRef.current?.schedule(pageSet);
  }, []);

  const onUploadRequest = useCallback(
    (requestId: string, file: File) => {
      const problem = checkUpload(file);
      if (problem) {
        post(uploadResultMessage(requestId, { error: problem }));
        return;
      }
      uploadStorefrontPageMedia(file).then(
        (result) => post(uploadResultMessage(requestId, { url: result.url })),
        (err: unknown) => post(uploadResultMessage(requestId, { error: err instanceof Error && err.message ? err.message : 'Upload failed' })),
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

  // Someone (maybe us) published: refresh that layout's history. Nothing else is touched.
  useEffect(() => {
    if (!socket) return;
    const onPublished = (payload: unknown) => {
      const published = (payload as { layout?: unknown } | null)?.layout;
      void qc.invalidateQueries({ queryKey: isLayoutKind(published) ? storefrontPagesKeys.versions(published) : storefrontPagesKeys.all });
    };
    socket.on('storefront-pages:published', onPublished);
    return () => {
      socket.off('storefront-pages:published', onPublished);
    };
  }, [socket, qc]);

  // Closing the tab inside the debounce window would silently drop the last edit.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (autosaverRef.current?.hasUnsaved()) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const flush = useCallback(async () => (autosaverRef.current ? autosaverRef.current.flush() : true), []);

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

  const publish = useCallback(async () => {
    const forLayout = layoutRef.current;
    try {
      const result = await publishPageSet(forLayout, baseVersionRef.current);
      baseVersionRef.current = result.version;
      setBaseVersion(result.version);
      setHasDraft(true);
      void qc.invalidateQueries({ queryKey: storefrontPagesKeys.versions(forLayout) });
      return result;
    } catch (err) {
      if (isPageSetConflict(err)) autosaverRef.current?.markConflict();
      throw err;
    }
  }, [qc]);

  const discard = useCallback(async () => {
    const forLayout = layoutRef.current;
    autosaverRef.current?.cancel();
    await discardPageSetDraft(forLayout);
    await loadDraft(forLayout);
  }, [loadDraft]);

  const restore = useCallback(
    async (version: number) => {
      const forLayout = layoutRef.current;
      autosaverRef.current?.cancel();
      const result = await restorePageSetVersion(forLayout, version);
      // Contract: the restored (new) version is the baseVersion for later PUTs. loadDraft below
      // re-reads it from the draft too; setting it now closes the gap if that GET fails.
      baseVersionRef.current = result.version;
      setBaseVersion(result.version);
      void qc.invalidateQueries({ queryKey: storefrontPagesKeys.versions(forLayout) });
      await loadDraft(forLayout);
      return result.version;
    },
    [qc, loadDraft],
  );

  const previewVersion = useCallback(
    async (version: number) => {
      const forLayout = layoutRef.current;
      await flush();
      const published = await qc.fetchQuery({
        queryKey: storefrontPagesKeys.version(forLayout, version),
        queryFn: () => getPageSetVersion(forLayout, version),
        staleTime: Infinity, // published versions are immutable
      });
      if (forLayout !== layoutRef.current) return;
      previewingRef.current = version;
      setPreviewing(version);
      awaitingBaselineRef.current = false;
      loadedRef.current = true;
      post(loadMessage(forLayout, published.data, themeRef.current, true));
    },
    [qc, flush, post],
  );

  return {
    layout, ready, loading, loadError, status, saveError, issues, hasDraft, baseVersion, previewing, viewport,
    switchLayout, reload, flush, currentPageSet, publish, discard, restore, previewVersion,
  };
}
```

- [ ] **Step 3: Build and lint gate**

```bash
cd /t/Projects/ecommerce/.worktrees/puck-builder/ecommerce-admin-frontend
npm run build 2>&1 | tail -3
node "$SCRATCH/lint-gate.mjs" storefront-settings/pages/use-builder-bridge.ts storefront-settings/pages/use-pages-editor.ts
```

Expected: build succeeds; `LINT GATE OK`.

If `react-hooks/refs` or `react-hooks/set-state-in-effect` fires, restructure until it passes, keeping every behaviour in the header comment. The allowed moves:
- read refs only in handlers or effects
- make state changes only in handlers or promise callbacks

Adding `eslint-disable` is **not** allowed.

- [ ] **Step 4: Re-run the pure checks** (the hooks import them; make sure nothing drifted)

Run: `node "$SCRATCH/protocol.check.ts" && node "$SCRATCH/autosaver.check.ts"`
Expected: both `…checks OK`.

- [ ] **Step 5: Commit**

```bash
git status --short
git add src/features/storefront-settings/pages/use-builder-bridge.ts src/features/storefront-settings/pages/use-pages-editor.ts
git commit -m "feat(storefront-pages): builder bridge and pages editor hooks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: PublishDialog (UI)

**Files:**
- Create: `src/features/storefront-settings/pages/PublishDialog.tsx`

**Interfaces:**
- Consumes: `getPageSetVersion`, `storefrontPagesKeys` (Task 1); `diffPageSets`, `diffIsEmpty`, `DiffEntry` (Task 2); `LAYOUT_LABELS` (Task 1); `Modal`, `Button`, `Badge`, `Spinner`.
- Produces: `export default function PublishDialog(props: PublishDialogProps)` where
  ```ts
  interface PublishDialogProps {
    open: boolean;
    layout: LayoutKind;
    draft: PageSet | null;      // the saved draft (editor.currentPageSet() after a successful flush)
    latestVersion: number;      // versions[0]?.version ?? 0
    publishing: boolean;
    onClose: () => void;
    onConfirm: () => void;
  }
  ```

- [ ] **Step 1: Load the design skill**

Implementer: load the `frontend-design:frontend-design` skill before writing UI code. The dialog is a confirmation, not a report: the counts are the headline, and the lists are compact and scannable.

- [ ] **Step 2: Create `PublishDialog.tsx`**

```tsx
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UploadCloud } from 'lucide-react';
import { getPageSetVersion, storefrontPagesKeys } from '@/api/storefront-pages.ts';
import Badge from '@/components/ui/Badge.tsx';
import Button from '@/components/ui/Button.tsx';
import Modal from '@/components/ui/Modal.tsx';
import Spinner from '@/components/ui/Spinner.tsx';
import type { LayoutKind, PageSet } from '@/types/storefront-pages.ts';
import { diffIsEmpty, diffPageSets, type DiffEntry } from './diff.ts';
import { LAYOUT_LABELS } from './labels.ts';

interface PublishDialogProps {
  open: boolean;
  layout: LayoutKind;
  draft: PageSet | null;
  latestVersion: number;
  publishing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const GROUPS = [
  { key: 'added', title: 'Added', color: 'success' },
  { key: 'changed', title: 'Changed', color: 'info' },
  { key: 'removed', title: 'Removed', color: 'warning' },
] as const;

/** Confirm step for publishing (spec §9): what the draft adds, changes and removes against the live version. */
export default function PublishDialog({ open, layout, draft, latestVersion, publishing, onClose, onConfirm }: PublishDialogProps) {
  const publishedQuery = useQuery({
    queryKey: storefrontPagesKeys.version(layout, latestVersion),
    queryFn: () => getPageSetVersion(layout, latestVersion),
    enabled: open && latestVersion > 0,
    staleTime: Infinity, // published versions are immutable
  });
  const waiting = latestVersion > 0 && publishedQuery.isLoading;
  const baseFailed = latestVersion > 0 && publishedQuery.isError;

  const diff = useMemo(() => {
    if (waiting || baseFailed) return null;
    return diffPageSets(latestVersion > 0 ? (publishedQuery.data?.data ?? null) : null, draft);
  }, [waiting, baseFailed, latestVersion, publishedQuery.data, draft]);
  const nothingChanged = diff !== null && diffIsEmpty(diff);

  return (
    <Modal open={open} onClose={onClose} title={`Publish ${LAYOUT_LABELS[layout]} pages`} size="md" dismissible={!publishing}>
      <div className="space-y-4 text-[13px] text-text-secondary">
        <p>
          {latestVersion > 0
            ? `This replaces live version ${latestVersion} for the ${LAYOUT_LABELS[layout]} layout with version ${latestVersion + 1}.`
            : `This is the first publish for the ${LAYOUT_LABELS[layout]} layout. Pages you haven’t touched keep their built-in design.`}
        </p>

        {waiting && (
          <div className="flex items-center gap-2 text-text-tertiary" role="status"><Spinner size="sm" /> Comparing with the live version…</div>
        )}

        {baseFailed && (
          <p className="rounded-lg border border-border-subtle bg-bg-surface px-3 py-2" role="alert">
            Couldn’t load the live version to compare. You can still publish.
          </p>
        )}

        {nothingChanged && <p className="text-text-primary">Nothing has changed since version {latestVersion}.</p>}

        {diff && !nothingChanged && (
          <div className="space-y-3">
            {GROUPS.map(({ key, title, color }) =>
              diff[key].length > 0 ? (
                <section key={key} aria-label={title}>
                  <h3 className="mb-1 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-text-tertiary">
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

        <p className="text-[11px] text-text-tertiary">Shoppers see the new pages within about 30 seconds (edge cache).</p>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={publishing}>Cancel</Button>
          <Button onClick={onConfirm} disabled={publishing || waiting || nothingChanged || draft === null}>
            {publishing ? <><Spinner size="sm" /> Publishing…</> : <><UploadCloud className="h-4 w-4" /> Publish</>}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

Strings **(asserted)**: the title `Publish Storefront pages` (the shared `Modal` has no accessible name, so the pass finds dialogs by text), the entry labels/notes from `diff.ts`, `Nothing has changed since version N.`, and the confirm button `Publish`.

- [ ] **Step 3: Build and lint gate**

```bash
cd /t/Projects/ecommerce/.worktrees/puck-builder/ecommerce-admin-frontend
npm run build 2>&1 | tail -3
node "$SCRATCH/lint-gate.mjs" storefront-settings/pages/PublishDialog.tsx
```

Expected: build succeeds; `LINT GATE OK`.

- [ ] **Step 4: Commit**

```bash
git status --short
git add src/features/storefront-settings/pages/PublishDialog.tsx
git commit -m "feat(storefront-pages): publish confirm dialog with diff summary

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: PagesTab, BuilderFrame and section wiring (UI)

**Files:**
- Create: `src/features/storefront-settings/pages/BuilderFrame.tsx`
- Create: `src/features/storefront-settings/pages/PagesTab.tsx`
- Modify: `src/features/storefront-settings/sections.ts` (add the `pages` section and `sectionGroupsFor`)
- Modify: `src/features/storefront-settings/StorefrontSettingsPage.tsx` (role-filtered groups, Pages panel, `wide`)

**Interfaces:**
- Consumes: `usePagesEditor`, `PagesEditor` (Task 5, including `editor.viewport`); `BuilderViewport` (Task 2); `PublishDialog` (Task 6); `VersionsDrawer` (Task 4); `builderTarget`, `isLayoutKind`, `LAYOUT_KINDS` (Task 2); `LAYOUT_LABELS`, `docLabel` (Task 1); `listPageSetVersions`, `storefrontPagesKeys`, `isPageSetConflict`, `isNoDraft` (Task 1); `SaveStatus` (Task 3). Existing: `getStorefrontSettings`, `getStorefrontTemplates`, `storefrontSettingsKeys`, `FALLBACK_CATALOG`, `useConfirm`, `useAuth`, `RoleGate`.
- Produces:
  - `export default function PagesTab({ onGoToDeploy }: { onGoToDeploy: () => void })`
  - `export default function BuilderFrame({ frameRef, target, ready, width })` (`width: BuilderViewport`)
  - `sectionGroupsFor(isAdmin: boolean): StorefrontSectionGroup[]` in `sections.ts`
  - `SectionId` gains `'pages'`

- [ ] **Step 1: Load the design skill**

Implementer: load the `frontend-design:frontend-design` skill before writing UI code.

The editor frame is the hero, so give it all the height the viewport allows. The toolbar is one quiet row: the layout segmented control on the left, the status chip, and the actions on the right. Banners sit between the toolbar and the frame and are never modal.

- [ ] **Step 2: Add the section in `sections.ts`**

Add `PanelsTopLeft` to the `lucide-react` import. Add `| 'pages'` to `SectionId` right after `'appearance'`. Change the doc comment `Nine sections in three groups` to `Ten sections in three groups`. In the `Storefront` group, insert this entry directly after the `appearance` entry:

```ts
      {
        id: 'pages',
        label: 'Pages',
        description: 'Arrange what every storefront page shows, add your own pages, and publish when ready.',
        icon: PanelsTopLeft,
      },
```

Append at the end of the file:

```ts
/**
 * Pages is admin-only — the backend's storefront-pages routes are authorize('admin') — so other
 * roles (including a restricted role with storefront write) never see it in the rail. A stale
 * ?section=pages link then falls back to General via useSettingsSection.
 */
export function sectionGroupsFor(isAdmin: boolean): StorefrontSectionGroup[] {
  if (isAdmin) return SECTION_GROUPS;
  return SECTION_GROUPS.map((group) => ({ ...group, sections: group.sections.filter((s) => s.id !== 'pages') }));
}
```

- [ ] **Step 3: Create `BuilderFrame.tsx`**

```tsx
import { useEffect, useState, type RefObject } from 'react';
import Spinner from '@/components/ui/Spinner.tsx';
import type { PreviewTarget } from '@/features/storefront-settings/template-form.ts';
import type { BuilderViewport } from './protocol.ts';

/** How long the frame may stay silent before "Connecting…" gives way to the predates-builder hint. */
const SLOW_CONNECT_MS = 8000;

interface BuilderFrameProps {
  frameRef: RefObject<HTMLIFrameElement | null>;
  target: PreviewTarget;
  ready: boolean;
  /** From sf-builder-viewport: the iframe element's pixel width. null = fill the panel. */
  width: BuilderViewport;
}

/**
 * The storefront's /__builder editor, unscaled. The editor's own viewport toggle tells us (via
 * sf-builder-viewport) how wide the iframe ELEMENT should be: that width, centred, with horizontal
 * scroll when the panel is narrower (e.g. 1280 in a ~1100 px panel); null fills the panel.
 * Sandbox as LivePreview (cross-origin only, enforced by builderTarget), plus allow-modals for the
 * editor's own confirm prompts.
 */
export default function BuilderFrame({ frameRef, target, ready, width }: BuilderFrameProps) {
  // Keyed on the target (like LivePreview) so a new target restarts the wait without a reset call.
  const [slowFor, setSlowFor] = useState<PreviewTarget | null>(null);
  useEffect(() => {
    if (ready) return;
    const id = window.setTimeout(() => setSlowFor(target), SLOW_CONNECT_MS);
    return () => window.clearTimeout(id);
  }, [target, ready]);
  const slow = !ready && slowFor === target;

  return (
    <div
      data-builder-scroller=""
      className="relative h-[max(640px,calc(100dvh-15rem))] w-full overflow-x-auto overflow-y-hidden rounded-xl border border-border-subtle bg-bg-surface"
    >
      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-bg-base px-6 text-center text-[13px] text-text-tertiary" role="status">
          {slow ? (
            <p className="max-w-sm">
              The deployed storefront may predate the page builder. Deploy the latest release (v0.7.0 or later) from the Deploy section.
            </p>
          ) : (
            <><Spinner size="sm" /> Connecting to the page builder…</>
          )}
        </div>
      )}
      {/* mx-auto centres a fixed width; when it's wider than the panel the scroller scrolls instead.
          Only the wrapper's width changes, so the iframe never remounts (no reload, no lost state). */}
      <div className="mx-auto h-full" style={width === null ? { width: '100%' } : { width, minWidth: width }}>
        <iframe
          ref={frameRef}
          title="Storefront page builder"
          src={target.src}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          referrerPolicy="strict-origin-when-cross-origin"
          className="block h-full w-full border-0 bg-white"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `PagesTab.tsx`**

```tsx
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Eye, History, PanelsTopLeft, Trash2, UploadCloud } from 'lucide-react';
import toast from 'react-hot-toast';
import { isNoDraft, isPageSetConflict, listPageSetVersions, storefrontPagesKeys } from '@/api/storefront-pages.ts';
import { getStorefrontSettings, getStorefrontTemplates, storefrontSettingsKeys } from '@/api/storefront-settings.ts';
import Badge from '@/components/ui/Badge.tsx';
import Button from '@/components/ui/Button.tsx';
import ConfirmDialog from '@/components/ui/ConfirmDialog.tsx';
import EmptyState from '@/components/ui/EmptyState.tsx';
import Spinner from '@/components/ui/Spinner.tsx';
import { FALLBACK_CATALOG, type PreviewTarget } from '@/features/storefront-settings/template-form.ts';
import { useConfirm } from '@/hooks/use-confirm.ts';
import { cn } from '@/lib/cn.ts';
import type { StorefrontTemplateCatalog, StorefrontTheme } from '@/types/storefront-settings.ts';
import type { LayoutKind, PageSet } from '@/types/storefront-pages.ts';
import type { SaveStatus } from './autosaver.ts';
import BuilderFrame from './BuilderFrame.tsx';
import { docLabel, LAYOUT_LABELS } from './labels.ts';
import { builderTarget, isLayoutKind, LAYOUT_KINDS } from './protocol.ts';
import PublishDialog from './PublishDialog.tsx';
import { usePagesEditor } from './use-pages-editor.ts';
import VersionsDrawer from './VersionsDrawer.tsx';

/** Storefront Settings → Pages (spec §9). Resolves the frame target, then hands off to the editor view. */
export default function PagesTab({ onGoToDeploy }: { onGoToDeploy: () => void }) {
  const settingsQuery = useQuery({ queryKey: storefrontSettingsKeys.all, queryFn: getStorefrontSettings });
  const templatesQuery = useQuery({ queryKey: storefrontSettingsKeys.templates(), queryFn: getStorefrontTemplates, staleTime: 60_000, retry: 1 });
  // Same degradation as ThemeEditor: a failed catalog call means "no known storefront URL".
  const catalog = templatesQuery.data ?? (templatesQuery.isError ? FALLBACK_CATALOG : undefined);
  const baseUrl = catalog?.baseUrl ?? null;
  const target = useMemo(() => builderTarget(baseUrl, window.location.origin), [baseUrl]);
  const settings = settingsQuery.data;

  if (settingsQuery.isError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn’t load storefront settings"
        description="The page builder needs the storefront’s theme and layout settings."
        action={<Button variant="secondary" onClick={() => settingsQuery.refetch()}>Try again</Button>}
      />
    );
  }
  if (!settings || !catalog) {
    return (
      <div className="flex justify-center py-16" role="status" aria-label="Loading page builder"><Spinner size="lg" /></div>
    );
  }
  if (!target) {
    return (
      <EmptyState
        icon={PanelsTopLeft}
        title="Deploy the storefront first"
        description="The page builder runs inside your deployed storefront. Deploy it from the Deploy section, then come back here to edit its pages."
        action={<Button variant="secondary" onClick={onGoToDeploy}>Go to Deploy</Button>}
      />
    );
  }
  const browserLayout: LayoutKind = isLayoutKind(settings.features.layout) ? settings.features.layout : 'storefront';
  return <PagesEditorView key={target.src} target={target} theme={settings.theme} catalog={catalog} browserLayout={browserLayout} />;
}

interface PagesEditorViewProps {
  target: PreviewTarget;
  theme: StorefrontTheme;
  catalog: StorefrontTemplateCatalog;
  browserLayout: LayoutKind;
}

function PagesEditorView({ target, theme, catalog, browserLayout }: PagesEditorViewProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const editor = usePagesEditor({ frameRef, target, initialLayout: browserLayout, theme, catalog });
  const versionsQuery = useQuery({
    queryKey: storefrontPagesKeys.versions(editor.layout),
    queryFn: () => listPageSetVersions(editor.layout),
  });
  const latestVersion = versionsQuery.data?.[0]?.version ?? 0;

  const [publishOpen, setPublishOpen] = useState(false);
  const [publishDraft, setPublishDraft] = useState<PageSet | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const dialog = useConfirm();

  const publishMutation = useMutation({
    mutationFn: () => editor.publish(),
    onSuccess: (result) => {
      setPublishOpen(false);
      toast.success(`Published version ${result.version}. Shoppers see it within about 30 seconds (edge cache).`);
    },
    onError: (err: Error) => {
      setPublishOpen(false);
      // A 409 has already switched the editor into conflict; the banner explains it.
      if (isPageSetConflict(err)) return;
      toast.error(isNoDraft(err) ? 'There’s no draft to publish yet — make a change in the editor first.' : err.message);
    },
  });

  async function openPublish() {
    setPreparing(true);
    try {
      const saved = await editor.flush();
      if (!saved) {
        toast.error('Your latest changes aren’t saved yet, so there’s nothing safe to publish. Resolve the message above and try again.');
        return;
      }
      setPublishDraft(editor.currentPageSet());
      setPublishOpen(true);
    } finally {
      setPreparing(false);
    }
  }

  async function chooseLayout(next: LayoutKind) {
    const switched = await editor.switchLayout(next);
    if (switched) return;
    dialog.confirm({
      title: 'Switch without saving?',
      message: `Your latest changes to the ${LAYOUT_LABELS[editor.layout]} pages couldn’t be saved. Switch anyway and lose them?`,
      confirmLabel: 'Switch anyway',
      variant: 'danger',
      onConfirm: () => {
        dialog.close();
        void editor.switchLayout(next, true);
      },
    });
  }

  function askDiscard() {
    dialog.confirm({
      title: 'Discard draft?',
      message: `This throws away every unpublished change to the ${LAYOUT_LABELS[editor.layout]} pages and reloads the live version. It can’t be undone.`,
      confirmLabel: 'Discard draft',
      variant: 'danger',
      onConfirm: () => {
        dialog.close();
        editor.discard().then(
          () => toast.success('Draft discarded'),
          (err: Error) => toast.error(err.message),
        );
      },
    });
  }

  const conflict = editor.status === 'conflict';
  const publishBlockedBy =
    !editor.ready ? 'Waiting for the page builder'
      : editor.previewing !== null ? 'Leave the version preview first'
        : conflict ? 'Reload first'
          : editor.issues.length > 0 ? `Fix ${editor.issues.length} issue${editor.issues.length === 1 ? '' : 's'} first`
            : !editor.hasDraft ? 'No unpublished changes'
              : null;

  return (
    <div className="space-y-3">
      <div
        role="toolbar"
        aria-label="Page builder toolbar"
        className="flex flex-wrap items-center gap-2 rounded-xl border border-border-subtle bg-bg-raised px-3 py-2"
      >
        <LayoutSwitcher value={editor.layout} live={browserLayout} disabled={editor.loading || preparing} onChange={(l) => void chooseLayout(l)} />
        <SaveChip status={editor.status} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setVersionsOpen(true)}>
            <History className="h-3.5 w-3.5" /> Versions
          </Button>
          <Button variant="ghost" size="sm" onClick={askDiscard} disabled={!editor.hasDraft || !editor.ready || editor.previewing !== null}>
            <Trash2 className="h-3.5 w-3.5" /> Discard draft
          </Button>
          <Button size="sm" onClick={() => void openPublish()} disabled={publishBlockedBy !== null || preparing} title={publishBlockedBy ?? undefined}>
            {preparing ? <Spinner size="sm" /> : <UploadCloud className="h-3.5 w-3.5" />} Publish
          </Button>
        </div>
      </div>

      {conflict && (
        <Banner tone="warning" action={<Button size="sm" variant="secondary" onClick={() => void editor.reload()}>Reload</Button>}>
          Someone published since you opened this — reload to continue. Autosave is paused, and reloading drops changes made since the last save.
        </Banner>
      )}
      {editor.previewing !== null && (
        <Banner tone="info" action={<Button size="sm" variant="secondary" onClick={() => void editor.reload()}><Eye className="h-3.5 w-3.5" /> Back to draft</Button>}>
          Previewing version {editor.previewing} (read-only). Nothing you do here is saved.
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
      {editor.issues.length > 0 && editor.previewing === null && (
        <Banner tone="warning">
          <p>Publishing is blocked until these are fixed in the editor:</p>
          <ul className="mt-1 list-disc pl-5">
            {editor.issues.slice(0, 5).map((issue, i) => (
              <li key={`${issue.docKey}-${issue.rule}-${i}`}>{docLabel(issue.docKey)}: {issue.message}</li>
            ))}
            {editor.issues.length > 5 && <li>…and {editor.issues.length - 5} more</li>}
          </ul>
        </Banner>
      )}

      <p className="text-[11px] text-text-tertiary lg:hidden">The page builder works best on a desktop-width screen.</p>
      <BuilderFrame frameRef={frameRef} target={target} ready={editor.ready} width={editor.viewport} />

      <PublishDialog
        open={publishOpen}
        layout={editor.layout}
        draft={publishDraft}
        latestVersion={latestVersion}
        publishing={publishMutation.isPending}
        onClose={() => { if (!publishMutation.isPending) setPublishOpen(false); }}
        onConfirm={() => publishMutation.mutate()}
      />
      <VersionsDrawer
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        layout={editor.layout}
        previewing={editor.previewing}
        onPreview={(version) => { editor.previewVersion(version).catch((err: Error) => toast.error(err.message)); }}
        onRestore={async (version) => {
          const created = await editor.restore(version);
          toast.success(`Version ${version} restored as version ${created}. Shoppers see it within about 30 seconds.`);
        }}
      />
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

function LayoutSwitcher({ value, live, disabled, onChange }: { value: LayoutKind; live: LayoutKind; disabled: boolean; onChange: (l: LayoutKind) => void }) {
  return (
    <div role="radiogroup" aria-label="Layout" className="inline-flex gap-0.5 rounded-lg border border-border-subtle bg-bg-surface p-0.5">
      {LAYOUT_KINDS.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === l}
          disabled={disabled}
          title={l === 'webapp' ? 'Telegram Mini App — always used inside Telegram' : l === live ? 'Browsers get this layout' : 'Not currently used by browsers'}
          onClick={() => { if (value !== l) onChange(l); }}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-60 max-lg:min-h-11 max-lg:px-3',
            value === l ? 'bg-bg-base text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-secondary',
          )}
        >
          {LAYOUT_LABELS[l]}
          {l === live && (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
              <span className="sr-only"> (live for browsers)</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}

const CHIP: Record<Exclude<SaveStatus, 'idle'>, { label: string; color: 'default' | 'success' | 'error' | 'warning' }> = {
  pending: { label: 'Saving…', color: 'default' },
  saving: { label: 'Saving…', color: 'default' },
  saved: { label: 'Saved', color: 'success' },
  error: { label: 'Error', color: 'error' },
  conflict: { label: 'Autosave paused', color: 'warning' },
};

function SaveChip({ status }: { status: SaveStatus }) {
  return (
    <span role="status" aria-live="polite" className="min-w-16">
      {status !== 'idle' && <Badge color={CHIP[status].color}>{CHIP[status].label}</Badge>}
    </span>
  );
}

function Banner({ tone, action, children }: { tone: 'info' | 'warning' | 'error'; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      role={tone === 'info' ? 'status' : 'alert'}
      className={cn(
        'flex flex-wrap items-start gap-3 rounded-xl border px-3 py-2.5 text-[13px]',
        tone === 'info' && 'border-info/30 bg-info-muted text-text-primary',
        tone === 'warning' && 'border-warning/30 bg-warning-muted text-text-primary',
        tone === 'error' && 'border-error/30 bg-error-muted text-text-primary',
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
```

`React.ReactNode` needs the type in scope. Add `type ReactNode` to the `react` import and use `ReactNode`, or use the global `React` namespace as `EmptyState.tsx` does. Pick whichever passes `tsc` with the repo's `jsx: react-jsx` setting.

Strings **(asserted)**:
- toolbar `aria-label="Page builder toolbar"` and buttons `Versions`, `Discard draft`, `Publish`
- radiogroup `aria-label="Layout"` with radios `Storefront`, `Menu`, `Telegram` (the accessible name of the live one ends with "(live for browsers)")
- chip texts `Saving…`, `Saved`, `Error`, `Autosave paused`
- banner texts `Someone published since you opened this`, `Previewing version N (read-only)`, `Couldn’t save:`, `Publishing is blocked until these are fixed in the editor:`
- banner buttons `Reload`, `Back to draft`, `Retry now`
- the empty-state title `Deploy the storefront first`
- toasts containing `30 seconds` and `restored as version`

- [ ] **Step 5: Wire the page — `StorefrontSettingsPage.tsx`**

Replace the imports and the start of the component with:

```tsx
import { useMemo } from 'react';
import SettingsLayout, { SettingsPanel } from '@/components/settings/SettingsLayout.tsx';
import { useSettingsSection } from '@/components/settings/use-settings-section.ts';
import RoleGate from '@/components/layout/RoleGate.tsx';
import { useAuth } from '@/hooks/use-auth.ts';
import { sectionGroupsFor } from '@/features/storefront-settings/sections.ts';
import GeneralCard from '@/features/storefront-settings/GeneralCard.tsx';
import AppearanceTab, { OpenStorefrontLink } from '@/features/storefront-settings/AppearanceTab.tsx';
import FeaturesCard from '@/features/storefront-settings/FeaturesCard.tsx';
import NoticesEditor from '@/features/storefront-settings/NoticesEditor.tsx';
import CutoffsEditor from '@/features/storefront-settings/CutoffsEditor.tsx';
import PaymentsCard from '@/features/storefront-settings/PaymentsCard.tsx';
import IntegrationsCard from '@/features/storefront-settings/IntegrationsCard.tsx';
import WhatsappPanel from '@/features/storefront-settings/WhatsappPanel.tsx';
import DeployTab from '@/features/storefront-settings/deploy/DeployTab.tsx';
import PagesTab from '@/features/storefront-settings/pages/PagesTab.tsx';

/** (keep the existing doc comment) */
export default function StorefrontSettingsPage() {
  const { isAdmin } = useAuth();
  const groups = useMemo(() => sectionGroupsFor(isAdmin), [isAdmin]);
  const { active, goTo, hasVisited } = useSettingsSection(groups, 'general');

  return (
    <SettingsLayout
      title="Storefront Settings"
      groups={groups}
      active={active}
      onChange={goTo}
      navLabel="Storefront settings sections"
      wide={active === 'appearance' || active === 'pages'}
      panelMeta={active === 'appearance' || active === 'pages' ? <OpenStorefrontLink /> : undefined}
    >
```

Then insert this panel directly after the `appearance` panel block:

```tsx
      {hasVisited('pages') && (
        <SettingsPanel active={active === 'pages'}>
          <RoleGate allow={['admin']}>
            <PagesTab onGoToDeploy={() => goTo('deploy')} />
          </RoleGate>
        </SettingsPanel>
      )}
```

The `SECTION_GROUPS` import is no longer used in this file. Remove it and keep `sectionGroupsFor`.

- [ ] **Step 6: Build and lint gate**

```bash
cd /t/Projects/ecommerce/.worktrees/puck-builder/ecommerce-admin-frontend
npm run build 2>&1 | tail -3
node "$SCRATCH/lint-gate.mjs" storefront-settings/pages/ storefront-settings/sections.ts storefront-settings/StorefrontSettingsPage.tsx
```

Expected: build succeeds; `LINT GATE OK`. If `react-refresh/only-export-components` fires on `sections.ts`, ignore it: that file is `.ts`, so the rule doesn't apply. If it fires on `PagesTab.tsx`, make sure only the default component is exported.

- [ ] **Step 7: Commit**

```bash
git status --short
git add src/features/storefront-settings/pages/BuilderFrame.tsx src/features/storefront-settings/pages/PagesTab.tsx src/features/storefront-settings/sections.ts src/features/storefront-settings/StorefrontSettingsPage.tsx
git commit -m "feat(storefront-settings): Pages section hosting the storefront page builder

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Mocked Playwright pass and final gates

**Files:**
- Scratch only (never committed): `$SCRATCH/pages-pass.mjs`, screenshots in `$SCRATCH/shots/`.
- No repo files change. If the pass finds a bug, fix it in the owning task's file, re-run that task's gate, and commit it as `fix(storefront-pages): …`.

**Interfaces:**
- Consumes: the whole feature through the browser. `playwright` comes from `T:/Projects/ecommerce/.worktrees/puck-builder/ecommerce-storefront/node_modules/playwright` (installed there; Chromium 1234 is in `%LOCALAPPDATA%/ms-playwright`).
- Produces: a pass/fail report and screenshots.

- [ ] **Step 1: Load the design skill**

Implementer: load the `frontend-design:frontend-design` skill before writing UI code. You'll need it if the screenshots show a layout problem that sends you back into Task 4, 6 or 7's files.

- [ ] **Step 2: Start Vite against a dead API port** (background)

```bash
cd /t/Projects/ecommerce/.worktrees/puck-builder/ecommerce-admin-frontend
VITE_API_BASE_URL=http://localhost:3999/api/v1 VITE_WS_URL=http://localhost:3999 npx vite --port 5199 --strictPort
```

Run this with `run_in_background`. Nothing listens on 3999, and every API call is answered by `page.route`. Wait until `curl -s -o /dev/null -w '%{http_code}' http://localhost:5199/` prints `200`.

- [ ] **Step 3: Write the pass** — `$SCRATCH/pages-pass.mjs`

```js
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire('T:/Projects/ecommerce/.worktrees/puck-builder/ecommerce-storefront/package.json');
const { chromium } = require('playwright');

const SCRATCH = 'C:/Users/Nobody/AppData/Local/Temp/claude/T--Projects-ecommerce/7574e00a-109d-46fb-a87b-812ac6c5bd8f/scratchpad/puck-admin';
mkdirSync(`${SCRATCH}/shots`, { recursive: true });
const APP = 'http://localhost:5199';
const SF = 'https://shop.example';

// ---------- fixtures (Northbound Supply / shop.example only) ----------
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = `x.${b64({ sub: 1, exp: Math.floor(Date.now() / 1000) + 3600 })}.y`;
const user = (role) => ({ id: 1, username: 'owner', name: 'Northbound Owner', role, isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
const doc = (title, types) => ({ root: { props: { title, description: '', chrome: 'shell' } }, content: types.map((type, i) => ({ type, props: { id: `${type}-${i}` } })) });
const SHELL = doc('', ['Header', 'PageOutlet', 'Footer']);
const V2 = { schemaVersion: 1, shell: SHELL, pages: {} };
const V3 = { schemaVersion: 1, shell: SHELL, pages: { catalog: doc('', ['CatalogHero', 'ProductGrid']) } };
const EDIT1 = { schemaVersion: 1, shell: SHELL, pages: { catalog: doc('', ['ProductGrid', 'CatalogHero']) } };
const EDIT2 = { schemaVersion: 1, shell: SHELL, pages: { catalog: doc('', ['ProductGrid', 'CatalogHero']), 'page:about': doc('About us', ['Heading', 'RichText']) } };
const EDIT3 = { schemaVersion: 1, shell: SHELL, pages: { ...EDIT2.pages, verify: doc('', ['VerifyForm', 'Heading']) } };
const MENU_DEFAULT = { schemaVersion: 1, shell: doc('', ['Header', 'PageOutlet']), pages: {} };

const THEME = {
  template: 'modern', preset: 'default', options: {}, scheme: 'dark',
  colors: { primary: '#ffffff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' },
  fonts: { heading: null, body: null, mono: null }, radius: 'none', density: 'comfortable', customCss: 'body { outline: 0 }',
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

// A tiny stand-in for the storefront's /__builder that speaks spec §13 A6.
const FAKE_BUILDER = `<!doctype html><html><body><h1>Fake builder</h1><script>
  window.__received = [];
  let adminOrigin = null;
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent) return;
    window.__received.push({ origin: e.origin, data: e.data });
    if (e.data && e.data.type === 'sf-builder-load' && !adminOrigin) adminOrigin = e.origin;
  });
  window.__send = (msg) => window.parent.postMessage(msg, adminOrigin || '*');
  window.__upload = (requestId, type, size) =>
    window.parent.postMessage({ type: 'sf-builder-upload-request', requestId, file: new File([new Uint8Array(size)], 'hero.png', { type }) }, adminOrigin);
  window.parent.postMessage({ type: 'sf-builder-ready', protocol: 1 }, '*');
</script></body></html>`;

// ---------- mock backend ----------
function freshState(overrides = {}) {
  return {
    role: 'admin', baseUrl: SF, putFailures: [], calls: [], uploads: 0, mediaFailure: null,
    layouts: {
      storefront: {
        draft: V3, source: 'draft', baseVersion: 3,
        versions: [
          { version: 3, data: V3, createdAt: '2026-09-28T10:00:00.000Z', createdBy: { id: 1, name: 'Northbound Owner' } },
          { version: 2, data: V2, createdAt: '2026-09-20T10:00:00.000Z', createdBy: null },
        ],
      },
      menu: { draft: null, source: 'none', baseVersion: 0, versions: [] },
      webapp: { draft: null, source: 'none', baseVersion: 0, versions: [] },
    },
    ...overrides,
  };
}

async function openApp(state) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(({ token, u }) => {
    if (location.origin !== 'http://localhost:5199') return;
    localStorage.setItem('access_token', token);
    localStorage.setItem('refresh_token', 'r');
    localStorage.setItem('auth_user', JSON.stringify(u));
  }, { token: TOKEN, u: user(state.role) });
  await context.route(`${SF}/**`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: FAKE_BUILDER }));
  await context.route('http://localhost:3999/socket.io/**', (route) => route.abort());
  await context.route('http://localhost:3999/api/v1/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace('/api/v1/', '');
    const method = req.method();
    const json = req.headers()['content-type']?.includes('application/json') ? req.postDataJSON() : null;
    state.calls.push({ method, path, json });
    const ok = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data, error: null }) });
    const fail = (status, error) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: false, data: null, error }) });

    if (path === 'account/me') {
      return ok({ ...user(state.role), email: null, avatarUrl: null, twoFactorRequired: false, totpEnabled: false, recoveryCodesRemaining: 0, passkeys: [],
        permissions: { modules: { dashboard: 'read', storefront: 'write', settings: 'write' }, landingModule: 'dashboard' } });
    }
    if (path === 'storefront-settings') return ok(SETTINGS);
    if (path === 'storefront-settings/templates') return ok({ source: 'live', tag: null, baseUrl: state.baseUrl, templates: [MODERN] });
    if (path === 'storefront-deploy/target') return ok(null);
    if (path === 'storefront-pages/media' && method === 'POST') {
      state.uploads++;
      if (state.mediaFailure) return fail(422, state.mediaFailure);
      return ok({ url: '/media/storefront-pages/media/0123456789abcdef0123456789abcdef.png' });
    }
    let m = path.match(/^storefront-pages\/(storefront|menu|webapp)\/(.+)$/);
    if (m) {
      const L = state.layouts[m[1]];
      const rest = m[2];
      const latest = L.versions[0]?.version ?? 0;
      if (rest === 'draft' && method === 'GET') {
        return ok({ layout: m[1], source: L.draft ? L.source : 'none', data: L.draft, baseVersion: L.baseVersion, latestPublishedVersion: latest, updatedAt: null });
      }
      if (rest === 'draft' && method === 'PUT') {
        const forced = state.putFailures.shift();
        if (forced) return fail(forced.status, forced.error);
        if (json.baseVersion < latest) return fail(409, 'PAGESET_CONFLICT');
        L.draft = json.data; L.source = 'draft'; L.baseVersion = json.baseVersion;
        return ok({ baseVersion: json.baseVersion, updatedAt: '2026-09-29T12:00:00.000Z' });
      }
      if (rest === 'draft' && method === 'DELETE') {
        L.draft = L.versions[0]?.data ?? null; L.source = latest ? 'published' : 'none'; L.baseVersion = latest;
        return ok({ discarded: true });
      }
      if (rest === 'publish' && method === 'POST') {
        if (json.baseVersion < latest) return fail(409, 'PAGESET_CONFLICT');
        if (!L.draft) return fail(400, 'NO_DRAFT');
        const version = latest + 1;
        L.versions.unshift({ version, data: L.draft, createdAt: '2026-09-29T12:05:00.000Z', createdBy: { id: 1, name: 'Northbound Owner' } });
        L.baseVersion = version;
        return ok({ version, publishedAt: '2026-09-29T12:05:00.000Z' });
      }
      if (rest === 'versions' && method === 'GET') {
        return ok(L.versions.map(({ version, createdAt, createdBy }) => ({ version, createdAt, createdBy })));
      }
      if ((m = rest.match(/^versions\/(\d+)$/)) && method === 'GET') {
        const v = L.versions.find((x) => x.version === Number(m[1]));
        return v ? ok({ version: v.version, createdAt: v.createdAt, data: v.data }) : fail(404, 'Not found');
      }
      if ((m = rest.match(/^versions\/(\d+)\/restore$/)) && method === 'POST') {
        const v = L.versions.find((x) => x.version === Number(m[1]));
        const version = latest + 1;
        L.versions.unshift({ version, data: v.data, createdAt: '2026-09-29T12:10:00.000Z', createdBy: { id: 1, name: 'Northbound Owner' } });
        L.draft = v.data; L.source = 'draft'; L.baseVersion = version;
        return ok({ version });
      }
    }
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [], error: null, meta: { page: 1, limit: 20, totalItems: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false } }) });
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto(`${APP}/storefront-settings?section=pages`);
  return { browser, context, page, consoleErrors };
}

// ---------- helpers ----------
const frameOf = (page) => page.frames().find((f) => f.url().startsWith(SF));
async function until(page, fn, what, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`timed out waiting for ${what}`);
}
const received = async (page) => frameOf(page).evaluate(() => window.__received);
const loads = async (page) => (await received(page)).filter((m) => m.data.type === 'sf-builder-load');
const send = (page, msg) => frameOf(page).evaluate((m) => window.__send(m), msg);
const change = (pageSet, issues = []) => ({ type: 'sf-builder-change', pageSet, issues });
const puts = (state, layout) => state.calls.filter((c) => c.method === 'PUT' && c.path === `storefront-pages/${layout}/draft`);
const toolbar = (page) => page.getByRole('toolbar', { name: 'Page builder toolbar' });
const step = (name) => console.log(`- ${name}`);

// ---------- main admin run ----------
const state = freshState();
const { browser, page, consoleErrors } = await openApp(state);
try {
  step('S1 ready → GET draft → sf-builder-load');
  await until(page, async () => frameOf(page) && (await loads(page)).length === 1, 'first load');
  let [load] = await loads(page);
  assert.equal(load.origin, APP, 'posted with the admin origin');
  assert.equal(load.data.protocol, 1);
  assert.equal(load.data.layout, 'storefront');
  assert.equal(load.data.readOnly, false);
  assert.deepEqual(load.data.pageSet, V3);
  assert.equal(load.data.theme.template, 'modern');
  assert.equal('customCss' in load.data.theme, false, 'customCss never reaches the frame');
  assert.ok(state.calls.some((c) => c.method === 'GET' && c.path === 'storefront-pages/storefront/draft'));
  await page.screenshot({ path: `${SCRATCH}/shots/01-loaded.png`, fullPage: true });

  step('S1b sf-builder-viewport resizes the iframe element');
  const iframeWidth = () => page.locator('iframe[title="Storefront page builder"]').evaluate((el) => el.clientWidth);
  const scroller = page.locator('[data-builder-scroller]');
  const fillWidth = await iframeWidth();
  await send(page, { type: 'sf-builder-viewport', width: 360 });
  await until(page, async () => (await iframeWidth()) === 360, 'iframe 360 px wide');
  const box = await scroller.boundingBox();
  const frameBox = await page.locator('iframe[title="Storefront page builder"]').boundingBox();
  assert.ok(Math.abs((frameBox.x - box.x) - (box.x + box.width - (frameBox.x + frameBox.width))) <= 2, 'centred in the panel');
  await page.screenshot({ path: `${SCRATCH}/shots/01b-viewport-360.png` });
  await send(page, { type: 'sf-builder-viewport', width: 1280 });
  await until(page, async () => (await iframeWidth()) === 1280, 'iframe 1280 px wide');
  const { scrollW, clientW } = await scroller.evaluate((el) => ({ scrollW: el.scrollWidth, clientW: el.clientWidth }));
  if (clientW < 1280) assert.ok(scrollW >= 1280, 'narrower panel scrolls horizontally');
  await send(page, { type: 'sf-builder-viewport', width: 500 }); // not a toggle width → ignored
  await page.waitForTimeout(300);
  assert.equal(await iframeWidth(), 1280);
  await send(page, { type: 'sf-builder-viewport', width: null });
  await until(page, async () => (await iframeWidth()) === fillWidth, 'iframe back to filling the panel');
  assert.equal((await loads(page)).length, 1, 'resizing never reloads the frame');

  step('S2 baseline change is not saved; debounced edits → one PUT');
  await send(page, change(V3));
  await page.waitForTimeout(1600);
  assert.equal(puts(state, 'storefront').length, 0, 'baseline echo must not save');
  await send(page, change(EDIT1));
  await page.waitForTimeout(300);
  await send(page, change(EDIT2));
  await until(page, async () => puts(state, 'storefront').length === 1, 'debounced PUT');
  await page.waitForTimeout(1500);
  assert.equal(puts(state, 'storefront').length, 1, 'exactly one PUT for two quick edits');
  assert.deepEqual(puts(state, 'storefront')[0].json, { data: EDIT2, baseVersion: 3 });
  await toolbar(page).getByText('Saved', { exact: true }).waitFor();

  step('S3 a message not from the frame is ignored');
  await page.evaluate((ps) => window.postMessage({ type: 'sf-builder-change', pageSet: ps, issues: [] }, '*'), EDIT3);
  await page.waitForTimeout(1600);
  assert.equal(puts(state, 'storefront').length, 1);

  step('S4 issues block Publish');
  const publishBtn = toolbar(page).getByRole('button', { name: 'Publish' });
  await send(page, change(EDIT2, [{ docKey: 'catalog', rule: 'catalog.listing', message: 'Catalogue needs a product grid, list or wholesale table' }]));
  await page.getByText('Publishing is blocked until these are fixed in the editor:').waitFor();
  await page.getByText('Catalogue: Catalogue needs a product grid, list or wholesale table').waitFor();
  assert.equal(await publishBtn.isDisabled(), true);
  await send(page, change(EDIT2, []));
  await until(page, async () => !(await publishBtn.isDisabled()), 'Publish re-enabled');

  step('S5 publish with diff summary');
  await publishBtn.click();
  const pub = page.getByRole('dialog').filter({ hasText: 'Publish Storefront pages' });
  await pub.waitFor();
  await pub.getByText('Catalogue').waitFor();
  await pub.getByText('Edited').waitFor();
  await pub.getByText('About us (/pages/about)').waitFor();
  await pub.getByText('New page').waitFor();
  await page.screenshot({ path: `${SCRATCH}/shots/02-publish-dialog.png` });
  const versionGets = () => state.calls.filter((c) => c.method === 'GET' && c.path === 'storefront-pages/storefront/versions').length;
  const versionGetsBefore = versionGets();
  await pub.getByRole('button', { name: 'Publish' }).click();
  await until(page, async () => state.calls.some((c) => c.path === 'storefront-pages/storefront/publish'), 'publish POST');
  await until(page, async () => versionGets() > versionGetsBefore, 'versions refetched after publish');
  assert.deepEqual(state.calls.find((c) => c.path === 'storefront-pages/storefront/publish').json, { baseVersion: 3 });
  await page.getByText(/Published version 4\..*30 seconds/).waitFor();
  // Publishing again with no edits: nothing to publish.
  await until(page, async () => !(await publishBtn.isDisabled()), 'Publish enabled after publish');
  await publishBtn.click();
  await pub.getByText('Nothing has changed since version 4.').waitFor();
  assert.equal(await pub.getByRole('button', { name: 'Publish' }).isDisabled(), true);
  await pub.getByRole('button', { name: 'Cancel' }).click();

  step('S6 versions drawer: preview read-only, back to draft, restore');
  await toolbar(page).getByRole('button', { name: 'Versions' }).click();
  const drawer = page.getByRole('dialog', { name: 'Published versions · Storefront' });
  await drawer.getByText('Version 4').waitFor();
  await drawer.getByText('Version 3').waitFor();
  await page.screenshot({ path: `${SCRATCH}/shots/03-versions.png` });
  const loadsBefore = (await loads(page)).length;
  await drawer.getByRole('button', { name: 'Preview version 3' }).click();
  await until(page, async () => (await loads(page)).length === loadsBefore + 1, 'preview load');
  load = (await loads(page)).at(-1);
  assert.equal(load.data.readOnly, true);
  assert.deepEqual(load.data.pageSet, V3);
  await page.getByText('Previewing version 3 (read-only)').waitFor();
  const putsBeforePreview = puts(state, 'storefront').length;
  await send(page, change(EDIT3));
  await page.waitForTimeout(1600);
  assert.equal(puts(state, 'storefront').length, putsBeforePreview, 'nothing saved while previewing');
  await page.getByRole('button', { name: 'Back to draft' }).click();
  await until(page, async () => (await loads(page)).at(-1).data.readOnly === false, 'back to draft');
  assert.deepEqual((await loads(page)).at(-1).data.pageSet, EDIT2);
  await send(page, change(EDIT2)); // baseline echo
  await toolbar(page).getByRole('button', { name: 'Versions' }).click();
  await drawer.getByRole('button', { name: 'Restore version 3' }).click();
  const restoreConfirm = page.getByRole('dialog').filter({ hasText: 'Restore version 3?' });
  await restoreConfirm.getByRole('button', { name: 'Restore' }).click();
  await until(page, async () => state.calls.some((c) => c.path === 'storefront-pages/storefront/versions/3/restore'), 'restore POST');
  await page.getByText(/Version 3 restored as version 5/).waitFor();
  await until(page, async () => { const l = (await loads(page)).at(-1).data; return l.readOnly === false && JSON.stringify(l.pageSet) === JSON.stringify(V3); }, 'reload after restore');
  await send(page, change(V3)); // baseline echo

  step('S7 409 banner stops autosave; Reload recovers');
  state.putFailures.push({ status: 409, error: 'PAGESET_CONFLICT' });
  const putsBeforeConflict = puts(state, 'storefront').length;
  await send(page, change(EDIT1));
  await page.getByText(/Someone published since you opened this/).waitFor();
  await toolbar(page).getByText('Autosave paused').waitFor();
  assert.equal(await publishBtn.isDisabled(), true);
  await send(page, change(EDIT2));
  await page.waitForTimeout(2000);
  assert.equal(puts(state, 'storefront').length, putsBeforeConflict + 1, 'no PUT after the 409');
  await page.screenshot({ path: `${SCRATCH}/shots/04-conflict.png` });
  const loadsBeforeReload = (await loads(page)).length;
  await page.getByRole('button', { name: 'Reload' }).click();
  await until(page, async () => (await loads(page)).length === loadsBeforeReload + 1, 'reload load');
  assert.equal(await page.getByText(/Someone published since you opened this/).count(), 0);
  await send(page, change(V3)); // baseline echo

  step('S7b non-conflict failure: Error chip, no retry loop, next edit retries');
  state.putFailures.push({ status: 500, error: 'Internal server error' });
  const putsBeforeError = puts(state, 'storefront').length;
  await send(page, change(EDIT1));
  await toolbar(page).getByText('Error', { exact: true }).waitFor();
  await page.getByText(/Couldn’t save: Internal server error/).waitFor();
  await page.waitForTimeout(2500);
  assert.equal(puts(state, 'storefront').length, putsBeforeError + 1, 'no automatic retry');
  await send(page, change(EDIT2));
  await until(page, async () => puts(state, 'storefront').length === putsBeforeError + 2, 'retry on next edit');
  await toolbar(page).getByText('Saved', { exact: true }).waitFor();

  step('S8 uploads: valid → POST media → url; invalid → error, no POST');
  await frameOf(page).evaluate(() => window.__upload('req-1', 'image/png', 4));
  await until(page, async () => (await received(page)).some((m) => m.data.type === 'sf-builder-upload-result' && m.data.requestId === 'req-1'), 'upload result 1');
  let res = (await received(page)).find((m) => m.data.requestId === 'req-1').data;
  assert.match(res.url, /^\/media\/storefront-pages\/media\/[a-f0-9]{32}\.png$/);
  assert.equal(res.error, null);
  assert.equal(state.uploads, 1);
  await frameOf(page).evaluate(() => window.__upload('req-2', 'text/plain', 4));
  await until(page, async () => (await received(page)).some((m) => m.data.requestId === 'req-2'), 'upload result 2');
  res = (await received(page)).find((m) => m.data.requestId === 'req-2').data;
  assert.equal(res.url, null);
  assert.match(res.error, /PNG, JPEG, WebP or GIF/);
  assert.equal(state.uploads, 1, 'invalid file never uploaded');
  state.mediaFailure = 'File is not a valid image';
  await frameOf(page).evaluate(() => window.__upload('req-3', 'image/png', 4));
  await until(page, async () => (await received(page)).some((m) => m.data.requestId === 'req-3'), 'upload result 3');
  res = (await received(page)).find((m) => m.data.requestId === 'req-3').data;
  assert.equal(res.url, null);
  assert.equal(res.error, 'File is not a valid image', 'backend 422 message forwarded to the frame');
  state.mediaFailure = null;

  step('S9 layout switch flushes first; a stale message never crosses layouts');
  const putsBeforeSwitch = puts(state, 'storefront').length;
  await send(page, change(EDIT3));
  await page.getByRole('radio', { name: /^Menu/ }).click();
  await until(page, async () => (await loads(page)).at(-1).data.layout === 'menu', 'menu load');
  assert.equal(puts(state, 'storefront').length, putsBeforeSwitch + 1, 'storefront edit flushed before switching');
  assert.deepEqual(puts(state, 'storefront').at(-1).json.data, EDIT3);
  assert.equal((await loads(page)).at(-1).data.pageSet, null, 'menu has no set yet');
  await send(page, change(EDIT3));        // stale echo from the storefront doc
  await send(page, change(MENU_DEFAULT)); // the menu doc's own first change
  await page.waitForTimeout(1600);
  for (const p of puts(state, 'menu')) assert.deepEqual(p.json.data, MENU_DEFAULT, 'storefront content never written to menu');
  assert.equal(await page.getByRole('radio', { name: /^Storefront.*live for browsers/ }).count(), 1, 'live layout is marked');
  await page.getByRole('radio', { name: /^Storefront/ }).click();
  await until(page, async () => (await loads(page)).at(-1).data.layout === 'storefront', 'back to storefront');
  await send(page, change((await loads(page)).at(-1).data.pageSet)); // baseline echo

  step('S10 discard draft');
  await toolbar(page).getByRole('button', { name: 'Discard draft' }).click();
  await page.getByRole('dialog').filter({ hasText: 'Discard draft?' }).getByRole('button', { name: 'Discard draft' }).click();
  await until(page, async () => state.calls.some((c) => c.method === 'DELETE' && c.path === 'storefront-pages/storefront/draft'), 'DELETE draft');
  await page.getByText('Draft discarded').waitFor();
  assert.deepEqual((await loads(page)).at(-1).data.pageSet, state.layouts.storefront.versions[0].data, 'reloaded the live version');

  step('S13 closing mid-debounce warns (beforeunload)');
  await send(page, change((await loads(page)).at(-1).data.pageSet)); // baseline echo
  await send(page, change(EDIT1));
  let sawBeforeUnload = false;
  page.on('dialog', async (d) => { if (d.type() === 'beforeunload') sawBeforeUnload = true; await d.dismiss(); });
  await page.close({ runBeforeUnload: true });
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(sawBeforeUnload, true, 'beforeunload prompt while a save is pending');

  assert.deepEqual(consoleErrors, [], 'no uncaught page errors');
} finally {
  await browser.close();
}

// ---------- S11 not deployed ----------
{
  step('S11 no storefront deployed → empty state, no frame');
  const s = freshState({ baseUrl: null });
  const { browser: b, page: p } = await openApp(s);
  try {
    await p.getByText('Deploy the storefront first').waitFor();
    assert.equal(await p.locator('iframe').count(), 0);
    await p.screenshot({ path: `${SCRATCH}/shots/05-not-deployed.png` });
  } finally { await b.close(); }
}

// ---------- S12 non-admin ----------
{
  step('S12 staff never sees Pages');
  const s = freshState({ role: 'staff' });
  const { browser: b, page: p } = await openApp(s);
  try {
    await until(p, async () => !p.url().includes('section=pages'), 'section tidied to General', 8000);
    assert.equal(await p.locator('iframe').count(), 0);
    assert.equal(s.calls.some((c) => c.path.startsWith('storefront-pages/')), false, 'no storefront-pages calls');
  } finally { await b.close(); }
}

console.log('PAGES PASS OK');
```

- [ ] **Step 4: Run it**

Run: `node "$SCRATCH/pages-pass.mjs"`
Expected: each `- S…` line prints, then `PAGES PASS OK`.

On failure:
- Read the screenshot and the failing assertion.
- Fix the **product code** in the owning task's file, never the scenario's expectation, unless the expectation contradicts this plan's Global Constraints.
- Re-run that task's build + lint gate, then re-run the pass.

Also check these Playwright quirks before blaming the code:
- Seeded `auth_user` needs `name` and `updatedAt`, and `/account/me` needs `permissions.modules` (memory `env-playwright-mocked-admin-pass`).
- If the rail renders icon-only, keep the 1440 px viewport.

- [ ] **Step 5: Look at the screenshots**

Open `$SCRATCH/shots/01-loaded.png` through `05-not-deployed.png` with the Read tool. Check all of the following:
- The toolbar fits on one row at 1440 px.
- The frame fills the remaining height.
- Banners don't overlap the frame.
- The publish dialog lists groups with counts.
- The drawer rows show the date and author.
- Nothing overflows horizontally.

Fix any layout defect in the owning file, re-gate, and re-run.

- [ ] **Step 6: Final gates and cleanup**

```bash
cd /t/Projects/ecommerce/.worktrees/puck-builder/ecommerce-admin-frontend
node "$SCRATCH/protocol.check.ts" && node "$SCRATCH/autosaver.check.ts"
npm run build 2>&1 | tail -3
node "$SCRATCH/lint-gate.mjs" storefront-settings/pages/ storefront-settings/sections.ts storefront-settings/StorefrontSettingsPage.tsx types/storefront-pages.ts api/storefront-pages.ts
netstat -ano | grep ':5199' | grep LISTENING   # note the PID
taskkill //PID <pid> //F //T                   # stop the background Vite
git status --short                             # only " M .env" (and nothing untracked from this plan)
```

Expected: both checks print OK; build succeeds; `LINT GATE OK`; Vite stopped; clean tree.

- [ ] **Step 7: Report**

Report the lint baseline and final totals, the pass output, and the screenshot paths. Also list the pending manual steps, which are **not** done in this plan:
- Run the tab against a real backend (Plan 1) and a deployed storefront v0.7.0 (Plans 2–3).
- Test a real image upload through the Worker's `/media/storefront-pages/media/*` rule.
- Receive a live `storefront-pages:published` socket event.
- Deploy order: backend → storefront → admin.
