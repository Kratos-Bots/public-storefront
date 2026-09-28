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
/**
 * Accepted `templates.lock.json` repo forms: https://, ssh://, file:// or scp-style
 * `user@host:path`. A bare string is never accepted — in particular nothing starting with '-' —
 * because it is passed as a positional argument to `git fetch`, and a value like
 * `--upload-pack=...` is otherwise interpreted by git as an option (arbitrary command execution).
 * The host itself (in the ssh://, https:// and scp forms) may also not start with '-', for the
 * same reason one level down: git in turn invokes `ssh`, which parses a `-`-leading "hostname"
 * as one of its own options. A bracketed host (`[-x]`, IPv6-literal syntax) is unwrapped before
 * ssh sees it, so a `[-` prefix counts as a dash-leading host too.
 *
 * `file://` stays allowed unconditionally rather than gated behind a test-only env var: the lock
 * is maintainer-authored (not attacker-supplied request input), the transport is already pinned to
 * file/https/ssh only (see PROTOCOL_ARGS in fetch-templates.mjs), and every fetched folder — from
 * any transport — still runs the full manifest/import/symlink validation before being trusted, so
 * file:// grants no extra capability beyond "read a local git repo the maintainer already pointed
 * the lock at". Tests rely on exactly this to fetch from local fixture repos.
 */
export const REPO_RE = /^https:\/\/(?:[^@/\s]+@)?(?!\[?-)[^/\s@]+\/\S*$|^ssh:\/\/(?:[^@/\s]+@)?(?!\[?-)[^/\s@]+\/\S*$|^file:\/\/\S+$|^[A-Za-z0-9][\w.-]*@(?!\[?-)[^:\s@]+:\S+$/;
/** Every source file family a template may ship (.js/.jsx/.ts/.tsx/.mjs/.cjs/.mts/.cts, incl. .d.ts). */
export const SOURCE_FILE_RE = /\.(m|c)?[jt]sx?$/;
/** Stylesheet languages other than plain CSS. Templates may ship only .css (Vite would run these through their own preprocessors). */
export const STYLE_LANGUAGE_FILE_RE = /\.(pcss|postcss|sss|scss|sass|less|styl|stylus)$/i;
/** CSS modules. Vite would hash their class names and run them through its CSS-modules pipeline; templates ship plain global .css only. */
export const CSS_MODULE_FILE_RE = /\.module\.css$/i;
/** Plain stylesheets (any case: Vite matches `.css` case-insensitively). */
export const CSS_FILE_RE = /\.css$/i;
/** The only query a relative template import may carry, and only on a `.css` path. */
export const ALLOWED_CSS_QUERY_RE = /^\?(?:inline|url|raw)$/;
