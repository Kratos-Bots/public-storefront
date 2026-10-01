// web/test/builder-editor-text-header.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';

vi.mock('@/app/builder-gate.ts', async (orig) => ({ ...(await orig<typeof import('@/app/builder-gate.ts')>()), isBuilderMode: () => true }));

import { DEFAULT_PREVIEW_AS, TEXT_INITIAL, useEditorStore } from '@/builder/editor/store.ts';
import { EditorCanvas } from '@/builder/editor/EditorCanvas.tsx';
import { useTextUi } from '@/builder/editor/text/ui-store.ts';
import { applyText } from '@/builder/editor/text/hooks.ts';
import { plainKey } from './helpers/text-keys.ts';

function renderCanvas() {
  const router = createMemoryRouter([{ path: '/__builder/*', element: <EditorCanvas /> }], { initialEntries: ['/__builder/doc/catalog'] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}
async function puckShown() {
  // Puck's first render is slow under a full-suite run: wait longer than vi.waitFor's 1 s default.
  await vi.waitFor(() => expect(document.querySelector('[data-sf-builder-header]')).not.toBeNull(), { timeout: 30_000 });
  for (const el of document.querySelectorAll<HTMLElement>('.Puck')) el.style.visibility = 'visible';
}
const S = () => useEditorStore.getState();

describe('editor header: text', () => {
  const key = plainKey();
  beforeEach(() => {
    useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null, ...TEXT_INITIAL });
    useTextUi.setState({ open: false, filter: 'all', query: '', focus: null });
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
  });
  afterEach(cleanup);

  it('the Text button toggles the panel state', async () => {
    renderCanvas();
    await puckShown();
    const button = screen.getByRole('button', { name: 'Text' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(useTextUi.getState().open).toBe(true);
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('text issues count, list under Text, and jump to their row', async () => {
    renderCanvas();
    await puckShown();
    act(() => { applyText('shared', key, 'Hi {'); });
    const issues = screen.getByRole('button', { name: /^Issues/ });
    expect(issues).toHaveAccessibleName('Issues 1 issue, publishing is blocked');
    fireEvent.click(issues);
    const panel = screen.getByRole('dialog', { name: 'Fix these to publish' });
    const section = within(panel).getByRole('region', { name: 'Text' });
    fireEvent.click(within(section).getByRole('button', { name: /All layouts/ }));
    expect(useTextUi.getState()).toMatchObject({ open: true, filter: 'issues', focus: { key } });
  });

  it('a layer-wide text issue (too many languages) is listed by name and blocks publishing', async () => {
    const locales = ['en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'sv', 'da', 'nb', 'fi'];
    const strings = Object.fromEntries(locales.map((l) => [l, { [key]: `Words ${l}` }]));
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: { schemaVersion: 1, language: { locale: 'en', formatLocale: '' }, strings } });
    renderCanvas();
    await puckShown();
    const issues = screen.getByRole('button', { name: /^Issues/ });
    expect(issues).toHaveAccessibleName('Issues 1 issue, publishing is blocked');
    fireEvent.click(issues);
    const section = within(screen.getByRole('dialog', { name: 'Fix these to publish' })).getByRole('region', { name: 'Text' });
    expect(within(section).getByRole('button', { name: /^Languages/ })).toHaveTextContent(/11 languages/);
  });

  it('Undo and Redo cover text edits', async () => {
    renderCanvas();
    await puckShown();
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).toBeDisabled();
    act(() => { applyText('shared', key, 'Northbound'); });
    expect(undo).toBeEnabled();
    fireEvent.click(undo);
    expect(S().siteText!.strings).toEqual({});
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(S().siteText!.strings.en![key]).toBe('Northbound');
  });

  it('Ctrl+Z inside a text field undoes the text edit, not a block', async () => {
    renderCanvas();
    await puckShown();
    const field = document.createElement('input');
    const holder = document.createElement('div');
    holder.setAttribute('data-sfb-text', '');
    holder.appendChild(field);
    document.body.appendChild(holder);
    act(() => { applyText('shared', key, 'Typed'); });
    field.focus();
    const event = new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true });
    act(() => { field.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(S().siteText!.strings).toEqual({});
    holder.remove();
  });

  function textField() {
    const field = document.createElement('input');
    const holder = document.createElement('div');
    holder.setAttribute('data-sfb-text', '');
    holder.appendChild(field);
    document.body.appendChild(holder);
    field.focus();
    return { field, remove: () => holder.remove() };
  }
  const keydown = (init: KeyboardEventInit) => new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, ...init });
  async function insertHeading(n: number) {
    const headings = () => (S().docs.catalog?.content ?? []).filter((c) => c.type === 'Heading').length;
    fireEvent.click(screen.getByRole('button', { name: 'Add block' }));
    await act(async () => fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Heading' })));
    await vi.waitFor(() => expect(headings()).toBe(n), { timeout: 30_000 });
    // Let Puck record the insert (debounced).
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
  }

  it('Ctrl+Z inside a text field with nothing to undo keeps the field’s native undo', async () => {
    renderCanvas();
    await puckShown();
    const { field, remove } = textField();
    const event = keydown({ key: 'z', code: 'KeyZ' });
    act(() => { field.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
    remove();
  });

  it('Ctrl+Z inside a text field whose next step is a block keeps native undo and leaves the block', async () => {
    renderCanvas();
    await puckShown();
    await insertHeading(1);
    const { field, remove } = textField();
    const event = keydown({ key: 'z', code: 'KeyZ' });
    act(() => { field.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect((S().docs.catalog?.content ?? []).filter((c) => c.type === 'Heading')).toHaveLength(1);
    remove();
  });

  it('Ctrl+Shift+Z drops a branched-away text redo like the Redo button', async () => {
    renderCanvas();
    await puckShown();
    await insertHeading(1);
    // A text redo anchored to Puck's first entry, now behind the current one: redoStep = 'discard'.
    const snap = { siteText: S().siteText, pageText: S().pageText };
    act(() => { useEditorStore.setState({ textFuture: [{ snap, anchor: null }] }); });
    const outside = keydown({ key: 'z', code: 'KeyZ', shiftKey: true });
    act(() => { document.body.dispatchEvent(outside); });
    expect(outside.defaultPrevented).toBe(true);
    expect(S().textFuture).toHaveLength(0);

    // In a field: the stale redo still goes, but the key stays the field's own.
    act(() => { useEditorStore.setState({ textFuture: [{ snap, anchor: null }] }); });
    const { field, remove } = textField();
    const inside = keydown({ key: 'y', code: 'KeyY' });
    act(() => { field.dispatchEvent(inside); });
    expect(inside.defaultPrevented).toBe(false);
    expect(S().textFuture).toHaveLength(0);
    remove();
  });

  it('the undo-key listener is added once, not on every render', async () => {
    const spy = vi.spyOn(window, 'addEventListener');
    try {
      renderCanvas();
      await puckShown();
      const count = () => spy.mock.calls.filter(([type, , opts]) => type === 'keydown' && opts === true).length;
      const before = count();
      act(() => { applyText('shared', key, 'One'); });
      act(() => { S().undoText(); });
      act(() => { S().redoText(); });
      expect(count()).toBe(before);
    } finally {
      spy.mockRestore();
    }
  });

  it('while an exact preview shows, the keys are left to the preview guard', async () => {
    renderCanvas();
    await puckShown();
    act(() => { applyText('shared', key, 'Typed'); S().setViewport(768); });
    const event = new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true });
    act(() => { document.body.dispatchEvent(event); });
    expect(S().siteText!.strings.en![key]).toBe('Typed');
  });

  // Ledger HARD CARRY: the store reads Puck's history inside onChange and again a microtask later.
  // A source that returned a render snapshot would still show the old entry in that microtask, so a
  // canvas undo would look like a new edit and throw the text redo away.
  it('a canvas undo keeps the text redo: the history source reads Puck live', async () => {
    renderCanvas();
    await puckShown();
    const headings = () => (S().docs.catalog?.content ?? []).filter((c) => c.type === 'Heading').length;
    // Two inserts, so the undo and redo step between minted ids (the id-less first entry has its
    // own test below).
    for (const n of [1, 2]) {
      fireEvent.click(screen.getByRole('button', { name: 'Add block' }));
      await act(async () => fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Heading' })));
      await vi.waitFor(() => expect(headings()).toBe(n), { timeout: 30_000 });
      // Let Puck record the insert (debounced) before the next edit.
      await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    }
    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });

    act(() => { applyText('shared', key, 'After block'); });
    await act(async () => { fireEvent.click(undo); });          // text
    expect(S().siteText!.strings).toEqual({});
    expect(S().textFuture).toHaveLength(1);
    await act(async () => { fireEvent.click(undo); });          // the second block
    await vi.waitFor(() => expect(headings()).toBe(1), { timeout: 30_000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(S().textFuture).toHaveLength(1);

    await act(async () => { fireEvent.click(redo); });          // the block again
    await vi.waitFor(() => expect(headings()).toBe(2), { timeout: 30_000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(S().textFuture).toHaveLength(1);
    await act(async () => { fireEvent.click(redo); });          // then the text
    expect(S().siteText!.strings.en![key]).toBe('After block');
    // Two recorded inserts (400 ms each) on top of Puck's first render: well past the 5 s default
    // when the whole suite shares the CPU.
  });

  it('undoing the first block edit of a mount keeps the text redo (Puck\'s id-less first entry)', async () => {
    renderCanvas();
    await puckShown();
    const headings = () => (S().docs.catalog?.content ?? []).filter((c) => c.type === 'Heading').length;
    await insertHeading(1);
    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });
    act(() => { applyText('shared', key, 'After first block'); });
    await act(async () => { fireEvent.click(undo); });          // text
    await act(async () => { fireEvent.click(undo); });          // the only block, onto the id-less entry
    await vi.waitFor(() => expect(headings()).toBe(0), { timeout: 30_000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(S().textFuture).toHaveLength(1);
    await act(async () => { fireEvent.click(redo); });          // the block again
    await vi.waitFor(() => expect(headings()).toBe(1), { timeout: 30_000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    await act(async () => { fireEvent.click(redo); });          // then the text
    expect(S().siteText!.strings.en![key]).toBe('After first block');
  });

  it('a new block edit clears the text redo', async () => {
    renderCanvas();
    await puckShown();
    const headings = () => (S().docs.catalog?.content ?? []).filter((c) => c.type === 'Heading').length;
    act(() => { applyText('shared', key, 'First'); });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(S().textFuture).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Add block' }));
    await act(async () => fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Heading' })));
    await vi.waitFor(() => expect(headings()).toBe(1), { timeout: 30_000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    expect(S().textFuture).toHaveLength(0);
  });
});
