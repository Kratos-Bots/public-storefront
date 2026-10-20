import { useEffect } from 'react';
import { Button } from '@mantine/core';
import { Link } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { StatusPill } from '@/features/account/StatusPill.tsx';
import { FaqAccordion } from '@/features/faq/FaqAccordion.tsx';
import { useFaq } from '@/features/faq/queries.ts';
import { useFaqAvailable, useFaqPending } from '@/features/faq/use-faq-available.ts';
import { useTickets } from '@/features/support/queries.ts';
import { TICKET_STATUS } from '@/features/support/status.ts';
import type { CustomerTicketSummary } from '@/api/support.ts';
import { formatDate } from '@/lib/format.ts';
import { FADE } from '@/lib/motion.ts';
import { selectIsLoggedIn, useSessionStore } from '@/stores/session.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/support/HelpPage.module.css';

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
 * The Help page, the one place the bottom bar and the header menu send a shopper who needs something: the ticket
 * action, their tickets, the shop's FAQ and its own contact routes, in that order. Each part appears only when the shop
 * has it (tickets switched on and the customer signed in; an FAQ written), so a shop with only an FAQ reads as an FAQ
 * page and a shop with neither, for a customer with no tickets, still reads exactly as the old shell page did.
 * /support and /faq redirect here.
 */
export function HelpPage() {
  const { t } = useText();
  const settings = useSettings();
  const { supportLinks, brand, support } = settings;
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const enabled = support?.enabled === true;
  // An older backend has no `support` field and no tickets route: ask nothing of it.
  const tickets = useTickets(loggedIn && support !== undefined);
  const rows = tickets.data?.pages.flatMap((p) => p.data) ?? [];
  const hasTickets = rows.length > 0;

  const faqAvailable = useFaqAvailable();
  const faqPending = useFaqPending();
  const faq = useFaq(faqAvailable);
  const sections = faq.data?.sections ?? [];
  // A failed FAQ (or a refused customer's 403) just leaves the section out; nothing else on the page depends on it.
  const faqFailed = faq.isError && !faq.data;
  // Until the FAQ answers (or while the warehouse list says which FAQ applies) it is assumed on, so the page does not flash the shell copy.
  const faqLoading = faqPending || (faqAvailable && faq.isPending);
  const showFaq = !faqFailed && (faqLoading || (faqAvailable && sections.length > 0));

  const shop = brand.name;
  const brandTitle = brand.title;
  const pageTitle = t('support.help.title');
  const documentTitle = t('support.help.documentTitle', { page: pageTitle, shop });
  useEffect(() => {
    document.title = documentTitle;
    return () => { document.title = brandTitle; };
  }, [documentTitle, brandTitle]);

  const hasChat = Boolean(brand.links.whatsapp || brand.links.telegram);
  const hasContact = supportLinks.length > 0 || hasChat;
  const shell = !enabled && !hasTickets && !showFaq;

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

  // Signed in with tickets switched off: the note says so, unless there is nothing to say it about.
  const action = !loggedIn ? (
    enabled ? (
      <Button component={Link} to={`/login?returnTo=${encodeURIComponent('/help')}`} size="md" fullWidth>
        {t('support.page.signIn')}
      </Button>
    ) : null
  ) : enabled ? (
    <Button component={Link} to="/support/new" size="md" fullWidth>{t('support.page.new')}</Button>
  ) : hasTickets ? (
    <p className={classes.note}>{t('support.new.disabled')}</p>
  ) : null;

  return (
    <div className={`${classes.page} ${FADE}`}>
      <header className={classes.masthead}>
        <h1 className={classes.title}>{pageTitle}</h1>
        <p className={classes.lede}>{t('support.help.lede')}</p>
      </header>

      {action ? <div className={classes.action}>{action}</div> : null}

      {loggedIn && (enabled || hasTickets) ? (
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
      ) : null}

      {showFaq ? (
        <section id="faq" className={classes.faq} aria-labelledby="help-faq" data-sf-part="help-faq">
          <h2 id="help-faq" className={classes.heading}>{t('faq.section.title')}</h2>
          {faqLoading || faq.isPending ? (
            <div className={classes.faqSkeleton} role="status" aria-label={t('common.status.loading')}><span /><span /><span /></div>
          ) : (
            <FaqAccordion sections={sections} />
          )}
        </section>
      ) : null}

      {contact}
    </div>
  );
}
