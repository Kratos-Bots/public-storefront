import { defineTextArea } from '@/text/define.ts';

/** Area `shell`: header, footer and navigation around every page (editable-text spec §6.1). */
export default defineTextArea('shell', {
  'nav.ariaLabel': { en: 'Site', max: 40 },
  'header.homeAriaLabel': { en: '{shop} — home', max: 80 },
  'header.searchPlaceholder': { en: 'Search', max: 40 },
  'header.categories': { en: 'Categories', max: 40 },
  'header.categoriesFiltered': { en: 'Categories — one category selected', max: 80 },
  'header.cartAriaLabel': { en: { one: 'Cart, {count} item', other: 'Cart, {count} items' }, max: 60 },
  'webapp.back': { en: 'Back', max: 40 },
  'notFound.title': { en: "This page isn't here", max: 80 },
  'notFound.description': { en: 'The link may be out of date, or this part of the shop is switched off.', max: 200 },
  'notFound.backToShop': { en: 'Back to the shop', max: 40 },
});
