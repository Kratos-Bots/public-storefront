import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ComponentData, PuckDoc } from '@/builder/types.ts';

vi.mock('@/builder/registry.ts', async () => {
  const { defineBlock, slot } = await import('@/builder/define.ts');
  const b = (name: string, category: 'shell' | 'catalogue' | 'commerce' | 'content', routeBound = false, slots: string[] = [], layouts: 'all' | ('storefront' | 'menu' | 'webapp')[] = 'all', style: false | { target: 'root' | 'wrap'; keys: string[] } = false) =>
    defineBlock<Record<string, unknown> & { id: string }>({
      name, label: name === 'ProductGrid' ? 'Product grid' : name, category, layouts, routeBound, slots, style: style as never,
      schema: z.object(Object.fromEntries(slots.map((s) => [s, slot()]))) as never,
      defaultProps: Object.fromEntries(slots.map((s) => [s, []])), render: () => null,
      ...(name === 'Columns' ? { visibleSlots: (p: Record<string, unknown>) => ['col1', 'col2', 'col3'].slice(0, p.columns === '3' ? 3 : 2) } : {}),
    });
  const hideable = { target: 'root' as const, keys: ['bg', 'hide'] };
  return {
    BLOCKS: {
      PageOutlet: b('PageOutlet', 'shell', true), Header: b('Header', 'shell'), NoticeBanners: b('NoticeBanners', 'shell'),
      MobileCartBar: b('MobileCartBar', 'shell'),
      ProductGrid: b('ProductGrid', 'catalogue'), ProductList: b('ProductList', 'catalogue'),
      WholesaleTable: b('WholesaleTable', 'catalogue'),
      CheckoutFlow: b('CheckoutFlow', 'commerce', true), CartContents: b('CartContents', 'commerce', true, ['summary']),
      CartSummary: b('CartSummary', 'commerce', true), Heading: b('Heading', 'content', false, [], 'all', hideable),
      Section: b('Section', 'content', false, ['content'], 'all', hideable), MenuOnly: b('MenuOnly', 'content', false, [], ['menu']),
      Columns: b('Columns', 'content', false, ['col1', 'col2', 'col3'], 'all', hideable),
      Boxed: b('Boxed', 'content', false, ['content'], 'all', { target: 'wrap', keys: ['bg'] }),
    },
  };
});

import { allowedOn, checkRules, countBlocks } from '@/builder/rules.ts';

const c = (type: string, props: Record<string, unknown> = {}, id = `${type}-${Math.random()}`): ComponentData => ({ type, props: { id, ...props } });
const d = (content: ComponentData[]): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content });

describe('countBlocks', () => {
  it('counts through slots', () => {
    const counts = countBlocks(d([c('Section', { content: [c('Heading'), c('Section', { content: [c('Heading')] })] })]));
    expect(counts.get('Heading')).toBe(2);
    expect(counts.get('Section')).toBe(2);
  });
});

describe('checkRules', () => {
  it('shell: exactly one PageOutlet, no catalogue blocks', () => {
    expect(checkRules(d([c('Header'), c('PageOutlet')]), 'shell', 'storefront')).toEqual([]);
    expect(checkRules(d([c('Header')]), 'shell', 'storefront').map((i) => i.rule)).toEqual(['exactly-one:PageOutlet']);
    expect(checkRules(d([c('PageOutlet'), c('PageOutlet')]), 'shell', 'storefront').map((i) => i.rule)).toEqual(['exactly-one:PageOutlet']);
    expect(checkRules(d([c('PageOutlet'), c('ProductGrid')]), 'shell', 'storefront').map((i) => i.rule)).toEqual(['placement:ProductGrid']);
  });
  it('catalog: at least one list block', () => {
    expect(checkRules(d([c('Heading')]), 'catalog', 'storefront').map((i) => i.rule)).toEqual(['at-least-one:catalog']);
    expect(checkRules(d([c('Heading'), c('ProductList')]), 'catalog', 'menu')).toEqual([]);
    expect(checkRules(d([c('WholesaleTable')]), 'catalog', 'webapp')).toEqual([]);
  });
  it('cart: exactly one of each, found inside slots', () => {
    expect(checkRules(d([c('CartContents', { summary: [c('CartSummary')] })]), 'cart', 'storefront')).toEqual([]);
    expect(checkRules(d([c('CartContents')]), 'cart', 'storefront').map((i) => i.rule)).toEqual(['exactly-one:CartSummary']);
  });
  it('route-bound blocks stay on their own route; no page doc may hold PageOutlet or shell-only blocks', () => {
    expect(checkRules(d([c('CheckoutFlow'), c('ProductGrid')]), 'catalog', 'storefront').map((i) => i.rule)).toEqual(['placement:CheckoutFlow']);
    expect(checkRules(d([c('PageOutlet')]), 'page:about', 'storefront').map((i) => i.rule)).toEqual(['placement:PageOutlet']);
    expect(checkRules(d([c('Header')]), 'page:about', 'storefront').map((i) => i.rule)).toEqual(['placement:Header']);
    expect(checkRules(d([c('Heading'), c('NoticeBanners')]), 'page:about', 'storefront')).toEqual([]);
  });
  it('catalogue list blocks are bound to the catalog route (F1)', () => {
    expect(checkRules(d([c('ProductGrid')]), 'page:about', 'storefront').map((i) => i.rule)).toEqual(['placement:ProductGrid']);
    expect(checkRules(d([c('Section', { content: [c('ProductList')] })]), 'page:about', 'storefront').map((i) => i.rule)).toEqual(['placement:ProductList']);
    expect(checkRules(d([c('WholesaleTable')]), 'product', 'webapp').map((i) => i.rule)).toContain('placement:WholesaleTable');
    for (const t of ['ProductGrid', 'ProductList', 'WholesaleTable']) {
      expect(allowedOn(t, 'catalog')).toBe(true);
      expect(allowedOn(t, 'page:about')).toBe(false);
      expect(allowedOn(t, 'shell')).toBe(false);
    }
  });
  it('never resolves Object.prototype keys as blocks', () => {
    for (const t of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']) {
      for (const k of ['shell', 'catalog', 'page:about'] as const) expect(allowedOn(t, k)).toBe(false);
      expect(() => checkRules(d([c(t, { content: [c('Heading')] })]), 'page:about', 'storefront')).not.toThrow();
      expect(checkRules(d([c(t)]), 'page:about', 'storefront').map((i) => i.rule)).toEqual([`placement:${t}`]);
      expect(countBlocks(d([c(t, { content: [c('Heading')] })])).get('Heading')).toBeUndefined();
    }
  });
  it('shell: at most one Header (two pinned-notice stacks would fight over --sf-pin-h)', () => {
    expect(checkRules(d([c('PageOutlet')]), 'shell', 'storefront')).toEqual([]);
    expect(checkRules(d([c('Header'), c('Header'), c('PageOutlet')]), 'shell', 'storefront').map((i) => i.rule)).toEqual(['at-most-one:Header']);
    expect(checkRules(d([c('Header'), c('Section', { content: [c('Header')] }), c('PageOutlet')]), 'shell', 'menu').map((i) => i.rule)).toEqual(['at-most-one:Header']);
  });
  it('flags a block outside its layouts', () => {
    expect(checkRules(d([c('MenuOnly')]), 'page:about', 'storefront').map((i) => i.rule)).toEqual(['layout:MenuOnly']);
  });
  it('allowedOn answers the editor lock question', () => {
    expect(allowedOn('CheckoutFlow', 'checkout')).toBe(true);
    expect(allowedOn('CheckoutFlow', 'cart')).toBe(false);
    expect(allowedOn('Heading', 'shell')).toBe(true);
    expect(allowedOn('ProductGrid', 'shell')).toBe(false);
  });
});

describe('hidden-required (block-styling spec §10.2)', () => {
  const rules = (doc: PuckDoc, key: Parameters<typeof checkRules>[1]) => checkRules(doc, key, 'storefront').map((i) => i.rule);
  it('a hidden Section holding the catalogue grid breaks the catalogue', () => {
    const issues = checkRules(d([c('Section', { blockStyle: { hide: 'mobile' }, content: [c('ProductGrid')] }, 's1')]), 'catalog', 'storefront');
    expect(issues.map((i) => i.rule)).toEqual(['hidden-required:Section']);
    expect(issues[0]!.message).toBe('Section is hidden below 992 px but holds the Product grid, which every shopper must see.');
    expect(issues[0]!.blockId).toBe('s1');
  });
  it('desktop wording, and a nested hidden container', () => {
    const issues = checkRules(d([c('Section', { content: [c('Section', { blockStyle: { hide: 'desktop' }, content: [c('ProductList')] }, 'inner')] })]), 'catalog', 'storefront');
    expect(issues.map((i) => i.message)).toEqual(['Section is hidden from 992 px but holds the ProductList, which every shopper must see.']);
  });
  it('Columns hiding the PageOutlet on the shell', () => {
    expect(rules(d([c('Columns', { columns: '2', blockStyle: { hide: 'mobile' }, col1: [c('PageOutlet')] })]), 'shell')).toEqual(['hidden-required:Columns']);
  });
  it('a hidden Section holding the MobileCartBar', () => {
    expect(rules(d([c('PageOutlet'), c('Section', { blockStyle: { hide: 'desktop' }, content: [c('MobileCartBar')] })]), 'shell')).toEqual(['hidden-required:Section']);
  });
  it('a hidden Heading, or a hidden Section with only content, passes', () => {
    expect(rules(d([c('Heading', { blockStyle: { hide: 'mobile' } }), c('ProductGrid')]), 'catalog')).toEqual([]);
    expect(rules(d([c('Section', { blockStyle: { hide: 'mobile' }, content: [c('Heading')] }), c('ProductGrid')]), 'catalog')).toEqual([]);
  });
  it('a required block in a non-rendered column is exactly-one only, never hidden-required', () => {
    expect(rules(d([c('Columns', { columns: '2', blockStyle: { hide: 'mobile' }, col3: [c('PageOutlet')] })]), 'shell')).toEqual(['exactly-one:PageOutlet']);
  });
  it('a hide the block does not accept (or an unknown value) counts for nothing', () => {
    expect(rules(d([c('Boxed', { blockStyle: { hide: 'mobile' }, content: [c('ProductGrid')] })]), 'catalog')).toEqual([]);
    expect(rules(d([c('Section', { blockStyle: { hide: 'always' }, content: [c('ProductGrid')] })]), 'catalog')).toEqual([]);
  });
  it('the cart: a hidden Section around CartContents', () => {
    expect(rules(d([c('Section', { blockStyle: { hide: 'mobile' }, content: [c('CartContents', { summary: [c('CartSummary')] })] })]), 'cart')).toEqual(['hidden-required:Section']);
  });
});
