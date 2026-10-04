// web/test/builder-editor-checkout-parts.test.ts — stage 5 task 6: palette, locks, allow lists, step order, legality
import { describe, expect, it } from 'vitest';
import type { Config } from '@puckeditor/core';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { blockMenu, buildEditorConfig, lockedPresent } from '@/builder/editor/config.ts';
import {
  checkoutNotices, partStates, withPartAdded,
  CHECKOUT_AFTER_NOTICE, CHECKOUT_ASIDE_NOTICE, CHECKOUT_COUPON_OFF_NOTICE, CHECKOUT_NOTES_OFF_NOTICE,
} from '@/builder/editor/container-parts.ts';
import { containerOf, resetArrangement, resetStepOrder } from '@/builder/editor/container-actions.ts';
import { introducesIllegal } from '@/builder/editor/legality.ts';
import { quickFixFor } from '@/builder/editor/IssueQuickFix.tsx';
import { BLOCK_RULE_RE } from '@/builder/editor/EditorHeader.tsx';
import { docFor, docsFromPageSet } from '@/builder/editor/page-set.ts';
import { requiredPartsOn } from '@/builder/editor/route-bound.ts';
import { moveStep, stepRows, storedStepOrder, withStepOrder } from '@/builder/editor/step-order.ts';
import { DEFAULT_STEP_ORDER, isLegalStepOrder, STEP_KINDS, type StepKind } from '@/builder/family-checkout.ts';
import { containsType, findComponent } from '@/builder/parts.ts';
import { checkRules } from '@/builder/rules.ts';
import type { ComponentData, DocKey, LayoutKind, PuckDoc } from '@/builder/types.ts';

const L: LayoutKind = 'storefront';
const items = (v: unknown) => v as ComponentData[];
const types = (v: unknown) => items(v).map((c) => c.type);
const checkout = () => defaultDoc('checkout', L)!;
const flow = (doc: PuckDoc) => doc.content[0]!;
const withFlow = (doc: PuckDoc, f: ComponentData): PuckDoc => ({ ...doc, content: [f, ...doc.content.slice(1)] });
const step = (f: ComponentData, type: string) => items(f.props.steps).find((s) => s.type === type)!;
const setSlot = (c: ComponentData, slot: string, v: ComponentData[]): ComponentData => ({ ...c, props: { ...c.props, [slot]: v } });
const setStep = (f: ComponentData, type: string, fn: (s: ComponentData) => ComponentData): ComponentData =>
  setSlot(f, 'steps', items(f.props.steps).map((s) => (s.type === type ? fn(s) : s)));
const coupon = (id = 'cp-extra'): ComponentData => ({ type: 'CheckoutCoupon', props: { id } });
const rich = (id = 'rt'): ComponentData => ({ type: 'RichText', props: { id, html: '<p>hi</p>' } });
const cfg = (docKey: DocKey, doc: PuckDoc): Config => buildEditorConfig(docKey, L, lockedPresent(doc, docKey));
const allow = (c: Config, type: string, slot: string) => (c.components[type]!.fields as Record<string, { allow?: string[] }>)[slot]!.allow!;
const perms = (c: Config, type: string) => (c.components[type] as { permissions?: Record<string, boolean> }).permissions;
const STEP_TYPES_IN_ORDER = ['CheckoutContact', 'CheckoutAddress', 'CheckoutShipping', 'CheckoutPayment', 'CheckoutReview'];

const isSlotValue = (v: unknown): v is ComponentData[] => Array.isArray(v) && v.every((x) => x && typeof x === 'object' && 'type' in x);
/** `doc` with every block of one of `drop` types removed, at any depth. */
function without(doc: PuckDoc, drop: readonly string[]): PuckDoc {
  const strip = (list: ComponentData[]): ComponentData[] => list.filter((c) => !drop.includes(c.type)).map((c) => ({
    ...c,
    props: Object.fromEntries(Object.entries(c.props).map(([k, v]) => [k, isSlotValue(v) ? strip(v) : v])) as ComponentData['props'],
  }));
  return { ...doc, content: strip(doc.content) };
}

describe('palette', () => {
  it('default checkout offers nothing (every unique part is on the page)', () => {
    expect(blockMenu('checkout', L, lockedPresent(checkout(), 'checkout')).filter((g) => g.category === 'part')).toEqual([]);
  });
  it('checkout: one "Checkout parts" category with only the absent unique parts', () => {
    const doc = without(checkout(), ['CheckoutProgress', 'CheckoutCoupon', 'CheckoutNotes']);
    const parts = blockMenu('checkout', L, lockedPresent(doc, 'checkout')).filter((g) => g.category === 'part');
    expect(parts.map((g) => g.title)).toEqual(['Checkout parts']);
    expect(parts[0]!.key).toBe('part:checkout');
    expect(parts[0]!.blocks.map((b) => b.name).sort()).toEqual(['CheckoutCoupon', 'CheckoutNotes', 'CheckoutProgress']);
    expect(cfg('checkout', doc).categories!['part:checkout']!.components).toEqual(expect.arrayContaining(['CheckoutProgress']));
  });
  it('requiredPartsOn: seven checkout parts', () => {
    expect([...requiredPartsOn('checkout', L)].sort()).toEqual(['CheckoutAddress', 'CheckoutContact', 'CheckoutHeading', 'CheckoutPayment', 'CheckoutReview', 'CheckoutShipping', 'CheckoutSummary']);
  });
});

describe('permissions', () => {
  const c = cfg('checkout', checkout());
  it('the five steps cannot be deleted, copied or dragged', () => {
    for (const t of STEP_TYPES_IN_ORDER) expect(perms(c, t), t).toEqual({ delete: false, duplicate: false, drag: false });
  });
  it('heading and summary: no delete/copy, drag allowed', () => {
    for (const t of ['CheckoutHeading', 'CheckoutSummary']) expect(perms(c, t), t).toEqual({ delete: false, duplicate: false });
  });
  it('coupon, notes, progress: no copy only', () => {
    for (const t of ['CheckoutCoupon', 'CheckoutNotes', 'CheckoutProgress']) expect(perms(c, t), t).toEqual({ duplicate: false });
  });
});

describe('slot allow lists', () => {
  const c = cfg('checkout', checkout());
  it('CheckoutFlow.steps is the five steps, in step order', () => {
    expect(allow(c, 'CheckoutFlow', 'steps')).toEqual(STEP_TYPES_IN_ORDER);
  });
  it('CheckoutFlow.after holds content only; head adds the heading', () => {
    const after = allow(c, 'CheckoutFlow', 'after');
    expect(after.some((n) => n.startsWith('Checkout'))).toBe(false);
    expect(after).toContain('RichText');
    expect(allow(c, 'CheckoutFlow', 'head')).toContain('CheckoutHeading');
    expect(allow(c, 'CheckoutFlow', 'head')).not.toContain('CheckoutCoupon');
    expect(allow(c, 'CheckoutFlow', 'aside')).toContain('CheckoutSummary');
    expect(allow(c, 'CheckoutFlow', 'lead')).toContain('CheckoutProgress');
  });
  it('step slots: Contact takes content and notes, not the coupon; Shipping takes both', () => {
    const before = allow(c, 'CheckoutContact', 'before');
    expect(before).toContain('RichText');
    expect(before).toContain('CheckoutNotes');
    expect(before).not.toContain('CheckoutCoupon');
    const after = allow(c, 'CheckoutShipping', 'after');
    expect(after).toEqual(expect.arrayContaining(['CheckoutCoupon', 'CheckoutNotes', 'RichText']));
    expect(after).not.toContain('CheckoutContact');
  });
});

describe('step order (pure)', () => {
  it('default order: Review has no enabled arrow; Contact down enabled; Address down blocked by Shipping', () => {
    const rows = stepRows(DEFAULT_STEP_ORDER);
    const by = Object.fromEntries(rows.map((r) => [r.kind, r]));
    expect(by.review!.up).toEqual({ ok: false, reason: 'Always last — it holds Place order' });
    expect(by.review!.down.ok).toBe(false);
    expect(by.contact!.down.ok).toBe(true);
    expect(by.contact!.up).toEqual({ ok: false, reason: 'Already at the end' });
    expect(by.address!.down).toEqual({ ok: false, reason: 'Delivery needs the address first' });
    expect(by.payment!.up).toEqual({ ok: false, reason: 'Payment must come after Delivery' });
    expect(by.payment!.down).toEqual({ ok: false, reason: 'Review is always last' });
    expect(rows.map((r) => r.label)).toEqual(['Your details', 'Delivery address', 'Delivery', 'Payment', 'Review']);
  });

  it('property: from every legal order, every ok move lands on a legal order and every blocked move on an illegal one', () => {
    const permute = (xs: readonly StepKind[]): StepKind[][] => (xs.length <= 1
      ? [[...xs]]
      : xs.flatMap((x, i) => permute([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
    const legal = permute(STEP_KINDS).filter(isLegalStepOrder);
    expect(legal).toHaveLength(4);
    for (const order of legal) {
      for (const row of stepRows(order)) {
        for (const dir of [-1, 1] as const) {
          const move = dir === -1 ? row.up : row.down;
          const next = moveStep(order, row.kind, dir);
          if (move.ok) {
            expect(next, `${order} ${row.kind} ${dir}`).not.toBeNull();
            expect(isLegalStepOrder(next!)).toBe(true);
          } else {
            expect(next).toBeNull();
            expect(move.reason).not.toBe('');
          }
        }
      }
    }
  });

  it("withStepOrder reorders by kind, keeping ids, before/after contents and a step's blockStyle", () => {
    const styled: ComponentData = { type: 'CheckoutContact', props: { id: 'c1', before: [rich('b1')], after: [rich('a1')], blockStyle: { fg: 'x' } } };
    const base = flow(checkout());
    const f = setSlot(base, 'steps', items(base.props.steps).map((s) => (s.type === 'CheckoutContact' ? styled : s)));
    const next = moveStep(storedStepOrder(f), 'contact', 1)!;
    expect(next).toEqual(['address', 'contact', 'shipping', 'payment', 'review']);
    const moved = withStepOrder(f, next);
    expect(types(moved.props.steps)).toEqual(['CheckoutAddress', 'CheckoutContact', 'CheckoutShipping', 'CheckoutPayment', 'CheckoutReview']);
    expect(step(moved, 'CheckoutContact')).toBe(styled);
    expect(step(moved, 'CheckoutShipping')).toBe(step(f, 'CheckoutShipping'));
    expect(storedStepOrder(moved)).toEqual(next);
  });

  it("resetStepOrder restores the default order and keeps every slot's content", () => {
    const f = withStepOrder(flow(checkout()), ['address', 'shipping', 'contact', 'payment', 'review']);
    const withBlock = setStep(f, 'CheckoutShipping', (s) => setSlot(s, 'before', [rich('mine')]));
    const reset = resetStepOrder(withBlock);
    expect(storedStepOrder(reset)).toEqual([...DEFAULT_STEP_ORDER]);
    expect(types(step(reset, 'CheckoutShipping').props.before)).toEqual(['RichText']);
    expect(checkRules(withFlow(checkout(), reset), 'checkout', L).filter((i) => i.rule.startsWith('part-order'))).toEqual([]);
  });
});

describe('introducesIllegal', () => {
  const base = checkout();
  it('a coupon inserted into the Contact step is refused with the part-home message', () => {
    const next = withFlow(base, setStep(flow(base), 'CheckoutContact', (s) => setSlot(s, 'before', [coupon()])));
    const msg = introducesIllegal(base, next, 'checkout', L);
    expect(msg).toContain("Discount code can't go in");
    expect(msg).toContain('Your details');
  });
  it('a Columns holding the coupon in the Contact step is refused too', () => {
    const cols: ComponentData = { type: 'Columns', props: { id: 'cols', col1: [coupon('cp2')], col2: [], col3: [], col4: [] } };
    const next = withFlow(base, setStep(flow(base), 'CheckoutContact', (s) => setSlot(s, 'before', [cols])));
    expect(introducesIllegal(base, next, 'checkout', L)).toContain("Discount code can't go in");
  });
  it('a legal edit is fine', () => {
    const next = withFlow(base, setStep(flow(base), 'CheckoutContact', (s) => setSlot(s, 'before', [rich()])));
    expect(introducesIllegal(base, next, 'checkout', L)).toBeNull();
    const moved = withFlow(base, withStepOrder(flow(base), ['address', 'contact', 'shipping', 'payment', 'review']));
    expect(introducesIllegal(base, moved, 'checkout', L)).toBeNull();
    expect(introducesIllegal(base, withFlow(base, setSlot(flow(base), 'after', [rich()])), 'checkout', L)).toBeNull();
  });
  it('a stored document that is already illegal is not reverted over an unrelated edit, but a further illegal change is', () => {
    const bad = withFlow(base, withStepOrder(flow(base), ['contact', 'address', 'payment', 'shipping', 'review']));
    expect(checkRules(bad, 'checkout', L).some((i) => i.rule === 'part-order:CheckoutFlow')).toBe(true);
    const edited = withFlow(bad, setStep(flow(bad), 'CheckoutContact', (s) => setSlot(s, 'before', [rich()])));
    expect(introducesIllegal(bad, edited, 'checkout', L)).toBeNull();
    const further = withFlow(edited, setStep(flow(edited), 'CheckoutContact', (s) => setSlot(s, 'after', [coupon('cp3')])));
    expect(introducesIllegal(edited, further, 'checkout', L)).toContain("Discount code can't go in");
  });
});

describe('withPartAdded: default-holder placement', () => {
  const taken = (f: ComponentData) => new Set<string>([String(f.props.id)]);
  it('re-adds the coupon into Delivery.after, never directly into steps', () => {
    const f = flow(without(checkout(), ['CheckoutCoupon']));
    const next = withPartAdded(f, 'CheckoutCoupon', L, taken(f));
    expect(types(next.props.steps)).toEqual(STEP_TYPES_IN_ORDER);
    const shipping = step(next, 'CheckoutShipping');
    expect(types(shipping.props.after)).toEqual(['CheckoutCoupon']);
    expect(items(shipping.props.after)[0]!.props.id).toBe(`${shipping.props.id}-CheckoutCoupon`);
  });
  it('re-adds the notes into Review.after', () => {
    const f = flow(without(checkout(), ['CheckoutNotes']));
    const next = withPartAdded(f, 'CheckoutNotes', L, taken(f));
    const review = step(next, 'CheckoutReview');
    expect(types(review.props.after)).toEqual(['CheckoutNotes']);
    expect(items(review.props.after)[0]!.props.id).toBe(`${review.props.id}-CheckoutNotes`);
    expect(types(next.props.steps)).toHaveLength(5);
  });
  it('re-adds the progress bar into lead (no holder: unchanged behaviour)', () => {
    const f = flow(without(checkout(), ['CheckoutProgress']));
    const next = withPartAdded(f, 'CheckoutProgress', L, taken(f));
    expect(types(next.props.lead)).toEqual(['CheckoutProgress']);
    expect(items(next.props.lead)[0]!.props.id).toBe(`${f.props.id}-CheckoutProgress`);
  });
  it('follows the step wherever it moved, and a taken id gets a suffix', () => {
    const moved = withStepOrder(flow(without(checkout(), ['CheckoutCoupon'])), ['address', 'contact', 'shipping', 'payment', 'review']);
    const id = `${step(moved, 'CheckoutShipping').props.id}-CheckoutCoupon`;
    const next = withPartAdded(moved, 'CheckoutCoupon', L, new Set([id]));
    expect(items(step(next, 'CheckoutShipping').props.after)[0]!.props.id).toBe(`${id}-2`);
    expect(checkRules(withFlow(checkout(), next), 'checkout', L).filter((i) => i.rule.startsWith('part-home'))).toEqual([]);
  });
  it('lists the five steps as Required rows in default order', () => {
    const states = partStates(flow(checkout()), L);
    expect(states.map((s) => s.type)).toEqual([
      'CheckoutHeading', 'CheckoutProgress', 'CheckoutContact', 'CheckoutAddress', 'CheckoutShipping', 'CheckoutCoupon',
      'CheckoutPayment', 'CheckoutReview', 'CheckoutNotes', 'CheckoutSummary',
    ]);
    for (const s of states.filter((x) => STEP_TYPES_IN_ORDER.includes(x.type))) expect(s).toMatchObject({ present: true, required: true });
    expect(states.find((s) => s.type === 'CheckoutCoupon')).toMatchObject({ present: true, required: false });
  });
});

describe('v0.7.0-shaped documents', () => {
  it("a bare { type: CheckoutFlow, props: { id } } opens with every slot, the steps' after defaults included", () => {
    const stored = { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [{ type: 'CheckoutFlow', props: { id: 'legacy' } }], zones: {} };
    const docs = docsFromPageSet({ shell: defaultDoc('shell', L)!, pages: { checkout: stored } } as never, L);
    const doc = docFor(docs, 'checkout', L);
    const f = flow(doc);
    expect(types(f.props.steps)).toEqual(STEP_TYPES_IN_ORDER);
    expect(containsType(items(step(f, 'CheckoutShipping').props.after), 'CheckoutCoupon')).toBe(true);
    expect(containsType(items(step(f, 'CheckoutReview').props.after), 'CheckoutNotes')).toBe(true);
    expect(checkRules(doc, 'checkout', L)).toEqual([]);
  });
});

describe('reset and quick fixes', () => {
  it('resetArrangement returns the default tree and keeps blockStyle', () => {
    const mine = { ...setSlot(flow(checkout()), 'after', [rich()]), props: { ...setSlot(flow(checkout()), 'after', [rich()]).props, blockStyle: { fg: 'brand' } } };
    const reset = resetArrangement(mine, L);
    expect(reset.props.blockStyle).toEqual({ fg: 'brand' });
    expect(reset.props.after).toEqual([]);
    expect(types(reset.props.steps)).toEqual(STEP_TYPES_IN_ORDER);
    expect(findComponent(items(reset.props.steps), 'CheckoutCoupon')).toBeDefined();
  });

  it('issue labels: part-order and part-home rules resolve to block names', () => {
    expect(BLOCK_RULE_RE.exec('part-order:CheckoutFlow')?.[1]).toBe('CheckoutFlow');
    expect(BLOCK_RULE_RE.exec('part-home:CheckoutCoupon')?.[1]).toBe('CheckoutCoupon');
  });

  it('quickFixFor maps the rules to the right button', () => {
    expect(quickFixFor('part-order:CheckoutFlow')).toBe('step-order');
    for (const r of ['part-home:CheckoutCoupon', 'part-placement:CheckoutCoupon', 'slot-accepts:CheckoutFlow.steps']) {
      expect(quickFixFor(r), r).toBe('arrangement');
    }
    expect(quickFixFor('part-required:CheckoutFlow.CheckoutHeading')).toBeNull();
  });

  it('the quick fixes leave a document with no issues', () => {
    const base = checkout();
    const badOrder = withFlow(base, withStepOrder(flow(base), ['contact', 'address', 'payment', 'shipping', 'review']));
    const issue = checkRules(badOrder, 'checkout', L).find((i) => i.rule === 'part-order:CheckoutFlow')!;
    expect(containerOf(badOrder.content, issue.blockId!)).toBe(flow(badOrder));
    expect(checkRules(withFlow(badOrder, resetStepOrder(flow(badOrder))), 'checkout', L)).toEqual([]);

    const noShipCoupon = setStep(flow(base), 'CheckoutShipping', (s) => setSlot(s, 'after', []));
    const badHome = withFlow(base, setStep(noShipCoupon, 'CheckoutContact', (s) => setSlot(s, 'before', [coupon('cpx')])));
    const homeIssue = checkRules(badHome, 'checkout', L).find((i) => i.rule === 'part-home:CheckoutCoupon')!;
    const owner = containerOf(badHome.content, homeIssue.blockId!)!;
    expect(owner.type).toBe('CheckoutFlow');
    expect(checkRules(withFlow(badHome, resetArrangement(owner, L)), 'checkout', L)).toEqual([]);
  });
});

describe('notices and hints', () => {
  it('checkout notices: the two off-switches appear only while the part is absent; the two layout notes always', () => {
    expect(checkoutNotices(flow(checkout()))).toEqual([CHECKOUT_ASIDE_NOTICE, CHECKOUT_AFTER_NOTICE]);
    const noCoupon = checkoutNotices(flow(without(checkout(), ['CheckoutCoupon'])));
    expect(noCoupon).toContain(CHECKOUT_COUPON_OFF_NOTICE);
    expect(noCoupon).not.toContain(CHECKOUT_NOTES_OFF_NOTICE);
    expect(checkoutNotices(flow(without(checkout(), ['CheckoutCoupon', 'CheckoutNotes'])))).toEqual([
      CHECKOUT_COUPON_OFF_NOTICE, CHECKOUT_NOTES_OFF_NOTICE, CHECKOUT_ASIDE_NOTICE, CHECKOUT_AFTER_NOTICE,
    ]);
    expect(checkoutNotices({ type: 'Heading', props: { id: 'h' } })).toEqual([]);
  });
});
