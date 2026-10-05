import { useEffect, useRef, useState } from 'react';
import { Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { cancelOrder, OrderNotCancellableError } from '@/api/orders.ts';
import { cancelView } from '@/features/order-status/cancel-state.ts';
import { SupportLinks } from '@/features/order-status/SupportLinks.tsx';
import { useText } from '@/text/runtime.tsx';
import type { CancelBlockedBy } from '@/types/public-order.ts';
import classes from '@/features/order-status/OrderStatus.module.css';

export interface CancelOrderProps {
  reference: string;
  /** Both flags are absent on a backend that predates customer cancel: the control then renders nothing. */
  canCancel: boolean | undefined;
  blockedBy: CancelBlockedBy | null | undefined;
  /** Called after a cancel and after a refusal, so the caller refetches the order; says which of the two it was. */
  onCancelled?: (outcome: 'cancelled' | 'refused') => void;
}

type Refusal = 'order.cancel.refusedPaid' | 'order.cancel.refusedInFlight' | 'order.cancel.refusedGone' | 'order.cancel.failed';

const REFUSAL: Record<OrderNotCancellableError['reason'], Refusal> = {
  paid: 'order.cancel.refusedPaid',
  bank_transfer: 'order.cancel.refusedInFlight',
  crypto_submitted: 'order.cancel.refusedInFlight',
  not_pending: 'order.cancel.refusedGone',
};

/**
 * "Cancel order" for an unpaid order: a confirmation dialog that only its two buttons can close,
 * or, when money may already be on its way, a pointer to the shop instead.
 */
export function CancelOrder({ reference, canCancel, blockedBy, onCancelled }: CancelOrderProps) {
  const { t } = useText();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<Refusal | null>(null);
  const busy = useRef(false);

  const view = cancelView(canCancel, blockedBy);

  // The flags can flip under an open dialog (paid in another tab, a transfer or txid now on its way). The dialog
  // closes rather than offering a cancel the backend would refuse, and the page says why.
  useEffect(() => {
    if (!open || view === 'button') return;
    setOpen(false);
    if (view === 'none') setMessage(blockedBy === 'paid' ? 'order.cancel.refusedPaid' : 'order.cancel.refusedGone');
  }, [open, view, blockedBy]);

  // Stays mounted while the dialog is open, and while a refusal or failure is still being said: the refetch after
  // a refusal usually hides the control, and this component is what carries the message.
  if (view === 'none' && !message && !open) return null;

  const close = () => setOpen(false);

  const confirm = async () => {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    setMessage(null);
    try {
      await cancelOrder(reference);
      setDone(true);
      setOpen(false);
      notifications.show({ message: t('order.cancel.done', { reference }) });
      onCancelled?.('cancelled');
    } catch (err) {
      if (err instanceof OrderNotCancellableError) {
        const refusal = REFUSAL[err.reason];
        setMessage(refusal);
        // Also a notification: it survives the control unmounting when the refetch that follows hides it.
        notifications.show({ message: t(refusal) });
        close();
        onCancelled?.('refused');
      } else {
        setMessage('order.cancel.failed');
      }
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };

  return (
    <div className={classes.cancelBox} data-sf-part="cancel">
      {view === 'contact' ? (
        <>
          <p className={classes.cancelText}>{t('order.cancel.contact')}</p>
          <SupportLinks />
        </>
      ) : null}
      {view === 'button' && !done ? (
        <button
          type="button"
          className={classes.cancelAction}
          aria-haspopup="dialog"
          onClick={() => { setMessage(null); setOpen(true); }}
        >
          {t('order.cancel.action')}
        </button>
      ) : null}
      <Modal
        opened={open && view === 'button'}
        onClose={() => { if (!working) close(); }}
        title={t('order.cancel.confirmTitle', { reference })}
        centered
        size="md"
        radius="var(--mantine-radius-default)"
        withCloseButton={false}
        closeOnClickOutside={false}
        closeOnEscape={!working}
        returnFocus
        classNames={{ content: classes.cancelDialog, header: classes.cancelHeader, title: classes.cancelDialogTitle }}
      >
        <p className={classes.cancelDialogText}>{t('order.cancel.confirmBody')}</p>
        {message === 'order.cancel.failed' ? <p className={classes.cancelError} role="alert">{t(message)}</p> : null}
        <div className={classes.cancelButtons}>
          <button type="button" data-autofocus className={classes.cancelKeep} data-sf-part="button" data-variant="filled" disabled={working} onClick={close}>
            {t('order.cancel.keep')}
          </button>
          <button type="button" className={classes.cancelConfirm} aria-disabled={working} onClick={() => void confirm()}>
            {working ? t('order.cancel.working') : t('order.cancel.confirm')}
          </button>
        </div>
      </Modal>
      {/* A refusal is said on the page too; a plain failure is said inside the dialog, where the customer can retry. */}
      <p className={classes.cancelLive} aria-live="polite">{message && message !== 'order.cancel.failed' ? t(message) : ''}</p>
    </div>
  );
}
