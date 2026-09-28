# Storefront Templates — Plan 2: Template Engine (storefront) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the storefront's palette-only theming into an open-ended template engine — contract, registry, resolver, tokens, parts, slots, first paint, live preview, `templates.json` catalog and build-time git imports — shipping `modern` as the default with pixels identical to today.

**Architecture:** A template is a folder (`web/src/templates/<id>/` or `web/src/templates/external/<id>/`) with a pure-data `manifest.ts`, a lazy `index.ts` (scoped CSS + optional React slots). `registry.ts` discovers them with `import.meta.glob`; `resolveTheme()` merges the stored effective values with the template's locks and options; `tokens.ts` turns manifest tokens into `--sf-*` variables and root `data-sf-*` attributes; `TemplateProvider` lazy-loads the active template's chunk and `<Slot>` renders its components or the modern defaults. A Vite plugin emits `dist/templates.json`; `scripts/fetch-templates.mjs` vendors pinned external template repos before build.

**Tech Stack:** React 19, Mantine 9.5, Vite 7, zod 4, vitest 4 (jsdom), Playwright 1.62, Node 22 (`node --test`), git CLI.

**Spec:** `docs/superpowers/specs/2026-09-28-storefront-templates-design.md` (§1, §4.1, §4.4, §5, storefront parts of §6).

**Sibling plans:** Plan 1 (backend theme schema + catalog capture), Plan 3 (`dark-luxury` + `cyber-brutalism` templates — consumes the **Contract reference** below verbatim), Plan 4 (admin editor — consumes the `templates.json` shape in Task 9 and the preview message in Task 8).

## Global Constraints

- Repo: `T:\Projects\ecommerce\ecommerce-storefront`, branch `feature/storefront-templates` (already checked out). **Never stage `designs/`** (untracked, not ours to commit). Stage files by explicit path, never `git add -A`/`.`/a directory.
- Web code: `@/` alias with explicit `.ts`/`.tsx` extensions on every import (existing style). Worker/scripts: plain ESM `.mjs`.
- Tests: web `npm run test:web` (vitest, `web/test/**/*.test.{ts,tsx}`); scripts `npm run test:scripts` (`node --test scripts/*.test.mjs`); typecheck `npm run typecheck`; e2e `npm run test:e2e` (mocked, Vite on :5199).
- **Modern must stay pixel-identical.** `e2e/templates-baseline.spec.ts` (Task 1) is the gate: it must pass unchanged after Tasks 4, 5, 6, 7 and 8. A failing baseline is a bug in the task, never a reason to `--update-snapshots`.
- `contractVersion: 1`. Template id `/^[a-z0-9-]{1,40}$/`. Option key `/^[a-zA-Z0-9_-]{1,40}$/`, ≤ 30 options, text option `maxLength` 1–100, select `choices` 1–20. Font family `/^[A-Za-z0-9 ]{1,50}$/`, weights 1–9 integers 100–900 in steps of 100. Text caps: `name` ≤ 60, `description` ≤ 500, `author` ≤ 100, `version` ≤ 40 (these match Plan 1's catalog schema). Token values: radius tokens `'theme' | 'pill' | integer 0..64`; tracking `'normal' | '0' | <signed decimal>em`; weights 100–900 step 100; card border/shadow `'none'` or a CSS value without `;{}` (≤ 200 chars); `glass` `'on' | 'off'`.
- **Stage by explicit file path in every `git add`** (the worktree is shared with other sessions). `git add` of an unchanged tracked path is a harmless no-op, so the lists below may name files a step turned out not to touch.
- Template naming rules shared by the scripts (reserved folder names, id/SHA regexes, the import allowlist) live in **one** module, `scripts/template-rules.mjs` (Task 10); nothing re-declares them.
- `templates.lock.json` `ref` must be a full 40-char lowercase commit SHA (`/^[0-9a-f]{40}$/`).
- `templates.json` shape is `{ schemaVersion: 1, templates: CatalogTemplate[] }` exactly as defined in Task 9 — Plan 1 and Plan 4 consume it.
- Option strings from the backend are rendered as React text only — never HTML, CSS or URLs.
- Draft `customCss` is never applied through the preview channel.
- No new runtime or dev dependencies (Vite's own `createServer` is used for the catalog plugin; no ESLint exists in `web/`, so the import restriction is enforced by a shared scanner — see Task 10; the `yaml` package is not installed, so Task 12's workflow test reads the YAML as text).
- **UI/CSS tasks (6, 7, and the markup parts of 13) are implemented by a frontend-design subagent** (user preference); logic tasks may be done directly.
- Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Stored theme from an older backend** (no `template`/`preset`/`options`, or `options` with wrong value types) → renders modern / manifest defaults, never throws. Pinned in Task 3 (`resolve.test.ts`: "old-shape theme", "wrong option types").
2. **Stored template id not in this release** (rollback, removed import) or a `preset` id from another template → modern with its default preset, one console warning, colours still the stored ones. Pinned in Task 3 ("unknown template", "foreign preset").
3. **Template chunk fails or hangs** (stale `index.html` after a redeploy 404s the old chunk hash; offline) → default slots render after the timeout, no blank page, late success still upgrades. Pinned in Task 6 (`templates-runtime.test.tsx`: "load failure", "timeout then late load").
4. **localStorage absent, corrupted, or holding the previous release's `sf-theme-v1` payload** → bootstrap never throws; v1 is still painted. Pinned in Task 5 (`theme-bootstrap.test.ts`: "corrupt v2", "legacy v1").
5. **Preview messages from a non-parent window, malformed, or carrying `customCss`**, and preview mode writing to localStorage → ignored / stripped / never persisted. Message handling pinned in Task 8 (`preview-listener.test.ts`); `applyDocumentTheme(…, { persist: false })` pinned in Task 5 (`theme-bootstrap.test.ts`: "never persists in preview mode"); the end-to-end wiring (preview theme overrides the stored one, saved `customCss` kept, nothing written) pinned in Task 8 (`document-theme.test.tsx`).
6. **A settings response that is minutes old when a clock slot mounts** (late chunk, shell switch, preview template switch) → the clock still shows server time now, because the anchor is the settings fetch time (recorded when the settings queryFn resolves — the response's `dataUpdatedAt`), not the mount time. Pinned in Task 6 (`server-clock.test.tsx`).

---

## Contract reference (consumed verbatim by Plan 3)

Everything a template may touch. Templates import **only** from `@/templates/contract.ts` (slots, hooks, components, types), `@/templates/define.ts` (manifests — `manifest.ts` may import nothing else), `react`, `react/jsx-runtime`, relative files inside their own folder, and relative `.css`. The allowlist lives in `scripts/template-rules.mjs` and is enforced by `scripts/template-imports.mjs` (Task 10).

### Folder and module shape

```
web/src/templates/<id>/            (built-in)   or   web/src/templates/external/<id>/   (imported)
  manifest.ts    export default defineTemplate({...})       — imports only '@/templates/define.ts'
  index.ts       import './template.css'; export const slots: TemplateSlots = { ... };
  template.css   every rule under :root[data-sf-template="<id>"]
  slots/*.tsx    optional slot components
  preview.webp   optional (png/jpg/jpeg also accepted), referenced as manifest.preview = './preview.webp'
```

`index.ts` must have a named export `slots` (may be `{}`), typed `TemplateSlots`. Nothing else is read from it.

### `web/src/templates/define.ts` (pure — no React, no CSS)

```ts
export const CONTRACT_VERSION = 1 as const;

export type ColorKey = 'primary' | 'bg' | 'surface' | 'text' | 'muted' | 'success' | 'warn' | 'danger';
export const COLOR_KEYS: readonly ColorKey[] = ['primary', 'bg', 'surface', 'text', 'muted', 'success', 'warn', 'danger'];
export type Scheme = 'dark' | 'light';
export type RadiusName = 'none' | 'sm' | 'md' | 'lg' | 'xl';
export type Density = 'comfortable' | 'compact';

export interface FontSpec { family: string; weights: number[] }
export interface PresetFonts { heading: FontSpec | null; body: FontSpec | null; mono: FontSpec | null }

export interface TemplatePreset {
  id: string;
  name: string;
  scheme: Scheme;
  colors: Record<ColorKey, string>; // 6-digit hex
  fonts: PresetFonts;               // null = the self-hosted Inter stack
  radius: RadiusName;
}

/** 'theme' = follow the store radius (var(--mantine-radius-default)); 'pill' = 999px; number = px. */
export type RadiusToken = 'theme' | 'pill' | number;
export type ButtonFill = 'solid' | 'outline-glow' | 'ghost';
export type TextCase = 'uppercase' | 'none';
export type LabelStyle = 'plain' | 'bracket' | 'numbered';

export interface TemplateTokens {
  button: {
    radius: RadiusToken;
    fill: ButtonFill;
    transform: TextCase;
    tracking: { sm: string; md: string; lg: string }; // CSS letter-spacing per Mantine size band
    weight: number;
    font: 'mono' | 'body' | 'heading';
  };
  card: { radius: RadiusToken; border: string; shadow: string; shadowHover: string }; // border/shadow = CSS values ('none' allowed)
  heading: { weight: number; tracking: string; transform: TextCase };
  label: { style: LabelStyle };
  input: { style: 'underline' | 'box' };
  chassis: 'glow' | 'flat';
  /** 'off' = frosted chrome (.glass/.glass-soft bars, Mantine overlays) loses its blur and turns solid --sf-bg. */
  glass: 'on' | 'off';
  badge: { radius: RadiusToken };
}
// Accepted token values (validateManifest checks them): radius tokens 'theme' | 'pill' | integer 0..64 (px);
// tracking = 'normal' | '0' | signed decimal + 'em' (e.g. '0.2em', '-0.03em', '0.04em');
// weight = 100..900 step 100; border/shadow = 'none' or a CSS value without ';', '{', '}' (≤200 chars).

/** Modern's tokens — today's look. Templates spread and override. */
export const BASE_TOKENS: TemplateTokens = {
  button: { radius: 'theme', fill: 'solid', transform: 'uppercase', tracking: { sm: '0.18em', md: '0.2em', lg: '0.22em' }, weight: 600, font: 'mono' },
  card: { radius: 'theme', border: '1px solid var(--sf-line)', shadow: 'none', shadowHover: 'none' },
  heading: { weight: 600, tracking: 'normal', transform: 'none' },
  label: { style: 'plain' },
  input: { style: 'underline' },
  chassis: 'glow',
  glass: 'on',
  badge: { radius: 'pill' },
};

export type TemplateOption =
  | { key: string; type: 'boolean'; label: string; help?: string; default: boolean }
  | { key: string; type: 'select'; label: string; help?: string; default: string; choices: { value: string; label: string }[] }
  | { key: string; type: 'text'; label: string; help?: string; default: string; maxLength: number };

export type OptionValues = Record<string, boolean | string>;

export interface TemplateEditable { colors: ColorKey[]; fonts: boolean; radius: boolean; density: boolean }

export interface TemplateManifest {
  contractVersion: 1;
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  schemes: Scheme[];
  presets: TemplatePreset[];
  defaultPreset: string;
  tokens: TemplateTokens;
  editable: TemplateEditable;
  options: TemplateOption[];
  preview?: string; // './preview.webp' | './preview.png' | './preview.jpg' | './preview.jpeg'
}

export const TEMPLATE_ID_RE = /^[a-z0-9-]{1,40}$/;
export const OPTION_KEY_RE = /^[a-zA-Z0-9_-]{1,40}$/;
export const FONT_FAMILY_RE = /^[A-Za-z0-9 ]{1,50}$/;
export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const PREVIEW_RE = /^\.\/[A-Za-z0-9_-]+\.(webp|png|jpg|jpeg)$/;
const RADII: readonly RadiusName[] = ['none', 'sm', 'md', 'lg', 'xl'];
const MAX_OPTIONS = 30;
const MAX_CHOICES = 20;
const MAX_WEIGHTS = 9;
/** Text caps — identical to Plan 1's catalog schema, so a manifest that builds is never dropped by the backend. */
const TEXT_CAPS = { name: 60, version: 40, description: 500, author: 100 } as const;

/** Identity — exists so manifests are type-checked against the contract. */
export function defineTemplate(manifest: TemplateManifest): TemplateManifest {
  return manifest;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function fontErrors(font: unknown, where: string): string[] {
  if (font === null) return [];
  if (!isObj(font) || !isStr(font.family) || !FONT_FAMILY_RE.test(font.family)) return [`${where}: font family must match ${FONT_FAMILY_RE}`];
  const w = font.weights;
  if (!Array.isArray(w) || w.length === 0 || w.length > MAX_WEIGHTS || !w.every((n) => Number.isInteger(n) && n >= 100 && n <= 900 && n % 100 === 0)) {
    return [`${where}: font weights must be 1..${MAX_WEIGHTS} values of 100..900 in steps of 100`];
  }
  return [];
}

const TRACKING_RE = /^(normal|0|-?\d*\.?\d+em)$/;
const CSS_VALUE_RE = /^[^;{}]{1,200}$/;
const isWeight = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 100 && v <= 900 && v % 100 === 0;
const isRadiusToken = (v: unknown) => v === 'theme' || v === 'pill' || (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 64);
const oneOf = (v: unknown, allowed: readonly string[]) => typeof v === 'string' && allowed.includes(v);

/** Token values end up as CSS custom properties / root attributes, so each one is checked against its allowed shape. */
function tokenErrors(t: Record<string, unknown>): string[] {
  const e: string[] = [];
  const b = isObj(t.button) ? t.button : {};
  const c = isObj(t.card) ? t.card : {};
  const h = isObj(t.heading) ? t.heading : {};
  const tr = isObj(b.tracking) ? b.tracking : {};
  if (!isRadiusToken(b.radius)) e.push("tokens.button.radius must be 'theme', 'pill' or an integer 0..64");
  if (!oneOf(b.fill, ['solid', 'outline-glow', 'ghost'])) e.push('tokens.button.fill must be solid | outline-glow | ghost');
  if (!oneOf(b.transform, ['uppercase', 'none'])) e.push('tokens.button.transform must be uppercase | none');
  for (const k of ['sm', 'md', 'lg'] as const) if (typeof tr[k] !== 'string' || !TRACKING_RE.test(tr[k] as string)) e.push(`tokens.button.tracking.${k} must be 'normal', '0' or an em value like '0.2em'`);
  if (!isWeight(b.weight)) e.push('tokens.button.weight must be 100..900 in steps of 100');
  if (!oneOf(b.font, ['mono', 'body', 'heading'])) e.push('tokens.button.font must be mono | body | heading');
  if (!isRadiusToken(c.radius)) e.push("tokens.card.radius must be 'theme', 'pill' or an integer 0..64");
  for (const k of ['border', 'shadow', 'shadowHover'] as const) if (typeof c[k] !== 'string' || !CSS_VALUE_RE.test(c[k] as string)) e.push(`tokens.card.${k} must be 'none' or a CSS value without ; { } (max 200 chars)`);
  if (!isWeight(h.weight)) e.push('tokens.heading.weight must be 100..900 in steps of 100');
  if (typeof h.tracking !== 'string' || !TRACKING_RE.test(h.tracking)) e.push("tokens.heading.tracking must be 'normal', '0' or an em value");
  if (!oneOf(h.transform, ['uppercase', 'none'])) e.push('tokens.heading.transform must be uppercase | none');
  if (!isObj(t.label) || !oneOf(t.label.style, ['plain', 'bracket', 'numbered'])) e.push('tokens.label.style must be plain | bracket | numbered');
  if (!isObj(t.input) || !oneOf(t.input.style, ['underline', 'box'])) e.push('tokens.input.style must be underline | box');
  if (!oneOf(t.chassis, ['glow', 'flat'])) e.push('tokens.chassis must be glow | flat');
  if (!oneOf(t.glass, ['on', 'off'])) e.push('tokens.glass must be on | off');
  if (!isObj(t.badge) || !isRadiusToken(t.badge.radius)) e.push("tokens.badge.radius must be 'theme', 'pill' or an integer 0..64");
  return e;
}

/**
 * Checks what TypeScript can't: regexes, cross-references and limits. Returns one message
 * per problem, each prefixed with the folder id. An empty list means valid.
 */
export function validateManifest(value: unknown, folderId: string): string[] {
  const e: string[] = [];
  const err = (m: string) => e.push(`${folderId}: ${m}`);
  if (!isObj(value)) { err('manifest is not an object (missing default export?)'); return e; }
  const m = value as Partial<TemplateManifest>;
  if (m.contractVersion !== CONTRACT_VERSION) err(`contractVersion must be ${CONTRACT_VERSION}`);
  if (!isStr(m.id) || !TEMPLATE_ID_RE.test(m.id)) err(`id must match ${TEMPLATE_ID_RE}`);
  else if (m.id !== folderId) err(`id "${m.id}" must equal its folder name "${folderId}"`);
  for (const k of ['name', 'version', 'description', 'author'] as const) {
    const v = m[k];
    if (!isStr(v)) err(`${k} is required`);
    else if (v.length > TEXT_CAPS[k]) err(`${k} must be at most ${TEXT_CAPS[k]} characters`);
  }
  const schemes = Array.isArray(m.schemes) ? m.schemes : [];
  if (schemes.length === 0 || !schemes.every((s) => s === 'dark' || s === 'light')) err('schemes must list dark and/or light');

  const presets = Array.isArray(m.presets) ? m.presets : [];
  if (presets.length === 0) err('at least one preset is required');
  const presetIds = new Set<string>();
  for (const p of presets) {
    const where = `preset "${isObj(p) ? String(p.id) : '?'}"`;
    if (!isObj(p) || !isStr(p.id) || !TEMPLATE_ID_RE.test(p.id)) { err(`${where}: id must match ${TEMPLATE_ID_RE}`); continue; }
    if (presetIds.has(p.id)) err(`${where}: duplicate preset id`);
    presetIds.add(p.id);
    if (!isStr(p.name)) err(`${where}: name is required`);
    if (!schemes.includes(p.scheme as Scheme)) err(`${where}: scheme "${String(p.scheme)}" is not in schemes`);
    const colors = isObj(p.colors) ? p.colors : {};
    for (const k of COLOR_KEYS) if (typeof colors[k] !== 'string' || !HEX_RE.test(colors[k] as string)) err(`${where}: colors.${k} must be a 6-digit hex`);
    const fonts = isObj(p.fonts) ? p.fonts : {};
    for (const slot of ['heading', 'body', 'mono'] as const) e.push(...fontErrors(fonts[slot] ?? null, `${folderId}: ${where}.fonts.${slot}`));
    if (!RADII.includes(p.radius as RadiusName)) err(`${where}: radius must be one of ${RADII.join(', ')}`);
  }
  if (!isStr(m.defaultPreset) || !presetIds.has(m.defaultPreset)) err(`defaultPreset "${String(m.defaultPreset)}" is not one of the presets`);

  if (!isObj(m.tokens)) err('tokens are required');
  else e.push(...tokenErrors(m.tokens).map((msg) => `${folderId}: ${msg}`));
  const ed = m.editable;
  if (!isObj(ed) || !Array.isArray(ed.colors) || !ed.colors.every((c) => COLOR_KEYS.includes(c))) err('editable.colors must be a subset of the colour keys');

  const options = Array.isArray(m.options) ? m.options : [];
  if (options.length > MAX_OPTIONS) err(`at most ${MAX_OPTIONS} options`);
  const keys = new Set<string>();
  for (const o of options) {
    if (!isObj(o) || !isStr(o.key) || !OPTION_KEY_RE.test(o.key)) { err(`option key must match ${OPTION_KEY_RE}`); continue; }
    if (keys.has(o.key)) err(`duplicate option key "${o.key}"`);
    keys.add(o.key);
    if (!isStr(o.label)) err(`option "${o.key}": label is required`);
    if (o.type === 'boolean') { if (typeof o.default !== 'boolean') err(`option "${o.key}": default must be boolean`); }
    else if (o.type === 'select') {
      const choices = Array.isArray(o.choices) ? o.choices : [];
      if (choices.length === 0 || choices.length > MAX_CHOICES) err(`option "${o.key}": choices must list 1..${MAX_CHOICES} entries`);
      if (!choices.some((c) => isObj(c) && c.value === o.default)) err(`option "${o.key}": default must be one of its choices`);
    } else if (o.type === 'text') {
      const max = o.maxLength;
      if (typeof max !== 'number' || !Number.isInteger(max) || max < 1 || max > 100) err(`option "${o.key}": maxLength must be 1..100`);
      else if (typeof o.default !== 'string' || o.default.length > max) err(`option "${o.key}": default must be a string within maxLength`);
    } else err(`option "${o.key}": unknown type "${String(o.type)}"`);
  }
  if (m.preview !== undefined && (typeof m.preview !== 'string' || !PREVIEW_RE.test(m.preview))) err(`preview must look like ./preview.webp (webp/png/jpg/jpeg)`);
  return e;
}
```

This block is the whole of `define.ts` — Task 2 creates the file from it verbatim.

### `web/src/templates/slots.ts` (types only)

```ts
import type { ComponentType, ReactNode } from 'react';
import type { Brand, LayoutKind, SupportLink } from '@/types/settings.ts';
import type { OptionValues, Scheme, TemplateTokens } from '@/templates/define.ts';

/** Filled in by <Slot> — callers never pass these. */
export interface SlotBaseProps {
  brand: Brand;
  options: OptionValues;   // resolved: manifest defaults ⊕ stored values
  scheme: Scheme;
  layout: LayoutKind;      // 'storefront' | 'menu'
  tokens: TemplateTokens;
}
/** Above the header, first child of both shells (not on the chromeless order page). */
export type TopBarProps = SlotBaseProps;
/** StorefrontShell: replaces the footer. MenuShell: rendered after <main>, before the contact strip. */
export interface FooterProps extends SlotBaseProps { supportLinks: SupportLink[]; hasChat: boolean }
/** Catalogue intro. grid = ProductGrid hero; list = ProductList welcome; wholesale = WholesaleCatalogPage welcome. */
export interface CatalogHeroProps extends SlotBaseProps {
  surface: 'grid' | 'list' | 'wholesale';
  tagline: string;
  welcomeMessage: string | null;
  productCount: number;
  categoryCount: number;
}
/** Eyebrow above a heading. page = the catalogue page title (index 1); group = a menu-layout category section (1-based). */
export interface SectionLabelProps extends SlotBaseProps { index: number; title: string; level: 'page' | 'group' }
/** Fixed decoration layer, last child of all three shells. Must be pointer-events: none. */
export type OverlayProps = SlotBaseProps;
/** Trailing adornment inside primary buttons. cta = the page's single main call to action. */
export interface ButtonAdornmentProps extends SlotBaseProps { variant: 'primary' | 'secondary'; cta: boolean }

export interface SlotPropsMap {
  TopBar: TopBarProps;
  Footer: FooterProps;
  CatalogHero: CatalogHeroProps;
  SectionLabel: SectionLabelProps;
  Overlay: OverlayProps;
  ButtonAdornment: ButtonAdornmentProps;
}
export type SlotName = keyof SlotPropsMap;
export type TemplateSlots = { [K in SlotName]?: ComponentType<SlotPropsMap[K]> };
export interface TemplateModule { slots?: TemplateSlots }
export type SlotChildren = ReactNode;
```

Defaults (modern): `TopBar`, `Overlay`, `ButtonAdornment` render nothing; `Footer` renders today's storefront footer (nothing in the menu layout); `CatalogHero` renders today's hero/welcome markup per surface; `SectionLabel` renders nothing for `tokens.label.style === 'plain'`, `[Title]` for `'bracket'`, `/01` for `'numbered'` (mono, 11px, `--sf-primary`, `data-sf-part="section-label"`). A template-provided slot is wrapped in `<div data-sf-slot="<Name>" style="display:contents">`; defaults are not wrapped.

### `web/src/templates/contract.ts` (the public barrel)

```ts
export * from '@/templates/define.ts';
export type * from '@/templates/slots.ts';
export { useTemplate, useTemplateOptions, useStorefront, useCatalogStats, useOrderingState, formatClock, utcOffsetLabel } from '@/templates/hooks.ts';
export type { TemplateInfo, StorefrontInfo, CatalogStats, OrderingState } from '@/templates/hooks.ts';
export { useServerClock, useCutoffInfo } from '@/lib/server-clock.ts';
export type { CutoffInfo } from '@/lib/server-clock.ts';
export { useMobileCartBar } from '@/features/cart/MobileCartBar.tsx';
export { Brand } from '@/components/Brand.tsx';
export { ContactLinks } from '@/components/ContactLinks.tsx';
export { ArrowUpRightIcon } from '@/components/icons.tsx';
export type { GlyphProps } from '@/components/icons.tsx';
export { Link } from 'react-router';
```

`ArrowUpRightIcon(props: GlyphProps)` — the shop's `↗` glyph (24-unit viewBox, 1.6 stroke, square caps, `currentColor`). `GlyphProps = { size?: number | string } & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>`: `size` defaults to 13 (px; pass `'1em'` to follow the font size) and any other SVG prop (`className`, `data-*`) is spread onto the `<svg>`. Task 6 widens `components/icons.tsx` to this signature; existing `size={12}` callers are unchanged.

Hook signatures:

```ts
interface TemplateInfo { id: string; presetId: string; scheme: Scheme; options: OptionValues; tokens: TemplateTokens }
useTemplate(): TemplateInfo
useTemplateOptions(): OptionValues
interface StorefrontInfo { brand: Brand; features: Features; supportLinks: SupportLink[]; welcomeMessage: string | null; currency: string; enabled: boolean }
useStorefront(): StorefrontInfo
interface CatalogStats { productCount: number | null; categoryCount: number | null }   // null while loading
useCatalogStats(): CatalogStats
interface OrderingState { enabled: boolean; ordering: boolean; accepting: boolean }    // accepting = enabled && ordering
useOrderingState(): OrderingState
useServerClock(intervalMs?: number /* default 1000 */): Date                            // server-anchored (settings fetch time — the response's dataUpdatedAt), ticks
interface CutoffInfo { timezone: string; next: { day: DayKey; cutoff: string; shipsOn: string; isToday: boolean; at: Date; msRemaining: number } | null }   // declared in lib/server-clock.ts
useCutoffInfo(): CutoffInfo                                                               // re-evaluated every 30 s
useMobileCartBar(): boolean                                                               // phone cart bar on screen
formatClock(date: Date, timeZone: string): string        // 'HH:MM:SS', 24h; bad zone → UTC
utcOffsetLabel(date: Date, timeZone: string): string     // 'UTC+1' | 'UTC-5' | 'UTC+5:30' | 'UTC+0'
```

**Cart-bar merge (brutalism):** the mobile cart bar root carries `data-sf-part="cart-bar"`. A template restyles it from `template.css` (`:root[data-sf-template="x"] [data-sf-part="cart-bar"] {...}`) and hides its own bottom status element while `useMobileCartBar()` is `true`. The status element should be in normal flow at the end of the `Footer` slot (not `position: fixed`), so it never needs page clearance.

### Root attributes (set on `<html>` by `applyDocumentTheme` and the first-paint script)

| Attribute | Values |
|---|---|
| `data-sf-template` | resolved template id |
| `data-sf-preset` | resolved preset id |
| `data-sf-btn-fill` | `solid` \| `outline-glow` \| `ghost` |
| `data-sf-input` | `underline` \| `box` |
| `data-sf-chassis` | `glow` \| `flat` (`flat` removes the body's two radial gradients) |
| `data-sf-label` | `plain` \| `bracket` \| `numbered` |
| `data-sf-glass` | `on` \| `off` (`off`: shared rules in `chassis.css` strip `backdrop-filter` from `.glass`, `.glass-soft` and `.mantine-Overlay-root` and paint the two glass classes solid `var(--sf-bg)`) |
| `data-mantine-color-scheme` | `dark` \| `light` |

**Shared button-fill rules.** `mantine.css` carries fill recipes for every element tagged `[data-sf-part="button"][data-variant="filled"]` — Mantine `Button`s *and* the four custom filled buttons (`AddToCart`, `CartSummary` checkout, `MobileCartBar` checkout, `CheckoutPage` `.next` Place-order/Continue) — keyed on `:root[data-sf-btn-fill="outline-glow"]` and `:root[data-sf-btn-fill="ghost"]`. They mirror `buttonVariantVars`: outline-glow = `var(--sf-bg)` fill, `var(--sf-primary)` text, `1px solid var(--sf-primary)` border; ghost = transparent fill, `var(--sf-primary)` text, `1px solid var(--sf-line-strong)` border; both hover to `var(--sf-surface)`; disabled = `var(--sf-faint)` text, `var(--sf-line)` border. `solid` has no shared rule (modern pixels unchanged). A template only adds what is specific to it (e.g. luxury's glow and pulse).

### CSS variables

Palette (unchanged): `--sf-bg --sf-bg-deep --sf-surface --sf-surface-2 --sf-surface-3 --sf-line --sf-line-strong --sf-text --sf-muted --sf-faint --sf-primary --sf-primary-soft --sf-success --sf-warn --sf-danger --sf-logo-h --sf-font-heading --sf-font-body --sf-font-mono`.

Tokens (new): `--sf-btn-radius --sf-btn-transform --sf-btn-weight --sf-btn-font --sf-btn-tracking-sm --sf-btn-tracking-md --sf-btn-tracking-lg --sf-card-radius --sf-card-border --sf-card-shadow --sf-card-shadow-hover --sf-pill-radius --sf-heading-weight --sf-heading-tracking --sf-heading-transform`.

### Parts (`data-sf-part`)

| Part | Attached to |
|---|---|
| `header` | `<header>` in `StorefrontShell`, `MenuShell`, `Chromeless` |
| `main` | `<main>` in the same three shells |
| `footer` | default `Footer` slot's `<footer>` |
| `hero` | default `CatalogHero` grid `<section>` |
| `page-title` | catalogue `<h1>` in `ProductGrid`, `ProductList`, `WholesaleCatalogPage`; product `<h1>` in `ProductDetailPage` |
| `group-title` | menu-layout category `<h2>` in `ProductList` |
| `section-label` | default `SectionLabel` output |
| `button` | every Mantine `Button` (theme default prop) plus five custom `<button>`/`<Link>` buttons: `AddToCart` `<button>`; `CartSummary` checkout (disabled `<button>` and `<Link>`); `MobileCartBar` checkout (disabled `<button>` and `<Link>`); `CheckoutPage` `.next` (Place order / Continue) and `.back` (Back). Variant is Mantine's own `data-variant` (`filled` \| `default` \| `subtle`); the custom buttons carry `data-variant="filled"`, except `CheckoutPage` `.back`, which carries `data-variant="default"` |
| `input` | every Mantine `Input` element (theme default prop); the three `classes.input` elements in `features/checkout/Field.tsx` (text input ~L48, select ~L106, textarea ~L160) |
| `card` | exactly these eleven roots: `features/auth/AuthCard.tsx` `<section>` (L21); `features/order-status/AddressCard.tsx` `<section>` (L17); `features/order-status/CryptoPaymentCard.tsx` root (L81); `features/order-status/ItemsCard.tsx` `<section>` (L19); `features/order-status/PaymentSection.tsx` the four `classes.card` elements (L57, L65, L88, L144); `features/order-status/ShipmentCard.tsx` `<section>` (L31); `features/tracking/ParcelCard.tsx` root (L42); `features/checkout/CheckoutPage.tsx` step card `<div>` (L600) |
| `product-card` | `ProductCard` `<article>` |
| `product-row` | `ProductRow` root element |
| `price` | the main price element in `ProductCard`, `ProductRow`, `ProductDetailPage`, `ProductDetailSheet` |
| `badge` | `StockChip` root, `StatusPill` root, header cart count `<span>` in both shells |
| `sheet` | `Drawer.Content` in `components/Sheet.tsx` (every sheet except the cart) |
| `drawer` | the same `Drawer.Content` when `CartDrawer.tsx` opens it (`<Sheet part="drawer">`) |
| `cart-bar` | `MobileCartBar` root `<div>` |
| `notice` | each notice root in `NoticeBanners.tsx` |
| `cutoff` | `CutoffBar` root `<section>` |
| `stepper` | `ProgressStepper` root `<div>` (tracking) and the checkout Mantine `<Stepper>` in `CheckoutPage.tsx` (~L578) |

`data-sf-cta="main"` marks the single main call to action: `CartSummary` checkout, `MobileCartBar` checkout, `CheckoutPage` `.next` button (Place order / Continue). All three also carry `data-sf-part="button" data-variant="filled"`, so templates style them through the shared parts — no page-specific class is ever targeted.

**Heading tokens (`heading.*`) reach only headings whose modern values already equal the tokens:** `ProductGrid` `.title` (weight, tracking, transform) and `ProductDetailPage` `.name` (weight only — it keeps its `-0.01em` tracking). `ProductList` `.title` and `WholesaleCatalogPage` `.title` stay literal (700, negative tracking) so modern stays pixel-identical. A template that wants a heading look everywhere styles `[data-sf-part="page-title"]` and `[data-sf-part="group-title"]` in its `template.css`.

Template CSS specificity: `:root[data-sf-template="x"] [data-sf-part="button"]` (0,3,0) beats module classes (0,1,0) and Mantine's `.mantine-Button-root` rules. Set real properties (`background`, `border`, `box-shadow`), not Mantine's `--button-*` variables (those are inline styles). The shared fill rules are also (0,4,0) (`:root[data-sf-btn-fill=…] [data-sf-part="button"][data-variant="filled"]`); a template's equally specific `:root[data-sf-template=…] [data-sf-part="button"][data-variant="filled"]` rule wins because the template chunk's CSS is injected after `mantine.css`.

**Supported hooks outside the parts table** (stable, documented in `docs/templates.md`): the global classes `.glass` / `.glass-soft` (frosted sticky chrome, from `styles/chassis.css` via `composes`) and Mantine's static `.mantine-Overlay-root`. Prefer the `glass` token (`data-sf-glass`) to switching blur off by hand; target these selectors only for template-specific looks beyond on/off.

---

## File structure

| File | Responsibility |
|---|---|
| `web/src/templates/define.ts` | Manifest types, `BASE_TOKENS`, `defineTemplate`, `validateManifest`, regexes |
| `web/src/templates/slots.ts` | Slot prop types, `TemplateSlots`, `TemplateModule` |
| `web/src/templates/registry.ts` | `import.meta.glob` discovery, validation-with-skip, `getTemplate`, `lookupManifest`, `allTemplates`, `collectManifestErrors` |
| `web/src/templates/resolve.ts` | `resolveTheme` (locks, preset fallback, options) |
| `web/src/templates/tokens.ts` | `tokenVariables`, `rootAttributes`, `radiusCss` |
| `web/src/templates/theme-schema.ts` | zod theme + preview message schemas |
| `web/src/templates/runtime.tsx` | module cache/prefetch, `TemplateProvider`, `useTemplateContext`, `<Slot>` |
| `web/src/templates/hooks.ts` | template-facing hooks + clock helpers |
| `web/src/templates/contract.ts` | public barrel |
| `web/src/templates/catalog.ts` | `toCatalog`/`buildCatalog` for `templates.json` |
| `web/src/templates/defaults/*` | modern default slot components + `DEFAULT_SLOTS` |
| `web/src/templates/modern/*` | the modern template |
| `web/src/lib/server-clock.ts` | `useServerClock`, `useCutoffInfo`, `CutoffInfo` (anchored to the settings fetch time recorded by `lib/settings-anchor.ts` — the response's `dataUpdatedAt`; `CutoffBar` uses it too) |
| `web/src/lib/settings-anchor.ts` | `recordSettingsFetch`, `settingsFetchedAt` (written by the settings queryFn) |
| `web/src/app/preview-listener.ts` | `isPreviewMode`, `subscribePreview`, `usePreviewTheme` |
| `web/src/app/document-theme.ts` | `useDocumentTheme(settings, win?)` — preview override + resolve + `applyDocumentTheme` (used by `ThemedApp`) |
| `web/vite-plugins/templates-catalog.ts` | emits/serves `templates.json` + preview images, fails build on invalid manifests, logs them with `console.error` in dev |
| `scripts/template-rules.mjs` (+`.d.mts`) | the single source of reserved folder names, id/SHA regexes and the import allowlist |
| `scripts/templates-lock.mjs` | lock parsing/validation |
| `scripts/release-workflow.test.mjs` | pins the release workflow's fetch-before-test order and the conditional deploy key |
| `scripts/template-imports.mjs` (+`.d.mts`) | import-restriction scanner |
| `scripts/fetch-templates.mjs` | vendors external templates at pinned SHAs |
| `scripts/new-template.mjs` + `scripts/template-starter/*` | `npm run template:new <id>` |
| `templates.lock.json` | pinned external templates (empty) |
| `e2e/flows.ts` | shared Playwright flows |
| `e2e/templates-baseline.spec.ts` + `e2e/__baseline__/*.png` | modern pixel gate |
| `e2e/templates.spec.ts` | template × viewport matrix |
| `docs/templates.md` | the public contract doc |

---

### Task 1: Modern pixel baseline (before any refactor)

**Files:**
- Create: `e2e/flows.ts`
- Modify: `e2e/storefront.spec.ts` (import the moved helpers)
- Modify: `e2e/playwright.config.ts`
- Create: `e2e/templates-baseline.spec.ts`
- Create (generated, committed): `e2e/__baseline__/*.png`

**Interfaces:**
- Produces: `e2e/flows.ts` exports `onlyVisible(l)`, `productOpener(page, layout, name)`, `openProduct(page, layout, name)`, `openCart(page, viewport)`, `fillCheckout(page)`, `addFirstToCart(page, layout, mocks)`; `FIXED_NOW` constant. Used by Tasks 13 and Plan 3.

- [ ] **Step 1: Extract shared flows**

Create `e2e/flows.ts` by moving `onlyVisible`, `productOpener`, `openProduct`, `openCart` and `fillCheckout` **verbatim** out of `e2e/storefront.spec.ts` (lines defining them, currently ~L41–L127), exporting each, and adding:

```ts
import { expect, type Locator, type Page } from '@playwright/test';
import type { Layout, MockHandle } from './mocks.ts';

/** The fixture's serverTime — freezing Date here keeps the cutoff countdown stable in screenshots. */
export const FIXED_NOW = new Date('2026-08-24T09:00:00.000Z');

// ...moved helpers (export function onlyVisible / productOpener / openProduct / openCart / fillCheckout)...

/** Add the open product once and wait until the line is on the server and the button has settled. */
export async function addFirstToCart(page: Page, layout: Layout, mocks: MockHandle): Promise<void> {
  await page.getByRole('button', { name: /^Add · / }).first().click();
  await expect.poll(() => mocks.state.cart.itemCount).toBe(1);
  if (layout === 'menu') {
    await page.getByRole('button', { name: 'Close' }).first().click();
    await expect(page.getByRole('dialog')).toBeHidden();
  } else {
    await expect(page.getByRole('button', { name: /^Add another/ }).first()).toBeVisible();
  }
}
```

In `e2e/storefront.spec.ts` delete the moved function bodies and add
`import { fillCheckout, onlyVisible, openCart, openProduct, productOpener } from './flows.ts';` (keep `searchBox`, `expectProducts`, `openCategory`, `shot` local — they call the imported helpers).

- [ ] **Step 2: Run the existing suite to prove the move is behaviour-neutral**

Run: `npm run test:e2e -- storefront.spec.ts`
Expected: same pass count as before the move (all pass).

- [ ] **Step 3: Configure screenshot snapshots**

In `e2e/playwright.config.ts` add to the config object:

```ts
  // Modern's pixel baseline (templates-baseline.spec.ts) — one set, committed, no platform suffix:
  // it is a same-machine regression gate for the token refactor, regenerated only on purpose.
  snapshotPathTemplate: '{testDir}/__baseline__/{arg}{ext}',
```

and change `expect: { timeout: 15_000 }` to
`expect: { timeout: 15_000, toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: 'disabled', caret: 'hide' } }`.

- [ ] **Step 4: Write the baseline spec**

`e2e/templates-baseline.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { installMocks, type Layout } from './mocks.ts';
import { addFirstToCart, FIXED_NOW, onlyVisible, openCart, openProduct } from './flows.ts';

/**
 * Modern's pixels, captured BEFORE the template engine touched any CSS. Every later
 * task must leave these passing unchanged — that is how "modern is pixel-identical"
 * is proven rather than asserted.
 */
const VIEWPORTS = { mobile: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } } as const;
const LAYOUTS: Layout[] = ['storefront', 'menu'];

for (const layout of LAYOUTS) {
  for (const size of ['mobile', 'desktop'] as const) {
    test.describe(`modern baseline · ${layout} · ${size}`, () => {
      test.use({ viewport: VIEWPORTS[size] });

      test('catalog → detail → cart → checkout', async ({ page }) => {
        await page.clock.setFixedTime(FIXED_NOW);
        const mocks = await installMocks(page, { layout, session: true });
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
        await expect(page).toHaveScreenshot(`${layout}-${size}-catalog.png`, { fullPage: true });

        await openProduct(page, layout, 'Alpine Extract 10ml');
        await expect(page).toHaveScreenshot(`${layout}-${size}-detail.png`);

        await addFirstToCart(page, layout, mocks);
        await openCart(page, size);
        await expect(page).toHaveScreenshot(`${layout}-${size}-cart.png`);

        await onlyVisible(page.getByRole('link', { name: 'Checkout' })).click();
        await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
        await expect(page).toHaveScreenshot(`${layout}-${size}-checkout.png`);
      });
    });
  }
}
```

- [ ] **Step 5: Generate the baseline, then prove it is stable**

Run: `npm run test:e2e -- templates-baseline.spec.ts --update-snapshots`
Expected: 4 passed, 16 PNGs written to `e2e/__baseline__/`.

Run again without the flag: `npm run test:e2e -- templates-baseline.spec.ts`
Expected: 4 passed (no diff). If any shot flakes, find the moving part (timer, animation) and freeze it in the spec — do not raise `maxDiffPixelRatio`.

- [ ] **Step 6: Commit**

```bash
git add e2e/flows.ts e2e/storefront.spec.ts e2e/playwright.config.ts e2e/templates-baseline.spec.ts \
  e2e/__baseline__/storefront-mobile-catalog.png e2e/__baseline__/storefront-mobile-detail.png e2e/__baseline__/storefront-mobile-cart.png e2e/__baseline__/storefront-mobile-checkout.png \
  e2e/__baseline__/storefront-desktop-catalog.png e2e/__baseline__/storefront-desktop-detail.png e2e/__baseline__/storefront-desktop-cart.png e2e/__baseline__/storefront-desktop-checkout.png \
  e2e/__baseline__/menu-mobile-catalog.png e2e/__baseline__/menu-mobile-detail.png e2e/__baseline__/menu-mobile-cart.png e2e/__baseline__/menu-mobile-checkout.png \
  e2e/__baseline__/menu-desktop-catalog.png e2e/__baseline__/menu-desktop-detail.png e2e/__baseline__/menu-desktop-cart.png e2e/__baseline__/menu-desktop-checkout.png
git status --short e2e   # nothing under e2e/ left unstaged or untracked
git commit -m "test(e2e): capture modern pixel baseline before the template engine

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Manifest contract — `define.ts`, `slots.ts`, theme types, validation

**Files:**
- Create: `web/src/templates/define.ts`
- Create: `web/src/templates/slots.ts`
- Create: `web/src/templates/theme-schema.ts`
- Modify: `web/src/types/settings.ts` (`Theme`)
- Test: `web/test/templates-define.test.ts`

**Interfaces:**
- Produces: everything in the Contract reference's `define.ts` and `slots.ts` blocks; `themeSchema`, `previewMessageSchema` (zod) and `type PreviewMessage`.

- [ ] **Step 1: Extend the stored theme type**

In `web/src/types/settings.ts` replace the `Theme` interface with:

```ts
export type TemplateOptionValue = boolean | string;
export interface Theme {
  /** Absent on backends older than the template engine — resolves to 'modern'. */
  template?: string;
  preset?: string | null;
  options?: Record<string, TemplateOptionValue>;
  scheme: 'dark' | 'light';
  colors: { primary: string; bg: string; surface: string; text: string; muted: string; success: string; warn: string; danger: string };
  fonts: { heading: string | null; body: string | null; mono: string | null };
  radius: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  density: 'comfortable' | 'compact';
  customCss: string;
}
```

- [ ] **Step 2: Write the failing validation tests**

`web/test/templates-define.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BASE_TOKENS, defineTemplate, validateManifest, type TemplateManifest, type TemplateTokens } from '@/templates/define.ts';

function manifest(overrides: Partial<TemplateManifest> = {}): TemplateManifest {
  return defineTemplate({
    contractVersion: 1, id: 'acme', name: 'Acme', version: '1.0.0', description: 'd', author: 'a',
    schemes: ['dark'],
    presets: [{ id: 'gold', name: 'Gold', scheme: 'dark',
      colors: { primary: '#d4a03c', bg: '#0a0907', surface: '#161412', text: '#f0ebe0', muted: '#8a8070', success: '#3d9e5c', warn: '#e0a33e', danger: '#b83c38' },
      fonts: { heading: { family: 'Inter', weights: [700, 800] }, body: null, mono: { family: 'Share Tech Mono', weights: [400] } },
      radius: 'lg' }],
    defaultPreset: 'gold',
    tokens: BASE_TOKENS,
    editable: { colors: ['primary'], fonts: false, radius: false, density: true },
    options: [{ key: 'grain', type: 'boolean', label: 'Grain', default: true }],
    ...overrides,
  });
}

describe('validateManifest', () => {
  it('accepts a well-formed manifest', () => {
    expect(validateManifest(manifest(), 'acme')).toEqual([]);
  });
  it.each<[string, unknown, string]>([
    ['non-object', null, 'not an object'],
    ['contract version', { ...manifest(), contractVersion: 2 }, 'contractVersion'],
    ['folder mismatch', manifest({ id: 'other' }), 'folder'],
    ['no presets', manifest({ presets: [] }), 'preset'],
    ['unknown default preset', manifest({ defaultPreset: 'nope' }), 'defaultPreset'],
    ['preset scheme not supported', manifest({ presets: [{ ...manifest().presets[0]!, scheme: 'light' }] }), 'scheme'],
    ['bad hex', manifest({ presets: [{ ...manifest().presets[0]!, colors: { ...manifest().presets[0]!.colors, bg: 'red' } }] }), 'hex'],
    ['bad font family', manifest({ presets: [{ ...manifest().presets[0]!, fonts: { heading: { family: 'Bad;Font', weights: [400] }, body: null, mono: null } }] }), 'font'],
    ['bad font weight', manifest({ presets: [{ ...manifest().presets[0]!, fonts: { heading: { family: 'Inter', weights: [450] }, body: null, mono: null } }] }), 'weight'],
    ['unknown editable colour', manifest({ editable: { colors: ['nope' as never], fonts: true, radius: true, density: true } }), 'editable'],
    ['bad option key', manifest({ options: [{ key: 'bad key', type: 'boolean', label: 'x', default: true }] }), 'option key'],
    ['duplicate option key', manifest({ options: [{ key: 'a', type: 'boolean', label: 'x', default: true }, { key: 'a', type: 'boolean', label: 'y', default: false }] }), 'duplicate'],
    ['select default not a choice', manifest({ options: [{ key: 'a', type: 'select', label: 'x', default: 'z', choices: [{ value: 'y', label: 'Y' }] }] }), 'choices'],
    ['text maxLength > 100', manifest({ options: [{ key: 'a', type: 'text', label: 'x', default: '', maxLength: 101 }] }), 'maxLength'],
    ['text default too long', manifest({ options: [{ key: 'a', type: 'text', label: 'x', default: 'abcdef', maxLength: 3 }] }), 'maxLength'],
    ['bad preview path', manifest({ preview: 'https://x/y.png' }), 'preview'],
  ])('rejects %s', (_name, value, fragment) => {
    const errors = validateManifest(value, 'acme');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toContain(fragment);
  });
  it('rejects more than 30 options', () => {
    const options = Array.from({ length: 31 }, (_, i) => ({ key: `o${i}`, type: 'boolean' as const, label: 'x', default: true }));
    expect(validateManifest(manifest({ options }), 'acme').join('\n')).toContain('30');
  });
  it('rejects a bad id with exactly one, fully specified message', () => {
    expect(validateManifest(manifest({ id: 'Bad_Id' }), 'acme')).toEqual(['acme: id must match /^[a-z0-9-]{1,40}$/']);
  });
  it.each<[string, Partial<TemplateManifest>, string]>([
    ['name', { name: 'n'.repeat(61) }, 'acme: name must be at most 60 characters'],
    ['version', { version: '1'.repeat(41) }, 'acme: version must be at most 40 characters'],
    ['description', { description: 'd'.repeat(501) }, 'acme: description must be at most 500 characters'],
    ['author', { author: 'a'.repeat(101) }, 'acme: author must be at most 100 characters'],
  ])('caps %s at Plan 1\'s catalog limit', (_field, over, message) => {
    expect(validateManifest(manifest(over), 'acme')).toEqual([message]);
  });
  it('accepts text fields exactly at their caps', () => {
    expect(validateManifest(manifest({ name: 'n'.repeat(60), version: '1'.repeat(40), description: 'd'.repeat(500), author: 'a'.repeat(100) }), 'acme')).toEqual([]);
  });
  it('caps select choices at 20 and font weights at 9', () => {
    const choices = Array.from({ length: 21 }, (_, i) => ({ value: `v${i}`, label: `V${i}` }));
    expect(validateManifest(manifest({ options: [{ key: 'm', type: 'select', label: 'M', default: 'v0', choices }] }), 'acme'))
      .toEqual(['acme: option "m": choices must list 1..20 entries']);
    const weights = [100, 200, 300, 400, 500, 600, 700, 800, 900, 900];
    expect(validateManifest(manifest({ presets: [{ ...manifest().presets[0]!, fonts: { heading: { family: 'Inter', weights }, body: null, mono: null } }] }), 'acme'))
      .toEqual(['acme: preset "gold".fonts.heading: font weights must be 1..9 values of 100..900 in steps of 100']);
  });
});

describe('validateManifest — tokens', () => {
  const tok = (over: Partial<TemplateTokens>) => manifest({ tokens: { ...BASE_TOKENS, ...over } });

  it('accepts the value shapes the built-in templates use', () => {
    // dark-luxury: numeric radii, zero tracking, borderless cards, body-font buttons, glow fill
    expect(validateManifest(tok({
      button: { radius: 10, fill: 'outline-glow', transform: 'none', tracking: { sm: '0', md: '0', lg: '0' }, weight: 600, font: 'body' },
      card: { radius: 16, border: 'none', shadow: 'inset 0 1px 0 rgba(255,248,230,0.08), 0 4px 24px rgba(0,0,0,0.45)', shadowHover: 'inset 0 1px 0 rgba(255,248,230,0.10), 0 12px 40px rgba(0,0,0,0.55)' },
      heading: { weight: 700, tracking: '-0.03em', transform: 'none' },
      badge: { radius: 'pill' },
    }), 'acme')).toEqual([]);
    // cyber-brutalism: zero radii everywhere, em tracking, heading-font buttons, glass off
    expect(validateManifest(tok({
      button: { radius: 0, fill: 'solid', transform: 'uppercase', tracking: { sm: '0.04em', md: '0.04em', lg: '0.04em' }, weight: 600, font: 'heading' },
      card: { radius: 0, border: '1px solid var(--sf-line)', shadow: 'none', shadowHover: 'none' },
      heading: { weight: 700, tracking: '-0.02em', transform: 'uppercase' },
      glass: 'off',
      badge: { radius: 0 },
    }), 'acme')).toEqual([]);
  });

  it.each<[string, Partial<TemplateTokens>, string]>([
    ['negative radius', { badge: { radius: -2 } }, 'badge.radius'],
    ['fractional radius', { card: { ...BASE_TOKENS.card, radius: 1.5 } }, 'card.radius'],
    ['unknown radius keyword', { button: { ...BASE_TOKENS.button, radius: 'round' as never } }, 'button.radius'],
    ['bad tracking', { button: { ...BASE_TOKENS.button, tracking: { sm: '2px', md: '0.2em', lg: '0.2em' } } }, 'tracking.sm'],
    ['bad fill', { button: { ...BASE_TOKENS.button, fill: 'neon' as never } }, 'button.fill'],
    ['bad font slot', { button: { ...BASE_TOKENS.button, font: 'serif' as never } }, 'button.font'],
    ['bad weight', { heading: { ...BASE_TOKENS.heading, weight: 650 } }, 'heading.weight'],
    ['css injection in border', { card: { ...BASE_TOKENS.card, border: '1px solid red; } body { display:none' } }, 'card.border'],
    ['bad glass', { glass: 'maybe' as never }, 'glass'],
    ['bad chassis', { chassis: 'shiny' as never }, 'chassis'],
  ])('rejects %s', (_name, over, fragment) => {
    expect(validateManifest(tok(over), 'acme').join('\n')).toContain(fragment);
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `npm run test:web -- templates-define`
Expected: FAIL — `Cannot find module '@/templates/define.ts'`.

- [ ] **Step 4: Implement `define.ts`**

Create `web/src/templates/define.ts` **exactly** as the Contract reference's `define.ts` block (it is the complete, compilable file: types, `BASE_TOKENS`, regexes including the exported `HEX_RE`, `defineTemplate`, `validateManifest` with the Plan 1 text caps). Do not add or re-declare anything.

- [ ] **Step 5: Create `slots.ts`**

Create `web/src/templates/slots.ts` exactly as the Contract reference's `slots.ts` block.

- [ ] **Step 6: Create `theme-schema.ts`**

```ts
import { z } from 'zod';
import { FONT_FAMILY_RE, HEX_RE, OPTION_KEY_RE, TEMPLATE_ID_RE } from '@/templates/define.ts';

// Every regex comes from define.ts — one definition shared with validateManifest.
const hex = z.string().regex(HEX_RE);
const fontName = z.string().regex(FONT_FAMILY_RE).nullable();

/** The stored theme's shape (mirrors the backend's storefrontThemeSchema). */
export const themeSchema = z.object({
  template: z.string().regex(TEMPLATE_ID_RE).optional(),
  preset: z.string().regex(TEMPLATE_ID_RE).nullable().optional(),
  options: z.record(z.string().regex(OPTION_KEY_RE), z.union([z.boolean(), z.string().max(100)]))
    .refine((o) => Object.keys(o).length <= 30).optional(),
  scheme: z.enum(['dark', 'light']),
  colors: z.object({ primary: hex, bg: hex, surface: hex, text: hex, muted: hex, success: hex, warn: hex, danger: hex }),
  fonts: z.object({ heading: fontName, body: fontName, mono: fontName }),
  radius: z.enum(['none', 'sm', 'md', 'lg', 'xl']),
  density: z.enum(['comfortable', 'compact']),
  customCss: z.string().max(20 * 1024).optional(),
});

/** Admin → storefront preview frame (Plan 4 sends exactly this). */
export const previewMessageSchema = z.object({ type: z.literal('sf-preview-theme'), theme: themeSchema });
export type PreviewMessage = z.infer<typeof previewMessageSchema>;
```

- [ ] **Step 7: Run tests and typecheck**

Run: `npm run test:web -- templates-define` → PASS. Run: `npm run typecheck` → no errors.

- [ ] **Step 8: Commit**

```bash
git add web/src/templates/define.ts web/src/templates/slots.ts web/src/templates/theme-schema.ts web/src/types/settings.ts web/test/templates-define.test.ts
git commit -m "feat(templates): manifest contract, slot types and validation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Modern template, registry, resolver, tokens

**Files:**
- Create: `web/src/templates/modern/manifest.ts`, `web/src/templates/modern/index.ts`, `web/src/templates/modern/template.css`
- Create: `web/src/templates/registry.ts`, `web/src/templates/resolve.ts`, `web/src/templates/tokens.ts`
- Test: `web/test/templates-registry.test.ts`, `web/test/templates-resolve.test.ts`, `web/test/templates-tokens.test.ts`

**Interfaces:**
- Consumes: Task 2 types.
- Produces:
  - `registry.ts`: `MANIFEST_MODULES`, `LOADERS` (both globs exclude `./defaults/**`), `DEFAULT_TEMPLATE_ID = 'modern'`, `interface TemplateEntry { manifest; builtIn: boolean; dir: string; load: () => Promise<TemplateModule> }`, `folderOf(path)`, `buildRegistry(mods, loaders, warn?)`, `REGISTRY`, `getTemplate(id, registry?)`, `lookupManifest(id)`, `allTemplates(registry?)`, `collectManifestErrors(mods)`.
  - `resolve.ts`: `interface ResolvedFonts { heading: FontSpec|null; body: FontSpec|null; mono: FontSpec|null }`, `interface ResolvedTheme { templateId; presetId; manifest; fallback: boolean; scheme; colors: Record<ColorKey,string>; fonts: ResolvedFonts; radius: RadiusName; density: Density; customCss: string; options: OptionValues; tokens: TemplateTokens }`, `DEFAULT_WEIGHTS = [400,500,600,700]`, `resolveOptions(manifest, stored)`, `resolveTheme(stored: Theme, lookup: (id: string|undefined|null) => TemplateManifest): ResolvedTheme`.
  - `tokens.ts`: `radiusCss(t)`, `tokenVariables(tokens): Record<string,string>`, `rootAttributes(resolved): Record<string,string>`.

- [ ] **Step 1: Create the modern template**

`web/src/templates/modern/manifest.ts`:

```ts
import { BASE_TOKENS, COLOR_KEYS, defineTemplate } from '@/templates/define.ts';

export default defineTemplate({
  contractVersion: 1,
  id: 'modern',
  name: 'Modern',
  version: '1.0.0',
  description: 'The original storefront: glass bars, tracked mono-caps buttons, underlined inputs. Every colour, font and shape is yours to change.',
  author: 'Kratos Bots',
  schemes: ['dark', 'light'],
  presets: [{
    id: 'default',
    name: 'Default',
    scheme: 'dark',
    colors: { primary: '#ffffff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' },
    fonts: { heading: null, body: null, mono: null },
    radius: 'none',
  }],
  defaultPreset: 'default',
  tokens: BASE_TOKENS,
  editable: { colors: [...COLOR_KEYS], fonts: true, radius: true, density: true },
  options: [],
});
```

`web/src/templates/modern/index.ts`:

```ts
import './template.css';
import type { TemplateSlots } from '@/templates/contract.ts';

/** Modern is the defaults — it overrides no slot. */
export const slots: TemplateSlots = {};
```

`web/src/templates/modern/template.css`:

```css
/* Modern is the base look: every rule it needs lives in the shared styles and
   the default slots. This file exists so modern loads through the same path as
   every other template. Scope any future rule under :root[data-sf-template="modern"]. */
```

Note: `contract.ts` does not exist until Task 6. Until then, make `modern/index.ts` import the type from `'@/templates/slots.ts'` and switch it to `'@/templates/contract.ts'` in Task 6 Step 9.

- [ ] **Step 2: Write failing registry tests**

`web/test/templates-registry.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { buildRegistry, collectManifestErrors, folderOf, getTemplate, LOADERS, lookupManifest, MANIFEST_MODULES, REGISTRY } from '@/templates/registry.ts';
import modern from '@/templates/modern/manifest.ts';

const load = () => Promise.resolve({ slots: {} });

describe('folderOf', () => {
  it('reads built-in and external paths', () => {
    expect(folderOf('./modern/manifest.ts')).toEqual({ id: 'modern', dir: 'modern', builtIn: true });
    expect(folderOf('./external/acme/index.ts')).toEqual({ id: 'acme', dir: 'external/acme', builtIn: false });
    expect(folderOf('./contract.ts')).toBeNull();
  });
  it('the discovery globs never pick up the defaults/ folder', () => {
    expect(Object.keys(MANIFEST_MODULES).some((p) => p.startsWith('./defaults/'))).toBe(false);
    expect(Object.keys(LOADERS).some((p) => p.startsWith('./defaults/'))).toBe(false);
  });
});

describe('buildRegistry', () => {
  it('registers valid manifests and skips invalid ones with a warning', () => {
    const warn = vi.fn();
    const reg = buildRegistry(
      { './modern/manifest.ts': modern, './broken/manifest.ts': { ...modern, id: 'broken', contractVersion: 9 } },
      { './modern/index.ts': load, './broken/index.ts': load },
      warn,
    );
    expect([...reg.keys()]).toEqual(['modern']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('skipping broken'));
  });
  it('skips a manifest without an index.ts', () => {
    const warn = vi.fn();
    const reg = buildRegistry(
      { './modern/manifest.ts': modern, './lonely/manifest.ts': { ...modern, id: 'lonely' } },
      { './modern/index.ts': load },
      warn,
    );
    expect(reg.has('lonely')).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no index.ts'));
  });
  it('throws when modern is missing', () => {
    expect(() => buildRegistry({}, {}, vi.fn())).toThrow(/modern/);
  });
});

describe('collectManifestErrors', () => {
  it('reports invalid manifests, duplicate ids and a missing modern', () => {
    expect(collectManifestErrors({ './modern/manifest.ts': modern })).toEqual([]);
    const errors = collectManifestErrors({ './a/manifest.ts': { ...modern, id: 'a' }, './external/a/manifest.ts': { ...modern, id: 'a' } });
    expect(errors.join('\n')).toMatch(/duplicate template id "a"/);
    expect(errors.join('\n')).toMatch(/"modern" template is missing/);
  });
});

describe('the real registry', () => {
  it('contains modern', () => {
    expect(REGISTRY.get('modern')?.builtIn).toBe(true);
  });
  it('falls back to modern for unknown and missing ids, warning once per id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(getTemplate('does-not-exist').manifest.id).toBe('modern');
    expect(getTemplate('does-not-exist').manifest.id).toBe('modern');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(lookupManifest(undefined).id).toBe('modern');
    expect(lookupManifest(null).id).toBe('modern');
    warn.mockRestore();
  });
});
```

- [ ] **Step 3: Implement `registry.ts`**

```ts
import { validateManifest, type TemplateManifest } from '@/templates/define.ts';
import type { TemplateModule } from '@/templates/slots.ts';

export const DEFAULT_TEMPLATE_ID = 'modern';

/** Eager: manifests are pure data and small; every template's is in the main bundle.
 *  `defaults/` holds modern's slot components (statically imported by runtime.tsx) — never a template. */
export const MANIFEST_MODULES = import.meta.glob<TemplateManifest>(['./*/manifest.ts', './external/*/manifest.ts', '!./defaults/**'], { eager: true, import: 'default' });
/** Lazy: one chunk (JS + CSS) per template, fetched only for the active one. */
export const LOADERS = import.meta.glob<TemplateModule>(['./*/index.ts', './external/*/index.ts', '!./defaults/**']);

export interface TemplateEntry {
  manifest: TemplateManifest;
  builtIn: boolean;
  /** Folder relative to web/src/templates — 'modern' or 'external/acme'. */
  dir: string;
  load: () => Promise<TemplateModule>;
}

export function folderOf(path: string): { id: string; dir: string; builtIn: boolean } | null {
  const m = /^\.\/(?:(external)\/)?([^/]+)\/(?:manifest|index)\.ts$/.exec(path);
  if (!m) return null;
  return m[1] ? { id: m[2]!, dir: `external/${m[2]}`, builtIn: false } : { id: m[2]!, dir: m[2]!, builtIn: true };
}

/** Build-time check (the catalog plugin fails the build on any of these). */
export function collectManifestErrors(mods: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const [path, manifest] of Object.entries(mods)) {
    const f = folderOf(path);
    if (!f) continue;
    errors.push(...validateManifest(manifest, f.id));
    const id = (manifest as { id?: unknown } | null)?.id;
    if (typeof id === 'string') {
      if (seen.has(id)) errors.push(`${f.dir}: duplicate template id "${id}"`);
      seen.add(id);
    }
  }
  if (!seen.has(DEFAULT_TEMPLATE_ID)) errors.push(`the built-in "${DEFAULT_TEMPLATE_ID}" template is missing`);
  return errors;
}

/** Runtime: an invalid template is skipped, never fatal — except modern, which must exist. */
export function buildRegistry(
  mods: Record<string, unknown>,
  loaders: Record<string, () => Promise<TemplateModule>>,
  warn: (message: string) => void = console.warn,
): Map<string, TemplateEntry> {
  const map = new Map<string, TemplateEntry>();
  for (const [path, manifest] of Object.entries(mods)) {
    const f = folderOf(path);
    if (!f) continue;
    const errors = validateManifest(manifest, f.id);
    if (errors.length > 0) { warn(`[templates] skipping ${f.dir}: ${errors.join('; ')}`); continue; }
    if (map.has(f.id)) { warn(`[templates] skipping ${f.dir}: duplicate id "${f.id}"`); continue; }
    const load = loaders[path.replace(/manifest\.ts$/, 'index.ts')];
    if (!load) { warn(`[templates] skipping ${f.dir}: no index.ts`); continue; }
    map.set(f.id, { manifest: manifest as TemplateManifest, builtIn: f.builtIn, dir: f.dir, load });
  }
  if (!map.has(DEFAULT_TEMPLATE_ID)) throw new Error(`[templates] the built-in "${DEFAULT_TEMPLATE_ID}" template is missing or invalid`);
  return map;
}

export const REGISTRY = buildRegistry(MANIFEST_MODULES, LOADERS);

const warned = new Set<string>();

export function getTemplate(id: string | null | undefined, registry: Map<string, TemplateEntry> = REGISTRY): TemplateEntry {
  const key = id || DEFAULT_TEMPLATE_ID;
  const hit = registry.get(key);
  if (hit) return hit;
  if (!warned.has(key)) {
    warned.add(key);
    console.warn(`[templates] unknown template "${key}" — showing ${DEFAULT_TEMPLATE_ID}`);
  }
  return registry.get(DEFAULT_TEMPLATE_ID)!;
}

export function lookupManifest(id: string | null | undefined): TemplateManifest {
  return getTemplate(id).manifest;
}

export function allTemplates(registry: Map<string, TemplateEntry> = REGISTRY): TemplateEntry[] {
  return [...registry.values()];
}
```

- [ ] **Step 4: Write failing resolver tests**

`web/test/templates-resolve.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BASE_TOKENS, defineTemplate, type TemplateManifest } from '@/templates/define.ts';
import { resolveTheme } from '@/templates/resolve.ts';
import modern from '@/templates/modern/manifest.ts';
import type { Theme } from '@/types/settings.ts';

const locked: TemplateManifest = defineTemplate({
  ...modern,
  id: 'locked',
  schemes: ['dark'],
  presets: [
    { id: 'gold', name: 'Gold', scheme: 'dark', colors: { primary: '#d4a03c', bg: '#0a0907', surface: '#161412', text: '#f0ebe0', muted: '#8a8070', success: '#3d9e5c', warn: '#e0a33e', danger: '#b83c38' }, fonts: { heading: { family: 'Inter', weights: [700, 800] }, body: { family: 'Inter', weights: [400, 600] }, mono: { family: 'JetBrains Mono', weights: [400, 500] } }, radius: 'lg' },
    { id: 'silver', name: 'Silver', scheme: 'dark', colors: { primary: '#b4c0d4', bg: '#080809', surface: '#141416', text: '#eef0f4', muted: '#7d8494', success: '#3d9e5c', warn: '#e0a33e', danger: '#b83c38' }, fonts: { heading: null, body: null, mono: null }, radius: 'lg' },
  ],
  defaultPreset: 'gold',
  tokens: { ...BASE_TOKENS, chassis: 'flat' },
  editable: { colors: ['primary', 'bg'], fonts: false, radius: false, density: false },
  options: [
    { key: 'grain', type: 'boolean', label: 'Grain', default: true },
    { key: 'node', type: 'text', label: 'Node', default: 'NODE_01', maxLength: 8 },
    { key: 'mode', type: 'select', label: 'Mode', default: 'a', choices: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
  ],
});
const lookup = (id: string | null | undefined) => (id === 'locked' ? locked : modern);

const stored: Theme = {
  scheme: 'light',
  colors: { primary: '#111111', bg: '#fafafa', surface: '#eeeeee', text: '#000000', muted: '#555555', success: '#00aa00', warn: '#aaaa00', danger: '#aa0000' },
  fonts: { heading: 'Space Grotesk', body: 'Inter', mono: null },
  radius: 'sm', density: 'compact', customCss: 'a{}',
};

describe('resolveTheme', () => {
  it('old-shape theme (no template fields) resolves to modern with stored values untouched', () => {
    const r = resolveTheme(stored, lookup);
    expect(r.templateId).toBe('modern');
    expect(r.presetId).toBe('default');
    expect(r.fallback).toBe(false);
    expect(r.colors).toEqual(stored.colors);
    expect(r.scheme).toBe('light');
    expect(r.radius).toBe('sm');
    expect(r.density).toBe('compact');
    expect(r.customCss).toBe('a{}');
    expect(r.fonts.heading).toEqual({ family: 'Space Grotesk', weights: [400, 500, 600, 700] });
    expect(r.fonts.mono).toBeNull();
    expect(r.tokens).toBe(BASE_TOKENS);
    expect(r.options).toEqual({});
  });
  it('enforces locks from the chosen preset', () => {
    const r = resolveTheme({ ...stored, template: 'locked', preset: 'silver' }, lookup);
    expect(r.presetId).toBe('silver');
    expect(r.colors.primary).toBe('#111111');          // editable
    expect(r.colors.bg).toBe('#fafafa');               // editable
    expect(r.colors.surface).toBe('#141416');          // locked → preset
    expect(r.fonts).toEqual({ heading: null, body: null, mono: null }); // fonts locked
    expect(r.radius).toBe('lg');                       // radius locked
    expect(r.density).toBe('comfortable');             // density locked
    expect(r.scheme).toBe('dark');                     // light not in schemes
  });
  it('a foreign or missing preset id falls back to the default preset', () => {
    expect(resolveTheme({ ...stored, template: 'locked', preset: 'default' }, lookup).presetId).toBe('gold');
    expect(resolveTheme({ ...stored, template: 'locked', preset: null }, lookup).presetId).toBe('gold');
  });
  it('unknown template id resolves to modern and flags the fallback', () => {
    const r = resolveTheme({ ...stored, template: 'gone', preset: 'gold' }, lookup);
    expect(r.templateId).toBe('modern');
    expect(r.presetId).toBe('default');
    expect(r.fallback).toBe(true);
    expect(r.colors).toEqual(stored.colors);
  });
  it('keeps a preset font weight list when the stored name matches the preset', () => {
    const editableFonts = defineTemplate({ ...locked, id: 'locked', editable: { ...locked.editable, fonts: true } });
    const r = resolveTheme({ ...stored, template: 'locked', preset: 'gold', fonts: { heading: 'Inter', body: 'Inter', mono: 'JetBrains Mono' } }, () => editableFonts);
    expect(r.fonts.heading).toEqual({ family: 'Inter', weights: [700, 800] });
    expect(r.fonts.mono).toEqual({ family: 'JetBrains Mono', weights: [400, 500] });
  });
  it('resolves options: defaults, stored values, wrong types and unknown keys', () => {
    const r = resolveTheme({ ...stored, template: 'locked', options: { grain: 'yes', node: 'X'.repeat(20), mode: 'b', extra: true } }, lookup);
    expect(r.options).toEqual({ grain: true, node: 'NODE_01', mode: 'b' });
    const r2 = resolveTheme({ ...stored, template: 'locked', options: { grain: false, node: 'N2', mode: 'zzz' } }, lookup);
    expect(r2.options).toEqual({ grain: false, node: 'N2', mode: 'a' });
  });
  it('treats a missing customCss as empty', () => {
    const { customCss: _drop, ...rest } = stored;
    expect(resolveTheme(rest as Theme, lookup).customCss).toBe('');
  });
});
```

- [ ] **Step 5: Implement `resolve.ts`**

```ts
import { COLOR_KEYS, type ColorKey, type Density, type FontSpec, type OptionValues, type RadiusName, type Scheme, type TemplateManifest, type TemplateTokens } from '@/templates/define.ts';
import type { Theme } from '@/types/settings.ts';

export const DEFAULT_WEIGHTS = [400, 500, 600, 700];

export interface ResolvedFonts { heading: FontSpec | null; body: FontSpec | null; mono: FontSpec | null }

export interface ResolvedTheme {
  templateId: string;
  presetId: string;
  manifest: TemplateManifest;
  /** True when the stored template id is not in this release and modern stands in. */
  fallback: boolean;
  scheme: Scheme;
  colors: Record<ColorKey, string>;
  fonts: ResolvedFonts;
  radius: RadiusName;
  density: Density;
  customCss: string;
  options: OptionValues;
  tokens: TemplateTokens;
}

export function resolveOptions(manifest: TemplateManifest, stored: Theme['options']): OptionValues {
  const out: OptionValues = {};
  for (const o of manifest.options) {
    const v = stored?.[o.key];
    if (o.type === 'boolean') out[o.key] = typeof v === 'boolean' ? v : o.default;
    else if (o.type === 'select') out[o.key] = typeof v === 'string' && o.choices.some((c) => c.value === v) ? v : o.default;
    else out[o.key] = typeof v === 'string' && v.length <= o.maxLength ? v : o.default;
  }
  return out;
}

function fontFor(name: string | null, presetFont: FontSpec | null): FontSpec | null {
  if (!name) return null;
  return { family: name, weights: presetFont && presetFont.family === name ? presetFont.weights : DEFAULT_WEIGHTS };
}

export function resolveTheme(stored: Theme, lookup: (id: string | null | undefined) => TemplateManifest): ResolvedTheme {
  const manifest = lookup(stored.template);
  const fallback = !!stored.template && manifest.id !== stored.template;
  const preset = manifest.presets.find((p) => p.id === stored.preset) ?? manifest.presets.find((p) => p.id === manifest.defaultPreset)!;
  const e = manifest.editable;

  const colors = { ...stored.colors } as Record<ColorKey, string>;
  for (const k of COLOR_KEYS) if (!e.colors.includes(k)) colors[k] = preset.colors[k];

  const fonts: ResolvedFonts = e.fonts
    ? {
        heading: fontFor(stored.fonts.heading, preset.fonts.heading),
        body: fontFor(stored.fonts.body, preset.fonts.body),
        mono: fontFor(stored.fonts.mono, preset.fonts.mono),
      }
    : preset.fonts;

  return {
    templateId: manifest.id,
    presetId: preset.id,
    manifest,
    fallback,
    scheme: manifest.schemes.includes(stored.scheme) ? stored.scheme : preset.scheme,
    colors,
    fonts,
    radius: e.radius ? stored.radius : preset.radius,
    density: e.density ? stored.density : 'comfortable',
    customCss: stored.customCss ?? '',
    options: resolveOptions(manifest, stored.options),
    tokens: manifest.tokens,
  };
}
```

- [ ] **Step 6: Write failing token tests**

`web/test/templates-tokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BASE_TOKENS } from '@/templates/define.ts';
import { radiusCss, rootAttributes, tokenVariables } from '@/templates/tokens.ts';
import { resolveTheme } from '@/templates/resolve.ts';
import { lookupManifest } from '@/templates/registry.ts';
import type { Theme } from '@/types/settings.ts';

describe('tokens', () => {
  it('maps radius tokens', () => {
    expect(radiusCss('theme')).toBe('var(--mantine-radius-default)');
    expect(radiusCss('pill')).toBe('999px');
    expect(radiusCss(10)).toBe('10px');
    expect(radiusCss(0)).toBe('0px');
  });
  it('emits numeric radii as px and passes none / zero tracking / body font through', () => {
    const v = tokenVariables({
      ...BASE_TOKENS,
      button: { radius: 10, fill: 'outline-glow', transform: 'none', tracking: { sm: '0', md: '0', lg: '0' }, weight: 600, font: 'body' },
      card: { radius: 16, border: 'none', shadow: 'none', shadowHover: 'none' },
      badge: { radius: 0 },
    });
    expect(v).toMatchObject({
      '--sf-btn-radius': '10px', '--sf-btn-font': 'var(--sf-font-body)', '--sf-btn-tracking-md': '0', '--sf-btn-transform': 'none',
      '--sf-card-radius': '16px', '--sf-card-border': 'none', '--sf-pill-radius': '0px',
    });
    expect(tokenVariables({ ...BASE_TOKENS, button: { ...BASE_TOKENS.button, font: 'heading' } })['--sf-btn-font']).toBe('var(--sf-font-heading)');
  });
  it('base tokens reproduce the modern declarations', () => {
    expect(tokenVariables(BASE_TOKENS)).toEqual({
      '--sf-btn-radius': 'var(--mantine-radius-default)',
      '--sf-btn-transform': 'uppercase',
      '--sf-btn-weight': '600',
      '--sf-btn-font': 'var(--sf-font-mono)',
      '--sf-btn-tracking-sm': '0.18em',
      '--sf-btn-tracking-md': '0.2em',
      '--sf-btn-tracking-lg': '0.22em',
      '--sf-card-radius': 'var(--mantine-radius-default)',
      '--sf-card-border': '1px solid var(--sf-line)',
      '--sf-card-shadow': 'none',
      '--sf-card-shadow-hover': 'none',
      '--sf-pill-radius': '999px',
      '--sf-heading-weight': '600',
      '--sf-heading-tracking': 'normal',
      '--sf-heading-transform': 'none',
    });
  });
  it('emits the root attributes', () => {
    const theme = { scheme: 'dark', colors: { primary: '#ffffff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' }, fonts: { heading: null, body: null, mono: null }, radius: 'none', density: 'comfortable', customCss: '' } satisfies Theme;
    expect(rootAttributes(resolveTheme(theme, lookupManifest))).toEqual({
      'data-sf-template': 'modern',
      'data-sf-preset': 'default',
      'data-sf-btn-fill': 'solid',
      'data-sf-input': 'underline',
      'data-sf-chassis': 'glow',
      'data-sf-label': 'plain',
      'data-sf-glass': 'on',
      'data-mantine-color-scheme': 'dark',
    });
  });
});
```

- [ ] **Step 7: Implement `tokens.ts`**

```ts
import type { RadiusToken, TemplateTokens } from '@/templates/define.ts';
import type { ResolvedTheme } from '@/templates/resolve.ts';

export function radiusCss(t: RadiusToken): string {
  if (t === 'theme') return 'var(--mantine-radius-default)';
  if (t === 'pill') return '999px';
  return `${t}px`;
}

/** The token half of the --sf-* variables (the palette half stays in theme-bridge). */
export function tokenVariables(tokens: TemplateTokens): Record<string, string> {
  const b = tokens.button;
  return {
    '--sf-btn-radius': radiusCss(b.radius),
    '--sf-btn-transform': b.transform,
    '--sf-btn-weight': String(b.weight),
    '--sf-btn-font': `var(--sf-font-${b.font})`,
    '--sf-btn-tracking-sm': b.tracking.sm,
    '--sf-btn-tracking-md': b.tracking.md,
    '--sf-btn-tracking-lg': b.tracking.lg,
    '--sf-card-radius': radiusCss(tokens.card.radius),
    '--sf-card-border': tokens.card.border,
    '--sf-card-shadow': tokens.card.shadow,
    '--sf-card-shadow-hover': tokens.card.shadowHover,
    '--sf-pill-radius': radiusCss(tokens.badge.radius),
    '--sf-heading-weight': String(tokens.heading.weight),
    '--sf-heading-tracking': tokens.heading.tracking,
    '--sf-heading-transform': tokens.heading.transform,
  };
}

export function rootAttributes(theme: ResolvedTheme): Record<string, string> {
  return {
    'data-sf-template': theme.templateId,
    'data-sf-preset': theme.presetId,
    'data-sf-btn-fill': theme.tokens.button.fill,
    'data-sf-input': theme.tokens.input.style,
    'data-sf-chassis': theme.tokens.chassis,
    'data-sf-label': theme.tokens.label.style,
    'data-sf-glass': theme.tokens.glass,
    'data-mantine-color-scheme': theme.scheme,
  };
}
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npm run test:web -- templates-` → all PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 9: Commit**

```bash
git add web/src/templates/modern/manifest.ts web/src/templates/modern/index.ts web/src/templates/modern/template.css web/src/templates/registry.ts web/src/templates/resolve.ts web/src/templates/tokens.ts web/test/templates-registry.test.ts web/test/templates-resolve.test.ts web/test/templates-tokens.test.ts
git commit -m "feat(templates): modern template, registry, resolver and token variables

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Theme bridge on the resolved theme (fonts, Mantine, variables)

**Files:**
- Modify: `web/src/app/theme-bridge.ts`
- Modify: `web/src/app/App.tsx` (`ThemedApp` only — resolve before bridging)
- Test: `web/test/theme-bridge.test.ts` (rewrite)

**Interfaces:**
- Consumes: `ResolvedTheme`, `ResolvedFonts`, `resolveTheme`, `lookupManifest`, `tokenVariables`, `rootAttributes`, `ButtonFill`.
- Produces (new signatures): `fontStacks(fonts: ResolvedFonts)`, `googleFontsHref(fonts: ResolvedFonts): string | null`, `cssVariablesFor(theme: ResolvedTheme, brand: Pick<Brand,'logoHeight'>)`, `buildMantineTheme(theme: ResolvedTheme)`. `applyDocumentTheme` changes in Task 5.

- [ ] **Step 1: Rewrite the bridge tests (failing)**

Replace `web/test/theme-bridge.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { buildMantineTheme, cssVariablesFor, fontStacks, googleFontsHref, INTER } from '@/app/theme-bridge.ts';
import { BASE_TOKENS, defineTemplate } from '@/templates/define.ts';
import { resolveTheme, type ResolvedTheme } from '@/templates/resolve.ts';
import { lookupManifest } from '@/templates/registry.ts';
import modern from '@/templates/modern/manifest.ts';
import type { Brand, Theme } from '@/types/settings.ts';

const theme: Theme = {
  scheme: 'dark',
  colors: { primary: '#3355ff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' },
  fonts: { heading: 'Space Grotesk', body: 'Inter', mono: null },
  radius: 'lg', density: 'compact', customCss: '',
};
const brand = { logoHeight: 32 } as Brand;
const resolve = (t: Theme): ResolvedTheme => resolveTheme(t, lookupManifest);
const none = { heading: null, body: null, mono: null };

describe('theme bridge', () => {
  it('builds a 10-shade brand ramp and maps radius/fonts', () => {
    const t = buildMantineTheme(resolve(theme));
    expect(t.primaryColor).toBe('brand');
    expect((t.colors as unknown as Record<string, string[]>).brand).toHaveLength(10);
    expect(t.defaultRadius).toBe('lg');
    expect(t.fontFamily).toContain('Inter');
    expect(t.headings?.fontFamily).toContain('Space Grotesk');
  });
  it('derives surface-2/3, line, faint from bg/surface/muted and adds the token variables', () => {
    const v = cssVariablesFor(resolve(theme), brand);
    expect(v['--sf-bg']).toBe('#0f3965');
    expect(v['--sf-primary']).toBe('#3355ff');
    expect(v['--sf-logo-h']).toBe('32px');
    expect(v['--sf-surface-2']).toMatch(/^#[0-9a-f]{6}$/);
    expect(v['--sf-surface-2']).not.toBe(v['--sf-surface']);
    expect(v['--sf-btn-font']).toBe('var(--sf-font-mono)');
    expect(v['--sf-pill-radius']).toBe('999px');
  });
  it('builds one Google Fonts href for the distinct families with their weights', () => {
    expect(googleFontsHref(resolve(theme).fonts)).toBe('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
    expect(googleFontsHref(none)).toBeNull();
  });
  it('omits the weight axis for single-weight 400 families and merges weights per family', () => {
    expect(googleFontsHref({ heading: { family: 'Tektur', weights: [900, 700] }, body: { family: 'Tektur', weights: [400] }, mono: { family: 'Share Tech Mono', weights: [400] } }))
      .toBe('https://fonts.googleapis.com/css2?family=Tektur:wght@400;700;900&family=Share+Tech+Mono&display=swap');
  });
  it('maps radius none to 0 and passes the named sizes through', () => {
    expect(buildMantineTheme(resolve({ ...theme, radius: 'none' })).defaultRadius).toBe(0);
    expect(buildMantineTheme(resolve({ ...theme, radius: 'md' })).defaultRadius).toBe('md');
  });
  it('slows Mantine sheets and modals to the shop timings and tags parts', () => {
    const c = buildMantineTheme(resolve(theme)).components as Record<string, { defaultProps?: Record<string, unknown> }>;
    expect(buildMantineTheme(resolve(theme)).respectReducedMotion).toBe(true);
    expect(c.Drawer?.defaultProps?.transitionProps).toEqual({ duration: 300, timingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    expect(c.Drawer?.defaultProps?.overlayProps).toEqual({ backgroundOpacity: 0.7, blur: 2 });
    expect(c.Modal?.defaultProps?.transitionProps).toEqual({ transition: 'pop', duration: 200, timingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    expect(c.Button?.defaultProps?.['data-sf-part']).toBe('button');
    expect(c.Input?.defaultProps?.['data-sf-part']).toBe('input');
    expect(c.ActionIcon).toBeDefined();
  });

  type ButtonVars = { vars: (theme: unknown, props: { variant?: string; size?: string }, ctx: unknown) => { root: Record<string, string | undefined> } };
  const buttonOf = (r: ResolvedTheme) => (buildMantineTheme(r).components as unknown as { Button: ButtonVars }).Button;

  it('feeds solid-fill Button variant/size colours through the vars resolver (modern)', () => {
    const button = buttonOf(resolve(theme));
    const filled = button.vars({}, { variant: 'filled', size: 'md' }, {});
    expect(filled.root).toMatchObject({ '--button-radius': 'var(--sf-btn-radius)', '--button-bg': 'var(--sf-primary)', '--button-color': 'var(--sf-bg)', '--button-hover': 'var(--sf-primary-soft)', '--button-hover-color': 'var(--sf-bg)', '--button-fz': '12px' });
    const def = button.vars({}, { variant: 'default', size: 'md' }, {});
    expect(def.root).toMatchObject({ '--button-bg': 'transparent', '--button-bd': '1px solid var(--sf-line-strong)', '--button-color': 'var(--sf-text)' });
    expect(button.vars({}, { variant: 'filled', size: 'sm' }, {}).root['--button-fz']).toBe('11px');
  });
  it('switches the filled variant for outline-glow and ghost fills', () => {
    const withFill = (fill: 'outline-glow' | 'ghost') => resolveTheme({ ...theme, template: 'x' }, () => defineTemplate({ ...modern, id: 'x', tokens: { ...BASE_TOKENS, button: { ...BASE_TOKENS.button, fill } } }));
    expect(buttonOf(withFill('outline-glow')).vars({}, { variant: 'filled' }, {}).root).toMatchObject({ '--button-bg': 'var(--sf-bg)', '--button-color': 'var(--sf-primary)', '--button-bd': '1px solid var(--sf-primary)' });
    expect(buttonOf(withFill('ghost')).vars({}, { variant: 'filled' }, {}).root).toMatchObject({ '--button-bg': 'transparent', '--button-color': 'var(--sf-primary)' });
  });
});

describe('font defaults', () => {
  it('falls back to the self-hosted Inter stack for body and heading', () => {
    const s = fontStacks(none);
    expect(s.body).toBe(INTER);
    expect(s.heading).toBe(INTER);
    expect(INTER.startsWith('"Inter Variable", Inter,')).toBe(true);
  });
  it('uses the body face as the mono voice unless a mono font is configured', () => {
    expect(fontStacks(none).mono).toBe(INTER);
    expect(fontStacks({ heading: null, body: { family: 'Space Grotesk', weights: [400] }, mono: null }).mono).toBe(`"Space Grotesk", ${INTER}`);
    expect(fontStacks({ heading: null, body: null, mono: { family: 'JetBrains Mono', weights: [400] } }).mono).toBe('"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace');
  });
  it('feeds the same stacks to Mantine and the --sf-font-* variables', () => {
    const r = resolve({ ...theme, fonts: { heading: null, body: null, mono: null } });
    const t = buildMantineTheme(r);
    const v = cssVariablesFor(r, brand);
    expect(t.fontFamily).toBe(INTER);
    expect(t.fontFamilyMonospace).toBe(INTER);
    expect(t.headings?.fontFamily).toBe(INTER);
    expect(v['--sf-font-body']).toBe(INTER);
    expect(v['--sf-font-heading']).toBe(INTER);
    expect(v['--sf-font-mono']).toBe(INTER);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm run test:web -- theme-bridge` → FAIL (signature mismatch / missing token vars).

- [ ] **Step 3: Update `theme-bridge.ts`**

Change the top of the file and the functions below; leave `mix`, `INTER`, `SYSTEM_MONO`, `upsert` and `applyDocumentTheme` (Task 5 rewrites it) otherwise as they are:

```ts
import { ActionIcon, Button, Drawer, Input, Modal, createTheme, type MantineThemeOverride } from '@mantine/core';
import { generateColors } from '@mantine/colors-generator';
import type { Brand, Theme } from '@/types/settings.ts';
import type { ButtonFill } from '@/templates/define.ts';
import type { ResolvedFonts, ResolvedTheme } from '@/templates/resolve.ts';
import { tokenVariables } from '@/templates/tokens.ts';
import { mediaUrl } from '@/lib/media-url.ts';

function family(name: string | null | undefined, fallback: string): string { return name ? `"${name}", ${fallback}` : fallback; }

function buttonVariantVars(variant: string | undefined, fill: ButtonFill): Record<string, string> {
  switch (variant ?? 'filled') {
    case 'filled':
      if (fill === 'outline-glow') {
        return { '--button-bg': 'var(--sf-bg)', '--button-color': 'var(--sf-primary)', '--button-bd': '1px solid var(--sf-primary)', '--button-hover': 'var(--sf-surface)', '--button-hover-color': 'var(--sf-primary)' };
      }
      if (fill === 'ghost') {
        return { '--button-bg': 'transparent', '--button-color': 'var(--sf-primary)', '--button-bd': '1px solid var(--sf-line-strong)', '--button-hover': 'var(--sf-surface)', '--button-hover-color': 'var(--sf-primary)' };
      }
      return { '--button-bg': 'var(--sf-primary)', '--button-color': 'var(--sf-bg)', '--button-hover': 'var(--sf-primary-soft)', '--button-hover-color': 'var(--sf-bg)' };
    case 'default':
      return { '--button-bg': 'transparent', '--button-bd': '1px solid var(--sf-line-strong)', '--button-color': 'var(--sf-text)', '--button-hover': 'var(--sf-surface)' };
    case 'subtle':
      return { '--button-bg': 'transparent', '--button-color': 'var(--sf-muted)', '--button-hover': 'var(--sf-surface)', '--button-hover-color': 'var(--sf-text)' };
    default:
      return {};
  }
}

export function fontStacks(fonts: ResolvedFonts): { body: string; heading: string; mono: string } {
  const body = family(fonts.body?.family, INTER);
  return {
    body,
    heading: family((fonts.heading ?? fonts.body)?.family, INTER),
    mono: fonts.mono ? family(fonts.mono.family, SYSTEM_MONO) : body,
  };
}

export function buildMantineTheme(theme: ResolvedTheme): MantineThemeOverride {
  const compact = theme.density === 'compact';
  const stacks = fontStacks(theme.fonts);
  const fill = theme.tokens.button.fill;
  return createTheme({
    primaryColor: 'brand',
    primaryShade: { light: 6, dark: 5 },
    colors: { brand: generateColors(theme.colors.primary) },
    fontFamily: stacks.body,
    fontFamilyMonospace: stacks.mono,
    headings: { fontFamily: stacks.heading, fontWeight: '600' },
    defaultRadius: theme.radius === 'none' ? 0 : theme.radius,
    respectReducedMotion: true,
    ...(compact
      ? {
          spacing: { xs: '0.5rem', sm: '0.625rem', md: '0.875rem', lg: '1.125rem', xl: '1.5rem' },
          fontSizes: { xs: '0.7rem', sm: '0.8rem', md: '0.9rem', lg: '1rem', xl: '1.15rem' },
        }
      : {}),
    other: { density: theme.density },
    components: {
      Drawer: Drawer.extend({ defaultProps: { transitionProps: { duration: 300, timingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }, overlayProps: { backgroundOpacity: 0.7, blur: 2 } } }),
      Modal: Modal.extend({ defaultProps: { transitionProps: { transition: 'pop', duration: 200, timingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }, overlayProps: { backgroundOpacity: 0.7, blur: 2 } } }),
      Button: Button.extend({
        defaultProps: { 'data-sf-part': 'button' },
        classNames: { root: 'sf-button' },
        vars: (_theme, props) => ({
          root: { '--button-radius': 'var(--sf-btn-radius)', ...buttonVariantVars(props.variant, fill), ...buttonSizeVars(props.size) },
        }),
      }),
      ActionIcon: ActionIcon.extend({ classNames: { root: 'sf-icon-button' } }),
      Input: Input.extend({ defaultProps: { 'data-sf-part': 'input' }, classNames: { input: 'sf-input' } }),
    },
  });
}

export function cssVariablesFor(theme: ResolvedTheme, brand: Pick<Brand, 'logoHeight'>): Record<string, string> {
  const dark = theme.scheme === 'dark';
  const c = theme.colors;
  const towardText = dark ? '#ffffff' : '#000000';
  const stacks = fontStacks(theme.fonts);
  return {
    '--sf-bg': c.bg,
    '--sf-bg-deep': mix(c.bg, dark ? '#000000' : '#ffffff', 0.18),
    '--sf-surface': c.surface,
    '--sf-surface-2': mix(c.surface, towardText, 0.07),
    '--sf-surface-3': mix(c.surface, towardText, 0.14),
    '--sf-line': mix(c.surface, towardText, 0.12),
    '--sf-line-strong': mix(c.surface, towardText, 0.24),
    '--sf-text': c.text,
    '--sf-muted': c.muted,
    '--sf-faint': mix(c.muted, c.bg, 0.35),
    '--sf-primary': c.primary,
    '--sf-primary-soft': mix(c.primary, c.bg, 0.75),
    '--sf-success': c.success,
    '--sf-warn': c.warn,
    '--sf-danger': c.danger,
    '--sf-logo-h': `${brand.logoHeight}px`,
    '--sf-font-heading': stacks.heading,
    '--sf-font-body': stacks.body,
    '--sf-font-mono': stacks.mono,
    ...tokenVariables(theme.tokens),
  };
}

/** One stylesheet for every distinct family; weights merged per family. A family whose only
 *  weight is 400 gets no wght axis — single-weight families (Share Tech Mono) 400 otherwise. */
export function googleFontsHref(fonts: ResolvedFonts): string | null {
  const byFamily = new Map<string, Set<number>>();
  for (const f of [fonts.heading, fonts.body, fonts.mono]) {
    if (!f) continue;
    const name = f.family.trim();
    const set = byFamily.get(name) ?? new Set<number>();
    for (const w of f.weights) set.add(w);
    byFamily.set(name, set);
  }
  if (byFamily.size === 0) return null;
  const q = [...byFamily].map(([name, set]) => {
    const weights = [...set].sort((a, b) => a - b);
    const fam = `family=${name.replace(/\s+/g, '+')}`;
    return weights.length === 1 && weights[0] === 400 ? fam : `${fam}:wght@${weights.join(';')}`;
  }).join('&');
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}
```

In `applyDocumentTheme` (temporary until Task 5): change its first parameter type to `ResolvedTheme` and replace `theme.colors.bg` usages unchanged (the field names match). Keep `Theme` imported only if still referenced; remove it otherwise.

- [ ] **Step 4: Resolve in `ThemedApp`**

In `web/src/app/App.tsx` add imports `import { resolveTheme } from '@/templates/resolve.ts';` and `import { lookupManifest } from '@/templates/registry.ts';`, then change `ThemedApp`'s body to:

```tsx
  const { theme, brand } = settings;
  const themeKey = JSON.stringify({ theme, brand });
  const resolved = useMemo(() => resolveTheme(theme, lookupManifest), [themeKey]);
  useEffect(() => {
    applyDocumentTheme(resolved, brand);
  }, [themeKey]);
  const mantineTheme = useMemo(() => buildMantineTheme(resolved), [resolved]);

  return (
    <MantineProvider theme={mantineTheme} forceColorScheme={resolved.scheme}>
```

(rest of the JSX unchanged).

- [ ] **Step 5: Update the old bootstrap test to the new signature (required)**

`cssVariablesFor` now takes a `ResolvedTheme`, so the existing `web/test/theme-bootstrap.test.ts` no longer typechecks, and at runtime `tokenVariables(undefined)` throws. Task 5 rewrites this file; until then, make these exact changes:

1. Add the imports:

```ts
import { resolveTheme } from '@/templates/resolve.ts';
import { lookupManifest } from '@/templates/registry.ts';
```

2. In the test `'sets the same --sf-* variables cssVariablesFor() computes, from seeded localStorage'`, replace `const expected = cssVariablesFor(theme, brand);` with:

```ts
    const expected = cssVariablesFor(resolveTheme(theme, lookupManifest), brand);
```

and keep the existing four palette assertions (`--sf-surface-2`, `--sf-line`, `--sf-faint`, `--sf-primary-soft`) and the scheme assertion unchanged. The v1 bootstrap sets no token variables, so only palette keys are compared.

- [ ] **Step 6: Verify**

Run: `npm run test:web` → all PASS. Run: `npm run typecheck` → clean. Run: `npm run test:e2e -- templates-baseline.spec.ts` → 4 passed.

- [ ] **Step 7: Commit**

```bash
git add web/src/app/theme-bridge.ts web/src/app/App.tsx web/test/theme-bridge.test.ts web/test/theme-bootstrap.test.ts
git commit -m "feat(templates): bridge the resolved theme to Mantine, fonts and --sf-* tokens

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: First paint — v2 payload, bootstrap, persistence switch

**Files:**
- Modify: `web/src/app/theme-bridge.ts` (`applyDocumentTheme`, storage helpers)
- Modify: `web/src/app/theme-bootstrap.ts`
- Modify: `web/index.html`
- Modify: `web/src/app/App.tsx` (`lastKnownBrandName` → bridge helper)
- Modify: `e2e/storefront.spec.ts` (test 7 reads v2)
- Test: `web/test/theme-bootstrap.test.ts` (rewrite)

**Interfaces:**
- Produces: `THEME_STORAGE_KEY = 'sf-theme-v2'`, `LEGACY_THEME_STORAGE_KEY = 'sf-theme-v1'`, `interface StoredThemePayload { v: 2; templateId: string; vars: Record<string,string>; attrs: Record<string,string>; title: string; brandName: string; fontsHref: string | null }`, `applyDocumentTheme(theme: ResolvedTheme, brand: Brand, opts?: { persist?: boolean }): void`, `readStoredTheme(): StoredThemePayload | null`, `readStoredTemplateId(): string | null`, `lastKnownBrandName(): string | null`, `THEME_BOOTSTRAP`.

- [ ] **Step 1: Rewrite the bootstrap tests (failing)**

`web/test/theme-bootstrap.test.ts`:

```ts
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { THEME_BOOTSTRAP } from '@/app/theme-bootstrap.ts';
import { applyDocumentTheme, lastKnownBrandName, LEGACY_THEME_STORAGE_KEY, mix, readStoredTemplateId, THEME_STORAGE_KEY } from '@/app/theme-bridge.ts';
import { resolveTheme } from '@/templates/resolve.ts';
import { lookupManifest } from '@/templates/registry.ts';
import type { Brand, Theme } from '@/types/settings.ts';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const theme: Theme = {
  scheme: 'dark',
  colors: { primary: '#3355ff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' },
  fonts: { heading: 'Space Grotesk', body: 'Inter', mono: null },
  radius: 'lg', density: 'compact', customCss: '',
};
const brand: Brand = { name: 'Acme', shortName: 'Acme', tagline: 'tag', title: 'Acme Shop', description: 'desc', logoUrl: null, faviconUrl: null, logoHeight: 32, links: { whatsapp: null, telegram: null } };
const run = () => new Function(THEME_BOOTSTRAP)();
const root = () => document.documentElement;
function reset() {
  root().removeAttribute('style');
  for (const a of [...root().attributes]) if (a.name.startsWith('data-')) root().removeAttribute(a.name);
  document.head.querySelectorAll('#sf-fonts').forEach((n) => n.remove());
}

describe('theme bootstrap (inlined first-paint script)', () => {
  afterEach(() => { localStorage.clear(); reset(); });

  it('replays exactly what applyDocumentTheme painted', () => {
    applyDocumentTheme(resolveTheme(theme, lookupManifest), brand);
    const painted = { style: root().getAttribute('style'), template: root().getAttribute('data-sf-template'), scheme: root().getAttribute('data-mantine-color-scheme') };
    reset();
    run();
    expect(root().getAttribute('style')).toBe(painted.style);
    expect(root().getAttribute('data-sf-template')).toBe(painted.template);
    expect(root().getAttribute('data-mantine-color-scheme')).toBe(painted.scheme);
    expect(document.head.querySelector<HTMLLinkElement>('link#sf-fonts')?.href).toContain('Space+Grotesk');
    expect(document.title).toBe('Acme Shop');
  });

  it('never persists in preview mode', () => {
    applyDocumentTheme(resolveTheme(theme, lookupManifest), brand, { persist: false });
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('paints a legacy v1 payload from the previous release', () => {
    localStorage.setItem(LEGACY_THEME_STORAGE_KEY, JSON.stringify({ theme, brand }));
    run();
    expect(root().style.getPropertyValue('--sf-bg')).toBe('#0f3965');
    expect(root().style.getPropertyValue('--sf-line')).toBe(mix('#15457a', '#ffffff', 0.12));
    expect(root().getAttribute('data-mantine-color-scheme')).toBe('dark');
  });

  it('does not throw on empty or corrupt storage', () => {
    expect(run).not.toThrow();
    localStorage.setItem(THEME_STORAGE_KEY, '{not json');
    expect(run).not.toThrow();
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ v: 2, vars: null }));
    expect(run).not.toThrow();
  });

  it('exposes the stored template id and brand name', () => {
    expect(readStoredTemplateId()).toBeNull();
    applyDocumentTheme(resolveTheme(theme, lookupManifest), brand);
    expect(readStoredTemplateId()).toBe('modern');
    expect(lastKnownBrandName()).toBe('Acme');
    localStorage.clear();
    localStorage.setItem(LEGACY_THEME_STORAGE_KEY, JSON.stringify({ theme, brand: { ...brand, name: 'Old' } }));
    expect(lastKnownBrandName()).toBe('Old');
  });

  it('is inlined verbatim in index.html', () => {
    expect(readFileSync(path.resolve(testDir, '../index.html'), 'utf8')).toContain(THEME_BOOTSTRAP);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm run test:web -- theme-bootstrap` → FAIL.

- [ ] **Step 3: Rewrite `theme-bootstrap.ts`**

```ts
// Inlined into index.html (copy the string verbatim — a test checks it). Runs before React:
// replays the sf-theme-v2 payload applyDocumentTheme() stored (variables, root attributes, the
// Google Fonts link, title), so a returning visitor sees their template's palette and tokens on
// the first frame. Falls back to the previous release's sf-theme-v1 palette payload.
export const THEME_BOOTSTRAP = `(function(){try{var d=document.documentElement,raw=localStorage.getItem('sf-theme-v2'),s,k;if(raw){s=JSON.parse(raw);if(s&&s.v===2&&s.vars&&s.attrs){for(k in s.vars)d.style.setProperty(k,s.vars[k]);for(k in s.attrs)d.setAttribute(k,s.attrs[k]);d.style.colorScheme=s.attrs['data-mantine-color-scheme']||'dark';if(s.fontsHref){var l=document.createElement('link');l.id='sf-fonts';l.rel='stylesheet';l.href=s.fontsHref;document.head.appendChild(l)}if(s.title)document.title=s.title;return}}raw=localStorage.getItem('sf-theme-v1');if(!raw)return;s=JSON.parse(raw);var t=s.theme,b=s.brand,c=t.colors,dk=t.scheme==='dark',tt=dk?'#ffffff':'#000000';function p(h){return[1,3,5].map(function(i){return parseInt(h.slice(i,i+2),16)})}function mx(h,w,q){var a=p(h),z=p(w);return'#'+a.map(function(x,i){return Math.round(x+(z[i]-x)*q).toString(16).padStart(2,'0')}).join('')}var v={'--sf-bg':c.bg,'--sf-bg-deep':mx(c.bg,dk?'#000000':'#ffffff',.18),'--sf-surface':c.surface,'--sf-surface-2':mx(c.surface,tt,.07),'--sf-surface-3':mx(c.surface,tt,.14),'--sf-line':mx(c.surface,tt,.12),'--sf-line-strong':mx(c.surface,tt,.24),'--sf-text':c.text,'--sf-muted':c.muted,'--sf-faint':mx(c.muted,c.bg,.35),'--sf-primary':c.primary,'--sf-primary-soft':mx(c.primary,c.bg,.75),'--sf-success':c.success,'--sf-warn':c.warn,'--sf-danger':c.danger,'--sf-logo-h':b.logoHeight+'px'};for(k in v)d.style.setProperty(k,v[k]);d.setAttribute('data-mantine-color-scheme',t.scheme);d.style.colorScheme=t.scheme;if(b.title)document.title=b.title}catch(e){}})();`;
```

- [ ] **Step 4: Put the string in `index.html`**

Replace the whole `<script>…</script>` after `<!-- sf-theme-bootstrap -->` with `<script>` + the exact `THEME_BOOTSTRAP` string on one line + `</script>`. (Copy it from the built module to avoid typos: `node -e "import('./web/src/app/theme-bootstrap.ts')"` won't run TS — instead copy by hand from the file and let the `is inlined verbatim` test catch any drift.)

- [ ] **Step 5: Rewrite `applyDocumentTheme` and add storage helpers in `theme-bridge.ts`**

Replace `THEME_STORAGE_KEY` and `applyDocumentTheme` with:

```ts
export const THEME_STORAGE_KEY = 'sf-theme-v2';
export const LEGACY_THEME_STORAGE_KEY = 'sf-theme-v1';

/** What the first-paint script replays. Pre-computed so the script needs no theme logic. */
export interface StoredThemePayload {
  v: 2;
  templateId: string;
  vars: Record<string, string>;
  attrs: Record<string, string>;
  title: string;
  brandName: string;
  fontsHref: string | null;
}

export function readStoredTheme(): StoredThemePayload | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<StoredThemePayload> | null;
    return p && p.v === 2 && typeof p.templateId === 'string' && p.vars && p.attrs ? (p as StoredThemePayload) : null;
  } catch {
    return null;
  }
}

export function readStoredTemplateId(): string | null {
  return readStoredTheme()?.templateId ?? null;
}

/** The last brand name we saw, so the retry screen can still name the shop. */
export function lastKnownBrandName(): string | null {
  const v2 = readStoredTheme()?.brandName;
  if (v2) return v2;
  try {
    const raw = localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { brand?: { name?: unknown } };
    return typeof parsed.brand?.name === 'string' && parsed.brand.name ? parsed.brand.name : null;
  } catch {
    return null;
  }
}

export function applyDocumentTheme(theme: ResolvedTheme, brand: Brand, opts: { persist?: boolean } = {}): void {
  const persist = opts.persist ?? true;
  let payload: StoredThemePayload | null = null;
  try {
    const root = document.documentElement;
    const vars = cssVariablesFor(theme, brand);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    const attrs = rootAttributes(theme);
    for (const [k, v] of Object.entries(attrs)) root.setAttribute(k, v);
    root.style.colorScheme = theme.scheme;

    const href = googleFontsHref(theme.fonts);
    const link = upsert<HTMLLinkElement>('link#sf-fonts', () => Object.assign(document.createElement('link'), { id: 'sf-fonts', rel: 'stylesheet' }));
    if (href) link.href = href; else link.remove();

    const style = upsert<HTMLStyleElement>('style#sf-custom-css', () => Object.assign(document.createElement('style'), { id: 'sf-custom-css' }));
    style.textContent = theme.customCss || '';

    document.title = brand.title;
    upsert<HTMLMetaElement>('meta[name="description"]', () => Object.assign(document.createElement('meta'), { name: 'description' })).content = brand.description;
    upsert<HTMLMetaElement>('meta[name="theme-color"]', () => Object.assign(document.createElement('meta'), { name: 'theme-color' })).content = theme.colors.bg;
    const fav = mediaUrl(brand.faviconUrl) ?? '/favicon.svg';
    upsert<HTMLLinkElement>('link[rel="icon"]', () => Object.assign(document.createElement('link'), { rel: 'icon' })).href = fav;

    payload = { v: 2, templateId: theme.templateId, vars, attrs, title: brand.title, brandName: brand.name, fontsHref: href };
  } catch {
    /* never throw — first-paint / theme sync must not break the app */
  }
  if (persist && payload) {
    try { localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(payload)); } catch { /* private mode */ }
  }
}
```

Add `import { rootAttributes, tokenVariables } from '@/templates/tokens.ts';` (replacing the Task 4 single import).

- [ ] **Step 6: Use the helper in `App.tsx`**

Delete the local `lastKnownBrandName` function and the `THEME_STORAGE_KEY` import from `App.tsx`; import `lastKnownBrandName` from `@/app/theme-bridge.ts` instead.

- [ ] **Step 7: Update e2e test 7**

In `e2e/storefront.spec.ts` test `7 · a returning visitor gets the palette before any app JS runs`, change:

```ts
    const stored = await page.evaluate(() => window.localStorage.getItem('sf-theme-v2'));
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!).vars['--sf-bg']).toBe('#0b0c0e');
```

- [ ] **Step 8: Verify**

Run: `npm run test:web` → PASS. Run: `npm run typecheck` → clean. Run: `npm run test:e2e -- storefront.spec.ts templates-baseline.spec.ts` → all pass.

- [ ] **Step 9: Commit**

```bash
git add web/src/app/theme-bridge.ts web/src/app/theme-bootstrap.ts web/index.html web/src/app/App.tsx web/test/theme-bootstrap.test.ts e2e/storefront.spec.ts
git commit -m "feat(templates): v2 first-paint payload replays template tokens and fonts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Template runtime — provider, slots, hooks, defaults, contract (frontend-design subagent)

**Files:**
- Create: `web/src/templates/runtime.tsx`, `web/src/templates/hooks.ts`, `web/src/templates/contract.ts`
- Create: `web/src/templates/defaults/index.ts`, `DefaultFooter.tsx`, `DefaultCatalogHero.tsx`, `DefaultSectionLabel.tsx`, `SectionLabel.module.css`
- Create: `web/src/lib/server-clock.ts`, `web/src/lib/settings-anchor.ts`
- Modify: `web/src/app/settings.ts` (queryFn records the fetch time)
- Modify: `web/src/features/notices/CutoffBar.tsx` (drop its private anchor + tick; use `useCutoffInfo()`)
- Modify: `web/src/app/App.tsx`, `web/src/main.tsx`
- Modify: `web/src/layouts/StorefrontShell.tsx`, `web/src/layouts/MenuShell.tsx`, `web/src/layouts/Chromeless.tsx`
- Modify: `web/src/features/catalog/ProductGrid.tsx`, `ProductList.tsx`, `web/src/features/wholesale/WholesaleCatalogPage.tsx`
- Modify: `web/src/features/catalog/AddToCart.tsx`, `web/src/features/cart/CartSummary.tsx`, `web/src/features/cart/MobileCartBar.tsx`, `web/src/features/checkout/CheckoutPage.tsx`
- Modify: `web/src/templates/modern/index.ts` (import from contract), `web/src/components/icons.tsx` (`GlyphProps` widened, `ArrowUpRightIcon` forwards SVG props)
- Test: `web/test/templates-runtime.test.tsx`, `web/test/templates-hooks.test.ts`, `web/test/server-clock.test.tsx`; existing `web/test/cutoff-bar.test.tsx` must stay green unchanged

**Interfaces:**
- Consumes: `REGISTRY`/`getTemplate`, `ResolvedTheme`, slot types, `BASE_TOKENS`, the settings fetch time recorded by the settings queryFn (`lib/settings-anchor.ts`, created here).
- Produces: `loadTemplateModule(id)`, `prefetchTemplate(id | null)`, `TemplateProvider({ resolved, fallback, children, load?, peek?, timeoutMs? })`, `useTemplateContext(): { resolved: ResolvedTheme | null; slots: TemplateSlots }`, `Slot<N>({ name, ...ownProps })`, `DEFAULT_SLOTS`, all hooks listed in the Contract reference, `contract.ts` barrel.

- [ ] **Step 1: Write failing runtime tests**

`web/test/templates-runtime.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { StorefrontSettings } from '@/types/settings.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));

import { Slot, TemplateProvider } from '@/templates/runtime.tsx';
import { resolveTheme } from '@/templates/resolve.ts';
import { lookupManifest } from '@/templates/registry.ts';
import type { TemplateModule } from '@/templates/slots.ts';

state.settings = {
  brand: { name: 'Acme', shortName: 'Acme', tagline: '', title: 'Acme', description: '', logoUrl: null, faviconUrl: null, logoHeight: 28, links: { whatsapp: null, telegram: null } },
  features: { layout: 'storefront', ordering: true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false },
  theme: { scheme: 'dark', colors: { primary: '#ffffff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' }, fonts: { heading: null, body: null, mono: null }, radius: 'none', density: 'comfortable', customCss: '' },
} as unknown as StorefrontSettings;

const resolved = resolveTheme(state.settings.theme, lookupManifest);
const custom: TemplateModule = { slots: { TopBar: ({ brand, layout }) => <p>top {brand.name} {layout}</p> } };

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('TemplateProvider', () => {
  it('shows the fallback until the module loads, then custom slots (wrapped) and defaults (unwrapped)', async () => {
    let resolveLoad!: (m: TemplateModule) => void;
    const load = () => new Promise<TemplateModule>((r) => { resolveLoad = r; });
    render(
      <TemplateProvider resolved={resolved} fallback={<p>loading</p>} load={load} peek={() => undefined}>
        <Slot name="TopBar" />
        <Slot name="SectionLabel" index={1} title="All" level="page" />
      </TemplateProvider>,
    );
    expect(screen.getByText('loading')).toBeInTheDocument();
    await act(async () => resolveLoad(custom));
    const top = screen.getByText('top Acme storefront');
    expect(top.parentElement).toHaveAttribute('data-sf-slot', 'TopBar');
    expect(document.querySelector('[data-sf-part="section-label"]')).toBeNull(); // plain label → nothing
  });

  it('renders immediately from an already-loaded module', () => {
    render(
      <TemplateProvider resolved={resolved} fallback={<p>loading</p>} load={() => Promise.resolve(custom)} peek={() => custom}>
        <Slot name="TopBar" />
      </TemplateProvider>,
    );
    expect(screen.getByText('top Acme storefront')).toBeInTheDocument();
  });

  it('load failure → default slots, with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(
      <TemplateProvider resolved={resolved} fallback={<p>loading</p>} load={() => Promise.reject(new Error('404'))} peek={() => undefined}>
        <p>app</p><Slot name="TopBar" />
      </TemplateProvider>,
    );
    expect(await screen.findByText('app')).toBeInTheDocument();
    expect(screen.queryByText(/^top /)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('failed to load'), expect.anything());
    warn.mockRestore();
  });

  it('timeout then late load → defaults first, custom slots when the chunk finally arrives', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let resolveLoad!: (m: TemplateModule) => void;
    render(
      <TemplateProvider resolved={resolved} fallback={<p>loading</p>} timeoutMs={100} load={() => new Promise((r) => { resolveLoad = r; })} peek={() => undefined}>
        <p>app</p><Slot name="TopBar" />
      </TemplateProvider>,
    );
    await act(async () => { vi.advanceTimersByTime(150); });
    expect(screen.getByText('app')).toBeInTheDocument();
    expect(screen.queryByText(/^top /)).toBeNull();
    await act(async () => resolveLoad(custom));
    expect(screen.getByText('top Acme storefront')).toBeInTheDocument();
    warn.mockRestore();
  });

  it('Slot outside a provider renders defaults (existing component tests keep working)', () => {
    render(<Slot name="SectionLabel" index={2} title="Oils" level="group" />);
    expect(document.body.textContent).toBe('');
  });
});
```

`web/test/templates-hooks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatClock, utcOffsetLabel } from '@/templates/hooks.ts';

describe('clock helpers', () => {
  const at = new Date('2026-08-24T09:05:07.000Z');
  it('formats a 24h clock in the zone', () => {
    expect(formatClock(at, 'Europe/London')).toBe('10:05:07');
    expect(formatClock(at, 'UTC')).toBe('09:05:07');
    expect(formatClock(at, 'Not/AZone')).toBe('09:05:07');
  });
  it('labels the UTC offset', () => {
    expect(utcOffsetLabel(at, 'Europe/London')).toBe('UTC+1');
    expect(utcOffsetLabel(at, 'UTC')).toBe('UTC+0');
    expect(utcOffsetLabel(at, 'Asia/Kolkata')).toBe('UTC+5:30');
    expect(utcOffsetLabel(at, 'America/New_York')).toBe('UTC-4');
    expect(utcOffsetLabel(at, 'Not/AZone')).toBe('UTC+0');
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm run test:web -- templates-runtime templates-hooks` → FAIL (modules missing). (`server-clock.test.tsx` is written in Step 5, and fails until `settings-anchor.ts` exists.)

- [ ] **Step 3: Default slots**

`web/src/templates/defaults/SectionLabel.module.css`:

```css
/* The eyebrow a template asks for through tokens.label.style — bracketed ("[Oils]")
   or numbered ("/01"). Modern's 'plain' renders nothing at all. */
.label {
  margin: 0 0 0.35rem;
  font-family: var(--sf-font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
  color: var(--sf-primary);
}
```

`web/src/templates/defaults/DefaultSectionLabel.tsx`:

```tsx
import type { SectionLabelProps } from '@/templates/slots.ts';
import classes from '@/templates/defaults/SectionLabel.module.css';

export function DefaultSectionLabel({ index, title, tokens }: SectionLabelProps) {
  const style = tokens.label.style;
  if (style === 'plain') return null;
  const text = style === 'bracket' ? `[${title}]` : `/${String(index).padStart(2, '0')}`;
  return <p className={classes.label} data-sf-part="section-label" aria-hidden>{text}</p>;
}
```

`web/src/templates/defaults/DefaultCatalogHero.tsx` — moves the hero/welcome markup out of the three pages **unchanged** (same elements, same classes, same text nodes):

```tsx
import type { CatalogHeroProps } from '@/templates/slots.ts';
import gridClasses from '@/features/catalog/ProductGrid.module.css';
import listClasses from '@/features/catalog/ProductList.module.css';
import wholesaleClasses from '@/features/wholesale/WholesaleCatalogPage.module.css';

export function DefaultCatalogHero({ surface, tagline, welcomeMessage, productCount, categoryCount }: CatalogHeroProps) {
  if (surface === 'grid') {
    if (!tagline && !welcomeMessage) return null;
    return (
      <section className={gridClasses.hero} aria-label="About this shop" data-sf-part="hero">
        <div className={gridClasses.heroText}>
          {tagline ? <p className={gridClasses.tagline}>{tagline}</p> : null}
          {welcomeMessage ? <p className={gridClasses.welcome}>{welcomeMessage}</p> : null}
        </div>
        <p className={gridClasses.stock}>
          {productCount} products
          {categoryCount > 0 ? ` · ${categoryCount} categories` : ''}
        </p>
      </section>
    );
  }
  if (!welcomeMessage) return null;
  return <p className={surface === 'list' ? listClasses.welcome : wholesaleClasses.welcome}>{welcomeMessage}</p>;
}
```

`web/src/templates/defaults/DefaultFooter.tsx` — the `<footer>` block from `StorefrontShell.tsx` moved verbatim, plus `data-sf-part`:

```tsx
import { Brand } from '@/components/Brand.tsx';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import type { FooterProps } from '@/templates/slots.ts';
import classes from '@/layouts/StorefrontShell.module.css';

/** Modern's footer: the storefront layout's three columns and colophon; the menu layout has none. */
export function DefaultFooter({ brand, layout, supportLinks, hasChat }: FooterProps) {
  if (layout !== 'storefront') return null;
  return (
    <footer className={classes.footer} data-sf-part="footer">
      <div className={classes.footerInner}>
        <div className={classes.footerBrand}>
          <Brand size="sm" />
          {brand.tagline ? <p className={classes.tagline}>{brand.tagline}</p> : null}
        </div>

        {supportLinks.length > 0 ? (
          <nav aria-label="Support">
            <h2 className={classes.footerHead}>Support</h2>
            <ul className={classes.footerList}>
              {supportLinks.map((link) => (
                <li key={link.url}>
                  <a className={classes.footerLink} href={link.url} target="_blank" rel="noopener noreferrer">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {hasChat ? (
          <div>
            <h2 className={classes.footerHead}>Talk to us</h2>
            <ContactLinks />
          </div>
        ) : null}
      </div>

      <div className={classes.colophon}>
        <span>{brand.name}</span>
        <span>{new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}
```

`web/src/templates/defaults/index.ts`:

```ts
import type { ComponentType } from 'react';
import type { SlotName, SlotPropsMap } from '@/templates/slots.ts';
import { DefaultCatalogHero } from '@/templates/defaults/DefaultCatalogHero.tsx';
import { DefaultFooter } from '@/templates/defaults/DefaultFooter.tsx';
import { DefaultSectionLabel } from '@/templates/defaults/DefaultSectionLabel.tsx';

const Nothing = () => null;

/** Modern's slots — what renders whenever the active template leaves a slot out. */
export const DEFAULT_SLOTS: { [K in SlotName]: ComponentType<SlotPropsMap[K]> } = {
  TopBar: Nothing,
  Footer: DefaultFooter,
  CatalogHero: DefaultCatalogHero,
  SectionLabel: DefaultSectionLabel,
  Overlay: Nothing,
  ButtonAdornment: Nothing,
};
```

- [ ] **Step 4: Runtime**

`web/src/templates/runtime.tsx`:

```tsx
import { createContext, createElement, useContext, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useSettings } from '@/app/settings.ts';
import { BASE_TOKENS } from '@/templates/define.ts';
import { getTemplate } from '@/templates/registry.ts';
import type { ResolvedTheme } from '@/templates/resolve.ts';
import type { SlotBaseProps, SlotName, SlotPropsMap, TemplateModule, TemplateSlots } from '@/templates/slots.ts';
import { DEFAULT_SLOTS } from '@/templates/defaults/index.ts';

const pending = new Map<string, Promise<TemplateModule>>();
const settled = new Map<string, TemplateModule>();

/** One fetch per template per page load; a failure is forgotten so a later render can retry. */
export function loadTemplateModule(id: string): Promise<TemplateModule> {
  const entry = getTemplate(id);
  const key = entry.manifest.id;
  let p = pending.get(key);
  if (!p) {
    p = entry.load().then((mod) => { settled.set(key, mod); return mod; });
    p.catch(() => pending.delete(key));
    pending.set(key, p);
  }
  return p;
}

/** Called from main.tsx with the id the last visit stored, before settings arrive. */
export function prefetchTemplate(id: string | null): void {
  if (!id) return;
  void loadTemplateModule(id).catch(() => undefined);
}

interface TemplateContextValue { resolved: ResolvedTheme | null; slots: TemplateSlots }
const NO_PROVIDER: TemplateContextValue = { resolved: null, slots: {} };
const TemplateContext = createContext<TemplateContextValue>(NO_PROVIDER);

/** Outside a provider (component tests) this is "modern, no custom slots". */
export function useTemplateContext(): TemplateContextValue {
  return useContext(TemplateContext);
}

export interface TemplateProviderProps {
  resolved: ResolvedTheme;
  /** Shown while the active template's chunk loads (first visit only; prefetch usually wins). */
  fallback: ReactNode;
  children: ReactNode;
  load?: (id: string) => Promise<TemplateModule>;
  peek?: (id: string) => TemplateModule | undefined;
  timeoutMs?: number;
}

const peekSettled = (id: string): TemplateModule | undefined => settled.get(id);

export function TemplateProvider({ resolved, fallback, children, load = loadTemplateModule, peek = peekSettled, timeoutMs = 4000 }: TemplateProviderProps) {
  const id = resolved.templateId;
  const [loaded, setLoaded] = useState<{ id: string; slots: TemplateSlots } | null>(() => {
    const mod = peek(id);
    return mod ? { id, slots: mod.slots ?? {} } : null;
  });
  // Refs, not deps: callers (tests) pass inline functions, and re-running the effect on every
  // render would refetch and re-arm the timeout forever. Only a template switch re-runs it.
  const loadRef = useRef(load);
  loadRef.current = load;
  const peekRef = useRef(peek);
  peekRef.current = peek;

  useEffect(() => {
    const already = peekRef.current(id);
    if (already) {
      setLoaded((cur) => (cur?.id === id ? cur : { id, slots: already.slots ?? {} }));
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      console.warn(`[templates] "${id}" is taking longer than ${timeoutMs}ms — rendering default slots for now`);
      if (live) setLoaded((cur) => (cur?.id === id ? cur : { id, slots: {} }));
    }, timeoutMs);
    loadRef.current(id).then(
      (mod) => { if (live) setLoaded({ id, slots: mod.slots ?? {} }); },
      (err: unknown) => {
        console.warn(`[templates] "${id}" failed to load — rendering default slots`, err);
        if (live) setLoaded({ id, slots: {} });
      },
    ).finally(() => clearTimeout(timer));
    return () => { live = false; clearTimeout(timer); };
  }, [id, timeoutMs]);

  const value = useMemo(() => ({ resolved, slots: loaded?.id === id ? loaded.slots : {} }), [resolved, loaded, id]);
  if (!loaded || loaded.id !== id) return <>{fallback}</>;
  return <TemplateContext.Provider value={value}>{children}</TemplateContext.Provider>;
}

type SlotOwnProps<N extends SlotName> = Omit<SlotPropsMap[N], keyof SlotBaseProps>;

/**
 * Renders the active template's component for `name`, or modern's default. Base props
 * (brand, options, scheme, layout, tokens) are filled in here. A template's component is
 * wrapped in a display:contents div carrying data-sf-slot — defaults are not, so modern's
 * DOM is unchanged.
 */
export function Slot<N extends SlotName>(props: { name: N } & SlotOwnProps<N>) {
  const { name, ...own } = props;
  const ctx = useTemplateContext();
  const settings = useSettings();
  const custom = ctx.slots[name] as ComponentType<SlotPropsMap[N]> | undefined;
  const Component = (custom ?? DEFAULT_SLOTS[name]) as ComponentType<SlotPropsMap[N]>;
  const base: SlotBaseProps = {
    brand: settings.brand,
    options: ctx.resolved?.options ?? {},
    scheme: ctx.resolved?.scheme ?? settings.theme?.scheme ?? 'dark',
    layout: settings.features?.layout ?? 'storefront',
    tokens: ctx.resolved?.tokens ?? BASE_TOKENS,
  };
  const element = createElement(Component, { ...base, ...own } as SlotPropsMap[N]);
  return custom ? <div data-sf-slot={name} style={{ display: 'contents' }}>{element}</div> : element;
}
```

- [ ] **Step 5: Server clock (anchored at fetch time), CutoffBar on it, and hooks**

`web/src/lib/cutoffs.ts` does not change. The anchor for the drift correction is **the settings query's fetch time** — the instant its `queryFn` resolves, which is what React Query stamps as `dataUpdatedAt` — never the moment a component first renders. (A clock slot mounted minutes after the response would otherwise run behind by the response's age.) The fetch time is recorded in a tiny non-React module so that every existing test that mocks only `useSettings` (`cutoff-bar.test.tsx`, Plan 3's slot tests) keeps working. Without a recorded fetch it falls back to first render, which is today's CutoffBar behaviour.

Create `web/src/lib/settings-anchor.ts`:

```ts
/**
 * When each settings response arrived, keyed by its serverTime — the anchor for every
 * server-clock reading (CutoffBar, template clocks). Written by the settings queryFn at the
 * moment it resolves (React Query's dataUpdatedAt for that response). Plain module state,
 * not React: the reader works under test mocks of useSettings.
 */
const fetchedAtByServerTime = new Map<string, number>();

export function recordSettingsFetch(serverTime: string, at: number = Date.now()): void {
  fetchedAtByServerTime.set(serverTime, at);
  if (fetchedAtByServerTime.size > 8) fetchedAtByServerTime.delete(fetchedAtByServerTime.keys().next().value!);
}

export function settingsFetchedAt(serverTime: string): number | undefined {
  return fetchedAtByServerTime.get(serverTime);
}
```

In `web/src/app/settings.ts`, inside `useSettingsQuery`'s `queryFn`, directly after `const s = await fetchSettings();`, add `recordSettingsFetch(s.serverTime);` (import it from `@/lib/settings-anchor.ts`).

Create `web/src/lib/server-clock.ts`:

```ts
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '@/app/settings.ts';
import { nextCutoff } from '@/lib/cutoffs.ts';
import { settingsFetchedAt } from '@/lib/settings-anchor.ts';
import type { DayKey } from '@/types/settings.ts';

/** serverTime plus the client clock at the moment that response was fetched. */
function useServerAnchor(): { serverTime: string; fetchedAt: number } {
  const { serverTime } = useSettings();
  const fallback = useRef<{ serverTime: string; at: number } | null>(null);
  const recorded = settingsFetchedAt(serverTime);
  if (recorded !== undefined) return { serverTime, fetchedAt: recorded };
  // No recorded fetch (component tests that mock useSettings): anchor at first render.
  if (fallback.current?.serverTime !== serverTime) fallback.current = { serverTime, at: Date.now() };
  return { serverTime, fetchedAt: fallback.current.at };
}

function useTick(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** The server's "now", advancing every `intervalMs`, immune to a skewed device clock. */
export function useServerClock(intervalMs = 1000): Date {
  const { serverTime, fetchedAt } = useServerAnchor();
  const now = useTick(intervalMs);
  const server = Date.parse(serverTime);
  return new Date(Number.isNaN(server) ? now : server + (now - fetchedAt));
}

export interface CutoffInfo {
  timezone: string;
  next: { day: DayKey; cutoff: string; shipsOn: string; isToday: boolean; at: Date; msRemaining: number } | null;
}

/** The next dispatch cut-off, re-evaluated every 30 s. The single implementation — CutoffBar reads it too. */
export function useCutoffInfo(): CutoffInfo {
  const { cutoffs } = useSettings();
  const { serverTime, fetchedAt } = useServerAnchor();
  const now = useTick(30_000);
  return useMemo(() => {
    const n = nextCutoff(cutoffs, serverTime, fetchedAt, now);
    return {
      timezone: cutoffs.timezone || 'UTC',
      next: n ? { day: n.day, cutoff: n.cutoff, shipsOn: n.shipsOn, isToday: n.isToday, at: n.at, msRemaining: n.msRemaining } : null,
    };
  }, [cutoffs, serverTime, fetchedAt, now]);
}
```

Then **remove CutoffBar's private copy** of that logic. In `web/src/features/notices/CutoffBar.tsx`, replace everything from `const { cutoffs, serverTime } = useSettings();` down to and including the `useMemo(() => nextCutoff(…))` block with:

```tsx
  const { next } = useCutoffInfo();
```

(`if (!next) return null;` and the JSX that follows stay as they are; `next.day`, `next.at`, `next.cutoff`, `next.shipsOn`, `next.isToday` and `next.msRemaining` are all on `CutoffInfo.next`.) Imports become `import { type CSSProperties } from 'react';`, `import { formatCountdown } from '@/lib/cutoffs.ts';` and `import { useCutoffInfo } from '@/lib/server-clock.ts';`; drop `useSettings`, `useEffect`, `useMemo`, `useRef`, `useState` and `nextCutoff`. `web/test/cutoff-bar.test.tsx` must pass **unchanged**. It mocks only `useSettings`, so the anchor takes the first-render fallback, exactly as before.

`web/test/server-clock.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/settings.ts')>()),
  useSettings: () => state.settings,
}));
vi.mock('@/api/settings.ts', () => ({ fetchSettings: async () => ({ ...state.settings, serverTime: '2026-08-24T12:00:00.000Z' }) }));

import { useSettingsQuery } from '@/app/settings.ts';
import { recordSettingsFetch, settingsFetchedAt } from '@/lib/settings-anchor.ts';
import { useServerClock } from '@/lib/server-clock.ts';

const T0 = Date.parse('2026-08-24T10:00:00.000Z'); // client clock when the response arrived
state.settings = { serverTime: '2026-08-24T09:00:00.000Z', cutoffs: { timezone: 'UTC', days: {} }, enabled: true } as unknown as StorefrontSettings;

afterEach(() => { vi.useRealTimers(); });

describe('server clock anchor', () => {
  it('a clock mounted 60 s after the fetch reads serverTime + 60 s, not serverTime', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    recordSettingsFetch('2026-08-24T09:00:00.000Z', T0);
    vi.setSystemTime(T0 + 60_000);
    const { result } = renderHook(() => useServerClock());
    expect(result.current.toISOString()).toBe('2026-08-24T09:01:00.000Z');
  });

  it('without a recorded fetch (mocked settings) it anchors at first render', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    state.settings = { ...state.settings, serverTime: '2026-08-24T08:00:00.000Z' };
    vi.setSystemTime(T0);
    const { result } = renderHook(() => useServerClock());
    expect(result.current.toISOString()).toBe('2026-08-24T08:00:00.000Z');
  });

  it('the settings queryFn records the fetch time of each response', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const before = Date.now();
    const { result } = renderHook(() => useSettingsQuery(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const at = settingsFetchedAt('2026-08-24T12:00:00.000Z')!;
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(result.current.dataUpdatedAt);
  });
});
```

`web/src/templates/hooks.ts`:

```ts
import { useMemo } from 'react';
import { useSettings } from '@/app/settings.ts';
import { useCatalog } from '@/features/catalog/use-catalog.ts';
import { buildCategoryTree } from '@/features/catalog/category-tree.ts';
import { categoryCounts } from '@/features/catalog/filter.ts';
import { BASE_TOKENS, type OptionValues, type Scheme, type TemplateTokens } from '@/templates/define.ts';
import { useTemplateContext } from '@/templates/runtime.tsx';
import type { Brand, Features, SupportLink } from '@/types/settings.ts';

export interface TemplateInfo { id: string; presetId: string; scheme: Scheme; options: OptionValues; tokens: TemplateTokens }
export function useTemplate(): TemplateInfo {
  const { resolved } = useTemplateContext();
  const settings = useSettings();
  return {
    id: resolved?.templateId ?? 'modern',
    presetId: resolved?.presetId ?? 'default',
    scheme: resolved?.scheme ?? settings.theme.scheme,
    options: resolved?.options ?? {},
    tokens: resolved?.tokens ?? BASE_TOKENS,
  };
}

export function useTemplateOptions(): OptionValues {
  return useTemplateContext().resolved?.options ?? {};
}

export interface StorefrontInfo { brand: Brand; features: Features; supportLinks: SupportLink[]; welcomeMessage: string | null; currency: string; enabled: boolean }
export function useStorefront(): StorefrontInfo {
  const s = useSettings();
  return { brand: s.brand, features: s.features, supportLinks: s.supportLinks, welcomeMessage: s.welcomeMessage, currency: s.currency, enabled: s.enabled };
}

export interface CatalogStats { productCount: number | null; categoryCount: number | null }
/** Same counts the catalogue hero shows; null while the catalogue is loading. */
export function useCatalogStats(): CatalogStats {
  const catalog = useCatalog();
  return useMemo(() => {
    const d = catalog.data;
    if (!d) return { productCount: null, categoryCount: null };
    return { productCount: d.products.length, categoryCount: buildCategoryTree(d.categories, categoryCounts(d.products)).length };
  }, [catalog.data]);
}

export interface OrderingState { enabled: boolean; ordering: boolean; accepting: boolean }
export function useOrderingState(): OrderingState {
  const s = useSettings();
  return { enabled: s.enabled, ordering: s.features.ordering, accepting: s.enabled && s.features.ordering };
}

function safeZone(timeZone: string): string {
  try { new Intl.DateTimeFormat('en-GB', { timeZone }); return timeZone; } catch { return 'UTC'; }
}

/** 'HH:MM:SS', 24-hour, in `timeZone` (an invalid zone reads as UTC). */
export function formatClock(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: safeZone(timeZone), hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
}

/** 'UTC+1', 'UTC-4', 'UTC+5:30', 'UTC+0'. */
export function utcOffsetLabel(date: Date, timeZone: string): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: safeZone(timeZone), timeZoneName: 'shortOffset' })
    .formatToParts(date).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const offset = part.replace(/^GMT/, '');
  return `UTC${offset === '' ? '+0' : offset}`;
}
```

- [ ] **Step 6: The contract barrel**

First widen the icon props in `web/src/components/icons.tsx` so a template can size and tag the `↗` glyph. Replace the `GlyphProps` interface and `stroke()` signature, and `ArrowUpRightIcon`:

```tsx
import type { SVGProps } from 'react';

export type GlyphProps = { size?: number | string } & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>;

function stroke(size: number | string) {
  // …body unchanged…
}

/** "This opens somewhere else" — pinned to links that leave the shop. Extra SVG props (className, data-*) pass through. */
export function ArrowUpRightIcon({ size = 13, ...rest }: GlyphProps) {
  return (
    <svg {...stroke(size)} {...rest}>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}
```

(The other glyphs keep destructuring only `size`; their callers are unchanged.) Add to `web/test/templates-runtime.test.tsx`:

```tsx
import { ArrowUpRightIcon } from '@/templates/contract.ts';

describe('contract icons', () => {
  it('ArrowUpRightIcon forwards className, data-* and a CSS size', () => {
    const { container } = render(<ArrowUpRightIcon size="1em" className="x-arrow" data-cta="true" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveClass('x-arrow');
    expect(svg).toHaveAttribute('data-cta', 'true');
    expect(svg).toHaveAttribute('width', '1em');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});
```

Then create `web/src/templates/contract.ts` exactly as the Contract reference's `contract.ts` block. Then change `web/src/templates/modern/index.ts` to import `TemplateSlots` from `'@/templates/contract.ts'`.

- [ ] **Step 7: Mount the provider and prefetch**

`web/src/main.tsx` — after the CSS imports, add:

```ts
import { prefetchTemplate } from '@/templates/runtime.tsx';
import { readStoredTemplateId } from '@/app/theme-bridge.ts';

// Start fetching the last visit's template chunk while settings are still in flight.
prefetchTemplate(readStoredTemplateId());
```

`web/src/app/App.tsx` `ThemedApp` return becomes:

```tsx
    <MantineProvider theme={mantineTheme} forceColorScheme={resolved.scheme}>
      <TemplateProvider resolved={resolved} fallback={<PageSkeleton />}>
        <Notifications position="top-center" />
        <ClosedGate>
          <RouterProvider router={router} />
        </ClosedGate>
      </TemplateProvider>
    </MantineProvider>
```

with `import { TemplateProvider } from '@/templates/runtime.tsx';`.

- [ ] **Step 8: Place the slots**

Use `import { Slot } from '@/templates/runtime.tsx';` in each file below. Default slots must produce the exact DOM that was there before.

- `StorefrontShell.tsx`: first child of the shell `<div>`: `<Slot name="TopBar" />`. Replace the whole `<footer>…</footer>` with `<Slot name="Footer" supportLinks={supportLinks} hasChat={hasChat} />`. Last child of the shell `<div>`: `<Slot name="Overlay" />`. Remove imports that become unused (`ContactLinks` only if no longer referenced — it is used by the footer, which moved).
- `MenuShell.tsx`: add `supportLinks` to the `useSettings()` destructure and `const hasChat = !!(brand.links.whatsapp || brand.links.telegram);`. First child: `<Slot name="TopBar" />`. Directly after `</main>`: `<Slot name="Footer" supportLinks={supportLinks} hasChat={hasChat} />`. Last child: `<Slot name="Overlay" />`.
- `Chromeless.tsx`: last child of the shell `<div>`: `<Slot name="Overlay" />`.
- `ProductGrid.tsx`: replace `{hasHero ? (<section …>…</section>) : null}` with
  `<Slot name="CatalogHero" surface="grid" tagline={brand.tagline} welcomeMessage={welcomeMessage} productCount={products.length} categoryCount={tree.length} />` and delete the now-unused `hasHero`. Inside `.column`, directly before `<div className={classes.head}>`: `<Slot name="SectionLabel" index={1} title={active ? active.name : 'All products'} level="page" />`.
- `ProductList.tsx`: add `brand` to the `useSettings()` destructure. Directly before `<div className={classes.head}>` (inside the fragment): `<Slot name="SectionLabel" index={1} title={active ? active.name : 'All products'} level="page" />`. Replace `{welcomeMessage ? <p className={classes.welcome}>{welcomeMessage}</p> : null}` with `<Slot name="CatalogHero" surface="list" tagline={brand.tagline} welcomeMessage={welcomeMessage} productCount={products.length} categoryCount={tree.length} />`. Change `groups.map((group) => (` to `groups.map((group, groupIndex) => (` and, as the first child of each `<section>`, add `<Slot name="SectionLabel" index={groupIndex + 1} title={group.label} level="group" />`.
- `WholesaleCatalogPage.tsx`: add `brand` to the destructure. Before `<div className={classes.head}>`: `<Slot name="SectionLabel" index={1} title={active ? active.name : 'Trade list'} level="page" />`. Replace the welcome `<p>` with `<Slot name="CatalogHero" surface="wholesale" tagline={brand.tagline} welcomeMessage={welcomeMessage} productCount={products.length} categoryCount={tree.length} />` (the page already computes `tree`).
- `AddToCart.tsx`: after the label `<span>` inside the `<button>`: `<Slot name="ButtonAdornment" variant="primary" cta={false} />`.
- `CartSummary.tsx`: inside both checkout elements (the disabled `<button>` and the `<Link>`), after the text: `<Slot name="ButtonAdornment" variant="primary" cta />`.
- `MobileCartBar.tsx`: same as CartSummary for its two checkout elements.
- `CheckoutPage.tsx`: the Place order / Continue control is a native `<button className={classes.next}>` (two of them in the `onReview ? … : …` branch, ~L686–705), not a Mantine `Button`. Append `<Slot name="ButtonAdornment" variant="primary" cta />` as the last child of each (inside the `submitting`/`chargeTotal` fragment for Place order). Task 7 adds its `data-sf-part`/`data-variant`/`data-sf-cta` attributes.

- [ ] **Step 9: Verify**

Run: `npm run test:web` → all PASS. That includes the unchanged `cutoff-bar.test.tsx` and the existing product-grid/list/wholesale tests, which mock `useSettings` and render outside a provider; the no-provider context keeps them green. Run: `npm run typecheck` → clean. It proves the contract barrel's `CutoffInfo` re-export resolves to `lib/server-clock.ts`. Run: `npm run test:e2e -- templates-baseline.spec.ts storefront.spec.ts` → all pass.

- [ ] **Step 10: Commit**

```bash
git add web/src/components/icons.tsx web/src/templates/runtime.tsx web/src/templates/hooks.ts web/src/templates/contract.ts \
  web/src/templates/defaults/index.ts web/src/templates/defaults/DefaultFooter.tsx web/src/templates/defaults/DefaultCatalogHero.tsx web/src/templates/defaults/DefaultSectionLabel.tsx web/src/templates/defaults/SectionLabel.module.css \
  web/src/templates/modern/index.ts web/src/lib/server-clock.ts web/src/lib/settings-anchor.ts web/src/app/settings.ts web/src/features/notices/CutoffBar.tsx \
  web/src/app/App.tsx web/src/main.tsx web/src/layouts/StorefrontShell.tsx web/src/layouts/MenuShell.tsx web/src/layouts/Chromeless.tsx \
  web/src/features/catalog/ProductGrid.tsx web/src/features/catalog/ProductList.tsx web/src/features/wholesale/WholesaleCatalogPage.tsx \
  web/src/features/catalog/AddToCart.tsx web/src/features/cart/CartSummary.tsx web/src/features/cart/MobileCartBar.tsx web/src/features/checkout/CheckoutPage.tsx \
  web/test/templates-runtime.test.tsx web/test/templates-hooks.test.ts web/test/server-clock.test.tsx
git commit -m "feat(templates): template provider, slots with modern defaults, template hooks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Token refactor of the shared CSS + parts attributes (frontend-design subagent)

**Files:**
- Modify: `web/src/styles/global.css`, `web/src/styles/mantine.css`, `web/src/styles/chassis.css`
- Modify: CSS modules listed in Step 5 (and in the Step 8 `git add` list); TSX files listed in Step 6
- Test: `web/test/vocabulary.test.ts`, `web/test/templates-parts.test.ts` (new). (`web/test/chassis.test.ts` is not touched: its assertions stay true after the body-rule split. The new chassis assertions live in `templates-parts.test.ts`.)

**Interfaces:**
- Consumes: token variable names (Contract reference), `tokenVariables`, `BASE_TOKENS`.
- Produces: the parts in the Contract reference's parts table, present in the DOM.

- [ ] **Step 1: Write failing CSS/parts tests**

Append to `web/test/vocabulary.test.ts` (and edit the two existing button/card assertions as shown):

```ts
import { tokenVariables } from '@/templates/tokens.ts';
import { BASE_TOKENS } from '@/templates/define.ts';

describe('mantine.css reads the button/input tokens', () => {
  it('button voice comes from tokens whose modern values are the old literals', () => {
    expect(css).toMatch(/\.sf-button\s*\{[^}]*font-family: var\(--sf-btn-font\)[^}]*text-transform: var\(--sf-btn-transform\)[^}]*font-weight: var\(--sf-btn-weight\)[^}]*letter-spacing: var\(--sf-btn-tracking-md\)/s);
    const v = tokenVariables(BASE_TOKENS);
    expect(v['--sf-btn-font']).toBe('var(--sf-font-mono)');
    expect(v['--sf-btn-tracking-md']).toBe('0.2em');
  });
  it('has a box input variant behind the root attribute', () => {
    expect(css).toMatch(/:root\[data-sf-input="box"\] \.sf-input\s*\{/);
  });
});
```

Change the existing `'gives buttons the mono voice and press feedback'` test's first expectation to the `var(--sf-btn-*)` regex above (keep the two `:active` expectations). Change the cards test's shadow assertion to `expect(block).toMatch(/box-shadow: var\(--sf-card-shadow\)/)` and its radius to `expect(block).toContain('border-radius: var(--sf-card-radius)')`.

Create `web/test/templates-parts.test.ts`:

```ts
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { tokenVariables } from '@/templates/tokens.ts';
import { BASE_TOKENS } from '@/templates/define.ts';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(path.resolve(testDir, p), 'utf8');

describe('global.css boot defaults', () => {
  it('declares every modern token on :root so the skeleton paints like modern', () => {
    const globalCss = read('../src/styles/global.css');
    for (const [k, v] of Object.entries(tokenVariables(BASE_TOKENS))) expect(globalCss, k).toContain(`${k}:${v};`);
  });
});

describe('chassis', () => {
  it('drops the gradients only under data-sf-chassis="flat"', () => {
    expect(read('../src/styles/chassis.css')).toMatch(/:root:not\(\[data-sf-chassis="flat"\]\) body\s*\{[^}]*radial-gradient/s);
  });
  it('turns frosted chrome solid under data-sf-glass="off"', () => {
    const css = read('../src/styles/chassis.css');
    expect(css).toMatch(/:root\[data-sf-glass="off"\] \.glass,\s*:root\[data-sf-glass="off"\] \.glass-soft\s*\{[^}]*background: var\(--sf-bg\);[^}]*backdrop-filter: none;/s);
    expect(css).toMatch(/:root\[data-sf-glass="off"\] \.mantine-Overlay-root\s*\{[^}]*backdrop-filter: none;/s);
    // the modern (glass on) rules are untouched
    expect(css).toMatch(/\.glass\s*\{[^}]*backdrop-filter: blur\(12px\)/s);
  });
});

describe('shared button fills', () => {
  const css = read('../src/styles/mantine.css');
  const FILLED = '[data-sf-part="button"][data-variant="filled"]';
  const block = (sel: string) => {
    const i = css.indexOf(`${sel} {`);
    return i < 0 ? null : css.slice(i, css.indexOf('}', i));
  };
  it('outline-glow repaints every filled button, custom ones included', () => {
    const b = block(`:root[data-sf-btn-fill="outline-glow"] ${FILLED}`);
    expect(b).not.toBeNull();
    expect(b).toContain('background: var(--sf-bg);');
    expect(b).toContain('color: var(--sf-primary);');
    expect(b).toContain('border: 1px solid var(--sf-primary);');
  });
  it('ghost repaints every filled button', () => {
    const b = block(`:root[data-sf-btn-fill="ghost"] ${FILLED}`);
    expect(b).toContain('background: transparent;');
    expect(b).toContain('color: var(--sf-primary);');
    expect(b).toContain('border: 1px solid var(--sf-line-strong);');
  });
  it('has hover and disabled states, and no rule for solid (modern stays pixel-identical)', () => {
    expect(css).toMatch(/:root\[data-sf-btn-fill="outline-glow"\] \[data-sf-part="button"\]\[data-variant="filled"\]:hover:not\(:disabled\):not\(\[data-disabled\]\)/);
    expect(css).toMatch(/:root\[data-sf-btn-fill="ghost"\] \[data-sf-part="button"\]\[data-variant="filled"\]:is\(:disabled, \[data-disabled\]\)/);
    expect(css).not.toContain('data-sf-btn-fill="solid"');
  });
});

describe('parts', () => {
  it.each([
    ['../src/layouts/StorefrontShell.tsx', ['data-sf-part="header"', 'data-sf-part="main"', 'data-sf-part="badge"']],
    ['../src/layouts/MenuShell.tsx', ['data-sf-part="header"', 'data-sf-part="main"', 'data-sf-part="badge"']],
    ['../src/layouts/Chromeless.tsx', ['data-sf-part="header"', 'data-sf-part="main"']],
    ['../src/features/catalog/ProductCard.tsx', ['data-sf-part="product-card"', 'data-sf-part="price"']],
    ['../src/features/catalog/ProductRow.tsx', ['data-sf-part="product-row"', 'data-sf-part="price"']],
    ['../src/features/catalog/ProductDetailPage.tsx', ['data-sf-part="page-title"', 'data-sf-part="price"']],
    ['../src/features/catalog/ProductDetailSheet.tsx', ['data-sf-part="price"']],
    ['../src/features/catalog/ProductGrid.tsx', ['data-sf-part="page-title"']],
    ['../src/features/catalog/ProductList.tsx', ['data-sf-part="page-title"', 'data-sf-part="group-title"']],
    ['../src/features/wholesale/WholesaleCatalogPage.tsx', ['data-sf-part="page-title"']],
    ['../src/features/catalog/AddToCart.tsx', ['data-sf-part="button"', 'data-variant="filled"']],
    ['../src/features/cart/CartSummary.tsx', ['data-sf-part="button"', 'data-sf-cta="main"']],
    ['../src/features/cart/MobileCartBar.tsx', ['data-sf-part="cart-bar"', 'data-sf-part="button"', 'data-sf-cta="main"']],
    ['../src/features/checkout/CheckoutPage.tsx', ['data-sf-cta="main"', 'data-sf-part="button"', 'data-variant="filled"', 'data-variant="default"', 'data-sf-part="stepper"']],
    ['../src/features/checkout/Field.tsx', ['data-sf-part="input"']],
    ['../src/features/catalog/StockChip.tsx', ['data-sf-part="badge"']],
    ['../src/features/account/StatusPill.tsx', ['data-sf-part="badge"']],
    ['../src/components/Sheet.tsx', ['data-sf-part={part}', "part = 'sheet'"]],
    ['../src/features/cart/CartDrawer.tsx', ['part="drawer"']],
    ['../src/features/notices/NoticeBanners.tsx', ['data-sf-part="notice"']],
    ['../src/features/notices/CutoffBar.tsx', ['data-sf-part="cutoff"']],
    ['../src/features/tracking/ProgressStepper.tsx', ['data-sf-part="stepper"']],
  ])('%s carries its parts', (file, parts) => {
    const src = read(file);
    for (const part of parts) expect(src, part).toContain(part);
  });

  const count = (src: string, needle: string) => src.split(needle).length - 1;

  it.each<[string, number]>([
    ['../src/features/auth/AuthCard.tsx', 1],
    ['../src/features/order-status/AddressCard.tsx', 1],
    ['../src/features/order-status/CryptoPaymentCard.tsx', 1],
    ['../src/features/order-status/ItemsCard.tsx', 1],
    ['../src/features/order-status/PaymentSection.tsx', 4],
    ['../src/features/order-status/ShipmentCard.tsx', 1],
    ['../src/features/tracking/ParcelCard.tsx', 1],
    ['../src/features/checkout/CheckoutPage.tsx', 1],
  ])('%s tags exactly its %i card root(s) — eleven in all', (file, n) => {
    expect(count(read(file), 'data-sf-part="card"')).toBe(n);
  });

  it('tags every checkout text field (input, select, textarea)', () => {
    expect(count(read('../src/features/checkout/Field.tsx'), 'data-sf-part="input"')).toBe(3);
  });

  it('tags both checkout nav buttons and both main-CTA branches', () => {
    const src = read('../src/features/checkout/CheckoutPage.tsx');
    expect(count(src, 'data-sf-cta="main"')).toBe(2);          // Place order + Continue
    expect(count(src, 'data-sf-part="button"')).toBe(3);        // .back + the two .next buttons
  });
});

describe('custom button radius', () => {
  const block = (css: string, sel: string) => css.match(new RegExp(`\\${sel}\\s*\\{[^}]*\\}`, 's'))?.[0] ?? '';
  it.each([
    ['../src/features/catalog/AddToCart.module.css', '.button'],
    ['../src/features/cart/CartSummary.module.css', '.checkout'],
    ['../src/features/cart/MobileCartBar.module.css', '.checkout'],
    ['../src/features/checkout/CheckoutPage.module.css', '.next'],
    ['../src/features/checkout/CheckoutPage.module.css', '.back'],
  ])('%s %s follows the button radius token, not the card one', (file, sel) => {
    const b = block(read(file), sel);
    expect(b).toContain('border-radius: var(--sf-btn-radius)');
    expect(b).not.toContain('--sf-card-radius');
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm run test:web -- vocabulary templates-parts` → FAIL.

- [ ] **Step 3: Boot defaults in `global.css`**

Append to the existing single `:root { … }` rule (before its closing `}`), exactly:

```
--sf-btn-radius:var(--mantine-radius-default); --sf-btn-transform:uppercase; --sf-btn-weight:600; --sf-btn-font:var(--sf-font-mono); --sf-btn-tracking-sm:0.18em; --sf-btn-tracking-md:0.2em; --sf-btn-tracking-lg:0.22em; --sf-card-radius:var(--mantine-radius-default); --sf-card-border:1px solid var(--sf-line); --sf-card-shadow:none; --sf-card-shadow-hover:none; --sf-pill-radius:999px; --sf-heading-weight:600; --sf-heading-tracking:normal; --sf-heading-transform:none;
```

(no space after the colon — the test looks for `${k}:${v};`).

- [ ] **Step 4: `mantine.css` and `chassis.css`**

In `mantine.css` `.sf-button`: `font-family: var(--sf-btn-font);`, `text-transform: var(--sf-btn-transform);`, `font-weight: var(--sf-btn-weight);`, `letter-spacing: var(--sf-btn-tracking-md);`. The size rules become `letter-spacing: var(--sf-btn-tracking-sm);` and `letter-spacing: var(--sf-btn-tracking-lg);`. Append:

```css
/* The boxed input a template can ask for (tokens.input.style = 'box'). Modern keeps the underline. */
:root[data-sf-input="box"] .sf-input {
  border: 1px solid var(--sf-line-strong);
  border-radius: var(--sf-card-radius);
  background: color-mix(in srgb, var(--sf-surface) 40%, transparent);
}
:root[data-sf-input="box"] :not([data-with-left-section]) > .sf-input { padding-inline-start: 0.75rem; }
:root[data-sf-input="box"] :not([data-with-right-section]) > .sf-input { padding-inline-end: 0.75rem; }
:root[data-sf-input="box"] .sf-input:focus, :root[data-sf-input="box"] .sf-input:focus-within { border-color: var(--sf-primary); }

/* Shared fill recipes (tokens.button.fill) for every filled button — Mantine Buttons and the
   custom module buttons (AddToCart, CartSummary checkout, MobileCartBar checkout, CheckoutPage .next), which
   carry data-sf-part="button" data-variant="filled". Mirrors buttonVariantVars in theme-bridge.ts.
   'solid' has no rule: the modules' own accent fill is the modern look. Templates add only what
   is theirs (a glow, a pulse) with an equally specific rule that loads later. */
:root[data-sf-btn-fill="outline-glow"] [data-sf-part="button"][data-variant="filled"] {
  background: var(--sf-bg);
  color: var(--sf-primary);
  border: 1px solid var(--sf-primary);
}
:root[data-sf-btn-fill="ghost"] [data-sf-part="button"][data-variant="filled"] {
  background: transparent;
  color: var(--sf-primary);
  border: 1px solid var(--sf-line-strong);
}
:root[data-sf-btn-fill="outline-glow"] [data-sf-part="button"][data-variant="filled"]:hover:not(:disabled):not([data-disabled]),
:root[data-sf-btn-fill="ghost"] [data-sf-part="button"][data-variant="filled"]:hover:not(:disabled):not([data-disabled]) {
  background: var(--sf-surface);
  color: var(--sf-primary);
}
:root[data-sf-btn-fill="outline-glow"] [data-sf-part="button"][data-variant="filled"]:is(:disabled, [data-disabled]),
:root[data-sf-btn-fill="ghost"] [data-sf-part="button"][data-variant="filled"]:is(:disabled, [data-disabled]) {
  background: transparent;
  color: var(--sf-faint);
  border-color: var(--sf-line);
}
```

In `checkout/Fields.module.css` append the same box variant for `.input`, written with `:global(:root[data-sf-input="box"]) .input { … }` selectors.

In `chassis.css` split the body rule:

```css
body {
  min-height: 100dvh;
  background-color: var(--sf-bg);
}
/* The two-layer ground — a glow at the top, a vignette at the foot. A template with
   chassis 'flat' paints its own ground (or none). */
:root:not([data-sf-chassis="flat"]) body {
  background-image:
    radial-gradient(ellipse 80% 60% at 50% 0%, color-mix(in srgb, var(--sf-surface-3) 35%, transparent), transparent 65%),
    radial-gradient(ellipse 60% 40% at 50% 100%, color-mix(in srgb, var(--sf-bg-deep) 50%, transparent), transparent 70%);
  background-attachment: fixed;
}
```

Then append to the end of `chassis.css` (after the existing `.glass` / `.glass-soft` rules, which stay as they are):

```css
/* tokens.glass = 'off': frosted chrome turns solid. Covers the sticky bars (.glass/.glass-soft,
   composed into module classes) and Mantine's modal/drawer overlay. */
:root[data-sf-glass="off"] .glass,
:root[data-sf-glass="off"] .glass-soft {
  background: var(--sf-bg);
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
:root[data-sf-glass="off"] .mantine-Overlay-root {
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
```

The `:root[data-sf-glass="off"] .glass` selectors (0,3,0) outrank the plain `.glass` rule (0,1,0) regardless of order; Mantine's overlay sets its blur through a variable consumed by a single-class rule, so the (0,3,0) `backdrop-filter: none` wins there too.

- [ ] **Step 5: Module refactor (mechanical; every substitution is value-identical in modern)**

Run `grep -rnE "var\(--mantine-radius-default\)|border-radius: 999px" web/src --include=*.module.css` (36 files today; they are the CSS modules in the Step 8 `git add` list) and apply:
1. **Buttons:** `var(--mantine-radius-default)` → `var(--sf-btn-radius)` in the five custom buttons: `features/catalog/AddToCart.module.css` `.button`, `features/cart/CartSummary.module.css` `.checkout`, `features/cart/MobileCartBar.module.css` `.checkout`, `features/checkout/CheckoutPage.module.css` `.next` and `.back`.
2. Every other `var(--mantine-radius-default)` inside a `border-radius` declaration in a `*.module.css` → `var(--sf-card-radius)` (including the partial forms like `0 var(--mantine-radius-default) var(--mantine-radius-default) 0`).
3. `border-radius: 999px` → `border-radius: var(--sf-pill-radius)` everywhere **except** the grab-handle rule in `components/Sheet.module.css` (`.handle`, L19).
4. Leave literal `0`, `2px` and `16px 16px 0 0` radii alone.

Cards: in the `.card { … }` blocks of `features/order-status/OrderStatus.module.css`, `features/tracking/Tracking.module.css` and `features/auth/AuthCard.module.css`, replace `border: 1px solid var(--sf-line);` (only that exact declaration) with `border: var(--sf-card-border);` and add `box-shadow: var(--sf-card-shadow);`. `features/catalog/ProductCard.module.css` `.card` has no border (it is a layout wrapper). Add only `box-shadow: var(--sf-card-shadow);` to it, plus a new rule `.card:hover { box-shadow: var(--sf-card-shadow-hover); }`. `features/checkout/CheckoutPage.module.css` `.card` keeps its `var(--sf-line-strong)` border (not the card recipe) but gains `box-shadow: var(--sf-card-shadow);`.

Headings — tokens apply **only where modern's value already equals the token** (weight 600, tracking `normal`, transform `none`):
- `features/catalog/ProductGrid.module.css` `.title` (weight 600, no letter-spacing, no transform): `font-weight: 600;` → `font-weight: var(--sf-heading-weight);` and add `letter-spacing: var(--sf-heading-tracking); text-transform: var(--sf-heading-transform);`.
- `features/catalog/ProductDetailPage.module.css` `.name` (the product `<h1>`; weight 600, `letter-spacing: -0.01em`): `font-weight: 600;` → `font-weight: var(--sf-heading-weight);` only; its letter-spacing stays literal.
- `features/catalog/ProductList.module.css` `.title` (700, `-0.02em`) and `features/wholesale/WholesaleCatalogPage.module.css` `.title` (700, `-0.01em`): **no change.** They keep their literals, so modern stays pixel-identical. Templates reach them through `[data-sf-part="page-title"]` / `[data-sf-part="group-title"]` (see the Contract reference's heading-token note; Task 14 documents it).

- [ ] **Step 6: Attach parts**

Add the attributes exactly as listed below; each line is a file and element. Every one is an attribute-only change.

- Shells: `data-sf-part="header"` on the `<header>` and `data-sf-part="main"` on the `<main>` in `layouts/StorefrontShell.tsx` (L32, L70), `layouts/MenuShell.tsx` (L44, L92) and `layouts/Chromeless.tsx` (L11, L14). `data-sf-part="badge"` on the cart-count `<span className={classes.count}>` in StorefrontShell (L60) and MenuShell (L82).
- Catalogue: `data-sf-part="product-card"` on the `ProductCard` `<article>`; `data-sf-part="product-row"` on the `ProductRow` root; `data-sf-part="price"` on the main price element in `ProductCard.tsx`, `ProductRow.tsx`, `ProductDetailPage.tsx`, `ProductDetailSheet.tsx`; `data-sf-part="page-title"` on the `<h1>` in `ProductGrid.tsx` (L89), `ProductList.tsx` (L85), `WholesaleCatalogPage.tsx` (L109) and `ProductDetailPage.tsx` (L92); `data-sf-part="group-title"` on the group `<h2>` in `ProductList.tsx` (L141); `data-sf-part="badge"` on the `StockChip` root `<span>` and the `features/account/StatusPill.tsx` root `<span>`.
- Buttons (five custom ones):
  - `features/catalog/AddToCart.tsx` `<button>`: `data-sf-part="button" data-variant="filled"`.
  - `features/cart/CartSummary.tsx`, the disabled checkout `<button>` and the checkout `<Link>`: `data-sf-part="button" data-variant="filled" data-sf-cta="main"`.
  - `features/cart/MobileCartBar.tsx`: `data-sf-part="cart-bar"` on the root `<div className={classes.bar}>`, and `data-sf-part="button" data-variant="filled" data-sf-cta="main"` on the disabled checkout `<button>` and the checkout `<Link>`.
  - `features/checkout/CheckoutPage.tsx`: `data-sf-part="button" data-variant="default"` on the `.back` `<button>`. `data-sf-part="button" data-variant="filled" data-sf-cta="main"` on **both** `.next` `<button>`s (Place order, Continue).
- Cards: `data-sf-part="card"` on exactly these eleven roots:
  - `features/auth/AuthCard.tsx` `<section>` (L21)
  - `features/order-status/AddressCard.tsx` `<section>` (L17)
  - `features/order-status/CryptoPaymentCard.tsx` root (L81)
  - `features/order-status/ItemsCard.tsx` `<section>` (L19)
  - `features/order-status/PaymentSection.tsx` at L57, L65, L88 and L144
  - `features/order-status/ShipmentCard.tsx` `<section>` (L31)
  - `features/tracking/ParcelCard.tsx` root (L42)
  - `features/checkout/CheckoutPage.tsx` step card `<div>` (L600)

  (Line numbers are pre-change; match on the `classes.card` className.)
- Inputs: `data-sf-part="input"` on the three `classes.input` elements in `features/checkout/Field.tsx` (L48 input, L106 select, L160 textarea). Mantine `Input`s are already tagged by the theme default prop (Task 4).
- Sheet / drawer: `components/Sheet.tsx` gains an optional prop `part?: 'sheet' | 'drawer'` (destructured as `part = 'sheet'`), rendered as `data-sf-part={part}` on `<Drawer.Content>` (L52). `features/cart/CartDrawer.tsx` passes `part="drawer"` to its `<Sheet>`.
- Notices / cutoff / stepper: `data-sf-part="notice"` on each notice root `<div>` in `features/notices/NoticeBanners.tsx` (L58); `data-sf-part="cutoff"` on the `CutoffBar` root `<section>`; `data-sf-part="stepper"` on the `features/tracking/ProgressStepper.tsx` root `<div className={classes.stepper}>` (L32) **and** on the checkout Mantine `<Stepper>` in `CheckoutPage.tsx` (~L578; Mantine forwards `data-*` to the root).

- [ ] **Step 7: Verify pixels and tests**

Run: `npm run test:web` → PASS. Run: `npm run typecheck` → clean. Run: `npm run test:e2e -- templates-baseline.spec.ts` → 4 passed, **unchanged snapshots**. If any shot differs, the refactor changed a value — find and fix it.

- [ ] **Step 8: Commit**

```bash
git add web/src/styles/global.css web/src/styles/mantine.css web/src/styles/chassis.css \
  web/src/components/ContactLinks.module.css web/src/components/PageSkeleton.module.css web/src/components/Sheet.module.css web/src/components/Sheet.tsx \
  web/src/features/account/Account.module.css web/src/features/account/StatusPill.tsx \
  web/src/features/auth/AuthCard.module.css web/src/features/auth/AuthCard.tsx web/src/features/auth/WhatsappLogin.module.css \
  web/src/features/cart/CartDrawer.module.css web/src/features/cart/CartDrawer.tsx web/src/features/cart/CartLine.module.css web/src/features/cart/CartPage.module.css \
  web/src/features/cart/CartSummary.module.css web/src/features/cart/CartSummary.tsx web/src/features/cart/MobileCartBar.module.css web/src/features/cart/MobileCartBar.tsx \
  web/src/features/catalog/AddToCart.module.css web/src/features/catalog/AddToCart.tsx web/src/features/catalog/CategoryNav.module.css web/src/features/catalog/FilterSheet.module.css \
  web/src/features/catalog/ProductCard.module.css web/src/features/catalog/ProductCard.tsx web/src/features/catalog/ProductDetailPage.module.css web/src/features/catalog/ProductDetailPage.tsx \
  web/src/features/catalog/ProductDetailSheet.module.css web/src/features/catalog/ProductDetailSheet.tsx web/src/features/catalog/ProductGrid.module.css web/src/features/catalog/ProductGrid.tsx \
  web/src/features/catalog/ProductImage.module.css web/src/features/catalog/ProductList.tsx web/src/features/catalog/ProductRow.module.css web/src/features/catalog/ProductRow.tsx \
  web/src/features/catalog/StockChip.module.css web/src/features/catalog/StockChip.tsx \
  web/src/features/checkout/CheckoutPage.module.css web/src/features/checkout/CheckoutPage.tsx web/src/features/checkout/CouponField.module.css web/src/features/checkout/Field.tsx \
  web/src/features/checkout/Fields.module.css web/src/features/checkout/QuoteSummary.module.css web/src/features/checkout/steps/Steps.module.css \
  web/src/features/notices/CutoffBar.tsx web/src/features/notices/NoticeBanners.tsx \
  web/src/features/order-status/OrderStatus.module.css web/src/features/order-status/AddressCard.tsx web/src/features/order-status/CryptoPaymentCard.tsx \
  web/src/features/order-status/ItemsCard.tsx web/src/features/order-status/PaymentSection.tsx web/src/features/order-status/ShipmentCard.tsx \
  web/src/features/payment-redirect/PaymentRedirect.module.css web/src/features/tracking/Tracking.module.css web/src/features/tracking/ParcelCard.tsx web/src/features/tracking/ProgressStepper.tsx \
  web/src/features/verify/VerifyPage.module.css web/src/features/wholesale/WholesaleBar.module.css web/src/features/wholesale/WholesaleRow.module.css web/src/features/wholesale/WholesaleCatalogPage.tsx \
  web/src/layouts/MenuShell.module.css web/src/layouts/StorefrontShell.module.css web/src/layouts/StorefrontShell.tsx web/src/layouts/MenuShell.tsx web/src/layouts/Chromeless.tsx \
  web/test/vocabulary.test.ts web/test/templates-parts.test.ts
git status --short web   # must show nothing left modified or untracked under web/
git commit -m "refactor(web): read the modern look from template tokens and tag parts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

If `git status --short web` still lists a file, the step touched something outside this list. Add it explicitly by path (never by directory) and mention it in the commit body.

---

### Task 8: Live preview listener

**Files:**
- Create: `web/src/app/preview-listener.ts`, `web/src/app/document-theme.ts`
- Modify: `web/src/app/App.tsx` (`ThemedApp`)
- Test: `web/test/preview-listener.test.ts`, `web/test/document-theme.test.tsx`

**Interfaces:**
- Consumes: `previewMessageSchema`, `Theme`, `applyDocumentTheme(…, { persist })`.
- Produces: `PREVIEW_PARAM = 'sf-preview'`, `isPreviewMode(win?)`, `subscribePreview(onTheme, win?)`, `usePreviewTheme(win?): Theme | null`, `useDocumentTheme(settings, win?): ResolvedTheme`. Protocol for Plan 4: storefront posts `{ type: 'sf-preview-ready' }` to `window.parent` (target `'*'`, no data); admin posts `{ type: 'sf-preview-theme', theme }` to the iframe.

- [ ] **Step 1: Write failing tests**

`web/test/preview-listener.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { isPreviewMode, subscribePreview } from '@/app/preview-listener.ts';

const theme = {
  template: 'modern', preset: 'default', options: {},
  scheme: 'dark', colors: { primary: '#ffffff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' },
  fonts: { heading: null, body: null, mono: null }, radius: 'none', density: 'comfortable', customCss: 'body{background:url(https://evil/x)}',
};

function fakeWindow(search: string, framed = true) {
  const listeners: Array<(e: MessageEvent) => void> = [];
  const parent = { postMessage: vi.fn() };
  const win = {
    location: { search },
    parent: framed ? parent : undefined,
    addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.splice(listeners.indexOf(fn), 1),
  } as unknown as Window & { parent: typeof parent };
  if (!framed) (win as unknown as { parent: unknown }).parent = win;
  const send = (data: unknown, source: unknown = parent) => listeners.forEach((fn) => fn({ data, source } as MessageEvent));
  return { win, parent, send, listeners };
}

describe('preview listener', () => {
  it('is active only with ?sf-preview=1 inside a frame', () => {
    expect(isPreviewMode(fakeWindow('?sf-preview=1').win)).toBe(true);
    expect(isPreviewMode(fakeWindow('?sf-preview=1', false).win)).toBe(false);
    expect(isPreviewMode(fakeWindow('').win)).toBe(false);
  });
  it('announces readiness and forwards valid themes with customCss dropped', () => {
    const { win, parent, send } = fakeWindow('?sf-preview=1');
    const onTheme = vi.fn();
    subscribePreview(onTheme, win);
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'sf-preview-ready' }, '*');
    send({ type: 'sf-preview-theme', theme });
    expect(onTheme).toHaveBeenCalledTimes(1);
    expect(onTheme.mock.calls[0]![0].customCss).toBe('');
    expect(onTheme.mock.calls[0]![0].colors.bg).toBe('#0f3965');
  });
  it('ignores malformed messages and messages not from the parent', () => {
    const { win, send } = fakeWindow('?sf-preview=1');
    const onTheme = vi.fn();
    subscribePreview(onTheme, win);
    send({ type: 'sf-preview-theme', theme: { ...theme, colors: { bg: 'red' } } });
    send({ type: 'other', theme });
    send('string');
    send({ type: 'sf-preview-theme', theme }, { not: 'parent' });
    expect(onTheme).not.toHaveBeenCalled();
  });
  it('does nothing outside preview mode and unsubscribes cleanly', () => {
    const outside = fakeWindow('');
    const off = subscribePreview(vi.fn(), outside.win);
    expect(outside.listeners).toHaveLength(0);
    off();
    const inside = fakeWindow('?sf-preview=1');
    const off2 = subscribePreview(vi.fn(), inside.win);
    expect(inside.listeners).toHaveLength(1);
    off2();
    expect(inside.listeners).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm run test:web -- preview-listener` → FAIL.

- [ ] **Step 3: Implement**

`web/src/app/preview-listener.ts`:

```ts
import { useEffect, useState } from 'react';
import { previewMessageSchema } from '@/templates/theme-schema.ts';
import type { Theme } from '@/types/settings.ts';

export const PREVIEW_PARAM = 'sf-preview';

/** The admin's Appearance preview frames the live storefront at /?sf-preview=1. */
export function isPreviewMode(win: Window = window): boolean {
  try {
    return new URLSearchParams(win.location.search).get(PREVIEW_PARAM) === '1' && win.parent !== win;
  } catch {
    return false;
  }
}

/**
 * Accepts draft themes from the framing admin. Only messages from window.parent, only the
 * exact zod shape, and never the draft custom CSS: arbitrary CSS in a frameable page could
 * exfiltrate typed input through attribute selectors. The saved (backend-sanitised) custom
 * CSS keeps applying.
 */
export function subscribePreview(onTheme: (theme: Theme) => void, win: Window = window): () => void {
  if (!isPreviewMode(win)) return () => undefined;
  const handler = (event: MessageEvent) => {
    if (event.source !== win.parent) return;
    const parsed = previewMessageSchema.safeParse(event.data);
    if (!parsed.success) return;
    onTheme({ ...parsed.data.theme, customCss: '' } as Theme);
  };
  win.addEventListener('message', handler);
  win.parent.postMessage({ type: 'sf-preview-ready' }, '*');
  return () => win.removeEventListener('message', handler);
}

export function usePreviewTheme(win: Window = window): Theme | null {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => subscribePreview(setTheme, win), [win]);
  return theme;
}
```

- [ ] **Step 4: One hook for the document theme — write its failing wiring test**

`ThemedApp`'s theming (preview override → resolve → paint, never persisting in a preview frame) moves into one hook, so the wiring can be tested without mounting the router.

`web/test/document-theme.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDocumentTheme } from '@/app/document-theme.ts';
import { THEME_STORAGE_KEY } from '@/app/theme-bridge.ts';
import type { StorefrontSettings, Theme } from '@/types/settings.ts';

const stored: Theme = {
  template: 'modern', preset: 'default', options: {},
  scheme: 'dark', colors: { primary: '#ffffff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' },
  fonts: { heading: null, body: null, mono: null }, radius: 'none', density: 'comfortable', customCss: '.saved{}',
};
const settings = {
  theme: stored,
  brand: { name: 'Acme', shortName: 'Acme', tagline: '', title: 'Acme', description: '', logoUrl: null, faviconUrl: null, logoHeight: 28, links: { whatsapp: null, telegram: null } },
} as unknown as StorefrontSettings;

function framedWindow(search: string) {
  const listeners: Array<(e: MessageEvent) => void> = [];
  const parent = { postMessage: vi.fn() };
  const win = {
    location: { search },
    parent,
    addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.splice(listeners.indexOf(fn), 1),
  } as unknown as Window;
  const send = (data: unknown) => listeners.forEach((fn) => fn({ data, source: parent } as MessageEvent));
  return { win, send };
}

afterEach(() => { localStorage.clear(); document.documentElement.removeAttribute('style'); });

describe('useDocumentTheme', () => {
  it('outside a preview frame: paints the stored theme and persists it', () => {
    const { result } = renderHook(() => useDocumentTheme(settings, framedWindow('').win));
    expect(result.current.colors.bg).toBe('#0f3965');
    expect(JSON.parse(localStorage.getItem(THEME_STORAGE_KEY)!).vars['--sf-bg']).toBe('#0f3965');
  });

  it('in a preview frame: the draft overrides the stored theme, keeps the saved customCss, and writes nothing', () => {
    const { win, send } = framedWindow('?sf-preview=1');
    const { result } = renderHook(() => useDocumentTheme(settings, win));
    act(() => send({ type: 'sf-preview-theme', theme: { ...stored, colors: { ...stored.colors, bg: '#101010' }, customCss: 'body{display:none}' } }));
    expect(result.current.colors.bg).toBe('#101010');
    expect(result.current.customCss).toBe('.saved{}');
    expect(document.documentElement.style.getPropertyValue('--sf-bg')).toBe('#101010');
    expect(document.getElementById('sf-custom-css')?.textContent).toBe('.saved{}');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
});
```

Run: `npm run test:web -- document-theme` → FAIL (module missing).

- [ ] **Step 5: Implement `useDocumentTheme` and wire it into `ThemedApp`**

`web/src/app/document-theme.ts`:

```ts
import { useEffect, useMemo } from 'react';
import { applyDocumentTheme } from '@/app/theme-bridge.ts';
import { isPreviewMode, usePreviewTheme } from '@/app/preview-listener.ts';
import { lookupManifest } from '@/templates/registry.ts';
import { resolveTheme, type ResolvedTheme } from '@/templates/resolve.ts';
import type { StorefrontSettings } from '@/types/settings.ts';

/**
 * The theme the page shows: the admin's draft inside a preview frame (with the SAVED custom
 * CSS — draft CSS is never applied), otherwise the stored theme. Paints the document and, outside a
 * preview frame only, persists the first-paint payload.
 */
export function useDocumentTheme(settings: StorefrontSettings, win: Window = window): ResolvedTheme {
  const { brand } = settings;
  const preview = usePreviewTheme(win);
  const theme = preview ? { ...preview, customCss: settings.theme.customCss } : settings.theme;
  const themeKey = JSON.stringify({ theme, brand });
  const resolved = useMemo(() => resolveTheme(theme, lookupManifest), [themeKey]);
  useEffect(() => {
    // A preview frame must never overwrite the real visitor payload.
    applyDocumentTheme(resolved, brand, { persist: !isPreviewMode(win) });
  }, [themeKey]);
  return resolved;
}
```

`ThemedApp` in `web/src/app/App.tsx` becomes:

```tsx
function ThemedApp({ settings }: { settings: StorefrontSettings }) {
  const resolved = useDocumentTheme(settings);
  const mantineTheme = useMemo(() => buildMantineTheme(resolved), [resolved]);
  // ...JSX from Task 6 unchanged (MantineProvider forceColorScheme={resolved.scheme} → TemplateProvider → …)
}
```

with `import { useDocumentTheme } from '@/app/document-theme.ts';`. Then remove the now-unused imports: `applyDocumentTheme`, `resolveTheme`, `lookupManifest`, and `useEffect` if nothing else uses it (`useBootCart` still does, so keep `useEffect`).

- [ ] **Step 6: Verify**

Run: `npm run test:web` → PASS (including `preview-listener` and `document-theme`). `npm run typecheck` → clean. `npm run test:e2e -- templates-baseline.spec.ts storefront.spec.ts` → pass.

- [ ] **Step 7: Commit**

```bash
git add web/src/app/preview-listener.ts web/src/app/document-theme.ts web/src/app/App.tsx web/test/preview-listener.test.ts web/test/document-theme.test.tsx
git commit -m "feat(templates): live preview channel for the admin Appearance editor

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `templates.json` catalog (Vite plugin)

**Files:**
- Create: `web/src/templates/catalog.ts`
- Create: `web/vite-plugins/templates-catalog.ts`
- Modify: `web/vite.config.ts`, `web/tsconfig.node.json`
- Test: `web/test/templates-catalog.test.ts`

**Interfaces:**
- Consumes: `allTemplates`, `collectManifestErrors`, `MANIFEST_MODULES`, `TemplateEntry`.
- Produces — **the shape Plans 1 and 4 consume**:
  ```ts
  interface CatalogTemplate {
    id: string; name: string; version: string; description: string; author: string;
    schemes: Scheme[]; presets: TemplatePreset[]; defaultPreset: string;
    editable: TemplateEditable; options: TemplateOption[];
    preview: string | null;   // '/templates/<id>/preview.<ext>' — relative to the storefront origin
    builtIn: boolean;
  }
  interface TemplatesCatalog { schemaVersion: 1; templates: CatalogTemplate[] }   // modern first, then built-ins by name, then imports by name
  ```
  Admin copies a preset into the stored theme as `fonts.heading = preset.fonts.heading?.family ?? null` (and body/mono).
  `toCatalog(entries)`, `buildCatalog(): { json: TemplatesCatalog; previews: { id; sourceRel; target }[]; errors: string[] }`; plugin `templatesCatalog()`.

- [ ] **Step 1: Write failing tests**

`web/test/templates-catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildCatalog, toCatalog } from '@/templates/catalog.ts';
import { defineTemplate } from '@/templates/define.ts';
import modern from '@/templates/modern/manifest.ts';
import type { TemplateEntry } from '@/templates/registry.ts';

const entry = (id: string, name: string, builtIn: boolean, preview?: string): TemplateEntry => ({
  manifest: defineTemplate({ ...modern, id, name, ...(preview ? { preview } : {}) }),
  builtIn, dir: builtIn ? id : `external/${id}`, load: () => Promise.resolve({}),
});

describe('templates catalog', () => {
  it('orders modern, built-ins by name, then imports by name, and maps previews', () => {
    const { json, previews } = toCatalog([entry('zeta', 'Zeta', false), entry('beta', 'Beta', true, './preview.png'), entry('modern', 'Modern', true), entry('alpha', 'Alpha', false, './preview.webp')]);
    expect(json.schemaVersion).toBe(1);
    expect(json.templates.map((t) => t.id)).toEqual(['modern', 'beta', 'alpha', 'zeta']);
    expect(json.templates.find((t) => t.id === 'beta')!.preview).toBe('/templates/beta/preview.png');
    expect(json.templates.find((t) => t.id === 'zeta')!.preview).toBeNull();
    expect(json.templates.find((t) => t.id === 'alpha')!.builtIn).toBe(false);
    expect(previews).toEqual([
      { id: 'beta', sourceRel: 'beta/preview.png', target: 'templates/beta/preview.png' },
      { id: 'alpha', sourceRel: 'external/alpha/preview.webp', target: 'templates/alpha/preview.webp' },
    ]);
  });
  it('never leaks tokens or code into the catalog', () => {
    const t = toCatalog([entry('modern', 'Modern', true)]).json.templates[0]!;
    expect(Object.keys(t).sort()).toEqual(['author', 'builtIn', 'defaultPreset', 'description', 'editable', 'id', 'name', 'options', 'presets', 'preview', 'schemes', 'version']);
  });
  it('builds the real catalog with no errors', () => {
    const { json, errors } = buildCatalog();
    expect(errors).toEqual([]);
    expect(json.templates[0]!.id).toBe('modern');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm run test:web -- templates-catalog` → FAIL.

- [ ] **Step 3: Implement `catalog.ts`**

```ts
import type { Scheme, TemplateEditable, TemplateOption, TemplatePreset } from '@/templates/define.ts';
import { allTemplates, collectManifestErrors, DEFAULT_TEMPLATE_ID, MANIFEST_MODULES, type TemplateEntry } from '@/templates/registry.ts';

export interface CatalogTemplate {
  id: string; name: string; version: string; description: string; author: string;
  schemes: Scheme[]; presets: TemplatePreset[]; defaultPreset: string;
  editable: TemplateEditable; options: TemplateOption[];
  preview: string | null;
  builtIn: boolean;
}
export interface TemplatesCatalog { schemaVersion: 1; templates: CatalogTemplate[] }
export interface CatalogPreview { id: string; sourceRel: string; target: string }

function rank(e: TemplateEntry): number {
  return e.manifest.id === DEFAULT_TEMPLATE_ID ? 0 : e.builtIn ? 1 : 2;
}

export function toCatalog(entries: TemplateEntry[]): { json: TemplatesCatalog; previews: CatalogPreview[] } {
  const sorted = [...entries].sort((a, b) => rank(a) - rank(b) || a.manifest.name.localeCompare(b.manifest.name));
  const previews: CatalogPreview[] = [];
  const templates = sorted.map((e): CatalogTemplate => {
    const m = e.manifest;
    let preview: string | null = null;
    if (m.preview) {
      const ext = m.preview.split('.').pop()!;
      const target = `templates/${m.id}/preview.${ext}`;
      previews.push({ id: m.id, sourceRel: `${e.dir}/${m.preview.slice(2)}`, target });
      preview = `/${target}`;
    }
    return {
      id: m.id, name: m.name, version: m.version, description: m.description, author: m.author,
      schemes: m.schemes, presets: m.presets, defaultPreset: m.defaultPreset,
      editable: m.editable, options: m.options, preview, builtIn: e.builtIn,
    };
  });
  return { json: { schemaVersion: 1, templates }, previews };
}

/** Entry point for the Vite plugin (loaded through ssrLoadModule — keep this React-free). */
export function buildCatalog(): { json: TemplatesCatalog; previews: CatalogPreview[]; errors: string[] } {
  return { ...toCatalog(allTemplates()), errors: collectManifestErrors(MANIFEST_MODULES) };
}
```

- [ ] **Step 4: Implement the plugin**

`web/vite-plugins/templates-catalog.ts`:

```ts
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createServer, type Plugin, type ViteDevServer } from 'vite';

interface CatalogBuild {
  json: unknown;
  previews: Array<{ id: string; sourceRel: string; target: string }>;
  errors: string[];
}

const MIME: Record<string, string> = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

async function loadCatalog(server: ViteDevServer): Promise<CatalogBuild> {
  const mod = (await server.ssrLoadModule('/src/templates/catalog.ts')) as { buildCatalog: () => CatalogBuild };
  return mod.buildCatalog();
}

/**
 * Emits dist/templates.json (+ preview images under dist/templates/<id>/) and serves both in dev.
 * The manifests are loaded through a throwaway Vite SSR server so the build reads exactly what
 * the app bundles. Any manifest error fails the build.
 */
export function templatesCatalog(): Plugin {
  let root = '';
  let outDir = '';
  let command: 'build' | 'serve' = 'serve';
  let built: CatalogBuild | null = null;

  return {
    name: 'sf-templates-catalog',
    configResolved(config) {
      root = config.root;
      outDir = path.resolve(config.root, config.build.outDir);
      command = config.command;
    },
    async buildStart() {
      if (command !== 'build') return;
      const server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        appType: 'custom',
        resolve: { alias: { '@': path.join(root, 'src') } },
        server: { middlewareMode: true, hmr: false, watch: null },
        optimizeDeps: { noDiscovery: true, include: [] },
      });
      try {
        built = await loadCatalog(server);
      } finally {
        await server.close();
      }
      if (built.errors.length > 0) this.error(`Invalid templates:\n  ${built.errors.join('\n  ')}`);
    },
    closeBundle() {
      if (command !== 'build' || !built) return;
      writeFileSync(path.join(outDir, 'templates.json'), JSON.stringify(built.json, null, 2) + '\n');
      for (const p of built.previews) {
        const target = path.join(outDir, p.target);
        mkdirSync(path.dirname(target), { recursive: true });
        copyFileSync(path.join(root, 'src/templates', p.sourceRel), target);
      }
    },
    configureServer(server) {
      // Dev: the build fails on invalid manifests; the dev server only skips them at runtime, so
      // shout once at startup (and on every /templates.json request) instead of failing silently.
      // Vitest reuses this config — skip there, the templates-catalog test covers it.
      const reportErrors = (cat: CatalogBuild) => {
        if (cat.errors.length > 0) console.error(`[templates] invalid templates (skipped at runtime, will fail the build):\n  ${cat.errors.join('\n  ')}`);
      };
      if (!process.env.VITEST) {
        server.httpServer?.once('listening', () => {
          loadCatalog(server).then(reportErrors, (err: unknown) => console.error('[templates] could not load the template catalog', err));
        });
      }
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        try {
          if (url === '/templates.json') {
            const cat = await loadCatalog(server);
            reportErrors(cat);
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify(cat.json));
            return;
          }
          const m = /^\/templates\/([a-z0-9-]+)\/preview\.(webp|png|jpg|jpeg)$/.exec(url);
          if (m) {
            const cat = await loadCatalog(server);
            const hit = cat.previews.find((p) => p.id === m[1] && p.target.endsWith(`.${m[2]}`));
            const file = hit ? path.join(root, 'src/templates', hit.sourceRel) : null;
            if (file && existsSync(file)) {
              res.setHeader('Content-Type', MIME[m[2]!]!);
              res.end(readFileSync(file));
              return;
            }
          }
        } catch (err) {
          next(err);
          return;
        }
        next();
      });
    },
  };
}
```

- [ ] **Step 5: Register it**

`web/vite.config.ts`: `import { templatesCatalog } from './vite-plugins/templates-catalog.ts';` and `plugins: [react(), templatesCatalog()],`.
`web/tsconfig.node.json`: `"include": ["vite.config.ts", "vite-plugins"]`.

- [ ] **Step 6: Verify end to end**

Run: `npm run test:web -- templates-catalog` → PASS. Run: `npm run build` → succeeds; then `node -e "const c=JSON.parse(require('fs').readFileSync('web/dist/templates.json','utf8'));console.log(c.schemaVersion,c.templates.map(t=>t.id))"` → `1 [ 'modern' ]`.
Negative check: temporarily set `contractVersion: 2 as unknown as 1` in `modern/manifest.ts` (the double cast keeps `tsc -b` green, so the failure really comes from the plugin), run `npm --prefix web run build` → fails with `Invalid templates:`; revert.
Dev negative check: temporarily add a second built-in folder `web/src/templates/zz-broken/` with a `manifest.ts` whose `defaultPreset` is `'nope'` plus an empty `index.ts` exporting `slots = {}`. Run `npm run dev:web` → the terminal prints `[templates] invalid templates (skipped at runtime, will fail the build):` naming `zz-broken`, and the page still loads. Delete the folder.
Dev check: `npm run dev:web`, then `curl -s http://localhost:5173/templates.json` → the same JSON.

- [ ] **Step 7: Commit**

```bash
git add web/src/templates/catalog.ts web/vite-plugins/templates-catalog.ts web/vite.config.ts web/tsconfig.node.json web/test/templates-catalog.test.ts
git commit -m "feat(templates): emit and serve templates.json, fail the build on bad manifests

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Build-time template import (lock, fetch, import restriction)

**Files:**
- Create: `templates.lock.json`
- Create: `scripts/template-rules.mjs`, `scripts/template-rules.d.mts`, `scripts/templates-lock.mjs`, `scripts/template-imports.mjs`, `scripts/template-imports.d.mts`, `scripts/fetch-templates.mjs`
- Test: `scripts/fetch-templates.test.mjs`, `web/test/template-imports.test.ts`
- Modify: `package.json` (root; `templates:fetch` only — `template:new` is added by Task 11), `web/package.json`, `.gitignore`

**Interfaces:**
- Produces: `scripts/template-rules.mjs` — `RESERVED_DIRS` (`['external', 'defaults']`), `TEMPLATE_ID_RE`, `SHA_RE`, `CONTRACT_SPECIFIERS`, `DEFINE_SPECIFIERS`, `ALLOWED_PACKAGES` (the single source for every script and script test; the web side keeps its own `TEMPLATE_ID_RE` in `define.ts` because `web/src` may not import from `scripts/`); `parseLock(text, builtIns): { id, repo, ref }[]` (throws `Error` listing every problem); `forbiddenImports(source, { fileDir, templateRoot, isManifest }): string[]`; `fetchTemplates({ lockPath, templatesDir, log }): string[]`; `validateTemplateDir(dir, id): string[]`; `builtInIds(templatesDir): string[]`.

Ruling: `web/` has no ESLint, so the spec's `no-restricted-imports` rule is implemented as `scripts/template-imports.mjs`, run by `fetch-templates.mjs` for imports (fails the fetch → fails CI before build) and by a vitest over every built-in template folder.

- [ ] **Step 1: Write failing script tests**

`scripts/fetch-templates.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseLock } from './templates-lock.mjs';
import { forbiddenImports } from './template-imports.mjs';
import { fetchTemplates } from './fetch-templates.mjs';
import { RESERVED_DIRS } from './template-rules.mjs';

const SHA = 'a'.repeat(40);

test('parseLock accepts an empty lock and valid entries', () => {
  assert.deepEqual(parseLock('{"templates":[]}', ['modern']), []);
  assert.deepEqual(parseLock(JSON.stringify({ templates: [{ id: 'acme', repo: 'git@github.com:o/r.git', ref: SHA }] }), ['modern']), [{ id: 'acme', repo: 'git@github.com:o/r.git', ref: SHA }]);
});

test('parseLock rejects bad refs, ids, duplicates and built-in collisions', () => {
  const bad = (templates, fragment) => assert.throws(() => parseLock(JSON.stringify({ templates }), ['modern']), (e) => e.message.includes(fragment));
  bad([{ id: 'acme', repo: 'r', ref: 'main' }], '40-char');
  bad([{ id: 'Acme', repo: 'r', ref: SHA }], 'id');
  bad([{ id: 'acme', repo: '', ref: SHA }], 'repo');
  bad([{ id: 'acme', repo: 'r', ref: SHA }, { id: 'acme', repo: 'r2', ref: SHA }], 'duplicate');
  bad([{ id: 'modern', repo: 'r', ref: SHA }], 'built-in');
  for (const id of RESERVED_DIRS) bad([{ id, repo: 'r', ref: SHA }], 'reserved');
  assert.throws(() => parseLock('{nope', ['modern']), /not valid JSON/);
});

test('forbiddenImports allows only the contract, define, react and in-folder files', () => {
  const ctx = { fileDir: '/t/external/acme/slots', templateRoot: '/t/external/acme', isManifest: false };
  assert.deepEqual(forbiddenImports(`import { useTemplate } from '@/templates/contract.ts';\nimport x from 'react';\nimport './a.css';\nimport { y } from '../index.ts';\nexport { z } from './z';\nimport type { J } from 'react/jsx-runtime';`, ctx), []);
  assert.deepEqual(forbiddenImports(`import { useSettings } from '@/app/settings.ts';\nimport ky from 'ky';\nimport { q } from '../../other/x.ts';\nconst m = await import('@/api/cart.ts');`, ctx), ['@/app/settings.ts', 'ky', '../../other/x.ts', '@/api/cart.ts']);
  const manifestCtx = { ...ctx, fileDir: '/t/external/acme', isManifest: true };
  assert.deepEqual(forbiddenImports(`import { defineTemplate } from '@/templates/define.ts';`, manifestCtx), []);
  assert.deepEqual(forbiddenImports(`import { useTemplate } from '@/templates/contract.ts';`, manifestCtx), ['@/templates/contract.ts']);
});

test('forbiddenImports accepts in-folder .ts/.tsx specifiers and type-only react imports', () => {
  const ctx = { fileDir: '/t/external/acme/slots', templateRoot: '/t/external/acme', isManifest: false };
  const src = [
    `import type { SVGProps } from 'react';`,
    `import type { ReactNode, ComponentType } from 'react';`,
    `import { useState, type ReactElement } from 'react';`,
    `import { Arrow } from './Arrow.tsx';`,
    `import { nodeName, readoutLines } from './readout.ts';`,
    `import { LuxuryFooter } from '../slots/LuxuryFooter.tsx';`,
    `import {\n  formatClock,\n  useServerClock,\n  type TopBarProps,\n} from '@/templates/contract.ts';`,
    `import { useCutoffInfo, useOrderingState, type CatalogHeroProps } from '@/templates/contract.ts';`,
    `export type { FooterProps } from '@/templates/contract.ts';`,
  ].join('\n');
  assert.deepEqual(forbiddenImports(src, ctx), []);
  // …but a type-only import is still an import: other packages stay forbidden
  assert.deepEqual(forbiddenImports(`import type { Theme } from '@/types/settings.ts';\nimport type { Options } from 'ky';`, ctx), ['@/types/settings.ts', 'ky']);
});

function sh(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim(); }

function fixtureRepo(files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sf-tpl-src-'));
  for (const [name, body] of Object.entries(files)) { mkdirSync(path.dirname(path.join(dir, name)), { recursive: true }); writeFileSync(path.join(dir, name), body); }
  sh(dir, 'init', '-q');
  sh(dir, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  sh(dir, 'add', '.');
  sh(dir, '-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '-m', 'fixture');
  return { dir, sha: sh(dir, 'rev-parse', 'HEAD'), url: pathToFileURL(dir).href };
}

const GOOD = {
  'manifest.ts': `import { defineTemplate } from '@/templates/define.ts';\nexport default defineTemplate({ contractVersion: 1, id: 'acme' } as never);\n`,
  'index.ts': `import './template.css';\nimport type { TemplateSlots } from '@/templates/contract.ts';\nexport const slots: TemplateSlots = {};\n`,
  'template.css': '',
};

function workspace() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sf-tpl-ws-'));
  const templatesDir = path.join(root, 'templates');
  mkdirSync(path.join(templatesDir, 'modern'), { recursive: true });
  return { root, templatesDir, lockPath: path.join(root, 'templates.lock.json') };
}

test('fetches a pinned template, skips it when current, removes it when unlocked', () => {
  const repo = fixtureRepo(GOOD);
  const ws = workspace();
  const logs = [];
  writeFileSync(ws.lockPath, JSON.stringify({ templates: [{ id: 'acme', repo: repo.url, ref: repo.sha }] }));
  assert.deepEqual(fetchTemplates({ ...ws, log: (m) => logs.push(m) }), ['acme']);
  const dir = path.join(ws.templatesDir, 'external', 'acme');
  assert.ok(existsSync(path.join(dir, 'manifest.ts')));
  assert.ok(!existsSync(path.join(dir, '.git')));
  assert.equal(readFileSync(path.join(dir, '.template-ref'), 'utf8').trim(), repo.sha);

  fetchTemplates({ ...ws, log: (m) => logs.push(m) });
  assert.ok(logs.some((m) => m.includes('up to date')));

  writeFileSync(ws.lockPath, JSON.stringify({ templates: [] }));
  fetchTemplates({ ...ws, log: (m) => logs.push(m) });
  assert.ok(!existsSync(dir));
  rmSync(ws.root, { recursive: true, force: true });
  rmSync(repo.dir, { recursive: true, force: true });
});

test('rejects a template that reaches outside the contract, or whose id disagrees', () => {
  const sneaky = fixtureRepo({ ...GOOD, 'slots/Top.tsx': `import { useSettings } from '@/app/settings.ts';\nexport const Top = () => null;\n` });
  const ws = workspace();
  writeFileSync(ws.lockPath, JSON.stringify({ templates: [{ id: 'acme', repo: sneaky.url, ref: sneaky.sha }] }));
  assert.throws(() => fetchTemplates({ ...ws, log: () => {} }), /slots[\\/]Top\.tsx.*@\/app\/settings\.ts/);

  const wrongId = fixtureRepo(GOOD);
  writeFileSync(ws.lockPath, JSON.stringify({ templates: [{ id: 'other', repo: wrongId.url, ref: wrongId.sha }] }));
  assert.throws(() => fetchTemplates({ ...ws, log: () => {} }), /manifest id/);

  const withDeps = fixtureRepo({ ...GOOD, 'package.json': JSON.stringify({ dependencies: { lodash: '1' } }) });
  writeFileSync(ws.lockPath, JSON.stringify({ templates: [{ id: 'acme', repo: withDeps.url, ref: withDeps.sha }] }));
  assert.throws(() => fetchTemplates({ ...ws, log: () => {} }), /dependencies/);
  for (const d of [ws.root, sneaky.dir, wrongId.dir, withDeps.dir]) rmSync(d, { recursive: true, force: true });
});

test('names the template when git cannot fetch it', () => {
  const ws = workspace();
  writeFileSync(ws.lockPath, JSON.stringify({ templates: [{ id: 'acme', repo: pathToFileURL(path.join(ws.root, 'missing')).href, ref: SHA }] }));
  assert.throws(() => fetchTemplates({ ...ws, log: () => {} }), /acme/);
  rmSync(ws.root, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm run test:scripts` → FAIL (modules missing).

- [ ] **Step 3: Implement `template-rules.mjs` (the single source) and `templates-lock.mjs`**

`scripts/template-rules.mjs`:

```js
/**
 * The template naming and import rules, in one place. Imported by fetch-templates, templates-lock,
 * template-imports, new-template (template:new) and their tests. The web side mirrors only
 * TEMPLATE_ID_RE (web/src/templates/define.ts) because web/src may not import from scripts/.
 */
/** Folder names under web/src/templates that are never templates (and never valid template ids). */
export const RESERVED_DIRS = Object.freeze(['external', 'defaults']);
export const TEMPLATE_ID_RE = /^[a-z0-9-]{1,40}$/;
/** A lock ref must be a full, lowercase commit SHA — no branches, no tags. */
export const SHA_RE = /^[0-9a-f]{40}$/;
/** What a template file may import (manifest.ts: DEFINE_SPECIFIERS only). */
export const CONTRACT_SPECIFIERS = Object.freeze(['@/templates/contract', '@/templates/contract.ts']);
export const DEFINE_SPECIFIERS = Object.freeze(['@/templates/define', '@/templates/define.ts']);
export const ALLOWED_PACKAGES = Object.freeze(['react', 'react/jsx-runtime']);
```

`scripts/template-rules.d.mts`:

```ts
export declare const RESERVED_DIRS: readonly string[];
export declare const TEMPLATE_ID_RE: RegExp;
export declare const SHA_RE: RegExp;
export declare const CONTRACT_SPECIFIERS: readonly string[];
export declare const DEFINE_SPECIFIERS: readonly string[];
export declare const ALLOWED_PACKAGES: readonly string[];
```

`scripts/templates-lock.mjs`:

```js
import { RESERVED_DIRS, SHA_RE, TEMPLATE_ID_RE as ID_RE } from './template-rules.mjs';

const RESERVED = new Set(RESERVED_DIRS);

/** Parses templates.lock.json. Throws one Error listing every problem. */
export function parseLock(text, builtIns) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('templates.lock.json is not valid JSON'); }
  const list = Array.isArray(data?.templates) ? data.templates : null;
  if (!list) throw new Error('templates.lock.json must be { "templates": [...] }');
  const errors = [];
  const seen = new Set();
  const entries = [];
  list.forEach((e, i) => {
    const where = `templates[${i}]`;
    if (typeof e?.id !== 'string' || !ID_RE.test(e.id)) { errors.push(`${where}: id must match ${ID_RE}`); return; }
    if (RESERVED.has(e.id)) errors.push(`${where}: id "${e.id}" is reserved`);
    if (builtIns.includes(e.id)) errors.push(`${where}: id "${e.id}" collides with a built-in template`);
    if (seen.has(e.id)) errors.push(`${where}: duplicate id "${e.id}"`);
    seen.add(e.id);
    if (typeof e.repo !== 'string' || e.repo.trim() === '') errors.push(`${where}: repo is required`);
    if (typeof e.ref !== 'string' || !SHA_RE.test(e.ref)) errors.push(`${where}: ref must be a full 40-char commit SHA (branches and tags are not allowed)`);
    entries.push({ id: e.id, repo: e.repo, ref: e.ref });
  });
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return entries;
}
```

- [ ] **Step 4: Implement `template-imports.mjs` + types**

```js
import path from 'node:path';

import { ALLOWED_PACKAGES, CONTRACT_SPECIFIERS, DEFINE_SPECIFIERS } from './template-rules.mjs';

const SPEC_RE = /(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const CONTRACT = new Set(CONTRACT_SPECIFIERS);
const DEFINE = new Set(DEFINE_SPECIFIERS);
const PACKAGES = new Set(ALLOWED_PACKAGES);

/**
 * The import restriction for templates (web/ has no ESLint). Returns every specifier a template
 * file may not use. manifest.ts may import only @/templates/define.ts; other files may import
 * the contract, define, react, and relative files that stay inside the template folder.
 */
export function forbiddenImports(source, { fileDir, templateRoot, isManifest }) {
  const bad = [];
  for (const m of source.matchAll(SPEC_RE)) {
    const spec = m[1] ?? m[2];
    if (!spec) continue;
    if (isManifest) { if (!DEFINE.has(spec)) bad.push(spec); continue; }
    if (CONTRACT.has(spec) || DEFINE.has(spec) || PACKAGES.has(spec)) continue;
    if (spec.startsWith('./') || spec.startsWith('../')) {
      const resolved = path.resolve(fileDir, spec);
      const rel = path.relative(templateRoot, resolved);
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) continue;
    }
    bad.push(spec);
  }
  return bad;
}
```

`scripts/template-imports.d.mts`:

```ts
export declare function forbiddenImports(
  source: string,
  ctx: { fileDir: string; templateRoot: string; isManifest: boolean },
): string[];
```

- [ ] **Step 5: Implement `fetch-templates.mjs`**

```js
#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseLock } from './templates-lock.mjs';
import { forbiddenImports } from './template-imports.mjs';
import { RESERVED_DIRS } from './template-rules.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const INTERNAL = new Set(RESERVED_DIRS);
export const DEFAULTS = {
  lockPath: path.join(ROOT, 'templates.lock.json'),
  templatesDir: path.join(ROOT, 'web', 'src', 'templates'),
  log: (m) => console.log(`fetch-templates: ${m}`),
};

export function builtInIds(templatesDir) {
  return readdirSync(templatesDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !INTERNAL.has(d.name)).map((d) => d.name);
}

function git(args, cwd, id) {
  try {
    execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    throw new Error(`git ${args[0]} failed for template "${id}": ${String(err.stderr ?? err.message).trim()}`);
  }
}

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

/** Shape + import checks for one template folder. Returns messages, empty when valid. */
export function validateTemplateDir(dir, id) {
  const errors = [];
  const where = (f) => path.relative(dir, f) || '.';
  for (const f of ['manifest.ts', 'index.ts']) if (!existsSync(path.join(dir, f))) errors.push(`${id}: missing ${f} at the repo root`);
  const pkg = path.join(dir, 'package.json');
  if (existsSync(pkg)) {
    try {
      const deps = JSON.parse(readFileSync(pkg, 'utf8')).dependencies;
      if (deps && Object.keys(deps).length > 0) errors.push(`${id}: package.json declares dependencies — templates may only use the storefront contract and React`);
    } catch { errors.push(`${id}: package.json is not valid JSON`); }
  }
  const manifestPath = path.join(dir, 'manifest.ts');
  if (existsSync(manifestPath)) {
    const found = /\bid:\s*['"]([^'"]+)['"]/.exec(readFileSync(manifestPath, 'utf8'))?.[1];
    if (found !== id) errors.push(`${id}: manifest id "${found ?? '?'}" must equal the lock id "${id}"`);
  }
  for (const file of sourceFiles(dir)) {
    const bad = forbiddenImports(readFileSync(file, 'utf8'), { fileDir: path.dirname(file), templateRoot: dir, isManifest: file === manifestPath });
    for (const spec of bad) errors.push(`${id}: ${where(file)} imports "${spec}" — only @/templates/contract.ts, @/templates/define.ts, react and files inside the template are allowed`);
  }
  return errors;
}

export function fetchTemplates({ lockPath, templatesDir, log } = DEFAULTS) {
  const text = existsSync(lockPath) ? readFileSync(lockPath, 'utf8') : '{"templates":[]}';
  const entries = parseLock(text, builtInIds(templatesDir));
  const extDir = path.join(templatesDir, 'external');
  mkdirSync(extDir, { recursive: true });

  const wanted = new Set(entries.map((e) => e.id));
  for (const d of readdirSync(extDir, { withFileTypes: true })) {
    if (d.isDirectory() && !wanted.has(d.name)) {
      rmSync(path.join(extDir, d.name), { recursive: true, force: true });
      log(`removed external/${d.name} (not in the lock)`);
    }
  }

  const errors = [];
  for (const e of entries) {
    const dir = path.join(extDir, e.id);
    const refFile = path.join(dir, '.template-ref');
    if (existsSync(refFile) && readFileSync(refFile, 'utf8').trim() === e.ref) {
      log(`external/${e.id} up to date @ ${e.ref.slice(0, 7)}`);
    } else {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      git(['init', '-q'], dir, e.id);
      git(['fetch', '-q', '--depth', '1', e.repo, e.ref], dir, e.id);
      git(['checkout', '-q', 'FETCH_HEAD'], dir, e.id);
      rmSync(path.join(dir, '.git'), { recursive: true, force: true });
      writeFileSync(refFile, `${e.ref}\n`);
      log(`fetched external/${e.id} @ ${e.ref.slice(0, 7)}`);
    }
    errors.push(...validateTemplateDir(dir, e.id));
  }
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return entries.map((e) => e.id);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    fetchTemplates();
  } catch (err) {
    console.error(`fetch-templates: ${err.message}`);
    process.exit(1);
  }
}
```

- [ ] **Step 6: Vitest over built-in templates**

`web/test/template-imports.test.ts`:

```ts
/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { forbiddenImports } from '../../scripts/template-imports.mjs';
import { RESERVED_DIRS } from '../../scripts/template-rules.mjs';

const templatesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/templates');
const folders = readdirSync(templatesDir).filter((n) => statSync(path.join(templatesDir, n)).isDirectory() && !RESERVED_DIRS.includes(n));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const full = path.join(dir, n);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(n) ? [full] : [];
  });
}

describe('built-in templates respect the import contract', () => {
  it.each(folders)('%s', (folder) => {
    const root = path.join(templatesDir, folder);
    for (const file of files(root)) {
      const bad = forbiddenImports(readFileSync(file, 'utf8'), { fileDir: path.dirname(file), templateRoot: root, isManifest: path.basename(file) === 'manifest.ts' && path.dirname(file) === root });
      expect(bad, path.relative(templatesDir, file)).toEqual([]);
    }
  });
});
```

- [ ] **Step 7: Wire scripts, lock and gitignore**

`templates.lock.json`:

```json
{ "templates": [] }
```

Root `package.json` scripts — add (the `template:new` script arrives with its file in Task 11):

```json
    "templates:fetch": "node scripts/fetch-templates.mjs",
```

`web/package.json` scripts — add:

```json
    "predev": "node ../scripts/fetch-templates.mjs",
    "prebuild": "node ../scripts/fetch-templates.mjs",
```

`.gitignore` — add:

```
web/src/templates/external/
docs/screenshots/templates/
```

- [ ] **Step 8: Verify**

Run: `npm run test:scripts` → PASS. Run: `npm run test:web -- template-imports` → PASS. Run: `npm run templates:fetch` → `fetch-templates:` prints nothing to fetch and exits 0; `web/src/templates/external/` exists and is ignored (`git status` shows it untracked-ignored). Run: `npm run build` → the prebuild fetch runs, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add templates.lock.json scripts/template-rules.mjs scripts/template-rules.d.mts scripts/templates-lock.mjs scripts/template-imports.mjs scripts/template-imports.d.mts scripts/fetch-templates.mjs scripts/fetch-templates.test.mjs web/test/template-imports.test.ts package.json web/package.json .gitignore
git commit -m "feat(templates): build-time import of pinned template repos with an import contract

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: `template:new` scaffold

**Files:**
- Create: `scripts/new-template.mjs`, `scripts/new-template.test.mjs`
- Create: `scripts/template-starter/manifest.ts.tpl`, `index.ts.tpl`, `template.css.tpl`, `README.md.tpl`
- Modify: `package.json` (root) — add `"template:new": "node scripts/new-template.mjs",` to `scripts` (moved here from Task 10 so the script and its file land together)

**Interfaces:**
- Consumes: `RESERVED_DIRS`, `TEMPLATE_ID_RE` from `scripts/template-rules.mjs` (Task 10).
- Produces: `newTemplate(id, { templatesDir, starterDir }): string` (returns the created folder). Starter files end in `.tpl` so the storefront's own typecheck never compiles them.

- [ ] **Step 1: Write failing tests**

`scripts/new-template.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { newTemplate } from './new-template.mjs';
import { forbiddenImports } from './template-imports.mjs';
import { RESERVED_DIRS } from './template-rules.mjs';

function ws() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sf-new-'));
  const templatesDir = path.join(root, 'templates');
  mkdirSync(path.join(templatesDir, 'modern'), { recursive: true });
  return { root, templatesDir };
}

test('scaffolds a template folder with the id and name filled in', () => {
  const { root, templatesDir } = ws();
  const dir = newTemplate('acme-noir', { templatesDir });
  for (const f of ['manifest.ts', 'index.ts', 'template.css', 'README.md']) assert.ok(existsSync(path.join(dir, f)), f);
  const manifest = readFileSync(path.join(dir, 'manifest.ts'), 'utf8');
  assert.match(manifest, /id: 'acme-noir'/);
  assert.match(manifest, /name: 'Acme Noir'/);
  assert.doesNotMatch(manifest, /__ID__|__NAME__/);
  assert.match(readFileSync(path.join(dir, 'template.css'), 'utf8'), /:root\[data-sf-template="acme-noir"\]/);
  assert.deepEqual(forbiddenImports(manifest, { fileDir: dir, templateRoot: dir, isManifest: true }), []);
  assert.deepEqual(forbiddenImports(readFileSync(path.join(dir, 'index.ts'), 'utf8'), { fileDir: dir, templateRoot: dir, isManifest: false }), []);
  rmSync(root, { recursive: true, force: true });
});

test('refuses bad ids, reserved names and existing folders', () => {
  const { root, templatesDir } = ws();
  assert.throws(() => newTemplate('Bad Id', { templatesDir }), /id/);
  for (const name of RESERVED_DIRS) assert.throws(() => newTemplate(name, { templatesDir }), /reserved/);
  assert.throws(() => newTemplate('modern', { templatesDir }), /exists/);
  rmSync(root, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm run test:scripts` → FAIL.

- [ ] **Step 3: Starter files**

`scripts/template-starter/manifest.ts.tpl`:

```ts
import { BASE_TOKENS, COLOR_KEYS, defineTemplate } from '@/templates/define.ts';

export default defineTemplate({
  contractVersion: 1,
  id: '__ID__',
  name: '__NAME__',
  version: '0.1.0',
  description: 'Describe the look in one sentence — the admin shows this under the thumbnail.',
  author: 'Your name',
  schemes: ['dark'],
  presets: [{
    id: 'default',
    name: 'Default',
    scheme: 'dark',
    colors: { primary: '#ffffff', bg: '#0f0f10', surface: '#18181b', text: '#f4f4f5', muted: '#a1a1aa', success: '#4ade80', warn: '#fbbf24', danger: '#f87171' },
    fonts: { heading: null, body: null, mono: null },
    radius: 'md',
  }],
  defaultPreset: 'default',
  tokens: BASE_TOKENS,
  editable: { colors: [...COLOR_KEYS], fonts: true, radius: true, density: true },
  options: [],
});
```

`scripts/template-starter/index.ts.tpl`:

```ts
import './template.css';
import type { TemplateSlots } from '@/templates/contract.ts';

// Add slot components here, e.g. `Footer: MyFooter` — see docs/templates.md.
export const slots: TemplateSlots = {};
```

`scripts/template-starter/template.css.tpl`:

```css
/* Every rule must start with :root[data-sf-template="__ID__"] and target parts
   ([data-sf-part="…"]), tokens (--sf-*) or this template's own slot markup — never
   hashed module class names. See docs/templates.md for the parts list. */
:root[data-sf-template="__ID__"] [data-sf-part="product-card"] {
}
```

`scripts/template-starter/README.md.tpl`:

```md
# __NAME__ (`__ID__`)

A storefront template. Contract: `docs/templates.md` in the storefront repo.

- Built-in: lives at `web/src/templates/__ID__/`.
- Imported: this folder is the repo root; add it to the storefront's `templates.lock.json`
  pinned to a full commit SHA.

Check it: `npm run typecheck && npm run test:web && npm run test:e2e -- templates.spec.ts`
(add a `TEMPLATE_CASES` entry for it in `e2e/templates.spec.ts` first).
```

- [ ] **Step 4: Implement `new-template.mjs`**

```js
#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RESERVED_DIRS, TEMPLATE_ID_RE as ID_RE } from './template-rules.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const RESERVED = new Set(RESERVED_DIRS);

const titleCase = (id) => id.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

export function newTemplate(id, { templatesDir = path.join(ROOT, 'web/src/templates'), starterDir = path.join(ROOT, 'scripts/template-starter') } = {}) {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new Error(`template id must match ${ID_RE}`);
  if (RESERVED.has(id)) throw new Error(`"${id}" is a reserved folder name`);
  const target = path.join(templatesDir, id);
  if (existsSync(target)) throw new Error(`${path.relative(ROOT, target) || target} already exists`);
  mkdirSync(target, { recursive: true });
  for (const file of readdirSync(starterDir)) {
    const body = readFileSync(path.join(starterDir, file), 'utf8').replaceAll('__ID__', id).replaceAll('__NAME__', titleCase(id));
    writeFileSync(path.join(target, file.replace(/\.tpl$/, '')), body);
  }
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const dir = newTemplate(process.argv[2]);
    console.log(`created ${path.relative(ROOT, dir)} — next: docs/templates.md`);
  } catch (err) {
    console.error(`template:new: ${err.message}`);
    console.error('usage: npm run template:new -- <id>');
    process.exit(1);
  }
}
```

- [ ] **Step 5: Add the script and verify**

Add to the root `package.json` `scripts`: `"template:new": "node scripts/new-template.mjs",`.

Run: `npm run test:scripts` → PASS. Smoke: `npm run template:new -- scratch-check`, then `npm run typecheck && npm run test:web -- templates-registry template-imports` → PASS with the scratch template registered; delete `web/src/templates/scratch-check/`.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/new-template.mjs scripts/new-template.test.mjs \
  scripts/template-starter/manifest.ts.tpl scripts/template-starter/index.ts.tpl scripts/template-starter/template.css.tpl scripts/template-starter/README.md.tpl
git commit -m "feat(templates): template:new scaffold

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Release workflow imports templates

**Files:**
- Modify: `.github/workflows/release.yml`
- Test: `scripts/release-workflow.test.mjs` (picked up by `npm run test:scripts`)

- [ ] **Step 1: Write the failing workflow test**

The `yaml` package is not installed (it appears in `package-lock.json` only as an optional peer), and the plan adds no dependencies. So the test reads the workflow as text: each step is found by its own line, and order is compared by line index.

`scripts/release-workflow.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const yml = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const lines = yml.split('\n');
/** Index of the first line matching `re` — fails the test when absent. */
function lineOf(re, what) {
  const i = lines.findIndex((l) => re.test(l));
  assert.ok(i >= 0, `release.yml has no ${what}`);
  return i;
}

test('templates are fetched after the web install and before tests and build', () => {
  const webCi = lineOf(/^\s+- run: npm --prefix web ci\s*$/, '"npm --prefix web ci" step');
  const fetch = lineOf(/^\s+- name: Fetch imported templates\s*$/, '"Fetch imported templates" step');
  const fetchRun = lineOf(/^\s+run: node scripts\/fetch-templates\.mjs\s*$/, 'fetch-templates run line');
  const tests = lineOf(/^\s+- run: npm test\s*$/, '"npm test" step');
  const build = lineOf(/^\s+- run: npm run build\s*$/, '"npm run build" step');
  assert.ok(webCi < fetch && fetch < fetchRun && fetchRun < tests && tests < build, `order: web ci ${webCi}, fetch ${fetch}, test ${tests}, build ${build}`);
});

test('the deploy-key step is conditional on TEMPLATES_DEPLOY_KEY and runs before the fetch', () => {
  const key = lineOf(/^\s+- name: Load template deploy key\s*$/, '"Load template deploy key" step');
  assert.match(lines[key + 1] ?? '', /^\s+if: env\.TEMPLATES_DEPLOY_KEY != ''\s*$/, 'the step\'s first key must be its `if:` guard');
  assert.ok(key < lineOf(/^\s+- name: Fetch imported templates\s*$/, 'fetch step'));
  assert.match(yml, /\n {4}env:\n {6}TEMPLATES_DEPLOY_KEY: \$\{\{ secrets\.TEMPLATES_DEPLOY_KEY \}\}\n/, 'job-level env must expose the secret so the step `if` can read it');
});
```

Run: `npm run test:scripts` → FAIL (`release.yml has no "Fetch imported templates" step`).

- [ ] **Step 2: Add the key and fetch steps**

Under `jobs.build`, add a job-level env (so a step's `if` can see it), directly after `permissions: { contents: write }`:

```yaml
    env:
      TEMPLATES_DEPLOY_KEY: ${{ secrets.TEMPLATES_DEPLOY_KEY }}
```

Insert after `- run: npm --prefix web ci` and **before** `- run: npm test`:

```yaml
      - name: Load template deploy key
        if: env.TEMPLATES_DEPLOY_KEY != ''
        run: |
          mkdir -p ~/.ssh
          ssh-keyscan github.com >> ~/.ssh/known_hosts
          eval "$(ssh-agent -s)"
          echo "$TEMPLATES_DEPLOY_KEY" | tr -d '\r' | ssh-add -
          echo "SSH_AUTH_SOCK=$SSH_AUTH_SOCK" >> "$GITHUB_ENV"
          echo "SSH_AGENT_PID=$SSH_AGENT_PID" >> "$GITHUB_ENV"
      - name: Fetch imported templates
        run: node scripts/fetch-templates.mjs
```

(`npm run build` also runs the fetch through `web`'s `prebuild`; it is then a no-op "up to date".)

- [ ] **Step 3: Verify**

Run: `npm run test:scripts` → PASS (both workflow tests plus the fetch/scaffold suites).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml scripts/release-workflow.test.mjs
git commit -m "ci(release): fetch pinned templates (optional deploy key) before test and build

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Template × viewport e2e matrix

**Files:**
- Create: `e2e/templates.spec.ts`

(`e2e/mocks.ts` is not touched. `installMocks` already aborts every request that leaves `localhost:5199` (mocks.ts L232), Google Fonts included, so the suite is hermetic as it stands.)

**Interfaces:**
- Consumes: `e2e/flows.ts`, `/templates.json` from the dev server (Task 9).
- Produces: `TEMPLATE_CASES` (Plan 3 appends entries) and helpers `expectNoHorizontalOverflow`, `expectCartBarUnobstructed`, `expectSlotTapTargets`.

- [ ] **Step 1: Write the matrix**

`e2e/templates.spec.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { installMocks, type Layout } from './mocks.ts';
import { addFirstToCart, FIXED_NOW, onlyVisible, openCart, openProduct } from './flows.ts';

interface TemplateCase {
  template: string;
  preset: string;
  /** Enforce ≥ 44px tap targets inside template-provided slots (modern has none). */
  tapTargets: boolean;
}

/** Every template in /templates.json needs at least one case (guarded below). Plan 3 appends. */
export const TEMPLATE_CASES: TemplateCase[] = [
  { template: 'modern', preset: 'default', tapTargets: false },
];

const WIDTHS = [360, 390, 768, 1280] as const;
const MENU_WIDTHS = [390, 1280] as const;
const SHOTS = fileURLToPath(new URL('../docs/screenshots/templates/', import.meta.url));

interface CatalogPreset { id: string; scheme: 'dark' | 'light'; colors: Record<string, string>; fonts: Record<'heading' | 'body' | 'mono', { family: string } | null>; radius: 'none' | 'sm' | 'md' | 'lg' | 'xl' }
interface CatalogJson { templates: Array<{ id: string; presets: CatalogPreset[] }> }

async function catalogJson(page: Page): Promise<CatalogJson> {
  const res = await page.request.get('/templates.json');
  expect(res.ok()).toBe(true);
  return (await res.json()) as CatalogJson;
}

export async function expectNoHorizontalOverflow(page: Page, where: string): Promise<void> {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  expect(o.sw, `horizontal overflow on ${where}`).toBeLessThanOrEqual(o.w);
}

export async function expectCartBarUnobstructed(page: Page): Promise<void> {
  const link = page.locator('[data-sf-part="cart-bar"]').getByRole('link', { name: 'Checkout' });
  await expect(link).toBeVisible();
  const box = (await link.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  const hit = await page.evaluate(([x, y]) => !!document.elementFromPoint(x!, y!)?.closest('[data-sf-part="cart-bar"]'), [box.x + box.width / 2, box.y + box.height / 2]);
  expect(hit, 'something covers the cart bar checkout').toBe(true);
}

export async function expectSlotTapTargets(page: Page): Promise<void> {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-sf-slot] a, [data-sf-slot] button')]
      .filter((el) => el.offsetParent !== null && el.getBoundingClientRect().height < 44)
      .map((el) => el.outerHTML.slice(0, 80)),
  );
  expect(small, 'slot tap targets under 44px').toEqual([]);
}

test('every template in the catalog has a matrix case', async ({ page }) => {
  const cat = await catalogJson(page);
  const covered = new Set(TEMPLATE_CASES.map((c) => c.template));
  expect(cat.templates.map((t) => t.id).filter((id) => !covered.has(id))).toEqual([]);
});

for (const c of TEMPLATE_CASES) {
  const run = (layout: Layout, width: number) =>
    test(`${c.template}/${c.preset} · ${layout} · ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.clock.setFixedTime(FIXED_NOW);
      const preset = (await catalogJson(page)).templates.find((t) => t.id === c.template)!.presets.find((p) => p.id === c.preset)!;
      const mocks = await installMocks(page, {
        layout,
        session: true,
        tweakSettings: (s) => {
          s.theme = {
            ...s.theme,
            template: c.template,
            preset: c.preset,
            options: {},
            scheme: preset.scheme,
            colors: preset.colors as typeof s.theme.colors,
            fonts: { heading: preset.fonts.heading?.family ?? null, body: preset.fonts.body?.family ?? null, mono: preset.fonts.mono?.family ?? null },
            radius: preset.radius,
          };
        },
      });
      const name = `${c.template}-${c.preset}-${layout}-${width}`;
      const phone = width < 992;

      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-sf-template', c.template);
      await expectNoHorizontalOverflow(page, 'catalog');
      if (c.tapTargets) await expectSlotTapTargets(page);
      await page.screenshot({ path: `${SHOTS}${name}-1-catalog.png`, fullPage: true });

      await openProduct(page, layout, 'Alpine Extract 10ml');
      await expectNoHorizontalOverflow(page, 'detail');
      await page.screenshot({ path: `${SHOTS}${name}-2-detail.png` });

      // Both layouts continue to cart → checkout (the menu layout at 390 and 1280; the
      // baseline spec proves the same flow works in the menu shell). addFirstToCart closes
      // the menu's product dialog; MenuShell renders the same MobileCartBar on phones.
      await addFirstToCart(page, layout, mocks);
      if (phone) await expectCartBarUnobstructed(page);
      await openCart(page, phone ? 'mobile' : 'desktop');
      await expectNoHorizontalOverflow(page, 'cart');
      await page.screenshot({ path: `${SHOTS}${name}-3-cart.png` });

      await onlyVisible(page.getByRole('link', { name: 'Checkout' })).click();
      await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
      await expectNoHorizontalOverflow(page, 'checkout');
      await page.screenshot({ path: `${SHOTS}${name}-4-checkout.png` });
    });

  for (const w of WIDTHS) run('storefront', w);
  for (const w of MENU_WIDTHS) run('menu', w);
}
```

Note: `openCart(page, 'mobile')` expects the cart **page** (phones and tablets under 62em); at 768px that holds because the drawer only appears from 62em (992px).

- [ ] **Step 2: Run**

Run: `npm run test:e2e -- templates.spec.ts` → 7 passed (1 guard + 4 storefront + 2 menu for modern; every one runs catalog → detail → cart → checkout). Screenshots are in `docs/screenshots/templates/` (gitignored): 4 per case, for both layouts.

- [ ] **Step 3: Commit**

```bash
git add e2e/templates.spec.ts
git commit -m "test(e2e): template × viewport matrix with overflow, cart-bar and tap-target checks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: `docs/templates.md` + README

**Files:**
- Create: `docs/templates.md`
- Modify: `README.md` (new "Templates" section after "Tests, typecheck, build")

- [ ] **Step 1: Write `docs/templates.md`**

Write the document with these sections, filled from this plan (copy the tables and blocks, do not paraphrase them):

1. **What a template is** — one paragraph + the folder/module shape block from the Contract reference.
2. **Manifest** — the manifest types from the `define.ts` block (types and `BASE_TOKENS`, not the validator body); the validation rules from Global Constraints, including the **limits table**: `name` ≤ 60, `description` ≤ 500, `author` ≤ 100, `version` ≤ 40, ≤ 30 options, select `choices` 1–20, text `maxLength` 1–100, `FontSpec.weights` 1–9 values (100–900, step 100), and that these match the backend's catalog schema (a manifest over a limit fails the build rather than being silently dropped by the backend). Also how presets, `editable` locks (locked fields always take the active preset's value; density locked → comfortable) and options resolve.
3. **Tokens** — the CSS variable list and the root attribute table, with modern's values (the `BASE_TOKENS` block), and the **heading-token note** from the Contract reference. `heading.*` reaches only ProductGrid's title (all three values) and the product page title's weight. The list and wholesale titles keep their literals, so to restyle every title a template targets `[data-sf-part="page-title"]` / `[data-sf-part="group-title"]`.
4. **Parts** — the parts table (including the five custom buttons, the eleven card roots, the checkout stepper and `<Sheet part="drawer">`), the `data-variant` / `data-sf-cta="main"` notes, the **shared button-fill rules** paragraph, the specificity note, and the **supported hooks outside the parts table** (`.glass`, `.glass-soft`, `.mantine-Overlay-root`; prefer the `glass` token).
5. **Slots** — the `slots.ts` block, where each slot renders, the defaults, the `data-sf-slot` wrapper, and the cart-bar merge pattern.
6. **Hooks and components** — the hook signature block and the component re-exports, including `ArrowUpRightIcon` and its `GlyphProps`.
7. **Mobile rules (every template)** — verbatim: no horizontal scroll at 360px; tap targets ≥ 44px; decorations collapse or hide at the breakpoints the template declares; safe-area insets respected (`env(safe-area-inset-*)`); overlays `pointer-events: none`; `prefers-reduced-motion` honoured; inputs stay 16px (iOS zoom guard). Enforced by `e2e/templates.spec.ts`; add a `TEMPLATE_CASES` entry per preset.
8. **Adding a built-in template** — `npm run template:new -- <id>`, edit, add e2e case, `npm test && npm run test:e2e`.
9. **Importing a template from git** — the naming and import rules live in `scripts/template-rules.mjs` (reserved folder names `external`/`defaults`, id and SHA regexes, the import allowlist); repo root = template folder; add `{ id, repo, ref }` to `templates.lock.json` with a full SHA; `npm run templates:fetch`; private repos need the `TEMPLATES_DEPLOY_KEY` Actions secret (a read-only deploy key on the template repo); what the fetch rejects.
10. **Trust** — "An imported template runs as first-party code in every client's storefront. Adding or bumping one in `templates.lock.json` is a code-review decision: read the diff at the new SHA before merging."
11. **Catalog and preview** — `templates.json` shape (the Task 9 interface block), `/templates/<id>/preview.<ext>`, the preview message protocol from Task 8, and that draft custom CSS is never applied in preview.

- [ ] **Step 2: README section**

Add to `README.md` after "Tests, typecheck, build":

```md
## Templates

The storefront's look is a **template** (`web/src/templates/<id>/`) chosen per client in the
admin (Storefront → Appearance): `modern` (default), plus any built-in or imported template.
The full contract — manifest, tokens, parts, slots, hooks, mobile rules, git imports — is in
[`docs/templates.md`](docs/templates.md).

    npm run template:new -- <id>   # scaffold a built-in template
    npm run templates:fetch        # vendor the repos pinned in templates.lock.json (runs before dev/build)

The build emits `web/dist/templates.json`, which the backend captures on deploy so the admin
knows which templates this release contains.
```

- [ ] **Step 3: Final full verification**

Run: `npm test` → web + worker + scripts all PASS. Run: `npm run typecheck` → clean. Run: `npm run build` → succeeds, `web/dist/templates.json` present. Run: `npm run test:e2e` → all specs pass, including `templates-baseline.spec.ts` with **unchanged** snapshots.

- [ ] **Step 4: Commit**

```bash
git add docs/templates.md README.md
git commit -m "docs: storefront template contract and workflow

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (rulings on spec gaps)

- **Import restriction without ESLint (spec §5.2):** `web/` has no ESLint; implemented as `scripts/template-imports.mjs`, enforced in the fetch step (external) and a vitest (built-ins). Manifests are further restricted to `@/templates/define.ts` so the catalog plugin can load them without React.
- **`badge.radius` modern value:** the spec table said "theme radius"; today's pills are `999px`, so modern's `badge.radius` is `'pill'` (pixels win).
- **`stepper` part:** attached to both the tracking `ProgressStepper` root and the checkout Mantine `<Stepper>` (preflight F17).
- **Spec deviations** are ratified in the spec's "Implementation amendments (2026-09-28)" section (preflight F8); this plan implements that section.
- **Preflight rulings F1–F20 applied (2026-09-28):** `CutoffInfo` re-exported from `lib/server-clock.ts`; CheckoutPage `.next`/`.back` are custom buttons; eleven explicit card roots; server clock anchored at the settings fetch time and shared with CutoffBar; heading tokens only where modern matches; no font-route step; `2 as unknown as 1`; dev `console.error` for invalid manifests; menu e2e through checkout; explicit `git add` paths; `define.ts` block is the complete file; `scripts/template-rules.mjs`; `!./defaults/**` globs; Plan 1 text/choice/weight caps in `validateManifest`.
- **SectionLabel semantics:** an eyebrow *above* headings (not a heading replacement), so modern renders nothing and the DOM is unchanged; `label.style` drives the default for `bracket`/`numbered`, so Plan 3 may not need a custom SectionLabel at all.
- **Overlay placement:** rendered inside the shells (not `App`) because it needs router-independent but settings-dependent context and must sit above the chassis; the luxury "orb behind the hero" belongs in its `CatalogHero` slot, not `Overlay`.
- **Chunk-load failure:** tokens/palette still apply (manifests are in the main bundle); only slots and template CSS fall back. A late-arriving chunk upgrades the page.
- **First paint:** v2 stores pre-computed variables/attributes, so the inline script has no theme logic to drift; v1 legacy branch kept for the first visit after upgrade.
- **Screenshots location:** `docs/screenshots/templates/` is written by the matrix but gitignored (≈24 PNGs per preset); the committed regression gate is `e2e/__baseline__/` for modern.
- **Contract additions for Plan 3:** `tokens.glass` (`data-sf-glass`) with shared solid-chrome rules; shared `outline-glow`/`ghost` fill rules so the custom filled buttons (AddToCart, CartSummary, MobileCartBar, CheckoutPage `.next`) follow `button.fill`; `validateManifest` checks every token value (numeric radii 0..64, `'0'`/em tracking, `'none'` borders, `body`/`heading` button fonts accepted); import scanner pinned for in-folder `.ts`/`.tsx` and type-only `react` imports; `ArrowUpRightIcon` re-exported from the contract with pass-through SVG props.
- **Preview origin:** the storefront can't know the admin origin, so it trusts `event.source === window.parent` + the zod shape; draft `customCss` is always dropped.
