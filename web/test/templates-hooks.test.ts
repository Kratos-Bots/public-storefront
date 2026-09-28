import { describe, expect, it } from 'vitest';
import { formatClock, utcOffsetLabel } from '@/templates/hooks.ts';

describe('clock helpers', () => {
  const at = new Date('2026-08-24T09:05:07.000Z');
  it('formats a 24h clock in the zone', () => {
    expect(formatClock(at, 'Europe/London')).toBe('10:05:07');
    expect(formatClock(at, 'UTC')).toBe('09:05:07');
    expect(formatClock(at, 'Not/AZone')).toBe('09:05:07');
  });
  it('labels the UTC offset', () => {
    expect(utcOffsetLabel(at, 'Europe/London')).toBe('UTC+1');
    expect(utcOffsetLabel(at, 'UTC')).toBe('UTC+0');
    expect(utcOffsetLabel(at, 'Asia/Kolkata')).toBe('UTC+5:30');
    expect(utcOffsetLabel(at, 'America/New_York')).toBe('UTC-4');
    expect(utcOffsetLabel(at, 'Not/AZone')).toBe('UTC+0');
  });
});
