import { Brand, ContactLinks, useOrderingState, type FooterProps } from '@/templates/contract.ts';

function StatusBadge() {
  const { accepting } = useOrderingState();
  return (
    <p className="lux-status" data-state={accepting ? 'open' : 'paused'}>
      <span className="lux-status__dot" aria-hidden />
      {accepting ? '[ACCEPTING ORDERS]' : '[ORDERING PAUSED]'}
    </p>
  );
}

/**
 * The footer sits inside a rounded elevated panel, never flush with the page. The
 * status badge is the store's real ordering state. The menu layout is dense: it gets
 * a compact panel carrying just the badge (or nothing when the badge is off).
 */
export function LuxuryFooter({ brand, layout, supportLinks, hasChat, options }: FooterProps) {
  if (options.showFooter === false) return null; // the badge lives in the footer, so it goes too
  const badge = options.statusBadge === true ? <StatusBadge /> : null;
  const year = new Date().getFullYear();

  if (layout !== 'storefront') {
    if (!badge) return null;
    return (
      <footer className="lux-footer-wrap" data-sf-part="footer">
        <div className="lux-footer lux-footer--compact">
          {badge}
          <span className="lux-footer__meta">{brand.name} // {year}</span>
        </div>
      </footer>
    );
  }

  return (
    <footer className="lux-footer-wrap" data-sf-part="footer">
      <div className="lux-footer">
        <div className="lux-footer__grid">
          <div>
            <Brand size="sm" />
            {brand.tagline ? <p className="lux-footer__tagline">{brand.tagline}</p> : null}
          </div>

          {supportLinks.length > 0 ? (
            <nav aria-label="Support">
              <h2 className="lux-footer__head">[Support]</h2>
              <ul className="lux-footer__list">
                {supportLinks.map((link) => (
                  <li key={link.url}>
                    <a className="lux-footer__link" href={link.url} target="_blank" rel="noopener noreferrer">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}

          {hasChat ? (
            <div>
              <h2 className="lux-footer__head">[Talk to us]</h2>
              <ContactLinks />
            </div>
          ) : null}
        </div>

        <div className="lux-footer__base">
          <span className="lux-footer__meta">{brand.name} // {year}</span>
          {badge}
        </div>
      </div>
    </footer>
  );
}
