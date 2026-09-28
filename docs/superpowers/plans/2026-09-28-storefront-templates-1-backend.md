# Storefront Templates — Plan 1: Backend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `ecommerce-backend` store a storefront template choice (`theme.template/preset/options`), capture each deployed storefront release's template catalog, and serve that catalog to the admin SPA at `GET /api/v1/storefront-settings/templates`.

**Architecture:** The theme schema gains three defaulted fields, so every stored theme still parses (as `modern`) with no migration. A new pure library, `src/lib/storefront-templates.ts`, validates a release's `templates.json`. The deploy job parses the catalog right after `extract` and persists it only in `finalize`, so a failed deploy never replaces the catalog. A new `templates.ts` file in the storefront-settings module resolves the catalog through the chain deployed → live fetch → `STOREFRONT_TEMPLATES_URL` → a modern-only fallback. The backend never validates a template id against a catalog, so adding a template never needs a backend release.

**Tech Stack:** Express 5, zod 4 (`z.looseObject`, `z.discriminatedUnion`), vitest 4, fflate (test zips), pino.

**Spec:** `ecommerce-storefront/docs/superpowers/specs/2026-09-28-storefront-templates-design.md` — §2 (backend), §1.9 (catalog file shape), §1.4 (option shape), §7 (rollout).

## Global Constraints

- Repo: `T:\Projects\ecommerce\ecommerce-backend`. Run every `npm`/`npx` command from this directory.
- Branch: `feature/storefront-templates`, created from `main`. The working tree has an unrelated uncommitted `webapp/index.html`. **Never stage it.** Always `git add` explicit paths, never `git add -A` or `git add .`.
- Imports are extensionless everywhere (`from './templates'`). This is required for drizzle-kit.
- Throw `AppError` subclasses from `src/utils/errors`. Never catch an error and hand-build an error response. (No new throw sites are expected: the catalog code degrades instead of throwing.)
- Module structure is `router.ts` / `controller.ts` / `service.ts` / `schemas.ts`. Helper files beside them follow the existing `branding.ts` / `store.ts` precedent, and the new `templates.ts` joins them.
- `npx tsc --noEmit` does **not** typecheck `*.test.ts`. Only `npm test` catches broken test call sites, so run both before every commit that touches tests.
- Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  ```
- Template id / preset id regex: `/^[a-z0-9-]{1,40}$/`. Option key regex: `/^[a-zA-Z0-9_-]{1,40}$/`. At most 30 options; option string values at most 100 chars.
- Setting key for the captured catalog: `storefront_templates_catalog`, holding the JSON `{ tag, capturedAt, templates }`.
- Live fetch: 5 s timeout, 5-min in-memory cache for successes, 60 s for failures.
- Deploy order: **backend first**, then a storefront release (then redeploy clients), then the admin SPA.
- The admin deploy progress UI (`ecommerce-admin-frontend/.../deploy/DeployProgress.tsx`) hardcodes the step list. **Do not add a new deploy `Step` value.** Catalog parsing runs inside the existing flow, logging only (see Ruling R1).

## Rulings (spec gaps resolved in this plan)

- **R1:** The spec's "new deploy-job step `templates`" is implemented as parsing plus a log line straight after the `extract` step, with persistence in `finalize`. It is not a new `Step` value. That keeps the admin's "Step N of 9" list correct without an admin change, and a deploy that fails after extract leaves the previous catalog in place.
- **R2:** A release without a catalog, or with an invalid one, **deletes** `storefront_templates_catalog` rather than writing a JSON `null`. Reads treat "absent" and "null" the same, and deleting lets the live-fetch fallback work.
- **R3:** Catalog validation is per template. A template with a bad id, a duplicate id, a missing `defaultPreset` or an unsafe `preview` is dropped, with a warning. Option entries with an unknown `type` are dropped from that template, for forward compatibility. Unknown extra keys on template, preset and option objects are kept (`looseObject`). Only zero valid templates, a wrong `schemaVersion` or unparseable JSON invalidate the whole file.
- **R4:** The endpoint always includes `modern`. If a catalog lacks it, the built-in `MODERN_FALLBACK` entry is prepended, because the storefront always ships `modern`.
- **R5:** `baseUrl` is `storefront_public_url` (set by a successful deploy), else `https://{storefront_cf_hostname}`. For the `STOREFRONT_TEMPLATES_URL` source it is that URL's origin. For the `fallback` source it is `null`, so the admin never iframes a storefront that predates templates and can't understand preview messages.
- **R6:** `PUT /storefront-settings` uses a separate theme input schema whose template fields are optional **without** defaults. When the input omits them, the service keeps the stored values, so an older admin SPA that saves the colour form can't silently reset a client's template to `modern`.
- **R7:** `preview` must be an origin-relative path (`/…`, not `//…`, no scheme, no whitespace or backslash, ≤300 chars), so the admin never loads an image from an arbitrary host.
- **R8:** `MODERN_FALLBACK` duplicates `DEFAULT_THEME`'s colours instead of importing `modules/storefront-settings/service` into `src/lib`, which would pull db/bot-settings into a pure lib. A test pins the two together.

## Review Focus

1. **An older admin SPA saves the theme** without `template/preset/options` → the stored template must survive, not reset to `modern`. Pinned in Task 1 (`mergeThemeInput` + update-schema tests).
2. **A hand-deployed storefront on an older release** answers `/templates.json` with `index.html` (200, SPA fallback) → treat it as a failed fetch, cache that for 60 s, and don't hang every admin page load for up to 5 s. Pinned in Task 4.
3. **One broken template, or a future option `type`**, must not wipe the whole catalog → drop only the bad entry. Pinned in Task 2.
4. **A deploy that fails after `extract`** (e.g. the script upload fails) must not replace the currently captured catalog with the undeployed release's. Pinned in Task 3.
5. **A malicious or careless `preview` value** (`//evil.example/x.webp`, `https://…`) must be rejected so the admin can't be pointed at a foreign host. Pinned in Task 2.

---

### Task 1: Theme schema — template fields, PUT merge

**Files:**
- Modify: `src/modules/storefront-settings/schemas.ts` (the `storefrontThemeSchema` block at ~L63–84, plus `updateStorefrontSettingsSchema.theme` at ~L101)
- Modify: `src/modules/storefront-settings/service.ts` (imports ~L24–39, `DEFAULT_THEME` at ~L79–89, `updateStorefrontSettings` theme block at ~L228–232)
- Test: `src/modules/storefront-settings/schemas.test.ts`

**Interfaces:**
- Produces:
  - `storefrontThemeSchema`: stored/read shape, with `template: string` (default `'modern'`), `preset: string | null` (default `null`) and `options: Record<string, boolean | string>` (default `{}`).
  - `storefrontThemeInputSchema`: PUT shape; the same three fields are optional with no default.
  - `type StorefrontTheme = z.infer<typeof storefrontThemeSchema>`
  - `type StorefrontThemeInput = z.infer<typeof storefrontThemeInputSchema>`
  - `mergeThemeInput(input: StorefrontThemeInput, stored: StorefrontTheme): StorefrontTheme`, exported from `service.ts`.
  - `DEFAULT_THEME` gains `template: 'modern', preset: null, options: {}`.

- [ ] **Step 1: Create the branch**

```bash
cd /t/Projects/ecommerce/ecommerce-backend
git checkout main
git checkout -b feature/storefront-templates
git status --short   # expect only " M webapp/index.html" (unrelated; never stage it)
```

- [ ] **Step 2: Write the failing tests**

Append to `src/modules/storefront-settings/schemas.test.ts`, and change its import lines at the top to:

```ts
import { describe, expect, it } from 'vitest';
import { storefrontThemeSchema, updateStorefrontSettingsSchema } from './schemas';
import { DEFAULT_THEME, mergeThemeInput } from './service';
```

Then append:

```ts
// A theme exactly as stored before templates existed.
const PRE_TEMPLATE_THEME = {
  scheme: 'dark',
  colors: DEFAULT_THEME.colors,
  fonts: DEFAULT_THEME.fonts,
  radius: 'none',
  density: 'comfortable',
  customCss: '',
} as const;

describe('storefrontThemeSchema template fields', () => {
  it('parses a theme stored before templates existed as modern with no preset or options', () => {
    expect(storefrontThemeSchema.parse(PRE_TEMPLATE_THEME)).toMatchObject({ template: 'modern', preset: null, options: {} });
  });

  it('keeps an explicit template, preset and options', () => {
    const t = storefrontThemeSchema.parse({ ...PRE_TEMPLATE_THEME, template: 'cyber-brutalism', preset: 'acid-dark', options: { systemBar: false, nodeLabel: 'CYBR_01' } });
    expect(t).toMatchObject({ template: 'cyber-brutalism', preset: 'acid-dark', options: { systemBar: false, nodeLabel: 'CYBR_01' } });
  });

  it.each(['Dark Luxury', '../modern', 'dark_luxury', '', 'a'.repeat(41)])('rejects template id %j', (template) => {
    expect(() => storefrontThemeSchema.parse({ ...PRE_TEMPLATE_THEME, template })).toThrow();
  });

  it('rejects a preset id that is not a slug', () => {
    expect(() => storefrontThemeSchema.parse({ ...PRE_TEMPLATE_THEME, preset: 'Gold!' })).toThrow();
  });

  it('rejects more than 30 options', () => {
    const options = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`k${i}`, true]));
    expect(() => storefrontThemeSchema.parse({ ...PRE_TEMPLATE_THEME, options })).toThrow(/30/);
  });

  it('accepts exactly 30 options', () => {
    const options = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, true]));
    expect(Object.keys(storefrontThemeSchema.parse({ ...PRE_TEMPLATE_THEME, options }).options)).toHaveLength(30);
  });

  it('rejects an option string over 100 characters', () => {
    expect(() => storefrontThemeSchema.parse({ ...PRE_TEMPLATE_THEME, options: { nodeLabel: 'x'.repeat(101) } })).toThrow();
  });

  it('rejects option keys with punctuation and non-scalar values', () => {
    expect(() => storefrontThemeSchema.parse({ ...PRE_TEMPLATE_THEME, options: { 'a.b': true } })).toThrow();
    expect(() => storefrontThemeSchema.parse({ ...PRE_TEMPLATE_THEME, options: { grain: 1 } })).toThrow();
    expect(() => storefrontThemeSchema.parse({ ...PRE_TEMPLATE_THEME, options: { grain: { on: true } } })).toThrow();
  });

  it('gives DEFAULT_THEME the modern template', () => {
    expect(DEFAULT_THEME).toMatchObject({ template: 'modern', preset: null, options: {} });
  });
});

describe('updateStorefrontSettingsSchema.theme', () => {
  it('accepts a theme without template fields and does NOT inject defaults (so the stored ones survive)', () => {
    const parsed = updateStorefrontSettingsSchema.parse({ theme: PRE_TEMPLATE_THEME });
    expect(parsed.theme!.template).toBeUndefined();
    expect(parsed.theme!.preset).toBeUndefined();
    expect(parsed.theme!.options).toBeUndefined();
  });

  it('still validates template fields when present', () => {
    expect(() => updateStorefrontSettingsSchema.parse({ theme: { ...PRE_TEMPLATE_THEME, template: 'Not A Slug' } })).toThrow();
  });
});

describe('mergeThemeInput', () => {
  const stored = { ...DEFAULT_THEME, template: 'dark-luxury', preset: 'gold', options: { grain: false } };

  it('keeps the stored template, preset and options when the input omits them (older admin SPA)', () => {
    const merged = mergeThemeInput({ ...PRE_TEMPLATE_THEME, colors: { ...DEFAULT_THEME.colors, primary: '#123456' } }, stored);
    expect(merged).toMatchObject({ template: 'dark-luxury', preset: 'gold', options: { grain: false } });
    expect(merged.colors.primary).toBe('#123456');
  });

  it('lets the input replace them, including clearing preset to null and options to {}', () => {
    const merged = mergeThemeInput({ ...PRE_TEMPLATE_THEME, template: 'modern', preset: null, options: {} }, stored);
    expect(merged).toMatchObject({ template: 'modern', preset: null, options: {} });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/modules/storefront-settings/schemas.test.ts`
Expected: FAIL. `mergeThemeInput` is not exported, and the template-field assertions fail (`template` is undefined).

- [ ] **Step 4: Implement the schema**

In `src/modules/storefront-settings/schemas.ts`, replace the whole `export const storefrontThemeSchema = z.object({ … });` block with:

```ts
const templateSlug = z.string().regex(/^[a-z0-9-]{1,40}$/, 'Lowercase letters, digits and hyphens only (max 40)');
const themeOptionsSchema = z
  .record(z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/, 'Option keys: letters, digits, _ and - (max 40)'), z.union([z.boolean(), z.string().max(100)]))
  .refine((o) => Object.keys(o).length <= 30, { message: 'At most 30 template options' });

const themeBaseShape = {
  scheme: z.enum(['dark', 'light']),
  colors: z.object({
    primary: hexColor,
    bg: hexColor,
    surface: hexColor,
    text: hexColor,
    muted: hexColor,
    success: hexColor,
    warn: hexColor,
    danger: hexColor,
  }),
  fonts: z.object({
    heading: fontName.nullable(),
    body: fontName.nullable(),
    mono: fontName.nullable(),
  }),
  radius: z.enum(['none', 'sm', 'md', 'lg', 'xl']),
  density: z.enum(['comfortable', 'compact']),
  customCss: z.string().max(20 * 1024),
};

/** Stored/read shape. The template fields default so every theme saved before
 *  templates existed parses as `modern` — no migration. The backend never checks
 *  `template` against a catalog: an unknown id renders as modern storefront-side,
 *  so adding a template never needs a backend release. */
export const storefrontThemeSchema = z.object({
  ...themeBaseShape,
  template: templateSlug.default('modern'),
  preset: templateSlug.nullable().default(null),
  options: themeOptionsSchema.default({}),
});

/** PUT shape. Template fields are optional with NO default: an older admin SPA
 *  that saves the colour form without them keeps the stored template (see
 *  mergeThemeInput) instead of silently resetting the client to modern. */
export const storefrontThemeInputSchema = z.object({
  ...themeBaseShape,
  template: templateSlug.optional(),
  preset: templateSlug.nullable().optional(),
  options: themeOptionsSchema.optional(),
});
```

Below the existing `export type StorefrontTheme = z.infer<typeof storefrontThemeSchema>;` line, add:

```ts
export type StorefrontThemeInput = z.infer<typeof storefrontThemeInputSchema>;
```

In `updateStorefrontSettingsSchema`, change `theme: storefrontThemeSchema.optional(),` to:

```ts
  theme: storefrontThemeInputSchema.optional(),
```

- [ ] **Step 5: Implement the default and the merge**

In `src/modules/storefront-settings/service.ts`:

1. In the `from './schemas'` import list, add `type StorefrontThemeInput,` after `type StorefrontTheme,`.
2. In `DEFAULT_THEME`, add after `customCss: '',`:

```ts
  template: 'modern',
  preset: null,
  options: {},
```

3. Add this exported function directly below `DEFAULT_THEME`:

```ts
/** Fills template fields the PUT omitted from what is stored, so a theme saved by
 *  an admin SPA that predates templates never resets the client to modern. */
export function mergeThemeInput(input: StorefrontThemeInput, stored: StorefrontTheme): StorefrontTheme {
  return {
    ...input,
    template: input.template ?? stored.template,
    preset: input.preset !== undefined ? input.preset : stored.preset,
    options: input.options ?? stored.options,
  };
}
```

4. In `updateStorefrontSettings`, replace:

```ts
  if (input.theme !== undefined) {
    const customCss = input.theme.customCss ? sanitizeCustomCss(input.theme.customCss) : '';
    themeSettingValue = JSON.stringify({ ...input.theme, customCss });
  }
```

with:

```ts
  if (input.theme !== undefined) {
    const stored = parseJsonSetting(await getStorefrontSetting(KEYS.theme), DEFAULT_THEME, storefrontThemeSchema);
    const merged = mergeThemeInput(input.theme, stored);
    const customCss = merged.customCss ? sanitizeCustomCss(merged.customCss) : '';
    themeSettingValue = JSON.stringify({ ...merged, customCss });
  }
```

(`parseJsonSetting` is declared lower in the file as a function declaration, so it is hoisted and usable here.)

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run src/modules/storefront-settings/schemas.test.ts`
Expected: PASS (including the three pre-existing `radius` tests).

Run: `npx tsc --noEmit`
Expected: no errors. `getPublicStorefrontSettings` returns `theme: settings.theme`, so the new fields reach `/public/storefront/settings` with no further change.

- [ ] **Step 7: Commit**

```bash
git add src/modules/storefront-settings/schemas.ts src/modules/storefront-settings/service.ts src/modules/storefront-settings/schemas.test.ts
git commit -m "feat(storefront-settings): theme template/preset/options, kept when a PUT omits them

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Template catalog library

**Files:**
- Create: `src/lib/storefront-templates.ts`
- Test: `src/lib/storefront-templates.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 at runtime (R8). The test imports `DEFAULT_THEME` to pin the colours.
- Produces (all exported from `src/lib/storefront-templates.ts`):
  - `TEMPLATE_CATALOG_KEY = 'storefront_templates_catalog'`
  - `TEMPLATE_CATALOG_FILE = 'templates.json'`
  - `type CatalogTemplate`: a validated template (§1.9 shape, unknown keys kept).
  - `type CatalogParseResult = { templates: CatalogTemplate[]; dropped: string[] } | { error: string }`
  - `parseTemplateCatalog(raw: unknown): CatalogParseResult`
  - `readTemplateCatalogFile(bytes: Uint8Array): CatalogParseResult`: size guard (1 MiB), JSON guard, then `parseTemplateCatalog`. Never throws.
  - `readReleaseTemplateCatalog(files: Map<string, Uint8Array>, assetsDirectory: string): CatalogParseResult`: never throws.
  - `MODERN_FALLBACK: CatalogTemplate`
  - `withModern(templates: CatalogTemplate[]): CatalogTemplate[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/storefront-templates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { strToU8 } from 'fflate';
import {
  MODERN_FALLBACK,
  parseTemplateCatalog,
  readReleaseTemplateCatalog,
  readTemplateCatalogFile,
  withModern,
} from './storefront-templates';
import { DEFAULT_THEME } from '../modules/storefront-settings/service';

function tpl(over: Record<string, unknown> = {}) {
  return {
    id: 'dark-luxury',
    name: 'Dark Luxury',
    version: '1.0.0',
    description: 'Warm metallic accents on near-black',
    author: 'Kratos',
    schemes: ['dark'],
    presets: [{
      id: 'gold', name: 'Gold', scheme: 'dark',
      colors: { primary: '#d4a03c', bg: '#0a0907', surface: '#161412', text: '#f0ebe0', muted: '#8a8070', success: '#3d9e5c', warn: '#e8b84e', danger: '#b83c38' },
      fonts: { heading: { family: 'Inter', weights: [400, 700] }, body: { family: 'Inter', weights: [400] }, mono: { family: 'JetBrains Mono', weights: [400, 500] } },
      radius: 'lg',
    }],
    defaultPreset: 'gold',
    editable: { colors: ['primary', 'bg'], fonts: false, radius: false, density: true },
    options: [{ key: 'grain', type: 'boolean', label: 'Grain texture', default: true }],
    preview: '/templates/dark-luxury/preview.abc123.webp',
    builtIn: true,
    ...over,
  };
}
const file = (templates: unknown[]) => ({ schemaVersion: 1, templates });

describe('parseTemplateCatalog', () => {
  it('accepts a valid catalog', () => {
    const r = parseTemplateCatalog(file([tpl()]));
    expect(r).toMatchObject({ dropped: [] });
    expect('templates' in r && r.templates.map((t) => t.id)).toEqual(['dark-luxury']);
  });

  it('rejects an unsupported schemaVersion outright', () => {
    expect(parseTemplateCatalog({ schemaVersion: 2, templates: [tpl()] })).toEqual({ error: expect.stringMatching(/schemaVersion 2/) });
    expect(parseTemplateCatalog(null)).toEqual({ error: expect.stringMatching(/schemaVersion/) });
  });

  it('keeps unknown keys for forward compatibility', () => {
    const r = parseTemplateCatalog(file([tpl({ futureField: 'x' })]));
    expect('templates' in r && (r.templates[0] as Record<string, unknown>).futureField).toBe('x');
  });

  it('drops only option entries with an unknown type, keeping the template', () => {
    const r = parseTemplateCatalog(file([tpl({ options: [
      { key: 'grain', type: 'boolean', label: 'Grain', default: true },
      { key: 'accent', type: 'color', label: 'Accent', default: '#fff' },
      { key: 'nodeLabel', type: 'text', label: 'Node', default: 'NODE_01', maxLength: 24 },
      { key: 'layout', type: 'select', label: 'Layout', default: 'a', choices: [{ value: 'a', label: 'A' }] },
    ] })]));
    expect('templates' in r && r.templates[0]!.options.map((o) => o.key)).toEqual(['grain', 'nodeLabel', 'layout']);
  });

  it('drops one bad template and keeps the rest, reporting why', () => {
    const r = parseTemplateCatalog(file([tpl({ id: 'Dark Luxury' }), tpl({ id: 'cyber-brutalism' })]));
    expect('templates' in r && r.templates.map((t) => t.id)).toEqual(['cyber-brutalism']);
    expect('dropped' in r && r.dropped).toHaveLength(1);
  });

  it('drops a duplicate template id', () => {
    const r = parseTemplateCatalog(file([tpl(), tpl({ name: 'Copy' })]));
    expect('templates' in r && r.templates).toHaveLength(1);
    expect('dropped' in r && r.dropped[0]).toMatch(/duplicate/);
  });

  it('drops a template whose defaultPreset is not one of its presets', () => {
    expect(parseTemplateCatalog(file([tpl({ defaultPreset: 'silver' })]))).toEqual({ error: expect.stringMatching(/no valid templates/) });
  });

  it('drops a template with duplicate preset ids or duplicate option keys', () => {
    const preset = tpl().presets[0];
    expect(parseTemplateCatalog(file([tpl({ presets: [preset, preset] })]))).toHaveProperty('error');
    const opt = { key: 'grain', type: 'boolean', label: 'Grain', default: true };
    expect(parseTemplateCatalog(file([tpl({ options: [opt, opt] })]))).toHaveProperty('error');
  });

  it.each(['//evil.example/x.webp', 'https://evil.example/x.webp', 'javascript:alert(1)', 'preview.webp', '/a b.webp', '/a\\b.webp'])(
    'rejects preview %j (must be an origin-relative path)',
    (preview) => {
      expect(parseTemplateCatalog(file([tpl({ preview })]))).toHaveProperty('error');
    },
  );

  it('accepts a template without a preview', () => {
    const { preview: _omit, ...noPreview } = tpl();
    expect(parseTemplateCatalog(file([noPreview]))).toHaveProperty('templates');
  });

  it('accepts preview: null (what the storefront emits for a template without a thumbnail)', () => {
    expect(parseTemplateCatalog(file([tpl({ preview: null })]))).toHaveProperty('templates');
  });

  it('errors when no template is valid', () => {
    expect(parseTemplateCatalog(file([]))).toEqual({ error: expect.stringMatching(/no valid templates/) });
  });
});

describe('readTemplateCatalogFile', () => {
  it('rejects invalid JSON (e.g. an SPA index.html) without throwing', () => {
    expect(readTemplateCatalogFile(strToU8('<!doctype html><html></html>'))).toEqual({ error: expect.stringMatching(/not valid JSON/) });
  });

  it('rejects a file over 1 MiB', () => {
    expect(readTemplateCatalogFile(new Uint8Array(1024 * 1024 + 1))).toEqual({ error: expect.stringMatching(/1 MiB/) });
  });

  it('parses a valid file', () => {
    expect(readTemplateCatalogFile(strToU8(JSON.stringify(file([tpl()]))))).toHaveProperty('templates');
  });
});

describe('readReleaseTemplateCatalog', () => {
  it('reads templates.json from the assets directory', () => {
    const files = new Map([['web/dist/templates.json', strToU8(JSON.stringify(file([tpl()])))]]);
    expect(readReleaseTemplateCatalog(files, 'web/dist')).toHaveProperty('templates');
  });

  it('reports a release that predates templates', () => {
    expect(readReleaseTemplateCatalog(new Map(), 'web/dist')).toEqual({ error: expect.stringMatching(/no templates\.json/) });
  });
});

describe('MODERN_FALLBACK / withModern', () => {
  it('uses DEFAULT_THEME colours and is itself a valid catalog entry', () => {
    expect(MODERN_FALLBACK.presets[0]!.colors).toEqual(DEFAULT_THEME.colors);
    const r = parseTemplateCatalog(file([MODERN_FALLBACK]));
    expect('templates' in r && r.templates[0]!.id).toBe('modern');
  });

  it('prepends modern only when it is missing', () => {
    const lux = parseTemplateCatalog(file([tpl()]));
    if (!('templates' in lux)) throw new Error('fixture invalid');
    expect(withModern(lux.templates).map((t) => t.id)).toEqual(['modern', 'dark-luxury']);
    expect(withModern([MODERN_FALLBACK, ...lux.templates]).map((t) => t.id)).toEqual(['modern', 'dark-luxury']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/storefront-templates.test.ts`
Expected: FAIL, "Failed to resolve import ./storefront-templates".

- [ ] **Step 3: Implement the library**

Create `src/lib/storefront-templates.ts`:

```ts
import { z } from 'zod';

/** Storefront setting that holds the catalog captured from the deployed release. */
export const TEMPLATE_CATALOG_KEY = 'storefront_templates_catalog';
/** Emitted by the storefront build at the root of its assets directory. */
export const TEMPLATE_CATALOG_FILE = 'templates.json';
const MAX_CATALOG_BYTES = 1024 * 1024;

const slug = z.string().regex(/^[a-z0-9-]{1,40}$/);
const optionKey = z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const scheme = z.enum(['dark', 'light']);
const colorKey = z.enum(['primary', 'bg', 'surface', 'text', 'muted', 'success', 'warn', 'danger']);
// Origin-relative only: '/x', never '//host', a scheme, whitespace or a backslash.
const previewPath = z.string().max(300).regex(/^\/(?!\/)[^\s\\]*$/);

const fontSpec = z
  .looseObject({
    family: z.string().trim().min(1).max(50).regex(/^[A-Za-z0-9 ]+$/),
    weights: z.array(z.number().int().min(100).max(1000)).min(1).max(9),
  })
  .nullable();

const presetSchema = z.looseObject({
  id: slug,
  name: z.string().min(1).max(60),
  scheme,
  colors: z.object({
    primary: hex, bg: hex, surface: hex, text: hex, muted: hex, success: hex, warn: hex, danger: hex,
  }),
  fonts: z.object({ heading: fontSpec, body: fontSpec, mono: fontSpec }),
  radius: z.enum(['none', 'sm', 'md', 'lg', 'xl']),
});

const optionBase = { key: optionKey, label: z.string().min(1).max(80), help: z.string().max(200).optional() };
const templateOptionSchema = z.discriminatedUnion('type', [
  z.looseObject({ ...optionBase, type: z.literal('boolean'), default: z.boolean() }),
  z.looseObject({
    ...optionBase,
    type: z.literal('select'),
    default: z.string().max(100),
    choices: z.array(z.object({ value: z.string().min(1).max(100), label: z.string().min(1).max(80) })).min(1).max(20),
  }),
  z.looseObject({ ...optionBase, type: z.literal('text'), default: z.string().max(100), maxLength: z.number().int().min(1).max(100) }),
]);
export type CatalogTemplateOption = z.infer<typeof templateOptionSchema>;

const templateSchema = z
  .looseObject({
    id: slug,
    name: z.string().min(1).max(60),
    version: z.string().min(1).max(40),
    description: z.string().max(500),
    author: z.string().max(100),
    schemes: z.array(scheme).min(1).max(2),
    presets: z.array(presetSchema).min(1).max(20),
    defaultPreset: slug,
    editable: z.looseObject({ colors: z.array(colorKey).max(8), fonts: z.boolean(), radius: z.boolean(), density: z.boolean() }),
    // Forward compatible: an option `type` this backend does not know is dropped,
    // not fatal — the admin simply does not render it.
    options: z
      .array(z.unknown())
      .max(30)
      .transform((items) => items.flatMap((item) => {
        const r = templateOptionSchema.safeParse(item);
        return r.success ? [r.data] : [];
      })),
    preview: previewPath.nullable().optional(), // the storefront emits null when a template has no thumbnail
    builtIn: z.boolean(),
  })
  .superRefine((t, ctx) => {
    const presetIds = t.presets.map((p) => p.id);
    if (new Set(presetIds).size !== presetIds.length) ctx.addIssue({ code: 'custom', path: ['presets'], message: 'duplicate preset id' });
    if (!presetIds.includes(t.defaultPreset)) ctx.addIssue({ code: 'custom', path: ['defaultPreset'], message: 'defaultPreset is not one of presets' });
    const keys = t.options.map((o) => o.key);
    if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', path: ['options'], message: 'duplicate option key' });
  });
export type CatalogTemplate = z.infer<typeof templateSchema>;

const catalogFileSchema = z.looseObject({ schemaVersion: z.literal(1), templates: z.array(z.unknown()).max(100) });

export type CatalogParseResult = { templates: CatalogTemplate[]; dropped: string[] } | { error: string };

/** Validates a parsed templates.json. Bad templates are dropped one by one (with
 *  a reason in `dropped`); only a wrong schemaVersion or zero valid templates
 *  invalidates the whole catalog. Never throws. */
export function parseTemplateCatalog(raw: unknown): CatalogParseResult {
  const parsedFile = catalogFileSchema.safeParse(raw);
  if (!parsedFile.success) {
    const version = (raw as { schemaVersion?: unknown } | null)?.schemaVersion;
    return { error: version !== 1 ? `templates.json schemaVersion ${String(version)} is not supported` : 'templates.json is malformed' };
  }
  const templates: CatalogTemplate[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const item of parsedFile.data.templates) {
    const label = typeof (item as { id?: unknown } | null)?.id === 'string' ? (item as { id: string }).id : '(no id)';
    const r = templateSchema.safeParse(item);
    if (!r.success) {
      const issue = r.error.issues[0];
      dropped.push(`${label}: ${issue ? `${issue.path.join('.') || '(root)'} ${issue.message}` : 'invalid'}`);
      continue;
    }
    if (seen.has(r.data.id)) {
      dropped.push(`${r.data.id}: duplicate template id`);
      continue;
    }
    seen.add(r.data.id);
    templates.push(r.data);
  }
  if (templates.length === 0) return { error: 'templates.json contains no valid templates' };
  return { templates, dropped };
}

/** Size + JSON guard around parseTemplateCatalog. Never throws. */
export function readTemplateCatalogFile(bytes: Uint8Array): CatalogParseResult {
  if (bytes.byteLength > MAX_CATALOG_BYTES) return { error: 'templates.json exceeds 1 MiB' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    return { error: 'templates.json is not valid JSON' };
  }
  return parseTemplateCatalog(parsed);
}

/** Reads the catalog out of an extracted release (see lib/storefront-release). Never throws. */
export function readReleaseTemplateCatalog(files: Map<string, Uint8Array>, assetsDirectory: string): CatalogParseResult {
  const bytes = files.get(`${assetsDirectory.replace(/\/+$/, '')}/${TEMPLATE_CATALOG_FILE}`);
  if (!bytes) return { error: 'this release has no templates.json (it predates storefront templates)' };
  return readTemplateCatalogFile(bytes);
}

/** The storefront always ships `modern`. Colours duplicate DEFAULT_THEME in
 *  modules/storefront-settings/service (a test pins them together) so this pure
 *  lib does not import the settings module and its db dependencies. */
export const MODERN_FALLBACK: CatalogTemplate = {
  id: 'modern',
  name: 'Modern',
  version: '1.0.0',
  description: 'The original storefront look: clean, image-led, fully customisable.',
  author: 'Kratos',
  schemes: ['dark', 'light'],
  presets: [{
    id: 'default',
    name: 'Default',
    scheme: 'dark',
    colors: {
      primary: '#ffffff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc',
      muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278',
    },
    fonts: { heading: null, body: null, mono: null },
    radius: 'none',
  }],
  defaultPreset: 'default',
  editable: { colors: ['primary', 'bg', 'surface', 'text', 'muted', 'success', 'warn', 'danger'], fonts: true, radius: true, density: true },
  options: [],
  builtIn: true,
};

/** Every catalog the admin sees offers modern, even if a release forgot it. */
export function withModern(templates: CatalogTemplate[]): CatalogTemplate[] {
  return templates.some((t) => t.id === 'modern') ? templates : [MODERN_FALLBACK, ...templates];
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run src/lib/storefront-templates.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors. If `MODERN_FALLBACK`'s literal fails to type against the transformed/loose `CatalogTemplate`, type the constant as `z.input<typeof templateSchema>` and export `MODERN_FALLBACK = templateSchema.parse(raw)` instead. The test must still pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storefront-templates.ts src/lib/storefront-templates.test.ts
git commit -m "feat(storefront): template catalog parser for release templates.json

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Deploy job captures the catalog

**Files:**
- Modify: `src/modules/storefront-deploy/deploy-job.ts` (imports ~L1–9; after the `extract` step ~L95–96; the `finalize` step ~L212–216)
- Test: `src/modules/storefront-deploy/deploy-job.test.ts`

**Interfaces:**
- Consumes (Task 2): `readReleaseTemplateCatalog(files, assetsDirectory): CatalogParseResult`, `TEMPLATE_CATALOG_KEY`. From `../storefront-settings/store`: `upsertStorefrontSetting`, `deleteStorefrontSetting` (both already exported).
- Produces: on a **successful** deploy, the setting `storefront_templates_catalog` = `JSON.stringify({ tag: string, capturedAt: ISO string, templates: CatalogTemplate[] })`, or the key deleted when the release has no valid catalog. Task 4 reads this.

- [ ] **Step 1: Write the failing tests**

In `src/modules/storefront-deploy/deploy-job.test.ts`:

1. Below the existing `import { getStorefrontPublicUrl } …` line, add:

```ts
import { MODERN_FALLBACK, TEMPLATE_CATALOG_KEY } from '../../lib/storefront-templates';
```

2. Below the existing `const ZIP = zipSync({ … });` line, add:

```ts
const CATALOG = { schemaVersion: 1, templates: [MODERN_FALLBACK, { ...MODERN_FALLBACK, id: 'cyber-brutalism', name: 'Cyber Brutalism' }] };
function zipWith(extra: Record<string, Uint8Array>): Uint8Array {
  return zipSync({ 'release.json': strToU8(JSON.stringify(MANIFEST)), 'worker/dist/index.js': strToU8('export default {}'), 'web/dist/index.html': strToU8('<html>'), ...extra });
}
```

3. Replace the `fetchFor` helper with this backward-compatible version (optional second argument):

```ts
function fetchFor(health: () => Response, zip: Uint8Array = ZIP) {
  return vi.fn(async (url: string) => (url === 'https://gh/v0.1.0.zip' ? new Response(zip) : health()));
}
```

4. Append a new `describe` block at the end of the file:

```ts
describe('runStorefrontDeploy — template catalog', () => {
  const run = (zip: Uint8Array, api = fakeApi()) =>
    runStorefrontDeploy(1, { fetchImpl: fetchFor(() => new Response('ok'), zip) as never, createApi: () => api as never, sleep: async () => {} });

  it('captures templates.json with the release tag on success', async () => {
    await run(zipWith({ 'web/dist/templates.json': strToU8(JSON.stringify(CATALOG)) }));
    expect(rows.get(1)!.status).toBe('succeeded');
    const stored = JSON.parse(settings.get(TEMPLATE_CATALOG_KEY)!);
    expect(stored.tag).toBe('v0.1.0');
    expect(typeof stored.capturedAt).toBe('string');
    expect(stored.templates.map((t: { id: string }) => t.id)).toEqual(['modern', 'cyber-brutalism']);
    expect(rows.get(1)!.log.map((l) => l.msg)).toEqual(expect.arrayContaining([expect.stringMatching(/2 storefront templates/)]));
  });

  it('clears a stale catalog and warns when the release predates templates, but still succeeds', async () => {
    settings.set(TEMPLATE_CATALOG_KEY, JSON.stringify({ tag: 'v0.0.9', capturedAt: '', templates: [] }));
    await run(ZIP);
    expect(rows.get(1)!.status).toBe('succeeded');
    expect(settings.has(TEMPLATE_CATALOG_KEY)).toBe(false);
    expect(rows.get(1)!.log).toEqual(expect.arrayContaining([expect.objectContaining({ level: 'warn', msg: expect.stringMatching(/no templates\.json/) })]));
  });

  it('never fails the deploy over an invalid catalog', async () => {
    await run(zipWith({ 'web/dist/templates.json': strToU8('{ not json') }));
    expect(rows.get(1)!.status).toBe('succeeded');
    expect(settings.has(TEMPLATE_CATALOG_KEY)).toBe(false);
  });

  it('logs dropped templates as warnings and keeps the valid ones', async () => {
    const withBad = { schemaVersion: 1, templates: [MODERN_FALLBACK, { ...MODERN_FALLBACK, id: 'Bad Id' }] };
    await run(zipWith({ 'web/dist/templates.json': strToU8(JSON.stringify(withBad)) }));
    expect(JSON.parse(settings.get(TEMPLATE_CATALOG_KEY)!).templates).toHaveLength(1);
    expect(rows.get(1)!.log).toEqual(expect.arrayContaining([expect.objectContaining({ level: 'warn', msg: expect.stringMatching(/Bad Id/) })]));
  });

  it('leaves the current catalog untouched when the deploy fails after extract', async () => {
    const current = JSON.stringify({ tag: 'v0.0.9', capturedAt: '2026-09-01T00:00:00.000Z', templates: [MODERN_FALLBACK] });
    settings.set(TEMPLATE_CATALOG_KEY, current);
    const api = fakeApi({ putScript: vi.fn(async () => { throw new Error('boom'); }) });
    await run(zipWith({ 'web/dist/templates.json': strToU8(JSON.stringify(CATALOG)) }), api);
    expect(rows.get(1)!.status).toBe('failed');
    expect(settings.get(TEMPLATE_CATALOG_KEY)).toBe(current);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/modules/storefront-deploy/deploy-job.test.ts`
Expected: the new "captures templates.json…", "clears a stale catalog…" and "logs dropped templates…" tests FAIL (no key written or deleted, no log line). The pre-existing tests still PASS.

- [ ] **Step 3: Implement**

In `src/modules/storefront-deploy/deploy-job.ts`:

1. Change the store import and add the catalog import:

```ts
import { readReleaseTemplateCatalog, TEMPLATE_CATALOG_KEY } from '../../lib/storefront-templates';
import { deleteStorefrontSetting, upsertStorefrontSetting } from '../storefront-settings/store';
```

(Replace the existing `import { upsertStorefrontSetting } from '../storefront-settings/store';` line.)

2. Directly after the line `const workerSource = Buffer.from(files.get(manifest.worker.main)!).toString('utf8');`, insert:

```ts
    // Parsed now, persisted only in `finalize`: a deploy that fails later must
    // not replace the catalog of the release that is actually live. Not a
    // separate Step — the admin's progress list hardcodes the step names — and
    // never fatal: a bad catalog only costs the admin its template picker.
    const catalog = readReleaseTemplateCatalog(files, manifest.assets.directory);
    if ('error' in catalog) {
      await log(`Template catalog not captured: ${catalog.error}`, 'warn');
    } else {
      await log(`${catalog.templates.length} storefront templates in this release`);
      for (const reason of catalog.dropped) await log(`Skipped template ${reason}`, 'warn');
    }
```

3. In the `finalize` step, after `await upsertStorefrontSetting(CF_KEYS.publicUrl, \`https://${row.hostname}\`);`, insert:

```ts
      if ('templates' in catalog) {
        await upsertStorefrontSetting(
          TEMPLATE_CATALOG_KEY,
          JSON.stringify({ tag: row.tag, capturedAt: new Date().toISOString(), templates: catalog.templates }),
        );
      } else {
        await deleteStorefrontSetting(TEMPLATE_CATALOG_KEY);
      }
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run src/modules/storefront-deploy/deploy-job.test.ts`
Expected: PASS, all old and new tests.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/modules/storefront-deploy/deploy-job.ts src/modules/storefront-deploy/deploy-job.test.ts
git commit -m "feat(storefront-deploy): capture the release's template catalog on successful deploy

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Catalog resolver + `GET /storefront-settings/templates`

**Files:**
- Modify: `src/config/env.ts` (add `STOREFRONT_TEMPLATES_URL` after `ADDRESS_WEBAPP_URL`, ~L55)
- Create: `src/modules/storefront-settings/templates.ts`
- Modify: `src/modules/storefront-settings/controller.ts`
- Modify: `src/modules/storefront-settings/router.ts`
- Test: `src/modules/storefront-settings/templates.test.ts`

**Interfaces:**
- Consumes (Task 2): `TEMPLATE_CATALOG_KEY`, `parseTemplateCatalog`, `readTemplateCatalogFile`, `withModern`, `MODERN_FALLBACK`, `type CatalogTemplate`. From Task 3: the stored `{ tag, capturedAt, templates }` JSON. From `./store`: `getStorefrontSettings(keys): Promise<Map<string, string>>`.
- Produces:
  - `interface TemplateCatalogResponse { source: 'deployed' | 'live' | 'fallback'; tag: string | null; baseUrl: string | null; templates: CatalogTemplate[] }`
  - `interface TemplateCatalogDeps { fetchImpl?: typeof fetch; templatesUrl?: string; now?: () => number }`
  - `getTemplateCatalog(deps?: TemplateCatalogDeps): Promise<TemplateCatalogResponse>`
  - `clearTemplateCatalogCache(): void` (for tests)
  - HTTP: `GET /api/v1/storefront-settings/templates` (admin JWT) → `sendSuccess(res, TemplateCatalogResponse)`. The admin plan consumes exactly this shape.

- [ ] **Step 1: Write the failing tests**

Create `src/modules/storefront-settings/templates.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const settings = new Map<string, string>();
vi.mock('./store', () => ({
  getStorefrontSettings: async (keys: string[]) => new Map(keys.filter((k) => settings.has(k)).map((k) => [k, settings.get(k)!])),
}));

import { clearTemplateCatalogCache, getTemplateCatalog } from './templates';
import { MODERN_FALLBACK, TEMPLATE_CATALOG_KEY } from '../../lib/storefront-templates';

const LUX = { ...MODERN_FALLBACK, id: 'dark-luxury', name: 'Dark Luxury' };
const catalogJson = (templates: unknown[]) => JSON.stringify({ schemaVersion: 1, templates });
const json = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  settings.clear();
  clearTemplateCatalogCache();
});

describe('getTemplateCatalog', () => {
  it('serves the catalog captured at deploy without any network call', async () => {
    settings.set(TEMPLATE_CATALOG_KEY, JSON.stringify({ tag: 'v0.4.0', capturedAt: '2026-09-28T00:00:00.000Z', templates: [MODERN_FALLBACK, LUX] }));
    settings.set('storefront_public_url', 'https://shop.example.com');
    const fetchImpl = vi.fn();
    const r = await getTemplateCatalog({ fetchImpl: fetchImpl as never, templatesUrl: undefined });
    expect(r).toMatchObject({ source: 'deployed', tag: 'v0.4.0', baseUrl: 'https://shop.example.com' });
    expect(r.templates.map((t) => t.id)).toEqual(['modern', 'dark-luxury']);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('prepends modern when the captured catalog lacks it', async () => {
    settings.set(TEMPLATE_CATALOG_KEY, JSON.stringify({ tag: 'v0.4.0', capturedAt: '', templates: [LUX] }));
    const r = await getTemplateCatalog({ fetchImpl: vi.fn() as never, templatesUrl: undefined });
    expect(r.templates.map((t) => t.id)).toEqual(['modern', 'dark-luxury']);
  });

  it('falls back to https://{hostname} when no public url is recorded', async () => {
    settings.set(TEMPLATE_CATALOG_KEY, JSON.stringify({ tag: 'v0.4.0', capturedAt: '', templates: [LUX] }));
    settings.set('storefront_cf_hostname', 'shop.example.com');
    expect((await getTemplateCatalog({ fetchImpl: vi.fn() as never, templatesUrl: undefined })).baseUrl).toBe('https://shop.example.com');
  });

  it('ignores a corrupt stored catalog and fetches the live one', async () => {
    settings.set(TEMPLATE_CATALOG_KEY, '{ corrupt');
    settings.set('storefront_cf_hostname', 'shop.example.com');
    const fetchImpl = vi.fn(async () => json(catalogJson([LUX])));
    const r = await getTemplateCatalog({ fetchImpl: fetchImpl as never, templatesUrl: undefined });
    expect(r).toMatchObject({ source: 'live', tag: null, baseUrl: 'https://shop.example.com' });
    expect(fetchImpl).toHaveBeenCalledWith('https://shop.example.com/templates.json', expect.objectContaining({ signal: expect.anything() }));
    expect(r.templates.map((t) => t.id)).toEqual(['modern', 'dark-luxury']);
  });

  it('caches a live success for 5 minutes', async () => {
    settings.set('storefront_cf_hostname', 'shop.example.com');
    let t = 0;
    const fetchImpl = vi.fn(async () => json(catalogJson([LUX])));
    const deps = { fetchImpl: fetchImpl as never, templatesUrl: undefined, now: () => t };
    await getTemplateCatalog(deps);
    t = 4 * 60_000;
    await getTemplateCatalog(deps);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    t = 5 * 60_000 + 1;
    await getTemplateCatalog(deps);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("treats an older storefront's SPA index.html as a miss, caches the miss for 60 s, and serves the modern-only fallback", async () => {
    settings.set('storefront_cf_hostname', 'shop.example.com');
    let t = 0;
    const fetchImpl = vi.fn(async () => new Response('<!doctype html><html></html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    const deps = { fetchImpl: fetchImpl as never, templatesUrl: undefined, now: () => t };
    const r = await getTemplateCatalog(deps);
    expect(r).toEqual({ source: 'fallback', tag: null, baseUrl: null, templates: [MODERN_FALLBACK] });
    t = 59_000;
    await getTemplateCatalog(deps);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    t = 60_001;
    await getTemplateCatalog(deps);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('falls through a rejected fetch (timeout / DNS) and a non-200', async () => {
    settings.set('storefront_cf_hostname', 'shop.example.com');
    const rejecting = vi.fn(async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); });
    expect((await getTemplateCatalog({ fetchImpl: rejecting as never, templatesUrl: undefined })).source).toBe('fallback');
    clearTemplateCatalogCache();
    const notFound = vi.fn(async () => json('{}', 404));
    expect((await getTemplateCatalog({ fetchImpl: notFound as never, templatesUrl: undefined })).source).toBe('fallback');
  });

  it('uses STOREFRONT_TEMPLATES_URL when nothing is deployed, with that origin as baseUrl', async () => {
    const fetchImpl = vi.fn(async () => json(catalogJson([MODERN_FALLBACK, LUX])));
    const r = await getTemplateCatalog({ fetchImpl: fetchImpl as never, templatesUrl: 'http://localhost:5173/templates.json' });
    expect(r).toMatchObject({ source: 'live', tag: null, baseUrl: 'http://localhost:5173' });
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:5173/templates.json', expect.anything());
  });

  it('tries the env URL after a failed hostname fetch', async () => {
    settings.set('storefront_cf_hostname', 'shop.example.com');
    const fetchImpl = vi.fn(async (url: string) => (url.startsWith('https://shop') ? json('{}', 404) : json(catalogJson([LUX]))));
    const r = await getTemplateCatalog({ fetchImpl: fetchImpl as never, templatesUrl: 'http://localhost:5173/templates.json' });
    expect(r).toMatchObject({ source: 'live', baseUrl: 'http://localhost:5173' });
  });

  it('serves the modern-only fallback with no baseUrl when nothing is configured', async () => {
    const r = await getTemplateCatalog({ fetchImpl: vi.fn() as never, templatesUrl: undefined });
    expect(r).toEqual({ source: 'fallback', tag: null, baseUrl: null, templates: [MODERN_FALLBACK] });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/modules/storefront-settings/templates.test.ts`
Expected: FAIL, "Failed to resolve import ./templates".

- [ ] **Step 3: Add the env var**

In `src/config/env.ts`, directly after the `ADDRESS_WEBAPP_URL: z.string().url().optional(),` line, add:

```ts
  // Local-dev source for the storefront template catalog the admin's template
  // picker reads (GET /storefront-settings/templates), e.g.
  // http://localhost:5173/templates.json from the storefront's Vite dev server.
  // Only consulted when no deployed or live catalog is available. Leave unset
  // in production.
  STOREFRONT_TEMPLATES_URL: z.string().url().optional(),
```

- [ ] **Step 4: Implement the resolver**

Create `src/modules/storefront-settings/templates.ts`:

```ts
import pino from 'pino';
import { z } from 'zod';
import { env } from '../../config/env';
import {
  MODERN_FALLBACK,
  TEMPLATE_CATALOG_KEY,
  TEMPLATE_CATALOG_FILE,
  parseTemplateCatalog,
  readTemplateCatalogFile,
  withModern,
  type CatalogTemplate,
} from '../../lib/storefront-templates';
import { getStorefrontSettings as readStorefrontSettings } from './store';

const logger = pino({ name: 'storefront-templates' });

// Mirrors CF_KEYS in modules/storefront-deploy/service (not imported: that
// module pulls in the Cloudflare client and the deploy queue).
const HOSTNAME_KEY = 'storefront_cf_hostname';
const PUBLIC_URL_KEY = 'storefront_public_url';

const LIVE_TTL_MS = 5 * 60_000;
const FAILURE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;

export interface TemplateCatalogResponse {
  source: 'deployed' | 'live' | 'fallback';
  tag: string | null;
  /** Origin that serves the catalog's preview images and the preview iframe; null → admin uses its swatch preview. */
  baseUrl: string | null;
  templates: CatalogTemplate[];
}

export interface TemplateCatalogDeps {
  fetchImpl?: typeof fetch;
  /** Defaults to env.STOREFRONT_TEMPLATES_URL; pass the key explicitly (even as undefined) to override. */
  templatesUrl?: string;
  now?: () => number;
}

const storedCatalogSchema = z.object({ tag: z.string(), capturedAt: z.string(), templates: z.array(z.unknown()) });

type LiveEntry = { at: number; ttl: number; templates: CatalogTemplate[] | null };
const liveCache = new Map<string, LiveEntry>();

export function clearTemplateCatalogCache(): void {
  liveCache.clear();
}

function readStored(raw: string | undefined): { tag: string; templates: CatalogTemplate[] } | null {
  if (!raw) return null;
  try {
    const stored = storedCatalogSchema.parse(JSON.parse(raw));
    const parsed = parseTemplateCatalog({ schemaVersion: 1, templates: stored.templates });
    return 'templates' in parsed ? { tag: stored.tag, templates: parsed.templates } : null;
  } catch {
    return null;
  }
}

/** Fetches a live templates.json. Successes are cached 5 min, failures 60 s —
 *  an older storefront answers /templates.json with its SPA index.html, and
 *  without the negative cache every admin page load would pay that round trip. */
async function fetchLiveCatalog(url: string, fetchImpl: typeof fetch, now: () => number): Promise<CatalogTemplate[] | null> {
  const hit = liveCache.get(url);
  if (hit && now() - hit.at < hit.ttl) return hit.templates;

  let templates: CatalogTemplate[] | null = null;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'follow', headers: { accept: 'application/json' } });
    if (!res.ok) {
      logger.warn({ url, status: res.status }, 'template catalog fetch failed');
    } else {
      const parsed = readTemplateCatalogFile(new Uint8Array(await res.arrayBuffer()));
      if ('templates' in parsed) templates = parsed.templates;
      else logger.warn({ url, error: parsed.error }, 'template catalog invalid');
    }
  } catch (err) {
    logger.warn({ url, err: (err as Error).message }, 'template catalog fetch failed');
  }
  liveCache.set(url, { at: now(), ttl: templates ? LIVE_TTL_MS : FAILURE_TTL_MS, templates });
  return templates;
}

/** Admin `GET /storefront-settings/templates`: deployed → live → env URL → modern only. */
export async function getTemplateCatalog(deps: TemplateCatalogDeps = {}): Promise<TemplateCatalogResponse> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const templatesUrl = 'templatesUrl' in deps ? deps.templatesUrl : env.STOREFRONT_TEMPLATES_URL;

  const values = await readStorefrontSettings([TEMPLATE_CATALOG_KEY, HOSTNAME_KEY, PUBLIC_URL_KEY]);
  const hostname = values.get(HOSTNAME_KEY)?.trim();
  const publicUrl = values.get(PUBLIC_URL_KEY)?.trim().replace(/\/+$/, '');
  const storefrontUrl = publicUrl || (hostname ? `https://${hostname}` : null);

  const stored = readStored(values.get(TEMPLATE_CATALOG_KEY));
  if (stored) return { source: 'deployed', tag: stored.tag, baseUrl: storefrontUrl, templates: withModern(stored.templates) };

  if (storefrontUrl) {
    const live = await fetchLiveCatalog(`${storefrontUrl}/${TEMPLATE_CATALOG_FILE}`, fetchImpl, now);
    if (live) return { source: 'live', tag: null, baseUrl: storefrontUrl, templates: withModern(live) };
  }

  if (templatesUrl) {
    const live = await fetchLiveCatalog(templatesUrl, fetchImpl, now);
    if (live) return { source: 'live', tag: null, baseUrl: new URL(templatesUrl).origin, templates: withModern(live) };
  }

  // baseUrl stays null: any storefront reachable here predates templates and
  // would ignore the admin's preview messages.
  return { source: 'fallback', tag: null, baseUrl: null, templates: [MODERN_FALLBACK] };
}
```

- [ ] **Step 5: Run the resolver tests**

Run: `npx vitest run src/modules/storefront-settings/templates.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire the controller and route**

In `src/modules/storefront-settings/controller.ts`, add the import below `import * as brandingService from './branding';`:

```ts
import * as templateCatalogService from './templates';
```

and add below `updateStorefrontSettings`:

```ts
export async function getTemplateCatalog(_req: Request, res: Response) {
  sendSuccess(res, await templateCatalogService.getTemplateCatalog());
}
```

In `src/modules/storefront-settings/router.ts`, directly after the `storefrontSettingsRouter.put('/', …);` block, add:

```ts
storefrontSettingsRouter.get(
  '/templates',
  authenticate,
  authorize('admin'),
  storefrontSettingsController.getTemplateCatalog,
);
```

- [ ] **Step 7: Full test run, typecheck and a live smoke check**

Run: `npm test`
Expected: all suites PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

Smoke check against the running dev server. The dev DB is a live-shaped copy: this is a read-only GET, but use the temp-admin workaround from memory if no admin login is at hand.

```bash
npm run dev   # separate terminal; PORT=3001 if 3000 is taken
# obtain an admin JWT (POST /api/v1/auth/login), then:
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/storefront-settings/templates
```

Expected: `{"success":true,"data":{"source":"fallback","tag":null,"baseUrl":null,"templates":[{"id":"modern",…}]}}` (or `live`/`deployed` if this environment has a templated storefront). Also expect `GET /api/v1/public/storefront/settings` to show `"template":"modern","preset":null,"options":{}` inside `theme`.

- [ ] **Step 8: Commit**

```bash
git add src/config/env.ts src/modules/storefront-settings/templates.ts src/modules/storefront-settings/templates.test.ts src/modules/storefront-settings/controller.ts src/modules/storefront-settings/router.ts
git commit -m "feat(storefront-settings): GET /templates — deployed, live, env and modern-only catalog sources

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Docs — `STOREFRONT.md` and the OpenAPI registry

**Files:**
- Modify: `STOREFRONT.md` (§5.1 settings table `storefront_theme` row ~L897; §5.2 example `"theme"` ~L947–953; §6 route table after the `GET | /api/v1/storefront-settings` row ~L996; §6.1 deploy table ~L1087–1100)
- Modify: `src/docs/registry.ts` (`storefrontThemeSchemaDoc` ~L1448–1460; add a path after the `put /api/v1/storefront-settings` registration ~L1600–1635)

**Interfaces:**
- Consumes: the shapes from Tasks 1–4 (documentation only).
- Produces: nothing code-facing.

- [ ] **Step 1: Update the §5.1 settings table in `STOREFRONT.md`**

Replace the whole `| \`storefront_theme\` | … |` row with:

```markdown
| `storefront_theme` | JSON `{ template, preset, options, scheme: "dark"\|"light", colors: {8 hex fields}, fonts: {heading,body,mono}, radius: "none"\|"sm"\|"md"\|"lg"\|"xl", density, customCss }` — `template`/`preset` are slugs (`/^[a-z0-9-]{1,40}$/`), `options` is `{ [key]: boolean \| string≤100 }` (≤30 keys) | matches `ecommerce-menu`'s default dark palette; `template: "modern"`, `preset: null`, `options: {}` for any theme saved before templates existed (no migration); `radius: "none"` (sharp corners) is the default for stores that have never saved a theme; `customCss` is sanitised (parsed, not regex-stripped) on every write. The colour/font/radius fields are the **effective** values (the admin copies a preset into them); the backend never checks `template` against a catalog — the storefront renders an unknown id as `modern` |
```

Then add this row directly below the `storefront_tracking_api_key` row (the last row of the table):

```markdown
| `storefront_templates_catalog` | JSON `{ tag, capturedAt, templates: [...] }` — the storefront release's `templates.json`, validated | written by a **successful** deploy (§6.1); deleted when the deployed release has no valid catalog. Read by `GET /storefront-settings/templates` |
```

- [ ] **Step 2: Update the §5.2 example**

In the public-settings JSON example, replace:

```json
  "theme": {
    "scheme": "dark",
```

with:

```json
  "theme": {
    "template": "modern", "preset": null, "options": {},
    "scheme": "dark",
```

- [ ] **Step 3: Add the route to the §6 table and describe it**

Directly after the row `| GET | \`/api/v1/storefront-settings\` | admin | Read all settings from §5.1 |`, add:

```markdown
| GET | `/api/v1/storefront-settings/templates` | admin | Template catalog for the admin's template picker (below) |
```

Then, directly before the `### Branding assets (logo / favicon)` heading, add:

```markdown
### Template catalog (`GET /storefront-settings/templates`)

Returns `{ source, tag, baseUrl, templates }`, where `templates` follows the storefront's
`templates.json` (`schemaVersion: 1`; see `ecommerce-storefront/docs/templates.md`). Resolution order:

1. `deployed` — `storefront_templates_catalog`, captured by the last successful deploy; `tag` is that release.
2. `live` — `GET {storefront_public_url or https://storefront_cf_hostname}/templates.json` (5 s timeout;
   cached 5 min, failures 60 s). Covers storefronts deployed by hand with wrangler.
3. `live` — `STOREFRONT_TEMPLATES_URL` (env; local dev, e.g. `http://localhost:5173/templates.json`).
4. `fallback` — a single built-in `modern` entry.

`modern` is always present (prepended if a catalog lacks it). Invalid templates are dropped
individually, option entries with an unknown `type` are dropped, and unknown keys are kept, so a
newer storefront never breaks an older backend. `baseUrl` is the origin that serves preview
images (`preview` is always an origin-relative path) and the admin's preview iframe. It is `null` for
`fallback`, so the admin falls back to its swatch preview.

`PUT /` accepts `theme` **without** `template`/`preset`/`options`. Omitted fields keep their stored
values, so an admin SPA that predates templates cannot reset a client's template by saving colours.
```

- [ ] **Step 4: Note catalog capture in §6.1**

Directly below the §6.1 route table (after the `| GET | \`/deploys\`, \`/deploys/:id\` | …` row), add:

```markdown
After `extract`, the deploy job reads `{assets.directory}/templates.json` from the release and logs
the template count (warnings for skipped templates or a missing/invalid file — never fatal). The
catalog is written to `storefront_templates_catalog` in `finalize`, so a deploy that fails keeps
the previous catalog. There is no separate step name; the admin's progress list is unchanged.
```

- [ ] **Step 5: Update the OpenAPI registry**

In `src/docs/registry.ts`, inside `storefrontThemeSchemaDoc = z.object({ … })`, add before `scheme:`:

```ts
  template: z.string().regex(/^[a-z0-9-]{1,40}$/).optional().describe("Storefront template id; stored default 'modern'. Omitted on PUT → the stored value is kept"),
  preset: z.string().regex(/^[a-z0-9-]{1,40}$/).nullable().optional().describe('Preset id within the template; omitted on PUT → kept'),
  options: z.record(z.string(), z.union([z.boolean(), z.string().max(100)])).optional().describe('Template-specific options, ≤30 keys; omitted on PUT → kept'),
```

Directly after the closing `});` of the `put /api/v1/storefront-settings` registration, add:

```ts
registry.registerPath({
  method: 'get', path: '/api/v1/storefront-settings/templates', tags: ['Storefront Settings'], summary: 'Storefront template catalog (admin)', security: bearerAuth,
  description: "Resolution: deployed (captured by the last successful deploy) → live (the storefront's /templates.json, cached 5 min / failures 60 s) → STOREFRONT_TEMPLATES_URL → a modern-only fallback. modern is always included. baseUrl is null for the fallback source.",
  responses: { 200: { description: "{ source: 'deployed'|'live'|'fallback', tag: string|null, baseUrl: string|null, templates: [{ id, name, version, description, author, schemes, presets, defaultPreset, editable, options, preview?, builtIn }] }" } },
});
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all suites PASS. If a registry/doc snapshot test exists and fails only because of the additions, update the snapshot with `npx vitest run -u <that file>` and confirm the diff contains only the new fields and path.

- [ ] **Step 7: Commit**

```bash
git add STOREFRONT.md src/docs/registry.ts
git commit -m "docs(storefront): theme template fields and the template catalog endpoint

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review (done)

- **Spec §2 coverage:**
  - §2.1 theme fields, defaults and no migration → Task 1.
  - §2.2 capture, missing/invalid → no fail → Task 3 (R1, R2).
  - §2.3 endpoint and four-step order → Task 4 (R5).
  - §2.4 public passthrough → Task 1 Step 6 (typed passthrough) and the Task 4 smoke check.
  - §2.5 docs → Task 5.
  - §1.9 catalog shape → Task 2.
  - §1.4 options → Task 2.
  - §7 backend-first → Global Constraints.
- **Type names are consistent across tasks:** `CatalogTemplate`, `CatalogParseResult`, `readReleaseTemplateCatalog`, `TEMPLATE_CATALOG_KEY`, `MODERN_FALLBACK`, `withModern`, `getTemplateCatalog`, `clearTemplateCatalogCache`, `mergeThemeInput`, `StorefrontThemeInput`.
- **Review Focus:** every item has a test in its owning task (1 → Task 1, 2 → Task 4, 3 → Task 2, 4 → Task 3, 5 → Task 2).
