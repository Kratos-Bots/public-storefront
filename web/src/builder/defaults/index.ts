import type { DefaultEntry } from '@/builder/defaults/helpers.ts';
import type { DocKey, LayoutKind, PuckDoc } from '@/builder/types.ts';

const LAYOUTS: readonly LayoutKind[] = ['storefront', 'menu', 'webapp'];

export function buildDefaultTable(groups: Record<string, { DEFAULTS?: DefaultEntry[] }>): Map<string, PuckDoc> {
  const table = new Map<string, PuckDoc>();
  for (const [path, mod] of Object.entries(groups)) {
    for (const entry of mod.DEFAULTS ?? []) {
      for (const layout of entry.layouts === 'all' ? LAYOUTS : entry.layouts) {
        const key = `${layout}|${entry.docKey}`;
        if (table.has(key)) throw new Error(`[builder] two default documents for ${key} (${path})`);
        table.set(key, entry.doc);
      }
    }
  }
  return table;
}

/** One group file per concern: groups/{shell,catalogue,commerce,account,post-order}.ts. */
const TABLE = buildDefaultTable(import.meta.glob<{ DEFAULTS?: DefaultEntry[] }>('./groups/*.ts', { eager: true }));

/** The built-in document for a route (v0.6.0's page), or null for custom pages (spec §13 A7). */
export function defaultDoc(docKey: DocKey, layout: LayoutKind): PuckDoc | null {
  if (docKey.startsWith('page:')) return null;
  return TABLE.get(`${layout}|${docKey}`) ?? null;
}
