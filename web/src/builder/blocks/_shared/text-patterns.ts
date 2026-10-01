import type { TextKeyPattern } from '@/text/registry.ts';

/*
 * Site-text patterns shared by several blocks' `text` (text spec §7.3). A template slot's copy is keyed
 * per template id (`templates.<id>.<part>.*`, the built-in slots under `templates.default.*`); the
 * editor's Text panel shows only the active template's.
 */

/** The CatalogHero slot, rendered by the CatalogHero block and at the head of the catalogue blocks. */
export const HERO_TEXT: readonly TextKeyPattern[] = [
  'templates.default.hero.*', 'templates.bento.hero.*', 'templates.bento.day.*',
  'templates.cyber-brutalism.hero.*', 'templates.cyber-brutalism.readout.*', 'templates.dark-luxury.hero.*',
];

/** The TopBar slot (the Header's top bar, or the TopBar block). */
export const TOP_BAR_TEXT: readonly TextKeyPattern[] = ['templates.cyber-brutalism.bar.*', 'templates.cyber-brutalism.readout.*'];

/** The Footer slot. */
export const FOOTER_TEXT: readonly TextKeyPattern[] = [
  'templates.default.footer.*', 'templates.bento.footer.*', 'templates.cyber-brutalism.footer.*',
  'templates.cyber-brutalism.readout.*', 'templates.dark-luxury.footer.*', 'templates.dark-luxury.status.*',
];

/** The SectionLabel slot above a catalogue heading or group. */
export const SECTION_LABEL_TEXT: readonly TextKeyPattern[] = ['templates.dark-luxury.label.*'];

/** A product card or row with its add-to-cart control (grid, list, featured products, upsells). */
export const PRODUCT_CARD_TEXT: readonly TextKeyPattern[] = [
  'product.add.*', 'product.stock.*', 'product.limit.*', 'product.row.*', 'common.product.*', 'common.qty.*',
];

/** The catalogue pages' shared chrome: category navigation, filters and the empty / error states. */
export const CATALOGUE_TEXT: readonly TextKeyPattern[] = [
  'catalog.list.*', 'catalog.nav.*', 'catalog.filter.*', 'common.list.*', 'common.actions.tryAgain', 'common.status.loading',
];
