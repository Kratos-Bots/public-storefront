import { defineTextArea } from '@/text/define.ts';

/**
 * Area `templates` (editable-text spec §6.1): the copy inside the template slot components.
 * `default.*` is the built-in slots every template without its own slot uses; the others belong to
 * one template each. Identical wordings in different templates stay separate keys on purpose (the
 * Text panel shows only the active template's group).
 */
export default defineTextArea('templates', {
  // Built-in default slots
  'default.hero.aboutAria': { en: 'About this shop', max: 80 },
  'default.hero.products': { en: '{count} products', max: 60 },
  'default.hero.categories': { en: ' · {count} categories', max: 60 },
  'default.footer.support': { en: 'Support', max: 40 },
  'default.footer.talk': { en: 'Talk to us', max: 40 },

  // Bento
  'bento.hero.aboutAria': { en: 'About this shop', max: 80 },
  'bento.hero.product': { en: { one: 'Product', other: 'Products' }, max: 40 },
  'bento.hero.category': { en: { one: 'Category', other: 'Categories' }, max: 40 },
  'bento.hero.open': { en: 'Open', max: 40 },
  'bento.hero.paused': { en: 'Paused', max: 40 },
  'bento.hero.takingOrders': { en: 'Taking orders', max: 60 },
  'bento.hero.orderingPaused': { en: 'Ordering paused', max: 60 },
  'bento.hero.orderByToday': { en: 'Order by {cutoff} today', max: 80 },
  'bento.hero.orderByDay': { en: 'Order by {cutoff} {day}', max: 80 },
  'bento.hero.dispatch': { en: 'for {date} dispatch', max: 80 },
  'bento.hero.questions': { en: 'Questions before you order?', max: 80 },
  'bento.day.mon': { en: 'Monday', max: 40 },
  'bento.day.tue': { en: 'Tuesday', max: 40 },
  'bento.day.wed': { en: 'Wednesday', max: 40 },
  'bento.day.thu': { en: 'Thursday', max: 40 },
  'bento.day.fri': { en: 'Friday', max: 40 },
  'bento.day.sat': { en: 'Saturday', max: 40 },
  'bento.day.sun': { en: 'Sunday', max: 40 },
  'bento.footer.support': { en: 'Support', max: 40 },
  'bento.footer.talk': { en: 'Talk to us', max: 40 },

  // Cyber brutalism
  'cyber-brutalism.hero.aboutAria': { en: 'About this shop', max: 80 },
  'cyber-brutalism.hero.statusAria': { en: 'Store status', max: 40 },
  'cyber-brutalism.hero.scene': { en: '//SCN_01', max: 40 },
  'cyber-brutalism.readout.cutoff': { en: 'DISPATCH CUTOFF {cutoff}', max: 60 },
  'cyber-brutalism.readout.items': { en: 'ITEMS {count}', max: 60 },
  'cyber-brutalism.readout.online': { en: 'ORDERING ONLINE', max: 60 },
  'cyber-brutalism.readout.paused': { en: 'ORDERING PAUSED', max: 60 },
  'cyber-brutalism.bar.time': { en: 'SYS.TIME', max: 40 },
  'cyber-brutalism.bar.node': { en: 'NODE: {node}', max: 60 },
  'cyber-brutalism.bar.sku': { en: 'SKU: {count}', max: 60 },
  'cyber-brutalism.footer.support': { en: 'Support', max: 40 },
  'cyber-brutalism.footer.contact': { en: 'Contact', max: 40 },
  'cyber-brutalism.footer.secure': { en: 'CONNECTION SECURE', max: 60 },
  'cyber-brutalism.footer.granted': { en: '> ACCESS GRANTED_', max: 60 },

  // Dark luxury
  'dark-luxury.hero.aboutAria': { en: 'About this shop', max: 80 },
  'dark-luxury.hero.products': { en: { one: '{count} product', other: '{count} products' }, max: 60 },
  'dark-luxury.hero.categories': { en: { one: '{count} category', other: '{count} categories' }, max: 60 },
  'dark-luxury.hero.counts': { en: '{products} · {categories}', max: 80 },
  'dark-luxury.label.catalogue': { en: '[Catalogue]', max: 40 },
  'dark-luxury.footer.supportAria': { en: 'Support', max: 40 },
  'dark-luxury.footer.support': { en: '[Support]', max: 40 },
  'dark-luxury.footer.talk': { en: '[Talk to us]', max: 40 },
  'dark-luxury.status.accepting': { en: '[ACCEPTING ORDERS]', max: 60 },
  'dark-luxury.status.paused': { en: '[ORDERING PAUSED]', max: 60 },
});
