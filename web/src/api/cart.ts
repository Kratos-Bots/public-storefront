import { api, unwrap } from '@/api/client.ts';
import type { ServerCart, CartLineInput } from '@/types/cart.ts';

export const fetchCart = () => unwrap<ServerCart>(api.get('storefront/cart'));

export const putCart = (items: CartLineInput[]) =>
  unwrap<ServerCart>(api.put('storefront/cart', { json: { items } }));

export const clearCart = () => unwrap<ServerCart>(api.delete('storefront/cart'));
