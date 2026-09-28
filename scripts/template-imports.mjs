import path from 'node:path';
import ts from 'typescript';

import { tokenizeCss } from './css-tokenizer.mjs';
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

/** Functions whose string argument(s) may carry a URL — 'url' covers the quoted url("x") grammar
 *  form (the unquoted url(x) form arrives as its own `url`-type token, checked unconditionally). */
const URL_TAKING_FUNCTIONS = new Set(['url', 'image-set', '-webkit-image-set', 'src']);

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

/** `%HH` percent-decoding (a hostile template could hide `..`/`//` as `%2e%2e`/`%2f%2f`). Leaves an
 *  unrecognised `%` alone rather than throwing, unlike decodeURIComponent. */
function decodePercentEscapes(str) {
  return str.replace(/%([0-9a-fA-F]{2})/g, (_m, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

/** What the WHATWG URL parser does to its input before anything else: strip leading/trailing C0
 *  controls and spaces, then drop every ASCII tab/LF/CR anywhere — so `h\9ttps://…` (after CSS
 *  escape decoding) is `https://…` to the browser. Runs after CSS decoding, before percent-decoding. */
function urlParserCleanup(str) {
  return str.replace(/^[\u0000- ]+|[\u0000- ]+$/g, '').replace(/[\t\n\r]/g, '');
}

const asciiLowerCase = (s) => s.replace(/[A-Z]/g, (ch) => ch.toLowerCase());

/**
 * CSS import restriction, built on a CSS Syntax 3 tokenizer (scripts/css-tokenizer.mjs, with §3.3
 * preprocessing) rather than decode-then-regex: decoding CSS escapes across the whole file *before*
 * finding string/paren boundaries is unsound (an escaped quote or `)` can turn into a real delimiter
 * once decoded, desyncing every token after it — see the tokenizer module doc). Each value is then
 * cleaned the way the URL parser cleans it (C0/space trim, tab/LF/CR removal) and percent-decoded.
 * A guardrail for reviewed first-party code, not a sandbox.
 *
 * Only three kinds of position are ever checked: the target of an `@import` prelude (`@import "x"`
 * or `@import url(x)`), every `url(...)` (quoted or not, anywhere, including nested inside another
 * function), and a string that is a direct argument of a URL-taking function (`image-set`,
 * `-webkit-image-set`, `src`). Everything else — `content`, `font-family`, attribute selectors,
 * `grid-template-areas`, … — is never inspected, so ordinary CSS text never false-positives no
 * matter what it contains (a scheme-looking prefix, `..`, `/`, anything).
 */
export function forbiddenCssImports(source, ctx) {
  const bad = [];
  const seen = new Set();
  const check = (raw) => {
    const decoded = decodePercentEscapes(urlParserCleanup(raw ?? '')).trim();
    if (!decoded || seen.has(decoded)) return;
    seen.add(decoded);
    if (isRemoteOrAbsolute(decoded) || leavesFolder(decoded, ctx)) bad.push(decoded);
  };

  scanTokens(tokenizeCss(source), check);
  // Browsers and css-syntax-3 disagree on which non-ASCII code points are ident code points, which
  // changes how e.g. `×url(` tokenizes; scan with both readings so neither can hide a reference.
  if (/[^\x00-\x7f]/.test(source)) scanTokens(tokenizeCss(source, { nonAsciiIdent: 'spec' }), check);
  return bad;
}

/**
 * Walks a token stream, calling `check` on every URL-carrying value. `stack` mirrors the parser's
 * component-value nesting (§5): a function, '(' or '[' or '{' opens a level that only its own closer
 * ends — a stray `}` inside a function is just a token in it, exactly as the CSS parser treats it.
 */
function scanTokens(tokens, check) {
  const stack = []; // function name, or '(' / '[' / '{'
  const CLOSES = { ')': null, ']': '[', '}': '{' };
  let importDepth = -1; // stack depth of the open @import prelude, or -1
  for (const tok of tokens) {
    if (tok.type === 'at-keyword') {
      if (importDepth < 0 && asciiLowerCase(tok.value) === 'import') importDepth = stack.length;
    } else if (tok.type === 'function') {
      stack.push(tok.value);
    } else if (tok.type === 'punct') {
      const v = tok.value;
      if ((v === ';' || v === '{' || v === '}') && stack.length === importDepth) importDepth = -1;
      if (v === '(' || v === '[' || v === '{') stack.push(v);
      else if (v in CLOSES && stack.length > 0) {
        const top = stack[stack.length - 1];
        const matches = v === ')' ? top !== '[' && top !== '{' : top === CLOSES[v];
        if (matches) stack.pop();
      }
    } else if (tok.type === 'url' || tok.type === 'bad-url') {
      check(tok.value); // bad-url is never fetched, but checking what was read is the conservative side
    } else if (tok.type === 'string' || tok.type === 'bad-string') {
      const enclosing = stack[stack.length - 1];
      if (importDepth >= 0 || URL_TAKING_FUNCTIONS.has(enclosing)) check(tok.value);
    }
  }
}
