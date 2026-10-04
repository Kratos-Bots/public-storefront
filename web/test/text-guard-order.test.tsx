import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { TextLayerProvider } from '@/text/runtime.tsx';
import { orderStatusLabel, SHIPMENT_LABEL, shipmentLabelKey } from '@/features/order-status/status.ts';
import { orderChatMessage } from '@/lib/chat-links.ts';

afterEach(cleanup);
describe('order wording follows published text', () => {
  it('the chat prefill is a key with {reference}', () => {
    expect(orderChatMessage('E2E1')).toBe("I've just placed an order, here is my Order ID: E2E1. I'd like to pay.");
  });
  it('the status and shipment labels other areas read resolve at call time', () => {
    expect(orderStatusLabel('confirmed')).toBe('Confirmed');
    expect(SHIPMENT_LABEL.in_transit).toBe('In transit');
    render(<TextLayerProvider text={{ locale: 'en', formatLocale: '', shared: { 'order.status.confirmed': 'Accepted', 'common.shipment.inTransit': 'Moving' }, layout: {} }}><span /></TextLayerProvider>);
    expect(orderStatusLabel('confirmed')).toBe('Accepted');
    expect(SHIPMENT_LABEL.in_transit).toBe('Moving');
  });
  it('a shipment status the release does not know has no label, as v0.7.0 had none (no throw)', () => {
    expect(shipmentLabelKey('held_at_customs')).toBeNull();
    expect(shipmentLabelKey('in_transit')).toBe('common.shipment.inTransit');
  });
});
