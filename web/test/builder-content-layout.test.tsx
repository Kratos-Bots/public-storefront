import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import type { ComponentData } from '@/builder/types.ts';
import { RenderDoc } from '@/builder/render.tsx';

function mount(content: ComponentData[]) {
  return render(
    <Suspense fallback={null}>
      <RenderDoc doc={{ root: { props: { title: '', description: '', chrome: 'shell' } }, content }} docKey="page:x" layout="storefront" />
    </Suspense>,
  );
}
const c = (type: string, props: Record<string, unknown> = {}, id = type): ComponentData => ({ type, props: { id, ...props } });

afterEach(cleanup);
const text = (t: string, id: string) => c('RichText', { bodyHtml: `<p>${t}</p>`, width: 'full' }, id);

describe('Columns', () => {
  it('renders one wrapper per visible column and drops the rest', () => {
    const { container } = mount([c('Columns', { columns: '2', stackBelow: 'md', gap: 'md', col1: [text('left', 'l')], col2: [text('right', 'r')], col3: [text('hidden', 'h')], col4: [] })]);
    const grid = container.querySelector('[data-sf-block="Columns"]') as HTMLElement;
    expect(grid.children).toHaveLength(2);
    expect(grid.style.getPropertyValue('--cols')).toBe('2');
    expect(screen.queryByText('hidden')).toBeNull();
    expect(grid.className).toMatch(/stackMd/);
  });
});

describe('Section', () => {
  it('paints palette tokens only and wraps its content once', () => {
    const { container } = mount([c('Section', { padding: 'lg', backgroundToken: 'surface', textToken: 'text', width: 'rail', content: [text('inside', 'i')] })]);
    const section = container.querySelector('[data-sf-block="Section"]') as HTMLElement;
    expect(section.tagName).toBe('SECTION');
    expect(section.style.getPropertyValue('--section-bg')).toBe('var(--sf-surface)');
    expect(section.style.getPropertyValue('--section-fg')).toBe('var(--sf-text)');
    expect(section.style.getPropertyValue('--section-pad')).toBe('2.5rem');
    expect(section).toHaveTextContent('inside');
    expect(section.querySelectorAll(':scope > div > p')).toHaveLength(1);
  });
  it('"none" leaves the colours to the page', () => {
    const { container } = mount([c('Section', { padding: 'none', backgroundToken: 'none', textToken: 'none', width: 'full', content: [] })]);
    const section = container.querySelector('[data-sf-block="Section"]') as HTMLElement;
    expect(section.style.getPropertyValue('--section-bg')).toBe('transparent');
    expect(section.className).toMatch(/full/);
  });
});
