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
  if (query.isError) {
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
            <span className={classes.outOf} aria-hidden>/ 5</span>
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
          {query.hasNextPage ? (
            <div className={classes.more}>
              <Button variant="default" size="sm" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                {t('reviews.page.loadMore')}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
