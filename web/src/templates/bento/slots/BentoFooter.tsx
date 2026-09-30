import { Brand, ContactLinks, useText, type FooterProps } from '@/templates/contract.ts';

/**
 * The footer as a row of cells on the same grid as the shop board: the brand cell is wide, support
 * and chat each take one. The menu layout has no footer, same as modern; the showFooter option
 * turns it off everywhere.
 */
export function BentoFooter({ brand, layout, supportLinks, hasChat, options }: FooterProps) {
  const { t } = useText();
  if (layout !== 'storefront' || options.showFooter === false) return null;
  const year = new Date().getFullYear();

  return (
    <footer className="bento-footer" data-sf-part="footer">
      <div className="bento-footer__grid">
        <div className="bento-cell bento-footer__brand">
          <Brand size="sm" />
          {brand.tagline ? <p className="bento-footer__tagline">{brand.tagline}</p> : null}
          <p className="bento-footer__meta">© {year} {brand.name}</p>
        </div>

        {supportLinks.length > 0 ? (
          <nav className="bento-cell" aria-label={t('templates.bento.footer.support')}>
            <h2 className="bento-footer__head">{t('templates.bento.footer.support')}</h2>
            <ul className="bento-footer__list">
              {supportLinks.map((link) => (
                <li key={link.url}>
                  <a className="bento-footer__link" href={link.url} target="_blank" rel="noopener noreferrer">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {hasChat ? (
          <div className="bento-cell">
            <h2 className="bento-footer__head">{t('templates.bento.footer.talk')}</h2>
            <ContactLinks />
          </div>
        ) : null}
      </div>
    </footer>
  );
}
