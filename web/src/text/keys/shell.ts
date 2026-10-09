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
  'warehouse.label': { en: 'Shipping from', max: 40 },
  'warehouse.option': { en: '{name} · {country}', max: 80 },
  'warehouse.shippingFrom': { en: 'Shipping from {warehouse}', max: 80 },
  'warehouse.unavailable': { en: "This product isn't available from {warehouse}.", max: 120 },
  'warehouse.switchBack': { en: 'Ship from {warehouse} instead', max: 60 },
  'warehouse.prompt.title': { en: 'Where should we ship from?', max: 60 },
  'warehouse.prompt.lede': { en: 'Prices, stock and delivery depend on the warehouse. You can change this at any time.', max: 160 },
  'warehouse.prompt.choose': { en: 'Shop from {warehouse}', max: 60 },
  'warehouse.prompt.lastTime': { en: 'Your last choice', max: 40 },
  'warehouse.paused.badge': { en: 'Not taking orders', max: 40 },
  'warehouse.paused.notice': { en: '{warehouse} is not taking orders right now. You can browse, or choose another warehouse.', max: 160 },
});
