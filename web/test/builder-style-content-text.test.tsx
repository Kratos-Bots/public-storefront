/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { Suspense } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { RenderDoc } from '@/builder/render.tsx';
import { BuilderModeProvider } from '@/builder/mode.ts';
import type { ComponentData } from '@/builder/types.ts';

const c = (type: string, props: Record<string, unknown> = {}, id = type): ComponentData => ({ type, props: { id, ...props } });
function html(content: ComponentData[]) {
  const out = render(
    <MantineProvider env="test"><MemoryRouter><BuilderModeProvider value={{ editing: false, previewAs: null }}>
      <Suspense fallback={null}><RenderDoc doc={{ root: { props: { title: '', description: '', chrome: 'shell' } }, content }} docKey="page:test" layout="storefront" /></Suspense>
    </BuilderModeProvider></MemoryRouter></MantineProvider>,
  ).container;
  const snapshot = { html: out.innerHTML.replace(/<style[\s\S]*?<\/style>/g, '') /* Mantine's injected sheets are not block DOM */, markers: [...out.querySelectorAll('[data-sf-style]')] };
  cleanup();
  return snapshot;
}
afterEach(cleanup);

const FIXTURES: Record<string, Record<string, unknown>> = {
  Heading: { text: 'Small batches', eyebrow: 'New', level: 'h2', align: 'start' },
  RichText: { bodyHtml: '<p>Packed to order.</p>', width: 'narrow' },
  Testimonial: { quote: 'Arrived next morning.', author: 'Sam', detail: 'Leeds' },
  FAQ: { title: 'Questions', items: [{ question: 'How fast?', answerHtml: '<p>Same day.</p>' }] },
  NavLinks: { items: [{ label: 'Shop', href: '/' }], ariaLabel: 'Site', direction: 'row' },
  Columns: { columns: '2', stackBelow: 'md', gap: 'md', col1: [c('Heading', { text: 'Inner' }, 'in1')], col2: [], col3: [], col4: [] },
};
/** A key each block does NOT accept (Columns accepts all 16, so it has none). */
const DISALLOWED: Record<string, Record<string, string> | null> = {
  Heading: { align: 'center' }, RichText: { maxWidth: 'text' }, Testimonial: null, FAQ: null, NavLinks: null, Columns: null,
};

describe.each(Object.keys(FIXTURES))('%s · block styles', (name) => {
  it('absent, {} and disallowed-only styles leave the DOM byte-identical', () => {
    const plain = html([c(name, FIXTURES[name])]).html;
    expect(plain).not.toContain('data-sf-style');
    expect(html([c(name, { ...FIXTURES[name], blockStyle: {} })]).html).toBe(plain);
    const dis = DISALLOWED[name];
    if (dis) expect(html([c(name, { ...FIXTURES[name], blockStyle: dis })]).html).toBe(plain);
  });
  it('a style lands once, on the element carrying data-sf-block', () => {
    const { markers } = html([c(name, { ...FIXTURES[name], blockStyle: { bg: 'surface', textSize: 'lg', hide: 'mobile' } })]);
    expect(markers).toHaveLength(1);
    expect(markers[0]!.getAttribute('data-sf-block')).toBe(name);
    expect(markers[0]!.getAttribute('data-sf-style')).toBe(name);
    expect(markers[0]!.getAttribute('data-sfs-bg')).toBe('surface');
    expect(markers[0]!.getAttribute('data-sfs-text')).toBe('lg');
    expect(markers[0]!.getAttribute('data-sfs-hide')).toBe('mobile');
  });
});

// Review Focus 2: a styled block that renders nothing leaves nothing behind.
it('a blank Heading with a style renders nothing at all', () => {
  expect(html([c('Heading', { text: '   ', blockStyle: { bg: 'surface', padTop: 'xl' } })]).html).toBe('');
});

describe('text blocks read the style variables (spec §4, §8)', () => {
  const css = (n: string) => readFileSync(resolve(__dirname, `../src/builder/blocks/${n}.module.css`), 'utf8');
  it.each(['Heading', 'RichText', 'Testimonial', 'FAQ', 'NavLinks'])('%s colour falls back to its token and size scales', (n) => {
    expect(css(n)).toMatch(/color:\s*var\(--sf-block-fg, var\(--sf-[a-z-]+\)\)/);
    expect(css(n)).toMatch(/font-size:\s*calc\([^;]*\* var\(--sf-text-scale, 1\)\)/);
  });
  it('Heading keeps its clamp inside the scale', () => {
    expect(css('Heading')).toContain('font-size: calc(clamp(1.5rem, 1.2rem + 1.4vw, 2.25rem) * var(--sf-text-scale, 1))');
  });
  it('tap targets keep min-height 44px independent of the scale', () => {
    expect(css('FAQ')).toMatch(/\.q \{[^}]*min-height: 44px/);
    expect(css('NavLinks')).toMatch(/\.link \{[^}]*min-height: 44px/);
  });
  it('NavLinks and Testimonial honour align in their flex rows', () => {
    expect(css('NavLinks')).toContain(".nav[data-sfs-align='center'] .list");
    // A row wider than its column must not push its first link off the start edge.
    expect(css('NavLinks')).toMatch(/\.nav\[data-sfs-align='center'\] \.list \{ justify-content: safe center; \}/);
    expect(css('NavLinks')).toMatch(/\.nav\[data-sfs-align='end'\] \.list \{ justify-content: safe flex-end; \}/);
    expect(css('Testimonial')).toContain(".card[data-sfs-align='center'] .by");
  });
});
