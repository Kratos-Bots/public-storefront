import { defaultDoc } from '@/builder/defaults/index.ts';
import type { PageText } from '@/text/types.ts';
import { validateDoc } from '@/builder/guard.ts';
import { isDocKey } from '@/builder/editor/protocol.ts';
import { upgradeDoc } from '@/builder/upgrade.ts';
import {
  CARD_KINDS, CUSTOM_SLUG_RE, cardKey, cardKind, isCardKey, isFixedRouteKey, type ComponentData, type DocKey, type Issue, type LayoutKind,
  type PageRootProps, type PageSet, type PuckDoc,
} from '@/builder/types.ts';

// Plan 2 owns these; re-exported so editor code has one import site for the page-set model.
export { CUSTOM_SLUG_RE, isFixedRouteKey };

export type DocMap = Partial<Record<DocKey, PuckDoc>>;
export type CustomKey = `page:${string}`;

export const MAX_CUSTOM_PAGES = 50;
/** Backend limits on a page's root props; the guard silently falls back past them, so the editor flags them. */
export const MAX_TITLE = 120;
export const MAX_DESCRIPTION = 300;

export const isCustomKey = (key: string): key is CustomKey => key.startsWith('page:') && isDocKey(key);

/** Puck hands back whatever it holds; this is the one shape we store and compare. */
export function normalizeDoc(doc: unknown, docKey: DocKey): PuckDoc {
  const d = (doc ?? {}) as { root?: { props?: Record<string, unknown> }; content?: unknown; zones?: Record<string, ComponentData[]> };
  const p = d.root?.props ?? {};
  const props: PageRootProps = {
    title: typeof p.title === 'string' ? p.title : '',
    description: typeof p.description === 'string' ? p.description : '',
    chrome: docKey !== 'shell' && p.chrome === 'none' ? 'none' : 'shell',
  };
  const content = Array.isArray(d.content) ? (d.content as ComponentData[]).map(stringifyRichtext) : [];
  const zones = d.zones && typeof d.zones === 'object' && Object.keys(d.zones).length > 0 ? stringifyRichtext(d.zones) : undefined;
  return zones ? { root: { props }, content, zones } : { root: { props }, content };
}

/**
 * Backend contract: every `*Html` prop is an HTML string (a non-string is a 400). Puck stores
 * richtext as a string, but hands blocks a React node while editing — if one ever leaks into
 * the data, it is unrecoverable as HTML, so it becomes '' (warned once per prop name) rather than
 * poisoning every later autosave. Applies at any depth: slots, arrays and objects.
 */
const warnedHtmlKeys = new Set<string>();

function stringifyRichtext<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stringifyRichtext) as T;
  if (!value || typeof value !== 'object' || !isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (key.endsWith('Html') && typeof v !== 'string') {
      if (!warnedHtmlKeys.has(key)) {
        warnedHtmlKeys.add(key);
        console.warn(`[builder] ${key} was not an HTML string; cleared`);
      }
      out[key] = '';
    } else {
      out[key] = stringifyRichtext(v);
    }
  }
  return out as T;
}

const isPlainObject = (v: object): boolean => {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export const sameDoc = (a: PuckDoc, b: PuckDoc): boolean => stableStringify(a) === stableStringify(b);

function defaultFor(docKey: DocKey, layout: LayoutKind): PuckDoc | null {
  const d = defaultDoc(docKey, layout);
  return d ? normalizeDoc(d, docKey) : null;
}

/**
 * Whether a doc key can be shown (and so edited or reset) in this layout. Stage 3: every key — the
 * product document is the storefront's page and the menu/webapp sheet (spec §7.2), and the card
 * docs exist in every layout (spec §6.1).
 */
export const isShownIn = (_docKey: DocKey, _layout: LayoutKind): boolean => true;

const ID_MAX = 64;

const isComponent = (c: unknown): c is ComponentData =>
  !!c && typeof c === 'object' && !!(c as ComponentData).props && typeof (c as ComponentData).props.id === 'string';

/**
 * Makes every component id in the doc unique (content, zones and every slot, at any depth). The
 * first holder of an id keeps it; a later one becomes `${id}-${n}` (trimmed to 64 chars), never an
 * id already taken. Needed after upgradeDoc (ledger CARRY, Task 4): filled part ids derive from the
 * first 40 chars of their container's id, so two containers sharing that prefix — or a stored part
 * already holding a derived id — would collide, and Puck would conflate them. Pure; the same object
 * when nothing was duplicated.
 */
export function dedupeIds(doc: PuckDoc): PuckDoc {
  const taken = new Set<string>();
  const collect = (items: readonly ComponentData[]) => {
    for (const c of items) {
      if (!isComponent(c)) continue;
      taken.add(c.props.id);
      for (const v of Object.values(c.props)) if (isComponentArray(v)) collect(v);
    }
  };
  collect(doc.content);
  for (const list of Object.values(doc.zones ?? {})) if (Array.isArray(list)) collect(list);

  const seen = new Set<string>();
  const fresh = (id: string): string => {
    for (let n = 2; ; n++) {
      const suffix = `-${n}`;
      const candidate = `${id.slice(0, ID_MAX - suffix.length)}${suffix}`;
      if (!taken.has(candidate)) {
        taken.add(candidate);
        return candidate;
      }
    }
  };
  const fix = (items: ComponentData[]): ComponentData[] => {
    let changed = false;
    const out = items.map((c) => {
      if (!isComponent(c)) return c;
      let props = c.props;
      if (seen.has(props.id)) props = { ...props, id: fresh(props.id) };
      seen.add(props.id);
      for (const [k, v] of Object.entries(props)) {
        if (!isComponentArray(v)) continue;
        const next = fix(v);
        if (next !== v) props = { ...props, [k]: next };
      }
      if (props === c.props) return c;
      changed = true;
      return { ...c, props };
    });
    return changed ? out : items;
  };
  const content = fix(doc.content);
  let zones = doc.zones;
  if (zones) {
    const next: Record<string, ComponentData[]> = {};
    let changed = false;
    for (const [key, list] of Object.entries(zones)) {
      next[key] = Array.isArray(list) ? fix(list) : list;
      if (next[key] !== list) changed = true;
    }
    if (changed) zones = next;
  }
  return content === doc.content && zones === doc.zones ? doc : { ...doc, content, ...(zones ? { zones } : {}) };
}

/** A stored doc as the editor holds it: normalized, upgraded (spec §8: absent slots filled), ids unique. */
const loaded = (doc: unknown, key: DocKey, layout: LayoutKind): PuckDoc => dedupeIds(upgradeDoc(normalizeDoc(doc, key), key, layout));

/**
 * The editor's view of a stored set: its pages (never `shell` or a card key) plus `cards.*` as
 * `card:*`, each upgraded on load so Puck only ever sees full slots (spec §8). Kept sparse: fixed
 * pages and card docs equal to their default are dropped. The difference — and every upgrade — goes
 * out with the baseline change that follows every load, so an already-edited v0.7.0 doc shows once
 * as changed (ledger ruling).
 */
export function docsFromPageSet(pageSet: PageSet | null, layout: LayoutKind): DocMap {
  if (!pageSet) return { shell: defaultFor('shell', layout)! };
  let docs: DocMap = { shell: loaded(pageSet.shell, 'shell', layout) };
  for (const [key, doc] of Object.entries(pageSet.pages)) {
    if (doc && isDocKey(key) && key !== 'shell' && !isCardKey(key)) docs = withDoc(docs, key, loaded(doc, key, layout), layout);
  }
  for (const kind of CARD_KINDS) {
    const doc = pageSet.cards?.[kind];
    if (doc) docs = withDoc(docs, cardKey(kind), loaded(doc, cardKey(kind), layout), layout);
  }
  return docs;
}

/**
 * `text` = this layout's overrides as they should be sent; omitted when undefined or empty (spec §7.4).
 * Card docs go to `cards` (absent when there are none), never to `pages` (spec §6.1).
 */
export function toPageSet(docs: DocMap, layout: LayoutKind, text?: PageText): PageSet {
  const pages: PageSet['pages'] = {};
  const cards: NonNullable<PageSet['cards']> = {};
  for (const [key, doc] of Object.entries(docs) as Array<[DocKey, PuckDoc | undefined]>) {
    if (!doc || key === 'shell') continue;
    if (isCardKey(key)) cards[cardKind(key)] = doc;
    else pages[key] = doc;
  }
  const set: PageSet = { schemaVersion: 1, shell: docs.shell ?? defaultFor('shell', layout)!, pages };
  if (Object.keys(cards).length > 0) set.cards = cards;
  if (text && Object.values(text.strings).some((m) => Object.keys(m).length > 0)) set.text = text;
  return set;
}

const emptyPage = (): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content: [] });

/** What the canvas shows for a key: the edited doc, else the built-in default. */
export function docFor(docs: DocMap, docKey: DocKey, layout: LayoutKind): PuckDoc {
  return docs[docKey] ?? defaultFor(docKey, layout) ?? emptyPage();
}

/**
 * Store an edit, keeping the set sparse: a fixed page or card doc equal to its default is not stored
 * (absent = the built-in page or card design).
 * Returns the same object when nothing changed so subscribers can skip work.
 */
export function withDoc(docs: DocMap, docKey: DocKey, doc: PuckDoc, layout: LayoutKind): DocMap {
  const current = docs[docKey];
  if (isFixedRouteKey(docKey) || isCardKey(docKey)) {
    const def = defaultFor(docKey, layout);
    if (def && sameDoc(doc, def)) {
      if (!current) return docs;
      const next = { ...docs };
      delete next[docKey];
      return next;
    }
  }
  if (current && sameDoc(current, doc)) return docs;
  return { ...docs, [docKey]: doc };
}

/** "Reset page to default" — and, for a custom page, delete it. */
export function withoutDoc(docs: DocMap, docKey: DocKey, layout: LayoutKind): DocMap {
  if (docKey === 'shell') return { ...docs, shell: defaultFor('shell', layout)! };
  if (!(docKey in docs)) return docs;
  const next = { ...docs };
  delete next[docKey];
  return next;
}

/**
 * Every rule issue in the set, shell first. The guard's `drop:*` issues are informational (the doc
 * still renders; the drop is console-warned) and would block Publish in the admin, so they are left out.
 * Root title/description over the backend's limits are added as `limit:*` issues: the backend rejects
 * them, while the guard would silently render them blank.
 */
export function collectIssues(docs: DocMap, layout: LayoutKind): Issue[] {
  const issues: Issue[] = [];
  const keys = Object.keys(docs) as DocKey[];
  keys.sort((a, b) => (a === 'shell' ? -1 : b === 'shell' ? 1 : 0));
  for (const key of keys) {
    for (const issue of validateDoc(docs[key], key, layout).issues) {
      if (!issue.rule.startsWith('drop:')) issues.push(issue);
    }
    const root = docs[key]?.root.props;
    if (root && root.title.length > MAX_TITLE) {
      issues.push({ docKey: key, rule: 'limit:title', message: `Keep the page title to ${MAX_TITLE} characters.` });
    }
    if (root && root.description.length > MAX_DESCRIPTION) {
      issues.push({ docKey: key, rule: 'limit:description', message: `Keep the page description to ${MAX_DESCRIPTION} characters.` });
    }
  }
  return issues;
}

export const customPageKeys = (docs: DocMap): CustomKey[] => Object.keys(docs).filter(isCustomKey);

export function newCustomPage(docs: DocMap, slug: string, title: string): { docs: DocMap; docKey: CustomKey } | { error: string } {
  const trimmed = title.trim();
  if (!CUSTOM_SLUG_RE.test(slug)) return { error: 'Use 1–60 lowercase letters, digits or hyphens.' };
  const docKey: CustomKey = `page:${slug}`;
  if (docs[docKey]) return { error: 'A page with that address already exists.' };
  if (!trimmed) return { error: 'Give the page a title.' };
  if (trimmed.length > MAX_TITLE) return { error: 'Keep the title to 120 characters.' };
  if (customPageKeys(docs).length >= MAX_CUSTOM_PAGES) return { error: 'A layout can have at most 50 custom pages.' };
  return { docKey, docs: { ...docs, [docKey]: { root: { props: { title: trimmed, description: '', chrome: 'shell' } }, content: [] } } };
}

const isComponentArray = (value: unknown): value is ComponentData[] =>
  Array.isArray(value) && value.every((v) => v && typeof v === 'object' && 'type' in v && 'props' in v);

/** Depth-first over a content array and every slot inside it (slot = array of component data). */
export function forEachComponent(content: ComponentData[], visit: (c: ComponentData) => void): void {
  for (const item of content) {
    visit(item);
    for (const value of Object.values(item.props)) {
      if (isComponentArray(value)) forEachComponent(value, visit);
    }
  }
}
