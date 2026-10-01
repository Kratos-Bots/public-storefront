import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { BOX, styleSupport, TEXT, VIS, type StyleSupport } from '@/builder/style/model.ts';
import { contrastRatio, countSet, formatRatio, optionsFor, parseCssColor, setStyleKey } from '@/builder/editor/custom-fields/style-model.ts';
import { styleField } from '@/builder/editor/custom-fields/style.tsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const make = (name: string, style: StyleSupport | false) => defineBlock<{ id: string }>({
  name, label: name, category: 'content', layouts: 'all', routeBound: false, slots: [], style,
  schema: z.object({}), defaultProps: {}, render: () => null,
});
const heading = make('Heading', styleSupport('root', [...BOX, 'fg', 'textSize', ...VIS]));
const flow = make('CheckoutFlow', styleSupport('wrap', [...BOX]));

function show(def: ReturnType<typeof make>, value: unknown, onChange = vi.fn()) {
  const field = styleField(def);
  render(<>{field.render({ field, name: 'blockStyle', id: 'f', value, onChange, readOnly: false } as never)}</>);
  const summary = document.querySelector('[data-sf-style-panel] > summary') as HTMLElement;
  if (!(summary.parentElement as HTMLDetailsElement).open) fireEvent.click(summary);
  return onChange;
}

describe('style-model', () => {
  const s = styleSupport('root', [...BOX, ...TEXT, ...VIS]);
  it('setStyleKey writes canonical order, drops disallowed, returns undefined when empty', () => {
    expect(Object.keys(setStyleKey({ hide: 'mobile' }, 'bg', 'surface', s)!)).toEqual(['bg', 'hide']);
    expect(setStyleKey({ bg: 'surface' }, 'bg', undefined, s)).toBeUndefined();
    expect(setStyleKey({ bg: 'surface' }, 'align', 'center', styleSupport('root', ['bg']))).toEqual({ bg: 'surface' });
  });
  it('clearing the border width clears its colour and style too', () => {
    expect(setStyleKey({ bg: 'surface', border: 'thin', borderColor: 'line', borderStyle: 'dashed' }, 'border', undefined, s)).toEqual({ bg: 'surface' });
    expect(setStyleKey({ border: 'thin', borderColor: 'line' }, 'border', 'thick', s)).toEqual({ border: 'thick', borderColor: 'line' });
  });
  it('countSet counts allowed keys only', () => {
    expect(countSet({ bg: 'surface', align: 'end' }, styleSupport('root', ['bg']))).toBe(1);
    expect(countSet(undefined, s)).toBe(0);
  });
  it('spacing chips say the size and the phone cap', () => {
    const lg = optionsFor('padTop').find((o) => o.value === 'lg')!;
    expect(lg).toMatchObject({ label: 'L', title: 'L — 40 px, 24 px on phones' });
    expect(optionsFor('padX').find((o) => o.value === 'xl')!.title).toBe('XL — 64 px, 16 px on phones');
    expect(optionsFor('padTop')[0]).toEqual({ value: undefined, label: 'Default', title: 'Default — the template decides' });
  });
  it('visibility options are labelled honestly', () => {
    expect(optionsFor('hide').map((o) => o.label)).toEqual(['Shown everywhere', 'Hide below 992 px (phones and tablets)', 'Hide from 992 px (desktop)']);
  });
  // Review Focus 3: unparseable colours give no ratio.
  it.each([
    ['rgb(29, 36, 51)', [29, 36, 51]], ['rgb(29 36 51)', [29, 36, 51]], ['rgba(29, 36, 51, 1)', [29, 36, 51]],
    ['color(srgb 1 0.5 0)', [255, 127.5, 0]],
  ])('parses %s', (s, rgb) => expect(parseCssColor(s)).toEqual(rgb));
  it.each(['', 'oklch(0.7 0.1 200)', 'color-mix(in srgb, red 50%, blue)', 'rgba(0, 0, 0, 0.5)', 'rgb(0 0 0 / 40%)', 'transparent', 'var(--sf-bg)'])('refuses %j', (s) => {
    expect(parseCssColor(s)).toBeNull();
  });
  it('WCAG contrast maths', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5);
    expect(formatRatio(4.4999)).toBe('4.4 : 1');
    expect(formatRatio(3.14)).toBe('3.1 : 1');
  });
});

describe('styleField', () => {
  it('throws for a block that is not stylable', () => {
    expect(() => styleField(make('PageOutlet', false))).toThrow();
  });
  it('is collapsed by default and says how many settings are set', () => {
    // Open state is remembered per block type for the session: use a type no other test opens.
    const field = styleField(make('Fresh', styleSupport('root', [...BOX])));
    render(<>{field.render({ field, name: 'blockStyle', id: 'f', value: { bg: 'surface', padTop: 'lg' }, onChange: vi.fn(), readOnly: false } as never)}</>);
    const details = document.querySelector('[data-sf-style-panel]') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')!.textContent).toBe('Style · 2 set');
  });
  it('shows only the rows the block accepts', () => {
    show(heading, undefined);
    expect(screen.getByRole('radiogroup', { name: 'Background' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Visibility' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Alignment' })).toBeNull();
    cleanup();
    show(flow, undefined);
    expect(screen.queryByRole('radiogroup', { name: 'Visibility' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Text size' })).toBeNull();
  });
  it('every row starts at Default; picking a swatch changes one key', () => {
    const onChange = show(heading, { padTop: 'lg' });
    const bg = screen.getByRole('radiogroup', { name: 'Background' });
    expect(within(bg).getByRole('radio', { name: 'Default' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(bg).getByRole('radio', { name: 'Surface 2' }));
    expect(onChange).toHaveBeenLastCalledWith({ bg: 'surface-2', padTop: 'lg' });
  });
  it('a row reset clears one key; Reset style clears all in one change', () => {
    const onChange = show(heading, { bg: 'surface', padTop: 'lg' });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Padding top' }));
    expect(onChange).toHaveBeenLastCalledWith({ bg: 'surface' });
    onChange.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Reset style' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
  it('a reset hands focus to the row Default radio; Reset style hands it to the summary', () => {
    show(heading, { bg: 'surface', padTop: 'lg' });
    const reset = screen.getByRole('button', { name: 'Reset Padding top' });
    reset.focus();
    fireEvent.click(reset);
    const row = screen.getByRole('radiogroup', { name: 'Padding top' });
    expect(document.activeElement).toBe(within(row).getByRole('radio', { name: 'Default' }));
    const all = screen.getByRole('button', { name: 'Reset style' });
    all.focus();
    fireEvent.click(all);
    expect(document.activeElement).toBe(document.querySelector('[data-sf-style-panel] > summary'));
  });
  it('border colour and style wait for a width', () => {
    show(heading, undefined);
    for (const r of within(screen.getByRole('radiogroup', { name: 'Border colour' })).getAllByRole('radio')) expect(r).toBeDisabled();
    cleanup();
    show(heading, { border: 'thin' });
    expect(within(screen.getByRole('radiogroup', { name: 'Border colour' })).getAllByRole('radio')[1]).toBeEnabled();
  });
  it('a waiting border row points at the note that says why', () => {
    show(heading, undefined);
    for (const name of ['Border colour', 'Border style']) {
      const group = screen.getByRole('radiogroup', { name });
      expect(group).toHaveAccessibleDescription('Pick a border width first.');
    }
    cleanup();
    show(heading, { border: 'thin' });
    expect(screen.getByRole('radiogroup', { name: 'Border colour' })).not.toHaveAttribute('aria-describedby');
  });
  it('puts no id on the panel (Puck mounts fields twice; ids must stay unique)', () => {
    show(heading, undefined);
    expect(document.querySelector('[data-sf-style-panel]')).not.toHaveAttribute('id');
  });
  it('warns on the Header Visibility row that its pinned notices hide with it', () => {
    const header = make('Header', styleSupport('pass', ['bg', 'shadow', ...VIS]));
    show(header, undefined);
    const group = screen.getByRole('radiogroup', { name: 'Visibility' });
    expect(group).toHaveAccessibleDescription(/pinned notices.*Telegram web app.*cart and back buttons/);
    cleanup();
    show(heading, undefined);
    expect(screen.getByRole('radiogroup', { name: 'Visibility' })).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText(/pinned notices/)).toBeNull();
  });
  it('arrow keys move through a chip row and select', () => {
    const onChange = show(heading, { padTop: 'sm' });
    const row = screen.getByRole('radiogroup', { name: 'Padding top' });
    fireEvent.keyDown(row, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith({ padTop: 'md' });
  });
  it('warns about low contrast from the resolved colours, and says nothing when a colour cannot be read', () => {
    // jsdom resolves no var(): the probe names its token in data-sf-probe, and the stub answers per token.
    const COLOURS: Record<string, string> = { 'surface-2': 'rgb(40, 40, 40)', muted: 'rgb(70, 70, 70)', primary: 'oklch(0.5 0 0)' };
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => ({
      color: COLOURS[(el as HTMLElement).dataset.sfProbe ?? ''] ?? '',
    }) as unknown as CSSStyleDeclaration);
    show(heading, { bg: 'surface-2', fg: 'muted' });
    expect(screen.getByText(/^Low contrast \(\d\.\d : 1\)$/)).toBeInTheDocument();
    cleanup();
    show(heading, { bg: 'primary', fg: 'muted' });
    expect(screen.queryByText(/Low contrast/)).toBeNull();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });
  it('keeps the contrast live region mounted (empty) so a later warning is announced', () => {
    show(heading, undefined);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
