import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
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
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
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
