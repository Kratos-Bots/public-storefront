export interface PricingTier { id: number; minQuantity: number; price: number }
export interface Product {
  id: number; sku: string; name: string; displayName: string; shortDisplayName: string | null;
  description: string | null; categoryId: number | null; categoryName: string | null; sortOrder: number;
  price: number; inStock: boolean; lowStockAlert: boolean; isActive: boolean; isPreorder: boolean;
  preorderEta: number | null; pricingTiers: PricingTier[]; upsellProductIds: number[];
  excludedFromFreeShipping: boolean; imageProductId: number | null; provenance: string | null;
}
export interface Category { id: number; name: string; slug: string | null; parentId: number | null; sortOrder: number; emoji: string | null }
export interface Catalog { products: Product[]; categories: Category[] }
export type StockStatus = 'in' | 'low' | 'out';
