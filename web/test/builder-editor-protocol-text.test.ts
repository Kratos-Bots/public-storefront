// web/test/builder-editor-protocol-text.test.ts
import { describe, expect, it, vi } from 'vitest';
import { changeMessage, MAX_CHANGE_ISSUES, parseInbound } from '@/builder/editor/protocol.ts';
import { createBridge, CHANGE_DEBOUNCE_MS } from '@/builder/editor/bridge.ts';
import type { PageSet } from '@/builder/types.ts';
import type { TextIssue } from '@/builder/editor/text/model.ts';
import { THEME } from './helpers/builder-theme.ts';

const doc = { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [] };
const LOAD = { type: 'sf-builder-load', protocol: 1, loadId: 'load-1', layout: 'storefront', pageSet: null, theme: THEME, readOnly: false };
const SITE = { schemaVersion: 1, language: { locale: 'de', formatLocale: 'de-AT' }, strings: { de: { 'cart.drawer.title': 'Warenkorb', 'cart.summary.items': { one: '{count} Artikel', other: '{count} Artikel' } } } };
const TEXT = { strings: { en: { 'cart.drawer.title': 'Your basket' } } };

const asLoad = (m: ReturnType<typeof parseInbound>) => {
  if (m?.type !== 'sf-builder-load') throw new Error('not a load');
  return m;
};

describe('protocol: text on load', () => {
  it('keeps pageSet.text (overrides are never stripped in transit)', () => {
    const msg = asLoad(parseInbound({ ...LOAD, pageSet: { schemaVersion: 1, shell: doc, pages: {}, text: TEXT } }));
    expect(msg.pageSet!.text).toEqual(TEXT);
  });

  it('a page set without text has no text key', () => {
    const msg = asLoad(parseInbound({ ...LOAD, pageSet: { schemaVersion: 1, shell: doc, pages: {} } }));
    expect('text' in msg.pageSet!).toBe(false);
  });

  it('rejects a load whose pageSet.text is malformed', () => {
    expect(parseInbound({ ...LOAD, pageSet: { schemaVersion: 1, shell: doc, pages: {}, text: { strings: 'nope' } } })).toBeNull();
  });

  it('siteText: present, null, absent', () => {
    expect(asLoad(parseInbound({ ...LOAD, siteText: SITE })).siteText).toEqual(SITE);
    expect(asLoad(parseInbound({ ...LOAD, siteText: null })).siteText).toBeNull();
    expect(asLoad(parseInbound(LOAD)).siteText).toBeUndefined();
    expect('siteText' in asLoad(parseInbound(LOAD))).toBe(false);
  });

  it('a malformed siteText is treated as absent, not as a reason to drop the load', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const bad of [{ schemaVersion: 2, language: SITE.language, strings: {} }, { ...SITE, language: { locale: 'en-gb', formatLocale: '' } }, { ...SITE, strings: { en: { k: 5 } } }, 'x']) {
      const msg = asLoad(parseInbound({ ...LOAD, siteText: bad }));
      expect(msg.siteText).toBeUndefined();
    }
    warn.mockRestore();
  });
});

describe('protocol: text on change', () => {
  const set: PageSet = { schemaVersion: 1, shell: doc as PageSet['shell'], pages: {}, text: TEXT };

  it('copies pageSet.text even without a text argument (older callers)', () => {
    expect(changeMessage('l', set, []).pageSet.text).toEqual(TEXT);
    expect('siteText' in changeMessage('l', set, [])).toBe(false);
    expect('textIssues' in changeMessage('l', set, [])).toBe(false);
  });

  it('carries siteText and textIssues when given, capped at 500 issues', () => {
    const issue: TextIssue = { scope: 'shared', key: 'cart.drawer.title', rule: 'too-long', message: 'Keep this line to 40 characters.' };
    const msg = changeMessage('l', set, [], { siteText: SITE as never, textIssues: Array.from({ length: 600 }, () => issue) });
    expect(msg.siteText).toEqual(SITE);
    expect(msg.textIssues).toHaveLength(MAX_CHANGE_ISSUES);
    const noShared = changeMessage('l', set, [], { textIssues: [] });
    expect('siteText' in noShared).toBe(false);
    expect(noShared.textIssues).toEqual([]);
  });

  it('the bridge posts text with the debounced change', () => {
    vi.useFakeTimers();
    const parent = { postMessage: vi.fn() };
    const listeners: Array<(e: MessageEvent) => void> = [];
    const win = { parent, addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.push(fn), removeEventListener() {}, document: undefined } as unknown as Window;
    const bridge = createBridge(win, { onLoad() {}, onTheme() {}, onSelectPage() {} });
    listeners.forEach((fn) => fn({ data: LOAD, source: parent, origin: 'https://admin.shop.example' } as unknown as MessageEvent));
    bridge.postChange(set, [], { siteText: SITE as never, textIssues: [] });
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    const change = parent.postMessage.mock.calls.map(([m]) => m).find((m) => m.type === 'sf-builder-change');
    expect(change).toMatchObject({ loadId: 'load-1', siteText: SITE, textIssues: [], pageSet: { text: TEXT } });
    bridge.dispose();
    vi.useRealTimers();
  });
});
