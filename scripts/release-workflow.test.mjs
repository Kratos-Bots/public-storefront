import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const yml = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const lines = yml.split('\n');
/** Index of the first line matching `re` — fails the test when absent. */
function lineOf(re, what) {
  const i = lines.findIndex((l) => re.test(l));
  assert.ok(i >= 0, `release.yml has no ${what}`);
  return i;
}

test('templates are fetched after the web install and before tests and build', () => {
  const webCi = lineOf(/^\s+- run: npm --prefix web ci\s*$/, '"npm --prefix web ci" step');
  const fetch = lineOf(/^\s+- name: Fetch imported templates\s*$/, '"Fetch imported templates" step');
  const fetchRun = lineOf(/^\s+run: node scripts\/fetch-templates\.mjs\s*$/, 'fetch-templates run line');
  const tests = lineOf(/^\s+- run: npm test\s*$/, '"npm test" step');
  const build = lineOf(/^\s+- run: npm run build\s*$/, '"npm run build" step');
  assert.ok(webCi < fetch && fetch < fetchRun && fetchRun < tests && tests < build, `order: web ci ${webCi}, fetch ${fetch}, test ${tests}, build ${build}`);
});

test('the deploy-key step is conditional on TEMPLATES_DEPLOY_KEY and runs before the fetch', () => {
  const key = lineOf(/^\s+- name: Load template deploy key\s*$/, '"Load template deploy key" step');
  assert.match(lines[key + 1] ?? '', /^\s+if: env\.TEMPLATES_DEPLOY_KEY != ''\s*$/, 'the step\'s first key must be its `if:` guard');
  assert.ok(key < lineOf(/^\s+- name: Fetch imported templates\s*$/, 'fetch step'));
  assert.match(yml, /\n {4}env:\n {6}TEMPLATES_DEPLOY_KEY: \$\{\{ secrets\.TEMPLATES_DEPLOY_KEY \}\}\n/, 'job-level env must expose the secret so the step `if` can read it');
});
