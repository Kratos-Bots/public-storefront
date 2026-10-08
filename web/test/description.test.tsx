// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Description, descriptionHtml } from '@/features/catalog/Description.tsx';

const SAMPLE = `This pen holds several doses.

## How to use

1. Find your dose in the table below.
2. Twist the dial until the window shows that number of units.
3. Inject as directed.

## Conversion reference

1 mg = 8.57 units

| Dose (mg) | Dial setting (units) |
|-----------|----------------------|
| 1         | 9                    |
| 2         | 17                   |
| 3         | 26                   |
`;

function html(md: string | null | undefined): string {
  const { container } = render(<Description markdown={md} />);
  return container.innerHTML;
}

function root(md: string): HTMLElement {
  const { container } = render(<Description markdown={md} />);
  return container.firstElementChild as HTMLElement;
}

describe('Description', () => {
  it('keeps an indented line as prose, not a code block', () => {
    const html = descriptionHtml('Store cold.\n\n    Keep away from light.');
    expect(html).not.toContain('<pre');
    expect(html).toContain('Keep away from light.');
  });

  it('renders headings, an ordered list and a table from the sample', () => {
    const el = root(SAMPLE);
    expect(el.hasAttribute('data-sf-prose')).toBe(true);
    expect(Array.from(el.querySelectorAll('h2')).map((h) => h.textContent)).toEqual(['How to use', 'Conversion reference']);
    expect(el.querySelectorAll('ol > li')).toHaveLength(3);
    expect(Array.from(el.querySelectorAll('thead th')).map((h) => h.textContent)).toEqual(['Dose (mg)', 'Dial setting (units)']);
    // The table's scroll wrapper: a bare div, the only kind the sanitised output can contain.
    const scroller = el.querySelector('table')?.parentElement;
    expect(scroller?.tagName).toBe('DIV');
    expect(scroller?.attributes.length).toBe(0);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(el.querySelector('tbody tr:last-child td:last-child')?.textContent).toBe('26');
  });

  it('keeps single newlines as line breaks', () => {
    const el = root('Line one\nLine two\nLine three');
    expect(el.querySelectorAll('p')).toHaveLength(1);
    expect(el.querySelectorAll('br')).toHaveLength(2);
  });

  it('turns blank-line-separated plain text into paragraphs', () => {
    const el = root('First paragraph.\n\nSecond paragraph.');
    expect(Array.from(el.querySelectorAll('p')).map((p) => p.textContent)).toEqual(['First paragraph.', 'Second paragraph.']);
  });

  it('neutralises scripts, handlers, iframes and unsafe links', () => {
    const out = html('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n<iframe src="https://evil.example"></iframe>\n\n[a](javascript:alert(1)) [b](//evil.example) ![i](https://x.example/i.png)');
    expect(out).not.toMatch(/<script|<img|<iframe|onerror|javascript:|\/\/evil\.example"/i);
    const { container } = render(<Description markdown="[a](javascript:alert(1)) [b](//evil.example)" />);
    for (const a of Array.from(container.querySelectorAll('a'))) expect(a.hasAttribute('href')).toBe(false);
  });

  it('keeps a normal https link and opens it safely in a new tab', () => {
    const a = root('[Guide](https://example.com/guide)').querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://example.com/guide');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('keeps mailto and root-relative links in the same tab', () => {
    const el = root('[m](mailto:a@example.com) [r](/p/1)');
    for (const a of Array.from(el.querySelectorAll('a'))) expect(a.hasAttribute('target')).toBe(false);
  });

  it('drops attributes other than href, and align on anything but a table cell', () => {
    const el = root('<p style="color:red" class="x" id="y" align="center">hi</p>\n\n<td style="color:red" class="x" id="y">c</td>');
    expect(el.querySelector('[align], [style], [class], [id]')).toBeNull();
    const table = root('| a |\n|:-:|\n| b |');
    expect(table.querySelector('[style], [class], [id]')).toBeNull();
    expect(Array.from(table.querySelectorAll('th, td')).every((c) => c.getAttributeNames().join() === 'align')).toBe(true);
  });

  it('keeps left, center and right column alignment on header and body cells', () => {
    const el = root('| a | b | c | d |\n|:--|:-:|--:|---|\n| 1 | 2 | 3 | 4 |');
    const aligns = (sel: string) => Array.from(el.querySelectorAll(sel)).map((c) => c.getAttribute('align'));
    expect(aligns('thead th')).toEqual(['left', 'center', 'right', null]);
    expect(aligns('tbody td')).toEqual(['left', 'center', 'right', null]);
  });

  it('centres all four columns of a dose table', () => {
    const el = root(
      '| Dose (mg) | Dial setting (units) | Dose (mg) | Dial setting (units) |\n|:---------:|:--------------------:|:---------:|:--------------------:|\n| 1 | 9 | 2 | 17 |',
    );
    const cells = Array.from(el.querySelectorAll('th, td'));
    expect(cells).toHaveLength(8);
    expect(cells.every((c) => c.getAttribute('align') === 'center')).toBe(true);
  });

  it('drops align values other than left, center and right, even on a cell', () => {
    const el = root('<table><tr><td align="justify">a</td><td align="center; color:red">b</td><td align="javascript:x">c</td><td align="CENTER">d</td></tr></table>');
    expect(Array.from(el.querySelectorAll('td')).map((c) => c.getAttribute('align'))).toEqual([null, null, null, 'center']);
  });

  it('drops align on a paragraph or heading written as raw HTML', () => {
    const el = root('<p align="center">p</p>\n\n<h2 align="right">h</h2>\n\n<div align="left">d</div>');
    expect(el.querySelector('[align]')).toBeNull();
  });

  it('renders nothing for empty, blank or missing text', () => {
    expect(html('')).toBe('');
    expect(html('  \n \t')).toBe('');
    expect(html(null)).toBe('');
    expect(html(undefined)).toBe('');
  });

  it('spreads style attributes on the root', () => {
    const { container } = render(<Description markdown="hi" styleAttrs={{ 'data-sf-block': 'abc' }} />);
    expect(container.firstElementChild?.getAttribute('data-sf-block')).toBe('abc');
  });
});
