import { describe, expect, it, vi } from 'vitest';
import { defaultDoc } from '@/builder/defaults/index.ts';
import {
  collectIssues, customPageKeys, docFor, docsFromPageSet, forEachComponent, MAX_CUSTOM_PAGES, newCustomPage, normalizeDoc,
  sameDoc, toPageSet, withDoc, withoutDoc, type DocMap,
} from '@/builder/editor/page-set.ts';
import type { ComponentData, PuckDoc } from '@/builder/types.ts';

const L = 'storefront' as const;
const shell = () => normalizeDoc(defaultDoc('shell', L), 'shell');
const heading = (id: string) => ({ type: 'Heading', props: { id } });

describe('page-set model', () => {
  it('starts a null set from the default shell only', () => {
    const docs = docsFromPageSet(null, L);
    expect(Object.keys(docs)).toEqual(['shell']);
    expect(toPageSet(docs, L)).toEqual({ schemaVersion: 1, shell: shell(), pages: {} });
  });

  it('round-trips a stored set', () => {
    const catalog = normalizeDoc(defaultDoc('catalog', L), 'catalog');
    const edited: PuckDoc = { ...catalog, content: [...catalog.content, heading('Heading-x')] };
    const stored = { schemaVersion: 1 as const, shell: shell(), pages: { catalog: edited } };
    expect(toPageSet(docsFromPageSet(stored, L), L)).toEqual(stored);
  });

  it('browsing a page does not add it; Puck echoing the same doc does not add it', () => {
    const docs = docsFromPageSet(null, L);
    const shown = docFor(docs, 'cart', L);
    expect(withDoc(docs, 'cart', normalizeDoc(JSON.parse(JSON.stringify(shown)), 'cart'), L)).toBe(docs);
  });

  it('an edit adds the page; editing it back to the default removes it again', () => {
    const docs = docsFromPageSet(null, L);
    const base = docFor(docs, 'catalog', L);
    const edited = withDoc(docs, 'catalog', { ...base, content: [...base.content, heading('Heading-1')] }, L);
    expect(Object.keys(edited)).toEqual(['shell', 'catalog']);
    const reverted = withDoc(edited, 'catalog', base, L);
    expect(Object.keys(reverted)).toEqual(['shell']);
  });

  it('compares docs regardless of key order and empty zones', () => {
    const a: PuckDoc = { root: { props: { title: 'T', description: '', chrome: 'shell' } }, content: [{ type: 'Heading', props: { id: 'h', text: 'x', level: 2 } }] };
    const b = { content: [{ props: { level: 2, text: 'x', id: 'h' }, type: 'Heading' }], root: { props: { chrome: 'shell', description: '', title: 'T' } }, zones: {} };
    expect(sameDoc(a, normalizeDoc(b, 'catalog'))).toBe(true);
  });

  it('turns any non-string *Html prop into an HTML string, at any depth (backend contract)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const node = { $$typeof: Symbol.for('react.element'), type: 'p', props: {} };
    const doc = normalizeDoc({
      root: { props: {} },
      content: [
        { type: 'RichText', props: { id: 'r1', bodyHtml: node } },
        { type: 'FAQ', props: { id: 'f1', items: [{ question: 'Q', answerHtml: 42 }, { question: 'Q2', answerHtml: '<p>ok</p>' }] } },
        { type: 'Section', props: { id: 's1', children: [{ type: 'RichText', props: { id: 'r2', bodyHtml: null } }] } },
      ],
    }, 'page:about');
    const json = JSON.parse(JSON.stringify(doc));
    expect(json.content[0].props.bodyHtml).toBe('');
    expect(json.content[1].props.items.map((i: { answerHtml: unknown }) => i.answerHtml)).toEqual(['', '<p>ok</p>']);
    expect(json.content[2].props.children[0].props.bodyHtml).toBe('');
    warn.mockRestore();
  });

  it('normalises root props and never lets the shell go chromeless', () => {
    expect(normalizeDoc({ root: { props: { chrome: 'none', title: 3 } }, content: 'x' }, 'shell')).toEqual({
      root: { props: { title: '', description: '', chrome: 'shell' } }, content: [],
    });
    expect(normalizeDoc({ root: { props: { chrome: 'none' } }, content: [] }, 'order-status').root.props.chrome).toBe('none');
  });

  it('reset: a fixed page returns to default, the shell to the default shell, a custom page is deleted', () => {
    let docs: DocMap = docsFromPageSet(null, L);
    const base = docFor(docs, 'cart', L);
    docs = withDoc(docs, 'cart', { ...base, content: [...base.content, heading('Heading-2')] }, L);
    docs = withDoc(docs, 'shell', { ...docs.shell!, content: [...docs.shell!.content, heading('Heading-3')] }, L);
    const created = newCustomPage(docs, 'about', 'About us');
    if ('error' in created) throw new Error(created.error);
    docs = created.docs;
    expect(Object.keys(withoutDoc(docs, 'cart', L))).not.toContain('cart');
    expect(withoutDoc(docs, 'shell', L).shell).toEqual(shell());
    expect(Object.keys(withoutDoc(docs, 'page:about', L))).not.toContain('page:about');
  });

  it('creates custom pages with validation', () => {
    const docs = docsFromPageSet(null, L);
    const ok = newCustomPage(docs, 'spring-sale', '  Spring sale  ');
    expect(ok).toMatchObject({ docKey: 'page:spring-sale' });
    if ('error' in ok) throw new Error('unreachable');
    expect(ok.docs['page:spring-sale']).toEqual({ root: { props: { title: 'Spring sale', description: '', chrome: 'shell' } }, content: [] });
    expect(newCustomPage(ok.docs, 'spring-sale', 'Again')).toEqual({ error: 'A page with that address already exists.' });
    expect(newCustomPage(docs, 'Spring Sale', 'x')).toEqual({ error: 'Use 1–60 lowercase letters, digits or hyphens.' });
    expect(newCustomPage(docs, 'ok', '   ')).toEqual({ error: 'Give the page a title.' });
    expect(newCustomPage(docs, 'ok', 'x'.repeat(121))).toEqual({ error: 'Keep the title to 120 characters.' });
    let many: DocMap = docs;
    for (let i = 0; i < MAX_CUSTOM_PAGES; i += 1) {
      const r = newCustomPage(many, `p${i}`, `P${i}`);
      if ('error' in r) throw new Error(r.error);
      many = r.docs;
    }
    expect(customPageKeys(many)).toHaveLength(MAX_CUSTOM_PAGES);
    expect(newCustomPage(many, 'one-more', 'x')).toEqual({ error: 'A layout can have at most 50 custom pages.' });
  });

  it('reports no issues for defaults and an issue for a broken required page', () => {
    const docs = docsFromPageSet(null, L);
    expect(collectIssues(docs, L)).toEqual([]);
    const broken = withDoc(docs, 'checkout', { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [] }, L);
    const issues = collectIssues(broken, L);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.docKey === 'checkout')).toBe(true);
  });

  it('surfaces the at-most-one rules (a second Header / MobileCartBar in the shell)', () => {
    const docs = docsFromPageSet(null, L);
    const s = docs.shell!;
    const twice = (type: string) => {
      const first = s.content.find((c) => c.type === type);
      const extra = first ? { ...first, props: { ...first.props, id: `${type}-dup` } } : { type, props: { id: `${type}-a` } };
      const more = first ? [extra] : [extra, { type, props: { id: `${type}-b` } }];
      return withDoc(docs, 'shell', { ...s, content: [...s.content, ...more] }, L);
    };
    expect(collectIssues(twice('Header'), L).map((i) => i.rule)).toContain('at-most-one:Header');
    expect(collectIssues(twice('MobileCartBar'), L).map((i) => i.rule)).toContain('at-most-one:MobileCartBar');
  });

  it('drops the informational drop:* guard issues (they would block Publish)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const docs = docsFromPageSet(null, L);
    const withUnknown = withDoc(docs, 'page:about' as const, {
      root: { props: { title: 'About', description: '', chrome: 'shell' } },
      content: [{ type: 'NoSuchBlockFromTheFuture', props: { id: 'x-1' } }],
    }, L);
    expect(collectIssues(withUnknown, L)).toEqual([]);
    warn.mockRestore();
  });

  it('walks every slot depth-first', () => {
    const seen: string[] = [];
    const content: ComponentData[] = [
      { type: 'Section', props: { id: 's', children: [{ type: 'Heading', props: { id: 'h' } }], label: 'x' } },
      { type: 'Spacer', props: { id: 'sp' } },
    ];
    forEachComponent(content, (c) => seen.push(c.props.id));
    expect(seen).toEqual(['s', 'h', 'sp']);
  });
});
