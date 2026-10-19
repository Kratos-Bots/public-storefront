import { describe, expect, it } from 'vitest';
import { stableAttachmentSrc } from '@/features/support/stable-src.ts';

// Server-issued expiries only: the device clock plays no part.
const SIGNED_AT = 1_790_000_000;
const at = (id: number, signedAt: number, sig: string) => ({
  id, width: 10, height: 10, url: `public/storefront/support/attachments/${id}?exp=${signedAt + 3600}&sig=${sig}`,
});

describe('stableAttachmentSrc', () => {
  it('keeps the first link for a photo while it has time left, so a poll does not reload it', () => {
    const first = stableAttachmentSrc(at(901, SIGNED_AT, 'aaa'));
    expect(first).toBe(`/api/storefront/support/attachments/901?exp=${SIGNED_AT + 3600}&sig=aaa`);
    expect(stableAttachmentSrc(at(901, SIGNED_AT + 15, 'bbb'))).toBe(first);
    expect(stableAttachmentSrc(at(901, SIGNED_AT + 3299, 'bbb'))).toBe(first);
  });

  it('takes the fresh link once the kept one is within five minutes of expiring', () => {
    stableAttachmentSrc(at(902, SIGNED_AT, 'aaa'));
    expect(stableAttachmentSrc(at(902, SIGNED_AT + 3300, 'ccc'))).toContain('sig=ccc');
    // …and keeps that one from then on.
    expect(stableAttachmentSrc(at(902, SIGNED_AT + 3315, 'ddd'))).toContain('sig=ccc');
  });
});
