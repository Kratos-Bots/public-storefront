import { beforeEach, describe, expect, it } from 'vitest';
import { collectIssues, dedupeIds, docFor, docsFromPageSet, isShownIn, toPageSet, withDoc } from '@/builder/editor/page-set.ts';
import { prepareDocs } from '@/builder/editor/prepare.ts';
import { docLabel, pageOptions } from '@/builder/editor/page-catalog.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import type { ComponentData, PageSet, PuckDoc } from '@/builder/types.ts';

const d = (content: ComponentData[]): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content });
const oldProduct = d([{ type: 'ProductDetail', props: { id: 'pd', gallery: false, bulkPricing: true, provenance: true, upsells: false, sku: 'inherit' } }]);
const set = (extra: Partial<PageSet> = {}): PageSet => ({ schemaVersion: 1, shell: defaultDoc('shell', 'storefront')!, pages: { product: oldProduct }, ...extra });

describe('upgrade on load (spec §8, Review Focus 1)', () => {
  it('fills an old product doc from its legacy toggles before Puck sees it', () => {
    const docs = docsFromPageSet(set(), 'storefront');
    const pd = docs.product!.content[0]!.props;
    expect(pd.media).toEqual([]);
    expect(pd.below).toEqual([]);
    expect((pd.main as ComponentData[]).map((c) => c.type)).toContain('ProductAddToCart');
  });
  it('the emitted set carries full slots, no legacy props and no issue', () => {
    const docs = docsFromPageSet(set(), 'storefront');
    const out = toPageSet(prepareDocs(docs), 'storefront');
    const pd = out.pages.product!.content[0]!.props;
    for (const s of ['top', 'media', 'main', 'below']) expect(Array.isArray(pd[s])).toBe(true);
    expect(pd.gallery).toBeUndefined();
    expect(collectIssues(prepareDocs(docs), 'storefront')).toEqual([]);
  });
  it('the menu layout keeps its product document (the sheet) and upgrades it to the sheet default', () => {
    const docs = docsFromPageSet(set(), 'menu');
    expect((docs.product!.content[0]!.props.main as ComponentData[])[0]!.type).toBe('ProductGroup');
  });
});

describe('id de-duplication after the upgrade (ledger CARRY, Task 4)', () => {
  const ids = (doc: PuckDoc): string[] => {
    const out: string[] = [];
    const walk = (items: ComponentData[]) => {
      for (const c of items) {
        out.push(c.props.id);
        for (const v of Object.values(c.props)) if (Array.isArray(v) && v.every((x) => x && typeof x === 'object' && 'type' in x)) walk(v as ComponentData[]);
      }
    };
    walk(doc.content);
    return out;
  };
  it('two containers whose ids share their first 40 characters load with unique part ids', () => {
    const long = 'x'.repeat(40);
    const two = d([
      { type: 'ProductDetail', props: { id: `${long}-a` } },
      { type: 'ProductDetail', props: { id: `${long}-b` } },
    ]);
    const docs = docsFromPageSet({ ...set(), pages: { 'page:twins': two } }, 'storefront');
    const all = ids(docs['page:twins']!);
    expect(new Set(all).size).toBe(all.length);
    expect(all.every((id) => id.length <= 64)).toBe(true);
  });
  it('a document without duplicates is returned as is; the first holder of an id keeps it', () => {
    const doc = d([{ type: 'Heading', props: { id: 'h' } }]);
    expect(dedupeIds(doc)).toBe(doc);
    const dup = d([{ type: 'Heading', props: { id: 'h' } }, { type: 'Heading', props: { id: 'h' } }, { type: 'Heading', props: { id: 'h-2' } }]);
    const out = ids(dedupeIds(dup));
    expect(out[0]).toBe('h');
    expect(out[2]).toBe('h-2');
    expect(new Set(out).size).toBe(3);
    expect(ids(dup)).toEqual(['h', 'h', 'h-2']); // input not mutated
  });
});

describe('card documents (spec §6.1)', () => {
  const tile = d([{ type: 'CardTile', props: { id: 'CardTile-x', content: [{ type: 'CardTileName', props: { id: 'n' } }] } }]);
  it('load: cards.tile → card:tile; a card key under pages is ignored', () => {
    const docs = docsFromPageSet({ ...set(), cards: { tile }, pages: { ...set().pages, ['card:row' as never]: tile } }, 'storefront');
    expect(docs['card:tile']).toBeDefined();
    expect(docs['card:row']).toBeUndefined();
  });
  it('save: card docs go to cards, never to pages; none ⇒ no cards key', () => {
    const docs = docsFromPageSet({ ...set(), cards: { tile } }, 'storefront');
    const out = toPageSet(docs, 'storefront');
    expect(Object.keys(out.cards!)).toEqual(['tile']);
    expect(Object.keys(out.pages).some((k) => k.startsWith('card:'))).toBe(false);
    expect('cards' in toPageSet(docsFromPageSet(set(), 'storefront'), 'storefront')).toBe(false);
  });
  it('a card doc equal to the built-in design is not stored', () => {
    const docs = docsFromPageSet(set(), 'storefront');
    expect(withDoc(docs, 'card:tile', docFor(docs, 'card:tile', 'storefront'), 'storefront')).toBe(docs);
  });
  it('issues on a card doc carry its key', () => {
    const bad = d([{ type: 'CardTile', props: { id: 'f', content: [{ type: 'CardTileName', props: { id: 'n' } }, { type: 'CardTileAdd', props: { id: 'a' } }] } }]);
    const issues = collectIssues({ ...docsFromPageSet(set(), 'storefront'), 'card:tile': bad }, 'storefront');
    expect(issues.find((i) => i.rule === 'part-requires:CardTileAdd.CardTilePrice')?.docKey).toBe('card:tile');
  });
  it('every doc key is shown in every layout', () => {
    for (const layout of ['storefront', 'menu', 'webapp'] as const) {
      for (const key of ['product', 'card:tile', 'card:row', 'catalog'] as const) expect(isShownIn(key, layout)).toBe(true);
    }
  });
});

describe('store: card docs, product sheet, preview product (spec §11)', () => {
  beforeEach(() => {
    useEditorStore.setState({ status: 'waiting', docs: {}, docKey: 'catalog', epoch: 0, previewProductId: null });
  });
  it('selects and edits card:tile / card:row and the menu product sheet', () => {
    const s = useEditorStore.getState();
    s.load({ layout: 'menu', pageSet: null, readOnly: false });
    for (const key of ['card:tile', 'card:row', 'product'] as const) {
      useEditorStore.getState().selectDoc(key);
      expect(useEditorStore.getState().docKey).toBe(key);
      const current = docFor(useEditorStore.getState().docs, key, 'menu');
      useEditorStore.getState().updateDoc(key, { ...current, root: { props: { ...current.root.props, title: 'Edited' } } });
      expect(useEditorStore.getState().docs[key]?.root.props.title).toBe('Edited');
    }
    expect(Object.keys(toPageSet(useEditorStore.getState().docs, 'menu').cards!).sort()).toEqual(['row', 'tile']);
  });
  it('keeps a selected card doc across a reload', () => {
    useEditorStore.getState().load({ layout: 'storefront', pageSet: null, readOnly: false });
    useEditorStore.getState().selectDoc('card:row');
    useEditorStore.getState().load({ layout: 'webapp', pageSet: null, readOnly: false });
    expect(useEditorStore.getState().docKey).toBe('card:row');
  });
  it('previewProductId starts null, is set, and survives a load', () => {
    expect(useEditorStore.getState().previewProductId).toBeNull();
    useEditorStore.getState().setPreviewProduct(101);
    useEditorStore.getState().load({ layout: 'storefront', pageSet: null, readOnly: false });
    expect(useEditorStore.getState().previewProductId).toBe(101);
    useEditorStore.getState().setPreviewProduct(null);
    expect(useEditorStore.getState().previewProductId).toBeNull();
  });
});

describe('page picker (spec §11)', () => {
  it('labels', () => {
    expect(docLabel('product', {}, 'menu')).toBe('Product sheet');
    expect(docLabel('product', {}, 'storefront')).toBe('Product page');
    expect(docLabel('card:tile', {})).toBe('Product card');
    expect(docLabel('card:row', {})).toBe('Product row');
  });
  it('every layout lists the product doc and a Product cards group', () => {
    for (const layout of ['storefront', 'menu', 'webapp'] as const) {
      const groups = pageOptions({}, layout);
      expect(groups.flatMap((g) => g.options.map((o) => o.docKey))).toContain('product');
      expect(groups.find((g) => g.label === 'Product cards')!.options.map((o) => o.docKey)).toEqual(['card:tile', 'card:row']);
    }
  });
  it('the product option is labelled per layout, edited docs carry the suffix, cards come before custom pages', () => {
    const edited = { 'card:tile': d([]), product: d([]), 'page:about': { root: { props: { title: 'About', description: '', chrome: 'shell' as const } }, content: [] } };
    const groups = pageOptions(edited, 'menu');
    const opts = groups.flatMap((g) => g.options);
    expect(opts.find((o) => o.docKey === 'product')!.label).toBe('Product sheet · edited');
    expect(opts.find((o) => o.docKey === 'card:tile')!.label).toBe('Product card · edited');
    expect(opts.find((o) => o.docKey === 'card:row')!.label).toBe('Product row');
    expect(groups.map((g) => g.label).slice(-2)).toEqual(['Product cards', 'Custom pages']);
  });
});
