/**
 * ISO-3166-1 alpha-2 → E.164 calling code (digits only, no leading '+').
 *
 * A static map, not `libphonenumber-js` — the backend authoritatively
 * re-parses every phone number it receives (`normalisePhone` in
 * ecommerce-backend/src/lib/phone.ts), so this only needs to get the calling
 * code right, not validate national number shape. Deliberately NOT scoped to
 * the store's serviceable-shipping-countries list: a customer's phone
 * country and shipping country are independent (expats, gifts, forwarding
 * addresses), so every ISO code gets an entry here regardless of whether the
 * store ships there.
 *
 * A few codes are intentionally shared across multiple territories (NANP
 * members all carry '1'; RU/KZ both carry '7'; French overseas departments
 * share their metropolitan neighbours' codes) — that's correct, not a bug.
 */
export const DIAL_CODES: Record<string, string> = {
  AD: '376', AE: '971', AF: '93', AG: '1', AI: '1', AL: '355', AM: '374', AO: '244',
  AQ: '672', AR: '54', AS: '1', AT: '43', AU: '61', AW: '297', AX: '358', AZ: '994',
  BA: '387', BB: '1', BD: '880', BE: '32', BF: '226', BG: '359', BH: '973', BI: '257',
  BJ: '229', BL: '590', BM: '1', BN: '673', BO: '591', BQ: '599', BR: '55', BS: '1',
  BT: '975', BW: '267', BY: '375', BZ: '501',
  CA: '1', CC: '61', CD: '243', CF: '236', CG: '242', CH: '41', CI: '225', CK: '682',
  CL: '56', CM: '237', CN: '86', CO: '57', CR: '506', CU: '53', CV: '238', CW: '599',
  CX: '61', CY: '357', CZ: '420',
  DE: '49', DJ: '253', DK: '45', DM: '1', DO: '1', DZ: '213',
  EC: '593', EE: '372', EG: '20', EH: '212', ER: '291', ES: '34', ET: '251',
  FI: '358', FJ: '679', FK: '500', FM: '691', FO: '298', FR: '33',
  GA: '241', GB: '44', GD: '1', GE: '995', GF: '594', GG: '44', GH: '233', GI: '350',
  GL: '299', GM: '220', GN: '224', GP: '590', GQ: '240', GR: '30', GT: '502', GU: '1',
  GW: '245', GY: '592',
  HK: '852', HN: '504', HR: '385', HT: '509', HU: '36',
  ID: '62', IE: '353', IL: '972', IM: '44', IN: '91', IO: '246', IQ: '964', IR: '98',
  IS: '354', IT: '39',
  JE: '44', JM: '1', JO: '962', JP: '81',
  KE: '254', KG: '996', KH: '855', KI: '686', KM: '269', KN: '1', KP: '850', KR: '82',
  KW: '965', KY: '1', KZ: '7',
  LA: '856', LB: '961', LC: '1', LI: '423', LK: '94', LR: '231', LS: '266', LT: '370',
  LU: '352', LV: '371', LY: '218',
  MA: '212', MC: '377', MD: '373', ME: '382', MF: '590', MG: '261', MH: '692', MK: '389',
  ML: '223', MM: '95', MN: '976', MO: '853', MP: '1', MQ: '596', MR: '222', MS: '1',
  MT: '356', MU: '230', MV: '960', MW: '265', MX: '52', MY: '60', MZ: '258',
  NA: '264', NC: '687', NE: '227', NF: '672', NG: '234', NI: '505', NL: '31', NO: '47',
  NP: '977', NR: '674', NU: '683', NZ: '64',
  OM: '968',
  PA: '507', PE: '51', PF: '689', PG: '675', PH: '63', PK: '92', PL: '48', PM: '508',
  PR: '1', PS: '970', PT: '351', PW: '680', PY: '595',
  QA: '974',
  RE: '262', RO: '40', RS: '381', RU: '7', RW: '250',
  SA: '966', SB: '677', SC: '248', SD: '249', SE: '46', SG: '65', SH: '290', SI: '386',
  SJ: '47', SK: '421', SL: '232', SM: '378', SN: '221', SO: '252', SR: '597', SS: '211',
  ST: '239', SV: '503', SX: '1', SY: '963', SZ: '268',
  TC: '1', TD: '235', TF: '262', TG: '228', TH: '66', TJ: '992', TK: '690', TL: '670',
  TM: '993', TN: '216', TO: '676', TR: '90', TT: '1', TV: '688', TW: '886', TZ: '255',
  UA: '380', UG: '256', US: '1', UY: '598', UZ: '998',
  VA: '379', VC: '1', VE: '58', VG: '1', VI: '1', VN: '84', VU: '678',
  WF: '681', WS: '685',
  XK: '383',
  YE: '967', YT: '262',
  ZA: '27', ZM: '260', ZW: '263',
};

/** Dial code (no '+') for an ISO-3166-1 alpha-2 code, or undefined if unknown. */
export function dialCodeFor(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  return DIAL_CODES[iso.toUpperCase()];
}

/**
 * Composes a `+<callingCode><nationalNumber>` string from a picked ISO
 * country and whatever the shopper typed into the national-number field.
 * Returns `undefined` when there is nothing to submit — an optional/blank
 * phone must never become a bare `+33` written into `customers.phone`.
 *
 * This is a compose step, not a normalisation step: the national digits are
 * concatenated onto the calling code exactly as typed (punctuation/spaces
 * stripped), with no attempt to strip a leading trunk zero. That is
 * deliberate, not an oversight — a leading 0 is a national-prefix that some
 * countries strip before the calling code and others (Italian landlines,
 * notably) keep as a genuine part of the number, and that rule is exactly
 * what `libphonenumber-js` already encodes per-country inside the backend's
 * `normalisePhone` (ecommerce-backend/src/lib/phone.ts). A `+`-prefixed
 * string reaching `normalisePhone` still goes through
 * `parsePhoneNumberFromString`, which applies each country's own
 * national-prefix rule — so `+330612345678` is corrected to `+33612345678`
 * (France strips it) while `+39061234567` stays as-is (Italy keeps it).
 * Stripping the zero client-side would only ever remove information the
 * parser needs and gains nothing for the countries where it strips anyway.
 *
 * Three defensive behaviours remain, all required because this value lands
 * directly in a partial-unique identity column:
 *  - **Already-international input wins outright — both spellings of it.**
 *    If the national field itself starts with `+` (typed or pasted, e.g.
 *    "+33 6 12 34 56 78"), it is treated as a complete number and adopted
 *    verbatim (digits only, leading '+' kept) — the selected prefix is NOT
 *    prepended. The same applies to a leading `00`, the IDD (international
 *    direct dialling) prefix used in place of '+' across most of Europe and
 *    elsewhere: "0033612345678" is exactly as international as
 *    "+33612345678", just spelled differently, and is converted to the
 *    latter and adopted verbatim. Both stop "+33" (or any picker value)
 *    from being prepended onto an already-international number — e.g.
 *    "+33" + "+33612345678" becoming "+33+33612345678", or "+33" +
 *    "0033612345678" becoming "+330033612345678" (this second one shipped
 *    as a real regression: it silently corrupted the identity column for
 *    the — extremely common in Europe — customer who types the IDD form,
 *    regardless of which prefix was selected). The embedded code always
 *    wins over the picker: "0032470123456" composes to the Belgian
 *    "+32470123456" even with France selected in the picker.
 *  - **No resolvable prefix → pass the raw text through untouched, with no
 *    leading '+' fabricated.** Composing "+" plus bare national digits (no
 *    calling code) would hand the backend a string that *looks* like a
 *    complete E.164 number — `normalisePhone` sees the leading '+' and stops
 *    applying its shipping-country hint, so libphonenumber would misparse
 *    the leading national digits as some other country's calling code
 *    (e.g. a bare "+612345678" reads as Australia's "+61 2345678"). Passing
 *    the untouched raw text instead preserves the pre-feature behaviour:
 *    the backend's existing shipping-country-derived hint still applies.
 */
export function composePhoneNumber(iso: string | null | undefined, national: string | null | undefined): string | undefined {
  const trimmed = (national ?? '').trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith('+')) {
    const digits = trimmed.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
    return digits.length > 1 ? digits : undefined;
  }

  const digitsOnly = trimmed.replace(/\D/g, '');

  // IDD form of an already-international number ("00" standing in for '+') —
  // checked before the picker's dial code so the embedded code always wins,
  // exactly like the '+' branch above and regardless of what's selected.
  if (digitsOnly.startsWith('00')) {
    const rest = digitsOnly.slice(2);
    return rest ? `+${rest}` : undefined;
  }

  const dial = dialCodeFor(iso);
  if (!dial) return trimmed;

  return digitsOnly ? `+${dial}${digitsOnly}` : undefined;
}
