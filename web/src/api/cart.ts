import { api, unwrap } from '@/api/client.ts';
import { warehouseGet, warehousePut } from '@/api/warehouse-param.ts';
import { currentWarehouseId } from '@/features/warehouses/store.ts';
import type { ServerCart, CartLineInput } from '@/types/cart.ts';

// The cart is read and written "at" the shopper's warehouse so a line it does not carry comes back
// flagged `inactive` (STOREFRONT.md §3.8b). `currentWarehouseId()` is null unless a non-default
// warehouse is chosen, so every other request is the one that was always sent.
export const fetchCart = () => unwrap<ServerCart>(warehouseGet('storefront/cart', currentWarehouseId()));

export const putCart = (items: CartLineInput[]) =>
  unwrap<ServerCart>(warehousePut('storefront/cart', { items }, currentWarehouseId()));

export const clearCart = () => unwrap<ServerCart>(api.delete('storefront/cart'));
