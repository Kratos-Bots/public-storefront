import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { z } from 'zod';
import type { BlockDef } from '@/builder/define.ts';
import { EditorBlock } from '@/builder/editor/EditorBlock.tsx';
import type { ComponentConfig, Field } from '@puckeditor/core';
import { BLOCKS } from '@/builder/registry.ts';
import { scopeFields } from '@/builder/editor/derive-fields.ts';
import { insertableBlocks } from '@/builder/editor/route-bound.ts';
import {
  blockMenu, buildEditorConfig, EDITOR_FIELDS, editorHints, lockedPresent, prepareDoc, prepareProps,
} from '@/builder/editor/config.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import type { ComponentData, DocKey, PuckDoc } from '@/builder/types.ts';

const NONE: ReadonlySet<string> = new Set();
/** The exactly-one blocks the built-in default doc holds. */
const dflt = (key: DocKey) => lockedPresent(defaultDoc(key, 'storefront')!, key);

const offeredIn = (config: ReturnType<typeof buildEditorConfig>) =>
  Object.values(config.categories ?? {}).flatMap((c) => (c.visible === false ? [] : (c.components ?? []) as string[]));

const doc = (content: ComponentData[]): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content });
const block = (type: string, props: Record<string, unknown> = {}, id = `${type}-1`): ComponentData => ({ type, props: { id, ...props } });

describe('editor config', () => {
  it('registers every block valid for the layout, with its doc-scoped fields and defaults', () => {
    const config = buildEditorConfig('catalog', 'storefront', NONE);
    for (const def of Object.values(BLOCKS)) {
      if (def.layouts !== 'all' && !def.layouts.includes('storefront')) continue;
      expect(config.components[def.name], def.name).toMatchObject({
        label: def.label,
        defaultProps: def.defaultProps,
        fields: scopeFields(def.name, EDITOR_FIELDS[def.name]!, 'catalog', 'storefront'),
      });
    }
  });

  it('scopes slot allow lists to the open doc', () => {
    const catalog = buildEditorConfig('catalog', 'storefront', NONE).components.Section!.fields as Record<string, Field>;
    const slot = Object.values(catalog).find((f) => f.type === 'slot') as { allow?: string[] };
    expect(slot.allow).toEqual(insertableBlocks('catalog', 'storefront'));
    expect(slot.allow).toContain('ProductGrid');
    const about = buildEditorConfig('page:about', 'storefront', NONE).components.Section!.fields as Record<string, Field>;
    expect((Object.values(about).find((f) => f.type === 'slot') as { allow?: string[] }).allow).not.toContain('ProductGrid');
  });

  it("hides the Header variant the layout can't render", () => {
    const variants = (layout: 'storefront' | 'webapp') => {
      const f = (buildEditorConfig('shell', layout, NONE).components.Header!.fields as Record<string, Field>).variant as { options: Array<{ value: unknown }> };
      return f.options.map((o) => o.value);
    };
    expect(variants('webapp')).not.toContain('storefront');
    expect(variants('webapp')).toContain('webapp');
    expect(variants('storefront')).not.toContain('webapp');
  });

  it('locks exactly-one blocks on their own route', () => {
    expect(buildEditorConfig('checkout', 'storefront', NONE).components.CheckoutFlow!.permissions).toEqual({ delete: false, duplicate: false });
    expect(buildEditorConfig('cart', 'storefront', NONE).components.CheckoutFlow!.permissions).toBeUndefined();
    expect(buildEditorConfig('shell', 'storefront', NONE).components.PageOutlet!.permissions).toEqual({ delete: false, duplicate: false });
    expect(buildEditorConfig('catalog', 'storefront', NONE).components.ProductGrid!.permissions).toBeUndefined();
  });

  it('offers only insertable blocks in the drawer and hides the rest', () => {
    const config = buildEditorConfig('page:about', 'storefront', NONE);
    const offered = offeredIn(config);
    expect(offered).toContain('Heading');
    expect(offered).not.toContain('CheckoutFlow');
    expect(offered).not.toContain('PageOutlet');
    expect(offered).not.toContain('Header');
    expect(config.categories?.other).toEqual({ visible: false });
  });

  it("doesn't offer an exactly-one block that is already on its page", () => {
    expect(offeredIn(buildEditorConfig('checkout', 'storefront', dflt('checkout')))).not.toContain('CheckoutFlow');
    expect(offeredIn(buildEditorConfig('shell', 'storefront', dflt('shell')))).not.toContain('PageOutlet');
    expect(blockMenu('cart', 'storefront', dflt('cart')).flatMap((g) => g.blocks.map((b) => b.name))).not.toContain('CartSummary');
    // Missing from a stored doc: offered again, so the page can be repaired.
    expect(offeredIn(buildEditorConfig('checkout', 'storefront', new Set()))).toContain('CheckoutFlow');
    expect(blockMenu('cart', 'storefront', new Set(['CartContents'])).flatMap((g) => g.blocks.map((b) => b.name))).toContain('CartSummary');
    expect(blockMenu('checkout', 'storefront', new Set()).flatMap((g) => g.blocks.map((b) => b.name))).toContain('CheckoutFlow');
  });

  it('reports which locked blocks a doc already holds, nested ones included', () => {
    expect([...lockedPresent(defaultDoc('cart', 'storefront')!, 'cart')].sort()).toEqual(['CartContents', 'CartSummary']);
    expect([...lockedPresent(doc([]), 'checkout')]).toEqual([]);
    expect([...lockedPresent(doc([block('CheckoutFlow')]), 'cart')]).toEqual([]);
  });

  it('menus group by category in a stable order', () => {
    const menu = blockMenu('catalog', 'storefront', NONE);
    expect(menu[0]!.category).toBe('content');
    expect(menu.flatMap((g) => g.blocks.map((b) => b.name))).toContain('ProductGrid');
    expect(menu.every((g) => g.blocks.length > 0)).toBe(true);
  });

  it('gives page docs title/description/chrome fields and the shell none', () => {
    expect(Object.keys(buildEditorConfig('cart', 'storefront', NONE).root!.fields ?? {})).toEqual(['title', 'description', 'chrome']);
    expect(buildEditorConfig('shell', 'storefront', NONE).root!.fields).toEqual({});
  });

  it('caps the root title at 120 and the description at 300 characters as the owner types', () => {
    const fields = buildEditorConfig('cart', 'storefront', NONE).root!.fields as Record<string, Field>;
    const onChange = vi.fn();
    const renderField = (name: 'title' | 'description', value: string) => {
      const f = fields[name] as Extract<Field, { type: 'custom' }>;
      expect(f.type).toBe('custom');
      return render(createElement(() => f.render({ field: f, name, id: `root_${name}`, value, onChange, readOnly: false } as never))).container;
    };
    const title = renderField('title', 'Northbound Supply').querySelector('input')!;
    expect(title).toHaveAttribute('maxlength', '120');
    expect(screen.getByLabelText('Page title (browser tab)')).toBe(title);
    expect(screen.getByText('17 of 120 characters')).toBeInTheDocument();
    cleanup();
    const description = renderField('description', 'x'.repeat(301)).querySelector('textarea')!;
    expect(description).toHaveAttribute('maxlength', '300');
    // A stored value already over the limit shows in full, flagged, so it can be trimmed.
    expect(description).toHaveValue('x'.repeat(301));
    expect(description).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/301 of 300 characters/)).toBeInTheDocument();
  });

  it('keeps unpicked FeaturedProducts rows in the editor but never in what is emitted or previewed', () => {
    const config = buildEditorConfig('page:about', 'storefront', NONE);
    // No resolveData: Puck writes resolved props back into its state, which would delete the row the admin is about to pick.
    expect((config.components.FeaturedProducts as ComponentConfig).resolveData).toBeUndefined();
    const props = { title: 'Picks', source: 'picked', items: [{ productId: 4 }, {}, { productId: 0 }], categoryId: null, limit: 4 };
    expect(prepareProps('FeaturedProducts', props).items).toEqual([{ productId: 4 }]);
    expect(prepareProps('Heading', props)).toBe(props);

    const nested = doc([block('Section', { content: [block('FeaturedProducts', props, 'fp-1')] })]);
    const out = prepareDoc(nested);
    const child = (out.content[0]!.props.content as ComponentData[])[0]!;
    expect(child.props.items).toEqual([{ productId: 4 }]);
    expect((nested.content[0]!.props.content as ComponentData[])[0]!.props.items).toHaveLength(3);
    const clean = doc([block('Heading')]);
    expect(prepareDoc(clean)).toBe(clean);
  });

  it('hints at a double catalogue intro and at the phone-only root categories', () => {
    const hero = block('CatalogHero', { variant: 'custom' });
    expect(editorHints(doc([hero, block('ProductGrid', { intro: 'inherit' })]), 'catalog').map((h) => h.id)).toContain('double-intro');
    expect(editorHints(doc([hero, block('ProductGrid', { intro: 'hide' })]), 'catalog').map((h) => h.id)).not.toContain('double-intro');
    expect(editorHints(doc([block('CatalogHero', { variant: 'template' }), block('ProductGrid', { intro: 'show' })]), 'catalog')).toEqual([]);
    expect(editorHints(doc([block('Section', { content: [block('CategoryNav', {}, 'cn')] })]), 'page:about')).toEqual([
      expect.objectContaining({ id: 'category-nav-roots', blockId: 'cn' }),
    ]);
  });

  it('hints when a root title hides the per-item tab title', () => {
    const titled = (title: string): PuckDoc => ({ root: { props: { title, description: '', chrome: 'shell' } }, content: [] });
    expect(editorHints(titled('Shop'), 'product').map((h) => h.id)).toEqual(['title-overrides-item']);
    expect(editorHints(titled('Shop'), 'order-status').map((h) => h.id)).toEqual(['title-overrides-item']);
    expect(editorHints(titled(''), 'product')).toEqual([]);
    expect(editorHints(titled('Cart'), 'cart')).toEqual([]);
  });

  it('nudges a top-level CartSummary into an empty CartContents summary', () => {
    const outside = doc([block('CartContents', { summary: [] }), block('CartSummary', {}, 'cs')]);
    expect(editorHints(outside, 'cart')).toEqual([expect.objectContaining({ id: 'cart-summary-outside', blockId: 'cs' })]);
    expect(editorHints(defaultDoc('cart', 'storefront')!, 'cart')).toEqual([]);
    const both = doc([block('CartContents', { summary: [block('CartSummary', {}, 'in')] }), block('CartSummary', {}, 'cs')]);
    expect(editorHints(both, 'cart')).toEqual([]);
  });
});

describe('EditorBlock', () => {
  afterEach(cleanup);
  const Boom = (p: { mode: string }) => {
    if (p.mode === 'boom') throw new Error('boom');
    return createElement('p', null, `ok ${p.mode}`);
  };
  const def = {
    name: 'Probe', label: 'Probe', category: 'content', layouts: 'all', routeBound: false, slots: ['content'],
    schema: z.object({ mode: z.string(), count: z.number(), content: z.array(z.unknown()) }),
    defaultProps: { mode: 'default', count: 1, content: [] },
    render: ({ mode, count, content, puck }: { mode: string; count: number; content: () => unknown; puck: { editing: boolean } }) =>
      createElement('div', { 'data-count': count, 'data-editing': String(puck.editing) }, createElement(Boom, { mode }), content() as never),
  } as unknown as BlockDef<Record<string, unknown>>;
  const el = (props: Record<string, unknown>) =>
    createElement(EditorBlock, { def, props: { id: 'p-1', puck: {}, editMode: true, content: () => 'slot!', ...props }, docKey: 'page:about', layout: 'storefront' });

  it('parses settings field by field, keeps slots, and passes the editor context', () => {
    render(el({ mode: 'a', count: 'nope' }));
    expect(screen.getByText('ok a')).toBeInTheDocument();
    const box = screen.getByText('ok a').parentElement!;
    expect(box.dataset.count).toBe('1');
    expect(box.dataset.editing).toBe('true');
    expect(box).toHaveTextContent('slot!');
  });

  it('contains a crash and retries once the settings change', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { container, rerender } = render(el({ mode: 'boom', count: 1 }));
      expect(container.querySelector('[data-sf-builder-block-error]')).not.toBeNull();
      rerender(el({ mode: 'boom', count: 1 }));
      expect(container.querySelector('[data-sf-builder-block-error]')).not.toBeNull();
      rerender(el({ mode: 'fixed', count: 1 }));
      expect(screen.getByText('ok fixed')).toBeInTheDocument();
    } finally {
      warn.mockRestore();
      err.mockRestore();
    }
  });

  it("shows Puck's richtext nodes instead of falling back to the defaults", () => {
    const body = createElement('p', null, 'Inline body');
    const { container } = render(createElement(EditorBlock, {
      def: BLOCKS.RichText!, props: { id: 'rt', bodyHtml: body, width: 'narrow', puck: {}, editMode: true }, docKey: 'page:about', layout: 'storefront',
    }));
    expect(screen.getByText('Inline body')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('Tell shoppers something worth knowing.');
    cleanup();

    const answer = createElement('p', null, 'Inline answer');
    render(createElement(EditorBlock, {
      def: BLOCKS.FAQ!,
      props: { ...BLOCKS.FAQ!.defaultProps, id: 'faq', items: [{ question: 'Do you ship abroad?', answerHtml: answer }], puck: {}, editMode: true },
      docKey: 'page:about', layout: 'storefront',
    }));
    expect(screen.getByText('Do you ship abroad?')).toBeInTheDocument();
    expect(screen.getByText('Inline answer')).toBeInTheDocument();
    expect(screen.queryByText('How fast do you ship?')).toBeNull();
  });

  it('keeps a custom catalogue intro with only an inline richtext body (no title) on the canvas', () => {
    const body = createElement('p', null, 'Inline intro');
    const { container } = render(createElement(EditorBlock, {
      def: BLOCKS.CatalogHero!,
      props: { ...BLOCKS.CatalogHero!.defaultProps, id: 'hero', variant: 'custom', title: '', bodyHtml: body, puck: {}, editMode: true },
      docKey: 'catalog', layout: 'storefront',
    }));
    expect(screen.getByText('Inline intro')).toBeInTheDocument();
    expect(container.querySelector('[data-sf-builder-block-error]')).toBeNull();
    expect(container.querySelector('[data-sf-builder-empty]')).toBeNull();
  });

  it('shows an editor-only placeholder while a block renders nothing, and drops it once it has content', async () => {
    const el = (text: string) => createElement(EditorBlock, {
      def: BLOCKS.Heading!, props: { ...BLOCKS.Heading!.defaultProps, id: 'h', text, puck: {}, editMode: true }, docKey: 'page:about', layout: 'storefront',
    });
    const { container, rerender } = render(el('   '));
    expect(container.querySelector('[data-sf-builder-empty]')).toHaveTextContent('Heading has nothing to show yet');
    rerender(el('Our story'));
    expect(screen.getByText('Our story')).toBeInTheDocument();
    // The watcher is a MutationObserver: it reports after the DOM change, not during the render.
    await vi.waitFor(() => expect(container.querySelector('[data-sf-builder-empty]')).toBeNull());
  });

  it('draws the page outlet as a placeholder', () => {
    const { container } = render(createElement(EditorBlock, { def: BLOCKS.PageOutlet!, props: { id: 'o' }, docKey: 'shell', layout: 'storefront' }));
    expect(container.querySelector('[data-sf-builder-outlet]')).toHaveTextContent('Page content appears here');
  });

  it('stands pages on the shop ground inside the shell content column; the shell gets the ground only', () => {
    const renderRoot = (docKey: DocKey, layout: 'storefront' | 'menu') => {
      const root = buildEditorConfig(docKey, layout, NONE).root!;
      return render(createElement(() => (root.render as (p: { children: string }) => ReturnType<typeof createElement>)({ children: 'page' }))).container;
    };
    const page = renderRoot('catalog', 'menu');
    expect(page.querySelector('[data-sf-builder-canvas]')).toHaveAttribute('data-layout', 'menu');
    const column = page.querySelector('[data-sf-builder-canvas] > [data-sf-builder-column]');
    expect(column).toHaveTextContent('page');
    cleanup();
    const shell = renderRoot('shell', 'storefront');
    expect(shell.querySelector('[data-sf-builder-canvas]')).toHaveTextContent('page');
    expect(shell.querySelector('[data-sf-builder-column]')).toBeNull();
  });
});
