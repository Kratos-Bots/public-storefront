import { useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { TraceLog } from '@/lib/autofill-diag.ts';
import { formatTrace } from '@/lib/autofill-trace-format.ts';

// Developer tool, not shop UI: literal colours, inline styles and plain English on purpose (no text keys, no
// theme tokens), so it reads the same on every template and in a screenshot.

const SHOWN = 14;

interface TelegramWebApp { platform?: string; version?: string }

function headerLine(): string {
  const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
  const telegram = tg ? `tg=${tg.platform ?? '?'} ${tg.version ?? '?'}` : 'tg=none';
  let coarse = '?';
  try {
    coarse = String(window.matchMedia('(pointer: coarse)').matches);
  } catch {
    // matchMedia can be missing in odd WebViews.
  }
  return `${navigator.userAgent.slice(0, 80)}\n${telegram} coarse=${coarse}`;
}

const button = {
  font: 'inherit',
  color: '#000',
  background: '#ffe14d',
  border: 0,
  borderRadius: 3,
  padding: '4px 10px',
  minHeight: 28,
} as const;

export default function AutofillTracePanel({ log, onClose }: { log: TraceLog; onClose: () => void }) {
  const entries = useSyncExternalStore(log.subscribe, log.entries, log.entries);
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  const header = headerLine();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${header}\n${entries.map(formatTrace).join('\n')}`);
      setCopied('copied');
    } catch {
      setCopied('failed');
    }
  };

  return createPortal(
    <div
      data-sf-diag="autofill"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2147483647, pointerEvents: 'none' }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          boxSizing: 'border-box',
          maxHeight: '35vh',
          overflowY: 'auto',
          padding: '4px 6px',
          paddingTop: 'calc(4px + env(safe-area-inset-top, 0px))',
          background: '#000',
          color: '#fff',
          font: '11px/1.35 ui-monospace, Menlo, Consolas, monospace',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}
      >
        <div style={{ color: '#ffe14d' }}>{header}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '3px 0' }}>
          <button type="button" style={button} onClick={() => void copy()}>Copy</button>
          <button type="button" style={button} onClick={onClose}>Close</button>
          <span role="status">{copied === 'copied' ? 'copied' : copied === 'failed' ? 'copy failed' : ''}</span>
        </div>
        {entries.slice(-SHOWN).map((e, i) => (
          <div key={entries.length - SHOWN + i}>{formatTrace(e)}</div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
