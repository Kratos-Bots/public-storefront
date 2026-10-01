import { createFamily } from '@/builder/parts.ts';
import type { Profile, RedeemOption, RedeemOptions } from '@/types/profile.ts';

/** The loyalty tab's state, owned by `LoyaltyPage` (spec §5.4). */
export interface LoyaltyData {
  profile: Profile;
  /** The redemption ladder; null until it loads (or when the shop has the feature off). */
  options: RedeemOptions | null;
  /** The balance the ladder is read against (the ladder's own copy when loaded). */
  points: number;
  /** Open the confirm dialog for an option. */
  confirm(option: RedeemOption): void;
  /** A redemption is in flight. */
  redeeming: boolean;
}
export const LoyaltyFamily = createFamily<LoyaltyData>('loyalty');

/** The editor's fixture for the loyalty preview states (spec §11.3). */
export interface LoyaltyPreview { profile: Profile; options: RedeemOptions }
