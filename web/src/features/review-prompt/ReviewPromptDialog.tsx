import { Modal } from '@mantine/core';
import { StarsDecor } from '@/features/reviews/Stars.tsx';
import { useText } from '@/text/runtime.tsx';
import orderClasses from '@/features/order-status/OrderStatus.module.css';
import unpaidClasses from '@/features/unpaid-prompt/UnpaidOrderPrompt.module.css';
import classes from '@/features/review-prompt/ReviewPrompt.module.css';

export interface ReviewPromptDialogProps {
  reference: string;
  onLater: () => void;
  onReview: () => void;
}

/**
 * The reminder itself, in its own chunk, dressed as the unpaid-order pop-up's sibling (same surface, title and
 * buttons) but dismissible: the close button, Escape and a tap outside all mean "Not now".
 */
export default function ReviewPromptDialog({ reference, onLater, onReview }: ReviewPromptDialogProps) {
  const { t } = useText();
  return (
    <Modal
      opened
      onClose={onLater}
      title={t('reviews.prompt.title')}
      centered
      size="sm"
      radius="var(--mantine-radius-default)"
      closeButtonProps={{ 'aria-label': t('reviews.prompt.close') }}
      classNames={{ content: unpaidClasses.content, header: unpaidClasses.header, title: unpaidClasses.title, close: classes.close }}
    >
      <div className={classes.stars}><StarsDecor /></div>
      <p className={unpaidClasses.lede} tabIndex={-1} data-autofocus>{t('reviews.prompt.body', { reference })}</p>
      <div className={unpaidClasses.actions}>
        <button type="button" className={orderClasses.cta} data-sf-part="button" data-variant="filled" onClick={onReview}>
          {t('reviews.prompt.review')}
        </button>
        <button type="button" className={unpaidClasses.later} data-sf-part="button" data-variant="text" onClick={onLater}>
          {t('reviews.prompt.later')}
        </button>
      </div>
    </Modal>
  );
}
