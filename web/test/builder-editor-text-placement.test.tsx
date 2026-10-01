// web/test/builder-editor-text-placement.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Full-suite parallel load stretches Puck's cold start past the 5 s default; green alone.
vi.setConfig({ testTimeout: 20_000 });
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';

vi.mock('@/app/builder-gate.ts', async (orig) => ({ ...(await orig<typeof import('@/app/builder-gate.ts')>()), isBuilderMode: () => true }));

import { DEFAULT_PREVIEW_AS, TEXT_INITIAL, useEditorStore } from '@/builder/editor/store.ts';
import { EditorCanvas } from '@/builder/editor/EditorCanvas.tsx';
import { useTextUi } from '@/builder/editor/text/ui-store.ts';
import { BLOCKS } from '@/builder/registry.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { WIDE_FRAME_QUERY } from '@/builder/editor/panels.ts';
import { blockTextRows } from '@/builder/editor/text/catalog.ts';
import { BLOCK_TEXT_SEARCH_OVER } from '@/builder/editor/text/BlockText.tsx';
import { SETTINGS_KEY } from '@/app/settings.ts';
import { SETTINGS } from './helpers/product-fixtures.ts';
import placement from '@/builder/editor/text/TextPlacement.module.css';

function renderCanvas() {
  const router = createMemoryRouter([{ path: '/__builder/*', element: <EditorCanvas /> }], { initialEntries: ['/__builder/doc/shell'] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // The editor mounts under the shop's loaded settings; the shell's Header, notices and footer read them.
  client.setQueryData(SETTINGS_KEY, SETTINGS);
  return render(<MantineProvider><QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}
async function puckShown() {
  await vi.waitFor(() => expect(document.querySelector('[data-sf-builder-header]')).not.toBeNull());
  for (const el of document.querySelectorAll<HTMLElement>('.Puck')) el.style.visibility = 'visible';
}

describe('Text panel placement and block text', () => {
  beforeEach(() => {
    useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'shell', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null, ...TEXT_INITIAL });
    useTextUi.setState({ open: false, filter: 'all', query: '', focus: null });
    useEditorStore.getState().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    useEditorStore.getState().selectDoc('shell');
  });
  afterEach(cleanup);

  it('in a narrow frame the Text button opens the overlay; Escape closes it and focus returns', async () => {
    renderCanvas();
    await puckShown();
    const button = screen.getByRole('button', { name: 'Text' });
    fireEvent.click(button);
    const panel = await screen.findByRole('region', { name: 'Site text' });
    expect(panel.closest('[data-sfb-text-overlay]')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Site text' })).toBeNull();
    expect(button).toHaveFocus();
  });

  it('selecting a block with text patterns shows "Text in this block" under its fields', async () => {
    const header = defaultDoc('shell', 'storefront')!.content.find((b) => b.type === 'Footer')!;
    expect(BLOCKS.Footer!.text?.length ?? 0).toBeGreaterThan(0);
    renderCanvas();
    await puckShown();
    const el = document.querySelector(`[data-puck-component="${header.props.id}"]`) as HTMLElement;
    await act(async () => { fireEvent.click(el); });
    // Puck renders its fields twice — the right sidebar and the phone-only Fields tab — and shows one
    // by media query. jsdom applies Puck's CSS but not its media queries, so both read as hidden.
    const sections = await screen.findAllByRole('region', { name: 'Text in this block', hidden: true });
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      expect(section.querySelectorAll('[data-text-key]').length).toBeGreaterThan(0);
      if (section.querySelectorAll('[data-text-key]').length > 20) {
        expect(within(section).getByRole('searchbox', { name: 'Search this block’s text', hidden: true })).toBeInTheDocument();
        expect(within(section).getByRole('button', { name: 'Open in Text panel', hidden: true })).toBeInTheDocument();
      }
    }
  });

  describe('in a wide frame', () => {
    const narrowMedia = window.matchMedia;
    beforeEach(() => {
      window.matchMedia = ((query: string) => ({ ...narrowMedia(query), matches: query === WIDE_FRAME_QUERY })) as typeof window.matchMedia;
    });
    afterEach(() => { window.matchMedia = narrowMedia; });

    const railItem = (label: string) => [...document.querySelectorAll<HTMLElement>('[class*="NavItem-link"]')].find((el) => el.textContent === label)!;

    it('the Text button opens the panel as the left sidebar tab, not an overlay; closing returns to Blocks', async () => {
      renderCanvas();
      await puckShown();
      expect(railItem('Site text')).toBeDefined();
      const button = screen.getByRole('button', { name: 'Text' });
      await act(async () => { fireEvent.click(button); });
      const panel = await screen.findByRole('region', { name: 'Site text', hidden: true });
      expect(panel.closest('[data-sfb-text-overlay]')).toBeNull();
      expect(railItem('Site text').parentElement!.className).toMatch(/NavItem--active/);
      expect(screen.getAllByRole('region', { name: 'Site text', hidden: true })).toHaveLength(1);
      await act(async () => { fireEvent.click(button); });
      expect(screen.queryByRole('region', { name: 'Site text', hidden: true })).toBeNull();
      expect(railItem('Blocks').parentElement!.className).toMatch(/NavItem--active/);
    });

    it('picking another rail tab closes the panel; picking Site text opens it', async () => {
      renderCanvas();
      await puckShown();
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Text' })); });
      await screen.findByRole('region', { name: 'Site text', hidden: true });
      await act(async () => { fireEvent.click(railItem('Outline')); });
      expect(useTextUi.getState().open).toBe(false);
      expect(screen.queryByRole('region', { name: 'Site text', hidden: true })).toBeNull();
      await act(async () => { fireEvent.click(railItem('Site text')); });
      expect(useTextUi.getState().open).toBe(true);
      expect(await screen.findByRole('region', { name: 'Site text', hidden: true })).toBeInTheDocument();
    });
  });

  it('a block with many lines gets its own search, and "Open in Text panel" carries the query', async () => {
    expect(blockTextRows('CheckoutFlow', 'modern').length).toBeGreaterThan(BLOCK_TEXT_SEARCH_OVER);
    const block = defaultDoc('checkout', 'storefront')!.content.find((b) => b.type === 'CheckoutFlow')!;
    useEditorStore.getState().selectDoc('checkout');
    renderCanvas();
    await puckShown();
    const el = document.querySelector(`[data-puck-component="${block.props.id}"]`) as HTMLElement;
    await act(async () => { fireEvent.click(el); });
    const [section] = await screen.findAllByRole('region', { name: 'Text in this block', hidden: true });
    const search = within(section!).getByRole('searchbox', { name: 'Search this block’s text', hidden: true });
    // The block's search row carries the placement module's own class, which its layout rules target.
    const tools = search.closest('[data-sfb-block-tools]') as HTMLElement;
    expect(tools).not.toBeNull();
    expect(tools.classList).toContain(placement.blockTools);
    fireEvent.change(search, { target: { value: 'zzzz-no-such-line' } });
    expect(section!.querySelectorAll('[data-text-key]')).toHaveLength(0);
    fireEvent.click(within(section!).getByRole('button', { name: 'Open in Text panel', hidden: true }));
    expect(useTextUi.getState()).toMatchObject({ open: true, query: 'zzzz-no-such-line' });
  });
});
