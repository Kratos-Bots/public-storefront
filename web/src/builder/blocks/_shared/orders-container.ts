import { part, type ContainerSpec } from '@/builder/parts.ts';

export const ORDERS_CONTAINER: ContainerSpec = {
  family: 'orders', insertSlot: 'content', required: ['OrdersRows', 'OrdersEmpty'],
  unique: ['OrdersHeading', 'OrdersRows', 'OrdersMore', 'OrdersEmpty'],
  defaultSlots: (_p, { id }) => ({ content: ['OrdersHeading', 'OrdersRows', 'OrdersMore', 'OrdersEmpty'].map((t) => part(t, id)) }),
};
