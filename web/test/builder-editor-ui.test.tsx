import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Full-suite parallel load stretches Puck's cold start past the 5 s default; green alone.
vi.setConfig({ testTimeout: 20_000 });
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';


vi.mock('@/app/builder-gate.ts', async (orig) => ({ ...(await orig<typeof import('@/app/builder-gate.ts')>()), isBuilderMode: () => true }));

import { DEFAULT_PREVIEW_AS, useEditorStore } from '@/builder/editor/store.ts';
import { EditorCanvas } from '@/builder/editor/EditorCanvas.tsx';
import { ViewportToggle } from '@/builder/editor/EditorHeader.tsx';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { insertTarget, type InsertApi } from '@/builder/editor/insert-target.ts';
import { cssString, restingMarkIds, restingMarksCss } from '@/builder/editor/resting-marks.ts';
import { ROOT_ZONE } from '@/builder/editor/config.ts';
import type { Issue, PuckDoc } from '@/builder/types.ts';

function renderCanvas() {
  const router = createMemoryRouter([{ path: '/__builder/*', element: <EditorCanvas /> }], { initialEntries: ['/__builder/doc/catalog'] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

const ready = (readOnly: boolean) =>
  useEditorStore.getState().load({ layout: 'storefront', pageSet: null, readOnly });

/** Puck renders at inline visibility:hidden and reveals itself with injected CSS jsdom never applies. */
async function puckShown() {
  await vi.waitFor(() => expect(document.querySelector('[data-sf-builder-header]')).not.toBeNull());
  for (const el of document.querySelectorAll<HTMLElement>('.Puck')) el.style.visibility = 'visible';
}

describe('editor chrome', () => {
  beforeEach(() => {
    useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null });
  });
  afterEach(cleanup);

  it('the header names every control the e2e and the admin rely on', async () => {
    ready(false);
    renderCanvas();
    await puckShown();
    expect(await screen.findByRole('combobox', { name: 'Page' })).toHaveValue('catalog');
    expect(screen.getByRole('button', { name: 'Add block' })).toHaveAttribute('aria-haspopup', 'menu');
    expect(screen.getByRole('button', { name: 'New page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
    const widths = screen.getByRole('group', { name: 'Preview width' });
    for (const name of ['Fit', 'Phone', 'Tablet', 'Desktop']) expect(within(widths).getByRole('button', { name })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Preview as — session' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Preview as — cart' })).toBeInTheDocument();
    // An untouched page already is the default.
    expect(screen.getByRole('button', { name: 'Reset page to default' })).toBeDisabled();
    // Label in name: the accessible name starts with "Issues" and carries the visible count.
    expect(screen.getByRole('button', { name: 'Issues No issues' })).toHaveTextContent('No issues');
    expect(screen.getByText('Storefront layout')).toBeInTheDocument();
  });

  it('switching page remounts the canvas on the new doc', async () => {
    ready(false);
    renderCanvas();
    await puckShown();
    const picker = await screen.findByRole('combobox', { name: 'Page' });
    await act(async () => fireEvent.change(picker, { target: { value: 'cart' } }));
    expect(useEditorStore.getState().docKey).toBe('cart');
    await puckShown();
    expect(await screen.findByRole('combobox', { name: 'Page' })).toHaveValue('cart');
  });

  it('counts blocking issues, names their page, and lets a reset clear them', async () => {
    const shell = defaultDoc('shell', 'storefront')!;
    const emptyCatalog = { root: { props: { title: '', description: '', chrome: 'shell' as const } }, content: [] };
    useEditorStore.getState().load({ layout: 'storefront', pageSet: { schemaVersion: 1, shell, pages: { catalog: emptyCatalog } }, readOnly: false });
    renderCanvas();
    await puckShown();
    const issues = screen.getByRole('button', { name: /^Issues/ });
    expect(issues).toHaveAccessibleName('Issues 1 issue, publishing is blocked');
    expect(screen.queryByText('This page needs a product grid, product list or trade list.')).toBeNull();
    fireEvent.click(issues);
    expect(issues).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('dialog', { name: 'Fix these to publish' });
    expect(within(panel).getByText('Catalogue')).toBeInTheDocument();
    expect(within(panel).getByText('This page needs a product grid, product list or trade list.')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Fix these to publish' })).toBeNull();
    expect(issues).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Reset page to default' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Reset it' })));
    await puckShown();
    expect(screen.getByRole('button', { name: /^Issues/ })).toHaveTextContent('No issues');
    // The reset remounted the header; focus lands on the Page picker instead of being lost.
    await vi.waitFor(() => expect(screen.getByRole('combobox', { name: 'Page' })).toHaveFocus());
  });

  it('a width preset is an exact preview: Puck hidden but kept, one way back', async () => {
    const about: PuckDoc = { root: { props: { title: 'About', description: '', chrome: 'shell' } }, content: [{ type: 'Heading', props: { id: 'h1', text: 'Northbound Supply' } }] };
    useEditorStore.getState().load({ layout: 'storefront', pageSet: { schemaVersion: 1, shell: defaultDoc('shell', 'storefront')!, pages: { 'page:about': about } }, readOnly: false });
    useEditorStore.getState().selectDoc('page:about');
    renderCanvas();
    await puckShown();
    const header = document.querySelector('[data-sf-builder-header]')!;
    fireEvent.click(within(screen.getByRole('group', { name: 'Preview width' })).getByRole('button', { name: 'Tablet' }));
    const bar = await screen.findByRole('region', { name: 'Exact preview' });
    expect(bar).toHaveTextContent('Previewing at 768 px');
    // The editor stays mounted (undo, selection) but out of sight; no editor chrome shows.
    expect(header.isConnected).toBe(true);
    expect(header.closest('[hidden]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Add block' })).toBeNull();
    // No Puck wrappers in the preview (its rendering is covered in builder-editor-exact-preview.test.tsx).
    expect(document.querySelector('[data-sf-builder-exact="768"] [data-puck-component]')).toBeNull();
    const back = within(bar).getByRole('button', { name: 'Back to editing' });
    expect(back).toHaveFocus();
    fireEvent.click(back);
    expect(useEditorStore.getState().viewport).toBeNull();
    expect(screen.queryByRole('region', { name: 'Exact preview' })).toBeNull();
    expect(header.isConnected).toBe(true);
    expect(header.closest('[hidden]')).toBeNull();
  });

  it("Puck's undo and delete hotkeys can't touch the hidden draft while a preview shows", async () => {
    ready(false);
    renderCanvas();
    await puckShown();
    const headings = () => (useEditorStore.getState().docs.catalog?.content ?? []).filter((c) => c.type === 'Heading').length;
    fireEvent.click(screen.getByRole('button', { name: 'Add block' }));
    await act(async () => fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Heading' })));
    await vi.waitFor(() => expect(headings()).toBe(1));
    const docsBefore = useEditorStore.getState().docs;
    const ctrlZ = (target: Element) => {
      fireEvent.keyDown(target, { key: 'Control', code: 'ControlLeft', ctrlKey: true });
      fireEvent.keyDown(target, { key: 'z', code: 'KeyZ', ctrlKey: true });
      fireEvent.keyUp(target, { key: 'z', code: 'KeyZ', ctrlKey: true });
      fireEvent.keyUp(target, { key: 'Control', code: 'ControlLeft' });
    };

    fireEvent.click(within(screen.getByRole('group', { name: 'Preview width' })).getByRole('button', { name: 'Tablet' }));
    const back = within(await screen.findByRole('region', { name: 'Exact preview' })).getByRole('button', { name: 'Back to editing' });
    expect(back).toHaveFocus();
    // The Heading is still selected on the hidden canvas: Backspace / Delete would remove it.
    await act(async () => {
      fireEvent.keyDown(back, { key: 'Backspace', code: 'Backspace' });
      fireEvent.keyUp(back, { key: 'Backspace', code: 'Backspace' });
      fireEvent.keyDown(back, { key: 'Delete', code: 'Delete' });
      fireEvent.keyUp(back, { key: 'Delete', code: 'Delete' });
      ctrlZ(back);
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(useEditorStore.getState().docs).toBe(docsBefore);
    expect(headings()).toBe(1);

    // Control: back at Fit the same shortcut does reach Puck and undoes the insert.
    fireEvent.click(back);
    await act(async () => ctrlZ(document.body));
    await vi.waitFor(() => expect(headings()).toBe(0));
  });

  it('Add block is a keyboard menu: arrows move, Escape returns focus, choosing inserts once', async () => {
    ready(false);
    renderCanvas();
    await puckShown();
    const add = screen.getByRole('button', { name: 'Add block' });
    fireEvent.click(add);
    const menu = screen.getByRole('menu', { name: 'Blocks to add' });
    expect(add).toHaveAttribute('aria-expanded', 'true');
    expect(add).toHaveAttribute('aria-controls', menu.id);
    // Only menu items inside role="menu"; the placement hint describes it from outside.
    expect(menu.querySelector('p')).toBeNull();
    expect(menu).toHaveAccessibleDescription('Adds at the end of the page.');
    const items = within(menu).getAllByRole('menuitem');
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0]!, { key: 'ArrowDown' });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(items[1]!, { key: 'ArrowUp' });
    fireEvent.keyDown(items[0]!, { key: 'ArrowUp' });
    expect(items.at(-1)).toHaveFocus();
    // Grouped by category, and only what this page accepts.
    expect(within(menu).getByRole('group', { name: 'Content' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Cart lines' })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(add).toHaveFocus();

    fireEvent.click(add);
    await act(async () => fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Heading' })));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(add).toHaveFocus();
    await vi.waitFor(() => {
      const content = useEditorStore.getState().docs.catalog?.content ?? [];
      expect(content.filter((c) => c.type === 'Heading')).toHaveLength(1);
    });
  });

  it("marks locked blocks at rest with a stylesheet keyed on Puck's component ids", async () => {
    ready(false);
    useEditorStore.getState().selectDoc('cart');
    renderCanvas();
    await puckShown();
    const style = document.querySelector('style[data-sf-builder-marks]');
    const cart = defaultDoc('cart', 'storefront')!;
    const lockedIds = cart.content.filter((c) => c.type === 'CartContents').map((c) => c.props.id as string);
    expect(lockedIds.length).toBeGreaterThan(0);
    for (const id of lockedIds) expect(style?.textContent).toContain(`[data-puck-component="${id}"]`);
  });

  it('the read-only view shows the published version with page and width controls only', async () => {
    ready(true);
    renderCanvas();
    expect(await screen.findByText('Published version · read only')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Page' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Preview width' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add block' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New page' })).toBeNull();
  });
});

describe('viewport toggle', () => {
  afterEach(cleanup);

  it('reflects and sets the store width', () => {
    useEditorStore.setState({ viewport: null });
    render(<ViewportToggle />);
    expect(screen.getByRole('button', { name: 'Fit' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Phone' }));
    expect(useEditorStore.getState().viewport).toBe(360);
    expect(screen.getByRole('button', { name: 'Phone' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Fit' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('resting marks', () => {
  const doc = (content: PuckDoc['content']): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content });

  it('outlines blocks with issues and marks the locked ones, issues winning', () => {
    const d = doc([
      { type: 'CartContents', props: { id: 'lines', summary: [{ type: 'Heading', props: { id: 'nested' } }] } },
      { type: 'CartSummary', props: { id: 'sum' } },
      { type: 'Heading', props: { id: 'h1' } },
    ]);
    const issues: Issue[] = [
      { docKey: 'cart', rule: 'field:Heading.text', message: 'x', blockId: 'nested' },
      { docKey: 'cart', rule: 'at-most-one:CartSummary', message: 'x', blockId: 'sum' },
      { docKey: 'catalog', rule: 'field:Heading.text', message: 'x', blockId: 'h1' },
    ];
    const marks = restingMarkIds(d, 'cart', issues);
    expect(marks).toEqual({ issue: ['nested', 'sum'], lock: ['lines'] });
    const css = restingMarksCss(marks);
    expect(css).toContain(
      '[data-sf-builder-canvas] [data-puck-component="nested"],\n[data-sf-builder-canvas] [data-puck-component="sum"] {\n  outline: 2px dashed var(--sfb-mark-issue);',
    );
    expect(css).toContain('[data-sf-builder-canvas] [data-puck-component="lines"] {\n  outline: 1px dashed var(--sfb-mark-lock);');
    expect(css).toMatch(/^\[data-sf-builder-canvas\] \{\n {2}--sfb-mark-issue: #[0-9a-f]{6};\n {2}--sfb-mark-lock: #[0-9a-f]{6};\n\}/);
    expect(restingMarksCss({ issue: [], lock: [] })).toBe('');
  });

  it('escapes ids so they cannot break out of the selector or the style element', () => {
    expect(cssString('a"b\\c')).toBe('a\\"b\\\\c');
    expect(cssString('x</style>')).toBe('x\\3c /style>');
    expect(restingMarksCss({ issue: ['"]{}*{color:red}'], lock: [] })).toContain('[data-puck-component="\\"]{}*{color:red}"]');
  });
});

describe('insert target', () => {
  const SLOT = 'sec-1:children';
  function api(itemSelector: { index: number; zone?: string } | null, allow?: string[]): InsertApi {
    const items: Record<string, { type: string; props: { id: string } }> = { 'sec-1': { type: 'Section', props: { id: 'sec-1' } } };
    // A top-level block's parent is Puck's root node, which has no block id.
    const parents: Record<string, { props: Record<string, unknown> }> = { 'sec-1': { props: { title: '' } } };
    return {
      appState: { ui: { itemSelector }, data: { content: [1, 2, 3] } },
      config: { components: { Section: { fields: { children: { type: 'slot', ...(allow ? { allow } : {}) } } } } },
      getItemById: (id: string) => items[id],
      getParentById: (id: string) => parents[id],
      getSelectorForId: (id: string) => (id === 'sec-1' ? { index: 1, zone: ROOT_ZONE } : undefined),
    } as unknown as InsertApi;
  }

  it('appends to the page when nothing is selected, else goes right after the selection', () => {
    expect(insertTarget(api(null), 'Heading')).toEqual({ zone: ROOT_ZONE, index: 3, nested: false });
    expect(insertTarget(api({ index: 0, zone: ROOT_ZONE }), 'Heading')).toEqual({ zone: ROOT_ZONE, index: 1, nested: false });
    expect(insertTarget(api({ index: 2, zone: SLOT }), 'Heading')).toEqual({ zone: SLOT, index: 3, nested: true });
    expect(insertTarget(api({ index: 2, zone: SLOT }, ['Heading']), 'Heading')).toEqual({ zone: SLOT, index: 3, nested: true });
  });

  it("never puts a block into a slot that doesn't allow it: after the slot's top-level owner instead", () => {
    expect(insertTarget(api({ index: 2, zone: SLOT }, ['Heading']), 'ProductGrid')).toEqual({ zone: ROOT_ZONE, index: 2, nested: false });
  });
});
