import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CATALOGUE_TEXT, HERO_TEXT, SECTION_LABEL_TEXT } from '@/builder/blocks/_shared/text-patterns.ts';
import { CATALOGUE_OVERRIDE_DEFAULTS, CatalogueBody, catalogueOverrideShape, type CatalogueOverrides } from '@/builder/blocks/_shared/catalogue.tsx';
import { BOX, styleSupport } from '@/builder/style/model.ts';

/** The trade list, whatever the store's wholesale flag says. */
export const block = defineBlock<{ id: string } & CatalogueOverrides>({
  name: 'WholesaleTable', label: 'Trade list', category: 'catalogue', layouts: 'all', routeBound: true, slots: [],
  /* Wrap, but only keys that leave the inline geometry alone: WholesaleBar is a sticky full-bleed band (negative
     margin-inline from --sf-main-pad, sticky to the foot), so wrapper padX / border / radius / maxWidth would offset
     or clip it, and padBottom would leave the bar short of the foot. */
  style: styleSupport('wrap', BOX, ['padX', 'padBottom', 'border', 'borderColor', 'borderStyle', 'radius', 'maxWidth']),
  text: ['wholesale.*', 'catalog.group.*', 'cart.line.*', ...CATALOGUE_TEXT, ...HERO_TEXT, ...SECTION_LABEL_TEXT, 'common.qty.*', 'common.product.*', 'common.promo.more', 'product.stock.*'],
  schema: z.object(catalogueOverrideShape), defaultProps: CATALOGUE_OVERRIDE_DEFAULTS,
  render: ({ categoryPicker, pageTitle, intro, sku }) => <CatalogueBody body="wholesale" overrides={{ categoryPicker, pageTitle, intro, sku }} />,
});
