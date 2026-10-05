import type { AllowEntry } from './helpers/text-scan.ts';

/** Reviewed exceptions to the text guard (spec §6.6). A stale entry fails text-guard.test.ts. */
export const TEXT_GUARD_ALLOW: AllowEntry[] = [
  { file: 'builder/guard.ts', text: '*', reason: 'editor issue messages — the editor\'s own UI text is a non-goal (spec §12)' },
  { file: 'builder/style/labels.ts', text: '*', reason: 'editor-only Style row labels (Style panel and editor issue messages)' },
  { file: 'builder/rules.ts', text: '*', reason: 'editor issue messages — the editor\'s own UI text is a non-goal (spec §12)' },
  { file: 'builder/blocks/_shared/checkout-container.ts', text: '*', reason: 'editor issue reasons for a misplaced part (spec §4.2) — surfaced only by the editor rules check' },
  { file: 'builder/family-checkout.ts', text: '*', reason: 'editor issue messages for an illegal step order (spec §4.2) — surfaced only by the editor rules check' },
  { file: 'builder/define.ts', text: '*', reason: 'zod messages surfaced only as editor field issues' },
  { file: 'text/resolve.ts', text: '*', reason: 'checkValue messages are editor issues (spec §7.2), not shopper text' },
  { file: 'templates/define.ts', text: '*', reason: 'template option labels shown only in the admin theme panel' },
  { file: 'templates/modern/manifest.ts', text: '*', reason: 'template gallery metadata shown only in the admin' },
  { file: 'templates/bento/manifest.ts', text: '*', reason: 'template gallery metadata shown only in the admin' },
  { file: 'templates/cyber-brutalism/manifest.ts', text: '*', reason: 'template gallery metadata shown only in the admin' },
  { file: 'templates/dark-luxury/manifest.ts', text: '*', reason: 'template gallery metadata shown only in the admin' },
  { file: 'app/theme-bridge.ts', text: '*', reason: 'CSS values (font stacks, borders), not text' },
  { file: 'templates/registry.ts', text: '*', reason: 'build-time manifest errors and console warnings for developers, never shown to shoppers' },
  { file: 'builder/sanitize.ts', text: 'noopener noreferrer', reason: 'a rel attribute value set on sanitised links, not text' },
  { file: 'api/catalog.ts', text: 'Route not found', reason: 'compared against the backend\'s 404 body, never shown' },
  { file: 'builder/blocks/CatalogHero.tsx', text: 'Describe the image for screen readers so it shows.', reason: 'editor-only canvas hint (rendered only while editing)' },
  { file: 'builder/blocks/FeaturedProducts.tsx', text: 'Pick products, or a category with products in it.', reason: 'editor-only canvas hint (rendered only while editing)' },
  { file: 'builder/blocks/Image.tsx', text: 'Upload an image and describe it for screen readers.', reason: 'editor-only canvas hint (rendered only while editing)' },
  { file: 'features/auth/password-errors.ts', text: 'RESET PASSWORD', reason: 'the keyword the shop\'s WhatsApp bot matches (backend-fixed, spec "WhatsApp reset"); not shopper-facing copy and deliberately outside the registry' },
];
