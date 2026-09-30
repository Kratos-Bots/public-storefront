import { defineTextArea } from '@/text/define.ts';

/** Area `product`: product cards, rows and product pages (editable-text spec §6.1). */
export default defineTextArea('product', {
  'stock.in': { en: 'In Stock', note: 'Stock chip on product cards and pages', max: 30 },
  'stock.low': { en: 'Low Stock', note: 'Stock chip when stock is low', max: 30 },
  'stock.out': { en: 'Out of Stock', note: 'Stock chip when sold out', max: 30 },
});
