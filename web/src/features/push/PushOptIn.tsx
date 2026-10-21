import { useState, type ReactNode } from 'react';
import { useSettings } from '@/app/settings.ts';
import { InstallGuideSheet } from '@/features/push/InstallGuideSheet.tsx';
import { usePush } from '@/features/push/usePush.ts';
import { formatDate } from '@/lib/format.ts';
import { useText } from '@/text/runtime.tsx';
import type { PartViewProps } from '@/builder/parts.ts';
import account from '@/features/account/Account.module.css';
import classes from '@/features/push/Push.module.css';

type Push = ReturnType<typeof usePush>;

/**
 * What a "Turn on" tap does. On a phone browser that cannot receive push yet (iOS, not installed) it opens
 * the Home Screen guide; where push is ready it asks the browser (the call runs inside the tap, before any
 * other await, so the permission prompt still has its gesture). Resolves true once the browser took it.
 */
export function useTurnOn(push: Push): { turnOn: () => Promise<boolean>; failed: boolean; guide: ReactNode } {
  const [guideOpen, setGuideOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  const turnOn = async (): Promise<boolean> => {
    setFailed(false);
    if (push.availability === 'needs-install') {
      setGuideOpen(true);
      return false;
    }
    try {
      await push.enable();
      return true;
    } catch {
      setFailed(true);
      return false;
    }
  };

  return { turnOn, failed, guide: <InstallGuideSheet opened={guideOpen} onClose={() => setGuideOpen(false)} /> };
}

/**
 * The order-placed page's button. Nothing at all while push is unavailable here, the device is already
 * subscribed, or the browser has blocked notifications (the profile section explains that one).
 */
function PushOrderButton({ wrapperClassName, className, rootAttrs }: { wrapperClassName: string; className: string; rootAttrs?: PartViewProps['styleAttrs'] }) {
  const { t } = useText();
  const push = usePush();
  const { turnOn, guide } = useTurnOn(push);
  const offered = (push.availability === 'ready' || push.availability === 'needs-install') && push.settled && !push.subscribed;
  if (!offered) return null;
  return (
    <div className={wrapperClassName} {...rootAttrs}>
      <button type="button" className={className} data-sf-part="button" data-variant="filled" onClick={() => void turnOn()}>
        {t('payment.placed.notify')}
      </button>
      {guide}
    </div>
  );
}

/** The profile's Notifications section: the This device switch and the devices that receive updates. */
function NotificationsSection({ rootAttrs }: { rootAttrs?: PartViewProps['styleAttrs'] }) {
  const { t } = useText();
  const push = usePush();
  const { turnOn, failed, guide } = useTurnOn(push);
  const [busy, setBusy] = useState(false);
  if (push.availability === 'unavailable') return null;

  const denied = push.availability === 'denied';
  const toggle = async () => {
    setBusy(true);
    try {
      if (push.subscribed) await push.disable().catch(() => undefined);
      else await turnOn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={account.section} aria-label={t('account.notifications.aria')} {...rootAttrs}>
      <div className={account.sectionHead}>
        <h3 className={account.sectionTitle}>{t('account.notifications.title')}</h3>
      </div>
      <label className={classes.switchRow}>
        <span className={classes.switchLabel}>{t('account.notifications.thisDevice')}</span>
        <input
          type="checkbox"
          role="switch"
          className={classes.switch}
          checked={push.subscribed}
          disabled={busy || denied}
          onChange={() => void toggle()}
        />
      </label>
      {push.availability === 'needs-install' ? <p className={account.note}>{t('account.notifications.installNote')}</p> : null}
      {denied ? <p className={account.note}>{t('account.notifications.blocked')}</p> : null}
      {failed ? <p className={account.note} role="alert">{t('account.notifications.failed')}</p> : null}
      {push.devices.length > 0 ? (
        <ul className={classes.devices} aria-label={t('account.notifications.devices')}>
          {push.devices.map((d) => (
            <li key={d.id} className={classes.device}>
              <span className={classes.deviceName}>
                {d.deviceLabel}
                <span className={classes.deviceDate}>{formatDate(d.createdAt)}</span>
              </span>
              <button
                type="button"
                className={classes.remove}
                aria-label={t('account.notifications.removeNamed', { device: d.deviceLabel })}
                disabled={busy}
                onClick={() => void push.removeDevice(d.id).catch(() => undefined)}
              >
                {t('account.notifications.remove')}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {guide}
    </section>
  );
}

/** Push is configured for this shop (an older backend omits the field). Everything that reads the push state mounts only behind this, so a shop without push pays for none of it. */
function usePushConfigured(): boolean {
  return useSettings().push?.enabled === true;
}

/** The order-placed button, mounted only where the shop has push. */
export function PushOrderPart(props: { wrapperClassName: string; className: string; rootAttrs?: PartViewProps['styleAttrs'] }) {
  return usePushConfigured() ? <PushOrderButton {...props} /> : null;
}

/** The profile section, mounted only where the shop has push. */
export function NotificationsPart({ rootAttrs }: { rootAttrs?: PartViewProps['styleAttrs'] }) {
  return usePushConfigured() ? <NotificationsSection rootAttrs={rootAttrs} /> : null;
}
