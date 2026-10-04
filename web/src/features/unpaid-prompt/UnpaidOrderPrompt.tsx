import { useState } from 'react';
import { Modal } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { Money } from '@/components/Money.tsx';
import { CancelOrder } from '@/features/order-status/CancelOrder.tsx';
import { snooze, useUnpaidOrder } from '@/features/unpaid-prompt/useUnpaidOrder.ts';
import { useText } from '@/text/runtime.tsx';
import orderClasses from '@/features/order-status/OrderStatus.module.css';
import classes from '@/features/unpaid-prompt/UnpaidOrderPrompt.module.css';

/**
 * "You have an unpaid order": once per visit, over whatever the customer was doing. Complete payment, Cancel
 * (or the contact line when money may be on its way), or Not now. It mounts its Modal only when there is an
 * order to show, so every page without one renders exactly what it did before.
 */
export function UnpaidOrderPrompt() {
  const { order, more } = useUnpaidOrder();
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useText();

  if (!order || dismissed) return null;

  const later = () => {
    snooze();
    setDismissed(true);
  };
  const pay = () => {
    setDismissed(true);
    navigate(order.payPath);
  };
  const cancelled = () => {
    setDismissed(true);
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
    void queryClient.invalidateQueries({ queryKey: ['unpaid-prompt'] });
  };

  return (
    <Modal
      opened
      onClose={later}
      title={t('order.prompt.title')}
      centered
      size="sm"
      radius="var(--mantine-radius-default)"
      classNames={{ content: classes.content, header: classes.header, title: classes.title }}
    >
      <p className={classes.lede}>{t('order.prompt.body', { reference: order.reference })}</p>
      <p className={classes.amount}>
        <span className={classes.amountLabel}>{t('order.prompt.amount')}</span>
        <span className={classes.amountValue}><Money amount={order.amount} /></span>
      </p>
      <div className={classes.actions}>
        <button type="button" className={orderClasses.cta} onClick={pay}>{t('order.prompt.pay')}</button>
        <CancelOrder
          key={order.reference}
          reference={order.reference}
          accessKey={order.accessKey}
          viaLink={order.viaLink}
          canCancel={order.canCancel}
          blockedBy={order.cancelBlockedBy}
          onCancelled={cancelled}
        />
        <button type="button" className={`${orderClasses.ghost} ${classes.later}`} onClick={later}>{t('order.prompt.later')}</button>
      </div>
      {more ? (
        <Link to="/account/orders" className={classes.more} onClick={later}>{t('order.prompt.more')}</Link>
      ) : null}
    </Modal>
  );
}
