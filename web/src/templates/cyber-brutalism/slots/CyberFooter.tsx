import { ArrowUpRightIcon, Brand, ContactLinks, useMobileCartBar, type FooterProps } from '@/templates/contract.ts';
import { Crosshairs } from './Crosshairs.tsx';
import { nodeName } from './readout.ts';

function StatusStrip() {
  return (
    <div className="cb-status" data-cb="status" aria-hidden>
      <span><span className="cb-status__dot" />CONNECTION SECURE</span>
      <span className="cb-status__fill" data-cb-wide>· · · · · · · · · · · ·</span>
      <span>&gt; ACCESS GRANTED_</span>
    </div>
  );
}

/**
 * Hazard stripe (dark) or a bold rule (light), a numbered mono grid, the node row, and
 * the bottom status strip in normal flow — which steps aside while the phone cart bar
 * is showing (the cart bar is restyled as the same strip in template.css). The menu
 * layout keeps only the strip.
 */
export function CyberFooter({ brand, layout, supportLinks, hasChat, options, scheme }: FooterProps) {
  const barShowing = useMobileCartBar();
  const status = options.statusBar === true && !barShowing ? <StatusStrip /> : null;

  if (layout !== 'storefront') {
    return status ? <footer className="cb-footer cb-footer--compact" data-sf-part="footer">{status}</footer> : null;
  }

  let n = 0;
  const eyebrow = () => `/${String(++n).padStart(2, '0')}`;

  return (
    <footer className="cb-footer" data-sf-part="footer">
      {scheme === 'dark' ? <div className="cb-hazard" aria-hidden /> : <div className="cb-rule" aria-hidden />}
      <div className="cb-footer__inner">
        {options.crosshairs === true ? <Crosshairs /> : null}

        <div>
          <p className="cb-footer__eyebrow">{eyebrow()}</p>
          <Brand size="sm" />
          {brand.tagline ? <p className="cb-footer__tagline">{brand.tagline}</p> : null}
        </div>

        {supportLinks.length > 0 ? (
          <nav aria-label="Support">
            <h2 className="cb-footer__eyebrow">{eyebrow()} Support</h2>
            <ul className="cb-footer__list">
              {supportLinks.map((link) => (
                <li key={link.url}>
                  <a className="cb-footer__link" href={link.url} target="_blank" rel="noopener noreferrer">
                    {link.label}
                    <ArrowUpRightIcon size="1em" />
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {hasChat ? (
          <div>
            <h2 className="cb-footer__eyebrow">{eyebrow()} Contact</h2>
            <ContactLinks />
          </div>
        ) : null}

        <p className="cb-footer__nodes" aria-hidden>
          <span>{brand.name}</span>
          <span>●</span>
          <span>{nodeName(options.nodeLabel)}</span>
          <span>+</span>
          <span>{new Date().getFullYear()}</span>
        </p>
      </div>
      {status}
    </footer>
  );
}
