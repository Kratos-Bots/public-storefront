import { describe, expect, it } from 'vitest';
import { RICHTEXT_ALLOWED_TAGS, sanitizeRichtext } from '@/builder/sanitize.ts';

describe('sanitizeRichtext', () => {
  it('keeps the allowlisted tags', () => {
    expect(RICHTEXT_ALLOWED_TAGS).toEqual(['p', 'h2', 'h3', 'h4', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'br', 'code']);
    expect(sanitizeRichtext('<p><strong>Hi</strong> <em>there</em></p>')).toBe('<p><strong>Hi</strong> <em>there</em></p>');
  });
  it('strips scripts, handlers, styles and unknown tags', () => {
    expect(sanitizeRichtext('<p style="color:red" onclick="x()">a</p><script>alert(1)</script>')).toBe('<p>a</p>');
    expect(sanitizeRichtext('<img src=x onerror=alert(1)><h1>Big</h1>')).toBe('Big');
  });
  it('allows only safe hrefs and forces rel on external links', () => {
    expect(sanitizeRichtext('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeRichtext('<a href="//evil.example">x</a>')).toBe('<a>x</a>');
    expect(sanitizeRichtext('<a href="/\\evil.example">x</a>')).toBe('<a>x</a>');
    expect(sanitizeRichtext('<a href="/pages/our-story" rel="x" target="_blank">x</a>')).toBe('<a href="/pages/our-story">x</a>');
    expect(sanitizeRichtext('<a href="https://shop.example">x</a>')).toBe('<a href="https://shop.example" rel="noopener noreferrer">x</a>');
    expect(sanitizeRichtext('<a href="mailto:hi@shop.example">x</a>')).toBe('<a href="mailto:hi@shop.example">x</a>');
  });
});
