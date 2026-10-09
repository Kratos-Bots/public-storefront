import { useCallback, useMemo } from 'react';
import { selectedWarehouseId, useWarehouseStore, warehouseEnabled } from '@/features/warehouses/store.ts';
import { warehouseInForce, warehouseOrdering } from '@/features/warehouses/prompt.ts';
import type { Warehouse } from '@/types/warehouses.ts';

/** The warehouse id every request should carry (`null` = send nothing). The cheap hook: query keys and the cart read it. */
export function useWarehouseId(): number | null {
  return useWarehouseStore(selectedWarehouseId);
}

export interface SelectedWarehouse {
  /** The feature applies to this visitor. */
  enabled: boolean;
  /** What the picker lists; empty unless there is a real choice (two or more, list fetched). */
  warehouses: Warehouse[];
  /** The chosen non-default warehouse; `null` when it is the shop's default or unknown. */
  selectedId: number | null;
  /** The warehouse the shopper is shipping from, default included - for labels. */
  current: Warehouse | null;
  /** The shop's own warehouse (to switch back to), when there is a real choice. */
  defaultWarehouse: Warehouse | null;
  /** Choose a warehouse; the default's id (or `null`) stores "no choice". */
  select: (id: number | null) => void;
}

export function useSelectedWarehouse(): SelectedWarehouse {
  const selectedId = useWarehouseStore(selectedWarehouseId);
  const ctx = useWarehouseStore((s) => s.ctx);
  const choose = useWarehouseStore((s) => s.choose);
  const enabled = warehouseEnabled(ctx);
  const list = ctx.list;
  const warehouses = useMemo(
    () => (enabled && !ctx.failed && list !== null && list.length >= 2 ? list : []),
    [enabled, ctx.failed, list],
  );
  const defaultWarehouse = useMemo(() => warehouses.find((w) => w.isDefault) ?? null, [warehouses]);
  const current = useMemo(
    () => (selectedId !== null ? warehouses.find((w) => w.id === selectedId) ?? null : defaultWarehouse),
    [selectedId, warehouses, defaultWarehouse],
  );
  const select = useCallback(
    (id: number | null) => choose(id === null || warehouses.find((w) => w.id === id)?.isDefault ? null : id),
    [choose, warehouses],
  );
  return { enabled, warehouses, selectedId, current, defaultWarehouse, select };
}

/**
 * Is ordering paused at the warehouse in force, and what is it called? `paused: false` whenever the
 * feature does not apply or the list is not (or could not be) loaded.
 */
export function useWarehouseOrdering(): { paused: boolean; message: string | null; name: string | null } {
  const selectedId = useWarehouseStore(selectedWarehouseId);
  const ctx = useWarehouseStore((s) => s.ctx);
  const inForce = warehouseEnabled(ctx) && !ctx.failed ? warehouseInForce(ctx.list, selectedId) : null;
  return useMemo(() => ({ ...warehouseOrdering(inForce), name: inForce?.name ?? null }), [inForce]);
}
