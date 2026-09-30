import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { TextLayerProvider } from '@/text/runtime.tsx';
import { addressSchema, buildContactSchema } from '@/features/checkout/schemas.ts';

afterEach(cleanup);
const edited = { locale: 'en', formatLocale: '', shared: { 'checkout.errors.required': 'Please fill this in' }, layout: {} } as const;

describe('checkout wording follows published text', () => {
  it('addressSchema (built at import) reports the owner\'s wording for Required', () => {
    render(<TextLayerProvider text={edited}><span /></TextLayerProvider>);
    const r = addressSchema.safeParse({ addressLine1: '', city: 'Leeds', zip: 'LS1', country: 'GB' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Please fill this in');
  });
  it('without a provider the schemas keep today\'s English', () => {
    const r = buildContactSchema({ emailMode: 'optional', phoneMode: 'optional', defaultPhoneCountry: null }, { guest: true }).safeParse({ firstName: 'A', surname: 'B', email: '', phone: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.message === 'Email or phone is required')).toBe(true);
  });
});
