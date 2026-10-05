import type { AutofillTrace } from '@/lib/autofill-advance.ts';

const yn = (v: boolean) => (v ? 'Y' : 'N');
const tf = (v: boolean) => (v ? 'T' : 'F');

/** Y or N, or ? when the browser supports neither autofill selector. */
function autofillMark(autofill: boolean | null, webkit: boolean | null): string {
  if (autofill === null && webkit === null) return '?';
  return yn(autofill === true || webkit === true);
}

/**
 * One compact line. Event entries:
 *   +1234 input InputEvent T insertText c=F d=14 0>14 address-line1 af=N filled=N
 * Settle entries:
 *   +1500 SETTLE hop n=2 [given-name,family-name] focused=Y next=email now=Y 300ms=N
 *   +1500 SETTLE none:stale-only n=1 [address-level2] focused=N next=none
 */
export function formatTrace(e: AutofillTrace): string {
  if (e.kind === 'event') {
    const c = e.composing === null ? '-' : tf(e.composing);
    const before = e.before < 0 ? '?' : String(e.before);
    return `+${e.t} ${e.type} ${e.ctor} ${tf(e.trusted)} ${e.inputType} c=${c} d=${e.dataLen} ${before}>${e.after} ${e.token} af=${autofillMark(e.autofill, e.webkitAutofill)} filled=${yn(e.looksFilled)}`;
  }
  const action = e.reason ? `${e.action}:${e.reason}` : e.action;
  const head = `+${e.t} SETTLE ${action} n=${e.filledCount} [${e.filledTokens.join(',')}] focused=${yn(e.includedFocused)} next=${e.next}`;
  return e.focusedNow === undefined ? head : `${head} now=${yn(e.focusedNow)} 300ms=${yn(e.focused300 === true)}`;
}
