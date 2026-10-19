import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ActionIcon, Button, Menu } from '@mantine/core';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { StatusPill } from '@/features/account/StatusPill.tsx';
import { orderStatusLabel } from '@/features/order-status/status.ts';
import { Composer } from '@/features/support/Composer.tsx';
import { MessageBubble } from '@/features/support/MessageBubble.tsx';
import { PhotoLightbox } from '@/features/support/PhotoLightbox.tsx';
import { useCloseTicket, useSendMessage, useTicket, type ThreadDetail, type ThreadMessage } from '@/features/support/queries.ts';
import { threadItems, type ThreadItem } from '@/features/support/thread-items.ts';
import { TICKET_STATUS } from '@/features/support/status.ts';
import { useKeyboardInset } from '@/features/support/useKeyboardInset.ts';
import { ApiError, errorMessage } from '@/lib/errors.ts';
import { formatDate, formatDateTime } from '@/lib/format.ts';
import { FADE } from '@/lib/motion.ts';
import { textKey, useText } from '@/text/runtime.tsx';
import classes from '@/features/support/TicketPage.module.css';

const EVENT_LABEL = {
  opened: textKey('support.thread.opened'),
  closed: textKey('support.thread.closed'),
  reopened: textKey('support.thread.reopened'),
} as const;

/** Within this many px of the newest message counts as "reading the end": new messages then scroll into view. */
const NEAR_END = 96;

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Where the end of the conversation sits against the bottom of what the customer can see (the screen less the bottom
 * navigation bar, or the keyboard when it is up): positive while the end is still below it.
 */
function distanceFromEnd(page: HTMLElement, keyboard: number): number {
  const nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sf-nav-h')) || 0;
  return page.getBoundingClientRect().bottom - (window.innerHeight - Math.max(nav, keyboard));
}

function Conversation({ id, detail, seed }: { id: number; detail: ThreadDetail; seed: string }) {
  const { t } = useText();
  const { support } = useSettings();
  const send = useSendMessage(id);
  const close = useCloseTicket(id);
  const keyboard = useKeyboardInset();
  const [photo, setPhoto] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState(false);
  // Text carried here from another ticket starts as the draft; if this one cannot take it either, it goes on again.
  const [unsent, setUnsent] = useState(() => (detail.canReply ? '' : seed));

  const page = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  const followMine = useRef(false);
  const keyboardRef = useRef(keyboard);
  keyboardRef.current = keyboard;

  const items = useMemo(() => threadItems(detail), [detail]);
  const lastMessage = [...items].reverse().find((i): i is Extract<ThreadItem, { kind: 'message' }> => i.kind === 'message')?.message;
  const status = TICKET_STATUS[detail.status];
  const order = detail.order;

  const scrollToEnd = useCallback((smooth: boolean) => {
    const el = page.current;
    if (!el) return;
    const d = distanceFromEnd(el, keyboardRef.current);
    // Either way: down to a newer message, or back up when the page has been scrolled on into the shop's footer.
    if (Math.abs(d) > 1) window.scrollTo({ top: window.scrollY + d, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
    atEnd.current = true;
    setNewMessage(false);
  }, []);

  // Open at the newest message.
  useLayoutEffect(() => { scrollToEnd(false); }, [scrollToEnd]);

  useEffect(() => {
    const onScroll = () => {
      const el = page.current;
      if (!el) return;
      atEnd.current = distanceFromEnd(el, keyboardRef.current) < NEAR_END;
      if (atEnd.current) setNewMessage(false);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // A new message: the customer's own always comes into view; the shop's does when they were reading the end, and
  // otherwise waits behind a "New message" pill so it never pulls them away from what they scrolled back to.
  const lastKey = lastMessage ? `${lastMessage.id}` : '';
  const seen = useRef(lastKey);
  useEffect(() => {
    if (lastKey === seen.current) return;
    seen.current = lastKey;
    if (followMine.current || atEnd.current) {
      followMine.current = false;
      requestAnimationFrame(() => scrollToEnd(true));
    } else if (lastMessage?.fromSupport) setNewMessage(true);
  }, [lastKey, lastMessage, scrollToEnd]);

  // The reply box grows with what is written (and with photos to send): while reading the end, the newest message
  // stays just above it rather than going under it.
  const foot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = foot.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (atEnd.current) scrollToEnd(false); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollToEnd]);

  // The keyboard coming up shrinks the view from below: keep the newest message just above the box, but only for a
  // reader who was at the end; one who scrolled back up stays where they are.
  useEffect(() => {
    if (keyboard > 0 && atEnd.current) scrollToEnd(false);
  }, [keyboard, scrollToEnd]);

  const onSend = (body: string, files: File[]) => {
    followMine.current = true;
    send.mutate({ body, files });
  };
  const onRetry = (m: ThreadMessage) => {
    if (m.local) send.mutate({ ...m.local.draft, tempId: m.id });
  };

  const closed = detail.status === 'closed';
  // Whatever the customer wrote and could not send here (replies refused, a draft left in the box when the ticket
  // stopped taking replies) goes with them to the new ticket's message.
  const carried = [...detail.messages.filter((m) => m.local?.state === 'failed').map((m) => m.local!.draft.body), unsent]
    .map((b) => b.trim())
    .filter(Boolean)
    .join('\n\n');
  const newTicketTo = order ? `/support/new?order=${encodeURIComponent(order.reference)}` : '/support/new';
  const style = { '--sf-kb': `${keyboard}px` } as CSSProperties;

  return (
    <div ref={page} className={`${classes.page} ${FADE}`} style={style} data-kb={keyboard > 0 ? '' : undefined}>
      <header className={classes.head}>
        <Link to="/support" className={classes.back} aria-label={t('support.new.back')}>
          <BackIcon />
        </Link>
        <h1 className={classes.subject}>{detail.subject}</h1>
        <span className={classes.status}><StatusPill tone={status.tone}>{t(status.label)}</StatusPill></span>
        {!closed ? (
          <Menu position="bottom-end" shadow="md" withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" size={44} radius="xl" className={classes.more} aria-label={t('support.thread.options')}>
                <MoreIcon />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => close.mutate()} disabled={close.isPending}>{t('support.thread.close')}</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        ) : null}
      </header>
      {close.isError ? <p className={classes.error} role="alert">{errorMessage(close.error)}</p> : null}

      {order ? (
        <Link to={`/account/orders/${encodeURIComponent(order.reference)}`} className={classes.order}>
          <span className={classes.orderRef}>{order.reference}</span>
          <span className={classes.orderMeta}>
            <span>{orderStatusLabel(order.status, t)}</span>
            <time dateTime={order.createdAt}>{formatDate(order.createdAt)}</time>
          </span>
          <span className={classes.orderView}>{t('support.thread.viewOrder')}</span>
        </Link>
      ) : null}

      <div className={classes.log} role="log" aria-label={detail.subject}>
        {items.map((item, n) => {
          if (item.kind === 'event') {
            return (
              <p key={item.key} className={classes.event}>
                <span>{t(EVENT_LABEL[item.event.type])}</span>
                <time dateTime={item.event.at}>{formatDateTime(item.event.at)}</time>
              </p>
            );
          }
          const prev = items[n - 1];
          const first = !prev || prev.kind !== 'message' || prev.message.fromSupport !== item.message.fromSupport;
          return (
            <MessageBubble
              key={item.key}
              message={item.message}
              showAuthor={first}
              canRetry={detail.canReply}
              onRetry={onRetry}
              onOpenPhoto={setPhoto}
            />
          );
        })}
      </div>

      <div ref={foot} className={classes.foot}>
        {newMessage ? (
          <button type="button" className={classes.pill} onClick={() => scrollToEnd(true)}>
            {t('support.thread.newMessage')}
          </button>
        ) : null}
        {detail.canReply ? (
          <>
            {closed ? <p className={classes.note}>{t('support.thread.closedNote')}</p> : null}
            <Composer initialBody={seed} onSend={onSend} onFocus={() => scrollToEnd(true)} onUnsent={setUnsent} />
          </>
        ) : (
          <div className={classes.expired}>
            <p className={classes.expiredText}>{t('support.thread.expired')}</p>
            {support?.enabled !== false ? (
              <Button component={Link} to={newTicketTo} state={carried ? { body: carried } : undefined} size="md" className={classes.newTicket}>
                {t('support.thread.newTicket')}
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <PhotoLightbox src={photo} onClose={() => setPhoto(null)} />
    </div>
  );
}

/**
 * One ticket's conversation, a chat: the subject and where it stands, the order it is about (pinned under the
 * header), the messages and the ticket's own events in time order, and the reply box held at the foot of the phone
 * above the keyboard. A ticket closed for longer than its reopen window can no longer take replies: the box gives way
 * to opening a new ticket.
 */
export function TicketPage() {
  const { t } = useText();
  const { id: param } = useParams();
  const id = param && /^\d+$/.test(param) ? Number(param) : undefined;
  const ticket = useTicket(id);
  // Text carried from a ticket that could no longer take it (via the new-ticket page, which found this one open for
  // the same order). Read once and then dropped from the history entry, so a reload or a step back does not seed it again.
  const location = useLocation();
  const navigate = useNavigate();
  const [seed] = useState(() => {
    const body = (location.state as { body?: unknown } | null)?.body;
    return typeof body === 'string' ? body : '';
  });
  useEffect(() => {
    if (seed) void navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  // A failed poll keeps the conversation on screen; only a ticket that never loaded is an error page.
  if (id === undefined || (ticket.isError && !ticket.data)) {
    const missing = id === undefined || (ticket.error instanceof ApiError && ticket.error.status === 404);
    return (
      <div className={`${classes.gone} ${FADE}`}>
        <p className={classes.goneText} role={missing ? undefined : 'alert'}>
          {missing ? t('support.thread.notFound') : errorMessage(ticket.error, t('errors.requestFailed'))}
        </p>
        <Link to="/support" className={classes.goneBack}>{t('support.new.back')}</Link>
      </div>
    );
  }
  if (!ticket.data) return <PageSkeleton inline />;
  return <Conversation key={id} id={id} detail={ticket.data} seed={seed} />;
}
