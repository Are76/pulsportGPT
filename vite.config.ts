import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    base: './',
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        // Proxy PulseChain Blockscout API to bypass CORS in browser dev mode
        '/proxy/pulsechain': {
          target: 'https://api.scan.pulsechain.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/proxy\/pulsechain/, ''),
          timeout: 60000,
          proxyTimeout: 60000,
        },
      },
    },
  };
});
