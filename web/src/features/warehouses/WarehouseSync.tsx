import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWarehouses } from '@/api/warehouses.ts';
import { useSessionStore } from '@/stores/session.ts';
import { useCartStore } from '@/stores/cart.ts';
import { useSettingsQuery } from '@/app/settings.ts';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { refreshCartForWarehouse } from '@/features/cart/useServerCart.ts';
import { useCatalog } from '@/features/catalog/use-catalog.ts';
import { selectedWarehouseId, useWarehouseStore, warehouseFeatureOn } from '@/features/warehouses/store.ts';

/**
 * Keeps the warehouse store in step with the world. Mounted once, above the router, and renders nothing.
 *
 *  - fetches the list of warehouses (only when the feature applies: the flag is on and, in a private
 *    shop, the shopper is signed in) and pushes it - with the flag - into the store, where plain
 *    modules can read it;
 *  - forgets a stored choice the list no longer offers (the owner switched that warehouse off);
 *  - once the chosen warehouse's catalogue is in, publishes which products it carries, which is how a
 *    guest basket learns that a line is not available there;
 *  - re-reads a signed-in shopper's server cart when the warehouse in force changes, so the lines
 *    the new warehouse cannot supply come back flagged.
 *
 * Nothing here ever edits the cart's lines: choosing a warehouse never silently removes anything.
 */
export function WarehouseSync() {
  const settings = useSettingsQuery().data;
  const signedIn = useSessionStore((s) => s.token !== null);
  const audience = useSessionStore((s) => (s.token !== null ? (s.customer?.id ?? 0) : null));
  const builder = isBuilderMode();
  const enabled = !builder && warehouseFeatureOn(settings, signedIn);
  const setContext = useWarehouseStore((s) => s.setContext);
  const choose = useWarehouseStore((s) => s.choose);
  const stored = useWarehouseStore((s) => s.warehouseId);
  const selectedId = useWarehouseStore(selectedWarehouseId);

  const list = useQuery({
    queryKey: ['warehouses', audience] as const,
    queryFn: fetchWarehouses,
    enabled,
    staleTime: 30_000,
    retry: 1,
  });

  const warehouses = enabled ? (list.data?.warehouses ?? null) : null;
  const failed = enabled && list.isError;
  useEffect(() => {
    setContext({ enabled, list: warehouses, failed });
  }, [setContext, enabled, warehouses, failed]);

  // A stored id the (fresh) list does not contain is stale. Only a loaded list can say so.
  useEffect(() => {
    if (!enabled || warehouses === null || stored === null) return;
    if (!warehouses.some((w) => w.id === stored)) choose(null);
  }, [enabled, warehouses, stored, choose]);

  // The catalogue at the chosen warehouse tells which cart lines it can supply. Same query (and key)
  // the pages use, so this adds no request.
  const catalog = useCatalog({ enabled: selectedId !== null });
  const products = selectedId !== null ? catalog.data?.products : undefined;
  useEffect(() => {
    setContext({ carried: products ? new Set(products.map((p) => p.id)) : null });
  }, [setContext, products]);

  // The signed-in cart is read at the warehouse in force. Re-read it when that changes while the cart is the
  // server's, and when the server's cart is first adopted with a warehouse already chosen (the boot read can
  // go out before the settings - and so the choice - are known, and would otherwise leave its flags stale).
  const mode = useCartStore((s) => s.mode);
  const read = useRef<string | null>(null);
  useEffect(() => {
    const key = mode === 'server' ? String(selectedId) : null;
    const before = read.current;
    read.current = key;
    if (key === null || key === before) return;
    if (selectedId === null && before === null) return; // first adoption, no warehouse: nothing differs
    void refreshCartForWarehouse();
  }, [selectedId, mode]);

  return null;
}
