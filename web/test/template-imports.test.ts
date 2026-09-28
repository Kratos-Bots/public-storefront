/// <reference types="node" />
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { forbiddenCssImports, forbiddenImports } from '../../scripts/template-imports.mjs';
import { RESERVED_DIRS, SOURCE_FILE_RE } from '../../scripts/template-rules.mjs';

const templatesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/templates');
const folders = readdirSync(templatesDir).filter((n) => lstatSync(path.join(templatesDir, n)).isDirectory() && !RESERVED_DIRS.includes(n));

function files(dir: string, filterFn: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((n) => {
    const full = path.join(dir, n);
    const st = lstatSync(full);
    if (st.isSymbolicLink()) return [];
    return st.isDirectory() ? files(full, filterFn) : filterFn(n) ? [full] : [];
  });
}

describe('built-in templates respect the import contract', () => {
  it.each(folders)('%s', (folder) => {
    const root = path.join(templatesDir, folder);
    for (const file of files(root, (n) => SOURCE_FILE_RE.test(n))) {
      const bad = forbiddenImports(readFileSync(file, 'utf8'), { fileDir: path.dirname(file), templateRoot: root, isManifest: path.basename(file) === 'manifest.ts' && path.dirname(file) === root, fileName: path.basename(file) });
      expect(bad, path.relative(templatesDir, file)).toEqual([]);
    }
    for (const file of files(root, (n) => n.endsWith('.css'))) {
      const bad = forbiddenCssImports(readFileSync(file, 'utf8'), { fileDir: path.dirname(file), templateRoot: root });
      expect(bad, path.relative(templatesDir, file)).toEqual([]);
    }
  });
});
