import { api, unwrap, ApiError } from '@/api/client.ts';
import type { Catalog, Product } from '@/types/catalog.ts';

/**
 * Logged in → the personalised catalog (`/public/storefront/catalog`: the
 * customer's group category rules and group prices, never cached). Logged out
 * → the shared public catalog, which the Worker edge-caches. Same payload shape.
 *
 * Backends are deployed per client stack, so a logged-in shopper's stack can
 * run a backend that predates the personalised routes (or was rolled back),
 * and its 404 would otherwise empty the whole catalog. On that 404 we retry
 * ONCE against the public endpoint. Nothing else falls back: a 401 must keep
 * reaching the client's session-clearing logic (the session-keyed query then
 * refetches anonymously), and a 5xx is a real outage, not a missing route.
 */

/** The backend's catch-all 404 body — a route this backend doesn't have. */
const MISSING_ROUTE = 'Route not found';

const isNotFound = (err: unknown): err is ApiError => err instanceof ApiError && err.status === 404;

export async function fetchCatalog(personalised: boolean): Promise<Catalog> {
  if (!personalised) return unwrap<Catalog>(api.get('catalog'));
  try {
    return await unwrap<Catalog>(api.get('storefront/catalog'));
  } catch (err) {
    // The catalog route has no entity 404, so any 404 means "no such route".
    if (isNotFound(err)) return unwrap<Catalog>(api.get('catalog'));
    throw err;
  }
}

export async function fetchProduct(id: number, personalised: boolean): Promise<Product> {
  if (!personalised) return unwrap<Product>(api.get(`catalog/products/${id}`));
  try {
    return await unwrap<Product>(api.get(`storefront/catalog/products/${id}`));
  } catch (err) {
    // Narrower than the catalog: a current backend also 404s ("Product not
    // found") for a product the shopper's group may not see, and the public
    // endpoint would happily show it to them. Only a missing route falls back.
    if (isNotFound(err) && err.message === MISSING_ROUTE) return unwrap<Product>(api.get(`catalog/products/${id}`));
    throw err;
  }
}
