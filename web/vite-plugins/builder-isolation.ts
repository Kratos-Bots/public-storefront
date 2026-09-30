import type { Plugin } from 'vite';

/** Editor-only code (spec §2.3, §8, A1): Puck and what it drags in, plus our own editor folder. */
const FORBIDDEN = /[\\/]node_modules[\\/](?:@puckeditor[\\/]core|@tiptap|@dnd-kit)[\\/]/;
const EDITOR_SRC = /[\\/]src[\\/]builder[\\/]editor[\\/]/;

export type BundleEntry =
  | { type: 'chunk'; fileName: string; isEntry: boolean; imports: string[]; dynamicImports: string[]; moduleIds: string[] }
  | { type: 'asset'; fileName: string };

const EDITOR_ENTRY = /[\\/]src[\\/]builder[\\/]editor[\\/]EditorApp\.tsx$/;

/**
 * Every editor-only module in a chunk reachable from a shopper entry. Static and dynamic imports
 * are both followed (shopper lazy chunks count), except that a chunk holding the editor entry
 * (the `/__builder` lazy import) is a boundary when reached dynamically: it is not entered and
 * nothing behind it is followed. A chunk also reachable from the shopper graph is still checked.
 */
export function findLeaks(bundle: Record<string, BundleEntry>): string[] {
  const chunks = new Map<string, Extract<BundleEntry, { type: 'chunk' }>>();
  for (const entry of Object.values(bundle)) if (entry.type === 'chunk') chunks.set(entry.fileName, entry);
  const entries = [...chunks.values()].filter((c) => c.isEntry).map((c) => c.fileName);
  if (!entries.length) return ['no entry chunks found in the bundle; cannot verify isolation'];
  const isEditorChunk = (name: string) => (chunks.get(name)?.moduleIds ?? []).some((id) => EDITOR_ENTRY.test(id));
  const reachable = new Set<string>();
  const stack = [...entries];
  while (stack.length) {
    const name = stack.pop()!;
    if (reachable.has(name)) continue;
    reachable.add(name);
    const c = chunks.get(name);
    if (!c) continue;
    stack.push(...c.imports);
    for (const dyn of c.dynamicImports) if (!isEditorChunk(dyn)) stack.push(dyn);
  }
  const leaks: string[] = [];
  for (const name of reachable) {
    for (const id of chunks.get(name)?.moduleIds ?? []) {
      if (FORBIDDEN.test(id) || EDITOR_SRC.test(id)) leaks.push(`${name}: ${id}`);
    }
  }
  return leaks;
}

export function builderIsolation(): Plugin {
  return {
    name: 'sf-builder-isolation',
    apply: 'build',
    generateBundle(_options, bundle) {
      const leaks = findLeaks(bundle as unknown as Record<string, BundleEntry>);
      if (leaks.length) this.error(`Page-builder editor code reached the shopper bundle:\n${leaks.join('\n')}`);
    },
  };
}
