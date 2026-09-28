import { RESERVED_DIRS, SHA_RE, TEMPLATE_ID_RE as ID_RE } from './template-rules.mjs';

const RESERVED = new Set(RESERVED_DIRS);

/** Parses templates.lock.json. Throws one Error listing every problem. */
export function parseLock(text, builtIns) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('templates.lock.json is not valid JSON'); }
  const list = Array.isArray(data?.templates) ? data.templates : null;
  if (!list) throw new Error('templates.lock.json must be { "templates": [...] }');
  const errors = [];
  const seen = new Set();
  const entries = [];
  list.forEach((e, i) => {
    const where = `templates[${i}]`;
    if (typeof e?.id !== 'string' || !ID_RE.test(e.id)) { errors.push(`${where}: id must match ${ID_RE}`); return; }
    if (RESERVED.has(e.id)) errors.push(`${where}: id "${e.id}" is reserved`);
    if (builtIns.includes(e.id)) errors.push(`${where}: id "${e.id}" collides with a built-in template`);
    if (seen.has(e.id)) errors.push(`${where}: duplicate id "${e.id}"`);
    seen.add(e.id);
    if (typeof e.repo !== 'string' || e.repo.trim() === '') errors.push(`${where}: repo is required`);
    if (typeof e.ref !== 'string' || !SHA_RE.test(e.ref)) errors.push(`${where}: ref must be a full 40-char commit SHA (branches and tags are not allowed)`);
    entries.push({ id: e.id, repo: e.repo, ref: e.ref });
  });
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return entries;
}
