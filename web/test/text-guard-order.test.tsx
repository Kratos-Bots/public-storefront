import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { TextLayerProvider } from '@/text/runtime.tsx';
import { orderStatusLabel, SHIPMENT_LABEL, statusView } from '@/features/order-status/status.ts';
import { orderChatMessage } from '@/lib/chat-links.ts';
import type { PublicOrder, Shipment } from '@/types/public-order.ts';
import { ShipmentCard } from '@/features/order-status/ShipmentCard.tsx';

afterEach(cleanup);
const order = { status: 'pending' } as unknown as PublicOrder;
describe('order wording follows published text', () => {
  it('statusView resolves at call time (defaults without a provider)', () => {
    expect(statusView(order).headline).toBe('Order received');
    render(<TextLayerProvider text={{ locale: 'en', formatLocale: '', shared: { 'order.hero.pendingHeadline': 'Got it!' }, layout: {} }}><span /></TextLayerProvider>);
    expect(statusView(order).headline).toBe('Got it!');
  });
  it('the chat prefill is a key with {reference}', () => {
    expect(orderChatMessage('E2E1')).toBe("I've just placed an order, here is my Order ID: E2E1. I'd like to pay.");
  });
  it('the status and shipment labels other areas read resolve at call time', () => {
    expect(orderStatusLabel('confirmed')).toBe('Confirmed');
    expect(SHIPMENT_LABEL.in_transit).toBe('In transit');
    render(<TextLayerProvider text={{ locale: 'en', formatLocale: '', shared: { 'order.status.confirmed': 'Accepted', 'order.shipment.status.inTransit': 'Moving' }, layout: {} }}><span /></TextLayerProvider>);
    expect(orderStatusLabel('confirmed')).toBe('Accepted');
    expect(SHIPMENT_LABEL.in_transit).toBe('Moving');
  });
  it('a shipment status the release does not know renders an empty pill, as v0.7.0 did (no throw)', () => {
    const parcel = (status: string) => ({ status, carrier: 'Royal Mail', trackingNumber: null, trackingUrl: null, trackingStatusDescription: null, shippedAt: null, deliveredAt: null }) as unknown as Shipment;
    const { container } = render(<ShipmentCard shipment={parcel('held_at_customs')} index={0} count={1} />);
    const pill = container.querySelector('h2')!.parentElement!.nextElementSibling!;
    expect(pill.tagName).toBe('SPAN');
    expect(pill.textContent).toBe('');
    cleanup();
    const known = render(<ShipmentCard shipment={parcel('in_transit')} index={0} count={1} />);
    expect(known.getByText('In transit')).toBeInTheDocument();
  });
});
