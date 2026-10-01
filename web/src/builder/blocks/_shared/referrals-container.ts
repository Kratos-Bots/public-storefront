import { part, type ContainerSpec } from '@/builder/parts.ts';

export const REFERRALS_CONTAINER: ContainerSpec = {
  family: 'referrals', insertSlot: 'content', required: ['ReferralCode'],
  unique: ['ReferralCode', 'ReferralShare', 'ReferralStats', 'ReferralReferrer'],
  defaultSlots: (_p, { id }) => ({ content: ['ReferralCode', 'ReferralShare', 'ReferralStats', 'ReferralReferrer'].map((t) => part(t, id)) }),
};
