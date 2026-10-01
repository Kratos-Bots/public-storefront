import { useCutoffInfo, useOrderingState, useText, type CatalogHeroProps } from '@/templates/contract.ts';
import { Crosshairs } from './Crosshairs.tsx';
import { readoutLines } from './readout.ts';

/**
 * Grid: the brand name as the heavy left-aligned display line (a <p> — the page's
 * <h1> stays the only heading), tagline in the accent, and a terminal readout of real
 * store data. List/wholesale surfaces are dense: a one-line readout and the welcome.
 */
export function CyberCatalogHero({ surface, brand, tagline, welcomeMessage, productCount, options }: CatalogHeroProps) {
  const text = useText();
  const { t } = text;
  const { accepting } = useOrderingState();
  const { next } = useCutoffInfo();
  const lines = readoutLines({ productCount, cutoff: next?.cutoff ?? null, accepting }, text);

  if (surface !== 'grid') {
    return (
      <div className="cb-hero-compact">
        <ul className="cb-readout cb-readout--inline" aria-label={t('templates.cyber-brutalism.hero.statusAria')}>
          {lines.map((l) => <li key={l}>&gt; {l}</li>)}
        </ul>
        {welcomeMessage ? <p className="cb-hero__welcome">{welcomeMessage}</p> : null}
      </div>
    );
  }

  return (
    <section className="cb-hero" aria-label={t('templates.cyber-brutalism.hero.aboutAria')} data-sf-part="hero">
      {options.crosshairs === true ? <Crosshairs /> : null}
      <div className="cb-hero__main">
        <p className="cb-hero__scn" aria-hidden>{t('templates.cyber-brutalism.hero.scene')}</p>
        <p className="cb-hero__name cb-hero__line">{brand.name}</p>
        {tagline ? <p className="cb-hero__tagline cb-hero__line">{tagline}</p> : null}
        {welcomeMessage ? <p className="cb-hero__welcome">{welcomeMessage}</p> : null}
      </div>
      <ul className="cb-readout" aria-label={t('templates.cyber-brutalism.hero.statusAria')}>
        {lines.map((l, i) => (
          <li key={l} className={i === lines.length - 1 ? 'cb-cursor' : undefined}>&gt; {l}</li>
        ))}
      </ul>
    </section>
  );
}
