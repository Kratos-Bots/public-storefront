import { z } from 'zod';
import { parseBlockProps } from '@/builder/define.ts';
import { BLOCKS } from '@/builder/registry.ts';
import { checkRules } from '@/builder/rules.ts';
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
const memo = new WeakMap<object, Map<string, GuardResult>>();

interface Walk { docKey: DocKey; layout: LayoutKind; depth: number; drops: Issue[]; ids: Set<string>; budget: { left: number } }

function cleanItems(items: unknown, w: Walk): ComponentData[] {
  if (!Array.isArray(items)) return [];
  const out: ComponentData[] = [];
  for (const raw of items) {
    if (!isComponentLike(raw)) {
      w.drops.push({ docKey: w.docKey, rule: 'drop:shape', message: 'A malformed block was removed.' });
      continue;
    }
    const blockId = raw.props.id;
    const def = BLOCKS[raw.type];
    if (!def) {
      if (!warnedTypes.has(raw.type)) {
        warnedTypes.add(raw.type);
        console.warn(`[builder] unknown block "${raw.type}" dropped — saved by a newer release, or removed`);
      }
      w.drops.push({ docKey: w.docKey, rule: 'drop:unknown-block', message: `Unknown block "${raw.type}" was removed.`, blockId });
      continue;
    }
    if (def.layouts !== 'all' && !def.layouts.includes(w.layout)) {
      w.drops.push({ docKey: w.docKey, rule: 'drop:layout', message: `${def.label} is not available in this layout.`, blockId });
      continue;
    }
    if (w.depth > MAX_DEPTH) {
      w.drops.push({ docKey: w.docKey, rule: 'drop:depth', message: `${def.label} is nested too deeply.`, blockId });
      continue;
    }
    if (w.budget.left <= 0) {
      w.drops.push({ docKey: w.docKey, rule: 'drop:too-many', message: 'The page has too many blocks.', blockId });
      continue;
    }
    w.budget.left -= 1;
    const props: Record<string, unknown> = { ...raw.props };
    for (const s of def.slots) props[s] = cleanItems(raw.props[s], { ...w, depth: w.depth + 1 });
    const parsed = parseBlockProps(def, props);
    let id = blockId;
    for (let n = 2; w.ids.has(id); n += 1) id = `${blockId}~${n}`;
    w.ids.add(id);
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
 * informational (a block was removed, the doc still renders). Memoised per doc object, so a published
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
