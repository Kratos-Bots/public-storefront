import { BLOCKS } from '@/builder/registry.ts';
import type { ComponentData, DocKey, FixedRouteKey, Issue, LayoutKind, PuckDoc } from '@/builder/types.ts';

const ACCOUNT: readonly DocKey[] = ['account.orders', 'account.order', 'account.loyalty', 'account.referrals', 'account.profile'];

/**
 * Placement-restricted blocks and the doc(s) they may appear on: the §5.3 route blocks (routeBound,
 * including the catalog list blocks) plus AccountNav. Anything listed here is refused elsewhere —
 * in particular on custom pages.
 */
export const PLACEMENT: Record<string, readonly DocKey[]> = {
  PageOutlet: ['shell'],
  ProductGrid: ['catalog'],
  ProductList: ['catalog'],
  WholesaleTable: ['catalog'],
  ProductDetail: ['product'],
  CartContents: ['cart'],
  CartSummary: ['cart'],
  CheckoutFlow: ['checkout'],
  LoginOptions: ['login'],
  AccountNav: ACCOUNT,
  OrdersList: ['account.orders'],
  OrderDetail: ['account.order'],
  Loyalty: ['account.loyalty'],
  Referrals: ['account.referrals'],
  Profile: ['account.profile'],
  OrderStatus: ['order-status'],
  PaymentSuccess: ['payment-success'],
  PaymentCancel: ['payment-cancel'],
  OrderPlaced: ['order-placed'],
  VerifyForm: ['verify'],
  TrackingLookup: ['tracking'],
};

/** Chrome that only makes sense in the shell document. */
export const SHELL_ONLY: readonly string[] = ['PageOutlet', 'Header', 'Footer', 'TopBar', 'MobileCartBar'];

const EXACTLY_ONE: Partial<Record<DocKey, readonly string[]>> = {
  shell: ['PageOutlet'],
  product: ['ProductDetail'],
  cart: ['CartContents', 'CartSummary'],
  checkout: ['CheckoutFlow'],
  login: ['LoginOptions'],
  'account.orders': ['OrdersList'],
  'account.order': ['OrderDetail'],
  'account.loyalty': ['Loyalty'],
  'account.referrals': ['Referrals'],
  'account.profile': ['Profile'],
  'order-status': ['OrderStatus'],
  'payment-success': ['PaymentSuccess'],
  'payment-cancel': ['PaymentCancel'],
  'order-placed': ['OrderPlaced'],
  verify: ['VerifyForm'],
  tracking: ['TrackingLookup'],
};

const AT_LEAST_ONE: Partial<Record<FixedRouteKey, readonly string[]>> = {
  catalog: ['ProductGrid', 'ProductList', 'WholesaleTable'],
};

/** Every component in the doc, depth-first through each block's declared slots. */
function walk(items: readonly ComponentData[], visit: (c: ComponentData) => void): void {
  for (const item of items) {
    visit(item);
    const def = BLOCKS[item.type];
    if (!def) continue;
    for (const s of def.slots) {
      const children = item.props[s];
      if (Array.isArray(children)) walk(children as ComponentData[], visit);
    }
  }
}

export function countBlocks(doc: PuckDoc): Map<string, number> {
  const counts = new Map<string, number>();
  walk(doc.content, (c) => counts.set(c.type, (counts.get(c.type) ?? 0) + 1));
  return counts;
}

/**
 * Whether a block of `type` may sit in `docKey` (layout aside — see `BlockDef.layouts`).
 * Plan 3's editor filters its "Add block" menu and refuses drops with this.
 */
export function allowedOn(type: string, docKey: DocKey): boolean {
  const bound = PLACEMENT[type];
  if (bound) return bound.includes(docKey);
  if (SHELL_ONLY.includes(type)) return docKey === 'shell';
  if (docKey === 'shell') {
    const category = BLOCKS[type]?.category;
    return category === 'shell' || category === 'content';
  }
  return true;
}

const label = (type: string) => BLOCKS[type]?.label ?? type;

export function checkRules(doc: PuckDoc, docKey: DocKey, layout: LayoutKind): Issue[] {
  const issues: Issue[] = [];
  const flagged = new Set<string>();
  walk(doc.content, (c) => {
    const def = BLOCKS[c.type];
    if (def && def.layouts !== 'all' && !def.layouts.includes(layout) && !flagged.has(`layout:${c.type}`)) {
      flagged.add(`layout:${c.type}`);
      issues.push({ docKey, rule: `layout:${c.type}`, message: `${label(c.type)} is not available in the ${layout} layout.`, blockId: c.props.id });
    }
    if (!allowedOn(c.type, docKey) && !flagged.has(`placement:${c.type}`)) {
      flagged.add(`placement:${c.type}`);
      issues.push({ docKey, rule: `placement:${c.type}`, message: `${label(c.type)} can't be placed on this page.`, blockId: c.props.id });
    }
  });
  const counts = countBlocks(doc);
  for (const type of EXACTLY_ONE[docKey] ?? []) {
    if ((counts.get(type) ?? 0) !== 1) {
      issues.push({ docKey, rule: `exactly-one:${type}`, message: `This page needs exactly one ${label(type)} block.` });
    }
  }
  const anyOf = AT_LEAST_ONE[docKey as FixedRouteKey];
  if (anyOf && !anyOf.some((t) => (counts.get(t) ?? 0) > 0)) {
    issues.push({ docKey, rule: `at-least-one:${docKey}`, message: `This page needs a product grid, product list or trade list.` });
  }
  return issues;
}
