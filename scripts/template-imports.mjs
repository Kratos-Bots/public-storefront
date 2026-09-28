import path from 'node:path';

import { ALLOWED_PACKAGES, CONTRACT_SPECIFIERS, DEFINE_SPECIFIERS } from './template-rules.mjs';

const SPEC_RE = /(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const CONTRACT = new Set(CONTRACT_SPECIFIERS);
const DEFINE = new Set(DEFINE_SPECIFIERS);
const PACKAGES = new Set(ALLOWED_PACKAGES);

/**
 * The import restriction for templates (web/ has no ESLint). Returns every specifier a template
 * file may not use. manifest.ts may import only @/templates/define.ts; other files may import
 * the contract, define, react, and relative files that stay inside the template folder.
 */
export function forbiddenImports(source, { fileDir, templateRoot, isManifest }) {
  const bad = [];
  for (const m of source.matchAll(SPEC_RE)) {
    const spec = m[1] ?? m[2];
    if (!spec) continue;
    if (isManifest) { if (!DEFINE.has(spec)) bad.push(spec); continue; }
    if (CONTRACT.has(spec) || DEFINE.has(spec) || PACKAGES.has(spec)) continue;
    if (spec.startsWith('./') || spec.startsWith('../')) {
      const resolved = path.resolve(fileDir, spec);
      const rel = path.relative(templateRoot, resolved);
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) continue;
    }
    bad.push(spec);
  }
  return bad;
}
