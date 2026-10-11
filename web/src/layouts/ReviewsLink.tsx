import { Link } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { reviewSettingsOf } from '@/features/reviews/settings.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/layouts/ReviewsLink.module.css';

/**
 * The way to the reviews page for everyone, in every layout: a quiet line under the page, drawn by the three frames
 * (the web app layout has no footer to carry it, and an owner-composed shell may have dropped the footer block).
 * Only while the shop has reviews on.
 */
export function ReviewsLink() {
  const settings = useSettings();
  const { t } = useText();
  if (!reviewSettingsOf(settings).enabled) return null;
  return (
    <div className={classes.strip}>
      <Link to="/reviews" className={classes.link}>{t('reviews.link')}</Link>
    </div>
  );
}
