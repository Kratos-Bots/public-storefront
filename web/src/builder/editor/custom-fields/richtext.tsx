import { lazy, Suspense } from 'react';
import type { RichtextField } from '@puckeditor/core';
import { isSafeHref } from '@/builder/define.ts';

/**
 * Links the richtext editor may create (autolink, paste, setLink): the same set the sanitiser keeps
 * (`https:`, `mailto:`, `tel:`, a site path) — never `http:`, `javascript:` or an empty href.
 */
export const isAllowedRichtextHref = (url: string): boolean => url !== '' && isSafeHref(url);

/**
 * Tiptap nodes/marks the editor registers, matched to the sanitiser's allowlist
 * (`p h2 h3 h4 strong em u s a ul ol li blockquote br code`, `href` only). Anything the storefront
 * would strip is switched off here so the owner never formats text that silently disappears:
 * h1/h5/h6, code blocks, horizontal rules and text alignment (a `style` attribute).
 */
export const RICHTEXT_OPTIONS = {
  heading: { levels: [2, 3, 4] as Array<2 | 3 | 4> },
  codeBlock: false,
  horizontalRule: false,
  textAlign: false,
  link: {
    openOnClick: false,
    defaultProtocol: 'https',
    isAllowedUri: (url: string) => isAllowedRichtextHref(url),
    shouldAutoLink: (url: string) => isAllowedRichtextHref(url),
  },
} satisfies RichtextField['options'];

// Lazy so importing the field config (derive-fields, tests) never evaluates Puck's runtime;
// by the time a menu renders, the editor chunk that holds Puck is already loaded.
const LazyMenu = lazy(() => import('@/builder/editor/custom-fields/richtext-menu.tsx'));

/** Puck's default toolbar, minus the alignment select (the sanitiser drops `style`). */
const renderMenu: NonNullable<RichtextField['renderMenu']> = () => (
  <Suspense fallback={null}>
    <LazyMenu />
  </Suspense>
);

export function richtextField(label: string): RichtextField {
  return { type: 'richtext', label, options: RICHTEXT_OPTIONS as RichtextField['options'], renderMenu };
}
