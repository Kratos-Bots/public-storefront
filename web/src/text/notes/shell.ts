/** Editor-only notes for area `shell`: where each line appears, in shopper words (Text panel). */
export default {
  'nav.ariaLabel': 'Screen-reader name of a Links block left without its own label',
  'header.homeAriaLabel': 'Screen-reader label of the shop logo in the header, which links home; {shop} is the shop name',
  'header.searchPlaceholder': 'Placeholder in the header search field of the menu and Telegram layouts',
  'header.categories': 'Screen-reader label of the header button that opens the category list',
  'header.categoriesFiltered': 'Screen-reader label of the category button while a category is picked',
  'header.cartAriaLabel': 'Screen-reader label of the header cart button, with the number of items in the cart',
  'webapp.back': 'Screen-reader label of the back arrow in the Telegram layout header (outside Telegram)',
  'notFound.title': 'Heading of the page shown for a broken link or a switched-off part of the shop',
  'notFound.description': 'Text under the "page isn\'t here" heading',
  'notFound.backToShop': 'Button on the "page isn\'t here" page that goes to the catalogue',
} as const satisfies Record<string, string>;
