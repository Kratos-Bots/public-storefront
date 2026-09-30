import { defineTextArea } from '@/text/define.ts';

/** Area `catalog`: the catalogue, its search and filters (editable-text spec §6.1). */
export default defineTextArea('catalog', {
  'search.placeholder': { en: 'Search products', note: 'Placeholder of the header search box (a Search field block may set its own)', max: 60 },
  'search.ariaLabel': { en: 'Search products', note: 'Screen-reader label of the header search box', max: 60 },
  'list.allProducts': { en: 'All products', note: 'Catalogue heading when no category is chosen, and the "show everything" row of the category index', max: 60 },
  'list.count': { en: '{count} products', note: 'Product count under the catalogue heading', max: 40 },
  'list.matching': { en: '{count} matching', note: 'Count under the catalogue heading while the shopper is searching', max: 40 },
  'list.unit': { en: { one: 'product', other: 'products' }, note: 'Unit word beside the product tally on the menu layout', max: 30 },
  'list.of': { en: 'of', note: 'Joins "shown" and "total" in the menu layout tally, e.g. 3 of 12', max: 20 },
  'list.eyebrowCatalogue': { en: 'Catalogue', note: 'Small label above the catalogue empty and error messages', max: 40 },
  'list.eyebrowCategory': { en: 'Category', note: 'Small label above the "category not found" message', max: 40 },
  'list.eyebrowSearch': { en: 'Search', note: 'Small label above the "nothing matches" message', max: 40 },
  'list.loadFailedDetail': { en: 'The shop is still there — this was a hiccup between your browser and us.', note: "Explanation under the \"couldn't load the products\" heading" },
  'list.categoryMissingDetail': { en: 'It may have been renamed or retired. The full range is still one tap away.', note: "Explanation under the \"category isn't here\" heading" },
  'list.showAll': { en: 'Show all products', note: "Button on the \"category isn't here\" message", max: 60 },
  'list.noMatchesDetail': { en: 'Try a shorter word, or the product code from your last order.', note: 'Advice under the "nothing matches" heading' },
  'list.emptyCategoryDetail': { en: 'This part of the shop is empty for now — check back soon.', note: 'Explanation under the "nothing stocked here yet" heading' },
  'nav.categories': { en: 'Categories', note: 'Heading and screen-reader name of the category index, chip row and filter sheet', max: 40 },
  'nav.all': { en: 'All', note: 'First chip of the phone category row (shows every product)', max: 20 },
  'nav.allCategories': { en: 'All categories', note: 'Button on the phone category row that opens the full category index', max: 40 },
  'filter.sub': { en: 'Jump to a section of the list', note: "Line under the \"Categories\" heading of the menu layout's filter sheet", max: 80 },
  'group.other': { en: 'Other', note: 'Section name for products whose category has no name', max: 40 },
  'group.uncategorised': { en: 'Uncategorised', note: 'Section name for products with no category', max: 40 },
  'featured.ariaLabel': { en: 'Featured products', note: 'Screen-reader label of a Featured products block that has no title', max: 60 },
});
