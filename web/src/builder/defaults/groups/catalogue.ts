import { block, doc, type DefaultEntry } from '@/builder/defaults/helpers.ts';

// v0.6.0's CatalogPage (grid for storefront, list for menu/webapp; wholesale swaps in inside the block) and ProductDetailPage.
export const DEFAULTS: DefaultEntry[] = [
  { docKey: 'catalog', layouts: ['storefront'], doc: doc([block('ProductGrid')]) },
  { docKey: 'catalog', layouts: ['menu', 'webapp'], doc: doc([block('ProductList')]) },
  { docKey: 'product', layouts: 'all', doc: doc([block('ProductDetail')]) },
];
