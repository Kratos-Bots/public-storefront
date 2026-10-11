import { describe, expect, it } from 'vitest';
import { faqAvailable } from '@/features/faq/settings.ts';
import { linkify } from '@/features/faq/linkify.ts';

describe('faqAvailable', () => {
  it('is true only when the backend says so', () => {
    expect(faqAvailable({ faq: { available: true } })).toBe(true);
    expect(faqAvailable({ faq: { available: false } })).toBe(false);
  });
  it('reads an older backend (no faq key) and anything malformed as false', () => {
    expect(faqAvailable({})).toBe(false);
    expect(faqAvailable(undefined)).toBe(false);
    expect(faqAvailable(null)).toBe(false);
    expect(faqAvailable({ faq: null } as never)).toBe(false);
    expect(faqAvailable({ faq: {} } as never)).toBe(false);
    expect(faqAvailable({ faq: { available: 'true' } } as never)).toBe(false);
  });
});

describe('linkify', () => {
  it('leaves plain text as one text part', () => {
    expect(linkify('Orders leave on weekdays.')).toEqual([{ kind: 'text', text: 'Orders leave on weekdays.' }]);
  });
  it('returns nothing for an empty string', () => {
    expect(linkify('')).toEqual([]);
  });
  it('turns two bare http(s) URLs into links, keeping the text between and around them', () => {
    expect(linkify('See https://example.com/a and http://example.org/b today')).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'link', text: 'https://example.com/a', href: 'https://example.com/a' },
      { kind: 'text', text: ' and ' },
      { kind: 'link', text: 'http://example.org/b', href: 'http://example.org/b' },
      { kind: 'text', text: ' today' },
    ]);
  });
  it('does not swallow trailing punctuation', () => {
    expect(linkify('Visit https://example.com/path.')).toEqual([
      { kind: 'text', text: 'Visit ' },
      { kind: 'link', text: 'https://example.com/path', href: 'https://example.com/path' },
      { kind: 'text', text: '.' },
    ]);
    expect(linkify('(see https://example.com/x), then https://example.com/y!')).toEqual([
      { kind: 'text', text: '(see ' },
      { kind: 'link', text: 'https://example.com/x', href: 'https://example.com/x' },
      { kind: 'text', text: '), then ' },
      { kind: 'link', text: 'https://example.com/y', href: 'https://example.com/y' },
      { kind: 'text', text: '!' },
    ]);
  });
  it('keeps a query string and a balanced path intact', () => {
    const [link] = linkify('https://example.com/a_(b)?x=1&y=2#top').filter((p) => p.kind === 'link');
    expect(link).toMatchObject({ href: 'https://example.com/a_(b)?x=1&y=2#top' });
  });
  it('keeps line breaks inside the text parts', () => {
    expect(linkify('one\ntwo')).toEqual([{ kind: 'text', text: 'one\ntwo' }]);
  });
  it('stops a URL at a line break', () => {
    expect(linkify('https://example.com/a\nnext')).toEqual([
      { kind: 'link', text: 'https://example.com/a', href: 'https://example.com/a' },
      { kind: 'text', text: '\nnext' },
    ]);
  });
  it('only ever makes http(s) hrefs: other schemes stay text, and markup is never parsed', () => {
    for (const hostile of ['javascript:alert(1)', 'data:text/html,<b>x</b>', '<script>alert(1)</script>', 'ftp://example.com/x', 'vbscript:x', '<a href="https://example.com">x</a>']) {
      const parts = linkify(hostile);
      const hrefs = parts.filter((p) => p.kind === 'link').map((p) => (p as { href: string }).href);
      expect(hrefs.every((h) => /^https?:\/\//.test(h))).toBe(true);
      expect(parts.map((p) => p.text).join('')).toBe(hostile);
    }
    expect(linkify('<script>alert(1)</script>')).toEqual([{ kind: 'text', text: '<script>alert(1)</script>' }]);
    expect(linkify('javascript:alert(1)')).toEqual([{ kind: 'text', text: 'javascript:alert(1)' }]);
  });
  it('does not treat https:// with nothing after it as a link', () => {
    expect(linkify('use https:// to start')).toEqual([{ kind: 'text', text: 'use https:// to start' }]);
  });
  it('always reassembles to the original text', () => {
    const text = 'A https://example.com/a. B\nC http://example.org, D (https://example.net/x)';
    expect(linkify(text).map((p) => p.text).join('')).toBe(text);
  });
});
