/**
 * A CSS Syntax Level 3 tokenizer (§3.3 preprocessing + §4.3 tokenization), dependency-free. Used by
 * the template CSS guardrail (template-imports.mjs) to find, the way a browser does, every string,
 * url-token, function and at-keyword in a stylesheet.
 *
 * Why a full tokenizer and not "just the URL-shaped parts": any construct the tokenizer skips or
 * mis-sizes can shift token boundaries for everything after it. Earlier versions skipped numbers and
 * hashes, so `1url(a"b)` — a dimension followed by '(' to a browser — opened a fake bad-url here and
 * hid the next rule inside a string; and without §3.3, a raw CR/FF in a string did not end it here
 * while it does in a browser. Every token type in §4.3.1 is therefore modelled, and escapes are
 * decoded per token, only once that token's boundaries are fixed.
 *
 * Non-ASCII ident code points: browsers (Blink, Gecko, WebKit) treat every code point >= U+0080 as
 * an ident code point; css-syntax-3 (and spec-following tools) now allow only listed ranges. Because
 * the two readings tokenize `×url(…)` differently, `nonAsciiIdent` selects one ('all' = browser,
 * the default; 'spec' = css-syntax-3) and the guardrail scans with both.
 *
 * Single forward pass, no backtracking: linear in the input length.
 *
 * Token shapes ({ type, value }; comments and whitespace are consumed and never emitted):
 *   ident, function (value ASCII-lowercased, the '(' is part of the token), at-keyword (case kept),
 *   hash, string, bad-string, url, bad-url (value = what was read before it went bad),
 *   number / percentage (value = numeric source text), dimension (value = numeric text, + unit),
 *   delim (one code point), cdo '<!--', cdc '-->', punct ( ) [ ] { } , : ;
 */

const PUNCT = new Set(['(', ')', '[', ']', '{', '}', ',', ':', ';']);

/** §3.3: CRLF / CR / FF -> LF; NUL and lone surrogates -> U+FFFD. */
export function preprocessCss(source) {
  return source
    .replace(/\r\n?|\f/g, '\n')
    .replace(/\0|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�');
}

const isDigit = (c) => c >= 0x30 && c <= 0x39;
const isHex = (c) => isDigit(c) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66);
const isLetter = (c) => (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
const isWhitespace = (c) => c === 0x0a || c === 0x09 || c === 0x20;
const isNonPrintable = (c) => (c >= 0 && c <= 0x08) || c === 0x0b || (c >= 0x0e && c <= 0x1f) || c === 0x7f;

/** css-syntax-3 "non-ASCII ident code point", on UTF-16 code units (a surrogate is part of a >= U+10000 pair). */
function isSpecNonAsciiIdent(c) {
  return c === 0xb7 || (c >= 0xc0 && c <= 0xd6) || (c >= 0xd8 && c <= 0xf6) || (c >= 0xf8 && c <= 0x37d)
    || (c >= 0x37f && c <= 0x1fff) || c === 0x200c || c === 0x200d || c === 0x203f || c === 0x2040
    || (c >= 0x2070 && c <= 0x218f) || (c >= 0x2c00 && c <= 0x2fef) || (c >= 0x3001 && c <= 0xdfff)
    || (c >= 0xf900 && c <= 0xfdcf) || (c >= 0xfdf0 && c <= 0xfffd);
}

const asciiLower = (s) => s.replace(/[A-Z]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 32));

export function tokenizeCss(input, { nonAsciiIdent = 'all' } = {}) {
  const s = preprocessCss(input);
  const n = s.length;
  const tokens = [];
  let i = 0;

  const at = (k) => (k < n ? s.charCodeAt(k) : -1);
  const isIdentStart = nonAsciiIdent === 'spec'
    ? (c) => isLetter(c) || c === 0x5f || (c >= 0x80 && isSpecNonAsciiIdent(c))
    : (c) => isLetter(c) || c === 0x5f || c >= 0x80;
  const isIdentChar = (c) => isIdentStart(c) || isDigit(c) || c === 0x2d;
  /** §4.3.8: '\' not followed by a newline (EOF after '\' counts as valid). */
  const isValidEscape = (k) => at(k) === 0x5c && at(k + 1) !== 0x0a;
  /** §4.3.9 */
  const startsIdentSequence = (k) => {
    const c = at(k);
    if (c === 0x2d) { const d = at(k + 1); return isIdentStart(d) || d === 0x2d || isValidEscape(k + 1); }
    if (isIdentStart(c)) return true;
    return isValidEscape(k);
  };
  /** §4.3.10 */
  const startsNumber = (k) => {
    const c = at(k);
    if (c === 0x2b || c === 0x2d) { const d = at(k + 1); return isDigit(d) || (d === 0x2e && isDigit(at(k + 2))); }
    if (c === 0x2e) return isDigit(at(k + 1));
    return isDigit(c);
  };

  /** §4.3.7 — called with `i` just past the backslash. */
  function consumeEscape() {
    if (i >= n) return '�';
    const c = at(i);
    if (isHex(c)) {
      let value = 0;
      for (let len = 0; len < 6 && isHex(at(i)); len++, i++) value = value * 16 + Number.parseInt(s[i], 16);
      if (isWhitespace(at(i))) i++;
      if (value === 0 || (value >= 0xd800 && value <= 0xdfff) || value > 0x10ffff) return '�';
      return String.fromCodePoint(value);
    }
    i++;
    return s[i - 1];
  }

  /** §4.3.11 */
  function consumeIdentSequence() {
    let out = '';
    for (;;) {
      if (isIdentChar(at(i))) { out += s[i++]; continue; }
      if (isValidEscape(i)) { i++; out += consumeEscape(); continue; }
      return out;
    }
  }

  /** §4.3.12 — returns the numeric source text. */
  function consumeNumber() {
    const start = i;
    if (at(i) === 0x2b || at(i) === 0x2d) i++;
    while (isDigit(at(i))) i++;
    if (at(i) === 0x2e && isDigit(at(i + 1))) { i += 2; while (isDigit(at(i))) i++; }
    if (at(i) === 0x45 || at(i) === 0x65) {
      const d = at(i + 1);
      if (isDigit(d)) i += 2;
      else if ((d === 0x2b || d === 0x2d) && isDigit(at(i + 2))) i += 3;
      else return s.slice(start, i);
      while (isDigit(at(i))) i++;
    }
    return s.slice(start, i);
  }

  /** §4.3.3 */
  function consumeNumeric() {
    const value = consumeNumber();
    if (startsIdentSequence(i)) return { type: 'dimension', value, unit: consumeIdentSequence() };
    if (at(i) === 0x25) { i++; return { type: 'percentage', value }; }
    return { type: 'number', value };
  }

  /** §4.3.14 */
  function consumeBadUrlRemnants() {
    while (i < n) {
      if (at(i) === 0x29) { i++; return; }
      if (isValidEscape(i)) { i++; consumeEscape(); continue; }
      i++;
    }
  }

  /** §4.3.6 — called with `i` just past "url(" (whitespace not yet consumed). */
  function consumeUrl() {
    while (isWhitespace(at(i))) i++;
    let value = '';
    for (;;) {
      if (i >= n) return { type: 'url', value };
      const c = at(i);
      if (c === 0x29) { i++; return { type: 'url', value }; }
      if (isWhitespace(c)) {
        while (isWhitespace(at(i))) i++;
        if (i >= n) return { type: 'url', value };
        if (at(i) === 0x29) { i++; return { type: 'url', value }; }
        consumeBadUrlRemnants();
        return { type: 'bad-url', value };
      }
      if (c === 0x22 || c === 0x27 || c === 0x28 || isNonPrintable(c) || (c === 0x5c && !isValidEscape(i))) {
        consumeBadUrlRemnants();
        return { type: 'bad-url', value };
      }
      if (c === 0x5c) { i++; value += consumeEscape(); continue; }
      value += s[i++];
    }
  }

  /** §4.3.4 */
  function consumeIdentLike() {
    const name = consumeIdentSequence();
    if (at(i) !== 0x28) return { type: 'ident', value: name };
    i++;
    const lower = asciiLower(name);
    if (lower === 'url') {
      while (isWhitespace(at(i)) && isWhitespace(at(i + 1))) i++;
      const c = at(i);
      const d = at(i + 1);
      if (c === 0x22 || c === 0x27 || (isWhitespace(c) && (d === 0x22 || d === 0x27))) return { type: 'function', value: lower };
      return consumeUrl();
    }
    return { type: 'function', value: lower };
  }

  /** §4.3.5 — called with `i` on the opening quote. */
  function consumeString(quote) {
    i++;
    let value = '';
    for (;;) {
      if (i >= n) return { type: 'string', value };
      const c = at(i);
      if (c === quote) { i++; return { type: 'string', value }; }
      if (c === 0x0a) return { type: 'bad-string', value }; // newline is not consumed
      if (c === 0x5c) {
        if (i + 1 >= n) { i++; continue; }
        if (at(i + 1) === 0x0a) { i += 2; continue; }
        i++;
        value += consumeEscape();
        continue;
      }
      value += s[i++];
    }
  }

  const delim = () => ({ type: 'delim', value: s[i++] });

  while (i < n) {
    const c = at(i);
    if (c === 0x2f && at(i + 1) === 0x2a) { // comment
      const end = s.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
    } else if (isWhitespace(c)) {
      while (isWhitespace(at(i))) i++;
    } else if (c === 0x22 || c === 0x27) {
      tokens.push(consumeString(c));
    } else if (c === 0x23) { // '#'
      if (isIdentChar(at(i + 1)) || isValidEscape(i + 1)) { i++; tokens.push({ type: 'hash', value: consumeIdentSequence() }); }
      else tokens.push(delim());
    } else if (c === 0x2b || c === 0x2e) { // '+' '.'
      tokens.push(startsNumber(i) ? consumeNumeric() : delim());
    } else if (c === 0x2d) { // '-'
      if (startsNumber(i)) tokens.push(consumeNumeric());
      else if (at(i + 1) === 0x2d && at(i + 2) === 0x3e) { i += 3; tokens.push({ type: 'cdc', value: '-->' }); }
      else if (startsIdentSequence(i)) tokens.push(consumeIdentLike());
      else tokens.push(delim());
    } else if (c === 0x3c) { // '<'
      if (s.startsWith('!--', i + 1)) { i += 4; tokens.push({ type: 'cdo', value: '<!--' }); }
      else tokens.push(delim());
    } else if (c === 0x40) { // '@'
      if (startsIdentSequence(i + 1)) { i++; tokens.push({ type: 'at-keyword', value: consumeIdentSequence() }); }
      else tokens.push(delim());
    } else if (c === 0x5c) { // '\'
      tokens.push(isValidEscape(i) ? consumeIdentLike() : delim());
    } else if (isDigit(c)) {
      tokens.push(consumeNumeric());
    } else if (isIdentStart(c)) {
      tokens.push(consumeIdentLike());
    } else if (PUNCT.has(s[i])) {
      tokens.push({ type: 'punct', value: s[i++] });
    } else {
      tokens.push(delim());
    }
  }
  return tokens;
}
