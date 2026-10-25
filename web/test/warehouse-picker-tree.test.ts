import { describe, expect, it } from 'vitest';
import { buildPickerTree, findGroupEntry } from '@/features/warehouses/picker-tree.ts';
import type { Warehouse, WarehouseGroup } from '@/types/warehouses.ts';

const w = (id: number, name: string, groupId: number | null = null): Warehouse => ({ id, name, country: null, isDefault: id === 1, groupId });
const UK: WarehouseGroup = { id: 10, name: 'UK', description: null };
const EU: WarehouseGroup = { id: 20, name: 'EU', description: 'Europe' };
const LIST = [w(1, 'China'), w(2, 'UK2', 10), w(3, 'UK1', 10), w(4, 'Raws'), w(5, 'EU1', 20)];

describe('buildPickerTree', () => {
  it('groups members at the first member position; a one-member group collapses to a warehouse', () => {
    const tree = buildPickerTree(LIST, [UK, EU]);
    expect(tree.map((e) => (e.kind === 'warehouse' ? `w:${e.warehouse.name}` : `g:${e.group.name}`))).toEqual(['w:China', 'g:UK', 'w:Raws', 'w:EU1']);
    const uk = tree[1]!;
    expect(uk.kind === 'group' && uk.warehouses.map((x) => x.name)).toEqual(['UK2', 'UK1']);
  });

  it('with no groups every entry is a warehouse', () => {
    const tree = buildPickerTree(LIST, []);
    expect(tree).toHaveLength(5);
    expect(tree.every((e) => e.kind === 'warehouse')).toBe(true);
  });

  it('an unknown groupId is a plain warehouse', () => {
    const tree = buildPickerTree([w(1, 'A', 99), w(2, 'B', 99)], [UK]);
    expect(tree.map((e) => e.kind)).toEqual(['warehouse', 'warehouse']);
  });

  it('a group with no members never appears, and non-adjacent members join the first position', () => {
    const tree = buildPickerTree([w(1, 'A', 10), w(2, 'B'), w(3, 'C', 10)], [UK, EU]);
    expect(tree.map((e) => e.kind)).toEqual(['group', 'warehouse']);
    expect(tree[0]!.kind === 'group' && tree[0]!.warehouses.map((x) => x.name)).toEqual(['A', 'C']);
  });
});

describe('findGroupEntry', () => {
  const tree = buildPickerTree(LIST, [UK, EU]);
  it('finds a live group', () => expect(findGroupEntry(tree, 10)?.warehouses).toHaveLength(2));
  it('is null for a collapsed or unknown group', () => {
    expect(findGroupEntry(tree, 20)).toBeNull();
    expect(findGroupEntry(tree, 99)).toBeNull();
  });
});
