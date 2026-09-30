// web/test/builder-visible-slots.test.ts — a required block in a column that doesn't render is missing.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLOCKS } from '@/builder/registry.ts';
import { checkRules, countBlocks } from '@/builder/rules.ts';
import { validateDoc } from '@/builder/guard.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { collectIssues, normalizeDoc } from '@/builder/editor/page-set.ts';
import type { ComponentData, PuckDoc } from '@/builder/types.ts';

const L = 'storefront' as const;
const c = (type: string, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id: `${type}-${Math.random()}`, ...props } });
const shellWith = (content: ComponentData[]): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content });
const cols = (columns: string, place: 'col1' | 'col2' | 'col3' | 'col4', child: ComponentData) =>
  c('Columns', { columns, stackBelow: 'md', gap: 'md', col1: [], col2: [], col3: [], col4: [], [place]: [child] });

afterEach(() => vi.restoreAllMocks());

describe('visibleSlots', () => {
  it('Columns renders its first `columns` columns (bad count → default 2)', () => {
    const v = BLOCKS.Columns!.visibleSlots!;
    expect(v({ columns: '2' })).toEqual(['col1', 'col2']);
    expect(v({ columns: '4' })).toEqual(['col1', 'col2', 'col3', 'col4']);
    expect(v({ columns: 'nine' })).toEqual(['col1', 'col2']);
  });
  it('Footer renders no columns in its template variant, else its first `columns`', () => {
    const v = BLOCKS.Footer!.visibleSlots!;
    expect(v({ variant: 'template', columns: '4' })).toEqual([]);
    expect(v({ variant: 'columns', columns: '1' })).toEqual(['col1']);
    expect(v({ variant: 'columns', columns: 'x' })).toEqual(['col1', 'col2', 'col3']);
  });
  it('blocks without it render every slot', () => {
    expect(BLOCKS.Section!.visibleSlots).toBeUndefined();
  });
});

describe('rules follow visible slots only', () => {
  it('countBlocks skips a hidden column', () => {
    expect(countBlocks(shellWith([cols('2', 'col3', c('PageOutlet'))])).get('PageOutlet') ?? 0).toBe(0);
    expect(countBlocks(shellWith([cols('3', 'col3', c('PageOutlet'))])).get('PageOutlet')).toBe(1);
  });
  it('PageOutlet in col3 of a 2-column Columns fails exactly-one; with 3 columns it passes', () => {
    const hidden = checkRules(shellWith([c('Header'), cols('2', 'col3', c('PageOutlet'))]), 'shell', L);
    expect(hidden.map((i) => i.rule)).toContain('exactly-one:PageOutlet');
    const shown = checkRules(shellWith([c('Header'), cols('3', 'col3', c('PageOutlet'))]), 'shell', L);
    expect(shown.map((i) => i.rule)).not.toContain('exactly-one:PageOutlet');
  });
  it('a PageOutlet in a template-variant Footer column does not count', () => {
    const footer = c('Footer', { variant: 'template', columns: '3', colophon: true, col1: [c('PageOutlet')], col2: [], col3: [], col4: [] });
    expect(checkRules(shellWith([footer]), 'shell', L).map((i) => i.rule)).toContain('exactly-one:PageOutlet');
  });
  it('placement is still checked in hidden slots (a stored doc never holds a misplaced block)', () => {
    const issues = checkRules(shellWith([c('PageOutlet'), cols('2', 'col4', c('CheckoutFlow'))]), 'shell', L);
    expect(issues.map((i) => i.rule)).toContain('placement:CheckoutFlow');
  });
});

describe('shopper guard + editor issues', () => {
  it('the shopper guard refuses the doc (→ default shell) instead of rendering a store with no page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const base = normalizeDoc(defaultDoc('shell', L), 'shell');
    const outlet = base.content.find((b) => b.type === 'PageOutlet')!;
    const rest = base.content.filter((b) => b !== outlet);
    const doc = { ...base, content: [...rest, cols('2', 'col3', outlet)] };
    const r = validateDoc(doc, 'shell', L);
    expect(r.doc).toBeNull();
    expect(r.issues.map((i) => i.rule)).toEqual(['exactly-one:PageOutlet']);
    // The editor lists the same issue for the admin (Publish stays off).
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(collectIssues({ shell: doc }, L).map((i) => i.rule)).toContain('exactly-one:PageOutlet');
  });
});
