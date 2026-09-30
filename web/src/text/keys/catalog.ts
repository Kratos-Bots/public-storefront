import { defineTextArea } from '@/text/define.ts';

/** Area `catalog`: the catalogue, its search and filters (editable-text spec §6.1). */
export default defineTextArea('catalog', {
  'search.placeholder': { en: 'Search products', note: 'Placeholder of the header search box (a Search field block may set its own)', max: 60 },
  'search.ariaLabel': { en: 'Search products', note: 'Screen-reader label of the header search box', max: 60 },
});
