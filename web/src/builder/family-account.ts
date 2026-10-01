import { createFamily } from '@/builder/parts.ts';

// Type-only feature imports: this module is in the shopper's entry bundle.

/** The account letterhead and rail: computed once by `AccountLayout` (spec §5.3). */
export interface AccountData {
  /** Session nickname first, then the profile's; null until either is known. */
  name: string | null;
  /** The profile's standing line inputs; null until the profile is in. */
  standing: { memberSince: string; totalOrders: number } | null;
  pathname: string;
}
export const AccountFamily = createFamily<AccountData>('account');
