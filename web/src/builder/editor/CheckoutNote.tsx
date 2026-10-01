import { useEditorStore } from '@/builder/editor/store.ts';
import styles from '@/builder/editor/CheckoutNote.module.css';

/**
 * Editor-only: the checkout canvas always previews signed in with a sample cart (effectivePreviewAs).
 * The read-only version view shows the page as shoppers see it, so it carries no note.
 */
export function CheckoutNote() {
  const readOnly = useEditorStore((s) => s.readOnly);
  if (readOnly) return null;
  return (
    <p className={styles.note} role="note">
      Checkout previews signed in with a sample cart.
    </p>
  );
}
