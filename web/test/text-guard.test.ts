import { describe, expect, it } from 'vitest';
import { scanFiles, sourceFiles, staleEntries, unallowed } from './helpers/text-scan.ts';
import { TEXT_GUARD_ALLOW } from './text-guard.allow.ts';

describe('text guard (spec §6.6)', () => {
  const findings = scanFiles(sourceFiles());
  it('no shopper text outside the registry', () => {
    expect(unallowed(findings, TEXT_GUARD_ALLOW).map((f) => `${f.file}:${f.line} ${f.rule} ${JSON.stringify(f.text)}`)).toEqual([]);
  });
  it('no stale allowlist entry', () => {
    expect(staleEntries(findings, TEXT_GUARD_ALLOW)).toEqual([]);
  });
});
