import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chooseLanguage, preferredLocales } from '@/text/preference.ts';

function setBrowserLanguages(langs: string[]) {
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(langs);
}
function setUrl(search: string) { window.history.replaceState(null, '', `/${search}`); }

beforeEach(() => { window.localStorage.clear(); setUrl(''); });
afterEach(() => vi.restoreAllMocks());

describe('preferredLocales', () => {
  it('browser languages only, canonicalised, at most 3 taken', () => {
    setBrowserLanguages(['fr-fr', 'it', 'es', 'de']);
    expect(preferredLocales()).toEqual(['fr-FR', 'it', 'es']);
  });
  it('skips tags that are not canonical locales', () => {
    setBrowserLanguages(['en_US', 'it']);
    expect(preferredLocales()).toEqual(['it']);
  });
  it('?lang= first (and stored), then the stored choice, then the browser; deduped; max 5', () => {
    setBrowserLanguages(['it', 'es', 'fr']);
    window.localStorage.setItem('sf.lang', 'es');
    setUrl('?lang=fr-ca');
    // The URL choice replaces the stored one, so the old 'es' survives only as a browser language.
    expect(preferredLocales()).toEqual(['fr-CA', 'it', 'es', 'fr']);
    expect(window.localStorage.getItem('sf.lang')).toBe('fr-CA');
  });
  it('caps the list at 5', () => {
    setBrowserLanguages(['it', 'es', 'fr', 'de']);
    window.localStorage.setItem('sf.lang', 'pt');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); }); // keep 'pt' alongside the URL tag
    setUrl('?lang=nl');
    expect(preferredLocales()).toEqual(['nl', 'pt', 'it', 'es', 'fr']);
  });
  it('ignores garbage in the URL and in storage', () => {
    setBrowserLanguages(['es']);
    window.localStorage.setItem('sf.lang', '!!');
    setUrl('?lang=%3Cscript%3E');
    expect(preferredLocales()).toEqual(['es']);
  });
  it('survives storage that throws', () => {
    setBrowserLanguages(['it']);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    setUrl('?lang=fr');
    expect(preferredLocales()).toEqual(['fr', 'it']);
  });
});

describe('chooseLanguage', () => {
  const reload = vi.fn();
  const realLocation = window.location;
  beforeEach(() => {
    reload.mockClear();
    Object.defineProperty(window, 'location', { configurable: true, value: { get href() { return realLocation.href; }, get search() { return realLocation.search; }, reload } });
  });
  afterEach(() => { Object.defineProperty(window, 'location', { configurable: true, value: realLocation }); });

  it('stores the choice, drops a stale ?lang=, and reloads', () => {
    setUrl('?lang=es&x=1');
    chooseLanguage('fr');
    expect(window.localStorage.getItem('sf.lang')).toBe('fr');
    expect(realLocation.search).toBe('?x=1');
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it('falls back to ?lang= on the URL when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    chooseLanguage('it');
    expect(new URL(realLocation.href).searchParams.get('lang')).toBe('it');
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it('ignores a non-canonical tag', () => {
    chooseLanguage('xx_YY');
    expect(reload).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('sf.lang')).toBeNull();
  });
});
