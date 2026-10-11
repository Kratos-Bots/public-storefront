import { parseStored, STORAGE_KEY, type ReminderMap } from '@/features/review-prompt/rules.ts';

/** Storage can be missing or throw (private windows, blocked site data): a reminder then works from memory alone. */
export function readStored(): ReminderMap {
  try {
    return parseStored(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

export function writeStored(map: ReminderMap): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* the load-scoped flag still keeps it to once per page load */
  }
}
