import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePrimaryAction, usePrimaryActionStore } from '@/stores/primary-action.ts';

afterEach(() => usePrimaryActionStore.setState({ override: null }));

describe('usePrimaryAction', () => {
  it('publishes the action while mounted and clears it on unmount', () => {
    const onClick = vi.fn();
    const { unmount } = renderHook(() => usePrimaryAction({ label: 'Continue', onClick }));
    expect(usePrimaryActionStore.getState().override?.label).toBe('Continue');
    unmount();
    expect(usePrimaryActionStore.getState().override).toBeNull();
  });

  it('calls the latest handler without republishing on every render', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ fn }) => usePrimaryAction({ label: 'Continue', onClick: fn }), { initialProps: { fn: first } });
    const published = usePrimaryActionStore.getState().override;
    rerender({ fn: second });
    expect(usePrimaryActionStore.getState().override).toBe(published);
    published!.onClick();
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  it('republishes when the label, disabled or busy state changes', () => {
    const { rerender } = renderHook(({ busy }) => usePrimaryAction({ label: 'Place order', onClick: () => {}, busy }), { initialProps: { busy: false } });
    rerender({ busy: true });
    expect(usePrimaryActionStore.getState().override?.busy).toBe(true);
  });

  it('publishes nothing for null', () => {
    renderHook(() => usePrimaryAction(null));
    expect(usePrimaryActionStore.getState().override).toBeNull();
  });
});
