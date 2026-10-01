import { z } from 'zod';
import type { Field, Fields, SlotField } from '@puckeditor/core';
import { BLOCKS } from '@/builder/registry.ts';
import type { BlockDef } from '@/builder/define.ts';
import { allowedOn } from '@/builder/rules.ts';
import { offersPart, type PartFamily } from '@/builder/parts.ts';
import { CARD_KINDS, cardKey, FIXED_ROUTE_KEYS, isCardKey, type DocKey, type LayoutKind } from '@/builder/types.ts';
import { insertableBlocks } from '@/builder/editor/route-bound.ts';
import { routeLinkField } from '@/builder/editor/custom-fields/route-link.tsx';
import { imageField } from '@/builder/editor/custom-fields/image.tsx';
import { richtextField } from '@/builder/editor/custom-fields/richtext.tsx';
import { humanizeValue, paletteTokenField } from '@/builder/editor/custom-fields/palette-token.tsx';
import { categoryPickerField, productPickerField } from '@/builder/editor/custom-fields/pickers.ts';
import { styleField } from '@/builder/editor/custom-fields/style.tsx';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBlock = BlockDef<any>;

/** The subset of zod 4's JSON-schema output the derivation reads. */
export interface JsonSchema {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
  /** zod 4 emits `positive()` as `exclusiveMinimum: 0`, `negative()` as `exclusiveMaximum: 0`. */
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  default?: unknown;
}

const SPECIAL_LABELS: Record<string, string> = { href: 'Link', src: 'Image' };

export function humanizeKey(key: string): string {
  if (Object.hasOwn(SPECIAL_LABELS, key)) return SPECIAL_LABELS[key]!;
  const base = key.replace(/(Html|Href|Src|Token|Id)$/, '') || key;
  const words = base.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** `X | null` → X; everything else unchanged. */
function unwrapNullable(s: JsonSchema): JsonSchema {
  const alts = s.anyOf ?? s.oneOf;
  if (alts) {
    const rest = alts.filter((a) => a.type !== 'null');
    if (rest.length === 1) return { ...rest[0]!, default: s.default ?? rest[0]!.default };
  }
  if (Array.isArray(s.type)) {
    const rest = s.type.filter((t) => t !== 'null');
    if (rest.length === 1) return { ...s, type: rest[0] };
  }
  return s;
}

function enumValues(s: JsonSchema): Array<string | number | boolean> | null {
  if (Array.isArray(s.enum)) return s.enum as Array<string | number | boolean>;
  const alts = s.anyOf ?? s.oneOf;
  if (alts && alts.length > 0 && alts.every((a) => 'const' in a)) return alts.map((a) => a.const as string | number | boolean);
  return null;
}

/** Inclusive bounds for a number field (an exclusive integer bound tightens by one). */
function numberBounds(s: JsonSchema): { min?: number; max?: number } {
  const step = s.type === 'integer' ? 1 : 0;
  const min = s.minimum ?? (s.exclusiveMinimum !== undefined ? s.exclusiveMinimum + step : undefined);
  const max = s.maximum ?? (s.exclusiveMaximum !== undefined ? s.exclusiveMaximum - step : undefined);
  return { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
}

function defaultValue(s: JsonSchema): unknown {
  const u = unwrapNullable(s);
  if (u.default !== undefined) return u.default;
  const values = enumValues(u);
  if (values) return values[0];
  switch (u.type) {
    case 'string': return '';
    case 'number': case 'integer': return numberBounds(u).min ?? 0;
    case 'boolean': return false;
    case 'array': return [];
    case 'object': return Object.fromEntries(Object.entries(u.properties ?? {}).map(([k, v]) => [k, defaultValue(v)]));
    default: return null;
  }
}

function objectFields(s: JsonSchema): Fields | null {
  const out: Fields = {};
  for (const [key, prop] of Object.entries(s.properties ?? {})) {
    const f = fieldFor(key, prop);
    if (!f) return null;
    out[key] = f;
  }
  return out;
}

/** Prop name first (spec §6 custom fields, A2 richtext), then JSON-schema type. null = no safe mapping. */
export function fieldFor(key: string, raw: JsonSchema): Field | null {
  const s = unwrapNullable(raw);
  const label = humanizeKey(key);
  const values = enumValues(s);
  if (key.endsWith('Html')) return richtextField(label);
  if (key === 'href' || key.endsWith('Href')) return routeLinkField(label) as Field;
  if (key === 'src' || key.endsWith('Src')) return imageField(label) as Field;
  if (key.endsWith('Token') && values) return paletteTokenField(label, values.map(String)) as Field;
  if (key === 'productId' || key.endsWith('ProductId')) return productPickerField(label) as Field;
  if (key === 'categoryId' || key.endsWith('CategoryId')) return categoryPickerField(label) as Field;
  if (values) {
    const options = values.map((v) => ({ label: typeof v === 'boolean' ? (v ? 'On' : 'Off') : humanizeValue(String(v)), value: v }));
    return values.length <= 3 ? { type: 'radio', label, options } : { type: 'select', label, options };
  }
  switch (s.type) {
    case 'boolean':
      return { type: 'radio', label, options: [{ label: 'On', value: true }, { label: 'Off', value: false }] };
    case 'number':
    case 'integer':
      return { type: 'number', label, ...numberBounds(s) };
    case 'string':
      return (s.maxLength ?? 0) > 200 ? { type: 'textarea', label } : { type: 'text', label };
    case 'array': {
      const item = s.items ? unwrapNullable(s.items) : null;
      if (!item || item.type !== 'object') return null;
      // Backend contract: array items carrying both `type` and `props` are read as components
      // (slots). A non-slot array shaped like that must be reported, not edited.
      if (item.properties && 'type' in item.properties && 'props' in item.properties) return null;
      const arrayFields = objectFields(item);
      if (!arrayFields) return null;
      const firstText = Object.entries(item.properties ?? {}).find(([, p]) => unwrapNullable(p).type === 'string')?.[0];
      return {
        type: 'array',
        label,
        arrayFields,
        defaultItemProps: defaultValue(item) as Record<string, unknown>,
        getItemSummary: (row: Record<string, unknown>, i?: number) =>
          (firstText && typeof row[firstText] === 'string' && (row[firstText] as string).trim()) || `Item ${(i ?? 0) + 1}`,
        ...(s.minItems !== undefined && s.minItems > 0 ? { min: s.minItems } : {}),
        ...(s.maxItems !== undefined ? { max: s.maxItems } : {}),
      } as Field;
    }
    case 'object': {
      const sub = objectFields(s);
      return sub ? ({ type: 'object', label, objectFields: sub } as Field) : null;
    }
    default:
      return null;
  }
}

function toJson(def: AnyBlock): JsonSchema {
  return z.toJSONSchema(def.schema, { unrepresentable: 'any', io: 'input' }) as JsonSchema;
}

export const schemaKeys = (def: AnyBlock): string[] => Object.keys(toJson(def).properties ?? {});

export function deriveFields(def: AnyBlock): { fields: Fields; uncovered: string[] } {
  const fields: Fields = {};
  const uncovered: string[] = [];
  const slots = new Set<string>(def.slots);
  // Product-parts §8: legacy toggles are read only while slots are absent — never edited.
  const legacy = new Set<string>(def.container?.legacyProps ?? []);
  for (const [key, prop] of Object.entries(toJson(def).properties ?? {})) {
    if (slots.has(key) || legacy.has(key)) continue; // a slot is `ComponentData[]`, not an editable array
    const f = fieldFor(key, prop);
    if (f) fields[key] = f;
    else uncovered.push(key);
  }
  for (const slot of def.slots) fields[slot] = { type: 'slot', label: humanizeKey(slot) };
  return { fields, uncovered };
}

// ── slot allow lists ─────────────────────────────────────────────────────────

/** A custom page stands in for every `page:<slug>`: placement treats them all alike. */
const EVERY_DOC: readonly DocKey[] = ['shell', ...FIXED_ROUTE_KEYS, 'page:any'];

const ALL_LAYOUTS: readonly LayoutKind[] = ['storefront', 'menu', 'webapp'];
const inLayout = (d: AnyBlock, layout: LayoutKind) => d.layouts === 'all' || d.layouts.includes(layout);

/** Where a block may sit: every doc a slot can be on, card designs included (they take only frames and parts). */
const BLOCK_HOMES: readonly DocKey[] = [...EVERY_DOC, ...CARD_KINDS.map(cardKey)];

/** Blocks accepted on every one of `docs` in every one of `layouts`. */
function acceptedOnAll(docs: readonly DocKey[], layouts: readonly LayoutKind[]): string[] {
  return Object.values(BLOCKS)
    .filter((d) => layouts.every((l) => inLayout(d, l)) && docs.every((k) => allowedOn(d.name, k)))
    .map((d) => d.name);
}

/**
 * Blocks no doc and no layout refuses (plain content and the non-chrome shell pieces): what a slot
 * can safely accept when nothing is known about where its block sits.
 */
export function slotAllowEverywhere(): string[] {
  return acceptedOnAll(EVERY_DOC, ALL_LAYOUTS);
}

const notRouteOrContainer = (n: string): boolean => !BLOCKS[n]!.routeBound && !BLOCKS[n]!.container;

/** The part family a candidate belongs to, or null for a non-part. */
const familyOfBlock = (n: string): PartFamily | null => BLOCKS[n]?.part?.family ?? null;

/**
 * Spec §3.4, stage 4 §4: a container slot takes its family's parts (only those this container
 * offers), content and non-route blocks — `slotAccepts` narrows it to exactly the listed types.
 * Then `slotRejects[slot]` types come out, and the containers it `nests` go in when they may sit on
 * every doc in `docs` (and every layout in `layouts`): they own their own parts.
 */
function containerSlotAllow(
  def: AnyBlock, slot: string, candidates: readonly string[], docs: readonly DocKey[], layouts: readonly LayoutKind[],
): string[] {
  const spec = def.container!;
  const only = spec.slotAccepts && Object.hasOwn(spec.slotAccepts, slot) ? spec.slotAccepts[slot]! : null;
  const rejects = spec.slotRejects && Object.hasOwn(spec.slotRejects, slot) ? spec.slotRejects[slot]! : [];
  const base = candidates.filter((n) => {
    if (rejects.includes(n)) return false;
    if (only) return only.includes(n);
    if (!notRouteOrContainer(n)) return false;
    const family = familyOfBlock(n);
    return family === null || (family === spec.family && offersPart(spec, n));
  });
  const nested = (spec.nests ?? []).filter((n) => !rejects.includes(n) && !base.includes(n) && Object.hasOwn(BLOCKS, n)
    && docs.length > 0 && docs.every((k) => allowedOn(n, k)) && layouts.every((l) => inLayout(BLOCKS[n]!, l)));
  return [...base, ...nested];
}

/**
 * A group's slots take only parts its container offers: of its own family, offered by a container
 * of that family on one of `docs` (the doc being edited, or every doc the family lives on).
 */
function groupSlotAllow(def: AnyBlock, candidates: readonly string[], docs: readonly DocKey[]): string[] {
  const family = def.part!.family;
  const owners = Object.values(BLOCKS).filter((b) => b.container?.family === family && docs.some((k) => allowedOn(b.name, k)));
  return candidates.filter((n) => {
    if (!notRouteOrContainer(n)) return false;
    const f = familyOfBlock(n);
    return f === null || (f === family && owners.some((o) => offersPart(o.container!, n)));
  });
}

/** A slot inside a container (the container's own, or a part's — a group's) never holds a route block or a container. */
function slotList(def: AnyBlock, slot: string | undefined, candidates: readonly string[], docs: readonly DocKey[], layouts: readonly LayoutKind[]): string[] {
  if (def.container) return slot ? containerSlotAllow(def, slot, candidates, docs, layouts) : candidates.filter(notRouteOrContainer);
  return def.part ? groupSlotAllow(def, candidates, docs) : [...candidates];
}

/**
 * The static allow list for `name`'s slots. A slot's children count toward the doc they sit in, so
 * without knowing the doc a slot may accept only what every doc and layout the block itself can be
 * in accepts: `slotAllowEverywhere()` for a block that goes anywhere, more for a route block (the
 * cart's CartContents.summary takes CartSummary). `scopeFields` narrows or widens it to one doc.
 */
export function slotAllowFor(name: string, slot?: string): string[] {
  const def = Object.hasOwn(BLOCKS, name) ? BLOCKS[name] : undefined;
  if (!def) return [];
  const docs = BLOCK_HOMES.filter((k) => allowedOn(name, k));
  const layouts = ALL_LAYOUTS.filter((l) => inLayout(def, l));
  return docs.length === 0 || layouts.length === 0 ? [] : slotList(def, slot, acceptedOnAll(docs, layouts), docs, layouts);
}

/**
 * Used by every fields/<Block>.ts: derived fields (slots carrying the static allow list), with that
 * block's overrides on top, then — for a stylable block — the Style group (`blockStyle`) last.
 */
export function blockFields(name: string, overrides: Fields = {}): Fields {
  const def = Object.hasOwn(BLOCKS, name) ? BLOCKS[name] : undefined;
  if (!def) throw new Error(`Unknown block ${name}`);
  const { fields } = deriveFields(def);
  for (const slot of def.slots) fields[slot] = { ...(fields[slot] as SlotField), allow: slotAllowFor(name, slot) };
  const out: Fields = { ...fields, ...overrides };
  // The Style group always comes last, after any overrides (block-styling spec §9.1).
  if (def.style) out.blockStyle = styleField(def) as Field;
  return out;
}

/** Header variants that only render in one layout: `auto` follows the layout, `webapp` falls back to `menu` outside the web app. */
const HEADER_VARIANT_HIDDEN: Record<LayoutKind, readonly string[]> = { storefront: ['webapp'], menu: ['webapp'], webapp: ['storefront'] };

/**
 * A block's fields for one doc in one layout (for the editor config): every slot accepts exactly
 * the blocks that doc accepts in that layout (`insertableBlocks`, Plan 2's `allowedOn` + layouts),
 * so the canvas can't drop a disallowed block into a slot; Header hides variants the layout can't render.
 * Returns a new object; fields it doesn't change are passed through by reference.
 */
export function scopeFields(name: string, fields: Fields, docKey: DocKey, layout: LayoutKind): Fields {
  const def = Object.hasOwn(BLOCKS, name) ? BLOCKS[name] : undefined;
  const out: Fields = { ...fields };
  if (def && def.slots.length > 0) {
    const allow = insertableBlocks(docKey, layout);
    for (const slot of def.slots) {
      const f = out[slot] as Field | undefined;
      // In a card doc every slot sits inside the frame: none offers the frame again.
      const list = def.container || def.part ? slotList(def, slot, allow, [docKey], [layout]) : isCardKey(docKey) ? allow.filter(notRouteOrContainer) : [...allow];
      if (f?.type === 'slot') out[slot] = { ...f, allow: list };
    }
  }
  const variant = out.variant as Field | undefined;
  if (name === 'Header' && variant && (variant.type === 'radio' || variant.type === 'select')) {
    const hidden = HEADER_VARIANT_HIDDEN[layout];
    out.variant = { ...variant, options: variant.options.filter((o) => !hidden.includes(String(o.value))) };
  }
  return out;
}
