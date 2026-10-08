import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Sheet } from '@/components/Sheet.tsx';
import classes from '@/components/Sheet.module.css';

/** jsdom has no layout and a TouchEvent that ignores `touches`, so the events are built by hand. */
function touch(el: Element, type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel', x = 0, y = 0, extra: object[] = []): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  const touches = type === 'touchend' || type === 'touchcancel' ? [] : [{ clientX: x, clientY: y }, ...extra];
  Object.defineProperty(e, 'touches', { value: touches });
  Object.defineProperty(e, 'changedTouches', { value: [{ clientX: x, clientY: y }] }); // the scroll lock reads these
  act(() => { el.dispatchEvent(e); });
  return e;
}

const realMatchMedia = window.matchMedia;
let now = 0;

function setDesktop(on: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: on && query.includes('min-width: 62em'), media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

beforeEach(() => {
  now = 0;
  // A slow finger by default: 200 ms between every sample, so no drag is accidentally a flick.
  vi.spyOn(performance, 'now').mockImplementation(() => (now += 200));
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 800 });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.matchMedia = realMatchMedia;
  delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
});

function mount(onClose = vi.fn(), onHeaderTap = vi.fn()) {
  render(
    <MantineProvider>
      <Sheet
        opened
        onClose={onClose}
        label="Test sheet"
        header={<div><button type="button" onClick={onHeaderTap}>Header action</button></div>}
        footer={<button type="button">Foot action</button>}
      >
        <p>Body copy</p>
      </Sheet>
    </MantineProvider>,
  );
  const panel = screen.getByRole('dialog', { hidden: true });
  const handle = panel.querySelector(`.${classes.handle}`)!;
  const body = panel.querySelector(`.${classes.body}`)!;
  return { panel, handle, body, onClose, onHeaderTap };
}

/** A finger going from y0 to y1 in steps, in the given element. */
function drag(el: Element, y0: number, y1: number, x = 100) {
  touch(el, 'touchstart', x, y0);
  const step = (y1 - y0) / 4;
  let last: Event | null = null;
  for (let i = 1; i <= 4; i += 1) last = touch(el, 'touchmove', x, y0 + step * i);
  touch(el, 'touchend');
  return last!;
}

describe('Sheet swipe down', () => {
  it('closes when the handle is dragged past the distance threshold, moving the panel meanwhile', () => {
    const { panel, handle, onClose } = mount();
    touch(handle, 'touchstart', 100, 100);
    touch(handle, 'touchmove', 100, 200);
    expect(panel.style.translate).toBe('0 94px'); // 100px of travel less the 6px dead zone
    touch(handle, 'touchmove', 100, 400);
    touch(handle, 'touchend');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the pinned header too', () => {
    const { panel, onClose } = mount();
    drag(panel.querySelector('button')!, 50, 350);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a quick flick even over a short distance', () => {
    const { handle, onClose } = mount();
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (now += 10));
    drag(handle, 100, 160);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('springs back, and does not close, on a short slow drag', () => {
    const { panel, handle, onClose } = mount();
    drag(handle, 100, 150);
    expect(onClose).not.toHaveBeenCalled();
    expect(panel.style.translate).toBe('');
  });

  it('ignores an upward drag', () => {
    const { panel, handle, onClose } = mount();
    touch(handle, 'touchstart', 100, 300);
    touch(handle, 'touchmove', 100, 100);
    touch(handle, 'touchend');
    expect(panel.style.translate).toBe('');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves a tap on a header button alone', () => {
    const { panel, onClose, onHeaderTap } = mount();
    const button = panel.querySelector('button')!;
    touch(button, 'touchstart', 100, 100);
    touch(button, 'touchmove', 102, 104); // inside the dead zone
    touch(button, 'touchend');
    button.click();
    expect(onHeaderTap).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('pulls from the body only when it is scrolled to the very top', () => {
    const { body, onClose } = mount();
    drag(body.querySelector('p')!, 100, 400);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('never steals a scroll: a body scrolled down is left to scroll', () => {
    const { body, onClose } = mount();
    Object.defineProperty(body, 'scrollTop', { configurable: true, value: 40 });
    drag(body.querySelector('p')!, 100, 400);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves a sideways swipe in the body (a scrolling table) alone', () => {
    const { body, onClose } = mount();
    const p = body.querySelector('p')!;
    touch(p, 'touchstart', 100, 100);
    touch(p, 'touchmove', 220, 130);
    touch(p, 'touchend');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not take touches from the action foot', () => {
    const { panel, onClose } = mount();
    drag(panel.querySelector(`.${classes.footer} button`)!, 100, 500);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('abandons the drag when a second finger lands', () => {
    const { panel, handle, onClose } = mount();
    touch(handle, 'touchstart', 100, 100);
    touch(handle, 'touchmove', 100, 200);
    touch(handle, 'touchmove', 100, 400, [{ clientX: 200, clientY: 400 }]);
    touch(handle, 'touchend');
    expect(onClose).not.toHaveBeenCalled();
    expect(panel.style.translate).toBe('');
  });

  it('is off for the desktop side panel', () => {
    setDesktop(true);
    const { handle, onClose } = mount();
    drag(handle, 100, 500);
    expect(onClose).not.toHaveBeenCalled();
  });
});
