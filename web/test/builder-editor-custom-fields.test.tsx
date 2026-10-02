// web/test/builder-editor-custom-fields.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SETTINGS_KEY } from '@/app/settings.ts';
import { isAllowedExternal, LINKABLE_ROUTES, linkModeOf, normalizeExternal } from '@/builder/editor/custom-fields/route-link-model.ts';
import { routeLinkField } from '@/builder/editor/custom-fields/route-link.tsx';
import { checkImageFile, imageField } from '@/builder/editor/custom-fields/image.tsx';
import { paletteTokenField } from '@/builder/editor/custom-fields/palette-token.tsx';
import { categoryPickerField, configureCatalogSource, productPickerField } from '@/builder/editor/custom-fields/pickers.ts';
import { setActiveBridge, type Bridge } from '@/builder/editor/bridge.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import { isSafeHref } from '@/builder/define.ts';
import type { Catalog } from '@/types/catalog.ts';
import { fetchCatalog } from '@/api/catalog.ts';
import { useCatalog } from '@/features/catalog/use-catalog.ts';
import { useSessionStore } from '@/stores/session.ts';

vi.mock('@/api/catalog.ts', async (orig) => ({ ...(await orig<typeof import('@/api/catalog.ts')>()), fetchCatalog: vi.fn() }));

afterEach(() => {
  cleanup();
  setActiveBridge(null);
});

function renderField(field: { render: (p: never) => React.ReactElement }, value: string, onChange = vi.fn()) {
  render(field.render({ field, name: 'x', id: 'field-x', value, onChange, readOnly: false } as never));
  return onChange;
}

describe('route link model', () => {
  it.each([['/', 'route'], ['/cart', 'route'], ['/pages/about', 'page'], ['https://shop.example', 'url'], ['mailto:hi@shop.example', 'url'], ['tel:+441234', 'url']] as const)(
    '%s is a %s link', (v, mode) => expect(linkModeOf(v)).toBe(mode),
  );
  it.each(['https://shop.example/x', 'mailto:hi@shop.example', 'tel:+44 1234 567'])('allows %s', (v) => expect(isAllowedExternal(v)).toBe(true));
  it.each(['http://shop.example', 'javascript:alert(1)', 'https://', 'ftp://x', '//shop.example', '/\\shop.example', 'data:text/html,x', 'mailto:', '#top', '/cart#top'])('refuses %s', (v) => expect(isAllowedExternal(v)).toBe(false));
  it('offers only site-relative paths without anchors as shop pages', () => {
    for (const r of LINKABLE_ROUTES) expect(r.path).toMatch(/^\/(?![/\\])[^#]*$/);
  });
  it.each([
    ['tel:+44 1234 567', 'tel:+441234567'],
    ['  https://shop.example/about  ', 'https://shop.example/about'],
    ['https://shop.example/a b', null],
    ['https://shop\t.example', null],
    ['javascript:alert(1)', null],
  ])('normalizes %j to a value the backend accepts', (input, expected) => {
    const out = normalizeExternal(input);
    expect(out).toBe(expected);
    if (out !== null) expect(isSafeHref(out)).toBe(true);
  });
});

describe('route link field', () => {
  beforeEach(() => {
    useEditorStore.getState().load({ layout: 'storefront', pageSet: null, readOnly: false });
    useEditorStore.getState().createPage('about', 'About');
  });

  it('picks a fixed page', () => {
    const onChange = renderField(routeLinkField('Link'), '/');
    fireEvent.change(screen.getByLabelText('Page'), { target: { value: '/cart' } });
    expect(onChange).toHaveBeenCalledWith('/cart');
  });

  it('picks a custom page', () => {
    const onChange = renderField(routeLinkField('Link'), '/');
    fireEvent.click(screen.getByRole('radio', { name: 'Custom page' }));
    fireEvent.change(screen.getByLabelText('Custom page'), { target: { value: '/pages/about' } });
    expect(onChange).toHaveBeenCalledWith('/pages/about');
  });

  it('accepts only https/mailto/tel addresses', () => {
    const onChange = renderField(routeLinkField('Link'), '/');
    fireEvent.click(screen.getByRole('radio', { name: 'Web address' }));
    const input = screen.getByLabelText('Address');
    fireEvent.change(input, { target: { value: 'javascript:alert(1)' } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('https:');
    fireEvent.change(input, { target: { value: 'https://shop.example/about' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('https://shop.example/about');
  });

  it('refuses protocol-relative and anchor-only addresses', () => {
    const onChange = renderField(routeLinkField('Link'), '/');
    fireEvent.click(screen.getByRole('radio', { name: 'Web address' }));
    const input = screen.getByLabelText('Address');
    for (const bad of ['//evil.example', '/\\evil.example', '#top']) {
      fireEvent.change(input, { target: { value: bad } });
      fireEvent.blur(input);
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it('stores phone numbers without spaces', () => {
    const onChange = renderField(routeLinkField('Link'), '/');
    fireEvent.click(screen.getByRole('radio', { name: 'Web address' }));
    const input = screen.getByLabelText('Address');
    fireEvent.change(input, { target: { value: 'tel:+44 1234 567' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('tel:+441234567');
  });

  it('switches link type with the arrow keys', () => {
    renderField(routeLinkField('Link'), '/');
    const group = screen.getByRole('radiogroup', { name: 'Link type' });
    expect(screen.getByRole('radio', { name: 'Shop page' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Custom page' })).toHaveAttribute('aria-checked', 'true');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Custom page' }));
  });

  it('empties the address when the value is undone to nothing, without re-committing', () => {
    const onChange = vi.fn();
    const field = routeLinkField('Link');
    const props = { field, name: 'x', id: 'field-x', onChange, readOnly: false };
    const { rerender } = render(field.render({ ...props, value: 'https://shop.example/a' } as never));
    rerender(field.render({ ...props, value: '' } as never));
    const input = screen.getByLabelText('Address') as HTMLInputElement;
    expect(input.value).toBe('');
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('blanking the address clears the link', () => {
    const onChange = renderField(routeLinkField('Link'), 'https://shop.example/a');
    const input = screen.getByLabelText('Address');
    fireEvent.change(input, { target: { value: '  ' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('switching to Web address and leaving the empty box keeps an existing shop link', () => {
    const onChange = renderField(routeLinkField('Link'), '/cart');
    fireEvent.click(screen.getByRole('radio', { name: 'Web address' }));
    const input = screen.getByLabelText('Address');
    fireEvent.focus(input);
    fireEvent.blur(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    // Typing then deleting everything is an edit to empty: that does clear the link.
    fireEvent.change(input, { target: { value: 'h' } });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('shows a link to a deleted custom page as missing', () => {
    renderField(routeLinkField('Link'), '/pages/gone');
    const select = screen.getByLabelText('Custom page') as HTMLSelectElement;
    expect(select.value).toBe('/pages/gone');
    expect(screen.getByRole('option', { name: '/pages/gone (missing page)' })).toBeInTheDocument();
  });

  it('clears the link', () => {
    const onChange = renderField(routeLinkField('Link'), '/cart');
    fireEvent.change(screen.getByLabelText('Page'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith('');
  });
});

describe('image field', () => {
  it.each([
    [new File(['x'], 'a.svg', { type: 'image/svg+xml' }), 'Use a PNG, JPEG, WebP or GIF image.'],
    [new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'a.png', { type: 'image/png' }), 'Images must be 5 MB or smaller.'],
    [new File(['x'], 'a.webp', { type: 'image/webp' }), null],
  ])('checks %#', (file, expected) => expect(checkImageFile(file)).toBe(expected));

  it('uploads through the parent bridge and stores the returned url', async () => {
    const url = `/media/storefront-pages/media/${'c'.repeat(32)}.png`;
    const requestUpload = vi.fn().mockResolvedValue(url);
    setActiveBridge({ requestUpload } as unknown as Bridge);
    const onChange = renderField(imageField('Image'), '');
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Upload image'), { target: { files: [file] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(url));
    expect(requestUpload).toHaveBeenCalledWith(file);
    setActiveBridge(null);
  });

  it('shows the upload error and keeps the old value', async () => {
    setActiveBridge({ requestUpload: vi.fn().mockRejectedValue(new Error('Too big')) } as unknown as Bridge);
    const onChange = renderField(imageField('Image'), '/media/old.png');
    fireEvent.change(screen.getByLabelText('Upload image'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Too big');
    expect(onChange).not.toHaveBeenCalled();
    setActiveBridge(null);
  });

  it('refuses a returned url outside the media store', async () => {
    setActiveBridge({ requestUpload: vi.fn().mockResolvedValue('https://evil.example/x.png') } as unknown as Bridge);
    const onChange = renderField(imageField('Image'), '');
    fireEvent.change(screen.getByLabelText('Upload image'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/unexpected/i);
    expect(onChange).not.toHaveBeenCalled();
    setActiveBridge(null);
  });

  it('pre-checks the file before asking the admin', async () => {
    const requestUpload = vi.fn();
    setActiveBridge({ requestUpload } as unknown as Bridge);
    renderField(imageField('Image'), '');
    fireEvent.change(screen.getByLabelText('Upload image'), { target: { files: [new File(['x'], 'a.svg', { type: 'image/svg+xml' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('PNG');
    expect(requestUpload).not.toHaveBeenCalled();
    setActiveBridge(null);
  });

  it('keeps the focused file input usable while uploading and ignores a second pick', async () => {
    let finish!: (url: string) => void;
    const requestUpload = vi.fn(() => new Promise<string>((r) => { finish = r; }));
    setActiveBridge({ requestUpload } as unknown as Bridge);
    const onChange = renderField(imageField('Image'), '');
    const input = screen.getByLabelText('Upload image') as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    expect(await screen.findByRole('status')).toHaveTextContent('Uploading');
    expect(input).not.toBeDisabled();
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { files: [new File(['y'], 'b.png', { type: 'image/png' })] } });
    expect(requestUpload).toHaveBeenCalledTimes(1);
    const url = `/media/storefront-pages/media/${'d'.repeat(32)}.png`;
    finish(url);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(url));
  });

  it('removes the image', () => {
    const onChange = renderField(imageField('Image'), `/media/storefront-pages/media/${'a'.repeat(32)}.png`);
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});

describe('palette token field', () => {
  it('renders one pressed swatch per option and reports the choice', () => {
    const onChange = renderField(paletteTokenField('Background', ['none', 'surface', 'primary']), 'surface');
    expect(screen.getByRole('radio', { name: 'Surface' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Primary' }));
    expect(onChange).toHaveBeenCalledWith('primary');
    expect(screen.getByRole('radio', { name: 'None' })).toBeInTheDocument();
  });

  it('offers only palette tokens the blocks accept', () => {
    renderField(paletteTokenField('Tone', ['line', 'evil) ; background: url(x', 'accent']), 'line');
    expect(screen.getAllByRole('radio')).toHaveLength(1);
  });

  it('is a radio group: one tab stop, arrow keys move and select', () => {
    const onChange = renderField(paletteTokenField('Background', ['none', 'surface', 'primary']), 'surface');
    const group = screen.getByRole('radiogroup', { name: 'Background' });
    expect(screen.getAllByRole('radio').map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('primary');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Primary' }));
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('none');
    fireEvent.keyDown(group, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('primary');
  });

  it('names swatches the way an admin reads them', () => {
    renderField(paletteTokenField('Background', ['bg', 'bg-deep', 'surface-2', 'line-strong', 'warn']), 'bg');
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label')))
      .toEqual(['Background', 'Background (deep)', 'Surface 2', 'Line (strong)', 'Warning']);
  });
});

describe('catalogue pickers', () => {
  const catalog = {
    products: [
      { id: 1, displayName: 'Northbound Field Kit', sku: 'NB-FK-01', categoryName: 'Kits', isActive: true },
      { id: 2, displayName: 'Northbound Trail Tin', sku: 'NB-TT-02', categoryName: 'Tins', isActive: true },
      { id: 3, displayName: 'Retired Thing', sku: 'NB-OLD', categoryName: null, isActive: false },
    ],
    categories: [{ id: 10, name: 'Kits', slug: 'kits', parentId: null, sortOrder: 1, emoji: null }],
  } as unknown as Catalog;

  it('searches active products by name or SKU and stores the id', async () => {
    const client = new QueryClient();
    client.setQueryData(['catalog', null], catalog);
    configureCatalogSource(client);
    const field = productPickerField('Product');
    expect((await field.fetchList({ query: 'tt-02', filters: {} }))!.map((p: { id: number }) => p.id)).toEqual([2]);
    expect((await field.fetchList({ query: '', filters: {} }))!.map((p: { id: number }) => p.id)).toEqual([1, 2]);
    expect(field.mapProp!(catalog.products[0])).toBe(1);
    expect(field.getItemSummary!(2)).toBe('Northbound Trail Tin');
    expect(field.getItemSummary!(99)).toBe('Product #99');
    const cat = categoryPickerField('Category');
    expect((await cat.fetchList({ query: 'kit', filters: {} }))!.length).toBe(1);
    expect(cat.getItemSummary!(10)).toBe('Kits');
    configureCatalogSource(null);
  });

  it('shares the canvas catalogue entry for a signed-in preview (one fetch, summaries without opening)', async () => {
    const fetchMock = vi.mocked(fetchCatalog);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(catalog);
    useSessionStore.getState().setSession('fixture-token', { id: 900001, nickname: 'Morgan' } as never);
    const client = new QueryClient();
    client.setQueryData(SETTINGS_KEY, {});
    configureCatalogSource(client);
    function Canvas() {
      const { data } = useCatalog();
      return <p>{data ? 'loaded' : 'loading'}</p>;
    }
    render(<QueryClientProvider client={client}><Canvas /></QueryClientProvider>);
    await screen.findByText('loaded');
    const field = productPickerField('Product');
    expect(field.getItemSummary!(2)).toBe('Northbound Trail Tin');
    expect((await field.fetchList({ query: '', filters: {} }))!.length).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(true);
    useSessionStore.getState().clear();
    configureCatalogSource(null);
  });
});
