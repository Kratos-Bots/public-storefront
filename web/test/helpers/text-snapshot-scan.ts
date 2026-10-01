/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { SRC_ROOT } from './text-scan.ts';

/**
 * Render-time `textSnapshot()` reads (ledger rule for Task 15, docs/builder.md "Text layer").
 *
 * `textSnapshot()` is the deepest mounted provider's text, read when called. Inside a component or a
 * hook body it is only fresh if that component re-renders when the text changes — i.e. it subscribes
 * with `useText()` — and a `useMemo` that reads it must list the `t` it got from `useText()` in its
 * deps. This scan finds reads that break either rule: direct `textSnapshot()` calls, and calls of
 * helpers that read it ("readers", found transitively across web/src by name). A reader whose only
 * read is a parameter default (`t = textSnapshot().t`) is safe when the caller passes that argument.
 *
 * A reviewed exception carries `// text-snapshot-ok: <reason>` on the line of the read or the line above.
 */
export interface SnapshotRead { file: string; line: number; name: string; why: 'no-useText' | 'memo-without-t' }

/**
 * A function reader reads when called (minArgs null: always; n: unless called with ≥ n arguments) —
 * passing it by reference (`mutationFn: addToCart`) is not a read. A value reader (a const whose
 * initialiser reads, or whose getters do — `SHIPMENT_LABEL[status]`) reads on any reference.
 */
interface Reader { kind: 'fn' | 'value'; minArgs: number | null }
const OK_MARK = /\/\/ text-snapshot-ok: \S/;
const isFn = (n: ts.Node): n is ts.FunctionLikeDeclaration => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) || ts.isGetAccessor(n);
const isSnapshotCall = (n: ts.Node) => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'textSnapshot';

function parse(file: string, code: string): ts.SourceFile {
  return ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

/** Top-level named functions and consts of a file: name → declaration node (the function, or the const's initialiser). */
function topLevel(src: ts.SourceFile): Map<string, ts.Node> {
  const out = new Map<string, ts.Node>();
  for (const s of src.statements) {
    if (ts.isFunctionDeclaration(s) && s.name) out.set(s.name.text, s);
    if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) out.set(d.name.text, d.initializer);
  }
  return out;
}

/** Names a file can see: its own top-level names and its named imports. */
function visibleNames(src: ts.SourceFile): Set<string> {
  const out = new Set(topLevel(src).keys());
  for (const s of src.statements) {
    const b = ts.isImportDeclaration(s) ? s.importClause?.namedBindings : undefined;
    if (b && ts.isNamedImports(b)) for (const e of b.elements) out.add(e.name.text);
  }
  return out;
}

/** Is this reference to a reader a read (see Reader)? */
function isRead(n: ts.Identifier, r: Reader): boolean {
  if (r.kind === 'value') return true;
  const call = ts.isCallExpression(n.parent) && n.parent.expression === n ? n.parent : null;
  return !!call && (r.minArgs === null || call.arguments.length < r.minArgs);
}
const isGetter = (n: ts.Node) => ts.isGetAccessor(n) || (isFn(n) && ts.isPropertyAssignment(n.parent) && n.parent.name.getText() === 'get');

/**
 * Does evaluating `node` read the snapshot — directly or through a reader? Nested functions run later
 * (a returned closure, a zod `error: () => …` message), so they are skipped — except getters, which
 * run on a property read.
 */
function reads(node: ts.Node, readers: ReadonlyMap<string, Reader>, visible: ReadonlySet<string>): boolean {
  let hit = false;
  const walk = (n: ts.Node): void => {
    if (hit) return;
    if (n !== node && isFn(n) && !isGetter(n)) return;
    if (isSnapshotCall(n)) { hit = true; return; }
    if (ts.isIdentifier(n) && visible.has(n.text) && readers.has(n.text) && !ts.isImportSpecifier(n.parent) && isRead(n, readers.get(n.text)!)) { hit = true; return; }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return hit;
}

function readerOf(decl: ts.Node, readers: ReadonlyMap<string, Reader>, visible: ReadonlySet<string>): Reader | null {
  const fn = isFn(decl) ? decl : null;
  if (!fn) return reads(decl, readers, visible) ? { kind: 'value', minArgs: null } : null;
  if (fn.body && reads(fn.body, readers, visible)) return { kind: 'fn', minArgs: null };
  const idx = fn.parameters.findIndex((p) => p.initializer && reads(p.initializer, readers, visible));
  return idx >= 0 ? { kind: 'fn', minArgs: idx + 1 } : null;
}

/** A capitalised name (a component), but not an ALL_CAPS constant such as SHIPMENT_LABEL. */
const COMPONENT = { test: (name: string) => /^[A-Z]/.test(name) && !/^[A-Z][A-Z0-9_]+$/.test(name) };
const HOOK = /^use[A-Z]/;
/** The name a function is bound to: `function X`, `const X = () =>`, `const X = forwardRef(() =>)`/`memo(…)`. */
function boundName(fn: ts.FunctionLikeDeclaration): string | null {
  if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  let p: ts.Node = fn.parent;
  while (ts.isCallExpression(p) || ts.isParenthesizedExpression(p) || ts.isAsExpression(p)) p = p.parent;
  return ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) ? p.name.text : null;
}
const isRenderFn = (fn: ts.FunctionLikeDeclaration) => { const n = boundName(fn); return !!n && (COMPONENT.test(n) || HOOK.test(n)); };
const calleeIs = (n: ts.Node, name: string) => ts.isCallExpression(n) && ((ts.isIdentifier(n.expression) && n.expression.text === name) || (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === name));

/** The scan over web/src files (paths relative to web/src). */
export function snapshotRenderReadsIn(files: string[]): SnapshotRead[] {
  return snapshotRenderReads(Object.fromEntries(files.map((f) => [f, readFileSync(path.join(SRC_ROOT, f), 'utf8')])));
}

/** The scan over in-memory sources: { 'features/x/X.tsx': code }. */
export function snapshotRenderReads(sources: Record<string, string>): SnapshotRead[] {
  const srcs = new Map(Object.entries(sources).map(([f, code]) => [f, parse(f, code)] as const));
  const vis = new Map([...srcs].map(([f, s]) => [f, visibleNames(s)] as const));
  // Readers, to a fixpoint (a helper that calls a reader is one).
  const readers = new Map<string, Reader>();
  for (let changed = true; changed;) {
    changed = false;
    for (const [f, src] of srcs) {
      for (const [name, decl] of topLevel(src)) {
        if (readers.has(name) || COMPONENT.test(name) || HOOK.test(name)) continue;
        const r = readerOf(decl, readers, vis.get(f)!);
        if (r) { readers.set(name, r); changed = true; }
      }
    }
  }
  const out: SnapshotRead[] = [];
  for (const [file, src] of srcs) {
    const visible = vis.get(file)!;
    const lines = src.getFullText().split(/\r?\n/);
    const report = (n: ts.Node, name: string, why: SnapshotRead['why']) => {
      const line = src.getLineAndCharacterOfPosition(n.getStart(src)).line;
      if (OK_MARK.test(lines[line] ?? '') || OK_MARK.test(lines[line - 1] ?? '')) return;
      out.push({ file, line: line + 1, name, why });
    };
    const visitRender = (fn: ts.FunctionLikeDeclaration) => {
      const subscribes = containsCall(fn, 'useText');
      const walk = (n: ts.Node, memoDeps: ts.ArrayLiteralExpression | null | undefined): void => {
        if (isFn(n) && n !== fn) {
          const call = n.parent;
          // A useMemo callback runs during render; any other nested function runs later (call time).
          if (ts.isCallExpression(call) && calleeIs(call, 'useMemo') && call.arguments[0] === n) {
            const deps = call.arguments[1];
            ts.forEachChild(n, (c) => walk(c, deps && ts.isArrayLiteralExpression(deps) ? deps : null));
          }
          return;
        }
        const name = isSnapshotCall(n) ? 'textSnapshot' : ts.isIdentifier(n) && visible.has(n.text) && readers.has(n.text) && !ts.isImportSpecifier(n.parent) ? n.text : null;
        if (name) {
          if (name === 'textSnapshot' || isRead(n as ts.Identifier, readers.get(name)!)) {
            if (!subscribes) report(n, name, 'no-useText');
            else if (memoDeps !== undefined && !(memoDeps?.elements.some((e) => ts.isIdentifier(e) && e.text === 't'))) report(n, name, 'memo-without-t');
          }
          if (name === 'textSnapshot') return;
        }
        ts.forEachChild(n, (c) => walk(c, memoDeps));
      };
      if (fn.body) walk(fn.body, undefined);
    };
    const find = (n: ts.Node): void => {
      if (isFn(n) && isRenderFn(n)) visitRender(n);
      ts.forEachChild(n, find);
    };
    find(src);
  }
  return out;
}

function containsCall(node: ts.Node, name: string): boolean {
  let hit = false;
  const walk = (n: ts.Node): void => { if (hit) return; if (calleeIs(n, name)) { hit = true; return; } ts.forEachChild(n, walk); };
  walk(node);
  return hit;
}
