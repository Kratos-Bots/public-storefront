// web/test/builder-editor-richtext-field.test.tsx
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { deriveFields } from '@/builder/editor/derive-fields.ts';
import { isAllowedRichtextHref, RICHTEXT_OPTIONS, richtextField } from '@/builder/editor/custom-fields/richtext.tsx';
import { RICHTEXT_ALLOWED_TAGS } from '@/builder/sanitize.ts';
import type { BlockDef } from '@/builder/define.ts';

/** Every extension Puck 0.23's PuckRichText registers unless its option is `false`, with the tags it emits. */
const PUCK_EXTENSIONS: Record<string, string[]> = {
  blockquote: ['blockquote'], bold: ['strong'], bulletList: ['ul'], code: ['code'], codeBlock: ['pre', 'code'],
  document: [], hardBreak: ['br'], heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], horizontalRule: ['hr'], italic: ['em'],
  listItem: ['li'], listKeymap: [], link: ['a'], orderedList: ['ol'], paragraph: ['p'], strike: ['s'], text: [],
  textAlign: ['style'], underline: ['u'],
};

function emittedTags(options: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [ext, tags] of Object.entries(PUCK_EXTENSIONS)) {
    const opt = options[ext];
    if (opt === false) continue;
    if (ext === 'heading' && opt && typeof opt === 'object' && 'levels' in opt) {
      out.push(...(opt as { levels: number[] }).levels.map((l) => `h${l}`));
      continue;
    }
    // A block/mark with no option falls back to Puck's defaults (all heading levels, alignment on…).
    out.push(...tags);
  }
  return out;
}

describe('richtext field (matches the sanitiser allowlist)', () => {
  it('derived *Html props use the configured richtext field', () => {
    const def = { name: 'Probe', label: 'Probe', category: 'content', layouts: 'all', routeBound: false, slots: [],
      schema: z.object({ bodyHtml: z.string() }), defaultProps: {}, render: () => null } as unknown as BlockDef<Record<string, unknown>>;
    const f = deriveFields(def).fields.bodyHtml as ReturnType<typeof richtextField>;
    expect(f).toMatchObject({ type: 'richtext', label: 'Body' });
    expect(f.options).toBe(RICHTEXT_OPTIONS);
    expect(typeof f.renderMenu).toBe('function');
  });

  it('only enables nodes and marks the sanitiser keeps', () => {
    const tags = emittedTags(RICHTEXT_OPTIONS as Record<string, unknown>);
    for (const t of tags) expect(RICHTEXT_ALLOWED_TAGS, `editor can emit <${t}>`).toContain(t);
    expect(RICHTEXT_OPTIONS.heading.levels).toEqual([2, 3, 4]);
    expect(RICHTEXT_OPTIONS.codeBlock).toBe(false);
    expect(RICHTEXT_OPTIONS.horizontalRule).toBe(false);
    expect(RICHTEXT_OPTIONS.textAlign).toBe(false);
  });

  it('the Puck defaults would have offered stripped formatting (control)', () => {
    const tags = emittedTags({});
    expect(tags.filter((t) => !RICHTEXT_ALLOWED_TAGS.includes(t))).toEqual(expect.arrayContaining(['h1', 'hr', 'pre', 'style']));
  });

  it('links: https, mailto, tel and site paths only', () => {
    for (const ok of ['https://shop.example/a', 'mailto:hi@shop.example', 'tel:+15550100', '/catalog'])
      expect(isAllowedRichtextHref(ok), ok).toBe(true);
    for (const bad of ['http://shop.example', 'javascript:alert(1)', '//evil.example', '/\\evil', '', 'data:text/html,x', 'ftp://x'])
      expect(isAllowedRichtextHref(bad), bad).toBe(false);
    const link = RICHTEXT_OPTIONS.link;
    expect(link.isAllowedUri('http://shop.example')).toBe(false);
    expect(link.isAllowedUri('https://shop.example')).toBe(true);
    expect(link.shouldAutoLink('http://shop.example')).toBe(false);
    expect(link.defaultProtocol).toBe('https');
  });
});
