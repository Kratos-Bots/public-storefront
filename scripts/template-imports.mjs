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
 * Picks the TS parser's ScriptKind from a file's extension. This matters: parsing everything as
 * TSX (round 1's approach) makes the parser read old-style type assertions (`<any>expr`) and
 * generic arrow functions (`<T>(x: T) => …`) — both legal only in .ts, never .tsx — as JSX, which
 * either fails to parse or silently swallows the wrapped expression as JSX text/children, so a
 * `<any>import('@/app/secret.ts')` inside a real .ts file was never seen as a CallExpression at
 * all. `.d.ts` falls through to the generic `.ts` check since it still ends in `.ts`.
 */
export function scriptKindFor(fileName) {
  const lower = String(fileName ?? '').toLowerCase();
  if (lower.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (lower.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (lower.endsWith('.mts') || lower.endsWith('.cts') || lower.endsWith('.ts')) return ts.ScriptKind.TS;
  if (lower.endsWith('.mjs') || lower.endsWith('.cjs') || lower.endsWith('.js')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TSX; // unknown/test-only fileName — permissive superset, matches round-1 default
}

/**
 * The import restriction for templates (web/ has no ESLint). Parses with the TypeScript compiler
 * API — a regex over source text can be fooled by formatting (no spaces around keywords, comments,
 * template-literal specifiers, nested blocks); a real AST cannot. Returns every specifier or
 * module-reaching construct a template file may not use. manifest.ts may import only
 * @/templates/define.ts; other files may import the contract, define, react, and relative files
 * that stay inside the template folder. Also rejects `import.meta.glob`/`globEager` (bundler-level
 * re-discovery of arbitrary modules) and `new URL(x, import.meta.url)` whose path leaves the folder.
 * `ctx.fileName` (the file's own name, e.g. 'index.ts') selects the correct parser mode — pass it
 * whenever the real extension is known; it only defaults for tests that don't care.
 */
export function forbiddenImports(source, ctx) {
  const bad = [];
  const fileName = ctx.fileName ?? 'template.tsx';
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKindFor(fileName));
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

/** Strips /* … *\/ comments (replaced with a space, so tokens either side of a removed comment stay separated). */
function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * Decodes CSS escapes: `\HHHHHH` (1–6 hex digits, one optional trailing whitespace char consumed
 * as part of the escape) and `\<char>` (a literal-escaped character). Without this, a hostile
 * template can hide `..`/`//` inside `\2e`/`\2f` hex escapes and slip past a plain-text scan.
 */
function decodeCssEscapes(css) {
  return css.replace(/\\([0-9a-fA-F]{1,6})[ \t\n\r\f]?|\\([\s\S])/g, (_m, hex, ch) => {
    if (hex !== undefined) {
      try { return String.fromCodePoint(Number.parseInt(hex, 16)); } catch { return ''; }
    }
    return ch ?? '';
  });
}

function isRemoteOrAbsolute(ref) {
  if (/^data:/i.test(ref)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) return true; // any scheme other than data: (http:, https:, ext:, ...)
  const normalized = ref.replace(/\\/g, '/');
  if (normalized.startsWith('//') || normalized.startsWith('/')) return true; // protocol-relative or root-absolute
  return false;
}

/**
 * Backslashes in a CSS reference are converted to '/' and resolved with path.posix specifically
 * (not the OS-native `path`) so a value like `..\..\secret.png` is recognised as escaping the
 * folder identically on Windows and POSIX — the default `path` module treats '\\' as a separator
 * only on Windows, which would otherwise make this check platform-dependent.
 */
function leavesFolder(ref, { fileDir, templateRoot }) {
  const normalizedRef = ref.replace(/\\/g, '/');
  const posixFileDir = fileDir.replace(/\\/g, '/');
  const posixRoot = templateRoot.replace(/\\/g, '/');
  const resolved = path.posix.resolve(posixFileDir, normalizedRef);
  const rel = path.posix.relative(posixRoot, resolved);
  return rel.startsWith('..') || path.posix.isAbsolute(rel);
}

/**
 * CSS import restriction: any URL-like reference — `@import "…"`/`@import url(…)`, a bare
 * `url(…)` (quoted or not, anywhere, including nested inside `image-set()`/`-webkit-image-set()`),
 * or any other quoted string used as a function argument (`image-set("…")`, `src("…")`) — may
 * point only at a `data:` URI or a relative path that stays inside the template folder. Comments
 * are stripped and CSS escapes decoded first, so `@import`\/**\/`"x"`, `@IMPORT`, and hex-escaped
 * `..`/`//` (`\2e`, `\2f`) can't hide a reference from the scan. Rather than special-casing every
 * function name that can carry a URL, every quoted string in the file is checked — a non-path
 * quoted value (font-family, content, attribute selectors, …) never looks remote or escapes the
 * folder, so this doesn't false-positive on ordinary CSS text.
 */
export function forbiddenCssImports(source, ctx) {
  const bad = [];
  const seen = new Set();
  const clean = decodeCssEscapes(stripCssComments(source));
  const check = (raw) => {
    const ref = (raw ?? '').trim();
    if (!ref || seen.has(ref)) return;
    seen.add(ref);
    if (isRemoteOrAbsolute(ref) || leavesFolder(ref, ctx)) bad.push(ref);
  };
  for (const m of clean.matchAll(/\burl\(\s*(['"]?)([^'")]*)\1\s*\)/gi)) check(m[2]);
  for (const m of clean.matchAll(/'([^'\\]*)'|"([^"\\]*)"/g)) check(m[1] ?? m[2]);
  return bad;
}
