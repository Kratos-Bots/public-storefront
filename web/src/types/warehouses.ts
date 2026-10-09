/** One place the shop can ship from, as `GET storefront/warehouses` lists it (STOREFRONT.md §3.8b). */
export interface Warehouse {
  id: number;
  name: string;
  /** Free text the admin typed (e.g. "DE"); may be null. */
  country: string | null;
  /** The shop's own warehouse: choosing it is the same as choosing nothing. */
  isDefault: boolean;
}
export interface WarehouseList { warehouses: Warehouse[] }
