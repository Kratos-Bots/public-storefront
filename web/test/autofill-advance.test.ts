import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AUTOFILL_ANIMATION, nextFieldToFill, watchAutofill } from '@/lib/autofill-advance.ts';

let root: HTMLElement;
let stop: (() => void) | undefined;
let pending: Array<() => void>;
const schedule = (run: () => void) => { pending.push(run); };
const settle = () => { const list = pending; pending = []; list.forEach((run) => run()); };

function field(name: string, opts: { optional?: boolean; token?: string | null; value?: string; type?: string } = {}): HTMLInputElement {
  const el = document.createElement('input');
  el.name = name;
  el.type = opts.type ?? 'text';
  if (opts.token !== null) el.setAttribute('autocomplete', opts.token ?? name);
  if (opts.optional) el.dataset.optional = 'true';
  if (opts.value) el.value = opts.value;
  root.appendChild(el);
  return el;
}

/** What the browser does to a field when it fills it from the saved profile. */
function autofill(el: HTMLInputElement, value: string, inputType?: string) {
  el.value = value;
  el.dispatchEvent(inputType ? new InputEvent('input', { bubbles: true, inputType, data: null }) : new Event('input', { bubbles: true }));
}

/** A real InputEvent of any inputType, into the field, leaving `value` in it. */
function inputEvent(el: HTMLInputElement, value: string, inputType: string) {
  el.value = value;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType, data: null }));
}

function type(el: HTMLInputElement, text: string) {
  for (const ch of text) {
    el.value += ch;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch }));
  }
}

// jsdom has no AnimationEvent.
const animationStart = () => Object.assign(new Event('animationstart', { bubbles: true }), { animationName: AUTOFILL_ANIMATION });

beforeEach(() => {
  touch = true;
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  pending = [];
});
afterEach(() => { stop?.(); stop = undefined; });

let touch = true;

function setup() {
  const first = field('given-name');
  const last = field('family-name');
  const email = field('email');
  const tel = field('tel');
  const line2 = field('address-line2', { optional: true });
  const coupon = field('coupon', { token: 'off' });
  stop = watchAutofill(root, { schedule, touch });
  return { first, last, email, tel, line2, coupon };
}

describe('autofill advance', () => {
  it('does not move focus on ordinary typing', () => {
    const { first } = setup();
    first.focus();
    type(first, 'Ada');
    settle();
    expect(document.activeElement).toBe(first);
  });

  it('does not move focus on a paste, even one that lands several characters at once', () => {
    const { first } = setup();
    first.focus();
    first.dispatchEvent(new Event('paste', { bubbles: true }));
    autofill(first, 'Ada Lovelace');
    settle();
    expect(document.activeElement).toBe(first);
    first.dispatchEvent(new Event('paste', { bubbles: true }));
    autofill(first, 'Ada Lovelace', 'insertFromPaste');
    settle();
    expect(document.activeElement).toBe(first);
  });

  it('moves to the fourth field when autofill filled three', () => {
    const { first, last, email, tel } = setup();
    first.focus();
    autofill(first, 'Ada', 'insertReplacementText');
    autofill(last, 'Lovelace', 'insertReplacementText');
    autofill(email, 'ada@example.com', 'insertReplacementText');
    expect(document.activeElement).toBe(first);
    settle();
    expect(document.activeElement).toBe(tel);
  });

  it('treats an input event with no inputType and a multi-character jump as autofill', () => {
    const { first, last } = setup();
    first.focus();
    autofill(first, 'Ada');
    settle();
    expect(document.activeElement).toBe(last);
  });

  it('skips optional fields and ones the browser must not fill', () => {
    const { first, last, email, tel, line2, coupon } = setup();
    first.focus();
    autofill(first, 'Ada');
    autofill(last, 'Lovelace');
    autofill(email, 'a@b.co');
    autofill(tel, '+447700900000');
    settle();
    expect(document.activeElement).not.toBe(line2);
    expect(document.activeElement).not.toBe(coupon);
  });

  it.each([
    ['insertCompositionText', 'Ada L'],
    ['insertText', 'Ada Lovelace'],
    ['', 'Ada Lovelace'],
    ['insertFromPaste', 'Ada Lovelace'],
    ['insertFromYank', 'Ada Lovelace'],
  ])('does not hop for a real InputEvent of type %j landing %j in an empty field', (inputType, value) => {
    const { first, last } = setup();
    first.focus();
    inputEvent(first, value, inputType);
    settle();
    expect(document.activeElement).toBe(first);
    expect(last.value).toBe('');
  });

  it('a remount with prefilled values followed by one typed character does not hop', () => {
    const { last } = setup();
    // Fields mounted after the watcher started, already holding saved values it never saw empty or full.
    const city = field('address-level2', { value: 'Leeds' });
    field('postal-code', { value: 'LS1 6BY' });
    last.focus();
    type(last, 'L');
    settle();
    expect(document.activeElement).toBe(last);
    expect(city.value).toBe('Leeds');
  });

  it('a stale record of a remounted prefilled field cannot authorise a hop on its own', () => {
    const { first } = setup();
    field('address-level2', { value: 'Leeds' });
    first.focus();
    first.dispatchEvent(animationStart());
    settle();
    expect(document.activeElement).toBe(first);
  });

  it('hops when the fill started in the field the cursor is in and nothing else was filled', () => {
    const { first, last } = setup();
    first.focus();
    inputEvent(first, 'Ada', 'insertReplacementText');
    settle();
    expect(document.activeElement).toBe(last);
  });

  it('never picks a hidden field as the next one', () => {
    const { first, last, email } = setup();
    last.checkVisibility = () => false;
    first.focus();
    autofill(first, 'Ada');
    settle();
    expect(document.activeElement).toBe(email);
  });

  it('does not drop focus to the page on a device with a keyboard and mouse', () => {
    touch = false;
    const { first, last, email, tel } = setup();
    first.focus();
    autofill(first, 'Ada');
    autofill(last, 'Lovelace');
    autofill(email, 'a@b.co');
    autofill(tel, '+447700900000');
    settle();
    expect(document.activeElement).toBe(first);
  });

  it('still hops to the next field on a desktop', () => {
    touch = false;
    const { first, last } = setup();
    first.focus();
    autofill(first, 'Ada');
    settle();
    expect(document.activeElement).toBe(last);
  });

  it('blurs when nothing required is left, so the keyboard closes', () => {
    const { first, last, email, tel } = setup();
    first.focus();
    autofill(first, 'Ada');
    autofill(last, 'Lovelace');
    autofill(email, 'a@b.co');
    autofill(tel, '+447700900000');
    settle();
    expect(document.activeElement).toBe(document.body);
  });

  it('leaves focus on a field the customer tapped before the browser finished', () => {
    const { first, last, email } = setup();
    first.focus();
    autofill(first, 'Ada');
    email.focus();
    settle();
    expect(document.activeElement).toBe(email);
    expect(last.value).toBe('');
  });

  it('does not move when the customer edits a field that already had a value', () => {
    const { first, last } = setup();
    first.focus();
    type(first, 'Ad');
    settle();
    // iOS autocorrect or a spelling suggestion replaces the word in a field that was not empty.
    autofill(first, 'Adam', 'insertReplacementText');
    settle();
    expect(document.activeElement).toBe(first);
    expect(last.value).toBe('');
  });

  it('catches a fill that sets the value without an input event, from the autofill animation', () => {
    const { first, last } = setup();
    first.focus();
    first.value = 'Ada';
    const seen: string[] = [];
    first.addEventListener('input', () => seen.push('input'));
    first.dispatchEvent(animationStart());
    settle();
    expect(document.activeElement).toBe(last);
    // React only learns a value from an input event, so the hook sends the one the browser skipped.
    expect(seen).toEqual(['input']);
  });

  it('ignores a fill preview, where the animation runs but no value lands', () => {
    const { first } = setup();
    first.focus();
    first.dispatchEvent(animationStart());
    settle();
    expect(document.activeElement).toBe(first);
  });

  it('stops listening once cleaned up', () => {
    const { first, last } = setup();
    stop?.();
    stop = undefined;
    first.focus();
    autofill(first, 'Ada');
    settle();
    expect(document.activeElement).not.toBe(last);
  });
});

describe('nextFieldToFill', () => {
  it('prefers the next empty required field after the anchor, then any earlier one', () => {
    const a = field('given-name');
    const b = field('family-name', { value: 'x' });
    const c = field('email');
    expect(nextFieldToFill(root, a)).toBe(c);
    a.value = 'v';
    c.value = 'v';
    b.value = '';
    expect(nextFieldToFill(root, c)).toBe(b);
  });

  it('ignores checkboxes, radios, disabled and read-only fields', () => {
    const a = field('given-name');
    field('x', { type: 'checkbox', token: 'email' });
    const dis = field('y'); dis.disabled = true;
    const ro = field('z'); ro.readOnly = true;
    expect(nextFieldToFill(root, a)).toBeNull();
  });
});
