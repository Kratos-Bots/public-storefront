import { describe, expect, it } from 'vitest';
import {
  buildIdentifier, checkCurrentPassword, checkNewPassword, PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH,
} from '@/features/auth/password-identifier.ts';

const base = { kind: 'email' as const, email: '', phone: '', prefix: 'GB' };
const phone = (national: string, prefix = 'GB') => buildIdentifier({ ...base, kind: 'phone', phone: national, prefix });

describe('buildIdentifier — email', () => {
  it('trims and lower-cases', () => {
    expect(buildIdentifier({ ...base, email: '  Ada@Example.COM \n' })).toEqual({ ok: true, identifier: { email: 'ada@example.com' } });
  });
  it('refuses a blank and a malformed address, naming the email field', () => {
    expect(buildIdentifier({ ...base, email: '   ' })).toEqual({ ok: false, field: 'email', message: 'Required' });
    expect(buildIdentifier({ ...base, email: 'ada@' })).toEqual({ ok: false, field: 'email', message: 'Valid email required' });
    expect(buildIdentifier({ ...base, email: 'two words@example.com' })).toMatchObject({ ok: false, field: 'email' });
  });
  it('never reads the phone fields', () => {
    expect(buildIdentifier({ ...base, email: 'a@b.co', phone: 'garbage', prefix: '' })).toEqual({ ok: true, identifier: { email: 'a@b.co' } });
  });
});

describe('buildIdentifier — phone', () => {
  it('a national number with spaces and a trunk zero is sent with the country picked', () => {
    expect(phone('07700 900123')).toEqual({ ok: true, identifier: { phone: '+4407700900123', phoneCountry: 'GB' } });
  });
  it('brackets and dashes are stripped', () => {
    expect(phone('(07700) 900-123')).toEqual({ ok: true, identifier: { phone: '+4407700900123', phoneCountry: 'GB' } });
  });
  it('an international number pasted under another country code wins over the picker, which is still sent as the hint', () => {
    expect(phone('+44 7700 900123', 'FR')).toEqual({ ok: true, identifier: { phone: '+447700900123', phoneCountry: 'FR' } });
  });
  it('the 00 prefix is an international number too', () => {
    expect(phone('0044 7700 900123')).toEqual({ ok: true, identifier: { phone: '+447700900123', phoneCountry: 'GB' } });
  });
  it('a lower-case picker value is upper-cased', () => {
    expect(phone('7700 900123', 'gb')).toEqual({ ok: true, identifier: { phone: '+447700900123', phoneCountry: 'GB' } });
  });
  it('no country picked and no plus is refused, never sent raw', () => {
    expect(phone('07700 900123', '')).toEqual({ ok: false, field: 'phone', message: 'Enter your phone number with its country code' });
  });
  it('no country picked but a plus is fine and sends no hint', () => {
    expect(phone('+447700900123', '')).toEqual({ ok: true, identifier: { phone: '+447700900123' } });
  });
  it('a bare country code, or too few digits, is refused', () => {
    expect(phone('+44', '')).toMatchObject({ ok: false, field: 'phone' });
    expect(phone('123', 'GB')).toMatchObject({ ok: false, field: 'phone' });
  });
  it('blank is Required, not "invalid"', () => {
    expect(phone('   ')).toEqual({ ok: false, field: 'phone', message: 'Required' });
  });
});

describe('password rules', () => {
  it('the limits are 8 characters and 72 bytes', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_MAX_BYTES).toBe(72);
  });
  it('seven characters is too short, eight is fine', () => {
    expect(checkNewPassword('1234567')).toBe('Use at least 8 characters');
    expect(checkNewPassword('12345678')).toBeNull();
    expect(checkNewPassword('')).toBe('Use at least 8 characters');
  });
  it('spaces are password characters: eight spaces are valid and nothing is trimmed away', () => {
    expect(checkNewPassword('        ')).toBeNull();
    expect(checkNewPassword('  1234 ')).toBe('Use at least 8 characters');
  });
  it('72 is a BYTE limit', () => {
    expect(checkNewPassword('a'.repeat(72))).toBeNull();
    expect(checkNewPassword('a'.repeat(73))).toBe('That password is too long — shorten it a little');
    expect(checkNewPassword('😀'.repeat(18))).toBeNull(); // 72 bytes
    expect(checkNewPassword('😀'.repeat(19))).toBe('That password is too long — shorten it a little'); // 76 bytes, only 38 UTF-16 units
  });
  it('the current password only has to be present — and a lone space is present', () => {
    expect(checkCurrentPassword('')).toBe('Required');
    expect(checkCurrentPassword(' ')).toBeNull();
    expect(checkCurrentPassword('x')).toBeNull();
  });
});
