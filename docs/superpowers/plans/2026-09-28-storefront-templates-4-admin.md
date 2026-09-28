# Storefront Templates — Plan 4: Admin SPA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin SPA's storefront `ThemeCard` with a template editor: pick a template and preset, customise within the template's locks, set template options, and watch a live iframe preview of the real storefront. All of it saves as one `theme` object.

**Architecture:**
- All decision logic goes in one plain TypeScript module, `template-form.ts`: preset → form mapping, lock enforcement, option coercion, "would this switch lose edits", payload and preview-message building, URL resolution. It is React-free and checked by a scratch `node` assertion script, since the repo has no test runner.
- The UI is one react-hook-form form (`ThemeEditor.tsx`) owning four presentational pieces: `TemplateCard`, `CustomiseCard`, `TemplateOptionsCard`, `LivePreview`.
- The template catalog comes from the new backend endpoint `GET /storefront-settings/templates`, with a local modern-only fallback when that call fails.

**Tech Stack:** React 19, react-hook-form 7, zod 4, @tanstack/react-query 5, ky (via `@/lib/api-client.ts`), Tailwind v4, lucide-react. Node 22.19 built-in type stripping for the scratch checks. Playwright MCP for the mocked browser pass.

**Spec:** `ecommerce-storefront/docs/superpowers/specs/2026-09-28-storefront-templates-design.md`. This plan implements §3 and consumes the contracts in §1.4, §1.9, §1.10 and §2.1–§2.3. Read the spec's Decisions list before starting.

## Global Constraints

- Repo: `T:\Projects\ecommerce\ecommerce-admin-frontend`. Run every `npm` command from there.
- Branch: `feature/storefront-templates`, created from `main`. The working tree has an unrelated uncommitted `.env` change. **Never stage `.env`**; always `git add` explicit paths, never `git add -A` / `git add .`.
- Another session may commit in the same tree (see memory `env-shared-worktree-concurrent-sessions`). Run `git status --short` before each commit and stage only this task's files.
- **UI tasks (3, 4, 5) are implemented by a frontend-design subagent** (user preference: all frontend changes go to a frontend-design subagent). The subagent gets the task text verbatim plus this Global Constraints section. Code in those tasks is the functional contract; the subagent may refine markup and styling but must keep every prop, handler, data flow and accessibility attribute shown.
- Imports use the `@/` alias with explicit `.ts`/`.tsx` extensions (`from '@/api/storefront-settings.ts'`). No relative `../../` imports. Sibling files in the same feature folder use `./X.tsx`, matching the existing storefront-settings files.
- Reuse the `src/components/ui/` primitives: `Card`, `Button` (variants `primary | secondary | ghost | danger`, sizes `sm | md | lg`), `Select`, `Input`, `Textarea`, `ColorPicker`, `Badge`, `ConfirmDialog`, `Spinner`, and the feature-local `ui/CardHeader.tsx` and `ui/SwitchRow.tsx`. Don't build raw-Tailwind replacements for these.
- Copy in `src/features/storefront-settings/` is literal English (no `useTranslation`); keep it that way. `npm run build` runs `scripts/check-locale-parity.mjs`, and this plan adds no locale keys.
- **Never put the `disabled` attribute on a react-hook-form registered input or a `Controller` field to express a template lock.** RHF drops disabled fields' values on submit (they become `undefined`), which fails zod. Locked fields render as the read-only `LockedField` display instead (Task 3). This read-only rendering is spec amendment 14 (ruling F2), which supersedes §3.2's "disabled". The existing `<fieldset disabled={!canWrite}>` for read-only users is fine, because those users have no Save button.
- Writes are gated by `useCan()('storefront', 'write')`, exactly as `ThemeCard` does today. Read-only users see everything, including the live preview, but can't change the template, preset or fields, or save.
- Theme fields added by the spec: `template: string` (slug, default `'modern'`), `preset: string | null`, `options: Record<string, boolean | string>`. Older backends omit them, so the read type marks them optional and `toForm` defaults them.
- Preview message (spec §1.10): `{ type: 'sf-preview-theme', theme }`, where `theme` **never has a `customCss` key**. Readiness message from the storefront: `{ type: 'sf-preview-ready' }`. Post with `targetOrigin` = the preview origin, never `'*'`. Debounce 150 ms.
- Preview iframe URL: `{baseUrl}/?sf-preview=1`. Phone preview width is 390 px.
- Lint is a **regression gate**, not a clean-run gate. `npm run lint` already fails on `main` (memory `env-spa-lint-baseline`). Record the baseline in Task 1. Every later task must leave the repo-wide total unchanged and add zero problems in files it touched.
- Commit messages end with a blank line and then `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Deploy order: this admin change ships **last**, after the backend (Plan 2) and a storefront release (Plan 1/3). If it ships early, the catalog call 404s and the editor falls back to modern only, which is by design.
- Scratch files (check script, Playwright script) are never committed. Paths:
  - checks: `C:\Users\Nobody\AppData\Local\Temp\claude\T--Projects-ecommerce\79c355d8-ae38-4045-94ce-9a1793c21c60\scratchpad\admin-templates\template-form.check.ts`
  - Playwright script: `T:\Projects\ecommerce\.playwright-mcp\admin-templates.js` (the only allowed root for Playwright MCP scripts besides the workspace).

## Review Focus

1. **Theme saved by an older backend** has no `template`/`preset`/`options`. The editor must open it as Modern with the stored colours intact, and the first save must write the three fields. Pinned in Task 2 (`toForm` check) and Task 6 (mock with an old-shape theme).
2. **Catalog endpoint missing or failing** (admin deployed before the backend, or 500). The editor must still load, with Modern only and the "built-in only" note, rather than spinning forever or erroring. Pinned in Task 2 (`FALLBACK_CATALOG` check) and Task 6 (route returns 404).
3. **Stale stored preset or options after a template update**: preset id removed, option key removed, option value of the wrong type, select value no longer in choices. Locks must fall back to `defaultPreset`, options coerce to defaults, and the save payload carries only the template's current option keys. Pinned in Task 2 (`findPreset` / `resolveOptions` / `toThemePayload` checks).
4. **Stored template not in the catalog** (an import removed from the lock file). The editor shows "Unavailable — storefront is showing Modern", keeps every field editable with no locks, and doesn't rewrite the stored id until the admin picks another template. When the catalog itself is the fallback (`catalog.source === 'fallback'`: the catalog call failed, or the backend had no catalog), the storefront may well be rendering that template, so the alert says "Template catalog unavailable — can't show this template's options; saving keeps it" instead (pre-flight ruling F1). Pinned in Task 2 (`locksFor(null)`, `enforceLocks` with a null template) and Task 6 (scenarios 2b and 5).
5. **Preview messaging edge cases**: a `sf-preview-ready` from another origin or window must be ignored; navigating inside the iframe (a new ready) must re-send the current draft; an invalid or `javascript:` `baseUrl` must give the swatch fallback, not an iframe. Pinned in Task 2 (`previewTarget`, `isPreviewReady` checks) and Task 6 (in-iframe navigation re-post).

---

### Task 1: Branch, baselines, types, API function

**Files:**
- Modify: `src/types/storefront-settings.ts` (extend `StorefrontTheme`, add catalog types)
- Modify: `src/api/storefront-settings.ts` (add `getStorefrontTemplates`, a `templates` query key)

**Interfaces:**
- Produces (types, all exported from `@/types/storefront-settings.ts`):
  ```ts
  export type StorefrontThemeScheme = 'dark' | 'light';
  export type StorefrontThemeRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl';
  export type StorefrontThemeDensity = 'comfortable' | 'compact';
  export type StorefrontThemeOptions = Record<string, boolean | string>;
  export interface StorefrontTheme {
    template?: string; preset?: string | null; options?: StorefrontThemeOptions;
    scheme: StorefrontThemeScheme; colors: Record<StorefrontThemeColorKey, string>;
    fonts: { heading: string | null; body: string | null; mono: string | null };
    radius: StorefrontThemeRadius; density: StorefrontThemeDensity; customCss: string;
  }
  export interface StorefrontTemplateFontSpec { family: string; weights: number[] }
  export interface StorefrontTemplatePreset { id: string; name: string; scheme: StorefrontThemeScheme; colors: Record<StorefrontThemeColorKey, string>; fonts: { heading: StorefrontTemplateFontSpec | null; body: StorefrontTemplateFontSpec | null; mono: StorefrontTemplateFontSpec | null }; radius: StorefrontThemeRadius }
  export type StorefrontTemplateOption = …   // union, see Step 3
  export interface StorefrontTemplateEditable { colors: StorefrontThemeColorKey[]; fonts: boolean; radius: boolean; density: boolean }
  export interface StorefrontCatalogTemplate { id; name; version; description; author; schemes; presets; defaultPreset; editable; options; preview?: string | null; builtIn: boolean }
  export type StorefrontTemplateCatalogSource = 'deployed' | 'live' | 'fallback';
  export interface StorefrontTemplateCatalog { source: StorefrontTemplateCatalogSource; tag: string | null; baseUrl: string | null; templates: StorefrontCatalogTemplate[] }
  ```
- Produces (API): `getStorefrontTemplates(): Promise<StorefrontTemplateCatalog>` and `storefrontSettingsKeys.templates(): readonly ['storefront-settings', 'templates']`.

- [ ] **Step 1: Create the branch and record baselines**

```bash
cd /t/Projects/ecommerce/ecommerce-admin-frontend
git status --short          # expect only " M .env"
git checkout main && git checkout -b feature/storefront-templates
npm run build 2>&1 | tail -3   # must succeed on the untouched branch
npx eslint . -f json -o /c/Users/Nobody/AppData/Local/Temp/claude/T--Projects-ecommerce/79c355d8-ae38-4045-94ce-9a1793c21c60/scratchpad/admin-templates/lint-baseline.json; \
node -e "const r=require('C:/Users/Nobody/AppData/Local/Temp/claude/T--Projects-ecommerce/79c355d8-ae38-4045-94ce-9a1793c21c60/scratchpad/admin-templates/lint-baseline.json');let e=0,w=0;for(const f of r){e+=f.errorCount;w+=f.warningCount}console.log('BASELINE errors',e,'warnings',w)"
```

Write the printed `BASELINE errors N warnings M` into the task report; later tasks compare against it. (Create the `admin-templates` scratch folder first with `mkdir -p` if eslint complains that the output directory is missing.)

- [ ] **Step 2: Add a reusable lint-gate command**

Every later task runs the same comparison. Save it as the scratch file `C:\Users\Nobody\AppData\Local\Temp\claude\T--Projects-ecommerce\79c355d8-ae38-4045-94ce-9a1793c21c60\scratchpad\admin-templates\lint-gate.mjs`:

```js
// Usage: node lint-gate.mjs <file-substring> [<file-substring> ...]
// Compares a fresh eslint run with lint-baseline.json: repo totals must not grow,
// and files matching any substring must report zero problems.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const dir = 'C:/Users/Nobody/AppData/Local/Temp/claude/T--Projects-ecommerce/79c355d8-ae38-4045-94ce-9a1793c21c60/scratchpad/admin-templates';
const base = JSON.parse(readFileSync(`${dir}/lint-baseline.json`, 'utf8'));
let out;
try { out = execSync('npx eslint . -f json', { cwd: 'T:/Projects/ecommerce/ecommerce-admin-frontend', maxBuffer: 64 << 20 }).toString(); }
catch (e) { out = e.stdout.toString(); }
const now = JSON.parse(out);
const sum = (r) => r.reduce((a, f) => [a[0] + f.errorCount, a[1] + f.warningCount], [0, 0]);
const [be, bw] = sum(base), [ne, nw] = sum(now);
const touched = now.filter((f) => process.argv.slice(2).some((s) => f.filePath.replace(/\\/g, '/').includes(s)) && f.messages.length > 0);
console.log(`baseline ${be}e/${bw}w  now ${ne}e/${nw}w`);
for (const f of touched) for (const m of f.messages) console.log(`${f.filePath}:${m.line} ${m.ruleId} ${m.message}`);
if (ne > be || nw > bw || touched.length > 0) { console.error('LINT GATE FAILED'); process.exit(1); }
console.log('LINT GATE OK');
```

- [ ] **Step 3: Extend the types**

In `src/types/storefront-settings.ts`, replace the `StorefrontTheme` interface (currently at the end of the file) with:

```ts
export type StorefrontThemeScheme = 'dark' | 'light';
export type StorefrontThemeRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl';
export type StorefrontThemeDensity = 'comfortable' | 'compact';
/** Template-specific knobs; keys and value types come from the template's manifest `options[]`. */
export type StorefrontThemeOptions = Record<string, boolean | string>;

export interface StorefrontTheme {
  /** Template id (slug). Absent on themes saved by a backend older than the template system → 'modern'. */
  template?: string;
  /** Preset id within the template; null/absent → the template's defaultPreset. */
  preset?: string | null;
  options?: StorefrontThemeOptions;
  scheme: StorefrontThemeScheme;
  colors: Record<StorefrontThemeColorKey, string>;
  /** Google Fonts family names; null = system stack */
  fonts: { heading: string | null; body: string | null; mono: string | null };
  radius: StorefrontThemeRadius;
  density: StorefrontThemeDensity;
  customCss: string;
}

/** A template font: family plus the weights the storefront requests from Google Fonts. */
export interface StorefrontTemplateFontSpec {
  family: string;
  weights: number[];
}

export interface StorefrontTemplatePreset {
  id: string;
  name: string;
  scheme: StorefrontThemeScheme;
  colors: Record<StorefrontThemeColorKey, string>;
  fonts: { heading: StorefrontTemplateFontSpec | null; body: StorefrontTemplateFontSpec | null; mono: StorefrontTemplateFontSpec | null };
  radius: StorefrontThemeRadius;
}

export type StorefrontTemplateOption =
  | { key: string; type: 'boolean'; label: string; help?: string; default: boolean }
  | { key: string; type: 'select'; label: string; help?: string; default: string; choices: { value: string; label: string }[] }
  | { key: string; type: 'text'; label: string; help?: string; default: string; maxLength: number };

/** Which theme fields the admin may change while this template is active. */
export interface StorefrontTemplateEditable {
  colors: StorefrontThemeColorKey[];
  fonts: boolean;
  radius: boolean;
  density: boolean;
}

/** One entry of the storefront's templates.json (spec §1.9), as served by the backend catalog endpoint. */
export interface StorefrontCatalogTemplate {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  schemes: StorefrontThemeScheme[];
  presets: StorefrontTemplatePreset[];
  defaultPreset: string;
  editable: StorefrontTemplateEditable;
  options: StorefrontTemplateOption[];
  /** Path relative to the storefront origin (or absolute URL); absent/null → generated swatch thumbnail. */
  preview?: string | null;
  builtIn: boolean;
}

export type StorefrontTemplateCatalogSource = 'deployed' | 'live' | 'fallback';

export interface StorefrontTemplateCatalog {
  source: StorefrontTemplateCatalogSource;
  /** Storefront release tag the catalog was captured from; null for live/fallback. */
  tag: string | null;
  /** Storefront origin used for preview images and the preview iframe; null → no live preview. */
  baseUrl: string | null;
  templates: StorefrontCatalogTemplate[];
}
```

- [ ] **Step 4: Add the API function and query key**

In `src/api/storefront-settings.ts`, add `StorefrontTemplateCatalog` to the type import list, then add after `updateStorefrontSettings`:

```ts
export async function getStorefrontTemplates() {
  return unwrapResponse<StorefrontTemplateCatalog>(api.get('storefront-settings/templates'));
}
```

and extend the keys object:

```ts
export const storefrontSettingsKeys = {
  all: ['storefront-settings'] as const,
  whatsapp: () => ['storefront-settings', 'whatsapp'] as const,
  templates: () => ['storefront-settings', 'templates'] as const,
};
```

`templates()` sits under the `all` prefix, so the existing `invalidateQueries({ queryKey: storefrontSettingsKeys.all })` after any settings save also refetches the catalog. That's intended and cheap.

- [ ] **Step 5: Build and lint gate**

Run: `npm run build 2>&1 | tail -5`
Expected: success. `ThemeCard.tsx` still compiles: its `toForm` spreads `StorefrontTheme` into a form type without the new optional keys, and the extra optional keys are assignable.

Run: `node <scratch>/admin-templates/lint-gate.mjs src/types/storefront-settings.ts src/api/storefront-settings.ts`
Expected: `LINT GATE OK`.

- [ ] **Step 6: Commit**

```bash
git status --short
git add src/types/storefront-settings.ts src/api/storefront-settings.ts
git commit -m "feat(storefront): template catalog types and API client

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `template-form.ts`, the editor's pure logic

**Files:**
- Create: `src/features/storefront-settings/template-form.ts`
- Scratch (not committed): `<scratch>/admin-templates/template-form.check.ts`

**Interfaces:**
- Consumes: the Task 1 types.
- Produces (all exported from `@/features/storefront-settings/template-form.ts`):
  ```ts
  export const THEME_COLOR_KEYS: readonly StorefrontThemeColorKey[];
  export const FONT_KEYS: readonly ['heading', 'body', 'mono'];
  export const FALLBACK_CATALOG: StorefrontTemplateCatalog;
  export interface ThemeFormData { template: string; preset: string | null; options: StorefrontThemeOptions; scheme; colors; fonts: { heading: string; body: string; mono: string }; radius; density; customCss: string }
  export interface ThemeLocks { colors: ReadonlySet<StorefrontThemeColorKey>; fonts: boolean; radius: boolean; density: boolean; schemes: readonly StorefrontThemeScheme[] }
  export type PreviewTheme = Omit<StorefrontTheme, 'customCss'> & { template: string; preset: string | null; options: StorefrontThemeOptions };
  export interface PreviewMessage { type: 'sf-preview-theme'; theme: PreviewTheme }
  export interface PreviewTarget { origin: string; src: string }
  export function toForm(theme: StorefrontTheme): ThemeFormData;
  export function findTemplate(catalog: StorefrontTemplateCatalog | undefined, id: string): StorefrontCatalogTemplate | null;
  export function findPreset(template: StorefrontCatalogTemplate, presetId: string | null): StorefrontTemplatePreset;
  export function defaultOptions(template: StorefrontCatalogTemplate): StorefrontThemeOptions;
  export function resolveOptions(template: StorefrontCatalogTemplate, stored: StorefrontThemeOptions | undefined): StorefrontThemeOptions;
  export function applyPreset(form: ThemeFormData, template: StorefrontCatalogTemplate, preset: StorefrontTemplatePreset): ThemeFormData;
  export function resetToPreset(form: ThemeFormData, template: StorefrontCatalogTemplate): ThemeFormData;
  export function locksFor(template: StorefrontCatalogTemplate | null): ThemeLocks;
  export function enforceLocks(form: ThemeFormData, template: StorefrontCatalogTemplate | null): ThemeFormData;
  export function differsFromPreset(form: ThemeFormData, template: StorefrontCatalogTemplate | null): boolean;
  export function toThemePayload(form: ThemeFormData, template: StorefrontCatalogTemplate | null): StorefrontTheme;
  export function buildPreviewMessage(form: ThemeFormData, template: StorefrontCatalogTemplate | null): PreviewMessage;
  export function isPreviewReady(data: unknown): boolean;
  export function previewTarget(baseUrl: string | null): PreviewTarget | null;
  export function assetUrl(baseUrl: string | null, path: string | null | undefined): string | null;
  ```

**Module rule:** this file uses only `import type` (so Node's type stripping can run it without the `@/` alias) and only erasable TypeScript syntax (the repo's tsconfig already sets `erasableSyntaxOnly`). No React, no runtime imports.

- [ ] **Step 1: Write the failing check script**

Create `<scratch>/admin-templates/template-form.check.ts`:

```ts
import assert from 'node:assert/strict';
import * as tf from 'file:///T:/Projects/ecommerce/ecommerce-admin-frontend/src/features/storefront-settings/template-form.ts';

const COLORS = { primary: '#d4ff00', bg: '#0d0d0d', surface: '#1a1a1a', text: '#ffffff', muted: '#888888', success: '#00ff88', warn: '#ffaa00', danger: '#ff3355' };
const LIGHT = { ...COLORS, primary: '#6b3ff6', bg: '#f4f4ee', surface: '#e8e8e2', text: '#111111' };
const brutal = {
  id: 'cyber-brutalism', name: 'Cyber Brutalism', version: '1.0.0', description: '', author: '', builtIn: true,
  schemes: ['dark', 'light'], defaultPreset: 'acid-dark',
  presets: [
    { id: 'acid-dark', name: 'Acid Dark', scheme: 'dark', colors: COLORS, radius: 'none',
      fonts: { heading: { family: 'Tektur', weights: [400, 700] }, body: { family: 'Tektur', weights: [400] }, mono: { family: 'Share Tech Mono', weights: [400] } } },
    { id: 'purple-light', name: 'Purple Light', scheme: 'light', colors: LIGHT, radius: 'none',
      fonts: { heading: { family: 'Tektur', weights: [400, 700] }, body: { family: 'Tektur', weights: [400] }, mono: { family: 'Share Tech Mono', weights: [400] } } },
  ],
  editable: { colors: ['primary', 'bg', 'surface', 'text', 'muted', 'success', 'warn', 'danger'], fonts: false, radius: false, density: true },
  options: [
    { key: 'systemBar', type: 'boolean', label: 'System bar', default: true },
    { key: 'nodeLabel', type: 'text', label: 'Node label', default: 'NODE_01', maxLength: 24 },
    { key: 'mode', type: 'select', label: 'Mode', default: 'a', choices: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
  ],
};
const catalog = { source: 'deployed', tag: 'v0.4.0', baseUrl: 'https://shop.example.com', templates: [brutal] };

// Review Focus 1 — old-shape theme opens as modern with colours intact
const old = tf.toForm({ scheme: 'dark', colors: COLORS, fonts: { heading: null, body: 'Inter', mono: null }, radius: 'sm', density: 'compact', customCss: 'a{}' } as never);
assert.equal(old.template, 'modern'); assert.equal(old.preset, null); assert.deepEqual(old.options, {});
assert.deepEqual(old.fonts, { heading: '', body: 'Inter', mono: '' }); assert.equal(old.colors.bg, '#0d0d0d');

// Review Focus 2 — fallback catalog is modern-only, no preview
assert.equal(tf.FALLBACK_CATALOG.source, 'fallback'); assert.equal(tf.FALLBACK_CATALOG.baseUrl, null);
assert.deepEqual(tf.FALLBACK_CATALOG.templates.map((t) => t.id), ['modern']);
assert.equal(tf.FALLBACK_CATALOG.templates[0]!.presets[0]!.colors.bg, '#0f3965');

// findTemplate / findPreset (Review Focus 3: stale preset → defaultPreset)
assert.equal(tf.findTemplate(catalog as never, 'cyber-brutalism')?.id, 'cyber-brutalism');
assert.equal(tf.findTemplate(catalog as never, 'gone'), null);
assert.equal(tf.findTemplate(undefined, 'modern'), null);
assert.equal(tf.findPreset(brutal as never, 'purple-light').id, 'purple-light');
assert.equal(tf.findPreset(brutal as never, 'removed').id, 'acid-dark');
assert.equal(tf.findPreset(brutal as never, null).id, 'acid-dark');

// options (Review Focus 3: stale keys dropped, wrong types → default, bad select → default,
// over-long text → default — same as the storefront's resolveOptions in web/src/templates/resolve.ts; ruling F3)
assert.deepEqual(tf.defaultOptions(brutal as never), { systemBar: true, nodeLabel: 'NODE_01', mode: 'a' });
assert.deepEqual(
  tf.resolveOptions(brutal as never, { systemBar: 'yes', nodeLabel: 'X'.repeat(40), mode: 'zzz', legacy: true }),
  { systemBar: true, nodeLabel: 'NODE_01', mode: 'a' },
);
assert.equal(tf.resolveOptions(brutal as never, { nodeLabel: 'X'.repeat(24) }).nodeLabel, 'X'.repeat(24)); // exactly maxLength is kept
assert.deepEqual(tf.resolveOptions(brutal as never, { systemBar: false, mode: 'b' }), { systemBar: false, nodeLabel: 'NODE_01', mode: 'b' });

// applyPreset copies preset values, maps FontSpec → family string, resets options, keeps density + customCss
const applied = tf.applyPreset(old, brutal as never, brutal.presets[1] as never);
assert.equal(applied.template, 'cyber-brutalism'); assert.equal(applied.preset, 'purple-light');
assert.equal(applied.scheme, 'light'); assert.equal(applied.colors.bg, '#f4f4ee'); assert.equal(applied.radius, 'none');
assert.deepEqual(applied.fonts, { heading: 'Tektur', body: 'Tektur', mono: 'Share Tech Mono' });
assert.deepEqual(applied.options, { systemBar: true, nodeLabel: 'NODE_01', mode: 'a' });
assert.equal(applied.density, 'compact'); assert.equal(applied.customCss, 'a{}');

// resetToPreset keeps options
const tweaked = { ...applied, colors: { ...applied.colors, primary: '#123456' }, options: { ...applied.options, systemBar: false } };
const reset = tf.resetToPreset(tweaked, brutal as never);
assert.equal(reset.colors.primary, '#6b3ff6'); assert.equal(reset.options.systemBar, false);

// locks (Review Focus 4: null template → nothing locked)
const locks = tf.locksFor(brutal as never);
assert.equal(locks.fonts, true); assert.equal(locks.radius, true); assert.equal(locks.density, false); assert.equal(locks.colors.size, 0);
const none = tf.locksFor(null);
assert.equal(none.fonts, false); assert.equal(none.radius, false); assert.deepEqual([...none.schemes], ['dark', 'light']);

// enforceLocks: locked fields replaced by the preset's values; editable untouched; null template → unchanged
const broken = { ...applied, radius: 'lg' as const, fonts: { heading: 'Comic Neue', body: '', mono: '' }, colors: { ...applied.colors, primary: '#abcdef' } };
const enforced = tf.enforceLocks(broken, brutal as never);
assert.equal(enforced.radius, 'none'); assert.equal(enforced.fonts.heading, 'Tektur'); assert.equal(enforced.colors.primary, '#abcdef');
assert.deepEqual(tf.enforceLocks(broken, null), broken);
const staleMode = tf.enforceLocks({ ...applied, preset: 'removed' }, brutal as never);
assert.equal(staleMode.preset, 'acid-dark');

// differsFromPreset drives the confirm dialog
assert.equal(tf.differsFromPreset(applied, brutal as never), false);
assert.equal(tf.differsFromPreset({ ...applied, colors: { ...applied.colors, primary: '#6B3FF6' } }, brutal as never), false); // case-insensitive hex
assert.equal(tf.differsFromPreset(tweaked, brutal as never), true);
assert.equal(tf.differsFromPreset({ ...applied, density: 'comfortable', customCss: 'b{}' }, brutal as never), false); // kept across switches
assert.equal(tf.differsFromPreset(applied, null), true);

// payload: trims fonts to null, only current option keys (Review Focus 3), always writes the three new fields
const payload = tf.toThemePayload({ ...applied, fonts: { heading: ' Tektur ', body: '', mono: 'Share Tech Mono' }, options: { ...applied.options, legacy: true } }, brutal as never);
assert.deepEqual(payload.fonts, { heading: 'Tektur', body: 'Tektur', mono: 'Share Tech Mono' }); // locked → preset fonts
assert.deepEqual(Object.keys(payload.options!).sort(), ['mode', 'nodeLabel', 'systemBar']);
assert.equal(payload.template, 'cyber-brutalism'); assert.equal(payload.preset, 'purple-light');
const unknownPayload = tf.toThemePayload({ ...old, template: 'gone', options: { x: 1 as never } }, null);
assert.equal(unknownPayload.template, 'gone'); assert.deepEqual(unknownPayload.options, { x: 1 }); // Review Focus 4: untouched
assert.deepEqual(unknownPayload.fonts, { heading: null, body: 'Inter', mono: null });

// preview message never carries customCss
const msg = tf.buildPreviewMessage(applied, brutal as never);
assert.equal(msg.type, 'sf-preview-theme'); assert.equal('customCss' in msg.theme, false); assert.equal(msg.theme.template, 'cyber-brutalism');

// readiness + URL handling (Review Focus 5)
assert.equal(tf.isPreviewReady({ type: 'sf-preview-ready' }), true);
assert.equal(tf.isPreviewReady({ type: 'other' }), false);
assert.equal(tf.isPreviewReady('sf-preview-ready'), false);
assert.equal(tf.isPreviewReady(null), false);
assert.deepEqual(tf.previewTarget('https://shop.example.com'), { origin: 'https://shop.example.com', src: 'https://shop.example.com/?sf-preview=1' });
assert.deepEqual(tf.previewTarget('http://localhost:5173/'), { origin: 'http://localhost:5173', src: 'http://localhost:5173/?sf-preview=1' });
assert.equal(tf.previewTarget(null), null);
assert.equal(tf.previewTarget('not a url'), null);
assert.equal(tf.previewTarget('javascript:alert(1)'), null);
assert.equal(tf.assetUrl('https://shop.example.com', '/templates/x/preview.abc.webp'), 'https://shop.example.com/templates/x/preview.abc.webp');
assert.equal(tf.assetUrl(null, '/templates/x/p.webp'), null);
assert.equal(tf.assetUrl(null, 'https://cdn.example.com/p.webp'), 'https://cdn.example.com/p.webp');
assert.equal(tf.assetUrl('https://shop.example.com', null), null);
assert.equal(tf.assetUrl('https://shop.example.com', 'javascript:alert(1)'), null);

console.log('template-form checks: ALL PASS');
```

- [ ] **Step 2: Run it to see it fail**

Run: `node "C:/Users/Nobody/AppData/Local/Temp/claude/T--Projects-ecommerce/79c355d8-ae38-4045-94ce-9a1793c21c60/scratchpad/admin-templates/template-form.check.ts"`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `template-form.ts`. An `ExperimentalWarning: Type Stripping` line is normal on Node 22.19.

- [ ] **Step 3: Implement `template-form.ts`**

```ts
import type {
  StorefrontCatalogTemplate,
  StorefrontTemplateCatalog,
  StorefrontTemplatePreset,
  StorefrontTheme,
  StorefrontThemeColorKey,
  StorefrontThemeDensity,
  StorefrontThemeOptions,
  StorefrontThemeRadius,
  StorefrontThemeScheme,
} from '@/types/storefront-settings.ts';

/**
 * Pure logic behind the storefront template editor (ThemeEditor). React-free
 * and type-import-only on purpose, so it can be checked with plain `node`
 * (type stripping) — the admin SPA has no test runner.
 */

export const THEME_COLOR_KEYS = ['primary', 'bg', 'surface', 'text', 'muted', 'success', 'warn', 'danger'] as const satisfies readonly StorefrontThemeColorKey[];
export const FONT_KEYS = ['heading', 'body', 'mono'] as const;
const ALL_SCHEMES: readonly StorefrontThemeScheme[] = ['dark', 'light'];

/**
 * Used when the catalog endpoint fails (backend older than the template
 * system, or down). Mirrors the backend's DEFAULT_THEME so "Modern" still
 * means today's look.
 */
export const FALLBACK_CATALOG: StorefrontTemplateCatalog = {
  source: 'fallback',
  tag: null,
  baseUrl: null,
  templates: [
    {
      id: 'modern',
      name: 'Modern',
      version: '1.0.0',
      description: 'The default storefront look.',
      author: 'Built-in',
      schemes: ['dark', 'light'],
      presets: [
        {
          id: 'default',
          name: 'Default',
          scheme: 'dark',
          colors: {
            primary: '#ffffff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc',
            muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278',
          },
          fonts: { heading: null, body: null, mono: null },
          radius: 'none',
        },
      ],
      defaultPreset: 'default',
      editable: { colors: [...THEME_COLOR_KEYS], fonts: true, radius: true, density: true },
      options: [],
      preview: null,
      builtIn: true,
    },
  ],
};

/** Form shape: stored theme with fonts as strings ('' = system stack) and the three template fields required. */
export interface ThemeFormData {
  template: string;
  preset: string | null;
  options: StorefrontThemeOptions;
  scheme: StorefrontThemeScheme;
  colors: Record<StorefrontThemeColorKey, string>;
  fonts: { heading: string; body: string; mono: string };
  radius: StorefrontThemeRadius;
  density: StorefrontThemeDensity;
  customCss: string;
}

export interface ThemeLocks {
  /** Colour keys the admin may NOT change. */
  colors: ReadonlySet<StorefrontThemeColorKey>;
  fonts: boolean;
  radius: boolean;
  density: boolean;
  /** Schemes the scheme picker may offer. */
  schemes: readonly StorefrontThemeScheme[];
}

export type PreviewTheme = Omit<StorefrontTheme, 'customCss' | 'template' | 'preset' | 'options'> & {
  template: string;
  preset: string | null;
  options: StorefrontThemeOptions;
};
export interface PreviewMessage { type: 'sf-preview-theme'; theme: PreviewTheme }
export interface PreviewTarget { origin: string; src: string }

export function toForm(theme: StorefrontTheme): ThemeFormData {
  return {
    template: theme.template ?? 'modern',
    preset: theme.preset ?? null,
    options: { ...(theme.options ?? {}) },
    scheme: theme.scheme,
    colors: { ...theme.colors },
    fonts: { heading: theme.fonts?.heading ?? '', body: theme.fonts?.body ?? '', mono: theme.fonts?.mono ?? '' },
    radius: theme.radius,
    density: theme.density,
    customCss: theme.customCss ?? '',
  };
}

export function findTemplate(catalog: StorefrontTemplateCatalog | undefined, id: string): StorefrontCatalogTemplate | null {
  return catalog?.templates.find((t) => t.id === id) ?? null;
}

/** The stored preset if the template still has it, else its defaultPreset, else its first preset. */
export function findPreset(template: StorefrontCatalogTemplate, presetId: string | null): StorefrontTemplatePreset {
  return (
    template.presets.find((p) => p.id === presetId) ??
    template.presets.find((p) => p.id === template.defaultPreset) ??
    template.presets[0]!
  );
}

export function defaultOptions(template: StorefrontCatalogTemplate): StorefrontThemeOptions {
  return Object.fromEntries(template.options.map((o) => [o.key, o.default]));
}

/**
 * Manifest defaults ⊕ stored values: unknown keys dropped; wrong types, stale select values and
 * over-long text → default. Mirrors the storefront's resolveOptions (web/src/templates/resolve.ts)
 * exactly, so the form shows what the storefront renders.
 */
export function resolveOptions(template: StorefrontCatalogTemplate, stored: StorefrontThemeOptions | undefined): StorefrontThemeOptions {
  const out: StorefrontThemeOptions = {};
  for (const o of template.options) {
    const v = stored?.[o.key];
    if (o.type === 'boolean') out[o.key] = typeof v === 'boolean' ? v : o.default;
    else if (o.type === 'select') out[o.key] = typeof v === 'string' && o.choices.some((c) => c.value === v) ? v : o.default;
    else out[o.key] = typeof v === 'string' && v.length <= o.maxLength ? v : o.default;
  }
  return out;
}

function presetFonts(preset: StorefrontTemplatePreset): ThemeFormData['fonts'] {
  return {
    heading: preset.fonts.heading?.family ?? '',
    body: preset.fonts.body?.family ?? '',
    mono: preset.fonts.mono?.family ?? '',
  };
}

/** Template/preset switch: copy the preset's look and reset options; density and custom CSS carry over. */
export function applyPreset(form: ThemeFormData, template: StorefrontCatalogTemplate, preset: StorefrontTemplatePreset): ThemeFormData {
  return {
    ...form,
    template: template.id,
    preset: preset.id,
    scheme: preset.scheme,
    colors: { ...preset.colors },
    fonts: presetFonts(preset),
    radius: preset.radius,
    options: defaultOptions(template),
  };
}

/** Customise card's "Reset to preset": like applyPreset for the current preset, but options are kept. */
export function resetToPreset(form: ThemeFormData, template: StorefrontCatalogTemplate): ThemeFormData {
  return { ...applyPreset(form, template, findPreset(template, form.preset)), options: form.options };
}

/** null template (not in catalog) → nothing locked: we don't know its rules, and the storefront renders it as modern. */
export function locksFor(template: StorefrontCatalogTemplate | null): ThemeLocks {
  if (!template) return { colors: new Set(), fonts: false, radius: false, density: false, schemes: ALL_SCHEMES };
  const editable = new Set(template.editable.colors);
  return {
    colors: new Set(THEME_COLOR_KEYS.filter((k) => !editable.has(k))),
    fonts: !template.editable.fonts,
    radius: !template.editable.radius,
    density: !template.editable.density,
    schemes: template.schemes,
  };
}

/** What the storefront will actually render: locked fields ← the preset, scheme forced into `schemes`, options resolved. */
export function enforceLocks(form: ThemeFormData, template: StorefrontCatalogTemplate | null): ThemeFormData {
  if (!template) return form;
  const preset = findPreset(template, form.preset);
  const locks = locksFor(template);
  const colors = { ...form.colors };
  for (const k of THEME_COLOR_KEYS) if (locks.colors.has(k)) colors[k] = preset.colors[k];
  return {
    ...form,
    preset: preset.id,
    scheme: template.schemes.includes(form.scheme) ? form.scheme : preset.scheme,
    colors,
    fonts: locks.fonts ? presetFonts(preset) : form.fonts,
    radius: locks.radius ? preset.radius : form.radius,
    density: locks.density ? 'comfortable' : form.density,
    options: resolveOptions(template, form.options),
  };
}

function sameOptions(a: StorefrontThemeOptions, b: StorefrontThemeOptions): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (a[k] !== b[k]) return false;
  return true;
}

/**
 * Would switching template/preset throw away edits? True when the form's look
 * (scheme, colours, fonts, radius, options) differs from its current preset's.
 * Density and custom CSS survive switches, so they don't count. Unknown
 * template → true (its values are by definition not a known preset's).
 */
export function differsFromPreset(form: ThemeFormData, template: StorefrontCatalogTemplate | null): boolean {
  if (!template) return true;
  const applied = applyPreset(form, template, findPreset(template, form.preset));
  return (
    form.scheme !== applied.scheme ||
    THEME_COLOR_KEYS.some((k) => form.colors[k].toLowerCase() !== applied.colors[k].toLowerCase()) ||
    FONT_KEYS.some((k) => form.fonts[k].trim() !== applied.fonts[k]) ||
    form.radius !== applied.radius ||
    !sameOptions(resolveOptions(template, form.options), applied.options)
  );
}

/** PUT body for `theme`. Unknown template → form passed through untouched (id and options preserved). */
export function toThemePayload(form: ThemeFormData, template: StorefrontCatalogTemplate | null): StorefrontTheme {
  const f = enforceLocks(form, template);
  return {
    template: f.template,
    preset: f.preset,
    options: f.options,
    scheme: f.scheme,
    colors: { ...f.colors },
    fonts: { heading: f.fonts.heading.trim() || null, body: f.fonts.body.trim() || null, mono: f.fonts.mono.trim() || null },
    radius: f.radius,
    density: f.density,
    customCss: f.customCss,
  };
}

/** Draft theme for the storefront preview iframe — never includes customCss (spec §1.10). */
export function buildPreviewMessage(form: ThemeFormData, template: StorefrontCatalogTemplate | null): PreviewMessage {
  const p = toThemePayload(form, template);
  return {
    type: 'sf-preview-theme',
    theme: {
      template: p.template ?? 'modern',
      preset: p.preset ?? null,
      options: p.options ?? {},
      scheme: p.scheme,
      colors: p.colors,
      fonts: p.fonts,
      radius: p.radius,
      density: p.density,
    },
  };
}

export function isPreviewReady(data: unknown): boolean {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'sf-preview-ready';
}

function httpUrl(value: string, base?: string): URL | null {
  try {
    const u = new URL(value, base);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

/** Iframe src + the exact origin to post to / accept messages from. Non-http(s) or unparsable → null (swatch fallback). */
export function previewTarget(baseUrl: string | null): PreviewTarget | null {
  if (!baseUrl) return null;
  const base = httpUrl(baseUrl);
  if (!base) return null;
  return { origin: base.origin, src: new URL('/?sf-preview=1', base).href };
}

/** Resolve a catalog preview path against the storefront origin; absolute http(s) URLs pass through. */
export function assetUrl(baseUrl: string | null, path: string | null | undefined): string | null {
  if (!path) return null;
  const absolute = httpUrl(path);
  if (absolute && /^https?:\/\//i.test(path)) return absolute.href;
  if (!baseUrl || !httpUrl(baseUrl)) return null;
  return httpUrl(path, baseUrl)?.href ?? null;
}
```

- [ ] **Step 4: Run the checks until they pass**

Run: `node "C:/Users/Nobody/AppData/Local/Temp/claude/T--Projects-ecommerce/79c355d8-ae38-4045-94ce-9a1793c21c60/scratchpad/admin-templates/template-form.check.ts"`
Expected: `template-form checks: ALL PASS`.

If Node rejects a TypeScript construct, the module has used non-erasable syntax. Fix the module, not the check.

- [ ] **Step 5: Build and lint gate**

Run: `npm run build 2>&1 | tail -5` → success (the module is unused so far, but `tsc -b` still typechecks it).
Run: `node <scratch>/admin-templates/lint-gate.mjs storefront-settings/template-form.ts` → `LINT GATE OK`.

- [ ] **Step 6: Commit**

```bash
git status --short
git add src/features/storefront-settings/template-form.ts
git commit -m "feat(storefront): pure template editor logic (presets, locks, options, preview message)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `ThemeEditor` form and `CustomiseCard` (replaces `ThemeCard`)

**Implemented by a frontend-design subagent.**

**Files:**
- Create: `src/features/storefront-settings/theme/ThemeEditor.tsx`: the form owner (queries, RHF, save bar, layout)
- Create: `src/features/storefront-settings/theme/CustomiseCard.tsx`: scheme/radius/density, colours, fonts, custom CSS, locks, Reset to preset
- Create: `src/features/storefront-settings/theme/LockedField.tsx`: the read-only display for a locked field
- Create: `src/features/storefront-settings/theme/FontField.tsx`: `useGoogleFont` + `FontField`, moved verbatim from `ThemeCard.tsx`
- Create: `src/features/storefront-settings/theme/ThemePreview.tsx`: the swatch `ThemePreview` + `RADIUS_PX`, moved from `ThemeCard.tsx`, retyped to `Control<ThemeFormData>`
- Create: `src/features/storefront-settings/theme/theme-schema.ts`: the zod form schema + `EMPTY_THEME_FORM`
- Modify: `src/features/storefront-settings/AppearanceTab.tsx` (render `ThemeEditor` instead of `ThemeCard`)
- Delete: `src/features/storefront-settings/ThemeCard.tsx`

**Interfaces:**
- Consumes: `getStorefrontSettings`, `updateStorefrontSettings`, `getStorefrontTemplates`, `storefrontSettingsKeys` (Task 1); everything in `template-form.ts` (Task 2).
- Produces, for Tasks 4 and 5:
  - `theme-schema.ts`: `export const themeFormSchema` (zod object matching `ThemeFormData`) and `export const EMPTY_THEME_FORM: ThemeFormData`.
  - `ThemeEditor` passes its children this context object:
    ```ts
    export interface ThemeEditorContext {
      control: Control<ThemeFormData>;
      register: UseFormRegister<ThemeFormData>;
      errors: FieldErrors<ThemeFormData>;
      catalog: StorefrontTemplateCatalog;
      template: StorefrontCatalogTemplate | null;   // active template (null = unavailable)
      locks: ThemeLocks;
      canWrite: boolean;
      /** Replace look fields programmatically without resetting dirtiness vs the saved theme. */
      replaceForm: (next: ThemeFormData) => void;
      getForm: () => ThemeFormData;
    }
    ```
    It is exported from `ThemeEditor.tsx` as a type and passed as props (`{ ctx }`). No React context is needed.
  - `LockedField` props: `{ label: string; templateName: string; children: ReactNode }`.

- [ ] **Step 1: Move the reusable pieces out of `ThemeCard.tsx`**

Create `theme/FontField.tsx` containing `useGoogleFont` and `FontField`, copied verbatim from `ThemeCard.tsx` (lines 76–112 today: the doc comment, `useGoogleFont` at 84–100, `FontField` at 102–112), with `FontField` as the **default export** (`useGoogleFont` stays module-private) and `Input` imported from `@/components/ui/Input.tsx`. Add one optional prop, `id?: string`, forwarded to `Input` so labels associate.

Create `theme/ThemePreview.tsx` with `RADIUS_PX` (ThemeCard.tsx line 66) and `ThemePreview` (lines 114–158, doc comment included), with `ThemePreview` as the **default export**. Change two things only: the prop type's import, and the `RADIUS_PX` type. The copied line reads `Record<FormData['radius'], number>`, and once ThemeCard's local `FormData` alias is gone, `FormData` resolves to the DOM global and `tsc` fails. Keep `RADIUS_PX` unexported, because an extra non-component export trips `react-refresh/only-export-components`:

```tsx
import { useWatch, type Control } from 'react-hook-form';
import type { ThemeFormData } from '@/features/storefront-settings/template-form.ts';
import type { StorefrontThemeRadius } from '@/types/storefront-settings.ts';

const RADIUS_PX: Record<StorefrontThemeRadius, number> = { none: 0, sm: 6, md: 10, lg: 16, xl: 24 };
```

Rule for every file under `theme/`: import feature-level modules (`template-form.ts`, `ui/*`) via `@/features/storefront-settings/...`. Siblings inside `theme/` use `./X.tsx`. Never use `../`.

- [ ] **Step 2: Create `theme/theme-schema.ts`**

```ts
import { z } from 'zod';
import type { ThemeFormData } from '@/features/storefront-settings/template-form.ts';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, '6-digit hex');
const font = z.string().trim().max(50).regex(/^[A-Za-z0-9 ]*$/, 'Letters, digits and spaces only');
export const MAX_CSS = 20 * 1024;

export const themeFormSchema = z.object({
  template: z.string().regex(/^[a-z0-9-]{1,40}$/),
  preset: z.string().regex(/^[a-z0-9-]{1,40}$/).nullable(),
  options: z.record(z.string(), z.union([z.boolean(), z.string().max(100)])),
  scheme: z.enum(['dark', 'light']),
  colors: z.object({ primary: hex, bg: hex, surface: hex, text: hex, muted: hex, success: hex, warn: hex, danger: hex }),
  fonts: z.object({ heading: font, body: font, mono: font }),
  radius: z.enum(['none', 'sm', 'md', 'lg', 'xl']),
  density: z.enum(['comfortable', 'compact']),
  customCss: z.string().max(MAX_CSS, 'Custom CSS is limited to 20 KB'),
}) satisfies z.ZodType<ThemeFormData>;

// Fully-shaped dummy so the first render (before the settings query lands) is type-safe —
// same reason ThemeCard kept EMPTY_THEME; the real values arrive via reset().
export const EMPTY_THEME_FORM: ThemeFormData = {
  template: 'modern',
  preset: null,
  options: {},
  scheme: 'dark',
  colors: { primary: '#000000', bg: '#000000', surface: '#000000', text: '#000000', muted: '#000000', success: '#000000', warn: '#000000', danger: '#000000' },
  fonts: { heading: '', body: '', mono: '' },
  radius: 'none',
  density: 'comfortable',
  customCss: '',
};
```

If `satisfies z.ZodType<ThemeFormData>` fails to typecheck under zod 4, because of input/output variance on `.trim()`, remove the `satisfies` clause and add `type _Check = z.infer<typeof themeFormSchema> extends ThemeFormData ? true : never;`. Don't loosen `ThemeFormData`.

- [ ] **Step 3: Create `theme/LockedField.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';

/** Read-only stand-in for a field the active template locks (never a disabled RHF input — see plan Global Constraints). */
export default function LockedField({ label, templateName, children }: { label: string; templateName: string; children: ReactNode }) {
  return (
    <div className="space-y-1" aria-readonly="true">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-text-secondary">{label}</span>
        <span className="inline-flex items-center gap-1 text-xs text-text-tertiary">
          <Lock className="h-3 w-3" aria-hidden="true" /> Set by {templateName}
        </span>
      </div>
      <div className="flex min-h-9 items-center gap-2 rounded-md border border-dashed border-border-default bg-bg-surface/60 px-3 py-2 text-sm text-text-secondary max-lg:min-h-11">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `theme/CustomiseCard.tsx`**

```tsx
import { Controller, useWatch } from 'react-hook-form';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import Button from '@/components/ui/Button.tsx';
import Card from '@/components/ui/Card.tsx';
import ColorPicker from '@/components/ui/ColorPicker.tsx';
import Select from '@/components/ui/Select.tsx';
import Textarea from '@/components/ui/Textarea.tsx';
import CardHeader from '@/features/storefront-settings/ui/CardHeader.tsx';
import { FONT_KEYS, resetToPreset } from '@/features/storefront-settings/template-form.ts';
import type { StorefrontThemeColorKey } from '@/types/storefront-settings.ts';
import type { ThemeEditorContext } from './ThemeEditor.tsx';
import FontField from './FontField.tsx';
import LockedField from './LockedField.tsx';
import { MAX_CSS } from './theme-schema.ts';

const COLOR_FIELDS: { key: StorefrontThemeColorKey; label: string; help: string }[] = [
  { key: 'primary', label: 'Primary', help: 'Buttons, links, accents' },
  { key: 'bg', label: 'Background', help: 'Page background' },
  { key: 'surface', label: 'Surface', help: 'Cards and panels' },
  { key: 'text', label: 'Text', help: 'Body copy' },
  { key: 'muted', label: 'Muted', help: 'Secondary text' },
  { key: 'success', label: 'Success', help: 'Confirmations' },
  { key: 'warn', label: 'Warning', help: 'Notices' },
  { key: 'danger', label: 'Danger', help: 'Errors' },
];
const RADIUS_OPTIONS = [
  { value: 'none', label: 'None (sharp)' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' }, { value: 'xl', label: 'Extra large' },
];
const RADIUS_LABEL: Record<string, string> = Object.fromEntries(RADIUS_OPTIONS.map((o) => [o.value, o.label]));
const DENSITY_OPTIONS = [{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }];

export default function CustomiseCard({ ctx }: { ctx: ThemeEditorContext }) {
  const { control, register, errors, template, locks, canWrite, replaceForm, getForm } = ctx;
  const templateName = template?.name ?? 'template';
  const customCss = useWatch({ control, name: 'customCss' });
  const colors = useWatch({ control, name: 'colors' });
  const fonts = useWatch({ control, name: 'fonts' });
  const radius = useWatch({ control, name: 'radius' });
  const density = useWatch({ control, name: 'density' });
  const scheme = useWatch({ control, name: 'scheme' });
  const cssLength = new TextEncoder().encode(customCss ?? '').length;
  const schemeOptions = locks.schemes.map((s) => ({ value: s, label: s === 'dark' ? 'Dark' : 'Light' }));

  return (
    <Card>
      <div className="space-y-5">
        <CardHeader
          icon={SlidersHorizontal}
          title="Customise"
          description={template ? `Adjust ${template.name} within what it allows. Locked fields keep the template's look.` : 'Colours, fonts and shape.'}
          right={template && canWrite ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => replaceForm(resetToPreset(getForm(), template))}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset to preset
            </Button>
          ) : undefined}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          {locks.schemes.length > 1 ? (
            <Select id="theme-scheme" label="Scheme" options={schemeOptions} {...register('scheme')} />
          ) : (
            <LockedField label="Scheme" templateName={templateName}>{scheme === 'dark' ? 'Dark' : 'Light'}</LockedField>
          )}
          {locks.radius ? (
            <LockedField label="Corner radius" templateName={templateName}>{RADIUS_LABEL[radius] ?? radius}</LockedField>
          ) : (
            <Select id="theme-radius" label="Corner radius" options={RADIUS_OPTIONS} {...register('radius')} />
          )}
          {locks.density ? (
            <LockedField label="Density" templateName={templateName}>{density === 'compact' ? 'Compact' : 'Comfortable'}</LockedField>
          ) : (
            <Select id="theme-density" label="Density" options={DENSITY_OPTIONS} {...register('density')} />
          )}
        </div>

        <div className="border-t border-border-subtle pt-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Colours</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            {COLOR_FIELDS.map((f) => {
              if (locks.colors.has(f.key)) {
                return (
                  <LockedField key={f.key} label={f.label} templateName={templateName}>
                    <span className="h-4 w-4 rounded-sm border border-border-default" style={{ background: colors?.[f.key] }} aria-hidden="true" />
                    <span className="font-mono text-xs">{colors?.[f.key]}</span>
                  </LockedField>
                );
              }
              const labelId = `theme-color-${f.key}`;
              return (
                <Controller
                  key={f.key}
                  control={control}
                  name={`colors.${f.key}`}
                  render={({ field }) => (
                    <div className="space-y-1">
                      <div className="flex items-baseline justify-between">
                        <label id={labelId} className="text-sm font-medium text-text-secondary">{f.label}</label>
                        <span className="text-xs text-text-tertiary">{f.help}</span>
                      </div>
                      <div role="group" aria-labelledby={labelId}>
                        <ColorPicker value={field.value} onChange={field.onChange} />
                      </div>
                      {errors.colors?.[f.key] && <p className="text-xs text-error">{errors.colors[f.key]?.message}</p>}
                    </div>
                  )}
                />
              );
            })}
          </div>
        </div>

        <div className="border-t border-border-subtle pt-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Fonts (Google Fonts family names)</h4>
          <div className="grid gap-4 sm:grid-cols-3">
            {FONT_KEYS.map((k) => {
              const label = k[0]!.toUpperCase() + k.slice(1);
              if (locks.fonts) {
                return (
                  <LockedField key={k} label={label} templateName={templateName}>
                    {/* null/'' = the storefront's self-hosted Inter stack (spec §4.1, amendment 11), not a system font — ruling F10 */}
                    <span className="truncate" style={{ fontFamily: fonts?.[k] ? `'${fonts[k]}', sans-serif` : undefined }}>{fonts?.[k] || 'Template default (Inter)'}</span>
                  </LockedField>
                );
              }
              return (
                <Controller key={k} control={control} name={`fonts.${k}`} render={({ field }) => (
                  <FontField id={`theme-font-${k}`} label={label} value={field.value} onChange={field.onChange} error={errors.fonts?.[k]?.message} />
                )} />
              );
            })}
          </div>
        </div>

        <div className="border-t border-border-subtle pt-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <h4 id="theme-custom-css-label" className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Custom CSS</h4>
            <span className={cssLength > MAX_CSS ? 'text-xs text-error' : 'text-xs text-text-tertiary'}>{(cssLength / 1024).toFixed(1)} / 20 KB</span>
          </div>
          <Textarea id="theme-custom-css" aria-labelledby="theme-custom-css-label" rows={8} className="font-mono text-xs" placeholder=":root { --sf-line: #223; }" error={errors.customCss?.message} {...register('customCss')} />
          <p className="text-xs text-text-tertiary">Injected last in the cascade. `@import`, external `url()`s and expressions are rejected server-side. Not applied in the live preview until saved.</p>
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 5: Create `theme/ThemeEditor.tsx`**

This task renders `CustomiseCard` plus the swatch `ThemePreview`. Task 4 slots in `TemplateCard` and `TemplateOptionsCard`, and Task 5 replaces the preview column with `LivePreview`; the marked lines show where.

```tsx
import { useCallback, useEffect, useMemo } from 'react';
import { useForm, useWatch, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { getStorefrontSettings, getStorefrontTemplates, storefrontSettingsKeys, updateStorefrontSettings } from '@/api/storefront-settings.ts';
import Button from '@/components/ui/Button.tsx';
import Card from '@/components/ui/Card.tsx';
import Spinner from '@/components/ui/Spinner.tsx';
import { useCan } from '@/hooks/use-can.ts';
import {
  FALLBACK_CATALOG, enforceLocks, findTemplate, locksFor, toForm, toThemePayload,
  type ThemeFormData, type ThemeLocks,
} from '@/features/storefront-settings/template-form.ts';
import type { StorefrontCatalogTemplate, StorefrontTemplateCatalog } from '@/types/storefront-settings.ts';
import CustomiseCard from './CustomiseCard.tsx';
import ThemePreview from './ThemePreview.tsx';
import { EMPTY_THEME_FORM, themeFormSchema } from './theme-schema.ts';

export interface ThemeEditorContext {
  control: Control<ThemeFormData>;
  register: UseFormRegister<ThemeFormData>;
  errors: FieldErrors<ThemeFormData>;
  catalog: StorefrontTemplateCatalog;
  template: StorefrontCatalogTemplate | null;
  locks: ThemeLocks;
  canWrite: boolean;
  replaceForm: (next: ThemeFormData) => void;
  getForm: () => ThemeFormData;
}

// The backend's 422 messages for a rejected custom-CSS payload mention one of these terms.
const CSS_REJECTION_PATTERN = /\bCSS\b|@import|url\(|expression/i;

export default function ThemeEditor() {
  const can = useCan();
  const canWrite = can('storefront', 'write');
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: storefrontSettingsKeys.all, queryFn: getStorefrontSettings });
  const templatesQuery = useQuery({ queryKey: storefrontSettingsKeys.templates(), queryFn: getStorefrontTemplates, staleTime: 60_000, retry: 1 });
  // Review Focus 2: a failed catalog call (older backend, outage) degrades to Modern-only instead of blocking the editor.
  const catalog: StorefrontTemplateCatalog | undefined = templatesQuery.data ?? (templatesQuery.isError ? FALLBACK_CATALOG : undefined);
  const settings = settingsQuery.data;

  const { control, register, handleSubmit, reset, getValues, setError, formState: { errors, isDirty } } = useForm<ThemeFormData>({
    resolver: zodResolver(themeFormSchema),
    defaultValues: EMPTY_THEME_FORM,
  });

  // Content-keyed reset (all storefront tabs share one settings query — see GeneralCard).
  // Normalised through enforceLocks so the form shows what the storefront actually renders.
  const themeKey = settings && catalog ? JSON.stringify([settings.theme, catalog.templates.map((t) => t.id + t.version)]) : null;
  useEffect(() => {
    if (!settings || !catalog) return;
    const form = toForm(settings.theme);
    reset(enforceLocks(form, findTemplate(catalog, form.template)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeKey, reset]);

  const templateId = useWatch({ control, name: 'template' });
  const template = useMemo(() => findTemplate(catalog, templateId), [catalog, templateId]);
  const locks = useMemo(() => locksFor(template), [template]);

  // keepDefaultValues: dirtiness stays measured against the saved theme, so switching back clears the save bar.
  const replaceForm = useCallback((next: ThemeFormData) => reset(next, { keepDefaultValues: true }), [reset]);
  const getForm = useCallback(() => getValues(), [getValues]);

  const mutation = useMutation({
    mutationFn: (d: ThemeFormData) => updateStorefrontSettings({ theme: toThemePayload(d, findTemplate(catalog, d.template)) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: storefrontSettingsKeys.all }); toast.success('Theme saved — live within about 30 seconds'); },
    onError: (err: Error) => {
      if (CSS_REJECTION_PATTERN.test(err.message)) setError('customCss', { type: 'server', message: err.message });
      else toast.error(err.message);
    },
  });

  if (settingsQuery.isLoading || !settings || !catalog) {
    return <Card><div className="flex justify-center py-8"><Spinner size="lg" /></div></Card>;
  }

  const ctx: ThemeEditorContext = { control, register, errors, catalog, template, locks, canWrite, replaceForm, getForm };

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <fieldset disabled={!canWrite} className="min-w-0 space-y-6">
        {/* Task 4: <TemplateCard ctx={ctx} /> goes here */}
        <CustomiseCard ctx={ctx} />
        {/* Task 4: <TemplateOptionsCard ctx={ctx} /> goes here */}
      </fieldset>

      {/* Task 5 replaces this column with <LivePreview ctx={ctx} /> */}
      <div className="min-w-0 max-lg:order-first lg:sticky lg:top-4 lg:self-start">
        <Card><ThemePreview control={control} /></Card>
      </div>

      {canWrite && isDirty && (
        <div className="sticky bottom-0 z-20 pb-1 pt-3 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-end gap-3 rounded-xl border border-border-subtle bg-bg-raised/95 px-3 py-2.5 shadow-md backdrop-blur motion-safe:animate-[rise-in_160ms_ease-out]">
            <p className="mr-auto flex items-center gap-2 text-[13px] text-text-secondary">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Unsaved theme changes
            </p>
            <div className="flex items-center gap-2 max-lg:w-full max-lg:justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => reset()} disabled={mutation.isPending}>Discard</Button>
              <Button type="submit" size="sm" disabled={mutation.isPending}>
                {mutation.isPending ? <><Spinner size="sm" /> Saving…</> : <><Save className="h-3.5 w-3.5" /> Save theme</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
```

Notes for the implementer:
- `reset()` with no arguments restores the default values, i.e. the last saved and normalised theme. That's what Discard means here.
- The `<fieldset disabled>` wraps inputs for read-only users only. It must not wrap the preview column, so that read-only users can still toggle Desktop/Phone.
- `themeKey` includes catalog template versions so that a catalog refresh re-normalises the locks.

- [ ] **Step 6: Wire it into `AppearanceTab.tsx` and delete `ThemeCard.tsx`**

In `AppearanceTab.tsx`, replace `import ThemeCard from './ThemeCard.tsx';` with `import ThemeEditor from './theme/ThemeEditor.tsx';` and `<ThemeCard />` with `<ThemeEditor />`. Then:

```bash
git rm src/features/storefront-settings/ThemeCard.tsx
grep -rn "ThemeCard" src/ || echo "no references"
```

Expected: `no references`.

- [ ] **Step 7: Build and lint gate**

Run: `npm run build 2>&1 | tail -5` → success.
Run: `node <scratch>/admin-templates/lint-gate.mjs storefront-settings/theme/ storefront-settings/AppearanceTab.tsx` → `LINT GATE OK`.
Run the Task 2 check script again → `ALL PASS`, confirming the logic module is untouched.

- [ ] **Step 8: No browser smoke here (ruling F5)**

This task's gate is Step 7: `npm run build`, the lint gate, and the Task 2 check script. Don't write or borrow the Task 6 Playwright script. The browser pass happens once, in Task 6, and covers everything this task renders (scenarios 1, 2 and 7).

If you want an optional manual look, which is not a gate and nothing to report, run `npm run dev` against whatever backend `.env` points at and open Storefront Settings → Appearance. Don't click Save: the `.env` backend may hold live data (memory `env-northbound-db-live-side-effects`).

- [ ] **Step 9: Commit**

```bash
git status --short
git add src/features/storefront-settings/theme/ src/features/storefront-settings/AppearanceTab.tsx
git commit -m "feat(storefront): theme editor form with template locks (replaces ThemeCard)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(`git rm` has already staged the deletion of `ThemeCard.tsx`; confirm it shows as `D` in `git status` before committing.)

---

### Task 4: `TemplateCard` (grid, presets, confirm, unavailable) and `TemplateOptionsCard`

**Implemented by a frontend-design subagent.**

**Files:**
- Create: `src/features/storefront-settings/theme/TemplateCard.tsx`
- Create: `src/features/storefront-settings/theme/TemplateThumb.tsx`: preview image with swatch fallback
- Create: `src/features/storefront-settings/theme/TemplateOptionsCard.tsx`
- Modify: `src/features/storefront-settings/theme/ThemeEditor.tsx` (render both cards at the Task 4 markers)

**Interfaces:**
- Consumes: `ThemeEditorContext` (Task 3); `findPreset`, `applyPreset`, `differsFromPreset`, `assetUrl` (Task 2).
- Produces: `TemplateCard({ ctx })`, `TemplateOptionsCard({ ctx })`, `TemplateThumb({ template, baseUrl })`.

- [ ] **Step 1: Create `theme/TemplateThumb.tsx`**

```tsx
import { useState } from 'react';
import { assetUrl, findPreset } from '@/features/storefront-settings/template-form.ts';
import type { StorefrontCatalogTemplate } from '@/types/storefront-settings.ts';

/** Catalog preview image; falls back to a swatch built from the default preset when absent or broken. */
export default function TemplateThumb({ template, baseUrl }: { template: StorefrontCatalogTemplate; baseUrl: string | null }) {
  const src = assetUrl(baseUrl, template.preview);
  const [failed, setFailed] = useState(false);
  const p = findPreset(template, null);
  if (src && !failed) {
    return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="aspect-[16/10] w-full rounded-md object-cover" />;
  }
  return (
    <div aria-hidden="true" className="aspect-[16/10] w-full rounded-md p-3 flex flex-col justify-between" style={{ background: p.colors.bg }}>
      <div className="h-2 w-1/3 rounded-sm" style={{ background: p.colors.text, opacity: 0.8 }} />
      <div className="rounded-sm p-2 space-y-1.5" style={{ background: p.colors.surface }}>
        <div className="h-1.5 w-2/3 rounded-sm" style={{ background: p.colors.muted }} />
        <div className="h-3 w-1/3 rounded-sm" style={{ background: p.colors.primary }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `theme/TemplateCard.tsx`**

```tsx
import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import { AlertTriangle, Check, LayoutTemplate } from 'lucide-react';
import Badge from '@/components/ui/Badge.tsx';
import Card from '@/components/ui/Card.tsx';
import ConfirmDialog from '@/components/ui/ConfirmDialog.tsx';
import { cn } from '@/lib/cn.ts';
import CardHeader from '@/features/storefront-settings/ui/CardHeader.tsx';
import { applyPreset, differsFromPreset, findPreset, findTemplate } from '@/features/storefront-settings/template-form.ts';
import type { StorefrontCatalogTemplate, StorefrontTemplatePreset } from '@/types/storefront-settings.ts';
import type { ThemeEditorContext } from './ThemeEditor.tsx';
import TemplateThumb from './TemplateThumb.tsx';

interface Choice { template: StorefrontCatalogTemplate; preset: StorefrontTemplatePreset }

function sourceNote(source: string, baseUrl: string | null): string | null {
  if (source === 'live') return `Read from the live storefront${baseUrl ? ` at ${baseUrl}` : ''}. Deploy from the Deploy tab to pin this list to a release.`;
  if (source === 'fallback') return 'Showing built-in templates only; deploy a newer storefront release (Deploy tab) to see more.';
  return null;
}

export default function TemplateCard({ ctx }: { ctx: ThemeEditorContext }) {
  const { control, catalog, template, canWrite, replaceForm, getForm } = ctx;
  const templateId = useWatch({ control, name: 'template' });
  const presetId = useWatch({ control, name: 'preset' });
  const [pending, setPending] = useState<Choice | null>(null);
  const activePreset = template ? findPreset(template, presetId) : null;
  const note = sourceNote(catalog.source, catalog.baseUrl);

  const choose = (choice: Choice) => {
    if (!canWrite) return;
    if (choice.template.id === templateId && choice.preset.id === activePreset?.id) return;
    const form = getForm();
    // Confirm only when the switch would discard edits (Review Focus 4: an unavailable template always asks).
    if (differsFromPreset(form, findTemplate(catalog, form.template))) setPending(choice);
    else replaceForm(applyPreset(form, choice.template, choice.preset));
  };
  const confirm = () => {
    if (pending) replaceForm(applyPreset(getForm(), pending.template, pending.preset));
    setPending(null);
  };

  return (
    <Card>
      <div className="space-y-4">
        <CardHeader icon={LayoutTemplate} title="Template" description="The storefront's overall design. Each template ships presets; pick one, then fine-tune below." />

        {!template && (
          <div role="alert" className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-muted px-3 py-2 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {/* Ruling F1: with the fallback catalog (call failed / no catalog) we can't know the storefront
                lacks this template, so don't claim it shows Modern. ThemeEditor sets FALLBACK_CATALOG
                (source 'fallback') on a failed call, so this one check covers both cases. */}
            {catalog.source === 'fallback' ? (
              <span>Template catalog unavailable — can't show “{templateId}”'s options; saving keeps it.</span>
            ) : (
              <span>“{templateId}” is unavailable. The storefront is showing Modern. Pick a template below to replace it.</span>
            )}
          </div>
        )}
        {note && <p className="text-xs text-text-tertiary">{note}</p>}

        <div role="radiogroup" aria-label="Storefront template" className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {catalog.templates.map((t) => {
            const selected = t.id === templateId;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!canWrite}
                onClick={() => choose({ template: t, preset: findPreset(t, null) })}
                className={cn(
                  'group relative flex flex-col gap-2 rounded-lg border p-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-default',
                  selected ? 'border-accent ring-1 ring-accent' : 'border-border-subtle hover:border-border-default',
                )}
              >
                <TemplateThumb template={t} baseUrl={catalog.baseUrl} />
                <div className="flex items-start justify-between gap-2 px-1">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">{t.name}</p>
                    <p className="text-xs text-text-tertiary line-clamp-2">{t.description}</p>
                  </div>
                  {selected && <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />}
                </div>
                <div className="flex flex-wrap gap-1 px-1 pb-1">
                  <Badge color={t.builtIn ? 'default' : 'info'}>{t.builtIn ? 'Built-in' : 'Imported'}</Badge>
                  {t.schemes.map((s) => <Badge key={s}>{s === 'dark' ? 'Dark' : 'Light'}</Badge>)}
                </div>
              </button>
            );
          })}
        </div>

        {template && template.presets.length > 0 && (
          <div className="border-t border-border-subtle pt-4 space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">{template.name} presets</h4>
            <div role="radiogroup" aria-label={`${template.name} presets`} className="flex flex-wrap gap-2">
              {template.presets.map((p) => {
                const selected = p.id === activePreset?.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!canWrite}
                    onClick={() => choose({ template, preset: p })}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition max-lg:min-h-11 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
                      selected ? 'border-accent text-text-primary' : 'border-border-subtle text-text-secondary hover:border-border-default',
                    )}
                  >
                    <span className="flex -space-x-1" aria-hidden="true">
                      {[p.colors.bg, p.colors.surface, p.colors.primary].map((c, i) => (
                        <span key={i} className="h-3.5 w-3.5 rounded-full border border-border-default" style={{ background: c }} />
                      ))}
                    </span>
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={confirm}
        variant="primary"
        title="Replace your theme values?"
        message={pending ? `This replaces your colours, fonts and template options with ${pending.template.name} · ${pending.preset.name} defaults. Density and custom CSS are kept. Nothing is saved until you press Save.` : ''}
        confirmLabel="Replace"
      />
    </Card>
  );
}
```

- [ ] **Step 3: Create `theme/TemplateOptionsCard.tsx`**

```tsx
import { Controller } from 'react-hook-form';
import { ToggleRight } from 'lucide-react';
import Card from '@/components/ui/Card.tsx';
import Input from '@/components/ui/Input.tsx';
import Select from '@/components/ui/Select.tsx';
import CardHeader from '@/features/storefront-settings/ui/CardHeader.tsx';
import SwitchRow from '@/features/storefront-settings/ui/SwitchRow.tsx';
import type { ThemeEditorContext } from './ThemeEditor.tsx';

/** Generated from the active template's manifest `options[]`; hidden when it has none or the template is unavailable. */
export default function TemplateOptionsCard({ ctx }: { ctx: ThemeEditorContext }) {
  const { control, template, canWrite } = ctx;
  if (!template || template.options.length === 0) return null;

  return (
    <Card>
      <div className="space-y-3">
        <CardHeader icon={ToggleRight} title={`${template.name} options`} description="Extras specific to this template." />
        <div className="divide-y divide-border-subtle">
          {template.options.map((o) => (
            <Controller
              key={`${template.id}:${o.key}`}
              control={control}
              name={`options.${o.key}`}
              render={({ field }) => {
                if (o.type === 'boolean') {
                  return <SwitchRow title={o.label} help={o.help} checked={field.value === true} onChange={field.onChange} disabled={!canWrite} />;
                }
                const id = `theme-opt-${o.key}`;
                const value = typeof field.value === 'string' ? field.value : o.default;
                return (
                  <div className="py-2 space-y-1">
                    {o.type === 'select' ? (
                      <Select id={id} label={o.label} options={o.choices} value={value} onChange={(e) => field.onChange(e.target.value)} />
                    ) : (
                      <Input id={id} label={o.label} value={value} maxLength={o.maxLength} onChange={(e) => field.onChange(e.target.value)} />
                    )}
                    {o.help && <p className="text-xs text-text-tertiary">{o.help}</p>}
                  </div>
                );
              }}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
```

`options.${o.key}` is a dynamic path into `Record<string, boolean | string>`. RHF types it as `options.${string}`, which is valid. If the typecheck rejects the template literal, cast the name with `as \`options.${string}\``; never cast to `any`.

- [ ] **Step 4: Render them in `ThemeEditor.tsx`**

Add the imports `import TemplateCard from './TemplateCard.tsx';` and `import TemplateOptionsCard from './TemplateOptionsCard.tsx';`, then replace the two Task 4 marker comments with `<TemplateCard ctx={ctx} />` (before `CustomiseCard`) and `<TemplateOptionsCard ctx={ctx} />` (after it).

- [ ] **Step 5: Build and lint gate**

Run: `npm run build 2>&1 | tail -5` → success.
Run: `node <scratch>/admin-templates/lint-gate.mjs storefront-settings/theme/` → `LINT GATE OK`.

- [ ] **Step 6: Commit**

```bash
git status --short
git add src/features/storefront-settings/theme/
git commit -m "feat(storefront): template picker, presets and template options cards

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `LivePreview` (storefront iframe + postMessage), with swatch fallback and mobile layout

**Implemented by a frontend-design subagent.**

**Files:**
- Create: `src/features/storefront-settings/theme/use-storefront-preview.ts`: the message hook
- Create: `src/features/storefront-settings/theme/LivePreview.tsx`
- Modify: `src/features/storefront-settings/theme/ThemeEditor.tsx` (replace the preview column)

**Interfaces:**
- Consumes: `buildPreviewMessage`, `isPreviewReady`, `previewTarget`, `type PreviewTarget`, `type ThemeFormData` (Task 2); `ThemeEditorContext` (Task 3); `ThemePreview` (Task 3).
- Produces: `useStorefrontPreview(frameRef: RefObject<HTMLIFrameElement | null>, target: PreviewTarget | null, messageKey: string, message: PreviewMessage | null): boolean` (returns "storefront said ready"); `LivePreview({ ctx })`.

- [ ] **Step 1: Create `theme/use-storefront-preview.ts`**

```ts
import { useEffect, useRef, useState, type RefObject } from 'react';
import { isPreviewReady, type PreviewMessage, type PreviewTarget } from '@/features/storefront-settings/template-form.ts';

/**
 * Drives the storefront preview iframe (spec §1.10). The storefront posts
 * { type: 'sf-preview-ready' } whenever a document mounts inside the frame —
 * including after in-frame navigation — and we answer with the current draft.
 * Draft changes are posted 150 ms after they settle. Messages from any other
 * origin or window are ignored, and we only ever post to target.origin.
 */
export function useStorefrontPreview(
  frameRef: RefObject<HTMLIFrameElement | null>,
  target: PreviewTarget | null,
  messageKey: string,
  message: PreviewMessage | null,
): boolean {
  const [ready, setReady] = useState(false);
  const latest = useRef<PreviewMessage | null>(message);
  useEffect(() => { latest.current = message; }, [messageKey, message]);

  useEffect(() => {
    setReady(false);
    if (!target) return;
    const onMessage = (e: MessageEvent) => {
      const win = frameRef.current?.contentWindow;
      if (!win || e.source !== win || e.origin !== target.origin || !isPreviewReady(e.data)) return;
      setReady(true);
      if (latest.current) win.postMessage(latest.current, target.origin);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [target, frameRef]);

  useEffect(() => {
    if (!ready || !target || !latest.current) return;
    const id = window.setTimeout(() => {
      if (latest.current) frameRef.current?.contentWindow?.postMessage(latest.current, target.origin);
    }, 150);
    return () => window.clearTimeout(id);
  }, [messageKey, ready, target, frameRef]);

  return ready;
}
```

If the repo's `react-hooks` lint config flags `setReady(false)` inside an effect (`react-hooks/set-state-in-effect`), key the reset on the target instead: store `readyFor: string | null` state holding the origin that said ready, and compute `ready = readyFor === target?.origin`. Fix the lint finding; don't disable the rule.

- [ ] **Step 2: Create `theme/LivePreview.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { ChevronDown, Monitor, Smartphone, Eye } from 'lucide-react';
import Card from '@/components/ui/Card.tsx';
import Spinner from '@/components/ui/Spinner.tsx';
import { cn } from '@/lib/cn.ts';
import CardHeader from '@/features/storefront-settings/ui/CardHeader.tsx';
import { buildPreviewMessage, previewTarget, type ThemeFormData } from '@/features/storefront-settings/template-form.ts';
import type { ThemeEditorContext } from './ThemeEditor.tsx';
import ThemePreview from './ThemePreview.tsx';
import { useStorefrontPreview } from './use-storefront-preview.ts';

type Device = 'desktop' | 'phone';
const FRAME = { desktop: { w: 1280, h: 800 }, phone: { w: 390, h: 760 } } as const;

export default function LivePreview({ ctx }: { ctx: ThemeEditorContext }) {
  const { control, catalog, template } = ctx;
  const target = useMemo(() => previewTarget(catalog.baseUrl), [catalog.baseUrl]);
  const [device, setDevice] = useState<Device>('desktop');
  const [openOnMobile, setOpenOnMobile] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  // Ruling F7: StorefrontSettingsPage mounts every tab (inactive ones are `hidden`), and Chromium loads
  // display:none iframes even with loading="lazy". So the iframe mounts only once the box has been
  // measured wider than 0 — i.e. the Appearance tab (and, on phones, the expanded Preview section) was
  // actually shown. Latched: hiding the tab again keeps the frame (and its connection) alive.
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect.width ?? 0;
      setBoxWidth(w);
      if (w > 0) setShown(true);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [target]);

  // useWatch without a name is a deep-partial snapshot; guard like ThemePreview does.
  const draft = useWatch({ control }) as Partial<ThemeFormData>;
  const complete = !!(draft.colors && draft.fonts && draft.template);
  const message = complete ? buildPreviewMessage(draft as ThemeFormData, template) : null;
  const messageKey = message ? JSON.stringify(message) : '';
  const ready = useStorefrontPreview(frameRef, target, messageKey, message);

  const frame = FRAME[device];
  const scale = boxWidth > 0 ? Math.min(1, boxWidth / frame.w) : 0;

  const deviceToggle = target ? (
    <div role="group" aria-label="Preview size" className="inline-flex rounded-md border border-border-default p-0.5">
      {(['desktop', 'phone'] as const).map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={device === d}
          onClick={() => setDevice(d)}
          className={cn('inline-flex items-center gap-1 rounded px-2 py-1 text-xs max-lg:min-h-11', device === d ? 'bg-bg-surface text-text-primary' : 'text-text-tertiary hover:text-text-secondary')}
        >
          {d === 'desktop' ? <Monitor className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
          {d === 'desktop' ? 'Desktop' : 'Phone'}
        </button>
      ))}
    </div>
  ) : undefined;

  return (
    <Card>
      <div className="space-y-3">
        <button
          type="button"
          className="flex w-full items-center justify-between lg:hidden max-lg:min-h-11"
          aria-expanded={openOnMobile}
          onClick={() => setOpenOnMobile((v) => !v)}
        >
          <span className="inline-flex items-center gap-2 text-base font-semibold text-text-primary"><Eye className="h-5 w-5 text-text-tertiary" /> Preview</span>
          <ChevronDown className={cn('h-4 w-4 transition-transform', openOnMobile && 'rotate-180')} />
        </button>
        <div className="hidden lg:block">
          <CardHeader icon={Eye} title="Preview" description={target ? 'Your live storefront with unsaved changes. Custom CSS shows after saving.' : undefined} right={deviceToggle} />
        </div>

        <div className={cn('space-y-3', !openOnMobile && 'max-lg:hidden')}>
          {target && <div className="lg:hidden">{deviceToggle}</div>}
          {target ? (
            <div ref={boxRef} className="relative w-full overflow-hidden rounded-lg border border-border-subtle bg-bg-base" style={{ height: scale ? frame.h * scale : 320 }}>
              {!ready && (
                <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 text-xs text-text-tertiary">
                  <Spinner size="sm" /> Connecting to storefront…
                </div>
              )}
              {shown && (
                <iframe
                  ref={frameRef}
                  title="Storefront preview"
                  src={target.src}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="absolute left-1/2 top-0 origin-top border-0 bg-white"
                  style={{ width: frame.w, height: frame.h, transform: `translateX(-50%) scale(${scale || 0.001})` }}
                />
              )}
            </div>
          ) : (
            <ThemePreview control={control} />
          )}
          {target && !ready && (
            <p className="text-xs text-text-tertiary">
              If this doesn't connect, the deployed storefront may predate templates. Deploy the latest release from the Deploy tab.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
```

Late mount is safe for the hook. `useStorefrontPreview` reads `frameRef.current` when a message arrives, not when it subscribes. The storefront only posts `sf-preview-ready` after its document mounts, and that happens after `shown` flips and the iframe renders. Don't add `loading="lazy"` as a substitute for `shown`, because it doesn't stop hidden-tab loads.

Sandbox rationale: the storefront needs its own scripts and same-origin storage to boot. `allow-same-origin` here means the storefront's own origin, which differs from the admin's, so it gains no admin access. Top-navigation isn't allowed, so the frame can't navigate the admin away.

- [ ] **Step 3: Replace the preview column in `ThemeEditor.tsx`**

Replace:

```tsx
      <div className="min-w-0 max-lg:order-first lg:sticky lg:top-4 lg:self-start">
        <Card><ThemePreview control={control} /></Card>
      </div>
```

with:

```tsx
      <div className="min-w-0 max-lg:order-first lg:sticky lg:top-4 lg:self-start">
        <LivePreview ctx={ctx} />
      </div>
```

Add `import LivePreview from './LivePreview.tsx';` and remove the now-unused `ThemePreview` import from `ThemeEditor.tsx`, since `LivePreview` owns it now.

- [ ] **Step 4: Build and lint gate**

Run: `npm run build 2>&1 | tail -5` → success.
Run: `node <scratch>/admin-templates/lint-gate.mjs storefront-settings/theme/` → `LINT GATE OK`.

- [ ] **Step 5: Commit**

```bash
git status --short
git add src/features/storefront-settings/theme/
git commit -m "feat(storefront): live storefront preview iframe with desktop/phone toggle

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Mocked browser pass and final gates

**The browser pass is run by the executor**, following memory `env-playwright-mocked-admin-pass` exactly. **Any UI fix it finds is made by a frontend-design subagent** (ruling F8; user preference `user-prefers-frontend-agent`). The executor writes up the failing scenario and the expected behaviour, dispatches the subagent, re-runs the pass and commits. The subagent's prompt must require it to load the `frontend-design:frontend-design` skill first. It gets the defect report, the relevant Task 3–5 text verbatim, and this plan's Global Constraints. The executor edits no `.tsx` itself.

**Files:**
- Scratch (not committed): `T:\Projects\ecommerce\.playwright-mcp\admin-templates.js`
- Fix commits only if the pass finds defects, touching files from Tasks 3–5. The frontend-design subagent writes the fixes; the executor commits them.

**Interfaces:**
- Consumes: the finished editor (Tasks 1–5).

- [ ] **Step 1: Start the mocked admin**

```bash
cd /t/Projects/ecommerce/ecommerce-admin-frontend
VITE_API_BASE_URL=http://localhost:3999/api/v1 VITE_WS_URL=http://localhost:3999 npx vite --port 5199 --strictPort
```

Run it in the background. Nothing listens on 3999; every API call is intercepted.

Precompute a JWT with node: `node -e "const b=s=>Buffer.from(JSON.stringify(s)).toString('base64url');console.log('x.'+b({exp:4102444800,sub:'u1'})+'.y')"`. Inline the output as `TOKEN` in the script, because the MCP sandbox has no `Buffer`/`btoa`.

- [ ] **Step 2: Write the Playwright script**

`T:\Projects\ecommerce\.playwright-mcp\admin-templates.js` must be a **bare async function expression**: no `export`, no trailing semicolon. It must start with `await page.unrouteAll({ behavior: 'ignoreErrors' })`, since handlers persist between runs.

The script:
- Seeds `localStorage` with `access_token` = TOKEN, `refresh_token`, and `auth_user` = `{ id:'u1', username:'admin', name:'Admin', email:'a@x.io', role:'admin', updatedAt:'2026-09-28T00:00:00Z' }`. The `name` field is required, or `Avatar` crashes.
- Routes `**/socket.io/**` → abort.
- Routes `**/localhost:3999/**`, dispatching on the URL path:
  - `/account/me` → the user plus `permissions: { modules: { storefront: 'write' }, landingModule: 'storefront' }`;
  - `GET /storefront-settings` → a **fully shaped** `StorefrontSettings` (all 7 `cutoffs.days`, `features`, `brand`, `branding`, `notices: []`, `supportLinks: []`), with `theme` = `window.__theme`, which the script sets per scenario;
  - `GET /storefront-settings/templates` → `window.__catalog`, or status 404 when `window.__catalog === 404`;
  - `PUT /storefront-settings` → records `JSON.parse(request.postData())` into an array the script reads back, then answers with the settings updated to the new theme;
  - `/storefront-deploy/target` → `{ zoneId:'z', zoneName:'example.com', hostname:'shop.example.com' }`;
  - anything else → `{ success: true, data: [] }`.
- Routes `http://localhost:5198/**` (the fake storefront, the catalog's `baseUrl`) → fulfils `text/html` with:
  ```html
  <!doctype html><title>sf</title><a id="nav" href="/?sf-preview=1&p=2">nav</a>
  <script>
  window.__msgs = [];
  addEventListener('message', function (e) { window.__msgs.push({ origin: e.origin, data: e.data }); });
  parent.postMessage({ type: 'sf-preview-ready' }, '*');
  </script>
  ```
- The catalog fixture has `source: 'deployed'`, `baseUrl: 'http://localhost:5198'`, and templates `modern` (from `FALLBACK_CATALOG`), `dark-luxury` (presets gold/silver; editable colors+density; fonts/radius locked; options `grain`/`orb` boolean) and `cyber-brutalism` (the Task 2 check fixture: presets acid-dark/purple-light; options systemBar/nodeLabel/mode). Mark one imported template with `builtIn: false`.

Scenarios. Each sets `__theme`/`__catalog` via `page.addInitScript`, then does `page.goto('http://localhost:5199/storefront-settings')` and clicks the **Appearance** tab. Viewport is 1440×900 unless stated.

0. **No iframe on hidden tabs** (ruling F7). Use scenario 3's theme and the deployed catalog. After `goto` and before clicking Appearance (the page opens on General), wait 1 s. Assert:
   - `iframe[title="Storefront preview"]` count is 0;
   - no request to `http://localhost:5198` was made (count them in the 5198 route handler).

   Click Appearance. The iframe must appear and receive a `sf-preview-theme` message.

1. **Old-shape theme** (Review Focus 1): the theme has no `template`/`preset`/`options` and custom colours (`primary: '#ff0000'`). Assert:
   - Modern's radio is `aria-checked="true"`;
   - the Primary hex shows `#ff0000`;
   - no lock icons ("Set by" text count = 0).

   Change density → Save. Assert the recorded PUT's `theme.template === 'modern'`, that `theme.preset` is a string, and that `theme.options` deep-equals `{}`.
2. **Catalog 404** (Review Focus 2): `__catalog = 404`. Assert:
   - the editor renders (the Customise heading is visible);
   - only one template radio exists;
   - the text "built-in templates only" is visible;
   - the swatch preview is shown and no iframe exists (`iframe[title="Storefront preview"]` count 0).

   **2b. Catalog 404 with a stored non-modern template** (ruling F1): `__catalog = 404`, and the theme is scenario 5's shape but with `template: 'cyber-brutalism'`, `preset: 'acid-dark'`, `options: { systemBar: false }`. Assert:
   - the alert contains "Template catalog unavailable";
   - the alert does not contain "showing Modern".

   Change the Primary colour → Save. Assert the PUT keeps `template === 'cyber-brutalism'`, `preset === 'acid-dark'`, and `options` deep-equals `{ systemBar: false }`.
3. **Pick template with confirm**: start from scenario 1's theme. Click Cyber Brutalism → the dialog "Replace your theme values?" appears → click Replace. Assert:
   - Corner radius shows "Set by Cyber Brutalism";
   - the fonts are locked;
   - the scheme select offers Dark and Light.

   Click the Purple Light chip → **no** dialog (the form equals the acid-dark preset). The options card shows "System bar"; toggle it off and set Node label to `SHOP_7`. Save. Assert the PUT has `template: 'cyber-brutalism'`, `preset: 'purple-light'`, `radius: 'none'`, `options.systemBar === false` and `options.nodeLabel === 'SHOP_7'`.
4. **Preview messaging** (Review Focus 5): after scenario 3's edits (before saving), get the iframe's frame via `page.frames().find(f => f.url().startsWith('http://localhost:5198'))` and read `window.__msgs` with `frame.evaluate`. Assert:
   - at least one message, with `data.type === 'sf-preview-theme'`;
   - `'customCss' in data.theme === false`;
   - `data.theme.template === 'cyber-brutalism'`.

   Type `a{}` into Custom CSS, wait 400 ms, and assert the latest message still has no `customCss`. Then click `#nav` inside the frame, wait for the new document, and read `window.__msgs` again: at least one `sf-preview-theme` must have been re-posted to the new document.

   Finally, with `page.evaluate`, post a spoofed `{ type: 'sf-preview-ready' }` from the admin window itself (`window.postMessage(..., '*')`). Assert it caused no new message in the frame, because it came from the wrong source.
5. **Unavailable template** (Review Focus 4): the theme has `template: 'acme-noir'`, `preset: 'x'`, `options: { foo: true }`. Assert:
   - the alert "“acme-noir” is unavailable" is visible. The catalog here is `deployed`, so the wording that says the storefront is showing Modern applies;
   - no "Set by" text is present;
   - the options card is absent.

   Change the Primary colour → Save. Assert the PUT has `template === 'acme-noir'` and `options` deep-equals `{ foo: true }`.
6. **Read-only user**: `permissions.modules.storefront = 'read'`. Assert:
   - template radios are disabled;
   - after `click({ force: true })` on the Cyber Brutalism radio (ruling F6; a plain `click` waits for an enabled element and times out), that radio is still `aria-checked="false"`, Modern is still `aria-checked="true"`, and there's no save bar and no "Replace your theme values?" dialog;
   - the Desktop/Phone toggle still works (click Phone → the iframe `style.width === '390px'`).
7. **Phone layout**: viewport 390×844, scenario 3's theme. Assert:
   - `document.querySelector('main').scrollWidth <= document.querySelector('main').clientWidth + 1` (check `<main>`, not `documentElement`, per memory);
   - the Preview section is collapsed and expands on tap;
   - template cards stack in one column: every `[role="radiogroup"][aria-label="Storefront template"] [role="radio"]` shares the same `getBoundingClientRect().left`. Scope the query to the template radiogroup (ruling F6), because the preset chips are `role="radio"` too and sit in a wrapping row;
   - the save bar buttons are at least 44 px tall after an edit.

   Take screenshots at 1440 and 390 into `T:\Projects\ecommerce\.playwright-mcp\`.

- [ ] **Step 3: Run it via Playwright MCP**

Load the tools with `ToolSearch` query `select:mcp__plugin_playwright_playwright__browser_navigate,mcp__plugin_playwright_playwright__browser_run_code_unsafe,mcp__plugin_playwright_playwright__browser_take_screenshot`. Navigate once to `http://localhost:5199`, then run `browser_run_code_unsafe` with `filename` = the script path.

Expected: every assertion passes. The script should `throw new Error('<scenario>: <what>')` on the first failure so the output names it.

- [ ] **Step 4: Fix and re-run until green**

For each failing scenario, dispatch the frontend-design subagent (see the task header) with the scenario name, the thrown message, and the relevant Task 3–5 text. When it returns, the executor re-runs Step 3, checks the Step 5 gates, then commits the fixes:

```bash
git status --short
git add src/features/storefront-settings/theme/<changed files>
git commit -m "fix(storefront): <what the browser pass found>

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Final gates**

```bash
node "C:/Users/Nobody/AppData/Local/Temp/claude/T--Projects-ecommerce/79c355d8-ae38-4045-94ce-9a1793c21c60/scratchpad/admin-templates/template-form.check.ts"   # ALL PASS
npm run build 2>&1 | tail -5                                                          # success
node "C:/Users/Nobody/AppData/Local/Temp/claude/T--Projects-ecommerce/79c355d8-ae38-4045-94ce-9a1793c21c60/scratchpad/admin-templates/lint-gate.mjs" storefront-settings/theme/ storefront-settings/template-form.ts storefront-settings/AppearanceTab.tsx src/types/storefront-settings.ts src/api/storefront-settings.ts   # LINT GATE OK
git status --short                                                                    # only " M .env" left
git log --oneline main..HEAD                                                          # this plan's commits only
```

Then kill Vite: `netstat -ano | grep :5199` → `taskkill //PID <pid> //F //T`.

Report:
- the baseline and final lint totals;
- the check-script output;
- each browser scenario's result;
- screenshot paths;
- that nothing is pushed. Merging and pushing are the user's call, and this repo ships after the backend and storefront release.
