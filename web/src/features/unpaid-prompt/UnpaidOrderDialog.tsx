import { Modal } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Money } from '@/components/Money.tsx';
import { CancelOrder } from '@/features/order-status/CancelOrder.tsx';
import { invalidateAfterCancel } from '@/features/order-status/invalidate-after-cancel.ts';
import type { PromptOrder } from '@/features/unpaid-prompt/rules.ts';
import { useText } from '@/text/runtime.tsx';
import orderClasses from '@/features/order-status/OrderStatus.module.css';
import classes from '@/features/unpaid-prompt/UnpaidOrderPrompt.module.css';

export interface UnpaidOrderDialogProps {
  order: PromptOrder;
  more: boolean;
  onLater: () => void;
  onPay: () => void;
  onCancelled: () => void;
}

/**
 * The pop-up itself, in its own chunk: the Modal, the cancel control and the order page's stylesheet load only
 * for a visitor who actually has an unpaid order, never with the shop's first paint.
 */
export default function UnpaidOrderDialog({ order, more, onLater, onPay, onCancelled }: UnpaidOrderDialogProps) {
  const queryClient = useQueryClient();
  const { t } = useText();

  return (
    <Modal
      opened
      onClose={onLater}
      title={t('order.prompt.title')}
      centered
      size="sm"
      radius="var(--mantine-radius-default)"
      closeButtonProps={{ 'aria-label': t('common.actions.close') }}
      classNames={{ content: classes.content, header: classes.header, title: classes.title }}
    >
      <p className={classes.lede}>{t('order.prompt.body', { reference: order.reference })}</p>
      <p className={classes.amount}>
        <span className={classes.amountLabel}>{t('order.prompt.amount')}</span>
        <span className={classes.amountValue}><Money amount={order.amount} /></span>
      </p>
      <div className={classes.actions}>
        <button type="button" data-autofocus className={orderClasses.cta} onClick={onPay}>{t('order.prompt.pay')}</button>
        <CancelOrder
          key={order.reference}
          reference={order.reference}
          accessKey={order.accessKey}
          viaLink={order.viaLink}
          canCancel={order.canCancel}
          blockedBy={order.cancelBlockedBy}
          onCancelled={() => {
            onCancelled();
            invalidateAfterCancel(queryClient, order.reference, order.accessKey);
          }}
        />
        <button type="button" className={`${orderClasses.ghost} ${classes.later}`} onClick={onLater}>{t('order.prompt.later')}</button>
      </div>
      {more ? (
        <Link to="/account/orders" className={classes.more} onClick={onLater}>{t('order.prompt.more')}</Link>
      ) : null}
    </Modal>
  );
}
