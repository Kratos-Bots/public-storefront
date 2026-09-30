import { z } from 'zod';
import { useSettings } from '@/app/settings.ts';
import { useBuilderMode } from '@/builder/mode.ts';
import { defineBlock, MEDIA_SRC_RE, mediaSrc, richtext } from '@/builder/define.ts';
import { HERO_TEXT } from '@/builder/blocks/_shared/text-patterns.ts';
import { RichHtml } from '@/builder/blocks/_shared/RichHtml.tsx';
import { useCatalogStats } from '@/templates/hooks.ts';
import { Slot } from '@/templates/runtime.tsx';
import type { LayoutKind } from '@/builder/types.ts';
import classes from '@/builder/blocks/CatalogHero.module.css';

type Surface = 'grid' | 'list' | 'wholesale';
type Props = {
  id: string; variant: 'template' | 'custom'; surface: 'auto' | Surface;
  title: string; bodyHtml: string; imageSrc: string; imageAlt: string; align: 'start' | 'center';
};

const autoSurface = (layout: LayoutKind): Surface => (layout === 'storefront' ? 'grid' : 'list');

function TemplateHero({ surface }: { surface: Surface }) {
  const { brand, welcomeMessage } = useSettings();
  const { productCount, categoryCount } = useCatalogStats();
  return <Slot name="CatalogHero" surface={surface} tagline={brand.tagline} welcomeMessage={welcomeMessage} productCount={productCount ?? 0} categoryCount={categoryCount ?? 0} />;
}

function CustomHero({ title, bodyHtml, imageSrc, imageAlt, align }: Pick<Props, 'title' | 'bodyHtml' | 'imageSrc' | 'imageAlt' | 'align'>) {
  const { editing } = useBuilderMode();
  // Re-checked here as Image does: the editor may hand over props the guard never saw.
  const src = MEDIA_SRC_RE.test(imageSrc) ? imageSrc : '';
  const image = src && imageAlt.trim() ? src : '';
  const needsAlt = Boolean(src) && !imageAlt.trim();
  const heading = title.trim();
  // Inside the editor Puck hands a richtext prop over as a React element: that counts as a body.
  const noBody = typeof bodyHtml === 'string' && !bodyHtml.trim();
  if (!heading && noBody && !image) {
    return needsAlt && editing ? <p className={classes.hint} data-sf-block="CatalogHero">Describe the image for screen readers so it shows.</p> : null;
  }
  return (
    <section className={`${classes.hero} ${align === 'center' ? classes.center : ''} ${image ? classes.withImage : ''}`.trim()} data-sf-block="CatalogHero">
      <div className={classes.text}>
        {heading ? <h2 className={classes.title}>{title}</h2> : null}
        <RichHtml value={bodyHtml} className={classes.body} />
      </div>
      {needsAlt && editing ? <p className={classes.hint}>Describe the image for screen readers so it shows.</p> : null}
      {image ? <img className={classes.image} src={image} alt={imageAlt} loading="lazy" decoding="async" /> : null}
    </section>
  );
}

/** The catalogue intro: the template's own (template), or owner copy and an image (custom). */
export const block = defineBlock<Props>({
  name: 'CatalogHero', label: 'Catalogue intro', category: 'catalogue', layouts: 'all', routeBound: false, slots: [],
  text: HERO_TEXT,
  schema: z.object({
    variant: z.enum(['template', 'custom']), surface: z.enum(['auto', 'grid', 'list', 'wholesale']),
    title: z.string().max(120), bodyHtml: richtext(), imageSrc: mediaSrc(), imageAlt: z.string().max(300), align: z.enum(['start', 'center']),
  }),
  defaultProps: { variant: 'template', surface: 'auto', title: '', bodyHtml: '', imageSrc: '', imageAlt: '', align: 'start' },
  render: ({ variant, surface, title, bodyHtml, imageSrc, imageAlt, align, puck }) =>
    variant === 'template'
      ? <TemplateHero surface={surface === 'auto' ? autoSurface(puck.layout) : surface} />
      : <CustomHero title={title} bodyHtml={bodyHtml} imageSrc={imageSrc} imageAlt={imageAlt} align={align} />,
});
