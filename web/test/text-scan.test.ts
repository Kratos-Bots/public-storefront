import { describe, expect, it } from 'vitest';
import { readInventory, renderedJsxText, scanSource, staleEntries, unallowed } from './helpers/text-scan.ts';
import { TEXT_GUARD_ALLOW } from './text-guard.allow.ts';
import { TEXT_ENTRIES } from '@/text/registry.ts';

const rules = (code: string) => scanSource('features/x/X.tsx', code).map((f) => `${f.rule}:${f.text}`);

describe('scanSource', () => {
  it('(a) JSX text, rendered as React renders it', () => {
    expect(rules(`const a = <p>\n  Your cart\n  is empty&rsquo;s\n</p>;`)).toEqual(['jsx-text:Your cart is empty’s']);
    expect(rules(`const a = <p>{' '}·{' '}</p>;`)).toEqual([]);
  });
  it('(b) text attributes, including branches and templates', () => {
    expect(rules(`const a = <X aria-label="Close" title={ok ? 'Yes' : \`No \${n}\`} className="big card" />;`))
      .toEqual(['text-attr:Close', 'text-attr:Yes', 'text-attr:No ${}']);
  });
  it('(c) literal JSX children', () => {
    expect(rules(`const a = <p>{busy ? 'Starting…' : label}</p>;`)).toEqual(['jsx-child:Starting…']);
  });
  it('(d) messages passed to setErrors, errorMessage, zod and message-like properties', () => {
    expect(rules(`setErrors({ method: 'Choose one' }); errorMessage(e, "We couldn't"); z.string().min(1, 'Required'); const o = { title: 'Hi' };`))
      .toEqual(['text-call:Choose one', "text-call:We couldn't", 'text-call:Required', 'text-prop:Hi']);
  });
  it('(e) sentence-like literals in helpers, not code', () => {
    expect(rules(`export function f(){ return \`Shopping with \${b}? Use my code\`; } const c = 'sf-hide-mobile'; console.warn('not this one'); throw new Error('nor this one'); const v = 'var(--sf-x) solid';`))
      .toEqual(['sentence:Shopping with ${}? Use my code']);
  });
  it('exempts defineBlock palette labels and starter content, and non-text attributes', () => {
    expect(rules(`export const block = defineBlock({ name: 'Button', label: 'Button', defaultProps: { label: 'Shop now', title: 'Hi there' } }); const a = <a rel="noopener noreferrer" className="a b" />;`)).toEqual([]);
  });
});

describe('scanSource coverage (Task 15)', () => {
  it('exempts the registry key names a block declares in text and textProps', () => {
    expect(rules(`export const block = defineBlock({ name: 'N', text: ['shell.nav.*'], textProps: { ariaLabel: 'shell.nav.ariaLabel', placeholder: 'catalog.search.placeholder' } });`)).toEqual([]);
    expect(rules(`const o = { textProps: { ariaLabel: 'Main links' } };`)).toEqual(['text-prop:Main links']);
  });
  it('reports messages of app error classes, which errorMessage() shows; built-in Error stays exempt', () => {
    expect(rules(`throw new ApiError(0, 'The request timed out'); throw new Error('Verification is still loading');`)).toEqual(['sentence:The request timed out']);
  });
  it('follows a same-file const into JSX children and text attributes', () => {
    expect(rules(`const text = page ? '[Catalogue]' : \`[\${i}]\`; const a = <p>{text}</p>;`)).toEqual(['jsx-child:[Catalogue]']);
    expect(rules(`const hint = 'Close'; const a = <button aria-label={hint} />;`)).toEqual(['text-attr:Close']);
    expect(rules(`let x = 'Close'; x = 'Open'; const a = <p>{x}</p>;`)).toEqual([]);
  });
  it('skips non-text properties of call arguments (a toast colour, a zod issue path)', () => {
    expect(rules(`notifications.show({ message: 'Saved it', color: 'red' }); s.refine(f, { message: 'Pick one', path: ['coin'] });`))
      .toEqual(['text-call:Saved it', 'text-call:Pick one']);
  });
  it('skips only color and path in call arguments: a field called name, type or id still carries a message', () => {
    expect(rules(`setErrors({ name: 'Enter your name', type: 'Pick a type', id: 'Enter an ID' });`))
      .toEqual(['text-call:Enter your name', 'text-call:Pick a type', 'text-call:Enter an ID']);
  });
});

describe('renderedJsxText', () => {
  it('collapses line breaks with indentation to one space and drops blank edge lines', () => {
    expect(renderedJsxText('\n    Subtotal\n    ')).toBe('Subtotal');
    expect(renderedJsxText(' points')).toBe(' points');
    expect(renderedJsxText('A\n   B &gt; C')).toBe('A B > C');
  });
});

describe('allowlist', () => {
  it('has a reason on every entry', () => {
    for (const e of TEXT_GUARD_ALLOW) expect(e.reason.length, e.file).toBeGreaterThan(10);
  });
  it('reports stale entries', () => {
    expect(staleEntries([], [{ file: 'a.ts', text: 'x', reason: 'because it is fine' }])).toHaveLength(1);
    expect(unallowed([{ file: 'a.ts', line: 1, rule: 'sentence', text: 'x y' }], [{ file: 'a.ts', text: '*', reason: 'whole file is editor text' }])).toEqual([]);
  });
});

describe('inventory', () => {
  it('is a non-empty record of rendered v0.7.0 literals', () => {
    const inv = readInventory();
    expect(Object.keys(inv).length).toBeGreaterThan(100);
    expect(inv['features/cart/CartDrawer.tsx']).toContain('Your cart');
  });
  it('every seeded default occurs verbatim in the inventory', () => {
    const all = new Set(Object.values(readInventory()).flat());
    // The Task 4 seeds only (later tasks merge sentences, so their defaults are checked by missingFromDefaults instead).
    // shell.nav.ariaLabel is left out: it is NavLinks' old defaultProps value, never a v0.7.0 render.
    const seeds = [
      ...['actions.tryAgain', 'actions.copy', 'actions.copied', 'actions.browseCatalogue', 'actions.backToShop', 'actions.close', 'actions.signIn',
        'status.loading', 'status.checking', 'product.preorder', 'qty.fewer', 'qty.more', 'qty.remove', 'totals.subtotal', 'totals.total',
        'totals.discount', 'totals.shipping', 'totals.paymentFee', 'totals.storeCredit', 'nav.yourAccount', 'list.loadFailed',
        'list.categoryMissing', 'list.noMatches', 'list.clearSearch', 'list.emptyCategory', 'contact.whatsapp', 'contact.telegram'].map((k) => `common.${k}`),
      'cart.summary.items', 'checkout.errors.required', 'checkout.errors.paymentMissing', 'catalog.search.placeholder', 'catalog.search.ariaLabel',
      'product.stock.in', 'product.stock.low', 'product.stock.out',
    ];
    for (const key of seeds) {
      const entry = TEXT_ENTRIES[key]!;
      const forms = typeof entry.en === 'string' ? [entry.en] : ['item', 'items'];
      for (const f of forms) expect(all.has(f.replace(/\{[A-Za-z][A-Za-z0-9]*\}/g, '${}')), `${key}: ${f}`).toBe(true);
    }
  });
});
