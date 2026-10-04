import { lazy, Suspense, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router';
import type { UnpaidOrderDialogProps } from '@/features/unpaid-prompt/UnpaidOrderDialog.tsx';
import { snooze, useUnpaidOrder } from '@/features/unpaid-prompt/useUnpaidOrder.ts';

// The dialog (Modal, cancel control, order-page stylesheet) is a separate chunk, fetched only once there is an order to show.
// A failed fetch (offline, or a deploy replaced the hashed chunk) means no pop-up this visit, never an error screen.
const nothing: ComponentType<UnpaidOrderDialogProps> = () => null;
const UnpaidOrderDialog = lazy((): Promise<{ default: ComponentType<UnpaidOrderDialogProps> }> =>
  import('@/features/unpaid-prompt/UnpaidOrderDialog.tsx').catch(() => ({ default: nothing })));

/**
 * "You have an unpaid order": once per visit, over whatever the customer was doing. Complete payment, Cancel
 * (or the contact line when money may be on its way), or Not now. This shell part stays light: it asks the hook
 * and renders nothing at all unless there is an order, so every page without one renders exactly what it did before.
 */
export function UnpaidOrderPrompt() {
  const { order, more } = useUnpaidOrder();
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  if (!order || dismissed) return null;

  const later = () => {
    snooze();
    setDismissed(true);
  };
  const pay = () => {
    setDismissed(true);
    navigate(order.payPath);
  };

  return (
    <Suspense fallback={null}>
      <UnpaidOrderDialog order={order} more={more} onLater={later} onPay={pay} onCancelled={() => setDismissed(true)} />
    </Suspense>
  );
}
