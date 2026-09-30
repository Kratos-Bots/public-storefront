import { afterEach, describe, expect, it } from 'vitest';
import { formatProfileFor, LEGACY_PROFILE } from '@/text/format-profile.ts';
import { formatDate, formatDateTime, formatInteger, formatMoney, formatAmountPlain, regionName, setFormatProfile } from '@/lib/format.ts';
import { countryOptions } from '@/features/checkout/CountrySelect.tsx';
import { formatStamp } from '@/features/tracking/status.ts';
import { nextCutoff } from '@/lib/cutoffs.ts';
import { formatClock } from '@/templates/hooks.ts';
import type { Cutoffs } from '@/types/settings.ts';

const ISO = '2026-07-07T10:00:00.000Z';
afterEach(() => setFormatProfile(LEGACY_PROFILE));

describe('formatProfileFor', () => {
  it('English with built-in formatting is the legacy per-call-site profile', () => {
    expect(formatProfileFor({ locale: 'en', formatLocale: '' })).toBe(LEGACY_PROFILE);
    expect(LEGACY_PROFILE).toEqual({ money: 'en', date: 'en-GB', dateTime: undefined, number: undefined, regions: ['en'], collation: undefined });
  });
  it('any other language uses formatLocale || locale everywhere', () => {
    const l = 'de-DE';
    expect(formatProfileFor({ locale: 'de', formatLocale: l })).toEqual({ money: l, date: l, dateTime: l, number: l, regions: [l], collation: l });
    expect(formatProfileFor({ locale: 'fr', formatLocale: '' }).money).toBe('fr');
    expect(formatProfileFor({ locale: 'en', formatLocale: 'en-GB' }).money).toBe('en-GB');
  });
  it('falls back to the legacy profile for a locale Intl rejects', () => {
    expect(formatProfileFor({ locale: 'en', formatLocale: 'xx-ZZ-bad' })).toBe(LEGACY_PROFILE);
    expect(formatProfileFor({ locale: 'not a tag', formatLocale: '' })).toBe(LEGACY_PROFILE);
  });
});

describe('legacy profile produces exactly today\'s output', () => {
  it('money, dates, integers, regions, stamps', () => {
    expect(formatMoney(4.5, 'GBP')).toBe('£4.50');
    expect(formatMoney(4.5, 'USD')).toBe('$4.50');
    expect(formatDate(ISO)).toBe('7 July 2026');
    expect(formatDateTime(ISO)).toBe(new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ISO)));
    expect(formatInteger(1234567)).toBe((1234567).toLocaleString());
    expect(regionName('DE')).toBe('Germany');
    expect(formatStamp(ISO)).toBe(new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ISO)));
    expect(countryOptions().find((c) => c.iso === 'DE')?.name).toBe('Germany');
  });
});

describe('a non-English profile switches every shopper formatter', () => {
  it('de-DE', () => {
    setFormatProfile(formatProfileFor({ locale: 'de', formatLocale: 'de-DE' }));
    expect(formatMoney(4.5, 'EUR')).toBe(new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(4.5));
    expect(formatDate(ISO)).toBe(new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ISO)));
    expect(formatInteger(1234567)).toBe('1.234.567');
    expect(regionName('DE')).toBe('Deutschland');
    expect(countryOptions().find((c) => c.iso === 'DE')?.name).toBe('Deutschland');
    expect(formatAmountPlain(1234.5, 'GBP')).toBe('1234.50'); // machine format, never localised
  });
  it('en-GB explicitly accepts US$ (why the legacy profile exists)', () => {
    setFormatProfile(formatProfileFor({ locale: 'en', formatLocale: 'en-GB' }));
    expect(formatMoney(4.5, 'USD')).toBe('US$4.50');
  });
  it('never reaches cutoffs.ts or the template clock', () => {
    const cutoffs: Cutoffs = { timezone: 'Europe/London', days: { mon: { enabled: true, cutoff: '15:00', shipsOn: 'same day' }, tue: { enabled: true, cutoff: '15:00', shipsOn: 'same day' }, wed: { enabled: true, cutoff: '15:00', shipsOn: 'same day' }, thu: { enabled: true, cutoff: '15:00', shipsOn: 'same day' }, fri: { enabled: true, cutoff: '15:00', shipsOn: 'same day' }, sat: { enabled: false, cutoff: '12:00', shipsOn: '' }, sun: { enabled: false, cutoff: '12:00', shipsOn: '' } } };
    const now = new Date('2026-08-25T09:00:00Z');
    const legacy = nextCutoff(cutoffs, now.toISOString(), 1000, 1000);
    const clock = formatClock(now, 'Europe/London');
    setFormatProfile(formatProfileFor({ locale: 'ar', formatLocale: 'ar-EG' }));
    expect(nextCutoff(cutoffs, now.toISOString(), 1000, 1000)).toEqual(legacy);
    expect(formatClock(now, 'Europe/London')).toBe(clock);
  });
});
