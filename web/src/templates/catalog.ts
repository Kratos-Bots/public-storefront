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
