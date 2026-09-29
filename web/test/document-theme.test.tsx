import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { builderOverrides } from '@/app/builder-gate.ts';
import { useDocumentTheme } from '@/app/document-theme.ts';
import { THEME_STORAGE_KEY } from '@/app/theme-bridge.ts';
import type { StorefrontSettings, Theme } from '@/types/settings.ts';

const stored: Theme = {
  template: 'modern', preset: 'default', options: {},
  scheme: 'dark', colors: { primary: '#ffffff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' },
  fonts: { heading: null, body: null, mono: null }, radius: 'none', density: 'comfortable', customCss: '.saved{}',
};
const settings = {
  theme: stored,
  brand: { name: 'Acme', shortName: 'Acme', tagline: '', title: 'Acme', description: '', logoUrl: null, faviconUrl: null, logoHeight: 28, links: { whatsapp: null, telegram: null } },
} as unknown as StorefrontSettings;

function framedWindow(search: string) {
  const listeners: Array<(e: MessageEvent) => void> = [];
  const parent = { postMessage: vi.fn() };
  const win = {
    location: { search },
    parent,
    addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.splice(listeners.indexOf(fn), 1),
  } as unknown as Window;
  const send = (data: unknown) => listeners.forEach((fn) => fn({ data, source: parent } as unknown as MessageEvent));
  return { win, send };
}

afterEach(() => { cleanup(); localStorage.clear(); document.documentElement.removeAttribute('style'); });

describe('useDocumentTheme', () => {
  it('outside a preview frame: paints the stored theme and persists it', () => {
    const { result } = renderHook(() => useDocumentTheme(settings, framedWindow('').win));
    expect(result.current.colors.bg).toBe('#0f3965');
    expect(JSON.parse(localStorage.getItem(THEME_STORAGE_KEY)!).vars['--sf-bg']).toBe('#0f3965');
  });

  it('in a preview frame: the draft overrides the stored theme, keeps the saved customCss, and writes nothing', () => {
    const { win, send } = framedWindow('?sf-preview=1');
    const { result } = renderHook(() => useDocumentTheme(settings, win));
    act(() => send({ type: 'sf-preview-theme', theme: { ...stored, colors: { ...stored.colors, bg: '#101010' }, customCss: 'body{display:none}' } }));
    expect(result.current.colors.bg).toBe('#101010');
    expect(result.current.customCss).toBe('.saved{}');
    expect(document.documentElement.style.getPropertyValue('--sf-bg')).toBe('#101010');
    expect(document.getElementById('sf-custom-css')?.textContent).toBe('.saved{}');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('in a preview frame: in-frame SPA navigation that drops ?sf-preview=1 still never persists a draft', () => {
    const { win, send } = framedWindow('?sf-preview=1');
    const { result } = renderHook(() => useDocumentTheme(settings, win));
    act(() => send({ type: 'sf-preview-theme', theme: { ...stored, colors: { ...stored.colors, bg: '#101010' } } }));
    // history.replaceState('/p/1') inside the frame: the query string is gone, the frame is not
    (win.location as { search: string }).search = '';
    act(() => send({ type: 'sf-preview-theme', theme: { ...stored, colors: { ...stored.colors, bg: '#202020' } } }));
    expect(result.current.colors.bg).toBe('#202020');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('re-applies when the window changes, so the persist decision follows the current window', () => {
    const { rerender } = renderHook(({ win }) => useDocumentTheme(settings, win), { initialProps: { win: framedWindow('?sf-preview=1').win } });
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull(); // preview frame: nothing persisted
    rerender({ win: framedWindow('').win }); // same theme, no longer a preview frame
    expect(JSON.parse(localStorage.getItem(THEME_STORAGE_KEY)!).vars['--sf-bg']).toBe('#0f3965');
  });

  it('in the builder frame: the builder theme wins, keeps the saved customCss, and writes nothing', () => {
    const listeners: Array<(e: MessageEvent) => void> = [];
    const win = {
      location: { search: '?sf-builder=1', pathname: '/__builder' },
      parent: { postMessage: vi.fn() },
      addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.push(fn),
      removeEventListener: () => undefined,
    } as unknown as Window;
    act(() => builderOverrides.setState({ theme: { ...stored, colors: { ...stored.colors, bg: '#202020' }, customCss: '' } }));
    const { result } = renderHook(() => useDocumentTheme(settings, win));
    expect(result.current.colors.bg).toBe('#202020');
    expect(result.current.customCss).toBe('.saved{}');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    act(() => builderOverrides.setState({ theme: null }));
  });
});
