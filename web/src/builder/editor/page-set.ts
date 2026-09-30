import { defaultDoc } from '@/builder/defaults/index.ts';
import { validateDoc } from '@/builder/guard.ts';
import { isDocKey } from '@/builder/editor/protocol.ts';
import {
  CUSTOM_SLUG_RE, isFixedRouteKey, type ComponentData, type DocKey, type Issue, type LayoutKind,
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

/** Whether a doc key can be shown (and so edited or reset) in this layout. */
export const isShownIn = (docKey: DocKey, layout: LayoutKind): boolean => docKey !== 'product' || layout === 'storefront';

/**
 * The editor's view of a stored set. Keeps it sparse: pages that can never be shown in this layout
 * (`product` outside the storefront) and fixed pages equal to their default are dropped — the
 * difference goes out with the baseline change that follows every load.
 */
export function docsFromPageSet(pageSet: PageSet | null, layout: LayoutKind): DocMap {
  if (!pageSet) return { shell: defaultFor('shell', layout)! };
  let docs: DocMap = { shell: normalizeDoc(pageSet.shell, 'shell') };
  for (const [key, doc] of Object.entries(pageSet.pages)) {
    if (doc && isDocKey(key) && key !== 'shell' && isShownIn(key, layout)) docs = withDoc(docs, key, normalizeDoc(doc, key), layout);
  }
  return docs;
}

export function toPageSet(docs: DocMap, layout: LayoutKind): PageSet {
  const pages: PageSet['pages'] = {};
  for (const [key, doc] of Object.entries(docs)) {
    if (key !== 'shell' && doc) pages[key as keyof PageSet['pages']] = doc;
  }
  return { schemaVersion: 1, shell: docs.shell ?? defaultFor('shell', layout)!, pages };
}

const emptyPage = (): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content: [] });

/** What the canvas shows for a key: the edited doc, else the built-in default. */
export function docFor(docs: DocMap, docKey: DocKey, layout: LayoutKind): PuckDoc {
  return docs[docKey] ?? defaultFor(docKey, layout) ?? emptyPage();
}

/**
 * Store an edit, keeping the set sparse: a fixed page equal to its default is not stored.
 * Returns the same object when nothing changed so subscribers can skip work.
 */
export function withDoc(docs: DocMap, docKey: DocKey, doc: PuckDoc, layout: LayoutKind): DocMap {
  const current = docs[docKey];
  if (isFixedRouteKey(docKey)) {
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
