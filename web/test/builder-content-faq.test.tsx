import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { Suspense } from 'react';
import type { ComponentData } from '@/builder/types.ts';
import { RenderDoc } from '@/builder/render.tsx';

function mount(content: ComponentData[]) {
  const page = <Suspense fallback={null}><RenderDoc doc={{ root: { props: { title: '', description: '', chrome: 'shell' } }, content }} docKey="page:x" layout="storefront" /></Suspense>;
  const router = createMemoryRouter([{ path: '*', element: page }], { initialEntries: ['/pages/x'] });
  return render(<MantineProvider env="test"><RouterProvider router={router} /></MantineProvider>);
}

const c = (type: string, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id: type, ...props } });

afterEach(cleanup);

describe('FAQ', () => {
  it('renders each item as a disclosure with a sanitised answer', () => {
    const { container } = mount([c('FAQ', { title: 'Questions', items: [
      { question: 'How fast do you ship?', answerHtml: '<p>Same <em>working</em> day.</p><img src=x onerror=alert(1)>' },
      { question: 'Do you ship abroad?', answerHtml: '<p>Across Europe.</p>' },
    ] })]);
    expect(screen.getByRole('heading', { name: 'Questions' })).toBeInTheDocument();
    expect(container.querySelectorAll('details')).toHaveLength(2);
    expect(container.querySelector('img')).toBeNull();
    // Native disclosure: the question is the <summary>; opening it is the browser's job (e2e clicks it).
    const first = container.querySelector('details')!;
    expect(first.querySelector('summary')!.textContent).toBe('How fast do you ship?');
    expect(first.open).toBe(false);
    expect(first.querySelector('em')!.textContent).toBe('working');
  });
});

describe('Testimonial', () => {
  it('renders the quote as a blockquote with its attribution', () => {
    mount([c('Testimonial', { quote: 'The oats arrived the next morning.', author: 'Sam', detail: 'Leeds' })]);
    expect(screen.getByText('The oats arrived the next morning.').closest('blockquote')).not.toBeNull();
    expect(screen.getByText('Sam')).toBeInTheDocument();
    expect(screen.getByText('Leeds')).toBeInTheDocument();
  });
});
