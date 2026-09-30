// web/test/builder-editor-late-upload.test.tsx — an upload that outlives its field is placed or reported, never dropped.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const shown = vi.hoisted(() => vi.fn());
vi.mock('@mantine/notifications', () => ({ notifications: { show: shown } }));

import { imageField, LATE_UPLOAD_LOST } from '@/builder/editor/custom-fields/image.tsx';
import { placeLateUpload, registerLiveCanvas, uploadTarget, withProp } from '@/builder/editor/late-upload.ts';
import { setActiveBridge, type Bridge } from '@/builder/editor/bridge.ts';
import { DEFAULT_PREVIEW_AS, useEditorStore } from '@/builder/editor/store.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import type { PuckDoc } from '@/builder/types.ts';

const URL_A = `/media/storefront-pages/media/${'a'.repeat(32)}.png`;
const about = (): PuckDoc => ({
  root: { props: { title: 'About', description: '', chrome: 'shell' } },
  content: [
    { type: 'Section', props: { id: 'sec', content: [{ type: 'Image', props: { id: 'img-1', src: '', alt: '', caption: '', width: 'rail', aspect: 'auto' } }] } },
  ],
});

function loadAbout() {
  useEditorStore.getState().load({ layout: 'storefront', readOnly: false, pageSet: { schemaVersion: 1, shell: defaultDoc('shell', 'storefront')!, pages: { 'page:about': about() } } });
  useEditorStore.getState().selectDoc('page:about');
}

/** Starts an upload in the Image block's `src` field and unmounts the field before it finishes. */
function startThenLeave(fieldId = 'img-1_custom_src', name = 'src') {
  let finish!: (url: string) => void;
  setActiveBridge({ requestUpload: vi.fn(() => new Promise<string>((r) => { finish = r; })) } as unknown as Bridge);
  const onChange = vi.fn();
  const field = imageField('Image');
  const view = render(field.render({ field, name, id: fieldId, value: '', onChange, readOnly: false } as never));
  fireEvent.change(screen.getByLabelText('Upload image'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
  view.unmount();
  return { onChange, finish: async (url: string) => { await act(async () => { finish(url); }); } };
}

const srcOf = (doc: PuckDoc | undefined) =>
  ((doc?.content[0]?.props.content as PuckDoc['content'])[0]!.props.src);

beforeEach(() => {
  shown.mockReset();
  useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null });
});
afterEach(() => {
  cleanup();
  setActiveBridge(null);
});

describe('late image uploads', () => {
  it('owner switched page: the URL lands in the block it was picked for, in the store', async () => {
    loadAbout();
    const { onChange, finish } = startThenLeave();
    act(() => useEditorStore.getState().selectDoc('cart'));
    await finish(URL_A);
    expect(onChange).not.toHaveBeenCalled(); // never through the stale field (it targets Puck's current selection)
    expect(srcOf(useEditorStore.getState().docs['page:about'])).toBe(URL_A);
    expect(shown).not.toHaveBeenCalled();
  });

  it('same page, another block selected: the URL goes through the live canvas to the right block', async () => {
    loadAbout();
    const setProp = vi.fn(() => true);
    const { epoch } = useEditorStore.getState();
    const off = registerLiveCanvas({ docKey: 'page:about', epoch, setProp });
    const { onChange, finish } = startThenLeave();
    await finish(URL_A);
    expect(setProp).toHaveBeenCalledWith('img-1', 'src', URL_A);
    expect(onChange).not.toHaveBeenCalled();
    expect(shown).not.toHaveBeenCalled();
    off();
  });

  it('the set was reloaded meanwhile: nothing is written and the owner is told', async () => {
    loadAbout();
    const { finish } = startThenLeave();
    act(() => loadAbout()); // a new load bumps the epoch: the doc the upload belonged to is gone
    await finish(URL_A);
    expect(srcOf(useEditorStore.getState().docs['page:about'])).toBe('');
    expect(shown).toHaveBeenCalledWith(expect.objectContaining({ message: LATE_UPLOAD_LOST }));
    expect(LATE_UPLOAD_LOST).toBe('Upload finished — the image wasn’t added because you left the page.');
  });

  it('the block was deleted meanwhile: the owner is told', async () => {
    loadAbout();
    const { finish } = startThenLeave();
    act(() => {
      useEditorStore.getState().updateDoc('page:about', { ...about(), content: [] }, useEditorStore.getState().epoch);
      useEditorStore.getState().selectDoc('cart');
    });
    await finish(URL_A);
    expect(shown).toHaveBeenCalledWith(expect.objectContaining({ message: LATE_UPLOAD_LOST }));
  });

  it('a nested (array) field has no target: reported, not guessed', async () => {
    loadAbout();
    const { finish } = startThenLeave('img-1_array_items_src', 'items[0].src');
    act(() => useEditorStore.getState().selectDoc('cart'));
    await finish(URL_A);
    expect(shown).toHaveBeenCalledWith(expect.objectContaining({ message: LATE_UPLOAD_LOST }));
  });

  it('a still-mounted field keeps using its own onChange', async () => {
    loadAbout();
    setActiveBridge({ requestUpload: vi.fn().mockResolvedValue(URL_A) } as unknown as Bridge);
    const onChange = vi.fn();
    const field = imageField('Image');
    render(field.render({ field, name: 'src', id: 'img-1_custom_src', value: '', onChange, readOnly: false } as never));
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Upload image'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    });
    expect(onChange).toHaveBeenCalledWith(URL_A);
    expect(shown).not.toHaveBeenCalled();
  });
});

describe('late-upload helpers', () => {
  it('reads the target from Puck field ids', () => {
    loadAbout();
    const epoch = useEditorStore.getState().epoch;
    expect(uploadTarget('Image-9_custom_src', 'src')).toEqual({ docKey: 'page:about', epoch, blockId: 'Image-9', prop: 'src' });
    expect(uploadTarget('root_custom_ogImage', 'ogImage')).toEqual({ docKey: 'page:about', epoch, blockId: null, prop: 'ogImage' });
    expect(uploadTarget('x_custom_src', 'items[0].src')).toBeNull();
    expect(uploadTarget('_custom_src', 'src')).toBeNull();
    expect(uploadTarget('Image-9_text_src', 'src')).toBeNull();
  });

  it('withProp sets a nested block prop immutably and returns null for a missing block', () => {
    const doc = about();
    const next = withProp(doc, 'img-1', 'src', URL_A)!;
    expect(srcOf(next)).toBe(URL_A);
    expect(srcOf(doc)).toBe('');
    expect(withProp(doc, 'nope', 'src', URL_A)).toBeNull();
  });

  it('refuses a read-only set', () => {
    useEditorStore.getState().load({ layout: 'storefront', readOnly: true, pageSet: null });
    const { epoch } = useEditorStore.getState();
    expect(placeLateUpload({ docKey: 'page:about', epoch, blockId: 'img-1', prop: 'src' }, URL_A)).toBe(false);
  });
});
