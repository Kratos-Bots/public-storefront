import { api } from '@/api/client.ts';

/**
 * The one place a warehouse choice becomes part of a request. `null` (feature off, the default
 * warehouse, an unknown id) sends the request exactly as it was before warehouses existed:
 * `api.get(path)`, no options, no query string. A chosen id goes in `?warehouse=<id>` - never a
 * header or cookie, because the Worker caches anonymous catalogue reads keyed on the full URL.
 */
export const warehouseOptions = (warehouse: number | null) =>
  warehouse === null ? undefined : { searchParams: { warehouse } };

export const warehouseGet = (path: string, warehouse: number | null) =>
  warehouse === null ? api.get(path) : api.get(path, warehouseOptions(warehouse));

export const warehousePut = (path: string, json: unknown, warehouse: number | null) =>
  warehouse === null ? api.put(path, { json }) : api.put(path, { json, ...warehouseOptions(warehouse) });

/** `{ warehouseId }` to spread into a quote / checkout body - an empty object when nothing is chosen. */
export const warehouseBody = (warehouse: number | null): { warehouseId?: number } =>
  warehouse === null ? {} : { warehouseId: warehouse };
