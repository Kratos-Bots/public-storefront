import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';

/** The Popover API puts a panel in the top layer, so Puck's layout can never clip it. */
const supportsPopover = (): boolean =>
  typeof HTMLElement !== 'undefined' && typeof (HTMLElement.prototype as { showPopover?: unknown }).showPopover === 'function';

function place(panel: HTMLElement, anchor: HTMLElement | null, align: 'start' | 'end') {
  if (!anchor) return;
  const r = anchor.getBoundingClientRect();
  panel.style.top = `${Math.round(r.bottom + 6)}px`;
  if (align === 'end') {
    panel.style.left = 'auto';
    panel.style.right = `${Math.max(8, Math.round(window.innerWidth - r.right))}px`;
  } else {
    panel.style.right = 'auto';
    panel.style.left = `${Math.max(8, Math.round(r.left))}px`;
  }
}

/**
 * A panel under a header button, rendered only while open. In the top layer when the browser has
 * the Popover API (as a manual popover, so the anchor button still toggles it), otherwise as a
 * fixed element — both paths close on Escape and on a press outside the panel and its button.
 */
export function FloatingPanel(props: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: (reason: 'escape' | 'outside') => void;
  align?: 'start' | 'end';
  className: string;
  id?: string;
  role?: string;
  'aria-labelledby'?: string;
  'aria-label'?: string;
  children: ReactNode;
}) {
  const { anchor, open, onClose, align = 'start', className, children, ...rest } = props;
  const ref = useRef<HTMLDivElement>(null);
  const top = supportsPopover();
  const close = useRef(onClose);
  close.current = onClose;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    place(el, anchor.current, align);
    if (top && !el.matches(':popover-open')) el.showPopover();
    const onResize = () => place(el, anchor.current, align);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, top, anchor, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && (ref.current?.contains(t) || anchor.current?.contains(t))) return;
      close.current('outside');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current('escape');
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, anchor]);

  if (!open) return null;
  return (
    <div ref={ref} popover={top ? 'manual' : undefined} data-layer={top ? 'top' : 'fixed'} className={className} {...rest}>
      {children}
    </div>
  );
}
