import { useEffect, useState, type CSSProperties } from 'react';
import { attachmentSrc } from '@/api/support.ts';
import type { ThreadMessage } from '@/features/support/queries.ts';
import { formatDateTime } from '@/lib/format.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/support/MessageBubble.module.css';

interface BubblePhoto { key: string; src: string; width: number | null; height: number | null }

/** Previews of the photos on a message this browser is still sending (or failed to), freed when it goes. */
function useDraftPhotos(files: File[] | undefined): BubblePhoto[] {
  const [photos, setPhotos] = useState<BubblePhoto[]>([]);
  // Made and freed by the same effect, so a remount (strict mode included) never shows a revoked preview.
  useEffect(() => {
    if (!files?.length) { setPhotos([]); return; }
    const made = files.map((f, i) => ({ key: `draft-${i}`, src: URL.createObjectURL(f), width: null, height: null }));
    setPhotos(made);
    return () => { for (const p of made) URL.revokeObjectURL(p.src); };
  }, [files]);
  return photos;
}

/**
 * The photos on a message. One photo keeps its own shape (its size is reserved from the stored width and height, so
 * the thread does not jump as it loads); several sit in a two-column grid of squares.
 */
function Photos({ photos, onOpen }: { photos: BubblePhoto[]; onOpen: (src: string) => void }) {
  const { t } = useText();
  const single = photos.length === 1;
  return (
    <ul className={single ? `${classes.photos} ${classes.single}` : classes.photos}>
      {photos.map((p) => {
        const ratio = single && p.width && p.height ? { '--ratio': `${p.width} / ${p.height}` } as CSSProperties : undefined;
        return (
          <li key={p.key} className={classes.photo} style={ratio}>
            <button type="button" className={classes.photoButton} aria-label={t('support.thread.openPhoto')} onClick={() => onOpen(p.src)}>
              <img src={p.src} alt="" className={classes.image} loading="lazy" decoding="async" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export interface MessageBubbleProps {
  message: ThreadMessage;
  /** The first of a run from the same side: it carries the name and the time. */
  showAuthor: boolean;
  /** A failed message can be sent again (not once the ticket can no longer take replies). */
  canRetry: boolean;
  onRetry: (message: ThreadMessage) => void;
  onOpenPhoto: (src: string) => void;
}

/**
 * One message. The customer's sit on the right, in ink; the shop's on the left, on the surface, under the shop's
 * name. A message still on its way is faded; one that failed says so, and saying so is the way to send it again.
 */
export function MessageBubble({ message, showAuthor, canRetry, onRetry, onOpenPhoto }: MessageBubbleProps) {
  const { t } = useText();
  const mine = !message.fromSupport;
  const drafts = useDraftPhotos(message.local?.draft.files);
  const photos: BubblePhoto[] = message.local
    ? drafts
    : message.attachments.map((a) => ({ key: String(a.id), src: attachmentSrc(a), width: a.width, height: a.height }));
  const state = message.local?.state;
  const body = message.body.trim();

  return (
    <div
      className={mine ? `${classes.row} ${classes.mine}` : classes.row}
      data-state={state}
      data-first={showAuthor ? '' : undefined}
      aria-busy={state === 'sending' || undefined}
    >
      {showAuthor ? (
        <p className={classes.author}>
          <span className={classes.name}>{mine ? t('support.thread.you') : message.authorLabel}</span>
          {state ? null : <time className={classes.time} dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>}
        </p>
      ) : null}
      {photos.length > 0 ? <Photos photos={photos} onOpen={onOpenPhoto} /> : null}
      {body ? <p className={classes.bubble}>{body}</p> : null}
      {state === 'failed' && canRetry ? (
        <button type="button" className={classes.retry} onClick={() => onRetry(message)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
          </svg>
          {t('support.thread.failed')}
        </button>
      ) : null}
    </div>
  );
}
