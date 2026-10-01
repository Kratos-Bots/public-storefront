import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, defineConfig({
  // The editor suites mount real Puck; on a small build runner the first such test in a file pays the whole
  // cold import and has run past 20 s. A timeout is there to catch a hang, not to race the machine.
  test: { environment: 'jsdom', globals: false, include: ['test/**/*.test.{ts,tsx}'], setupFiles: ['test/setup.ts'], testTimeout: 90_000, hookTimeout: 90_000 },
}));
