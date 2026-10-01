import { describe, expect, it } from 'vitest';
import { missingFromDefaults, readInventory } from './helpers/text-scan.ts';
import { TEXT_GUARD_ALLOW } from './text-guard.allow.ts';

describe('v0.7.0 wording survives in the defaults', () => {
  it('every inventory literal occurs character-exact in some built-in default', () => {
    const out: string[] = [];
    for (const [file, texts] of Object.entries(readInventory())) {
      const kept = texts.filter((t) => !TEXT_GUARD_ALLOW.some((e) => e.file === file && (e.text === '*' || e.text === t)));
      for (const t of missingFromDefaults(kept)) out.push(`${file}: ${t}`);
    }
    expect(out).toEqual([]);
  });
});
