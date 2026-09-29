import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { Suspense } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RenderDoc } from '@/builder/render.tsx';
import { validateDoc } from '@/builder/guard.ts';
import type { ComponentData, PuckDoc } from '@/builder/types.ts';

// Final review finding 1: a field that fails validation must render EMPTY for shoppers, never the
// block's insert-time placeholder copy, and must reach the editor as a (non-drop) issue.

const c = (type: string, props: Record<string, unknown>, id = type): ComponentData => ({ type, props: { id, ...props } });
const root = { props: { title: '', description: '', chrome: 'shell' as const } };

function guardAndMount(content: ComponentData[]) {
  const { doc, issues } = validateDoc({ root, content }, 'page:test', 'storefront');
  const view = render(
    <MantineProvider env="test">
      <MemoryRouter>
        <Suspense fallback={null}>
          <RenderDoc doc={doc as PuckDoc} docKey="page:test" layout="storefront" />
        </Suspense>
      </MemoryRouter>
    </MantineProvider>,
  );
  return { ...view, issues, doc: doc! };
}

const KEY = '/media/storefront-pages/media/' + '0123456789abcdef'.repeat(2) + '.webp';
afterEach(cleanup);

describe('neutral fallbacks at render time (guarded published/draft docs)', () => {
  it('shows no placeholder copy from any block defaultProps', () => {
    const { container, issues } = guardAndMount([
      c('Testimonial', { quote: '', author: 'Sam', detail: '' }),
      c('FAQ', { title: 'Questions', items: [{ question: '', answerHtml: '<p>x</p>' }] }),
      c('NavLinks', { items: [{ label: '', href: '/' }], ariaLabel: 'Site', direction: 'row' }),
      c('Button', { label: 'x'.repeat(61), href: '/', variant: 'filled', align: 'start' }),
      c('Heading', { text: 'x'.repeat(201), eyebrow: '', level: 'h2', align: 'start' }),
      c('RichText', { bodyHtml: 42, width: 'narrow' }),
    ]);
    const text = container.textContent ?? '';
    for (const copy of ['Arrived the next morning', 'A happy customer', 'How fast do you ship?', 'Shop', 'Shop now', 'A heading', 'Tell shoppers']) {
      expect(text, copy).not.toContain(copy);
    }
    for (const block of ['Testimonial', 'FAQ', 'NavLinks', 'Button', 'Heading', 'RichText']) {
      expect(container.querySelector(`[data-sf-block="${block}"]`), block).toBeNull();
    }
    expect(issues.map((i) => i.rule)).toEqual([
      'field:Testimonial.quote', 'field:FAQ.items[0]', 'field:NavLinks.items[0]', 'field:Button.label', 'field:Heading.text', 'field:RichText.bodyHtml',
    ]);
    expect(issues.every((i) => i.blockId && !i.rule.startsWith('drop:'))).toBe(true);
  });
  it('keeps the valid items of an array field and renders only those', () => {
    const { container, issues } = guardAndMount([
      c('FAQ', { title: 'Questions', items: [{ question: 'Real question?', answerHtml: '<p>Yes.</p>' }, { question: '', answerHtml: '' }] }),
      c('NavLinks', { items: [{ label: 'Stockists', href: '/pages/stockists' }, { label: 'Bad', href: 'javascript:alert(1)' }], ariaLabel: 'Site', direction: 'row' }),
    ]);
    expect(container.querySelectorAll('details')).toHaveLength(1);
    expect(container.textContent).toContain('Real question?');
    expect(container.querySelectorAll('nav a')).toHaveLength(1);
    expect(container.textContent).not.toContain('Bad');
    expect(issues.map((i) => i.rule)).toEqual(['field:FAQ.items[1]', 'field:NavLinks.items[1]']);
  });
  it('an invalid NavLinks ariaLabel falls back to none rather than the "Site" placeholder', () => {
    const { container } = guardAndMount([c('NavLinks', { items: [{ label: 'Shop', href: '/' }], ariaLabel: '', direction: 'row' })]);
    expect(container.querySelector('nav')!.hasAttribute('aria-label')).toBe(false);
  });
});

describe('blocks render nothing for neutral empties (no guard involved)', () => {
  function mount(content: ComponentData[]) {
    return render(
      <MantineProvider env="test"><MemoryRouter><Suspense fallback={null}>
        <RenderDoc doc={{ root, content }} docKey="page:test" layout="storefront" />
      </Suspense></MemoryRouter></MantineProvider>,
    );
  }
  it.each([
    ['Testimonial', { quote: '  ', author: '', detail: '' }],
    ['FAQ', { title: 'Questions', items: [] }],
    ['NavLinks', { items: [], ariaLabel: 'Site', direction: 'row' }],
    ['Button', { label: ' ', href: '/', variant: 'filled', align: 'start' }],
    ['Heading', { text: '', eyebrow: 'Eyebrow', level: 'h2', align: 'start' }],
  ] as const)('%s', (type, props) => {
    const { container } = mount([c(type, props)]);
    expect(container.querySelector(`[data-sf-block="${type}"]`)).toBeNull();
  });
  it('CatalogHero custom re-checks imageSrc at render and treats a whitespace title as empty', () => {
    const { container } = mount([c('CatalogHero', { variant: 'custom', surface: 'auto', title: '   ', bodyHtml: '', imageSrc: 'https://evil.example/x.png', imageAlt: 'Rye', align: 'start' })]);
    expect(container.querySelector('[data-sf-block="CatalogHero"]')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    cleanup();
    const ok = mount([c('CatalogHero', { variant: 'custom', surface: 'auto', title: '   ', bodyHtml: '', imageSrc: KEY, imageAlt: 'Rye', align: 'start' })]);
    expect(ok.container.querySelector('img')!.getAttribute('src')).toBe(KEY);
    expect(ok.container.querySelector('h2')).toBeNull();
  });
  it('CatalogHero custom accepts a React element body (Puck editor canvas) with an empty title', () => {
    const body = <p data-testid="puck-rich">Editable body</p>;
    const { container, getByTestId } = mount([c('CatalogHero', { variant: 'custom', surface: 'auto', title: '', bodyHtml: body, imageSrc: '', imageAlt: '', align: 'start' })]);
    expect(getByTestId('puck-rich').textContent).toBe('Editable body');
    expect(container.querySelector('[data-sf-block="CatalogHero"]')).not.toBeNull();
  });
  it('RichText accepts a React element body', () => {
    const { getByTestId } = mount([c('RichText', { bodyHtml: <p data-testid="puck-rt">Body</p>, width: 'narrow' })]);
    expect(getByTestId('puck-rt')).toBeInTheDocument();
  });
});

describe('CSS polish (rule presence only)', () => {
  const read = (f: string) => readFileSync(resolve(__dirname, '../src/builder/blocks', f), 'utf8');
  it("FAQ declares a plain content: '+' before the alt-text form", () => {
    expect(read('FAQ.module.css')).toMatch(/content: '\+';\s*content: '\+' \/ '';/);
  });
  it('Heading eyebrow is sized in rem, not px', () => {
    expect(read('Heading.module.css')).toMatch(/\.eyebrow\s*\{[^}]*font-size:\s*[\d.]+rem/);
  });
});
