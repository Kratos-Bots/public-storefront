import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTapCounter, createTraceLog, readDiagFlag, DIAG_KEY } from '@/lib/autofill-diag.ts';
import { useAutofillDiag } from '@/lib/use-autofill-diag.tsx';

// The factory only runs when something imports the module, so its call count is the "chunk was fetched" signal.
const panelLoaded = vi.hoisted(() => vi.fn());
vi.mock('@/features/diagnostics/AutofillTracePanel.tsx', async (importOriginal) => {
  panelLoaded();
  return importOriginal();
});

const setUrl = (search: string) => window.history.replaceState(null, '', `/checkout${search}`);

beforeEach(() => {
  window.sessionStorage.clear();
  setUrl('');
  panelLoaded.mockClear();
});
afterEach(() => cleanup());

describe('the diagnostic switch', () => {
  it('?sfdiag=autofill turns it on and is remembered for the tab', () => {
    setUrl('?sfdiag=autofill');
    expect(readDiagFlag()).toBe(true);
    expect(window.sessionStorage.getItem(DIAG_KEY)).toBe('autofill');
    setUrl('');
    expect(readDiagFlag()).toBe(true);
  });

  it('is off with no parameter, no stored flag, or another value', () => {
    expect(readDiagFlag()).toBe(false);
    setUrl('?sfdiag=other');
    expect(readDiagFlag()).toBe(false);
    expect(window.sessionStorage.getItem(DIAG_KEY)).toBeNull();
  });

  it('survives storage that throws', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readDiagFlag()).toBe(false);
    setUrl('?sfdiag=autofill');
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readDiagFlag()).toBe(true);
    get.mockRestore();
    set.mockRestore();
  });

  describe('the tap counter', () => {
    const counter = () => {
      let at = 0;
      const trigger = vi.fn();
      const tap = createTapCounter(trigger, () => at);
      return { trigger, tap, at: (ms: number) => { at = ms; } };
    };

    it('fires on the seventh tap inside three seconds', () => {
      const { trigger, tap, at } = counter();
      for (let i = 0; i < 7; i++) { at(i * 400); tap(); }
      expect(trigger).toHaveBeenCalledTimes(1);
    });

    it('does nothing for six taps', () => {
      const { trigger, tap, at } = counter();
      for (let i = 0; i < 6; i++) { at(i * 100); tap(); }
      expect(trigger).not.toHaveBeenCalled();
    });

    it('does nothing for slow taps', () => {
      const { trigger, tap, at } = counter();
      for (let i = 0; i < 12; i++) { at(i * 600); tap(); }
      expect(trigger).not.toHaveBeenCalled();
    });

    it('needs a fresh seven after it has fired', () => {
      const { trigger, tap, at } = counter();
      for (let i = 0; i < 8; i++) { at(i * 100); tap(); }
      expect(trigger).toHaveBeenCalledTimes(1);
    });
  });
});

function Harness() {
  const diag = useAutofillDiag();
  return (
    <div>
      <span data-testid="count" onPointerUp={diag.onTap}>Step 2 of 5</span>
      <span data-testid="traced">{diag.onTrace ? 'traced' : 'plain'}</span>
      {diag.panel}
    </div>
  );
}

const tapSeven = () => { for (let i = 0; i < 7; i++) fireEvent.pointerUp(screen.getByTestId('count')); };

describe('the diagnostic in the checkout', () => {
  it('imports no panel code while the flag is off, and six taps do not change that', async () => {
    render(<Harness />);
    for (let i = 0; i < 6; i++) fireEvent.pointerUp(screen.getByTestId('count'));
    await act(async () => { await Promise.resolve(); });
    expect(panelLoaded).not.toHaveBeenCalled();
    expect(screen.getByTestId('traced').textContent).toBe('plain');
    expect(document.querySelector('[data-sf-diag]')).toBeNull();
  });

  it('seven quick taps set the flag, feed the watcher and load the panel', async () => {
    render(<Harness />);
    act(tapSeven);
    expect(window.sessionStorage.getItem(DIAG_KEY)).toBe('autofill');
    expect(screen.getByTestId('traced').textContent).toBe('traced');
    await waitFor(() => expect(document.querySelector('[data-sf-diag="autofill"]')).not.toBeNull());
    expect(panelLoaded).toHaveBeenCalled();
  });

  it('Close clears the flag and removes the panel', async () => {
    setUrl('?sfdiag=autofill');
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    expect(window.sessionStorage.getItem(DIAG_KEY)).toBeNull();
    expect(document.querySelector('[data-sf-diag]')).toBeNull();
    expect(screen.getByTestId('traced').textContent).toBe('plain');
  });
});

describe('the panel', () => {
  const event = (t: number) => ({
    kind: 'event' as const, t, type: 'input', ctor: 'InputEvent', trusted: true, inputType: 'insertText', composing: false, dataLen: 1,
    name: 'address-line1', token: 'address-line1', before: 0, after: 1, autofill: false, webkitAutofill: null, looksFilled: false,
  });

  it('shows the last 14 entries, and Copy writes them all, reporting the result', async () => {
    const log = createTraceLog();
    for (let i = 0; i < 20; i++) log.push(event(i));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { default: AutofillTracePanel } = await vi.importActual<typeof import('@/features/diagnostics/AutofillTracePanel.tsx')>('@/features/diagnostics/AutofillTracePanel.tsx');
    render(<AutofillTracePanel log={log} onClose={() => {}} />);
    expect(screen.getAllByText(/^\+\d+ input InputEvent T insertText c=F d=1 0>1 address-line1 af=N filled=N$/)).toHaveLength(14);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await screen.findByText('copied');
    expect((writeText.mock.calls[0]![0] as string).split('\n').filter((l) => l.startsWith('+'))).toHaveLength(20);

    writeText.mockRejectedValue(new Error('denied'));
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await screen.findByText('copy failed');
  });
});
