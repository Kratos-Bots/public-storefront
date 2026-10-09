import { api, unwrap } from '@/api/client.ts';
import type { WarehouseList } from '@/types/warehouses.ts';

/** The warehouses a shopper may choose between. Empty while the feature is off. */
export const fetchWarehouses = () => unwrap<WarehouseList>(api.get('storefront/warehouses'));
