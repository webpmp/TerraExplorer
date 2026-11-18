import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');

    // Guard: Prevent production builds from embedding API keys from .env.local
    if (mode === 'production' && process.env.ALLOW_PUBLIC_KEYS !== '1') {
      const SECRET_KEY_VARS = [
        'VITE_GEMINI_API_KEY',
        'VITE_CARTO_API_KEY',
        'VITE_NEWS_API_KEY',
        'VITE_NEWS_DATA_API_KEY',
        'VITE_NYT_API_KEY',
        'GEMINI_API_KEY'
      ];
      const leakedVars = SECRET_KEY_VARS.filter(keyName => {
        const val = env[keyName];
        return typeof val === 'string' && val.trim().length > 0;
      });

      if (leakedVars.length > 0) {
        throw new Error(
          `[SECURITY GUARD] Production build blocked: secret API key variables found in environment (${leakedVars.join(', ')}). ` +
          `Vite embeds VITE_* variables into production client bundles. ` +
          `Remove them from .env.local or set ALLOW_PUBLIC_KEYS=1 to override.`
        );
      }
    }

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: true,
        proxy: {
          '/api/lmstudio': {
            target: 'http://127.0.0.1:1234',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/lmstudio/, ''),
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq, req) => {
                console.log(`[LMSTUDIO PROXY REQUEST] url="${req.url}" -> target="http://127.0.0.1:1234${req.url.replace(/^\/api\/lmstudio/, '')}" method="${req.method}"`);
              });
              proxy.on('proxyRes', (proxyRes, req) => {
                console.log(`[LMSTUDIO PROXY RESPONSE] url="${req.url}" status=${proxyRes.statusCode}`);
              });
              proxy.on('error', (err, req) => {
                console.error(`[LMSTUDIO PROXY ERROR] url="${req.url}" error=${err?.message || err}`);
              });
            }
          }
        }
      },
      preview: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: true,
        proxy: {
          '/api/lmstudio': {
            target: 'http://127.0.0.1:1234',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/lmstudio/, ''),
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq, req) => {
                console.log(`[LMSTUDIO PROXY REQUEST] url="${req.url}" -> target="http://127.0.0.1:1234${req.url.replace(/^\/api\/lmstudio/, '')}" method="${req.method}"`);
              });
              proxy.on('proxyRes', (proxyRes, req) => {
                console.log(`[LMSTUDIO PROXY RESPONSE] url="${req.url}" status=${proxyRes.statusCode}`);
              });
              proxy.on('error', (err, req) => {
                console.error(`[LMSTUDIO PROXY ERROR] url="${req.url}" error=${err?.message || err}`);
              });
            }
          }
        }
      },
      plugins: [react()],
      define: mode !== 'production' ? {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY),
        'process.env.VITE_GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY),
        'process.env.VITE_CARTO_API_KEY': JSON.stringify(env.VITE_CARTO_API_KEY)
      } : {},
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      optimizeDeps: {
        include: ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei']
      }
    };
});
