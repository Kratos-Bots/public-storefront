import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { z } from 'zod';
import type { ComponentData, PuckDoc } from '@/builder/types.ts';

const flaky = vi.hoisted(() => ({ broken: true }));

vi.mock('@/builder/registry.ts', async () => {
  const { defineBlock, slot } = await import('@/builder/define.ts');
  const { useBuilderMode } = await import('@/builder/mode.ts');
  function Thrower(): never { throw new Error('boom'); }
  function Flaky() { if (flaky.broken) throw new Error('flaky'); return <p>recovered</p>; }
  function Mode() { return <i>{useBuilderMode().editing ? 'editing' : 'live'}</i>; }
  const base = { category: 'content' as const, layouts: 'all' as const, routeBound: false, style: false as const };
  return {
    BLOCKS: {
      Text: defineBlock<{ id: string; text: string }>({ ...base, name: 'Text', label: 'Text', slots: [], schema: z.object({ text: z.string() }), defaultProps: { text: '' }, render: ({ text }) => <p>{text}</p> }),
      Bare: defineBlock<{ id: string; items: ComponentData[] }>({ ...base, name: 'Bare', label: 'Bare', slots: ['items'], schema: z.object({ items: slot() }), defaultProps: { items: [] }, render: ({ items }) => items() }),
      Box: defineBlock<{ id: string; items: ComponentData[] }>({ ...base, name: 'Box', label: 'Box', slots: ['items'], schema: z.object({ items: slot() }), defaultProps: { items: [] }, render: ({ items }) => items({ className: 'box', as: 'section' }) }),
      Boom: defineBlock<{ id: string }>({ ...base, name: 'Boom', label: 'Boom', slots: [], schema: z.object({}), defaultProps: {}, render: () => <Thrower /> }),
      BoundBoom: defineBlock<{ id: string }>({ ...base, routeBound: true, name: 'BoundBoom', label: 'Bound', slots: [], schema: z.object({}), defaultProps: {}, render: () => <Thrower /> }),
      Flaky: defineBlock<{ id: string }>({ ...base, name: 'Flaky', label: 'Flaky', slots: [], schema: z.object({}), defaultProps: {}, render: () => <Flaky /> }),
      Mode: defineBlock<{ id: string }>({ ...base, name: 'Mode', label: 'Mode', slots: [], schema: z.object({}), defaultProps: {}, render: () => <Mode /> }),
      RootBox: defineBlock<{ id: string; text: string }>({ ...base, name: 'RootBox', label: 'Root box', slots: [], style: { target: 'root', keys: ['bg', 'hide'] }, schema: z.object({ text: z.string() }), defaultProps: { text: '' }, render: ({ text, puck }) => <p data-sf-block="RootBox" {...puck.style}>{text}</p> }),
      WrapBox: defineBlock<{ id: string; text: string }>({ ...base, name: 'WrapBox', label: 'Wrap box', slots: [], style: { target: 'wrap', keys: ['bg', 'padTop'] }, schema: z.object({ text: z.string() }), defaultProps: { text: '' }, render: ({ text }) => (text ? <p>{text}</p> : null) }),
    },
  };
});

import { DocBoundary, RenderDoc } from '@/builder/render.tsx';
import { BuilderModeProvider } from '@/builder/mode.ts';

const c = (type: string, props: Record<string, unknown> = {}, id = type): ComponentData => ({ type, props: { id, ...props } });
const d = (content: ComponentData[]): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content });

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('RenderDoc', () => {
  it('renders slots with no wrapper element unless the block asks for one', () => {
    const { container } = render(<RenderDoc doc={d([c('Bare', { items: [c('Text', { text: 'a' }, 'a'), c('Text', { text: 'b' }, 'b')] })])} docKey="page:x" layout="storefront" />);
    expect(container.innerHTML).toBe('<p>a</p><p>b</p>');
    cleanup();
    const boxed = render(<RenderDoc doc={d([c('Box', { items: [c('Text', { text: 'a' }, 'a')] })])} docKey="page:x" layout="storefront" />);
    expect(boxed.container.innerHTML).toBe('<section class="box"><p>a</p></section>');
  });
  it('a crashing block renders nothing, logs once, and its siblings survive', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<RenderDoc doc={d([c('Text', { text: 'before' }, 't1'), c('Boom'), c('Text', { text: 'after' }, 't2')])} docKey="page:x" layout="storefront" />);
    expect(screen.getByText('before')).toBeInTheDocument();
    expect(screen.getByText('after')).toBeInTheDocument();
    expect(error.mock.calls.filter((call) => String(call[0]).includes('[builder] block Boom')).length).toBe(1);
  });
  it('a crashing route-bound block takes the page to its fallback', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <DocBoundary docKey="checkout" fallback={<p>default page</p>}>
        <RenderDoc doc={d([c('Text', { text: 'owner copy' }, 't'), c('BoundBoom')])} docKey="checkout" layout="storefront" />
      </DocBoundary>,
    );
    expect(screen.getByText('default page')).toBeInTheDocument();
    expect(screen.queryByText('owner copy')).toBeNull();
  });
  it('never resolves an inherited Object key as a block type', () => {
    const { container } = render(<RenderDoc doc={d([c('constructor'), c('toString'), c('Text', { text: 'ok' }, 't')])} docKey="page:x" layout="storefront" />);
    expect(container.innerHTML).toBe('<p>ok</p>');
  });
  it('a block that failed on one route gets a fresh attempt on the next', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    flaky.broken = true;
    const { rerender } = render(<RenderDoc doc={d([c('Flaky')])} docKey="page:a" layout="storefront" />);
    expect(screen.queryByText('recovered')).toBeNull();
    flaky.broken = false;
    rerender(<RenderDoc doc={d([c('Flaky')])} docKey="page:a" layout="storefront" />);
    expect(screen.queryByText('recovered')).toBeNull();
    rerender(<RenderDoc doc={d([c('Flaky')])} docKey="page:b" layout="storefront" />);
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });
  it('passes the builder mode through', () => {
    render(<BuilderModeProvider value={{ editing: true, previewAs: null }}><RenderDoc doc={d([c('Mode')])} docKey="page:x" layout="menu" /></BuilderModeProvider>);
    expect(screen.getByText('editing')).toBeInTheDocument();
  });
});

describe('RenderDoc · block styles', () => {
  const html = (content: ComponentData[], editing = false) => {
    const out = render(<BuilderModeProvider value={{ editing, previewAs: null }}><RenderDoc doc={d(content)} docKey="page:x" layout="storefront" /></BuilderModeProvider>).container.innerHTML;
    cleanup();
    return out;
  };
  it('absent, {} and disallowed-only styles render byte-identical DOM', () => {
    const plain = html([c('RootBox', { text: 'a' })]);
    expect(plain).toBe('<p data-sf-block="RootBox">a</p>');
    expect(html([c('RootBox', { text: 'a', blockStyle: {} })])).toBe(plain);
    expect(html([c('RootBox', { text: 'a', blockStyle: { padTop: 'lg' } })])).toBe(plain);
  });
  it('root: attributes on the block root', () => {
    expect(html([c('RootBox', { text: 'a', blockStyle: { bg: 'surface', hide: 'mobile' } })]))
      .toBe('<p data-sf-block="RootBox" data-sf-style="RootBox" data-sfs-bg="surface" data-sfs-hide="mobile">a</p>');
  });
  it('hide is a ghost on the editor canvas', () => {
    expect(html([c('RootBox', { text: 'a', blockStyle: { hide: 'mobile' } })], true)).toContain('data-sfs-ghost="mobile"');
  });
  it('wrap: one added div', () => {
    expect(html([c('WrapBox', { text: 'a', blockStyle: { bg: 'surface', padTop: 'lg' } })]))
      .toBe('<div data-sf-style="WrapBox" data-sfs-bg="surface" data-sfs-pt="lg"><p>a</p></div>');
  });
});
