import { useEffect, useRef, useState } from 'react';

/** The backend's photo limits: images only, at most 4 per message, 5 MB each. */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const MAX_PHOTOS = 4;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export interface Photo { key: number; file: File; url: string }

let photoKey = 0;

/**
 * Photos chosen for a message (a new ticket or a reply), with previews. Files that are not one of `PHOTO_TYPES`, are
 * over `MAX_PHOTO_BYTES` or would go past `MAX_PHOTOS` are refused and `invalid` is set; the rest are kept. Every preview URL is revoked on remove and when the form goes away. */
export function usePhotos() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [invalid, setInvalid] = useState(false);
  const live = useRef<Photo[]>([]);
  live.current = photos;
  useEffect(() => () => { for (const p of live.current) URL.revokeObjectURL(p.url); }, []);

  const add = (files: File[]) => {
    let refused = false;
    const room = MAX_PHOTOS - live.current.length;
    const fits = files.filter((f) => {
      const ok = (PHOTO_TYPES as readonly string[]).includes(f.type) && f.size <= MAX_PHOTO_BYTES;
      if (!ok) refused = true;
      return ok;
    });
    if (fits.length > room) refused = true;
    const added = fits.slice(0, Math.max(room, 0)).map((file) => ({ key: ++photoKey, file, url: URL.createObjectURL(file) }));
    setInvalid(refused);
    if (added.length) setPhotos((list) => [...list, ...added]);
  };
  const remove = (key: number) => {
    const gone = live.current.find((p) => p.key === key);
    if (gone) URL.revokeObjectURL(gone.url);
    setInvalid(false);
    setPhotos((list) => list.filter((p) => p.key !== key));
  };
  return { photos, invalid, add, remove };
}
