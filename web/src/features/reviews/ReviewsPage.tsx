import { useEffect, useRef } from 'react';
import { Button } from '@mantine/core';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { NotFoundPage } from '@/features/NotFoundPage.tsx';
import { errorMessage } from '@/lib/errors.ts';
import { formatDate } from '@/lib/format.ts';
import { FADE } from '@/lib/motion.ts';
import { useReviews } from '@/features/reviews/queries.ts';
import { useReviewSettings } from '@/features/reviews/settings.ts';
import { StarsReadOnly } from '@/features/reviews/Stars.tsx';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/reviews/ReviewsPage.module.css';

/**
 * The shop's approved reviews, newest first, anonymous. It is a plain page inside the shell rather than a page-builder
 * document: a builder route key has to exist in the backend's page-set rules first. Off, it is the not-found page, as
 * every other feature that is switched off.
 */
export function ReviewsPage() {
  const { enabled } = useReviewSettings();
  if (!enabled) return <NotFoundPage />;
  return <ReviewsBody />;
}

function ReviewsBody() {
  const { t, tp, locale } = useText();
  const query = useReviews(true);

  if (query.isPending) {
    return (
      <>
        <h1 className={classes.srOnly}>{t('reviews.page.title')}</h1>
        <PageSkeleton inline />
      </>
    );
  }
  // A failed "Load more" also sets isError; with reviews already on screen that is not a failed page.
  if (query.isError && !query.data) {
    return (
      <EmptyState
        as="h1"
        title={t('reviews.page.loadFailedTitle')}
        description={`${errorMessage(query.error, t('reviews.page.loadFailedBody'))}`}
        action={<Button variant="default" size="sm" onClick={() => void query.refetch()}>{t('common.actions.tryAgain')}</Button>}
      />
    );
  }

  const first = query.data.pages[0]?.data;
  const stats = first?.stats ?? { average: null, count: 0 };
  const reviews = query.data.pages.flatMap((p) => p.data.reviews);
  const average = stats.average === null ? null : new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(stats.average);

  return (
    <div className={`${classes.page} ${FADE}`}>
      <header className={classes.masthead}>
        <h1 className={classes.title}>{t('reviews.page.title')}</h1>
        <p className={classes.lede}>{t('reviews.page.lede')}</p>
      </header>

      {stats.count > 0 && average !== null && stats.average !== null ? (
        <section className={classes.summary} aria-label={t('reviews.page.average')}>
          <p className={classes.figure}>
            <span className={classes.average}>{average}</span>
            <span className={classes.outOf} aria-hidden>{t('reviews.page.scale')}</span>
            <span className={classes.srOnly}>{t('reviews.page.averageValue', { average })}</span>
          </p>
          <div className={classes.summaryRest}>
            <StarsReadOnly value={stats.average} />
            <span className={classes.count}>{tp('reviews.page.count', stats.count)}</span>
          </div>
        </section>
      ) : null}

      {reviews.length === 0 ? (
        <EmptyState title={t('reviews.page.empty.title')} description={t('reviews.page.empty.body')} />
      ) : (
        <>
          <ul className={classes.list}>
            {reviews.map((review) => (
              <li key={review.id} className={classes.item}>
                <div className={classes.itemHead}>
                  <StarsReadOnly value={review.rating} size="sm" />
                  <time className={classes.date} dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
                </div>
                <p className={review.comment ? classes.comment : classes.noComment}>{review.comment ?? t('reviews.page.noComment')}</p>
              </li>
            ))}
          </ul>
          <MoreReviews query={query} />
        </>
      )}
    </div>
  );
}

/** How far below the viewport the end of the list may be before the next page is asked for. */
const NEAR_END = '400px';

/**
 * The end of the list: the next page loads by itself when a sentinel under the last review comes within 400px of the
 * viewport, one page at a time and never while a fetch is in flight. A failed page keeps the retry button (nothing
 * retries on its own, or a dead network would be asked in a loop). Without IntersectionObserver the button is
 * the way to the next page, as it was.
 */
function MoreReviews({ query }: { query: ReturnType<typeof useReviews> }) {
  const { t } = useText();
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = query;
  const pages = query.data?.pages.length ?? 0;
  const observed = typeof IntersectionObserver !== 'undefined';
  const watching = observed && hasNextPage && !isFetchingNextPage && !isFetchNextPageError;

  // A fresh observer after every page reports where the sentinel is straight away, so a page that did not push it out
  // of range is followed by the next one without the shopper scrolling.
  useEffect(() => {
    const el = sentinel.current;
    if (!watching || !el) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        void fetchNextPage();
      }
    }, { rootMargin: NEAR_END });
    observer.observe(el);
    return () => observer.disconnect();
  }, [watching, pages, fetchNextPage]);

  if (isFetchNextPageError) {
    return (
      <div className={classes.moreError} role="alert">
        <p>{errorMessage(query.error, t('reviews.page.loadMoreFailed'))}</p>
        <Button variant="default" size="sm" loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>
          {t('common.actions.tryAgain')}
        </Button>
      </div>
    );
  }
  if (!hasNextPage) return null;
  if (!observed) {
    return (
      <div className={classes.more}>
        <Button variant="default" size="sm" loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>
          {t('reviews.page.loadMore')}
        </Button>
      </div>
    );
  }
  return (
    <div ref={sentinel} className={classes.more} data-sf-part="reviews-sentinel">
      <p className={classes.loading} role="status" aria-live="polite">{isFetchingNextPage ? t('reviews.page.loadingMore') : ''}</p>
    </div>
  );
}
