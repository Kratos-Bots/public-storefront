import { describe, expect, it } from 'vitest';
import { goldenAction, normalizeMarkup } from './helpers/golden.ts';

describe('goldenAction (overwrite guard)', () => {
  it('compares by default, missing or not', () => {
    expect(goldenAction({}, true)).toBe('compare');
    expect(goldenAction({}, false)).toBe('compare');
  });
  it('UPDATE_GOLDEN=1 writes only missing goldens', () => {
    expect(goldenAction({ UPDATE_GOLDEN: '1' }, false)).toBe('write');
    expect(goldenAction({ UPDATE_GOLDEN: '1' }, true)).toBe('compare');
  });
  it('UPDATE_GOLDEN=force overwrites', () => {
    expect(goldenAction({ UPDATE_GOLDEN: 'force' }, true)).toBe('write');
    expect(goldenAction({ UPDATE_GOLDEN: 'force' }, false)).toBe('write');
  });
  it('never writes on CI', () => {
    expect(goldenAction({ CI: 'true', UPDATE_GOLDEN: '1' }, false)).toBe('compare');
    expect(goldenAction({ CI: '1', UPDATE_GOLDEN: 'force' }, true)).toBe('compare');
  });
  it('other values of UPDATE_GOLDEN do not write', () => {
    expect(goldenAction({ UPDATE_GOLDEN: 'true' }, false)).toBe('compare');
    expect(goldenAction({ UPDATE_GOLDEN: '' }, false)).toBe('compare');
  });
});

describe('normalizeMarkup', () => {
  it('replaces render-order ids and splits tags', () => {
    expect(normalizeMarkup('<a id="mantine-abc12" aria-labelledby="«r3»"></a><b for=":r1f:"></b>'))
      .toBe('<a id="mantine-ID" aria-labelledby="RID">\n</a>\n<b for="RID">\n</b>');
  });
});
