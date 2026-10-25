import type { Warehouse, WarehouseGroup } from '@/types/warehouses.ts';

/** One row of the choose-a-warehouse screen: a warehouse, or a group of two or more that opens to its members. */
export type PickerEntry =
  | { kind: 'warehouse'; warehouse: Warehouse }
  | { kind: 'group'; group: WarehouseGroup; warehouses: Warehouse[] };

type GroupEntry = Extract<PickerEntry, { kind: 'group' }>;

/**
 * Folds the flat list (already in display order) into the picker's top level. A group sits where its first member
 * does; a warehouse whose group is unknown stands alone; a group left with one member shows as that warehouse, and a
 * group with none never appears.
 */
export function buildPickerTree(list: Warehouse[], groups: WarehouseGroup[]): PickerEntry[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const entries: PickerEntry[] = [];
  const open = new Map<number, GroupEntry>();
  for (const warehouse of list) {
    const group = warehouse.groupId != null ? byId.get(warehouse.groupId) : undefined;
    if (!group) {
      entries.push({ kind: 'warehouse', warehouse });
      continue;
    }
    const existing = open.get(group.id);
    if (existing) {
      existing.warehouses.push(warehouse);
    } else {
      const entry: GroupEntry = { kind: 'group', group, warehouses: [warehouse] };
      open.set(group.id, entry);
      entries.push(entry);
    }
  }
  return entries.map((e) => (e.kind === 'group' && e.warehouses.length === 1 ? { kind: 'warehouse', warehouse: e.warehouses[0]! } : e));
}

/** The group entry for an id, or `null` when it is gone or collapsed to a single warehouse. */
export function findGroupEntry(tree: PickerEntry[], groupId: number): GroupEntry | null {
  for (const e of tree) if (e.kind === 'group' && e.group.id === groupId) return e;
  return null;
}
