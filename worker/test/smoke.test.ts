import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('worker env', () => {
  it('exposes BACKEND_URL', () => {
    expect(env.BACKEND_URL).toBe('https://backend.test/');
  });
});
