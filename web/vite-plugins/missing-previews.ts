import { existsSync } from 'node:fs';
import path from 'node:path';

export interface CatalogPreviewRef { id: string; sourceRel: string }

/**
 * `validateManifest` only checks the preview filename's shape, never that the file exists —
 * so a missing/mistyped preview must be caught before `templates-catalog.ts`'s `closeBundle`
 * unguardedly `copyFileSync`s it (which would otherwise crash the build with a raw ENOENT
 * instead of the catalog's usual `Invalid templates:` message).
 *
 * Kept free of any `vite` import so it can be unit tested directly: importing the `vite`
 * package (even transitively) inside this repo's jsdom vitest environment pulls in esbuild,
 * which fails its own startup invariant check under jsdom's globals.
 *
 * `exists` is injectable for testing.
 */
export function missingPreviewErrors(
  root: string,
  previews: readonly CatalogPreviewRef[],
  exists: (file: string) => boolean = existsSync,
): string[] {
  const errors: string[] = [];
  for (const p of previews) {
    if (!exists(path.join(root, 'src/templates', p.sourceRel))) {
      errors.push(`${p.id}: preview file not found: src/templates/${p.sourceRel}`);
    }
  }
  return errors;
}
