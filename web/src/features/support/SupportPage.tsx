import { useSettings } from '@/app/settings.ts';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { FADE } from '@/lib/motion.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/support/SupportPage.module.css';

/**
 * The support page the bottom bar's Support item opens. A shell page for now: a heading, a line saying more is coming,
 * and the contact routes the shop already has (its support links and its WhatsApp / Telegram chips). No form and no
 * request; a shop with no contact routes gets the heading and the line alone.
 */
export function SupportPage() {
  const { t } = useText();
  const { supportLinks, brand } = useSettings();
  const hasChat = Boolean(brand.links.whatsapp || brand.links.telegram);
  const hasContact = supportLinks.length > 0 || hasChat;

  return (
    <div className={`${classes.page} ${FADE}`}>
      <header className={classes.masthead}>
        <h1 className={classes.title}>{t('shell.support.title')}</h1>
        <p className={classes.lede}>{t('shell.support.soon')}</p>
      </header>

      {hasContact ? (
        <section className={classes.contact} aria-labelledby="support-contact">
          <p id="support-contact" className={classes.contactLede}>{t('shell.support.contact')}</p>
          {supportLinks.length > 0 ? (
            <ul className={classes.links}>
              {supportLinks.map((link) => (
                <li key={link.url}>
                  <a className={classes.link} href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>
                </li>
              ))}
            </ul>
          ) : null}
          <ContactLinks />
        </section>
      ) : null}
    </div>
  );
}
