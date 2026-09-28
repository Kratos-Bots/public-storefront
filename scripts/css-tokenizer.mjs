/**
 * A minimal CSS Syntax Level 3 §4 tokenizer — just enough to find, unambiguously, every string,
 * url-token, function-token/paren-nesting, at-keyword and comment in a stylesheet, with per-token
 * escape decoding. Dependency-free (postcss + postcss-value-parser weren't reliably resolvable
 * without depending on web/'s install rather than root's, so this stays self-contained).
 *
 * Why per-token, not decode-then-regex: decoding backslash escapes across the *whole file* before
 * finding token boundaries is unsound — an escaped quote or paren inside one token can turn into a
 * real delimiter once decoded, desyncing every string/paren pairing after it (see
 * scripts/css-tokenizer.test.mjs and the git history of scripts/template-imports.mjs for concrete
 * bypasses this caused). Escapes must be interpreted *while* the tokenizer is inside the token they
 * belong to, exactly as a real CSS parser does.
 *
 * Not a general-purpose tokenizer: numbers, dimensions, hashes, unicode-range, delimiters other
 * than the ones listed below, and non-printable-code-point rejection are not modelled — none of
 * that affects whether a construct can carry a URL, which is all this is for. Everything not
 * explicitly recognised is silently skipped one character at a time.
 *
 * Token shapes:
 *   { type: 'at-keyword', value }   — '@import' -> { value: 'import' } (case preserved)
 *   { type: 'ident', value }        — a bare identifier not immediately followed by '('
 *   { type: 'function', value }     — an identifier immediately followed by '(' (lowercased);
 *                                      the '(' itself still follows as its own punct token
 *   { type: 'string', value }       — a '...'/"..." string, escapes decoded
 *   { type: 'url', value }          — the unquoted url(...) grammar form, escapes decoded
 *   { type: 'punct', value }        — one of ( ) , ; { }
 * Comments and whitespace are consumed and never emitted.
 */

const HEX_DIGIT_RE = /[0-9a-fA-F]/;
const WHITESPACE_RE = /[ \t\n\r\f]/;
const IDENT_START_RE = /[A-Za-z_\u0080-￿]/;
const IDENT_CONT_RE = /[A-Za-z0-9_\-\u0080-￿]/;
const STRUCTURAL_PUNCT = new Set(['(', ')', ',', ';', '{', '}']);

export function tokenizeCss(source) {
  const tokens = [];
  const n = source.length;
  let i = 0;

  function isEscapeStart() {
    return source[i] === '\\' && i + 1 < n && source[i + 1] !== '\n';
  }

  /** Called with `i` positioned just after a consumed backslash. Consumes and decodes one escape. */
  function consumeEscapedCodePoint() {
    if (i >= n) return '�';
    const ch = source[i];
    if (HEX_DIGIT_RE.test(ch)) {
      let hex = '';
      while (i < n && hex.length < 6 && HEX_DIGIT_RE.test(source[i])) { hex += source[i]; i++; }
      if (i < n && WHITESPACE_RE.test(source[i])) i++; // one trailing whitespace char is part of the escape
      const code = Number.parseInt(hex, 16);
      if (!code || (code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff) return '�';
      try { return String.fromCodePoint(code); } catch { return '�'; }
    }
    i++;
    return ch;
  }

  function consumeComment() {
    i += 2; // '/*'
    const end = source.indexOf('*/', i);
    i = end === -1 ? n : end + 2;
  }

  function consumeWhitespace() {
    while (i < n && WHITESPACE_RE.test(source[i])) i++;
  }

  function consumeIdentLike() {
    let value = '';
    while (i < n) {
      if (isEscapeStart()) { i++; value += consumeEscapedCodePoint(); continue; }
      if (IDENT_CONT_RE.test(source[i])) { value += source[i]; i++; continue; }
      break;
    }
    return value;
  }

  function consumeString(quote) {
    i++; // opening quote
    let value = '';
    while (i < n) {
      const ch = source[i];
      if (ch === quote) { i++; return value; }
      if (ch === '\n') return value; // bad-string: unescaped newline ends it (not consumed)
      if (ch === '\\') {
        if (i + 1 >= n) { i++; continue; } // trailing backslash at EOF: drop
        if (source[i + 1] === '\n') { i += 2; continue; } // line continuation: contributes nothing
        i++;
        value += consumeEscapedCodePoint();
        continue;
      }
      value += ch;
      i++;
    }
    return value; // EOF
  }

  function consumeToNextUnescapedParen() {
    while (i < n) {
      if (source[i] === ')') { i++; return; }
      if (source[i] === '\\' && i + 1 < n) { i += 2; continue; }
      i++;
    }
  }

  /** Called with `i` right after the '(' of a case-insensitive "url(" that isn't followed by a quote. */
  function consumeUrlToken() {
    consumeWhitespace();
    let value = '';
    while (i < n) {
      const ch = source[i];
      if (ch === ')') { i++; return value; }
      if (WHITESPACE_RE.test(ch)) {
        consumeWhitespace();
        if (i < n && source[i] === ')') { i++; return value; }
        consumeToNextUnescapedParen(); // bad-url: anything after whitespace but ')' — discard the rest
        return value;
      }
      if (ch === '"' || ch === "'" || ch === '(') { consumeToNextUnescapedParen(); return value; } // bad-url
      if (ch === '\\') {
        if (isEscapeStart()) { i++; value += consumeEscapedCodePoint(); continue; }
        consumeToNextUnescapedParen(); // backslash-newline inside an unquoted url: bad-url
        return value;
      }
      value += ch;
      i++;
    }
    return value; // EOF
  }

  while (i < n) {
    const ch = source[i];
    if (ch === '/' && source[i + 1] === '*') { consumeComment(); continue; }
    if (WHITESPACE_RE.test(ch)) { consumeWhitespace(); continue; }
    if (ch === '"' || ch === "'") { tokens.push({ type: 'string', value: consumeString(ch) }); continue; }
    if (ch === '@') {
      i++;
      if (i < n && (IDENT_START_RE.test(source[i]) || source[i] === '-' || isEscapeStart())) {
        tokens.push({ type: 'at-keyword', value: consumeIdentLike() });
      } else {
        tokens.push({ type: 'punct', value: '@' });
      }
      continue;
    }
    if (IDENT_START_RE.test(ch) || ch === '-' || isEscapeStart()) {
      const before = i;
      const name = consumeIdentLike();
      if (name.length === 0) { i = before + 1; continue; } // safety net against a stall
      if (i < n && source[i] === '(') {
        i++; // consume '('
        if (name.toLowerCase() === 'url') {
          const afterParen = i;
          consumeWhitespace();
          if (i < n && (source[i] === '"' || source[i] === "'")) {
            i = afterParen; // not a url-token after all — rewind; treat "url(" as an ordinary function
            tokens.push({ type: 'function', value: 'url' });
            tokens.push({ type: 'punct', value: '(' });
          } else {
            i = afterParen; // consumeUrlToken does its own leading-whitespace skip
            tokens.push({ type: 'url', value: consumeUrlToken() });
          }
        } else {
          tokens.push({ type: 'function', value: name.toLowerCase() });
          tokens.push({ type: 'punct', value: '(' });
        }
      } else {
        tokens.push({ type: 'ident', value: name });
      }
      continue;
    }
    if (STRUCTURAL_PUNCT.has(ch)) { tokens.push({ type: 'punct', value: ch }); i++; continue; }
    i++; // anything else (numbers, colours, combinators, attribute-selector brackets, …): not needed
  }
  return tokens;
}
