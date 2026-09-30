import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createTextApi, DEFAULT_TEXT_LAYERS, TextLayerProvider, textSnapshot, useText } from '@/text/runtime.tsx';
import { PageSetOverrideProvider } from '@/builder/runtime.tsx';
import { formatMoney, getFormatProfile } from '@/lib/format.ts';
import { LEGACY_PROFILE } from '@/text/format-profile.ts';
import type { TextLayers } from '@/text/types.ts';

const layers = (over: Partial<TextLayers> = {}): TextLayers => ({ locale: 'en', formatLocale: '', shared: {}, layout: {}, ...over });
afterEach(() => { cleanup(); vi.restoreAllMocks(); document.documentElement.lang = 'en'; });

function Probe() {
  const { t, tp } = useText();
  return <p>{t('common.actions.tryAgain')}|{tp('cart.summary.items', 2)}|{formatMoney(1, 'EUR')}</p>;
}

describe('useText', () => {
  it('outside any provider resolves the built-in defaults', () => {
    render(<Probe />);
    expect(screen.getByText('Try again|2 items|€1.00')).toBeInTheDocument();
  });
  it('a shared value and a layout override apply per key', () => {
    render(<TextLayerProvider text={layers({ shared: { 'common.actions.tryAgain': 'Retry', 'cart.summary.items': { one: '{count} thing', other: '{count} things' } }, layout: { 'common.actions.tryAgain': 'Once more' } })}><Probe /></TextLayerProvider>);
    expect(screen.getByText('Once more|2 things|€1.00')).toBeInTheDocument();
  });
  it('sets the format profile before any child formats (first render)', () => {
    const { container } = render(<TextLayerProvider text={layers({ locale: 'de', formatLocale: 'de-DE' })}><Probe /></TextLayerProvider>);
    // Exact textContent: getByText's normaliser turns Intl's no-break space into a plain one and never matches.
    expect(container.querySelector('p')?.textContent).toBe(`Try again|2 items|${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(1)}`);
  });
  it('restores the legacy profile and default snapshot on unmount', () => {
    const view = render(<TextLayerProvider text={layers({ locale: 'de', shared: { 'common.actions.tryAgain': 'Nochmal' } })}><Probe /></TextLayerProvider>);
    expect(textSnapshot().t('common.actions.tryAgain')).toBe('Nochmal');
    view.unmount();
    expect(textSnapshot().t('common.actions.tryAgain')).toBe('Try again');
    expect(getFormatProfile()).toBe(LEGACY_PROFILE);
  });
});

describe('<html lang>', () => {
  it('is left alone when it already matches', () => {
    const seen: MutationRecord[] = [];
    const mo = new MutationObserver((r) => seen.push(...r));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    render(<TextLayerProvider text={null}><Probe /></TextLayerProvider>);
    mo.disconnect();
    expect(seen).toHaveLength(0);
  });
  it('follows the store language', () => {
    render(<TextLayerProvider text={layers({ locale: 'de' })}><Probe /></TextLayerProvider>);
    expect(document.documentElement.lang).toBe('de');
  });
});

describe('TextApi', () => {
  const api = createTextApi(DEFAULT_TEXT_LAYERS);
  it('tp inserts String(count), never a grouped number', () => {
    expect(api.tp('cart.summary.items', 1000)).toBe('1000 items');
    expect(api.tp('cart.summary.items', 1)).toBe('1 item');
    expect([0, 2, 1.5].map((n) => api.tp('cart.summary.items', n))).toEqual(['0 items', '2 items', '1.5 items']);
  });
  it('tp falls back to the same value\'s other for a category it lacks', () => {
    const pl = createTextApi(layers({ locale: 'pl', shared: { 'cart.summary.items': { one: '{count} rzecz', few: '{count} rzeczy', other: '{count} rz.' } } }));
    expect([1, 2, 5].map((n) => pl.tp('cart.summary.items', n))).toEqual(['1 rzecz', '2 rzeczy', '5 rz.']);
  });
  it('a built-in English default picks its form with English plural rules (final review)', () => {
    // fr puts 0 in `one`, ja has only `other`: neither must bend the English default.
    const fr = createTextApi(layers({ locale: 'fr' }));
    const ja = createTextApi(layers({ locale: 'ja' }));
    expect([0, 1, 2].map((n) => fr.tp('cart.summary.items', n))).toEqual(['0 items', '1 item', '2 items']);
    expect([0, 1, 2].map((n) => ja.tp('cart.summary.items', n))).toEqual(['0 items', '1 item', '2 items']);
    const { container } = render(<p>{fr.tn('cart.summary.items', {}, 0)}</p>);
    expect(container.textContent).toBe('0 items');
  });
  it('an override picks its form with the store locale\'s plural rules', () => {
    const fr = createTextApi(layers({ locale: 'fr', layout: { 'cart.summary.items': { one: '{count} article', other: '{count} articles' } } }));
    expect([0, 1, 2].map((n) => fr.tp('cart.summary.items', n))).toEqual(['0 article', '1 article', '2 articles']);
    const ja = createTextApi(layers({ locale: 'ja', shared: { 'cart.summary.items': { one: '{count} one', other: '{count} 点' } } }));
    expect(ja.tp('cart.summary.items', 1)).toBe('1 点');
  });
  it('tn takes a count exactly for plural keys (type level, Task 5 deferred)', () => {
    // @ts-expect-error a plural key needs its count
    const noCount = () => api.tn('cart.summary.items', {});
    // @ts-expect-error a string key takes no count
    const strayCount = () => api.tn('common.qty.more', { name: 'Oats' }, 2);
    expect([typeof noCount, typeof strayCount]).toEqual(['function', 'function']);
  });
  it('t fills placeholders; a dropped placeholder is fine', () => {
    expect(api.t('common.qty.more', { name: 'Oats' })).toBe('One more Oats');
    expect(createTextApi(layers({ shared: { 'common.qty.more': 'Add another' } })).t('common.qty.more', { name: 'Oats' })).toBe('Add another');
  });
  it('tn embeds elements as keyed fragments', () => {
    const { container } = render(<p>{api.tn('common.qty.more', { name: <strong>Oats</strong> })}</p>);
    expect(container.innerHTML).toBe('<p>One more <strong>Oats</strong></p>');
  });
  it('msg passes unregistered and backend strings through', () => {
    expect(api.msg('common.actions.tryAgain')).toBe('Try again');
    expect(api.msg('That transaction has already been used')).toBe('That transaction has already been used');
    expect(api.msg('not.a.key')).toBe('not.a.key');
    expect(api.msg('cart.summary.items')).toBe('cart.summary.items'); // plural keys are not messages
  });
  it('is memoised per layers object', () => {
    expect(createTextApi(DEFAULT_TEXT_LAYERS)).toBe(api);
  });
});

describe('PageSetOverrideProvider text', () => {
  it('applies the editor\'s layers to its subtree only', () => {
    render(<><PageSetOverrideProvider pageSet={null} text={layers({ shared: { 'common.actions.tryAgain': 'Draft retry' } })}><Probe /></PageSetOverrideProvider></>);
    expect(screen.getByText('Draft retry|2 items|€1.00')).toBeInTheDocument();
  });
  it('hands the snapshot and format profile back to the enclosing provider when it unmounts', () => {
    const outer = layers({ locale: 'de', formatLocale: 'de-DE', shared: { 'common.actions.tryAgain': 'Nochmal' } });
    const tree = (frame: boolean) => (
      <TextLayerProvider text={outer}>
        {frame ? <PageSetOverrideProvider pageSet={null} text={layers({ shared: { 'common.actions.tryAgain': 'Draft retry' } })}><Probe /></PageSetOverrideProvider> : <Probe />}
      </TextLayerProvider>
    );
    const view = render(tree(true));
    expect(textSnapshot().t('common.actions.tryAgain')).toBe('Draft retry');
    expect(getFormatProfile()).toBe(LEGACY_PROFILE);
    expect(document.documentElement.lang).toBe('en');
    view.rerender(tree(false));
    expect(textSnapshot().t('common.actions.tryAgain')).toBe('Nochmal');
    expect(getFormatProfile().money).toBe('de-DE');
    expect(document.documentElement.lang).toBe('de');
  });
});
