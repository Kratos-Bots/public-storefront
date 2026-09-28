import { describe, expect, it, vi } from 'vitest';
import { isPreviewMode, subscribePreview } from '@/app/preview-listener.ts';

const theme = {
  template: 'modern', preset: 'default', options: {},
  scheme: 'dark', colors: { primary: '#ffffff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' },
  fonts: { heading: null, body: null, mono: null }, radius: 'none', density: 'comfortable', customCss: 'body{background:url(https://evil/x)}',
};

function fakeWindow(search: string, framed = true) {
  const listeners: Array<(e: MessageEvent) => void> = [];
  const parent = { postMessage: vi.fn() };
  const win = {
    location: { search },
    parent: framed ? parent : undefined,
    addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.splice(listeners.indexOf(fn), 1),
  } as unknown as Window & { parent: typeof parent };
  if (!framed) (win as unknown as { parent: unknown }).parent = win;
  const send = (data: unknown, source: unknown = parent) => listeners.forEach((fn) => fn({ data, source } as MessageEvent));
  return { win, parent, send, listeners };
}

describe('preview listener', () => {
  it('is active only with ?sf-preview=1 inside a frame', () => {
    expect(isPreviewMode(fakeWindow('?sf-preview=1').win)).toBe(true);
    expect(isPreviewMode(fakeWindow('?sf-preview=1', false).win)).toBe(false);
    expect(isPreviewMode(fakeWindow('').win)).toBe(false);
  });
  it('announces readiness and forwards valid themes with customCss dropped', () => {
    const { win, parent, send } = fakeWindow('?sf-preview=1');
    const onTheme = vi.fn();
    subscribePreview(onTheme, win);
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'sf-preview-ready' }, '*');
    send({ type: 'sf-preview-theme', theme });
    expect(onTheme).toHaveBeenCalledTimes(1);
    expect(onTheme.mock.calls[0]![0].customCss).toBe('');
    expect(onTheme.mock.calls[0]![0].colors.bg).toBe('#0f3965');
  });
  it('ignores malformed messages and messages not from the parent', () => {
    const { win, send } = fakeWindow('?sf-preview=1');
    const onTheme = vi.fn();
    subscribePreview(onTheme, win);
    send({ type: 'sf-preview-theme', theme: { ...theme, colors: { bg: 'red' } } });
    send({ type: 'other', theme });
    send('string');
    send({ type: 'sf-preview-theme', theme }, { not: 'parent' });
    expect(onTheme).not.toHaveBeenCalled();
  });
  it('does nothing outside preview mode and unsubscribes cleanly', () => {
    const outside = fakeWindow('');
    const off = subscribePreview(vi.fn(), outside.win);
    expect(outside.listeners).toHaveLength(0);
    off();
    const inside = fakeWindow('?sf-preview=1');
    const off2 = subscribePreview(vi.fn(), inside.win);
    expect(inside.listeners).toHaveLength(1);
    off2();
    expect(inside.listeners).toHaveLength(0);
  });
});
