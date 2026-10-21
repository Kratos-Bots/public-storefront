import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ReactNode } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';

const h = vi.hoisted(() => ({ languages: ['en'] as string[], locale: 'en', menu: true }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({
  currency: 'GBP', welcomeMessage: null, enabled: true, supportLinks: [], notices: [],
  brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: null, links: { whatsapp: null, telegram: null } },
  features: { layout: 'storefront', ordering: true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false },
} as unknown as StorefrontSettings) }));
vi.mock('@/app/builder-gate.ts', () => ({ isBuilderMode: vi.fn(() => false) }));
vi.mock('@/app/preview-listener.ts', () => ({ isPreviewMode: vi.fn(() => false) }));
vi.mock('@/components/Brand.tsx', () => ({ Brand: () => <span>brand</span> }));
vi.mock('@/features/notices/NoticeBanners.tsx', () => ({ NoticeBanners: () => null }));
vi.mock('@/features/warehouses/WarehouseBar.tsx', () => ({ WarehouseBar: () => null }));
vi.mock('@/features/webapp/useTelegramChrome.ts', () => ({ isFirstHistoryEntry: () => true }));
vi.mock('@/lib/telegram-webapp.ts', () => ({ isTelegramWebApp: () => false }));
vi.mock('@/templates/runtime.tsx', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/templates/runtime.tsx')>()),
  Slot: () => null,
}));
vi.mock('@/templates/hooks.ts', async (orig) => {
  const real = await orig<typeof import('@/templates/hooks.ts')>();
  return { ...real, useCoreOptions: () => ({ ...real.useCoreOptions(), showMobileBottomNav: false, showHeaderMenu: h.menu }) };
});
vi.mock('@/text/runtime.tsx', async (orig) => {
  const real = await orig<typeof import('@/text/runtime.tsx')>();
  return { ...real, useText: () => ({ ...real.useText(), languages: h.languages, locale: h.locale }) };
});
vi.mock('@/text/preference.ts', async (orig) => ({ ...(await orig<typeof import('@/text/preference.ts')>()), chooseLanguage: vi.fn() }));

import { isBuilderMode } from '@/app/builder-gate.ts';
import { chooseLanguage } from '@/text/preference.ts';
import { StorefrontHeader } from '@/layouts/StorefrontShell.tsx';
import { HEADER_VIEWS } from '@/layouts/header-parts.tsx';
import { HeaderFamily } from '@/builder/family-header.ts';
import { languageCode, nativeName } from '@/components/language-name.ts';

function mount(element: ReactNode) {
  const router = createMemoryRouter([{ path: '*', element }], { initialEntries: ['/'] });
  return render(<MantineProvider env="test"><RouterProvider router={router} /></MantineProvider>);
}

function Part() {
  const View = HEADER_VIEWS.HeaderLanguage!;
  const value = { data: { classes: { action: 'act' } }, views: HEADER_VIEWS } as unknown as NonNullable<Parameters<typeof HeaderFamily.Provider>[0]['value']>;
  return <HeaderFamily.Provider value={value}><View props={{}} /></HeaderFamily.Provider>;
}

beforeEach(() => {
  h.languages = ['en'];
  h.locale = 'en';
  h.menu = true;
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  vi.mocked(isBuilderMode).mockReturnValue(false);
  vi.mocked(chooseLanguage).mockClear();
});
afterEach(() => { cleanup(); document.body.removeAttribute('style'); });

describe('native names', () => {
  it('names a language in itself, capitalised, and falls back to the tag', () => {
    expect(nativeName('fr')).toBe('Français');
    expect(nativeName('es')).toBe('Español');
    expect(nativeName('it')).toBe('Italiano');
    expect(languageCode('fr-CA')).toBe('FR');
  });
});

describe('the header menu language group', () => {
  const open = () => fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
  it('is absent with one language', () => {
    mount(<StorefrontHeader />);
    open();
    expect(screen.queryByText('Language')).toBeNull();
  });
  it('lists the languages under its heading, marks the current one, and switches on click', () => {
    h.languages = ['en', 'fr', 'it'];
    mount(<StorefrontHeader />);
    open();
    const group = screen.getByRole('dialog').querySelector('[data-sf-menu="language"]') as HTMLElement;
    expect(within(group).getByRole('heading', { name: 'Language' })).toBeTruthy();
    const items = within(group).getAllByRole('button');
    expect(items.map((b) => b.textContent)).toEqual(['English', 'Français', 'Italiano']);
    expect(items.map((b) => b.getAttribute('aria-current'))).toEqual(['true', null, null]);
    expect(items.map((b) => b.getAttribute('lang'))).toEqual(['en', 'fr', 'it']);
    fireEvent.click(items[0]!);
    expect(chooseLanguage).not.toHaveBeenCalled();
    fireEvent.click(items[1]!);
    expect(chooseLanguage).toHaveBeenCalledWith('fr');
  });
});

describe('the HeaderLanguage part', () => {
  it('renders nothing with one language for a shopper, but shows in the page builder', () => {
    const { container } = mount(<Part />);
    expect(container.querySelector('button')).toBeNull();
    cleanup();
    vi.mocked(isBuilderMode).mockReturnValue(true);
    mount(<Part />);
    expect(screen.getByRole('button', { name: /^Change language/ })).toBeTruthy();
  });
  it('is a code button labelled with the current language that opens the list', () => {
    h.languages = ['en', 'fr'];
    h.locale = 'fr';
    mount(<Part />);
    const b = screen.getByRole('button', { name: /^Change language.*Français$/ });
    expect(b.textContent).toBe('FR');
    fireEvent.click(b);
    const items = screen.getAllByRole('menuitem');
    expect(items.map((x) => x.textContent)).toEqual(['English', 'Français']);
    expect(items.map((x) => x.getAttribute('aria-current'))).toEqual([null, 'true']);
    expect(items.map((x) => x.getAttribute('lang'))).toEqual(['en', 'fr']);
    fireEvent.click(items[0]!);
    expect(chooseLanguage).toHaveBeenCalledWith('en');
  });
  it('does nothing when a language is chosen in the page builder (no reload of the editor frame)', () => {
    vi.mocked(isBuilderMode).mockReturnValue(true);
    h.languages = ['en', 'fr'];
    mount(<Part />);
    fireEvent.click(screen.getByRole('button', { name: /^Change language/ }));
    fireEvent.click(screen.getAllByRole('menuitem')[1]!);
    expect(chooseLanguage).not.toHaveBeenCalled();
  });
  it('is hidden on phones while the header menu is shown (it carries a Language group), always shown in the builder', () => {
    h.languages = ['en', 'fr'];
    mount(<Part />);
    expect(screen.getByRole('button', { name: /^Change language/ }).className).toContain('sf-hide-mobile');
    cleanup();
    vi.mocked(isBuilderMode).mockReturnValue(true);
    mount(<Part />);
    expect(screen.getByRole('button', { name: /^Change language/ }).className).not.toContain('sf-hide-mobile');
  });
  it('stays visible on phones when the header menu option is off', () => {
    h.languages = ['en', 'fr'];
    h.menu = false;
    mount(<Part />);
    expect(screen.getByRole('button', { name: /^Change language/ }).className).not.toContain('sf-hide-mobile');
  });
});
