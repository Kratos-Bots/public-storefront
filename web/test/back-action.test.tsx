import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBackAction, useBackActionStore } from '@/stores/back-action.ts';

afterEach(() => useBackActionStore.setState({ override: null }));

describe('useBackAction (a page claiming what Telegram Back does)', () => {
  it('publishes the handler while mounted and clears it on unmount', () => {
    const { unmount } = renderHook(() => useBackAction(() => {}));
    expect(useBackActionStore.getState().override).toBeTypeOf('function');
    unmount();
    expect(useBackActionStore.getState().override).toBeNull();
  });

  it('publishes nothing for null, and releases when the claim is dropped', () => {
    const { rerender } = renderHook(({ fn }: { fn: (() => void) | null }) => useBackAction(fn), {
      initialProps: { fn: (() => {}) as (() => void) | null },
    });
    expect(useBackActionStore.getState().override).not.toBeNull();
    rerender({ fn: null });
    expect(useBackActionStore.getState().override).toBeNull();
  });

  it('calls the latest handler without republishing on every render', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ fn }) => useBackAction(fn), { initialProps: { fn: first } });
    const published = useBackActionStore.getState().override;
    rerender({ fn: second });
    expect(useBackActionStore.getState().override).toBe(published);
    published!();
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  it('a later claim replaces an earlier one, and the earlier one unmounting does not release the later', () => {
    const a = renderHook(() => useBackAction(() => {}));
    const second = vi.fn();
    renderHook(() => useBackAction(second));
    useBackActionStore.getState().override!();
    expect(second).toHaveBeenCalledOnce();
    a.unmount();
    expect(useBackActionStore.getState().override).not.toBeNull();
  });
});
