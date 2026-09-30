import { describe, expect, it, vi } from 'vitest';
vi.mock('@/builder/registry.ts', async (orig) => (await import('./helpers/fake-parts.tsx')).withFakeBlocks(orig));
import { fillAbsentSlots, upgradeDoc, upgradeItems } from '@/builder/upgrade.ts';
import { validateDoc } from '@/builder/guard.ts';
import { BLOCKS } from '@/builder/registry.ts';
import type { ComponentData, PuckDoc } from '@/builder/types.ts';

const box = (props: Record<string, unknown> = {}): ComponentData => ({ type: 'FakeBox', props: { id: 'bx', ...props } });
const doc = (content: ComponentData[]): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content });

describe('fillAbsentSlots (spec §8)', () => {
  it('fills an absent slot from defaultSlots, with derived ids', () => {
    const out = fillAbsentSlots(BLOCKS.FakeBox!, box().props, 'storefront');
    expect((out.a as ComponentData[]).map((c) => c.props.id)).toEqual(['bx-FakeTitle', 'bx-FakePrice', 'bx-FakeAdd']);
    expect((out.b as ComponentData[]).map((c) => c.type)).toEqual(['FakeNote']);
  });
  it('never touches a present slot, even []', () => {
    const props = box({ a: [], b: undefined }).props;
    const out = fillAbsentSlots(BLOCKS.FakeBox!, props, 'storefront');
    expect(out.a).toBe(props.a);
    expect(out.b).toHaveLength(1);
  });
  it('reads legacy toggles only while filling', () => {
    expect(fillAbsentSlots(BLOCKS.FakeBox!, box({ showNote: false }).props, 'storefront').b).toEqual([]);
  });
  it('returns the same object when nothing is absent, and for a non-container', () => {
    const props = box({ a: [], b: [] }).props;
    expect(fillAbsentSlots(BLOCKS.FakeBox!, props, 'storefront')).toBe(props);
    const h = { id: 'h', text: 'x' };
    expect(fillAbsentSlots(BLOCKS.Heading!, h, 'storefront')).toBe(h);
  });
});

describe('upgradeDoc', () => {
  it('is idempotent and identity-preserving', () => {
    const d = doc([box()]);
    const once = upgradeDoc(d, 'product', 'storefront');
    expect(once).not.toBe(d);
    expect(upgradeDoc(once, 'product', 'storefront')).toBe(once);
    expect(upgradeDoc(doc([{ type: 'Heading', props: { id: 'h' } }]), 'page:x', 'storefront').content).toHaveLength(1);
  });
  it('reaches a container nested in a Section and in zones', () => {
    const nested = doc([{ type: 'Section', props: { id: 's', content: [box()] } }]);
    const out = upgradeDoc({ ...nested, zones: { 'x:y': [box({ id: 'z' })] } }, 'product', 'storefront');
    expect(((out.content[0]!.props.content as ComponentData[])[0]!.props.a as unknown[]).length).toBe(3);
    expect((out.zones!['x:y']![0]!.props.a as unknown[]).length).toBe(3);
  });
  it('leaves malformed entries alone', () => {
    expect(upgradeItems([null as unknown as ComponentData, box()], 'storefront')[0]).toBeNull();
  });
});

describe('guard (spec §8: before the slots are cleaned)', () => {
  it('fills absent slots, then de-duplicates their ids like any other', () => {
    // One ProductDetail keeps the product doc's own rules satisfied, so the cleaned doc is returned
    // (FakeBox parts may only sit on the product doc, so 'page:x' would reject it on placement).
    const detail: ComponentData = { type: 'ProductDetail', props: { ...structuredClone(BLOCKS.ProductDetail!.defaultProps), id: 'pd' } };
    const d = doc([detail, box(), box()]);
    const { doc: clean, issues } = validateDoc(d, 'product', 'storefront');
    expect(issues.filter((i) => !i.rule.startsWith('drop:') && !i.rule.startsWith('placement'))).toEqual([]);
    expect(clean).not.toBeNull();
    expect(JSON.stringify(clean)).toContain('"id":"bx-FakeTitle~2"');
    const ids = JSON.stringify(clean).match(/"id":"[^"]+"/g)!;
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('a present empty slot stays empty and trips part-required', () => {
    const { issues } = validateDoc(doc([box({ a: [], b: [] })]), 'product', 'storefront');
    expect(issues.map((i) => i.rule)).toContain('part-required:FakeBox.FakeTitle');
  });
});
