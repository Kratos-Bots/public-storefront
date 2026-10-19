import { useText } from '@/text/runtime.tsx';
import classes from '@/features/support/SupportPage.module.css';

/** Placeholder for the new-ticket form (task S3 builds it). */
export function NewTicketPage() {
  const { t } = useText();
  return (
    <div className={classes.page}>
      <header className={classes.masthead}>
        <h1 className={classes.title}>{t('support.new.title')}</h1>
      </header>
    </div>
  );
}
