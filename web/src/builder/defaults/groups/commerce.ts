import { block, doc, type DefaultEntry } from '@/builder/defaults/helpers.ts';

export const DEFAULTS: DefaultEntry[] = [
  { docKey: 'cart', layouts: 'all', doc: doc([block('CartContents', { summary: [block('CartSummary')] })]) },
  { docKey: 'checkout', layouts: 'all', doc: doc([block('CheckoutFlow')]) },
  { docKey: 'login', layouts: 'all', doc: doc([block('LoginOptions')]) },
  { docKey: 'reset-password', layouts: 'all', doc: doc([block('ResetPassword')]) },
  { docKey: 'verify-email', layouts: 'all', doc: doc([block('VerifyEmail')]) },
];
