import { lazy, Suspense, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router';
import type { UnpaidOrderDialogProps } from '@/features/unpaid-prompt/UnpaidOrderDialog.tsx';
import { dismissForThisLoad, useUnpaidOrder } from '@/features/unpaid-prompt/useUnpaidOrder.ts';

// The dialog (Modal, order-page stylesheet) is a separate chunk, fetched only once there is an order to show.
// A failed fetch (offline, or a deploy replaced the hashed chunk) means no pop-up this visit, never an error screen.
const nothing: ComponentType<UnpaidOrderDialogProps> = () => null;
const UnpaidOrderDialog = lazy((): Promise<{ default: ComponentType<UnpaidOrderDialogProps> }> =>
  import('@/features/unpaid-prompt/UnpaidOrderDialog.tsx').catch(() => ({ default: nothing })));

/**
 * "You have an unpaid order": over whatever the signed-in customer was doing, again on every fresh page load.
 * One button opens the order page, where they pay or cancel; the other says "Not now". This shell part stays light: it asks the hook
 * and renders nothing at all unless there is an order, so every page without one renders exactly what it did before.
 */
export function UnpaidOrderPrompt() {
  const { order, more } = useUnpaidOrder();
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  if (!order || dismissed) return null;

  const later = () => {
    dismissForThisLoad();
    setDismissed(true);
  };
  const review = () => {
    // Also flagged for the load, so reaching another page afterwards does not ask again.
    dismissForThisLoad();
    setDismissed(true);
    navigate(order.reviewPath);
  };

  return (
    <Suspense fallback={null}>
      <UnpaidOrderDialog order={order} more={more} onLater={later} onReview={review} />
    </Suspense>
  );
}
