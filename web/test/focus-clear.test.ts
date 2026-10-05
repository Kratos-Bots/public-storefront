import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchFocusedField } from '@/lib/keep-field-clear.ts';

// A phone: 390 x 844, a 300px keyboard leaving 544px visible, a 76px bar at the foot, a 56px header on top.
class FakeViewport extends EventTarget {
  height = 844;
  offsetTop = 0;
}

let vv: FakeViewport;
let stop: (() => void) | undefined;
let reduced = false;
let winScroll: ReturnType<typeof vi.fn>;

function rect(top: number, height = 44) {
  return { top, bottom: top + height, left: 0, right: 300, width: 300, height, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
}

function field(top: number, parent: HTMLElement = document.body): HTMLInputElement {
  const el = document.createElement('input');
  el.type = 'text';
  el.getBoundingClientRect = () => rect(top);
  el.style.setProperty('scroll-margin-top', '56px');
  el.style.setProperty('scroll-margin-bottom', '16px');
  parent.appendChild(el);
  return el;
}

/** The keyboard opening: the visible height shrinks and the browser says so. */
function openKeyboard(height = 544) {
  vv.height = height;
  vv.dispatchEvent(new Event('resize'));
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  vv = new FakeViewport();
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
  document.documentElement.style.setProperty('scroll-padding-bottom', '76px');
  reduced = false;
  window.matchMedia = ((q: string) => ({ matches: q.includes('reduce') ? reduced : q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  winScroll = vi.fn();
  window.scrollBy = winScroll as unknown as typeof window.scrollBy;
});
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
  document.documentElement.style.removeProperty('scroll-padding-bottom');
});

describe('keeping a focused field clear', () => {
  it('scrolls a field hidden under the bar into the upper middle of the visible area', () => {
    stop = watchFocusedField();
    const el = field(740); // 740..784: under the 76px bar (limit 844 - 76 - 16 = 752) once the keyboard is up
    el.focus();
    openKeyboard();
    vi.advanceTimersByTime(400);
    expect(winScroll).toHaveBeenCalledTimes(1);
    const arg = winScroll.mock.calls[0]![0] as ScrollToOptions;
    // Visible band: top 56, bottom 544 - 76 - 16 = 452; target centre = 56 + 0.4 * 396 = 214; field centre 762.
    expect(arg.top).toBeCloseTo(762 - 214, 0);
    expect(arg.behavior).toBe('smooth');
  });

  it('does nothing when the field is already fully visible', () => {
    stop = watchFocusedField();
    const el = field(200);
    el.focus();
    openKeyboard();
    vi.advanceTimersByTime(400);
    expect(winScroll).not.toHaveBeenCalled();
  });

  it('also moves a field sitting under the sticky header', () => {
    stop = watchFocusedField();
    const el = field(20);
    el.focus();
    vi.advanceTimersByTime(400);
    expect(winScroll).toHaveBeenCalledTimes(1);
    expect((winScroll.mock.calls[0]![0] as ScrollToOptions).top!).toBeLessThan(0);
  });

  it('acts once per focus, however many viewport resizes follow', () => {
    stop = watchFocusedField();
    const el = field(740);
    el.focus();
    openKeyboard();
    vi.advanceTimersByTime(400);
    openKeyboard(500);
    vi.advanceTimersByTime(400);
    expect(winScroll).toHaveBeenCalledTimes(1);
    // A new focus is a new decision.
    el.blur();
    el.focus();
    vi.advanceTimersByTime(400);
    expect(winScroll).toHaveBeenCalledTimes(2);
  });

  it('waits out a keyboard that is still sliding up', () => {
    stop = watchFocusedField();
    const el = field(740);
    el.focus();
    openKeyboard(700);
    vi.advanceTimersByTime(60);
    openKeyboard(600);
    vi.advanceTimersByTime(60);
    expect(winScroll).not.toHaveBeenCalled();
    openKeyboard(544);
    vi.advanceTimersByTime(400);
    expect(winScroll).toHaveBeenCalledTimes(1);
  });

  it('falls back to a short delay where there is no visualViewport', () => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
    stop = watchFocusedField();
    const el = field(830);
    el.focus();
    vi.advanceTimersByTime(400);
    expect(winScroll).toHaveBeenCalledTimes(1);
  });

  it('scrolls the dialog, not the page, for a field inside a scrollable dialog', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.style.overflowY = 'auto';
    Object.defineProperty(dialog, 'scrollHeight', { value: 900 });
    Object.defineProperty(dialog, 'clientHeight', { value: 500 });
    dialog.getBoundingClientRect = () => rect(100, 500);
    const by = vi.fn();
    dialog.scrollBy = by as unknown as typeof dialog.scrollBy;
    document.body.appendChild(dialog);
    stop = watchFocusedField();
    const el = field(560, dialog); // inside the dialog's box but past its visible band
    el.focus();
    openKeyboard();
    vi.advanceTimersByTime(400);
    expect(by).toHaveBeenCalledTimes(1);
    expect(winScroll).not.toHaveBeenCalled();
  });

  it('leaves the page alone for a field in a dialog that does not scroll', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    stop = watchFocusedField();
    const el = field(740, dialog);
    el.focus();
    openKeyboard();
    vi.advanceTimersByTime(400);
    expect(winScroll).not.toHaveBeenCalled();
  });

  it('does not smooth-scroll for a shopper who asked for reduced motion', () => {
    reduced = true;
    stop = watchFocusedField();
    const el = field(740);
    el.focus();
    openKeyboard();
    vi.advanceTimersByTime(400);
    expect((winScroll.mock.calls[0]![0] as ScrollToOptions).behavior).toBe('auto');
  });

  it('does not fight a shopper who is already scrolling', () => {
    stop = watchFocusedField();
    const el = field(740);
    el.focus();
    document.dispatchEvent(new Event('touchmove', { bubbles: true }));
    openKeyboard();
    vi.advanceTimersByTime(400);
    expect(winScroll).not.toHaveBeenCalled();
  });

  it('does not move the page for a field inside a sticky ancestor (the header search)', () => {
    const header = document.createElement('header');
    header.style.position = 'sticky';
    document.body.appendChild(header);
    stop = watchFocusedField();
    const el = field(10, header);
    el.focus();
    openKeyboard();
    vi.advanceTimersByTime(400);
    expect(winScroll).not.toHaveBeenCalled();
  });

  it('does not move the page for a field inside a fixed ancestor', () => {
    const bar = document.createElement('div');
    bar.style.position = 'fixed';
    document.body.appendChild(bar);
    stop = watchFocusedField();
    const el = field(740, bar);
    el.focus();
    openKeyboard();
    vi.advanceTimersByTime(400);
    expect(winScroll).not.toHaveBeenCalled();
  });

  it('does nothing if focus moved on before the keyboard settled', () => {
    stop = watchFocusedField();
    const el = field(740);
    el.focus();
    el.blur();
    openKeyboard();
    vi.advanceTimersByTime(400);
    expect(winScroll).not.toHaveBeenCalled();
  });

  it('stays out of the way on a mouse-and-keyboard device', () => {
    stop = watchFocusedField({ touch: false });
    const el = field(740);
    el.focus();
    vi.advanceTimersByTime(400);
    expect(winScroll).not.toHaveBeenCalled();
  });

  it('ignores checkboxes and buttons', () => {
    stop = watchFocusedField();
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.getBoundingClientRect = () => rect(740);
    document.body.appendChild(box);
    box.focus();
    vi.advanceTimersByTime(400);
    expect(winScroll).not.toHaveBeenCalled();
  });
});
