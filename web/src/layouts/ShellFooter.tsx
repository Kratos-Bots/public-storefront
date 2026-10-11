import { Link } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { reviewSettingsOf } from '@/features/reviews/settings.ts';
import { Slot } from '@/templates/runtime.tsx';
import { useText } from '@/text/runtime.tsx';
import classes from '@/layouts/ShellFooter.module.css';

/** The template's Footer slot with what both shells hand it, then the link to the reviews page when the shop has reviews on. */
export function ShellFooter() {
  const settings = useSettings();
  const { brand, supportLinks } = settings;
  const { t } = useText();
  const hasChat = !!(brand.links.whatsapp || brand.links.telegram);
  const reviews = reviewSettingsOf(settings).enabled;
  return (
    <>
      <Slot name="Footer" supportLinks={supportLinks} hasChat={hasChat} />
      {reviews ? (
        <div className={classes.strip}>
          <Link to="/reviews" className={classes.link}>{t('reviews.link')}</Link>
        </div>
      ) : null}
    </>
  );
}
