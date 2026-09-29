import { beforeEach, describe, expect, it } from 'vitest';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { DEFAULT_PREVIEW_AS, useEditorStore } from '@/builder/editor/store.ts';
import { docLabel, pageOptions } from '@/builder/editor/page-catalog.ts';
import { docFor, normalizeDoc } from '@/builder/editor/page-set.ts';

const reset = () => useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null });

describe('editor store', () => {
  beforeEach(reset);

  it('load: ready, default shell, catalog selected, epoch bumped', () => {
    useEditorStore.getState().load({ layout: 'menu', pageSet: null, readOnly: false });
    const s = useEditorStore.getState();
    expect(s.status).toBe('ready');
    expect(s.layout).toBe('menu');
    expect(s.docs.shell).toEqual(normalizeDoc(defaultDoc('shell', 'menu'), 'shell'));
    expect(s.docKey).toBe('catalog');
    expect(s.epoch).toBe(1);
  });

  it('keeps the selected page across a reload when it still exists', () => {
    useEditorStore.getState().load({ layout: 'storefront', pageSet: null, readOnly: false });
    useEditorStore.getState().selectDoc('cart');
    useEditorStore.getState().load({ layout: 'storefront', pageSet: null, readOnly: true });
    expect(useEditorStore.getState().docKey).toBe('cart');
  });

  it('falls back to the catalogue when a reload drops the selected page', () => {
    useEditorStore.getState().load({ layout: 'storefront', pageSet: null, readOnly: false });
    useEditorStore.getState().createPage('about', 'About');
    useEditorStore.getState().load({ layout: 'storefront', pageSet: null, readOnly: false });
    expect(useEditorStore.getState().docKey).toBe('catalog');
    useEditorStore.getState().selectDoc('product');
    useEditorStore.getState().load({ layout: 'webapp', pageSet: null, readOnly: false });
    expect(useEditorStore.getState().docKey).toBe('catalog');
  });

  it('ignores selecting an unknown custom page and invalid keys', () => {
    useEditorStore.getState().load({ layout: 'storefront', pageSet: null, readOnly: false });
    useEditorStore.getState().selectDoc('page:nope');
    useEditorStore.getState().selectDoc('bogus' as never);
    expect(useEditorStore.getState().docKey).toBe('catalog');
  });

  it('updateDoc stores a real edit sparsely and is ignored in read-only mode', () => {
    useEditorStore.getState().load({ layout: 'storefront', pageSet: null, readOnly: false });
    const base = docFor(useEditorStore.getState().docs, 'catalog', 'storefront');
    useEditorStore.getState().updateDoc('catalog', JSON.parse(JSON.stringify(base)));
    expect(useEditorStore.getState().docs.catalog).toBeUndefined();
    useEditorStore.getState().updateDoc('catalog', { ...base, content: [...base.content, { type: 'Spacer', props: { id: 'Spacer-1' } }] });
    expect(useEditorStore.getState().docs.catalog?.content.at(-1)?.type).toBe('Spacer');

    useEditorStore.getState().load({ layout: 'storefront', pageSet: null, readOnly: true });
    const before = useEditorStore.getState().docs;
    useEditorStore.getState().updateDoc('catalog', { root: { props: {} }, content: [] });
    expect(useEditorStore.getState().docs).toBe(before);
  });

  it('createPage selects the new page; resetDoc on it deletes it and returns to the catalogue', () => {
    useEditorStore.getState().load({ layout: 'storefront', pageSet: null, readOnly: false });
    expect(useEditorStore.getState().createPage('about', 'About')).toBeNull();
    expect(useEditorStore.getState().docKey).toBe('page:about');
    expect(useEditorStore.getState().createPage('about', 'Again')).toBe('A page with that address already exists.');
    useEditorStore.getState().resetDoc('page:about');
    expect(useEditorStore.getState().docKey).toBe('catalog');
    expect(useEditorStore.getState().docs['page:about']).toBeUndefined();
  });

  it('page options hide the product page outside the storefront layout and list custom pages', () => {
    useEditorStore.getState().load({ layout: 'menu', pageSet: null, readOnly: false });
    useEditorStore.getState().createPage('about', 'About');
    const s = useEditorStore.getState();
    const keys = pageOptions(s.docs, 'menu').flatMap((g) => g.options.map((o) => o.docKey));
    expect(keys).not.toContain('product');
    expect(keys).toContain('page:about');
    expect(pageOptions(s.docs, 'storefront').flatMap((g) => g.options.map((o) => o.docKey))).toContain('product');
    expect(docFor(s.docs, 'page:about', 'menu').root.props.title).toBe('About');
    expect(docLabel('page:about', s.docs)).toBe('About (/pages/about)');
  });

  it('previewAs patches merge; viewport survives a reload of the set', () => {
    useEditorStore.getState().setPreviewAs({ cart: 'empty' });
    expect(useEditorStore.getState().previewAs).toEqual({ session: 'signed-in-orders', cart: 'empty' });
    useEditorStore.getState().setViewport(768);
    useEditorStore.getState().load({ layout: 'storefront', pageSet: null, readOnly: false });
    expect(useEditorStore.getState().viewport).toBe(768);
    useEditorStore.getState().setViewport(null);
    expect(useEditorStore.getState().viewport).toBeNull();
  });
});
