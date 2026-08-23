// Checkout form state + its localStorage persistence. Kept separate from any React
// context/provider (unlike the menu's CheckoutContext) so this task's schemas/hook can
// be tested headlessly; a later task wires this into whatever owns the checkout screen.

export interface CheckoutForm {
  firstName: string;
  surname: string;
  email: string;
  phone: string;
  /** ISO-3166-1 alpha-2 the phone-prefix picker is set to (e.g. 'GB'). */
  phonePrefix: string;
  /** True once the shopper has picked a prefix themselves — once set, neither a
   *  config default nor a shipping-country sync may overwrite it. */
  phonePrefixTouched: boolean;
  addressLine1: string;
  addressLine2: string;
  city: string;
  county: string;
  zip: string;
  country: string;
  shippingOptionId: number | null;
  couponCode: string;
  useStoreCredit: boolean;
  paymentMethod: string;
  coin: string;
  network: string;
  notes: string;
}

export const DEFAULT_FORM: CheckoutForm = {
  firstName: '',
  surname: '',
  email: '',
  phone: '',
  phonePrefix: '',
  phonePrefixTouched: false,
  addressLine1: '',
  addressLine2: '',
  city: '',
  county: '',
  zip: '',
  country: '',
  shippingOptionId: null,
  couponCode: '',
  useStoreCredit: false,
  paymentMethod: '',
  coin: '',
  network: '',
  notes: '',
};

const STORAGE_KEY = 'sf-checkout-v1';

/**
 * Restore a persisted checkout form, if any. Merged over `DEFAULT_FORM` so a field
 * added in a later version gets a sane default rather than `undefined`. There is no
 * token field on `CheckoutForm` to strip — the turnstile token is single-use and is
 * threaded through `useQuote`'s options / the submit handler, never stored here.
 */
export function loadPersistedForm(): CheckoutForm | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return { ...DEFAULT_FORM, ...(parsed as Partial<CheckoutForm>) };
  } catch {
    return null;
  }
}

export function persistForm(form: CheckoutForm): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
  } catch {
    // ignore (private mode / storage full)
  }
}

/** Wipe the persisted checkout form — call after a completed order. */
export function clearPersistedCheckout(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore (private mode / storage disabled)
  }
}
