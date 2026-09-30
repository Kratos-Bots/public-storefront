import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { PuckDoc } from '@/builder/types.ts';

// EditorCanvas pulls in Puck, whose drag-and-drop layer needs ResizeObserver at import time.
vi.hoisted(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
vi.mock('@/app/builder-gate.ts', async (orig) => ({ ...(await orig<typeof import('@/app/builder-gate.ts')>()), isBuilderMode: () => true }));
vi.mock('@/components/Brand.tsx', () => ({ Brand: () => <span data-mark="brand">brand</span> }));
vi.mock('@/components/ContactLinks.tsx', () => ({ ContactLinks: () => <i data-mark="contact" /> }));
vi.mock('@/features/notices/NoticeBanners.tsx', () => ({ NoticeBanners: () => <i data-mark="notices" /> }));
vi.mock('@/features/notices/CutoffBar.tsx', () => ({ CutoffBar: () => <i data-mark="cutoff" /> }));
vi.mock('@/features/auth/LoginModal.tsx', () => ({ LoginModal: () => <i data-mark="login-modal" /> }));
vi.mock('@/features/cart/CartDrawer.tsx', () => ({ CartDrawer: () => <i data-mark="cart-drawer" /> }));
vi.mock('@/features/cart/MobileCartBar.tsx', () => ({ MobileCartBar: () => <i data-mark="cart-bar" />, useMobileCartBar: () => false }));
vi.mock('@/features/webapp/PrimaryActionBar.tsx', () => ({ PrimaryActionBar: () => <i data-mark="primary-bar" />, usePrimaryBarShowing: () => false }));
vi.mock('@/features/webapp/useTelegramChrome.ts', () => ({ useTelegramChrome: () => {}, isFirstHistoryEntry: () => true }));
vi.mock('@/lib/telegram-webapp.ts', () => ({ isTelegramWebApp: () => false }));

import { ExactPreview } from '@/builder/editor/ExactPreview.tsx';
import { EditorCanvas } from '@/builder/editor/EditorCanvas.tsx';
import { DEFAULT_PREVIEW_AS, useEditorStore } from '@/builder/editor/store.ts';
import { builderOverrides } from '@/app/builder-gate.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { isHiddenCanvasHotkey, isTextEditable } from '@/builder/editor/preview-keys.ts';

function settings() {
  state.settings = {
    currency: 'GBP', welcomeMessage: null, enabled: true, supportLinks: [], notices: [],
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: 'Small batches', links: { whatsapp: null, telegram: null } },
    features: { layout: 'storefront', ordering: true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false },
    theme: { scheme: 'dark', colors: {}, fonts: {}, radius: 'md', density: 'comfortable', customCss: '' },
  } as unknown as StorefrontSettings;
}

const page = (content: PuckDoc['content'], chrome: 'shell' | 'none' = 'shell'): PuckDoc => ({ root: { props: { title: '', description: '', chrome } }, content });

function mount() {
  // As fixture-routes.tsx mounts the editor: under the fixture route with a trailing splat.
  const router = createMemoryRouter(
    [{ path: '/__builder/doc/:docKey/*', element: <ExactPreview width={768} /> }],
    { initialEntries: ['/__builder/doc/page-about'] },
  );
  return render(
    <MantineProvider env="test">
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

function openDraft(about: PuckDoc) {
  useEditorStore.getState().load({ layout: 'storefront', pageSet: { schemaVersion: 1, shell: defaultDoc('shell', 'storefront')!, pages: { 'page:about': about } }, readOnly: false });
  useEditorStore.getState().selectDoc('page:about');
}

describe('exact preview', () => {
  beforeEach(() => {
    settings();
    builderOverrides.setState({ theme: null, layout: 'storefront' });
    useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: 768 });
  });
  afterEach(cleanup);

  it("renders the draft through the shop's own shell: header, page in <main>, system mounts", () => {
    openDraft(page([{ type: 'Heading', props: { id: 'h1', text: 'Northbound Supply story' } }, { type: 'Image', props: { id: 'i1' } }]));
    const { container } = mount();
    const body = container.querySelector('[data-sf-builder-exact="768"]')!;
    expect(within(body as HTMLElement).getByRole('heading', { name: 'Northbound Supply story' }).closest('main')).not.toBeNull();
    expect(body.querySelector('header')).not.toBeNull();
    expect(body.querySelector('[data-mark="cart-drawer"]')).not.toBeNull();
    expect(body.querySelector('[data-puck-component]')).toBeNull();
    // Shopper view: no editor-only hints (an Image without a file shows nothing, not the upload hint).
    expect(screen.queryByText(/Upload an image/)).toBeNull();
  });

  it('a chrome: none page renders in the chromeless frame, as on the storefront', () => {
    openDraft(page([{ type: 'Heading', props: { id: 'h1', text: 'Your order' } }], 'none'));
    const { container } = mount();
    const body = container.querySelector('[data-sf-builder-exact="768"]')!;
    expect(within(body as HTMLElement).getByRole('heading', { name: 'Your order' })).toBeInTheDocument();
    expect(body.querySelector('[data-mark="cart-drawer"]')).toBeNull();
    expect(body.querySelectorAll('header')).toHaveLength(1);
    expect(body.querySelector('[data-mark="brand"]')).not.toBeNull();
  });

  it('shows the latest draft, and Back to editing returns to Fit', () => {
    openDraft(page([{ type: 'Heading', props: { id: 'h1', text: 'First draft' } }]));
    mount();
    expect(screen.getByRole('heading', { name: 'First draft' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to editing' }));
    expect(useEditorStore.getState().viewport).toBeNull();
  });
});

describe('read-only version at a width preset', () => {
  beforeEach(() => {
    settings();
    builderOverrides.setState({ theme: null, layout: 'storefront' });
    useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null });
  });
  afterEach(cleanup);

  function mountReadOnly(viewport: 360 | 768 | 1280 | null) {
    useEditorStore.getState().load({
      layout: 'storefront', readOnly: true,
      pageSet: { schemaVersion: 1, shell: defaultDoc('shell', 'storefront')!, pages: { 'page:about': page([{ type: 'Heading', props: { id: 'h1', text: 'Published story' } }]) } },
    });
    useEditorStore.getState().selectDoc('page:about');
    useEditorStore.setState({ viewport });
    const router = createMemoryRouter([{ path: '/__builder/doc/:docKey/*', element: <EditorCanvas /> }], { initialEntries: ['/__builder/doc/page-about'] });
    return render(
      <MantineProvider env="test">
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </MantineProvider>,
    );
  }

  it('renders through the full runtime (shell + system mounts), like the editing presets', async () => {
    const { container } = mountReadOnly(768);
    expect(await screen.findByText('Published version · read only')).toBeInTheDocument();
    const body = container.querySelector('[data-sf-builder-exact="768"]') as HTMLElement;
    expect(body).not.toBeNull();
    expect(within(body).getByRole('heading', { name: 'Published story' }).closest('main')).not.toBeNull();
    expect(body.querySelector('[data-mark="cart-drawer"]')).not.toBeNull();
    // No editing bar: the read-only header's width toggle is the way back to Fit.
    expect(screen.queryByRole('button', { name: 'Back to editing' })).toBeNull();
  });

  it('Fit keeps the plain page view (no shop system mounts)', async () => {
    const { container } = mountReadOnly(null);
    expect(await screen.findByRole('heading', { name: 'Published story' })).toBeInTheDocument();
    expect(container.querySelector('[data-sf-builder-exact]')).toBeNull();
    expect(container.querySelector('[data-mark="cart-drawer"]')).toBeNull();
  });
});

describe('hidden-canvas hotkeys', () => {
  const key = (init: KeyboardEventInit, target: EventTarget = document.body) => {
    const e = new KeyboardEvent('keydown', { bubbles: true, ...init });
    Object.defineProperty(e, 'target', { value: target });
    return e;
  };

  it('catches undo / redo everywhere and delete outside text fields', () => {
    const input = document.createElement('input');
    const button = document.createElement('button');
    expect(isHiddenCanvasHotkey(key({ key: 'z', code: 'KeyZ', ctrlKey: true }))).toBe(true);
    expect(isHiddenCanvasHotkey(key({ key: 'Z', code: 'KeyZ', metaKey: true, shiftKey: true }))).toBe(true);
    expect(isHiddenCanvasHotkey(key({ key: 'y', code: 'KeyY', ctrlKey: true }))).toBe(true);
    expect(isHiddenCanvasHotkey(key({ key: 'z', code: 'KeyZ', ctrlKey: true }, input))).toBe(true);
    expect(isHiddenCanvasHotkey(key({ key: 'Backspace', code: 'Backspace' }, button))).toBe(true);
    expect(isHiddenCanvasHotkey(key({ key: 'Delete', code: 'Delete' }, button))).toBe(true);
    expect(isHiddenCanvasHotkey(key({ key: 'Backspace', code: 'Backspace' }, input))).toBe(false);
    expect(isHiddenCanvasHotkey(key({ key: 'z', code: 'KeyZ' }))).toBe(false);
    expect(isHiddenCanvasHotkey(key({ key: 'Enter', code: 'Enter' }))).toBe(false);
  });

  it('knows a text field from a button-like input', () => {
    const text = document.createElement('input');
    const checkbox = Object.assign(document.createElement('input'), { type: 'checkbox' });
    expect(isTextEditable(text)).toBe(true);
    expect(isTextEditable(document.createElement('textarea'))).toBe(true);
    expect(isTextEditable(checkbox)).toBe(false);
    expect(isTextEditable(document.createElement('button'))).toBe(false);
  });

  it('holds keys back from document listeners without cancelling their default action', () => {
    openDraft(page([]));
    mount();
    const seen: string[] = [];
    const onDoc = (e: KeyboardEvent) => seen.push(e.key);
    document.addEventListener('keydown', onDoc);
    const input = document.createElement('input');
    document.body.appendChild(input);
    const undo = new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true });
    input.dispatchEvent(undo);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', bubbles: true }));
    screen.getByRole('button', { name: 'Back to editing' }).dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', bubbles: true }));
    expect(seen).toEqual(['Backspace']);
    expect(undo.defaultPrevented).toBe(false);
    cleanup();
    // Gone with the preview.
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true }));
    expect(seen).toEqual(['Backspace', 'z']);
    document.removeEventListener('keydown', onDoc);
    input.remove();
  });
});
