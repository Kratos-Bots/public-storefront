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
