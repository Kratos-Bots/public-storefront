import { describe, expect, it, vi } from 'vitest';
import { MAX_PHOTO_BYTES, fitWithin, prepareFile, shouldResize, type ResizeDeps } from '@/features/support/photos.ts';

const MB = 1024 * 1024;

const file = (name: string, type: string, size = 1000) => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

/** Stands in for the browser: decodes to the given size and encodes to a small JPEG, recording what it was asked. */
function fakeDeps(width: number, height: number, encoded = 300_000) {
  const close = vi.fn();
  const deps: ResizeDeps = {
    decode: vi.fn(async () => ({ width, height, source: {} as CanvasImageSource, close })),
    encode: vi.fn(async () => new Blob([new Uint8Array(encoded)], { type: 'image/jpeg' })),
  };
  return { deps, close };
}

describe('shouldResize', () => {
  it.each([
    ['a big phone JPEG', { type: 'image/jpeg', size: 7 * MB, width: 4032, height: 3024 }, true],
    ['a small file with a long side over 2000 px', { type: 'image/png', size: 1 * MB, width: 2400, height: 800 }, true],
    ['a portrait one, tall side over', { type: 'image/webp', size: 1 * MB, width: 1200, height: 2001 }, true],
    ['a file just over 5 MB at a modest size', { type: 'image/jpeg', size: MAX_PHOTO_BYTES + 1, width: 1600, height: 1200 }, true],
    ['exactly 2000 px and exactly 5 MB', { type: 'image/jpeg', size: MAX_PHOTO_BYTES, width: 2000, height: 1500 }, false],
    ['a small photo', { type: 'image/jpeg', size: 400_000, width: 1280, height: 960 }, false],
    ['a GIF, however big (it may move)', { type: 'image/gif', size: 9 * MB, width: 4000, height: 4000 }, false],
    ['anything that is not a photo type', { type: 'image/heic', size: 9 * MB, width: 4000, height: 3000 }, false],
  ])('%s → %s', (_n, p, expected) => {
    expect(shouldResize(p)).toBe(expected);
  });
});

describe('fitWithin', () => {
  it('scales the long side down to the limit, keeping the shape', () => {
    expect(fitWithin(4032, 3024, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3024, 4032, 2000)).toEqual({ width: 1500, height: 2000 });
  });
  it('leaves an image already inside the limit at its own size', () => {
    expect(fitWithin(1600, 1200, 2000)).toEqual({ width: 1600, height: 1200 });
  });
});

describe('prepareFile', () => {
  it('downscales a big phone photo to a JPEG no wider than 2000 px, named for its new type', async () => {
    const { deps, close } = fakeDeps(4032, 3024);
    const out = await prepareFile(file('IMG_0042.HEIC.jpeg', 'image/jpeg', 7 * MB), deps);
    expect(deps.encode).toHaveBeenCalledWith(expect.anything(), 2000, 1500);
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('IMG_0042.HEIC.jpg');
    expect(out.size).toBe(300_000);
    expect(close).toHaveBeenCalled();
  });

  it('keeps a photo that needs nothing done as the very same file', async () => {
    const { deps, close } = fakeDeps(1280, 960);
    const f = file('small.png', 'image/png', 200_000);
    expect(await prepareFile(f, deps)).toBe(f);
    expect(deps.encode).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it('never touches a GIF or a file of another type (not even to decode it)', async () => {
    const { deps } = fakeDeps(4000, 4000);
    const gif = file('moving.gif', 'image/gif', 9 * MB);
    const pdf = file('doc.pdf', 'application/pdf', 9 * MB);
    expect(await prepareFile(gif, deps)).toBe(gif);
    expect(await prepareFile(pdf, deps)).toBe(pdf);
    expect(deps.decode).not.toHaveBeenCalled();
  });

  it('falls back to the original when the browser cannot decode or encode it (the server has the last word)', async () => {
    const f = file('odd.jpg', 'image/jpeg', 7 * MB);
    const broken: ResizeDeps = { decode: vi.fn(async () => { throw new Error('decode'); }), encode: vi.fn() };
    expect(await prepareFile(f, broken)).toBe(f);
    const { deps } = fakeDeps(4032, 3024);
    deps.encode = vi.fn(async () => { throw new Error('encode'); });
    expect(await prepareFile(f, deps)).toBe(f);
  });

  it('keeps the original when there is no way to resize at all (an older browser, or jsdom)', async () => {
    const f = file('big.jpg', 'image/jpeg', 7 * MB);
    expect(await prepareFile(f, null)).toBe(f);
  });
});
