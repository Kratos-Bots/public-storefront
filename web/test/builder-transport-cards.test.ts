import { describe, expect, it } from 'vitest';
import { toPageSet as fromPublic } from '@/api/pages.ts';
import { changeMessage, isDocKey, parseInbound } from '@/builder/editor/protocol.ts';
import type { PageSet, PuckDoc } from '@/builder/types.ts';
import { THEME } from './helpers/builder-theme.ts';

const d = (id = 'CardTile-1'): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content: [{ type: 'CardTile', props: { id } }] }) as unknown as PuckDoc;
const set = (extra: Record<string, unknown>) => ({ schemaVersion: 1, shell: d('s'), pages: {}, ...extra });
const load = (pageSet: unknown) => parseInbound({ type: 'sf-builder-load', protocol: 1, loadId: 'l1', layout: 'storefront', pageSet, theme: THEME, readOnly: false });

describe('public read (api/pages.ts)', () => {
  it('passes a valid cards through', () => {
    expect(fromPublic({ data: set({ cards: { tile: d(), row: d('CardRow-1') } }) })!.cards).toEqual({ tile: d(), row: d('CardRow-1') });
  });
  it.each([
    ['null', null], ['an array', [d()]], ['a string', 'x'], ['a bad kind value', { tile: 'x' }],
    ['a doc without content', { tile: { root: {} } }], ['unknown kinds only', JSON.parse('{"__proto__":{"content":[]},"grid":{"content":[]}}')],
  ])('drops %s alone, keeping the set', (_l, cards) => {
    const out = fromPublic({ data: set({ cards }) });
    expect(out).not.toBeNull();
    expect('cards' in out!).toBe(false);
  });
  it('keeps the good kind when the other is bad', () => {
    expect(fromPublic({ data: set({ cards: { tile: d(), row: 7 } }) })!.cards).toEqual({ tile: d() });
  });
});

describe('editor protocol', () => {
  it('card keys are doc keys; nothing else card-shaped is', () => {
    expect(isDocKey('card:tile') && isDocKey('card:row')).toBe(true);
    expect(isDocKey('card:grid') || isDocKey('cards')).toBe(false);
  });
  it('a load keeps valid cards, drops bad kinds, and never files a card key under pages', () => {
    const msg = load(set({ cards: { tile: d(), row: { nope: 1 }, grid: d() }, pages: { 'card:tile': d(), catalog: d('g') } }));
    expect(msg && msg.type === 'sf-builder-load' && msg.pageSet).toBeTruthy();
    const ps = (msg as { pageSet: PageSet }).pageSet;
    expect(ps.cards).toEqual({ tile: d() });
    expect(Object.keys(ps.pages)).toEqual(['catalog']);
  });
  it('a malformed cards does not drop the load', () => {
    expect(load(set({ cards: 'x' }))).not.toBeNull();
  });
  it('changeMessage sends cards only when a kind is present, never null or {}', () => {
    const base: PageSet = { schemaVersion: 1, shell: d('s'), pages: {} };
    expect('cards' in changeMessage('l', base, []).pageSet).toBe(false);
    expect('cards' in changeMessage('l', { ...base, cards: {} }, []).pageSet).toBe(false);
    expect(changeMessage('l', { ...base, cards: { row: d('CardRow-1') } }, []).pageSet.cards).toEqual({ row: d('CardRow-1') });
  });
});
