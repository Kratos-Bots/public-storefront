import { useEffect, useId, useRef, useState } from 'react';
import type { CustomField } from '@puckeditor/core';
import { getActiveBridge } from '@/builder/editor/bridge.ts';
import { MEDIA_SRC_RE } from '@/builder/define.ts';
import styles from '@/builder/editor/custom-fields/fields.module.css';

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function checkImageFile(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return 'Use a PNG, JPEG, WebP or GIF image.';
  if (file.size > MAX_IMAGE_BYTES) return 'Images must be 5 MB or smaller.';
  return null;
}

interface InputProps { label: string; id: string; value: string; onChange: (v: string) => void; readOnly?: boolean }

function ImageInput({ label, id, value, onChange, readOnly }: InputProps) {
  const uid = useId();
  const inputId = `${uid}-file`;
  const statusId = `${uid}-status`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only the newest upload may land, and never after the field has gone.
  const attempt = useRef(0);
  useEffect(() => () => { attempt.current += 1; }, []);

  const current = typeof value === 'string' ? value : '';
  const shown = MEDIA_SRC_RE.test(current);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const problem = checkImageFile(file);
    if (problem) { setError(problem); return; }
    const bridge = getActiveBridge();
    if (!bridge) { setError('The editor is not connected to the admin. Reload the page and try again.'); return; }
    const mine = ++attempt.current;
    setBusy(true);
    setError(null);
    try {
      // The bridge times the request out client-side (UPLOAD_TIMEOUT_MS) and rejects with a message.
      const url = await bridge.requestUpload(file);
      if (mine !== attempt.current) return;
      if (!MEDIA_SRC_RE.test(url)) { setError('The upload returned an unexpected address. Try again.'); return; }
      onChange(url);
    } catch (err) {
      if (mine !== attempt.current) return;
      setError(err instanceof Error && err.message ? err.message : 'The upload failed. Try again.');
    } finally {
      if (mine === attempt.current) setBusy(false);
    }
  };

  return (
    <fieldset className={styles.field} id={id} disabled={readOnly || busy} aria-busy={busy || undefined}>
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
  return { type: 'custom', label, render: (p) => <ImageInput label={label} id={p.id} value={p.value} onChange={p.onChange} readOnly={p.readOnly} /> };
}
