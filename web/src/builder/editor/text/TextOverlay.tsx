import { useEffect, useLayoutEffect, useRef } from 'react';
import { TextPanel } from '@/builder/editor/text/TextPanel.tsx';
import placement from '@/builder/editor/text/TextPlacement.module.css';

const HEADER = '[data-sf-builder-header]';

/**
 * Below WIDE_FRAME_PX the Text panel overlays the canvas instead of squeezing it (spec §7.2).
 * Pinned under the editor header, whose height changes as its groups wrap at narrow widths, so
 * the top edge follows the header's measured bottom.
 */
export function TextOverlay({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = box.current;
    const header = document.querySelector<HTMLElement>(HEADER);
    if (!el || !header) return;
    const place = () => el.style.setProperty('--sfb-overlay-top', `${Math.max(0, Math.round(header.getBoundingClientRect().bottom))}px`);
    place();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null;
    observer?.observe(header);
    window.addEventListener('resize', place);
    return () => { observer?.disconnect(); window.removeEventListener('resize', place); };
  }, []);

  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input, select, button')?.focus({ preventScroll: true });
    // A menu or dialog that handled this Escape first (and prevented it) keeps the overlay open.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div ref={box} className={placement.overlay} data-sfb-text-overlay="">
      <TextPanel onClose={onClose} />
    </div>
  );
}
