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
/** Backend cap on a catalog entry's `options[]` (core options included). */
const MAX_OPTIONS = 30;
const MAX_CHOICES = 20;
const MAX_WEIGHTS = 9;
const MAX_PRESETS = 20;
/** Text caps — identical to Plan 1's catalog schema, so a manifest that builds is never dropped by the backend. */
const TEXT_CAPS = { name: 60, version: 40, description: 500, author: 100 } as const;
/** Per-field caps mirroring the backend catalog parser (ecommerce-backend src/lib/storefront-templates.ts). */
const PRESET_NAME_MAX = 60;
const OPTION_LABEL_MAX = 80;
const OPTION_HELP_MAX = 200;
const CHOICE_VALUE_MAX = 100;
const CHOICE_LABEL_MAX = 80;

/**
 * Core options: every template — built-in and external — gets these, prepended to its own
 * `options[]` by the registry (see `withCoreOptions`), so the admin's Template options card and
 * the generated templates.json list them for every template. The keys are reserved: a manifest
 * that declares one of them is invalid. All default to true (shown), so a store that never set
 * them looks exactly as before.
 */
export const CORE_OPTIONS: readonly TemplateOption[] = Object.freeze([
  { key: 'showPageTitle', type: 'boolean', label: 'Page title', help: 'The catalogue heading and its product count. Screen readers still announce the heading when it is hidden.', default: true },
  { key: 'showCatalogIntro', type: 'boolean', label: 'Catalogue intro', help: 'The introduction above the products: your tagline and welcome message.', default: true },
  { key: 'showSectionLabels', type: 'boolean', label: 'Section labels', help: 'The small labels above the page title and each category section, where this template shows them.', default: true },
] satisfies TemplateOption[]);
export const CORE_OPTION_KEYS: readonly string[] = Object.freeze(CORE_OPTIONS.map((o) => o.key));
/** How many options a manifest may declare itself — the backend's cap minus the core options. */
export const MAX_TEMPLATE_OPTIONS = MAX_OPTIONS - CORE_OPTIONS.length;

/** The manifest as the app sees it: the core options first, then the template's own. Idempotent. */
export function withCoreOptions(manifest: TemplateManifest): TemplateManifest {
  const own = manifest.options.filter((o) => !CORE_OPTION_KEYS.includes(o.key));
  return { ...manifest, options: [...CORE_OPTIONS.map((o) => ({ ...o })), ...own] };
}

/** Identity — exists so manifests are type-checked against the contract. */
export function defineTemplate(manifest: TemplateManifest): TemplateManifest {
  return manifest;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function fontErrors(font: unknown, where: string): string[] {
  if (font === null) return [];
  // Mirrors the backend's fontSpec.family: trim().min(1) — a family that is only whitespace
  // matches FONT_FAMILY_RE (it allows spaces) but must still be rejected.
  if (!isObj(font) || !isStr(font.family) || !FONT_FAMILY_RE.test(font.family) || !font.family.trim()) return [`${where}: font family must match ${FONT_FAMILY_RE}`];
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
  if (schemes.length === 0 || !schemes.every((s) => s === 'dark' || s === 'light') || new Set(schemes).size !== schemes.length) {
    err('schemes must list dark and/or light, each at most once');
  }

  const presets = Array.isArray(m.presets) ? m.presets : [];
  if (presets.length === 0) err('at least one preset is required');
  else if (presets.length > MAX_PRESETS) err(`at most ${MAX_PRESETS} presets`);
  const presetIds = new Set<string>();
  for (const p of presets) {
    const where = `preset "${isObj(p) ? String(p.id) : '?'}"`;
    if (!isObj(p) || !isStr(p.id) || !TEMPLATE_ID_RE.test(p.id)) { err(`${where}: id must match ${TEMPLATE_ID_RE}`); continue; }
    if (presetIds.has(p.id)) err(`${where}: duplicate preset id`);
    presetIds.add(p.id);
    if (!isStr(p.name)) err(`${where}: name is required`);
    else if (p.name.length > PRESET_NAME_MAX) err(`${where}: name must be at most ${PRESET_NAME_MAX} characters`);
    if (!schemes.includes(p.scheme as Scheme)) err(`${where}: scheme "${String(p.scheme)}" is not in schemes`);
    const colors = isObj(p.colors) ? p.colors : ({} as Record<string, unknown>);
    for (const k of COLOR_KEYS) if (typeof colors[k] !== 'string' || !HEX_RE.test(colors[k] as string)) err(`${where}: colors.${k} must be a 6-digit hex`);
    const fonts = isObj(p.fonts) ? p.fonts : ({} as Record<string, unknown>);
    for (const slot of ['heading', 'body', 'mono'] as const) e.push(...fontErrors(fonts[slot] ?? null, `${folderId}: ${where}.fonts.${slot}`));
    if (!RADII.includes(p.radius as RadiusName)) err(`${where}: radius must be one of ${RADII.join(', ')}`);
  }
  if (!isStr(m.defaultPreset) || !presetIds.has(m.defaultPreset)) err(`defaultPreset "${String(m.defaultPreset)}" is not one of the presets`);

  if (!isObj(m.tokens)) err('tokens are required');
  else e.push(...tokenErrors(m.tokens).map((msg) => `${folderId}: ${msg}`));
  const ed: Record<string, unknown> = isObj(m.editable) ? m.editable : {};
  if (!Array.isArray(ed.colors) || !ed.colors.every((c) => COLOR_KEYS.includes(c))) err('editable.colors must be a subset of the colour keys');
  else if (new Set(ed.colors).size !== ed.colors.length) err('editable.colors must list each colour key at most once');
  for (const k of ['fonts', 'radius', 'density'] as const) if (typeof ed[k] !== 'boolean') err(`editable.${k} must be a boolean`);

  const options = Array.isArray(m.options) ? m.options : [];
  if (options.length > MAX_TEMPLATE_OPTIONS) err(`at most ${MAX_TEMPLATE_OPTIONS} options (${CORE_OPTIONS.length} more are added to every template)`);
  const keys = new Set<string>();
  for (const o of options as unknown[]) {
    if (!isObj(o) || !isStr(o.key) || !OPTION_KEY_RE.test(o.key)) { err(`option key must match ${OPTION_KEY_RE}`); continue; }
    if (CORE_OPTION_KEYS.includes(o.key)) err(`option key "${o.key}" is reserved — every template already has it as a core option`);
    else if (keys.has(o.key)) err(`duplicate option key "${o.key}"`);
    keys.add(o.key);
    if (!isStr(o.label)) err(`option "${o.key}": label is required`);
    else if (o.label.length > OPTION_LABEL_MAX) err(`option "${o.key}": label must be at most ${OPTION_LABEL_MAX} characters`);
    if (o.help !== undefined && (typeof o.help !== 'string' || o.help.length > OPTION_HELP_MAX)) err(`option "${o.key}": help must be a string of at most ${OPTION_HELP_MAX} characters`);
    if (o.type === 'boolean') { if (typeof o.default !== 'boolean') err(`option "${o.key}": default must be boolean`); }
    else if (o.type === 'select') {
      const choices = Array.isArray(o.choices) ? o.choices : [];
      if (choices.length === 0 || choices.length > MAX_CHOICES) err(`option "${o.key}": choices must list 1..${MAX_CHOICES} entries`);
      const textIn = (v: unknown, max: number) => typeof v === 'string' && v.length >= 1 && v.length <= max;
      if (!choices.every((c) => isObj(c) && textIn(c.value, CHOICE_VALUE_MAX))) err(`option "${o.key}": choice values must be 1..${CHOICE_VALUE_MAX} characters`);
      if (!choices.every((c) => isObj(c) && textIn(c.label, CHOICE_LABEL_MAX))) err(`option "${o.key}": choice labels must be 1..${CHOICE_LABEL_MAX} characters`);
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
