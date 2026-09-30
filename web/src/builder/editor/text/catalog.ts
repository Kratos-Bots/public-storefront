// web/src/builder/editor/text/catalog.ts
import { TEXT, type TextKey } from '@/text/registry.ts';
import { SITE_WIDE_TEXT } from '@/text/site-wide.ts';
import { TEXT_LABELS, TEXT_NOTES } from '@/text/notes/index.ts';
import { BLOCKS } from '@/builder/registry.ts';
import type { TextValue } from '@/text/types.ts';

/** The registry (Plan 2, spec §6.1) as the editor lists it: one row per key an owner may edit. */

interface Entry { en: TextValue; max?: number; fixed?: boolean }

export interface TextRowDef {
  key: TextKey;
  area: string;
  label: string;
  note: string;
  def: TextValue;
  max: number;
  plural: boolean;
  placeholders: readonly string[];
  /** A textarea instead of a one-line input (spec §7.2: default over 60 chars). */
  multiline: boolean;
}

export const DEFAULT_MAX = 200;
export const MULTILINE_OVER = 60;
export const SITE_WIDE_GROUP = 'site-wide';

/** Spec §6.1 areas, in Text panel order. `closed` and `boot` are fixed and never listed. */
export const AREA_TITLES: Record<string, string> = {
  common: 'Common',
  shell: 'Header, footer and menus',
  catalog: 'Catalogue',
  product: 'Product page',
  cart: 'Cart',
  checkout: 'Checkout',
  auth: 'Sign-in',
  account: 'Account',
  order: 'Order status',
  payment: 'Payment and order placed',
  tracking: 'Tracking',
  verify: 'Product check',
  wholesale: 'Wholesale',
  webapp: 'Telegram buttons',
  notices: 'Notices',
  errors: 'Error messages',
  templates: 'Template',
};
const AREA_ORDER = Object.keys(AREA_TITLES);

const REGISTRY = TEXT as unknown as Record<string, Entry>;
const NAME_RE = /\{([A-Za-z][A-Za-z0-9]{0,31})\}/g;

const forms = (v: TextValue): string[] => (typeof v === 'string' ? [v] : Object.values(v).filter((s): s is string => typeof s === 'string'));

export function placeholdersOf(def: TextValue, plural: boolean): string[] {
  const names = new Set<string>(plural ? ['count'] : []);
  for (const f of forms(def)) for (const m of f.matchAll(NAME_RE)) names.add(m[1]!);
  return [...names];
}

export function labelFromKey(key: string): string {
  const last = key.slice(key.lastIndexOf('.') + 1);
  const words = last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

let rows: TextRowDef[] | null = null;
let byKey: Map<string, TextRowDef> | null = null;

export function allRows(): readonly TextRowDef[] {
  if (rows) return rows;
  rows = [];
  for (const [key, e] of Object.entries(REGISTRY)) {
    if (e.fixed) continue;
    const plural = typeof e.en !== 'string';
    rows.push({
      key: key as TextKey,
      area: key.slice(0, key.indexOf('.')),
      label: TEXT_LABELS[key] ?? labelFromKey(key),
      note: TEXT_NOTES[key] ?? '',
      def: e.en,
      max: e.max ?? DEFAULT_MAX,
      plural,
      placeholders: placeholdersOf(e.en, plural),
      multiline: Math.max(...forms(e.en).map((f) => f.length)) > MULTILINE_OVER,
    });
  }
  byKey = new Map(rows.map((r) => [r.key, r]));
  return rows;
}

export function rowFor(key: string): TextRowDef | null {
  allRows();
  return byKey!.get(key) ?? null;
}

export const isFixedKey = (key: string): boolean => Object.hasOwn(REGISTRY, key) && REGISTRY[key]!.fixed === true;

/** Exact key, or `area.part.*` = every key starting with `area.part.` (spec §7.3). */
export function matchesPattern(key: string, pattern: string): boolean {
  return pattern.endsWith('.*') ? key.startsWith(pattern.slice(0, -1)) : key === pattern;
}

/**
 * `templates.<id>.*` keys belong to one template; the panel shows only the active one's, plus
 * `templates.default.*` — Plan 2's built-in slots, rendered by every template without its own slot.
 */
export const isForTemplate = (key: string, templateId: string): boolean =>
  !key.startsWith('templates.') || key.startsWith('templates.default.') || key.startsWith(`templates.${templateId}.`);

export function rowsMatching(patterns: readonly string[], templateId: string): TextRowDef[] {
  return allRows().filter((r) => isForTemplate(r.key, templateId) && patterns.some((p) => matchesPattern(r.key, p)));
}

export function blockTextRows(blockName: string, templateId: string): TextRowDef[] {
  const patterns = Object.hasOwn(BLOCKS, blockName) ? BLOCKS[blockName]!.text : undefined;
  return patterns ? rowsMatching(patterns, templateId) : [];
}

export interface TextGroup { id: string; title: string; rows: TextRowDef[] }

/** Site-wide (system mounts, spec §7.3) first; then one group per area. A key appears once. */
export function textGroups(templateId: string): TextGroup[] {
  const siteWide = rowsMatching(SITE_WIDE_TEXT, templateId);
  const taken = new Set<string>(siteWide.map((r) => r.key));
  const byArea = new Map<string, TextRowDef[]>();
  for (const r of allRows()) {
    if (taken.has(r.key) || !isForTemplate(r.key, templateId)) continue;
    const list = byArea.get(r.area) ?? [];
    list.push(r);
    byArea.set(r.area, list);
  }
  const areas = [...AREA_ORDER, ...[...byArea.keys()].filter((a) => !AREA_ORDER.includes(a))];
  const groups: TextGroup[] = [{ id: SITE_WIDE_GROUP, title: 'Site-wide', rows: siteWide }];
  for (const area of areas) groups.push({ id: area, title: AREA_TITLES[area] ?? labelFromKey(area), rows: byArea.get(area) ?? [] });
  return groups.filter((g) => g.rows.length > 0);
}

export function rowMatches(row: TextRowDef, query: string, extra: readonly string[] = []): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [row.key, row.label, row.note, ...forms(row.def), ...extra].some((s) => s.toLowerCase().includes(q));
}
