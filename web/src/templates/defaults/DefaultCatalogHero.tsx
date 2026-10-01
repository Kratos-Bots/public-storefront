import type { CatalogHeroProps } from '@/templates/slots.ts';
import { useText } from '@/templates/contract.ts';
import gridClasses from '@/features/catalog/ProductGrid.module.css';
import listClasses from '@/features/catalog/ProductList.module.css';
import wholesaleClasses from '@/features/wholesale/WholesaleCatalogPage.module.css';

export function DefaultCatalogHero({ surface, tagline, welcomeMessage, productCount, categoryCount }: CatalogHeroProps) {
  const { t } = useText();
  if (surface === 'grid') {
    if (!tagline && !welcomeMessage) return null;
    return (
      <section className={gridClasses.hero} aria-label={t('templates.default.hero.aboutAria')} data-sf-part="hero">
        <div className={gridClasses.heroText}>
          {tagline ? <p className={gridClasses.tagline}>{tagline}</p> : null}
          {welcomeMessage ? <p className={gridClasses.welcome}>{welcomeMessage}</p> : null}
        </div>
        <p className={gridClasses.stock}>
          {t('templates.default.hero.products', { count: productCount })}
          {categoryCount > 0 ? t('templates.default.hero.categories', { count: categoryCount }) : ''}
        </p>
      </section>
    );
  }
  if (!welcomeMessage) return null;
  return <p className={surface === 'list' ? listClasses.welcome : wholesaleClasses.welcome}>{welcomeMessage}</p>;
}
