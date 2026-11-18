import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default defineConfig((env) => {
  const base = typeof viteConfig === 'function' ? viteConfig(env) : viteConfig;
  return mergeConfig(base, {
    define: {
      'process.env.API_KEY': 'process.env.API_KEY',
      'process.env.GEMINI_API_KEY': 'process.env.GEMINI_API_KEY',
      'process.env.VITE_GEMINI_API_KEY': 'process.env.VITE_GEMINI_API_KEY',
      'process.env.VITE_CARTO_API_KEY': 'process.env.VITE_CARTO_API_KEY'
    },
    test: {
      setupFiles: ['./vitest.setup.ts'],
      exclude: ['**/node_modules/**', '**/e2e/**', '**/.git/**'],
      env: {
        VITE_AI_MODEL: 'gemini-2.5-flash',
        VITE_CARTO_API_KEY: 'test-carto-key',
        VITE_GEMINI_API_KEY: 'test-gemini-key',
        VITE_NEWS_API_KEY: 'test-news-key',
        VITE_NEWS_DATA_API_KEY: 'test-news-data-key',
        VITE_NYT_API_KEY: 'test-nyt-key'
      }
    }
  });
});
