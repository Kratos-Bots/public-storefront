import { useEffect, useRef, useState } from 'react';

/** The backend's photo limits: images only, at most 4 per message, 5 MB each. */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const MAX_PHOTOS = 4;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Many phone photos are over 5 MB straight off the camera. Before checking a photo against the limits, one this
 * browser can redraw is brought down to at most this many px on its long side, as a JPEG: the size the backend
 * stores anyway, so nothing is lost but the upload. A GIF is left alone (it may move).
 */
export const RESIZE_MAX_SIDE = 2000;
const RESIZABLE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];
const JPEG_QUALITY = 0.85;

/** Whether a decoded photo is worth redrawing smaller: over 5 MB, or longer than `RESIZE_MAX_SIDE` on either side. */
export function shouldResize(p: { type: string; size: number; width: number; height: number }): boolean {
  if (!RESIZABLE_TYPES.includes(p.type)) return false;
  return p.size > MAX_PHOTO_BYTES || Math.max(p.width, p.height) > RESIZE_MAX_SIDE;
}

/** The size that fits `max` on the long side, keeping the shape; an image already inside it keeps its own. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export interface DecodedImage { width: number; height: number; source: CanvasImageSource; close: () => void }

/** The browser parts of a resize, passed in so the decision and the fallbacks can be tested without a browser. */
export interface ResizeDeps {
  decode: (file: File) => Promise<DecodedImage>;
  encode: (image: DecodedImage, width: number, height: number) => Promise<Blob>;
}

/** `createImageBitmap` + a canvas (an `OffscreenCanvas` where there is one), or null where the browser has neither. */
export function browserResizeDeps(): ResizeDeps | null {
  if (typeof createImageBitmap !== 'function') return null;
  const hasOffscreen = typeof OffscreenCanvas === 'function';
  if (!hasOffscreen && typeof document === 'undefined') return null;
  return {
    decode: async (file) => {
      // `from-image` turns a sideways phone photo upright (its EXIF orientation), which the re-encode would drop.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() };
    },
    encode: async (image, width, height) => {
      const draw = (ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null) => {
        if (!ctx) throw new Error('no 2d context');
        // A JPEG has no transparency: a see-through PNG goes on white, not black.
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(image.source, 0, 0, width, height);
      };
      if (hasOffscreen) {
        const canvas = new OffscreenCanvas(width, height);
        draw(canvas.getContext('2d'));
        return canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      draw(canvas.getContext('2d'));
      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', JPEG_QUALITY);
      });
    },
  };
}

const asJpegName = (name: string) => (/\.[^./\\]+$/.test(name) ? name.replace(/\.[^./\\]+$/, '.jpg') : `${name}.jpg`);

/**
 * The file to send for a chosen photo: a big one redrawn smaller (see `RESIZE_MAX_SIDE`), anything else as it came.
 * Any failure to decode or redraw keeps the original, and the usual checks (and, past them, the server) decide.
 */
export async function prepareFile(file: File, deps: ResizeDeps | null = browserResizeDeps()): Promise<File> {
  if (!deps || !RESIZABLE_TYPES.includes(file.type)) return file;
  let image: DecodedImage | undefined;
  try {
    image = await deps.decode(file);
    if (!shouldResize({ type: file.type, size: file.size, width: image.width, height: image.height })) return file;
    const { width, height } = fitWithin(image.width, image.height, RESIZE_MAX_SIDE);
    const blob = await deps.encode(image, width, height);
    return new File([blob], asJpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    image?.close();
  }
}

export interface Photo { key: number; file: File; url: string }

/** Why the last pick was not all taken: a file of the wrong type or too large, or more than `MAX_PHOTOS` in all. */
export type PhotoProblem = 'invalid' | 'tooMany';

let photoKey = 0;

/**
 * Photos chosen for a message (a new ticket or a reply), with previews. Each pick is first brought down to size
 * (`prepareFile`); then files that are not one of `PHOTO_TYPES` or are still over `MAX_PHOTO_BYTES` are refused
 * (`problem` 'invalid'), as is any past `MAX_PHOTOS` ('tooMany'; a wrong file in the same pick names that instead);
 * the rest are kept. Every preview URL is revoked on remove and when the form goes away.
 */
export function usePhotos() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [problem, setProblem] = useState<PhotoProblem | null>(null);
  const live = useRef<Photo[]>([]);
  live.current = photos;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const p of live.current) URL.revokeObjectURL(p.url);
    };
  }, []);

  const add = async (files: File[]) => {
    const prepared = await Promise.all(files.map((f) => prepareFile(f)));
    if (!mounted.current) return;
    let invalid = false;
    const fits = prepared.filter((f) => {
      const ok = (PHOTO_TYPES as readonly string[]).includes(f.type) && f.size <= MAX_PHOTO_BYTES;
      if (!ok) invalid = true;
      return ok;
    });
    // Counted now, not before the resize: another pick may have landed while this one was being prepared.
    const room = Math.max(MAX_PHOTOS - live.current.length, 0);
    const added = fits.slice(0, room).map((file) => ({ key: ++photoKey, file, url: URL.createObjectURL(file) }));
    setProblem(invalid ? 'invalid' : fits.length > room ? 'tooMany' : null);
    if (added.length) {
      live.current = [...live.current, ...added];
      setPhotos((list) => [...list, ...added]);
    }
  };
  const remove = (key: number) => {
    const gone = live.current.find((p) => p.key === key);
    if (gone) URL.revokeObjectURL(gone.url);
    setProblem(null);
    setPhotos((list) => list.filter((p) => p.key !== key));
  };
  /** Empties the set once it has been handed on (a sent message), freeing every preview. */
  const clear = () => {
    for (const p of live.current) URL.revokeObjectURL(p.url);
    setProblem(null);
    setPhotos([]);
  };
  return { photos, problem, add, remove, clear };
}
