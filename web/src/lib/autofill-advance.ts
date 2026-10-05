/**
 * After the system fills a field (iOS AutoFill, Chrome, a password manager) the customer should land on the
 * next thing they have to type, or, with nothing left, have the keyboard close so Continue is in view.
 *
 * Two signals, because neither covers every browser on its own:
 * - an `input` event that looks like a fill: `inputType` of `insertReplacementText`, or no `inputType` at all
 *   with the value jumping by more than a character, never right after a paste, and only into a field that was
 *   empty (iOS autocorrect and spelling suggestions also send `insertReplacementText`, but into a word that is
 *   already there);
 * - `animationstart` of `sf-autofill`, which global.css runs on `:autofill` / `:-webkit-autofill`. Chromium
 *   sometimes sets the value without any input event, and this one still fires. During Chrome's fill preview it
 *   fires too, but no value has landed yet, so nothing is "filled" when the check runs and nothing happens.
 *
 * The check itself runs a couple of frames later, once the browser has finished filling the whole group.
 */
export const AUTOFILL_ANIMATION = 'sf-autofill';

type Field = HTMLInputElement | HTMLTextAreaElement;

const NOT_TEXT = new Set(['checkbox', 'radio', 'hidden', 'submit', 'button', 'file', 'range', 'color', 'image', 'reset']);

function isTextField(el: unknown): el is Field {
  if (el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && !NOT_TEXT.has(el.type);
}

function textFields(root: ParentNode): Field[] {
  return Array.from(root.querySelectorAll('input, textarea')).filter(isTextField);
}

/** Empty, required for the step, and one the browser is allowed to fill (`autocomplete="off"` fields, such as a coupon, are not part of the form's identity). */
function needsValue(el: Field): boolean {
  const token = el.getAttribute('autocomplete');
  // checkVisibility is missing in jsdom and older WebViews; a field rendered at all is then taken as visible.
  if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) return false;
  return el.value === '' && !!token && token !== 'off' && !el.disabled && !el.readOnly && el.dataset.optional !== 'true';
}

/** The next empty required field after `anchor` in page order, else any earlier one, else null. */
export function nextFieldToFill(root: ParentNode, anchor: Field): Field | null {
  const open = textFields(root).filter((f) => f !== anchor && needsValue(f));
  const after = open.find((f) => anchor.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING);
  return after ?? open[0] ?? null;
}

export interface WatchOptions {
  /** Runs `fn` after the browser has finished filling. Two animation frames by default. */
  schedule?: (fn: () => void) => void;
  /** Whether the device is a touch screen (a coarse pointer by default). Only there is the keyboard closed when nothing is left. */
  touch?: boolean;
}

function afterTwoFrames(fn: () => void) {
  if (typeof requestAnimationFrame !== 'function') {
    setTimeout(fn, 50);
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

/** Watches `root` for system fills; returns the cleanup. */
export function watchAutofill(root: HTMLElement, { schedule = afterTwoFrames, touch }: WatchOptions = {}): () => void {
  // What each field held when the customer last arrived or typed: the "before" a fill is measured against.
  const known = new WeakMap<Field, string>();
  const remember = () => textFields(root).forEach((f) => known.set(f, f.value));
  let pasted = false;
  let syncing = false;
  let pending: { focus: Element | null } | null = null;

  remember();

  const settle = () => {
    const fill = pending;
    pending = null;
    if (!fill) return;
    const all = textFields(root);
    const filled = all.filter((f) => (known.get(f) ?? '') === '' && f.value !== '');
    all.forEach((f) => known.set(f, f.value));
    if (filled.length === 0) return;
    const hasFill = filled.includes(fill.focus as Field) || filled.length > 1;
    // React only learns a value from an input event; some browsers fill without one. A repeat is ignored by React.
    syncing = true;
    try {
      filled.forEach((f) => f.dispatchEvent(new Event('input', { bubbles: true })));
    } finally {
      syncing = false;
    }
    const active = document.activeElement;
    // The customer tapped somewhere else while the browser was filling: that field keeps focus.
    if (active !== fill.focus || !isTextField(active) || !root.contains(active)) return;
    // A stale record (a remounted or prefilled field) must not authorise a hop alone: the fill has to include
    // the field the cursor was in, or be a group.
    if (!hasFill) return;
    const next = nextFieldToFill(root, active);
    if (next) next.focus();
    else if (touch ?? window.matchMedia('(pointer: coarse)').matches) active.blur();
  };

  const start = () => {
    if (pending) return;
    pending = { focus: document.activeElement };
    schedule(settle);
  };

  const onFocusIn = () => {
    if (!pending) remember();
  };
  const onPaste = () => {
    pasted = true;
  };
  const onInput = (e: Event) => {
    if (syncing || !isTextField(e.target)) return;
    const target = e.target;
    const before = known.get(target) ?? '';
    const type = (e as InputEvent).inputType;
    // A plain Event('input') comes only from scripts and password-manager extensions; a real keyboard, voice or
    // predictive-text path always sends an InputEvent, whatever its inputType (it can even be empty).
    const synthetic = !(e instanceof InputEvent);
    const wasPaste = pasted;
    pasted = false;
    const looksFilled = !wasPaste && before === '' && (type === 'insertReplacementText' || (synthetic && target.value.length > 1));
    if (looksFilled) start();
    else if (!pending) known.set(target, target.value);
  };
  const onAnimation = (e: Event) => {
    if ((e as AnimationEvent).animationName === AUTOFILL_ANIMATION && isTextField(e.target)) start();
  };

  root.addEventListener('focusin', onFocusIn);
  root.addEventListener('paste', onPaste, true);
  root.addEventListener('input', onInput, true);
  root.addEventListener('animationstart', onAnimation, true);
  return () => {
    root.removeEventListener('focusin', onFocusIn);
    root.removeEventListener('paste', onPaste, true);
    root.removeEventListener('input', onInput, true);
    root.removeEventListener('animationstart', onAnimation, true);
  };
}
