/**
 * The shop formats dates and numbers in the viewer's own locale (no locale argument). Test output would then
 * depend on the machine: "12 Aug 2026, 13:30" on a UK laptop, "Aug 12, 2026, 1:30 PM" on a US build runner.
 * This pins the default locale for every `Intl` formatter and `toLocale*String` call that names none, so the
 * suite (and the golden markup files) read the same everywhere. A call that names a locale is untouched.
 * `TEST_DEFAULT_LOCALE` overrides it, to check that nothing leaks past the pin.
 */
const PINNED = process.env.TEST_DEFAULT_LOCALE || 'en-GB';

type IntlCtor = new (locales?: Intl.LocalesArgument, options?: unknown) => object;
const INTL_KEYS = ['DateTimeFormat', 'NumberFormat', 'PluralRules', 'RelativeTimeFormat', 'ListFormat', 'Collator', 'Segmenter', 'DisplayNames'] as const;

const intl = Intl as unknown as Record<string, IntlCtor>;
for (const key of INTL_KEYS) {
  const Original = intl[key];
  if (!Original) continue;
  const Pinned = function (this: unknown, locales?: Intl.LocalesArgument, options?: unknown) {
    return new Original(locales ?? PINNED, options);
  } as unknown as IntlCtor;
  // Statics (supportedLocalesOf) and `instanceof` keep working against the original.
  Object.setPrototypeOf(Pinned, Original);
  Pinned.prototype = Original.prototype;
  intl[key] = Pinned;
}

function pinMethod(proto: object, name: string): void {
  const original = (proto as Record<string, (...a: unknown[]) => unknown>)[name]!;
  Object.defineProperty(proto, name, {
    configurable: true, writable: true,
    value(this: unknown, locales?: unknown, ...rest: unknown[]) { return original.call(this, locales ?? PINNED, ...rest); },
  });
}
for (const name of ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']) pinMethod(Date.prototype, name);
pinMethod(Number.prototype, 'toLocaleString');
pinMethod(BigInt.prototype, 'toLocaleString');
for (const name of ['toLocaleUpperCase', 'toLocaleLowerCase']) pinMethod(String.prototype, name);
// localeCompare(that, locales, options): the locale is the second argument.
const localeCompare = String.prototype.localeCompare;
Object.defineProperty(String.prototype, 'localeCompare', {
  configurable: true, writable: true,
  value(this: string, that: string, locales?: Intl.LocalesArgument, options?: Intl.CollatorOptions) { return localeCompare.call(this, that, locales ?? PINNED, options); },
});

export {};
