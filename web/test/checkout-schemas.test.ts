import { describe, expect, it } from 'vitest';
import type { ContactModes } from '@/types/settings.ts';
import type { PaymentMethod } from '@/types/checkout.ts';
import { addressSchema, buildContactSchema, buildPaymentSchema, shippingSchema } from '@/features/checkout/schemas.ts';

function contactModes(overrides: Partial<ContactModes> = {}): ContactModes {
  return { emailMode: 'optional', phoneMode: 'optional', defaultPhoneCountry: null, ...overrides };
}

function paymentMethod(overrides: Partial<PaymentMethod> = {}): PaymentMethod {
  return {
    slot: 'card',
    method: 'stripe',
    displayName: 'Stripe',
    type: 'gateway',
    details: null,
    feeType: null,
    feeValue: null,
    feeRateText: '',
    feeLabel: '',
    fee: 0,
    chargeTotal: 0,
    ...overrides,
  };
}

describe('buildContactSchema', () => {
  it('strips a hidden email regardless of what was typed', () => {
    const schema = buildContactSchema(contactModes({ emailMode: 'hidden' }), { guest: false });
    const result = schema.safeParse({
      firstName: 'Ada',
      surname: 'Lovelace',
      email: 'ada@example.com',
      phone: '',
      phonePrefix: '',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBeUndefined();
  });

  it('enforces a required phone', () => {
    const schema = buildContactSchema(contactModes({ phoneMode: 'required' }), { guest: false });
    const result = schema.safeParse({
      firstName: 'Ada',
      surname: 'Lovelace',
      email: '',
      phone: '',
      phonePrefix: 'GB',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'phone')).toBe(true);
    }
  });

  it('composes the phone via composePhoneNumber using the picked prefix', () => {
    const schema = buildContactSchema(contactModes({ phoneMode: 'required' }), { guest: false });
    const result = schema.safeParse({
      firstName: 'Ada',
      surname: 'Lovelace',
      email: '',
      phone: '7700 900000',
      phonePrefix: 'GB',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe('+447700900000');
  });

  it('leaves an optional blank phone as undefined rather than a bare prefix', () => {
    const schema = buildContactSchema(contactModes({ phoneMode: 'optional' }), { guest: false });
    const result = schema.safeParse({
      firstName: 'Ada',
      surname: 'Lovelace',
      email: '',
      phone: '   ',
      phonePrefix: 'GB',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBeUndefined();
  });

  it('rejects a guest with neither email nor phone, regardless of contact modes', () => {
    const schema = buildContactSchema(contactModes({ emailMode: 'hidden', phoneMode: 'hidden' }), { guest: true });
    const result = schema.safeParse({
      firstName: 'Ada',
      surname: 'Lovelace',
      email: '',
      phone: '',
      phonePrefix: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Email or phone is required')).toBe(true);
    }
  });

  it('accepts a guest who supplied only a phone', () => {
    const schema = buildContactSchema(contactModes({ emailMode: 'optional', phoneMode: 'optional' }), { guest: true });
    const result = schema.safeParse({
      firstName: 'Ada',
      surname: 'Lovelace',
      email: '',
      phone: '7700900000',
      phonePrefix: 'GB',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a guest who supplied only an email', () => {
    const schema = buildContactSchema(contactModes({ emailMode: 'optional', phoneMode: 'optional' }), { guest: true });
    const result = schema.safeParse({
      firstName: 'Ada',
      surname: 'Lovelace',
      email: 'ada@example.com',
      phone: '',
      phonePrefix: '',
    });
    expect(result.success).toBe(true);
  });

  it('does not require both contacts for a logged-in customer', () => {
    const schema = buildContactSchema(contactModes({ emailMode: 'optional', phoneMode: 'optional' }), { guest: false });
    const result = schema.safeParse({
      firstName: 'Ada',
      surname: 'Lovelace',
      email: '',
      phone: '',
      phonePrefix: '',
    });
    expect(result.success).toBe(true);
  });
});

describe('addressSchema', () => {
  it('requires addressLine1, city, zip and a 2-letter country', () => {
    const result = addressSchema.safeParse({
      addressLine1: '',
      addressLine2: '',
      city: '',
      county: '',
      zip: '',
      country: 'GBR',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a minimal valid address, turning blank optionals into undefined', () => {
    const result = addressSchema.safeParse({
      addressLine1: '1 Main St',
      addressLine2: '   ',
      city: 'London',
      county: '',
      zip: 'SW1A 1AA',
      country: 'GB',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.addressLine2).toBeUndefined();
      expect(result.data.county).toBeUndefined();
    }
  });

  it('keeps a non-blank optional', () => {
    const result = addressSchema.safeParse({
      addressLine1: '1 Main St',
      addressLine2: 'Flat 2',
      city: 'London',
      county: 'Greater London',
      zip: 'SW1A 1AA',
      country: 'GB',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.addressLine2).toBe('Flat 2');
      expect(result.data.county).toBe('Greater London');
    }
  });
});

describe('shippingSchema', () => {
  it('requires a chosen shipping option', () => {
    const result = shippingSchema.safeParse({ shippingOptionId: null });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Choose a shipping method');
  });

  it('accepts a positive shipping option id', () => {
    const result = shippingSchema.safeParse({ shippingOptionId: 3 });
    expect(result.success).toBe(true);
  });
});

describe('buildPaymentSchema', () => {
  const methods = [
    paymentMethod({ slot: 'card', method: 'stripe' }),
    paymentMethod({
      slot: 'crypto',
      method: 'crypto',
      type: 'crypto',
      cryptoOptions: [
        { coin: 'btc', network: 'bitcoin', coinLabel: 'Bitcoin', networkLabel: 'Bitcoin', feeType: null, feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 0 },
      ],
    }),
  ];

  it('allows a non-crypto method with no coin/network', () => {
    const schema = buildPaymentSchema(methods);
    const result = schema.safeParse({ method: 'stripe', coin: '', network: '', useStoreCredit: false });
    expect(result.success).toBe(true);
  });

  it('rejects the crypto method without a coin and network', () => {
    const schema = buildPaymentSchema(methods);
    const result = schema.safeParse({ method: 'crypto', coin: '', network: '', useStoreCredit: false });
    expect(result.success).toBe(false);
  });

  it('accepts the crypto method once a coin and network are chosen', () => {
    const schema = buildPaymentSchema(methods);
    const result = schema.safeParse({ method: 'crypto', coin: 'btc', network: 'bitcoin', useStoreCredit: false });
    expect(result.success).toBe(true);
  });

  it('allows no method chosen at all (store credit may cover the order)', () => {
    const schema = buildPaymentSchema(methods);
    const result = schema.safeParse({ useStoreCredit: true });
    expect(result.success).toBe(true);
  });
});
