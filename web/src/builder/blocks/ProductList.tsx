import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CATALOGUE_OVERRIDE_DEFAULTS, CatalogueBody, catalogueOverrideShape, type CatalogueOverrides } from '@/builder/blocks/_shared/catalogue.tsx';

/** The dense manifest ruled by category, with the product and filter sheets over it. */
export const block = defineBlock<{ id: string } & CatalogueOverrides>({
  name: 'ProductList', label: 'Product list', category: 'catalogue', layouts: 'all', routeBound: true, slots: [],
  schema: z.object(catalogueOverrideShape), defaultProps: CATALOGUE_OVERRIDE_DEFAULTS,
  render: ({ categoryPicker, pageTitle, intro, sku }) => <CatalogueBody body="list" overrides={{ categoryPicker, pageTitle, intro, sku }} />,
});
