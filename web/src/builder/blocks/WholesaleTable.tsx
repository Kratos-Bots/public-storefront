import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CATALOGUE_OVERRIDE_DEFAULTS, CatalogueBody, catalogueOverrideShape, type CatalogueOverrides } from '@/builder/blocks/_shared/catalogue.tsx';

/** The trade list, whatever the store's wholesale flag says. */
export const block = defineBlock<{ id: string } & CatalogueOverrides>({
  name: 'WholesaleTable', label: 'Trade list', category: 'catalogue', layouts: 'all', routeBound: true, slots: [],
  schema: z.object(catalogueOverrideShape), defaultProps: CATALOGUE_OVERRIDE_DEFAULTS,
  render: ({ categoryPicker, pageTitle, intro, sku }) => <CatalogueBody body="wholesale" overrides={{ categoryPicker, pageTitle, intro, sku }} />,
});
