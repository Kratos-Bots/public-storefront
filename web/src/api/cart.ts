import { api, unwrap } from '@/api/client.ts';
import { warehouseBody, warehouseGet, warehousePut } from '@/api/warehouse-param.ts';
import { currentWarehouseId } from '@/features/warehouses/store.ts';
import type { ServerCart, CartLineInput } from '@/types/cart.ts';

// The cart is read and written "at" the shopper's warehouse so a line it does not carry comes back
// flagged `inactive` (STOREFRONT.md §3.8b). `currentWarehouseId()` is null unless a non-default
// warehouse is chosen, so every other request is the one that was always sent.
export const fetchCart = () => unwrap<ServerCart>(warehouseGet('storefront/cart', currentWarehouseId()));

export const putCart = (items: CartLineInput[]) =>
  unwrap<ServerCart>(warehousePut('storefront/cart', { items }, currentWarehouseId()));

export const clearCart = () => unwrap<ServerCart>(api.delete('storefront/cart'));

// The guest cart is a one-way mirror for the shop's admin (STOREFRONT.md, "Visitor id, visits and
// the guest cart"). Both answer 204 with no body and are never read back, so neither is unwrapped.
export async function putGuestCart(items: CartLineInput[]): Promise<void> {
  await api.put('storefront/guest-cart', { json: { items, ...warehouseBody(currentWarehouseId()) } });
}

export async function deleteGuestCart(): Promise<void> {
  await api.delete('storefront/guest-cart');
}
