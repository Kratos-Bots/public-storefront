import { Brand } from '@/components/Brand.tsx';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import type { FooterProps } from '@/templates/slots.ts';
import classes from '@/layouts/StorefrontShell.module.css';

/** Modern's footer: the storefront layout's three columns and colophon; the menu layout has none. */
export function DefaultFooter({ brand, layout, supportLinks, hasChat }: FooterProps) {
  if (layout !== 'storefront') return null;
  return (
    <footer className={classes.footer} data-sf-part="footer">
      <div className={classes.footerInner}>
        <div className={classes.footerBrand}>
          <Brand size="sm" />
          {brand.tagline ? <p className={classes.tagline}>{brand.tagline}</p> : null}
        </div>

        {supportLinks.length > 0 ? (
          <nav aria-label="Support">
            <h2 className={classes.footerHead}>Support</h2>
            <ul className={classes.footerList}>
              {supportLinks.map((link) => (
                <li key={link.url}>
                  <a className={classes.footerLink} href={link.url} target="_blank" rel="noopener noreferrer">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {hasChat ? (
          <div>
            <h2 className={classes.footerHead}>Talk to us</h2>
            <ContactLinks />
          </div>
        ) : null}
      </div>

      <div className={classes.colophon}>
        <span>{brand.name}</span>
        <span>{new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}
