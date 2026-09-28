# Storefront Templates — Design

**Date:** 2026-09-28
**Repos:** `ecommerce-storefront` (contract, registry, three templates, import tooling), `ecommerce-backend`
(theme schema, template catalog), `ecommerce-admin-frontend` (template picker, customise, live preview).
**Source briefs:** `designs/dark-luxury/DESIGN.md`, `designs/cyber-brutalism/DESIGN.md`, plus the
`dark-luxury` and `cyber-brutalism-design` skills.

## Goal

Turn the storefront's palette system into an open-ended **template** system. A client picks a
template in the admin SPA, then a preset, then tweaks what the template allows. Ship three templates:
`modern` (today's look, the default, pixel-identical), `dark-luxury` and `cyber-brutalism`. New
templates are added in code — either as a folder in this repo or imported at build time from a git
repo pinned in a lock file. Every template is mobile-friendly by contract.

## Decisions (locked during brainstorming)

1. **Template + presets + overrides.** A template ships defaults and named presets; the admin may
   override what the template's `editable` map allows and set template-specific options. Switching
   template/preset copies that preset's values into the form (with a confirm if tweaks would be lost).
2. **Templates are developer-authored code.** Built-in folders, or git repos imported at build time.
3. **Every template in a release is visible to every client.** One bundle, one catalog. No
   per-client visibility in v1.
4. **Architecture: tokens + parts CSS + slots.** Not token-only (can't express structure), not
   per-template page trees (duplicates business logic).
5. **Locks are real.** Brutalism locks radius at 0; luxury locks radius and button style.
6. **Effective values are stored.** The theme stores the resolved colours/fonts, not preset + deltas.
   Old storefront releases keep rendering; later preset changes don't propagate to existing clients.
7. **Live preview is an iframe of the deployed storefront**, driven by `postMessage`; draft
   `customCss` is never applied through it.
8. **Decoration uses real store data**, not invented metrics (ordering state, SKU count, cutoff).

Out of scope for v1: per-client private templates, admin-authored custom templates stored in the DB,
per-template page layouts beyond the six slots.

---

## 1. Template contract and registry (`ecommerce-storefront/web`)

### 1.1 Folder layout

```
web/src/templates/
  contract.ts               # public contract: defineTemplate, types, slot prop types, hooks
  registry.ts               # import.meta.glob discovery + validation
  modern/  dark-luxury/  cyber-brutalism/
  external/<id>/            # build-time imports (gitignored)
  <id>/
    manifest.ts             # pure data: export default defineTemplate({...}); no React, no CSS
    index.ts                # lazy entry: import './template.css'; export optional slots
    template.css            # every rule scoped under :root[data-sf-template="<id>"]
    slots/*.tsx             # optional
    preview.webp            # optional admin thumbnail
```

`registry.ts` discovers manifests with `import.meta.glob('./**/manifest.ts', { eager: true })` and lazy
entries with `import.meta.glob('./**/index.ts')` (non-eager → one chunk per template). No hand-kept list.

### 1.2 Manifest

```ts
interface TemplateManifest {
  contractVersion: 1;
  id: string;                 // /^[a-z0-9-]{1,40}$/, must equal folder name
  name: string; version: string; description: string; author: string;
  schemes: ('dark' | 'light')[];
  presets: TemplatePreset[];  // ≥1
  defaultPreset: string;
  tokens: TemplateTokens;     // see 1.3
  editable: {
    colors: ColorKey[];       // subset of primary|bg|surface|text|muted|success|warn|danger
    fonts: boolean; radius: boolean; density: boolean;
  };
  options: TemplateOption[];  // see 1.4
  preview?: string;           // relative asset path, emitted into templates.json
}
interface TemplatePreset {
  id: string; name: string; scheme: 'dark' | 'light';
  colors: Record<ColorKey, string>;       // 6-digit hex
  fonts: { heading: FontSpec | null; body: FontSpec | null; mono: FontSpec | null };
  radius: 'none' | 'sm' | 'md' | 'lg' | 'xl';
}
interface FontSpec { family: string; weights: number[] }  // weights drive the Google Fonts URL
```

The registry rejects (build error in dev/CI, console warning + skip at runtime as a backstop): unknown
`contractVersion`, id/folder mismatch, duplicate ids, `defaultPreset` not in `presets`, preset scheme not
in `schemes`, invalid hex.

### 1.3 Tokens

Existing palette variables (`--sf-bg` … `--sf-danger`, derived surfaces/lines, font stacks) stay as
`cssVariablesFor()` computes them today. New variables come from `manifest.tokens`:

| Token | CSS variable(s) | Modern value (today's look) |
|---|---|---|
| `button.radius` | `--sf-btn-radius` | from theme radius |
| `button.fill` (`solid` / `outline-glow` / `ghost`) | `data-sf-btn-fill` on root + `--sf-btn-*` | `solid` |
| `button.case` / `tracking` / `weight` / `font` (`mono`/`body`/`heading`) | `--sf-btn-transform`, `--sf-btn-tracking`, `--sf-btn-weight`, `--sf-btn-font` | uppercase / 0.2em / 600 / mono |
| `card.radius` / `border` / `shadow` / `shadowHover` | `--sf-card-radius`, `--sf-card-border`, `--sf-card-shadow`, `--sf-card-shadow-hover` | theme radius / 1px line / none / none |
| `heading.weight` / `tracking` / `transform` | `--sf-heading-weight`, `--sf-heading-tracking`, `--sf-heading-transform` | 600 / normal / none |
| `label.style` (`plain` / `bracket` / `numbered`) | consumed by `SectionLabel` default slot | `plain` |
| `input.style` (`underline` / `box`) | `data-sf-input` on root | `underline` |
| `chassis` (`glow` / `flat`) | `data-sf-chassis` on root | `glow` |
| `badge.radius` | `--sf-badge-radius` | theme radius |

A refactor pass replaces hardcoded modern choices in the CSS modules (`mantine.css`, `chassis.css`,
card/button/input/label rules in feature modules) with these variables. `modern`'s token values
reproduce today's output exactly — guarded by a snapshot test of `cssVariablesFor` and the e2e
screenshots taken before the refactor.

### 1.4 Options

```ts
type TemplateOption =
  | { key: string; type: 'boolean'; label: string; help?: string; default: boolean }
  | { key: string; type: 'select'; label: string; help?: string; default: string; choices: { value: string; label: string }[] }
  | { key: string; type: 'text'; label: string; help?: string; default: string; maxLength: number };  // ≤100
```

Resolved options = manifest defaults ⊕ stored `theme.options` (unknown keys dropped, wrong types
replaced by the default). Option strings are rendered as React text only — never HTML, CSS or URLs.

### 1.5 Parts

Stable hooks for template CSS, added as `data-sf-part` attributes: `header`, `footer`, `main`, `button`,
`card`, `product-card`, `product-row`, `price`, `section-label`, `input`, `sheet`, `drawer`, `badge`,
`cart-bar`, `notice`, `stepper`. Template CSS may target only `:root[data-sf-template="<id>"]`-scoped
selectors over parts, tokens, Mantine's public `data-*` attributes and its own slot markup — never hashed
module class names. The list is the public contract in `docs/templates.md`; removing or renaming a part
is a `contractVersion` bump.

### 1.6 Slots

| Slot | Rendered by | Default (modern) |
|---|---|---|
| `TopBar` | both shells, above the header | nothing |
| `Footer` | `StorefrontShell` footer / `MenuShell` foot | today's footer markup |
| `CatalogHero` | `ProductGrid`, `ProductList`, `WholesaleCatalogPage` hero area | today's tagline + welcome markup |
| `SectionLabel` | category section headings | today's heading |
| `Overlay` | `App`, fixed layer above chassis, `pointer-events: none` | nothing |
| `ButtonAdornment` | primary `Button`s via a thin wrapper | nothing |

Every slot receives `{ settings, brand, options, scheme }` plus slot-specific props (e.g.
`SectionLabel` gets `{ index, title }`; `CatalogHero` gets `{ itemCount }`). `TemplateProvider`
resolves the active template, lazy-loads its `index.ts`, and exposes `useSlot(name)` falling back to the
default. A load failure logs a warning and renders modern — theming never breaks the storefront.

### 1.7 Resolution

`resolveTheme(stored: Theme, catalog): ResolvedTheme`:
1. Look up `stored.template`; unknown → `modern` + warning.
2. Start from the stored effective values (`scheme`, `colors`, `fonts`, `radius`, `density`).
3. Enforce locks: any field the template marks non-editable is replaced by the active preset's value
   (preset = `stored.preset` if valid, else `defaultPreset`). Scheme is forced into `schemes`.
4. Resolve options (1.4).
5. Emit CSS variables (palette + tokens) and root attributes (`data-sf-template`, `data-sf-btn-fill`,
   `data-sf-input`, `data-sf-chassis`, `data-mantine-color-scheme`).

`applyDocumentTheme` and `buildMantineTheme` consume the resolved theme. `googleFontsHref` builds
`family=Name:wght@<declared weights>` per font (single-weight families like Share Tech Mono get no
`wght` axis), fixing the current request-all-weights URL that Google rejects for such families.

### 1.8 First paint

`THEME_BOOTSTRAP` (inlined in `index.html`) additionally stores and applies the resolved template id,
root attributes and token variables from `sf-theme-v1` (payload bumped to include the resolved theme;
an old-shape payload is applied as modern). The template chunk's CSS loads with its JS; returning
visitors see the correct palette immediately and template structure within the chunk load, first-time
visitors see the skeleton. A test keeps the bootstrap in sync with the resolver's variable output.

### 1.9 Build output

A small Vite plugin emits `dist/templates.json`:

```json
{ "schemaVersion": 1, "templates": [ { "id", "name", "version", "description", "author", "schemes",
  "presets", "defaultPreset", "editable", "options", "preview": "/templates/<id>/preview.<hash>.webp",
  "builtIn": true } ] }
```

Manifests minus code; `builtIn: false` for `external/*`. Preview images are emitted as assets.

### 1.10 Live preview listener

`web/src/app/preview-listener.ts`, active only when `?sf-preview=1` is present **and**
`window.parent !== window`:
- Accepts only `{ type: 'sf-preview-theme', theme }` validated by zod against the theme shape.
- Applies the resolved theme in memory (no `localStorage` write), and **drops `customCss`** from the
  message — the saved, backend-sanitised custom CSS still applies.
- Posts `{ type: 'sf-preview-ready' }` to the parent once mounted so the admin can send the first draft.

---

## 2. Settings shape and backend (`ecommerce-backend`)

### 2.1 Theme schema

`storefrontThemeSchema` (`src/modules/storefront-settings/schemas.ts`) gains:

```ts
template: z.string().regex(/^[a-z0-9-]{1,40}$/).default('modern'),
preset: z.string().regex(/^[a-z0-9-]{1,40}$/).nullable().default(null),
options: z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/), z.union([z.boolean(), z.string().max(100)]))
  .refine((o) => Object.keys(o).length <= 30, 'At most 30 template options')
  .default({}),
```

Existing fields unchanged and now mean "effective values". Old stored themes parse to
`template: 'modern', preset: null, options: {}` — no migration. `DEFAULT_THEME` gains the three
defaults. The backend stays template-agnostic: it never validates a template id against a catalog, so
adding a template never needs a backend release. `customCss` keeps its existing sanitiser.

### 2.2 Template catalog capture

New deploy-job step `templates` (`src/modules/storefront-deploy/deploy-job.ts`, after `extract`):
read `web/dist/templates.json` from the extracted file map, validate with a zod schema mirroring 1.9,
and upsert setting `storefront_templates_catalog` = `{ tag, capturedAt, templates }`. Missing file
(older release) → store `null`. Invalid file → the step logs a warning and stores `null`; it does not
fail the deploy (a bad catalog must not block shipping a storefront).

### 2.3 Catalog endpoint

`GET /api/v1/storefront-settings/templates` — same authorisation as `GET /storefront-settings`.

```ts
{ source: 'deployed' | 'live' | 'fallback', tag: string | null, baseUrl: string | null, templates: CatalogTemplate[] }
```

Resolution order:
1. `storefront_templates_catalog` captured at deploy (`baseUrl` = `https://{storefront_cf_hostname}`).
2. Else `GET https://{storefront_cf_hostname}/templates.json` (5 s timeout, 5-min in-memory cache,
   same zod validation) — covers hand-deployed storefronts.
3. Else env `STOREFRONT_TEMPLATES_URL` (local dev, e.g. `http://localhost:5173/templates.json`;
   `baseUrl` = its origin).
4. Else a one-entry fallback describing `modern`.

`baseUrl` lets the admin resolve preview image paths and the preview iframe URL.

### 2.4 Public side

`/public/storefront/settings` already returns `theme`; the new fields ride along. No new public routes.

### 2.5 Docs

`STOREFRONT.md` (contract doc) and the OpenAPI registry (`src/docs/registry.ts`) updated for the new
theme fields and the catalog endpoint.

---

## 3. Admin editor (`ecommerce-admin-frontend`, Storefront → Appearance)

`ThemeCard` is replaced by one form (react-hook-form + zod, single save bar) holding the whole `theme`:

1. **Template card** — responsive grid of catalog templates (preview thumbnail, name, description,
   scheme chips, Built-in/Imported badge). Selected template shows its presets as swatch chips.
   Choosing a template or preset copies the preset's `scheme`, `colors`, `fonts`, `radius` into the
   form and resets `options` to manifest defaults; if the form differs from the current preset's values,
   a confirm `Modal` asks first. A note appears when `source !== 'deployed'`.
2. **Customise card** — today's colour/font/radius/density fields, filtered by `editable`: locked fields
   stay visible, disabled, with a lock icon and "Set by <template name>". "Reset to preset" button.
   Font fields keep the Google Fonts live preview. Custom CSS stays here, unchanged.
3. **Template options card** — generated from `options[]` (boolean → switch, select → `Select`, text →
   `Input` with `maxLength`). Hidden when empty.
4. **Live preview** — sticky right column on desktop, collapsible section on mobile. With a `baseUrl`,
   an iframe of `{baseUrl}/?sf-preview=1` with a Desktop / Phone (390 px) toggle; the draft theme
   (minus `customCss`) is posted on `sf-preview-ready` and on every change (debounced 150 ms), with
   `targetOrigin` = `baseUrl`'s origin. Without a `baseUrl`, the existing swatch `ThemePreview`.

Stored template not in the catalog → the template card shows "Unavailable — storefront is showing
Modern" and asks for a new pick. Gated by the existing `useCan` storefront-settings permission. New API
function `getStorefrontTemplates()` in `src/api/storefront-settings.ts`, types in
`src/types/storefront-settings.ts`. Uses existing UI primitives; the admin layout must work at phone
width too.

---

## 4. The templates

### 4.1 Modern (`modern`)

Today's look formalised. One preset `default` = today's `DEFAULT_THEME` colours with fonts null (Inter
self-hosted). Everything editable. Tokens per the table in 1.3. Default slots only. Output identical to
the current release.

### 4.2 Dark Luxury (`dark-luxury`, dark only)

- **Presets:** Gold (`#d4a03c` / bg `#0a0907`, default), Silver (`#b4c0d4` / `#080809`), Emerald
  (`#42b872` / `#070908`), Crimson (`#c8385a` / `#09070a`); surfaces/text/muted per the brief. Fonts:
  Inter 400–800 body/heading, JetBrains Mono 400/500 mono.
- **Editable:** colours, density. **Locked:** radius, fonts, button style.
- **Tokens:** cards radius 16, no border, `inset 0 1px 0 rgba(255,248,230,.08), 0 4px 24px rgba(0,0,0,.45)`
  deepening on hover with `translateY(-2px)`; buttons radius 10, `outline-glow` fill (dark bg, accent
  border, three-layer glow — never an accent fill); badges pill; headings 700, -0.03em; prices mono in
  accent; `chassis: flat` (the orb replaces the glow).
- **Slots:** `Overlay` — fixed 4 % SVG fractal-noise grain (`grain`, default on) and one elliptical orb
  behind the catalog hero (`orb`, default on; breathes on desktop, static on mobile). `SectionLabel` —
  `[Category]` in mono accent above the heading. `CatalogHero` — brand tagline as a colour-contrast
  headline (supporting words muted, last phrase bright, same weight). `Footer` — rounded (20 px)
  elevated panel with brand, support links, contact, and a status badge `[ACCEPTING ORDERS]` /
  `[ORDERING PAUSED]` from the ordering feature flag (`statusBadge`, default on).
- **Motion:** only the page's single main CTA (checkout / place order) pulses; other primary buttons
  keep a static glow. All motion off under `prefers-reduced-motion`.

### 4.3 Cyber Brutalism (`cyber-brutalism`, dark + light)

- **Presets:** Acid Dark (accent `#D4FF00`, bg `#0D0D0D`, surface `#1A1A1A`, text `#FFFFFF`, default),
  Purple Light (accent `#6B3FF6`, bg `#F4F4EE`, surface `#E8E8E2`, text `#111111`). Fonts: Tektur
  400/600/700/900 heading+body, Share Tech Mono 400 mono.
- **Editable:** colours, density. **Locked:** radius (`none`), fonts, button style.
- **Tokens:** radius 0 everywhere; 1 px borders, no shadows; primary buttons `solid` accent with black
  uppercase Tektur 600; inputs underline; headings uppercase 700; labels `numbered`; `chassis: flat`.
- **Slots:** `TopBar` (`systemBar`, default on) — mono strip `SYS.TIME 14:02:11 / UTC+1 · NODE:
  {nodeLabel} · SKU: {count}`; clock ticks each second in the cutoff timezone; SKU count = catalog
  size; under 480 px shows time + node only. `nodeLabel` text option, default `NODE_01`, max 24.
  `SectionLabel` — `/01 /02 …` in accent mono. `Overlay` — crosshair `+` marks at hero and section
  corners (`crosshairs`, default on; hidden under 480 px). `CatalogHero` — left-aligned uppercase brand
  name at `clamp(2.5rem, 10vw, 7rem)`, tagline in accent, terminal readout of real data
  (`> DISPATCH CUTOFF 16:00`, `> ITEMS 128`, `> ORDERING ONLINE`). `Footer` — hazard-stripe band (dark
  scheme only), mono link grid. `ButtonAdornment` — `↗` SVG on primary buttons.
- **Bottom status bar** (`statusBar`, default on): `● CONNECTION SECURE · > ACCESS GRANTED_`, accent
  bg / black text (dark), `#111` bg / accent text (light). On phones, when the mobile cart bar is
  showing, the cart bar takes its place, restyled as the same strip — two bars never stack.

### 4.4 Mobile contract (all templates)

No horizontal scroll at 360 px; tap targets ≥ 44 px; decorations collapse or hide at the breakpoints
their template declares; safe-area insets respected; overlays `pointer-events: none`;
`prefers-reduced-motion` honoured; iOS input zoom guard kept (16 px inputs). Checked by e2e (§6).

---

## 5. Build-time template import (`ecommerce-storefront`)

### 5.1 Lock file

`templates.lock.json` at the repo root, default `{ "templates": [] }`:

```json
{ "templates": [ { "id": "acme-noir", "repo": "git@github.com:org/sf-template-acme-noir.git", "ref": "<40-char SHA>" } ] }
```

`ref` must be a full commit SHA (branches/tags rejected → reproducible releases).

### 5.2 `scripts/fetch-templates.mjs`

- For each entry: `git init` + `git fetch --depth 1 <repo> <sha>` + checkout into
  `web/src/templates/external/<id>/` (gitignored). Skips when the folder's recorded SHA
  (`.template-ref`) already matches. Removes external folders not in the lock.
- Validates: repo root contains `manifest.ts` and `index.ts`; the manifest's `id` equals the lock `id`;
  no collision with built-ins or other imports; no `package.json` with `dependencies`.
- Import restriction: an ESLint `no-restricted-imports` rule scoped to `web/src/templates/external/**`
  allows only `@/templates/contract`, `react`, relative imports inside the template, and `.css`.
  Built-ins follow the same rule by convention (checked by the same lint config) so they stay valid
  examples.
- Wired into `web` `prebuild` and `predev`, and into `release.yml` before the build. CI auth: optional
  `TEMPLATES_DEPLOY_KEY` secret loaded into ssh-agent; public repos need nothing.
- Trust: an imported template is first-party code in every client's storefront. Adding one to the lock
  is a code-review decision — `docs/templates.md` says so.

### 5.3 Scaffold and docs

`npm run template:new <id>` copies `scripts/template-starter/` (manifest, empty scoped CSS, index,
README) into `web/src/templates/<id>/`. The same starter is the recommended base for an external repo.
`docs/templates.md` documents the contract: manifest, tokens, parts, slots and their props, options,
mobile rules, import workflow and the trust note.

---

## 6. Testing

- **Storefront vitest:** registry validation (each rejection case); `resolveTheme` (locks, preset
  fallback, unknown template → modern, option coercion); `cssVariablesFor` snapshot for modern equals
  today's values; bootstrap/resolver sync; `googleFontsHref` per-font weights; preview listener
  (framed + param required, malformed rejected, `customCss` dropped, no localStorage write);
  `templates.json` emitter output; slots render with defaults when a template omits them.
- **Fetch script (`node --test`):** lock validation (SHA-only, id collisions, built-in collision),
  end-to-end against a fixture local git repo, stale-folder cleanup, skip-when-current.
- **Storefront e2e (Playwright, mocked):** for each built-in template (and each brutalism preset):
  catalog → product → cart → checkout at 360 / 390 / 768 / 1280 px; assert no horizontal overflow,
  mobile cart bar unobstructed, brutalist status bar merged with cart bar on phones, options toggle
  decorations off. Screenshots per template × viewport saved under `docs/screenshots/templates/`.
  Modern screenshots captured **before** the token refactor are the regression baseline.
- **Backend:** schema (old shape → modern defaults, option limits, slug validation); deploy-job
  `templates` step with/without/invalid file in a fixture zip; catalog endpoint's four-step fallback.
- **Admin:** no test runner. Mocked Playwright pass (`page.route` + seeded JWT pattern): pick template
  → preset → locked fields disabled → options render → iframe receives `postMessage`. Lint measured
  against the pre-change baseline (it already fails on main).

## 7. Rollout

Feature branch `feature/storefront-templates` in all three repos. Deploy order:
1. **Backend** — accepts/serves new theme fields, captures catalogs on deploy.
2. **Storefront release** (`npm version minor`, tag) — then redeploy each client from the admin so the
   catalog is captured.
3. **Admin SPA.** If it ships before a templated storefront is deployed, the picker shows the
   modern-only fallback.

Existing clients stay on `modern`, pixel-identical, until someone picks a template.
