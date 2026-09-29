import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { StorefrontSettings } from '@/types/settings.ts';

vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({ brand: { name: 'Northbound Supply' }, features: { layout: 'storefront' }, theme: { scheme: 'dark' } }) as unknown as StorefrontSettings }));

import { useCoreOptions } from '@/templates/hooks.ts';
import { Slot } from '@/templates/runtime.tsx';
import { CoreOptionsScope } from '@/builder/blocks/_shared/CoreOptionsScope.tsx';

function Show() {
  const o = useCoreOptions();
  return <p>{`sku:${o.showSku} title:${o.showPageTitle} cart:${o.headerCartIcon}`}</p>;
}

afterEach(cleanup);

describe('CoreOptionsScope', () => {
  it('leaves the store-wide options alone when empty', () => {
    render(<CoreOptionsScope value={{}}><Show /></CoreOptionsScope>);
    expect(screen.getByText('sku:true title:true cart:all')).toBeInTheDocument();
  });
  it('overrides per block and merges nested scopes', () => {
    render(
      <CoreOptionsScope value={{ showSku: false }}>
        <CoreOptionsScope value={{ headerCartIcon: 'none' }}><Show /></CoreOptionsScope>
      </CoreOptionsScope>,
    );
    expect(screen.getByText('sku:false title:true cart:none')).toBeInTheDocument();
  });
  it('gates the CatalogHero slot', () => {
    const { container } = render(
      <CoreOptionsScope value={{ showCatalogIntro: false }}>
        <Slot name="CatalogHero" surface="grid" tagline="" welcomeMessage="Hello" productCount={1} categoryCount={1} />
      </CoreOptionsScope>,
    );
    expect(container.innerHTML).toBe('');
  });
});
