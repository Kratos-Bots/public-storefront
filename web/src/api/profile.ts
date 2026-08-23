import { ApiError, api, unwrap } from '@/api/client.ts';
import type { Profile, RedeemOptions, RedeemResult } from '@/types/profile.ts';

export const fetchProfile = () => unwrap<Profile>(api.get('storefront/profile'));

/** Claim a referral code. `422` covers already-referred, self-referral and unknown code. */
export const setReferralCode = (code: string) =>
  unwrap<{ referrerNickname: string }>(
    api.post('storefront/profile/referral-code', { json: { code } }),
  );

/**
 * The redemption ladder, or `null` when the shop has redemption switched off —
 * the backend says so with a `404 Feature not found`, which is a shape of the
 * account, not a failure, so it is answered rather than thrown. Every other
 * status still throws.
 */
export async function fetchRedeemOptions(): Promise<RedeemOptions | null> {
  try {
    return await unwrap<RedeemOptions>(api.get('storefront/profile/redeem-options'));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export const redeem = (optionId: number) =>
  unwrap<RedeemResult>(api.post('storefront/profile/redeem', { json: { optionId } }));
