import { block, doc, type DefaultEntry } from '@/builder/defaults/helpers.ts';

export const DEFAULTS: DefaultEntry[] = [
  { docKey: 'payment-success', layouts: 'all', doc: doc([block('PaymentSuccess')]) },
  { docKey: 'payment-cancel', layouts: 'all', doc: doc([block('PaymentCancel')]) },
  { docKey: 'order-placed', layouts: 'all', doc: doc([block('OrderPlaced')]) },
  { docKey: 'verify', layouts: 'all', doc: doc([block('VerifyForm')]) },
  { docKey: 'tracking', layouts: 'all', doc: doc([block('TrackingLookup')]) },
];
