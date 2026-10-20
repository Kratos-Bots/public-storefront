import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, CloseButton, FileButton, SegmentedControl, Textarea, TextInput } from '@mantine/core';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { Money } from '@/components/Money.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { StatusPill } from '@/features/account/StatusPill.tsx';
import { useOrders } from '@/features/account/queries.ts';
import { orderStatusLabel, orderStatusTone } from '@/features/order-status/status.ts';
import { MAX_PHOTOS, PHOTO_TYPES, usePhotos } from '@/features/support/photos.ts';
import { useCreateTicket, useTicketForOrder } from '@/features/support/queries.ts';
import { errorMessage } from '@/lib/errors.ts';
import { formatDate } from '@/lib/format.ts';
import { FADE } from '@/lib/motion.ts';
import { useText } from '@/text/runtime.tsx';
import type { OrderSummary } from '@/types/orders.ts';
import page from '@/features/support/HelpPage.module.css';
import classes from '@/features/support/NewTicketPage.module.css';

const MAX_SUBJECT = 120;
const MAX_BODY = 4000;

type Mode = 'order' | 'other';

function PaperclipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.3 3.3 0 014.7 4.7l-8.6 8.6a1.7 1.7 0 01-2.4-2.4l7.9-7.9" />
    </svg>
  );
}

/** One order the ticket can be about: reference, when, how much, and where it stands. A radio, tapped anywhere. */
function OrderOption({ order, checked, onPick }: { order: Pick<OrderSummary, 'reference'> & Partial<OrderSummary>; checked: boolean; onPick: () => void }) {
  const { t } = useText();
  return (
    <li role="none">
      <button type="button" role="radio" aria-checked={checked} className={classes.order} onClick={onPick}>
        <span className={classes.tick} aria-hidden="true" />
        <span className={classes.ref}>{order.reference}</span>
        {order.status ? (
          <span className={classes.orderStatus}>
            <StatusPill tone={orderStatusTone(order.status)}>{orderStatusLabel(order.status, t)}</StatusPill>
          </span>
        ) : null}
        {order.createdAt ? (
          <span className={classes.meta}>
            {formatDate(order.createdAt)}
            {order.totalAmount !== undefined ? <> &middot; <Money amount={order.totalAmount} /></> : null}
          </span>
        ) : null}
      </button>
    </li>
  );
}

function NewTicketForm({ wanted }: { wanted: string | null }) {
  const { t } = useText();
  const navigate = useNavigate();
  const orders = useOrders();
  const rows = orders.data?.pages.flatMap((p) => p.data) ?? [];
  const create = useCreateTicket();
  const { photos, problem, add, remove } = usePhotos();
  const resetFile = useRef<() => void>(null);

  const [chosenMode, setMode] = useState<Mode | null>(null);
  // Until the customer picks, a ticket is about an order whenever they have one (or arrived from one).
  const mode: Mode = chosenMode ?? (wanted || orders.isPending || rows.length > 0 ? 'order' : 'other');
  const [selected, setSelected] = useState<string | null>(wanted);
  const [typedSubject, setSubject] = useState<string | null>(null);
  // Text carried over from a conversation that could no longer take it (see TicketPage).
  const carried = (useLocation().state as { body?: unknown } | null)?.body;
  const [body, setBody] = useState(() => (typeof carried === 'string' ? carried.slice(0, MAX_BODY) : ''));

  const orderRef = mode === 'order' ? selected : null;
  // The subject follows the chosen order until the customer writes their own.
  const subject = typedSubject ?? (orderRef ? t('support.new.orderSubject', { reference: orderRef }) : '');
  const subjectOk = subject.trim().length > 0 && subject.trim().length <= MAX_SUBJECT;
  const bodyOk = body.trim().length <= MAX_BODY && (body.trim().length > 0 || photos.length > 0);
  const valid = subjectOk && bodyOk && (mode === 'other' || orderRef !== null);

  // An order from a link that is not on the first page still shows, at the top, as the chosen one.
  const pinned = wanted && !rows.some((o) => o.reference === wanted) ? [{ reference: wanted }] : [];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || create.isPending) return;
    create.mutate(
      { subject: subject.trim(), body: body.trim(), orderReference: orderRef ?? undefined, files: photos.map((p) => p.file) },
      { onSuccess: (ticket) => { void navigate(`/support/tickets/${ticket.id}`, { replace: true }); } },
    );
  };

  return (
    <form className={classes.form} onSubmit={submit} noValidate>
      <SegmentedControl
        fullWidth
        size="md"
        className={classes.segment}
        value={mode}
        onChange={(v) => setMode(v as Mode)}
        data={[
          { value: 'order', label: t('support.new.aboutOrder') },
          { value: 'other', label: t('support.new.other') },
        ]}
      />

      {mode === 'order' ? (
        <section className={classes.field}>
          <h2 id="new-ticket-order" className={classes.label}>{t('support.new.whichOrder')}</h2>
          {orders.isPending ? (
            <div className={classes.placeholder} aria-hidden="true" />
          ) : rows.length === 0 && pinned.length === 0 ? (
            <p className={classes.quiet}>{orders.isError ? t('errors.requestFailed') : t('account.orders.emptyTitle')}</p>
          ) : (
            <>
              <ul className={classes.orders} role="radiogroup" aria-labelledby="new-ticket-order">
                {[...pinned, ...rows].map((o) => (
                  <OrderOption key={o.reference} order={o} checked={selected === o.reference} onPick={() => setSelected(o.reference)} />
                ))}
              </ul>
              {orders.hasNextPage ? (
                <Button
                  variant="subtle"
                  size="sm"
                  className={classes.older}
                  loading={orders.isFetchingNextPage}
                  onClick={() => { void orders.fetchNextPage(); }}
                >
                  {t('support.new.moreOrders')}
                </Button>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      <TextInput
        size="md"
        label={t('support.new.subject')}
        value={subject}
        maxLength={MAX_SUBJECT}
        onChange={(e) => setSubject(e.currentTarget.value)}
        classNames={{ label: classes.label }}
      />

      <Textarea
        size="md"
        label={t('support.new.message')}
        value={body}
        maxLength={MAX_BODY}
        autosize
        minRows={4}
        maxRows={12}
        onChange={(e) => setBody(e.currentTarget.value)}
        classNames={{ label: classes.label }}
      />

      <div className={classes.photosField}>
        {photos.length > 0 ? (
          <ul className={classes.photos}>
            {photos.map((p) => (
              <li key={p.key} className={classes.photo}>
                <img src={p.url} alt="" className={classes.thumb} />
                <CloseButton
                  size="sm"
                  radius="xl"
                  className={classes.remove}
                  aria-label={t('support.new.removePhoto')}
                  onClick={() => remove(p.key)}
                />
              </li>
            ))}
          </ul>
        ) : null}
        <div className={classes.attach}>
          <FileButton
            onChange={(files) => { void add(files); resetFile.current?.(); }}
            accept={PHOTO_TYPES.join(',')}
            multiple
            resetRef={resetFile}
          >
            {(props) => (
              <Button {...props} variant="subtle" size="sm" leftSection={<PaperclipIcon />} disabled={photos.length >= MAX_PHOTOS}>
                {t('support.new.addPhotos')}
              </Button>
            )}
          </FileButton>
          <span className={classes.hint}>{t('support.new.photoLimit', { max: MAX_PHOTOS })}</span>
        </div>
        {problem ? (
          <p className={classes.error} role="alert">
            {problem === 'tooMany' ? t('support.photo.tooMany', { max: MAX_PHOTOS }) : t('support.photo.invalid')}
          </p>
        ) : null}
      </div>

      {create.isError ? <p className={classes.error} role="alert">{errorMessage(create.error)}</p> : null}

      <Button type="submit" size="md" fullWidth className={classes.send} disabled={!valid} loading={create.isPending}>
        {t('support.new.send')}
      </Button>
    </form>
  );
}

/**
 * Opening a ticket: about one of the customer's orders (the default when they have any) or about something else, a
 * subject, a message and up to four photos. Arriving from an order (`?order=REF`) that already has an open ticket goes
 * straight to that conversation instead; otherwise that order is chosen and names the subject.
 */
export function NewTicketPage() {
  const { t } = useText();
  const { support } = useSettings();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Text carried over from a conversation that could no longer take it (see TicketPage): it follows a redirect too.
  const carried = (useLocation().state as { body?: unknown } | null)?.body;
  const enabled = support?.enabled === true;
  const wanted = params.get('order')?.trim() || null;

  const existing = useTicketForOrder(enabled ? wanted : null);
  // Only an answer fetched for this visit counts: a remembered id may be a ticket closed since.
  const fresh = existing.isFetchedAfterMount || existing.isError;
  // A failed check answers nothing: `data` may still hold an id cached before it.
  const existingId = fresh && !existing.isError ? existing.data ?? null : null;
  useEffect(() => {
    if (existingId !== null) {
      void navigate(`/support/tickets/${existingId}`, { replace: true, state: typeof carried === 'string' && carried ? { body: carried } : undefined });
    }
  }, [existingId, navigate, carried]);

  if (enabled && wanted && (!fresh || existingId !== null)) return <PageSkeleton inline />;

  return (
    <div className={`${page.page} ${FADE}`}>
      <header className={page.masthead}>
        <h1 className={page.title}>{t('support.new.title')}</h1>
      </header>
      {enabled ? (
        <NewTicketForm wanted={wanted} />
      ) : (
        <div className={page.action}>
          <p className={page.note}>{t('support.new.disabled')}</p>
          <Link to="/help" className={classes.back}>{t('support.new.back')}</Link>
        </div>
      )}
    </div>
  );
}
