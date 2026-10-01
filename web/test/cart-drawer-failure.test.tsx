import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { ComponentType } from 'react';

/**
 * The drawer panel is a dynamic import. If its chunk cannot be fetched (a deploy replaced the hashed
 * asset, or the shopper is offline) the shell must still mount its other overlays, nothing may reject
 * unhandled, and the next open retries the import.
 */
afterEach(() => {
  cleanup();
  vi.doUnmock('@/features/cart/CartDrawerPanel.tsx');
  vi.resetModules();
});

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

describe('cart drawer chunk failure', () => {
  it('reports ready after a failed import, swallows the rejection, and retries when the drawer opens', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    let attempts = 0;
    const Good: ComponentType = () => <i data-testid="panel" />;
    vi.resetModules();
    vi.doMock('@/features/cart/CartDrawerPanel.tsx', () => {
      attempts += 1;
      if (attempts === 1) throw new Error('Failed to fetch dynamically imported module');
      return { CartDrawerPanel: Good };
    });
    const { CartDrawer, useCartDrawerReady } = await import('@/features/cart/CartDrawer.tsx');
    const { useUiStore } = await import('@/stores/ui.ts');
    useUiStore.setState({ cartOpen: false });
    const seen: boolean[] = [];
    const Probe = () => {
      const ready = useCartDrawerReady();
      seen.push(ready);
      return ready ? <i data-testid="after" /> : null;
    };
    const { queryByTestId } = render(<><CartDrawer /><Probe /></>);
    expect(seen[0]).toBe(false);
    await flush();
    expect(queryByTestId('after')).not.toBeNull();
    expect(queryByTestId('panel')).toBeNull();
    expect(attempts).toBe(1);

    act(() => { useUiStore.getState().open('cartOpen'); });
    await flush();
    expect(attempts).toBe(2);
    expect(queryByTestId('panel')).not.toBeNull();
    await flush();
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
