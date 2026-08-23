// Order links the visitor has opened — groundwork for a future "your orders"
// list. Written only after a link is proven valid (successful order fetch), so
// mistyped URLs never pollute the store.
const STORAGE_KEY = 'sf-orders-v1';
const MAX_ENTRIES = 50;

export interface SavedOrder {
  reference: string;
  accessKey: string;
  savedAt: string; // ISO 8601
}

export function listSavedOrders(): SavedOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (o): o is SavedOrder =>
        !!o &&
        typeof (o as SavedOrder).reference === 'string' &&
        typeof (o as SavedOrder).accessKey === 'string' &&
        typeof (o as SavedOrder).savedAt === 'string',
    );
  } catch {
    return [];
  }
}

export function saveOrder(reference: string, accessKey: string): void {
  try {
    const rest = listSavedOrders().filter((o) => o.reference !== reference);
    const next: SavedOrder[] = [
      { reference, accessKey, savedAt: new Date().toISOString() },
      ...rest,
    ].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore (private mode / storage full)
  }
}

export function findSavedOrder(reference: string): SavedOrder | null {
  return listSavedOrders().find((o) => o.reference === reference) ?? null;
}
