import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ComponentType } from 'react';
import type { StorefrontSettings, Theme } from '@/types/settings.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));

vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
// The shells' heavy children are not under test here.
vi.mock('@/components/Brand.tsx', () => ({ Brand: () => <span>brand</span> }));
vi.mock('@/components/ContactLinks.tsx', () => ({ ContactLinks: () => null }));
vi.mock('@/features/notices/NoticeBanners.tsx', () => ({ NoticeBanners: () => null }));
vi.mock('@/features/notices/CutoffBar.tsx', () => ({ CutoffBar: () => null }));
vi.mock('@/features/auth/LoginModal.tsx', () => ({ LoginModal: () => null }));
vi.mock('@/features/cart/CartDrawer.tsx', () => ({ CartDrawer: () => null }));
vi.mock('@/features/cart/MobileCartBar.tsx', () => ({ MobileCartBar: () => null, useMobileCartBar: () => false }));
vi.mock('@/features/webapp/PrimaryActionBar.tsx', () => ({ PrimaryActionBar: () => null, usePrimaryBarShowing: () => false }));
vi.mock('@/features/webapp/useTelegramChrome.ts', () => ({ useTelegramChrome: () => {}, isFirstHistoryEntry: () => true }));
vi.mock('@/lib/telegram-webapp.ts', () => ({ isTelegramWebApp: () => false }));
vi.mock('@/templates/runtime.tsx', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/templates/runtime.tsx')>()),
  Slot: () => null,
}));

import { MenuShell } from '@/layouts/MenuShell.tsx';
import { StorefrontShell } from '@/layouts/StorefrontShell.tsx';
import { WebAppShell } from '@/layouts/WebAppShell.tsx';
import { useSessionStore } from '@/stores/session.ts';
import { TemplateProvider } from '@/templates/runtime.tsx';
import { resolveTheme } from '@/templates/resolve.ts';
import { lookupManifest } from '@/templates/registry.ts';
import { headerIconClass } from '@/templates/hooks.ts';
import type { HeaderIconMode, OptionValues } from '@/templates/define.ts';
import type { TemplateModule } from '@/templates/slots.ts';

const THEME: Theme = {
  scheme: 'dark',
  colors: { primary: '#ffffff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' },
  fonts: { heading: null, body: null, mono: null }, radius: 'none', density: 'comfortable', customCss: '',
};
const MODULE: TemplateModule = { slots: {} };

function mount(Shell: ComponentType, options: OptionValues, features: Partial<StorefrontSettings['features']> = {}) {
  state.settings = {
    currency: 'GBP', welcomeMessage: null, enabled: true, supportLinks: [], notices: [],
    brand: { name: 'Shop', title: 'Shop', tagline: null, links: { whatsapp: null, telegram: null } },
    features: { layout: 'storefront', ordering: true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false, ...features },
  } as unknown as StorefrontSettings;
  const resolved = resolveTheme({ ...THEME, options }, lookupManifest);
  return render(
    <MantineProvider env="test">
      <TemplateProvider resolved={resolved} fallback={null} load={() => Promise.resolve(MODULE)} peek={() => MODULE}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<Shell />}>
              <Route path="/" element={<p>page</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </TemplateProvider>
    </MantineProvider>,
  );
}

const cartLink = () => screen.queryByRole('link', { name: /^Cart,/ });

afterEach(() => {
  cleanup();
  useSessionStore.setState({ token: null, customer: null });
});

describe('headerIconClass', () => {
  it('maps each mode to its responsive class, or null for none', () => {
    expect(headerIconClass('all')).toBe('');
    expect(headerIconClass('desktop')).toBe('sf-hide-mobile');
    expect(headerIconClass('mobile')).toBe('sf-hide-desktop');
    expect(headerIconClass('none')).toBeNull();
  });
});

const MODES: [HeaderIconMode, string | null, string[]][] = [
  ['all', '', ['sf-hide-mobile', 'sf-hide-desktop']],
  ['desktop', 'sf-hide-mobile', ['sf-hide-desktop']],
  ['mobile', 'sf-hide-desktop', ['sf-hide-mobile']],
  ['none', null, []],
];

describe.each<[string, ComponentType]>([
  ['MenuShell', MenuShell],
  ['StorefrontShell', StorefrontShell],
  ['WebAppShell', WebAppShell],
])('%s header icons', (_name, Shell) => {
  it('show both icons by default', () => {
    mount(Shell, {});
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(cartLink()).toBeInTheDocument();
  });

  it.each(MODES)('headerAccountIcon %s', (mode, has, lacks) => {
    mount(Shell, { headerAccountIcon: mode });
    const link = screen.queryByRole('link', { name: 'Sign in' });
    if (has === null) {
      expect(link).toBeNull();
    } else {
      expect(link).toBeInTheDocument();
      if (has) expect(link).toHaveClass(has);
      for (const c of lacks) expect(link).not.toHaveClass(c);
    }
    // The other icon is untouched.
    expect(cartLink()).toBeInTheDocument();
    expect(cartLink()).not.toHaveClass('sf-hide-mobile');
    expect(cartLink()).not.toHaveClass('sf-hide-desktop');
  });

  it.each(MODES)('headerCartIcon %s', (mode, has, lacks) => {
    mount(Shell, { headerCartIcon: mode });
    const link = cartLink();
    if (has === null) {
      expect(link).toBeNull();
    } else {
      expect(link).toBeInTheDocument();
      if (has) expect(link).toHaveClass(has);
      for (const c of lacks) expect(link).not.toHaveClass(c);
    }
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('the logged-in account link follows the mode too', () => {
    useSessionStore.setState({ token: 't' });
    mount(Shell, { headerAccountIcon: 'desktop' });
    expect(screen.getByRole('link', { name: 'Your account' })).toHaveClass('sf-hide-mobile');
    cleanup();
    mount(Shell, { headerAccountIcon: 'none' });
    expect(screen.queryByRole('link', { name: 'Your account' })).toBeNull();
  });

  it('an unknown mode reads as all', () => {
    mount(Shell, { headerAccountIcon: 'sideways', headerCartIcon: 'sideways' });
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(cartLink()).toBeInTheDocument();
  });

  it('features still gate the icons regardless of mode', () => {
    mount(Shell, { headerAccountIcon: 'all', headerCartIcon: 'all' }, { accounts: false, ordering: false });
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(cartLink()).toBeNull();
  });
});

describe('StorefrontShell account link', () => {
  it('is a "Sign in" text link when logged out', () => {
    mount(StorefrontShell, {});
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveTextContent('Sign in');
  });
});

describe.each<[string, ComponentType]>([
  ['MenuShell', MenuShell],
  ['WebAppShell', WebAppShell],
])('%s category picker', (_name, Shell) => {
  const categories = () => screen.queryByRole('button', { name: /^Categories/ });

  it('shows the Categories button on the catalogue by default', () => {
    mount(Shell, {});
    expect(categories()).toBeInTheDocument();
  });

  it('showCategoryPicker false hides it', () => {
    mount(Shell, { showCategoryPicker: false });
    expect(categories()).toBeNull();
    expect(cartLink()).toBeInTheDocument();
  });

  it('wholesale hides it regardless', () => {
    mount(Shell, {}, { wholesale: true });
    expect(categories()).toBeNull();
  });
});
