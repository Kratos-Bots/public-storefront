import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/builder/registry.ts', async (orig) => {
  const real = await (await import('./helpers/fake-parts.tsx')).withFakeBlocks(orig);
  const { z } = await import('zod');
  const { BOX, VIS, styleSupport } = await import('@/builder/style/model.ts');
  const { defineBlock, slot } = await import('@/builder/define.ts');
  const { flattenTypes, findComponent, part } = await import('@/builder/parts.ts');
  const fakePart = (name: string, extra: Record<string, unknown> = {}, slots: string[] = []) => defineBlock<Record<string, unknown> & { id: string }>({
    name, label: name.replace('Fake', ''), category: 'part', part: { family: 'checkout', ...extra }, layouts: 'all', routeBound: false, slots,
    style: styleSupport('root', [...BOX, ...VIS]),
    schema: z.object(Object.fromEntries(slots.map((s) => [s, slot()]))), defaultProps: Object.fromEntries(slots.map((s) => [s, []])), render: () => null,
  } as never);
  const step = (name: string) => fakePart(name, {
    defaultSlots: (_p: unknown, { id }: { id: string }) => ({ before: [], after: id.includes('B') ? [part('FakeCoupon', id)] : [] }),
  }, ['before', 'after']);
  const SLOTS = ['head', 'lead', 'steps', 'after', 'aside'];
  const flow = defineBlock<Record<string, unknown> & { id: string }>({
    name: 'FakeFlow', label: 'Flow', category: 'commerce', layouts: 'all', routeBound: true, slots: SLOTS,
    style: styleSupport('wrap', [...BOX, ...VIS]),
    schema: z.object(Object.fromEntries(SLOTS.map((s) => [s, slot()]))), defaultProps: Object.fromEntries(SLOTS.map((s) => [s, []])),
    container: {
      family: 'checkout', insertSlot: 'steps',
      required: ['FakeHead', 'FakeStepA', 'FakeStepB', 'FakeSum'], unique: ['FakeHead', 'FakeStepA', 'FakeStepB', 'FakeSum', 'FakeCoupon'],
      slotAccepts: { steps: ['FakeStepA', 'FakeStepB'] }, contentOnly: true, noHide: ['FakeCoupon'],
      homes: {
        FakeHead: ['FakeFlow.head'], FakeStepA: ['FakeFlow.steps'], FakeStepB: ['FakeFlow.steps'],
        FakeCoupon: ['FakeStepB.before', 'FakeStepB.after', 'FakeFlow.aside'], FakeSum: ['FakeFlow.aside'],
      },
      homeWhy: { FakeCoupon: 'no prices exist there yet' },
      order: (slots: Record<string, never[]>, props: Record<string, unknown>) => {
        (globalThis as Record<string, unknown>).__flowOrder = { slots, props };
        const types = flattenTypes(slots.steps);
        const a = types.indexOf('FakeStepA'), b = types.indexOf('FakeStepB');
        return a >= 0 && b >= 0 && b < a ? { message: 'B must follow A.', blockId: String(findComponent(slots.steps, 'FakeStepB')?.props.id) } : null;
      },
      defaultSlots: () => Object.fromEntries(SLOTS.map((s) => [s, []])),
    },
    render: () => null,
  } as never);
  return { ...real, BLOCKS: { ...real.BLOCKS, FakeFlow: flow, FakeStepA: step('FakeStepA'), FakeStepB: step('FakeStepB'),
    FakeHead: fakePart('FakeHead'), FakeCoupon: fakePart('FakeCoupon'), FakeSum: fakePart('FakeSum') } };
});
import { checkRules, containsVisibleType } from '@/builder/rules.ts';
import { FAMILY_DOCS, familyAllowedOn, flattenTypes } from '@/builder/parts.ts';
import { PREVIEW_STATE_IDS } from '@/builder/mode.ts';
import { upgradeItems } from '@/builder/upgrade.ts';
import { validateDoc } from '@/builder/guard.ts';
import type { ComponentData, PuckDoc } from '@/builder/types.ts';

afterEach(() => { vi.restoreAllMocks(); });

const c = (type: string, id: string, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id, ...props } });
const doc = (content: ComponentData[]): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content });
const issues = (content: ComponentData[], prefixes: string[]) =>
  checkRules(doc(content), 'checkout', 'storefront').filter((i) => prefixes.some((p) => i.rule.startsWith(p)));
const rules = (content: ComponentData[], prefixes: string[]) => issues(content, prefixes).map((i) => i.rule);
const section = (id: string, content: ComponentData[], extra: Record<string, unknown> = {}) => c('Section', id, { content, ...extra });
const cols = (id: string, props: Record<string, unknown>) => c('Columns', id, props);
const HEAD = c('FakeHead', 'h');
const A = (props: Record<string, unknown> = {}) => c('FakeStepA', 'stepA', props);
const B = (props: Record<string, unknown> = {}) => c('FakeStepB', 'stepB', props);
const SUM = c('FakeSum', 'sum');
const coupon = (id = 'cp') => c('FakeCoupon', id);
/** A fully legal flow; `over` replaces slots. */
const flow = (over: Record<string, ComponentData[]> = {}) => c('FakeFlow', 'flow', {
  head: [HEAD], lead: [], steps: [A(), B()], after: [], aside: [SUM], ...over,
});

describe('homes', () => {
  it('a legal flow raises nothing', () => {
    expect(rules([flow()], ['part-', 'slot-accepts', 'hidden-required'])).toEqual([]);
  });
  it('a coupon in the wrong step slot is a part-home issue naming the reason', () => {
    const found = issues([flow({ steps: [A({ before: [coupon()] }), B()] })], ['part-home'])[0]!;
    expect(found.rule).toBe('part-home:FakeCoupon');
    expect(found.message).toContain("can't go in");
    expect(found.message).toContain('no prices exist there yet');
    expect(found.message.endsWith('.')).toBe(true);
    expect(found.blockId).toBe('cp');
  });
  it('a part without a reason ends the message with a period', () => {
    const found = issues([flow({ head: [HEAD, SUM] })], ['part-home'])[0]!;
    expect(found.message).toBe("Sum can't go in Flow.");
  });
  it('homed slots raise nothing', () => {
    for (const steps of [[A(), B({ after: [coupon()] })], [A(), B({ before: [coupon()] })]]) {
      expect(rules([flow({ steps })], ['part-home'])).toEqual([]);
    }
    expect(rules([flow({ aside: [SUM, coupon()] })], ['part-home'])).toEqual([]);
  });
  it('a content block passes through: the nearest family ancestor decides', () => {
    expect(rules([flow({ steps: [A({ after: [section('s', [coupon()])] }), B()] })], ['part-home'])).toEqual(['part-home:FakeCoupon']);
    expect(rules([flow({ steps: [A(), B({ after: [section('s', [coupon()])] })] })], ['part-home'])).toEqual([]);
  });
  it('a hidden column is still checked for homes: correct home there is fine, a wrong one is flagged', () => {
    const hidden = (inner: ComponentData[]) => cols('k', { columns: '2', col3: inner });
    expect(rules([flow({ steps: [A(), B({ after: [hidden([coupon()])] })] })], ['part-home'])).toEqual([]);
    expect(rules([flow({ steps: [A({ after: [hidden([coupon()])] }), B()] })], ['part-home'])).toEqual(['part-home:FakeCoupon']);
  });
  it('a part outside its homes in a restricted slot is also a slot-accepts issue', () => {
    const r = rules([flow({ steps: [A(), B(), SUM] })], ['part-home', 'slot-accepts']);
    expect(r).toContain('part-home:FakeSum');
    expect(r).toContain('slot-accepts:FakeFlow.steps');
  });
  it('a container without homes (stage-3/4 containers) raises no part-home, and a part outside any container is only a placement matter', () => {
    const real = checkRules(doc([c('FakeCart', 'cart', { head: [c('FakeHead', 'h')] })]), 'cart', 'storefront').filter((i) => i.rule.startsWith('part-home'));
    expect(real).toEqual([]);
    expect(rules([A()], ['part-home'])).toEqual([]);
  });
  it('a part of another family is not a home concern', () => {
    expect(rules([flow({ lead: [c('CartLines', 'x')] })], ['part-home'])).toEqual([]);
  });
});

describe('order', () => {
  it('flags a wrong order with the function message and blockId; legal order raises nothing', () => {
    const bad = issues([flow({ steps: [B(), A()] })], ['part-order'])[0]!;
    expect(bad.rule).toBe('part-order:FakeFlow');
    expect(bad.message).toBe('B must follow A.');
    expect(bad.blockId).toBe('stepB');
    expect(rules([flow()], ['part-order'])).toEqual([]);
  });
  it('a missing member is only a part-required problem', () => {
    expect(rules([flow({ steps: [B()] })], ['part-order', 'part-required'])).toEqual(['part-required:FakeFlow.FakeStepA']);
  });
  it('is called with the stored slots (not visible-filtered) and the props', () => {
    const hiddenStep = cols('k', { columns: '2', col3: [A()] });
    (globalThis as Record<string, unknown>).__flowOrder = undefined;
    issues([flow({ steps: [B(), hiddenStep] })], ['part-order']);
    const seen = (globalThis as Record<string, unknown>).__flowOrder as { slots: Record<string, ComponentData[]>; props: Record<string, unknown> };
    expect(Object.keys(seen.slots)).toEqual(['head', 'lead', 'steps', 'after', 'aside']);
    expect(flattenTypes(seen.slots.steps!)).toEqual(['FakeStepB', 'Columns', 'FakeStepA']);
    expect(seen.props.id).toBe('flow');
  });
});

describe('noHide', () => {
  const hide = { blockStyle: { hide: 'mobile' } };
  it('a hidden block holding a noHide part is hidden-required; holding something else is not', () => {
    expect(rules([flow({ aside: [SUM, section('s', [coupon()], hide)] })], ['hidden-required'])).toEqual(['hidden-required:Section']);
    expect(rules([flow({ aside: [SUM, section('s', [c('RichText', 'r')], hide)] })], ['hidden-required'])).toEqual([]);
    expect(rules([flow({ aside: [SUM, section('s', [coupon()])] })], ['hidden-required'])).toEqual([]);
  });
  it('a hidden block holding a required part is still reported', () => {
    expect(rules([flow({ aside: [section('s', [SUM], hide)] })], ['hidden-required'])).toContain('hidden-required:Section');
  });
});

describe('contentOnly', () => {
  it('content blocks are fine; non-content blocks (direct or wrapped) are slot-accepts issues', () => {
    expect(rules([flow({ after: [c('RichText', 'r')] })], ['slot-accepts'])).toEqual([]);
    expect(rules([flow({ after: [c('FeaturedProducts', 'f')] })], ['slot-accepts'])).toEqual(['slot-accepts:FakeFlow.after']);
    expect(rules([flow({ after: [section('s', [c('FeaturedProducts', 'f')])] })], ['slot-accepts'])).toEqual(['slot-accepts:FakeFlow.after']);
  });
  it('a coupon in the after slot is a part-home issue, not a content issue', () => {
    expect(rules([flow({ after: [coupon()] })], ['part-home', 'slot-accepts'])).toEqual(['part-home:FakeCoupon']);
  });
});

describe('counting through slotted parts', () => {
  it('a duplicate coupon (one in a step, one in aside) is part-unique', () => {
    const r = rules([flow({ steps: [A(), B({ after: [coupon('c1')] })], aside: [SUM, coupon('c2')] })], ['part-unique']);
    expect(r).toEqual(['part-unique:FakeFlow.FakeCoupon']);
  });
  it('a required part inside a visible slot of a slotted part counts', () => {
    expect(rules([flow({ head: [], steps: [A({ before: [HEAD] }), B()] })], ['part-required'])).toEqual([]);
  });
});

describe('upgrade and guard', () => {
  it('fills absent step slots from part.defaultSlots; present slots are untouched', () => {
    const [out] = upgradeItems([B()], 'storefront');
    expect(out!.props.after).toEqual([{ type: 'FakeCoupon', props: { id: 'stepB-FakeCoupon' } }]);
    expect(out!.props.before).toEqual([]);
    const kept = [B({ after: [], before: [] })];
    expect(upgradeItems(kept, 'storefront')).toBe(kept);
  });
  it('a second pass returns the same objects', () => {
    const once = upgradeItems([B()], 'storefront');
    expect(upgradeItems(once, 'storefront')).toBe(once);
  });
  it('a container with absent slots still fills as before', () => {
    const [out] = upgradeItems([c('FakeFlow', 'flow')], 'storefront');
    expect(Object.keys(out!.props).sort()).toEqual(['after', 'aside', 'head', 'id', 'lead', 'steps']);
    expect(out!.props.steps).toEqual([]);
  });
  it('a block without defaultSlots is untouched', () => {
    const items = [c('FakeHead', 'h')];
    expect(upgradeItems(items, 'storefront')).toBe(items);
  });
  it('the guard fills an absent step slot before cleaning, so the default coupon survives', () => {
    const { doc: clean } = validateDoc(doc([flow({ steps: [A({ before: [], after: [] }), c('FakeStepB', 'stepB')] }), c('CheckoutFlow', 'real')]), 'checkout', 'storefront');
    const stepB = (clean!.content[0]!.props.steps as ComponentData[])[1]!;
    expect((stepB.props.after as ComponentData[]).map((x) => x.type)).toEqual(['FakeCoupon']);
  });
});

describe('flattenTypes and containsVisibleType', () => {
  it('flattenTypes is pre-order through nested slots and ignores non-component arrays', () => {
    const items = [section('s', [c('RichText', 'r'), c('FakeStepB', 'stepB', { before: [coupon()], tags: ['a', 'b'], nums: [1] })]), c('FakeHead', 'h')];
    expect(flattenTypes(items)).toEqual(['Section', 'RichText', 'FakeStepB', 'FakeCoupon', 'FakeHead']);
  });
  it('containsVisibleType follows visible slots only', () => {
    expect(containsVisibleType([B({ after: [coupon()] })], 'FakeCoupon')).toBe(true);
    expect(containsVisibleType([B()], 'FakeCoupon')).toBe(false);
    expect(containsVisibleType([cols('k', { columns: '2', col3: [coupon()] })], 'FakeCoupon')).toBe(false);
    expect(containsVisibleType([cols('k', { columns: '2', col1: [coupon()] })], 'FakeCoupon')).toBe(true);
  });
});

describe('families', () => {
  it('checkout and order-status own their own docs', () => {
    expect(FAMILY_DOCS.checkout).toEqual(['checkout']);
    expect(FAMILY_DOCS['order-status']).toEqual(['order-status']);
    expect(familyAllowedOn('checkout', 'checkout')).toBe(true);
    expect(familyAllowedOn('checkout', 'order-status')).toBe(false);
    expect(familyAllowedOn('order-status', 'order-status')).toBe(true);
  });
  it('OrderStatus has six preview states, the first being the default', () => {
    expect(PREVIEW_STATE_IDS.OrderStatus[0]).toBe('shipped');
    expect(PREVIEW_STATE_IDS.OrderStatus).toHaveLength(6);
  });
});
