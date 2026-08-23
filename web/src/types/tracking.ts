// Mirrors the worker's POST /api/tracking response (worker/src/tracking.ts).
// Keep the two in sync — there is no shared package between them.

export type ShipmentStatus = 'shipped' | 'in_transit' | 'delivered' | 'returned';

/** §6 of TRACKING_API.MD. Widened with `string` because new values can ship
 *  server-side without a client release — every consumer needs a default case. */
export type ParcelStatus =
  | 'PRE_TRANSIT'
  | 'IN_TRANSIT'
  | 'CUSTOMS'
  | 'OUT_FOR_DELIVERY'
  | 'AVAILABLE_FOR_PICKUP'
  | 'DELIVERED'
  | 'EXCEPTION'
  | 'RETURNED'
  | 'UNKNOWN';

export interface TrackedEvent {
  occurredAt: string | null;
  place: string | null;
  code: string;
  text: string;
}

export interface ParcelTracking {
  outcome: 'ok' | 'not_found' | 'error';
  status: ParcelStatus | string | null;
  courierNumber: string | null;
  destination: { code: string; name: string | null } | null;
  lastEventAt: string | null;
  deliveredAt: string | null;
  events: TrackedEvent[];
  /** Destination-country carrier only. The worker strips every other carrier
   *  identity — forwarder name, origin-leg link, distributor — so there is no
   *  courier name to render anywhere else on the page. */
  lastMile: { name: string; url: string } | null;
  lastMileNumber: string | null;
  checkedAt: string | null;
  errorCode: string | null;
}

export interface TrackedParcel {
  trackingNumber: string | null;
  shipmentStatus: ShipmentStatus;
  shippedAt: string | null;
  deliveredAt: string | null;
  fallbackDescription: string | null;
  tracking: ParcelTracking | null;
}

export interface TrackingLookup {
  reference: string;
  status: string;
  createdAt: string;
  itemCount: number;
  isPreorder: boolean;
  parcels: TrackedParcel[];
  trackingAvailable: boolean;
  checkedAt: string | null;
}
