/**
 * Where the warehouse bar (the "Shipping from" selector and the not-taking-orders notice) belongs: while the
 * shopper is browsing products - the catalogue (`/`, `/c/:slug`) and the product page (`/p/:id`; the product
 * sheet is `/?p=id`, so it is the catalogue). Cart, checkout, account, login, tracking and custom pages are
 * not browsing, and the choice is made before them. Deliberately its own list: the first-visit prompt
 * (`isPromptRoute`) answers a different question.
 */
export function isWarehouseBarRoute(pathname: string): boolean {
  return pathname === '/' || /^\/(c|p)\/[^/]+\/?$/.test(pathname);
}
