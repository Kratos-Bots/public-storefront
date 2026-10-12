/** One place the shop can ship from, as `GET storefront/warehouses` lists it (STOREFRONT.md §3.8b). */
export interface Warehouse {
  id: number;
  name: string;
  /** Free text the admin typed (e.g. "DE"); may be null. */
  country: string | null;
  /** The shop's own warehouse: choosing it is the same as choosing nothing. */
  isDefault: boolean;
  /** A short line the owner wrote about this warehouse (up to 160 characters), shown on the choose-a-warehouse card. Null or absent: none (an older backend sends no such field). */
  description?: string | null;
  /** False = browsable, but the shop refuses checkout here. Absent on an older backend — read as true. */
  orderingEnabled?: boolean;
  /** The owner's note while ordering is off; null while it is on. */
  orderingMessage?: string | null;
  /**
   * Where this warehouse ships (ISO alpha-2, upper-case). A warehouse on the shop's shipping repeats the shop's lists;
   * one with its own lists only its own countries and no collection countries. Absent on an older backend.
   */
  shipping?: { countries: string[]; collectionCountries: string[] };
  /**
   * `null`: this warehouse uses the shop FAQ (read `settings.faq.available`). `{ available }`: it has its own FAQ, and `available` is whether
   * that has anything to show. Absent on an older backend - read as `null`.
   */
  faq?: { available: boolean } | null;
}
export interface WarehouseList { warehouses: Warehouse[] }
