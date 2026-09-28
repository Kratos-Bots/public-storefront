import type { CatalogHeroProps } from '@/templates/contract.ts';
import { splitHeadline } from './headline.ts';

/**
 * Grid: a hero badge with the real catalogue counts, the tagline as a colour-contrast
 * headline, the welcome line, and the single elliptical orb. List/wholesale surfaces
 * are dense — they keep only the welcome line.
 */
export function LuxuryCatalogHero({ surface, tagline, welcomeMessage, productCount, categoryCount, options }: CatalogHeroProps) {
  if (surface !== 'grid') {
    return welcomeMessage ? <p className="lux-welcome">{welcomeMessage}</p> : null;
  }
  if (!tagline && !welcomeMessage) return null;

  const { muted, bright } = splitHeadline(tagline);
  const products = `${productCount} ${productCount === 1 ? 'product' : 'products'}`;
  const counts = categoryCount > 0 ? `${products} · ${categoryCount} ${categoryCount === 1 ? 'category' : 'categories'}` : products;

  return (
    <section className="lux-hero" aria-label="About this shop" data-sf-part="hero">
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
