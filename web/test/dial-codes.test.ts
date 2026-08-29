import { describe, expect, it } from 'vitest';
import { DIAL_CODES, composePhoneNumber, dialCodeFor } from '@/lib/dial-codes.ts';
import { COUNTRY_OPTIONS } from '@/features/checkout/CountrySelect.tsx';

/**
 * French overseas territories: each has its own ISO code and its own calling
 * code (or shares a neighbour's), and must be offered by both the shipping
 * country picker and the phone-prefix picker. Pinned here because they are
 * easy to drop when "tidying" the ISO table down to sovereign states.
 */
const FRENCH_TERRITORIES: Array<[iso: string, dial: string]> = [
  ['GP', '590'], // Guadeloupe
  ['MQ', '596'], // Martinique
  ['GF', '594'], // French Guiana
  ['RE', '262'], // Réunion
  ['YT', '262'], // Mayotte
  ['BL', '590'], // Saint Barthélemy
  ['MF', '590'], // Saint Martin (French part)
  ['PM', '508'], // Saint Pierre and Miquelon
  ['NC', '687'], // New Caledonia
  ['PF', '689'], // French Polynesia
  ['WF', '681'], // Wallis and Futuna
];

describe('dial codes — French territories', () => {
  for (const [iso, dial] of FRENCH_TERRITORIES) {
    it(`${iso} carries +${dial}`, () => {
      expect(DIAL_CODES[iso]).toBe(dial);
      expect(dialCodeFor(iso.toLowerCase())).toBe(dial);
    });

    it(`${iso} is offered by the country picker`, () => {
      expect(COUNTRY_OPTIONS.some((c) => c.iso === iso)).toBe(true);
    });
  }

  // The trunk '0' is kept on purpose — composePhoneNumber is a compose step;
  // the backend's normalisePhone applies each territory's own prefix rule and
  // turns '+5900690…' into '+590690…' (pinned in ecommerce-backend's phone.test.ts).
  it('composes a Guadeloupe national number onto +590, not +33', () => {
    expect(composePhoneNumber('GP', '06 90 12 34 56')).toBe('+5900690123456');
  });

  it('composes a Réunion national number onto +262', () => {
    expect(composePhoneNumber('RE', '0692 12 34 56')).toBe('+2620692123456');
  });

  it('an already-international territory number wins over a France prefix', () => {
    expect(composePhoneNumber('FR', '+590 690 12 34 56')).toBe('+590690123456');
    expect(composePhoneNumber('FR', '00590690123456')).toBe('+590690123456');
  });
});
