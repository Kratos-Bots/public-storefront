import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preprocessCss, tokenizeCss } from './css-tokenizer.mjs';

const ident = (value) => ({ type: 'ident', value });
const punct = (value) => ({ type: 'punct', value });
const str = (value) => ({ type: 'string', value });
const url = (value) => ({ type: 'url', value });
const fn = (value) => ({ type: 'function', value });
const delim = (value) => ({ type: 'delim', value });

test('skips comments and whitespace, emitting nothing for them', () => {
  assert.deepEqual(tokenizeCss('  /* comment */  '), []);
  assert.deepEqual(tokenizeCss('a/**/b'), [ident('a'), ident('b')]);
  assert.deepEqual(tokenizeCss('/* unterminated'), []); // runs to EOF, doesn't throw
});

test('§3.3 preprocessing: CR, CRLF and FF become LF; NUL and lone surrogates become U+FFFD', () => {
  assert.equal(preprocessCss('a\r\nb\rc\fd'), 'a\nb\nc\nd');
  assert.equal(preprocessCss('a\0b'), 'a�b');
  assert.equal(preprocessCss('a\uD800b\uDC00c😀'), 'a�b�c😀');
  // a raw CR/FF inside a string is a newline, so it ends the string (bad-string) exactly like LF
  assert.deepEqual(tokenizeCss('"a\rb"'), [{ type: 'bad-string', value: 'a' }, ident('b'), { type: 'string', value: '' }]);
  assert.deepEqual(tokenizeCss('"a\fb"'), [{ type: 'bad-string', value: 'a' }, ident('b'), { type: 'string', value: '' }]);
  // backslash-CRLF is ONE line continuation (CRLF is a single newline), not continuation + bad-string
  assert.deepEqual(tokenizeCss('"x\\\r\n" y'), [str('x'), ident('y')]);
  assert.deepEqual(tokenizeCss('a\0b'), [ident('a�b')]);
});

test('strings: basic, escapes, line continuation, bad-string, EOF', () => {
  assert.deepEqual(tokenizeCss(`"hello"`), [str('hello')]);
  assert.deepEqual(tokenizeCss(`'hello'`), [str('hello')]);
  // \" -> literal ", and it does NOT end the string (this is the round-2 desync bug)
  assert.deepEqual(tokenizeCss(`"\\""`), [str('"')]);
  assert.deepEqual(tokenizeCss(`"\\22"`), [str('"')]); // \22 hex = '"'
  // hex escape with the optional trailing whitespace consumed (not emitted)
  assert.deepEqual(tokenizeCss(`"\\2f\\2f evil"`), [str('//evil')]);
  // \<char> for a non-hex char is just that literal char
  assert.deepEqual(tokenizeCss(`"a\\.b"`), [str('a.b')]);
  // line continuation (backslash-newline) contributes nothing
  assert.deepEqual(tokenizeCss('"a\\\nb"'), [str('ab')]);
  // unescaped newline: bad-string, ends without consuming the newline; tokenizing continues after it
  assert.deepEqual(tokenizeCss('"abc\ndef"'), [{ type: 'bad-string', value: 'abc' }, ident('def'), str('')]);
  // unterminated at EOF: returns what it has, doesn't throw
  assert.deepEqual(tokenizeCss(`"abc`), [str('abc')]);
});

test('url-token (unquoted form): basic, escapes, whitespace, bad-url', () => {
  assert.deepEqual(tokenizeCss('url(./a.png)'), [url('./a.png')]);
  assert.deepEqual(tokenizeCss('URL(./a.png)'), [url('./a.png')]); // case-insensitive
  assert.deepEqual(tokenizeCss('url( ./a.png )'), [url('./a.png')]); // leading/trailing ws
  assert.deepEqual(tokenizeCss('u\\72l(./a.png)'), [url('./a.png')]); // name compared after escape decoding
  // the three round-3 bypasses: escapes inside an unquoted url-token must decode without desyncing the ')'
  assert.deepEqual(tokenizeCss(`url(https://evil.example/x.png#\\')`), [url("https://evil.example/x.png#'")]);
  assert.deepEqual(tokenizeCss(`url(https://evil.example/x.png?a=\\")`), [url('https://evil.example/x.png?a="')]);
  assert.deepEqual(tokenizeCss(`url(https://evil.example/x.png?\\27)`), [url("https://evil.example/x.png?'")]);
  assert.deepEqual(tokenizeCss(`url(.\\2e/.\\2e/secret.png)`), [url('../../secret.png')]);
  assert.deepEqual(tokenizeCss(`url(\\2f\\2f evil.example/x.png)`), [url('//evil.example/x.png')]);
  // escapes decode to whatever they name, including tab / LF / C0 (URL-level normalisation is the caller's job)
  assert.deepEqual(tokenizeCss(`url(h\\9ttps://e)`), [url('h\tttps://e')]);
  assert.deepEqual(tokenizeCss(`url(\\1 https://e)`), [url('\u0001https://e')]);
  // bad-url: an unescaped quote/paren/non-printable inside an unquoted url — discarded up to the next ')'
  assert.deepEqual(tokenizeCss(`url(a"b) c`), [{ type: 'bad-url', value: 'a' }, ident('c')]);
  assert.deepEqual(tokenizeCss(`url(a\u0001b) c`), [{ type: 'bad-url', value: 'a' }, ident('c')]);
  assert.deepEqual(tokenizeCss(`url(a b\\) c) d`), [{ type: 'bad-url', value: 'a' }, ident('d')]); // escaped ')' does not end remnants
});

test('url(...) with a quoted argument is NOT a url-token — it is a function + string, like any other function', () => {
  assert.deepEqual(tokenizeCss(`url("x.png")`), [fn('url'), str('x.png'), punct(')')]);
  assert.deepEqual(tokenizeCss(`url( "x.png" )`), [fn('url'), str('x.png'), punct(')')]);
  assert.deepEqual(tokenizeCss(`url(   'x.png')`), [fn('url'), str('x.png'), punct(')')]);
});

test('function tokens: ASCII-lowercased, hyphen-prefixed names, nested calls', () => {
  assert.deepEqual(tokenizeCss(`Image-Set("x.png" 1x)`), [fn('image-set'), str('x.png'), { type: 'dimension', value: '1', unit: 'x' }, punct(')')]);
  assert.deepEqual(tokenizeCss(`image-set(url(a.png) 1x)`), [fn('image-set'), url('a.png'), { type: 'dimension', value: '1', unit: 'x' }, punct(')')]);
  assert.deepEqual(tokenizeCss(`-webkit-image-set(`), [fn('-webkit-image-set')]);
});

test('numbers, percentages and dimensions per §4.3.3 (a number swallows a following ident as its unit)', () => {
  assert.deepEqual(tokenizeCss('.5rem 10% -2.5e3px +1 1e 3E+2'), [
    { type: 'dimension', value: '.5', unit: 'rem' },
    { type: 'percentage', value: '10' },
    { type: 'dimension', value: '-2.5e3', unit: 'px' },
    { type: 'number', value: '+1' },
    { type: 'dimension', value: '1', unit: 'e' },
    { type: 'number', value: '3E+2' },
  ]);
  // "1url(" is a dimension with unit "url" followed by a plain '(' — never a url-token or function
  assert.deepEqual(tokenizeCss('1url(a"b)"'), [{ type: 'dimension', value: '1', unit: 'url' }, punct('('), ident('a'), str('b)'), ]);
  assert.deepEqual(tokenizeCss('.5url(x)'), [{ type: 'dimension', value: '.5', unit: 'url' }, punct('('), ident('x'), punct(')')]);
  assert.deepEqual(tokenizeCss('-.5 - . +'), [{ type: 'number', value: '-.5' }, delim('-'), delim('.'), delim('+')]);
});

test('hash tokens: "#" followed by an ident code point or escape consumes an ident sequence', () => {
  assert.deepEqual(tokenizeCss('#fff #1a2 #url(x) # a'), [
    { type: 'hash', value: 'fff' },
    { type: 'hash', value: '1a2' },
    { type: 'hash', value: 'url' },
    punct('('), ident('x'), punct(')'),
    delim('#'), ident('a'),
  ]);
});

test('at-keywords, CDO/CDC and delims', () => {
  assert.deepEqual(tokenizeCss('@import'), [{ type: 'at-keyword', value: 'import' }]);
  assert.deepEqual(tokenizeCss('@IMPORT'), [{ type: 'at-keyword', value: 'IMPORT' }]);
  assert.deepEqual(tokenizeCss('@\\69mport'), [{ type: 'at-keyword', value: 'import' }]);
  assert.deepEqual(tokenizeCss('@font-face'), [{ type: 'at-keyword', value: 'font-face' }]);
  assert.deepEqual(tokenizeCss('a@b'), [ident('a'), { type: 'at-keyword', value: 'b' }]);
  assert.deepEqual(tokenizeCss('a@1'), [ident('a'), delim('@'), { type: 'number', value: '1' }]);
  assert.deepEqual(tokenizeCss('<!-- --> <'), [{ type: 'cdo', value: '<!--' }, { type: 'cdc', value: '-->' }, delim('<')]);
  assert.deepEqual(tokenizeCss('\\\n'), [delim('\\')]); // backslash-newline outside a string is not an escape
  assert.deepEqual(tokenizeCss('\\'), [ident('�')]); // backslash at EOF is an escape of EOF
});

test('structural punctuation and ordinary idents', () => {
  assert.deepEqual(tokenizeCss('( ) , : ; [ ] { }'), ['(', ')', ',', ':', ';', '[', ']', '{', '}'].map(punct));
  assert.deepEqual(tokenizeCss('foo'), [ident('foo')]);
  assert.deepEqual(tokenizeCss('-webkit-transform --x'), [ident('-webkit-transform'), ident('--x')]);
});

test('non-ASCII ident code points: browser mode (all >= U+0080) vs spec mode (css-syntax-3 ranges)', () => {
  assert.deepEqual(tokenizeCss('×url(x)'), [fn('×url'), ident('x'), punct(')')]);
  assert.deepEqual(tokenizeCss('×url(x)', { nonAsciiIdent: 'spec' }), [delim('×'), url('x')]);
  assert.deepEqual(tokenizeCss('été 😀', { nonAsciiIdent: 'spec' }), [ident('été'), ident('😀')]);
});

test('content that must be ignored by callers still tokenizes without desyncing what follows', () => {
  // the round-3 bypass: an escaped quote inside a content string must not corrupt the next rule's tokens
  const tokens = tokenizeCss(`a{content:"\\""} b{background:image-set("https://evil.example/x.png" 1x)}`);
  assert.deepEqual(tokens, [
    ident('a'), punct('{'), ident('content'), punct(':'), str('"'), punct('}'),
    ident('b'), punct('{'), ident('background'), punct(':'),
    fn('image-set'), str('https://evil.example/x.png'), { type: 'dimension', value: '1', unit: 'x' }, punct(')'),
    punct('}'),
  ]);
});
