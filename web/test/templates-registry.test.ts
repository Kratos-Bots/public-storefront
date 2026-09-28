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
