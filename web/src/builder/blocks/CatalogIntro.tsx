import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CatalogueFamily } from '@/builder/families.ts';
import { HERO_TEXT } from '@/builder/blocks/_shared/text-patterns.ts';
import { BOX, VIS, styleSupport } from '@/builder/style/model.ts';

/** The catalogue's intro: the template's CatalogHero slot with the shop's counts (spec §5.2). */
export const block = defineBlock<{ id: string }>({
  name: 'CatalogIntro', label: 'Intro', category: 'part', part: { family: 'catalogue' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('wrap', [...BOX, ...VIS]),
  text: [...HERO_TEXT],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CatalogueFamily.PartHost name="CatalogIntro" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
