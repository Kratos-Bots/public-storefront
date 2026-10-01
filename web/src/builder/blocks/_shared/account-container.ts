import { part, type ContainerSpec } from '@/builder/parts.ts';

/** Spec §5.3: `body` (the section) is present in every stored v0.7.0 document, so the defaults omit it. */
export const ACCOUNT_CONTAINER: ContainerSpec = {
  family: 'account', insertSlot: 'head', required: ['AccountGreeting', 'AccountTabs'], unique: ['AccountGreeting', 'AccountTabs'],
  nests: ['OrdersList', 'OrderDetail', 'Loyalty', 'Referrals', 'Profile'],
  defaultSlots: (_p, { id }) => ({ head: [part('AccountGreeting', id), part('AccountTabs', id)] }),
};
