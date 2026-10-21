// TODO(translate)
import type catalog from '@/text/keys/catalog.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "catalog.search.placeholder": "Search products",
  "catalog.search.ariaLabel": "Search products",
  "catalog.list.allProducts": "All products",
  "catalog.list.count": "{count} products",
  "catalog.list.matching": "{count} matching",
  "catalog.list.unit": {"one":"product","other":"products"},
  "catalog.list.of": "of",
  "catalog.list.eyebrowCatalogue": "Catalogue",
  "catalog.list.eyebrowCategory": "Category",
  "catalog.list.eyebrowSearch": "Search",
  "catalog.list.loadFailedDetail": "The shop is still there — this was a hiccup between your browser and us.",
  "catalog.list.categoryMissingDetail": "It may have been renamed or retired. The full range is still one tap away.",
  "catalog.list.showAll": "Show all products",
  "catalog.list.noMatchesDetail": "Try a shorter word, or the product code from your last order.",
  "catalog.list.emptyCategoryDetail": "This part of the shop is empty for now — check back soon.",
  "catalog.nav.categories": "Categories",
  "catalog.nav.all": "All",
  "catalog.nav.allCategories": "All categories",
  "catalog.filter.sub": "Jump to a section of the list",
  "catalog.group.other": "Other",
  "catalog.group.uncategorised": "Uncategorised",
  "catalog.featured.ariaLabel": "Featured products",
} satisfies AreaPack<typeof catalog>;
