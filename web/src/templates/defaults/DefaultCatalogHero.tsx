import type { CatalogHeroProps } from '@/templates/slots.ts';
import gridClasses from '@/features/catalog/ProductGrid.module.css';
import listClasses from '@/features/catalog/ProductList.module.css';
import wholesaleClasses from '@/features/wholesale/WholesaleCatalogPage.module.css';

export function DefaultCatalogHero({ surface, tagline, welcomeMessage, productCount, categoryCount }: CatalogHeroProps) {
  if (surface === 'grid') {
    if (!tagline && !welcomeMessage) return null;
    return (
      <section className={gridClasses.hero} aria-label="About this shop" data-sf-part="hero">
        <div className={gridClasses.heroText}>
          {tagline ? <p className={gridClasses.tagline}>{tagline}</p> : null}
          {welcomeMessage ? <p className={gridClasses.welcome}>{welcomeMessage}</p> : null}
        </div>
        <p className={gridClasses.stock}>
          {productCount} products
          {categoryCount > 0 ? ` · ${categoryCount} categories` : ''}
        </p>
      </section>
    );
  }
  if (!welcomeMessage) return null;
  return <p className={surface === 'list' ? listClasses.welcome : wholesaleClasses.welcome}>{welcomeMessage}</p>;
}
