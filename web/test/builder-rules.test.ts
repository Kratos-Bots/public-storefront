import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ComponentData, PuckDoc } from '@/builder/types.ts';

vi.mock('@/builder/registry.ts', async () => {
  const { defineBlock, slot } = await import('@/builder/define.ts');
  const b = (name: string, category: 'shell' | 'catalogue' | 'commerce' | 'content', routeBound = false, slots: string[] = [], layouts: 'all' | ('storefront' | 'menu' | 'webapp')[] = 'all') =>
    defineBlock<Record<string, unknown> & { id: string }>({
      name, label: name, category, layouts, routeBound, slots,
      schema: z.object(Object.fromEntries(slots.map((s) => [s, slot()]))) as never,
      defaultProps: Object.fromEntries(slots.map((s) => [s, []])), render: () => null,
    });
  return {
    BLOCKS: {
      PageOutlet: b('PageOutlet', 'shell', true), Header: b('Header', 'shell'), NoticeBanners: b('NoticeBanners', 'shell'),
      ProductGrid: b('ProductGrid', 'catalogue'), ProductList: b('ProductList', 'catalogue'),
      WholesaleTable: b('WholesaleTable', 'catalogue'),
      CheckoutFlow: b('CheckoutFlow', 'commerce', true), CartContents: b('CartContents', 'commerce', true, ['summary']),
      CartSummary: b('CartSummary', 'commerce', true), Heading: b('Heading', 'content'),
      Section: b('Section', 'content', false, ['content']), MenuOnly: b('MenuOnly', 'content', false, [], ['menu']),
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
