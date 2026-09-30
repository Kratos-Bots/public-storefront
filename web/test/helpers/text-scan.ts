/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { formsOf } from '@/text/define.ts';
import { TEXT_ENTRIES } from '@/text/registry.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SRC_ROOT = path.resolve(here, '../../src');
export const INVENTORY_FILE = path.resolve(here, 'text-inventory.json');

export type GuardRule = 'jsx-text' | 'text-attr' | 'jsx-child' | 'text-call' | 'text-prop' | 'sentence';
export interface Finding { file: string; line: number; rule: GuardRule; text: string }
/** `text: '*'` allows every finding in `file`. */
export interface AllowEntry { file: string; text: string; reason: string }

const EXCLUDED = [/^builder\/editor\//, /^text\/keys\//, /^text\/notes\//, /\.d\.ts$/];
const TEXT_ATTRS = new Set(['aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'placeholder', 'title', 'alt', 'label', 'eyebrow', 'description', 'labelText', 'hint', 'message', 'ariaLabel']);
const TEXT_PROPS = new Set(['message', 'title', 'label', 'description', 'placeholder', 'hint', 'ariaLabel', 'eyebrow']);
const TEXT_CALLS = new Set(['setErrors', 'setError', 'errorMessage', 'notifications.show']);
const ZOD_CALLS = new Set(['min', 'max', 'length', 'email', 'url', 'regex', 'nonempty', 'refine', 'superRefine']);
const NON_TEXT_PROPS = new Set(['className', 'classNames', 'style', 'styles', 'key', 'id', 'href', 'to', 'src', 'type', 'name', 'variant', 'size', 'color', 'component', 'rel', 'target', 'role', 'autoComplete', 'inputMode', 'position', 'radius', 'transition', 'path']);
const BUILTIN_ERRORS = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'DOMException']);
const LETTER = /\p{L}/u;
const SENTENCE = /\p{L}{2,}[  ]+\p{L}{2,}|’/u;
const CODEISH = /var\(--|[{};=]|:\/\//;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', middot: '·', larr: '←', rarr: '→', times: '×' };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** JSX text as React renders it: per line, trim the indentation side(s); drop empty lines; join with one space. */
export function renderedJsxText(raw: string): string {
  const lines = raw.split(/\r\n|\n|\r/);
  const kept: string[] = [];
  lines.forEach((line, i) => {
    let s = line;
    if (i !== 0) s = s.replace(/^[ \t]+/, '');
    if (i !== lines.length - 1) s = s.replace(/[ \t]+$/, '');
    if (s) kept.push(s);
  });
  return decodeEntities(kept.join(' '));
}

function templateText(e: ts.TemplateExpression): string {
  return e.head.text + e.templateSpans.map((s) => `\${}${s.literal.text}`).join('');
}

/** `const name = …` initialisers of one file, for names declared exactly once (no scope analysis needed). */
type Consts = ReadonlyMap<string, ts.Expression>;
function fileConsts(src: ts.SourceFile): Consts {
  const found = new Map<string, ts.Expression | null>();
  const walk = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
      const list = n.parent;
      const init = ts.isVariableDeclarationList(list) && list.flags & ts.NodeFlags.Const ? n.initializer : undefined;
      found.set(n.name.text, found.has(n.name.text) || !init ? null : init);
    }
    ts.forEachChild(n, walk);
  };
  walk(src);
  const out = new Map<string, ts.Expression>();
  for (const [k, v] of found) if (v) out.set(k, v);
  return out;
}

/**
 * String-ish leaves of an expression, following ?:, ||, ??, &&, parens and casts — and, when `consts`
 * is given, an identifier bound by a same-file `const` (`const label = a ? '[Catalogue]' : …; <p>{label}</p>`).
 */
function leaves(e: ts.Expression, consts?: Consts, depth = 0): Array<{ node: ts.Node; text: string }> {
  const next = (x: ts.Expression) => leaves(x, consts, depth);
  if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e)) return next(e.expression);
  if (ts.isConditionalExpression(e)) return [...next(e.whenTrue), ...next(e.whenFalse)];
  if (ts.isBinaryExpression(e) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(e.operatorToken.kind)) {
    return [...next(e.left), ...next(e.right)];
  }
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [{ node: e, text: e.text }];
  if (ts.isTemplateExpression(e)) return [{ node: e, text: templateText(e) }];
  const bound = consts && depth < 3 && ts.isIdentifier(e) ? consts.get(e.text) : undefined;
  if (bound) return leaves(bound, consts, depth + 1);
  return [];
}

/**
 * Properties of a call argument that never hold shopper text: a toast `color`, a zod issue `path`.
 * Deliberately not NON_TEXT_PROPS — `setErrors({ name: 'Enter your name' })` keys messages by field
 * name, so `name`, `type`, `id`… must still be reported.
 */
const CALL_ARG_NON_TEXT = new Set(['color', 'path']);

/** leaves(), plus object-literal values and array elements, recursively (call arguments), skipping CALL_ARG_NON_TEXT. */
function deepLeaves(e: ts.Expression): Array<{ node: ts.Node; text: string }> {
  if (ts.isObjectLiteralExpression(e)) {
    return e.properties.flatMap((p) => (ts.isPropertyAssignment(p) && !CALL_ARG_NON_TEXT.has(p.name.getText()) ? deepLeaves(p.initializer) : []));
  }
  if (ts.isArrayLiteralExpression(e)) return e.elements.flatMap((x) => deepLeaves(x));
  return leaves(e);
}

function calleeName(c: ts.CallExpression): string {
  const x = c.expression;
  if (ts.isIdentifier(x)) return x.text;
  if (ts.isPropertyAccessExpression(x)) return ts.isIdentifier(x.expression) && x.expression.text === 'notifications' ? `notifications.${x.name.text}` : x.name.text;
  return '';
}

const isJsxBoundary = (n: ts.Node) => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n);

/**
 * True inside defineBlock({ label, defaultProps, text, textProps }) — the palette label, owner starter
 * content, and the registry key names a block declares (`textProps: { ariaLabel: 'shell.nav.ariaLabel' }`).
 */
const DEFINE_BLOCK_EXEMPT = new Set(['label', 'defaultProps', 'text', 'textProps']);
function inDefineBlockExempt(n: ts.Node): boolean {
  for (let p: ts.Node | undefined = n; p; p = p.parent) {
    if (ts.isPropertyAssignment(p) && DEFINE_BLOCK_EXEMPT.has(p.name.getText())) {
      const obj = p.parent;
      const call = obj?.parent;
      if (obj && ts.isObjectLiteralExpression(obj) && call && ts.isCallExpression(call) && call.expression.getText() === 'defineBlock') return true;
    }
  }
  return false;
}

/** Contexts rule (e) never reports: code positions and non-text JSX attributes/properties (up to a JSX boundary). */
function sentenceExempt(n: ts.Node): boolean {
  for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
    if (isJsxBoundary(p)) return false;
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isImportTypeNode(p) || ts.isLiteralTypeNode(p)) return true;
    if (ts.isJsxAttribute(p)) return !TEXT_ATTRS.has(p.name.getText());
    if (ts.isPropertyAssignment(p) && p.name === n) return true;
    if (ts.isPropertyAssignment(p) && NON_TEXT_PROPS.has(p.name.getText())) return true;
    // Built-in errors carry developer messages (errorMessage() never shows them); an app error class
    // (ApiError, …) carries a message a shopper can read, so its literals stay reportable.
    if (ts.isNewExpression(p) && BUILTIN_ERRORS.has(p.expression.getText())) return true;
    if (ts.isCallExpression(p) && (/^console\./.test(p.expression.getText()) || p.expression.kind === ts.SyntaxKind.SuperKeyword)) return true;
  }
  return false;
}

export function scanSource(file: string, code: string): Finding[] {
  const src = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Finding[] = [];
  const seen = new Set<ts.Node>();
  const consts = fileConsts(src);
  const line = (n: ts.Node) => src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1;
  const report = (rule: GuardRule, node: ts.Node, text: string) => {
    if (seen.has(node) || !LETTER.test(text) || inDefineBlockExempt(node)) return;
    seen.add(node);
    out.push({ file, line: line(node), rule, text });
  };
  const visit = (n: ts.Node): void => {
    if (ts.isJsxText(n)) {
      report('jsx-text', n, renderedJsxText(n.text));
    } else if (ts.isJsxAttribute(n) && TEXT_ATTRS.has(n.name.getText()) && n.initializer) {
      const init = n.initializer;
      if (ts.isStringLiteral(init)) report('text-attr', init, decodeEntities(init.text));
      else if (ts.isJsxExpression(init) && init.expression) for (const l of leaves(init.expression, consts)) report('text-attr', l.node, l.text);
    } else if (ts.isJsxExpression(n) && n.expression && n.parent && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) {
      for (const l of leaves(n.expression, consts)) report('jsx-child', l.node, l.text);
    } else if (ts.isCallExpression(n)) {
      const name = calleeName(n);
      if (TEXT_CALLS.has(name) || (ZOD_CALLS.has(name) && ts.isPropertyAccessExpression(n.expression))) {
        for (const a of n.arguments) for (const l of deepLeaves(a)) report('text-call', l.node, l.text);
      }
    } else if (ts.isPropertyAssignment(n) && TEXT_PROPS.has(n.name.getText())) {
      for (const l of leaves(n.initializer)) report('text-prop', l.node, l.text);
    }
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) && !seen.has(n)) {
      const text = ts.isTemplateExpression(n) ? templateText(n) : n.text;
      if (SENTENCE.test(text) && !CODEISH.test(text.replaceAll('${}', '')) && !sentenceExempt(n)) report('sentence', n, text);
      if (ts.isTemplateExpression(n)) { n.templateSpans.forEach((s) => visit(s.expression)); return; }
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  return out;
}

export function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, name.name);
      if (name.isDirectory()) walk(abs);
      else if (/\.(ts|tsx)$/.test(name.name)) files.push(path.relative(SRC_ROOT, abs).split(path.sep).join('/'));
    }
  };
  walk(SRC_ROOT);
  return files.filter((f) => !EXCLUDED.some((re) => re.test(f))).sort();
}

export function scanFiles(files: string[]): Finding[] {
  return files.flatMap((f) => scanSource(f, readFileSync(path.join(SRC_ROOT, f), 'utf8')));
}

const allows = (e: AllowEntry, f: Finding) => e.file === f.file && (e.text === '*' || e.text === f.text);
export function unallowed(findings: Finding[], allow: AllowEntry[]): Finding[] {
  return findings.filter((f) => !allow.some((e) => allows(e, f)));
}
export function staleEntries(findings: Finding[], allow: AllowEntry[]): AllowEntry[] {
  return allow.filter((e) => !findings.some((f) => allows(e, f)));
}

export function inventoryOf(findings: Finding[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const f of findings) {
    const list = (out[f.file] ??= []);
    if (!list.includes(f.text)) list.push(f.text);
  }
  return out;
}
export function readInventory(): Record<string, string[]> {
  return JSON.parse(readFileSync(INVENTORY_FILE, 'utf8')) as Record<string, string[]>;
}

const collapse = (s: string) => s.replace(/[ \t\r\n]+/g, ' ').trim();
let corpus: string[] | null = null;
/** Inventory texts some chunk of which (split at `${}` holes) is not a substring of any built-in default. */
export function missingFromDefaults(texts: string[]): string[] {
  corpus ??= Object.values(TEXT_ENTRIES).flatMap((e) => formsOf(e.en)).map(collapse);
  return texts.filter((t) => t.split('${}').map(collapse).filter((c) => LETTER.test(c)).some((c) => !corpus!.some((d) => d.includes(c))));
}
