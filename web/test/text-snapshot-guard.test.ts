/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SRC_ROOT, sourceFiles } from './helpers/text-scan.ts';
import { snapshotRenderReads, snapshotRenderReadsIn } from './helpers/text-snapshot-scan.ts';

const HELPERS = `import { textSnapshot } from '@/text/snapshot.ts';
export function label(s: string) { return textSnapshot().t(s); }
export function wrapped(s: string) { return label(s) + '!'; }
export function group(xs: string[], t = textSnapshot().t) { return xs.map(t); }
export const LABELS = { get a() { return textSnapshot().t('a'); } };
export function later() { return () => textSnapshot().t('a'); }`;
const scan = (component: string) =>
  snapshotRenderReads({ 'lib/h.ts': HELPERS, 'features/x/X.tsx': `import { label, wrapped, group, LABELS, later } from '@/lib/h.ts';\nimport { textSnapshot } from '@/text/snapshot.ts';\n${component}` })
    .map((r) => `${r.name}:${r.why}`);

describe('render-time textSnapshot reads (docs/builder.md, Text layer)', () => {
  it('flags a component that reads the snapshot during render without subscribing through useText', () => {
    expect(scan(`export function X() { return <p>{textSnapshot().t('a')}</p>; }`)).toEqual(['textSnapshot:no-useText']);
    expect(scan(`export const X = () => <p>{wrapped('a')}</p>;`)).toEqual(['wrapped:no-useText']);
    expect(scan(`export function useThing() { return label('a'); }`)).toEqual(['label:no-useText']);
    expect(scan(`export function X() { return <p>{LABELS.a}</p>; }`)).toEqual(['LABELS:no-useText']);
  });
  it('flags a useMemo that reads it without t in its deps', () => {
    expect(scan(`export function X({ xs }) { const { t } = useText(); const g = useMemo(() => group(xs), [xs]); return <p>{t('a')}{g}</p>; }`)).toEqual(['group:memo-without-t']);
    expect(scan(`export function X({ xs }) { const { t } = useText(); const g = useMemo(() => label(xs[0]), [xs, t]); return <p>{g}</p>; }`)).toEqual([]);
  });
  it('allows subscribed components, passed parameters, call-time callbacks and marked exceptions', () => {
    expect(scan(`export function X() { const { t } = useText(); return <p>{label(t('a'))}</p>; }`)).toEqual([]);
    expect(scan(`export function X({ xs }) { const g = useMemo(() => group(xs, t), [xs, t]); return <p>{g}</p>; }`)).toEqual([]);
    expect(scan(`export function X() { const f = later(); return <p onClick={f} />; }`)).toEqual([]);
    expect(scan(`export function X() { useEffect(() => { alert(label('a')); }, []); return <button onClick={() => wrapped('b')} />; }`)).toEqual([]);
    expect(scan(`export function X() {\n  // text-snapshot-ok: rendered once at boot, before any provider\n  return <p>{label('a')}</p>;\n}`)).toEqual([]);
  });
  it('text/snapshot.ts reaches nothing outside @/text/* and React (no import cycle, no TDZ)', () => {
    const seen = new Set<string>();
    const outside: string[] = [];
    const walk = (rel: string) => {
      if (seen.has(rel)) return;
      seen.add(rel);
      for (const m of readFileSync(path.join(SRC_ROOT, rel), 'utf8').matchAll(/^import\s[^;]*?from '([^']+)'/gm)) {
        const spec = m[1]!;
        if (spec === 'react') continue;
        if (spec.startsWith('@/text/') && spec !== '@/text/runtime.tsx') walk(spec.slice(2));
        else outside.push(`${rel} → ${spec}`);
      }
    };
    walk('text/snapshot.ts');
    expect(outside).toEqual([]);
    expect(seen.size).toBeGreaterThan(5);
  });
  it('web/src has no unreviewed render-time snapshot read', () => {
    const files = sourceFiles().filter((f) => !f.startsWith('text/'));
    expect(snapshotRenderReadsIn(files).map((r) => `${r.file}:${r.line} ${r.name} ${r.why}`)).toEqual([]);
  });
});
