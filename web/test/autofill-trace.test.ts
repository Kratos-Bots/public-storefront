import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTOFILL_ANIMATION, watchAutofill, type AutofillSettleTrace, type AutofillTrace } from '@/lib/autofill-advance.ts';
import { formatTrace } from '@/lib/autofill-trace-format.ts';

let root: HTMLElement;
let stop: (() => void) | undefined;
let pending: Array<() => void>;
let trace: AutofillTrace[];
const schedule = (run: () => void) => { pending.push(run); };
const settle = () => { const list = pending; pending = []; list.forEach((run) => run()); };
const settles = () => trace.filter((e): e is AutofillSettleTrace => e.kind === 'settle');

function field(name: string, opts: { value?: string; optional?: boolean } = {}): HTMLInputElement {
  const el = document.createElement('input');
  el.name = name;
  el.setAttribute('autocomplete', name);
  if (opts.optional) el.dataset.optional = 'true';
  if (opts.value) el.value = opts.value;
  root.appendChild(el);
  return el;
}

function fill(el: HTMLInputElement, value: string, inputType = 'insertReplacementText') {
  el.value = value;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType, data: null }));
}

const animationStart = () => Object.assign(new Event('animationstart', { bubbles: true }), { animationName: AUTOFILL_ANIMATION });

beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  pending = [];
  trace = [];
  vi.useFakeTimers();
});
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
});

const watch = (opts: { touch?: boolean } = {}) => { stop = watchAutofill(root, { schedule, touch: true, ...opts, onTrace: (e) => trace.push(e) }); };

describe('autofill trace entries', () => {
  it('describes an event with lengths and tokens, never the value', () => {
    const first = field('given-name');
    watch();
    first.focus();
    first.value = 'SECRET-VALUE';
    first.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'SECRET-VALUE' }));
    const entry = trace.find((e) => e.kind === 'event' && e.type === 'input');
    expect(entry).toMatchObject({
      kind: 'event', type: 'input', ctor: 'InputEvent', trusted: false, inputType: 'insertText',
      dataLen: 12, before: 0, after: 12, token: 'given-name', name: 'given-name', looksFilled: false,
    });
    for (const e of trace) expect(JSON.stringify(e) + formatTrace(e)).not.toContain('SECRET');
  });

  it('reports -1 for absent data, (none) for a missing inputType and the plain Event constructor', () => {
    const first = field('given-name');
    watch();
    first.value = 'Ada Lovelace';
    first.dispatchEvent(new Event('input', { bubbles: true }));
    expect(trace.at(-1)).toMatchObject({ ctor: 'Event', inputType: '(none)', dataLen: -1, composing: null, looksFilled: true });
  });

  it('records every event type the brief lists, on text fields only', () => {
    const first = field('given-name');
    const box = document.createElement('input');
    box.type = 'checkbox';
    root.appendChild(box);
    watch();
    first.focus();
    for (const type of ['beforeinput', 'change', 'paste', 'compositionstart', 'compositionend']) first.dispatchEvent(new Event(type, { bubbles: true }));
    first.dispatchEvent(animationStart());
    first.dispatchEvent(Object.assign(new Event('animationstart', { bubbles: true }), { animationName: 'other' }));
    box.dispatchEvent(new Event('change', { bubbles: true }));
    expect(trace.map((e) => (e.kind === 'event' ? e.type : 'settle'))).toEqual([
      'focusin', 'beforeinput', 'change', 'paste', 'compositionstart', 'compositionend', 'animationstart',
    ]);
  });

  it('tolerates a browser that rejects the autofill selectors', () => {
    const first = field('given-name');
    watch();
    first.matches = () => { throw new SyntaxError('unsupported'); };
    first.dispatchEvent(new Event('change', { bubbles: true }));
    expect(trace.at(-1)).toMatchObject({ autofill: null, webkitAutofill: null });
    expect(formatTrace(trace.at(-1)!)).toContain('af=?');
  });

  it('offsets time from the first entry', () => {
    const first = field('given-name');
    watch();
    vi.setSystemTime(Date.now());
    first.dispatchEvent(new Event('change', { bubbles: true }));
    const [a] = trace;
    expect(a!.t).toBe(0);
  });
});

describe('autofill trace settle entries', () => {
  it('a hop yields one settle entry with action hop and both focus checks', () => {
    const first = field('given-name');
    const last = field('family-name');
    watch();
    first.focus();
    fill(first, 'Ada');
    settle();
    expect(document.activeElement).toBe(last);
    // The entry waits for the 300 ms recheck.
    expect(settles()).toHaveLength(0);
    vi.advanceTimersByTime(300);
    expect(settles()).toEqual([
      expect.objectContaining({
        action: 'hop', filledCount: 1, filledTokens: ['given-name'], includedFocused: true, next: 'family-name',
        focusedNow: true, focused300: true,
      }),
    ]);
    expect(settles()[0]).not.toHaveProperty('reason');
  });

  it('reports a focus the WebView took back', () => {
    const first = field('given-name');
    const last = field('family-name');
    watch();
    first.focus();
    fill(first, 'Ada');
    settle();
    first.focus();
    vi.advanceTimersByTime(300);
    expect(settles()[0]).toMatchObject({ action: 'hop', focusedNow: true, focused300: false });
    expect(last.value).toBe('');
  });

  it('a blur is its own action', () => {
    const first = field('given-name');
    watch();
    first.focus();
    fill(first, 'Ada');
    settle();
    expect(settles()).toEqual([expect.objectContaining({ action: 'blur', next: 'none' })]);
  });

  it('no-pending: the same scheduled settle running twice', () => {
    const first = field('given-name');
    const runs: Array<() => void> = [];
    stop = watchAutofill(root, { schedule: (fn) => { runs.push(fn); }, touch: true, onTrace: (e) => trace.push(e) });
    first.focus();
    fill(first, 'Ada');
    runs[0]!();
    runs[0]!();
    expect(settles().map((x) => x.reason)).toEqual([undefined, 'no-pending']);
  });

  it('nothing-filled: a fill preview, where the animation runs but no value lands', () => {
    const first = field('given-name');
    watch();
    first.focus();
    first.dispatchEvent(animationStart());
    settle();
    expect(settles()).toEqual([expect.objectContaining({ action: 'none', reason: 'nothing-filled', filledCount: 0 })]);
  });

  it('focus-moved: the shopper tapped elsewhere meanwhile', () => {
    const first = field('given-name');
    const email = field('email');
    watch();
    first.focus();
    fill(first, 'Ada');
    email.focus();
    settle();
    expect(settles()).toEqual([expect.objectContaining({ action: 'none', reason: 'focus-moved', filledCount: 1, includedFocused: true })]);
  });

  it('stale-only: a prefilled field remounted after the watcher started', () => {
    const first = field('given-name');
    watch();
    // Focus first: a later focusin would record the new field's value as known.
    first.focus();
    field('address-level2', { value: 'Leeds' });
    first.dispatchEvent(animationStart());
    settle();
    expect(settles()).toEqual([
      expect.objectContaining({ action: 'none', reason: 'stale-only', filledCount: 1, filledTokens: ['address-level2'], includedFocused: false }),
    ]);
  });

  it('no-next-and-not-touch: nothing left to fill on a desktop', () => {
    const first = field('given-name');
    watch({ touch: false });
    first.focus();
    fill(first, 'Ada');
    settle();
    expect(settles()).toEqual([expect.objectContaining({ action: 'none', reason: 'no-next-and-not-touch', next: 'none' })]);
    expect(document.activeElement).toBe(first);
  });

  it('formats a settle line', () => {
    expect(formatTrace({
      kind: 'settle', t: 1500, filledCount: 2, filledTokens: ['a', 'b'], includedFocused: true, next: 'email', action: 'hop', focusedNow: true, focused300: false,
    })).toBe('+1500 SETTLE hop n=2 [a,b] focused=Y next=email now=Y 300ms=N');
    expect(formatTrace({
      kind: 'settle', t: 9, filledCount: 0, filledTokens: [], includedFocused: false, next: 'none', action: 'none', reason: 'nothing-filled',
    })).toBe('+9 SETTLE none:nothing-filled n=0 [] focused=N next=none');
  });
});

describe('without onTrace', () => {
  it('still hops and listens to the same four events only', () => {
    const first = field('given-name');
    const last = field('family-name');
    const add = vi.spyOn(root, 'addEventListener');
    stop = watchAutofill(root, { schedule, touch: true });
    expect(add.mock.calls.map((c) => c[0]).sort()).toEqual(['animationstart', 'focusin', 'input', 'paste']);
    first.focus();
    fill(first, 'Ada');
    settle();
    expect(document.activeElement).toBe(last);
    vi.advanceTimersByTime(1000);
  });
});
