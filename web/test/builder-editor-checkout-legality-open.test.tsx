// web/test/builder-editor-checkout-legality-open.test.tsx — the guard fails CLOSED when Puck is not at hand to undo a drop
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';

vi.mock('@/app/builder-gate.ts', async (orig) => ({ ...(await orig<typeof import('@/app/builder-gate.ts')>()), isBuilderMode: () => true }));
// The bridge never hands the canvas Puck's getPuck (as between remounts): no way to undo.
vi.mock('@/builder/editor/LegalityGuard.tsx', async (orig) => ({ ...(await orig<typeof import('@/builder/editor/LegalityGuard.tsx')>()), PuckHandleBridge: () => null }));

import { DEFAULT_PREVIEW_AS, useEditorStore } from '@/builder/editor/store.ts';
import { EditorCanvas } from '@/builder/editor/EditorCanvas.tsx';
import { clearRevert } from '@/builder/editor/LegalityGuard.tsx';
import type { ComponentData, PuckDoc } from '@/builder/types.ts';

const items = (v: unknown) => v as ComponentData[];
const puckStore = () => (window as unknown as { __PUCK_INTERNAL_DO_NOT_USE: { appStore: { getState(): { state: { data: PuckDoc }; dispatch(a: unknown): void } } } }).__PUCK_INTERNAL_DO_NOT_USE.appStore;

describe('legality guard without a Puck handle', () => {
  beforeEach(() => {
    useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'checkout', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null });
    useEditorStore.getState().load({ layout: 'storefront', pageSet: null, readOnly: false });
    useEditorStore.getState().selectDoc('checkout');
  });
  afterEach(() => { clearRevert(); cleanup(); });

  it('keeps the last accepted document in the store and still tells the owner', async () => {
    const router = createMemoryRouter([{ path: '/__builder/*', element: <EditorCanvas /> }], { initialEntries: ['/__builder/doc/checkout'] });
    render(<MantineProvider><QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
    await vi.waitFor(() => expect(document.querySelector('.Puck')).not.toBeNull());
    await vi.waitFor(() => expect(typeof (window as unknown as { __PUCK_INTERNAL_DO_NOT_USE?: unknown }).__PUCK_INTERNAL_DO_NOT_USE).toBe('object'));
    const contact = items(puckStore().getState().state.data.content[0]!.props.steps).find((s) => s.type === 'CheckoutContact')!;
    await act(async () => puckStore().getState().dispatch({
      type: 'insert', componentType: 'CheckoutCoupon', destinationIndex: 0, destinationZone: `${String(contact.props.id)}:before`, id: 'cp-dropped', recordHistory: true,
    }));
    expect(document.querySelector('[data-sf-builder-legality]')?.textContent).toContain("Discount code can't go in");
    const stored = useEditorStore.getState().docs.checkout;
    if (stored) {
      const c = items(stored.content[0]!.props.steps).find((s) => s.type === 'CheckoutContact')!;
      expect(items(c.props.before)).toEqual([]);
    }
  });
});
