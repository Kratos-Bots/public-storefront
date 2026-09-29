import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';

// Puck's drag-and-drop layer needs ResizeObserver at import time; jsdom has none.
vi.hoisted(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

vi.mock('@/app/builder-gate.ts', async (orig) => ({ ...(await orig<typeof import('@/app/builder-gate.ts')>()), isBuilderMode: () => true }));

import { DEFAULT_PREVIEW_AS, useEditorStore } from '@/builder/editor/store.ts';
import { EditorCanvas } from '@/builder/editor/EditorCanvas.tsx';
import { ViewportToggle } from '@/builder/editor/EditorHeader.tsx';
import { defaultDoc } from '@/builder/defaults/index.ts';

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
  await screen.findByLabelText('Add block', { selector: 'select' });
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
    expect(screen.getByRole('combobox', { name: 'Add block' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
    const widths = screen.getByRole('group', { name: 'Preview width' });
    for (const name of ['Fit', 'Phone', 'Tablet', 'Desktop']) expect(within(widths).getByRole('button', { name })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Preview as — session' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Preview as — cart' })).toBeInTheDocument();
    // An untouched page already is the default.
    expect(screen.getByRole('button', { name: 'Reset page to default' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Issues' })).toHaveTextContent('No issues');
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
    const issues = screen.getByRole('button', { name: 'Issues' });
    expect(issues).toHaveTextContent('1 issue, publishing is blocked');
    expect(issues).toHaveAccessibleDescription('1 issue, publishing is blocked');
    expect(screen.getByText('This page needs a product grid, product list or trade list.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset page to default' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Reset it' })));
    await puckShown();
    expect(screen.getByRole('button', { name: 'Issues' })).toHaveTextContent('No issues');
  });

  it('the read-only view shows the published version with page and width controls only', async () => {
    ready(true);
    renderCanvas();
    expect(await screen.findByText('Published version · read only')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Page' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Preview width' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Add block' })).toBeNull();
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
