// web/test/builder-editor-checkout-parts.test.tsx — stage 5 task 6: the step order control, the notices and the legality guard on a real Puck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Full-suite parallel load stretches Puck's cold start past the 5 s default; green alone.
vi.setConfig({ testTimeout: 20_000 });
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';

vi.mock('@/app/builder-gate.ts', async (orig) => ({ ...(await orig<typeof import('@/app/builder-gate.ts')>()), isBuilderMode: () => true }));

import { defaultDoc } from '@/builder/defaults/index.ts';
import { DEFAULT_PREVIEW_AS, useEditorStore } from '@/builder/editor/store.ts';
import { EditorCanvas } from '@/builder/editor/EditorCanvas.tsx';
import { StepOrderControl } from '@/builder/editor/StepOrderControl.tsx';
import { announceRevert, clearRevert, LegalityNotice } from '@/builder/editor/LegalityGuard.tsx';
import { CHECKOUT_AFTER_NOTICE, CHECKOUT_ASIDE_NOTICE, CHECKOUT_COUPON_OFF_NOTICE } from '@/builder/editor/container-parts.ts';
import { ROOT_ZONE } from '@/builder/editor/config.ts';
import { DEFAULT_STEP_ORDER } from '@/builder/family-checkout.ts';
import { checkRules } from '@/builder/rules.ts';
import type { ComponentData, PuckDoc } from '@/builder/types.ts';

const items = (v: unknown) => v as ComponentData[];
const types = (v: unknown) => items(v).map((c) => c.type);
const L = 'storefront' as const;

describe('StepOrderControl', () => {
  afterEach(cleanup);

  it('renders five rows and disables each arrow per stepRows, with the reason as its title', () => {
    render(<StepOrderControl order={DEFAULT_STEP_ORDER} onMove={() => {}} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => within(r).getAllByRole('button').length)).toEqual([2, 2, 2, 2, 2]);
    expect(screen.getByRole('button', { name: 'Move Your details up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Your details down' })).toBeEnabled();
    const addressDown = screen.getByRole('button', { name: 'Move Delivery address down' });
    expect(addressDown).toBeDisabled();
    expect(addressDown).toHaveAttribute('title', 'Delivery needs the address first');
    expect(screen.getByRole('button', { name: 'Move Payment up' })).toHaveAttribute('title', 'Payment must come after Delivery');
    expect(screen.getByRole('button', { name: 'Move Review up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Review down' })).toBeDisabled();
    expect(screen.getByText('Always last — it holds Place order')).toBeInTheDocument();
  });

  it('an enabled arrow reports the step and direction', () => {
    const onMove = vi.fn();
    render(<StepOrderControl order={DEFAULT_STEP_ORDER} onMove={onMove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move Your details down' }));
    expect(onMove).toHaveBeenCalledWith('contact', 1);
  });
});

describe('LegalityNotice', () => {
  afterEach(() => { clearRevert(); cleanup(); });
  it('is a live region that shows the message and dismisses', () => {
    render(<LegalityNotice />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    act(() => announceRevert("Discount code can't go in Your details."));
    expect(screen.getByRole('status')).toHaveTextContent("Discount code can't go in Your details.");
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});

// ── the real canvas ──────────────────────────────────────────────────────────

interface PuckStore {
  getState(): { state: { data: PuckDoc }; dispatch(a: unknown): void; selectedItem: ComponentData | null };
}
const puckStore = () => (window as unknown as { __PUCK_INTERNAL_DO_NOT_USE: { appStore: PuckStore } }).__PUCK_INTERNAL_DO_NOT_USE.appStore;

function renderCanvas() {
  const router = createMemoryRouter([{ path: '/__builder/*', element: <EditorCanvas /> }], { initialEntries: ['/__builder/doc/checkout'] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MantineProvider>,
  );
}
async function puckShown() {
  await vi.waitFor(() => expect(document.querySelector('[data-sf-builder-header]')).not.toBeNull());
  for (const el of document.querySelectorAll<HTMLElement>('.Puck')) el.style.visibility = 'visible';
}
const flowOf = (doc: PuckDoc) => doc.content[0]!;
const stepOf = (doc: PuckDoc, type: string) => items(flowOf(doc).props.steps).find((s) => s.type === type)!;

describe('the checkout canvas', () => {
  beforeEach(() => {
    useEditorStore.setState({ status: 'waiting', layout: L, readOnly: false, docs: {}, docKey: 'checkout', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null });
    useEditorStore.getState().load({ layout: L, pageSet: null, readOnly: false });
    useEditorStore.getState().selectDoc('checkout');
  });
  afterEach(() => { clearRevert(); cleanup(); });

  const select = async () => {
    renderCanvas();
    await puckShown();
    await act(async () => puckStore().getState().dispatch({ type: 'setUi', ui: { itemSelector: { index: 0, zone: ROOT_ZONE }, rightSideBarVisible: true } }));
  };

  it('selecting the checkout shows the Step order control and the notices; a move rewrites the steps in one replace', async () => {
    await select();
    const control = await screen.findByRole('list', { name: 'Step order' });
    expect(within(control).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getAllByText(CHECKOUT_ASIDE_NOTICE).length).toBeGreaterThan(0);
    expect(screen.getAllByText(CHECKOUT_AFTER_NOTICE).length).toBeGreaterThan(0);
    expect(screen.queryByText(CHECKOUT_COUPON_OFF_NOTICE)).toBeNull();
    // The Parts list shows the five steps as Required rows.
    const parts = screen.getByRole('list', { name: 'Parts' });
    for (const label of ['Your details', 'Delivery address', 'Delivery', 'Payment', 'Review']) {
      const row = within(parts).getAllByText(label).map((e) => e.closest('li')).find((li) => li?.getAttribute('data-part-type')?.startsWith('Checkout'));
      expect(row, label).toBeTruthy();
      expect(row).toHaveTextContent('Required');
    }
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Move Your details down' })));
    expect(types(flowOf(puckStore().getState().state.data).props.steps)).toEqual(['CheckoutAddress', 'CheckoutContact', 'CheckoutShipping', 'CheckoutPayment', 'CheckoutReview']);
    expect(screen.getAllByRole('status').some((s) => s.textContent === 'Your details moved down')).toBe(true);
    // Contact is no longer first: its up arrow is the one that works.
    expect(screen.getByRole('button', { name: 'Move Your details up' })).toBeEnabled();
  });

  it('an arrangement the page cannot use is undone and explained; the store never sees it', async () => {
    renderCanvas();
    await puckShown();
    const contact = stepOf(puckStore().getState().state.data, 'CheckoutContact');
    await act(async () => puckStore().getState().dispatch({
      type: 'insert', componentType: 'CheckoutCoupon', destinationIndex: 0, destinationZone: `${String(contact.props.id)}:before`, id: 'cp-dropped', recordHistory: true,
    }));
    const data = puckStore().getState().state.data;
    expect(items(stepOf(data, 'CheckoutContact').props.before)).toEqual([]);
    expect(checkRules(data, 'checkout', L).filter((i) => i.rule.startsWith('part-home'))).toEqual([]);
    expect(document.querySelector('[data-sf-builder-legality]')?.textContent).toContain("Discount code can't go in");
    // The store never held the refused drop.
    const stored = useEditorStore.getState().docs.checkout;
    if (stored) expect(items(stepOf(stored, 'CheckoutContact').props.before)).toEqual([]);
  });

  it('a legal drop goes through untouched (a content block in the Contact step)', async () => {
    renderCanvas();
    await puckShown();
    const contact = stepOf(puckStore().getState().state.data, 'CheckoutContact');
    await act(async () => puckStore().getState().dispatch({
      type: 'insert', componentType: 'RichText', destinationIndex: 0, destinationZone: `${String(contact.props.id)}:before`, id: 'rt-dropped', recordHistory: true,
    }));
    expect(types(stepOf(puckStore().getState().state.data, 'CheckoutContact').props.before)).toEqual(['RichText']);
    expect(types(stepOf(useEditorStore.getState().docs.checkout!, 'CheckoutContact').props.before)).toEqual(['RichText']);
    expect(document.querySelector('[data-sf-builder-legality]')).toBeNull();
  });

  it('an unrelated edit on an already-illegal stored document is not reverted', async () => {
    const bad = JSON.parse(JSON.stringify(defaultDoc('checkout', L))) as PuckDoc;
    const f = flowOf(bad);
    const byType = Object.fromEntries(items(f.props.steps).map((s) => [s.type, s]));
    f.props.steps = [byType.CheckoutContact, byType.CheckoutAddress, byType.CheckoutPayment, byType.CheckoutShipping, byType.CheckoutReview];
    expect(checkRules(bad, 'checkout', L).some((i) => i.rule === 'part-order:CheckoutFlow')).toBe(true);
    useEditorStore.getState().load({ layout: L, pageSet: { shell: defaultDoc('shell', L)!, pages: { checkout: bad } } as never, readOnly: false });
    useEditorStore.getState().selectDoc('checkout');
    renderCanvas();
    await puckShown();
    const contact = stepOf(puckStore().getState().state.data, 'CheckoutContact');
    await act(async () => puckStore().getState().dispatch({
      type: 'insert', componentType: 'RichText', destinationIndex: 0, destinationZone: `${String(contact.props.id)}:before`, id: 'rt-dropped', recordHistory: true,
    }));
    expect(types(stepOf(puckStore().getState().state.data, 'CheckoutContact').props.before)).toEqual(['RichText']);
    expect(document.querySelector('[data-sf-builder-legality]')).toBeNull();
  });

  it('the issues list offers Reset step order for a bad order and the click repairs the page', async () => {
    const bad = JSON.parse(JSON.stringify(defaultDoc('checkout', L))) as PuckDoc;
    const f = flowOf(bad);
    const byType = Object.fromEntries(items(f.props.steps).map((x) => [x.type, x]));
    f.props.steps = [byType.CheckoutContact, byType.CheckoutAddress, byType.CheckoutPayment, byType.CheckoutShipping, byType.CheckoutReview];
    useEditorStore.getState().load({ layout: L, pageSet: { shell: defaultDoc('shell', L)!, pages: { checkout: bad } } as never, readOnly: false });
    useEditorStore.getState().selectDoc('checkout');
    renderCanvas();
    await puckShown();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Issues/ })));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText('Checkout')).toHaveLength(2);
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Reset step order' })));
    expect(types(flowOf(puckStore().getState().state.data).props.steps)).toEqual(['CheckoutContact', 'CheckoutAddress', 'CheckoutShipping', 'CheckoutPayment', 'CheckoutReview']);
    expect(checkRules(puckStore().getState().state.data, 'checkout', L)).toEqual([]);
  });
});
