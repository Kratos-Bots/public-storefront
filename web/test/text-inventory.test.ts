import { describe, expect, it } from 'vitest';
import { missingFromDefaults, readInventory } from './helpers/text-scan.ts';
import { TEXT_GUARD_ALLOW } from './text-guard.allow.ts';

/**
 * Literals from the frozen v0.7.0 record that were deliberately reworded afterwards. The JSON keeps
 * the original wording; each entry here exempts exactly one component + literal pair from the survival
 * check. Not a pattern, not the shared text-guard allow list.
 */
const REWORDED_AFTER_V070: ReadonlyArray<{ file: string; text: string; now: string; reason: string }> = [
  {
    file: 'features/checkout/steps/AddressStep.tsx',
    text: 'ZIP / Postcode',
    now: 'Postal code',
    reason: 'checkout form fixes of 2026-10-04: the neutral fallback reads "Postal code"; country-specific wording comes from other keys',
  },
  {
    file: 'features/checkout/steps/AddressStep.tsx',
    text: 'County / Region',
    now: 'State / Region',
    reason: 'checkout form fixes of 2026-10-04: the neutral fallback reads "State / Region"; country-specific wording comes from other keys',
  },
];
const isReworded = (file: string, t: string): boolean => REWORDED_AFTER_V070.some((e) => e.file === file && e.text === t);

describe('v0.7.0 wording survives in the defaults', () => {
  it('every inventory literal occurs character-exact in some built-in default', () => {
    const out: string[] = [];
    for (const [file, texts] of Object.entries(readInventory())) {
      const kept = texts.filter(
        (t) => !isReworded(file, t) && !TEXT_GUARD_ALLOW.some((e) => e.file === file && (e.text === '*' || e.text === t)),
      );
      for (const t of missingFromDefaults(kept)) out.push(`${file}: ${t}`);
    }
    expect(out).toEqual([]);
  });

  it('every reworded exemption names a recorded literal that is really gone from the defaults', () => {
    const inventory = readInventory();
    for (const e of REWORDED_AFTER_V070) {
      expect(inventory[e.file] ?? [], `${e.file}: ${e.text} is not in the inventory`).toContain(e.text);
      // Fails if the old wording came back: the exemption would then be stale and must be deleted.
      expect(missingFromDefaults([e.text]), `${e.file}: "${e.text}" exists in the defaults again, drop its exemption`).toEqual([e.text]);
    }
  });
});
