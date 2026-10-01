import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { Suspense } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { RenderDoc } from '@/builder/render.tsx';
import { BuilderModeProvider } from '@/builder/mode.ts';
import type { ComponentData } from '@/builder/types.ts';

const IMAGE = `/media/storefront-pages/media/${'a'.repeat(32)}.png`;
const c = (type: string, props: Record<string, unknown> = {}, id = type): ComponentData => ({ type, props: { id, ...props } });
function html(content: ComponentData[], editing = false) {
  const out = render(
    <MantineProvider env="test"><MemoryRouter><BuilderModeProvider value={{ editing, previewAs: null }}>
      <Suspense fallback={null}><RenderDoc doc={{ root: { props: { title: '', description: '', chrome: 'shell' } }, content }} docKey="page:test" layout="storefront" /></Suspense>
    </BuilderModeProvider></MemoryRouter></MantineProvider>,
  ).container;
  const snapshot = { html: out.innerHTML, markers: [...out.querySelectorAll('[data-sf-style]')] };
  cleanup();
  return snapshot;
}
afterEach(cleanup);

const FIXTURES: Record<string, Record<string, unknown>> = {
  Section: { padding: 'md', backgroundToken: 'surface', textToken: 'none', width: 'rail', content: [c('Heading', { text: 'In' }, 'in')] },
  Image: { src: IMAGE, alt: 'Oats in a jar', caption: 'Trail oats', width: 'rail', aspect: '16/9' },
  Button: { label: 'Shop now', href: '/', variant: 'filled', align: 'start' },
  Divider: { spacing: 'md', toneToken: 'line' },
  Spacer: { size: 'md' },
  Video: { provider: 'youtube', videoId: 'aB3_dE-fG9h', title: 'How we pack' },
};
/** An allowed style and a disallowed-only style per block. */
const STYLES: Record<string, { ok: Record<string, string>; bad: Record<string, string> }> = {
  Section: { ok: { padX: 'sm', border: 'thin', textSize: 'lg', hide: 'mobile' }, bad: { bg: 'surface', padTop: 'lg', maxWidth: 'wide' } },
  Image: { ok: { bg: 'surface', radius: 'card', hide: 'desktop' }, bad: { maxWidth: 'narrow', fg: 'text' } },
  Button: { ok: { padTop: 'sm', shadow: 'card' }, bad: { textSize: 'xl', align: 'center' } },
  Divider: { ok: { maxWidth: 'narrow', align: 'center' }, bad: { bg: 'surface', border: 'thick' } },
  Spacer: { ok: { hide: 'mobile' }, bad: { bg: 'surface', padTop: 'xl' } },
  Video: { ok: { border: 'thin', radius: 'lg' }, bad: { fg: 'text', textSize: 'sm' } },
};

describe.each(Object.keys(FIXTURES))('%s · block styles', (name) => {
  it('absent, {} and disallowed-only styles leave the DOM byte-identical', () => {
    const plain = html([c(name, FIXTURES[name])]).html;
    expect(plain).not.toContain('data-sf-style');
    expect(html([c(name, { ...FIXTURES[name], blockStyle: {} })]).html).toBe(plain);
    expect(html([c(name, { ...FIXTURES[name], blockStyle: STYLES[name]!.bad })]).html).toBe(plain);
  });
  it('an allowed style lands once, on the element carrying data-sf-block, and keeps its inline vars', () => {
    const { markers } = html([c(name, { ...FIXTURES[name], blockStyle: STYLES[name]!.ok })]);
    expect(markers).toHaveLength(1);
    expect(markers[0]!.getAttribute('data-sf-block')).toBe(name);
    expect(markers[0]!.getAttribute('data-sf-style')).toBe(name);
  });
});

it('Section keeps its own --section-* variables and classes when styled', () => {
  const plain = html([c('Section', FIXTURES.Section)]).html;
  const styled = html([c('Section', { ...FIXTURES.Section, blockStyle: { padX: 'sm' } })]).html;
  expect(styled.replace(/ data-sf-style="Section" data-sfs-px="sm"/, '')).toBe(plain);
});

it('the Image editor hint carries the style too (its root while editing)', () => {
  const { markers } = html([c('Image', { src: '', alt: '', caption: '', width: 'rail', aspect: 'auto', blockStyle: { bg: 'surface' } })], true);
  expect(markers).toHaveLength(1);
  expect(markers[0]!.tagName).toBe('P');
});

// Review Focus 2: blocks that render nothing leave nothing behind, styled or not.
it.each([
  ['Button', { label: 'Go', href: 'javascript:alert(1)', variant: 'filled', align: 'start' }],
  ['Button', { label: '  ', href: '/', variant: 'filled', align: 'start' }],
  ['Video', { provider: 'youtube', videoId: 'nope', title: 'x' }],
])('%s with nothing to show renders nothing even when styled', (name, props) => {
  // Mantine injects its own <style> tags into the container, so compare against the unstyled render rather than ''.
  const plain = html([c(name, props)]).html;
  expect(plain).not.toContain('data-sf-block');
  const styled = html([c(name, { ...props, blockStyle: { bg: 'surface', padTop: 'xl', border: 'thick' } })]);
  expect(styled.html).toBe(plain);
  expect(styled.markers).toHaveLength(0);
});
