/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { missingFromDefaults, readInventory, scanFiles, sourceFiles, staleEntries, unallowed, type AllowEntry } from './text-scan.ts';
import { TEXT_GUARD_ALLOW } from '../text-guard.allow.ts';

/**
 * The text guard for one extraction area (Tasks 6–14). `prefixes` are paths under web/src; a prefix
 * ending in '/' matches a directory, anything else one file. Task 15 replaces these with the global guard.
 */
export function describeAreaGuard(name: string, prefixes: string[], opts: { allow?: AllowEntry[] } = {}): void {
  const files = sourceFiles().filter((f) => prefixes.some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p)));
  const allow = [...TEXT_GUARD_ALLOW, ...(opts.allow ?? [])];
  describe(`text guard · ${name}`, () => {
    it('covers at least one source file per prefix', () => {
      for (const p of prefixes) expect(files.some((f) => (p.endsWith('/') ? f.startsWith(p) : f === p)), p).toBe(true);
    });
    it('leaves no shopper text outside the registry', () => {
      expect(unallowed(scanFiles(files), allow).map((f) => `${f.file}:${f.line} ${f.rule} ${JSON.stringify(f.text)}`)).toEqual([]);
    });
    it('has no stale area allow entries', () => {
      expect(staleEntries(scanFiles(files), opts.allow ?? [])).toEqual([]);
    });
    it('keeps every v0.7.0 literal, character-exact, inside some built-in default', () => {
      const inv = readInventory();
      const allowed = (f: string, t: string) => allow.some((e) => e.file === f && (e.text === '*' || e.text === t));
      const missing = files.flatMap((f) => missingFromDefaults((inv[f] ?? []).filter((t) => !allowed(f, t))).map((t) => `${f}: ${t}`));
      expect(missing).toEqual([]);
    });
  });
}
