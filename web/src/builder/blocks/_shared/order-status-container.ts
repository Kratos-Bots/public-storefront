import { flattenTypes, part, type ContainerSpec } from '@/builder/parts.ts';
import type { ComponentData, LayoutKind } from '@/builder/types.ts';

const PARTS = ['OrderStatusHero', 'OrderStatusPayment', 'OrderStatusShipments', 'OrderStatusItems', 'OrderStatusAddress', 'OrderStatusFooter'];
const COLUMN = ['OrderStatus.action', 'OrderStatus.summary'] as const;

/**
 * The order page: hero on top, an action column (payment first, then tracking), a summary column
 * (items, address) and the reference footer (stage 5 spec §5.2). Paying comes before everything the
 * customer cannot change the outcome of, so Payment must lead the action column.
 */
export const ORDER_STATUS_CONTAINER: ContainerSpec = {
  family: 'order-status', insertSlot: 'summary', contentOnly: true,
  required: ['OrderStatusHero', 'OrderStatusPayment', 'OrderStatusShipments', 'OrderStatusItems', 'OrderStatusFooter'],
  unique: PARTS, noHide: [], // required parts are always guarded; OrderStatusAddress may be hidden
  homes: {
    OrderStatusHero: ['OrderStatus.top'], OrderStatusPayment: ['OrderStatus.action'], OrderStatusFooter: ['OrderStatus.bottom'],
    OrderStatusShipments: [...COLUMN], OrderStatusItems: [...COLUMN], OrderStatusAddress: [...COLUMN],
  },
  order: (slots) => {
    const flat = flattenTypes(slots.action ?? []);
    const pay = flat.indexOf('OrderStatusPayment');
    if (pay < 0) return null;
    const early = flat.slice(0, pay).find((t) => t === 'OrderStatusItems' || t === 'OrderStatusAddress' || t === 'OrderStatusShipments');
    return early ? { message: 'Payment must come before tracking and the order details.' } : null;
  },
  defaultSlots: (_p: Record<string, unknown>, { id }: { layout: LayoutKind; id: string }): Record<string, ComponentData[]> => ({
    top: [part('OrderStatusHero', id)],
    action: [part('OrderStatusPayment', id), part('OrderStatusShipments', id)],
    summary: [part('OrderStatusItems', id), part('OrderStatusAddress', id)],
    bottom: [part('OrderStatusFooter', id)],
  }),
};
