import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CATALOGUE_TEXT, HERO_TEXT, PRODUCT_CARD_TEXT, SECTION_LABEL_TEXT } from '@/builder/blocks/_shared/text-patterns.ts';
import { CATALOGUE_OVERRIDE_DEFAULTS, CatalogueBody, catalogueOverrideShape, type CatalogueOverrides } from '@/builder/blocks/_shared/catalogue.tsx';

/** The dense manifest ruled by category, with the product and filter sheets over it. */
export const block = defineBlock<{ id: string } & CatalogueOverrides>({
  name: 'ProductList', label: 'Product list', category: 'catalogue', layouts: 'all', routeBound: true, slots: [],
  text: [...CATALOGUE_TEXT, 'catalog.group.*', 'product.*', ...PRODUCT_CARD_TEXT, ...HERO_TEXT, ...SECTION_LABEL_TEXT],
  schema: z.object(catalogueOverrideShape), defaultProps: CATALOGUE_OVERRIDE_DEFAULTS,
  render: ({ categoryPicker, pageTitle, intro, sku }) => <CatalogueBody body="list" overrides={{ categoryPicker, pageTitle, intro, sku }} />,
});
