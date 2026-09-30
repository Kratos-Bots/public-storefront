/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SRC_ROOT } from './helpers/text-scan.ts';
import { formsOf, placeholdersOf } from '@/text/define.ts';
import { checkValue } from '@/text/resolve.ts';
import { matchesTextPattern, TEXT_AREAS, TEXT_ENTRIES } from '@/text/registry.ts';
import { SITE_WIDE_TEXT } from '@/text/site-wide.ts';
import { BLOCKS } from '@/builder/registry.ts';
import { DEFAULT_MAX, KEY_RE, TEXT_LIMITS } from '@/text/types.ts';
import { readdirSync } from 'node:fs';

const keys = Object.keys(TEXT_ENTRIES);
const srcFiles = (dir = SRC_ROOT): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const abs = path.join(dir, d.name);
  if (d.isDirectory()) return abs.includes(`${path.sep}text${path.sep}keys`) ? [] : srcFiles(abs);
  return /\.(ts|tsx)$/.test(d.name) ? [abs] : [];
});

describe('text registry (spec §6.6)', () => {
  it('keys are well-formed and belong to a known area', () => {
    for (const k of keys) {
      expect(KEY_RE.test(k) && k.length <= TEXT_LIMITS.key, k).toBe(true);
      expect(TEXT_AREAS, k).toContain(k.slice(0, k.indexOf('.')));
    }
  });
  it('fixed exactly for closed.* and boot.*', () => {
    for (const k of keys) expect(Boolean(TEXT_ENTRIES[k]!.fixed), k).toBe(k.startsWith('closed.') || k.startsWith('boot.'));
  });
  it('every default passes checkValue (fixed keys: shape only) and fits its max', () => {
    for (const k of keys) {
      const e = TEXT_ENTRIES[k]!;
      const max = e.max ?? DEFAULT_MAX;
      expect(max <= TEXT_LIMITS.value, k).toBe(true);
      for (const f of formsOf(e.en)) expect(f.length <= max, `${k}: ${f.length} > ${max}`).toBe(true);
      expect(placeholdersOf(e).size <= TEXT_LIMITS.placeholders, k).toBe(true);
      if (!e.fixed) expect(checkValue(k, e.en), k).toEqual({ ok: true });
      expect(e.note && e.note.length > 5, `${k} needs a note`).toBe(true);
    }
  });
  it('no orphans: every non-fixed key is referenced as a literal under web/src (outside text/keys)', () => {
    const corpus = srcFiles().map((f) => readFileSync(f, 'utf8')).join('\n');
    const orphans = keys.filter((k) => !TEXT_ENTRIES[k]!.fixed && !corpus.includes(`'${k}'`) && !corpus.includes(`"${k}"`));
    expect(orphans).toEqual([]);
  });
  it('every non-fixed key is covered by a block\'s text patterns or the site-wide group', () => {
    const patterns = [...SITE_WIDE_TEXT, ...Object.values(BLOCKS).flatMap((b) => b.text ?? [])];
    expect(keys.filter((k) => !TEXT_ENTRIES[k]!.fixed && !patterns.some((p) => matchesTextPattern(k, p)))).toEqual([]);
  });
  it('no dead pattern: every site-wide and block text pattern matches some key', () => {
    const all = [...SITE_WIDE_TEXT.map((p) => ['site-wide', p] as const), ...Object.values(BLOCKS).flatMap((b) => (b.text ?? []).map((p) => [b.name, p] as const))];
    expect(all.filter(([, p]) => !keys.some((k) => matchesTextPattern(k, p))).map(([b, p]) => `${b}: ${p}`)).toEqual([]);
  });
});
