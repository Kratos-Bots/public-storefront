import path from 'node:path';
import ts from 'typescript';

import { ALLOWED_PACKAGES, CONTRACT_SPECIFIERS, DEFINE_SPECIFIERS } from './template-rules.mjs';

const CONTRACT = new Set(CONTRACT_SPECIFIERS);
const DEFINE = new Set(DEFINE_SPECIFIERS);
const PACKAGES = new Set(ALLOWED_PACKAGES);
const GLOB_METHODS = new Set(['glob', 'globEager']);

function isAllowedSpecifier(spec, { fileDir, templateRoot, isManifest }) {
  if (isManifest) return DEFINE.has(spec);
  if (CONTRACT.has(spec) || DEFINE.has(spec) || PACKAGES.has(spec)) return true;
  if (spec.startsWith('./') || spec.startsWith('../')) {
    const rel = path.relative(templateRoot, path.resolve(fileDir, spec));
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) return true;
  }
  return false;
}

/** True when `node` is `import.meta.<name>` (a PropertyAccessExpression on the `import.meta` MetaProperty). */
function importMetaPropertyName(node) {
  if (!ts.isPropertyAccessExpression(node)) return null;
  const obj = node.expression;
  if (!ts.isMetaProperty(obj) || obj.keywordToken !== ts.SyntaxKind.ImportKeyword || obj.name.text !== 'meta') return null;
  return node.name.text;
}

/**
 * The import restriction for templates (web/ has no ESLint). Parses with the TypeScript compiler
 * API — a regex over source text can be fooled by formatting (no spaces around keywords, comments,
 * template-literal specifiers, nested blocks); a real AST cannot. Returns every specifier or
 * module-reaching construct a template file may not use. manifest.ts may import only
 * @/templates/define.ts; other files may import the contract, define, react, and relative files
 * that stay inside the template folder. Also rejects `import.meta.glob`/`globEager` (bundler-level
 * re-discovery of arbitrary modules) and `new URL(x, import.meta.url)` whose path leaves the folder.
 */
export function forbiddenImports(source, ctx) {
  const bad = [];
  const sf = ts.createSourceFile('template.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const flag = (spec) => { if (!isAllowedSpecifier(spec, ctx)) bad.push(spec); };

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      flag(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      flag(node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteralLike(node.moduleReference.expression)) {
      flag(node.moduleReference.expression.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      // dynamic import(...) — any spacing/comments; a non-literal argument can't be verified, so it's rejected outright.
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) flag(arg.text);
      else bad.push(`import(${arg ? arg.getText(sf) : ''})`);
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) flag(arg.text);
      else bad.push(`require(${arg ? arg.getText(sf) : ''})`);
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL' && node.arguments && node.arguments.length >= 2 && importMetaPropertyName(node.arguments[1]) === 'url') {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) flag(arg.text);
      else bad.push(`new URL(${arg ? arg.getText(sf) : ''}, import.meta.url)`);
    } else {
      const metaName = importMetaPropertyName(node);
      if (metaName && GLOB_METHODS.has(metaName)) bad.push(`import.meta.${metaName}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return bad;
}

function isRemoteOrAbsolute(ref) {
  if (/^data:/i.test(ref)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) return true; // any scheme other than data: (http:, https:, ext:, ...)
  if (ref.startsWith('//') || ref.startsWith('/')) return true; // protocol-relative or root-absolute
  return false;
}

function leavesFolder(ref, { fileDir, templateRoot }) {
  const rel = path.relative(templateRoot, path.resolve(fileDir, ref));
  return rel.startsWith('..') || path.isAbsolute(rel);
}

/**
 * CSS import restriction: `@import` and `url(...)` may reference only `data:` URIs or relative
 * paths that stay inside the template folder — never a remote/protocol-relative/absolute URL.
 */
export function forbiddenCssImports(source, ctx) {
  const bad = [];
  const seen = new Set();
  const check = (raw) => {
    const ref = (raw ?? '').trim();
    if (!ref || seen.has(ref)) return;
    seen.add(ref);
    if (isRemoteOrAbsolute(ref) || leavesFolder(ref, ctx)) bad.push(ref);
  };
  for (const m of source.matchAll(/@import\s+(?:url\(\s*(['"]?)([^'")]+)\1\s*\)|(['"])([^'"]+)\3)/g)) check(m[2] ?? m[4]);
  for (const m of source.matchAll(/\burl\(\s*(['"]?)([^'")]+)\1\s*\)/g)) check(m[2]);
  return bad;
}
