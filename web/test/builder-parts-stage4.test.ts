import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/builder/registry.ts', async (orig) => {
  const real = await (await import('./helpers/fake-parts.tsx')).withFakeBlocks(orig);
  const { z } = await import('zod');
  const { BOX, VIS, styleSupport } = await import('@/builder/style/model.ts');
  const { defineBlock, slot } = await import('@/builder/define.ts');
  const fakePart = (name: string, family: string) => defineBlock<{ id: string }>({
    name, label: name.replace('Fake', ''), category: 'part', part: { family }, layouts: 'all', routeBound: false, slots: [],
    style: styleSupport('root', [...BOX, ...VIS]), schema: z.object({}), defaultProps: {}, render: () => null,
  } as never);
  const container = (name: string, family: string, slots: string[], spec: Record<string, unknown>) => defineBlock<Record<string, unknown> & { id: string }>({
    name, label: name.replace('Fake', ''), category: 'commerce', layouts: 'all', routeBound: true, slots,
    style: styleSupport('wrap', [...BOX, ...VIS]),
    schema: z.object(Object.fromEntries(slots.map((s) => [s, slot()]))), defaultProps: Object.fromEntries(slots.map((s) => [s, []])),
    container: { family, insertSlot: slots[0]!, required: [], unique: [], defaultSlots: () => Object.fromEntries(slots.map((s) => [s, []])), ...spec },
    render: () => null,
  } as never);
  return { ...real, BLOCKS: { ...real.BLOCKS,
    FakeCart: container('FakeCart', 'cart', ['head', 'main', 'summary'], {
      required: ['FakeHead'], unique: ['FakeSumPart'], nests: ['FakeSummary'], slotRejects: { head: ['FakeLines'] },
    }),
    FakeCartPlain: container('FakeCartPlain', 'cart', ['summary'], {}),
    FakeSummary: container('FakeSummary', 'cart-summary', ['items'], { required: [] }),
    FakeLines: fakePart('FakeLines', 'cart'),
    FakeHead: fakePart('FakeHead', 'cart'),
    FakeSumPart: fakePart('FakeSumPart', 'cart-summary'),
    FakePayOk: container('FakePayOk', 'payment', ['body'], { offers: ['FakeMark', 'FakeBack'] }),
    FakePayAll: container('FakePayAll', 'payment', ['body'], {}),
    FakeMark: fakePart('FakeMark', 'payment'),
    FakeBack: fakePart('FakeBack', 'payment'),
    FakeActions: fakePart('FakeActions', 'payment'),
    S4Boom: defineBlock<{ id: string }>({
      name: 'S4Boom', label: 'Boom', category: 'content', layouts: 'all', routeBound: false, slots: [], style: false,
      schema: z.object({}), defaultProps: {}, render: () => { throw new Error('boom'); },
    }),
    S4Ok: defineBlock<{ id: string }>({
      name: 'S4Ok', label: 'Ok', category: 'content', layouts: 'all', routeBound: false, slots: [], style: false,
      schema: z.object({}), defaultProps: {}, render: () => createElement('b', null, 'ok'),
    }),
  } };
});
import { checkRules, allowedOn, blockDef } from '@/builder/rules.ts';
import { FAMILY_DOCS, familyAllowedOn, findComponent, offersPart } from '@/builder/parts.ts';
import { BuilderModeProvider, usePreviewFixture, usePreviewState, PREVIEW_STATE_IDS, type BuilderMode } from '@/builder/mode.ts';
import { renderComponent } from '@/builder/render.tsx';
import { render, renderHook, cleanup } from '@testing-library/react';
import { createElement, Fragment, type ReactNode } from 'react';
import type { ComponentData, DocKey, PuckDoc } from '@/builder/types.ts';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const c = (type: string, id: string, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id, ...props } });
const doc = (content: ComponentData[]): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content });
const only = (d: PuckDoc, key: DocKey, prefixes: string[]) =>
  checkRules(d, key, 'storefront').map((i) => i.rule).filter((r) => prefixes.some((p) => r.startsWith(p)));
const cart = (head: ComponentData[], main: ComponentData[] = [], summary: ComponentData[] = []) => c('FakeCart', 'cart', { head, main, summary });
const REQ = c('FakeHead', 'h');
const section = (id: string, content: ComponentData[], extra: Record<string, unknown> = {}) => c('Section', id, { content, ...extra });

describe('offers (spec 3)', () => {
  it('a part the container does not offer is a part-placement issue; offered or all-offering is fine', () => {
    expect(only(doc([c('FakePayOk', 'p', { body: [c('FakeActions', 'a')] })]), 'payment-success', ['part-placement'])).toEqual(['part-placement:FakeActions']);
    expect(only(doc([c('FakePayOk', 'p', { body: [c('FakeMark', 'm'), c('FakeBack', 'b')] })]), 'payment-success', ['part-placement'])).toEqual([]);
    expect(only(doc([c('FakePayAll', 'p', { body: [c('FakeActions', 'a')] })]), 'payment-success', ['part-placement'])).toEqual([]);
  });
  it('the message says "isn\'t available" when the family matches but it is not offered', () => {
    const found = checkRules(doc([c('FakePayOk', 'p', { body: [c('FakeActions', 'a')] })]), 'payment-success', 'storefront').find((i) => i.rule === 'part-placement:FakeActions')!;
    expect(found.message).toBe("Actions isn't available on this page's payment page.");
    expect(found.blockId).toBe('a');
  });
  it('offersPart', () => {
    const spec = blockDef('FakePayOk')!.container!;
    expect(offersPart(spec, 'FakeMark')).toBe(true);
    expect(offersPart(spec, 'FakeActions')).toBe(false);
    expect(offersPart(blockDef('FakePayAll')!.container!, 'anything')).toBe(true);
  });
});

describe('slotRejects', () => {
  it('rejects the part in head, directly or wrapped', () => {
    expect(only(doc([cart([REQ, c('FakeLines', 'l')])]), 'cart', ['slot-rejects'])).toEqual(['slot-rejects:FakeCart.head']);
    expect(only(doc([cart([REQ, section('s', [c('FakeLines', 'l')])])]), 'cart', ['slot-rejects'])).toEqual(['slot-rejects:FakeCart.head']);
    expect(only(doc([cart([REQ], [c('FakeLines', 'l')])]), 'cart', ['slot-rejects'])).toEqual([]);
  });
  it('reports once per slot, naming the match', () => {
    const found = checkRules(doc([cart([REQ, c('FakeLines', 'l1'), c('FakeLines', 'l2')])]), 'cart', 'storefront').filter((i) => i.rule.startsWith('slot-rejects'));
    expect(found.map((i) => i.blockId)).toEqual(['l1']);
    expect(found[0]!.message).toBe("Lines can't sit there: that area of the cart never shows it.");
  });
});

describe('nests', () => {
  const summary = (id = 's') => c('FakeSummary', id, { items: [] });
  it('a nested container is allowed in its slot, directly or wrapped', () => {
    expect(only(doc([cart([REQ], [], [summary()])]), 'cart', ['slot-accepts'])).toEqual([]);
    expect(only(doc([cart([REQ], [], [section('w', [summary()])])]), 'cart', ['slot-accepts'])).toEqual([]);
  });
  it('a route block not in nests is still refused', () => {
    expect(only(doc([cart([REQ], [], [c('ProductGrid', 'g')])]), 'cart', ['slot-accepts'])).toEqual(['slot-accepts:FakeCart.summary']);
    expect(only(doc([cart([REQ], [], [summary(), c('ProductGrid', 'g')])]), 'cart', ['slot-accepts'])).toEqual(['slot-accepts:FakeCart.summary']);
  });
  it('without nests any container is refused (stage-3 behaviour)', () => {
    expect(only(doc([c('FakeCartPlain', 'p', { summary: [summary()] })]), 'cart', ['slot-accepts'])).toEqual(['slot-accepts:FakeCartPlain.summary']);
  });
  it("a nested container's own contents are its business, not the outer one's", () => {
    const inner = c('FakeSummary', 's', { items: [c('ProductGrid', 'g')] });
    expect(only(doc([cart([REQ], [], [inner])]), 'cart', ['slot-accepts'])).toEqual(['slot-accepts:FakeSummary.items']);
  });
  it('counting stops at the nested container; the nearest container owns placement', () => {
    const dup = c('FakeSummary', 's', { items: [c('FakeSumPart', 'a'), c('FakeSumPart', 'b')] });
    expect(only(doc([cart([REQ], [], [dup])]), 'cart', ['part-unique', 'part-placement', 'part-required'])).toEqual([]);
    const stray = c('FakeSummary', 's', { items: [c('FakeLines', 'l')] });
    expect(only(doc([cart([REQ], [], [stray])]), 'cart', ['part-placement'])).toEqual(['part-placement:FakeLines']);
  });
});

describe('hidden-required on a part itself', () => {
  const hidden = (hide: string) => c('FakeHead', 'h', { blockStyle: { hide } });
  it('a required part with its own hide is flagged, once', () => {
    const found = checkRules(doc([cart([hidden('mobile')])]), 'cart', 'storefront').filter((i) => i.rule.startsWith('hidden-required'));
    expect(found.map((i) => [i.rule, i.blockId])).toEqual([['hidden-required:FakeHead', 'h']]);
    expect(found[0]!.message).toBe("Head can't be hidden: every shopper must see it.");
  });
  it('a hidden Section around the required part is still one (holder) issue', () => {
    expect(only(doc([cart([section('s', [REQ], { blockStyle: { hide: 'mobile' } })])]), 'cart', ['hidden-required'])).toEqual(['hidden-required:Section']);
  });
  it('never reports one rule twice for the same block (hidden required part inside a hidden Section)', () => {
    const d = doc([cart([section('s', [c('FakeHead', 'h', { blockStyle: { hide: 'mobile' } })], { blockStyle: { hide: 'desktop' } })])]);
    const found = checkRules(d, 'cart', 'storefront').filter((i) => i.rule.startsWith('hidden-required'));
    const keys = found.map((i) => `${i.rule}|${i.blockId}`);
    expect(new Set(keys).size).toBe(keys.length);
    // The hidden Section already says so: the part's own hide adds nothing for the same block.
    expect(keys).toEqual(['hidden-required:Section|s']);
    for (const hide of ['mobile', 'desktop']) {
      const one = checkRules(doc([cart([section('s', [REQ], { blockStyle: { hide } })])]), 'cart', 'storefront').filter((i) => i.rule === 'hidden-required:Section');
      expect(one.map((i) => i.blockId)).toEqual(['s']);
    }
  });
  it('a hidden container holding all its parts is no issue', () => {
    const d = doc([c('FakeCart', 'cart', { head: [REQ], main: [], summary: [], blockStyle: { hide: 'mobile' } })]);
    expect(only(d, 'cart', ['hidden-required'])).toEqual([]);
  });
  it('a part that is not required may be hidden', () => {
    expect(only(doc([cart([REQ], [c('FakeLines', 'l', { blockStyle: { hide: 'mobile' } })])]), 'cart', ['hidden-required'])).toEqual([]);
  });
});

describe('families', () => {
  it('FAMILY_DOCS has the four stage-3 and thirteen new families', () => {
    expect(FAMILY_DOCS).toEqual({
      product: ['product'], catalogue: ['catalog'], 'card-tile': ['card:tile'], 'card-row': ['card:row'],
      header: ['shell'], cart: ['cart'], 'cart-summary': ['cart'],
      account: ['account.orders', 'account.order', 'account.loyalty', 'account.referrals', 'account.profile'],
      orders: ['account.orders'], order: ['account.order'], loyalty: ['account.loyalty'], referrals: ['account.referrals'],
      profile: ['account.profile'], login: ['login'], payment: ['payment-success', 'payment-cancel', 'order-placed'],
      tracking: ['tracking'], verify: ['verify'],
      checkout: ['checkout'], 'order-status': ['order-status'], // stage 5
      'reset-password': ['reset-password'],
      'verify-email': ['verify-email'],
    });
  });
  it('familyAllowedOn / allowedOn', () => {
    expect(familyAllowedOn('payment', 'order-placed')).toBe(true);
    expect(familyAllowedOn('payment', 'cart')).toBe(false);
    expect(allowedOn('FakeSumPart', 'cart')).toBe(true);
    expect(allowedOn('FakeSumPart', 'shell')).toBe(false);
  });
});

describe('renderComponent', () => {
  const ctx = { editing: false, docKey: 'page:x' as DocKey, layout: 'storefront' as const };
  const html = (item: ComponentData) => render(createElement(Fragment, null, renderComponent(item, ctx))).container.innerHTML;
  it('renders a registered block like RenderDoc', () => {
    expect(html(c('S4Ok', 'o'))).toBe('<b>ok</b>');
  });
  it('a throwing non-route block renders nothing and is logged once; an unknown type renders nothing', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(html(c('S4Boom', 'x'))).toBe('');
    cleanup();
    expect(html(c('S4Boom', 'x'))).toBe('');
    expect(error.mock.calls.filter((call) => String(call[0]).includes('[builder] block S4Boom')).length).toBe(1);
    expect(html(c('Nope', 'n'))).toBe('');
  });
});

describe('preview state', () => {
  const wrap = (value: BuilderMode | null) => ({ children }: { children: ReactNode }) =>
    value ? createElement(BuilderModeProvider, { value, children }) : createElement('div', null, children);
  const mode = (extra: Partial<BuilderMode>): BuilderMode => ({ editing: true, previewAs: null, ...extra });
  it('usePreviewState: null without provider, unset, other container, or prototype keys; the id when set', () => {
    const get = (value: BuilderMode | null, name = 'OrdersList') => renderHook(() => usePreviewState(name), { wrapper: wrap(value) }).result.current;
    expect(get(null)).toBeNull();
    expect(get(mode({ previewStates: null }))).toBeNull();
    expect(get(mode({}))).toBeNull();
    expect(get(mode({ previewStates: { Loyalty: 'rewards' } }))).toBeNull();
    expect(get(mode({ previewStates: {} }), 'constructor')).toBeNull();
    expect(get(mode({ previewStates: {} }), '__proto__')).toBeNull();
    expect(get(mode({ previewStates: { OrdersList: 'none' } }))).toBe('none');
  });
  it('usePreviewFixture likewise', () => {
    const get = (value: BuilderMode | null, name = 'OrdersList') => renderHook(() => usePreviewFixture<{ n: number }>(name), { wrapper: wrap(value) }).result.current;
    expect(get(null)).toBeNull();
    expect(get(mode({ previewFixtures: null }))).toBeNull();
    expect(get(mode({ previewFixtures: { Other: { n: 1 } } }))).toBeNull();
    expect(get(mode({ previewFixtures: {} }), 'constructor')).toBeNull();
    expect(get(mode({ previewFixtures: {} }), '__proto__')).toBeNull();
    expect(get(mode({ previewFixtures: { OrdersList: { n: 2 } } }))).toEqual({ n: 2 });
  });
  it('PREVIEW_STATE_IDS defaults', () => {
    expect(PREVIEW_STATE_IDS.TrackingLookup[0]).toBe('form');
    expect(PREVIEW_STATE_IDS.OrderPlaced).toEqual(['chat', 'warning', 'no-chat', 'missing']);
  });
});

describe('findComponent', () => {
  it('depth-first through any slot', () => {
    const items = [c('Section', 's', { content: [c('Columns', 'k', { col1: [c('X', 'x1')], col2: [c('X', 'x2')] })] })];
    expect(findComponent(items, 'X')?.props.id).toBe('x1');
    expect(findComponent(items, 'Y')).toBeUndefined();
    expect(findComponent([], 'X')).toBeUndefined();
  });
});
