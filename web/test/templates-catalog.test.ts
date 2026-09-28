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
