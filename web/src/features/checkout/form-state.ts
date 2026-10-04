// Checkout form state + its localStorage persistence. Kept separate from any React
// context/provider (unlike the menu's CheckoutContext) so this task's schemas/hook can
// be tested headlessly; a later task wires this into whatever owns the checkout screen.
import type { ServicePoint } from '@/types/service-points.ts';

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
  addressLine3: string;
  city: string;
  county: string;
  zip: string;
  country: string;
  /** Home delivery, or collection from a carrier pick-up point. */
  deliveryMethod: 'home' | 'collection';
  /** The chosen pick-up point. Kept while the shopper is on home delivery so switching back restores it; cleared when the country changes. */
  servicePoint: ServicePoint | null;
  /** What the shopper last searched for in the point picker. */
  pointPostcode: string;
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
  addressLine3: '',
  city: '',
  county: '',
  zip: '',
  country: '',
  deliveryMethod: 'home',
  servicePoint: null,
  pointPostcode: '',
  shippingOptionId: null,
  couponCode: '',
  useStoreCredit: false,
  paymentMethod: '',
  coin: '',
  network: '',
  notes: '',
};

const STORAGE_KEY = 'sf-checkout-v1';

const POINT_STRINGS = ['id', 'carrier', 'name', 'street', 'houseNumber', 'postalCode', 'city', 'country'] as const;
const finiteOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A stored pick-up point is only trusted if every text field is a string; rebuilt from exactly the known fields, anything else is dropped. */
export function sanitiseServicePoint(value: unknown): ServicePoint | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!POINT_STRINGS.every((k) => typeof v[k] === 'string')) return null;
  return {
    id: v.id as string,
    carrier: v.carrier as string,
    name: v.name as string,
    street: v.street as string,
    houseNumber: v.houseNumber as string,
    postalCode: v.postalCode as string,
    city: v.city as string,
    country: v.country as string,
    latitude: finiteOrNull(v.latitude),
    longitude: finiteOrNull(v.longitude),
    distance: finiteOrNull(v.distance),
  };
}

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
    const merged = { ...DEFAULT_FORM, ...(parsed as Partial<CheckoutForm>) };
    return {
      ...merged,
      deliveryMethod: merged.deliveryMethod === 'collection' ? 'collection' : 'home',
      servicePoint: sanitiseServicePoint(merged.servicePoint),
      pointPostcode: typeof merged.pointPostcode === 'string' ? merged.pointPostcode : '',
    };
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
