import { describe, expect, it, vi } from 'vitest';
vi.mock('@/builder/registry.ts', async (orig) => (await import('./helpers/fake-parts.tsx')).withFakeBlocks(orig));
import { allowedOn, checkRules, requiredParts } from '@/builder/rules.ts';
import type { ComponentData, DocKey, PuckDoc } from '@/builder/types.ts';

const c = (type: string, id: string, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id, ...props } });
const doc = (content: ComponentData[]): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content });
const box = (id: string, a: ComponentData[], b: ComponentData[] = [], extra: Record<string, unknown> = {}) => c('FakeBox', id, { a, b, ...extra });
const full = (id: string) => [c('FakeTitle', `${id}-t`), c('FakePrice', `${id}-p`), c('FakeAdd', `${id}-a`)];
const rules = (d: PuckDoc, key: DocKey = 'page:x', layout: 'storefront' | 'menu' = 'storefront') =>
  checkRules(d, key, layout).map((i) => i.rule).filter((r) => r.startsWith('part-') || r.startsWith('slot-accepts') || r.startsWith('hidden-required'));

describe('placement (spec §3.4)', () => {
  it('parts are allowed only on their family doc', () => {
    expect(allowedOn('FakeTitle', 'product')).toBe(true);
    for (const k of ['catalog', 'shell', 'page:x', 'card:tile', 'cart'] as DocKey[]) expect(allowedOn('FakeTitle', k), k).toBe(false);
  });
  it('card docs accept nothing but their frame and their parts', () => {
    for (const t of ['Heading', 'Section', 'RichText', 'FakeBox']) expect(allowedOn(t, 'card:tile'), t).toBe(false);
  });
  it('part-placement: a part at the root, or in a Section outside the container', () => {
    expect(rules(doc([box('b', full('b')), c('FakeNote', 'n')]), 'product')).toContain('part-placement:FakeNote');
    expect(rules(doc([box('b', full('b')), c('Section', 's', { content: [c('FakeNote', 'n')] })]), 'product')).toContain('part-placement:FakeNote');
  });
  it('content blocks may sit between a container and its parts', () => {
    const d = doc([box('b', [c('Columns', 'k', { columns: '2', col1: [c('FakeTitle', 't'), c('FakePrice', 'p')], col2: [c('FakeAdd', 'a')], col3: [], col4: [] })])]);
    expect(rules(d, 'product')).toEqual([]);
  });
});

describe('per container instance (spec §4)', () => {
  it('required: missing and doubled', () => {
    expect(rules(doc([box('b', [c('FakeTitle', 't')])]), 'product')).toContain('part-required:FakeBox.FakePrice');
    expect(rules(doc([box('b', [...full('b'), c('FakePrice', 'p2')])]), 'product')).toContain('part-required:FakeBox.FakePrice');
  });
  it('two containers are counted separately', () => {
    const d = doc([box('one', full('one')), box('two', [c('FakeTitle', 'two-t')])]);
    const found = checkRules(d, 'product', 'storefront').filter((i) => i.rule.startsWith('part-required'));
    expect(found.map((i) => [i.rule, i.blockId])).toEqual([['part-required:FakeBox.FakePrice', 'two']]);
  });
  it('a required part not available in the layout is skipped', () => {
    expect(requiredParts('FakeBox', 'menu')).toEqual(['FakeTitle', 'FakePrice']);
    expect(requiredParts('FakeBox', 'storefront')).toEqual(['FakeTitle', 'FakePrice']);
    expect(rules(doc([box('b', [c('FakeTitle', 't'), c('FakePrice', 'p')])]), 'product', 'menu')).toEqual([]);
  });
  it('unique and requires', () => {
    expect(rules(doc([box('b', full('b'), [c('FakeNote', 'n1'), c('FakeNote', 'n2')])]), 'product')).toContain('part-unique:FakeBox.FakeNote');
    expect(rules(doc([box('b', [c('FakeTitle', 't'), c('FakeAdd', 'a')])]), 'product')).toContain('part-requires:FakeAdd.FakePrice');
  });
  it('slot-accepts: a restricted slot, and route blocks / containers in any container slot', () => {
    expect(rules(doc([box('b', full('b'), [c('Heading', 'h')])]), 'product')).toContain('slot-accepts:FakeBox.b');
    expect(rules(doc([box('b', [...full('b'), c('ProductDetail', 'pd')])]), 'product')).toContain('slot-accepts:FakeBox.a');
    expect(rules(doc([box('b', [...full('b'), box('inner', full('inner'))])]), 'product')).toContain('slot-accepts:FakeBox.a');
  });
  it('a required part in a hidden Columns column is reported by part-required only', () => {
    const d = doc([box('b', [c('FakeTitle', 't'), c('FakeAdd', 'a'), c('Columns', 'k', { columns: '2', col1: [], col2: [], col3: [c('FakePrice', 'p')], col4: [] })])]);
    const found = rules(d, 'product');
    expect(found).toContain('part-required:FakeBox.FakePrice');
    expect(found.some((r) => r.startsWith('hidden-required'))).toBe(false);
    expect(found.some((r) => r.startsWith('part-placement'))).toBe(false);
  });
  it('hidden-required: a hidden block holding a required part', () => {
    const d = doc([box('b', [c('FakeTitle', 't'), c('FakeAdd', 'a'), c('Section', 's', { content: [c('FakePrice', 'p')], blockStyle: { hide: 'mobile' } })])]);
    const issue = checkRules(d, 'product', 'storefront').find((i) => i.rule === 'hidden-required:Section');
    expect(issue?.blockId).toBe('s');
    expect(issue?.message).toMatch(/holds the Price/);
  });
});
