import { describe, expect, it } from 'vitest';
import {
  changeMessage, isDocKey, MAX_CHANGE_ISSUES, parseInbound, readyMessage, uploadRequestMessage, viewportMessage,
} from '@/builder/editor/protocol.ts';
import type { Issue, PageSet, PuckDoc } from '@/builder/types.ts';
import { THEME } from './helpers/builder-theme.ts';

const doc = { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [{ type: 'Heading', props: { id: 'Heading-1', text: 'Hi' } }] };
const LOAD = { type: 'sf-builder-load', protocol: 1, loadId: 'load-1', layout: 'storefront', pageSet: null, theme: THEME, readOnly: false };

describe('builder protocol: inbound', () => {
  it('accepts a load with a page set and drops draft CSS', () => {
    const msg = parseInbound({ ...LOAD, layout: 'menu', pageSet: { schemaVersion: 1, shell: doc, pages: { catalog: doc, 'page:about': doc } } });
    expect(msg?.type).toBe('sf-builder-load');
    if (msg?.type !== 'sf-builder-load') throw new Error('unreachable');
    expect(msg.layout).toBe('menu');
    expect(msg.loadId).toBe('load-1');
    expect(Object.keys(msg.pageSet!.pages)).toEqual(['catalog', 'page:about']);
    expect(msg.theme.customCss).toBe('');
  });

  it('accepts a null page set', () => {
    expect(parseInbound({ ...LOAD, readOnly: true })).toMatchObject({ pageSet: null, readOnly: true, loadId: 'load-1' });
  });

  it('accepts the theme exactly as the admin sends it (no customCss key)', () => {
    const adminTheme: Record<string, unknown> = { ...THEME };
    delete adminTheme.customCss;
    const msg = parseInbound({ ...LOAD, theme: adminTheme });
    if (msg?.type !== 'sf-builder-load') throw new Error('unreachable');
    expect(msg.theme.customCss).toBe('');
  });

  it('drops page keys that are not route keys', () => {
    const msg = parseInbound({ ...LOAD, pageSet: { schemaVersion: 1, shell: doc, pages: { catalog: doc, 'page:Bad Slug': doc, shell: doc, nope: doc } } });
    if (msg?.type !== 'sf-builder-load') throw new Error('unreachable');
    expect(Object.keys(msg.pageSet!.pages)).toEqual(['catalog']);
  });

  it.each([
    ['wrong protocol', { ...LOAD, protocol: 2 }],
    ['missing loadId', { ...LOAD, loadId: undefined }],
    ['empty loadId', { ...LOAD, loadId: '' }],
    ['overlong loadId', { ...LOAD, loadId: 'x'.repeat(65) }],
    ['unknown layout', { ...LOAD, layout: 'kiosk' }],
    ['bad theme', { type: 'sf-builder-theme', theme: { ...THEME, colors: { bg: 'red' } } }],
    ['bad doc key', { type: 'sf-builder-select-page', docKey: 'page:' }],
    ['upload url off-site', { type: 'sf-builder-upload-result', requestId: 'r1', url: 'javascript:alert(1)', error: null }],
    ['upload url https', { type: 'sf-builder-upload-result', requestId: 'r1', url: 'https://cdn.shop.example/x.png', error: null }],
    ['upload url with a bad extension', { type: 'sf-builder-upload-result', requestId: 'r1', url: `/media/storefront-pages/media/${'a'.repeat(32)}.svg`, error: null }],
    ['unknown type', { type: 'sf-preview-theme', theme: THEME }],
    ['a string', 'sf-builder-load'],
    ['null', null],
  ])('ignores %s', (_label, data) => {
    expect(parseInbound(data)).toBeNull();
  });

  it('accepts a stored-media upload result and an error result', () => {
    expect(parseInbound({ type: 'sf-builder-upload-result', requestId: 'r1', url: `/media/storefront-pages/media/${'a'.repeat(32)}.png`, error: null })).not.toBeNull();
    expect(parseInbound({ type: 'sf-builder-upload-result', requestId: 'r1', url: null, error: 'Too big' })).not.toBeNull();
  });

  it('knows doc keys', () => {
    expect(isDocKey('shell')).toBe(true);
    expect(isDocKey('account.order')).toBe(true);
    expect(isDocKey('page:spring-sale-2026')).toBe(true);
    expect(isDocKey('page:Spring')).toBe(false);
    expect(isDocKey(`page:${'a'.repeat(61)}`)).toBe(false);
    expect(isDocKey('home')).toBe(false);
  });
});

describe('builder protocol: outbound', () => {
  const shell = doc as unknown as PuckDoc;

  it('builds ready, upload and viewport messages', () => {
    expect(readyMessage()).toEqual({ type: 'sf-builder-ready', protocol: 1 });
    const file = new File(['x'], 'x.png', { type: 'image/png' });
    expect(uploadRequestMessage('r1', file)).toEqual({ type: 'sf-builder-upload-request', requestId: 'r1', file });
    expect(viewportMessage(768)).toEqual({ type: 'sf-builder-viewport', width: 768 });
    expect(viewportMessage(null)).toEqual({ type: 'sf-builder-viewport', width: null });
    expect(viewportMessage(500 as never)).toEqual({ type: 'sf-builder-viewport', width: null });
  });

  it('echoes the loadId on a change', () => {
    const set: PageSet = { schemaVersion: 1, shell, pages: { cart: shell } };
    expect(changeMessage('load-7', set, [])).toEqual({ type: 'sf-builder-change', loadId: 'load-7', pageSet: set, issues: [] });
  });

  it('normalises *Html values to strings at any depth, without touching the input', () => {
    const page = {
      root: { props: { title: '', description: '', chrome: 'shell' } },
      content: [
        { type: 'RichText', props: { id: 'RichText-1', bodyHtml: undefined } },
        { type: 'FAQ', props: { id: 'FAQ-1', items: [{ question: 'Q', answerHtml: 42 }, { question: 'R', answerHtml: '<p>ok</p>' }] } },
        { type: 'Section', props: { id: 'Section-1', children: [{ type: 'CatalogHero', props: { id: 'CatalogHero-1', bodyHtml: { html: 'x' }, title: 7 } }] } },
      ],
    } as unknown as PuckDoc;
    const set: PageSet = { schemaVersion: 1, shell, pages: { catalog: page } };
    const msg = changeMessage('l', set, []);
    const content = msg.pageSet.pages.catalog!.content as unknown as Array<{ props: Record<string, unknown> }>;
    expect(content[0]!.props.bodyHtml).toBe('');
    expect((content[1]!.props.items as Array<{ answerHtml: unknown }>).map((i) => i.answerHtml)).toEqual(['', '<p>ok</p>']);
    const nested = (content[2]!.props.children as Array<{ props: Record<string, unknown> }>)[0]!.props;
    expect(nested.bodyHtml).toBe('');
    expect(nested.title).toBe(7);
    expect((page.content[0]!.props as Record<string, unknown>).bodyHtml).toBeUndefined();
  });

  it('gives every doc a root.props object and a content array', () => {
    const broken = { root: {}, content: null } as unknown as PuckDoc;
    const msg = changeMessage('l', { schemaVersion: 1, shell: broken, pages: { cart: broken } }, []);
    expect(msg.pageSet.schemaVersion).toBe(1);
    for (const d of [msg.pageSet.shell, msg.pageSet.pages.cart!]) {
      expect(d.root.props).toEqual({});
      expect(d.content).toEqual([]);
    }
  });

  it('drops informational drop:* issues and caps the rest', () => {
    const issue = (rule: string): Issue => ({ docKey: 'cart', rule, message: rule });
    const issues = [issue('drop:unknown'), ...Array.from({ length: MAX_CHANGE_ISSUES + 20 }, (_, i) => issue(`r${i}`))];
    const msg = changeMessage('l', { schemaVersion: 1, shell, pages: {} }, issues);
    expect(msg.issues).toHaveLength(MAX_CHANGE_ISSUES);
    expect(msg.issues[0]!.rule).toBe('r0');
  });
});
