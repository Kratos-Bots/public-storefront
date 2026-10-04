/** A carrier pick-up point, as `GET storefront/service-points` returns it. */
export interface ServicePoint {
  id: string;
  carrier: string;
  name: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  /** Metres from the searched postcode, when the carrier reports it. */
  distance: number | null;
}
export interface ServicePointSearch { available: boolean; carriers: string[]; points: ServicePoint[] }
