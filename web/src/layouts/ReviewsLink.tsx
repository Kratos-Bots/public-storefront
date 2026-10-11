import { Link, useLocation } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { isPreviewMode } from '@/app/preview-listener.ts';
import { reviewSettingsOf } from '@/features/reviews/settings.ts';
import { promptAllowedOn } from '@/features/unpaid-prompt/rules.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/layouts/ReviewsLink.module.css';

/**
 * The way to the reviews page for everyone, in every layout: a quiet line under the page, drawn by the three frames
 * (the web app layout has no footer to carry it, and an owner-composed shell may have dropped the footer block).
 * Only while the shop has reviews on, and not where the visitor is paying, signing in or following a link for one
 * errand (the pages the pop-ups also keep out of: `promptAllowedOn`), nor in the page builder's canvas or previews,
 * whose exact preview mounts the same frames (builder/editor/ExactPreview.tsx, builder/runtime.tsx PuckShell).
 */
export function ReviewsLink() {
  const settings = useSettings();
  const { t } = useText();
  const { pathname } = useLocation();
  if (!reviewSettingsOf(settings).enabled || !promptAllowedOn(pathname) || isBuilderMode() || isPreviewMode()) return null;
  return (
    <div className={classes.strip}>
      <Link to="/reviews" className={classes.link}>{t('reviews.link')}</Link>
    </div>
  );
}
