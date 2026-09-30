import { useText, type CatalogHeroProps } from '@/templates/contract.ts';
import { splitHeadline } from './headline.ts';

/**
 * Grid: a hero badge with the real catalogue counts, the tagline as a colour-contrast
 * headline, the welcome line, and the single elliptical orb. List/wholesale surfaces
 * are dense — they keep only the welcome line.
 */
export function LuxuryCatalogHero({ surface, tagline, welcomeMessage, productCount, categoryCount, options }: CatalogHeroProps) {
  const { t, tp } = useText();
  if (surface !== 'grid') {
    return welcomeMessage ? <p className="lux-welcome">{welcomeMessage}</p> : null;
  }
  if (!tagline && !welcomeMessage) return null;

  const { muted, bright } = splitHeadline(tagline);
  const products = tp('templates.dark-luxury.hero.products', productCount);
  const counts = categoryCount > 0
    ? t('templates.dark-luxury.hero.counts', { products, categories: tp('templates.dark-luxury.hero.categories', categoryCount) })
    : products;

  return (
    <section className="lux-hero" aria-label={t('templates.dark-luxury.hero.aboutAria')} data-sf-part="hero">
      {options.orb === true ? <div className="lux-orb" data-lux="orb" aria-hidden /> : null}
      <p className="lux-hero__badge">
        <span className="lux-hero__dot" aria-hidden />
        {counts}
      </p>
      {bright ? (
        <p className="lux-hero__headline">
          {muted ? <span className="lux-hero__muted">{muted} </span> : null}
          <span className="lux-hero__bright">{bright}</span>
        </p>
      ) : null}
      {welcomeMessage ? <p className="lux-hero__welcome">{welcomeMessage}</p> : null}
    </section>
  );
}
