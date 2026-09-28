/**
 * The template naming and import rules, in one place. Imported by fetch-templates, templates-lock,
 * template-imports, new-template (template:new) and their tests. The web side mirrors only
 * TEMPLATE_ID_RE (web/src/templates/define.ts) because web/src may not import from scripts/.
 */
/** Folder names under web/src/templates that are never templates (and never valid template ids). */
export const RESERVED_DIRS = Object.freeze(['external', 'defaults']);
export const TEMPLATE_ID_RE = /^[a-z0-9-]{1,40}$/;
/** A lock ref must be a full, lowercase commit SHA — no branches, no tags. */
export const SHA_RE = /^[0-9a-f]{40}$/;
/** What a template file may import (manifest.ts: DEFINE_SPECIFIERS only). */
export const CONTRACT_SPECIFIERS = Object.freeze(['@/templates/contract', '@/templates/contract.ts']);
export const DEFINE_SPECIFIERS = Object.freeze(['@/templates/define', '@/templates/define.ts']);
export const ALLOWED_PACKAGES = Object.freeze(['react', 'react/jsx-runtime']);
