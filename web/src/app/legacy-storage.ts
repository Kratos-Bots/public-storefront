/** The saved-order-links store of a release before the order page lived in the account: up to 50 `{ reference, accessKey }` pairs. */
export const LEGACY_ORDER_KEYS_STORAGE_KEY = 'sf-orders-v1';

/**
 * Removes the key store a browser may still hold from that release. Each access key is a bearer credential for the
 * backend's key-based order API, which stays live for another client, and signing out used to clear them, so
 * leaving them behind would be a regression. Runs once at boot and on sign-out; it can be deleted in a later release,
 * once no browser can still hold the key.
 */
export function clearLegacyOrderKeys(): void {
  try {
    window.localStorage.removeItem(LEGACY_ORDER_KEYS_STORAGE_KEY);
  } catch {
    // Storage blocked or unavailable: there is nothing stored that could be read either.
  }
}
