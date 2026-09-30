import { defineTextArea } from '@/text/define.ts';

/**
 * Area `templates` (editable-text spec §6.1): the copy inside the template slot components.
 * `default.*` is the built-in slots every template without its own slot uses; the others belong to
 * one template each. Identical wordings in different templates stay separate keys on purpose (the
 * Text panel shows only the active template's group).
 */
export default defineTextArea('templates', {
  // Built-in default slots
  'default.hero.aboutAria': { en: 'About this shop', note: 'Screen-reader name of the intro strip above the product grid', max: 80 },
  'default.hero.products': { en: '{count} products', note: 'Product count in the intro strip above the product grid; {count} is the number of products', max: 60 },
  'default.hero.categories': { en: ' · {count} categories', note: 'Category count that follows the product count in the intro strip (shown only when there are categories); keep the leading separator; {count} is the number of categories', max: 60 },
  'default.footer.support': { en: 'Support', note: 'Heading of the support links column in the footer', max: 40 },
  'default.footer.talk': { en: 'Talk to us', note: 'Heading of the chat links column in the footer', max: 40 },

  // Bento
  'bento.hero.aboutAria': { en: 'About this shop', note: 'Screen-reader name of the shop board above the product grid', max: 80 },
  'bento.hero.product': { en: { one: 'Product', other: 'Products' }, note: 'Label under the product count on the shop board', max: 40 },
  'bento.hero.category': { en: { one: 'Category', other: 'Categories' }, note: 'Label under the category count on the shop board', max: 40 },
  'bento.hero.open': { en: 'Open', note: 'Status word on the shop board while the shop is taking orders', max: 40 },
  'bento.hero.paused': { en: 'Paused', note: 'Status word on the shop board while ordering is paused', max: 40 },
  'bento.hero.takingOrders': { en: 'Taking orders', note: 'Caption under the status word while the shop is taking orders', max: 60 },
  'bento.hero.orderingPaused': { en: 'Ordering paused', note: 'Caption under the status word while ordering is paused', max: 60 },
  'bento.hero.orderByToday': { en: 'Order by {cutoff} today', note: 'Dispatch cell headline when the next cut-off is today; {cutoff} is the cut-off time', max: 80 },
  'bento.hero.orderByDay': { en: 'Order by {cutoff} {day}', note: 'Dispatch cell headline when the next cut-off is on another day; {cutoff} is the time and {day} the weekday name', max: 80 },
  'bento.hero.dispatch': { en: 'for {date} dispatch', note: 'Caption under the dispatch cell headline; {date} is the dispatch day', max: 80 },
  'bento.hero.questions': { en: 'Questions before you order?', note: 'Headline of the chat cell on the shop board, above the chat links', max: 80 },
  'bento.day.mon': { en: 'Monday', note: 'Weekday name in the dispatch cell', max: 40 },
  'bento.day.tue': { en: 'Tuesday', note: 'Weekday name in the dispatch cell', max: 40 },
  'bento.day.wed': { en: 'Wednesday', note: 'Weekday name in the dispatch cell', max: 40 },
  'bento.day.thu': { en: 'Thursday', note: 'Weekday name in the dispatch cell', max: 40 },
  'bento.day.fri': { en: 'Friday', note: 'Weekday name in the dispatch cell', max: 40 },
  'bento.day.sat': { en: 'Saturday', note: 'Weekday name in the dispatch cell', max: 40 },
  'bento.day.sun': { en: 'Sunday', note: 'Weekday name in the dispatch cell', max: 40 },
  'bento.footer.support': { en: 'Support', note: 'Heading of the support links cell in the footer', max: 40 },
  'bento.footer.talk': { en: 'Talk to us', note: 'Heading of the chat links cell in the footer', max: 40 },

  // Cyber brutalism
  'cyber-brutalism.hero.aboutAria': { en: 'About this shop', note: 'Screen-reader name of the hero above the product grid', max: 80 },
  'cyber-brutalism.hero.statusAria': { en: 'Store status', note: 'Screen-reader name of the terminal readout of store facts', max: 40 },
  'cyber-brutalism.hero.scene': { en: '//SCN_01', note: 'Small terminal-style tag above the shop name in the hero (decorative)', max: 40 },
  'cyber-brutalism.readout.cutoff': { en: 'DISPATCH CUTOFF {cutoff}', note: 'Readout line with the next dispatch cut-off time; {cutoff} is the time', max: 60 },
  'cyber-brutalism.readout.items': { en: 'ITEMS {count}', note: 'Readout line with the number of products; {count} is the number', max: 60 },
  'cyber-brutalism.readout.online': { en: 'ORDERING ONLINE', note: 'Readout line while the shop is taking orders', max: 60 },
  'cyber-brutalism.readout.paused': { en: 'ORDERING PAUSED', note: 'Readout line while ordering is paused', max: 60 },
  'cyber-brutalism.bar.time': { en: 'SYS.TIME', note: 'Label before the clock in the top system strip (decorative)', max: 40 },
  'cyber-brutalism.bar.node': { en: 'NODE: {node}', note: 'Node label in the top system strip; {node} is the node name set in the template options', max: 60 },
  'cyber-brutalism.bar.sku': { en: 'SKU: {count}', note: 'Product count in the top system strip; {count} is the number of products', max: 60 },
  'cyber-brutalism.footer.support': { en: 'Support', note: 'Heading of the support links column in the footer, after its number', max: 40 },
  'cyber-brutalism.footer.contact': { en: 'Contact', note: 'Heading of the chat links column in the footer, after its number', max: 40 },
  'cyber-brutalism.footer.secure': { en: 'CONNECTION SECURE', note: 'Left text of the bottom status strip (decorative)', max: 60 },
  'cyber-brutalism.footer.granted': { en: '> ACCESS GRANTED_', note: 'Right text of the bottom status strip (decorative)', max: 60 },

  // Dark luxury
  'dark-luxury.hero.aboutAria': { en: 'About this shop', note: 'Screen-reader name of the hero above the product grid', max: 80 },
  'dark-luxury.hero.products': { en: { one: '{count} product', other: '{count} products' }, note: 'Product count in the hero badge; {count} is the number of products', max: 60 },
  'dark-luxury.hero.categories': { en: { one: '{count} category', other: '{count} categories' }, note: 'Category count in the hero badge; {count} is the number of categories', max: 60 },
  'dark-luxury.hero.counts': { en: '{products} · {categories}', note: 'Hero badge joining the product and category counts (shown only when there are categories)', max: 80 },
  'dark-luxury.label.catalogue': { en: '[Catalogue]', note: 'Small bracketed label above the catalogue heading', max: 40 },
  'dark-luxury.footer.supportAria': { en: 'Support', note: 'Screen-reader name of the support links in the footer', max: 40 },
  'dark-luxury.footer.support': { en: '[Support]', note: 'Heading of the support links column in the footer', max: 40 },
  'dark-luxury.footer.talk': { en: '[Talk to us]', note: 'Heading of the chat links column in the footer', max: 40 },
  'dark-luxury.status.accepting': { en: '[ACCEPTING ORDERS]', note: 'Footer status badge while the shop is taking orders', max: 60 },
  'dark-luxury.status.paused': { en: '[ORDERING PAUSED]', note: 'Footer status badge while ordering is paused', max: 60 },
});
