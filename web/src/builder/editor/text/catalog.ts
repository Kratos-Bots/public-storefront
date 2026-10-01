// web/src/builder/editor/text/catalog.ts
import { matchesTextPattern, TEXT_AREAS, TEXT_ENTRIES, type TextKey } from '@/text/registry.ts';
import { formsOf, placeholdersOf as entryPlaceholders } from '@/text/define.ts';
import { SITE_WIDE_TEXT } from '@/text/site-wide.ts';
import { TEXT_LABELS, TEXT_NOTES } from '@/text/notes/index.ts';
import { BLOCKS } from '@/builder/registry.ts';
import { DEFAULT_MAX, type TextValue } from '@/text/types.ts';

/**
 * The registry (Plan 2, spec §6.1) as the editor lists it: one row per key an owner may edit.
 * Limits, placeholders, patterns and area order are the shopper registry's own (`@/text`), so the
 * editor can't drift from what the resolver accepts.
 */

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

export { DEFAULT_MAX };
export const MULTILINE_OVER = 60;
export const SITE_WIDE_GROUP = 'site-wide';

/** Titles of the spec §6.1 areas. `closed` and `boot` are fixed and never listed. */
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
/** The registry's area order (Text panel order). */
const AREA_ORDER: readonly string[] = TEXT_AREAS;

const REGISTRY = TEXT_ENTRIES;

/** The resolver's placeholder set (`@/text/define.ts`), as chips: `count` first for a plural. */
export function placeholdersOf(def: TextValue, plural: boolean): string[] {
  const names = [...entryPlaceholders({ en: def })];
  return plural ? ['count', ...names.filter((n) => n !== 'count')] : names;
}

/** The fallback label where TEXT_LABELS has none: the last key segment in words ("paymentMissing", "hero-title"). */
export function labelFromKey(key: string): string {
  const last = key.slice(key.lastIndexOf('.') + 1);
  const words = last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').trim().toLowerCase();
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
      multiline: Math.max(...formsOf(e.en).map((f) => f.length)) > MULTILINE_OVER,
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
export const matchesPattern = matchesTextPattern;

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
  return [row.key, row.label, row.note, ...formsOf(row.def), ...extra].some((s) => s.toLowerCase().includes(q));
}
