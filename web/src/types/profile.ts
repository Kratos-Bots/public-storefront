export interface ProfilePassword { set: boolean; loginEmail: string | null; loginPhone: string | null; emailVerified: boolean; phoneVerified: boolean }
export interface Profile {
  loyaltyPoints: number; storeCreditBalance: number; referralCode: string; referralsCount: number; referredPeopleCount: number;
  hasReferrer: boolean; referrerNickname: string | null; totalOrders: number; totalSpend: number; memberSince: string;
  nickname: string | null; identities: { telegram: boolean; whatsapp: boolean; email: boolean };
  /** Absent on backends older than password sign-in. */
  password?: ProfilePassword;
  /** False when this customer is signed in but not allowed into a restricted shop.
   *  Absent on backends older than shop access. */
  shopAccess?: boolean;
}
export interface RedeemOption { id: number; label: string; pointsCost: number; creditValue: number; affordable: boolean }
export interface RedeemOptions { loyaltyPoints: number; options: RedeemOption[] }
export interface RedeemResult { pointsDeducted: number; creditAwarded: number; newPointsBalance: number; newCreditBalance: number }
