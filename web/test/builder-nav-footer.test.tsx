import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { ComponentData } from '@/builder/types.ts';

vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({ brand: { name: 'Northbound Supply', tagline: 'Pantry staples', links: { whatsapp: null, telegram: null } }, supportLinks: [], welcomeMessage: 'Welcome in', features: { layout: 'storefront' } }) as unknown as StorefrontSettings }));
vi.mock('@/features/catalog/use-catalog.ts', () => ({
  CATALOG_KEY: ['catalog'],
  useCatalog: () => ({ data: { categories: [], products: [] }, isPending: false, isError: false, refetch: () => {} }),
  useProduct: () => ({ data: undefined, isPending: false, isError: false, refetch: () => {} }),
}));

import { RenderDoc } from '@/builder/render.tsx';
import { ShellFooter } from '@/layouts/ShellFooter.tsx';

const c = (type: string, props: Record<string, unknown> = {}, id = type): ComponentData => ({ type, props: { id, ...props } });
function ui(content: ComponentData[], path = '/') {
  return (
    <MantineProvider env="test"><MemoryRouter initialEntries={[path]}>
      <RenderDoc doc={{ root: { props: { title: '', description: '', chrome: 'shell' } }, content }} docKey="shell" layout="storefront" />
    </MemoryRouter></MantineProvider>
  );
}
const mount = (content: ComponentData[], path = '/') => render(ui(content, path));
const KEY = '/media/storefront-pages/media/' + 'ab'.repeat(16) + '.jpg';

afterEach(cleanup);

describe('NavLinks', () => {
  it('renders internal links through the router, marks the current page, and keeps external links safe', () => {
    mount([c('NavLinks', { ariaLabel: 'Site', direction: 'row', items: [{ label: 'Our story', href: '/pages/our-story' }, { label: 'Trade', href: 'https://shop.example/trade' }] })], '/pages/our-story');
    expect(screen.getByRole('navigation', { name: 'Site' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Our story' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Trade' })).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('never renders an unsafe href as a live link', () => {
    mount([c('NavLinks', { items: [{ label: 'Bad', href: 'javascript:alert(1)' }] })]);
    expect(screen.queryByRole('link', { name: 'Bad' })).toBeNull();
  });
});

describe('Footer columns', () => {
  it('renders the chosen number of columns and the colophon', () => {
    const { container } = mount([c('Footer', {
      variant: 'columns', columns: '2', colophon: true,
      col1: [c('NavLinks', { ariaLabel: 'Shop', direction: 'column', items: [{ label: 'All products', href: '/' }] }, 'n1')],
      col2: [c('NavLinks', { ariaLabel: 'Help', direction: 'column', items: [{ label: 'Tracking', href: '/tracking' }] }, 'n2')],
      col3: [c('NavLinks', { ariaLabel: 'Hidden', direction: 'column', items: [{ label: 'Hidden', href: '/' }] }, 'n3')],
      col4: [],
    })]);
    const footer = container.querySelector('footer[data-sf-part="footer"]') as HTMLElement;
    expect(footer).not.toBeNull();
    expect(screen.getByRole('navigation', { name: 'Shop' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Help' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Hidden' })).toBeNull();
    expect(footer).toHaveTextContent('Northbound Supply');
  });

  it('template variant output is unchanged: identical to ShellFooter, with or without the new default props', () => {
    const direct = render(<MantineProvider env="test"><MemoryRouter><ShellFooter /></MemoryRouter></MantineProvider>).container.innerHTML;
    cleanup();
    const legacy = mount([c('Footer', { variant: 'template' })]).container.innerHTML;
    cleanup();
    const full = mount([c('Footer', { variant: 'template', columns: '3', colophon: true, col1: [], col2: [], col3: [], col4: [] })]).container.innerHTML;
    expect(legacy).toBe(direct);
    expect(full).toBe(direct);
  });
});

describe('CatalogHero custom', () => {
  it('renders owner copy and an uploaded image', () => {
    mount([c('CatalogHero', { variant: 'custom', surface: 'auto', title: 'Autumn range', bodyHtml: '<p>Fresh <strong>rye</strong>.</p>', imageSrc: KEY, imageAlt: 'Rye field', align: 'center' })]);
    expect(screen.getByRole('heading', { name: 'Autumn range' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Rye field' })).toHaveAttribute('src', KEY);
  });

  it('renders no image without alt text', () => {
    mount([c('CatalogHero', { variant: 'custom', surface: 'auto', title: 'T', bodyHtml: '', imageSrc: KEY, imageAlt: '', align: 'start' })]);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('template variant output is unchanged by the new default props', () => {
    const legacy = mount([c('CatalogHero', { variant: 'template', surface: 'grid' })]).container.innerHTML;
    cleanup();
    const full = mount([c('CatalogHero', { variant: 'template', surface: 'grid', title: '', bodyHtml: '', imageSrc: '', imageAlt: '', align: 'start' })]).container.innerHTML;
    expect(full).toBe(legacy);
    expect(legacy).toContain('Pantry staples');
    expect(legacy).not.toContain('data-sf-block="CatalogHero"');
  });
});
