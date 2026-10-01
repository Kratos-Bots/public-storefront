import { part, type ContainerSpec } from '@/builder/parts.ts';

export const LOYALTY_CONTAINER: ContainerSpec = {
  family: 'loyalty', insertSlot: 'content', required: ['LoyaltyPoints', 'LoyaltyRewards'],
  unique: ['LoyaltyPoints', 'LoyaltyCredit', 'LoyaltyNoPoints', 'LoyaltyRewards'],
  defaultSlots: (_p, { id }) => ({ content: ['LoyaltyPoints', 'LoyaltyCredit', 'LoyaltyNoPoints', 'LoyaltyRewards'].map((t) => part(t, id)) }),
};
