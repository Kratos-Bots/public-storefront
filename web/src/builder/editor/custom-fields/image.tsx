import { useEffect, useId, useRef, useState } from 'react';
import type { CustomField } from '@puckeditor/core';
import { notifications } from '@mantine/notifications';
import { getActiveBridge } from '@/builder/editor/bridge.ts';
import { placeLateUpload, uploadTarget } from '@/builder/editor/late-upload.ts';
import { MEDIA_SRC_RE } from '@/builder/define.ts';
import styles from '@/builder/editor/custom-fields/fields.module.css';

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function checkImageFile(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return 'Use a PNG, JPEG, WebP or GIF image.';
  if (file.size > MAX_IMAGE_BYTES) return 'Images must be 5 MB or smaller.';
  return null;
}

interface InputProps { label: string; id: string; name: string; value: string; onChange: (v: string) => void; readOnly?: boolean }

/** Shown when an upload finishes after its field has gone and its block can't be reached. */
export const LATE_UPLOAD_LOST = 'Upload finished — the image wasn’t added because you left the page.';

function ImageInput({ label, id, name, value, onChange, readOnly }: InputProps) {
  const uid = useId();
  const inputId = `${uid}-file`;
  const statusId = `${uid}-status`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only the newest upload may land. Once the field has gone, `onChange` would write to whatever
  // block Puck has selected now, so a late result is placed by its target instead (late-upload.ts).
  const attempt = useRef(0);
  const mounted = useRef(true);
  // The file input stays enabled while uploading (disabling the focused control drops focus to
  // <body>); picks are ignored instead.
  const busyRef = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const current = typeof value === 'string' ? value : '';
  const shown = MEDIA_SRC_RE.test(current);

  const upload = async (file: File | undefined) => {
    if (!file || busyRef.current) return;
    const problem = checkImageFile(file);
    if (problem) { setError(problem); return; }
    const bridge = getActiveBridge();
    if (!bridge) { setError('The editor is not connected to the admin. Reload the page and try again.'); return; }
    const mine = ++attempt.current;
    // Captured now: the block and doc this image was picked for.
    const target = uploadTarget(id, name);
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      // The bridge times the request out client-side (UPLOAD_TIMEOUT_MS) and rejects with a message.
      const url = await bridge.requestUpload(file);
      if (mine !== attempt.current) return;
      if (!mounted.current) {
        if (!MEDIA_SRC_RE.test(url) || !target || !placeLateUpload(target, url)) {
          notifications.show({ id: 'sf-builder-late-upload', message: LATE_UPLOAD_LOST, color: 'yellow', position: 'bottom-center' });
        }
        return;
      }
      if (!MEDIA_SRC_RE.test(url)) { setError('The upload returned an unexpected address. Try again.'); return; }
      onChange(url);
    } catch (err) {
      if (mine !== attempt.current || !mounted.current) return;
      setError(err instanceof Error && err.message ? err.message : 'The upload failed. Try again.');
    } finally {
      if (mine === attempt.current && mounted.current) { busyRef.current = false; setBusy(false); }
    }
  };

  return (
    <fieldset className={styles.field} id={id} disabled={readOnly} aria-busy={busy || undefined}>
      <legend className={styles.label}>{label}</legend>
      {shown && !busy
        ? <img className={styles.thumb} src={current} alt="" />
        : (
          <div className={styles.thumbEmpty} data-busy={busy ? '' : undefined}>
            {busy ? 'Uploading…' : current ? 'This image can’t be shown' : 'No image'}
          </div>
        )}
      <div className={styles.actions}>
        <input
          id={inputId}
          aria-label="Upload image"
          aria-describedby={statusId}
          className={styles.visuallyHidden}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          aria-disabled={busy || undefined}
          onClick={(e) => { if (busyRef.current) e.preventDefault(); }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Clear it so choosing the same file again still fires a change.
            e.target.value = '';
            void upload(file);
          }}
        />
        <label className={styles.button} htmlFor={inputId} aria-hidden="true">
          {busy ? 'Uploading…' : current ? 'Replace image' : 'Upload image'}
        </label>
        {current && !busy && (
          <button type="button" className={styles.buttonQuiet} aria-label="Remove image" onClick={() => { setError(null); onChange(''); }}>
            Remove
          </button>
        )}
      </div>
      <p className={styles.hint} id={statusId} role="status">
        {busy ? 'Uploading image…' : 'PNG, JPEG, WebP or GIF, up to 5 MB.'}
      </p>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </fieldset>
  );
}

export function imageField(label: string): CustomField<string> {
  return { type: 'custom', label, render: (p) => <ImageInput label={label} id={p.id} name={p.name} value={p.value} onChange={p.onChange} readOnly={p.readOnly} /> };
}
