import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default defineConfig((env) => {
  const base = typeof viteConfig === 'function' ? viteConfig(env) : viteConfig;
  return mergeConfig(base, {
    test: {
      setupFiles: ['./vitest.setup.ts'],
      exclude: ['**/node_modules/**', '**/e2e/**', '**/.git/**']
    }
  });
});
