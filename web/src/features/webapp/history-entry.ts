/**
 * Whether this is the first entry of the tab's history (react-router keeps its
 * own index in `history.state`). A page opened straight onto a deep link has
 * nothing behind it, so "back" must go home rather than leave the shop.
 */
export function isFirstHistoryEntry(): boolean {
  return (window.history.state as { idx?: number } | null)?.idx === 0;
}
