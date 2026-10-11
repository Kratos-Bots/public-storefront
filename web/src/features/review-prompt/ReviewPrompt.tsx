import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router';
import type { ReviewPromptDialogProps } from '@/features/review-prompt/ReviewPromptDialog.tsx';
import { decideReminder, recordShown, shouldFetchReviewable } from '@/features/review-prompt/rules.ts';
import { readStored, writeStored } from '@/features/review-prompt/storage.ts';
import { useReminderInputs } from '@/features/review-prompt/useReviewReminder.ts';
import type { ReviewableOrder } from '@/types/reviews.ts';

// As the unpaid-order pop-up: the dialog (Modal and its stylesheet) is a separate chunk fetched only once there is
// something to show, and a failed fetch means no reminder this visit, never an error screen.
const nothing: ComponentType<ReviewPromptDialogProps> = () => null;
const ReviewPromptDialog = lazy((): Promise<{ default: ComponentType<ReviewPromptDialogProps> }> =>
  import('@/features/review-prompt/ReviewPromptDialog.tsx').catch(() => ({ default: nothing })));

// Once the reminder has been put in front of a customer, it does not come back in the same page load whichever button
// they used, and not even if storage is unavailable: a module variable dies with the document, as the unpaid prompt's does.
let shownFor: number | null = null;
/** Tests stand in for a page load. */
export const resetReminderForTests = () => { shownFor = null; };

/**
 * "How was your order?": a signed-in customer's delivered, unreviewed order, at most once every 24 hours per order
 * for the week the server allows, and never in a load where the unpaid-order pop-up has been in play. Renders nothing
 * unless there is an order to ask about; the shell part itself stays light.
 */
export function ReviewPrompt() {
  const inputs = useReminderInputs();
  const [current, setCurrent] = useState<ReviewableOrder | null>(null);
  const navigate = useNavigate();
  const { customerId } = inputs;

  // Deciding is an effect because showing writes: the time is stored the moment the dialog goes up, so a reload and
  // either button count as "shown".
  useEffect(() => {
    if (current) return;
    const now = Date.now();
    const due = decideReminder({ ...inputs, stored: readStored(), now, shownThisLoad: customerId !== null && shownFor === customerId });
    if (!due || customerId === null) return;
    shownFor = customerId;
    writeStored(recordShown(readStored(), customerId, due.reference, (inputs.reviewable ?? []).map((o) => o.reference), now));
    setCurrent(due);
  }, [current, inputs, customerId]);

  // The page moved somewhere it must not be (the order page, checkout), or the cart / sign-in opened: it is gone for this load.
  const stillOk = shouldFetchReviewable(inputs) && !inputs.cartOpen && !inputs.loginOpen;
  useEffect(() => {
    if (current && !stillOk) setCurrent(null);
  }, [current, stillOk]);

  if (!current || !stillOk) return null;

  const close = () => setCurrent(null);
  const review = () => {
    setCurrent(null);
    navigate(`/account/orders/${encodeURIComponent(current.reference)}?review=1`);
  };

  return (
    <Suspense fallback={null}>
      <ReviewPromptDialog reference={current.reference} onLater={close} onReview={review} />
    </Suspense>
  );
}
