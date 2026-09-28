/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { forbiddenImports } from '../../scripts/template-imports.mjs';
import { RESERVED_DIRS } from '../../scripts/template-rules.mjs';

const templatesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/templates');
const folders = readdirSync(templatesDir).filter((n) => statSync(path.join(templatesDir, n)).isDirectory() && !RESERVED_DIRS.includes(n));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const full = path.join(dir, n);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(n) ? [full] : [];
  });
}

describe('built-in templates respect the import contract', () => {
  it.each(folders)('%s', (folder) => {
    const root = path.join(templatesDir, folder);
    for (const file of files(root)) {
      const bad = forbiddenImports(readFileSync(file, 'utf8'), { fileDir: path.dirname(file), templateRoot: root, isManifest: path.basename(file) === 'manifest.ts' && path.dirname(file) === root });
      expect(bad, path.relative(templatesDir, file)).toEqual([]);
    }
  });
});
