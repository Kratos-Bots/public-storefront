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
  it('gives every registered template the core options, defaulting to shown everywhere with the built-in wording', () => {
    const defaults: [string, string, boolean | string][] = [
      ['showPageTitle', 'boolean', true],
      ['showCatalogIntro', 'boolean', true],
      ['showSectionLabels', 'boolean', true],
      ['showSku', 'boolean', true],
      ['showCategoryPicker', 'boolean', true],
      ['headerAccountIcon', 'select', 'all'],
      ['headerCartIcon', 'select', 'all'],
      ['showCutoffBar', 'boolean', true],
      ['cutoffMessage', 'text', ''],
      ['showCutoffCountdown', 'boolean', true],
    ];
    for (const { manifest } of REGISTRY.values()) {
      for (const [key, type, def] of defaults) {
        expect(manifest.options.find((o) => o.key === key), `${manifest.id}.${key}`).toMatchObject({ type, default: def });
      }
    }
    expect(lookupManifest('modern').options.map((o) => o.key)).toEqual(defaults.map(([key]) => key));
  });
  it('skips a template that redeclares a core option key', () => {
    const warn = vi.fn();
    const reg = buildRegistry(
      { './modern/manifest.ts': modern, './greedy/manifest.ts': { ...modern, id: 'greedy', options: [{ key: 'showPageTitle', type: 'boolean', label: 'x', default: false }] } },
      { './modern/index.ts': load, './greedy/index.ts': load },
      warn,
    );
    expect(reg.has('greedy')).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('reserved'));
  });
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
