import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Provenance } from '@/features/catalog/Provenance.tsx';

afterEach(cleanup);

describe('Provenance markdown-lite', () => {
  it('renders blank-line separated blocks as paragraphs', () => {
    const { container } = render(
      <Provenance markdown={'Made in the UK.\n\nTested every batch.'} />,
    );
    const paras = container.querySelectorAll('p');
    expect(paras).toHaveLength(2);
    expect(paras[0]).toHaveTextContent('Made in the UK.');
    expect(paras[1]).toHaveTextContent('Tested every batch.');
  });

  it('joins soft-wrapped lines into one paragraph', () => {
    const { container } = render(<Provenance markdown={'Synthesised in\nAthens.'} />);
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.querySelector('p')).toHaveTextContent('Synthesised in Athens.');
  });

  it('renders **bold** runs as strong', () => {
    render(<Provenance markdown="Purity **99.2%** by HPLC." />);
    const strong = screen.getByText('99.2%');
    expect(strong.tagName).toBe('STRONG');
    expect(strong.parentElement).toHaveTextContent('Purity 99.2% by HPLC.');
  });

  it('renders a dash block as a list', () => {
    render(<Provenance markdown={'- Purity **99.2%**\n- COA on file\n- Cold chain'} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Purity 99.2%');
    expect(screen.getAllByRole('list')).toHaveLength(1);
  });

  it('renders nothing for blank input', () => {
    const { container } = render(<Provenance markdown={'   \n  '} />);
    expect(container.firstChild).toBeNull();
  });
});
