import { expectGolden } from './golden.ts';

/**
 * `expectGolden(`stage5-${name}`, html)`, with the `name` attribute normalised as well: a radio group's
 * `name` comes from React's useId, so it drifts with render order exactly like the `id`/`for` pair
 * `normalizeMarkup` already masks.
 */
export function expectStage5(name: string, html: string): void {
  expectGolden(`stage5-${name}`, html.replace(/\bname="(?:_r_[0-9a-z]+_|:r[0-9a-z]+:|«r[0-9a-z]+»)"/g, 'name="RID"'));
}
