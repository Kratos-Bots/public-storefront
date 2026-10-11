import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { ApiError } from '@/lib/errors.ts';
import { formatDate } from '@/lib/format.ts';
import { OrderFamily } from '@/builder/family-order.ts';
import type { PartViewProps } from '@/builder/parts.ts';
import { refreshAfterReview, useSubmitReview } from '@/features/reviews/queries.ts';
import { useReviewSettings } from '@/features/reviews/settings.ts';
import { StarPicker, StarsReadOnly } from '@/features/reviews/Stars.tsx';
import { useText } from '@/text/runtime.tsx';
import type { OrderReviewRecord } from '@/types/reviews.ts';
import orderClasses from '@/features/order-status/OrderStatus.module.css';
import fieldClasses from '@/features/checkout/Fields.module.css';
import cardClasses from '@/features/account/OrderDetail.module.css';
import classes from '@/features/account/OrderReview.module.css';

/** The backend's wording for a second review of the same order, which can arrive as a 422 as well as a 409. */
const DUPLICATE = /already (?:exists|reviewed)/i;

const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * `?review=1`: the link a notification opens. When the form is there, bring it into view and put focus on
 * the rating; either way the parameter goes, replacing the entry so Back does not step through it again.
 * Runs when the part mounts, which is once the order has loaded.
 */
function useReviewDeepLink(canReview: boolean, groupRef: React.RefObject<HTMLDivElement | null>, cardRef: React.RefObject<HTMLElement | null>) {
  const [params, setParams] = useSearchParams();
  const wanted = params.get('review') === '1';
  useEffect(() => {
    if (!wanted) return;
    if (canReview) {
      cardRef.current?.scrollIntoView?.({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      groupRef.current?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus({ preventScroll: true });
    }
    const next = new URLSearchParams(params);
    next.delete('review');
    setParams(next, { replace: true });
  }, [wanted, canReview, params, setParams, groupRef, cardRef]);
}

/** What the shopper sent, read-only, with where it stands. */
function SentReview({ review, thanks }: { review: OrderReviewRecord; thanks: boolean }) {
  const { t } = useText();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // The form they just used is gone: keep a keyboard user in the same place.
    if (thanks) headingRef.current?.focus({ preventScroll: true });
  }, [thanks]);
  const status =
    review.status === 'pending' ? t('reviews.sent.pending') : review.status === 'approved' ? t('reviews.sent.approved') : t('reviews.sent.submitted');
  return (
    <>
      <div className={cardClasses.cardHead}>
        <h2 className={cardClasses.cardTitle} tabIndex={-1} ref={headingRef}>{t('reviews.sent.title')}</h2>
        <span className={cardClasses.cardNote}>{t('reviews.sent.on', { date: formatDate(review.createdAt) })}</span>
      </div>
      <StarsReadOnly value={review.rating} />
      <p className={review.comment ? classes.quote : classes.quoteEmpty}>{review.comment ?? t('reviews.sent.noComment')}</p>
      <p className={classes.status} role="status" data-status={review.status}>
        {thanks ? `${t('reviews.form.thanks')} ` : ''}{status}
      </p>
    </>
  );
}

function ReviewForm({ reference, groupRef, onSent }: { reference: string; groupRef: React.RefObject<HTMLDivElement | null>; onSent: (r: OrderReviewRecord) => void }) {
  const { t } = useText();
  const { maxLength } = useReviewSettings();
  const client = useQueryClient();
  const submit = useSubmitReview(reference);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const commentId = useId();
  const counterId = useId();
  const errorId = useId();
  const hintId = useId();
  const limit = maxLength > 0 ? maxLength : 1000;

  const send = (e: FormEvent) => {
    e.preventDefault();
    if (rating < 1 || submit.isPending) return;
    setError(null);
    const text = comment.trim();
    submit.mutate(
      { rating, ...(text ? { comment: text } : {}) },
      {
        onSuccess: (res) => onSent(res.review),
        onError: (err) => {
          // A double submit: the order already has its review. Reading the order again swaps the form for it.
          if (err instanceof ApiError && (err.status === 409 || (err.status === 422 && DUPLICATE.test(err.message)))) {
            setError(t('reviews.form.alreadyReviewed'));
            refreshAfterReview(client, reference);
            return;
          }
          // What was typed stays in the fields in every failure case.
          setError(err instanceof ApiError && err.status !== 0 && err.message ? err.message : t('reviews.form.networkError'));
        },
      },
    );
  };

  const over = comment.length > limit;
  return (
    <form onSubmit={send} noValidate>
      <div className={cardClasses.cardHead}>
        <h2 className={cardClasses.cardTitle}>{t('reviews.form.title')}</h2>
      </div>
      <p className={classes.lede}>{t('reviews.form.lede')}</p>

      <div className={classes.rating}>
        <StarPicker
          value={rating}
          onChange={setRating}
          label={t('reviews.form.rating')}
          disabled={submit.isPending}
          groupRef={groupRef}
        />
      </div>

      <div className={fieldClasses.field}>
        <label className={fieldClasses.label} htmlFor={commentId}>
          {t('reviews.form.comment')}
          <span className={fieldClasses.optional}>{t('reviews.form.optional')}</span>
        </label>
        <textarea
          id={commentId}
          className={`${fieldClasses.input} ${fieldClasses.textarea}`}
          data-sf-part="input"
          rows={4}
          value={comment}
          maxLength={limit}
          placeholder={t('reviews.form.placeholder')}
          disabled={submit.isPending}
          onChange={(e) => setComment(e.currentTarget.value)}
          aria-describedby={counterId}
        />
        <p id={counterId} className={classes.counter} data-over={over ? 'true' : undefined}>
          {t('reviews.form.counter', { count: comment.length, max: limit })}
        </p>
      </div>

      {error ? <p id={errorId} className={classes.error} role="alert">{error}</p> : null}

      <button
        type="submit"
        className={orderClasses.cta}
        data-sf-part="button"
        data-variant="filled"
        disabled={rating < 1 || submit.isPending}
        aria-describedby={rating < 1 ? hintId : undefined}
      >
        {submit.isPending ? t('reviews.form.sending') : t('reviews.form.submit')}
      </button>
      {rating < 1 ? <p id={hintId} className={classes.hint}>{t('reviews.form.pickRating')}</p> : null}
    </form>
  );
}

/**
 * The order's review: the form while one can be left, the review itself once it has been, and nothing at all
 * otherwise (an order not yet delivered, reviews switched off, an older backend that sends no `review`).
 */
export function ReviewView({ styleAttrs }: PartViewProps) {
  const { order } = OrderFamily.useData();
  const state = order.review;
  const [sentFor, setSentFor] = useState<{ reference: string; review: OrderReviewRecord } | null>(null);
  const sent = sentFor?.reference === order.reference ? sentFor.review : null;
  const groupRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const shown = sent ?? state?.existing ?? null;
  const showForm = !shown && !!state?.canReview;
  useReviewDeepLink(showForm, groupRef, cardRef);

  if (!shown && !showForm) return null;
  return (
    <section
      ref={cardRef}
      className={`${cardClasses.card} ${classes.card}`}
      data-sf-part="card"
      data-review={shown ? 'sent' : 'form'}
      {...styleAttrs}
    >
      {shown ? <SentReview review={shown} thanks={!!sent} /> : <ReviewForm reference={order.reference} groupRef={groupRef} onSent={(review) => setSentFor({ reference: order.reference, review })} />}
    </section>
  );
}
