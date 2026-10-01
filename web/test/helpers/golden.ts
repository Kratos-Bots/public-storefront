/// <reference types="node" />
/**
 * Golden markup (stage 3 §12). Ruling: CSS-module class names stay in the goldens as
 * rendered (`_row_3b2c5d`) — a stronger check than stripping them. Vitest derives the
 * suffix from the module's file path, so later tasks must keep the feature CSS modules
 * (`src/features/catalog/*.module.css` and the others these surfaces import) at their
 * current paths; moving one changes every class name and fails parity.
 *
 * Writing goldens is guarded (see `goldenAction`): `UPDATE_GOLDEN=1` writes only MISSING
 * files, `UPDATE_GOLDEN=force` may overwrite, and nothing is ever written when `CI` is set.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect } from 'vitest';

const DIR = resolve(__dirname, '../__golden__');

/** Ids React/Mantine derive from render order, then one tag per line so a diff reads. */
export function normalizeMarkup(html: string): string {
  return html
    .replace(/\b(id|for|aria-[a-z]+)="([^"]*)"/g, (_m, attr: string, val: string) =>
      `${attr}="${val.replace(/(mantine-)[a-z0-9]{5,}/gi, '$1ID').replace(/«r[0-9a-z]+»|:r[0-9a-z]+:|_r_[0-9a-z]+_/g, 'RID')}"`)
    .replace(/></g, '>\n<');
}

/**
 * What `expectGolden` does with one golden: `write` it or `compare` against it.
 * - `CI` set: always compare (a missing golden fails; nothing is written on CI).
 * - `UPDATE_GOLDEN=force`: write, overwriting an existing file.
 * - `UPDATE_GOLDEN=1`: write only when the file is missing; an existing one is compared.
 * - otherwise: compare.
 */
export function goldenAction(env: Record<string, string | undefined>, exists: boolean): 'write' | 'compare' {
  if (env.CI) return 'compare';
  if (env.UPDATE_GOLDEN === 'force') return 'write';
  if (env.UPDATE_GOLDEN === '1' && !exists) return 'write';
  return 'compare';
}

/**
 * v0.7.0's markup, captured by Task 1 from the pre-refactor code before any product surface
 * was refactored. Never regenerate after that: a difference is a parity regression (spec §12).
 * The files are stored LF; a CRLF checkout (core.autocrlf=true) is read back as LF.
 */
export function expectGolden(name: string, html: string): void {
  const file = resolve(DIR, `${name}.html`);
  const got = normalizeMarkup(html);
  const exists = existsSync(file);
  if (goldenAction(process.env, exists) === 'write') {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(file, `${got}\n`);
    return;
  }
  expect(exists, `missing golden ${name}.html`).toBe(true);
  expect(got).toBe(readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, ''));
}
