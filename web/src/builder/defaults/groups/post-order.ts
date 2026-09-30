import { block, doc, type DefaultEntry } from '@/builder/defaults/helpers.ts';

export const DEFAULTS: DefaultEntry[] = [
  // Reached from a chat link, not from browsing — no shop chrome (v0.6.0's Chromeless route).
  { docKey: 'order-status', layouts: 'all', doc: doc([block('OrderStatus')], { chrome: 'none' }) },
  { docKey: 'payment-success', layouts: 'all', doc: doc([block('PaymentSuccess')]) },
  { docKey: 'payment-cancel', layouts: 'all', doc: doc([block('PaymentCancel')]) },
  { docKey: 'order-placed', layouts: 'all', doc: doc([block('OrderPlaced')]) },
  { docKey: 'verify', layouts: 'all', doc: doc([block('VerifyForm')]) },
  { docKey: 'tracking', layouts: 'all', doc: doc([block('TrackingLookup')]) },
];
