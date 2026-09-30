/// <reference types="node" />
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
 * v0.7.0's markup, captured once by Task 1 (UPDATE_GOLDEN=1) before any product surface was
 * refactored. Never regenerate after that: a difference is a parity regression (spec §12).
 * The files are stored LF; a CRLF checkout (core.autocrlf=true) is read back as LF.
 */
export function expectGolden(name: string, html: string): void {
  const file = resolve(DIR, `${name}.html`);
  const got = normalizeMarkup(html);
  if (process.env.UPDATE_GOLDEN === '1') {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(file, `${got}\n`);
    return;
  }
  expect(existsSync(file), `missing golden ${name}.html`).toBe(true);
  expect(got).toBe(readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, ''));
}
