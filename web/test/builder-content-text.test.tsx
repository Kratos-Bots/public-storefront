import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { Suspense } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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

afterEach(cleanup);

describe('text blocks', () => {
  it('Heading renders its level, eyebrow and alignment', () => {
    const { container } = mount([c('Heading', { text: 'Small batches', eyebrow: 'Since 2019', level: 'h3', align: 'center' })]);
    expect(screen.getByRole('heading', { level: 3, name: 'Small batches' })).toBeInTheDocument();
    expect(screen.getByText('Since 2019')).toBeInTheDocument();
    expect(container.querySelector('[data-sf-block="Heading"]')!.className).toMatch(/center/);
  });
  it('RichText sanitises its HTML', () => {
    const { container } = mount([c('RichText', { bodyHtml: '<p>Packed <strong>to order</strong><script>x()</script></p><a href="javascript:x">bad</a>', width: 'narrow' })]);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('strong')!.textContent).toBe('to order');
    expect(container.querySelector('a')!.hasAttribute('href')).toBe(false);
    expect(container.querySelector('[data-sf-prose]')).not.toBeNull();
  });
  it('RichText accepts a React node inside the editor', () => {
    mount([c('RichText', { bodyHtml: <em>live edit</em>, width: 'full' })], true);
    expect(screen.getByText('live edit')).toBeInTheDocument();
  });
  it('Spacer and Divider use the spacing scale', () => {
    const { container } = mount([c('Spacer', { size: 'lg' }), c('Divider', { spacing: 'sm', toneToken: 'line-strong' })]);
    expect((container.querySelector('[data-sf-block="Spacer"]') as HTMLElement).style.height).toBe('2.5rem');
    const hr = container.querySelector('hr') as HTMLElement;
    expect(hr.style.getPropertyValue('--rule-space')).toBe('1rem');
    expect(hr.style.getPropertyValue('--rule-color')).toBe('var(--sf-line-strong)');
  });
});
