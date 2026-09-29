import type { Plugin } from 'vite';

/** Editor-only code (spec §2.3, §8, A1): Puck and what it drags in, plus our own editor folder. */
const FORBIDDEN = /[\\/]node_modules[\\/](?:@puckeditor[\\/]core|@tiptap|@dnd-kit)[\\/]/;
const EDITOR_SRC = /[\\/]src[\\/]builder[\\/]editor[\\/]/;

export type BundleEntry =
  | { type: 'chunk'; fileName: string; isEntry: boolean; imports: string[]; dynamicImports: string[]; moduleIds: string[] }
  | { type: 'asset'; fileName: string };

/** Every module in a chunk statically reachable from an entry that belongs to the editor. */
export function findLeaks(bundle: Record<string, BundleEntry>): string[] {
  const chunks = new Map<string, Extract<BundleEntry, { type: 'chunk' }>>();
  for (const entry of Object.values(bundle)) if (entry.type === 'chunk') chunks.set(entry.fileName, entry);
  const reachable = new Set<string>();
  const stack = [...chunks.values()].filter((c) => c.isEntry).map((c) => c.fileName);
  while (stack.length) {
    const name = stack.pop()!;
    if (reachable.has(name)) continue;
    reachable.add(name);
    // Static imports only: the /__builder chunk is a dynamic import and may hold anything.
    stack.push(...(chunks.get(name)?.imports ?? []));
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
