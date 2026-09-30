import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describeAreaGuard } from './helpers/text-area-guard.ts';
import { TextLayerProvider } from '@/text/runtime.tsx';
import { SearchField } from '@/layouts/SearchField.tsx';
import { stockLabel } from '@/lib/format.ts';
import { StockChip } from '@/features/catalog/StockChip.tsx';
import { groupProducts } from '@/features/catalog/group.ts';
import { useText } from '@/text/runtime.tsx';
import { useMemo } from 'react';
import type { Product } from '@/types/catalog.ts';
import { block as searchBlock } from '@/builder/blocks/SearchField.tsx';

describeAreaGuard('catalog + product', ['features/catalog/', 'layouts/SearchField.tsx', 'builder/blocks/SearchField.tsx', 'builder/blocks/FeaturedProducts.tsx', 'lib/format.ts'], {
  allow: [{ file: 'builder/blocks/SearchField.tsx', text: 'catalog.search.placeholder', reason: 'textProps maps the prop to a registry key; the key name is not shopper text' }],
});

afterEach(cleanup);
describe('catalog wording follows published text', () => {
  it('the header search box reads the shared placeholder and label', () => {
    render(<MantineProvider env="test"><TextLayerProvider text={{ locale: 'en', formatLocale: '', shared: { 'catalog.search.placeholder': 'Find oats…', 'catalog.search.ariaLabel': 'Search the shop' }, layout: {} }}><SearchField value="" onChange={() => {}} /></TextLayerProvider></MantineProvider>);
    expect(screen.getByRole('textbox', { name: 'Search the shop' })).toHaveAttribute('placeholder', 'Find oats…');
  });
  it('stockLabel keeps today\'s English without a provider', () => {
    expect(stockLabel('low')).toBe('Low Stock');
  });
  it('the Search field block defaults to blank and falls back to site text', () => {
    expect(searchBlock.defaultProps.placeholder).toBe('');
    expect(searchBlock.schema.safeParse({ placeholder: '' }).success).toBe(true);
    expect(searchBlock.textProps).toEqual({ placeholder: 'catalog.search.placeholder' });
  });
  it('a live text change re-renders the stock chip and the group labels', () => {
    const layers = (shared: Record<string, string>) => ({ locale: 'en' as const, formatLocale: '', shared, layout: {} });
    const loose = [{ id: 1, categoryId: null }] as unknown as Product[];
    function Groups() {
      const { t } = useText();
      const groups = useMemo(() => groupProducts(loose, [], t), [t]);
      return <p data-testid="g">{groups[0]!.label}</p>;
    }
    const view = (text: ReturnType<typeof layers>) => (
      <TextLayerProvider text={text}><StockChip status="low" /><Groups /></TextLayerProvider>
    );
    const { rerender } = render(view(layers({})));
    expect(screen.getByText('Low Stock')).toBeInTheDocument();
    expect(screen.getByTestId('g')).toHaveTextContent('Uncategorised');
    rerender(view(layers({ 'product.stock.low': 'Nearly gone', 'catalog.group.uncategorised': 'Misc' })));
    expect(screen.getByText('Nearly gone')).toBeInTheDocument();
    expect(screen.getByTestId('g')).toHaveTextContent('Misc');
  });
});
