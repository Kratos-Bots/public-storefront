import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { TextLayers } from '@/text/types.ts';

// Counts format-profile writes: one per provider render, plus one per effect activation and cleanup.
const spy = vi.hoisted(() => ({ setFormatProfile: null as null | ReturnType<typeof vi.fn> }));
vi.mock('@/lib/format.ts', async (orig) => {
  const real = await orig<typeof import('@/lib/format.ts')>();
  spy.setFormatProfile = vi.fn(real.setFormatProfile);
  return { ...real, setFormatProfile: spy.setFormatProfile };
});
import { TextLayerProvider } from '@/text/runtime.tsx';

afterEach(cleanup);
const layers: TextLayers = { locale: 'en', formatLocale: '', shared: { 'common.actions.tryAgain': 'Retry' }, layout: {} };

describe('TextLayerProvider re-renders (editor CanvasTextScope re-renders on every doc edit)', () => {
  it('a parent re-render with the same layers object does not re-register the provider', () => {
    const view = render(<TextLayerProvider text={layers}><span>a</span></TextLayerProvider>);
    const calls = () => spy.setFormatProfile!.mock.calls.length;
    const before = calls();
    view.rerender(<TextLayerProvider text={layers}><span>b</span></TextLayerProvider>);
    expect(calls() - before).toBe(1); // the synchronous render-time write only — no cleanup/activate pair
  });
  it('new layers do re-register (the counter can see an effect run)', () => {
    const view = render(<TextLayerProvider text={layers}><span>a</span></TextLayerProvider>);
    const calls = () => spy.setFormatProfile!.mock.calls.length;
    const before = calls();
    view.rerender(<TextLayerProvider text={{ ...layers }}><span>b</span></TextLayerProvider>);
    expect(calls() - before).toBe(3); // render, cleanup's activate, effect's activate
  });
});
