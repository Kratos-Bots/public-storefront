import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, defineConfig({
  test: { environment: 'jsdom', globals: false, include: ['test/**/*.test.{ts,tsx}'], setupFiles: ['test/setup.ts'] },
}));
