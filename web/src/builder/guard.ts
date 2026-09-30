import { z } from 'zod';
import { parseBlockPropsDetailed } from '@/builder/define.ts';
import { blockDef, checkRules } from '@/builder/rules.ts';
import { STYLE_LABELS } from '@/builder/style/labels.ts';
import { isStyleKey } from '@/builder/style/model.ts';
import {
  EMPTY_ROOT, isComponentLike, isRecord, MAX_COMPONENTS, MAX_DEPTH,
  type ComponentData, type DocKey, type Issue, type LayoutKind, type PageRootProps, type PuckDoc,
} from '@/builder/types.ts';

export interface GuardResult { doc: PuckDoc | null; issues: Issue[] }

const ROOT_SHAPE = {
  title: z.string().max(120),
  description: z.string().max(300),
  chrome: z.enum(['shell', 'none']),
} as const;

const warnedTypes = new Set<string>();
/** Bounds on what a hostile or corrupt doc can make the guard emit. */
const MAX_DROP_ISSUES = 50;
const MAX_WARNED_TYPES = 100;
const MAX_TYPE_CHARS = 60;
const shortType = (t: string) => (t.length > MAX_TYPE_CHARS ? `${t.slice(0, MAX_TYPE_CHARS)}…` : t);
const memo = new WeakMap<object, Map<string, GuardResult>>();

interface Walk { docKey: DocKey; layout: LayoutKind; depth: number; drops: Issue[]; ids: Set<string>; budget: { left: number } }

function drop(w: Walk, issue: Omit<Issue, 'docKey'>): void {
  if (w.drops.length < MAX_DROP_ISSUES) w.drops.push({ docKey: w.docKey, ...issue });
}

/** `items[2]` → an item that was left out; `title` → a field that was left empty; `blockStyle.<key>` → a style row left at its default. */
function fieldMessage(label: string, f: string): string {
  if (f === 'blockStyle') return `${label}: the style settings are not valid and were left at their defaults.`;
  if (f.startsWith('blockStyle.')) {
    const key = f.slice('blockStyle.'.length);
    return `${label}: the style setting "${isStyleKey(key) ? STYLE_LABELS[key] : key}" is not valid here and was left at its default.`;
  }
  const item = /^(.+)\[(\d+)\]$/.exec(f);
  return item
    ? `${label}: item ${Number(item[2]) + 1} of "${item[1]}" is not valid and is left out.`
    : `${label}: the "${f}" field is not valid and is left blank (or at its default).`;
}

function cleanItems(items: unknown, w: Walk): ComponentData[] {
  if (!Array.isArray(items)) return [];
  const out: ComponentData[] = [];
  for (const raw of items) {
    if (!isComponentLike(raw)) {
      drop(w, { rule: 'drop:shape', message: 'A malformed block was removed.' });
      continue;
    }
    const blockId = raw.props.id;
    const def = blockDef(raw.type);
    if (!def) {
      const type = shortType(raw.type);
      if (!warnedTypes.has(type) && warnedTypes.size < MAX_WARNED_TYPES) {
        warnedTypes.add(type);
        console.warn(`[builder] unknown block "${type}" dropped — saved by a newer release, or removed`);
      }
      drop(w, { rule: 'drop:unknown-block', message: `Unknown block "${type}" was removed.`, blockId });
      continue;
    }
    if (def.layouts !== 'all' && !def.layouts.includes(w.layout)) {
      drop(w, { rule: 'drop:layout', message: `${def.label} is not available in this layout.`, blockId });
      continue;
    }
    if (w.depth > MAX_DEPTH) {
      drop(w, { rule: 'drop:depth', message: `${def.label} is nested too deeply.`, blockId });
      continue;
    }
    if (w.budget.left <= 0) {
      drop(w, { rule: 'drop:too-many', message: 'The page has too many blocks.', blockId });
      continue;
    }
    w.budget.left -= 1;
    const props: Record<string, unknown> = { ...raw.props };
    for (const s of def.slots) props[s] = cleanItems(raw.props[s], { ...w, depth: w.depth + 1 });
    // Neutral fallbacks: a broken field renders empty, never the block's placeholder copy.
    const { props: parsed, fallbacks } = parseBlockPropsDetailed(def, props, 'neutral');
    let id = blockId;
    for (let n = 2; w.ids.has(id); n += 1) id = `${blockId}~${n}`;
    w.ids.add(id);
    for (const f of fallbacks) drop(w, { rule: `field:${def.name}.${f}`, message: fieldMessage(def.label, f), blockId: id });
    out.push({ type: raw.type, props: { ...parsed, id } });
  }
  return out;
}

function parseRoot(raw: unknown, docKey: DocKey): PageRootProps {
  const src = isRecord(raw) && isRecord(raw.props) ? raw.props : {};
  const out: PageRootProps = { ...EMPTY_ROOT };
  const title = ROOT_SHAPE.title.safeParse(src.title);
  if (title.success) out.title = title.data;
  const description = ROOT_SHAPE.description.safeParse(src.description);
  if (description.success) out.description = description.data;
  const chrome = ROOT_SHAPE.chrome.safeParse(src.chrome);
  if (chrome.success) out.chrome = chrome.data;
  if (docKey === 'shell') out.chrome = 'shell';
  return out;
}

function run(doc: Record<string, unknown>, docKey: DocKey, layout: LayoutKind): GuardResult {
  const drops: Issue[] = [];
  const content = cleanItems(doc.content, { docKey, layout, depth: 1, drops, ids: new Set(), budget: { left: MAX_COMPONENTS } });
  const cleaned: PuckDoc = { root: { props: parseRoot(doc.root, docKey) }, content, zones: {} };
  const broken = checkRules(cleaned, docKey, layout);
  if (broken.length > 0) {
    console.error(`[builder] "${docKey}" (${layout}) breaks ${broken.map((i) => i.rule).join(', ')} — rendering the default page`);
    return { doc: null, issues: [...drops, ...broken] };
  }
  return { doc: cleaned, issues: drops };
}

/**
 * Spec §5.3. `doc: null` ⇒ render the route's default. Issues whose `rule` starts with `drop:` are
 * informational (a block was removed, the doc still renders). `field:<Block>.<key>` (or `…<key>[i]`)
 * issues also leave the doc rendering — the field shows empty, the array item is left out — but are
 * NOT informational: the editor lists them and they block Publish. Memoised per doc object, so a published
 * set is validated once per page load.
 */
export function validateDoc(doc: unknown, docKey: DocKey, layout: LayoutKind): GuardResult {
  if (!isRecord(doc) || !Array.isArray(doc.content)) {
    return { doc: null, issues: [{ docKey, rule: 'shape', message: 'This is not a page document.' }] };
  }
  const key = `${docKey}|${layout}`;
  let perDoc = memo.get(doc);
  const hit = perDoc?.get(key);
  if (hit) return hit;
  const result = run(doc, docKey, layout);
  if (!perDoc) { perDoc = new Map(); memo.set(doc, perDoc); }
  perDoc.set(key, result);
  return result;
}
