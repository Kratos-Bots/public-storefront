import { describe, expect, it } from 'vitest';
import { stableAttachmentSrc } from '@/features/support/stable-src.ts';

const NOW = Date.parse('2026-10-19T12:00:00Z');
const at = (id: number, expSec: number, sig: string) => ({
  id, width: 10, height: 10, url: `public/storefront/support/attachments/${id}?exp=${expSec}&sig=${sig}`,
});

describe('stableAttachmentSrc', () => {
  it('keeps the first link for a photo while it has time left, so a poll does not reload it', () => {
    const exp = NOW / 1000 + 3600;
    const first = stableAttachmentSrc(at(901, exp, 'aaa'), NOW);
    expect(first).toBe(`/api/storefront/support/attachments/901?exp=${exp}&sig=aaa`);
    expect(stableAttachmentSrc(at(901, exp + 15, 'bbb'), NOW + 15_000)).toBe(first);
  });

  it('takes the fresh link once the kept one is close to expiring', () => {
    const exp = NOW / 1000 + 3600;
    stableAttachmentSrc(at(902, exp, 'aaa'), NOW);
    const later = NOW + 56 * 60_000;
    expect(stableAttachmentSrc(at(902, later / 1000 + 3600, 'ccc'), later)).toContain('sig=ccc');
  });
});
