import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { Suspense } from 'react';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { RenderDoc } from '@/builder/render.tsx';
import { BuilderModeProvider } from '@/builder/mode.ts';
import type { ComponentData } from '@/builder/types.ts';

const c = (type: string, props: Record<string, unknown> = {}, id = type): ComponentData => ({ type, props: { id, ...props } });
function mount(content: ComponentData[], editing = false) {
  return render(
    <MantineProvider env="test">
      <MemoryRouter>
        <BuilderModeProvider value={{ editing, previewAs: null }}>
          <Suspense fallback={null}>
            <RenderDoc doc={{ root: { props: { title: '', description: '', chrome: 'shell' } }, content }} docKey="page:test" layout="storefront" />
          </Suspense>
        </BuilderModeProvider>
      </MemoryRouter>
    </MantineProvider>,
  );
}

const KEY = '/media/storefront-pages/media/' + '0123456789abcdef'.repeat(2) + '.webp';
afterEach(cleanup);

describe('Button', () => {
  it('links internally through the router and carries the template button hook', () => {
    mount([c('Button', { label: 'Shop now', href: '/c/pantry', variant: 'filled', align: 'start' })]);
    const link = screen.getByRole('link', { name: 'Shop now' });
    expect(link).toHaveAttribute('href', '/c/pantry');
    expect(link).toHaveAttribute('data-sf-part', 'button');
    expect(link).toHaveAttribute('data-variant', 'filled');
  });
  it('opens external https links with rel noopener', () => {
    mount([c('Button', { label: 'Wholesale form', href: 'https://shop.example/trade', variant: 'default', align: 'center' })]);
    expect(screen.getByRole('link', { name: 'Wholesale form' })).toHaveAttribute('rel', 'noopener noreferrer');
  });
  it('renders nothing without a link', () => {
    const { container } = mount([c('Button', { label: 'Nowhere', href: '', variant: 'filled', align: 'start' })]);
    expect(container.querySelector('a')).toBeNull();
  });
  it('renders nothing for an unsafe link', () => {
    const { container } = mount([c('Button', { label: 'Bad', href: 'javascript:alert(1)', variant: 'filled', align: 'start' })]);
    expect(container.querySelector('a')).toBeNull();
  });
});

describe('Image', () => {
  it('renders an uploaded image with its alt text, lazily', () => {
    mount([c('Image', { src: KEY, alt: 'Oats in a jar', caption: 'Our oats', width: 'rail', aspect: '4/3' })]);
    const img = screen.getByRole('img', { name: 'Oats in a jar' });
    expect(img).toHaveAttribute('src', KEY);
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(screen.getByText('Our oats')).toBeInTheDocument();
  });
  it('without alt text shows nothing to shoppers and a hint in the editor', () => {
    const shopper = mount([c('Image', { src: KEY, alt: ' ', caption: '', width: 'rail', aspect: 'auto' })]);
    expect(shopper.container.querySelector('img')).toBeNull();
    cleanup();
    mount([c('Image', { src: '', alt: '', caption: '', width: 'rail', aspect: 'auto' })], true);
    expect(screen.getByText('Upload an image and describe it for screen readers.')).toBeInTheDocument();
  });
  it('renders nothing for a src outside the uploaded-media path', () => {
    const { container } = mount([c('Image', { src: 'https://evil.example/x.png', alt: 'x', caption: '', width: 'rail', aspect: 'auto' })]);
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('Video', () => {
  it('embeds YouTube via youtube-nocookie, lazily', () => {
    const { container } = mount([c('Video', { provider: 'youtube', videoId: 'aB3_dE-fG9h', title: 'How we pack' })]);
    const frame = container.querySelector('iframe')!;
    expect(frame.src).toBe('https://www.youtube-nocookie.com/embed/aB3_dE-fG9h');
    expect(frame.getAttribute('loading')).toBe('lazy');
    expect(frame.title).toBe('How we pack');
  });
  it('embeds Vimeo with do-not-track', () => {
    const { container } = mount([c('Video', { provider: 'vimeo', videoId: '76979871', title: 'Tour' })]);
    expect(container.querySelector('iframe')!.src).toBe('https://player.vimeo.com/video/76979871?dnt=1');
  });
  it('refuses an id that is not an id', () => {
    const { container } = mount([c('Video', { provider: 'youtube', videoId: 'x"><script>', title: 'Bad' })]);
    expect(container.querySelector('iframe')).toBeNull();
  });
});
