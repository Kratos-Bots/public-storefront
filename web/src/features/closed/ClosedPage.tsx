import { useSettings } from '@/app/settings.ts';
import { Brand } from '@/components/Brand.tsx';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/closed/ClosedPage.module.css';

/**
 * Replaces the whole app while the store is switched off (kill switch, or any
 * request answering 503 STOREFRONT_DISABLED). Settings keep polling, so the shop
 * returns on its own — the visitor never has to reload.
 */
export function ClosedPage() {
  const { brand, closedMessage, supportLinks } = useSettings();
  const { t } = useText();

  return (
    <main className={classes.root}>
      <div className={classes.panel}>
        <Brand size="lg" />
        <span className={classes.rule} aria-hidden />
        <p className={classes.eyebrow}>{t('closed.eyebrow')}</p>
        <p className={classes.message}>
          {closedMessage || t('closed.message', { shop: brand.name })}
        </p>
        <ContactLinks />
        {supportLinks.length > 0 ? (
          <nav className={classes.support} aria-label={t('closed.supportAriaLabel')}>
            {supportLinks.map((link) => (
              <a
                key={link.url}
                className={classes.supportLink}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.label}
              </a>
            ))}
          </nav>
        ) : null}
      </div>
    </main>
  );
}
