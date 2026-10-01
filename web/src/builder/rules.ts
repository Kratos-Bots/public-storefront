import { BLOCKS } from '@/builder/registry.ts';
import type { AnyBlock, BlockDef } from '@/builder/define.ts';
import { familyAllowedOn, offersPart, type ContainerSpec, type PartFamily } from '@/builder/parts.ts';
import { isCardKey, isRecord, type ComponentData, type DocKey, type FixedRouteKey, type Issue, type LayoutKind, type PuckDoc } from '@/builder/types.ts';

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
  CardTile: ['card:tile'],
  CardRow: ['card:row'],
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
  'card:tile': ['CardTile'],
  'card:row': ['CardRow'],
};

/** Own-key lookup: an untrusted key like `constructor` or `__proto__` never resolves to an Object.prototype member. */
function own<V>(table: Readonly<Record<string, V>>, key: string): V | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/** The registered block for an untrusted `type`, or undefined. Use this, never `BLOCKS[type]`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function blockDef(type: string): BlockDef<any> | undefined {
  return own(BLOCKS, type);
}

/**
 * Blocks allowed at most once in any document. Two Headers would each publish their pinned-notice
 * stack's height as `--sf-pin-h` on the root and fight over it; two phone cart bars would stack
 * two fixed tabs at the foot.
 */
const AT_MOST_ONE: readonly string[] = ['Header', 'MobileCartBar'];

const AT_LEAST_ONE: Partial<Record<FixedRouteKey, readonly string[]>> = {
  catalog: ['ProductGrid', 'ProductList', 'WholesaleTable'],
};

/**
 * The slots of `item` a shopper sees: the block's `visibleSlots(props)` when it declares one (a
 * 2-column Columns hides col3/col4), else all of its slots. Only names from `def.slots` count.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shownSlots(def: BlockDef<any>, props: Record<string, unknown>): readonly string[] {
  if (!def.visibleSlots) return def.slots;
  const visible = def.visibleSlots(props);
  return def.slots.filter((s) => visible.includes(s));
}

/**
 * Every component in the doc, depth-first through each block's slots. `visibleOnly` (the default)
 * follows only the slots that render, so a required block parked in a hidden column counts as
 * missing; `false` reaches every stored block (placement and layout checks).
 */
function walk(items: readonly ComponentData[], visit: (c: ComponentData) => void, visibleOnly = true): void {
  for (const item of items) {
    visit(item);
    const def = blockDef(item.type);
    if (!def) continue;
    for (const s of visibleOnly ? shownSlots(def, item.props) : def.slots) {
      const children = item.props[s];
      if (Array.isArray(children)) walk(children as ComponentData[], visit, visibleOnly);
    }
  }
}

/** How many of each block a shopper sees (blocks in hidden slots — e.g. a hidden column — are not counted). */
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
  const def = blockDef(type);
  if (!def) return false;
  if (def.part) return familyAllowedOn(def.part.family, docKey);
  const bound = own(PLACEMENT, type);
  if (bound) return bound.includes(docKey);
  // A card design repeats once per product: only its frame and its parts (spec §3.4).
  if (isCardKey(docKey)) return false;
  if (SHELL_ONLY.includes(type)) return docKey === 'shell';
  if (docKey === 'shell') return def.category === 'shell' || def.category === 'content';
  return true;
}

const label = (type: string) => blockDef(type)?.label ?? type.slice(0, 60);

/** Editor copy naming each family's container, as a shopper-neutral noun. */
export const FAMILY_NOUN: Record<PartFamily, string> = {
  product: 'product page', catalogue: 'catalogue', 'card-tile': 'product card', 'card-row': 'product row',
  header: 'header', cart: 'cart', 'cart-summary': 'order summary', account: 'account page', orders: 'order history', order: 'order page',
  loyalty: 'loyalty page', referrals: 'referrals page', profile: 'profile page', login: 'sign-in page', payment: 'payment page',
  tracking: 'tracking page', verify: 'verification page',
};
const FAMILY_HOME: Record<PartFamily, string> = {
  product: 'Product detail', catalogue: 'product grid or product list', 'card-tile': 'product card', 'card-row': 'product row',
  header: 'Header', cart: 'Cart contents', 'cart-summary': 'Cart summary', account: 'account navigation', orders: 'Orders list',
  order: 'Order detail', loyalty: 'Loyalty block', referrals: 'Referrals block', profile: 'Profile block', login: 'Login options',
  payment: 'payment page block', tracking: 'Tracking lookup', verify: 'Verify form',
};
const REQUIRES_MESSAGE: Record<string, string> = {
  'CardTileAdd.CardTilePrice': 'A product card with an add button must also show the price.',
  'CardRowAdd.CardRowPrice': 'A product row with an add button must also show the price.',
};

const inLayout = (type: string, layout: LayoutKind): boolean => {
  const def = blockDef(type);
  return !!def && (def.layouts === 'all' || def.layouts.includes(layout));
};

/** A container's required parts that exist in `layout` (spec §4: parts not available are skipped). */
export function requiredParts(type: string, layout: LayoutKind): string[] {
  return (blockDef(type)?.container?.required ?? []).filter((t) => inLayout(t, layout));
}

/** Blocks a shopper must always be able to reach, whatever the doc (spec §10.2). */
const ALWAYS_REQUIRED: readonly string[] = ['PageOutlet', 'MobileCartBar'];

function requiredOn(docKey: DocKey): ReadonlySet<string> {
  const anyOf = own(AT_LEAST_ONE as Readonly<Record<string, readonly string[]>>, docKey) ?? [];
  return new Set([...(own(EXACTLY_ONE, docKey) ?? []), ...anyOf, ...ALWAYS_REQUIRED]);
}

/** The block's own (allowed, valid) `hide`, or null. `props` is untrusted. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hiddenAs(def: BlockDef<any>, props: Record<string, unknown>): 'mobile' | 'desktop' | null {
  const style = props.blockStyle;
  if (!def.style || !def.style.keys.includes('hide') || !isRecord(style)) return null;
  return style.hide === 'mobile' || style.hide === 'desktop' ? style.hide : null;
}

/** The first required block inside `item`'s visible slots, at any depth. */
function requiredInside(item: ComponentData, required: ReadonlySet<string>): string | null {
  const def = blockDef(item.type);
  if (!def) return null;
  const hits: string[] = [];
  for (const s of shownSlots(def, item.props)) {
    const children = item.props[s];
    if (Array.isArray(children)) walk(children as ComponentData[], (c) => { if (required.has(c.type)) hits.push(c.type); });
  }
  return hits[0] ?? null;
}

/** Every part must have a container of its family as its nearest container ancestor (all slots, hidden ones too). */
function checkPartPlacement(items: readonly ComponentData[], owner: ContainerSpec | null, docKey: DocKey, flagged: Set<string>, issues: Issue[]): void {
  for (const c of items) {
    const def = blockDef(c.type);
    if (!def) continue;
    const sameFamily = !!def.part && !!owner && owner.family === def.part.family;
    const bad = !!def.part && !(sameFamily && offersPart(owner!, c.type));
    if (def.part && bad && !flagged.has(`part-placement:${c.type}`)) {
      flagged.add(`part-placement:${c.type}`);
      issues.push({
        docKey, rule: `part-placement:${c.type}`, blockId: c.props.id,
        message: sameFamily
          ? `${label(c.type)} isn't available on this page's ${FAMILY_NOUN[def.part.family]}.`
          : `${label(c.type)} can only sit inside the ${FAMILY_HOME[def.part.family]}.`,
      });
    }
    const next = def.container ?? owner;
    for (const s of def.slots) {
      const children = c.props[s];
      if (Array.isArray(children)) checkPartPlacement(children as ComponentData[], next, docKey, flagged, issues);
    }
  }
}

/**
 * The first route block or container anywhere under `items` (every slot, hidden ones included, like
 * `placement`): a container's slots never hold one, however deep in content blocks (spec §3.4).
 */
function foreignInside(items: readonly ComponentData[], nests: readonly string[] = []): ComponentData | undefined {
  let found: ComponentData | undefined;
  // A nested container (listed in `nests`) is allowed, and what it holds is its own business: the walk
  // skips its descendants by collecting them first.
  const skipped = new Set<ComponentData>();
  const mark = (list: readonly ComponentData[]) => walk(list, (x) => { skipped.add(x); }, false);
  walk(items, (c) => {
    if (skipped.has(c)) return;
    if (nests.includes(c.type)) {
      const d = blockDef(c.type);
      if (d) for (const s of d.slots) { const kids = c.props[s]; if (Array.isArray(kids)) mark(kids as ComponentData[]); }
      return;
    }
    const d = blockDef(c.type);
    if (!found && d && (d.routeBound || d.container)) found = c;
  }, false);
  return found;
}

/** The first block of one of `types` under `items`, through every slot; a nested container is tested but not entered. */
function rejectedInside(items: readonly ComponentData[], types: readonly string[]): ComponentData | undefined {
  for (const c of items) {
    if (types.includes(c.type)) return c;
    const d = blockDef(c.type);
    if (!d || d.container) continue;
    for (const s of d.slots) {
      const kids = c.props[s];
      if (!Array.isArray(kids)) continue;
      const hit = rejectedInside(kids as ComponentData[], types);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** Spec §4 for one container instance: counts through visible slots, stopping at a nested container. */
function containerIssues(item: ComponentData, def: AnyBlock, docKey: DocKey, layout: LayoutKind): Issue[] {
  const spec = def.container!;
  const issues: Issue[] = [];
  const noun = FAMILY_NOUN[spec.family];
  const blockId = item.props.id;
  const required = new Set(requiredParts(def.name, layout));
  const counts = new Map<string, number>();
  // One issue per hidden holder (its first required part), like the doc-level rule.
  const hiddenHolders = new Map<ComponentData, string>();
  const hiddenParts = new Map<string, ComponentData>();
  const visit = (items: readonly ComponentData[], hidden: ComponentData | null) => {
    for (const c of items) {
      counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
      if (hidden && required.has(c.type) && !hiddenHolders.has(hidden)) hiddenHolders.set(hidden, c.type);
      const d = blockDef(c.type);
      // A required part that carries its own `hide` (header brand, payment reference...): once per type.
      if (d && required.has(c.type) && hiddenAs(d, c.props) && !hiddenParts.has(c.type)) hiddenParts.set(c.type, c);
      if (!d || d.container) continue;
      const nextHidden = hidden ?? (hiddenAs(d, c.props) ? c : null);
      for (const s of shownSlots(d, c.props)) {
        const children = c.props[s];
        if (Array.isArray(children)) visit(children as ComponentData[], nextHidden);
      }
    }
  };
  for (const s of shownSlots(def, item.props)) {
    const children = item.props[s];
    if (Array.isArray(children)) visit(children as ComponentData[], null);
  }
  for (const r of required) {
    const n = counts.get(r) ?? 0;
    if (n !== 1) {
      issues.push({ docKey, rule: `part-required:${def.name}.${r}`, blockId,
        message: n === 0 ? `The ${noun} needs its ${label(r)}.` : `The ${noun} can show its ${label(r)} only once.` });
    }
  }
  for (const u of spec.unique) {
    if (!required.has(u) && (counts.get(u) ?? 0) > 1) {
      issues.push({ docKey, rule: `part-unique:${def.name}.${u}`, blockId, message: `The ${noun} can show its ${label(u)} only once.` });
    }
  }
  for (const [p, needs] of spec.requires ?? []) {
    if ((counts.get(p) ?? 0) > 0 && (counts.get(needs) ?? 0) === 0) {
      issues.push({ docKey, rule: `part-requires:${p}.${needs}`, blockId,
        message: own(REQUIRES_MESSAGE, `${p}.${needs}`) ?? `${label(p)} needs the ${label(needs)} beside it.` });
    }
  }
  for (const [holder, part] of hiddenHolders) {
    const hide = hiddenAs(blockDef(holder.type)!, holder.props);
    issues.push({ docKey, rule: `hidden-required:${holder.type}`, blockId: holder.props.id,
      message: `${label(holder.type)} is hidden ${hide === 'mobile' ? 'below' : 'from'} 992 px but holds the ${label(part)}, which every shopper must see.` });
  }
  for (const [type, part] of hiddenParts) {
    issues.push({ docKey, rule: `hidden-required:${type}`, blockId: part.props.id,
      message: `${label(type)} can't be hidden: every shopper must see it.` });
  }
  for (const s of def.slots) {
    const children = item.props[s];
    if (!Array.isArray(children)) continue;
    const only = spec.slotAccepts ? own(spec.slotAccepts, s) ?? null : null;
    const bad = only ? (children as ComponentData[]).find((c) => !only.includes(c.type)) : foreignInside(children as ComponentData[], spec.nests);
    if (bad) {
      issues.push({ docKey, rule: `slot-accepts:${def.name}.${s}`, blockId: bad.props.id,
        message: only
          ? `${label(bad.type)} can't sit there: that area of the ${noun} holds only ${only.map(label).join(', ')}.`
          : `${label(bad.type)} can't sit inside the ${label(def.name)}.` });
    }
  }
  for (const s of def.slots) {
    const rejects = spec.slotRejects ? own(spec.slotRejects, s) : undefined;
    const children = item.props[s];
    if (!rejects || !Array.isArray(children)) continue;
    const bad = rejectedInside(children as ComponentData[], rejects);
    if (bad) {
      issues.push({ docKey, rule: `slot-rejects:${def.name}.${s}`, blockId: bad.props.id,
        message: `${label(bad.type)} can't sit there: that area of the ${noun} never shows it.` });
    }
  }
  return issues;
}

export function checkRules(doc: PuckDoc, docKey: DocKey, layout: LayoutKind): Issue[] {
  const issues: Issue[] = [];
  const flagged = new Set<string>();
  walk(doc.content, (c) => {
    const def = blockDef(c.type);
    if (def && def.layouts !== 'all' && !def.layouts.includes(layout) && !flagged.has(`layout:${c.type}`)) {
      flagged.add(`layout:${c.type}`);
      issues.push({ docKey, rule: `layout:${c.type}`, message: `${label(c.type)} is not available in the ${layout} layout.`, blockId: c.props.id });
    }
    if (!allowedOn(c.type, docKey) && !flagged.has(`placement:${c.type}`)) {
      flagged.add(`placement:${c.type}`);
      issues.push({ docKey, rule: `placement:${c.type}`, message: `${label(c.type)} can't be placed on this page.`, blockId: c.props.id });
    }
  }, false);
  // Counts (exactly-one, at-most-one, at-least-one) are of what renders: see `walk`.
  const counts = countBlocks(doc);
  for (const type of own(EXACTLY_ONE, docKey) ?? []) {
    if ((counts.get(type) ?? 0) !== 1) {
      issues.push({ docKey, rule: `exactly-one:${type}`, message: `This page needs exactly one ${label(type)} block.` });
    }
  }
  for (const type of AT_MOST_ONE) {
    if ((counts.get(type) ?? 0) > 1) {
      issues.push({ docKey, rule: `at-most-one:${type}`, message: `This page can have only one ${label(type)} block.` });
    }
  }
  const anyOf = own(AT_LEAST_ONE, docKey);
  if (anyOf && !anyOf.some((t) => (counts.get(t) ?? 0) > 0)) {
    issues.push({ docKey, rule: `at-least-one:${docKey}`, message: `This page needs a product grid, product list or trade list.` });
  }
  // Parts: placement through every slot, then each container instance on its own (spec §3.4, §4).
  checkPartPlacement(doc.content, null, docKey, flagged, issues);
  walk(doc.content, (c) => {
    const def = blockDef(c.type);
    if (def?.container) issues.push(...containerIssues(c, def, docKey, layout));
  });
  // A hidden block may not hold anything a shopper must see (spec §10.2): walk what renders.
  const required = requiredOn(docKey);
  walk(doc.content, (c) => {
    const def = blockDef(c.type);
    const hide = def ? hiddenAs(def, c.props) : null;
    if (!def || !hide) return;
    const inner = requiredInside(c, required);
    if (inner === null) return;
    issues.push({
      docKey,
      rule: `hidden-required:${c.type}`,
      message: `${label(c.type)} is hidden ${hide === 'mobile' ? 'below' : 'from'} 992 px but holds the ${label(inner)}, which every shopper must see.`,
      blockId: c.props.id,
    });
  });
  return issues;
}
