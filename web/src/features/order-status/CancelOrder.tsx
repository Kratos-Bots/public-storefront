import { useEffect, useId, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { cancelOrder } from '@/api/orders.ts';
import { cancelPublicOrder, OrderNotCancellableError } from '@/api/public-order.ts';
import type { StyleAttrs } from '@/builder/define.ts';
import { cancelView } from '@/features/order-status/cancel-state.ts';
import { SupportLinks } from '@/features/order-status/SupportLinks.tsx';
import { useText } from '@/text/runtime.tsx';
import type { CancelBlockedBy } from '@/types/public-order.ts';
import classes from '@/features/order-status/OrderStatus.module.css';

export interface CancelOrderProps {
  reference: string;
  accessKey?: string | null;
  /** Cancel through the order's own link (`cancelPublicOrder`) rather than the signed-in session. */
  viaLink?: boolean;
  /** Both flags are absent on a backend that predates customer cancel: the control then renders nothing. */
  canCancel: boolean | undefined;
  blockedBy: CancelBlockedBy | null | undefined;
  /** Called after a cancel and after a refusal, so the caller refetches the order. */
  onCancelled?: () => void;
  rootAttrs?: StyleAttrs;
}

type Refusal = 'order.cancel.refusedPaid' | 'order.cancel.refusedInFlight' | 'order.cancel.refusedGone' | 'order.cancel.failed';

const REFUSAL: Record<OrderNotCancellableError['reason'], Refusal> = {
  paid: 'order.cancel.refusedPaid',
  bank_transfer: 'order.cancel.refusedInFlight',
  crypto_submitted: 'order.cancel.refusedInFlight',
  not_pending: 'order.cancel.refusedGone',
};

/**
 * "Cancel order" for an unpaid order: an inline confirmation (never `confirm()`),
 * or, when money may already be on its way, a pointer to the shop instead.
 */
export function CancelOrder({ reference, accessKey, viaLink, canCancel, blockedBy, onCancelled, rootAttrs }: CancelOrderProps) {
  const { t } = useText();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<Refusal | null>(null);
  const titleId = useId();
  const busy = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (open) keep.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      trigger.current?.focus();
    }
  }, [open]);

  // Without its key there is no way to cancel through a link: a caller bug, so offer nothing.
  const view = viaLink && !accessKey ? 'none' : cancelView(canCancel, blockedBy);
  // A refusal or failure outlives the props that change under it (the refetch after a refusal usually hides the control).
  if (view === 'none' && !message) return null;

  const close = () => {
    returnFocus.current = true;
    setOpen(false);
  };

  const confirm = async () => {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    setMessage(null);
    try {
      if (viaLink && accessKey) await cancelPublicOrder(reference, accessKey);
      else await cancelOrder(reference);
      setDone(true);
      setOpen(false);
      notifications.show({ message: t('order.cancel.done', { reference }) });
      onCancelled?.();
    } catch (err) {
      if (err instanceof OrderNotCancellableError) {
        const refusal = REFUSAL[err.reason];
        setMessage(refusal);
        // Also a notification: it survives the control unmounting (the pop-up closes itself after a refusal).
        notifications.show({ message: t(refusal) });
        close();
        onCancelled?.();
      } else {
        setMessage('order.cancel.failed');
      }
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };

  return (
    <div className={classes.cancelBox} data-sf-part="cancel" {...rootAttrs}>
      {view === 'contact' ? (
        <>
          <p className={classes.cancelText}>{t('order.cancel.contact')}</p>
          <SupportLinks />
        </>
      ) : null}
      {view === 'button' && !done ? (
        <button
          ref={trigger}
          type="button"
          className={classes.cancelAction}
          aria-expanded={open}
          onClick={() => { setMessage(null); setOpen(true); }}
        >
          {t('order.cancel.action')}
        </button>
      ) : null}
      {view === 'button' && open ? (
        <div
          className={classes.cancelPanel}
          role="group"
          aria-labelledby={titleId}
          onKeyDown={(e) => { if (e.key === 'Escape' && !working) close(); }}
        >
          <p id={titleId} className={classes.cancelTitle}>{t('order.cancel.confirmTitle', { reference })}</p>
          <p className={classes.cancelText}>{t('order.cancel.confirmBody')}</p>
          <div className={classes.cancelButtons}>
            <button
              type="button"
              data-mantine-stop-propagation
              className={classes.cancelConfirm}
              aria-disabled={working}
              onClick={() => void confirm()}
            >
              {working ? t('order.cancel.working') : t('order.cancel.confirm')}
            </button>
            <button ref={keep} type="button" data-mantine-stop-propagation className={classes.ghost} disabled={working} onClick={close}>
              {t('order.cancel.keep')}
            </button>
          </div>
        </div>
      ) : null}
      <p className={classes.cancelLive} aria-live="polite">{message ? t(message) : ''}</p>
    </div>
  );
}
