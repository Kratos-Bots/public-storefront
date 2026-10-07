import { describe, expect, it } from 'vitest';
import { coaHref, coaRows, displayableCoas, formatMg, formatPurity, hasDisplayableCoa } from '@/features/catalog/coa-format.ts';
import type { ProductCoa } from '@/types/catalog.ts';

const FILE_KEY = 'a1b2c3d4'.repeat(4);
const coa = (over: Partial<ProductCoa> = {}): ProductCoa => ({
  id: 7, lab: null, sampleName: null, mgAmount: null, purity: null, batch: null, testDate: null, reportUrl: null, fileKey: null, ...over,
});

describe('coaHref · file links', () => {
  it.each([
    ['../../account'], ['abc?x=1'], [`${FILE_KEY.slice(0, 31)}#`], [`${FILE_KEY.slice(0, 16)} ${FILE_KEY.slice(17)}`], [FILE_KEY.toUpperCase()], [`${FILE_KEY}0`], [FILE_KEY.slice(1)],
  ])('builds no link for the file key %j', (fileKey) => {
    expect(coaHref(coa({ fileKey }))).toBeNull();
  });
  it.each([[0], [-3], [1.5], [Number.NaN], [undefined], [null], ['7']])('builds no file link for the id %j', (id) => {
    expect(coaHref(coa({ id: id as unknown as number, fileKey: FILE_KEY }))).toBeNull();
  });
  it('still prefers a lab page when the file key is unusable', () => {
    expect(coaHref(coa({ reportUrl: 'https://example.com/r', fileKey: '../x' }))).toBe('https://example.com/r');
  });
});

describe('displayableCoas · ids', () => {
  it('drops entries without an integer id and keeps the first of a repeated id', () => {
    const a = coa({ id: 1, lab: 'First' });
    const out = displayableCoas([a, coa({ id: 1, lab: 'Dup' }), coa({ id: undefined as unknown as number, lab: 'NoId' }), coa({ id: 2.5, lab: 'Frac' }), coa({ id: 3, lab: 'Third' })]);
    expect(out.map((c) => c.lab)).toEqual(['First', 'Third']);
    expect(out[0]).toBe(a);
  });
});

describe('coaHref', () => {
  it('prefers the lab page', () => {
    expect(coaHref(coa({ reportUrl: 'https://example.com/report/1', fileKey: FILE_KEY }))).toBe('https://example.com/report/1');
  });
  it('falls back to the uploaded file through the media route', () => {
    expect(coaHref(coa({ fileKey: FILE_KEY }))).toBe(`/media/coas/7/${FILE_KEY}`);
  });
  it('is null with neither', () => {
    expect(coaHref(coa())).toBeNull();
    expect(coaHref(coa({ reportUrl: '  ', fileKey: '' }))).toBeNull();
  });
  it('never links a non-http(s) address', () => {
    expect(coaHref(coa({ reportUrl: 'javascript:alert(1)' }))).toBeNull();
    expect(coaHref(coa({ reportUrl: 'javascript:alert(1)', fileKey: FILE_KEY }))).toBe(`/media/coas/7/${FILE_KEY}`);
  });
});

describe('formatPurity', () => {
  it('keeps up to three decimals and trims trailing zeros', () => {
    expect(formatPurity(99.957)).toBe('99.957%');
    expect(formatPurity(99.9)).toBe('99.9%');
    expect(formatPurity(99)).toBe('99%');
    expect(formatPurity(99.95712)).toBe('99.957%');
    expect(formatPurity(99.9996)).toBe('100%');
  });
  it('is null for a missing or non-finite value', () => {
    expect(formatPurity(null)).toBeNull();
    expect(formatPurity(undefined)).toBeNull();
    expect(formatPurity(Number.NaN)).toBeNull();
  });
});

describe('formatMg', () => {
  it('keeps up to two decimals', () => {
    expect(formatMg(10)).toBe('10 mg');
    expect(formatMg(2.5)).toBe('2.5 mg');
    expect(formatMg(5.126)).toBe('5.13 mg');
    expect(formatMg(10.0)).toBe('10 mg');
  });
  it('is null for a missing or non-finite value', () => {
    expect(formatMg(null)).toBeNull();
    expect(formatMg(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('coaRows', () => {
  it('lists the present values in a fixed order', () => {
    const rows = coaRows(coa({
      batch: 'B-12', testDate: '12 March 2026', purity: 99.5, mgAmount: 10, sampleName: 'Example Peptide', lab: 'Example Labs',
    }));
    expect(rows.map((r) => r.key)).toEqual(['lab', 'amount', 'purity', 'batch', 'tested']);
    expect(rows.map((r) => r.value)).toEqual(['Example Labs', '10 mg', '99.5%', 'B-12', '12 March 2026']);
  });
  it('skips null and blank values', () => {
    const rows = coaRows(coa({ lab: '   ', sampleName: null, purity: 98, batch: '', testDate: ' 1 Jan 2026 ' }));
    expect(rows).toEqual([{ key: 'purity', value: '98%' }, { key: 'tested', value: '1 Jan 2026' }]);
  });
  it('is empty when nothing is displayable', () => {
    expect(coaRows(coa())).toEqual([]);
  });
  it('never lists the sample name', () => {
    expect(coaRows(coa({ sampleName: 'Example Peptide' }))).toEqual([]);
  });
});

describe('hasDisplayableCoa', () => {
  it('needs at least a row or a link', () => {
    expect(hasDisplayableCoa(coa())).toBe(false);
    expect(hasDisplayableCoa(coa({ lab: ' ' }))).toBe(false);
    expect(hasDisplayableCoa(coa({ lab: 'Example Labs' }))).toBe(true);
    expect(hasDisplayableCoa(coa({ fileKey: FILE_KEY }))).toBe(true);
    expect(hasDisplayableCoa(coa({ reportUrl: 'https://example.com/r' }))).toBe(true);
  });
  it('a sample name alone is not displayable; with a link it is', () => {
    expect(hasDisplayableCoa(coa({ sampleName: 'Example Peptide' }))).toBe(false);
    expect(hasDisplayableCoa(coa({ sampleName: 'Example Peptide', fileKey: FILE_KEY }))).toBe(true);
    expect(displayableCoas([coa({ sampleName: 'Example Peptide' })])).toEqual([]);
  });
});

describe('displayableCoas', () => {
  it('drops the empty entries before anything is chosen as latest', () => {
    const list = [coa({ id: 1 }), coa({ id: 2, lab: 'Example Labs' }), coa({ id: 3, fileKey: FILE_KEY })];
    expect(displayableCoas(list).map((c) => c.id)).toEqual([2, 3]);
  });
  it('treats a missing or malformed list as empty', () => {
    expect(displayableCoas(undefined)).toEqual([]);
    expect(displayableCoas(null)).toEqual([]);
    expect(displayableCoas('x' as never)).toEqual([]);
    expect(displayableCoas([null, 4] as never)).toEqual([]);
  });
});
