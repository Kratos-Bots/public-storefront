import { defineTextArea } from '@/text/define.ts';

/** Area `catalog`: the catalogue, its search and filters (editable-text spec §6.1). */
export default defineTextArea('catalog', {
  'search.placeholder': { en: 'Search products', max: 60 },
  'search.ariaLabel': { en: 'Search products', max: 60 },
  'list.allProducts': { en: 'All products', max: 60 },
  'list.count': { en: '{count} products', max: 40 },
  'list.matching': { en: '{count} matching', max: 40 },
  'list.unit': { en: { one: 'product', other: 'products' }, max: 30 },
  'list.of': { en: 'of', max: 20 },
  'list.eyebrowCatalogue': { en: 'Catalogue', max: 40 },
  'list.eyebrowCategory': { en: 'Category', max: 40 },
  'list.eyebrowSearch': { en: 'Search', max: 40 },
  'list.loadFailedDetail': { en: 'The shop is still there — this was a hiccup between your browser and us.' },
  'list.categoryMissingDetail': { en: 'It may have been renamed or retired. The full range is still one tap away.' },
  'list.showAll': { en: 'Show all products', max: 60 },
  'list.noMatchesDetail': { en: 'Try a shorter word, or the product code from your last order.' },
  'list.emptyCategoryDetail': { en: 'This part of the shop is empty for now — check back soon.' },
  'nav.categories': { en: 'Categories', max: 40 },
  'nav.all': { en: 'All', max: 20 },
  'nav.allCategories': { en: 'All categories', max: 40 },
  'filter.sub': { en: 'Jump to a section of the list', max: 80 },
  'group.other': { en: 'Other', max: 40 },
  'group.uncategorised': { en: 'Uncategorised', max: 40 },
  'featured.ariaLabel': { en: 'Featured products', max: 60 },
});
