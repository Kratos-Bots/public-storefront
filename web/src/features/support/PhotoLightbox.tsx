import { CloseButton, Modal } from '@mantine/core';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/support/PhotoLightbox.module.css';

/**
 * One photo from the conversation, as large as the screen allows, on a dimmed ground. Escape, the close button or a
 * tap outside the photo puts it away, and focus goes back to the thumbnail that opened it.
 */
export function PhotoLightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  const { t } = useText();
  return (
    <Modal.Root
      opened={src !== null}
      onClose={onClose}
      fullScreen
      returnFocus
      padding={0}
      transitionProps={{ transition: 'fade', duration: 150 }}
    >
      {/* The dialog has no visible title: the photo is its content, so it is named for screen readers here. */}
      <Modal.Content aria-label={t('support.thread.photo')} className={classes.content}>
        <Modal.Body className={classes.body}>
          <div className={classes.stage} onClick={onClose}>
            {src ? <img src={src} alt="" className={classes.image} onClick={(e) => e.stopPropagation()} /> : null}
          </div>
          <CloseButton
            size="lg"
            radius="xl"
            data-autofocus
            className={classes.close}
            aria-label={t('support.thread.closePhoto')}
            onClick={onClose}
          />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
