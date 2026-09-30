import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { CATALOGUE_OVERRIDE_DEFAULTS, CatalogueBody, catalogueOverrideShape, type CatalogueOverrides } from '@/builder/blocks/_shared/catalogue.tsx';
import { GRID_CONTAINER } from '@/builder/blocks/_shared/catalogue-container.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';
import type { ComponentData } from '@/builder/types.ts';

type Props = { id: string; top: ComponentData[]; rail: ComponentData[]; main: ComponentData[] } & CatalogueOverrides;

/** The storefront catalogue: a container of catalogue parts over the top, the category rail and the main column. */
export const block = defineBlock<Props>({
  name: 'ProductGrid', label: 'Product grid', category: 'catalogue', layouts: 'all', routeBound: true, slots: ['top', 'rail', 'main'],
  style: styleSupport('wrap', [...BOX]),
  text: ['catalog.list.eyebrowCatalogue', 'common.list.loadFailed', 'catalog.list.loadFailedDetail', 'common.actions.tryAgain', 'common.status.loading', 'catalog.filter.*'],
  container: GRID_CONTAINER,
  schema: z.object({ ...catalogueOverrideShape, top: slot(), rail: slot(), main: slot() }),
  defaultProps: { ...CATALOGUE_OVERRIDE_DEFAULTS, top: [], rail: [], main: [] },
  render: ({ categoryPicker, pageTitle, intro, sku, top, rail, main }) => (
    <CatalogueBody body="grid" overrides={{ categoryPicker, pageTitle, intro, sku }} slots={{ top, rail, main }} />
  ),
});
