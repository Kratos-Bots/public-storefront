import { Sheet } from '@/components/Sheet.tsx';
import { useSettings } from '@/app/settings.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/push/Push.module.css';

/** The Worker serves the app's icon at this path (proxied from the backend); it is the icon the Home Screen gets. */
const ICON_SRC = '/app-icon/192.png';

/**
 * iPhone and iPad only deliver web push to an app on the Home Screen, so a browser tab gets these steps
 * instead of the permission prompt: the app's icon and name, then what to tap.
 */
export function InstallGuideSheet({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t } = useText();
  const { brand } = useSettings();
  return (
    <Sheet
      opened={opened}
      onClose={onClose}
      label={t('account.notifications.install.title')}
      footer={
        <button type="button" className={`${classes.secondary} ${classes.guideClose}`} onClick={onClose}>
          {t('common.actions.close')}
        </button>
      }
    >
      <div className={classes.guide}>
        <img className={classes.guideIcon} src={ICON_SRC} alt="" width={64} height={64} />
        <p className={classes.guideName}>{brand.name}</p>
        <ul className={classes.steps}>
          <li className={classes.step}>{t('account.notifications.install.step1')}</li>
          <li className={classes.step}>{t('account.notifications.install.step2')}</li>
          <li className={classes.step}>{t('account.notifications.install.step3')}</li>
        </ul>
      </div>
    </Sheet>
  );
}
