import type { Catalog, Category, Product } from '@/types/catalog.ts';
import type { StorefrontSettings } from '@/types/settings.ts';

export const SETTINGS = {
  currency: 'GBP', welcomeMessage: 'Packed to order', enabled: true, supportLinks: [], notices: [],
  brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: 'Small batches', links: { whatsapp: 'https://wa.me/440000000000', telegram: null } },
  features: { layout: 'storefront', ordering: true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: true },
} as unknown as StorefrontSettings;

export const CATEGORIES: Category[] = [
  { id: 1, name: 'Pantry', slug: 'pantry', parentId: null, sortOrder: 0, emoji: null },
  { id: 2, name: 'Oats', slug: 'oats', parentId: 1, sortOrder: 0, emoji: null },
];

export function baseProduct(o: Partial<Product> = {}): Product {
  return {
    id: 1, sku: 'NB-OAT-1', name: 'Trail Oats 1kg', displayName: 'Trail Oats 1kg', shortDisplayName: null, shortDescription: null, description: null,
    categoryId: 2, categoryName: 'Pantry > Oats', sortOrder: 0, price: 12, inStock: true, lowStockAlert: false,
    isActive: true, isPreorder: false, preorderEta: null, pricingTiers: [], upsellProductIds: [],
    excludedFromFreeShipping: false, imageProductId: null, provenance: null, minOrderQuantity: null, maxOrderQuantity: null, ...o,
  };
}

/** Every optional piece of the product page present. */
export const FULL = baseProduct({
  description: 'Rolled on Monday, packed on Tuesday.', pricingTiers: [{ id: 1, minQuantity: 5, price: 10 }],
  provenance: 'Milled at the **Northbound** mill.', upsellProductIds: [2], imageProductId: 1,
  isPreorder: true, preorderEta: Date.UTC(2026, 9, 12, 12), minOrderQuantity: 2, lowStockAlert: true,
});
export const MATE = baseProduct({ id: 2, sku: 'NB-TIN-2', name: 'Trail Tin', displayName: 'Trail Tin', price: 14, imageProductId: 2 });

export const catalogOf = (...products: Product[]): Catalog => ({ products, categories: CATEGORIES });

export const LEGACY_TOGGLES = [false, true].flatMap((gallery) => [false, true].flatMap((bulkPricing) =>
  [false, true].flatMap((provenance) => [false, true].map((upsells) => ({ gallery, bulkPricing, provenance, upsells })))));
const b = (v: boolean) => (v ? 1 : 0);
export const toggleName = (t: (typeof LEGACY_TOGGLES)[number], photo: boolean) =>
  `product-legacy-g${b(t.gallery)}b${b(t.bulkPricing)}p${b(t.provenance)}u${b(t.upsells)}-${photo ? 'photo' : 'nophoto'}`;

/** Spec §12 card matrix: photo / no photo / sibling well, in / low / out, pre-order ± ETA, minimum, tiers, index. */
export const CARD_MATRIX: Array<{ name: string; product: Product; props: { eager?: boolean; hasSiblingImages?: boolean; index?: number } }> = [
  { name: 'photo', product: baseProduct({ imageProductId: 1 }), props: { eager: true, index: 0 } },
  { name: 'well', product: baseProduct(), props: { hasSiblingImages: true, index: 3 } },
  { name: 'no-well', product: baseProduct(), props: { hasSiblingImages: false } },
  { name: 'low', product: baseProduct({ lowStockAlert: true }), props: {} },
  { name: 'out', product: baseProduct({ inStock: false }), props: { index: 1 } },
  { name: 'preorder', product: baseProduct({ isPreorder: true, inStock: false }), props: {} },
  { name: 'preorder-eta', product: baseProduct({ isPreorder: true, preorderEta: Date.UTC(2026, 9, 12, 12) }), props: {} },
  { name: 'minimum-tiers', product: baseProduct({ minOrderQuantity: 3, pricingTiers: [{ id: 1, minQuantity: 5, price: 10 }, { id: 2, minQuantity: 10, price: 9 }] }), props: {} },
  { name: 'inactive', product: baseProduct({ isActive: false }), props: {} },
];
export const ROW_MATRIX: Array<{ name: string; product: Product; index?: number; ordering: boolean; showSku: boolean }> = [
  { name: 'plain', product: baseProduct(), ordering: true, showSku: true },
  { name: 'index', product: baseProduct(), index: 2, ordering: true, showSku: true },
  { name: 'no-sku-plain', product: baseProduct(), ordering: true, showSku: false },
  { name: 'meta-all', product: baseProduct({ minOrderQuantity: 2, isPreorder: true, lowStockAlert: true, pricingTiers: [{ id: 1, minQuantity: 5, price: 10 }] }), ordering: true, showSku: true },
  { name: 'out', product: baseProduct({ inStock: false }), ordering: true, showSku: true },
  { name: 'inactive', product: baseProduct({ isActive: false }), ordering: true, showSku: true },
  { name: 'ordering-off', product: baseProduct(), ordering: false, showSku: true },
];
