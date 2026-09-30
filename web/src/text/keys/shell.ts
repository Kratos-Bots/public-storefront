import { defineTextArea } from '@/text/define.ts';

/** Area `shell`: header, footer and navigation around every page (editable-text spec §6.1). */
export default defineTextArea('shell', {
  'nav.ariaLabel': { en: 'Site', note: 'Screen-reader name of a Links block left without its own label', max: 40 },
  'header.homeAriaLabel': { en: '{shop} — home', note: 'Screen-reader label of the shop logo in the header, which links home; {shop} is the shop name', max: 80 },
  'header.searchPlaceholder': { en: 'Search', note: 'Placeholder in the header search field of the menu and Telegram layouts', max: 40 },
  'header.categories': { en: 'Categories', note: 'Screen-reader label of the header button that opens the category list', max: 40 },
  'header.categoriesFiltered': { en: 'Categories — one category selected', note: 'Screen-reader label of the category button while a category is picked', max: 80 },
  'header.cartAriaLabel': { en: { one: 'Cart, {count} item', other: 'Cart, {count} items' }, note: 'Screen-reader label of the header cart button, with the number of items in the cart', max: 60 },
  'webapp.back': { en: 'Back', note: 'Screen-reader label of the back arrow in the Telegram layout header (outside Telegram)', max: 40 },
  'notFound.title': { en: "This page isn't here", note: 'Heading of the page shown for a broken link or a switched-off part of the shop', max: 80 },
  'notFound.description': { en: 'The link may be out of date, or this part of the shop is switched off.', note: 'Text under the "page isn\'t here" heading', max: 200 },
  'notFound.backToShop': { en: 'Back to the shop', note: 'Button on the "page isn\'t here" page that goes to the catalogue', max: 40 },
});
