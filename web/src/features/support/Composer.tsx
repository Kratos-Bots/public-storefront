import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ActionIcon, CloseButton, FileButton, Textarea } from '@mantine/core';
import { MAX_PHOTOS, PHOTO_TYPES, usePhotos } from '@/features/support/photos.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/support/Composer.module.css';

const MAX_BODY = 4000;

/** A keyboard with an Enter key that is not also the only way to start a new line: a desktop's, not a phone's. */
const enterSends = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

function PaperclipIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.3 3.3 0 014.7 4.7l-8.6 8.6a1.7 1.7 0 01-2.4-2.4l7.9-7.9" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}

export interface ComposerProps {
  onSend: (body: string, files: File[]) => void;
  /** The textarea took focus: the page brings the newest message back into view above it. */
  onFocus?: () => void;
  /** The box is going away (the ticket stopped taking replies) with this unsent text in it, so it can be carried on. */
  onUnsent?: (body: string) => void;
}

/**
 * The reply box at the foot of the conversation: attach, write, send. Sending hands the message to the thread at once
 * (it shows there as sending) and clears the box for the next one. Enter sends on a desktop keyboard (Shift+Enter for
 * a new line); on a phone Enter is a new line and the arrow sends.
 */
export function Composer({ onSend, onFocus, onUnsent }: ComposerProps) {
  const { t } = useText();
  const [body, setBody] = useState('');
  const { photos, invalid, add, remove, clear } = usePhotos();
  const resetFile = useRef<() => void>(null);
  const latest = useRef({ body, onUnsent });
  latest.current = { body, onUnsent };
  useEffect(() => () => {
    const left = latest.current.body.trim();
    if (left) latest.current.onUnsent?.(left);
  }, []);

  const text = body.trim();
  const ready = text.length <= MAX_BODY && (text.length > 0 || photos.length > 0);

  const send = () => {
    if (!ready) return;
    onSend(text, photos.map((p) => p.file));
    setBody('');
    clear();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || !enterSends()) return;
    e.preventDefault();
    send();
  };

  return (
    <div className={classes.composer} data-sf-part="composer">
      {photos.length > 0 ? (
        <ul className={classes.photos}>
          {photos.map((p) => (
            <li key={p.key} className={classes.photo}>
              <img src={p.url} alt="" className={classes.thumb} />
              <CloseButton
                size="sm"
                radius="xl"
                className={classes.remove}
                aria-label={t('support.new.removePhoto')}
                onClick={() => remove(p.key)}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {invalid ? <p className={classes.error} role="alert">{t('support.photo.invalid')}</p> : null}

      <div className={classes.row}>
        <FileButton
          onChange={(files) => { add(files); resetFile.current?.(); }}
          accept={PHOTO_TYPES.join(',')}
          multiple
          resetRef={resetFile}
        >
          {(props) => (
            <ActionIcon
              {...props}
              variant="subtle"
              size={44}
              radius="var(--sf-btn-radius)"
              className={classes.attach}
              aria-label={t('support.new.addPhotos')}
              disabled={photos.length >= MAX_PHOTOS}
            >
              <PaperclipIcon />
            </ActionIcon>
          )}
        </FileButton>

        <Textarea
          value={body}
          onChange={(e) => setBody(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          aria-label={t('support.new.message')}
          placeholder={t('support.thread.placeholder')}
          maxLength={MAX_BODY}
          autosize
          minRows={1}
          maxRows={6}
          size="md"
          className={classes.field}
          classNames={{ input: classes.input }}
        />

        <ActionIcon
          size={44}
          radius="var(--sf-btn-radius)"
          className={classes.send}
          aria-label={t('support.new.send')}
          disabled={!ready}
          // Keep the keyboard up: a tap on the arrow must not take focus from the box.
          onMouseDown={(e) => e.preventDefault()}
          onClick={send}
        >
          <SendIcon />
        </ActionIcon>
      </div>
    </div>
  );
}
