import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { CATALOGUE_OVERRIDE_DEFAULTS, CatalogueBody, catalogueOverrideShape, type CatalogueOverrides } from '@/builder/blocks/_shared/catalogue.tsx';
import { LIST_CONTAINER } from '@/builder/blocks/_shared/catalogue-container.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';
import type { ComponentData } from '@/builder/types.ts';

type Props = { id: string; content: ComponentData[] } & CatalogueOverrides;

/** The dense manifest ruled by category: a container of catalogue parts, with the product and filter sheets over it. */
export const block = defineBlock<Props>({
  name: 'ProductList', label: 'Product list', category: 'catalogue', layouts: 'all', routeBound: true, slots: ['content'],
  style: styleSupport('wrap', [...BOX]),
  text: ['catalog.list.eyebrowCatalogue', 'common.list.loadFailed', 'catalog.list.loadFailedDetail', 'common.actions.tryAgain', 'common.status.loading', 'catalog.filter.*',
    'product.detail.product', 'common.actions.close'],
  container: LIST_CONTAINER,
  schema: z.object({ ...catalogueOverrideShape, content: slot() }),
  defaultProps: { ...CATALOGUE_OVERRIDE_DEFAULTS, content: [] },
  render: ({ categoryPicker, pageTitle, intro, sku, content }) => (
    <CatalogueBody body="list" overrides={{ categoryPicker, pageTitle, intro, sku }} slots={{ content }} />
  ),
});
