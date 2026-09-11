import { api, unwrap } from '@/api/client.ts';
import type { Catalog, Product } from '@/types/catalog.ts';

/**
 * Logged in → the personalised catalog (`/public/storefront/catalog`: the
 * customer's group category rules and group prices, never cached). Logged out
 * → the shared public catalog, which the Worker edge-caches. Same payload shape.
 */
export const fetchCatalog = (personalised: boolean) =>
  unwrap<Catalog>(api.get(personalised ? 'storefront/catalog' : 'catalog'));

export const fetchProduct = (id: number, personalised: boolean) =>
  unwrap<Product>(api.get(personalised ? `storefront/catalog/products/${id}` : `catalog/products/${id}`));
