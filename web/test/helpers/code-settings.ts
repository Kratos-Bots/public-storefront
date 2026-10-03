export interface CodeSettingsOpts {
  /** `absent` leaves `login.phone` out, as an older backend does. Default `verify`. */
  phone?: 'verify' | 'whatsapp' | 'off' | 'absent';
  channels?: Array<'whatsapp' | 'sms'>;
  email?: 'verify' | 'email' | 'off' | 'absent';
  password?: boolean;
  resetByEmail?: boolean;
  turnstile?: boolean;
  registration?: boolean;
  telegram?: boolean;
  countries?: string[];
  defaultCountry?: string | null;
}

/** A `useSettings()` value for the sign-in by code tests. */
export function codeSettings(o: CodeSettingsOpts = {}): Record<string, unknown> {
  const phone = o.phone ?? 'verify';
  const email = o.email ?? 'verify';
  const login: Record<string, unknown> = {
    whatsapp: { available: phone === 'whatsapp', number: '447700900123' },
    telegram: o.telegram ? { available: false, botUsername: null, oidc: true } : { available: false, botUsername: null },
  };
  if (o.password) login.password = { available: true, resetByEmail: o.resetByEmail ?? false, resetByWhatsapp: false };
  if (phone === 'verify') login.phone = { available: true, mode: 'verify', channels: o.channels ?? ['whatsapp', 'sms'], ...(o.countries ? { countries: o.countries } : {}) };
  if (phone === 'whatsapp') login.phone = { available: true, mode: 'whatsapp', channels: [] };
  if (phone === 'off') login.phone = { available: false, mode: null, channels: [] };
  if (email === 'verify' || email === 'email') login.email = { available: true, mode: email };
  if (email === 'off') login.email = { available: false, mode: null };
  return {
    brand: { name: 'Northbound Supply', shortName: 'Northbound', links: { whatsapp: null, telegram: null } },
    supportLinks: [],
    contactModes: { phoneMode: 'optional', emailMode: 'required', defaultPhoneCountry: o.defaultCountry === undefined ? 'GB' : o.defaultCountry },
    turnstile: o.turnstile ? { siteKey: 'site-key' } : null,
    access: { storefront: 'public', registration: o.registration ?? true, deniedMessage: '', deniedButtons: [] },
    login,
  };
}
