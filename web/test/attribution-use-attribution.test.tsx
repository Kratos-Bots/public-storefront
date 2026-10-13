import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const trackPageLoad = vi.hoisted(() => vi.fn());
const markActivity = vi.hoisted(() => vi.fn());
vi.mock('@/features/attribution/tracker.ts', () => ({ trackPageLoad, markActivity }));

import { useAttribution } from '@/features/attribution/useAttribution.ts';

function fakeRouter() {
  const listeners = new Set<() => void>();
  return {
    listeners, log: [] as string[],
    subscribe(fn: () => void) { listeners.add(fn); this.log.push("sub"); return () => { this.log.push("unsub"); listeners.delete(fn); }; },
  };
}
function Probe({ router }: { router: Parameters<typeof useAttribution>[0] }) { useAttribution(router); return null; }

beforeEach(() => { trackPageLoad.mockClear(); markActivity.mockClear(); });

describe('useAttribution', () => {
  it('stays subscribed to navigation under StrictMode', () => {
    const router = fakeRouter();
    const { unmount } = render(<StrictMode><Probe router={router} /></StrictMode>);
    expect(router.listeners.size).toBe(1);
    [...router.listeners][0]!();
    expect(markActivity).toHaveBeenCalledTimes(1);
    expect(trackPageLoad).toHaveBeenCalled();
    unmount();
    expect(router.listeners.size).toBe(0);
  });

  it('reports the page load once and subscribes once without StrictMode', () => {
    const router = fakeRouter();
    const { unmount } = render(<Probe router={router} />);
    expect(trackPageLoad).toHaveBeenCalledTimes(1);
    expect(router.listeners.size).toBe(1);
    unmount();
    expect(router.listeners.size).toBe(0);
  });
});
