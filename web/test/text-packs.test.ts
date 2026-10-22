import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formsOf, placeholdersIn } from '@/text/define.ts';
import fr from '@/text/packs/fr/index.ts';
import it_ from '@/text/packs/it/index.ts';
import es from '@/text/packs/es/index.ts';
import { loadPack, packFor, packLanguage, PACK_LANGUAGES, preloadPacks, type Pack } from '@/text/packs/index.ts';
import { TEXT_ENTRIES } from '@/text/registry.ts';
import { checkValue } from '@/text/resolve.ts';
import { isPluralForms } from '@/text/types.ts';

const PACKS: Record<(typeof PACK_LANGUAGES)[number], Pack> = { fr, it: it_, es };
const keys = Object.keys(TEXT_ENTRIES);
const translatable = keys.filter((k) => !TEXT_ENTRIES[k]!.fixed);
const here = path.dirname(fileURLToPath(import.meta.url));

describe.each(PACK_LANGUAGES)('built-in %s pack (languages spec section 3 gate)', (lang) => {
  const pack = PACKS[lang] as Readonly<Record<string, unknown>>;
  it('covers every non-fixed registry key', () => {
    expect(translatable.filter((k) => !Object.hasOwn(pack, k))).toEqual([]);
  });
  it('has no unknown key and no fixed key', () => {
    expect(Object.keys(pack).filter((k) => !Object.hasOwn(TEXT_ENTRIES, k))).toEqual([]);
    expect(Object.keys(pack).filter((k) => TEXT_ENTRIES[k]?.fixed)).toEqual([]);
  });
  it('every value passes checkValue (type, placeholders, braces, max)', () => {
    const bad = translatable.flatMap((k) => {
      const c = checkValue(k, pack[k]);
      return c.ok ? [] : [`${k}: ${c.rule}`];
    });
    expect(bad).toEqual([]);
  });
  it('keeps every placeholder of the English default (union over forms for a plural)', () => {
    const lost = translatable.flatMap((k) => {
      const have = new Set(formsOf(pack[k] as never).flatMap(placeholdersIn));
      return [...new Set(formsOf(TEXT_ENTRIES[k]!.en).flatMap(placeholdersIn))].filter((n) => !have.has(n)).map((n) => `${k}: {${n}}`);
    });
    expect(lost).toEqual([]);
  });
  it('plural values have one and other', () => {
    const bad = translatable.filter((k) => {
      if (!isPluralForms(TEXT_ENTRIES[k]!.en)) return false;
      const v = pack[k];
      return !(isPluralForms(v) && typeof v.one === 'string' && typeof v.other === 'string');
    });
    expect(bad).toEqual([]);
  });
  it('is frozen', () => {
    expect(Object.isFrozen(pack)).toBe(true);
  });
  it('is translated: no area file still carries TODO(translate)', () => {
    const dir = path.resolve(here, '../src/text/packs', lang);
    const todo = readdirSync(dir).filter((f) => readFileSync(path.join(dir, f), 'utf8').includes('TODO(translate)'));
    expect(todo).toEqual([]);
  });
});

describe('pack registry', () => {
  it('packLanguage maps by primary subtag; English and others have none', () => {
    expect(packLanguage('fr')).toBe('fr');
    expect(packLanguage('fr-CA')).toBe('fr');
    expect(packLanguage('es-419')).toBe('es');
    expect(packLanguage('it-IT')).toBe('it');
    expect(packLanguage('en')).toBeNull();
    expect(packLanguage('de')).toBeNull();
    expect(packLanguage('fil')).toBeNull();
  });
  it('loadPack makes packFor available; English and unsupported locales are no-ops', async () => {
    await loadPack('en');
    await loadPack('de');
    expect(packFor('en')).toBeUndefined();
    expect(packFor('de')).toBeUndefined();
    await loadPack('fr-BE');
    expect(packFor('fr')).toBe(fr);
    expect(packFor('fr-CA')).toBe(fr);
  });
  it('preloadPacks loads all three', async () => {
    await preloadPacks();
    expect([packFor('fr'), packFor('it'), packFor('es')]).toEqual([fr, it_, es]);
  });
});
