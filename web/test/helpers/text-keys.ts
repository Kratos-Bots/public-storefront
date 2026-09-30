// web/test/helpers/text-keys.ts — real registry keys of each kind, so editor tests never hard-code
// a key Plan 2 might name differently.
import { TEXT } from '@/text/registry.ts';
import type { TextValue } from '@/text/types.ts';

interface Entry { en: TextValue; fixed?: boolean }
const entries = Object.entries(TEXT as unknown as Record<string, Entry>);
const PH = /\{([A-Za-z][A-Za-z0-9]{0,31})\}/;

function pick(what: string, pred: (key: string, e: Entry) => boolean): string {
  const hit = entries.find(([k, e]) => pred(k, e));
  if (!hit) throw new Error(`The text registry has no ${what} yet — Plan 2's core wave must land first (report BLOCKED)`);
  return hit[0];
}
const editable = (k: string, e: Entry) => !e.fixed && !k.startsWith('templates.');

export const plainKey = () => pick('plain string key', (k, e) => editable(k, e) && typeof e.en === 'string' && !PH.test(e.en) && e.en.length <= 60);
export function placeholderKey(): { key: string; name: string } {
  const key = pick('string key with a placeholder', (k, e) => editable(k, e) && typeof e.en === 'string' && PH.test(e.en));
  return { key, name: PH.exec((TEXT as unknown as Record<string, Entry>)[key]!.en as string)![1]! };
}
export const pluralKey = () => pick('plural key', (k, e) => editable(k, e) && typeof e.en !== 'string');
export const fixedKey = () => pick('fixed key', (_k, e) => e.fixed === true);
export const defaultOf = (key: string): TextValue => (TEXT as unknown as Record<string, Entry>)[key]!.en;
