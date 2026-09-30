// web/test/builder-editor-text-panel.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Profiler } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DEFAULT_PREVIEW_AS, TEXT_INITIAL, useEditorStore } from '@/builder/editor/store.ts';
import { useTextUi } from '@/builder/editor/text/ui-store.ts';
import { TextRow } from '@/builder/editor/text/TextRow.tsx';
import { TextPanel } from '@/builder/editor/text/TextPanel.tsx';
import { allRows, rowFor } from '@/builder/editor/text/catalog.ts';
import { defaultOf, placeholderKey, plainKey, pluralKey } from './helpers/text-keys.ts';

const S = () => useEditorStore.getState();
const ready = (siteText: 'editable' | 'absent' = 'editable') => {
  useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null, ...TEXT_INITIAL });
  S().load({ layout: 'storefront', pageSet: null, readOnly: false, ...(siteText === 'editable' ? { siteText: null } : {}) });
  if (siteText === 'absent') S().setPublishedText({ language: { locale: 'en', formatLocale: '' }, shared: {} });
};
const reload = () => act(() => { S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: S().siteText }); });

describe('Text panel rows', () => {
  beforeEach(() => useTextUi.setState({ open: true, filter: 'all', query: '', focus: null }));
  afterEach(cleanup);

  it('typing writes the shared draft; the placeholder shows the built-in default; clearing resets', () => {
    ready();
    const key = plainKey();
    render(<TextRow row={rowFor(key)!} />);
    const input = screen.getByRole('textbox', { name: rowFor(key)!.label });
    expect(input).toHaveAttribute('placeholder', String(defaultOf(key)));
    expect(screen.getByRole('button', { name: 'All layouts' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(input, { target: { value: 'Northbound words' } });
    expect(S().siteText!.strings.en![key]).toBe('Northbound words');
    expect(screen.getByText('Shared', { exact: true })).toBeInTheDocument();   // layer badge
    fireEvent.change(input, { target: { value: '' } });
    expect(S().siteText!.strings).toEqual({});
  });

  it('"Only Storefront" writes this layout, shows the shared value underneath, Reset clears only that scope', () => {
    ready();
    const key = plainKey();
    act(() => { S().setText('shared', key, 'Shared words', null); });
    render(<TextRow row={rowFor(key)!} />);
    fireEvent.click(screen.getByRole('button', { name: 'Only Storefront' }));
    const input = screen.getByRole('textbox', { name: rowFor(key)!.label });
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', 'Shared words');
    fireEvent.change(input, { target: { value: 'Storefront words' } });
    expect(S().pageText.strings.en![key]).toBe('Storefront words');
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(S().pageText.strings).toEqual({});
    expect(S().siteText!.strings.en![key]).toBe('Shared words');
  });

  it('an unknown placeholder shows an inline issue and marks the input invalid', () => {
    ready();
    const key = plainKey();
    render(<TextRow row={rowFor(key)!} />);
    const input = screen.getByRole('textbox', { name: rowFor(key)!.label });
    fireEvent.change(input, { target: { value: 'Hi {nope}' } });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/\{nope\} isn’t available in this line/)).toBeInTheDocument();
  });

  it('placeholder chips insert at the caret', () => {
    ready();
    const { key, name } = placeholderKey();
    render(<TextRow row={rowFor(key)!} />);
    const input = screen.getByRole('textbox', { name: rowFor(key)!.label }) as HTMLInputElement | HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Only  left' } });
    fireEvent.focus(input);
    input.setSelectionRange(5, 5);
    fireEvent.select(input);
    fireEvent.click(screen.getByRole('button', { name: `Insert {${name}}` }));
    expect(S().siteText!.strings.en![key]).toBe(`Only {${name}} left`);
  });

  it('without siteText the shared scope is disabled and edits go to this layout', () => {
    ready('absent');
    const key = plainKey();
    render(<TextRow row={rowFor(key)!} />);
    expect(screen.getByRole('button', { name: 'All layouts' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Only Storefront' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByRole('textbox', { name: rowFor(key)!.label }), { target: { value: 'Mine' } });
    expect(S().pageText.strings.en![key]).toBe('Mine');
    expect(S().siteText).toBeNull();
  });

  it('plural keys: one input per category of the store language, with a live example', () => {
    ready();
    const key = pluralKey();
    const label = rowFor(key)!.label;
    const { unmount } = render(<TextRow row={rowFor(key)!} />);
    expect(screen.getAllByRole('textbox').map((el) => el.getAttribute('aria-label'))).toEqual([`${label} — one`, `${label} — other`]);
    fireEvent.change(screen.getByRole('textbox', { name: `${label} — other` }), { target: { value: '{count} crates' } });
    expect(screen.getByText('5 crates', { exact: false })).toBeInTheDocument();
    unmount();
    act(() => { S().setLanguage({ locale: 'pl' }, null); });
    render(<TextRow row={rowFor(key)!} />);
    expect(screen.getAllByRole('textbox').map((el) => el.getAttribute('aria-label'))).toEqual(
      ['one', 'few', 'many', 'other'].map((c) => `${label} — ${c}`),
    );
  });

  // CARRY (T6 review): a plural form without {count} is a non-blocking warning.
  it('warns (without blocking) when a plural form leaves out {count}', () => {
    ready();
    const key = pluralKey();
    const label = rowFor(key)!.label;
    render(<TextRow row={rowFor(key)!} />);
    const other = screen.getByRole('textbox', { name: `${label} — other` });
    fireEvent.change(other, { target: { value: 'several crates' } });
    expect(other).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText(/“other” form leaves out \{count\}/)).toBeInTheDocument();
    expect(S().siteText!.strings.en![key]).toEqual({ other: 'several crates' });
  });

  // CARRY (T6 review): the plural "empty" message names the form that is empty.
  it('an empty plural form is named in its issue', () => {
    ready();
    const key = pluralKey();
    act(() => { S().setText('shared', key, { one: '   ', other: '{count} crates' }, null); });
    render(<TextRow row={rowFor(key)!} />);
    expect(screen.getByText(/Fill in the “one” form/)).toBeInTheDocument();
    expect(screen.queryByText(/“Other” form/)).toBeNull();
  });

  it('a plural missing its “other” form says so', () => {
    ready();
    const key = pluralKey();
    const label = rowFor(key)!.label;
    render(<TextRow row={rowFor(key)!} />);
    fireEvent.change(screen.getByRole('textbox', { name: `${label} — one` }), { target: { value: '{count} crate' } });
    expect(screen.getByText(/Fill in the “other” form/)).toBeInTheDocument();
  });

  // CARRY (T1 review): an override that drops the default's edge whitespace gets a warning.
  it('warns when an override drops the leading space the built-in wording has', () => {
    ready();
    const key = 'templates.default.hero.categories';
    const row = rowFor(key)!;
    expect(String(row.def).startsWith(' ')).toBe(true);
    render(<TextRow row={row} />);
    const label = row.label;
    const inputs = screen.getAllByRole('textbox');
    const input = row.plural ? screen.getByRole('textbox', { name: `${label} — other` }) : inputs[0]!;
    fireEvent.change(input, { target: { value: '· {count} kinds' } });
    expect(screen.getByText(/starts with a space/)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: ' · {count} kinds' } });
    expect(screen.queryByText(/starts with a space/)).toBeNull();
  });

  // CARRY (T7 review): edits are tied to the load they started under.
  it('a load remounts the row: its scope re-derives and edits land in the new load', () => {
    ready();
    const key = plainKey();
    render(<TextRow row={rowFor(key)!} />);
    fireEvent.click(screen.getByRole('button', { name: 'Only Storefront' }));
    const before = screen.getByRole('textbox', { name: rowFor(key)!.label });
    fireEvent.focus(before);
    reload();
    const after = screen.getByRole('textbox', { name: rowFor(key)!.label });
    expect(after).not.toBe(before);
    expect(screen.getByRole('button', { name: 'All layouts' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(after, { target: { value: 'Fresh' } });
    expect(S().siteText!.strings.en![key]).toBe('Fresh');
  });

  it('an edit started before a load is refused', () => {
    ready();
    const key = plainKey();
    render(<TextRow row={rowFor(key)!} />);
    const input = screen.getByRole('textbox', { name: rowFor(key)!.label });
    fireEvent.focus(input);
    // A load that lands while the row is still mounted (no re-render yet): the captured epoch is stale.
    useEditorStore.setState({ loadEpoch: S().loadEpoch + 1 });
    fireEvent.change(input, { target: { value: 'Too late' } });
    expect(S().siteText!.strings.en?.[key]).toBeUndefined();
  });
  it('editing one row does not re-render another', () => {
    ready();
    const key = plainKey();
    const other = allRows().find((r) => r.key !== key && !r.plural)!;
    const renders: Record<string, number> = { a: 0, b: 0 };
    const count = (id: string) => { renders[id]! += 1; };
    render(
      <>
        <Profiler id="a" onRender={() => count('a')}><TextRow row={rowFor(key)!} /></Profiler>
        <Profiler id="b" onRender={() => count('b')}><TextRow row={other} /></Profiler>
      </>,
    );
    const before = renders.b;
    const input = screen.getByRole('textbox', { name: rowFor(key)!.label });
    fireEvent.change(input, { target: { value: 'One' } });
    fireEvent.change(input, { target: { value: 'One two' } });
    fireEvent.change(input, { target: { value: 'Hi {' } });   // an issue appears on this row only
    expect(renders.a).toBeGreaterThan(1);
    expect(renders.b).toBe(before);
  });
});

describe('Text panel', () => {
  beforeEach(() => useTextUi.setState({ open: true, filter: 'all', query: '', focus: null }));
  afterEach(cleanup);

  it('search and the Issues filter narrow the rows; Unused lists unknown keys with Delete', () => {
    ready();
    const key = plainKey();
    act(() => {
      S().setText('shared', key, 'Hi {', null);
      useEditorStore.setState({ siteText: { ...S().siteText!, strings: { en: { ...S().siteText!.strings.en, 'zz.gone.key': 'old' } } } });
    });
    render(<TextPanel />);
    const panel = screen.getByRole('region', { name: 'Site text' });
    fireEvent.click(within(panel).getByRole('button', { name: /^Issues/ }));   // "Issues 1" carries the count
    const rows = panel.querySelectorAll('[data-text-key]');
    expect([...rows].map((r) => r.getAttribute('data-text-key'))).toContain(key);
    expect([...rows].every((r) => r.getAttribute('data-text-key') === key || r.closest('[data-unused]'))).toBe(true);
    fireEvent.click(within(panel).getByRole('button', { name: 'All' }));
    fireEvent.change(within(panel).getByRole('searchbox', { name: 'Search text' }), { target: { value: 'zzqq-nothing' } });
    expect(within(panel).getByText('No lines match.')).toBeInTheDocument();
    const unused = panel.querySelector('[data-unused]') as HTMLElement;
    expect(within(unused).getByText('zz.gone.key')).toBeInTheDocument();
    fireEvent.click(within(unused).getByRole('button', { name: 'Delete zz.gone.key' }));
    expect(S().siteText!.strings.en!['zz.gone.key']).toBeUndefined();
  });

  it('under Issues, the row being fixed stays until the filter changes', () => {
    ready();
    const key = plainKey();
    act(() => { S().setText('shared', key, 'Hi {', null); });
    render(<TextPanel />);
    const panel = screen.getByRole('region', { name: 'Site text' });
    fireEvent.click(within(panel).getByRole('button', { name: /^Issues/ }));
    const input = within(panel).getByRole('textbox', { name: rowFor(key)!.label });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Hi there' } });
    expect(S().siteText!.strings.en![key]).toBe('Hi there');
    expect(within(panel).getByRole('textbox', { name: rowFor(key)!.label })).toBe(input);
    fireEvent.click(within(panel).getByRole('button', { name: 'All' }));
    fireEvent.click(within(panel).getByRole('button', { name: /^Issues/ }));
    expect(panel.querySelector(`[data-text-key="${key}"]`)).toBeNull();
  });

  it('under Edited, clearing a row keeps it in place', () => {
    ready();
    const key = plainKey();
    act(() => { S().setText('shared', key, 'Changed', null); });
    render(<TextPanel />);
    const panel = screen.getByRole('region', { name: 'Site text' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Edited' }));
    const input = within(panel).getByRole('textbox', { name: rowFor(key)!.label });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    expect(S().siteText!.strings).toEqual({});
    expect(within(panel).getByRole('textbox', { name: rowFor(key)!.label })).toBe(input);
  });

  it('a broad search mounts a capped number of rows, with Show more', () => {
    ready();
    render(<TextPanel />);
    const panel = screen.getByRole('region', { name: 'Site text' });
    fireEvent.change(within(panel).getByRole('searchbox', { name: 'Search text' }), { target: { value: 'e' } });
    const first = panel.querySelectorAll('[data-text-key]').length;
    expect(first).toBeLessThanOrEqual(60);
    fireEvent.click(within(panel).getByRole('button', { name: /^Show \d+ more/ }));
    expect(panel.querySelectorAll('[data-text-key]').length).toBeGreaterThan(first);
  });

  it('a focus request clears a filter and search that hide the row', async () => {
    ready();
    const key = plainKey();
    useTextUi.setState({ filter: 'issues', query: 'zzqq-nothing' });
    useTextUi.setState({ focus: { key, seq: 999 } });
    render(<TextPanel />);
    await vi.waitFor(() => expect(document.activeElement?.closest('[data-text-key]')?.getAttribute('data-text-key')).toBe(key));
    expect(useTextUi.getState().filter).toBe('all');
    expect(useTextUi.getState().query).toBe('');
  });

  it('the Issues count matches the rows it lists', () => {
    ready();
    const key = plainKey();
    act(() => {
      S().setText('shared', key, 'Hi {', null);
      S().setText('layout', key, 'Oops }', null);
    });
    render(<TextPanel />);
    const panel = screen.getByRole('region', { name: 'Site text' });
    const issuesButton = within(panel).getByRole('button', { name: /^Issues/ });
    expect(issuesButton).toHaveAccessibleName('Issues 1');
    fireEvent.click(issuesButton);
    expect(panel.querySelectorAll('[data-text-key]').length).toBe(1);
  });

  it('the filter group has All, Edited, This layout and Issues', () => {
    ready();
    render(<TextPanel />);
    const show = screen.getByRole('group', { name: 'Show' });
    for (const name of ['All', 'Edited', 'This layout']) expect(within(show).getByRole('button', { name })).toBeInTheDocument();
    expect(within(show).getByRole('button', { name: /^Issues/ })).toBeInTheDocument();
  });

  it('language: changing the store language edits the shared draft and the counter names it', () => {
    ready();
    render(<TextPanel />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Store language' }), { target: { value: 'de' } });
    expect(S().siteText!.language).toEqual({ locale: 'de', formatLocale: '' });
    expect(screen.getByText(/of \d+ lines set in Deutsch — the rest show the built-in English/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Numbers and dates' }), { target: { value: 'de-AT' } });
    expect(S().siteText!.language.formatLocale).toBe('de-AT');
  });

  it('language controls are disabled without siteText, with the reason shown', () => {
    ready('absent');
    render(<TextPanel />);
    expect(screen.getByRole('combobox', { name: 'Store language' })).toBeDisabled();
    expect(screen.getByText(/can’t be changed from this version of the admin/)).toBeInTheDocument();
  });

  it('a typed language tag commits on Enter, but not after a load', () => {
    ready();
    render(<TextPanel />);
    const formats = () => screen.getByRole('combobox', { name: 'Numbers and dates' });
    fireEvent.change(formats(), { target: { value: '__other__' } });
    const tag = screen.getByRole('textbox', { name: 'Language tag' });
    fireEvent.focus(tag);
    fireEvent.change(tag, { target: { value: 'en-ie' } });
    fireEvent.keyDown(tag, { key: 'Enter' });
    expect(S().siteText!.language.formatLocale).toBe('en-IE');

    fireEvent.change(formats(), { target: { value: '__other__' } });
    const again = screen.getByRole('textbox', { name: 'Language tag' });
    fireEvent.focus(again);
    fireEvent.change(again, { target: { value: 'en-NZ' } });
    useEditorStore.setState({ loadEpoch: S().loadEpoch + 1 });   // a load lands mid-edit
    fireEvent.blur(again);
    expect(S().siteText!.language.formatLocale).toBe('en-IE');
  });

  it('a focus request opens the row’s group and focuses its input', async () => {
    ready();
    const key = plainKey();
    useTextUi.getState().show({ key });
    render(<TextPanel />);
    await vi.waitFor(() => expect(document.activeElement?.closest('[data-text-key]')?.getAttribute('data-text-key')).toBe(key));
  });
});
