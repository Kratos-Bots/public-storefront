import { describe, expect, it } from 'vitest';
import { builderIsolation, findLeaks } from '../vite-plugins/builder-isolation.ts';

const chunk = (fileName: string, opts: { isEntry?: boolean; imports?: string[]; dynamicImports?: string[]; moduleIds?: string[] }) => ({
  type: 'chunk' as const, fileName, isEntry: opts.isEntry ?? false, imports: opts.imports ?? [], dynamicImports: opts.dynamicImports ?? [], moduleIds: opts.moduleIds ?? [],
});

describe('builder isolation', () => {
  it('passes when Puck lives only behind a dynamic import', () => {
    const bundle = {
      'index.js': chunk('index.js', { isEntry: true, imports: ['vendor.js'], dynamicImports: ['EditorApp.js'], moduleIds: ['/w/src/main.tsx'] }),
      'vendor.js': chunk('vendor.js', { moduleIds: ['/w/node_modules/react/index.js'] }),
      'EditorApp.js': chunk('EditorApp.js', { moduleIds: ['/w/src/builder/editor/EditorApp.tsx', '/w/node_modules/@puckeditor/core/dist/index.mjs'] }),
      'style.css': { type: 'asset' as const, fileName: 'style.css' },
    };
    expect(findLeaks(bundle)).toEqual([]);
  });

  it.each([
    ['@puckeditor/core', '/w/node_modules/@puckeditor/core/dist/chunk-X.mjs'],
    ['tiptap', 'C:\\w\\node_modules\\@tiptap\\core\\dist\\index.js'],
    ['dnd-kit', '/w/node_modules/@dnd-kit/react/index.js'],
    ['an editor module', '/w/src/builder/editor/protocol.ts'],
  ])('fails when %s is statically reachable from the entry', (_label, id) => {
    const bundle = {
      'index.js': chunk('index.js', { isEntry: true, imports: ['shared.js'] }),
      'shared.js': chunk('shared.js', { moduleIds: [id] }),
    };
    expect(findLeaks(bundle)).toEqual([`shared.js: ${id}`]);
  });

  it('fails when a shopper lazy chunk statically imports a shared chunk holding Puck', () => {
    const bundle = {
      'index.js': chunk('index.js', { isEntry: true, dynamicImports: ['CartPage.js', 'EditorApp.js'] }),
      'CartPage.js': chunk('CartPage.js', { imports: ['shared.js'] }),
      'shared.js': chunk('shared.js', { moduleIds: ['/w/node_modules/@puckeditor/core/dist/x.mjs'] }),
      'EditorApp.js': chunk('EditorApp.js', { imports: ['shared.js'], moduleIds: ['/w/src/builder/editor/EditorApp.tsx'] }),
    };
    expect(findLeaks(bundle)).toEqual(['shared.js: /w/node_modules/@puckeditor/core/dist/x.mjs']);
  });

  it('passes when the shared chunk is reachable only from the editor chunk', () => {
    const bundle = {
      'index.js': chunk('index.js', { isEntry: true, dynamicImports: ['CartPage.js', 'EditorApp.js'] }),
      'CartPage.js': chunk('CartPage.js', {}),
      'shared.js': chunk('shared.js', { moduleIds: ['C:\\w\\node_modules\\@tiptap\\core\\index.js'] }),
      'EditorApp.js': chunk('EditorApp.js', { imports: ['shared.js'], moduleIds: ['C:\\w\\src\\builder\\editor\\EditorApp.tsx'] }),
    };
    expect(findLeaks(bundle)).toEqual([]);
  });

  it('matches Windows-path editor modules in a lazy shopper chunk', () => {
    const id = 'C:\\w\\src\\builder\\editor\\protocol.ts';
    const bundle = {
      'index.js': chunk('index.js', { isEntry: true, dynamicImports: ['Lazy.js'] }),
      'Lazy.js': chunk('Lazy.js', { moduleIds: [id] }),
    };
    expect(findLeaks(bundle)).toEqual([`Lazy.js: ${id}`]);
  });

  it('errors when there is no entry chunk', () => {
    expect(findLeaks({ 'a.js': chunk('a.js', {}) })).toHaveLength(1);
  });

  it('the plugin hook errors when a shopper-graph module imports @puckeditor/core', () => {
    const bundle = {
      'index.js': chunk('index.js', { isEntry: true, moduleIds: ['/w/src/blocks/Leaky.tsx', '/w/node_modules/@puckeditor/core/dist/index.mjs'] }),
    };
    const plugin = builderIsolation();
    const hook = plugin.generateBundle as (this: { error: (m: string) => never }, o: unknown, b: unknown) => void;
    const ctx = { error: (m: string): never => { throw new Error(m); } };
    expect(() => hook.call(ctx, {}, bundle)).toThrow(/reached the shopper bundle[\s\S]*@puckeditor[\\/]core/);
    expect(() => hook.call(ctx, {}, { 'index.js': chunk('index.js', { isEntry: true }) })).not.toThrow();
  });
});
