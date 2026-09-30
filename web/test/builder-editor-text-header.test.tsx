// web/test/builder-editor-text-header.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';

vi.hoisted(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
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
  await vi.waitFor(() => expect(document.querySelector('[data-sf-builder-header]')).not.toBeNull(), { timeout: 10_000 });
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
    // Two inserts: Puck's initial history entry has no id, and the store treats stepping onto an
    // id-less entry as unknown (it clears the redo — the safe failure). Step between minted ids.
    for (const n of [1, 2]) {
      fireEvent.click(screen.getByRole('button', { name: 'Add block' }));
      await act(async () => fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Heading' })));
      await vi.waitFor(() => expect(headings()).toBe(n), { timeout: 5_000 });
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
    await vi.waitFor(() => expect(headings()).toBe(1), { timeout: 5_000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(S().textFuture).toHaveLength(1);

    await act(async () => { fireEvent.click(redo); });          // the block again
    await vi.waitFor(() => expect(headings()).toBe(2), { timeout: 5_000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(S().textFuture).toHaveLength(1);
    await act(async () => { fireEvent.click(redo); });          // then the text
    expect(S().siteText!.strings.en![key]).toBe('After block');
    // Two recorded inserts (400 ms each) on top of Puck's first render: well past the 5 s default
    // when the whole suite shares the CPU.
  }, 30_000);

  it('a new block edit clears the text redo', async () => {
    renderCanvas();
    await puckShown();
    const headings = () => (S().docs.catalog?.content ?? []).filter((c) => c.type === 'Heading').length;
    act(() => { applyText('shared', key, 'First'); });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(S().textFuture).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Add block' }));
    await act(async () => fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Heading' })));
    await vi.waitFor(() => expect(headings()).toBe(1), { timeout: 5_000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    expect(S().textFuture).toHaveLength(0);
  }, 20_000);
});
