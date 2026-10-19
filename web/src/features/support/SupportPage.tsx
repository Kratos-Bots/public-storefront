import { Button } from '@mantine/core';
import { Link } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { StatusPill } from '@/features/account/StatusPill.tsx';
import { useTickets } from '@/features/support/queries.ts';
import { TICKET_STATUS } from '@/features/support/status.ts';
import type { CustomerTicketSummary } from '@/api/support.ts';
import { formatDate } from '@/lib/format.ts';
import { FADE } from '@/lib/motion.ts';
import { selectIsLoggedIn, useSessionStore } from '@/stores/session.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/support/SupportPage.module.css';

function TicketRow({ ticket }: { ticket: CustomerTicketSummary }) {
  const { t } = useText();
  const status = TICKET_STATUS[ticket.status];
  return (
    <li>
      <Link
        to={`/support/tickets/${ticket.id}`}
        className={ticket.status === 'closed' ? `${classes.ticket} ${classes.ticketClosed}` : classes.ticket}
      >
        <span className={classes.subject}>
          {ticket.unread ? <span className={classes.dot} data-unread aria-hidden="true" /> : null}
          <span className={classes.subjectText}>{ticket.subject}</span>
        </span>
        <span className={classes.status}><StatusPill tone={status.tone}>{t(status.label)}</StatusPill></span>
        <span className={classes.about}>{ticket.order ? ticket.order.reference : t('support.general')}</span>
        <span className={classes.when}>{formatDate(ticket.lastMessage.at)}</span>
        <span className={classes.preview}>
          {t('support.page.preview', {
            who: ticket.lastMessage.fromSupport ? t('support.page.fromSupport') : t('support.thread.you'),
            text: ticket.lastMessage.preview,
          })}
        </span>
      </Link>
    </li>
  );
}

/** Today's shell: what a shop without support tickets has always shown. */
function ShellCopy() {
  const { t } = useText();
  return (
    <header className={classes.masthead}>
      <h1 className={classes.title}>{t('shell.support.title')}</h1>
      <p className={classes.lede}>{t('shell.support.soon')}</p>
    </header>
  );
}

/**
 * The support page the bottom bar's Support item opens. Signed in, it is the customer's tickets: a New ticket button
 * (while the shop takes new ones) and one row per ticket, newest activity first. Signed out, it asks them to sign in.
 * Either way the shop's own contact routes close the page. A shop that has never switched tickets on, for a customer
 * with none, still reads exactly as the shell page did.
 */
export function SupportPage() {
  const { t } = useText();
  const { supportLinks, brand, support } = useSettings();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const enabled = support?.enabled === true;
  // An older backend has no `support` field and no tickets route: ask nothing of it.
  const tickets = useTickets(loggedIn && support !== undefined);
  const rows = tickets.data?.pages.flatMap((p) => p.data) ?? [];
  const hasTickets = rows.length > 0;

  const hasChat = Boolean(brand.links.whatsapp || brand.links.telegram);
  const hasContact = supportLinks.length > 0 || hasChat;
  const shell = !enabled && !hasTickets;

  const contact = hasContact ? (
    <section className={classes.contact} aria-labelledby="support-contact">
      <p id="support-contact" className={classes.contactLede}>
        {shell ? t('shell.support.contact') : t('support.page.preferChat')}
      </p>
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
  ) : null;

  if (shell) {
    return (
      <div className={`${classes.page} ${FADE}`}>
        <ShellCopy />
        {contact}
      </div>
    );
  }

  return (
    <div className={`${classes.page} ${FADE}`}>
      <header className={classes.masthead}>
        <h1 className={classes.title}>{t('shell.support.title')}</h1>
        <p className={classes.lede}>{t('support.page.lede')}</p>
      </header>

      {!loggedIn ? (
        <div className={classes.action}>
          <Button component={Link} to={`/login?returnTo=${encodeURIComponent('/support')}`} size="md" fullWidth>
            {t('support.page.signIn')}
          </Button>
        </div>
      ) : (
        <>
          <div className={classes.action}>
            {enabled ? (
              <Button component={Link} to="/support/new" size="md" fullWidth>{t('support.page.new')}</Button>
            ) : (
              <p className={classes.note}>{t('support.new.disabled')}</p>
            )}
          </div>

          <section className={classes.tickets} aria-labelledby="support-yours">
            <h2 id="support-yours" className={classes.heading}>{t('support.page.yours')}</h2>
            {tickets.isPending ? (
              <div className={classes.placeholder} aria-hidden="true" />
            ) : tickets.isError && !hasTickets ? (
              <p className={classes.empty}>{t('errors.requestFailed')}</p>
            ) : hasTickets ? (
              <>
                <ul className={classes.list}>
                  {rows.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} />)}
                </ul>
                {tickets.hasNextPage ? (
                  <Button
                    variant="subtle"
                    className={classes.more}
                    loading={tickets.isFetchingNextPage}
                    onClick={() => { void tickets.fetchNextPage(); }}
                  >
                    {t('account.orders.loadMore')}
                  </Button>
                ) : null}
              </>
            ) : (
              <p className={classes.empty}>{t('support.page.empty')}</p>
            )}
          </section>
        </>
      )}

      {contact}
    </div>
  );
}
