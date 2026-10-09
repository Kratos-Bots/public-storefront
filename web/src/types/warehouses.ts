/** One place the shop can ship from, as `GET storefront/warehouses` lists it (STOREFRONT.md §3.8b). */
export interface Warehouse {
  id: number;
  name: string;
  /** Free text the admin typed (e.g. "DE"); may be null. */
  country: string | null;
  /** The shop's own warehouse: choosing it is the same as choosing nothing. */
  isDefault: boolean;
  /** False = browsable, but the shop refuses checkout here. Absent on an older backend — read as true. */
  orderingEnabled?: boolean;
  /** The owner's note while ordering is off; null while it is on. */
  orderingMessage?: string | null;
}
export interface WarehouseList { warehouses: Warehouse[] }
