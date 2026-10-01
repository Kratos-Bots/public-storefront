import { createFamily } from '@/builder/parts.ts';
import type { Profile } from '@/types/profile.ts';

/** The referral tab's state, owned by `ReferralsPage` (spec §5.4). */
export interface ReferralsData {
  profile: Profile;
  /** Share targets for the code (null where the shop has no such link). */
  links: { whatsapp: string | null; telegram: string | null };
  canCopy: boolean;
  canShare: boolean;
  copied: boolean;
  copy(): void;
  share(): void;
  /** The claim form. */
  draft: string;
  setDraft(value: string): void;
  claim: { pending: boolean; error: unknown; isError: boolean; submit(code: string): void };
}
export const ReferralsFamily = createFamily<ReferralsData>('referrals');

/** The editor's fixture for the referral preview states (spec §11.3). */
export interface ReferralsPreview { info: Profile }
