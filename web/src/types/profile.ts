export interface Profile {
  loyaltyPoints: number; storeCreditBalance: number; referralCode: string; referralsCount: number; referredPeopleCount: number;
  hasReferrer: boolean; referrerNickname: string | null; totalOrders: number; totalSpend: number; memberSince: string;
  nickname: string | null; identities: { telegram: boolean; whatsapp: boolean; email: boolean };
}
export interface RedeemOption { id: number; label: string; pointsCost: number; creditValue: number; affordable: boolean }
export interface RedeemOptions { loyaltyPoints: number; options: RedeemOption[] }
export interface RedeemResult { pointsDeducted: number; creditAwarded: number; newPointsBalance: number; newCreditBalance: number }
