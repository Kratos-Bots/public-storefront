import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CATALOGUE_TEXT, HERO_TEXT, PRODUCT_CARD_TEXT, SECTION_LABEL_TEXT } from '@/builder/blocks/_shared/text-patterns.ts';
import { CATALOGUE_OVERRIDE_DEFAULTS, CatalogueBody, catalogueOverrideShape, type CatalogueOverrides } from '@/builder/blocks/_shared/catalogue.tsx';
import { BOX, styleSupport } from '@/builder/style/model.ts';

/** The storefront catalogue: hero, search, category rail/chips, card grid. */
export const block = defineBlock<{ id: string } & CatalogueOverrides>({
  name: 'ProductGrid', label: 'Product grid', category: 'catalogue', layouts: 'all', routeBound: true, slots: [],
  style: styleSupport('wrap', [...BOX]),
  text: [...CATALOGUE_TEXT, ...PRODUCT_CARD_TEXT, ...HERO_TEXT, ...SECTION_LABEL_TEXT],
  schema: z.object(catalogueOverrideShape), defaultProps: CATALOGUE_OVERRIDE_DEFAULTS,
  render: ({ categoryPicker, pageTitle, intro, sku }) => <CatalogueBody body="grid" overrides={{ categoryPicker, pageTitle, intro, sku }} />,
});
