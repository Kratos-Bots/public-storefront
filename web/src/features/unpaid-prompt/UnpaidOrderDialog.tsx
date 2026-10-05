import { Modal } from '@mantine/core';
import { Link } from 'react-router';
import { Money } from '@/components/Money.tsx';
import type { PromptOrder } from '@/features/unpaid-prompt/rules.ts';
import { useText } from '@/text/runtime.tsx';
import orderClasses from '@/features/order-status/OrderStatus.module.css';
import classes from '@/features/unpaid-prompt/UnpaidOrderPrompt.module.css';

export interface UnpaidOrderDialogProps {
  order: PromptOrder;
  more: boolean;
  onLater: () => void;
  onReview: () => void;
}

/**
 * The pop-up itself, in its own chunk: the Modal and the order page's stylesheet load only
 * for a visitor who actually has an unpaid order, never with the shop's first paint.
 */
export default function UnpaidOrderDialog({ order, more, onLater, onReview }: UnpaidOrderDialogProps) {
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
        <button type="button" data-autofocus className={orderClasses.cta} data-sf-part="button" data-variant="filled" onClick={onReview}>
          {t('order.prompt.review')}
        </button>
        <button type="button" className={classes.later} data-sf-part="button" data-variant="text" onClick={onLater}>{t('order.prompt.later')}</button>
      </div>
      {more ? (
        <Link to="/account/orders" className={classes.more} onClick={onLater}>{t('order.prompt.more')}</Link>
      ) : null}
    </Modal>
  );
}
