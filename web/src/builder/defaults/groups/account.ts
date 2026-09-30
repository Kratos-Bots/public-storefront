import { block, doc, type DefaultEntry } from '@/builder/defaults/helpers.ts';
import type { FixedRouteKey } from '@/builder/types.ts';

const section = (docKey: FixedRouteKey, type: string): DefaultEntry => ({
  docKey, layouts: 'all', doc: doc([block('AccountNav', { body: [block(type)] })]),
});

// v0.6.0's AccountLayout with each section in its outlet.
export const DEFAULTS: DefaultEntry[] = [
  section('account.orders', 'OrdersList'),
  section('account.order', 'OrderDetail'),
  section('account.loyalty', 'Loyalty'),
  section('account.referrals', 'Referrals'),
  section('account.profile', 'Profile'),
];
