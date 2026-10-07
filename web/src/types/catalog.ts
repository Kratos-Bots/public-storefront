/** One certificate of analysis, as the public catalogue serves it (a lab's own report or an uploaded file). */
export interface ProductCoa {
  id: number;
  lab: string | null;
  sampleName: string | null;
  mgAmount: number | null;
  /** A percentage, e.g. 99.957. */
  purity: number | null;
  batch: string | null;
  /** Free text, as printed on the report. */
  testDate: string | null;
  /** The lab's own page (absolute https). */
  reportUrl: string | null;
  /** Set only when `reportUrl` is null: the uploaded file is at `/media/coas/{id}/{fileKey}`. */
  fileKey: string | null;
}
export interface PricingTier { id: number; minQuantity: number; price: number }
export interface Product {
  id: number; sku: string; name: string; displayName: string; shortDisplayName: string | null;
  description: string | null; categoryId: number | null; categoryName: string | null; sortOrder: number;
  price: number; inStock: boolean; lowStockAlert: boolean; isActive: boolean; isPreorder: boolean;
  preorderEta: number | null; pricingTiers: PricingTier[]; upsellProductIds: number[];
  excludedFromFreeShipping: boolean; imageProductId: number | null; provenance: string | null;
  /** Resolved for this shopper's customer group (override → product → parent chain). null = no limit. */
  minOrderQuantity: number | null; maxOrderQuantity: number | null;
  /** Up to 160 characters shown under the name in lists and cards. Absent on an older backend — treat like null. */
  shortDescription: string | null;
  /** Live promotions whose products include this one. Absent on a backend that predates promotions — treat like []. */
  promotions?: import('./cart.ts').PromotionTag[];
  /** Newest first. Absent on a backend that predates COAs — treat like []. */
  coas?: ProductCoa[];
}
export interface Category { id: number; name: string; slug: string | null; parentId: number | null; sortOrder: number; emoji: string | null }
export interface Catalog { products: Product[]; categories: Category[] }
export type StockStatus = 'in' | 'low' | 'out';
