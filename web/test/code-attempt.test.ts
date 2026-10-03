import { describe, expect, it } from 'vitest';
import { formatClock, otherPhoneChannel, resendDeadline, toAttempt } from '@/features/auth/code-attempt.ts';

const NOW = Date.parse('2026-10-03T10:00:00Z');

describe('resendDeadline', () => {
  it('reads a number as seconds from now', () => {
    expect(resendDeadline(60, NOW)).toBe(NOW + 60_000);
    expect(resendDeadline(0, NOW)).toBe(NOW);
    expect(resendDeadline(-5, NOW)).toBe(NOW);
  });
  it('falls back to the 60 second default for anything unreadable', () => {
    expect(resendDeadline(Number.NaN, NOW)).toBe(NOW + 60_000);
  });
});

describe('toAttempt', () => {
  it('keeps what the screen needs and stamps the resend moment', () => {
    expect(toAttempt('phone', { next: 'code', attemptId: 'a1', channel: 'sms', maskedTo: '+44 •••• 0123', resendAfter: 60 }, NOW))
      .toEqual({ attemptId: 'a1', kind: 'phone', channel: 'sms', maskedTo: '+44 •••• 0123', resendAt: NOW + 60_000 });
  });
});

describe('otherPhoneChannel and formatClock', () => {
  it('flips between WhatsApp and text message', () => {
    expect(otherPhoneChannel('whatsapp')).toBe('sms');
    expect(otherPhoneChannel('sms')).toBe('whatsapp');
  });
  it('formats m:ss and never goes negative', () => {
    expect(formatClock(60)).toBe('1:00');
    expect(formatClock(59.2)).toBe('1:00');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(-3)).toBe('0:00');
  });
});
