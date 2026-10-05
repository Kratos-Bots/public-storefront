import { part, type ContainerSpec } from '@/builder/parts.ts';

const PARTS = ['OrderBackLink', 'OrderHeading', 'OrderBalance', 'OrderItems', 'OrderAddress', 'OrderParcels', 'OrderPayments'] as const;

export const ORDER_CONTAINER: ContainerSpec = {
  family: 'order', insertSlot: 'content', required: ['OrderHeading', 'OrderItems'], unique: PARTS,
  defaultSlots: (_p, { id }) => ({ content: PARTS.map((t) => part(t, id)) }),
};
