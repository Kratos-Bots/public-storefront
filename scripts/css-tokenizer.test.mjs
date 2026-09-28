import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeCss } from './css-tokenizer.mjs';

test('skips comments and whitespace, emitting nothing for them', () => {
  assert.deepEqual(tokenizeCss('  /* comment */  '), []);
  assert.deepEqual(tokenizeCss('a/**/b'), [{ type: 'ident', value: 'a' }, { type: 'ident', value: 'b' }]);
  assert.deepEqual(tokenizeCss('/* unterminated'), []); // runs to EOF, doesn't throw
});

test('strings: basic, escapes, line continuation, bad-string, EOF', () => {
  assert.deepEqual(tokenizeCss(`"hello"`), [{ type: 'string', value: 'hello' }]);
  assert.deepEqual(tokenizeCss(`'hello'`), [{ type: 'string', value: 'hello' }]);
  // \" -> literal ", and it does NOT end the string (this is the round-2 desync bug)
  assert.deepEqual(tokenizeCss(`"\\""`), [{ type: 'string', value: '"' }]);
  assert.deepEqual(tokenizeCss(`"\\22"`), [{ type: 'string', value: '"' }]); // \22 hex = '"'
  // hex escape with the optional trailing whitespace consumed (not emitted)
  assert.deepEqual(tokenizeCss(`"\\2f\\2f evil"`), [{ type: 'string', value: '//evil' }]);
  // \<char> for a non-hex char is just that literal char
  assert.deepEqual(tokenizeCss(`"a\\.b"`), [{ type: 'string', value: 'a.b' }]);
  // line continuation (backslash-newline) contributes nothing
  assert.deepEqual(tokenizeCss('"a\\\nb"'), [{ type: 'string', value: 'ab' }]);
  // unescaped newline: bad-string, ends without consuming the newline; tokenizing continues after it
  assert.deepEqual(tokenizeCss('"abc\ndef"'), [{ type: 'string', value: 'abc' }, { type: 'ident', value: 'def' }, { type: 'string', value: '' }]);
  // unterminated at EOF: returns what it has, doesn't throw
  assert.deepEqual(tokenizeCss(`"abc`), [{ type: 'string', value: 'abc' }]);
});

test('url-token (unquoted form): basic, escapes, whitespace, bad-url', () => {
  assert.deepEqual(tokenizeCss('url(./a.png)'), [{ type: 'url', value: './a.png' }]);
  assert.deepEqual(tokenizeCss('URL(./a.png)'), [{ type: 'url', value: './a.png' }]); // case-insensitive
  assert.deepEqual(tokenizeCss('url( ./a.png )'), [{ type: 'url', value: './a.png' }]); // leading/trailing ws
  // the three round-3 bypasses: escapes inside an unquoted url-token must decode without desyncing the ')'
  assert.deepEqual(tokenizeCss(`url(https://evil.example/x.png#\\')`), [{ type: 'url', value: "https://evil.example/x.png#'" }]);
  assert.deepEqual(tokenizeCss(`url(https://evil.example/x.png?a=\\")`), [{ type: 'url', value: 'https://evil.example/x.png?a="' }]);
  assert.deepEqual(tokenizeCss(`url(https://evil.example/x.png?\\27)`), [{ type: 'url', value: "https://evil.example/x.png?'" }]);
  assert.deepEqual(tokenizeCss(`url(.\\2e/.\\2e/secret.png)`), [{ type: 'url', value: '../../secret.png' }]);
  assert.deepEqual(tokenizeCss(`url(\\2f\\2f evil.example/x.png)`), [{ type: 'url', value: '//evil.example/x.png' }]);
  // bad-url: an unescaped quote/paren inside an unquoted url — discarded up to the next ')', tokenizing continues after
  assert.deepEqual(tokenizeCss(`url(a"b) c`), [{ type: 'url', value: 'a' }, { type: 'ident', value: 'c' }]);
});

test('url(...) with a quoted argument is NOT a url-token — it is a function + string, like any other function', () => {
  assert.deepEqual(tokenizeCss(`url("x.png")`), [
    { type: 'function', value: 'url' },
    { type: 'punct', value: '(' },
    { type: 'string', value: 'x.png' },
    { type: 'punct', value: ')' },
  ]);
  assert.deepEqual(tokenizeCss(`url( "x.png" )`), [
    { type: 'function', value: 'url' },
    { type: 'punct', value: '(' },
    { type: 'string', value: 'x.png' },
    { type: 'punct', value: ')' },
  ]);
});

test('function tokens: lowercased, hyphen-prefixed names, nested calls', () => {
  // note: a leading digit isn't an ident-start code point (numbers/dimensions aren't modelled — see
  // the module doc), so "1x" surfaces as the digit being skipped and "x" tokenizing as an ident;
  // harmless here since nothing keys off these descriptor tokens at all.
  assert.deepEqual(tokenizeCss(`Image-Set("x.png" 1x)`), [
    { type: 'function', value: 'image-set' },
    { type: 'punct', value: '(' },
    { type: 'string', value: 'x.png' },
    { type: 'ident', value: 'x' },
    { type: 'punct', value: ')' },
  ]);
  const nested = tokenizeCss(`image-set(url(a.png) 1x)`);
  assert.deepEqual(nested, [
    { type: 'function', value: 'image-set' },
    { type: 'punct', value: '(' },
    { type: 'url', value: 'a.png' },
    { type: 'ident', value: 'x' },
    { type: 'punct', value: ')' },
  ]);
});

test('at-keywords: case preserved on the value, non-ident after @ is a punct', () => {
  assert.deepEqual(tokenizeCss('@import'), [{ type: 'at-keyword', value: 'import' }]);
  assert.deepEqual(tokenizeCss('@IMPORT'), [{ type: 'at-keyword', value: 'IMPORT' }]);
  assert.deepEqual(tokenizeCss('@font-face'), [{ type: 'at-keyword', value: 'font-face' }]);
  // '@' followed by a valid ident-start IS an at-keyword regardless of what precedes it
  assert.deepEqual(tokenizeCss('a@b'), [{ type: 'ident', value: 'a' }, { type: 'at-keyword', value: 'b' }]);
  // '@' NOT followed by an ident-start (here: a digit) falls back to a bare punct
  assert.deepEqual(tokenizeCss('a@1'), [{ type: 'ident', value: 'a' }, { type: 'punct', value: '@' }]);
});

test('structural punctuation and ordinary idents', () => {
  assert.deepEqual(tokenizeCss('( ) , ; { }'), ['(', ')', ',', ';', '{', '}'].map((value) => ({ type: 'punct', value })));
  assert.deepEqual(tokenizeCss('foo'), [{ type: 'ident', value: 'foo' }]);
  assert.deepEqual(tokenizeCss('-webkit-transform'), [{ type: 'ident', value: '-webkit-transform' }]);
});

test('content that must be ignored by callers still tokenizes without desyncing what follows', () => {
  // the round-3 bypass: an escaped quote inside a content string must not corrupt the next rule's tokens
  const tokens = tokenizeCss(`a{content:"\\""} b{background:image-set("https://evil.example/x.png" 1x)}`);
  assert.deepEqual(tokens, [
    { type: 'ident', value: 'a' },
    { type: 'punct', value: '{' },
    { type: 'ident', value: 'content' },
    { type: 'string', value: '"' },
    { type: 'punct', value: '}' },
    { type: 'ident', value: 'b' },
    { type: 'punct', value: '{' },
    { type: 'ident', value: 'background' },
    { type: 'function', value: 'image-set' },
    { type: 'punct', value: '(' },
    { type: 'string', value: 'https://evil.example/x.png' },
    { type: 'ident', value: 'x' },
    { type: 'punct', value: ')' },
    { type: 'punct', value: '}' },
  ]);
});
