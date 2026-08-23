import { z } from 'zod';
import type { PaymentMethod } from '@/types/checkout.ts';
import type { ContactFieldMode, ContactModes } from '@/types/settings.ts';
import { composePhoneNumber } from '@/lib/dial-codes.ts';

// Port of the menu's `buildContactStepSchema` (ecommerce-menu/web/src/features/checkout/schemas.ts),
// extended with a guest-specific refine (backend §3.5a: a guest must supply at least one
// of email/phone regardless of contactModes — there's no session identity to fall back on).

const emailRule = z.string().trim().toLowerCase().email('Valid email required').max(255);
const phoneRule = z.string().trim().max(30);

// Whitespace-only input (e.g. "  ") must be treated as absent for optional fields — trimming
// happens inside `rule`, but a bare `.optional()` only treats an `undefined` input as absent,
// not a blank string, so blank-to-undefined is preprocessed in first.
function contactField(mode: ContactFieldMode, rule: z.ZodString) {
  if (mode === 'hidden') return z.unknown().transform(() => undefined as string | undefined);
  if (mode === 'required') return rule.min(1, 'Required');
  return z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    rule.optional(),
  );
}

export function buildContactSchema(contactModes: ContactModes, { guest }: { guest: boolean }) {
  return z
    .object({
      firstName: z.string().trim().min(1, 'Required').max(100),
      surname: z.string().trim().min(1, 'Required').max(100),
      email: contactField(contactModes.emailMode, emailRule),
      // `phone` here is the shopper-typed national number; `phonePrefix` is the
      // ISO-2 the dial-code picker is set to. Presence/required validation runs on
      // the national text (unchanged rule), then the transform below composes the
      // `+CC`-prefixed value that actually reaches the backend — so a blank optional
      // phone stays `undefined` rather than becoming a bare "+44".
      phone: contactField(contactModes.phoneMode, phoneRule),
      phonePrefix: z.string().trim().optional().default(''),
    })
    .transform(({ phonePrefix, ...rest }) => ({
      ...rest,
      phone: rest.phone === undefined ? undefined : composePhoneNumber(phonePrefix, rest.phone),
    }))
    .superRefine((value, ctx) => {
      if (!guest) return;
      if (value.email || value.phone) return;
      ctx.addIssue({ code: 'custom', message: 'Email or phone is required', path: ['email'] });
    });
}

export type ContactFormValue = z.infer<ReturnType<typeof buildContactSchema>>;

// Blank-to-undefined via the same preprocess idiom as `contactField` above — NOT the menu's
// `.optional().or(z.literal('').transform(...))`, which under this zod version never actually
// converts '' to undefined (`.optional()` already accepts '' as a valid string, so the `.or()`
// branch is dead code and the blank string passes through unchanged).
function optionalTrimmed(rule: z.ZodString) {
  return z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    rule.optional(),
  );
}

export const addressSchema = z.object({
  addressLine1: z.string().trim().min(1, 'Required').max(255),
  addressLine2: optionalTrimmed(z.string().trim().max(255)),
  city: z.string().trim().min(1, 'Required').max(100),
  county: optionalTrimmed(z.string().trim().max(100)),
  zip: z.string().trim().min(1, 'Required').max(20),
  country: z.string().trim().length(2, 'Select your country'),
});

export type AddressFormValue = z.infer<typeof addressSchema>;

export const shippingSchema = z.object({
  shippingOptionId: z.number({ message: 'Choose a shipping method' }).int().positive(),
});

export interface PaymentFormValue {
  method?: string;
  coin?: string;
  network?: string;
  useStoreCredit: boolean;
}

/**
 * `methods` is the quote's `paymentMethods` — needed because whether coin/network are
 * required depends on whether the *chosen* method is the crypto one (`cryptoOptions`
 * present), which is only known once a quote has come back.
 */
export function buildPaymentSchema(methods: PaymentMethod[]) {
  return z
    .object({
      method: z.string().trim().optional(),
      coin: z.string().trim().optional(),
      network: z.string().trim().optional(),
      useStoreCredit: z.boolean(),
    })
    .refine(
      (value) => {
        const chosen = methods.find((m) => m.method === value.method);
        if (!chosen?.cryptoOptions) return true;
        return Boolean(value.coin) && Boolean(value.network);
      },
      { message: 'Choose a coin and network', path: ['coin'] },
    );
}
