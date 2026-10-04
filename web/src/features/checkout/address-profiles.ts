// Which wording the address step uses for a delivery country. Labels only: required
// rules and formats are the same everywhere (the spec rules out postcode validation).

export type AddressProfileId = 'uk' | 'ie' | 'us' | 'ca' | 'au' | 'default';

export type AddressLabelKey =
  | 'checkout.address.city'
  | 'checkout.address.county'
  | 'checkout.address.zip'
  | 'checkout.address.townCity'
  | 'checkout.address.countyPlain'
  | 'checkout.address.postcode'
  | 'checkout.address.eircode'
  | 'checkout.address.state'
  | 'checkout.address.zipCode'
  | 'checkout.address.province'
  | 'checkout.address.suburb';

export interface AddressLabels {
  city: AddressLabelKey;
  county: AddressLabelKey;
  zip: AddressLabelKey;
}

const PROFILE_OF: Record<string, AddressProfileId> = {
  GB: 'uk', IM: 'uk', JE: 'uk', GG: 'uk',
  IE: 'ie',
  US: 'us',
  CA: 'ca',
  AU: 'au',
};

const LABELS: Record<AddressProfileId, AddressLabels> = {
  default: { city: 'checkout.address.city', county: 'checkout.address.county', zip: 'checkout.address.zip' },
  uk: { city: 'checkout.address.townCity', county: 'checkout.address.countyPlain', zip: 'checkout.address.postcode' },
  ie: { city: 'checkout.address.townCity', county: 'checkout.address.countyPlain', zip: 'checkout.address.eircode' },
  us: { city: 'checkout.address.city', county: 'checkout.address.state', zip: 'checkout.address.zipCode' },
  ca: { city: 'checkout.address.city', county: 'checkout.address.province', zip: 'checkout.address.zip' },
  au: { city: 'checkout.address.suburb', county: 'checkout.address.state', zip: 'checkout.address.postcode' },
};

export function addressProfile(country: string | null | undefined): AddressProfileId {
  return PROFILE_OF[(country ?? '').trim().toUpperCase()] ?? 'default';
}

/** The text keys for the three country-dependent labels. No country chosen = the neutral wording. */
export function addressLabels(country: string | null | undefined): AddressLabels {
  return LABELS[addressProfile(country)];
}
