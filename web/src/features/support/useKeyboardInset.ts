import { useEffect, useState } from 'react';

/** Below this the gap is browser chrome settling (a collapsing URL bar), not a keyboard. */
const KEYBOARD_MIN = 80;

/**
 * How much of the layout viewport the on-screen keyboard covers, in px (0 when it is down). Mobile Safari and Chrome
 * shrink only the visual viewport when the keyboard opens, so a bar stuck to the layout viewport's foot ends up behind
 * the keyboard; lifting it by this keeps it above. Inside Telegram the web view itself resizes, so this stays 0 there.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window === 'undefined' ? undefined : window.visualViewport;
    if (!vv) return;
    const measure = () => {
      const gap = Math.round(window.innerHeight - vv.height - vv.offsetTop);
      setInset(gap > KEYBOARD_MIN ? gap : 0);
    };
    measure();
    vv.addEventListener('resize', measure);
    vv.addEventListener('scroll', measure);
    return () => {
      vv.removeEventListener('resize', measure);
      vv.removeEventListener('scroll', measure);
    };
  }, []);
  return inset;
}
