import { createContext, type ComponentType } from 'react';
import { createFamily } from '@/builder/parts.ts';
import type { SlotRender } from '@/builder/define.ts';
import type { Category, Product } from '@/types/catalog.ts';
import type { CategoryNode } from '@/features/catalog/category-tree.ts';
import type { ProductGroup as CategoryGroup } from '@/features/catalog/group.ts';

// Type-only feature imports: this module is in the shopper's entry bundle.

export interface ProductData {
  product: Product;
  /** The category trail from the catalogue (page breadcrumbs). */
  trail: Category[];
  /** The product's own flattened path, used while the catalogue lacks the category. */
  fallbackTrail: string[];
  /** Sheet surface: swaps the sheet's product in place (upsell rows). */
  onSelect?: (product: Product) => void;
}
export const ProductFamily = createFamily<ProductData>('product');

export interface CatalogueData {
  surface: 'grid' | 'list';
  products: Product[];
  tree: CategoryNode[];
  active: Category | undefined;
  unknownCategory: boolean;
  visible: Product[];
  /** List surface only ([] on the grid). */
  groups: CategoryGroup[];
  search: string;
  /** `search.trim()`. */
  query: string;
  setSearch: (value: string) => void;
  /** Grid: every visible product lacks a photo (the grid draws rows). */
  imageless: boolean;
  /** List: some category carries an emoji. */
  glyphs: boolean;
  /** Grid: navigate to /p/:id. List: open the sheet (`?p=`). */
  openProduct: (product: Product) => void;
}
export const CatalogueFamily = createFamily<CatalogueData>('catalogue');

/** Exactly the props ProductCard / ProductRow take today (spec §5.3). Tiles always carry an index (default 0). */
export interface CardData { product: Product; index?: number; eager: boolean; hasSiblingImages: boolean; onSelect?: (product: Product) => void }
export const CardTileFamily = createFamily<CardData>('card-tile');
export const CardRowFamily = createFamily<CardData>('card-row');

export interface ProductSlots { top: SlotRender; media: SlotRender; main: SlotRender; below: SlotRender }

/**
 * Set by the menu / web-app product sheet around the layout's `product` document (spec §7.2). The
 * ProductDetail block renders `SheetBody` instead of the page when a host is present, so the sheet
 * needs no lazy chunk and no route.
 */
export interface ProductHost {
  productId: number | null;
  onSelect: (product: Product) => void;
  surface: 'sheet';
  SheetBody: ComponentType<{ slots: ProductSlots }>;
}
export const ProductHostContext = createContext<ProductHost | null>(null);
