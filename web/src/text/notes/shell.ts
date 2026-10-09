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
  'warehouse.label': 'Label of the "Shipping from" warehouse picker shown under the header when the shop ships from more than one warehouse',
  'warehouse.option': 'One warehouse in the picker when it has a country; {name} is the warehouse and {country} where it is',
  'warehouse.shippingFrom': 'Line on the checkout review saying which warehouse the order ships from; {warehouse} is its name',
  'warehouse.unavailable': 'Line on a product page the chosen warehouse does not carry; {warehouse} is the chosen warehouse',
  'warehouse.switchBack': 'Button on that product page that switches back to the shop\'s main warehouse; {warehouse} is its name',
  'notFound.backToShop': 'Button on the "page isn\'t here" page that goes to the catalogue',
} as const satisfies Record<string, string>;
