import { describe, expect, it } from 'vitest';
import { withPrefilledText, orderChatMessage, orderInquiryMessage } from '@/lib/chat-links.ts';

describe('withPrefilledText', () => {
  it('appends the message as ?text= to a wa.me link', () => {
    const result = withPrefilledText('https://wa.me/447700900000', 'hi there');
    expect(result).toContain('text=hi+there');
  });
  it('returns null for a null link', () => {
    expect(withPrefilledText(null, 'x')).toBeNull();
  });
  it('returns the original string unchanged when it is not a valid URL', () => {
    expect(withPrefilledText('not a url', 'x')).toBe('not a url');
  });
});

describe('orderChatMessage', () => {
  it('embeds the order reference in the prefilled message', () => {
    expect(orderChatMessage('26H8IN')).toBe("I've just placed an order, here is my Order ID: 26H8IN. I'd like to pay.");
  });
});

describe('orderInquiryMessage', () => {
  it('embeds the order reference in a neutral check-in, not a request to pay', () => {
    expect(orderInquiryMessage('26H8IN')).toBe('Hi — checking in about my order 26H8IN.');
  });
});
