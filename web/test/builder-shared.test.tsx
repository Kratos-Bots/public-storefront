import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { RichHtml } from '@/builder/blocks/_shared/RichHtml.tsx';
import { SmartLink } from '@/builder/blocks/_shared/SmartLink.tsx';

afterEach(cleanup);

describe('RichHtml', () => {
  it('sanitises strings and marks the prose container', () => {
    const { container } = render(<RichHtml value={'<p>ok</p><script>x()</script>'} block="RichText" />);
    expect(container.innerHTML).toBe('<div data-sf-prose="" data-sf-block="RichText"><p>ok</p></div>');
  });
  it('renders a React node as-is (inside the editor)', () => {
    render(<RichHtml value={<em>node</em>} />);
    expect(screen.getByText('node').tagName).toBe('EM');
  });
});

describe('SmartLink', () => {
  it('routes site paths, guards external links', () => {
    render(<MemoryRouter initialEntries={['/pages/a']}><SmartLink href="/pages/a">A</SmartLink><SmartLink href="https://shop.example">B</SmartLink><SmartLink href="tel:+440">C</SmartLink></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'A' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'B' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'C' })).not.toHaveAttribute('rel');
  });
});
