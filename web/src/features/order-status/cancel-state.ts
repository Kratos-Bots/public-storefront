import type { CancelBlockedBy } from '@/types/public-order.ts';

export type CancelView = 'button' | 'contact' | 'none';

/** What the cancel control shows. A missing flag (older backend) shows nothing. */
export function cancelView(canCancel: boolean | undefined, blockedBy: CancelBlockedBy | null | undefined): CancelView {
  if (canCancel) return 'button';
  return blockedBy === 'bank_transfer' || blockedBy === 'crypto_submitted' ? 'contact' : 'none';
}
