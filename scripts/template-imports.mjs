import path from 'node:path';
import ts from 'typescript';

import { decodeCssEscapes, preprocessCss, tokenizeCss } from './css-tokenizer.mjs';
import { ALLOWED_PACKAGES, CONTRACT_SPECIFIERS, DEFINE_SPECIFIERS, STYLE_LANGUAGE_FILE_RE } from './template-rules.mjs';

const CONTRACT = new Set(CONTRACT_SPECIFIERS);
const DEFINE = new Set(DEFINE_SPECIFIERS);
const PACKAGES = new Set(ALLOWED_PACKAGES);
const GLOB_METHODS = new Set(['glob', 'globEager']);

function isAllowedSpecifier(spec, { fileDir, templateRoot, isManifest }) {
  if (isManifest) return DEFINE.has(spec);
  if (CONTRACT.has(spec) || DEFINE.has(spec) || PACKAGES.has(spec)) return true;
  if (STYLE_LANGUAGE_FILE_RE.test(spec.replace(/[?#].*$/, ''))) return false; // templates ship plain .css only
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

/** CSS-decoded value -> the string the URL checks run on (URL-parser cleanup, percent-decoding, '\' -> '/'). */
function normalizeRef(raw) {
  return decodePercentEscapes(urlParserCleanup(raw ?? '')).trim();
}

/**
 * A *reference* — a url token, a string directly inside url()/image-set()/-webkit-image-set()/src(),
 * an @import target, or raw `url(…)` text — is allowed only when it is (allowlist, not a denylist):
 *   data:…            an inline resource
 *   #…                a same-document fragment (url(#filter))
 *   ./… or ../…       a relative file that resolves inside the template folder
 * Everything else is rejected: any other scheme, `//host`, root-absolute `/…`, and bare or aliased
 * specifiers (`@/…`, `~pkg`, `pkg/x.png`) that Vite would resolve outside the folder.
 */
function isAllowedReference(ref, ctx) {
  if (/^data:/i.test(ref) || ref.startsWith('#')) return true;
  const slashed = ref.replace(/\\/g, '/');
  return (slashed.startsWith('./') || slashed.startsWith('../')) && !leavesFolder(slashed, ctx);
}

/**
 * A *candidate* — a string that is not itself a reference but could be substituted into one: any
 * string in a custom-property value (`--x: "…"`), in a var() fallback, or nested deeper inside a
 * URL-taking function. These are usually plain text (`--label: "Price: "`), so they are flagged only
 * when they look like a reference that would leave the template:
 *   - a network scheme (`http:`, `https:`, `ftp:`, `ws:`, `wss:`, `file:`) or any `scheme://`
 *   - protocol-relative `//host…` or root-absolute `/x…` (a lone "/" or "//" is text, not a URL)
 *   - an alias `@/…` or `~…`
 *   - a `./` / `../` path that resolves outside the template folder
 */
function isSuspiciousCandidate(ref, ctx) {
  const slashed = ref.replace(/\\/g, '/');
  if (/^(?:https?|ftp|wss?|file):/i.test(slashed) || /^[a-z][a-z0-9+.-]*:\/\//i.test(slashed)) return true;
  if (/^\/[^\s/]/.test(slashed) || /^\/\/[^\s/]/.test(slashed)) return true;
  if (slashed.startsWith('@/') || slashed.startsWith('~')) return true;
  return (slashed.startsWith('./') || slashed.startsWith('../')) && leavesFolder(slashed, ctx);
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
 * What is checked (see isAllowedReference / isSuspiciousCandidate for the two rules):
 *   references — every url token, every string directly inside url()/image-set()/-webkit-image-set()/
 *     src(), the direct target of an @import prelude, and every raw `url(…)` in the source text
 *     (Vite's CSS url rewriter is a regex, so it also rewrites url( inside strings and comments);
 *   candidates — every other string in a custom-property value, a var() (fallback), an @import
 *     prelude, or at any depth under a URL-taking function.
 * Other strings (`content`, `font-family`, attribute selectors, `grid-template-areas`, :not("…"))
 * are never inspected.
 */
export function forbiddenCssImports(source, ctx) {
  const bad = [];
  const reported = new Set();
  const report = (ref) => { if (!reported.has(ref)) { reported.add(ref); bad.push(ref); } };
  const checks = {
    reference: (raw) => { const ref = normalizeRef(raw); if (ref && !isAllowedReference(ref, ctx)) report(ref); },
    candidate: (raw) => { const ref = normalizeRef(raw); if (ref && isSuspiciousCandidate(ref, ctx)) report(ref); },
  };

  scanTokens(tokenizeCss(source), checks);
  // Browsers and css-syntax-3 disagree on which non-ASCII code points are ident code points, which
  // changes how e.g. `×url(` tokenizes; scan with both readings so neither can hide a reference.
  if (/[^\x00-\x7f]/.test(source)) scanTokens(tokenizeCss(source, { nonAsciiIdent: 'spec' }), checks);
  for (const raw of rawUrlValues(preprocessCss(source))) checks.reference(decodeCssEscapes(raw));
  return bad;
}

/**
 * Every `url(…)` in the raw text — inside strings and comments too — shaped like Vite's cssUrlRE
 * (`(?<=^|[^\w\-\u0080-￿])url\((\s*('[^']+'|"[^"]+")\s*|(?:\\.|[^'")\\])+)\)`), but matched
 * case-insensitively and with optional whitespace before '(' to stay on the conservative side.
 * Linear: `term[i]` (where an unquoted value starting at i stops) is precomputed right to left.
 */
function rawUrlValues(text) {
  const n = text.length;
  const term = new Int32Array(n + 2).fill(n);
  for (let k = n - 1; k >= 0; k--) {
    const c = text[k];
    if (c === '\\') term[k] = k + 2 <= n ? term[k + 2] : n;
    else term[k] = c === '"' || c === "'" || c === ')' ? k : term[k + 1];
  }
  const values = [];
  for (const m of text.matchAll(/url\s*\(/gi)) {
    const before = m.index > 0 ? text[m.index - 1] : '';
    if (before && /[\w\-\u0080-￿]/.test(before)) continue;
    let p = m.index + m[0].length;
    let q = p;
    while (q < n && /\s/.test(text[q])) q++;
    if (text[q] === '"' || text[q] === "'") {
      const close = text.indexOf(text[q], q + 1);
      if (close > q + 1) {
        let r = close + 1;
        while (r < n && /\s/.test(text[r])) r++;
        if (text[r] === ')') { values.push(text.slice(q + 1, close)); continue; }
      }
    }
    const end = term[p];
    if (end > p && text[end] === ')') values.push(text.slice(p, end));
  }
  return values;
}

/**
 * Walks a token stream and routes each URL-carrying value to `checks.reference` or
 * `checks.candidate`. `stack` mirrors the parser's component-value nesting (§5): a function, '(' or
 * '[' or '{' opens a level that only its own closer ends — a stray `}` inside a function is just a
 * token in it, exactly as the CSS parser treats it.
 */
function scanTokens(tokens, checks) {
  const stack = []; // function name, or '(' / '[' / '{'
  const CLOSES = { ')': null, ']': '[', '}': '{' };
  let urlFnDepth = 0; // how many URL-taking functions or var()s are open on the stack
  let importDepth = -1; // stack depth of the open @import prelude, or -1
  let customDepth = -1; // stack depth of the open custom-property value (`--x: …`), or -1
  let pendingCustom = -1; // stack depth of a `--x` ident that may be followed by ':'
  const counts = (name) => URL_TAKING_FUNCTIONS.has(name) || name === 'var';
  for (const tok of tokens) {
    const wasPendingCustom = pendingCustom;
    pendingCustom = -1;
    if (tok.type === 'at-keyword') {
      if (importDepth < 0 && asciiLowerCase(tok.value) === 'import') importDepth = stack.length;
    } else if (tok.type === 'ident') {
      if (tok.value.startsWith('--')) pendingCustom = stack.length;
    } else if (tok.type === 'function') {
      stack.push(tok.value);
      if (counts(tok.value)) urlFnDepth++;
    } else if (tok.type === 'punct') {
      const v = tok.value;
      if (v === ':' && wasPendingCustom === stack.length && customDepth < 0) customDepth = stack.length;
      if ((v === ';' || v === '{' || v === '}') && stack.length === importDepth) importDepth = -1;
      if ((v === ';' || v === '}') && stack.length === customDepth) customDepth = -1;
      if (v === '(' || v === '[' || v === '{') stack.push(v);
      else if (v in CLOSES && stack.length > 0) {
        const top = stack[stack.length - 1];
        const matches = v === ')' ? top !== '[' && top !== '{' : top === CLOSES[v];
        if (matches) {
          stack.pop();
          if (counts(top)) urlFnDepth--;
          if (stack.length < importDepth) importDepth = -1;
          if (stack.length < customDepth) customDepth = -1;
        }
      }
    } else if (tok.type === 'url') {
      checks.reference(tok.value);
    } else if (tok.type === 'bad-url') {
      checks.candidate(tok.value); // never fetched by a browser; still flag what was read if it looks like a reference
    } else if (tok.type === 'string' || tok.type === 'bad-string') {
      const enclosing = stack[stack.length - 1];
      if (URL_TAKING_FUNCTIONS.has(enclosing) || stack.length === importDepth) checks.reference(tok.value);
      else if (urlFnDepth > 0 || importDepth >= 0 || customDepth >= 0) checks.candidate(tok.value);
    }
  }
}
