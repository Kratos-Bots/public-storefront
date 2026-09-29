import { z } from 'zod';
import { useSettings } from '@/app/settings.ts';
import { defineBlock } from '@/builder/define.ts';
import { useCatalogStats } from '@/templates/hooks.ts';
import { Slot } from '@/templates/runtime.tsx';
import type { LayoutKind } from '@/builder/types.ts';

type Surface = 'grid' | 'list' | 'wholesale';
type Props = { id: string; variant: 'template'; surface: 'auto' | Surface };

const autoSurface = (layout: LayoutKind): Surface => (layout === 'storefront' ? 'grid' : 'list');

function TemplateHero({ surface }: { surface: Surface }) {
  const { brand, welcomeMessage } = useSettings();
  const { productCount, categoryCount } = useCatalogStats();
  return <Slot name="CatalogHero" surface={surface} tagline={brand.tagline} welcomeMessage={welcomeMessage} productCount={productCount ?? 0} categoryCount={categoryCount ?? 0} />;
}

/** The template's catalogue intro on its own (the list blocks already carry one; `intro: hide` there + this block moves it). */
export const block = defineBlock<Props>({
  name: 'CatalogHero', label: 'Catalogue intro', category: 'catalogue', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({ variant: z.enum(['template']), surface: z.enum(['auto', 'grid', 'list', 'wholesale']) }),
  defaultProps: { variant: 'template', surface: 'auto' },
  render: ({ surface, puck }) => <TemplateHero surface={surface === 'auto' ? autoSurface(puck.layout) : surface} />,
});
